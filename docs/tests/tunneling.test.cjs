const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts, TestVector } = require("./helpers.cjs");

function createCollisionContext() {
    const context = createContext();
    loadScripts(context, ["globals.js", "utils.js", "main.js"], [
        "checkCollisions",
        "distSegmentToSegment"
    ]);
    return context;
}

function fakeCar(from, to) {
    return {
        pos: new TestVector(to[0], to[1]),
        lastStepPos: new TestVector(from[0], from[1]),
        width: 10,
        dead: false
    };
}

test("a fast car that jumps over a wall within one step is eliminated", () => {
    const context = createCollisionContext();
    // Mur vertical en x = 100 ; la voiture passe de x = 90 à x = 110 (20 px/pas).
    context.walls = [{ a: new TestVector(100, 0), b: new TestVector(100, 200) }];
    const car = fakeCar([90, 100], [110, 100]);

    context.checkCollisions(car);

    assert.equal(car.dead, true);
});

test("a fast car that does not cross any wall survives", () => {
    const context = createCollisionContext();
    context.walls = [{ a: new TestVector(100, 0), b: new TestVector(100, 200) }];
    const car = fakeCar([30, 100], [50, 100]);

    context.checkCollisions(car);

    assert.equal(car.dead, false);
});

test("a car that only touches a wall by position is still eliminated", () => {
    const context = createCollisionContext();
    context.walls = [{ a: new TestVector(100, 0), b: new TestVector(100, 200) }];
    const car = fakeCar([98, 100], [98, 100]);

    context.checkCollisions(car);

    assert.equal(car.dead, true);
});

test("a car without a recorded previous step falls back to the position test", () => {
    const context = createCollisionContext();
    context.walls = [{ a: new TestVector(100, 0), b: new TestVector(100, 200) }];
    const car = fakeCar([0, 0], [110, 100]);
    delete car.lastStepPos;

    context.checkCollisions(car);

    assert.equal(car.dead, false);
});

test("distSegmentToSegment returns 0 for crossing segments and the gap otherwise", () => {
    const context = createCollisionContext();
    const V = (x, y) => new TestVector(x, y);
    assert.equal(context.distSegmentToSegment(V(0, 0), V(10, 10), V(0, 10), V(10, 0)), 0);
    assert.equal(context.distSegmentToSegment(V(0, 0), V(10, 0), V(0, 5), V(10, 5)), 5);
    assert.equal(context.distSegmentToSegment(V(0, 0), V(0, 0), V(3, 4), V(3, 4)), 5);
});

test("Car.update records the position it had before moving", () => {
    class FakeNeuralNetwork {
        constructor() { this.input_nodes = 6; this.output_nodes = 2; }
        predict() { return [0.5, 1]; }
        copy() { return this; }
        dispose() {}
        mutate() {}
    }
    const context = createContext({ NeuralNetwork: FakeNeuralNetwork });
    loadScripts(context, ["globals.js", "utils.js", "Vehicle.js", "Ray.js", "Car.js"], ["Car"]);
    const car = new context.__testApi.Car();
    car.setPhysics(20, 0.5);
    car.vel = new TestVector(20, 0);
    const before = car.pos.copy();

    car.update();

    assert.equal(car.lastStepPos.x, before.x);
    assert.equal(car.lastStepPos.y, before.y);
    assert.ok(car.pos.x - before.x > 19);
});
