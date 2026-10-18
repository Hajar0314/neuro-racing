const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts } = require("./helpers.cjs");

function createTrackContext() {
    const context = createContext();
    loadScripts(context, ["globals.js", "utils.js", "Track.js"], ["setupTrack", "trainingPreset"]);
    return context;
}

const pathOf = context => JSON.stringify(context.currentTrackPath);

test("setupTrack(preset) draws that circuit without touching the circuit setting", () => {
    const context = createTrackContext();
    context.TRACK_PRESET = "easy";
    context.setupTrack();
    const easyPath = pathOf(context);

    context.setupTrack("technical");

    assert.equal(context.TRACK_PRESET, "easy");
    assert.equal(context.currentTrackPreset, "technical");
    assert.notEqual(pathOf(context), easyPath);
});

test("setupTrack(preset) gives each preset its own geometry, and is repeatable", () => {
    const context = createTrackContext();
    const paths = ["easy", "medium", "technical"].map(preset => {
        context.setupTrack(preset);
        return pathOf(context);
    });
    assert.equal(new Set(paths).size, 3);

    context.setupTrack("medium");
    assert.equal(pathOf(context), paths[1]);
});

test("without argument the circuit follows the setting", () => {
    const context = createTrackContext();
    context.TRACK_PRESET = "medium";
    context.setupTrack();
    assert.equal(context.currentTrackPreset, "medium");
    assert.equal(context.trainingPreset(), "medium");
});

test("in multi-circuit mode the training circuit is the one of the current round", () => {
    const context = createTrackContext();
    context.TRACK_PRESET = "easy";
    context.MULTI_TRACK_TRAINING = true;
    context.MULTI_TRACK_SET = ["easy", "technical"];

    context.multiTrackRound = 0;
    assert.equal(context.trainingPreset(), "easy");
    context.multiTrackRound = 1;
    assert.equal(context.trainingPreset(), "technical");
    context.setupTrack();
    assert.equal(context.currentTrackPreset, "technical");
    assert.equal(context.TRACK_PRESET, "easy");

    context.MULTI_TRACK_TRAINING = false;
    assert.equal(context.trainingPreset(), "easy");
});

test("a drawn circuit can be built while another preset is selected", () => {
    const context = createTrackContext();
    context.TRACK_PRESET = "easy";
    context.customTrackPath = Array.from({ length: 32 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 32;
        return [450 + Math.cos(angle) * 180, 300 + Math.sin(angle) * 130];
    });

    context.setupTrack("custom");

    assert.equal(context.TRACK_PRESET, "easy");
    assert.equal(context.currentTrackPreset, "custom");
    assert.ok(context.currentTrackPath.length > 50);
    assert.equal(context.walls.length, context.currentTrackPath.length * 2);
    assert.ok(context.customTrackPath.length > 32); // recalé par setupTrack comme avant
});

test("the start position and heading come from the circuit just built", () => {
    const context = createTrackContext();
    context.setupTrack("easy");
    const easyStart = [context.startX, context.startY];
    context.setupTrack("technical");
    assert.notDeepEqual([context.startX, context.startY], easyStart);
    const [x, y] = context.currentTrackPath[Math.floor(context.currentTrackPath.length * 0.05)];
    assert.equal(context.startX, x);
    assert.equal(context.startY, y);
});
