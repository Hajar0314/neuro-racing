// Effets visuels : étincelles, débris, fumée, ondes de choc, confettis, flash des checkpoints.
//
// Ce sont de purs effets de décor : ils ne se déplacent pas dans le monde simulé, n'interagissent
// avec aucune voiture, aucun mur ni aucun réseau, et ne participent à aucune décision. Ils ne
// tirent JAMAIS leurs nombres au hasard dans Random.js : un générateur local, à graine fixe,
// garantit que les effets ne modifient pas la reproductibilité d'une expérience.
//
// update() est appelée une fois par image affichée (pas à chaque pas de simulation) ; draw() ne
// fait que dessiner. Le nombre de particules est plafonné.

var EFFECTS_MAX_PARTICLES = 600;
var EFFECTS_CONFETTI_COLORS = ["#ff5d5d", "#ffd84d", "#45d483", "#34a7ff", "#bb8cff", "#ffffff"];

class EffectsSystem {
    constructor(maxParticles = EFFECTS_MAX_PARTICLES) {
        this.maxParticles = maxParticles;
        this.enabled = true;
        this.particles = [];
        this.flashes = [];
        this.screenFlash = null;
        this.rngState = 987654321;
    }

    // Petit générateur local (LCG) : [0, 1).
    rand() {
        this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) >>> 0;
        return this.rngState / 4294967296;
    }

    range(low, high) {
        return low + (high - low) * this.rand();
    }

    get count() {
        return this.particles.length;
    }

    clear() {
        this.particles = [];
        this.flashes = [];
        this.screenFlash = null;
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        if (!this.enabled) this.clear();
    }

    add(particle) {
        if (!this.enabled) return;
        this.particles.push({ vx: 0, vy: 0, friction: 1, gravity: 0, grow: 0, size: 3, rot: 0, spin: 0, ...particle, max: particle.life });
        const overflow = this.particles.length - this.maxParticles;
        if (overflow > 0) this.particles.splice(0, overflow); // on sacrifie les plus anciennes
    }

    // Collision : onde de choc, étincelles, débris de la couleur de la voiture, fumée.
    crash(x, y, intensity = 0.6, color = "#cccccc") {
        if (!this.enabled) return;
        const level = Math.min(1, Math.max(0.2, intensity));
        this.add({ kind: "ring", x, y, life: 16, size: 6, grow: 1.6 + level * 1.4 });
        const sparks = Math.round(6 + level * 10);
        for (let i = 0; i < sparks; i++) {
            const angle = this.rand() * Math.PI * 2;
            const speed = this.range(1.5, 3 + level * 4);
            this.add({
                kind: "spark", x, y, life: Math.round(this.range(12, 26)),
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, friction: 0.92
            });
        }
        for (let i = 0; i < 4; i++) {
            const angle = this.rand() * Math.PI * 2;
            const speed = this.range(0.8, 2.2);
            this.add({
                kind: "debris", x, y, life: Math.round(this.range(30, 55)), color,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, friction: 0.94,
                size: this.range(2, 3.6), rot: this.rand() * Math.PI, spin: this.range(-0.3, 0.3)
            });
        }
        for (let i = 0; i < 3; i++) {
            this.add({
                kind: "smoke", x: x + this.range(-3, 3), y: y + this.range(-3, 3),
                life: Math.round(this.range(40, 70)), vx: this.range(-0.3, 0.3), vy: this.range(-0.6, -0.1),
                friction: 0.98, size: this.range(5, 8), grow: 0.22
            });
        }
    }

    // Fumée de pneus (dérapage) derrière la voiture de tête.
    tireSmoke(x, y) {
        if (!this.enabled) return;
        this.add({
            kind: "puff", x: x + this.range(-2, 2), y: y + this.range(-2, 2), life: Math.round(this.range(22, 36)),
            vx: this.range(-0.25, 0.25), vy: this.range(-0.25, 0.25), friction: 0.96, size: this.range(3, 5), grow: 0.18
        });
    }

    // Confettis (arrivée, objectif atteint).
    confetti(x, y, amount = 24) {
        if (!this.enabled) return;
        for (let i = 0; i < amount; i++) {
            const angle = this.rand() * Math.PI * 2;
            const speed = this.range(1, 4.5);
            this.add({
                kind: "confetti", x, y, life: Math.round(this.range(70, 130)),
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1.2, friction: 0.97, gravity: 0.06,
                color: EFFECTS_CONFETTI_COLORS[Math.floor(this.rand() * EFFECTS_CONFETTI_COLORS.length)],
                size: this.range(2.5, 4.5), rot: this.rand() * Math.PI, spin: this.range(-0.4, 0.4)
            });
        }
    }

    // Le segment [a, b] du checkpoint qui vient d'être validé s'illumine brièvement.
    gateFlash(a, b) {
        if (!this.enabled || !a || !b) return;
        this.flashes.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, life: 18, max: 18 });
        if (this.flashes.length > 12) this.flashes.shift();
    }

    // Flash plein écran (objectif atteint) : [r, g, b], intensité 0 à 1.
    flashScreen(color = [120, 255, 190], intensity = 0.3) {
        if (!this.enabled) return;
        this.screenFlash = { color, alpha: Math.min(1, Math.max(0, intensity)) };
    }

    update() {
        for (const p of this.particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= p.friction;
            p.vy = p.vy * p.friction + p.gravity;
            p.size += p.grow;
            p.rot += p.spin;
            p.life--;
        }
        this.particles = this.particles.filter(p => p.life > 0);
        for (const f of this.flashes) f.life--;
        this.flashes = this.flashes.filter(f => f.life > 0);
        if (this.screenFlash) {
            this.screenFlash.alpha *= 0.9;
            if (this.screenFlash.alpha < 0.01) this.screenFlash = null;
        }
    }

    draw() {
        if (!this.enabled) return;
        push();
        for (const f of this.flashes) {
            const t = f.life / f.max;
            strokeCap(ROUND);
            stroke(120, 255, 200, 70 * t);
            strokeWeight(10 * t + 2);
            line(f.ax, f.ay, f.bx, f.by);
            stroke(230, 255, 245, 200 * t);
            strokeWeight(2);
            line(f.ax, f.ay, f.bx, f.by);
        }
        for (const p of this.particles) {
            const t = Math.max(0, p.life / p.max);
            if (p.kind === "spark") {
                stroke(255, 200 + 40 * t, 90, 255 * t);
                strokeWeight(2);
                line(p.x, p.y, p.x - p.vx * 2.2, p.y - p.vy * 2.2);
            } else if (p.kind === "smoke") {
                noStroke();
                fill(70, 76, 80, 120 * t);
                circle(p.x, p.y, p.size);
            } else if (p.kind === "puff") {
                noStroke();
                fill(235, 235, 230, 90 * t);
                circle(p.x, p.y, p.size);
            } else if (p.kind === "ring") {
                noFill();
                stroke(255, 255, 255, 190 * t);
                strokeWeight(2 * t + 0.5);
                circle(p.x, p.y, p.size);
            } else if (p.kind === "debris" || p.kind === "confetti") {
                push();
                translate(p.x, p.y);
                rotate(p.rot);
                noStroke();
                fill(p.color);
                rectMode(CENTER);
                rect(0, 0, p.size, p.kind === "confetti" ? p.size * 0.55 : p.size);
                pop();
            }
        }
        if (this.screenFlash && typeof width === "number") {
            noStroke();
            rectMode(CORNER);
            const c = this.screenFlash.color;
            fill(c[0], c[1], c[2], 255 * this.screenFlash.alpha);
            rect(0, 0, width, height);
        }
        pop();
    }
}
