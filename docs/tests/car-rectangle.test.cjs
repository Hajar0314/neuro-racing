const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts, TestVector } = require("./helpers.cjs");

function createCollisionContext() {
    const context = createContext();
    loadScripts(context, ["globals.js", "utils.js", "main.js"], [
        "checkCollisions",
        "segmentHitsOrientedRect"
    ]);
    return context;
}

// Voiture 20 × 10 au point (100, 100), cap vers +x : le museau avance jusqu'à x = 110.
function car(x, y, vx, vy) {
    return {
        pos: new TestVector(x, y),
        lastStepPos: new TestVector(x, y),
        vel: new TestVector(vx, vy),
        width: 10,
        height: 20,
        dead: false
    };
}

test("the nose of the car hits a wall that the center point does not reach", () => {
    const context = createCollisionContext();
    // Mur vertical à x = 108 : le centre est à 8 px (> 5,6), le museau (x = 110) le dépasse.
    context.walls = [{ a: new TestVector(108, 0), b: new TestVector(108, 200) }];
    const c = car(100, 100, 1, 0);

    context.checkCollisions(c);

    assert.equal(c.dead, true);
});

test("a wall just beyond the nose is not hit", () => {
    const context = createCollisionContext();
    context.walls = [{ a: new TestVector(112, 0), b: new TestVector(112, 200) }];
    const c = car(100, 100, 1, 0);

    context.checkCollisions(c);

    assert.equal(c.dead, false);
});

test("the rectangle follows the heading of the car", () => {
    const context = createCollisionContext();
    // Mur horizontal à y = 108 : touché par le museau si la voiture va vers le bas, pas vers la droite.
    context.walls = [{ a: new TestVector(0, 108), b: new TestVector(200, 108) }];
    const heading = car(100, 100, 0, 1);
    const sideways = car(100, 100, 1, 0);

    context.checkCollisions(heading);
    context.checkCollisions(sideways);

    assert.equal(heading.dead, true);
    assert.equal(sideways.dead, false);
});

test("a wall passing through the body of the car is hit even if it misses the center", () => {
    const context = createCollisionContext();
    const result = context.segmentHitsOrientedRect(
        new TestVector(104, 90), new TestVector(104, 110),
        new TestVector(100, 100), 0, 10, 5
    );
    assert.equal(result, true);
});

test("segmentHitsOrientedRect handles a segment fully inside and fully outside", () => {
    const context = createCollisionContext();
    const V = (x, y) => new TestVector(x, y);
    assert.equal(context.segmentHitsOrientedRect(V(98, 100), V(102, 100), V(100, 100), 0, 10, 5), true);
    assert.equal(context.segmentHitsOrientedRect(V(0, 0), V(5, 5), V(100, 100), 0, 10, 5), false);
});
