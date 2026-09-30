// Regras compartilhadas pela avaliação e pelas comemorações.
export const KARAOKE_OPTIONAL_DURATION = 0.25;
export const KARAOKE_TIME_MARGIN = 0.15;

export function isOptionalNote(duration, mode) {
    return mode === "beginner" && Number.isFinite(duration) &&
        duration > 0 && duration <= KARAOKE_OPTIONAL_DURATION;
}

export function getEvaluationWindow(notes, index, mode) {
    const note = notes[index];
    const margin = mode === "beginner" ? KARAOKE_TIME_MARGIN : 0;
    // Em passagens rápidas, não atravessar mais de meia nota vizinha.
    const before = Math.min(margin, note.duration / 2,
        (notes[index - 1]?.duration ?? margin * 2) / 2);
    const after = Math.min(margin, note.duration / 2,
        (notes[index + 1]?.duration ?? margin * 2) / 2);
    return { start: note.start - before, end: note.start + note.duration + after };
}

export function findVoiceTarget(notes, states, time, midiFloat, mode, firstIndex = 0) {
    let best = null;
    let bestCost = Infinity;
    const margin = mode === "beginner" ? KARAOKE_TIME_MARGIN : 0;
    for (let index = firstIndex; index < notes.length; index++) {
        const note = notes[index];
        if (note.start > time + margin) break;
        if (states[index]?.finalized) continue;
        const window = getEvaluationWindow(notes, index, mode);
        if (time < window.start || time >= window.end) continue;
        const end = note.start + note.duration;
        const outside = time < note.start || time >= end;
        const distance = Math.max(note.start - time, time - end, 0);
        const semitones = Math.abs(midiFloat - note.midi) % 12;
        const pitchDistance = Math.min(semitones, 12 - semitones);
        // A margem acolhe a melodia (inclusive em outra oitava), não
        // captura uma nota distante apenas porque está próxima no tempo.
        if (outside && (!Number.isFinite(pitchDistance) || pitchDistance > 0.5)) continue;
        const cost = pitchDistance + (outside ? 0.05 + distance / margin : 0);
        if (cost < bestCost) {
            bestCost = cost;
            best = { note, index };
        }
    }
    // Uma amostra sempre tem, no máximo, um destino.
    return best;
}

export function getGreatThreshold(mode, fallback, checkpoint = false) {
    return mode === "beginner" ? (checkpoint ? 80 : 82) : fallback;
}

// Combo e festa reconhecem alternativas bem executadas e, no karaokê,
// execuções parciais. A pontuação
// do placar continua medindo também a fidelidade à melodia original.
export function isPositivePerformance(note, mode) {
    if (!note || note.optional || note.status === "optional" || note.status === "missed") return false;
    const classification = note.dominantVoiceClassification ?? note.classification;
    const score = Number.isFinite(note.performanceScore) ? note.performanceScore : note.score;
    return note.status === "excellent" ||
        (mode === "beginner" && note.status === "partial") ||
        (classification === "scaleAlternative" && Number.isFinite(score) && score >= 80);
}
