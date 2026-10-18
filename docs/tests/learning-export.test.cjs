const test = require("node:test");
const assert = require("node:assert/strict");
const { createContext, loadScripts } = require("./helpers.cjs");

function loadExport(extra = {}) {
    const context = createContext(extra);
    const api = loadScripts(context, ["globals.js", "main.js"], [
        "learningHistoryToCsv",
        "exportLearningCurve",
        "updateLearningExportButton"
    ]);
    return { context, api };
}

test("the CSV has a header and one row per generation", () => {
    const { api } = loadExport();
    const csv = api.learningHistoryToCsv([
        { generation: 1, averageScore: 120.5, bestScore: 300, averageSpeed: 2.25, elapsedSeconds: 14.2 },
        { generation: 2, averageScore: 180, bestScore: 410.1234, averageSpeed: 3, elapsedSeconds: 16 }
    ]);

    assert.equal(
        csv,
        "generation,score_moyen,meilleur_score,vitesse_moyenne,duree_s\r\n" +
        "1,120.5,300,2.25,14.2\r\n" +
        "2,180,410.123,3,16\r\n"
    );
});

test("an empty history still gives a valid CSV with only the header", () => {
    const { api } = loadExport();
    assert.equal(
        api.learningHistoryToCsv([]),
        "generation,score_moyen,meilleur_score,vitesse_moyenne,duree_s\r\n"
    );
});

test("missing or non-finite values are exported as 0", () => {
    const { api } = loadExport();
    const csv = api.learningHistoryToCsv([
        { generation: 3, averageScore: NaN, bestScore: Infinity, averageSpeed: undefined }
    ]);
    assert.equal(csv.split("\r\n")[1], "3,0,0,0,0");
});

test("exporting with an empty history downloads nothing and reports it", () => {
    const statuses = [];
    let blobs = 0;
    const { context, api } = loadExport({
        Blob: class { constructor() { blobs++; } },
        URL: { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }
    });
    context.setStatus = (message, isError) => statuses.push({ message, isError });
    context.learningHistory = [];

    api.exportLearningCurve();

    assert.equal(blobs, 0);
    assert.equal(statuses.length, 1);
    assert.equal(statuses[0].isError, true);
});

test("exporting downloads a named CSV file built from the history", () => {
    const statuses = [];
    const downloads = [];
    let blobContent = null;
    const link = { click() { downloads.push(this.download); } };
    const { context, api } = loadExport({
        Blob: class { constructor(parts, options) { blobContent = { parts, options }; } },
        URL: { createObjectURL: () => "blob:x", revokeObjectURL: () => {} },
        document: { createElement: () => link }
    });
    context.setStatus = (message, isError) => statuses.push({ message, isError });
    context.TRACK_PRESET = "medium";
    context.learningHistory = [
        { generation: 1, averageScore: 10, bestScore: 20, averageSpeed: 1, elapsedSeconds: 5 }
    ];

    api.exportLearningCurve();

    assert.deepEqual(downloads, ["courbe-apprentissage-medium.csv"]);
    assert.match(blobContent.options.type, /^text\/csv/);
    assert.equal(blobContent.parts[0].split("\r\n").length, 3);
    assert.equal(statuses[0].isError, undefined);
});

test("the export button is enabled only when the history has data", () => {
    const button = { disabled: true };
    const { context, api } = loadExport({
        document: { getElementById: id => (id === "exportLearningCsv" ? button : null) }
    });

    context.learningHistory = [];
    api.updateLearningExportButton();
    assert.equal(button.disabled, true);

    context.learningHistory = [{ generation: 1 }];
    api.updateLearningExportButton();
    assert.equal(button.disabled, false);
});
