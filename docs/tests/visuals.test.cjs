const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts, TestVector } = require("./helpers.cjs");

// Faux contexte de dessin : enregistre les appels (nom -> nombre) sans rien dessiner.
// Sert à la fois de p5 global et de p5.Graphics.
function createDrawRecorder() {
    const calls = {};
    const recorder = new Proxy({ calls, width: 900, height: 600, drawingContext: null }, {
        get(target, name) {
            if (name in target) return target[name];
            if (name === "color") return (...args) => ({ color: args });
            return (...args) => { calls[name] = (calls[name] || 0) + 1; };
        }
    });
    return recorder;
}

const DRAW_NAMES = [
    "push", "pop", "translate", "rotate", "rectMode", "noStroke", "noFill", "fill", "stroke",
    "strokeWeight", "strokeCap", "strokeJoin", "rect", "ellipse", "circle", "line", "triangle",
    "arc", "beginShape", "endShape", "vertex", "image", "background", "textSize", "textAlign", "text"
];

function createTrackContext(extra = {}) {
    const context = createContext({
        CLOSE: "close", ROUND: "round", SQUARE: "square", CENTER: "center", ...extra
    });
    loadScripts(context, ["globals.js", "utils.js", "Track.js"], [
        "setupTrack", "createOuterScenery", "createLandscaping", "isInsidePolygon",
        "distanceToCenterline", "sceneryNoise", "paintTrackScene", "drawTrackSurface", "Boundary"
    ]);
    return context;
}

function bindDrawing(context, recorder) {
    for (const name of DRAW_NAMES) context[name] = (...args) => recorder[name](...args);
    return context;
}

test("outer scenery stays on the canvas, outside the track and its run-off area", () => {
    const context = createTrackContext();
    for (const preset of ["easy", "medium", "technical"]) {
        context.TRACK_PRESET = preset;
        context.setupTrack();
        assert.ok(context.currentScenery.length > 30, `${preset} should have scenery`);
        const clearance = context.TRACK_WIDTH / 2 + 34;
        for (const item of context.currentScenery) {
            assert.ok(item.x >= 0 && item.x <= context.width && item.y >= 0 && item.y <= context.height);
            assert.equal(context.isInsidePolygon(item.x, item.y, context.currentInnerBoundary), false);
            assert.ok(context.distanceToCenterline(item.x, item.y) >= clearance - 1e-9);
        }
    }
});

test("scenery is deterministic: same track, same decoration", () => {
    const context = createTrackContext();
    context.setupTrack();
    const first = JSON.stringify(context.currentScenery);
    context.setupTrack();
    assert.equal(JSON.stringify(context.currentScenery), first);
});

test("scenery is sorted from back to front and uses only known kinds", () => {
    const context = createTrackContext();
    context.setupTrack();
    const kinds = new Set(["tree", "pine", "bush", "rock", "flowers"]);
    let previousY = -Infinity;
    for (const item of context.currentScenery) {
        assert.ok(kinds.has(item.kind));
        assert.ok(item.y >= previousY);
        previousY = item.y;
    }
});

test("infield trees keep a gap to the road", () => {
    const context = createTrackContext();
    context.TRACK_PRESET = "medium";
    context.setupTrack();
    assert.ok(context.currentLandscaping.length > 0);
    for (const tree of context.currentLandscaping) {
        assert.ok(context.distanceToCenterline(tree.x, tree.y) >= context.TRACK_WIDTH / 2 + 30 - 1e-9);
    }
});

test("setupTrack stores the outer boundary and invalidates the cached layer", () => {
    const context = createTrackContext();
    context.trackLayer = { stale: true };
    context.setupTrack();
    assert.equal(context.trackLayer, null);
    assert.equal(context.currentOuterBoundary.length, context.currentInnerBoundary.length);
    assert.equal(context.walls.length, context.currentOuterBoundary.length * 2);
});

test("the fixed scene is painted once into a layer, then only copied each frame", () => {
    const layer = createDrawRecorder();
    let created = 0;
    const main = createDrawRecorder();
    const context = bindDrawing(createTrackContext({
        createGraphics: () => { created++; return layer; }
    }), main);
    context.setupTrack();

    context.drawTrackSurface();
    context.drawTrackSurface();
    context.drawTrackSurface();

    assert.equal(created, 1);
    assert.ok(layer.calls.rect > 1000, "the layer receives the whole painting");
    assert.equal(main.calls.image, 3, "each frame only copies the layer");
    assert.equal(main.calls.rect || 0, 0, "nothing else is painted on the main canvas");

    context.setupTrack(); // nouveau circuit : le calque doit être repeint
    context.drawTrackSurface();
    assert.equal(created, 2);
});

test("the layer is rebuilt when the canvas size changes", () => {
    let created = 0;
    const makeLayer = () => { created++; return createDrawRecorder(); };
    const context = bindDrawing(createTrackContext({ createGraphics: makeLayer }), createDrawRecorder());
    context.setupTrack();
    context.drawTrackSurface();
    context.trackLayer.width = 123; // taille obsolète
    context.drawTrackSurface();
    assert.equal(created, 2);
});

test("without createGraphics the scene is painted directly (no crash)", () => {
    const main = createDrawRecorder();
    const context = bindDrawing(createTrackContext(), main);
    context.setupTrack();
    context.globalThis.color = (...args) => ({ color: args });
    context.background = main.background;
    assert.doesNotThrow(() => context.drawTrackSurface());
    assert.ok(main.calls.rect > 1000);
});

test("collision walls are only traced in debug mode", () => {
    const context = createTrackContext();
    const main = createDrawRecorder();
    bindDrawing(context, main);
    const wall = new context.__testApi.Boundary(0, 0, 10, 10, "wall");

    context.showDebugSensors = false;
    wall.show();
    assert.equal(main.calls.line || 0, 0);

    context.showDebugSensors = true;
    wall.show();
    assert.equal(main.calls.line, 1);

    const checkpoint = new context.__testApi.Boundary(0, 0, 10, 10, "checkpoint");
    checkpoint.show();
    assert.equal(main.calls.line, 2);
});

// ---- Voitures -------------------------------------------------------------------------------

function makeCar(extra = {}) {
    const context = createContext({
        randomBetween: () => 0, CLOSE: "close", ROUND: "round", SQUARE: "square", CENTER: "center", ...extra
    });
    context.NeuralNetwork = class NeuralNetwork { static fromJSON(json) { return json; } };
    loadScripts(context, ["globals.js", "utils.js", "Ray.js", "Vehicle.js", "Car.js"],
        ["Car", "shadeColor", "parseHexColor"]);
    const brain = { input_nodes: 6, output_nodes: 2, copy() { return this; }, dispose() {}, predict: () => [0.5, 0.5] };
    const car = new context.__testApi.Car({ brain, color: "#34a7ff" });
    car.brain = brain;
    return { context, car };
}

test("parseHexColor reads #rrggbb and falls back on anything else", () => {
    const { context } = makeCar();
    const { parseHexColor } = context.__testApi;
    assert.deepEqual(Array.from(parseHexColor("#ff8000")), [255, 128, 0]);
    assert.deepEqual(Array.from(parseHexColor("00ff10")), [0, 255, 16]);
    assert.deepEqual(Array.from(parseHexColor("rouge")), [52, 167, 255]);
    assert.deepEqual(Array.from(parseHexColor(undefined)), [52, 167, 255]);
});

test("shadeColor lightens, darkens and stays within 0-255", () => {
    const { context } = makeCar();
    const { shadeColor } = context.__testApi;
    assert.deepEqual(Array.from(shadeColor("#808080", 0)), [128, 128, 128]);
    assert.deepEqual(Array.from(shadeColor("#808080", -1)), [0, 0, 0]);
    assert.deepEqual(Array.from(shadeColor("#808080", 1)), [255, 255, 255]);
    const lighter = shadeColor("#336699", 0.5);
    const darker = shadeColor("#336699", -0.5);
    for (let i = 0; i < 3; i++) {
        assert.ok(lighter[i] >= parseInt("336699".slice(i * 2, i * 2 + 2), 16));
        assert.ok(darker[i] <= parseInt("336699".slice(i * 2, i * 2 + 2), 16));
    }
});

test("Car.show draws a car, hides dead cars, and keeps the dead leader visible", () => {
    const recorder = createDrawRecorder();
    const { context, car } = makeCar();
    bindDrawing(context, recorder);
    car.vel = new TestVector(1, 0);

    car.show(false);
    assert.equal(recorder.calls.beginShape, 1, "one body polygon");
    assert.ok(recorder.calls.rect >= 10, "wheels, wings and details are drawn");

    const before = recorder.calls.beginShape;
    car.dead = true;
    car.show(false);
    assert.equal(recorder.calls.beginShape, before, "a dead car that is not the leader is hidden");

    car.show(true);
    assert.equal(recorder.calls.beginShape, before + 1, "the dead leader is still shown");
});

test("the leader gets a halo and a trail; other cars do not", () => {
    const recorder = createDrawRecorder();
    const { context, car } = makeCar();
    bindDrawing(context, recorder);
    car.vel = new TestVector(1, 0);
    car.trail = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }];

    car.show(false);
    assert.equal(recorder.calls.line || 0, 0);
    const circlesNormal = recorder.calls.circle;

    car.show(true);
    assert.equal(recorder.calls.line, 2, "trail segments");
    assert.ok(recorder.calls.circle >= circlesNormal + 3, "halo circles are added");
});

test("brake lights only light up when the car is slow", () => {
    const { context, car } = makeCar();
    const recorder = createDrawRecorder();
    bindDrawing(context, recorder);

    car.vel = new TestVector(car.maxSpeed, 0);
    car.show(false);
    const fast = recorder.calls.rect;

    car.vel = new TestVector(0.1, 0);
    car.show(false);
    const slow = recorder.calls.rect - fast;
    assert.equal(slow, fast + 2);
});

test("the trail follows the car and is capped", () => {
    const { car } = makeCar();
    car.setPhysics(6, 0.5);
    for (let f = 0; f < 200 && !car.dead; f++) {
        car.vel = new TestVector(3, 0);
        car.update();
    }
    assert.ok(car.trail.length > 0 && car.trail.length <= 26);
    const last = car.trail[car.trail.length - 1];
    assert.ok(Math.abs(last.x - car.pos.x) <= 3.01);
});
