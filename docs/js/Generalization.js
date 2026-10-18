// Vérifier qu'un cerveau sait conduire ailleurs que sur son circuit d'entraînement.
//
// Chaque cerveau archivé garde la liste des circuits sur lesquels il a été entraîné
// (`trainedOn`). Au départ d'une course, on compare cette liste au circuit de la course :
//   - « connu »   : le cerveau a déjà roulé sur ce circuit ;
//   - « inédit »  : jamais vu pendant l'entraînement → c'est le vrai test de généralisation ;
//   - inconnu     : archive ancienne sans historique, aucun verdict n'est donné.

const KNOWN_PRESETS = ["easy", "medium", "technical", "custom"];
const PRESET_LABELS = {
    easy: "débutant",
    medium: "intermédiaire",
    technical: "expert",
    custom: "dessiné"
};

function presetLabel(preset) {
    return PRESET_LABELS[preset] || String(preset);
}

// Circuits d'entraînement d'un cerveau archivé. Les valeurs inconnues sont ignorées (un import
// JSON n'est pas fiable) ; une archive ancienne retombe sur son seul `trackPreset`.
function trainedOnPresets(record) {
    if (!record || typeof record !== "object") return [];
    if (Array.isArray(record.trainedOn)) {
        const names = record.trainedOn.filter(name => KNOWN_PRESETS.includes(name));
        return names.filter((name, index) => names.indexOf(name) === index);
    }
    return KNOWN_PRESETS.includes(record.trackPreset) ? [record.trackPreset] : [];
}

// "seen" | "unseen" | "unknown"
function circuitStatus(trainedOn, racePreset) {
    if (!trainedOn || !trainedOn.length) return "unknown";
    return trainedOn.includes(racePreset) ? "seen" : "unseen";
}

function describeTrainedOn(trainedOn) {
    if (!trainedOn.length) return "circuit inconnu";
    if (trainedOn.length === 1) return `entraîné : ${presetLabel(trainedOn[0])}`;
    return `entraîné : ${trainedOn.length} circuits`;
}

// Circuit demandé pour la course : "auto" suit celui de l'entraînement.
function raceTrackPreset() {
    return RACE_TRACK_CHOICE === "auto" ? trainingPreset() : RACE_TRACK_CHOICE;
}

// Bilan par catégorie : { seen, unseen, unknown }, chacune { total, finished }.
function summarizeGeneralization(raceParticipants) {
    const summary = {
        seen: { total: 0, finished: 0 },
        unseen: { total: 0, finished: 0 },
        unknown: { total: 0, finished: 0 }
    };
    for (const car of raceParticipants) {
        const bucket = summary[car.circuitStatus] || summary.unknown;
        bucket.total++;
        if (car.finished) bucket.finished++;
    }
    return summary;
}

// Phrase affichée sous le classement. Vide si aucun cerveau n'a d'historique.
function formatGeneralization(summary) {
    const parts = [];
    if (summary.unseen.total) {
        parts.push(`circuit inédit : ${summary.unseen.finished}/${summary.unseen.total} ont bouclé le tour`);
    }
    if (summary.seen.total) {
        parts.push(`circuit déjà vu : ${summary.seen.finished}/${summary.seen.total} ont bouclé le tour`);
    }
    return parts.length ? `Généralisation — ${parts.join(" · ")}.` : "";
}

// Texte du bandeau de course : nom du circuit et répartition connu / inédit.
function describeRaceTrack(preset, raceParticipants) {
    const summary = summarizeGeneralization(raceParticipants);
    const parts = [`Circuit : ${presetLabel(preset)}`];
    if (summary.unseen.total) parts.push(`inédit pour ${summary.unseen.total} cerveau(x)`);
    if (summary.seen.total) parts.push(`déjà vu par ${summary.seen.total}`);
    return parts.join(" · ");
}
