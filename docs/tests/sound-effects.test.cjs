const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts, TestVector } = require("./helpers.cjs");

// ---- Faux Web Audio ---------------------------------------------------------------------------

class FakeParam {
    constructor(value = 0) { this.value = value; this.calls = []; }
    setValueAtTime(v, t) { this.calls.push(["set", v, t]); this.value = v; }
    setTargetAtTime(v, t, k) { this.calls.push(["target", v, t, k]); this.value = v; }
    exponentialRampToValueAtTime(v, t) { this.calls.push(["ramp", v, t]); }
}

class FakeNode {
    constructor(kind, ctx) {
        this.kind = kind; this.ctx = ctx; this.connections = []; this.disconnected = false;
        this.started = false; this.stopAt = null; this.onended = null;
        this.gain = new FakeParam(1); this.frequency = new FakeParam(440); this.Q = new FakeParam(1);
    }
    connect(node) { this.connections.push(node); return node; }
    disconnect() { this.disconnected = true; }
    start() { this.started = true; }
    stop(at) { this.stopAt = at; }
}

function createFakeAudio() {
    const created = [];
    class FakeAudioContext {
        constructor() {
            FakeAudioContext.instances.push(this);
            this.state = "suspended"; this.currentTime = 0; this.sampleRate = 8000;
            this.destination = new FakeNode("destination", this);
            this.resumeCalls = 0; this.suspendCalls = 0; this.closeCalls = 0;
        }
        node(kind) { const n = new FakeNode(kind, this); created.push(n); return n; }
        createGain() { return this.node("gain"); }
        createOscillator() { return this.node("oscillator"); }
        createBiquadFilter() { return this.node("filter"); }
        createBufferSource() { return this.node("buffer"); }
        createBuffer(channels, length) { const data = new Float32Array(length); return { getChannelData: () => data, length }; }
        resume() { this.resumeCalls++; this.state = "running"; }
        suspend() { this.suspendCalls++; this.state = "suspended"; }
        close() { this.closeCalls++; this.state = "closed"; }
    }
    FakeAudioContext.instances = [];
    return { FakeAudioContext, created };
}

function memoryStorage(initial = {}) {
    const data = { ...initial };
    return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

function load(extra = {}) {
    const context = createContext(extra);
    const api = loadScripts(context, ["Sound.js"], ["SoundEngine", "sanitizeSoundPrefs", "loadSoundPrefs", "saveSoundPrefs", "SOUND_PREFS_KEY", "SOUND_MAX_VOICES"]);
    return api;
}

function readyEngine(options = {}) {
    const api = load();
    const audio = createFakeAudio();
    const engine = new api.SoundEngine({ AudioContextClass: audio.FakeAudioContext, ...options });
    assert.equal(engine.unlock(), true);
    audio.FakeAudioContext.instances[0].state = "running";
    return { api, audio, engine, ctx: audio.FakeAudioContext.instances[0] };
}

const sources = audio => audio.created.filter(n => n.kind === "oscillator" || n.kind === "buffer");

// ---- Préférences ------------------------------------------------------------------------------

test("sound preferences are sanitized, restored and saved", () => {
    const api = load();
    assert.deepEqual({ ...api.sanitizeSoundPrefs(null) }, { enabled: true, volume: 0.5, effects: true });
    assert.deepEqual({ ...api.sanitizeSoundPrefs({ enabled: false, volume: 3, effects: false }) }, { enabled: false, volume: 1, effects: false });
    assert.equal(api.sanitizeSoundPrefs({ volume: -2 }).volume, 0);
    assert.equal(api.sanitizeSoundPrefs({ volume: "fort", enabled: "oui" }).volume, 0.5);
    assert.equal(api.sanitizeSoundPrefs({ enabled: "oui" }).enabled, true);

    const storage = memoryStorage({ [api.SOUND_PREFS_KEY]: JSON.stringify({ enabled: false, volume: 0.2 }) });
    const engine = new api.SoundEngine({ AudioContextClass: null, storage });
    assert.equal(engine.enabled, false);
    assert.equal(engine.volume, 0.2);
    engine.setVolume(0.8);
    assert.equal(JSON.parse(storage.data[api.SOUND_PREFS_KEY]).volume, 0.8);
});

test("corrupted or refused storage falls back to defaults without throwing", () => {
    const api = load();
    const broken = memoryStorage({ [api.SOUND_PREFS_KEY]: "{pas du json" });
    assert.equal(api.loadSoundPrefs(broken).volume, 0.5);
    const refusing = { getItem() { throw new Error("refusé"); }, setItem() { throw new Error("refusé"); } };
    assert.equal(api.loadSoundPrefs(refusing).enabled, true);
    assert.equal(api.saveSoundPrefs(refusing, {}), false);
});

// ---- Déverrouillage ---------------------------------------------------------------------------

test("nothing is created or played before the first user gesture", () => {
    const api = load();
    const audio = createFakeAudio();
    const engine = new api.SoundEngine({ AudioContextClass: audio.FakeAudioContext });
    engine.playCrash(1, true);
    engine.playFinish();
    engine.updateEngine(0.5, true);
    assert.equal(audio.FakeAudioContext.instances.length, 0);
    assert.equal(engine.ready, false);
});

test("unlock creates one context, resumes it and is idempotent", () => {
    const api = load();
    const audio = createFakeAudio();
    const engine = new api.SoundEngine({ AudioContextClass: audio.FakeAudioContext });
    engine.unlock();
    engine.unlock();
    assert.equal(audio.FakeAudioContext.instances.length, 1);
    assert.ok(audio.FakeAudioContext.instances[0].resumeCalls >= 1);
});

test("unlock does nothing when sound is disabled or unsupported, and survives a failing constructor", () => {
    const api = load();
    const audio = createFakeAudio();
    const disabled = new api.SoundEngine({ AudioContextClass: audio.FakeAudioContext, storage: memoryStorage({ [api.SOUND_PREFS_KEY]: JSON.stringify({ enabled: false }) }) });
    assert.equal(disabled.unlock(), false);
    assert.equal(audio.FakeAudioContext.instances.length, 0);

    const unsupported = new api.SoundEngine({ AudioContextClass: null });
    assert.equal(unsupported.supported, false);
    assert.equal(unsupported.unlock(), false);

    const failing = new api.SoundEngine({ AudioContextClass: class { constructor() { throw new Error("pas d'audio"); } } });
    assert.equal(failing.unlock(), false);
    assert.equal(failing.supported, false);
    assert.doesNotThrow(() => failing.playCrash(1, true));
});

// ---- Sons ponctuels ---------------------------------------------------------------------------

test("a crash plays noise and a thump; a non-leader crash is quieter", () => {
    const loud = readyEngine();
    loud.engine.playCrash(1, true);
    const quiet = readyEngine();
    quiet.engine.playCrash(1, false);
    assert.ok(sources(loud.audio).some(n => n.kind === "buffer") && sources(loud.audio).some(n => n.kind === "oscillator"));
    assert.ok(sources(loud.audio).length > sources(quiet.audio).length, "the leader crash adds a layer");
    const peak = audio => Math.max(...audio.created.filter(n => n.kind === "gain").flatMap(g => g.gain.calls.filter(c => c[0] === "ramp").map(c => c[1])));
    assert.ok(peak(loud.audio) > peak(quiet.audio));
});

test("repeated sounds are throttled, then allowed again after the gap", () => {
    const { engine, audio, ctx } = readyEngine();
    engine.playCrash(1, true);
    const first = sources(audio).length;
    engine.playCrash(1, true);
    assert.equal(sources(audio).length, first, "same instant: ignored");
    ctx.currentTime += 0.2;
    engine.playCrash(1, true);
    assert.ok(sources(audio).length > first);
});

test("the number of simultaneous voices is capped and freed when sounds end", () => {
    const { api, engine, audio } = readyEngine();
    for (let i = 0; i < 40; i++) engine.tone({ freq: 400 + i, dur: 0.2 });
    assert.equal(engine.voices, api.SOUND_MAX_VOICES);
    const started = audio.created.filter(n => n.kind === "oscillator" && n.started);
    assert.equal(started.length, api.SOUND_MAX_VOICES);
    started[0].onended();
    assert.equal(engine.voices, api.SOUND_MAX_VOICES - 1);
    assert.equal(started[0].disconnected, true);
});

test("fanfare, finish, generation, race start, checkpoint, skid and click all produce sound", () => {
    for (const method of ["playFanfare", "playFinish", "playGeneration", "playRaceStart", "playCheckpoint", "playSkid", "playClick"]) {
        const { engine, audio } = readyEngine();
        engine[method](0.8);
        assert.ok(sources(audio).length > 0, method);
    }
});

test("notes are scheduled in the future and always stop", () => {
    const { engine, audio, ctx } = readyEngine();
    ctx.currentTime = 10;
    engine.playFinish();
    const oscillators = audio.created.filter(n => n.kind === "oscillator");
    assert.equal(oscillators.length, 4);
    for (const osc of oscillators) assert.ok(osc.stopAt > 10);
    assert.ok(oscillators[0].stopAt < oscillators[3].stopAt, "arpeggio");
});

// ---- Volume, coupure, moteur ------------------------------------------------------------------

test("volume is clamped and applied to the master gain", () => {
    const { engine } = readyEngine();
    engine.setVolume(5);
    assert.equal(engine.volume, 1);
    engine.setVolume(-1);
    assert.equal(engine.volume, 0);
    engine.setVolume("abc");
    assert.equal(engine.volume, 0, "invalid input keeps the previous value");
    engine.setVolume(0.3);
    assert.equal(engine.master.gain.value, 0.3);
});

test("a volume of zero is silent: no source is created", () => {
    const { engine, audio } = readyEngine();
    engine.setVolume(0);
    engine.playCrash(1, true);
    engine.updateEngine(1, true);
    assert.equal(sources(audio).length, 0);
});

test("the engine starts once, follows the speed and stops with every node released", () => {
    const { engine, audio, ctx } = readyEngine();
    engine.updateEngine(0.1, true);
    engine.updateEngine(0.2, true);
    assert.equal(audio.created.filter(n => n.kind === "oscillator").length, 2, "one engine = two oscillators");
    const slow = engine.engine.low.frequency.value;
    engine.updateEngine(1, true);
    assert.ok(engine.engine.low.frequency.value > slow, "pitch rises with speed");
    assert.ok(engine.engine.filter.frequency.value > 500);

    const { low, high, filter, gain } = engine.engine;
    engine.updateEngine(0.5, false);
    assert.equal(engine.engine, null);
    assert.ok(low.stopAt >= ctx.currentTime && high.stopAt >= ctx.currentTime);
    low.onended();
    for (const node of [low, high, filter, gain]) assert.equal(node.disconnected, true);
});

test("engine speed ratio is clamped and tolerates invalid values", () => {
    const { engine } = readyEngine();
    engine.updateEngine(50, true);
    const max = engine.engine.low.frequency.value;
    engine.updateEngine(NaN, true);
    assert.ok(engine.engine.low.frequency.value < max);
    engine.updateEngine(-3, true);
    assert.equal(engine.engine.low.frequency.value, 55);
});

test("disabling sound cuts the whole mix and enabling restores it", () => {
    const { engine, audio, ctx } = readyEngine();
    engine.updateEngine(0.5, true);
    engine.setEnabled(false);
    assert.equal(engine.engine, null);
    assert.equal(engine.master.gain.value, 0);
    const before = sources(audio).length;
    engine.playCrash(1, true);
    engine.updateEngine(0.5, true);
    assert.equal(sources(audio).length, before, "silent while disabled");
    ctx.currentTime += 1;
    engine.setEnabled(true);
    assert.equal(engine.master.gain.value, engine.volume);
    engine.playCrash(1, true);
    assert.ok(sources(audio).length > before);
});

test("suspend, resume and dispose manage the audio context", () => {
    const { engine, ctx } = readyEngine();
    engine.updateEngine(0.5, true);
    engine.suspend();
    assert.equal(ctx.suspendCalls, 1);
    engine.resume();
    assert.ok(ctx.resumeCalls >= 2);
    engine.dispose();
    assert.equal(ctx.closeCalls, 1);
    assert.equal(engine.ready, false);
    assert.equal(engine.engine, null);
    assert.doesNotThrow(() => { engine.playCrash(1, true); engine.updateEngine(1, true); engine.dispose(); });
});

test("the sound engine never draws from the seeded random generator", () => {
    const noRandom = Object.assign(Object.create(Math), { random() { throw new Error("Math.random utilisé"); } });
    const api = load({ Math: noRandom });
    const audio = createFakeAudio();
    const engine = new api.SoundEngine({ AudioContextClass: audio.FakeAudioContext });
    engine.unlock();
    audio.FakeAudioContext.instances[0].state = "running";
    assert.doesNotThrow(() => { engine.playCrash(1, true); engine.playFanfare(); engine.updateEngine(0.5, true); });
});

// ---- Effets visuels ---------------------------------------------------------------------------

function loadEffects(extra = {}) {
    const context = createContext(extra);
    const api = loadScripts(context, ["Effects.js"], ["EffectsSystem", "EFFECTS_MAX_PARTICLES"]);
    return { api, context };
}

test("a crash spawns ring, sparks, debris and smoke that expire", () => {
    const { api } = loadEffects();
    const fx = new api.EffectsSystem();
    fx.crash(100, 100, 1, "#ff0000");
    const kinds = new Set(fx.particles.map(p => p.kind));
    for (const kind of ["ring", "spark", "debris", "smoke"]) assert.ok(kinds.has(kind), kind);
    assert.ok(fx.count > 15);
    for (let i = 0; i < 200; i++) fx.update();
    assert.equal(fx.count, 0);
});

test("a stronger crash makes more sparks", () => {
    const { api } = loadEffects();
    const weak = new api.EffectsSystem();
    const strong = new api.EffectsSystem();
    weak.crash(0, 0, 0.1);
    strong.crash(0, 0, 1);
    const sparks = fx => fx.particles.filter(p => p.kind === "spark").length;
    assert.ok(sparks(strong) > sparks(weak));
});

test("particles move, slow down and fall according to their physics", () => {
    const { api } = loadEffects();
    const fx = new api.EffectsSystem();
    fx.add({ kind: "spark", x: 0, y: 0, vx: 4, vy: 0, friction: 0.5, life: 5 });
    fx.add({ kind: "confetti", x: 0, y: 0, vx: 0, vy: 0, gravity: 1, life: 5 });
    fx.update();
    const [spark, confetti] = fx.particles;
    assert.equal(spark.x, 4);
    assert.equal(spark.vx, 2);
    assert.ok(confetti.vy > 0);
    assert.equal(spark.life, 4);
});

test("the particle count is capped, dropping the oldest", () => {
    const { api } = loadEffects();
    const fx = new api.EffectsSystem(50);
    for (let i = 0; i < 80; i++) fx.add({ kind: "puff", x: i, y: 0, life: 100 });
    assert.equal(fx.count, 50);
    assert.equal(fx.particles[0].x, 30);
    fx.confetti(0, 0, 500);
    assert.equal(fx.count, 50);
});

test("disabled effects spawn nothing and clear what exists", () => {
    const { api } = loadEffects();
    const fx = new api.EffectsSystem();
    fx.confetti(0, 0, 10);
    fx.gateFlash({ x: 0, y: 0 }, { x: 5, y: 5 });
    fx.flashScreen();
    fx.setEnabled(false);
    assert.equal(fx.count, 0);
    assert.equal(fx.flashes.length, 0);
    assert.equal(fx.screenFlash, null);
    fx.crash(0, 0, 1);
    fx.tireSmoke(0, 0);
    fx.confetti(0, 0);
    fx.gateFlash({ x: 0, y: 0 }, { x: 5, y: 5 });
    fx.flashScreen();
    assert.equal(fx.count + fx.flashes.length, 0);
    assert.equal(fx.screenFlash, null);
});

test("gate flashes and the screen flash fade out", () => {
    const { api } = loadEffects();
    const fx = new api.EffectsSystem();
    fx.gateFlash({ x: 0, y: 0 }, { x: 10, y: 0 });
    fx.flashScreen([1, 2, 3], 0.5);
    assert.equal(fx.flashes.length, 1);
    for (let i = 0; i < 100; i++) fx.update();
    assert.equal(fx.flashes.length, 0);
    assert.equal(fx.screenFlash, null);
    fx.gateFlash(null, { x: 1, y: 1 });
    assert.equal(fx.flashes.length, 0, "an invalid gate is ignored");
});

test("effects are reproducible and never use the global random generator", () => {
    const noRandom = Object.assign(Object.create(Math), { random() { throw new Error("Math.random utilisé"); } });
    const a = loadEffects({ Math: noRandom }).api;
    const fx1 = new a.EffectsSystem();
    const fx2 = new a.EffectsSystem();
    fx1.crash(10, 20, 0.7, "#fff");
    fx2.crash(10, 20, 0.7, "#fff");
    assert.deepEqual(JSON.parse(JSON.stringify(fx1.particles)), JSON.parse(JSON.stringify(fx2.particles)));
});

test("draw paints every kind of particle without throwing", () => {
    const calls = {};
    const stub = name => (...args) => { calls[name] = (calls[name] || 0) + 1; };
    const names = ["push", "pop", "noStroke", "noFill", "fill", "stroke", "strokeWeight", "strokeCap", "line", "circle", "rect", "translate", "rotate", "rectMode"];
    const extra = { ROUND: "r", CENTER: "c", CORNER: "k", width: 900, height: 600 };
    for (const n of names) extra[n] = stub(n);
    const { api } = loadEffects(extra);
    const fx = new api.EffectsSystem();
    fx.crash(50, 50, 1, "#ff0000");
    fx.tireSmoke(10, 10);
    fx.confetti(20, 20, 5);
    fx.gateFlash({ x: 0, y: 0 }, { x: 9, y: 9 });
    fx.flashScreen();
    assert.doesNotThrow(() => fx.draw());
    assert.ok(calls.line > 2 && calls.circle > 2 && calls.rect > 3);
    assert.equal(calls.push, calls.pop);
    fx.setEnabled(false);
    const before = calls.push;
    fx.draw();
    assert.equal(calls.push, before, "nothing is drawn when disabled");
});

// ---- Branchement dans la simulation (main.js) -------------------------------------------------

function loadMain(extra = {}) {
    const context = createContext({ CLOSE: "x", ...extra });
    const api = loadScripts(context, ["globals.js", "utils.js", "main.js"],
        ["emitGameEvent", "handleCarDeath", "updateEffectsAndSound", "checkCollisions"]);
    const log = [];
    context.soundEngine = new Proxy({}, { get: (_, name) => (...args) => { log.push(["sound", name, ...args]); } });
    context.effects = new Proxy({}, { get: (_, name) => (...args) => { log.push(["fx", name, ...args]); } });
    return { context, api, log };
}

function fakeCar(overrides = {}) {
    return { pos: new TestVector(50, 60), vel: new TestVector(3, 0), maxSpeed: 6, color: "#34a7ff", dead: false, ...overrides };
}

const names = log => log.map(entry => `${entry[0]}:${entry[1]}`);

test("a crash triggers sparks and a sound scaled by the speed ratio", () => {
    const { api, log } = loadMain();
    api.emitGameEvent("crash", { car: fakeCar() });
    assert.deepEqual(names(log), ["fx:crash", "sound:playCrash"]);
    assert.equal(log[0][4], 0.5);
    assert.equal(log[1][2], 0.5);
});

test("a finish triggers confetti and the finish chime; success triggers the fanfare", () => {
    const { api, log } = loadMain();
    api.emitGameEvent("finish", { car: fakeCar() });
    api.emitGameEvent("success");
    assert.deepEqual(names(log), ["fx:confetti", "sound:playFinish", "fx:confetti", "fx:flashScreen", "sound:playFanfare"]);
});

test("race start and new generation have their own sounds", () => {
    const { api, log } = loadMain();
    api.emitGameEvent("raceStart");
    api.emitGameEvent("generation");
    assert.deepEqual(names(log), ["sound:playRaceStart", "sound:playGeneration"]);
});

test("fast-forward training is silent and only the leader crash shows sparks", () => {
    const { context, api, log } = loadMain();
    context.TRAINING_STEPS_PER_FRAME = 5;
    api.emitGameEvent("crash", { car: fakeCar() });
    api.emitGameEvent("generation");
    assert.deepEqual(log, []);
    // En course, la vitesse d'entraînement ne compte pas.
    context.raceMode = true;
    api.emitGameEvent("crash", { car: fakeCar() });
    assert.deepEqual(names(log), ["fx:crash", "sound:playCrash"]);
});

test("events are harmless when sound and effects do not exist", () => {
    const { context, api } = loadMain();
    context.soundEngine = null;
    context.effects = null;
    assert.doesNotThrow(() => {
        for (const type of ["crash", "finish", "success", "generation", "raceStart"]) {
            api.emitGameEvent(type, { car: fakeCar() });
        }
        api.updateEffectsAndSound(fakeCar());
    });
});

test("only deaths by collision or leaving the canvas trigger a crash; stalls stay quiet", () => {
    const { context, api, log } = loadMain();
    api.handleCarDeath(fakeCar({ dead: true, crashed: true }));
    assert.deepEqual(names(log), ["fx:crash", "sound:playCrash"]);
    log.length = 0;
    api.handleCarDeath(fakeCar({ dead: true }));
    assert.deepEqual(log, []);
    api.handleCarDeath(fakeCar({ dead: true, finished: true, crashed: true }));
    assert.deepEqual(names(log), ["fx:confetti", "sound:playFinish"]);

    context.walls = [{ a: new TestVector(53, 0), b: new TestVector(53, 200) }];
    const hit = fakeCar({ lastStepPos: new TestVector(50, 60), height: 20, width: 10 });
    api.checkCollisions(hit);
    assert.equal(hit.dead, true);
    assert.equal(hit.crashed, true);

    context.walls = [];
    context.width = 100; context.height = 100;
    const out = fakeCar({ pos: new TestVector(150, 50) });
    api.checkCollisions(out);
    assert.equal(out.crashed, true);
});

function leader(overrides = {}) {
    return fakeCar({ checkpointIndex: 0, ...overrides });
}

test("the engine follows the leader only while the simulation runs", () => {
    const { context, api, log } = loadMain();
    context.trainingActive = true;
    api.updateEffectsAndSound(leader());
    const engineCall = log.find(entry => entry[1] === "updateEngine");
    assert.deepEqual([engineCall[2], engineCall[3]], [0.5, true]);

    log.length = 0;
    context.trainingActive = false;
    api.updateEffectsAndSound(leader());
    assert.deepEqual(log.find(entry => entry[1] === "updateEngine").slice(2), [0, false]);

    log.length = 0;
    context.trainingActive = true;
    api.updateEffectsAndSound(leader({ dead: true }));
    assert.equal(log.find(entry => entry[1] === "updateEngine")[3], false, "a dead leader is silent");

    log.length = 0;
    context.trackEditorActive = true;
    api.updateEffectsAndSound(leader());
    assert.equal(log.find(entry => entry[1] === "updateEngine")[3], false, "silent in the track editor");
});

test("a sharp turn at speed raises tire smoke and a squeal; a straight line does not", () => {
    const { context, api, log } = loadMain();
    context.trainingActive = true;
    const car = leader();
    api.updateEffectsAndSound(car);          // mémorise le cap initial
    log.length = 0;
    api.updateEffectsAndSound(car);          // ligne droite
    assert.ok(!names(log).includes("fx:tireSmoke"));

    car.vel = new TestVector(Math.cos(0.3) * 4, Math.sin(0.3) * 4); // 0,3 rad d'un coup
    log.length = 0;
    api.updateEffectsAndSound(car);
    assert.ok(names(log).includes("fx:tireSmoke"));
    assert.ok(names(log).includes("sound:playSkid"));

    car.vel = new TestVector(Math.cos(0.6) * 0.5, Math.sin(0.6) * 0.5); // virage mais trop lent
    log.length = 0;
    api.updateEffectsAndSound(car);
    assert.ok(!names(log).includes("fx:tireSmoke"));
});

test("passing a checkpoint flashes the gate that was just validated", () => {
    const { context, api, log } = loadMain();
    context.trainingActive = true;
    context.checkpoints = [0, 1, 2].map(i => ({ a: new TestVector(i, 0), b: new TestVector(i, 10) }));
    const car = leader({ checkpointIndex: 1 });
    api.updateEffectsAndSound(car);
    log.length = 0;
    car.checkpointIndex = 2;
    api.updateEffectsAndSound(car);
    const flash = log.find(entry => entry[1] === "gateFlash");
    assert.equal(flash[2].x, 1, "checkpoint 1 was validated");
    assert.ok(names(log).includes("sound:playCheckpoint"));

    log.length = 0;
    car.checkpointIndex = 0; // retour au début du tour : on éclaire la dernière porte
    api.updateEffectsAndSound(car);
    assert.equal(log.find(entry => entry[1] === "gateFlash")[2].x, 2);
});

test("changing leader does not fake a skid or a checkpoint", () => {
    const { context, api, log } = loadMain();
    context.trainingActive = true;
    context.checkpoints = [0, 1, 2].map(i => ({ a: new TestVector(i, 0), b: new TestVector(i, 10) }));
    api.updateEffectsAndSound(leader({ checkpointIndex: 0 }));
    log.length = 0;
    api.updateEffectsAndSound(leader({ checkpointIndex: 2, vel: new TestVector(0, 3) }));
    assert.ok(!names(log).includes("fx:gateFlash"));
    assert.ok(!names(log).includes("fx:tireSmoke"));
});

test("effects are updated and drawn once per call", () => {
    const { context, api, log } = loadMain();
    context.trainingActive = true;
    api.updateEffectsAndSound(leader());
    const sequence = names(log).filter(n => n === "fx:update" || n === "fx:draw");
    assert.deepEqual(sequence, ["fx:update", "fx:draw"]);
});
