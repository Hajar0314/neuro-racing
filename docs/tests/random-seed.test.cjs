const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { createContext, loadScripts, TestVector } = require("./helpers.cjs");

const MAX_SEED = 4294967295;

// ---------- Générateur (Random.js) ----------

function loadRandom(extra = {}) {
    const context = createContext(extra);
    const api = loadScripts(context, ["Random.js"], [
        "SeededRandom", "parseSeed", "drawRandomSeed", "seedRandom", "clearRandomSeed", "isRandomSeeded",
        "randomUnit", "randomBetween", "randomIndex", "randomGaussianValue", "nextInitSeed"
    ]);
    return { context, api };
}

const randomApi = loadRandom().api; // pour construire des générateurs de référence

// Joue `count` tirages avec la graine donnée et les renvoie (tableau natif, comparable par assert).
function sequence(api, seed, count, draw = () => api.randomUnit()) {
    api.seedRandom(seed);
    return Array.from({ length: count }, draw);
}

test("SeededRandom : mêmes graines, même suite ; graines différentes, suites différentes", () => {
    const { api } = loadRandom();
    const first = new api.SeededRandom(42);
    const second = new api.SeededRandom(42);
    const other = new api.SeededRandom(43);
    const a = Array.from({ length: 20 }, () => first.next());
    const b = Array.from({ length: 20 }, () => second.next());
    const c = Array.from({ length: 20 }, () => other.next());

    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
});

test("SeededRandom : valeurs de référence (une graine enregistrée doit garder son sens)", () => {
    const { api } = loadRandom();
    const generator = new api.SeededRandom(42);
    // mulberry32, graine 42 : si ces valeurs changent, les graines notées par les utilisateurs
    // ne rejoueraient plus leurs expériences.
    assert.equal(generator.next(), 0.6011037519201636);
    assert.equal(generator.next(), 0.44829055899754167);
    assert.equal(generator.next(), 0.8524657934904099);
    assert.equal(new api.SeededRandom(0).next(), 0.26642920868471265);
    assert.equal(new api.SeededRandom(MAX_SEED).next(), 0.8964226141106337);
});

test("SeededRandom : tous les tirages sont dans [0, 1) et bien répartis", () => {
    const { api } = loadRandom();
    const generator = new api.SeededRandom(2026);
    let total = 0;
    for (let i = 0; i < 20000; i++) {
        const value = generator.next();
        assert.ok(value >= 0 && value < 1);
        total += value;
    }
    assert.ok(Math.abs(total / 20000 - 0.5) < 0.01);
});

test("parseSeed n'accepte que les entiers de 0 à 2^32 - 1 et ne corrige rien en silence", () => {
    const { api } = loadRandom();
    assert.equal(api.parseSeed("0"), 0);
    assert.equal(api.parseSeed("42"), 42);
    assert.equal(api.parseSeed("  7  "), 7);
    assert.equal(api.parseSeed("4294967295"), MAX_SEED);
    assert.equal(api.parseSeed(1234), 1234);
    for (const invalid of ["", "   ", "4294967296", "99999999999", "-3", "1.5", "1e3", "12abc", "abc", "0x10",
        1.5, -1, NaN, null, undefined, {}, []]) {
        assert.equal(api.parseSeed(invalid), null, `« ${String(invalid)} » doit être refusé`);
    }
});

test("drawRandomSeed donne un entier valide, y compris aux bornes de la source", () => {
    const { api } = loadRandom();
    assert.equal(api.drawRandomSeed(() => 0), 0);
    assert.equal(api.drawRandomSeed(() => 0.5), 2147483648);
    assert.equal(api.drawRandomSeed(() => 0.9999999999999999), MAX_SEED);
    const seed = api.drawRandomSeed();
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= MAX_SEED);
});

test("seedRandom renvoie la graine retenue et refuse une graine invalide sans changer l'état", () => {
    const { api } = loadRandom();
    assert.equal(api.isRandomSeeded(), false);
    assert.equal(api.seedRandom("123"), 123);
    assert.equal(api.isRandomSeeded(), true);
    const expected = new api.SeededRandom(123).next();

    assert.throws(() => api.seedRandom("abc"), /Graine invalide/);
    assert.throws(() => api.seedRandom(-1), /Graine invalide/);
    assert.throws(() => api.seedRandom(null), /Graine invalide/);
    assert.equal(api.randomUnit(), expected); // la graine 123 est toujours active
});

test("sans graine, les tirages délèguent au hasard injecté (comportement historique)", () => {
    const calls = [];
    const { api } = loadRandom({
        random: (...args) => { calls.push(["random", ...args]); return 2.5; },
        randomGaussian: (...args) => { calls.push(["gauss", ...args]); return 0.25; }
    });
    const scripted = Object.create(Math);
    scripted.random = () => 0.125;
    const withMath = loadRandom({ Math: scripted });

    assert.equal(withMath.api.randomUnit(), 0.125);
    assert.equal(api.randomBetween(-3, 3), 2.5);
    assert.equal(api.randomIndex(7), 2);
    assert.equal(api.randomGaussianValue(0, 0.1), 0.25);
    assert.equal(api.nextInitSeed(), null);
    assert.equal(JSON.stringify(calls), JSON.stringify([["random", -3, 3], ["random", 7], ["gauss", 0, 0.1]]));
});

test("clearRandomSeed rend le hasard du navigateur", () => {
    const { api } = loadRandom({ random: () => 1.9 });
    api.seedRandom(5);
    api.clearRandomSeed();
    assert.equal(api.isRandomSeeded(), false);
    assert.equal(api.randomIndex(10), 1);
});

test("avec une graine, randomBetween et randomIndex restent dans leurs bornes et se rejouent", () => {
    const { api } = loadRandom();
    const between = sequence(api, 9, 500, () => api.randomBetween(-3, 3));
    assert.ok(between.every(value => value >= -3 && value < 3));
    assert.deepEqual(between, sequence(api, 9, 500, () => api.randomBetween(-3, 3)));

    const indexes = sequence(api, 9, 500, () => api.randomIndex(5));
    assert.ok(indexes.every(index => Number.isInteger(index) && index >= 0 && index <= 4));
    assert.equal(new Set(indexes).size, 5); // tous les indices sortent
    assert.ok(sequence(api, 9, 50, () => api.randomIndex(1)).every(index => index === 0));
});

test("randomGaussianValue suit la loi demandée, reste fini et se rejoue", () => {
    const { api } = loadRandom();
    const values = sequence(api, 77, 20000, () => api.randomGaussianValue(5, 2));
    assert.ok(values.every(Number.isFinite));
    const mean = values.reduce((total, value) => total + value, 0) / values.length;
    const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
    assert.ok(Math.abs(mean - 5) < 0.08, `moyenne ${mean}`);
    assert.ok(Math.abs(Math.sqrt(variance) - 2) < 0.08, `écart-type ${Math.sqrt(variance)}`);
    assert.deepEqual(values.slice(0, 50), sequence(api, 77, 50, () => api.randomGaussianValue(5, 2)));

    // Aux extrêmes du tirage uniforme (0 et presque 1) : jamais de log(0), toujours un nombre fini.
    for (const extreme of [0, 0.9999999999999999]) {
        const edge = loadRandom();
        edge.api.seedRandom(1);
        edge.context.seededGenerator = { next: () => extreme };
        assert.ok(Number.isFinite(edge.api.randomGaussianValue()), `tirage ${extreme}`);
    }
});

test("nextInitSeed tire des entiers 32 bits dans le flux de la graine", () => {
    const { api } = loadRandom();
    const seeds = sequence(api, 3, 100, () => api.nextInitSeed());
    assert.ok(seeds.every(seed => Number.isInteger(seed) && seed >= 0 && seed <= MAX_SEED));
    assert.deepEqual(seeds, sequence(api, 3, 100, () => api.nextInitSeed()));
    assert.ok(new Set(seeds).size > 95);
});

// ---------- Réseau de neurones et génétique, avec un faux TensorFlow.js ----------

class FakeTensor {
    constructor(values, shape) { this.values = Array.from(values); this.shape = [...shape]; }
    dataSync() { return this.values; }
    clone() { return new FakeTensor(this.values, this.shape); }
    dispose() {}
}

// Les poids initiaux d'une couche dépendent de la graine de son initialiseur ; sans initialiseur
// à graine, ils viennent de Math.random : un tirage non reproductible se verrait immédiatement.
class FakeSequential {
    constructor(log) { this.log = log; this.weights = []; this.outputNodes = 0; }
    add(layer) {
        const inputNodes = layer.inputShape ? layer.inputShape[0] : this.outputNodes;
        const seed = layer.kernelInitializer ? layer.kernelInitializer.seed : Math.random() * 1000;
        this.log.push(layer.kernelInitializer ? layer.kernelInitializer.seed : null);
        const kernel = Array.from({ length: inputNodes * layer.units }, (_, i) => ((seed + i * 7) % 997) / 997);
        this.weights.push(new FakeTensor(kernel, [inputNodes, layer.units]));
        this.weights.push(new FakeTensor(Array(layer.units).fill(0), [layer.units]));
        this.outputNodes = layer.units;
    }
    getWeights() { return this.weights; }
    setWeights(weights) { this.weights = weights.map(weight => weight.clone()); }
    dispose() {}
}

function loadEvolution() {
    const initLog = [];
    const context = createContext({
        tf: {
            sequential: () => new FakeSequential(initLog),
            layers: { dense: configuration => configuration },
            initializers: { glorotUniform: ({ seed }) => ({ seed }) },
            tidy: callback => callback(),
            tensor: (values, shape) => new FakeTensor(values, shape)
        }
    });
    const api = loadScripts(context, ["globals.js", "NeuralNetwork.js", "Genetic.js"], [
        "NeuralNetwork", "buildNextPopulation", "seedRandom", "nextInitSeed", "randomUnit"
    ]);

    // Fausse voiture : un vrai réseau, le même tirage du départ que la vraie Car.
    class EvolutionCar {
        constructor(configuration = {}) {
            const options = configuration instanceof api.NeuralNetwork ? { brain: configuration } : configuration;
            this.startPos = options.position
                ? options.position.copy()
                : new TestVector(context.startX + context.randomBetween(-3, 3), context.startY + context.randomBetween(-3, 3));
            this.brain = options.brain
                ? options.brain.copy()
                : new api.NeuralNetwork(context.NB_ASSETS, 4, 2, "sigmoid");
        }
        mutate(rate) { this.brain.mutate(rate); }
        setPhysics() {}
        dispose() { this.brain.dispose(); }
    }
    context.Car = EvolutionCar;
    context.HIDDEN_NODES = 4;
    context.TOTAL_POP = 8;
    return { context, api, initLog, EvolutionCar };
}

function signature(car) {
    return JSON.stringify({ start: [car.startPos.x, car.startPos.y], brain: car.brain.toJSON() });
}

// Une expérience : population initiale + `generations` générations (fitness = somme des poids).
function runExperiment(seed, generations = 4) {
    const { context, api, EvolutionCar } = loadEvolution();
    api.seedRandom(seed);
    let population = Array.from({ length: context.TOTAL_POP }, () => new EvolutionCar());
    for (let generation = 0; generation < generations; generation++) {
        for (const car of population) {
            car.fitness = car.brain.toJSON().weights.flatMap(weight => weight.values).reduce((a, b) => a + b, 0);
        }
        population = api.buildNextPopulation(population);
    }
    return Array.from(population, signature); // tableau natif : comparable par assert (autre realm vm)
}

test("réseau : avec une graine, les couches reçoivent des initialiseurs à graine tirés du flux", () => {
    const { api, initLog } = loadEvolution();
    api.seedRandom(11);
    new api.NeuralNetwork(6, 4, 2, "sigmoid");
    const expected = new randomApi.SeededRandom(11);
    const hiddenSeed = Math.floor(expected.next() * (MAX_SEED + 1));
    const outputSeed = Math.floor(expected.next() * (MAX_SEED + 1));

    assert.equal(JSON.stringify(initLog), JSON.stringify([hiddenSeed, outputSeed]));
});

test("réseau : même graine → mêmes poids initiaux ; autre graine → autres poids", () => {
    const build = seed => {
        const { api } = loadEvolution();
        api.seedRandom(seed);
        return JSON.stringify(new api.NeuralNetwork(6, 4, 2, "sigmoid").toJSON());
    };
    assert.equal(build(5), build(5));
    assert.notEqual(build(5), build(6));
});

test("réseau : copy() et fromJSON() ne consomment pas le flux aléatoire", () => {
    const { api } = loadEvolution();
    api.seedRandom(21);
    const network = new api.NeuralNetwork(6, 4, 2, "sigmoid");
    const saved = network.toJSON();

    const reference = loadEvolution();
    reference.api.seedRandom(21);
    new reference.api.NeuralNetwork(6, 4, 2, "sigmoid");
    const expectedNext = reference.api.randomUnit();

    network.copy().dispose();
    api.NeuralNetwork.fromJSON(saved).dispose();
    // Les voitures de course (cerveau importé) ne décalent donc pas la suite de l'entraînement.
    assert.equal(api.randomUnit(), expectedNext);
});

test("réseau : mutation et croisement se rejouent avec la même graine", () => {
    const run = seed => {
        const { api } = loadEvolution();
        api.seedRandom(seed);
        const parentA = new api.NeuralNetwork(6, 4, 2, "sigmoid");
        const parentB = new api.NeuralNetwork(6, 4, 2, "sigmoid");
        const child = api.NeuralNetwork.crossover(parentA, parentB);
        child.mutate(0.5);
        return JSON.stringify(child.toJSON());
    };
    assert.equal(run(31), run(31));
    assert.notEqual(run(31), run(32));
});

test("génétique : le tournoi et le choix du croisement dépendent de la graine, pas du hasard du navigateur", () => {
    const parents = () => ["a", "b", "c", "d", "e", "f"].map((name, index) => ({
        name, fitness: index, score: index, brain: { name }, startPos: new TestVector(0, 0)
    }));
    const lineage = seed => {
        const { context, api } = loadEvolution();
        class RecordingCar {
            constructor(configuration) { this.parent = configuration.brain ? configuration.brain.name : configuration.name; }
            mutate() {}
            setPhysics() {}
        }
        context.Car = RecordingCar;
        context.TOTAL_POP = 12;
        context.ELITE_COUNT = 0;
        context.CROSSOVER_RATE = 0; // seuls les tournois tirent au hasard
        api.seedRandom(seed);
        return api.buildNextPopulation(parents()).map(car => car.parent).join("");
    };
    assert.equal(lineage(1), lineage(1));
    assert.notEqual(lineage(1), lineage(2));
});

test("expérience complète : même graine + mêmes réglages → même évolution, à l'identique", () => {
    assert.deepEqual(runExperiment(2026), runExperiment(2026));
});

test("expérience complète : une autre graine donne une autre évolution", () => {
    assert.notDeepEqual(runExperiment(2026), runExperiment(2027));
});

test("comparaison honnête : même graine, un seul réglage change → même point de départ", () => {
    const start = mutationRate => {
        const { context, api, EvolutionCar } = loadEvolution();
        context.MUTATION_RATE = mutationRate;
        api.seedRandom(2026);
        return Array.from({ length: context.TOTAL_POP }, () => new EvolutionCar()).map(signature);
    };
    // La population initiale ne dépend pas du taux de mutation : seule la suite diffère.
    assert.deepEqual(start(0.05), start(0.4));
});

// ---------- Vraie classe Car : décalage de départ ----------

function loadRealCar() {
    class FakeBrain {
        constructor() { this.input_nodes = 6; this.output_nodes = 2; }
        copy() { return this; }
    }
    const context = createContext({ NeuralNetwork: FakeBrain, Ray: class {} });
    const api = loadScripts(context, ["globals.js", "utils.js", "Vehicle.js", "Car.js", "Random.js"], ["Car", "seedRandom", "randomUnit"]);
    return { context, api, brain: new FakeBrain() };
}

test("Car : le décalage de départ vient du flux à graine et se rejoue", () => {
    const start = seed => {
        const { context, api, brain } = loadRealCar();
        api.seedRandom(seed);
        return Array.from({ length: 5 }, () => {
            const car = new api.Car({ brain });
            return [car.startPos.x - context.startX, car.startPos.y - context.startY];
        });
    };
    const first = start(8);
    assert.deepEqual(first, start(8));
    assert.notDeepEqual(first, start(9));
    for (const [dx, dy] of first) assert.ok(dx >= -3 && dx < 3 && dy >= -3 && dy < 3);
});

test("Car : une position imposée (élite, course, multi-circuits) ne consomme pas de hasard", () => {
    const { context, api, brain } = loadRealCar();
    api.seedRandom(8);
    new api.Car({ brain, position: new TestVector(context.startX, context.startY) });
    assert.equal(api.randomUnit(), new randomApi.SeededRandom(8).next());
});

// ---------- Interface et boucle d'entraînement (main.js) ----------

function loadMain(overrides = {}) {
    const elements = {
        seedInput: { value: "" },
        seedUsed: { textContent: "" },
        ...overrides
    };
    const scripted = Object.create(Math);
    scripted.random = () => 0.25;
    const context = createContext({
        Math: scripted,
        document: { getElementById: id => elements[id] || null }
    });
    const api = loadScripts(context, ["globals.js", "main.js"], [
        "beginExperimentSeed", "applySeedFromInput", "replaySeed", "restartTraining", "updateHud"
    ]);
    const statuses = [];
    const restarts = [];
    context.setStatus = (message, isError = false) => statuses.push({ message, isError });
    context.restartTraining = message => restarts.push(message);
    return { context, api, elements, statuses, restarts };
}

test("beginExperimentSeed : la graine imposée est utilisée telle quelle et pilote tout le hasard", () => {
    const { context, api, elements } = loadMain();
    context.RANDOM_SEED = 1234;

    api.beginExperimentSeed();

    assert.equal(context.activeSeed, 1234);
    assert.equal(context.isRandomSeeded(), true);
    assert.equal(context.randomUnit(), new randomApi.SeededRandom(1234).next());
    assert.match(elements.seedUsed.textContent, /graine 1234 \(imposée\)/);
});

test("beginExperimentSeed : sans graine imposée, une graine est tirée puis affichée pour être rejouée", () => {
    const { context, api, elements } = loadMain();
    context.RANDOM_SEED = null;

    api.beginExperimentSeed();

    assert.equal(context.activeSeed, Math.floor(0.25 * (MAX_SEED + 1)));
    assert.equal(context.RANDOM_SEED, null); // la graine tirée n'est pas figée toute seule
    assert.match(elements.seedUsed.textContent, new RegExp(`graine ${context.activeSeed} \\(tirée au hasard\\)`));
});

test("beginExperimentSeed ne plante pas si l'affichage de la graine n'existe pas", () => {
    const { context, api } = loadMain({ seedUsed: null });
    context.RANDOM_SEED = 5;
    assert.doesNotThrow(() => api.beginExperimentSeed());
    assert.equal(context.activeSeed, 5);
});

test("restartTraining : deux relances avec la même graine donnent les mêmes premières voitures", () => {
    const elements = {
        seedInput: { value: "" }, seedUsed: { textContent: "" }, learningSummary: { textContent: "" }
    };
    const context = createContext({ document: { getElementById: id => elements[id] || null } });
    const api = loadScripts(context, ["globals.js", "main.js"], ["restartTraining"]);
    const draws = [];
    context.Car = class {
        constructor() { draws.push(context.randomUnit()); }
        dispose() {}
    };
    for (const name of ["setStatus", "updateTrainingButton", "archiveTopBrains", "exitBrainRace",
        "drawLearningChart", "updateLearningExportButton", "updateNetworkDiagram"]) {
        context[name] = () => {};
    }
    context.TOTAL_POP = 3;
    context.RANDOM_SEED = 99;
    context.cars = []; context.savedCars = []; context.raceCars = [];

    api.restartTraining("première");
    context.randomUnit(); context.randomUnit(); // la simulation consomme du hasard entre deux relances
    api.restartTraining("seconde");

    assert.equal(draws.length, 6);
    assert.deepEqual(draws.slice(0, 3), draws.slice(3));
    assert.equal(draws[0], new randomApi.SeededRandom(99).next());
    assert.equal(context.activeSeed, 99);
});

test("champ de graine : une valeur valide relance l'expérience avec cette graine", () => {
    const { context, api, elements, restarts } = loadMain();
    elements.seedInput.value = " 2026 ";

    api.applySeedFromInput();

    assert.equal(context.RANDOM_SEED, 2026);
    assert.equal(elements.seedInput.value, "2026");
    assert.equal(restarts.length, 1);
    assert.match(restarts[0], /Graine 2026/);
});

test("champ de graine : vide = automatique, et relance une expérience tirée au hasard", () => {
    const { context, api, elements, restarts } = loadMain();
    context.RANDOM_SEED = 55;
    elements.seedInput.value = "";

    api.applySeedFromInput();

    assert.equal(context.RANDOM_SEED, null);
    assert.equal(restarts.length, 1);
    assert.match(restarts[0], /automatique/);
});

test("champ de graine : une valeur invalide est refusée, signalée, et ne relance rien", () => {
    for (const invalid of ["abc", "-4", "3.7", "99999999999", "12 34"]) {
        const { context, api, elements, statuses, restarts } = loadMain();
        context.RANDOM_SEED = 55;
        elements.seedInput.value = invalid;

        api.applySeedFromInput();

        assert.equal(context.RANDOM_SEED, 55, invalid);
        assert.equal(elements.seedInput.value, "55", invalid); // le champ revient à la graine en vigueur
        assert.equal(restarts.length, 0, invalid);
        assert.equal(statuses.length, 1, invalid);
        assert.equal(statuses[0].isError, true, invalid);
        assert.match(statuses[0].message, /Graine refusée/);
    }
});

test("« Rejouer » fige la graine tirée, remplit le champ et relance depuis le début", () => {
    const { context, api, elements, restarts } = loadMain();
    context.RANDOM_SEED = null;
    api.beginExperimentSeed();
    const drawn = context.activeSeed;
    const saved = [];
    vm.runInContext("settingsStorage = {};", context); // `let` de main.js : pas une propriété du contexte
    context.persistSettings = storage => saved.push(storage);

    api.replaySeed();

    assert.equal(context.RANDOM_SEED, drawn);
    assert.equal(elements.seedInput.value, String(drawn));
    assert.equal(saved.length, 1); // la graine figée est conservée entre les sessions
    assert.equal(restarts.length, 1);
    assert.match(restarts[0], new RegExp(`Graine ${drawn} rejouée`));
});

test("« Rejouer » avant le démarrage de l'entraînement ne fait rien et le dit", () => {
    const { context, api, statuses, restarts } = loadMain();
    assert.equal(context.activeSeed, null);

    api.replaySeed();

    assert.equal(context.RANDOM_SEED, null);
    assert.equal(restarts.length, 0);
    assert.equal(statuses[0].isError, true);
});

test("le HUD affiche la graine de l'expérience en cours", () => {
    const hud = { children: [], replaceChildren(...items) { this.children = items; } };
    const makeElement = () => ({ children: [], className: "", textContent: "", append(...items) { this.children.push(...items); } });
    const { context, api } = loadMain({ hud });
    context.document.createElement = makeElement;
    context.generation = 3;
    context.trackLabel = () => "Débutant";
    context.findTrainingLeader = () => null;
    context.cars = [];
    context.activeSeed = 4242;

    api.updateHud(null);

    const lines = hud.children.map(item => item.children.map(child => child.textContent).join(" "));
    assert.ok(lines.includes("Graine 4242"));

    context.activeSeed = null;
    api.updateHud(null);
    assert.ok(!hud.children.some(item => item.children[0].textContent === "Graine"));
});

// ---------- Réglages conservés (Settings.js) ----------

function loadSettings(seedElement = { value: "" }) {
    const document = { getElementById: id => (id === "seedInput" ? seedElement : null) };
    const context = createContext({ document });
    const api = loadScripts(context, ["globals.js", "Settings.js"], [
        "SettingsStorage", "restoreSettings", "persistSettings", "collectSettings"
    ]);
    return { context, api, seedElement };
}

function fakeStorage(initial) {
    const data = new Map(initial === undefined ? [] : [["neuroevolution-racing-settings-v1", initial]]);
    return { data, getItem: key => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, value) };
}

test("réglages : la graine imposée est conservée puis restaurée dans la variable et le champ", () => {
    const { context, api } = loadSettings();
    const storage = fakeStorage();
    context.RANDOM_SEED = 1234;
    api.persistSettings(new api.SettingsStorage(storage));
    assert.equal(JSON.parse(storage.data.get("neuroevolution-racing-settings-v1")).seed, 1234);

    const fresh = loadSettings();
    const restored = fresh.api.restoreSettings(new fresh.api.SettingsStorage(storage));

    assert.equal(restored, 1);
    assert.equal(fresh.context.RANDOM_SEED, 1234);
    assert.equal(fresh.seedElement.value, "1234");
});

test("réglages : effacer la graine (automatique) remplace la graine précédemment conservée", () => {
    const { context, api } = loadSettings();
    const storage = fakeStorage();
    context.RANDOM_SEED = 1234;
    api.persistSettings(new api.SettingsStorage(storage));
    context.RANDOM_SEED = null;
    api.persistSettings(new api.SettingsStorage(storage));

    const fresh = loadSettings({ value: "reste" });
    fresh.api.restoreSettings(new fresh.api.SettingsStorage(storage));

    assert.equal(fresh.context.RANDOM_SEED, null);
    assert.equal(fresh.seedElement.value, "");
});

test("réglages : une graine enregistrée invalide ou hors bornes est ignorée", () => {
    for (const bad of ["abc", "12", -1, 1.5, 4294967296, true, [3], {}]) {
        const { context, api, seedElement } = loadSettings({ value: "" });
        const storage = fakeStorage(JSON.stringify({ seed: bad }));

        const restored = api.restoreSettings(new api.SettingsStorage(storage));

        assert.equal(restored, 0, String(bad));
        assert.equal(context.RANDOM_SEED, null, String(bad));
        assert.equal(seedElement.value, "", String(bad));
    }
});

test("réglages : les bornes 0 et 2^32 - 1 sont acceptées", () => {
    for (const edge of [0, MAX_SEED]) {
        const { context, api } = loadSettings();
        api.restoreSettings(new api.SettingsStorage(fakeStorage(JSON.stringify({ seed: edge }))));
        assert.equal(context.RANDOM_SEED, edge);
    }
});

test("la graine est automatique par défaut", () => {
    const context = createContext();
    loadScripts(context, ["globals.js"], ["RANDOM_SEED"]);
    assert.equal(context.RANDOM_SEED, null);
    assert.equal(context.activeSeed, null);
});
