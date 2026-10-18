const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createContext, loadScripts } = require("./helpers.cjs");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function createFakeDocument() {
    const elements = {};
    const options = values => values.map(value => ({ value }));
    elements.multiTrackToggle = { checked: false };
    for (const preset of ["easy", "medium", "technical"]) elements[`multiTrack-${preset}`] = { checked: true };
    elements.raceTrackSelect = {
        options: options(["auto", "easy", "medium", "technical", "custom"]), value: "auto"
    };
    return { elements, getElementById: id => elements[id] || null };
}

function createFakeStorage(initial) {
    const data = new Map(initial === undefined ? [] : [["neuroevolution-racing-settings-v1", initial]]);
    return {
        getItem: key => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, value)
    };
}

function load() {
    const document = createFakeDocument();
    const context = createContext({ document });
    const api = loadScripts(context, ["globals.js", "MultiTrack.js", "Settings.js"], [
        "SettingsStorage", "restoreSettings", "persistSettings", "collectSettings", "SETTING_DEFINITIONS"
    ]);
    return { context, document, api };
}

test("multi-circuit settings survive a reload and are shown in their controls", () => {
    const { context, api } = load();
    const fake = createFakeStorage();
    context.MULTI_TRACK_TRAINING = true;
    context.MULTI_TRACK_SET = ["easy", "technical"];
    context.RACE_TRACK_CHOICE = "medium";
    assert.equal(api.persistSettings(new api.SettingsStorage(fake)), true);

    const fresh = load();
    const restored = fresh.api.restoreSettings(new fresh.api.SettingsStorage(fake));

    assert.equal(restored, 5);
    assert.equal(fresh.context.MULTI_TRACK_TRAINING, true);
    assert.deepEqual(Array.from(fresh.context.MULTI_TRACK_SET), ["easy", "technical"]);
    assert.equal(fresh.context.RACE_TRACK_CHOICE, "medium");
    const { elements } = fresh.document;
    assert.equal(elements.multiTrackToggle.checked, true);
    assert.equal(elements["multiTrack-easy"].checked, true);
    assert.equal(elements["multiTrack-medium"].checked, false);
    assert.equal(elements["multiTrack-technical"].checked, true);
    assert.equal(elements.raceTrackSelect.value, "medium");
});

test("a single remaining circuit is restored whatever the order of the saved flags", () => {
    for (const only of ["easy", "medium", "technical"]) {
        const { context, api } = load();
        const saved = {
            multiEasy: only === "easy", multiMedium: only === "medium", multiTechnical: only === "technical"
        };
        api.restoreSettings(new api.SettingsStorage(createFakeStorage(JSON.stringify(saved))));
        assert.deepEqual(Array.from(context.MULTI_TRACK_SET), [only]);
    }
});

test("saved flags that would leave no training circuit are corrected", () => {
    const { context, api } = load();
    const saved = { multiEasy: false, multiMedium: false, multiTechnical: false };
    api.restoreSettings(new api.SettingsStorage(createFakeStorage(JSON.stringify(saved))));
    assert.ok(context.MULTI_TRACK_SET.length >= 1);
});

test("the race circuit is validated, and a drawn circuit is never saved", () => {
    const { context, api } = load();
    api.restoreSettings(new api.SettingsStorage(createFakeStorage(JSON.stringify({ raceTrack: "lune" }))));
    assert.equal(context.RACE_TRACK_CHOICE, "auto");
    api.restoreSettings(new api.SettingsStorage(createFakeStorage(JSON.stringify({ raceTrack: "custom" }))));
    assert.equal(context.RACE_TRACK_CHOICE, "auto"); // il n'existe plus après un rechargement

    const fake = createFakeStorage();
    const storage = new api.SettingsStorage(fake);
    context.RACE_TRACK_CHOICE = "technical";
    api.persistSettings(storage);
    context.RACE_TRACK_CHOICE = "custom";
    api.persistSettings(storage);
    assert.equal(JSON.parse(fake.getItem("neuroevolution-racing-settings-v1")).raceTrack, "technical");
});

test("a non-boolean multi-circuit flag is ignored", () => {
    const { context, api } = load();
    api.restoreSettings(new api.SettingsStorage(createFakeStorage(JSON.stringify({ multiTrack: "oui" }))));
    assert.equal(context.MULTI_TRACK_TRAINING, false);
});

test("every saved setting has its control in the page", () => {
    const { api } = load();
    for (const definition of api.SETTING_DEFINITIONS) {
        assert.match(html, new RegExp(`id="${definition.inputId}"`), definition.key);
    }
});

test("the page has the controls and outputs the multi-circuit code looks up", () => {
    for (const id of ["multiTrackToggle", "multiTrackOptions", "multiTrack-easy", "multiTrack-medium",
        "multiTrack-technical", "raceTrackSelect", "raceTrackInfo", "trackSelect"]) {
        assert.match(html, new RegExp(`id="${id}"`), id);
    }
});

test("the page defaults match the program defaults: single circuit, race on the training circuit", () => {
    const context = createContext();
    loadScripts(context, ["globals.js"], ["MULTI_TRACK_TRAINING"]);
    assert.equal(context.MULTI_TRACK_TRAINING, false);
    assert.equal(context.RACE_TRACK_CHOICE, "auto");
    assert.deepEqual(Array.from(context.MULTI_TRACK_SET), ["easy", "medium", "technical"]);
    assert.doesNotMatch(html.match(/<input[^>]*id="multiTrackToggle"[^>]*>/)[0], /checked/);
    for (const preset of ["easy", "medium", "technical"]) {
        assert.match(html.match(new RegExp(`<input[^>]*id="multiTrack-${preset}"[^>]*>`))[0], /checked/);
    }
    assert.match(html.match(/<fieldset[^>]*id="multiTrackOptions"[^>]*>/)[0], /hidden/);
    const raceOptions = [...html.match(/<select id="raceTrackSelect">([\s\S]*?)<\/select>/)[1]
        .matchAll(/value="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(raceOptions, ["auto", "easy", "medium", "technical", "custom"]);
});

test("the new scripts load before main.js, after the classes they use", () => {
    const order = [...html.matchAll(/<script src="js\/([^"]+)"/g)].map(match => match[1]);
    const index = name => order.indexOf(name);
    assert.ok(index("MultiTrack.js") > index("Car.js"));
    assert.ok(index("MultiTrack.js") > index("Track.js"));
    assert.ok(index("Generalization.js") > index("Track.js"));
    assert.ok(index("MultiTrack.js") < index("main.js"));
    assert.ok(index("Generalization.js") < index("main.js"));
    assert.ok(index("MultiTrack.js") >= 0 && index("Generalization.js") >= 0);
});
