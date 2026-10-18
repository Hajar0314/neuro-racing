const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.join(__dirname, "..");

class TestVector {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    copy() { return new TestVector(this.x, this.y); }
    add(vector) { this.x += vector.x; this.y += vector.y; return this; }
    sub(vector) { this.x -= vector.x; this.y -= vector.y; return this; }
    mult(value) { this.x *= value; this.y *= value; return this; }
    div(value) { this.x /= value; this.y /= value; return this; }
    set(x, y) { this.x = x; this.y = y; return this; }
    dot(vector) { return this.x * vector.x + this.y * vector.y; }
    magSq() { return this.x * this.x + this.y * this.y; }
    mag() { return Math.sqrt(this.magSq()); }
    normalize() { const magnitude = this.mag(); return magnitude ? this.div(magnitude) : this; }
    setMag(value) { return this.normalize().mult(value); }
    limit(value) { if (this.magSq() > value * value) this.setMag(value); return this; }
    heading() { return Math.atan2(this.y, this.x); }

    static add(a, b) { return a.copy().add(b); }
    static sub(a, b) { return a.copy().sub(b); }
    static dist(a, b) { return TestVector.sub(a, b).mag(); }
    static fromAngle(angle) { return new TestVector(Math.cos(angle), Math.sin(angle)); }
}

function createContext(extra = {}) {
    const context = {
        console,
        Math,
        Date,
        Array,
        Set,
        Map,
        Number,
        String,
        Error,
        p5: { Vector: TestVector },
        createVector: (x = 0, y = 0) => new TestVector(x, y),
        width: 900,
        height: 600,
        window: { startAngle: 0, startCheckpointIndex: 0 },
        min: Math.min,
        max: Math.max,
        floor: Math.floor,
        abs: Math.abs,
        constrain: (value, low, high) => Math.max(low, Math.min(high, value)),
        map: (value, start1, stop1, start2, stop2) =>
            start2 + ((value - start1) / (stop1 - start1)) * (stop2 - start2),
        dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
        lerp: (start, stop, amount) => start + (stop - start) * amount,
        random: (low = 0, high = 1) => high === 1 && low === 0 ? 0.5 : (low + high) / 2,
        ...extra
    };
    context.globalThis = context;
    return vm.createContext(context);
}

function loadScripts(context, filenames, expose) {
    // Random.js (tirages à graine) est partagé par NeuralNetwork, Genetic et Car : il est toujours
    // chargé en premier. Sans graine fixée, il délègue au hasard que le test injecte (Math.random,
    // random, randomGaussian), donc les tests existants gardent leur comportement.
    if (!filenames.includes("Random.js")) filenames = ["Random.js", ...filenames];
    const scripts = filenames.map(filename =>
        fs.readFileSync(path.join(projectRoot, "js", filename), "utf8")
    );
    scripts.push(`globalThis.__testApi = { ${expose.join(", ")} };`);
    vm.runInContext(scripts.join("\n"), context);
    return context.__testApi;
}

module.exports = { createContext, loadScripts, TestVector };
