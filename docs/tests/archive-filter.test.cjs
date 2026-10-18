const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts } = require("./helpers.cjs");

function createArchiveContext() {
    const saved = [];
    const context = createContext({
        brainStorage: { save: record => { saved.push(record); return saved.slice(); } },
        renderBrainList: () => {},
        setStatus: () => {},
        TRACK_PRESET: "easy"
    });
    loadScripts(context, ["globals.js", "Genetic.js"], ["archiveTopBrains"]);
    context.brainStorage = { save: record => { saved.push(record); return saved.slice(); } };
    return { context, saved };
}

function car(score, extra = {}) {
    return { score, fitness: score + 40, finished: false, trackProgress: 0, brain: { toJSON: () => ({}) }, ...extra };
}

test("automatic archiving skips cars that never validated a checkpoint", () => {
    const { context, saved } = createArchiveContext();
    context.archiveTopBrains([car(0), car(0), car(0)], 5, { onlyProgressed: true });
    assert.equal(saved.length, 0);
});

test("automatic archiving keeps only the cars that progressed", () => {
    const { context, saved } = createArchiveContext();
    context.archiveTopBrains([car(0), car(150), car(50), car(0, { finished: true })], 5, { onlyProgressed: true });
    assert.equal(saved.length, 3);
    assert.ok(saved.every(record => record.score > 0 || record.finished));
});

test("manual archiving still saves everything requested", () => {
    const { context, saved } = createArchiveContext();
    context.archiveTopBrains([car(0), car(0), car(0)], 2);
    assert.equal(saved.length, 2);
});

test("restartTraining archives only progressed cars", () => {
    const { context, saved } = createArchiveContext();
    const calls = [];
    context.archiveTopBrains = (list, count, options) => calls.push(options);
    const source = require("node:fs").readFileSync(
        require("node:path").join(__dirname, "..", "js", "main.js"), "utf8");
    assert.match(source, /archiveTopBrains\(\[\.\.\.cars, \.\.\.savedCars\], 5, \{ onlyProgressed: true \}\)/);
    assert.equal(calls.length, 0);
});
