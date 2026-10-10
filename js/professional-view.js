import { PianoRoll } from "./piano-roll.js";

// Interface exclusiva do Profissional. Não modifica os resultados dos outros modos.
export class ProfessionalView {
    constructor({ onReview, onRepeat }) {
        this.live = document.getElementById("professionalLive");
        this.result = document.getElementById("professionalResult");
        this.review = document.getElementById("professionalReview");
        this.review.addEventListener("input", () => {
            const time = Number(this.review.value);
            document.getElementById("professionalReviewTime").textContent = `${time.toFixed(1)} s`;
            this.reviewRoll?.setProfessionalPoints(this.session.visibleHistory(time));
            this.reviewRoll?.setCurrentTime(time);
            onReview(time);
        });
        document.getElementById("professionalRepeat").addEventListener("click", onRepeat);
        document.getElementById("professionalExport").addEventListener("click", () => this.exportHistory());
    }

    setMode(active, song) {
        document.body.classList.toggle("professional-mode", active);
        this.live.classList.toggle("oculto", !active);
        this.reset();
        document.getElementById("professionalKey").textContent = song
            ? `${song.key} ${song.mode === "minor" || song.mode === "menor" ? "menor" : "maior"}` : "—";
    }

    reset() {
        this.reviewRoll?.destroy();
        this.reviewRoll = null;
        this.result.classList.add("oculto");
        this.session = null;
        for (const id of ["professionalPrecision", "professionalSeconds", "professionalPitch"]) {
            document.getElementById(id).textContent = "—";
        }
    }

    update(session) {
        const summary = session.summary();
        const pitch = session.previous;
        document.getElementById("professionalPrecision").textContent = summary.precision === null
            ? "Sem dados suficientes" : `${summary.precision.toFixed(1)}%`;
        document.getElementById("professionalSeconds").textContent = `${summary.voicedSeconds.toFixed(1)} s`;
        document.getElementById("professionalPitch").textContent = pitch?.midiFloat == null ? "—"
            : `${Math.abs(pitch.cents).toFixed(0)} cents · ${pitch.status === "inTune" ? "Afinado" : pitch.status === "near" ? "Próximo" : "Fora da faixa tonal"}`;
    }

    finish(session, song, duration, interrupted = false) {
        this.session = session;
        this.song = song;
        this.update(session);
        const summary = session.summary();
        document.getElementById("professionalResultTitle").textContent = interrupted
            ? "Apresentação interrompida" : "Apresentação concluída";
        document.getElementById("professionalResultPoints").textContent = summary.precision === null ? "—" : `${summary.precision.toFixed(1)}%`;
        document.getElementById("professionalResultPrecision").textContent = summary.precision === null
            ? "Sem dados suficientes: cante por pelo menos 1 segundo."
            : `Tempo afinado: ${summary.inTuneSeconds.toFixed(1)} s · Tempo desafinado: ${summary.outOfTuneSeconds.toFixed(1)} s · Total cantado: ${summary.voicedSeconds.toFixed(1)} s`;
        this.review.max = String(Math.max(0, duration));
        this.review.value = String(duration);
        document.getElementById("professionalReviewTime").textContent = `${duration.toFixed(1)} s`;
        this.result.classList.remove("oculto");
        this.reviewRoll?.destroy();
        this.reviewRoll = new PianoRoll(document.getElementById("professionalReviewCanvas"));
        this.reviewRoll.setProfessionalMode(true);
        this.reviewRoll.setKeySignature(session.key, session.mode);
        this.reviewRoll.setProfessionalPoints(session.visibleHistory(duration));
        this.reviewRoll.setCurrentTime(duration);
        this.result.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    exportHistory() {
        if (!this.session) return;
        const url = URL.createObjectURL(new Blob([JSON.stringify({
            version: 4, mode: "professional", scoring: "inTuneTimePercentage", toleranceCents: this.session.tolerance, songId: this.song?.id,
            key: this.session.key, scaleMode: this.session.mode,
            summary: this.session.summary(), history: this.session.history
        }, null, 2)], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "apresentacao-profissional.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
