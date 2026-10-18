const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts } = require("./helpers.cjs");

function createSimulation() {
    const context = createContext();
    loadScripts(context, ["globals.js", "main.js"], [
        "simulateTrainingStep",
        "continueTrainingFromArchive"
    ]);
    context.cars = [];
    context.savedCars = [];
    context.TOTAL_POP = 0;
    context.buildNextPopulation = () => [];
    context.updateTrainingButton = () => {};
    context.setStatus = () => {};
    context.trainingActive = true;
    return context;
}

test("the generation number advances when a new generation starts", () => {
    const context = createSimulation();
    context.generation = 4;
    context.nextGeneration = () => {};

    context.simulateTrainingStep();

    assert.equal(context.generation, 5);
});

test("a successful generation keeps its number until training is resumed", () => {
    const context = createSimulation();
    context.generation = 4;
    context.nextGeneration = () => {
        context.trainingFinished = true;
        context.trainingActive = false;
    };

    context.simulateTrainingStep();
    assert.equal(context.generation, 4);

    context.continueTrainingFromArchive();
    assert.equal(context.generation, 5);
});
