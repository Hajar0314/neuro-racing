// Sons de la simulation : tout est SYNTHÉTISÉ avec Web Audio (aucun fichier audio à charger).
//
// - Un seul moteur « vivant » : celui de la voiture de tête (hauteur = vitesse).
// - Des sons ponctuels : collision, passage de checkpoint, dérapage, arrivée, nouvelle génération,
//   fanfare de réussite, départ de course.
// - Le navigateur interdit de produire du son avant un geste de l'utilisateur : le contexte audio
//   n'est donc créé qu'au premier clic / touche (unlock) ; avant cela, toutes les méthodes sont
//   des no-op silencieux.
// - Désactiver le son coupe tout le mix (moteur arrêté et déconnecté, volume maître à 0).
// - Les préférences (son actif, volume, effets visuels) sont enregistrées à part des réglages
//   de simulation : elles n'influencent jamais l'expérience.

var SOUND_PREFS_KEY = "neuroRacingSoundPrefs";
var SOUND_DEFAULT_PREFS = { enabled: true, volume: 0.5, effects: true };
var SOUND_MAX_VOICES = 16; // sons ponctuels simultanés : au-delà, on ignore (évite la saturation)

function sanitizeSoundPrefs(raw) {
    const prefs = { ...SOUND_DEFAULT_PREFS };
    if (!raw || typeof raw !== "object") return prefs;
    if (typeof raw.enabled === "boolean") prefs.enabled = raw.enabled;
    if (typeof raw.effects === "boolean") prefs.effects = raw.effects;
    if (typeof raw.volume === "number" && Number.isFinite(raw.volume)) {
        prefs.volume = Math.min(1, Math.max(0, raw.volume));
    }
    return prefs;
}

function loadSoundPrefs(storage) {
    try {
        return sanitizeSoundPrefs(JSON.parse(storage.getItem(SOUND_PREFS_KEY)));
    } catch (error) {
        return { ...SOUND_DEFAULT_PREFS };
    }
}

function saveSoundPrefs(storage, prefs) {
    try {
        storage.setItem(SOUND_PREFS_KEY, JSON.stringify(prefs));
        return true;
    } catch (error) {
        return false; // stockage refusé ou plein : les préférences durent le temps de la session
    }
}

class SoundEngine {
    constructor({ AudioContextClass, storage = null } = {}) {
        if (AudioContextClass === undefined) {
            AudioContextClass = typeof window !== "undefined"
                ? window.AudioContext || window.webkitAudioContext
                : null;
        }
        this.AudioContextClass = AudioContextClass || null;
        this.storage = storage;
        const prefs = storage ? loadSoundPrefs(storage) : { ...SOUND_DEFAULT_PREFS };
        this.enabled = prefs.enabled;
        this.volume = prefs.volume;
        this.effectsEnabled = prefs.effects;

        this.ctx = null;
        this.master = null;
        this.noiseBuffer = null;
        this.engine = null;
        this.voices = 0;
        this.lastPlayed = {};
    }

    get supported() {
        return Boolean(this.AudioContextClass);
    }

    get ready() {
        return Boolean(this.ctx) && this.ctx.state !== "closed";
    }

    prefs() {
        return { enabled: this.enabled, volume: this.volume, effects: this.effectsEnabled };
    }

    persist() {
        if (this.storage) saveSoundPrefs(this.storage, this.prefs());
    }

    // À appeler depuis un geste de l'utilisateur (clic, touche). Idempotent.
    unlock() {
        if (!this.supported || !this.enabled) return false;
        try {
            if (!this.ctx) {
                this.ctx = new this.AudioContextClass();
                this.master = this.ctx.createGain();
                this.master.gain.value = this.volume;
                this.master.connect(this.ctx.destination);
                this.noiseBuffer = this.createNoiseBuffer();
            }
            if (this.ctx.state === "suspended" && typeof this.ctx.resume === "function") {
                this.ctx.resume();
            }
            return true;
        } catch (error) {
            this.ctx = null;
            this.AudioContextClass = null; // plus de son pour cette session, sans bloquer la simulation
            return false;
        }
    }

    createNoiseBuffer() {
        const length = Math.floor(this.ctx.sampleRate * 0.6);
        const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let seed = 1234567; // bruit déterministe, indépendant de la graine de l'expérience
        for (let i = 0; i < length; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            data[i] = seed / 2147483648 - 1;
        }
        return buffer;
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        this.persist();
        if (!this.enabled) this.stopEngine();
        this.applyMaster();
        if (this.enabled) this.unlock();
    }

    setVolume(volume) {
        const value = Number(volume);
        this.volume = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : this.volume;
        this.persist();
        this.applyMaster();
    }

    setEffectsEnabled(enabled) {
        this.effectsEnabled = Boolean(enabled);
        this.persist();
    }

    applyMaster() {
        if (!this.master || !this.ready) return;
        this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, 0.02);
    }

    // Suspend / reprend le contexte (onglet masqué).
    suspend() {
        if (this.ready && typeof this.ctx.suspend === "function") this.ctx.suspend();
    }

    resume() {
        if (this.ready && this.enabled && typeof this.ctx.resume === "function") this.ctx.resume();
    }

    canPlay() {
        return this.enabled && this.volume > 0 && this.ready;
    }

    // Empêche un même son de se répéter plus vite que minGap secondes.
    throttle(name, minGap) {
        const now = this.ctx.currentTime;
        if (this.lastPlayed[name] !== undefined && now - this.lastPlayed[name] < minGap) return true;
        this.lastPlayed[name] = now;
        return false;
    }

    // Démarre une source ponctuelle ; renvoie false si le plafond de voix est atteint.
    startVoice(source, stopAt) {
        if (this.voices >= SOUND_MAX_VOICES) return false;
        this.voices++;
        source.onended = () => {
            this.voices = Math.max(0, this.voices - 1);
            try { source.disconnect(); } catch (error) { /* déjà déconnecté */ }
        };
        source.start();
        source.stop(stopAt);
        return true;
    }

    // Note : fréquence (éventuellement glissante), enveloppe attaque/chute exponentielle.
    tone({ freq, endFreq = freq, dur = 0.15, type = "sine", gain = 0.2, delay = 0, attack = 0.005 }) {
        const now = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const amp = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + dur);
        amp.gain.setValueAtTime(0.0001, now);
        amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + attack);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(amp);
        amp.connect(this.master);
        if (!this.startVoice(osc, now + dur + 0.05)) {
            osc.disconnect();
            amp.disconnect();
        }
    }

    // Souffle filtré (impacts, dérapages).
    noise({ dur = 0.3, gain = 0.2, from = 2000, to = 300, type = "lowpass", delay = 0, q = 0.8 }) {
        const now = this.ctx.currentTime + delay;
        const source = this.ctx.createBufferSource();
        const filter = this.ctx.createBiquadFilter();
        const amp = this.ctx.createGain();
        source.buffer = this.noiseBuffer;
        filter.type = type;
        filter.Q.value = q;
        filter.frequency.setValueAtTime(from, now);
        filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + dur);
        amp.gain.setValueAtTime(Math.max(0.0002, gain), now);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        source.connect(filter);
        filter.connect(amp);
        amp.connect(this.master);
        if (!this.startVoice(source, now + dur + 0.05)) {
            source.disconnect();
            filter.disconnect();
            amp.disconnect();
        }
    }

    // ---- Sons du jeu -------------------------------------------------------------------------

    // intensity : 0 à 1 (vitesse au moment du choc) ; loud : la voiture de tête est plus audible.
    playCrash(intensity = 0.6, loud = false) {
        if (!this.canPlay() || this.throttle("crash", 0.06)) return;
        const level = Math.min(1, Math.max(0.1, intensity)) * (loud ? 1 : 0.5);
        this.noise({ dur: 0.38, gain: 0.4 * level, from: 2600, to: 160 });
        this.tone({ freq: 140, endFreq: 38, dur: 0.28, type: "sine", gain: 0.5 * level });
        if (loud) this.tone({ freq: 880, endFreq: 300, dur: 0.12, type: "square", gain: 0.05 * level });
    }

    playCheckpoint() {
        if (!this.canPlay() || this.throttle("checkpoint", 0.1)) return;
        this.tone({ freq: 1320, dur: 0.05, type: "triangle", gain: 0.05 });
    }

    playSkid(level = 0.5) {
        if (!this.canPlay() || this.throttle("skid", 0.14)) return;
        this.noise({ dur: 0.16, gain: 0.06 * Math.min(1, Math.max(0.2, level)), from: 3200, to: 1800, type: "bandpass", q: 6 });
    }

    // Une voiture franchit la ligne d'arrivée.
    playFinish() {
        if (!this.canPlay() || this.throttle("finish", 0.15)) return;
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
            this.tone({ freq, dur: 0.22, type: "triangle", gain: 0.13, delay: index * 0.07 });
        });
    }

    // Objectif de réussite atteint : fanfare plus longue.
    playFanfare() {
        if (!this.canPlay() || this.throttle("fanfare", 1)) return;
        const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
        notes.forEach((freq, index) => {
            this.tone({ freq, dur: 0.3, type: "triangle", gain: 0.14, delay: index * 0.11 });
            this.tone({ freq: freq / 2, dur: 0.3, type: "sine", gain: 0.08, delay: index * 0.11 });
        });
        [523.25, 659.25, 783.99].forEach(freq => {
            this.tone({ freq, dur: 0.9, type: "sawtooth", gain: 0.05, delay: notes.length * 0.11 });
        });
    }

    // Nouvelle génération : petit « bip » discret.
    playGeneration() {
        if (!this.canPlay() || this.throttle("generation", 0.3)) return;
        this.tone({ freq: 440, endFreq: 660, dur: 0.12, type: "sine", gain: 0.1 });
        this.tone({ freq: 660, endFreq: 880, dur: 0.14, type: "sine", gain: 0.08, delay: 0.1 });
    }

    // Départ de course : trois bips graves puis un aigu, comme des feux.
    playRaceStart() {
        if (!this.canPlay() || this.throttle("raceStart", 1)) return;
        [0, 0.3, 0.6].forEach(delay => {
            this.tone({ freq: 660, dur: 0.14, type: "square", gain: 0.08, delay });
        });
        this.tone({ freq: 1320, dur: 0.5, type: "square", gain: 0.1, delay: 0.9 });
    }

    playClick() {
        if (!this.canPlay() || this.throttle("click", 0.05)) return;
        this.tone({ freq: 700, endFreq: 500, dur: 0.05, type: "triangle", gain: 0.08 });
    }

    // ---- Moteur de la voiture de tête --------------------------------------------------------

    // speedRatio : vitesse / vitesse maximale (0 à 1) ; active : false coupe le moteur.
    updateEngine(speedRatio, active) {
        if (!active || !this.canPlay()) {
            this.stopEngine();
            return;
        }
        const ratio = Math.min(1, Math.max(0, Number.isFinite(speedRatio) ? speedRatio : 0));
        if (!this.engine) this.startEngine();
        const now = this.ctx.currentTime;
        const pitch = 55 + ratio * 120;
        this.engine.low.frequency.setTargetAtTime(pitch, now, 0.08);
        this.engine.high.frequency.setTargetAtTime(pitch * 2.01, now, 0.08);
        this.engine.filter.frequency.setTargetAtTime(500 + ratio * 1800, now, 0.1);
        this.engine.gain.gain.setTargetAtTime(0.035 + ratio * 0.05, now, 0.1);
    }

    startEngine() {
        const low = this.ctx.createOscillator();
        const high = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        low.type = "sawtooth";
        high.type = "square";
        filter.type = "lowpass";
        filter.Q.value = 2;
        gain.gain.value = 0.0001;
        low.connect(filter);
        high.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);
        low.start();
        high.start();
        this.engine = { low, high, filter, gain };
    }

    // Arrête le moteur et libère ses nœuds audio.
    stopEngine() {
        if (!this.engine) return;
        const { low, high, filter, gain } = this.engine;
        this.engine = null;
        const now = this.ctx.currentTime;
        gain.gain.setTargetAtTime(0, now, 0.03);
        low.onended = () => {
            for (const node of [low, high, filter, gain]) {
                try { node.disconnect(); } catch (error) { /* déjà déconnecté */ }
            }
        };
        low.stop(now + 0.15);
        high.stop(now + 0.15);
    }

    // Libère tout (fermeture de la page).
    dispose() {
        this.stopEngine();
        if (this.ctx && typeof this.ctx.close === "function" && this.ctx.state !== "closed") {
            this.ctx.close();
        }
        this.ctx = null;
        this.master = null;
    }
}
