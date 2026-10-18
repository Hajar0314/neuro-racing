const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts, TestVector } = require("./helpers.cjs");

function createTrackContext() {
    const context = createContext();
    loadScripts(context, ["globals.js", "utils.js", "Track.js"], ["setupTrack"]);
    return context;
}

test("Vehicle integrates force once and respects its speed limit", () => {
    const context = createContext();
    loadScripts(context, ["Vehicle.js"], ["Vehicle"]);
    const vehicle = new context.__testApi.Vehicle(
        new TestVector(0, 0),
        new TestVector(0, 0),
        3,
        0.5
    );

    vehicle.applyForce(new TestVector(5, 0));
    vehicle.update();
    assert.equal(vehicle.pos.x, 3);
    assert.equal(vehicle.vel.mag(), 3);
    assert.equal(vehicle.acc.mag(), 0);
});

test("all track presets create closed boundaries and measurable checkpoints", () => {
    const context = createTrackContext();
    const paths = [];

    for (const preset of ["easy", "medium", "technical"]) {
        context.TRACK_PRESET = preset;
        context.setupTrack();
        assert.ok(context.walls.length > 100);
        assert.ok(context.checkpoints.length > 20);
        assert.equal(context.walls.length, context.currentTrackPath.length * 2);
        paths.push(JSON.parse(JSON.stringify(context.currentTrackPath)));
    }

    assert.notDeepEqual(paths[0], paths[1]);
    assert.notDeepEqual(paths[1], paths[2]);
    assert.ok(context.window.startAngle >= -Math.PI && context.window.startAngle <= Math.PI);
    assert.ok(context.currentLandscaping.length > 0);
    for (const tree of context.currentLandscaping) {
        assert.ok(context.isInsidePolygon(tree.x, tree.y, context.currentInnerBoundary));
    }
});

test("track geometry remains inside the resized canvas", () => {
    const context = createTrackContext();
    context.width = 520;
    context.height = 360;
    context.TRACK_PRESET = "technical";
    context.TRACK_WIDTH = 120;
    context.setupTrack();

    for (const [x, y] of context.currentTrackPath) {
        assert.ok(x >= 0 && x <= context.width);
        assert.ok(y >= 0 && y <= context.height);
    }
});

test("turn complexity and track width change the generated geometry", () => {
    const context = createTrackContext();
    context.TRACK_PRESET = "easy";
    context.TRACK_DIFFICULTY = 1;
    context.setupTrack();
    const simplePath = JSON.stringify(context.currentTrackPath);
    const narrowWall = TestVector.dist(
        context.walls[0].a,
        context.walls[1].a
    );

    context.TRACK_DIFFICULTY = 50;
    context.TRACK_WIDTH = 140;
    context.setupTrack();
    const complexPath = JSON.stringify(context.currentTrackPath);
    const wideWall = TestVector.dist(
        context.walls[0].a,
        context.walls[1].a
    );

    assert.notEqual(simplePath, complexPath);
    assert.ok(wideWall > narrowWall);
});

test("a drawn custom centerline becomes a closed, checkpointed track", () => {
    const context = createTrackContext();
    context.TRACK_PRESET = "custom";
    context.customTrackPath = Array.from({ length: 32 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 32;
        return [450 + Math.cos(angle) * 180, 300 + Math.sin(angle) * 130];
    });

    context.setupTrack();

    assert.equal(context.TRACK_PRESET, "custom");
    assert.ok(context.currentTrackPath.length > 50);
    assert.ok(context.checkpoints.length > 10);
    assert.ok(context.TRACK_LENGTH > 800);
    assert.equal(context.walls.length, context.currentTrackPath.length * 2);
    assert.ok(context.customTrackPath.every(point =>
        point[0] >= 0 && point[0] <= context.width &&
        point[1] >= 0 && point[1] <= context.height
    ));
});

test("Car ray perception keeps maximum distance and normalized speed inputs", () => {
    class FakeNeuralNetwork {
        constructor(inputNodes, hiddenNodes, outputNodes, activation) {
            this.input_nodes = inputNodes;
            this.hidden_nodes = hiddenNodes;
            this.output_nodes = outputNodes;
            this.activation = activation;
        }
        predict() { return [0.5, 0.5]; }
        copy() { return this; }
        dispose() {}
        mutate() {}
    }

    const context = createContext({ NeuralNetwork: FakeNeuralNetwork });
    loadScripts(
        context,
        ["globals.js", "utils.js", "Vehicle.js", "Ray.js", "Car.js"],
        ["Car"]
    );
    const car = new context.__testApi.Car();
    const readings = car.look([]);

    assert.equal(readings.length, 6);
    assert.equal(readings[5], 1 / 6);
    assert.ok(readings.slice(0, 5).every(value => value === 0));
    assert.ok(car.rays.every(ray => ray.distance === context.SIGHT_DIST));
});

test("Car steering force and runtime physics settings use the configured limits", () => {
    class FakeNeuralNetwork {
        constructor(inputNodes, hiddenNodes, outputNodes, activation) {
            this.input_nodes = inputNodes;
            this.hidden_nodes = hiddenNodes;
            this.output_nodes = outputNodes;
            this.activation = activation;
        }
        predict() { return [1, 1]; }
        copy() { return this; }
        dispose() {}
        mutate() {}
    }

    const context = createContext({ NeuralNetwork: FakeNeuralNetwork });
    loadScripts(
        context,
        ["globals.js", "utils.js", "Vehicle.js", "Ray.js", "Car.js"],
        ["Car"]
    );
    const car = new context.__testApi.Car();
    car.setPhysics(4, 0.25);
    car.think([]);

    assert.ok(car.acc.mag() <= 0.25 + 1e-10);
    car.update();
    assert.ok(car.vel.mag() <= 4);
});
