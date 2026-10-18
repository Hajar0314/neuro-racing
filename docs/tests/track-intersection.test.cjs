const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts } = require("./helpers.cjs");

function ellipse(count, cx = 450, cy = 300, rx = 180, ry = 130) {
    return Array.from({ length: count }, (_, i) => {
        const a = (Math.PI * 2 * i) / count;
        return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
    });
}

function figureEight(count) {
    return Array.from({ length: count }, (_, i) => {
        const a = (Math.PI * 2 * i) / count;
        return [450 + Math.sin(a) * 200, 300 + Math.sin(2 * a) * 120];
    });
}

function createEditorContext() {
    const statuses = [];
    const element = { hidden: false, value: "", classList: { add() {}, remove() {}, toggle() {} } };
    const context = createContext({
        document: { getElementById: () => element },
        setStatus: (message, isError) => statuses.push({ message, isError: Boolean(isError) }),
        setupTrack: () => {},
        restartTraining: () => { statuses.push({ restarted: true }); },
        polygonArea: undefined
    });
    loadScripts(context, ["globals.js", "utils.js", "Track.js", "main.js"], [
        "findLoopSelfIntersection",
        "finishTrackEditor"
    ]);
    context.setStatus = (message, isError) => statuses.push({ message, isError: Boolean(isError) });
    context.setupTrack = () => {};
    context.restartTraining = () => { statuses.push({ restarted: true }); };
    return { context, statuses };
}

test("a simple closed loop has no self-intersection", () => {
    const { context } = createEditorContext();
    assert.equal(context.findLoopSelfIntersection(ellipse(64)), null);
});

test("a figure-eight loop is detected as self-intersecting", () => {
    const { context } = createEditorContext();
    assert.ok(context.findLoopSelfIntersection(figureEight(64)));
});

test("finishing a self-crossing drawn circuit is refused and keeps the editor open", () => {
    const { context, statuses } = createEditorContext();
    context.trackEditorActive = true;
    context.trackEditorDraft = figureEight(64);
    context.customTrackPath = [];

    context.finishTrackEditor();

    assert.equal(context.trackEditorActive, true);
    assert.equal(context.customTrackPath.length, 0);
    assert.equal(context.TRACK_PRESET, "easy");
    assert.equal(statuses.length, 1);
    assert.equal(statuses[0].isError, true);
    assert.match(statuses[0].message, /recoupe/);
});

test("finishing a valid drawn circuit is still accepted", () => {
    const { context, statuses } = createEditorContext();
    context.trackEditorActive = true;
    context.trackEditorDraft = ellipse(64);

    context.finishTrackEditor();

    assert.equal(context.trackEditorActive, false);
    assert.equal(context.TRACK_PRESET, "custom");
    assert.equal(context.customTrackPath.length, 64);
    assert.ok(statuses.some(entry => entry.restarted));
});
