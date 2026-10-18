const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createContext, loadScripts } = require("./helpers.cjs");

test("the initial track complexity matches the slider shown in the page", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const slider = html.match(/<input[^>]*id="diffSlider"[^>]*value="(\d+)"/);
    const output = html.match(/<output id="diffVal">(\d+)<\/o/);
    assert.ok(slider && output);

    const context = createContext();
    loadScripts(context, ["globals.js"], ["TRACK_DIFFICULTY"]);

    assert.equal(context.TRACK_DIFFICULTY, Number(slider[1]));
    assert.equal(context.TRACK_DIFFICULTY, Number(output[1]));
    assert.equal(context.TRACK_DIFFICULTY, 12);
});
