const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createContext, loadScripts, TestVector } = require("./helpers.cjs");

function makeCar() {
    const context = createContext({ randomBetween: () => 0 });
    context.NeuralNetwork = class NeuralNetwork { static fromJSON(json) { return json; } };
    loadScripts(context, ["globals.js", "utils.js", "Ray.js", "Vehicle.js", "Car.js"], ["Car"]);
    const brain = { input_nodes: 6, output_nodes: 2, copy() { return this; }, dispose() {}, predict: () => [0.5, 0.5] };
    const car = new context.__testApi.Car({ brain });
    car.brain = brain;
    car.setPhysics(6, 0.5);
    return car;
}

// Fait avancer la voiture sur une trajectoire imposée (sans cerveau), comme Car.update() la verrait.
function drive(car, frames, stepFn) {
    for (let f = 0; f < frames && !car.dead; f++) {
        car.vel = stepFn(f);
        car.update();
    }
    return car;
}

test("une voiture qui tourne sur un grand cercle est éliminée", () => {
    const car = makeCar();
    const start = car.pos.copy();
    // Cercle de rayon ~40 px parcouru en ~50 images : déplacement net > 20 px mais aucune progression
    const omega = (2 * Math.PI) / 50, speed = 5;
    drive(car, 400, f => {
        const a = f * omega;
        return new TestVector(Math.cos(a) * speed, Math.sin(a) * speed);
    });
    assert.ok(car.dead, "la toupie doit mourir");
    assert.ok(car.frameCount < 400);
    assert.ok(TestVector.dist(car.pos, start) < 120);
});

test("une voiture immobile est éliminée", () => {
    const car = makeCar();
    drive(car, 400, () => new TestVector(0.01, 0));
    assert.ok(car.dead);
});

test("une voiture qui avance droit n'est pas éliminée", () => {
    const car = makeCar();
    drive(car, 300, () => new TestVector(4, 0));
    assert.equal(car.dead, false);
});

test("une voiture qui prend un virage serré normal n'est pas éliminée", () => {
    const car = makeCar();
    // Quart de tour en 60 images, puis ligne droite
    drive(car, 400, f => {
        const a = f < 60 ? (f / 60) * (Math.PI / 2) : Math.PI / 2;
        return new TestVector(Math.cos(a) * 4, Math.sin(a) * 4);
    });
    assert.equal(car.dead, false);
});

// --- Éditeur de circuit : seul un événement venant du canvas doit ajouter un point ---
test("mousePressed/mouseDragged ignorent les clics hors canvas (bouton Terminer)", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "js", "main.js"), "utf8");
    const grab = name => src.slice(src.indexOf(`function ${name}(`), src.indexOf("\n}", src.indexOf(`function ${name}(`)) + 2);
    const added = [];
    const context = vm.createContext({
        trackEditorActive: true, mouseX: 10, mouseY: 20,
        addTrackDraftPoint: (x, y) => added.push([x, y])
    });
    vm.runInContext([grab("isCanvasEvent"), grab("mousePressed"), grab("mouseDragged")].join("\n"), context);

    const button = { target: { tagName: "BUTTON", closest: () => null } };
    const canvas = { target: { tagName: "CANVAS", closest: sel => sel === "#canvas-container" ? {} : null } };

    context.mousePressed(button);
    context.mouseDragged(button);
    assert.equal(added.length, 0, "clic sur un bouton : aucun point");

    context.mousePressed(canvas);
    context.mouseDragged(canvas);
    assert.equal(added.length, 2, "clic sur le canvas : points ajoutés");

    context.mousePressed(undefined);
    assert.equal(added.length, 2, "sans événement : rien");
});

// --- Fermeture automatique d'une boucle dessinée à la main ---
function handLoop(overshoot, jitter = 0, cx = 700, cy = 400) {
    const pts = [];
    const n = Math.round((2 * Math.PI + overshoot) / 0.03);
    for (let i = 0; i <= n; i++) {
        const a = i * 0.03;
        pts.push([cx + 500 * Math.cos(a) + Math.sin(i * 7.3) * jitter, cy + 250 * Math.sin(a) + Math.cos(i * 5.1) * jitter]);
    }
    return pts;
}

function trackApi() {
    const context = createContext({ width: 1400, height: 800 });
    loadScripts(context, ["globals.js", "utils.js", "Track.js"],
        ["findLoopSelfIntersection", "closeDraftLoop", "setupTrack"]);
    return { api: context.__testApi, context };
}

test("un trait qui dépasse son point de départ est refermé automatiquement", () => {
    const { api } = trackApi();
    for (const [overshoot, jitter] of [[0.5, 0], [0.3, 4], [0.15, 2]]) {
        const raw = handLoop(overshoot, jitter);
        assert.ok(api.findLoopSelfIntersection(raw), "le brouillon se croise au départ");
        const closed = api.closeDraftLoop(raw);
        assert.equal(api.findLoopSelfIntersection(closed), null);
        assert.ok(closed.length > raw.length * 0.75);
    }
});

test("une boucle déjà valide est renvoyée telle quelle", () => {
    const { api } = trackApi();
    const raw = handLoop(0);
    assert.equal(api.closeDraftLoop(raw), raw);
});

test("une boucle en 8 reste refusée (non corrigée)", () => {
    const { api } = trackApi();
    const pts = [];
    for (let i = 0; i < 200; i++) {
        const a = (i / 200) * 2 * Math.PI;
        pts.push([700 + 400 * Math.sin(a), 400 + 200 * Math.sin(2 * a)]);
    }
    const out = api.closeDraftLoop(pts);
    assert.ok(api.findLoopSelfIntersection(out), "le 8 doit rester invalide");
});

test("le circuit dessiné avec dépassement se construit : murs et checkpoints créés", () => {
    const { api, context } = trackApi();
    context.customTrackPath = api.closeDraftLoop(handLoop(0.4, 3));
    context.TRACK_PRESET = "custom";
    api.setupTrack();
    assert.equal(context.currentTrackPreset, "custom");
    assert.ok(context.walls.length > 100);
    assert.ok(context.checkpoints.length > 20);
});
