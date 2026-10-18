function nextGeneration() {
    calculateFitness();

    const finishedCount = savedCars.filter(car => car.finished).length;
    const successRate = savedCars.length ? finishedCount / savedCars.length : 0;
    if (typeof recordGenerationResult === "function") {
        recordGenerationResult(savedCars);
    }
    console.info(
        `Génération ${generation} terminée. ` +
        `Succès : ${finishedCount}/${savedCars.length} (${(successRate * 100).toFixed(1)}%)`
    );
    archiveTopBrains(savedCars, 3, { onlyProgressed: true });

    if (successRate >= SUCCESS_RATE_TARGET) {
        trainingFinished = true;
        trainingActive = false;
        updateTrainingButton();
        setStatus(
            `Objectif atteint (${Math.round(successRate * 100)} %). ` +
            "Les meilleurs cerveaux sont archivés."
        );
        return;
    }

    const previousGeneration = savedCars;
    cars = buildNextPopulation(previousGeneration);

    previousGeneration.forEach(car => car.dispose());
    savedCars = [];
}

// Construit la population suivante : d'abord les élites (meilleurs cerveaux de la génération
// précédente, copiés SANS mutation), puis des enfants issus d'un tournoi et mutés.
// Les copies sont faites ici : l'ancienne génération peut être libérée (dispose) ensuite.
function buildNextPopulation(previousGeneration) {
    const population = [];
    const eliteCount = Math.min(Math.max(0, ELITE_COUNT), TOTAL_POP, previousGeneration.length);

    for (const elite of findEliteParents(previousGeneration, eliteCount)) {
        // Même cerveau et même point de départ (le départ est légèrement décalé au hasard
        // pour chaque voiture) : l'élite rejoue exactement le tour qui l'a classée première,
        // donc le meilleur score ne peut pas reculer d'une génération à l'autre.
        const survivor = new Car({ brain: elite.brain, position: elite.startPos });
        survivor.setPhysics(GAME_SPEED_LIMIT, CAR_ACCELERATION);
        population.push(survivor);
    }

    while (population.length < TOTAL_POP) {
        const child = createChild(previousGeneration);
        child.mutate(MUTATION_RATE);
        child.setPhysics(GAME_SPEED_LIMIT, CAR_ACCELERATION);
        population.push(child);
    }
    return population;
}

// Un enfant : croisement de deux parents distincts (tirés par tournoi) avec la probabilité
// CROSSOVER_RATE, sinon copie d'un seul parent. La mutation est appliquée ensuite par l'appelant.
function createChild(previousGeneration) {
    const firstParent = tournamentSelection(previousGeneration);
    if (!firstParent) return new Car();

    if (previousGeneration.length > 1 && randomUnit() < CROSSOVER_RATE) {
        const others = previousGeneration.filter(car => car !== firstParent);
        const secondParent = tournamentSelection(others);
        if (secondParent) {
            const crossedBrain = NeuralNetwork.crossover(firstParent.brain, secondParent.brain);
            const child = new Car(crossedBrain); // Car copie le cerveau reçu
            crossedBrain.dispose();              // ...on libère donc l'intermédiaire
            return child;
        }
    }
    return new Car(firstParent.brain);
}

function carRankingValue(car) {
    return Number.isFinite(car.fitness) ? car.fitness : Number(car.score) || 0;
}

// Les `count` meilleures voitures par fitness (égalité : l'ordre de la génération est conservé).
function findEliteParents(population, count) {
    if (count <= 0) return [];
    return [...population].sort((a, b) => carRankingValue(b) - carRankingValue(a)).slice(0, count);
}

function calculateFitness() {
    for (const car of savedCars) {
        // Multi-circuits : la fitness est déjà la moyenne de tous les tours (MultiTrack.js) ;
        // la recalculer ici la remplacerait par celle du seul dernier circuit.
        car.fitness = Number.isFinite(car.aggregateFitness) ? car.aggregateFitness : scoreCarFitness(car);
    }
}

function scoreCarFitness(car) {
    const averageSpeed = car.speedSamples ? car.speedTotal / car.speedSamples : 0;
    const progressReward = Math.min(car.trackProgress || 0, currentTrackLength()) * 0.12;
    const speedReward = averageSpeed * 8;
    const stagnationPenalty = (car.framesStalled || 0) * 0.7;
    const checkpointDelayPenalty = Math.max(0, (car.framesSinceLastCheckpoint || 0) - 120) * 0.04;
    const wrongWayPenalty = (car.wrongWayCount || 0) * 0.35;
    let fitness = car.score + progressReward + speedReward -
        stagnationPenalty - checkpointDelayPenalty - wrongWayPenalty;

    const nextCheckpoint = checkpoints[car.checkpointIndex];
    if (nextCheckpoint) {
        const center = p5.Vector.add(nextCheckpoint.a, nextCheckpoint.b).mult(0.5);
        const distance = p5.Vector.dist(car.pos, center);
        const proximityBonus = map(distance, 0, 400, 50, 0);
        fitness += max(0, proximityBonus) * 0.5;
    }
    return fitness;
}

function currentTrackLength() {
    if (Number.isFinite(TRACK_LENGTH) && TRACK_LENGTH > 0) return TRACK_LENGTH;
    return currentTrackPath.reduce((length, point, index, points) => {
        const next = points[(index + 1) % points.length];
        return length + dist(point[0], point[1], next[0], next[1]);
    }, 0);
}

function tournamentSelection(population) {
    if (!population.length) return null;

    const tournamentSize = Math.min(5, population.length);
    let best = null;
    for (let i = 0; i < tournamentSize; i++) {
        const candidate = population[randomIndex(population.length)];
        if (!best || candidate.fitness > best.fitness) {
            best = candidate;
        }
    }
    return best;
}

// Une voiture mérite l'archive si elle a validé au moins un checkpoint (score > 0) ou fini le tour.
function hasArchivableProgress(car) {
    return Boolean(car.finished) || Number(car.score) > 0;
}

/**
 * Archive les `count` meilleurs cerveaux. Avec `{ onlyProgressed: true }` (archivages
 * automatiques), les voitures sans progression sont ignorées pour ne pas remplir
 * l'archive (limitée à BrainStorage.MAX_BRAINS) de cerveaux inutiles.
 */
function archiveTopBrains(candidates, count, { onlyProgressed = false } = {}) {
    const eligible = onlyProgressed ? candidates.filter(hasArchivableProgress) : candidates;
    if (!eligible.length) return;
    const top = [...eligible]
        .sort((a, b) =>
            (Number.isFinite(b.fitness) ? b.fitness : b.score) -
            (Number.isFinite(a.fitness) ? a.fitness : a.score)
        )
        .slice(0, count);

    let recoveredArchive = false;
    let backupSaved = false;
    for (let index = 0; index < top.length; index++) {
        const car = top[index];
        const record = {
            // Identifiant d'archive : volontairement hors du flux à graine (il ne touche pas la simulation).
            id: `${Date.now()}-${generation}-${index}-${Math.random().toString(36).slice(2, 8)}`,
            name: `G${generation} · ${car.finished ? "terminée" : "score " + Math.round(car.score)}`,
            createdAt: new Date().toISOString(),
            generation,
            score: Number(car.score) || 0,
            fitness: Number(car.fitness) || 0,
            finished: Boolean(car.finished),
            trackProgress: Number(car.trackProgress) || 0,
            trackPreset: MULTI_TRACK_TRAINING ? "multi" : TRACK_PRESET,
            // Circuits sur lesquels ce cerveau (sa lignée) a été entraîné : sert à dire, en course,
            // si un circuit est inédit pour lui (voir Generalization.js).
            trainedOn: MULTI_TRACK_TRAINING ? [...MULTI_TRACK_SET] : [TRACK_PRESET],
            maxSpeed: car.maxSpeed,
            acceleration: car.maxForce,
            brain: car.brain.toJSON()
        };

        try {
            trainedBrains = brainStorage.save(record);
            // Chaque save() remet le drapeau à zéro : on retient s'il a été levé au moins une fois.
            if (brainStorage.recoveredFromCorruption) {
                recoveredArchive = true;
                backupSaved = brainStorage.backupSaved;
            }
        } catch (error) {
            console.error("Impossible de sauvegarder le cerveau entraîné.", error);
            setStatus(`Sauvegarde impossible : ${error.message}`, true);
            return;
        }
    }
    renderBrainList();
    if (recoveredArchive) {
        setStatus(
            "L’archive locale était abîmée : ses entrées invalides ont été retirées lors de l’archivage. " +
            (backupSaved
                ? "Les données d’origine sont gardées en sauvegarde dans le navigateur."
                : "La sauvegarde des données d’origine a échoué (espace insuffisant ?).")
        );
    }
}
