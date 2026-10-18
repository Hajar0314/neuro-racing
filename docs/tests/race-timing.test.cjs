const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts, TestVector } = require("./helpers.cjs");

function fakeElement() {
    return {
        children: [],
        className: "",
        textContent: "",
        style: {},
        append(...nodes) { this.children.push(...nodes); },
        appendChild(node) { this.children.push(node); return node; },
        replaceChildren(...nodes) { this.children = nodes; }
    };
}

function createRace() {
    const context = createContext();
    const elements = {};
    context.document = {
        getElementById: id => (elements[id] = elements[id] || fakeElement()),
        createElement: () => fakeElement()
    };
    loadScripts(context, ["globals.js", "main.js"], [
        "formatRaceTime",
        "rankRaceCars",
        "getRaceLeader",
        "simulateRaceFrame",
        "refreshRaceRanking",
        "displayRaceResults"
    ]);
    context.walls = [];
    context.checkpoints = [];
    context.updateTrackProgress = () => {};
    context.checkCollisions = () => {};
    context.distanceToNextCheckpoint = car => car.distance || 0;
    return { context, elements };
}

// Voiture simulée : vit tant qu'elle n'est pas morte, franchit l'arrivée à l'image `finishAt`
// (ou meurt à l'image `crashAt`), comme Car.update / Car.checkCheckpoints.
function fakeCar(name, { finishAt = Infinity, crashAt = Infinity } = {}) {
    return {
        name, color: "#54b8ff", dead: false, finished: false, lapFrames: null,
        score: 0, frameCount: 0, checkpointIndex: 0, distance: 0,
        think() {},
        update() { if (!this.dead) this.frameCount++; },
        checkCheckpoints() {
            if (this.frameCount === finishAt) {
                this.finished = true;
                this.lapFrames = this.frameCount;
                this.score = 250;
                this.dead = true;
            } else if (this.frameCount === crashAt) {
                this.dead = true;
            }
        }
    };
}

function rowText(row) {
    const [rank, , name, time] = row.children;
    return `${rank.textContent} ${name.textContent} ${time.textContent}${time.children.map(c => c.textContent).join("")}`;
}

test("race times are shown to the hundredth of a second at 60 frames per second", () => {
    const { context } = createRace();
    assert.equal(context.formatRaceTime(0), "0:00.00");
    assert.equal(context.formatRaceTime(83), "0:01.38");
    assert.equal(context.formatRaceTime(4530), "1:15.50");
    for (const bad of [null, undefined, NaN, -1]) assert.equal(context.formatRaceTime(bad), "—");
});

test("a car records its lap time (in simulated frames) when it crosses the finish line", () => {
    const context = createContext();
    loadScripts(context, ["Vehicle.js", "utils.js", "Car.js"], ["Car"]);
    const point = (x, y) => new TestVector(x, y);
    const checkpoints = [
        { a: point(0, 0), b: point(0, 10) },
        { a: point(500, 0), b: point(500, 10) }
    ];
    const car = Object.create(context.__testApi.Car.prototype);
    Object.assign(car, {
        dead: false, finished: false, lapFrames: null, score: 0, laps: 0, frameCount: 1234,
        vel: point(0, 0), pos: point(500, 5), checkpointIndex: 1, wrongWayCount: 0,
        framesSinceLastCheckpoint: 0
    });

    car.checkCheckpoints(checkpoints);

    assert.equal(car.finished, true);
    assert.equal(car.lapFrames, 1234);

    const early = Object.create(context.__testApi.Car.prototype);
    Object.assign(early, {
        dead: false, finished: false, lapFrames: null, score: 0, laps: 0, frameCount: 300,
        vel: point(0, 0), pos: point(0, 5), checkpointIndex: 0, wrongWayCount: 0,
        framesSinceLastCheckpoint: 0
    });
    early.checkCheckpoints(checkpoints);
    assert.equal(early.checkpointIndex, 1);
    assert.equal(early.finished, false);
    assert.equal(early.lapFrames, null);
});

test("ranking puts finishers first by lap time, then the others by score and proximity", () => {
    const { context } = createRace();
    const slow = { name: "lent", finished: true, lapFrames: 1500, score: 250 };
    const fast = { name: "rapide", finished: true, lapFrames: 1200, score: 250 };
    const farButScoring = { name: "loin", finished: false, dead: true, score: 900, distance: 50 };
    const near = { name: "proche", finished: false, dead: true, score: 400, distance: 5 };
    const far = { name: "éloigné", finished: false, dead: true, score: 400, distance: 80 };
    const legacy = { name: "sans-temps", finished: true, lapFrames: null, score: 250 };

    const ranked = context.rankRaceCars([far, slow, near, legacy, farButScoring, fast]);

    assert.equal(JSON.stringify(ranked.map(car => car.name)),
        JSON.stringify(["rapide", "lent", "sans-temps", "loin", "proche", "éloigné"]));
});

test("the race leader is the fastest finisher once cars have finished", () => {
    const { context } = createRace();
    context.raceCars = [
        { finished: true, lapFrames: 1500, score: 250, distance: 0 },
        { finished: true, lapFrames: 1100, score: 250, distance: 90 },
        { finished: false, lapFrames: null, score: 900, distance: 1 }
    ];
    assert.equal(context.getRaceLeader(), context.raceCars[1]);
});

test("the stopwatch counts simulated frames only while someone is still racing", () => {
    const { context, elements } = createRace();
    context.raceCars = [fakeCar("A", { finishAt: 5 }), fakeCar("B", { crashAt: 3 })];
    context.raceMode = true;
    context.raceFrames = 0;

    for (let frame = 0; frame < 20; frame++) context.simulateRaceFrame();

    assert.equal(context.raceFrames, 5); // s'arrête quand la dernière voiture est hors course
    assert.equal(context.raceCars[0].lapFrames, 5); // temps de tour = chronomètre à l'arrivée
    assert.equal(elements.raceTimer.textContent, context.formatRaceTime(5));
    assert.match(elements.raceResults.textContent, /1\. A — arrivée en 0:00\.08/);
    assert.match(elements.raceResults.textContent, /2\. B — hors course/);
});

test("the live ranking lists finishers by time with their gap to the winner", () => {
    const { context, elements } = createRace();
    context.raceCars = [
        fakeCar("lent", { finishAt: 9 }),
        fakeCar("rapide", { finishAt: 6 }),
        fakeCar("sorti", { crashAt: 2 }),
        fakeCar("en piste")
    ];
    context.raceMode = true;
    context.raceFrames = 0;

    for (let frame = 0; frame < 12; frame++) context.simulateRaceFrame();

    const rows = elements.raceRanking.children.map(rowText);
    assert.equal(rows[0], "1 rapide 0:00.10");
    assert.equal(rows[1], "2 lent 0:00.15 +0.05");
    assert.match(rows[2], /^3 /);
    assert.equal(rows.length, 4);
});

test("cars with the same lap time share the same rank", () => {
    const { context, elements } = createRace();
    context.raceCars = [
        fakeCar("a", { finishAt: 6 }),
        fakeCar("b", { finishAt: 6 }),
        fakeCar("c", { finishAt: 8 })
    ];
    context.raceMode = true;
    context.raceFrames = 0;

    for (let frame = 0; frame < 10; frame++) context.simulateRaceFrame();

    const ranks = elements.raceRanking.children.map(row => row.children[0].textContent);
    assert.equal(JSON.stringify(ranks), JSON.stringify(["1", "1", "3"]));
});

test("the live ranking is capped and announces the remaining cars", () => {
    const { context, elements } = createRace();
    context.raceCars = Array.from({ length: 11 }, (_, index) => fakeCar(`v${index}`));
    context.refreshRaceRanking();

    const rows = elements.raceRanking.children;
    assert.equal(rows.length, 9);
    assert.match(rows[8].textContent, /\+ 3 autre\(s\) voiture\(s\)/);
});

test("the ranking is not rebuilt on every frame once the race is over", () => {
    const { context, elements } = createRace();
    context.raceCars = [fakeCar("A", { finishAt: 6 })]; // 6 = multiple du pas de rafraîchissement
    context.raceMode = true;
    context.raceFrames = 0;
    for (let frame = 0; frame < 8; frame++) context.simulateRaceFrame();

    let rebuilds = 0;
    const list = elements.raceRanking;
    const original = list.replaceChildren.bind(list);
    list.replaceChildren = (...nodes) => { rebuilds++; original(...nodes); };
    for (let frame = 0; frame < 30; frame++) context.simulateRaceFrame();

    assert.equal(rebuilds, 0);
});
