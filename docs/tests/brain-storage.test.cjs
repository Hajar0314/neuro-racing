const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts } = require("./helpers.cjs");

function createStorage() {
    const context = createContext({
        tf: {},
        localStorage: null
    });
    const api = loadScripts(
        context,
        ["NeuralNetwork.js", "BrainStorage.js"],
        ["NeuralNetwork", "BrainStorage"]
    );
    const values = new Map();
    const storage = {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key)
    };
    return { ...api, storage };
}

function createRecord(id, score = 100) {
    return {
        id,
        name: `Cerveau ${id}`,
        score,
        brain: {
            inputNodes: 6,
            hiddenNodes: 2,
            outputNodes: 2,
            activation: "sigmoid",
            weights: [
                { shape: [6, 2], values: Array(12).fill(0.1) },
                { shape: [2], values: [0, 0] },
                { shape: [2, 2], values: Array(4).fill(0.2) },
                { shape: [2], values: [0, 0] }
            ]
        }
    };
}

test("NeuralNetwork builds, copies, mutates and restores its configured architecture", () => {
    class FakeTensor {
        constructor(values, shape) {
            this.values = Array.from(values);
            this.shape = [...shape];
        }
        dataSync() { return this.values; }
        clone() { return new FakeTensor(this.values, this.shape); }
        dispose() {}
    }
    class FakeSequential {
        constructor() {
            this.layers = [];
            this.weights = [];
            this.outputNodes = 0;
        }
        add(layer) {
            const inputNodes = layer.inputShape ? layer.inputShape[0] : this.outputNodes;
            this.layers.push(layer);
            this.weights.push(new FakeTensor(Array(inputNodes * layer.units).fill(0), [inputNodes, layer.units]));
            this.weights.push(new FakeTensor(Array(layer.units).fill(0), [layer.units]));
            this.outputNodes = layer.units;
        }
        getWeights() { return this.weights; }
        setWeights(weights) {
            if (weights.length !== this.weights.length ||
                weights.some((weight, index) =>
                    JSON.stringify(weight.shape) !== JSON.stringify(this.weights[index].shape)
                )) {
                throw new Error("weight shape mismatch");
            }
            this.weights = weights.map(weight => weight.clone());
        }
        predict() { return new FakeTensor([0.6, 0.4], [1, 2]); }
        dispose() {}
    }
    const deterministicMath = Object.create(Math);
    deterministicMath.random = () => 0;
    const context = createContext({
        Math: deterministicMath,
        tf: {
            Sequential: FakeSequential,
            sequential: () => new FakeSequential(),
            layers: { dense: configuration => configuration },
            tidy: callback => callback(),
            tensor2d: rows => new FakeTensor(rows.flat(), [1, rows[0].length]),
            tensor: (values, shape) => new FakeTensor(values, shape)
        },
        randomGaussian: () => 0.25
    });
    const { NeuralNetwork } = loadScripts(context, ["NeuralNetwork.js"], ["NeuralNetwork"]);
    const network = new NeuralNetwork(6, 3, 2, "relu");
    assert.equal(network.model.layers[0].activation, "relu");
    assert.equal(network.model.layers[1].activation, "sigmoid");
    assert.deepEqual(Array.from(network.predict([0, 0, 0, 0, 0, 0])), [0.6, 0.4]);

    const original = network.toJSON();
    const copy = network.copy();
    assert.equal(copy.activation, "relu");
    copy.mutate(1);
    assert.equal(copy.toJSON().weights[0].values[0], 0.25);
    assert.equal(original.weights[0].values[0], 0);

    const restored = NeuralNetwork.fromJSON(original);
    assert.deepEqual(Array.from(restored.predict([0, 0, 0, 0, 0, 0])), [0.6, 0.4]);
    assert.equal(restored.hidden_nodes, 3);
});

test("network serialization validation checks every weight shape and value", () => {
    const { NeuralNetwork } = createStorage();
    assert.doesNotThrow(() => NeuralNetwork.validateJSON(createRecord("valid").brain));

    const invalid = createRecord("invalid").brain;
    invalid.weights[0].values[0] = Infinity;
    assert.throws(() => NeuralNetwork.validateJSON(invalid), /Poids de cerveau invalides/);
});

test("brain archive saves, caps, exports and imports valid records", () => {
    const { BrainStorage, storage } = createStorage();
    const archive = new BrainStorage(storage);
    for (let index = 0; index < 42; index++) {
        archive.save(createRecord(`brain-${index}`, index));
    }
    assert.equal(archive.list().length, 40);
    assert.equal(archive.list()[0].id, "brain-41");

    const exported = archive.exportJSON();
    const importedArchive = new BrainStorage(createStorage().storage);
    const imported = importedArchive.importJSON(exported);
    assert.equal(imported.length, 40);
    assert.equal(imported[0].id, "brain-41");
});

test("brain archive reports malformed data without silently resetting it", () => {
    const writes = [];
    const archive = new (createStorage().BrainStorage)({
        getItem: () => "{not-json",
        setItem: (key, value) => writes.push(key),
        removeItem: key => writes.push(key)
    });

    assert.equal(archive.list().length, 0);
    assert.equal(archive.isCorrupted(), true);
    assert.equal(writes.length, 0); // lire une archive abîmée ne la modifie jamais
});

test("brain archive clear removes the saved list from local storage", () => {
    const { BrainStorage, storage } = createStorage();
    const archive = new BrainStorage(storage);
    archive.save(createRecord("saved-brain"));

    archive.clear();

    assert.equal(archive.list().length, 0);
    assert.equal(storage.getItem(BrainStorage.STORAGE_KEY), null);
});

test("importing still works when the local archive is corrupted", () => {
    const { BrainStorage, storage } = createStorage();
    const archive = new BrainStorage(storage);
    const exported = JSON.stringify({
        format: "neuroevolution-brains",
        version: 1,
        brains: [createRecord("imported", 300)]
    });

    storage.setItem(BrainStorage.STORAGE_KEY, "{pas du json");
    const result = archive.importJSON(exported);
    assert.equal(JSON.stringify(result.map(record => record.id)), '["imported"]');
    assert.equal(archive.recoveredFromCorruption, true);
    assert.equal(archive.list().length, 1);
});

test("importing keeps the valid entries of a partly corrupted archive", () => {
    const { BrainStorage, storage } = createStorage();
    const archive = new BrainStorage(storage);
    storage.setItem(BrainStorage.STORAGE_KEY, JSON.stringify([
        createRecord("good", 50),
        { id: "bad", name: "x", score: "NaN", brain: null }
    ]));
    const exported = JSON.stringify({
        format: "neuroevolution-brains",
        version: 1,
        brains: [createRecord("imported", 300)]
    });

    const result = archive.importJSON(exported);

    assert.equal(JSON.stringify(result.map(record => record.id)), '["imported","good"]');
    assert.equal(archive.recoveredFromCorruption, true);
});

test("a healthy archive is not reported as recovered after an import", () => {
    const { BrainStorage, storage } = createStorage();
    const archive = new BrainStorage(storage);
    archive.save(createRecord("old", 10));
    archive.importJSON(JSON.stringify({
        format: "neuroevolution-brains",
        version: 1,
        brains: [createRecord("new", 20)]
    }));

    assert.equal(archive.recoveredFromCorruption, false);
    assert.equal(archive.list().length, 2);
});

test("an invalid import file is still refused and does not touch a corrupted archive", () => {
    const { BrainStorage, storage } = createStorage();
    const archive = new BrainStorage(storage);
    storage.setItem(BrainStorage.STORAGE_KEY, "{pas du json");

    assert.throws(() => archive.importJSON("pas du json"), /JSON n’est pas valide/);
    assert.equal(storage.getItem(BrainStorage.STORAGE_KEY), "{pas du json");
});

test("saving still works when the local archive is corrupted", () => {
    const { BrainStorage, storage } = createStorage();
    const archive = new BrainStorage(storage);
    storage.setItem(BrainStorage.STORAGE_KEY, "{pas du json");

    const saved = archive.save(createRecord("fresh", 80));

    assert.equal(saved.length, 1);
    assert.equal(archive.recoveredFromCorruption, true);
    assert.equal(archive.list().length, 1);
});

test("saving keeps the valid entries of a partly corrupted archive", () => {
    const { BrainStorage, storage } = createStorage();
    const archive = new BrainStorage(storage);
    storage.setItem(BrainStorage.STORAGE_KEY, JSON.stringify([
        createRecord("good", 50),
        { id: "bad", name: "x", score: 1, brain: { inputNodes: 1 } }
    ]));

    const saved = archive.save(createRecord("fresh", 80));

    assert.equal(JSON.stringify(saved.map(record => record.id)), '["fresh","good"]');
});

test("repair rewrites the archive with only its valid entries", () => {
    const { BrainStorage, storage } = createStorage();
    const archive = new BrainStorage(storage);
    storage.setItem(BrainStorage.STORAGE_KEY, JSON.stringify([
        createRecord("good", 50),
        { id: "bad" }
    ]));
    assert.equal(archive.isCorrupted(), true);

    const kept = archive.repair();

    assert.equal(kept.length, 1);
    assert.equal(archive.list().length, 1);
    assert.equal(archive.isCorrupted(), false);

    storage.setItem(BrainStorage.STORAGE_KEY, "{pas du json");
    assert.equal(archive.repair().length, 0);
    assert.equal(archive.list().length, 0);
});

test("a corrupted archive is reported once across several saves in archiveTopBrains", () => {
    const { BrainStorage, storage } = createStorage();
    const archive = new BrainStorage(storage);
    storage.setItem(BrainStorage.STORAGE_KEY, "{pas du json");
    const context = createContext({
        brainStorage: archive,
        renderBrainList: () => {},
        TRACK_PRESET: "easy"
    });
    const messages = [];
    loadScripts(context, ["globals.js", "Genetic.js"], ["archiveTopBrains"]);
    context.brainStorage = archive;
    context.setStatus = message => messages.push(message);
    const car = score => ({ score, fitness: score, finished: false, brain: { toJSON: () => createRecord("x").brain } });

    context.archiveTopBrains([car(10), car(20), car(30)], 3);

    assert.equal(archive.list().length, 3);
    assert.equal(messages.filter(message => /abîmée/.test(message)).length, 1);
});

test("list returns the valid entries of a damaged archive and leaves it untouched", () => {
    const { BrainStorage, storage } = createStorage();
    const archive = new BrainStorage(storage);
    const raw = JSON.stringify([createRecord("good", 50), { id: "bad" }]);
    storage.setItem(BrainStorage.STORAGE_KEY, raw);

    assert.equal(archive.list().length, 1);
    assert.equal(archive.isCorrupted(), true);
    assert.equal(storage.getItem(BrainStorage.STORAGE_KEY), raw);
    assert.equal(storage.getItem(BrainStorage.BACKUP_KEY), null);
});

test("repair, save and import keep a raw backup of the damaged archive before rewriting", () => {
    for (const action of ["repair", "save", "import"]) {
        const { BrainStorage, storage } = createStorage();
        const archive = new BrainStorage(storage);
        const raw = JSON.stringify([createRecord("good", 50), { id: "bad" }]);
        storage.setItem(BrainStorage.STORAGE_KEY, raw);

        if (action === "repair") archive.repair();
        if (action === "save") archive.save(createRecord("fresh", 80));
        if (action === "import") {
            archive.importJSON(JSON.stringify({
                format: "neuroevolution-brains", version: 1, brains: [createRecord("fresh", 80)]
            }));
        }

        assert.equal(archive.getCorruptedBackup(), raw, action);
        assert.equal(archive.backupSaved, true, action);
        assert.notEqual(storage.getItem(BrainStorage.STORAGE_KEY), raw, action);
    }
});

test("an unreadable archive is also backed up before being replaced", () => {
    const { BrainStorage, storage } = createStorage();
    const archive = new BrainStorage(storage);
    storage.setItem(BrainStorage.STORAGE_KEY, "{pas du json");

    archive.save(createRecord("fresh", 80));

    assert.equal(archive.getCorruptedBackup(), "{pas du json");
});

test("a healthy archive never creates a backup", () => {
    const { BrainStorage, storage } = createStorage();
    const archive = new BrainStorage(storage);
    archive.save(createRecord("one", 10));
    archive.save(createRecord("two", 20));
    archive.repair();

    assert.equal(archive.getCorruptedBackup(), null);
    assert.equal(archive.backupSaved, false);
    assert.equal(archive.recoveredFromCorruption, false);
});

test("a failed backup does not block the write and is reported", () => {
    const { BrainStorage, storage } = createStorage();
    const archive = new BrainStorage({
        getItem: key => storage.getItem(key),
        setItem: (key, value) => {
            if (key === BrainStorage.BACKUP_KEY) throw new Error("quota");
            storage.setItem(key, value);
        },
        removeItem: key => storage.removeItem(key)
    });
    storage.setItem(BrainStorage.STORAGE_KEY, "{pas du json");

    const saved = archive.save(createRecord("fresh", 80));

    assert.equal(saved.length, 1);
    assert.equal(archive.recoveredFromCorruption, true);
    assert.equal(archive.backupSaved, false);
});

test("clear removes the backup as well", () => {
    const { BrainStorage, storage } = createStorage();
    const archive = new BrainStorage(storage);
    storage.setItem(BrainStorage.STORAGE_KEY, "{pas du json");
    archive.repair();
    assert.notEqual(archive.getCorruptedBackup(), null);

    archive.clear();

    assert.equal(archive.getCorruptedBackup(), null);
    assert.equal(storage.getItem(BrainStorage.STORAGE_KEY), null);
});

function createBrain(hiddenNodes, activation, fill) {
    return {
        inputNodes: 6,
        hiddenNodes,
        outputNodes: 2,
        activation,
        weights: [
            { shape: [6, hiddenNodes], values: Array(6 * hiddenNodes).fill(fill) },
            { shape: [hiddenNodes], values: Array(hiddenNodes).fill(fill) },
            { shape: [hiddenNodes, 2], values: Array(hiddenNodes * 2).fill(fill) },
            { shape: [2], values: [fill, fill] }
        ]
    };
}

test("every architecture the interface can build is saved and read back unchanged", () => {
    const { BrainStorage, storage } = createStorage();
    const archive = new BrainStorage(storage);
    let index = 0;
    for (const activation of ["sigmoid", "tanh", "relu"]) {
        for (let hidden = 4; hidden <= 64; hidden += 6) {
            const record = createRecord(`brain-${index++}`, 10 + index);
            record.brain = createBrain(hidden, activation, -0.25 + hidden / 1000);
            archive.save(record);
            assert.equal(archive.isCorrupted(), false, `${activation} / ${hidden}`);
        }
    }
    const raw = storage.getItem(BrainStorage.STORAGE_KEY);
    assert.equal(JSON.stringify(JSON.parse(raw)), raw);
    assert.equal(archive.list().length, BrainStorage.MAX_BRAINS > index ? index : BrainStorage.MAX_BRAINS);
});

test("a brain with non-finite weights is refused and the archive stays byte-identical", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
        const { BrainStorage, storage } = createStorage();
        const archive = new BrainStorage(storage);
        archive.save(createRecord("good", 10));
        const before = storage.getItem(BrainStorage.STORAGE_KEY);

        const record = createRecord("bad", 99);
        record.brain.weights[0].values[3] = bad;

        assert.throws(() => archive.save(record), /invalide/);
        assert.equal(storage.getItem(BrainStorage.STORAGE_KEY), before);
        assert.equal(archive.isCorrupted(), false);
        assert.equal(storage.getItem(BrainStorage.BACKUP_KEY), null);
    }
});

test("every value ever written to the archive key is valid, whatever the starting state", () => {
    const starts = [null, "{pas du json", "42", JSON.stringify([{ id: "bad" }, createRecord("good", 5)])];
    for (const start of starts) {
        const { BrainStorage, storage } = createStorage();
        const written = [];
        const spy = {
            getItem: key => storage.getItem(key),
            setItem: (key, value) => {
                if (key === BrainStorage.STORAGE_KEY) written.push(value);
                storage.setItem(key, value);
            },
            removeItem: key => storage.removeItem(key)
        };
        if (start !== null) storage.setItem(BrainStorage.STORAGE_KEY, start);
        const archive = new BrainStorage(spy);

        archive.repair();
        archive.save(createRecord("a", 1));
        archive.importJSON(JSON.stringify({
            format: "neuroevolution-brains", version: 1, brains: [createRecord("b", 2)]
        }));
        archive.save(createRecord("a", 3));

        assert.ok(written.length >= 3);
        for (const text of written) {
            const parsed = JSON.parse(text);
            assert.ok(Array.isArray(parsed));
            parsed.forEach(BrainStorage.validateRecord);
        }
    }
});

test("a failing write leaves the previous archive untouched and reports the error", () => {
    const { BrainStorage, storage } = createStorage();
    new BrainStorage(storage).save(createRecord("kept", 10));
    const before = storage.getItem(BrainStorage.STORAGE_KEY);
    const archive = new BrainStorage({
        getItem: key => storage.getItem(key),
        setItem: (key, value) => {
            if (key === BrainStorage.STORAGE_KEY) throw new Error("quota");
            storage.setItem(key, value);
        },
        removeItem: key => storage.removeItem(key)
    });

    assert.throws(() => archive.save(createRecord("new", 20)), /quota/);
    assert.equal(storage.getItem(BrainStorage.STORAGE_KEY), before);
});

test("a write that does not read back identically is rolled back", () => {
    const { BrainStorage, storage } = createStorage();
    const seed = new BrainStorage(storage);
    seed.save(createRecord("kept", 10));
    const before = storage.getItem(BrainStorage.STORAGE_KEY);
    let damaging = true;
    const archive = new BrainStorage({
        getItem: key => storage.getItem(key),
        setItem: (key, value) => {
            // simule un stockage qui tronque l'écriture (autre onglet, extension, disque plein)
            if (key === BrainStorage.STORAGE_KEY && damaging) {
                damaging = false;
                storage.setItem(key, value.slice(0, value.length - 7));
            } else {
                storage.setItem(key, value);
            }
        },
        removeItem: key => storage.removeItem(key)
    });

    assert.throws(() => archive.save(createRecord("new", 20)), /ne correspond pas/);
    assert.equal(storage.getItem(BrainStorage.STORAGE_KEY), before);
    assert.equal(archive.isCorrupted(), false);
});

test("a failed first write leaves no archive behind", () => {
    const { BrainStorage, storage } = createStorage();
    const archive = new BrainStorage({
        getItem: key => storage.getItem(key),
        setItem: (key, value) => {
            if (key === BrainStorage.STORAGE_KEY) {
                storage.setItem(key, "{tronqu");
                return;
            }
            storage.setItem(key, value);
        },
        removeItem: key => storage.removeItem(key)
    });

    assert.throws(() => archive.save(createRecord("first", 1)), /ne correspond pas/);
    assert.equal(storage.getItem(BrainStorage.STORAGE_KEY), null);
    assert.equal(archive.isCorrupted(), false);
});
