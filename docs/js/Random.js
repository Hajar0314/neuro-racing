// Hasard reproductible de la simulation.
//
// Toute l'évolution (poids initiaux, mutations, croisements, tournois, décalage de départ des
// voitures) tire ses nombres ici. Avec une graine fixée, une même expérience se rejoue à
// l'identique : on peut alors comparer deux réglages sur le MÊME point de départ.
//
// Tant qu'aucune graine n'est fixée (seedRandom() jamais appelée), les fonctions déléguent au
// hasard du navigateur (Math.random, random() et randomGaussian() de p5) : comportement historique.
// L'application, elle, fixe toujours une graine au démarrage d'une expérience (voir main.js).

var MAX_SEED = 4294967295; // 2^32 - 1 : une graine tient sur 32 bits
var seededGenerator = null; // générateur actif, ou null (hasard du navigateur)

// mulberry32 : petit générateur 32 bits, rapide, de bonne qualité statistique pour une simulation.
// Chaque appel de next() renvoie un nombre dans [0, 1) et fait avancer l'état interne.
class SeededRandom {
    constructor(seed) {
        this.state = seed >>> 0;
    }

    next() {
        this.state = (this.state + 0x6D2B79F5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

// Lit une graine saisie par l'utilisateur. Renvoie un entier de 0 à MAX_SEED, ou null si le texte
// est vide ou invalide (null = graine automatique). Seuls les chiffres sont acceptés : « 12abc »,
// « -3 », « 1.5 » ou un nombre trop grand ne sont pas arrondis en silence.
function parseSeed(text) {
    if (typeof text === "number") text = Number.isInteger(text) ? String(text) : "";
    if (typeof text !== "string") return null;
    const trimmed = text.trim();
    if (!/^\d{1,10}$/.test(trimmed)) return null;
    const value = Number(trimmed);
    return value <= MAX_SEED ? value : null;
}

// Tire une nouvelle graine (utilisée quand l'utilisateur n'en impose pas).
function drawRandomSeed(source = Math.random) {
    return Math.min(MAX_SEED, Math.floor(source() * (MAX_SEED + 1)));
}

// Fixe la graine : tous les tirages suivants sont reproductibles. Renvoie la graine retenue.
function seedRandom(seed) {
    const value = parseSeed(seed);
    if (value === null) throw new Error("Graine invalide : un entier de 0 à " + MAX_SEED + " est attendu.");
    seededGenerator = new SeededRandom(value);
    return value;
}

// Revient au hasard du navigateur.
function clearRandomSeed() {
    seededGenerator = null;
}

function isRandomSeeded() {
    return seededGenerator !== null;
}

// Nombre dans [0, 1).
function randomUnit() {
    return seededGenerator ? seededGenerator.next() : Math.random();
}

// Nombre dans [low, high).
function randomBetween(low, high) {
    if (!seededGenerator) return random(low, high);
    return low + (high - low) * seededGenerator.next();
}

// Entier de 0 à length - 1.
function randomIndex(length) {
    if (!seededGenerator) return Math.floor(random(length));
    return Math.min(length - 1, Math.floor(seededGenerator.next() * length));
}

// Loi normale (Box-Muller). Deux tirages par appel, sans état caché : la suite des nombres ne
// dépend que de la graine et du nombre d'appels.
function randomGaussianValue(mean = 0, deviation = 1) {
    if (!seededGenerator) return randomGaussian(mean, deviation);
    const u1 = 1 - seededGenerator.next(); // dans ]0, 1] : jamais de log(0)
    const u2 = seededGenerator.next();
    return mean + deviation * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Graine d'initialisation d'une couche TensorFlow.js : tirée dans le flux de la simulation, ou
// null sans graine (TensorFlow garde alors son initialisation aléatoire par défaut).
function nextInitSeed() {
    return seededGenerator ? Math.floor(seededGenerator.next() * (MAX_SEED + 1)) : null;
}
