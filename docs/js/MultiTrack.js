// Entraînement sur plusieurs circuits.
//
// Un cerveau entraîné sur un seul tracé risque de ne savoir conduire que sur celui-là. Quand
// MULTI_TRACK_TRAINING est actif, chaque génération se déroule en plusieurs TOURS, un par circuit
// de MULTI_TRACK_SET (toujours dans l'ordre débutant → intermédiaire → expert) :
//
//   tour 1 (circuit A) → tour 2 (circuit B) → … → fitness de la génération → sélection
//
// Les mêmes cerveaux repartent à chaque tour (nouvelle voiture, même décalage de départ).
// Le score et la fitness d'une voiture sont la MOYENNE de ses tours ; elle n'est « réussie »
// que si elle a bouclé TOUS les circuits. Une voiture qui réussit un seul tracé ne peut donc
// pas dominer la sélection.

const MULTI_TRACK_ORDER = ["easy", "medium", "technical"];

// Nouvelle sélection de circuits d'entraînement après (dé)cochage de `preset`.
// L'ordre est toujours celui de MULTI_TRACK_ORDER ; au moins un circuit reste sélectionné.
function selectTrackPreset(selection, preset, enabled) {
    if (!MULTI_TRACK_ORDER.includes(preset)) return selection.slice();
    const wanted = new Set(selection);
    if (enabled) wanted.add(preset);
    else wanted.delete(preset);
    const next = MULTI_TRACK_ORDER.filter(name => wanted.has(name));
    return next.length ? next : selection.slice();
}

// Décalage de la voiture par rapport au départ du circuit courant (les départs sont
// légèrement décalés au hasard : on garde ce décalage d'un circuit à l'autre).
function trackStartOffset(car) {
    return { dx: car.startPos.x - startX, dy: car.startPos.y - startY };
}

// Résultat d'une voiture sur le tour qui vient de se terminer.
function summarizeRound(car, preset) {
    const score = Number(car.score) || 0;
    return {
        preset,
        score,
        fitness: Number.isFinite(car.fitness) ? car.fitness : score,
        finished: Boolean(car.finished),
        lapFrames: Number.isFinite(car.lapFrames) ? car.lapFrames : null,
        trackProgress: Number(car.trackProgress) || 0
    };
}

// Moyenne des tours ; `finished` = a bouclé chacun des circuits.
function aggregateRounds(rounds) {
    const count = rounds.length;
    if (!count) return { score: 0, fitness: 0, trackProgress: 0, finished: false, rounds: 0 };
    const mean = key => rounds.reduce((total, round) => total + round[key], 0) / count;
    return {
        score: mean("score"),
        fitness: mean("fitness"),
        trackProgress: mean("trackProgress"),
        finished: rounds.every(round => round.finished),
        rounds: count
    };
}

// Même cerveau, nouvelle voiture au départ du circuit courant (compteurs remis à zéro).
// Les résultats des tours précédents sont reportés sur la nouvelle voiture.
function respawnOnCurrentTrack(car, offset) {
    const fresh = new Car({
        brain: car.brain,
        color: car.color,
        name: car.name,
        position: createVector(startX + offset.dx, startY + offset.dy)
    });
    fresh.setPhysics(GAME_SPEED_LIMIT, CAR_ACCELERATION);
    fresh.roundResults = car.roundResults || [];
    return fresh;
}

// Écrit sur chaque voiture le résultat de la génération entière (moyenne de tous les tours).
// aggregateFitness est lu par calculateFitness() : il n'est pas recalculé sur le dernier circuit.
function applyAggregatedResults(finalCars) {
    for (const car of finalCars) {
        const summary = aggregateRounds(car.roundResults || []);
        car.score = summary.score;
        car.fitness = summary.fitness;
        car.aggregateFitness = summary.fitness;
        car.trackProgress = summary.trackProgress;
        car.finished = summary.finished;
    }
}

// Appelée quand la dernière voiture du tour est hors course (cars est vide, savedCars contient
// tout le tour). Renvoie true si un autre circuit vient d'être lancé, false quand la génération
// est complète : les résultats sont alors agrégés et nextGeneration() peut s'exécuter.
function advanceMultiTrackRound() {
    const roundPreset = trainingPreset();
    for (const car of savedCars) {
        car.roundResults = car.roundResults || [];
        car.roundResults.push(summarizeRound(car, roundPreset));
    }
    if (multiTrackRound >= MULTI_TRACK_SET.length - 1) {
        applyAggregatedResults(savedCars);
        return false;
    }

    const finishedRound = savedCars;
    const offsets = finishedRound.map(trackStartOffset); // avant de changer de circuit
    multiTrackRound++;
    setupTrack(trainingPreset());
    cars = finishedRound.map((car, index) => respawnOnCurrentTrack(car, offsets[index]));
    finishedRound.forEach(car => car.dispose());
    savedCars = [];
    return true;
}

// Après nextGeneration() (ou à la reprise d'un entraînement réussi) : la nouvelle population
// repart du premier circuit. Sans effet hors multi-circuits ou si le circuit ne change pas.
function beginMultiTrackGeneration() {
    if (!MULTI_TRACK_TRAINING) return;
    const offsets = cars.map(trackStartOffset); // relatif au circuit qui vient de se terminer
    multiTrackRound = 0;
    if (currentTrackPreset === trainingPreset()) return;
    setupTrack(trainingPreset());
    const previous = cars;
    cars = previous.map((car, index) => respawnOnCurrentTrack(car, offsets[index]));
    previous.forEach(car => car.dispose());
}
