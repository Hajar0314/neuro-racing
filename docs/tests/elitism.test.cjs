const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts, TestVector } = require("./helpers.cjs");

// Fausse voiture : enregistre la configuration reçue, les mutations et la physique appliquées.
class FakeCar {
    constructor(configuration) {
        this.configuration = configuration;
        this.brain = configuration && configuration.brain ? configuration.brain : configuration;
        this.mutations = [];
        this.physics = null;
    }
    mutate(rate) { this.mutations.push(rate); }
    setPhysics(speed, force) { this.physics = [speed, force]; }
    dispose() { this.disposed = true; }
}

function parentCar(name, fitness) {
    return {
        name, fitness, score: fitness,
        brain: { name },
        startPos: new TestVector(100 + fitness, 200),
        dispose() { this.disposed = true; }
    };
}

function load(extra = {}) {
    const context = createContext({ Car: FakeCar, ...extra });
    const api = loadScripts(context, ["globals.js", "Genetic.js"], [
        "buildNextPopulation", "findEliteParents", "nextGeneration"
    ]);
    context.TOTAL_POP = 6;
    context.CROSSOVER_RATE = 0; // ces tests ne portent que sur l'élitisme
    context.MUTATION_RATE = 0.2;
    context.GAME_SPEED_LIMIT = 7;
    context.CAR_ACCELERATION = 0.4;
    return { context, api };
}

test("the best brain is carried over first, unmutated, from its own start position", () => {
    const { api } = load();
    const previous = [parentCar("a", 10), parentCar("best", 90), parentCar("c", 40)];

    const population = api.buildNextPopulation(previous);

    const elite = population[0];
    assert.equal(elite.configuration.brain, previous[1].brain);
    assert.equal(elite.configuration.position, previous[1].startPos);
    assert.deepEqual(elite.mutations, []);
    assert.deepEqual(Array.from(elite.physics), [7, 0.4]);
});

test("the other children are still selected by tournament and mutated", () => {
    const { api } = load();
    const population = api.buildNextPopulation([parentCar("a", 10), parentCar("b", 20), parentCar("c", 30)]);

    assert.equal(population.length, 6);
    for (const child of population.slice(1)) assert.deepEqual(child.mutations, [0.2]);
});

test("the population keeps the requested size, with or without elites", () => {
    const { context, api } = load();
    const previous = [parentCar("a", 10), parentCar("b", 20)];

    context.TOTAL_POP = 4;
    assert.equal(api.buildNextPopulation(previous).length, 4);

    context.ELITE_COUNT = 0;
    const withoutElite = api.buildNextPopulation(previous);
    assert.equal(withoutElite.length, 4);
    assert.ok(withoutElite.every(car => car.mutations.length === 1));
});

test("the elite count never exceeds the population or the parents available", () => {
    const { context, api } = load();
    context.ELITE_COUNT = 10;

    context.TOTAL_POP = 2;
    const small = api.buildNextPopulation([parentCar("a", 1), parentCar("b", 2), parentCar("c", 3)]);
    assert.equal(small.length, 2);
    assert.ok(small.every(car => car.mutations.length === 0));

    context.TOTAL_POP = 5;
    const fewParents = api.buildNextPopulation([parentCar("a", 1)]);
    assert.equal(fewParents.length, 5);
    assert.equal(fewParents.filter(car => car.mutations.length === 0).length, 1);
});

test("an empty previous generation gives a fresh population without elite", () => {
    const { api } = load();
    const population = api.buildNextPopulation([]);

    assert.equal(population.length, 6);
    assert.ok(population.every(car => car.mutations.length === 1));
});

test("elites are ranked by fitness, falling back on score when fitness is not finite", () => {
    const { api } = load();
    const noFitness = { ...parentCar("score", 0), fitness: NaN, score: 500 };
    const ranked = api.findEliteParents([parentCar("a", 100), noFitness, parentCar("b", 300)], 2);

    assert.equal(JSON.stringify(Array.from(ranked, car => car.name)), '["score","b"]');
});

test("nextGeneration builds the new cars with the elite and frees the old generation", () => {
    const { context } = load();
    const previous = [parentCar("a", 10), parentCar("best", 90)];
    context.savedCars = previous;
    context.cars = [];
    context.TOTAL_POP = 3;
    context.calculateFitness = () => {};
    context.archiveTopBrains = () => {};
    context.setStatus = () => {};
    context.updateTrainingButton = () => {};

    context.nextGeneration();

    assert.equal(context.cars.length, 3);
    assert.equal(context.cars[0].configuration.brain, previous[1].brain);
    assert.deepEqual(context.cars[0].mutations, []);
    assert.ok(previous.every(car => car.disposed));
    assert.equal(context.savedCars.length, 0);
});

test("continuing from the archive also carries the best brain over unmutated", () => {
    const context = createContext({ Car: FakeCar });
    loadScripts(context, ["globals.js", "Genetic.js", "main.js"], ["continueTrainingFromArchive"]);
    const previous = [parentCar("a", 10), parentCar("best", 90)];
    context.savedCars = previous;
    context.TOTAL_POP = 3;
    context.CROSSOVER_RATE = 0;
    context.generation = 4;
    context.updateTrainingButton = () => {};
    context.setStatus = () => {};

    context.continueTrainingFromArchive();

    assert.equal(context.cars.length, 3);
    assert.equal(context.cars[0].configuration.brain, previous[1].brain);
    assert.deepEqual(context.cars[0].mutations, []);
    assert.equal(context.generation, 5);
});
