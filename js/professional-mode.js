import { getScalePitchClasses } from "./music-theory.js";

// Avaliação independente da melodia MIDI. Cents usam o mesmo temperamento
// e a mesma referência A4 = 440 Hz do restante do aplicativo.
export class ProfessionalSession {
    constructor(key, mode, { tolerance = 25, near = 45, minimumVoiceSeconds = 1 } = {}) {
        this.scale = getScalePitchClasses(key, mode);
        if (!this.scale?.length) throw new Error("Informe uma tonalidade válida para o modo Profissional.");
        if (!(tolerance > 0 && near > tolerance && near < 50)) throw new Error("Tolerâncias de afinação inválidas.");
        Object.assign(this, { key, mode, tolerance, near, minimumVoiceSeconds });
        this.history = [];
        this.previous = null;
        this.voicedSeconds = 0;
        this.inTuneSeconds = 0;
        this.errorIntegral = 0;
        this.windowSeconds = 0;
        this.windowInTuneSeconds = 0;
        this.windows = 0;
        this.combo = 0;
        this.bestCombo = 0;
    }

    classify(midiFloat) {
        if (!Number.isFinite(midiFloat)) return null;
        let nearestMidi = null;
        for (const pitchClass of this.scale) {
            const candidate = pitchClass + 12 * Math.round((midiFloat - pitchClass) / 12);
            if (nearestMidi === null || Math.abs(candidate - midiFloat) < Math.abs(nearestMidi - midiFloat)) {
                nearestMidi = candidate;
            }
        }
        const cents = (midiFloat - nearestMidi) * 100;
        const distance = Math.abs(cents);
        const inTune = distance <= this.tolerance + 1e-7;
        return { midiFloat, nearestMidi, cents, quality: inTune ? 100 : 0,
            status: inTune ? "inTune" : distance < this.near ? "near" : "outOfKey" };
    }

    sample(time, midiFloat = null) {
        if (!Number.isFinite(time) || time < 0 || (this.previous && time <= this.previous.time)) return [];
        const pitch = this.classify(midiFloat);
        const point = { time, ...(pitch || { midiFloat: null, status: "silence" }) };
        const completed = [];
        const previous = this.previous;
        const elapsed = previous ? time - previous.time : 0;
        // Uma suspensão do navegador ou salto no áudio nunca vira voz sustentada.
        if (previous?.midiFloat != null && elapsed > 0 && elapsed <= 0.18) {
            this.voicedSeconds += elapsed;
            this.errorIntegral += Math.abs(previous.cents) * elapsed;
            if (previous.status === "inTune") this.inTuneSeconds += elapsed;
            let remaining = elapsed;
            while (remaining > 1e-9) {
                const part = Math.min(remaining, 1 - this.windowSeconds);
                this.windowSeconds += part;
                if (previous.status === "inTune") this.windowInTuneSeconds += part;
                remaining -= part;
                if (this.windowSeconds >= 1 - 1e-9) completed.push(this.finishWindow());
            }
        }
        // Todas as alturas válidas ficam na sessão; basta um marcador por pausa.
        if (pitch || previous?.midiFloat != null) this.history.push(point);
        this.previous = point;
        return completed;
    }

    finishWindow() {
        const score = Math.min(100, 100 * this.windowInTuneSeconds / this.windowSeconds);
        this.combo = score >= 80 ? this.combo + 1 : 0;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        const detail = { windowIndex: this.windows++, score, pitchScore: score,
            status: score >= 80 ? "excellent" : score > 0 ? "partial" : "error",
            classification: score > 0 ? "inKey" : "outOfKey",
            duration: this.windowSeconds, combo: this.combo, bestCombo: this.bestCombo };
        this.windowSeconds = this.windowInTuneSeconds = 0;
        return detail;
    }

    finish(time) {
        const completed = this.sample(time);
        if (this.windowSeconds >= 0.25) completed.push(this.finishWindow());
        return completed;
    }

    summary() {
        const hasEvaluation = this.voicedSeconds + 1e-9 >= this.minimumVoiceSeconds;
        return { hasEvaluation, voicedSeconds: this.voicedSeconds,
            inTuneSeconds: this.inTuneSeconds,
            outOfTuneSeconds: Math.max(0, this.voicedSeconds - this.inTuneSeconds),
            precision: hasEvaluation ? Math.min(100, 100 * this.inTuneSeconds / this.voicedSeconds) : null,
            meanError: hasEvaluation ? this.errorIntegral / this.voicedSeconds : null,
            bestCombo: this.bestCombo, windows: this.windows };
    }

    visibleHistory(time, seconds = 8) {
        // Busca binária mantém a revisão leve mesmo em músicas longas.
        const start = time - seconds;
        let low = 0, high = this.history.length;
        while (low < high) {
            const mid = (low + high) >>> 1;
            if (this.history[mid].time < start) low = mid + 1;
            else high = mid;
        }
        const points = [];
        for (let i = Math.max(0, low - 1); i < this.history.length && this.history[i].time <= time + seconds; i++) {
            points.push(this.history[i]);
        }
        return points;
    }
}
