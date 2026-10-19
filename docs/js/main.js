let brainStorage;
let settingsStorage = null;
let selectedBrainIds = new Set();
let raceResultsShown = false;
const RACE_BOARD_ROWS = 8;           // lignes du classement affichées en course
const RACE_BOARD_REFRESH_FRAMES = 6; // le classement se redessine toutes les 6 images (et à chaque arrivée)
let trainingStateBeforeRace = null;
let brainArchiveAvailable = true;
let networkRefreshFrames = 0;
let raceTrackSwapped = false; // la course se déroule sur un autre circuit que l'entraînement

function setup() {
    const canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent("canvas-container");
    if (typeof describe === "function") {
        describe("Voitures pilotées par des réseaux neuronaux sur des circuits de difficulté variable.");
    }

    settingsStorage = createSettingsStorage();
    soundEngine = new SoundEngine({ storage: typeof localStorage !== "undefined" ? localStorage : null });
    effects = new EffectsSystem();
    effects.setEnabled(soundEngine.effectsEnabled);
    const restoredSettings = settingsStorage ? restoreSettings(settingsStorage) : 0;
    setupTrack();
    bindControls();
    bindSoundControls();
    syncMultiTrackControls();
    bindAnalysisPanels();
    loadBrainArchive();
    updateTrainingButton();

    tf.ready().then(() => {
        beginExperimentSeed();
        cars = Array.from({ length: TOTAL_POP }, () => new Car());
        trainingActive = true;
        generationStartedAt = Date.now();
        updateTrainingButton();
        if (brainArchiveAvailable) {
            setStatus(restoredSettings ? "Entraînement démarré avec les réglages précédents." : "Entraînement démarré.");
        }
    }).catch(error => {
        console.error("TensorFlow.js n’a pas pu initialiser le réseau neuronal.", error);
        setStatus(`Initialisation des réseaux impossible : ${error.message}`, true);
    });
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    if (trackEditorActive) cancelTrackEditor();
    setupTrack();
    if (effects) effects.clear();
    restartTraining("Le circuit a été recalculé à la taille de la fenêtre.");
}

function draw() {
    drawTrackSurface();

    if (!trackEditorActive && raceMode) {
        simulateRaceFrame();
    } else if (!trackEditorActive && trainingActive) {
        advanceTrainingFrame();
    }

    const leader = raceMode ? bestRaceCar : findTrainingLeader();
    drawSceneEntities(leader);
    updateEffectsAndSound(leader);
    networkRefreshFrames++;
    if (networkRefreshFrames >= 15) {
        networkRefreshFrames = 0;
        updateNetworkDiagram(false, leader);
    }
    if (typeof frameCount === "number" && frameCount % 6 === 0) {
        updateHud(leader);
    }
}

function advanceTrainingFrame() {
    let completedSteps = 0;
    while (completedSteps < TRAINING_STEPS_PER_FRAME && trainingActive) {
        simulateTrainingStep();
        completedSteps++;
    }
    return completedSteps;
}

function simulateTrainingStep() {
    for (let i = cars.length - 1; i >= 0; i--) {
        const car = cars[i];
        car.think(walls);
        car.update();
        updateTrackProgress(car);
        car.checkCheckpoints(checkpoints);
        checkCollisions(car);

        if (car.dead) {
            handleCarDeath(car);
            car.fitness = scoreCarFitness(car);
            savedCars.push(cars.splice(i, 1)[0]);
        }
    }

    if (cars.length === 0 && trainingActive) {
        // Multi-circuits : tant que tous les circuits n'ont pas été courus, on enchaîne le tour
        // suivant avec les mêmes cerveaux ; la sélection n'a lieu qu'après le dernier tour.
        if (MULTI_TRACK_TRAINING && savedCars.length && advanceMultiTrackRound()) return;
        nextGeneration();
        // Sur une réussite, aucune nouvelle population n'est créée : le numéro reste celui de
        // la génération terminée. continueTrainingFromArchive() l'incrémentera à la reprise.
        if (!trainingFinished) {
            generation++;
            if (MULTI_TRACK_TRAINING) beginMultiTrackGeneration();
            emitGameEvent("generation");
        } else {
            emitGameEvent("success");
        }
    }
}

function simulateRaceFrame() {
    // Le chronomètre compte des images simulées (pas l'horloge du navigateur) : il s'arrête
    // quand tout le monde est hors course ou que la simulation est en pause, et le temps de
    // tour de chaque voiture (Car.lapFrames) est comparable quelle que soit la fluidité du PC.
    if (raceCars.some(car => !car.dead)) raceFrames++;

    let someoneFinished = false;
    for (const car of raceCars) {
        if (car.dead) continue;
        const wasFinished = car.finished;
        car.think(walls);
        car.update();
        updateTrackProgress(car);
        car.checkCheckpoints(checkpoints);
        checkCollisions(car);
        if (car.dead) handleCarDeath(car);
        if (car.finished && !wasFinished) someoneFinished = true;
    }

    bestRaceCar = getRaceLeader();
    const raceOver = raceCars.length > 0 && raceCars.every(car => car.dead);
    refreshRaceTimer();
    const periodicRefresh = !raceOver && raceFrames % RACE_BOARD_REFRESH_FRAMES === 0;
    if (someoneFinished || raceOver && !raceResultsShown || periodicRefresh) {
        refreshRaceRanking();
    }
    if (!raceResultsShown && raceOver) {
        raceResultsShown = true;
        displayRaceResults();
    }
}

function getRaceLeader() {
    let leader = null;
    let leaderDistance = Infinity;
    for (const car of raceCars) {
        const distance = distanceToNextCheckpoint(car);
        if (!leader || isRaceCarAhead(car, leader, distance, leaderDistance)) {
            leader = car;
            leaderDistance = distance;
        }
    }
    return leader;
}

// Une voiture est devant une autre si elle a fini (la plus rapide d'abord), sinon si elle a
// le meilleur score, sinon si elle est plus proche de son prochain checkpoint.
function isRaceCarAhead(car, other, carDistance, otherDistance) {
    if (car.finished !== other.finished) return Boolean(car.finished);
    if (car.finished) {
        const carTime = Number.isFinite(car.lapFrames) ? car.lapFrames : Infinity;
        const otherTime = Number.isFinite(other.lapFrames) ? other.lapFrames : Infinity;
        if (carTime !== otherTime) return carTime < otherTime;
    }
    if (car.score !== other.score) return car.score > other.score;
    return carDistance < otherDistance;
}

// Classement de la course : les arrivées d'abord, au temps de tour croissant ; puis les
// voitures encore en piste ou sorties, par score puis proximité du prochain checkpoint.
function rankRaceCars(cars, distanceTo = distanceToNextCheckpoint) {
    return [...cars].sort((a, b) => {
        if (a === b) return 0;
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        if (a.finished) {
            const aTime = Number.isFinite(a.lapFrames) ? a.lapFrames : Infinity;
            const bTime = Number.isFinite(b.lapFrames) ? b.lapFrames : Infinity;
            if (aTime !== bTime) return aTime < bTime ? -1 : 1;
        }
        if (a.score !== b.score) return b.score - a.score;
        return distanceTo(a) - distanceTo(b);
    });
}

function distanceToNextCheckpoint(car) {
    const checkpoint = checkpoints[car.checkpointIndex];
    if (!checkpoint) return Infinity;
    const center = p5.Vector.add(checkpoint.a, checkpoint.b).mult(0.5);
    return p5.Vector.dist(car.pos, center);
}

function drawSceneEntities(leader = undefined) {
    if (showDebugSensors) {
        for (let i = 0; i < checkpoints.length; i++) {
            checkpoints[i].show();
            const center = p5.Vector.add(checkpoints[i].a, checkpoints[i].b).mult(0.5);
            noStroke();
            fill(246, 255, 252, 210);
            textSize(9);
            textAlign(CENTER, CENTER);
            text(i, center.x, center.y);
        }
    }

    for (const wall of walls) {
        wall.show();
    }

    const activeCars = raceMode ? raceCars : cars;
    if (leader === undefined) leader = raceMode ? bestRaceCar : findTrainingLeader();
    for (const car of activeCars) {
        car.show(car === leader, showDebugSensors && car === leader);
    }

    if (leader && checkpoints.length) {
        const target = checkpoints[leader.checkpointIndex];
        if (target) {
            const center = p5.Vector.add(target.a, target.b).mult(0.5);
            push();
            stroke(83, 184, 255, 210);
            strokeWeight(2);
            line(leader.pos.x, leader.pos.y, center.x, center.y);
            pop();
        }
    }
    if (trackEditorActive) drawTrackEditorDraft();
}

function findTrainingLeader() {
    const candidates = raceMode ? raceCars : cars;
    if (!candidates.length) {
        let savedLeader = null;
        let savedLeaderScore = -Infinity;
        for (const car of savedCars) {
            const score = car.fitness || car.score;
            if (score > savedLeaderScore) {
                savedLeader = car;
                savedLeaderScore = score;
            }
        }
        return savedLeader;
    }

    let leader = null;
    let leaderFitness = -Infinity;
    let leaderDistance = Infinity;
    for (const car of candidates) {
        const fitness = scoreCarFitness(car);
        const distance = distanceToNextCheckpoint(car);
        if (fitness > leaderFitness || fitness === leaderFitness && distance < leaderDistance) {
            leader = car;
            leaderFitness = fitness;
            leaderDistance = distance;
        }
    }
    return leader;
}

function updateTrackProgress(car) {
    if (currentTrackPath.length < 2) return;

    let closestIndex = 0;
    let closestDistanceSquared = Infinity;
    for (let index = 0; index < currentTrackPath.length; index++) {
        const point = currentTrackPath[index];
        const dx = point[0] - car.pos.x;
        const dy = point[1] - car.pos.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < closestDistanceSquared) {
            closestDistanceSquared = distanceSquared;
            closestIndex = index;
        }
    }

    car.trackLateralError = Math.sqrt(closestDistanceSquared);
    car.totalTravelDistance += p5.Vector.dist(car.lastTrackProgressPosition, car.pos);
    car.lastTrackProgressPosition.set(car.pos.x, car.pos.y);
    if (car.trackProgressIndex < 0) {
        car.trackProgressIndex = closestIndex;
    } else {
        const count = currentTrackPath.length;
        const forwardSteps = (closestIndex - car.trackProgressIndex + count) % count;
        const tangentStart = currentTrackPath[car.trackProgressIndex];
        const tangentEnd = currentTrackPath[(car.trackProgressIndex + 1) % count];
        const tangent = createVector(
            tangentEnd[0] - tangentStart[0],
            tangentEnd[1] - tangentStart[1]
        );
        const movingForward = tangent.magSq() === 0 || car.vel.dot(tangent.normalize()) >= 0;
        if (forwardSteps > 0 && forwardSteps <= count / 2 && movingForward) {
            const stepDistance = p5.Vector.dist(
                createVector(tangentStart[0], tangentStart[1]),
                createVector(tangentEnd[0], tangentEnd[1])
            );
            car.trackProgress += forwardSteps * stepDistance;
            car.trackProgressIndex = closestIndex;
        } else if (forwardSteps > count / 2) {
            const backwardSteps = count - forwardSteps;
            car.trackProgress = Math.max(
                0,
                car.trackProgress - backwardSteps * TRACK_POINT_SPACING * 0.5
            );
            car.trackProgressIndex = closestIndex;
        }
    }
    car.fitness = scoreCarFitness(car);
}

// ---------------------------------------------------------------------------------------------
// SONS ET EFFETS
// Purement cosmétiques : ils lisent l'état de la simulation et ne le modifient jamais. Chaque
// appel est protégé (les tests chargent main.js sans Sound.js / Effects.js).
// ---------------------------------------------------------------------------------------------
let fxLeader = null;          // voiture de tête suivie pour les effets (dérapage, checkpoints)
let fxLeaderHeading = 0;
let fxLeaderCheckpoint = 0;
const FX_SKID_TURN = 0.07;    // rotation du cap par image (rad) au-delà de laquelle la voiture dérape
const FX_FAST_FORWARD_STEPS = 3; // au-delà, la simulation accélérée est silencieuse (trop de chocs)

function emitGameEvent(type, data = {}) {
    const snd = typeof soundEngine !== "undefined" ? soundEngine : null;
    const fx = typeof effects !== "undefined" ? effects : null;
    const fastForward = !raceMode && TRAINING_STEPS_PER_FRAME >= FX_FAST_FORWARD_STEPS;
    const car = data.car;
    switch (type) {
        case "crash": {
            const ratio = car.maxSpeed ? Math.min(1, car.vel.mag() / car.maxSpeed) : 0.5;
            const isLeader = car === fxLeader;
            if (fx && (!fastForward || isLeader)) fx.crash(car.pos.x, car.pos.y, ratio, car.color);
            if (snd && !fastForward) snd.playCrash(ratio, isLeader || raceMode);
            break;
        }
        case "finish":
            if (fx) fx.confetti(car.pos.x, car.pos.y, 26);
            if (snd) snd.playFinish();
            break;
        case "success":
            if (fx) {
                fx.confetti(startX, startY, 90);
                fx.flashScreen([120, 255, 190], 0.28);
            }
            if (snd) snd.playFanfare();
            break;
        case "generation":
            if (snd && !fastForward) snd.playGeneration();
            break;
        case "raceStart":
            if (snd) snd.playRaceStart();
            break;
    }
}

function handleCarDeath(car) {
    if (car.finished) emitGameEvent("finish", { car });
    else if (car.crashed) emitGameEvent("crash", { car });
}

// Appelée une fois par image affichée, après le dessin des voitures.
function updateEffectsAndSound(leader) {
    const live = Boolean(leader) && !leader.dead && !trackEditorActive;
    const running = live && (raceMode || trainingActive);
    if (leader !== fxLeader) {
        fxLeader = leader || null;
        if (leader) {
            fxLeaderHeading = leader.vel.heading();
            fxLeaderCheckpoint = leader.checkpointIndex;
        }
    }

    if (typeof soundEngine !== "undefined" && soundEngine) {
        const ratio = running && leader.maxSpeed ? leader.vel.mag() / leader.maxSpeed : 0;
        soundEngine.updateEngine(ratio, running);
    }
    if (typeof effects === "undefined" || !effects) return;

    if (running) {
        const heading = leader.vel.heading();
        let turn = heading - fxLeaderHeading;
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;
        fxLeaderHeading = heading;
        const ratio = leader.maxSpeed ? leader.vel.mag() / leader.maxSpeed : 0;
        if (Math.abs(turn) > FX_SKID_TURN && ratio > 0.5) {
            effects.tireSmoke(leader.pos.x - Math.cos(heading) * 8, leader.pos.y - Math.sin(heading) * 8);
            if (typeof soundEngine !== "undefined" && soundEngine) soundEngine.playSkid(Math.abs(turn) * 6);
        }
        if (leader.checkpointIndex !== fxLeaderCheckpoint) {
            const passed = checkpoints[(leader.checkpointIndex - 1 + checkpoints.length) % checkpoints.length];
            if (passed) effects.gateFlash(passed.a, passed.b);
            if (typeof soundEngine !== "undefined" && soundEngine) soundEngine.playCheckpoint();
            fxLeaderCheckpoint = leader.checkpointIndex;
        }
    }
    effects.update();
    effects.draw();
}

// Contrôles du panneau « Son & effets » et du bouton du bandeau.
function bindSoundControls() {
    const toggle = document.getElementById("soundToggle");
    const button = document.getElementById("soundButton");
    const slider = document.getElementById("volumeSlider");
    const volumeOutput = document.getElementById("volumeVal");
    const effectsToggle = document.getElementById("effectsToggle");
    if (!toggle || !button || !slider || !effectsToggle) return;

    const refresh = () => {
        toggle.checked = soundEngine.enabled;
        button.textContent = soundEngine.enabled ? "🔊" : "🔇";
        button.setAttribute("aria-pressed", String(soundEngine.enabled));
        button.setAttribute("aria-label", soundEngine.enabled ? "Couper le son" : "Activer le son");
        slider.value = String(Math.round(soundEngine.volume * 100));
        const text = `${Math.round(soundEngine.volume * 100)} %`;
        volumeOutput.value = text;
        volumeOutput.textContent = text;
        effectsToggle.checked = effects.enabled;
    };
    refresh();

    toggle.addEventListener("change", () => {
        soundEngine.setEnabled(toggle.checked);
        soundEngine.playClick();
        refresh();
    });
    button.addEventListener("click", () => {
        soundEngine.setEnabled(!soundEngine.enabled);
        soundEngine.playClick();
        refresh();
    });
    slider.addEventListener("input", () => {
        soundEngine.setVolume(Number(slider.value) / 100);
        refresh();
    });
    slider.addEventListener("change", () => soundEngine.playClick());
    effectsToggle.addEventListener("change", () => {
        effects.setEnabled(effectsToggle.checked);
        soundEngine.setEffectsEnabled(effectsToggle.checked);
    });

    // Le navigateur n'autorise le son qu'après un geste de l'utilisateur.
    for (const eventName of ["pointerdown", "keydown"]) {
        window.addEventListener(eventName, () => soundEngine.unlock());
    }
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) soundEngine.suspend();
        else soundEngine.resume();
    });
    window.addEventListener("pagehide", () => soundEngine.dispose());
}

function checkCollisions(car) {
    // Collision balayée : on teste le trajet [lastStepPos -> pos] du pas, sinon une
    // voiture rapide (jusqu'à 20 px/pas) saute par-dessus un mur sans le toucher.
    // Le rectangle de la voiture (length × width, orienté selon la vitesse, comme dans
    // Car.show) est aussi testé à la position d'arrivée : le museau et les côtés comptent.
    const from = car.lastStepPos || car.pos;
    const hasHeading = car.vel && car.vel.magSq() > 0 && car.height;
    const heading = hasHeading ? car.vel.heading() : 0;
    for (const wall of walls) {
        if (distSegmentToSegment(from, car.pos, wall.a, wall.b) < car.width / 1.8 ||
            hasHeading && segmentHitsOrientedRect(
                wall.a, wall.b, car.pos, heading, car.height / 2, car.width / 2)) {
            car.dead = true;
            car.crashed = true; // mort par choc (et non par blocage) : déclenche son et effets
            return;
        }
    }
    if (car.pos.x < 0 || car.pos.x > width || car.pos.y < 0 || car.pos.y > height) {
        car.dead = true;
        car.crashed = true;
    }
}

function updateHud(leader = undefined) {
    const activeCars = raceMode ? raceCars : cars;
    if (leader === undefined) leader = raceMode ? bestRaceCar : findTrainingLeader();
    let aliveCount = 0;
    let speedTotal = 0;
    for (const car of activeCars) {
        if (!car.dead) {
            aliveCount++;
            speedTotal += car.vel.mag();
        }
    }
    const averageSpeed = aliveCount ? speedTotal / aliveCount : 0;
    const elapsedSeconds = generationStartedAt
        ? Math.max(0, (Date.now() - generationStartedAt) / 1000)
        : 0;
    const status = raceMode
        ? (aliveCount ? "Course en cours" : "Course terminée")
        : (trainingActive ? "Entraînement" : trainingFinished ? "Entraînement réussi" : "En pause");
    const history = learningHistory[learningHistory.length - 1];
    const stats = [
        ["Simulation", `${status} · ${trackLabel()}`],
        [raceMode ? "Temps de course" : `Génération ${generation}`,
            raceMode ? formatRaceTime(raceFrames) : formatElapsedTime(elapsedSeconds)],
        ["Vitesse moyenne", `${averageSpeed.toFixed(2)} / ${GAME_SPEED_LIMIT}`],
        ["Voitures en vie", `${aliveCount} / ${raceMode ? raceCars.length : TOTAL_POP}`],
        ["Score moyen / record", history
            ? `${Math.round(history.averageScore)} / ${Math.round(history.bestScore)}`
            : `${Math.round(leader ? leader.score : 0)} / —`],
        ["Cycles par image", `×${TRAINING_STEPS_PER_FRAME}`]
    ];
    if (activeSeed !== null) stats.push(["Graine", String(activeSeed)]);
    if (MULTI_TRACK_TRAINING && !raceMode) {
        stats.splice(2, 0, ["Circuit de la génération", `${multiTrackRound + 1} / ${MULTI_TRACK_SET.length}`]);
    }
    if (showDebugSensors && leader) {
        stats.push(["Capteurs (px)", leader.rays
            .map(ray => Number(ray.distance || 0).toFixed(0))
            .join(" · ")]);
    }
    document.getElementById("hud").replaceChildren(...stats.map(([label, value]) => {
        const item = document.createElement("div");
        item.className = "hud-stat";
        const caption = document.createElement("span");
        caption.textContent = label;
        const reading = document.createElement("strong");
        reading.textContent = value;
        item.append(caption, reading);
        return item;
    }));
}

function recordGenerationResult(generationCars) {
    const scores = generationCars.map(car => Number(car.score) || 0);
    const speedSamples = generationCars.reduce((total, car) => total + car.speedSamples, 0);
    const speedTotal = generationCars.reduce((total, car) => total + car.speedTotal, 0);
    const result = {
        generation,
        averageScore: scores.length
            ? scores.reduce((total, score) => total + score, 0) / scores.length
            : 0,
        bestScore: scores.length ? Math.max(...scores) : 0,
        averageSpeed: speedSamples ? speedTotal / speedSamples : 0,
        elapsedSeconds: generationStartedAt
            ? Math.max(0, (Date.now() - generationStartedAt) / 1000)
            : 0
    };
    learningHistory.push(result);
    if (learningHistory.length > 250) learningHistory.shift();
    generationStartedAt = Date.now();
    document.getElementById("learningSummary").textContent =
        `Génération ${result.generation} · moyenne ${Math.round(result.averageScore)} · ` +
        `record ${Math.round(result.bestScore)} · ${formatElapsedTime(result.elapsedSeconds)}`;
    drawLearningChart();
    updateLearningExportButton();
    updateNetworkDiagram(true);
}

function learningChartSeries(history) {
    return history.map(result => ({
        generation: result.generation,
        averageScore: Number(result.averageScore) || 0,
        bestScore: Number(result.bestScore) || 0
    }));
}

const LEARNING_CSV_COLUMNS = [
    ["generation", "generation"],
    ["score_moyen", "averageScore"],
    ["meilleur_score", "bestScore"],
    ["vitesse_moyenne", "averageSpeed"],
    ["duree_s", "elapsedSeconds"]
];

// Une valeur non numérique ou non finie est exportée comme 0 : le CSV reste
// toujours lisible par un tableur ou un script d'analyse.
function formatLearningCsvValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? String(Math.round(number * 1000) / 1000) : "0";
}

// Convertit l'historique de la courbe en CSV (séparateur « , », point décimal,
// fins de ligne CRLF selon la RFC 4180). Une ligne par génération terminée.
function learningHistoryToCsv(history) {
    const lines = [LEARNING_CSV_COLUMNS.map(([name]) => name).join(",")];
    for (const result of history) {
        lines.push(LEARNING_CSV_COLUMNS
            .map(([, key]) => formatLearningCsvValue(result[key]))
            .join(","));
    }
    return lines.join("\r\n") + "\r\n";
}

function updateLearningExportButton() {
    const button = document.getElementById("exportLearningCsv");
    if (button) button.disabled = learningHistory.length === 0;
}

function exportLearningCurve() {
    if (!learningHistory.length) {
        setStatus("Aucune génération terminée : la courbe est vide.", true);
        return;
    }
    try {
        const file = new Blob([learningHistoryToCsv(learningHistory)], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        const seedSuffix = activeSeed === null ? "" : `-graine-${activeSeed}`;
        link.download = `courbe-apprentissage-${MULTI_TRACK_TRAINING ? "multi-circuits" : TRACK_PRESET}${seedSuffix}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        setStatus(`Courbe exportée : ${learningHistory.length} génération(s).`);
    } catch (error) {
        console.error("L’export de la courbe a échoué.", error);
        setStatus(`Export impossible : ${error.message}`, true);
    }
}

function drawLearningChart() {
    const canvas = document.getElementById("learningChart");
    const content = document.getElementById("learningContent");
    if (!canvas || !content || content.hidden) return;
    const context = canvas.getContext("2d");
    const { width: chartWidth, height: chartHeight } = canvas;
    const padding = { left: 60, right: 18, top: 26, bottom: 42 };
    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = chartHeight - padding.top - padding.bottom;
    const series = learningChartSeries(learningHistory);
    context.clearRect(0, 0, chartWidth, chartHeight);
    context.font = "14px Segoe UI, sans-serif";
    context.textBaseline = "middle";

    if (!series.length) {
        context.fillStyle = "#94a8b1";
        context.textAlign = "center";
        context.fillText("Les scores apparaîtront après la première génération.", chartWidth / 2, chartHeight / 2);
        return;
    }

    const maximum = Math.max(100, ...series.map(result => result.bestScore)) * 1.1;
    context.strokeStyle = "rgba(205,225,229,0.12)";
    context.fillStyle = "#94a8b1";
    context.lineWidth = 1;
    context.textAlign = "right";
    for (let tick = 0; tick <= 4; tick++) {
        const y = padding.top + (plotHeight * tick) / 4;
        const score = maximum * (1 - tick / 4);
        context.beginPath();
        context.moveTo(padding.left, y);
        context.lineTo(chartWidth - padding.right, y);
        context.stroke();
        context.fillText(String(Math.round(score)), padding.left - 6, y);
    }

    const drawSeries = (key, color) => {
        context.strokeStyle = color;
        context.lineWidth = 2;
        context.beginPath();
        series.forEach((result, index) => {
            const x = series.length === 1
                ? padding.left + plotWidth / 2
                : padding.left + (index / (series.length - 1)) * plotWidth;
            const y = padding.top + (1 - Math.min(1, result[key] / maximum)) * plotHeight;
            if (index === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
        });
        context.stroke();
    };
    drawSeries("averageScore", "#56c5ff");
    drawSeries("bestScore", "#ffd45c");

    context.fillStyle = "#94a8b1";
    context.textAlign = "left";
    context.fillText(`G${series[0].generation}`, padding.left, chartHeight - 10);
    context.textAlign = "right";
    context.fillText(`G${series[series.length - 1].generation}`, chartWidth - padding.right, chartHeight - 10);
}

function updateNetworkDiagram(force = false, currentLeader = undefined) {
    const content = document.getElementById("networkContent");
    if (!content || content.hidden) return;
    const container = document.getElementById("networkDiagram");
    if (!container) return;
    const leader = currentLeader === undefined
        ? raceMode ? bestRaceCar : findTrainingLeader()
        : currentLeader;
    if (!leader) {
        currentNetworkLeader = null;
        container.replaceChildren();
        document.getElementById("networkSummary").textContent =
            "Aucune voiture disponible pour afficher son réseau.";
        return;
    }
    if (!force && currentNetworkLeader === leader) return;

    const snapshot = leader.brain.toJSON();
    const inputCount = snapshot.inputNodes;
    const hiddenCount = snapshot.hiddenNodes;
    const outputCount = snapshot.outputNodes;
    const svgNamespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNamespace, "svg");
    const svgWidth = 440;
    const svgHeight = Math.max(190, Math.min(560, hiddenCount * 7 + 70));
    const layerX = [58, 220, 382];
    const layerCounts = [inputCount, hiddenCount, outputCount];
    const layerNames = ["Entrées", `Cachée · ${snapshot.activation}`, "Sorties"];
    const nodePositions = layerCounts.map((count, layerIndex) =>
        Array.from({ length: count }, (_, index) => ({
            x: layerX[layerIndex],
            y: 30 + ((index + 1) * (svgHeight - 54)) / (count + 1)
        }))
    );
    svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Réseau ${inputCount}-${hiddenCount}-${outputCount} du meilleur agent`);

    const appendText = (x, y, text, className) => {
        const label = document.createElementNS(svgNamespace, "text");
        label.setAttribute("x", x);
        label.setAttribute("y", y);
        label.setAttribute("class", className);
        label.textContent = text;
        svg.appendChild(label);
    };
    layerNames.forEach((name, index) => appendText(layerX[index], 15, name, "network-layer-label"));

    const maximumWeight = Math.max(0.0001, ...snapshot.weights.flatMap(weight =>
        weight.values.map(value => Math.abs(value))
    ));
    const connections = [
        { weights: snapshot.weights[0], from: inputCount, to: hiddenCount, fromLayer: 0, toLayer: 1 },
        { weights: snapshot.weights[2], from: hiddenCount, to: outputCount, fromLayer: 1, toLayer: 2 }
    ];
    for (const layer of connections) {
        for (let fromIndex = 0; fromIndex < layer.from; fromIndex++) {
            for (let toIndex = 0; toIndex < layer.to; toIndex++) {
                const weight = layer.weights.values[fromIndex * layer.to + toIndex];
                const magnitude = Math.abs(weight) / maximumWeight;
                const edge = document.createElementNS(svgNamespace, "line");
                edge.setAttribute("x1", nodePositions[layer.fromLayer][fromIndex].x);
                edge.setAttribute("y1", nodePositions[layer.fromLayer][fromIndex].y);
                edge.setAttribute("x2", nodePositions[layer.toLayer][toIndex].x);
                edge.setAttribute("y2", nodePositions[layer.toLayer][toIndex].y);
                edge.setAttribute("class", "network-edge");
                edge.setAttribute("stroke", weight >= 0 ? "#52d4aa" : "#ff806d");
                edge.setAttribute("stroke-width", String(0.4 + magnitude * 1.9));
                edge.setAttribute("opacity", String(0.12 + magnitude * 0.75));
                edge.addEventListener("pointerenter", () => {
                    document.getElementById("networkTooltip").textContent =
                        `Poids ${layer.fromLayer === 0 ? "entrée" : "caché"} ${fromIndex + 1} → ` +
                        `${layer.toLayer === 1 ? "caché" : "sortie"} ${toIndex + 1} : ${weight.toFixed(4)}`;
                });
                svg.appendChild(edge);
            }
        }
    }

    const nodeLabels = [
        ["Rayon gauche", "Rayon gauche-centre", "Rayon centre", "Rayon droite-centre", "Rayon droite", "Vitesse"],
        Array.from({ length: hiddenCount }, (_, index) => `Neurone caché ${index + 1}`),
        ["Direction", "Accélération"]
    ];
    nodePositions.forEach((positions, layerIndex) => {
        positions.forEach((position, index) => {
            const node = document.createElementNS(svgNamespace, "circle");
            node.setAttribute("cx", position.x);
            node.setAttribute("cy", position.y);
            node.setAttribute("r", layerIndex === 1 ? "3.2" : "5.2");
            node.setAttribute("class", "network-node");
            node.setAttribute("fill", layerIndex === 0 ? "#54b8ff" :
                layerIndex === 1 ? "#52d4aa" : "#ffd45c");
            node.addEventListener("pointerenter", () => {
                const bias = layerIndex === 0 ? "" :
                    ` · biais ${snapshot.weights[layerIndex === 1 ? 1 : 3].values[index].toFixed(4)}`;
                document.getElementById("networkTooltip").textContent =
                    `${nodeLabels[layerIndex][index] || `Neurone ${index + 1}`}${bias}`;
            });
            svg.appendChild(node);
            if (layerIndex !== 1) {
                const shortLabel = layerIndex === 0 ? `E${index + 1}` : `S${index + 1}`;
                appendText(position.x, position.y + 15, shortLabel, "network-node-label");
            }
        });
    });

    container.replaceChildren(svg);
    currentNetworkLeader = leader;
    document.getElementById("networkSummary").textContent =
        `${leader.name || "Meilleur agent"} · score ${Math.round(leader.score)} · ` +
        `architecture ${inputCount}–${hiddenCount}–${outputCount}`;
}

function formatElapsedTime(seconds) {
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

// Temps de course au centième : 83 images à 60 i/s → « 0:01.38 ». Sans valeur → « — ».
function formatRaceTime(frames) {
    if (!Number.isFinite(frames) || frames < 0) return "—";
    const centiseconds = Math.floor(frames * 100 / RACE_FPS);
    const minutes = Math.floor(centiseconds / 6000);
    const seconds = Math.floor(centiseconds / 100) % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
}

function beginTrackEditor() {
    if (raceMode) exitBrainRace();
    trackEditorPreviousState = {
        trainingActive,
        trainingFinished
    };
    trackEditorActive = true;
    trackEditorDraft = [];
    trainingActive = false;
    updateTrainingButton();
    document.getElementById("trackEditorToolbar").hidden = false;
    document.getElementById("canvas-container").classList.add("canvas-editing");
    showEditorMessage("");
    setStatus("Dessine une boucle fermée, puis termine le circuit.");
}

function addTrackDraftPoint(x, y) {
    if (!trackEditorActive || x < 0 || y < 0 || x > width || y > height) return;
    const last = trackEditorDraft[trackEditorDraft.length - 1];
    if (!last || Math.hypot(x - last[0], y - last[1]) >= 7) {
        trackEditorDraft.push([x, y]);
    }
}

// p5 appelle mousePressed/mouseDragged pour TOUT clic de la page (boutons, panneau, barre
// d'outils compris). On ne dessine donc que si l'événement vient bien du canvas ; sinon un
// clic sur « Terminer le circuit » ajoutait un point au tracé juste avant sa validation.
function isCanvasEvent(event) {
    const target = event && event.target;
    return !!target && target.tagName === "CANVAS" && !!target.closest("#canvas-container");
}

function mousePressed(event) {
    if (!trackEditorActive || !isCanvasEvent(event)) return;
    addTrackDraftPoint(mouseX, mouseY);
    return false;
}

function mouseDragged(event) {
    if (!trackEditorActive || !isCanvasEvent(event)) return;
    addTrackDraftPoint(mouseX, mouseY);
    return false;
}

function drawTrackEditorDraft() {
    if (!trackEditorDraft.length) return;
    push();
    noFill();
    stroke(16, 25, 28, 210);
    strokeWeight(TRACK_WIDTH + 8);
    strokeJoin(ROUND);
    strokeCap(ROUND);
    beginShape();
    for (const point of trackEditorDraft) vertex(point[0], point[1]);
    if (trackEditorDraft.length > 2) {
        vertex(trackEditorDraft[0][0], trackEditorDraft[0][1]);
    }
    endShape();

    noFill();
    stroke("#54e4ba");
    strokeWeight(3);
    beginShape();
    for (const point of trackEditorDraft) vertex(point[0], point[1]);
    if (trackEditorDraft.length > 2) {
        vertex(trackEditorDraft[0][0], trackEditorDraft[0][1]);
    }
    endShape();
    noStroke();
    fill("#fff2a6");
    circle(trackEditorDraft[0][0], trackEditorDraft[0][1], 9);
    pop();
}

function polygonArea(points) {
    return Math.abs(points.reduce((area, point, index) => {
        const next = points[(index + 1) % points.length];
        return area + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2);
}

// Les erreurs de l'éditeur s'affichent dans la barre « Terminer le circuit » (visible pendant le
// dessin), pas seulement dans le panneau de réglages où le message passait inaperçu.
function showEditorMessage(message, isError = true) {
    const box = document.getElementById("trackEditorMessage");
    if (box) {
        box.textContent = message;
        box.hidden = !message;
        box.classList.toggle("error", isError);
    }
    if (message) setStatus(message, isError);
}

function finishTrackEditor() {
    if (!trackEditorActive) return;
    // Le trait dépasse souvent un peu son point de départ : on referme la boucle proprement.
    const closedDraft = closeDraftLoop(trackEditorDraft);
    if (closedDraft !== trackEditorDraft) trackEditorDraft = closedDraft;
    const tooShort = trackEditorDraft.length < 16;
    // Le croisement se teste avant l'aire : l'aire signée d'une boucle en « 8 » s'annule
    // et ferait afficher à tort « trop petit ».
    if (!tooShort && findLoopSelfIntersection(trackEditorDraft)) {
        showEditorMessage("Le circuit se recoupe lui-même. Clique sur Annuler, puis redessine une boucle sans croisement.");
        return;
    }
    if (tooShort || polygonArea(trackEditorDraft) < width * height * 0.015) {
        showEditorMessage("Le circuit est trop court ou trop petit. Dessine une boucle plus grande.");
        return;
    }
    showEditorMessage("");

    customTrackPath = trackEditorDraft.map(point => [...point]);
    TRACK_PRESET = "custom";
    document.getElementById("trackSelect").value = "custom";
    trackEditorActive = false;
    document.getElementById("trackEditorToolbar").hidden = true;
    document.getElementById("canvas-container").classList.remove("canvas-editing");
    setupTrack();
    trackEditorDraft = [];
    if (MULTI_TRACK_TRAINING) {
        // Les circuits d'entraînement ne changent pas : on ne relance pas l'entraînement. Le circuit
        // dessiné est un circuit INÉDIT idéal pour vérifier ce que les cerveaux ont appris.
        if (trackEditorPreviousState) {
            trainingActive = trackEditorPreviousState.trainingActive;
            trainingFinished = trackEditorPreviousState.trainingFinished;
        }
        trackEditorPreviousState = null;
        chooseRaceTrack("custom");
        updateTrainingButton();
        setStatus("Circuit dessiné enregistré. L’entraînement multi-circuits continue ; " +
            "lance une course pour y tester les cerveaux archivés.");
        return;
    }
    restartTraining("Circuit dessiné chargé. L’entraînement repart sur cette piste.");
}

function cancelTrackEditor() {
    if (!trackEditorActive) return;
    trackEditorActive = false;
    trackEditorDraft = [];
    document.getElementById("trackEditorToolbar").hidden = true;
    document.getElementById("canvas-container").classList.remove("canvas-editing");
    showEditorMessage("");
    if (trackEditorPreviousState) {
        trainingActive = trackEditorPreviousState.trainingActive;
        trainingFinished = trackEditorPreviousState.trainingFinished;
    }
    trackEditorPreviousState = null;
    updateTrainingButton();
    setStatus("Édition annulée; le circuit et l’entraînement sont conservés.");
}

function resetTrackEditor() {
    if (customTrackPath.length && !window.confirm("Effacer le circuit dessiné et revenir au circuit débutant ?")) {
        return;
    }
    cancelTrackEditor();
    customTrackPath = [];
    TRACK_PRESET = "easy";
    document.getElementById("trackSelect").value = "easy";
    if (RACE_TRACK_CHOICE === "custom") chooseRaceTrack("auto");
    setupTrack();
    if (MULTI_TRACK_TRAINING) {
        setStatus("Circuit dessiné effacé ; l’entraînement multi-circuits continue.");
        return;
    }
    restartTraining("Circuit débutant restauré.");
}

function bindControls() {
    const settingsPanel = document.getElementById("settingsPanel");
    const settingsToggle = document.getElementById("settingsToggle");
    settingsToggle.addEventListener("click", () => {
        const isHidden = !settingsPanel.hidden;
        if (!isHidden) {
            for (const buttonId of ["learningToggle", "networkToggle"]) {
                const button = document.getElementById(buttonId);
                if (button.getAttribute("aria-expanded") === "true") button.click();
            }
        }
        settingsPanel.hidden = isHidden;
        settingsToggle.setAttribute("aria-expanded", String(!isHidden));
        settingsToggle.textContent = isHidden ? "Afficher les réglages" : "Masquer les réglages";
    });

    // Les contrôles du panneau déclenchent « change » après avoir mis à jour leur variable globale :
    // on enregistre alors l'état courant des réglages.
    settingsPanel.addEventListener("change", () => {
        if (settingsStorage) persistSettings(settingsStorage);
    });

    bindRange("speedSlider", "speedVal", value => {
        GAME_SPEED_LIMIT = value;
        updatePhysics();
    }, value => String(value));
    bindRange("accelerationSlider", "accelerationVal", value => {
        CAR_ACCELERATION = value;
        updatePhysics();
    }, value => value.toFixed(1));
    bindRange("stepsSlider", "stepsVal", value => {
        TRAINING_STEPS_PER_FRAME = value;
    }, value => String(value));
    bindRange("neuronsSlider", "neuronsVal", value => {
        HIDDEN_NODES = value;
        restartTraining("Architecture réinitialisée avec le nouveau nombre de neurones.");
    }, value => String(value), "change");
    bindRange("populationSlider", "populationVal", value => {
        TOTAL_POP = value;
        restartTraining("Nouvelle taille de population appliquée.");
    }, value => String(value), "change");
    bindRange("mutationSlider", "mutationVal", value => {
        MUTATION_RATE = value / 100;
    }, value => `${value} %`);
    bindRange("crossoverSlider", "crossoverVal", value => {
        CROSSOVER_RATE = value / 100;
    }, value => `${value} %`);
    bindRange("successSlider", "successVal", value => {
        SUCCESS_RATE_TARGET = value / 100;
    }, value => `${value} %`);
    bindRange("diffSlider", "diffVal", value => {
        TRACK_DIFFICULTY = value;
        setupTrack();
        restartTraining("Circuit et entraînement réinitialisés selon la complexité choisie.");
    }, value => String(value), "change");
    bindRange("widthSlider", "widthVal", value => {
        TRACK_WIDTH = value;
        setupTrack();
        restartTraining("Circuit et entraînement réinitialisés selon la largeur choisie.");
    }, value => String(value), "change");

    document.getElementById("activationSelect").addEventListener("change", event => {
        HIDDEN_ACTIVATION = event.target.value;
        restartTraining(`Nouvelle activation : ${HIDDEN_ACTIVATION}.`);
    });
    document.getElementById("trackSelect").addEventListener("change", event => {
        if (event.target.value === "custom" && customTrackPath.length < 8) {
            event.target.value = TRACK_PRESET;
            beginTrackEditor();
            return;
        }
        TRACK_PRESET = event.target.value;
        setupTrack();
        restartTraining(`Circuit ${trackLabel()} sélectionné.`);
    });
    document.getElementById("multiTrackToggle").addEventListener("change", event => {
        MULTI_TRACK_TRAINING = event.target.checked;
        multiTrackRound = 0;
        setupTrack();
        syncMultiTrackControls();
        restartTraining(MULTI_TRACK_TRAINING
            ? `Entraînement sur ${MULTI_TRACK_SET.length} circuit(s) : chaque génération les court tous.`
            : `Retour à un seul circuit : ${trackLabel()}.`);
    });
    for (const preset of MULTI_TRACK_ORDER) {
        document.getElementById(`multiTrack-${preset}`).addEventListener("change", event => {
            MULTI_TRACK_SET = selectTrackPreset(MULTI_TRACK_SET, preset, event.target.checked);
            syncMultiTrackControls(); // recoche la case si c'était le dernier circuit
            if (!MULTI_TRACK_TRAINING) return;
            multiTrackRound = 0;
            setupTrack();
            restartTraining(`Circuits d’entraînement : ${MULTI_TRACK_SET.map(presetLabel).join(", ")}.`);
        });
    }
    document.getElementById("raceTrackSelect").addEventListener("change", event => {
        if (event.target.value === "custom" && customTrackPath.length < 8) {
            event.target.value = RACE_TRACK_CHOICE;
            setStatus("Dessine d’abord un circuit (« Dessiner un circuit ») pour pouvoir y courir.", true);
            return;
        }
        RACE_TRACK_CHOICE = event.target.value;
    });
    const debugToggle = document.getElementById("debugToggle");
    debugToggle.checked = showDebugSensors;
    debugToggle.addEventListener("change", event => {
        showDebugSensors = event.target.checked;
    });
    document.getElementById("trainingToggle").addEventListener("click", toggleTraining);
    document.getElementById("saveGenerationButton").addEventListener("click", saveCurrentTop);
    document.getElementById("selectAllBrains").addEventListener("click", toggleSelectAll);
    document.getElementById("raceButton").addEventListener("click", startBrainRace);
    document.getElementById("exitRaceButton").addEventListener("click", exitBrainRace);
    document.getElementById("exportBrains").addEventListener("click", exportBrains);
    document.getElementById("exportLearningCsv").addEventListener("click", exportLearningCurve);
    document.getElementById("clearBrains").addEventListener("click", clearBrainArchive);
    document.getElementById("seedInput").addEventListener("change", applySeedFromInput);
    document.getElementById("replaySeedButton").addEventListener("click", replaySeed);
    document.getElementById("drawTrackButton").addEventListener("click", beginTrackEditor);
    document.getElementById("resetTrackButton").addEventListener("click", resetTrackEditor);
    document.getElementById("finishTrackButton").addEventListener("click", finishTrackEditor);
    document.getElementById("cancelTrackButton").addEventListener("click", cancelTrackEditor);
    document.getElementById("importBrains").addEventListener("change", importBrains);
}

function bindAnalysisPanels() {
    const panels = [
        { button: "learningToggle", content: "learningContent", render: drawLearningChart },
        { button: "networkToggle", content: "networkContent", render: () => updateNetworkDiagram(true) }
    ];

    for (const panel of panels) {
        const button = document.getElementById(panel.button);
        const content = document.getElementById(panel.content);
        button.addEventListener("click", () => {
            const expanded = button.getAttribute("aria-expanded") !== "true";
            button.setAttribute("aria-expanded", String(expanded));
            button.querySelector("span").textContent = expanded ? "−" : "+";
            content.hidden = !expanded;
            if (panel.button === "learningToggle") {
                document.body.classList.toggle("learning-expanded", expanded);
            }
            if (expanded) {
                const settingsPanel = document.getElementById("settingsPanel");
                const settingsToggle = document.getElementById("settingsToggle");
                const analysisBounds = button.closest(".analysis-panel").getBoundingClientRect();
                const settingsBounds = settingsPanel.getBoundingClientRect();
                const overlaps = analysisBounds.left < settingsBounds.right &&
                    analysisBounds.right > settingsBounds.left &&
                    analysisBounds.top < settingsBounds.bottom &&
                    analysisBounds.bottom > settingsBounds.top;
                if (!settingsPanel.hidden && overlaps) {
                    settingsPanel.hidden = true;
                    settingsToggle.setAttribute("aria-expanded", "false");
                    settingsToggle.textContent = "Afficher les réglages";
                }
            }
            if (expanded) panel.render();
        });
    }
}

function bindRange(inputId, outputId, callback, formatter, eventName = "input") {
    const input = document.getElementById(inputId);
    const output = document.getElementById(outputId);
    const update = () => {
        const value = Number(input.value);
        output.value = formatter(value);
        output.textContent = formatter(value);
        callback(value);
    };
    input.addEventListener(eventName, update);
    if (eventName !== "input") {
        input.addEventListener("input", () => {
            output.value = formatter(Number(input.value));
            output.textContent = formatter(Number(input.value));
        });
    }
}

function toggleTraining() {
    if (raceMode) {
        exitBrainRace();
        return;
    }
    if (trainingActive) {
        trainingActive = false;
        setStatus("Entraînement en pause.");
    } else if (trainingFinished) {
        continueTrainingFromArchive();
        return;
    } else {
        trainingActive = true;
        setStatus("Entraînement repris.");
    }
    updateTrainingButton();
}

function updateTrainingButton() {
    const button = document.getElementById("trainingToggle");
    if (button) {
        button.textContent = trainingActive
            ? "Pause"
            : trainingFinished ? "Continuer l’évolution" : "Reprendre";
    }
}

function continueTrainingFromArchive() {
    const previousGeneration = savedCars;
    cars = buildNextPopulation(previousGeneration);
    previousGeneration.forEach(car => car.dispose());
    savedCars = [];
    if (MULTI_TRACK_TRAINING) beginMultiTrackGeneration();
    generation++;
    trainingFinished = false;
    trainingActive = true;
    updateTrainingButton();
    setStatus("Nouvelle génération issue des cerveaux archivés.");
}

// Graine de l'expérience qui démarre : celle imposée dans le champ, sinon une graine tirée au
// hasard. Elle est affichée pour qu'une expérience intéressante puisse être rejouée à l'identique.
// À appeler juste avant de créer la première population : tout le hasard en dépend ensuite.
function beginExperimentSeed() {
    activeSeed = seedRandom(RANDOM_SEED !== null ? RANDOM_SEED : drawRandomSeed());
    updateSeedDisplay();
}

function updateSeedDisplay() {
    const used = document.getElementById("seedUsed");
    if (!used) return;
    used.textContent = activeSeed === null
        ? ""
        : `Expérience en cours : graine ${activeSeed} (${RANDOM_SEED === null ? "tirée au hasard" : "imposée"}).`;
}

// Champ « Graine aléatoire » validé : une graine valide relance l'expérience depuis le début ;
// un champ vide repasse en graine automatique ; tout le reste est refusé (pas d'arrondi silencieux).
function applySeedFromInput() {
    const input = document.getElementById("seedInput");
    const text = input.value.trim();
    const seed = parseSeed(text);
    if (text !== "" && seed === null) {
        input.value = RANDOM_SEED === null ? "" : String(RANDOM_SEED);
        setStatus(`Graine refusée : saisis un entier de 0 à ${MAX_SEED}, ou laisse le champ vide pour une graine automatique.`, true);
        return;
    }
    RANDOM_SEED = seed;
    input.value = seed === null ? "" : String(seed);
    restartTraining(seed === null
        ? "Graine automatique : nouvelle expérience tirée au hasard."
        : `Graine ${seed} : l’expérience repart du début.`);
}

// « Rejouer » : fige la graine de l'expérience en cours puis relance depuis le début. Même graine +
// mêmes réglages = même évolution ; changer un réglage avant de rejouer isole son effet.
function replaySeed() {
    if (activeSeed === null) {
        setStatus("L’entraînement n’a pas encore démarré : aucune graine à rejouer.", true);
        return;
    }
    RANDOM_SEED = activeSeed;
    document.getElementById("seedInput").value = String(activeSeed);
    if (settingsStorage) persistSettings(settingsStorage);
    restartTraining(`Graine ${activeSeed} rejouée : même départ, même tirage.`);
}

function updatePhysics() {
    for (const car of [...cars, ...raceCars]) {
        car.setPhysics(GAME_SPEED_LIMIT, CAR_ACCELERATION);
    }
}

function restartTraining(message) {
    exitBrainRace(false);
    archiveTopBrains([...cars, ...savedCars], 5, { onlyProgressed: true });
    // Une nouvelle population repart toujours du premier circuit de la génération.
    multiTrackRound = 0;
    if (MULTI_TRACK_TRAINING && currentTrackPreset !== trainingPreset()) setupTrack();
    [...cars, ...savedCars, ...raceCars].forEach(car => car.dispose());
    beginExperimentSeed(); // nouvelle expérience : le hasard repart de la graine, avant toute voiture
    cars = Array.from({ length: TOTAL_POP }, () => new Car());
    savedCars = [];
    raceCars = [];
    generation = 0;
    learningHistory = [];
    currentNetworkLeader = null;
    generationStartedAt = Date.now();
    document.getElementById("learningSummary").textContent =
        "Les résultats apparaîtront à la fin de la première génération.";
    drawLearningChart();
    updateLearningExportButton();
    updateNetworkDiagram(true);
    trainingFinished = false;
    trainingActive = true;
    bestRaceCar = null;
    raceResultsShown = false;
    if (effects) effects.clear();
    updateTrainingButton();
    setStatus(message);
}

function saveCurrentTop() {
    const candidates = [...cars, ...savedCars];
    if (!candidates.length) {
        setStatus("Aucune voiture à archiver pour le moment.", true);
        return;
    }
    candidates.forEach(car => {
        if (!Number.isFinite(car.fitness)) car.fitness = car.score;
    });
    archiveTopBrains(candidates, 5);
    setStatus("Les meilleurs cerveaux de la génération ont été archivés.");
}

function loadBrainArchive() {
    brainStorage = new BrainStorage();
    try {
        if (brainStorage.isCorrupted()) {
            // Réparation annoncée : la copie brute est sauvegardée avant la réécriture.
            trainedBrains = brainStorage.repair();
            setStatus(
                `L’archive locale était abîmée : ${trainedBrains.length} cerveau(x) valide(s) conservé(s). ` +
                backupNotice(brainStorage)
            );
        } else {
            trainedBrains = brainStorage.list();
        }
        renderBrainList();
    } catch (error) {
        brainArchiveAvailable = false;
        console.error("Impossible de lire l’archive des cerveaux.", error);
        setStatus(error.message, true);
    }
}

function backupNotice(storage) {
    return storage.backupSaved
        ? "Les données d’origine sont gardées en sauvegarde dans le navigateur."
        : "La sauvegarde des données d’origine a échoué (espace insuffisant ?).";
}

function clearBrainArchive() {
    const count = trainedBrains.length;
    if (count === 0) {
        setStatus("La liste de cerveaux est déjà vide.");
        return;
    }
    if (!window.confirm(`Supprimer définitivement les ${count} cerveaux enregistrés dans ce navigateur ?`)) {
        return;
    }

    try {
        brainStorage.clear();
        trainedBrains = [];
        selectedBrainIds.clear();
        document.getElementById("raceResults").textContent = "";
        renderBrainList();
        setStatus("Tous les cerveaux enregistrés ont été supprimés.");
    } catch (error) {
        console.error("La suppression de l’archive des cerveaux a échoué.", error);
        setStatus(`Suppression impossible : ${error.message}`, true);
    }
}

function renderBrainList() {
    const list = document.getElementById("brainList");
    if (!list) return;
    trainedBrains = brainStorage.list();
    list.replaceChildren();
    document.getElementById("brainCount").textContent = String(trainedBrains.length);

    if (!trainedBrains.length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "Les meilleurs réseaux seront archivés à chaque génération.";
        list.appendChild(empty);
    }

    for (const record of trainedBrains) {
        const label = document.createElement("label");
        label.className = "brain-option";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = record.id;
        checkbox.checked = selectedBrainIds.has(record.id);
        checkbox.addEventListener("change", updateSelectedBrains);

        const name = document.createElement("span");
        name.className = "brain-name";
        name.textContent = record.name;
        const metadata = document.createElement("span");
        metadata.className = "brain-meta";
        metadata.textContent =
            `${record.brain.hiddenNodes} neur. · ${record.brain.activation} · ${Math.round(record.score)} pts`;
        const trained = document.createElement("span");
        trained.className = "brain-trained";
        trained.textContent = describeTrainedOn(trainedOnPresets(record));
        label.append(checkbox, name, metadata, trained);
        list.appendChild(label);
    }
    updateSelectedBrains();
}

function updateSelectedBrains() {
    const checked = [...document.querySelectorAll("#brainList input:checked")];
    selectedBrainIds = new Set(checked.map(input => input.value));
    document.getElementById("raceButton").disabled = selectedBrainIds.size === 0;
    const allSelected = trainedBrains.length > 0 &&
        trainedBrains.every(record => selectedBrainIds.has(record.id));
    document.getElementById("selectAllBrains").textContent =
        allSelected ? "Tout désélectionner" : "Tout sélectionner";
}

function toggleSelectAll() {
    const allSelected = trainedBrains.length > 0 &&
        trainedBrains.every(record => selectedBrainIds.has(record.id));
    selectedBrainIds = new Set(allSelected ? [] : trainedBrains.map(record => record.id));
    renderBrainList();
}

function startBrainRace() {
    const selected = trainedBrains.filter(record => selectedBrainIds.has(record.id));
    if (!selected.length) {
        setStatus("Sélectionne au moins un cerveau pour démarrer la course.", true);
        return;
    }

    const racePreset = raceTrackPreset();
    if (racePreset === "custom" && customTrackPath.length < 8) {
        setStatus("Dessine d’abord un circuit (« Dessiner un circuit ») pour pouvoir y courir.", true);
        return;
    }

    raceCars.forEach(car => car.dispose());
    // La course peut se dérouler sur un autre circuit que l'entraînement (c'est le test de
    // généralisation) : on dessine ce circuit sans toucher aux réglages ni à la population ;
    // exitBrainRace() remet le circuit d'entraînement. Le départ se lit APRÈS le changement.
    if (racePreset !== currentTrackPreset) setupTrack(racePreset);
    raceTrackSwapped = racePreset !== trainingPreset();
    raceCars = selected.map((record, index) => {
        const car = new Car({
            brain: record.brain,
            name: record.name,
            color: ["#54b8ff", "#52d4aa", "#ffd45c", "#ff806d", "#bb91ff"][index % 5],
            position: createVector(startX, startY)
        });
        car.trainedOn = trainedOnPresets(record);
        car.circuitStatus = circuitStatus(car.trainedOn, racePreset);
        return car;
    });
    document.getElementById("raceTrackInfo").textContent = describeRaceTrack(racePreset, raceCars);
    trainingStateBeforeRace = {
        active: trainingActive,
        finished: trainingFinished
    };
    raceMode = true;
    trainingActive = false;
    bestRaceCar = null;
    raceResultsShown = false;
    raceFrames = 0;
    emitGameEvent("raceStart");
    document.getElementById("raceBanner").hidden = false;
    document.getElementById("raceResults").textContent = "";
    refreshRaceTimer();
    refreshRaceRanking();
    updateTrainingButton();
    setStatus(`${selected.length} cerveau(x) en course.`);
}

function exitBrainRace(resumeTraining = true) {
    if (!raceMode && !raceCars.length) return;
    raceCars.forEach(car => car.dispose());
    raceCars = [];
    raceMode = false;
    bestRaceCar = null;
    raceFrames = 0;
    document.getElementById("raceBanner").hidden = true;
    if (raceTrackSwapped) {
        raceTrackSwapped = false;
        setupTrack(trainingPreset()); // l'entraînement reprend sur son propre circuit
    }
    if (resumeTraining && trainingStateBeforeRace) {
        trainingActive = trainingStateBeforeRace.active;
        trainingFinished = trainingStateBeforeRace.finished;
    }
    trainingStateBeforeRace = null;
    updateTrainingButton();
}

function displayRaceResults() {
    const sorted = rankRaceCars(raceCars);
    const ranking = sorted.slice(0, 6).map((car, index) =>
        `${index + 1}. ${car.name} — ${car.finished
            ? "arrivée en " + formatRaceTime(car.lapFrames)
            : "hors course au checkpoint " + car.checkpointIndex}, ${Math.round(car.score)} pts`
    ).join(" | ");
    // Bilan de généralisation : seulement si les voitures connaissent leur historique (Generalization.js).
    const generalization = sorted.some(car => car.circuitStatus)
        ? formatGeneralization(summarizeGeneralization(sorted))
        : "";
    document.getElementById("raceResults").textContent =
        generalization ? `${ranking}\n${generalization}` : ranking;
}

// Chronomètre du bandeau de course (mis à jour à chaque image simulée).
function refreshRaceTimer() {
    const timer = typeof document === "undefined" ? null : document.getElementById("raceTimer");
    if (timer) timer.textContent = formatRaceTime(raceFrames);
}

// Classement en direct au temps de tour. Les voitures à égalité de temps partagent le rang ;
// l'écart au premier s'affiche pour les autres arrivées ; les autres voitures sont « en piste »
// ou « sorties ». Limité à RACE_BOARD_ROWS lignes pour rester lisible.
function refreshRaceRanking() {
    const list = typeof document === "undefined" ? null : document.getElementById("raceRanking");
    if (!list) return;
    const ranking = rankRaceCars(raceCars);
    const best = ranking.length && ranking[0].finished ? ranking[0].lapFrames : null;
    const ranks = [];
    ranking.forEach((car, index) => {
        const tied = car.finished && index > 0 && ranking[index - 1].finished &&
            ranking[index - 1].lapFrames === car.lapFrames;
        ranks.push(tied ? ranks[index - 1] : index + 1);
    });
    const rows = ranking.slice(0, RACE_BOARD_ROWS).map((car, index) => {
        const rank = ranks[index];
        const row = document.createElement("li");
        row.className = car.finished ? "race-row finished" : car.dead ? "race-row out" : "race-row";
        const position = document.createElement("span");
        position.className = "race-rank";
        position.textContent = String(rank);
        const swatch = document.createElement("span");
        swatch.className = "race-swatch";
        swatch.style.background = car.color;
        const name = document.createElement("span");
        name.className = "race-name";
        name.textContent = car.name;
        const time = document.createElement("span");
        time.className = "race-time";
        if (car.finished) {
            time.textContent = formatRaceTime(car.lapFrames);
            if (Number.isFinite(best) && car.lapFrames > best) {
                const gap = document.createElement("small");
                gap.textContent = ` +${((car.lapFrames - best) / RACE_FPS).toFixed(2)}`;
                time.appendChild(gap);
            }
        } else {
            time.textContent = car.dead ? "sortie" : "en piste";
        }
        if (car.circuitStatus === "seen" || car.circuitStatus === "unseen") {
            // Texte (et pas seulement une couleur) : « inédit » = jamais vu à l'entraînement.
            const tag = document.createElement("span");
            tag.className = `race-tag ${car.circuitStatus}`;
            tag.textContent = car.circuitStatus === "unseen" ? "inédit" : "connu";
            name.append(tag);
        }
        row.append(position, swatch, name, time);
        return row;
    });
    if (ranking.length > RACE_BOARD_ROWS) {
        const more = document.createElement("li");
        more.className = "race-more";
        more.textContent = `+ ${ranking.length - RACE_BOARD_ROWS} autre(s) voiture(s)`;
        rows.push(more);
    }
    list.replaceChildren(...rows);
}

function exportBrains() {
    try {
        const file = new Blob([brainStorage.exportJSON()], { type: "application/json" });
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = "neuroevolution-cerveaux.json";
        link.click();
        URL.revokeObjectURL(url);
        setStatus(`${trainedBrains.length} cerveau(x) exporté(s).`);
    } catch (error) {
        console.error("L’export des cerveaux a échoué.", error);
        setStatus(`Export impossible : ${error.message}`, true);
    }
}

async function importBrains(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        trainedBrains = brainStorage.importJSON(await file.text());
        selectedBrainIds.clear();
        renderBrainList();
        setStatus(brainStorage.recoveredFromCorruption
            ? "Archive importée. L’archive locale était abîmée : seuls ses cerveaux valides ont été conservés. " +
                backupNotice(brainStorage)
            : "Archive importée et fusionnée avec les cerveaux déjà enregistrés.");
    } catch (error) {
        console.error("L’import des cerveaux a échoué.", error);
        setStatus(`Import impossible : ${error.message}`, true);
    } finally {
        event.target.value = "";
    }
}

// Circuit affiché à l'écran : celui du réglage, sauf en course ou en multi-circuits (circuit du tour).
function displayedPreset() {
    return raceMode || MULTI_TRACK_TRAINING ? currentTrackPreset : TRACK_PRESET;
}

function trackLabel(preset = displayedPreset()) {
    return {
        easy: "débutant",
        medium: "intermédiaire",
        technical: "expert",
        custom: "dessiné"
    }[preset] || preset;
}

// Aligne les contrôles multi-circuits sur les variables globales : cases cochées, options
// visibles seulement en mode multi-circuits, circuit unique grisé, dernier circuit non décochable.
function syncMultiTrackControls() {
    document.getElementById("multiTrackToggle").checked = MULTI_TRACK_TRAINING;
    document.getElementById("multiTrackOptions").hidden = !MULTI_TRACK_TRAINING;
    document.getElementById("trackSelect").disabled = MULTI_TRACK_TRAINING;
    for (const preset of MULTI_TRACK_ORDER) {
        const box = document.getElementById(`multiTrack-${preset}`);
        const selected = MULTI_TRACK_SET.includes(preset);
        box.checked = selected;
        box.disabled = selected && MULTI_TRACK_SET.length === 1;
    }
}

function chooseRaceTrack(choice) {
    RACE_TRACK_CHOICE = choice;
    const select = document.getElementById("raceTrackSelect");
    if (select) select.value = choice;
}

function setStatus(message, isError = false) {
    const status = document.getElementById("statusMessage");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("error", isError);
}
