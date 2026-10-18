const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts, TestVector } = require("./helpers.cjs");

// ---------- NeuralNetwork.crossover (faux TensorFlow.js) ----------

class FakeTensor {
    constructor(values, shape) {
        this.values = Array.from(values);
        this.shape = [...shape];
    }
    dataSync() { return this.values; }
    clone() { return new FakeTensor(this.values, this.shape); }
    dispose() {}
}

class FakeSequential {
    constructor() { this.weights = []; this.outputNodes = 0; }
    add(layer) {
        const inputNodes = layer.inputShape ? layer.inputShape[0] : this.outputNodes;
        this.weights.push(new FakeTensor(Array(inputNodes * layer.units).fill(0), [inputNodes, layer.units]));
        this.weights.push(new FakeTensor(Array(layer.units).fill(0), [layer.units]));
        this.outputNodes = layer.units;
    }
    getWeights() { return this.weights; }
    setWeights(weights) {
        if (weights.some((weight, index) =>
            JSON.stringify(weight.shape) !== JSON.stringify(this.weights[index].shape))) {
            throw new Error("weight shape mismatch");
        }
        this.weights = weights.map(weight => weight.clone());
    }
    dispose() {}
}

function loadNetwork(randomValues) {
    const queue = [...randomValues];
    const scriptedMath = Object.create(Math);
    scriptedMath.random = () => (queue.length ? queue.shift() : 0.9);
    const context = createContext({
        Math: scriptedMath,
        tf: {
            sequential: () => new FakeSequential(),
            layers: { dense: configuration => configuration },
            tidy: callback => callback(),
            tensor: (values, shape) => new FakeTensor(values, shape)
        }
    });
    return loadScripts(context, ["NeuralNetwork.js"], ["NeuralNetwork"]).NeuralNetwork;
}

function filledNetwork(NeuralNetwork, inputs, hidden, outputs, value) {
    const network = new NeuralNetwork(inputs, hidden, outputs, "sigmoid");
    network.model.weights = network.model.weights.map(weight => new FakeTensor(Array(weight.values.length).fill(value), weight.shape));
    return network;
}

test("crossover inherits each hidden neuron as a whole from one parent", () => {
    // Tirages : neurones 0..3 → B, A, B, A ; biais de sortie 0..1 → A, B.
    const NeuralNetwork = loadNetwork([0.1, 0.9, 0.1, 0.9, 0.9, 0.1]);
    const parentA = filledNetwork(NeuralNetwork, 3, 4, 2, 1);
    const parentB = filledNetwork(NeuralNetwork, 3, 4, 2, 2);

    const child = NeuralNetwork.crossover(parentA, parentB).toJSON();

    const [hiddenWeights, hiddenBiases, outputWeights, outputBiases] = child.weights.map(weight => weight.values);
    for (let input = 0; input < 3; input++) {
        assert.deepEqual(hiddenWeights.slice(input * 4, input * 4 + 4), [2, 1, 2, 1]);
    }
    assert.deepEqual(hiddenBiases, [2, 1, 2, 1]);
    assert.deepEqual(outputWeights, [2, 2, 1, 1, 2, 2, 1, 1]);
    assert.deepEqual(outputBiases, [1, 2]);
});

test("crossover does not modify its parents and returns a distinct network", () => {
    const NeuralNetwork = loadNetwork([0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
    const parentA = filledNetwork(NeuralNetwork, 3, 4, 2, 1);
    const parentB = filledNetwork(NeuralNetwork, 3, 4, 2, 2);

    const child = NeuralNetwork.crossover(parentA, parentB);

    assert.notEqual(child, parentA);
    assert.notEqual(child.model, parentA.model);
    assert.ok(parentA.toJSON().weights.every(weight => weight.values.every(value => value === 1)));
    assert.ok(parentB.toJSON().weights.every(weight => weight.values.every(value => value === 2)));
    assert.ok(child.toJSON().weights.every(weight => weight.values.every(value => value === 2)));
});

test("parents with different architectures give a copy of the first parent", () => {
    const NeuralNetwork = loadNetwork([0.1, 0.1, 0.1]);
    const parentA = filledNetwork(NeuralNetwork, 3, 4, 2, 1);
    const parentB = filledNetwork(NeuralNetwork, 3, 6, 2, 2);

    const child = NeuralNetwork.crossover(parentA, parentB);

    assert.equal(child.hidden_nodes, 4);
    assert.ok(child.toJSON().weights.every(weight => weight.values.every(value => value === 1)));
});

// ---------- createChild / buildNextPopulation ----------

class FakeCar {
    constructor(configuration) {
        this.brain = configuration && configuration.brain ? configuration.brain : configuration;
        this.mutations = [];
    }
    mutate(rate) { this.mutations.push(rate); }
    setPhysics() {}
}

function parent(name, fitness) {
    return { name, fitness, score: fitness, brain: { name }, startPos: new TestVector(0, 0) };
}

function loadGenetic() {
    const crossed = [];
    const context = createContext({
        Car: FakeCar,
        random: (limit = 1) => limit * 0.5, // comme p5 : toujours strictement inférieur à la borne
        NeuralNetwork: {
            crossover(first, second) {
                const brain = { crossedFrom: [first, second], disposed: false, dispose() { this.disposed = true; } };
                crossed.push(brain);
                return brain;
            }
        }
    });
    loadScripts(context, ["globals.js", "Genetic.js"], ["buildNextPopulation"]);
    context.TOTAL_POP = 4;
    context.ELITE_COUNT = 0;
    context.MUTATION_RATE = 0.2;
    return { context, crossed };
}

test("with a crossover rate of 1, every child is built from two distinct parents", () => {
    const { context, crossed } = loadGenetic();
    context.CROSSOVER_RATE = 1;

    const population = context.buildNextPopulation([parent("a", 1), parent("b", 2), parent("c", 3)]);

    assert.equal(population.length, 4);
    assert.equal(crossed.length, 4);
    for (const brain of crossed) assert.notEqual(brain.crossedFrom[0], brain.crossedFrom[1]);
});

test("the intermediate crossed brain is freed because the car keeps its own copy", () => {
    const { context, crossed } = loadGenetic();
    context.CROSSOVER_RATE = 1;

    context.buildNextPopulation([parent("a", 1), parent("b", 2)]);

    assert.ok(crossed.length > 0);
    assert.ok(crossed.every(brain => brain.disposed));
});

test("children born from a crossover are still mutated", () => {
    const { context } = loadGenetic();
    context.CROSSOVER_RATE = 1;

    const population = context.buildNextPopulation([parent("a", 1), parent("b", 2)]);

    assert.ok(population.every(car => car.mutations.length === 1 && car.mutations[0] === 0.2));
});

test("with a crossover rate of 0, no crossover happens and children copy one parent", () => {
    const { context, crossed } = loadGenetic();
    context.CROSSOVER_RATE = 0;

    const parents = [parent("a", 1), parent("b", 2)];
    const population = context.buildNextPopulation(parents);

    assert.equal(crossed.length, 0);
    assert.ok(population.every(car => parents.some(candidate => candidate.brain === car.brain)));
});

test("a single parent cannot be crossed with itself", () => {
    const { context, crossed } = loadGenetic();
    context.CROSSOVER_RATE = 1;

    const population = context.buildNextPopulation([parent("only", 5)]);

    assert.equal(crossed.length, 0);
    assert.equal(population.length, 4);
});

test("an empty previous generation still gives fresh cars", () => {
    const { context, crossed } = loadGenetic();
    context.CROSSOVER_RATE = 1;

    assert.equal(context.buildNextPopulation([]).length, 4);
    assert.equal(crossed.length, 0);
});

test("elites are kept unmutated and never crossed", () => {
    const { context, crossed } = loadGenetic();
    context.CROSSOVER_RATE = 1;
    context.ELITE_COUNT = 1;

    const parents = [parent("a", 1), parent("best", 9), parent("c", 3)];
    const population = context.buildNextPopulation(parents);

    assert.equal(population[0].brain, parents[1].brain);
    assert.equal(population[0].mutations.length, 0);
    assert.equal(crossed.length, 3);
});
