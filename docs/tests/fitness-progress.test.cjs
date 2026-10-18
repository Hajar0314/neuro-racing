const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts, TestVector } = require("./helpers.cjs");

function createFitnessContext() {
    const context = createContext();
    loadScripts(context, ["globals.js", "utils.js", "Genetic.js", "main.js"], [
        "scoreCarFitness",
        "findTrainingLeader",
        "updateTrackProgress",
        "learningChartSeries",
        "drawLearningChart",
        "updateNetworkDiagram",
        "formatElapsedTime"
    ]);
    context.TRACK_LENGTH = 1000;
    return context;
}

test("fitness rewards centerline progress and speed", () => {
    const context = createFitnessContext();
    context.checkpoints = [];
    const stalled = {
        score: 0,
        trackProgress: 0,
        speedTotal: 0,
        speedSamples: 100,
        framesStalled: 30,
        framesSinceLastCheckpoint: 600,
        wrongWayCount: 0
    };
    const progressing = {
        ...stalled,
        trackProgress: 300,
        speedTotal: 400,
        framesStalled: 0,
        framesSinceLastCheckpoint: 10
    };

    assert.ok(context.scoreCarFitness(progressing) > context.scoreCarFitness(stalled));
});

test("fitness penalizes vehicles that stall, reverse, or stop making checkpoint progress", () => {
    const context = createFitnessContext();
    context.checkpoints = [];
    const moving = {
        score: 20,
        trackProgress: 100,
        speedTotal: 300,
        speedSamples: 100,
        framesStalled: 0,
        framesSinceLastCheckpoint: 100,
        wrongWayCount: 0
    };
    const stuck = {
        ...moving,
        speedTotal: 0,
        framesStalled: 90,
        framesSinceLastCheckpoint: 900,
        wrongWayCount: 50
    };

    assert.ok(context.scoreCarFitness(moving) > context.scoreCarFitness(stuck));
});

test("track progress advances in the forward direction and decreases when reversing", () => {
    const context = createFitnessContext();
    context.currentTrackPath = [
        [0, 0], [10, 0], [20, 0], [20, 10],
        [20, 20], [10, 20], [0, 20], [0, 10]
    ];
    context.TRACK_LENGTH = 80;
    context.checkpoints = [];
    const car = {
        pos: new TestVector(0, 0),
        vel: new TestVector(1, 0),
        lastTrackProgressPosition: new TestVector(0, 0),
        trackProgressIndex: -1,
        trackProgress: 0,
        trackLateralError: 0,
        totalTravelDistance: 0,
        score: 0,
        speedTotal: 0,
        speedSamples: 1,
        framesStalled: 0,
        framesSinceLastCheckpoint: 0,
        wrongWayCount: 0
    };

    context.updateTrackProgress(car);
    car.pos.set(10, 0);
    context.updateTrackProgress(car);
    assert.equal(car.trackProgress, 10);
    assert.equal(car.trackLateralError, 0);

    car.vel.set(-1, 0);
    car.pos.set(0, 0);
    context.updateTrackProgress(car);
    assert.ok(car.trackProgress < 10);
});

test("learning data is shaped for both plotted series and generation time is readable", () => {
    const context = createFitnessContext();
    const series = context.learningChartSeries([
        { generation: 2, averageScore: 30, bestScore: 70 },
        { generation: 3, averageScore: 40, bestScore: 100 }
    ]);

    assert.deepEqual(JSON.parse(JSON.stringify(series)), [
        { generation: 2, averageScore: 30, bestScore: 70 },
        { generation: 3, averageScore: 40, bestScore: 100 }
    ]);
    assert.equal(context.formatElapsedTime(125), "02:05");
});

test("the training leader is selected in one pass without sorting the population", () => {
    const context = createFitnessContext();
    let fitnessEvaluations = 0;
    context.scoreCarFitness = car => {
        fitnessEvaluations++;
        return car.fitness;
    };
    context.distanceToNextCheckpoint = car => car.distance;
    const leader = { fitness: 20, distance: 50 };
    const otherCars = [
        { fitness: 10, distance: 1 },
        leader,
        { fitness: 20, distance: 60 }
    ];
    context.cars = otherCars;

    assert.equal(context.findTrainingLeader(), leader);
    assert.equal(fitnessEvaluations, otherCars.length);

    context.cars = [];
    context.savedCars = [
        { fitness: 10, score: 200 },
        { fitness: 30, score: 5 }
    ];
    assert.equal(context.findTrainingLeader(), context.savedCars[1]);
});

test("closed analysis panels skip chart and network rendering work", () => {
    const context = createFitnessContext();
    let chartDrawRequested = false;
    let brainSerialized = false;
    context.document = {
        getElementById(id) {
            if (id === "learningChart") {
                return { getContext: () => { chartDrawRequested = true; } };
            }
            if (id === "learningContent" || id === "networkContent") {
                return { hidden: true };
            }
            throw new Error(`Unexpected DOM lookup: ${id}`);
        }
    };

    context.drawLearningChart();
    context.updateNetworkDiagram(true, {
        brain: { toJSON: () => { brainSerialized = true; } }
    });

    assert.equal(chartDrawRequested, false);
    assert.equal(brainSerialized, false);
});
