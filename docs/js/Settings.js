// Réglages de l'interface conservés entre les sessions (localStorage).
//
// Une seule table décrit chaque réglage persisté : contrôle HTML, variable globale,
// format d'affichage. Les valeurs relues sont toujours validées avant d'être appliquées :
// une valeur absente, hors bornes ou illisible est ignorée et la valeur par défaut reste.
// Le circuit dessiné à la main n'est pas conservé (seuls ses points existent en mémoire) :
// on garde alors le dernier circuit prédéfini choisi.

const SETTINGS_STORAGE_KEY = "neuroevolution-racing-settings-v1";

const SETTING_DEFINITIONS = [
    {
        key: "speed", type: "range", inputId: "speedSlider", outputId: "speedVal",
        format: value => String(value),
        read: () => GAME_SPEED_LIMIT,
        apply: value => { GAME_SPEED_LIMIT = value; }
    },
    {
        key: "acceleration", type: "range", inputId: "accelerationSlider", outputId: "accelerationVal",
        format: value => value.toFixed(1),
        read: () => CAR_ACCELERATION,
        apply: value => { CAR_ACCELERATION = value; }
    },
    {
        key: "steps", type: "range", inputId: "stepsSlider", outputId: "stepsVal",
        format: value => String(value),
        read: () => TRAINING_STEPS_PER_FRAME,
        apply: value => { TRAINING_STEPS_PER_FRAME = value; }
    },
    {
        key: "population", type: "range", inputId: "populationSlider", outputId: "populationVal",
        format: value => String(value),
        read: () => TOTAL_POP,
        apply: value => { TOTAL_POP = value; }
    },
    {
        key: "mutation", type: "range", inputId: "mutationSlider", outputId: "mutationVal",
        format: value => `${value} %`,
        read: () => Math.round(MUTATION_RATE * 100),
        apply: value => { MUTATION_RATE = value / 100; }
    },
    {
        key: "crossover", type: "range", inputId: "crossoverSlider", outputId: "crossoverVal",
        format: value => `${value} %`,
        read: () => Math.round(CROSSOVER_RATE * 100),
        apply: value => { CROSSOVER_RATE = value / 100; }
    },
    {
        key: "success", type: "range", inputId: "successSlider", outputId: "successVal",
        format: value => `${value} %`,
        read: () => Math.round(SUCCESS_RATE_TARGET * 100),
        apply: value => { SUCCESS_RATE_TARGET = value / 100; }
    },
    {
        key: "neurons", type: "range", inputId: "neuronsSlider", outputId: "neuronsVal",
        format: value => String(value),
        read: () => HIDDEN_NODES,
        apply: value => { HIDDEN_NODES = value; }
    },
    {
        key: "activation", type: "select", inputId: "activationSelect",
        read: () => HIDDEN_ACTIVATION,
        apply: value => { HIDDEN_ACTIVATION = value; }
    },
    {
        key: "track", type: "select", inputId: "trackSelect", exclude: ["custom"],
        read: () => (TRACK_PRESET === "custom" ? undefined : TRACK_PRESET),
        apply: value => { TRACK_PRESET = value; }
    },
    {
        key: "difficulty", type: "range", inputId: "diffSlider", outputId: "diffVal",
        format: value => String(value),
        read: () => TRACK_DIFFICULTY,
        apply: value => { TRACK_DIFFICULTY = value; }
    },
    {
        key: "width", type: "range", inputId: "widthSlider", outputId: "widthVal",
        format: value => String(value),
        read: () => TRACK_WIDTH,
        apply: value => { TRACK_WIDTH = value; }
    },
    {
        key: "multiTrack", type: "checkbox", inputId: "multiTrackToggle",
        read: () => MULTI_TRACK_TRAINING,
        apply: value => { MULTI_TRACK_TRAINING = value; }
    },
    {
        key: "multiEasy", type: "checkbox", inputId: "multiTrack-easy",
        read: () => MULTI_TRACK_SET.includes("easy"),
        apply: value => { MULTI_TRACK_SET = selectTrackPreset(MULTI_TRACK_SET, "easy", value); }
    },
    {
        key: "multiMedium", type: "checkbox", inputId: "multiTrack-medium",
        read: () => MULTI_TRACK_SET.includes("medium"),
        apply: value => { MULTI_TRACK_SET = selectTrackPreset(MULTI_TRACK_SET, "medium", value); }
    },
    {
        key: "multiTechnical", type: "checkbox", inputId: "multiTrack-technical",
        read: () => MULTI_TRACK_SET.includes("technical"),
        apply: value => { MULTI_TRACK_SET = selectTrackPreset(MULTI_TRACK_SET, "technical", value); }
    },
    {
        key: "raceTrack", type: "select", inputId: "raceTrackSelect", exclude: ["custom"],
        read: () => (RACE_TRACK_CHOICE === "custom" ? undefined : RACE_TRACK_CHOICE),
        apply: value => { RACE_TRACK_CHOICE = value; }
    },
    {
        // Graine aléatoire : null = automatique. Elle est enregistrée telle quelle (null compris),
        // pour qu'effacer une graine imposée la retire aussi des réglages conservés.
        key: "seed", type: "seed", inputId: "seedInput",
        read: () => RANDOM_SEED,
        apply: value => { RANDOM_SEED = value; }
    },
    {
        key: "debug", type: "checkbox", inputId: "debugToggle",
        read: () => showDebugSensors,
        apply: value => { showDebugSensors = value; }
    }
];

class SettingsStorage {
    constructor(storage = localStorage) {
        this.storage = storage;
    }

    // Lecture tolérante : tout problème (stockage bloqué, JSON illisible, mauvais format)
    // donne simplement « aucun réglage enregistré ».
    load() {
        try {
            const raw = this.storage.getItem(SETTINGS_STORAGE_KEY);
            if (raw === null) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    // Fusionne avec les réglages déjà enregistrés. Renvoie false si l'écriture échoue
    // (quota, navigation privée) : la simulation continue, seuls les réglages ne sont pas gardés.
    save(values) {
        try {
            this.storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...this.load(), ...values }));
            return true;
        } catch (error) {
            return false;
        }
    }
}

function createSettingsStorage() {
    try {
        return new SettingsStorage(localStorage);
    } catch (error) {
        return null; // accès au stockage refusé par le navigateur
    }
}

// Bornes lues dans le HTML : index.html reste la seule source des min / max / pas.
function settingLimits(definition) {
    const element = document.getElementById(definition.inputId);
    if (!element) return null;
    if (definition.type === "range") {
        return { min: Number(element.min), max: Number(element.max), step: Number(element.step) || 1 };
    }
    if (definition.type === "seed") return { min: 0, max: MAX_SEED }; // bornes du générateur (Random.js)
    if (definition.type === "select") {
        const exclude = definition.exclude || [];
        return { options: Array.from(element.options, option => option.value).filter(value => !exclude.includes(value)) };
    }
    return {};
}

function sanitizeSetting(definition, value, limits) {
    if (!limits) return undefined;
    if (definition.type === "range") {
        if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
        const clamped = Math.min(limits.max, Math.max(limits.min, value));
        const snapped = limits.min + Math.round((clamped - limits.min) / limits.step) * limits.step;
        return Number(snapped.toFixed(6));
    }
    if (definition.type === "select") {
        return typeof value === "string" && limits.options.includes(value) ? value : undefined;
    }
    if (definition.type === "seed") {
        if (value === null) return null; // graine automatique
        return Number.isInteger(value) && value >= limits.min && value <= limits.max ? value : undefined;
    }
    return typeof value === "boolean" ? value : undefined;
}

// Ne garde que les réglages valides ; limitsByKey associe chaque clé à ses bornes.
function sanitizeSettings(raw, limitsByKey) {
    const values = {};
    if (!raw || typeof raw !== "object") return values;
    for (const definition of SETTING_DEFINITIONS) {
        if (!(definition.key in raw)) continue;
        const value = sanitizeSetting(definition, raw[definition.key], limitsByKey[definition.key]);
        if (value !== undefined) values[definition.key] = value;
    }
    return values;
}

function showSettingInControl(definition, value) {
    const input = document.getElementById(definition.inputId);
    if (definition.type === "checkbox") input.checked = value;
    else input.value = value === null ? "" : String(value); // graine automatique : champ vide
    if (definition.outputId) {
        const output = document.getElementById(definition.outputId);
        output.value = definition.format(value);
        output.textContent = definition.format(value);
    }
}

// À appeler avant la création du circuit et des voitures. Renvoie le nombre de réglages restaurés.
function restoreSettings(settingsStorage) {
    const limitsByKey = {};
    for (const definition of SETTING_DEFINITIONS) limitsByKey[definition.key] = settingLimits(definition);
    const values = sanitizeSettings(settingsStorage.load(), limitsByKey);
    let restored = 0;
    for (const definition of SETTING_DEFINITIONS) {
        if (!(definition.key in values)) continue;
        definition.apply(values[definition.key]);
        showSettingInControl(definition, values[definition.key]);
        restored++;
    }
    return restored;
}

function collectSettings() {
    const values = {};
    for (const definition of SETTING_DEFINITIONS) {
        const value = definition.read();
        if (value !== undefined) values[definition.key] = value;
    }
    return values;
}

function persistSettings(settingsStorage) {
    return settingsStorage.save(collectSettings());
}
