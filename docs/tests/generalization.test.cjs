const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts, TestVector } = require("./helpers.cjs");

function fakeElement() {
    return {
        children: [], className: "", textContent: "", hidden: true, disabled: false, style: {},
        append(...nodes) { this.children.push(...nodes); },
        appendChild(node) { this.children.push(node); return node; },
        replaceChildren(...nodes) { this.children = nodes; }
    };
}

const STARTS = { easy: [100, 100], medium: [300, 200], technical: [500, 400], custom: [250, 250] };

function record(id, extra = {}) {
    return { id, name: `cerveau ${id}`, score: 100, brain: { id }, ...extra };
}

function load() {
    const elements = {};
    const setupCalls = [];
    const statuses = [];
    const context = createContext({
        document: {
            getElementById: id => (elements[id] = elements[id] || fakeElement()),
            createElement: () => fakeElement()
        }
    });
    class FakeCar {
        constructor(configuration = {}) {
            this.brain = configuration.brain;
            this.name = configuration.name;
            this.color = configuration.color;
            this.pos = configuration.position.copy();
            this.dead = false;
            this.finished = false;
            this.lapFrames = null;
            this.score = 0;
            this.checkpointIndex = 0;
        }
        dispose() { this.disposed = true; }
    }
    context.Car = FakeCar;
    const api = loadScripts(context, ["globals.js", "Generalization.js", "main.js"], [
        "startBrainRace", "exitBrainRace", "refreshRaceRanking", "displayRaceResults",
        "trackLabel", "selectedBrainIds", "trainedOnPresets", "circuitStatus", "describeTrainedOn",
        "summarizeGeneralization", "formatGeneralization", "describeRaceTrack", "raceTrackPreset",
        "presetLabel"
    ]);
    context.setStatus = (message, isError) => statuses.push({ message, isError: Boolean(isError) });
    context.trainingPreset = () => (context.MULTI_TRACK_TRAINING
        ? context.MULTI_TRACK_SET[context.multiTrackRound] : context.TRACK_PRESET);
    context.setupTrack = (preset = context.trainingPreset()) => {
        setupCalls.push(preset);
        context.currentTrackPreset = preset;
        [context.startX, context.startY] = STARTS[preset];
    };
    context.setupTrack("easy");
    setupCalls.length = 0;
    context.updateTrainingButton = () => {};
    context.distanceToNextCheckpoint = () => 0;
    context.TRACK_PRESET = "easy";
    context.trainingActive = true;
    return { context, api, elements, setupCalls, statuses };
}

function select(context, api, records) {
    context.trainedBrains = records;
    api.selectedBrainIds.clear();
    records.forEach(entry => api.selectedBrainIds.add(entry.id));
}

test("trainedOnPresets reads trainedOn, falls back to the old trackPreset and ignores junk", () => {
    const { api } = load();
    const names = value => Array.from(api.trainedOnPresets(value));
    assert.deepEqual(names(record("a", { trainedOn: ["easy", "medium"] })), ["easy", "medium"]);
    assert.deepEqual(names(record("a", { trainedOn: ["easy", "easy", "lune", 3] })), ["easy"]);
    assert.deepEqual(names(record("a", { trackPreset: "technical" })), ["technical"]);
    assert.deepEqual(names(record("a", { trackPreset: "multi" })), []);
    assert.deepEqual(names(record("a")), []);
    assert.deepEqual(names(record("a", { trainedOn: "easy" })), []); // pas une liste : on n'invente rien
    assert.deepEqual(names(null), []);
});

test("circuitStatus tells seen, unseen and unknown apart", () => {
    const { api } = load();
    assert.equal(api.circuitStatus(["easy", "medium"], "medium"), "seen");
    assert.equal(api.circuitStatus(["easy", "medium"], "technical"), "unseen");
    assert.equal(api.circuitStatus(["easy"], "custom"), "unseen");
    assert.equal(api.circuitStatus([], "easy"), "unknown");
    assert.equal(api.circuitStatus(undefined, "easy"), "unknown");
});

test("describeTrainedOn is short and honest about missing history", () => {
    const { api } = load();
    assert.equal(api.describeTrainedOn([]), "circuit inconnu");
    assert.equal(api.describeTrainedOn(["medium"]), "entraîné : intermédiaire");
    assert.equal(api.describeTrainedOn(["easy", "technical"]), "entraîné : 2 circuits");
});

test("summarizeGeneralization counts finishers per category, unlabelled cars are unknown", () => {
    const { api } = load();
    const summary = api.summarizeGeneralization([
        { circuitStatus: "unseen", finished: true },
        { circuitStatus: "unseen", finished: false },
        { circuitStatus: "seen", finished: true },
        { circuitStatus: "unknown", finished: true },
        { finished: false }
    ]);
    assert.deepEqual(JSON.parse(JSON.stringify(summary)), {
        seen: { total: 1, finished: 1 },
        unseen: { total: 2, finished: 1 },
        unknown: { total: 2, finished: 1 }
    });
});

test("formatGeneralization is empty without history and detailed with it", () => {
    const { api } = load();
    assert.equal(api.formatGeneralization(api.summarizeGeneralization([{ circuitStatus: "unknown" }])), "");
    const text = api.formatGeneralization(api.summarizeGeneralization([
        { circuitStatus: "unseen", finished: true },
        { circuitStatus: "unseen", finished: false },
        { circuitStatus: "seen", finished: true }
    ]));
    assert.match(text, /circuit inédit : 1\/2/);
    assert.match(text, /circuit déjà vu : 1\/1/);
});

test("a race on another circuit draws it, labels each brain, then the training circuit comes back", () => {
    const { context, api, elements, setupCalls } = load();
    select(context, api, [
        record("a", { trainedOn: ["easy"] }),
        record("b", { trainedOn: ["technical"] }),
        record("c", { trackPreset: "easy" }),
        record("d") // archive ancienne, sans historique
    ]);
    context.RACE_TRACK_CHOICE = "technical";

    api.startBrainRace();

    assert.deepEqual(setupCalls, ["technical"]);
    assert.equal(context.raceMode, true);
    assert.equal(context.TRACK_PRESET, "easy"); // le réglage d'entraînement n'a pas bougé
    assert.deepEqual(context.raceCars.map(car => car.circuitStatus), ["unseen", "seen", "unseen", "unknown"]);
    // le départ est celui du circuit de la course (lu après le changement de circuit)
    assert.ok(context.raceCars.every(car => car.pos.x === STARTS.technical[0] && car.pos.y === STARTS.technical[1]));
    assert.match(elements.raceTrackInfo.textContent, /expert/);
    assert.match(elements.raceTrackInfo.textContent, /inédit pour 2/);
    assert.match(elements.raceTrackInfo.textContent, /déjà vu par 1/);
    assert.equal(context.trainingActive, false);

    api.exitBrainRace();

    assert.deepEqual(setupCalls, ["technical", "easy"]);
    assert.equal(context.currentTrackPreset, "easy");
    assert.equal(context.raceMode, false);
    assert.equal(context.trainingActive, true);
    assert.equal(elements.raceBanner.hidden, true);
});

test("the default race stays on the training circuit and redraws nothing", () => {
    const { context, api, setupCalls } = load();
    select(context, api, [record("a", { trainedOn: ["easy"] })]);
    context.RACE_TRACK_CHOICE = "auto";

    api.startBrainRace();
    assert.deepEqual(setupCalls, []);
    assert.equal(context.raceCars[0].circuitStatus, "seen");

    api.exitBrainRace();
    assert.deepEqual(setupCalls, []);
});

test("choosing the circuit the training is already on does not redraw it", () => {
    const { context, api, setupCalls } = load();
    select(context, api, [record("a", { trainedOn: ["easy"] })]);
    context.RACE_TRACK_CHOICE = "easy";
    api.startBrainRace();
    api.exitBrainRace();
    assert.deepEqual(setupCalls, []);
});

test("in multi-circuit mode the automatic race uses the circuit of the current round", () => {
    const { context, api, setupCalls } = load();
    context.MULTI_TRACK_TRAINING = true;
    context.MULTI_TRACK_SET = ["easy", "medium"];
    context.multiTrackRound = 1;
    context.setupTrack("medium");
    setupCalls.length = 0;
    select(context, api, [record("a", { trainedOn: ["easy", "medium"] })]);
    context.RACE_TRACK_CHOICE = "auto";

    assert.equal(api.raceTrackPreset(), "medium");
    api.startBrainRace();
    assert.deepEqual(setupCalls, []);

    api.exitBrainRace();
    context.RACE_TRACK_CHOICE = "technical";
    api.startBrainRace();
    assert.deepEqual(setupCalls, ["technical"]);
    assert.equal(context.raceCars[0].circuitStatus, "unseen"); // jamais entraîné sur l'expert
    api.exitBrainRace();
    assert.deepEqual(setupCalls, ["technical", "medium"]);
});

test("a second race back on the training circuit restores it", () => {
    const { context, api, setupCalls } = load();
    select(context, api, [record("a", { trainedOn: ["easy"] })]);
    context.RACE_TRACK_CHOICE = "medium";
    api.startBrainRace();
    context.RACE_TRACK_CHOICE = "auto";
    api.startBrainRace();
    assert.deepEqual(setupCalls, ["medium", "easy"]);
    api.exitBrainRace();
    assert.deepEqual(setupCalls, ["medium", "easy"]); // déjà revenu : pas de redessin inutile
});

test("racing on a drawn circuit that does not exist yet is refused without side effects", () => {
    const { context, api, setupCalls, statuses } = load();
    select(context, api, [record("a", { trainedOn: ["easy"] })]);
    context.RACE_TRACK_CHOICE = "custom";
    context.customTrackPath = [];

    api.startBrainRace();

    assert.equal(context.raceMode, false);
    assert.deepEqual(setupCalls, []);
    assert.equal(context.trainingActive, true);
    assert.equal(statuses.at(-1).isError, true);
    assert.match(statuses.at(-1).message, /Dessine d’abord un circuit/);
});

test("racing on a drawn circuit works once it exists", () => {
    const { context, api, setupCalls } = load();
    select(context, api, [record("a", { trainedOn: ["easy", "medium", "technical"] })]);
    context.RACE_TRACK_CHOICE = "custom";
    context.customTrackPath = Array.from({ length: 10 }, (_, index) => [index, index]);

    api.startBrainRace();

    assert.deepEqual(setupCalls, ["custom"]);
    assert.equal(context.raceCars[0].circuitStatus, "unseen");
});

test("the live ranking tags known and unknown circuits in words, not only in color", () => {
    const { context, api, elements } = load();
    const car = (name, circuitStatus) => ({
        name, color: "#fff", dead: false, finished: false, score: 0, circuitStatus, checkpointIndex: 0
    });
    context.raceCars = [car("a", "unseen"), car("b", "seen"), car("c", "unknown"), car("d", undefined)];

    api.refreshRaceRanking();

    const tags = elements.raceRanking.children.map(row => {
        const name = row.children[2];
        const tag = name.children[0];
        return tag ? tag.textContent : null;
    });
    assert.deepEqual(tags.sort(), [null, null, "connu", "inédit"].sort());
});

test("the race results add the generalization line only when histories are known", () => {
    const { context, api, elements } = load();
    const finisher = (name, circuitStatus, lapFrames) => ({
        name, finished: true, lapFrames, dead: true, score: 250, circuitStatus, checkpointIndex: 0
    });
    const crashed = (name, circuitStatus) => ({
        name, finished: false, dead: true, score: 80, circuitStatus, checkpointIndex: 7
    });
    context.raceCars = [
        finisher("a", "unseen", 900), crashed("b", "unseen"), finisher("c", "seen", 800)
    ];
    api.displayRaceResults();
    assert.match(elements.raceResults.textContent, /Généralisation/);
    assert.match(elements.raceResults.textContent, /circuit inédit : 1\/2/);
    assert.match(elements.raceResults.textContent, /circuit déjà vu : 1\/1/);

    context.raceCars = [finisher("x", undefined, 900)];
    api.displayRaceResults();
    assert.doesNotMatch(elements.raceResults.textContent, /Généralisation/);
});

test("the HUD names the circuit actually on screen: the race circuit, or the round circuit", () => {
    const { context, api } = load();
    context.TRACK_PRESET = "medium";
    assert.equal(api.trackLabel(), "intermédiaire");

    context.currentTrackPreset = "technical";
    context.raceMode = true;
    assert.equal(api.trackLabel(), "expert");
    context.raceMode = false;
    assert.equal(api.trackLabel(), "intermédiaire");

    context.MULTI_TRACK_TRAINING = true;
    assert.equal(api.trackLabel(), "expert");
    assert.equal(api.trackLabel("custom"), "dessiné");
});

test("archived brains remember the circuits they were trained on", () => {
    const saved = [];
    const context = createContext({
        brainStorage: { save: entry => { saved.push(entry); return saved.slice(); } },
        renderBrainList: () => {},
        setStatus: () => {}
    });
    loadScripts(context, ["globals.js", "Genetic.js"], ["archiveTopBrains"]);
    context.brainStorage = { save: entry => { saved.push(entry); return saved.slice(); } };
    const car = { score: 120, fitness: 150, finished: false, brain: { toJSON: () => ({}) } };

    context.TRACK_PRESET = "medium";
    context.archiveTopBrains([car], 1);
    assert.deepEqual(Array.from(saved.at(-1).trainedOn), ["medium"]);
    assert.equal(saved.at(-1).trackPreset, "medium");

    context.MULTI_TRACK_TRAINING = true;
    context.MULTI_TRACK_SET = ["easy", "technical"];
    context.archiveTopBrains([car], 1);
    assert.deepEqual(Array.from(saved.at(-1).trainedOn), ["easy", "technical"]);
    assert.equal(saved.at(-1).trackPreset, "multi");
});
