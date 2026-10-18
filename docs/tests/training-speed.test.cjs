const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts } = require("./helpers.cjs");

function createSimulation() {
    const context = createContext();
    loadScripts(context, ["globals.js", "main.js"], [
        "advanceTrainingFrame",
        "draw",
        "getRaceLeader"
    ]);
    context.drawTrackSurface = () => {};
    context.drawSceneEntities = () => {};
    context.updateHud = () => {};
    context.frameCount = 0;
    return context;
}

test("each rendered training frame runs the configured number of simulation cycles", () => {
    const context = createSimulation();
    let steps = 0;
    context.simulateTrainingStep = () => { steps++; };
    context.trainingActive = true;

    context.TRAINING_STEPS_PER_FRAME = 1;
    assert.equal(context.draw(), undefined);
    assert.equal(steps, 1);

    steps = 0;
    context.TRAINING_STEPS_PER_FRAME = 10;
    context.draw();
    assert.equal(steps, 10);
});

test("the HUD updates at a limited rate instead of rebuilding the DOM every frame", () => {
    const context = createSimulation();
    let hudUpdates = 0;
    context.findTrainingLeader = () => null;
    context.updateHud = () => { hudUpdates++; };
    context.frameCount = 0;

    for (let frame = 1; frame <= 12; frame++) {
        context.frameCount = frame;
        context.draw();
    }

    assert.equal(hudUpdates, 2);
});

test("speed cycles stop immediately when training is paused mid-frame", () => {
    const context = createSimulation();
    let steps = 0;
    context.simulateTrainingStep = () => {
        steps++;
        if (steps === 3) context.trainingActive = false;
    };
    context.trainingActive = true;
    context.TRAINING_STEPS_PER_FRAME = 10;

    assert.equal(context.advanceTrainingFrame(), 3);
    assert.equal(steps, 3);
});

test("race mode advances racers without advancing training generations", () => {
    const context = createSimulation();
    let trainingSteps = 0;
    let raceSteps = 0;
    context.simulateTrainingStep = () => { trainingSteps++; };
    context.simulateRaceFrame = () => { raceSteps++; };
    context.trainingActive = true;
    context.raceMode = true;
    context.TRAINING_STEPS_PER_FRAME = 10;

    context.draw();
    assert.equal(trainingSteps, 0);
    assert.equal(raceSteps, 1);
});

test("race leader selection prioritizes finish, score, and checkpoint proximity without sorting", () => {
    const context = createSimulation();
    const closest = { finished: false, score: 20, distance: 5 };
    context.distanceToNextCheckpoint = car => car.distance;
    context.raceCars = [
        { finished: false, score: 20, distance: 12 },
        closest,
        { finished: true, score: 1, distance: 100 },
        { finished: false, score: 30, distance: 1 }
    ];

    assert.equal(context.getRaceLeader(), context.raceCars[2]);

    context.raceCars[2].finished = false;
    assert.equal(context.getRaceLeader(), context.raceCars[3]);
});

test("the training button switches to evolution after the success threshold", () => {
    const context = createContext();
    loadScripts(context, ["globals.js", "Genetic.js"], ["nextGeneration"]);
    let buttonUpdated = false;
    context.savedCars = Array.from({ length: 10 }, (_, index) => ({
        finished: index < 6,
        score: index,
        fitness: index
    }));
    context.calculateFitness = () => {};
    context.archiveTopBrains = () => {};
    context.updateTrainingButton = () => { buttonUpdated = true; };
    context.setStatus = () => {};

    context.nextGeneration();

    assert.equal(context.trainingActive, false);
    assert.equal(context.trainingFinished, true);
    assert.equal(buttonUpdated, true);
});
