// Couleurs : éclaircit (amount > 0) ou assombrit (amount < 0) une couleur "#rrggbb" ; renvoie [r, g, b].
function parseHexColor(hex, fallback = [52, 167, 255]) {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!match) return fallback;
    const value = parseInt(match[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function shadeColor(hex, amount) {
    return parseHexColor(hex).map(channel => Math.round(
        amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount)
    ));
}

class Car extends Vehicle {
    constructor(configuration = {}) {
        const options = configuration instanceof NeuralNetwork
            ? { brain: configuration }
            : configuration;
        if (options.brain &&
            (options.brain.input_nodes && options.brain.input_nodes !== NB_ASSETS ||
                options.brain.inputNodes && options.brain.inputNodes !== NB_ASSETS ||
                options.brain.output_nodes && options.brain.output_nodes !== 2 ||
                options.brain.outputNodes && options.brain.outputNodes !== 2)) {
            throw new Error("Ce cerveau n’a pas les entrées ou sorties attendues pour une voiture.");
        }
        const angle = window.startAngle || 0;
        const position = options.position
            ? options.position.copy()
            : createVector(startX + randomBetween(-3, 3), startY + randomBetween(-3, 3));
        const velocity = p5.Vector.fromAngle(angle);
        velocity.mult(1);
        super(position, velocity, GAME_SPEED_LIMIT, CAR_ACCELERATION);

        this.width = 10;
        this.height = 20;
        this.color = options.color || ["#34a7ff", "#45d483", "#ffd84d", "#ff785e", "#bb8cff"][nextCarColor++ % 5];
        this.name = options.name || "";

        this.dead = false;
        this.finished = false; // A-t-elle terminé le circuit ?
        this.lapFrames = null; // Images simulées écoulées à l'arrivée (temps de tour), null tant qu'elle n'a pas fini
        this.score = 0;       // Score pur (temps)
        this.fitness = 0;     // Score calculé

        this.checkpointIndex = window.startCheckpointIndex || 0; // Prochain checkpoint à valider
        this.wrongWayCount = 0;   // Détection de sens inverse
        this.laps = 0;            // Nombre de tours
        this.frameCount = 0; // Cycle de vie
        this.startPos = this.pos.copy();
        this.trail = []; // dernières positions (traînée du leader, voir show)

        // Nouveaux compteurs pour anti-camping
        this.framesStalled = 0;
        this.framesSinceLastCheckpoint = 0;
        this.prevPos = this.pos.copy(); // Pour détecter les rotations sur place
        this.framesMovingSlowly = 0;
        this.windowPath = 0;
        this.trackProgress = 0;
        this.trackProgressIndex = -1;
        this.trackLateralError = 0;
        this.speedTotal = 0;
        this.speedSamples = 0;
        this.totalTravelDistance = 0;
        this.lastTrackProgressPosition = this.pos.copy();

        if (options.brain instanceof NeuralNetwork) {
            this.brain = options.brain.copy();
        } else if (options.brain) {
            this.brain = NeuralNetwork.fromJSON(options.brain);
        } else {
            this.brain = new NeuralNetwork(
                NB_ASSETS,
                HIDDEN_NODES,
                2,
                HIDDEN_ACTIVATION
            );
        }

        this.rays = [];
        for (let i = 0; i < NB_ASSETS - 1; i++) {
            this.rays[i] = new Ray();
        }
    }

    dispose() {
        this.brain.dispose();
    }

    mutate(rate) {
        this.brain.mutate(rate);
    }

    update() {
        if (this.dead) return;

        this.frameCount++;

        // COUP DE POUCE RADICAL : Si après 60 frames (1s) on n'a tjs pas bougé de 40px
        if (this.frameCount === 60) {
            if (p5.Vector.dist(this.pos, this.startPos) < 40) {
                this.dead = true;
                return;
            }
        }

        // Position au début du pas : sert à la collision balayée (main.checkCollisions)
        this.lastStepPos = this.pos.copy();
        super.update();
        if (this.frameCount % 2 === 0) {
            this.trail.push({ x: this.pos.x, y: this.pos.y });
            if (this.trail.length > 26) this.trail.shift();
        }
        this.speedTotal += this.vel.mag();
        this.speedSamples++;

        // On perd de la vie à chaque frame pour forcer à aller vite (optionnel)
        // Ici on utilise simplement le franchissement de checkpoints

        // ANTI-CAMPING : On vérifie si la voiture progresse vraiment
        // Même si elle a de la vitesse, si elle tourne en rond elle n'avancera pas

        // On mesure, sur des fenêtres de 60 images, le déplacement NET (distance à vol d'oiseau)
        // et le chemin réellement parcouru. Une voiture qui fait des ronds (toupie) parcourt
        // beaucoup de chemin mais ne va nulle part : son déplacement net reste très inférieur
        // au chemin. L'ancien test (moins de 20 px) laissait passer les cercles de grand rayon.
        this.windowPath += this.vel.mag();
        this.framesMovingSlowly++;
        if (this.framesMovingSlowly >= 60) {
            const netMoved = p5.Vector.dist(this.pos, this.prevPos);
            const onTheSpot = netMoved < 20;
            const circling = this.windowPath > 60 && netMoved < this.windowPath * 0.3;
            if (onTheSpot || circling) {
                this.framesStalled += 60;
            } else {
                this.framesStalled = 0;
            }
            this.prevPos = this.pos.copy();
            this.windowPath = 0;
            this.framesMovingSlowly = 0;
        }

        this.framesSinceLastCheckpoint++;

        // Si bloqué 120 frames (~2s cumulées) ou pas de checkpoint en 1200 frames (~20s)
        if (this.framesStalled > 120 || this.framesSinceLastCheckpoint > 1200) {
            this.dead = true;
        }
    }

    checkCheckpoints(cps) {
        if (this.dead || cps.length === 0) return;

        // 1. DÉTECTION SENS INVERSE (Anti-Triche Vérotielle)
        // On compare le vecteur vitesse de la voiture avec la direction théorique du circuit
        if (this.frameCount > 100 && this.vel.mag() > 0.5) {
            let cp1 = cps[this.checkpointIndex];
            let cp2 = cps[(this.checkpointIndex + 1) % cps.length];

            // Calcul du milieu des segments pour obtenir le vecteur direction du circuit
            let center1 = createVector((cp1.a.x + cp1.b.x) / 2, (cp1.a.y + cp1.b.y) / 2);
            let center2 = createVector((cp2.a.x + cp2.b.x) / 2, (cp2.a.y + cp2.b.y) / 2);
            let trackDir = p5.Vector.sub(center2, center1).normalize();

            // Si le produit scalaire est négatif, la voiture va à l'envers
            if (this.vel.dot(trackDir) < -0.3) {
                this.wrongWayCount++;
                if (this.wrongWayCount > 100) { // Environ 1.6s à l'envers cumulées
                    this.dead = true;
                    return;
                }
            } else if (this.vel.dot(trackDir) > 0.2) {
                this.wrongWayCount = max(0, this.wrongWayCount - 5); // Remontée rapide si on va dans le bon sens
            }
        }

        // 2. PROGRESSION NORMALE
        let goal = cps[this.checkpointIndex];
        let d = distPointToSegment(this.pos, goal.a, goal.b);

        if (d < 40) {
            this.checkpointIndex = (this.checkpointIndex + 1) % cps.length;
            this.score += 50;
            this.framesSinceLastCheckpoint = 0;
            this.wrongWayCount = 0; // Reset si on avance bien

            if (this.checkpointIndex === 0) {
                this.laps++;
                this.score += 200;
                this.finished = true;
                this.lapFrames = this.frameCount;
                this.dead = true;
            }
        }
    }

    look(walls) {
        const inputs = [];
        let heading = this.vel.heading();

        // On a NB_ASSETS - 1 rayons (5 rayons)
        let numRays = NB_ASSETS - 1;

        for (let i = 0; i < numRays; i++) {
            let angle = heading - FOV / 2 + (i * FOV) / (numRays - 1);
            if (numRays === 1) angle = heading;

            this.rays[i].setDir(angle);
            this.rays[i].setPos(this.pos.x, this.pos.y);

            let closest = null;
            let record = SIGHT_DIST;

            for (let wall of walls) {
                const pt = this.rays[i].cast(wall);
                if (pt) {
                    const d = p5.Vector.dist(this.pos, pt);
                    if (d < record) {
                        record = d;
                        closest = pt;
                    }
                }
            }

            inputs[i] = map(record, 0, SIGHT_DIST, 1, 0);
            this.rays[i].end = closest;
            this.rays[i].distance = record;
            this.rays[i].input = inputs[i];
        }

        // Le dernier input est la vitesse normalisée
        inputs[NB_ASSETS - 1] = map(this.vel.mag(), 0, this.maxSpeed, 0, 1);

        return inputs;
    }

    think(walls) {
        const inputs = this.look(walls);
        let outputs = this.brain.predict(inputs);

        let turnForce = map(outputs[0], 0, 1, -this.maxForce, this.maxForce);
        let thrust = map(outputs[1], 0, 1, 0, this.maxSpeed);

        // AIDE AU DÉMARRAGE : Première demi-seconde, on pousse forcément un peu
        if (this.frameCount < 30) {
            thrust = max(thrust, this.maxSpeed * 0.5);
        }

        let currentHeading = this.vel.heading();
        let desiredHeading = currentHeading + turnForce;
        let desiredVel = p5.Vector.fromAngle(desiredHeading);
        desiredVel.setMag(thrust);

        let steer = p5.Vector.sub(desiredVel, this.vel);
        steer.limit(this.maxForce);

        this.applyForce(steer);
    }

    show(isBest, drawRays = false) {
        if (this.dead && !isBest) return; // Cache les morts sauf le meilleur passée

        if (isBest && !this.dead) this.showTrail();

        push();
        translate(this.pos.x, this.pos.y);
        rotate(this.vel.heading());
        rectMode(CENTER);
        noStroke();

        // Le rectangle de collision reste 20 × 10 ; le dessin est à peine plus grand que lui.
        const L = this.height * 1.2;
        const W = this.width * 1.2;
        const base = this.dead ? "#7d8791" : this.color;
        const body = shadeColor(base, 0);
        const dark = shadeColor(base, -0.45);
        const light = shadeColor(base, 0.45);
        const alpha = this.dead ? 150 : 255;

        if (isBest && !this.dead) this.showHalo(L);

        // Ombre au sol
        fill(0, 0, 0, this.dead ? 30 : 70);
        rect(1.5, 2.5, L * 1.02, W * 1.05, W * 0.45);

        // Roues (derrière la carrosserie) : pneus noirs, jantes claires
        fill(22, 25, 28, alpha);
        for (const wx of [L * 0.27, -L * 0.3]) {
            const wheelW = wx > 0 ? L * 0.2 : L * 0.24;
            for (const side of [-1, 1]) rect(wx, side * W * 0.55, wheelW, W * 0.26, 1.4);
        }
        fill(150, 156, 160, alpha);
        for (const side of [-1, 1]) {
            rect(L * 0.27, side * W * 0.55, L * 0.07, W * 0.12, 1);
            rect(-L * 0.3, side * W * 0.55, L * 0.08, W * 0.12, 1);
        }

        // Ailerons avant et arrière
        fill(dark[0], dark[1], dark[2], alpha);
        rect(L * 0.5, 0, L * 0.09, W * 1.08, 1);
        rect(-L * 0.5, 0, L * 0.1, W * 0.96, 1);
        fill(light[0], light[1], light[2], alpha);
        rect(L * 0.5, 0, L * 0.035, W * 1.08, 1);

        // Carrosserie : nez fin, pontons, arrière effilé
        fill(body[0], body[1], body[2], alpha);
        beginShape();
        vertex(L * 0.52, 0);
        vertex(L * 0.34, -W * 0.14);
        vertex(L * 0.12, -W * 0.2);
        vertex(L * 0.04, -W * 0.4);
        vertex(-L * 0.24, -W * 0.4);
        vertex(-L * 0.34, -W * 0.26);
        vertex(-L * 0.46, -W * 0.22);
        vertex(-L * 0.46, W * 0.22);
        vertex(-L * 0.34, W * 0.26);
        vertex(-L * 0.24, W * 0.4);
        vertex(L * 0.04, W * 0.4);
        vertex(L * 0.12, W * 0.2);
        vertex(L * 0.34, W * 0.14);
        endShape(CLOSE);

        // Bande centrale et reflet
        fill(255, 255, 255, this.dead ? 60 : 200);
        rect(L * 0.05, 0, L * 0.82, W * 0.1);
        fill(light[0], light[1], light[2], this.dead ? 60 : 150);
        rect(-L * 0.08, -W * 0.28, L * 0.38, W * 0.06, 2);

        // Prise d'air, cockpit et casque
        fill(dark[0], dark[1], dark[2], alpha);
        rect(-L * 0.12, 0, L * 0.12, W * 0.22, 1);
        fill(16, 24, 32, alpha);
        ellipse(L * 0.06, 0, L * 0.2, W * 0.34);
        fill(isBest ? "#ffe066" : "#f4f1e6");
        circle(L * 0.04, 0, W * 0.24);

        // Feux de freinage : s'allument quand la voiture ralentit nettement
        if (!this.dead && this.vel.mag() < this.maxSpeed * 0.45) {
            fill(255, 60, 50, 230);
            rect(-L * 0.47, -W * 0.14, 1.6, W * 0.1);
            rect(-L * 0.47, W * 0.14, 1.6, W * 0.1);
        }
        pop();

        if (drawRays && !this.dead) {
            for (const ray of this.rays) {
                ray.show(ray.distance, [255, 220, 70, 210]);
            }
        }
        strokeWeight(1);
    }

    // Traînée lumineuse qui s'estompe derrière la voiture de tête.
    showTrail() {
        if (!this.trail || this.trail.length < 2) return;
        push();
        noFill();
        strokeCap(ROUND);
        for (let i = 1; i < this.trail.length; i++) {
            const t = i / this.trail.length;
            stroke(255, 255, 255, 120 * t);
            strokeWeight(1 + 4 * t);
            line(this.trail[i - 1].x, this.trail[i - 1].y, this.trail[i].x, this.trail[i].y);
        }
        pop();
    }

    // Halo doux autour de la voiture de tête.
    showHalo(size) {
        const pulse = typeof frameCount === "number" ? 0.5 + 0.5 * Math.sin(frameCount * 0.12) : 0.5;
        noStroke();
        fill(255, 240, 150, 26 + 22 * pulse);
        circle(0, 0, size * 2.6 + pulse * 4);
        fill(255, 240, 150, 40);
        circle(0, 0, size * 1.8);
    }

    setPhysics(maxSpeed, maxForce) {
        this.maxSpeed = maxSpeed;
        this.maxForce = maxForce;
    }
}
