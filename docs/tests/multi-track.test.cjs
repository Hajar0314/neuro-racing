const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts, TestVector } = require("./helpers.cjs");

const STARTS = { easy: [100, 100], medium: [300, 200], technical: [500, 400] };

// Charge les vrais scripts (circuits, génétique, boucle d'entraînement) avec une fausse voiture
// et un faux dessin de circuit : on teste l'enchaînement des tours, pas la géométrie.
function load() {
    const setupCalls = [];
    const elements = {};
    const element = () => ({ children: [], textContent: "", hidden: true, disabled: false, style: {} });
    const context = createContext({
        document: { getElementById: id => (elements[id] = elements[id] || element()) }
    });

    class FakeCar {
        constructor(configuration = {}) {
            this.brain = configuration.brain;
            this.color = configuration.color;
            this.name = configuration.name;
            this.startPos = configuration.position
                ? configuration.position.copy()
                : new TestVector(context.startX, context.startY);
            this.pos = this.startPos.copy();
            this.dead = false;
            this.finished = false;
            this.score = 0;
            this.fitness = 0;
            this.lapFrames = null;
            this.disposed = false;
            this.physics = null;
        }
        think() {}
        update() { this.dead = true; } // chaque voiture finit son tour au premier pas
        checkCheckpoints() {
            const result = context.ROUND_SCORES[this.name][context.currentTrackPreset];
            this.score = result;
            this.finished = result >= 250;
        }
        setPhysics(speed, force) { this.physics = [speed, force]; }
        dispose() { this.disposed = true; }
    }
    context.Car = FakeCar;

    const api = loadScripts(context,
        ["globals.js", "utils.js", "Track.js", "MultiTrack.js", "Genetic.js", "main.js"], [
            "selectTrackPreset", "aggregateRounds", "summarizeRound", "applyAggregatedResults",
            "advanceMultiTrackRound", "beginMultiTrackGeneration", "respawnOnCurrentTrack",
            "trainingPreset", "calculateFitness", "simulateTrainingStep", "continueTrainingFromArchive",
            "restartTraining"
        ]);
    context.setStatus = () => {};
    context.updateTrainingButton = () => {};
    context.archiveTopBrains = () => {};

    context.setupTrack = (preset = context.trainingPreset()) => {
        setupCalls.push(preset);
        context.currentTrackPreset = preset;
        [context.startX, context.startY] = STARTS[preset];
    };
    context.setupTrack("easy");
    setupCalls.length = 0;

    context.updateTrackProgress = () => {};
    context.checkCollisions = () => {};
    context.scoreCarFitness = car => car.score * 2;
    context.MULTI_TRACK_TRAINING = true;
    context.MULTI_TRACK_SET = ["easy", "medium", "technical"];
    context.multiTrackRound = 0;
    context.trainingActive = true;
    context.ROUND_SCORES = {};
    return { context, api, setupCalls, FakeCar };
}

function car(FakeCar, context, name, offset = [0, 0], brain = { name }) {
    return new FakeCar({
        brain, name, color: `#${name}`,
        position: new TestVector(context.startX + offset[0], context.startY + offset[1])
    });
}

test("selectTrackPreset keeps the fixed order and always leaves at least one circuit", () => {
    const { api } = load();
    const plain = list => Array.from(list);
    assert.deepEqual(plain(api.selectTrackPreset(["easy", "technical"], "medium", true)),
        ["easy", "medium", "technical"]);
    assert.deepEqual(plain(api.selectTrackPreset(["easy", "medium", "technical"], "medium", false)),
        ["easy", "technical"]);
    assert.deepEqual(plain(api.selectTrackPreset(["medium"], "medium", false)), ["medium"]);
    assert.deepEqual(plain(api.selectTrackPreset(["easy"], "custom", true)), ["easy"]);
    assert.deepEqual(plain(api.selectTrackPreset(["easy"], "easy", true)), ["easy"]);
});

test("aggregateRounds averages the rounds and only validates a car that finished every circuit", () => {
    const { api } = load();
    const round = (score, finished) => ({ score, fitness: score * 2, finished, trackProgress: score });

    const mixed = api.aggregateRounds([round(300, true), round(100, false), round(200, true)]);
    assert.equal(mixed.score, 200);
    assert.equal(mixed.fitness, 400);
    assert.equal(mixed.trackProgress, 200);
    assert.equal(mixed.finished, false);
    assert.equal(mixed.rounds, 3);

    assert.equal(api.aggregateRounds([round(300, true), round(300, true)]).finished, true);
    const empty = api.aggregateRounds([]);
    assert.equal(empty.finished, false);
    assert.equal(empty.score, 0);
});

test("summarizeRound keeps the lap time only when it is a real number", () => {
    const { api } = load();
    const done = api.summarizeRound({ score: 250, fitness: 90, finished: true, lapFrames: 600, trackProgress: 40 }, "easy");
    assert.equal(done.preset, "easy");
    assert.equal(done.lapFrames, 600);
    const crashed = api.summarizeRound({ score: 50, finished: false, lapFrames: null }, "medium");
    assert.equal(crashed.lapFrames, null);
    assert.equal(crashed.fitness, 50); // fitness absente : repli sur le score
});

test("an intermediate round restarts the same brains on the next circuit, offset kept", () => {
    const { context, api, setupCalls, FakeCar } = load();
    const first = car(FakeCar, context, "a", [2, -1]);
    const second = car(FakeCar, context, "b", [-3, 2]);
    first.score = 100; first.fitness = 120; first.finished = true;
    second.score = 50; second.fitness = 60;
    context.savedCars = [first, second];
    context.cars = [];

    const continued = api.advanceMultiTrackRound();

    assert.equal(continued, true);
    assert.deepEqual(setupCalls, ["medium"]);
    assert.equal(context.multiTrackRound, 1);
    assert.equal(context.savedCars.length, 0);
    assert.equal(context.cars.length, 2);
    const [again, secondAgain] = context.cars;
    assert.notEqual(again, first);
    assert.equal(again.brain, first.brain);
    assert.equal(again.name, "a");
    assert.equal(again.color, "#a");
    assert.equal(again.pos.x, STARTS.medium[0] + 2);
    assert.equal(again.pos.y, STARTS.medium[1] - 1);
    assert.equal(secondAgain.pos.x, STARTS.medium[0] - 3);
    assert.deepEqual(Array.from(again.physics), [context.GAME_SPEED_LIMIT, context.CAR_ACCELERATION]);
    assert.equal(again.dead, false);
    assert.equal(again.score, 0); // compteurs remis à zéro
    assert.equal(first.disposed, true);
    assert.equal(again.roundResults.length, 1);
    assert.equal(again.roundResults[0].preset, "easy");
    assert.equal(again.roundResults[0].score, 100);
    assert.equal(again.roundResults[0].finished, true);
});

test("the last round aggregates every circuit and hands the cars to the selection", () => {
    const { context, api, setupCalls, FakeCar } = load();
    context.multiTrackRound = 2;
    context.setupTrack("technical");
    setupCalls.length = 0;
    const strong = car(FakeCar, context, "strong");
    const weak = car(FakeCar, context, "weak");
    strong.score = 300; strong.fitness = 320; strong.finished = true;
    weak.score = 20; weak.fitness = 10;
    const rounds = (...values) => values.map(([score, fitness, finished], index) =>
        ({ preset: ["easy", "medium", "technical"][index], score, fitness, finished, trackProgress: 0 }));
    strong.roundResults = rounds([300, 300, true], [300, 300, true]);
    weak.roundResults = rounds([300, 300, true], [0, 0, false]);
    context.savedCars = [strong, weak];

    const continued = api.advanceMultiTrackRound();

    assert.equal(continued, false);
    assert.deepEqual(setupCalls, []);
    assert.equal(context.savedCars.length, 2);
    assert.equal(strong.score, 300);
    assert.equal(strong.finished, true);
    assert.equal(strong.fitness, strong.aggregateFitness);
    assert.equal(strong.aggregateFitness, (300 + 300 + 320) / 3);
    assert.equal(weak.finished, false); // a échoué sur un circuit
    assert.equal(weak.score, (300 + 0 + 20) / 3);
    assert.equal(strong.aggregateFitness > weak.aggregateFitness, true);
});

test("calculateFitness keeps the multi-circuit average instead of rescoring on the last circuit", () => {
    const { context, api } = load();
    context.scoreCarFitness = car => 999;
    const aggregated = { score: 10, fitness: 1, aggregateFitness: 77 };
    const plain = { score: 10, fitness: 1 };
    context.savedCars = [aggregated, plain];

    api.calculateFitness();

    assert.equal(aggregated.fitness, 77);
    assert.equal(plain.fitness, 999);
});

test("a whole generation runs one round per circuit, then selection, then back to the first circuit", () => {
    const { context, api, setupCalls, FakeCar } = load();
    context.ROUND_SCORES = {
        steady: { easy: 250, medium: 250, technical: 250 },
        specialist: { easy: 250, medium: 60, technical: 10 }
    };
    context.generation = 7;
    context.cars = [car(FakeCar, context, "steady", [1, 1]), car(FakeCar, context, "specialist", [-2, 0])];
    context.savedCars = [];
    let selected = null;
    context.nextGeneration = () => {
        selected = context.savedCars.map(entry => ({
            name: entry.name, score: entry.score, fitness: entry.fitness, finished: entry.finished
        }));
        // la sélection fournit une nouvelle population, posée sur le dernier circuit
        context.cars = [new FakeCar({
            brain: { name: "child" }, name: "child",
            position: new TestVector(context.startX + 2, context.startY - 1)
        })];
        context.savedCars = [];
    };

    for (let step = 0; step < 3; step++) api.simulateTrainingStep();

    assert.equal(context.generation, 8);
    assert.deepEqual(setupCalls, ["medium", "technical", "easy"]);
    assert.equal(context.multiTrackRound, 0);
    assert.equal(context.currentTrackPreset, "easy");
    const byName = Object.fromEntries(selected.map(entry => [entry.name, entry]));
    assert.equal(byName.steady.score, 250);
    assert.equal(byName.steady.finished, true);
    assert.equal(byName.specialist.finished, false); // brillant sur un seul circuit : pas réussi
    assert.equal(byName.specialist.score, (250 + 60 + 10) / 3);
    assert.ok(byName.steady.fitness > byName.specialist.fitness);
    assert.equal(context.cars.length, 1);
    assert.equal(context.cars[0].pos.x, STARTS.easy[0] + 2);
    assert.equal(context.cars[0].pos.y, STARTS.easy[1] - 1);
});

test("a stage of the generation is not a generation: the number and the selection wait", () => {
    const { context, api, FakeCar } = load();
    context.ROUND_SCORES = { a: { easy: 100, medium: 100, technical: 100 } };
    context.generation = 3;
    context.cars = [car(FakeCar, context, "a")];
    let selections = 0;
    context.nextGeneration = () => { selections++; };

    api.simulateTrainingStep(); // fin du tour 1

    assert.equal(selections, 0);
    assert.equal(context.generation, 3);
    assert.equal(context.multiTrackRound, 1);
    assert.equal(context.cars.length, 1);
});

test("with a single selected circuit the generation is a single round, like before", () => {
    const { context, api, setupCalls, FakeCar } = load();
    context.MULTI_TRACK_SET = ["technical"];
    context.setupTrack("technical");
    setupCalls.length = 0;
    context.ROUND_SCORES = { a: { technical: 250 } };
    context.generation = 1;
    context.cars = [car(FakeCar, context, "a")];
    let selections = 0;
    context.nextGeneration = () => { selections++; };

    api.simulateTrainingStep();

    assert.equal(selections, 1);
    assert.equal(context.generation, 2);
    assert.deepEqual(setupCalls, []);
});

test("without multi-circuit training nothing changes: one circuit, selection right away", () => {
    const { context, api, setupCalls, FakeCar } = load();
    context.MULTI_TRACK_TRAINING = false;
    context.ROUND_SCORES = { a: { easy: 120 } };
    context.generation = 0;
    context.cars = [car(FakeCar, context, "a")];
    let selections = 0;
    context.nextGeneration = () => { selections++; };

    api.simulateTrainingStep();

    assert.equal(selections, 1);
    assert.equal(context.generation, 1);
    assert.deepEqual(setupCalls, []);
    assert.equal(context.multiTrackRound, 0);
});

test("the elite keeps the same offset on every circuit, so its average cannot move by chance", () => {
    const { context, api, FakeCar } = load();
    const elite = car(FakeCar, context, "elite", [2.5, -1.5]);
    context.cars = [elite];
    const seen = [];
    for (const preset of ["medium", "technical"]) {
        context.savedCars = context.cars;
        context.cars = [];
        api.advanceMultiTrackRound();
        const [moved] = context.cars;
        seen.push([moved.pos.x - STARTS[preset][0], moved.pos.y - STARTS[preset][1]]);
    }
    assert.deepEqual(seen, [[2.5, -1.5], [2.5, -1.5]]);
});

test("a new generation goes back to the first circuit; nothing happens outside multi mode", () => {
    const { context, api, setupCalls, FakeCar } = load();
    context.multiTrackRound = 2;
    context.setupTrack("technical");
    setupCalls.length = 0;
    const children = [car(FakeCar, context, "x", [1, 2]), car(FakeCar, context, "y", [0, -2])];
    context.cars = children;

    api.beginMultiTrackGeneration();

    assert.deepEqual(setupCalls, ["easy"]);
    assert.equal(context.multiTrackRound, 0);
    assert.equal(context.cars.length, 2);
    assert.equal(context.cars[0].pos.x, STARTS.easy[0] + 1);
    assert.equal(context.cars[1].pos.y, STARTS.easy[1] - 2);
    assert.ok(children.every(entry => entry.disposed));

    context.MULTI_TRACK_TRAINING = false;
    context.multiTrackRound = 2;
    setupCalls.length = 0;
    const kept = context.cars;
    api.beginMultiTrackGeneration();
    assert.deepEqual(setupCalls, []);
    assert.equal(context.cars, kept);
    assert.equal(context.multiTrackRound, 2);
});

test("resuming after a success starts the next generation on the first circuit", () => {
    const { context, api, setupCalls, FakeCar } = load();
    context.multiTrackRound = 2;
    context.setupTrack("technical");
    setupCalls.length = 0;
    context.generation = 4;
    context.savedCars = [car(FakeCar, context, "winner")];
    context.buildNextPopulation = () => [car(FakeCar, context, "next", [1, 1])];

    api.continueTrainingFromArchive();

    assert.deepEqual(setupCalls, ["easy"]);
    assert.equal(context.multiTrackRound, 0);
    assert.equal(context.generation, 5);
    assert.equal(context.cars[0].pos.x, STARTS.easy[0] + 1);
});

test("restartTraining always restarts from the first circuit of the generation", () => {
    const { context, api, setupCalls } = load();
    context.multiTrackRound = 2;
    context.setupTrack("technical");
    setupCalls.length = 0;
    context.cars = []; context.savedCars = []; context.raceCars = [];

    api.restartTraining("test");

    assert.equal(context.multiTrackRound, 0);
    assert.deepEqual(setupCalls, ["easy"]);
    assert.equal(context.cars.length, context.TOTAL_POP);

    context.MULTI_TRACK_TRAINING = false;
    context.multiTrackRound = 1;
    setupCalls.length = 0;
    api.restartTraining("test");
    assert.equal(context.multiTrackRound, 0);
    assert.deepEqual(setupCalls, []);
});
