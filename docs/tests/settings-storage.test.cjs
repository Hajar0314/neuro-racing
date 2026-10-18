const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts } = require("./helpers.cjs");

const RANGES = {
    speedSlider: [2, 20, 1], accelerationSlider: [0.1, 2, 0.1], stepsSlider: [1, 10, 1],
    populationSlider: [20, 100, 10], mutationSlider: [1, 50, 1], crossoverSlider: [0, 100, 5], successSlider: [40, 100, 5],
    neuronsSlider: [4, 64, 1], diffSlider: [1, 50, 1], widthSlider: [35, 150, 5]
};

// Faux DOM : mêmes contrôles et mêmes bornes que index.html.
function createFakeDocument() {
    const elements = {};
    for (const [id, [min, max, step]] of Object.entries(RANGES)) {
        elements[id] = { min: String(min), max: String(max), step: String(step), value: String(min) };
    }
    for (const id of ["speedVal", "accelerationVal", "stepsVal", "populationVal", "mutationVal", "crossoverVal",
        "successVal", "neuronsVal", "diffVal", "widthVal"]) {
        elements[id] = { value: "", textContent: "" };
    }
    const options = values => values.map(value => ({ value }));
    elements.activationSelect = { options: options(["sigmoid", "tanh", "relu"]), value: "sigmoid" };
    elements.trackSelect = { options: options(["easy", "medium", "technical", "custom"]), value: "easy" };
    elements.debugToggle = { checked: false };
    return { elements, getElementById: id => elements[id] || null };
}

function createFakeStorage(initial) {
    const data = new Map(initial === undefined ? [] : [["neuroevolution-racing-settings-v1", initial]]);
    return {
        data,
        getItem: key => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, value)
    };
}

function load(extra = {}) {
    const document = createFakeDocument();
    const context = createContext({ document, ...extra });
    const api = loadScripts(context, ["globals.js", "Settings.js"], [
        "SettingsStorage", "restoreSettings", "persistSettings", "collectSettings", "createSettingsStorage"
    ]);
    return { context, document, api };
}

test("SettingsStorage.load tolerates missing, unreadable and wrongly shaped data", () => {
    const { api } = load();
    // JSON.stringify : les objets créés dans le contexte vm n'ont pas le même prototype.
    const loaded = initial => JSON.stringify(new api.SettingsStorage(createFakeStorage(initial)).load());
    assert.equal(loaded(), "{}");
    assert.equal(loaded("{pas du json"), "{}");
    assert.equal(loaded("[1,2]"), "{}");
    assert.equal(loaded("null"), "{}");
    const blocked = { getItem() { throw new Error("bloqué"); }, setItem() { throw new Error("bloqué"); } };
    const storage = new api.SettingsStorage(blocked);
    assert.equal(JSON.stringify(storage.load()), "{}");
    assert.equal(storage.save({ speed: 8 }), false);
});

test("settings saved from the globals are restored into globals and controls", () => {
    const { context, document, api } = load();
    const fake = createFakeStorage();
    context.GAME_SPEED_LIMIT = 9;
    context.CAR_ACCELERATION = 0.7;
    context.MUTATION_RATE = 0.3;
    context.CROSSOVER_RATE = 0.4;
    context.SUCCESS_RATE_TARGET = 0.8;
    context.HIDDEN_NODES = 32;
    context.HIDDEN_ACTIVATION = "relu";
    context.TRACK_PRESET = "technical";
    context.TOTAL_POP = 80;
    context.showDebugSensors = true;
    assert.equal(api.persistSettings(new api.SettingsStorage(fake)), true);

    const fresh = load();
    const restored = fresh.api.restoreSettings(new fresh.api.SettingsStorage(fake));

    assert.equal(restored, 13);
    assert.equal(fresh.context.GAME_SPEED_LIMIT, 9);
    assert.equal(fresh.context.CAR_ACCELERATION, 0.7);
    assert.equal(fresh.context.MUTATION_RATE, 0.3);
    assert.equal(fresh.context.CROSSOVER_RATE, 0.4);
    assert.equal(fresh.context.SUCCESS_RATE_TARGET, 0.8);
    assert.equal(fresh.context.HIDDEN_NODES, 32);
    assert.equal(fresh.context.HIDDEN_ACTIVATION, "relu");
    assert.equal(fresh.context.TRACK_PRESET, "technical");
    assert.equal(fresh.context.TOTAL_POP, 80);
    assert.equal(fresh.context.showDebugSensors, true);
    const { elements } = fresh.document;
    assert.equal(elements.speedSlider.value, "9");
    assert.equal(elements.accelerationVal.textContent, "0.7");
    assert.equal(elements.mutationVal.textContent, "30 %");
    assert.equal(elements.crossoverVal.textContent, "40 %");
    assert.equal(elements.successVal.textContent, "80 %");
    assert.equal(elements.activationSelect.value, "relu");
    assert.equal(elements.trackSelect.value, "technical");
    assert.equal(elements.debugToggle.checked, true);
});

test("invalid saved values are ignored and the defaults are kept", () => {
    const { context, document, api } = load();
    const fake = createFakeStorage(JSON.stringify({
        speed: "vite", acceleration: null, steps: NaN, population: [50],
        activation: "softmax", track: "custom", debug: "oui", neurons: 32, inconnu: 1
    }));

    const restored = api.restoreSettings(new api.SettingsStorage(fake));

    assert.equal(restored, 1);
    assert.equal(context.HIDDEN_NODES, 32);
    assert.equal(context.GAME_SPEED_LIMIT, 6);
    assert.equal(context.HIDDEN_ACTIVATION, "sigmoid");
    assert.equal(context.TRACK_PRESET, "easy");
    assert.equal(context.showDebugSensors, false);
    assert.equal(document.elements.speedSlider.value, "2");
});

test("out-of-range values are clamped and snapped to the slider step", () => {
    const { context, api } = load();
    const fake = createFakeStorage(JSON.stringify({
        speed: 500, mutation: -4, population: 47, acceleration: 0.34, width: 102
    }));

    api.restoreSettings(new api.SettingsStorage(fake));

    assert.equal(context.GAME_SPEED_LIMIT, 20);
    assert.equal(context.MUTATION_RATE, 0.01);
    assert.equal(context.TOTAL_POP, 50);
    assert.equal(context.CAR_ACCELERATION, 0.3);
    assert.equal(context.TRACK_WIDTH, 100);
});

test("a drawn circuit does not overwrite the last preset circuit saved", () => {
    const { context, api } = load();
    const fake = createFakeStorage();
    const storage = new api.SettingsStorage(fake);
    context.TRACK_PRESET = "medium";
    api.persistSettings(storage);

    context.TRACK_PRESET = "custom";
    context.GAME_SPEED_LIMIT = 12;
    api.persistSettings(storage);

    const saved = JSON.parse(fake.data.get("neuroevolution-racing-settings-v1"));
    assert.equal(saved.track, "medium");
    assert.equal(saved.speed, 12);
});

test("createSettingsStorage returns null, without failing, when the browser denies storage", () => {
    const { context, api } = load();
    Object.defineProperty(context, "localStorage", {
        get() { throw new Error("accès refusé"); }
    });
    assert.equal(api.createSettingsStorage(), null);
});
