/*
 * ============================================================
 * music-theory.js
 * ============================================================
 *
 * Funções relacionadas à conversão entre:
 *
 * frequência
 * nota MIDI
 * nome da nota
 * oitava
 * cents
 *
 * Referência adotada:
 *
 * A4 = 440 Hz
 *
 * ============================================================
 */


export const A4_FREQUENCY = 440;


/*
 * Usaremos sustenidos internamente.
 *
 * MIDI:
 *
 * 60 = C4
 * 61 = C#4
 * 62 = D4
 * ...
 * 69 = A4
 */
const NOTE_NAMES = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B"
];


/*
 * Converte frequência para um número MIDI fracionário.
 *
 * Exemplo:
 *
 * 440 Hz = 69
 *
 * Uma frequência ligeiramente abaixo de A4 poderá resultar,
 * por exemplo, em 68.92.
 */
export function frequencyToMidiFloat(frequency) {

    if (
        !Number.isFinite(frequency) ||
        frequency <= 0
    ) {
        return null;
    }

    return (
        69 +
        12 *
        Math.log2(
            frequency / A4_FREQUENCY
        )
    );
}


/*
 * Retorna a nota MIDI inteira mais próxima.
 */
export function frequencyToMidi(frequency) {

    const midiFloat =
        frequencyToMidiFloat(frequency);

    if (midiFloat === null) {
        return null;
    }

    return Math.round(midiFloat);
}


/*
 * Frequência correspondente a uma nota MIDI.
 */
export function midiToFrequency(midi) {

    return (
        A4_FREQUENCY *
        Math.pow(
            2,
            (midi - 69) / 12
        )
    );
}


/*
 * Extrai o nome da nota.
 *
 * Exemplo:
 *
 * 60 → C
 * 61 → C#
 * 67 → G
 */
export function midiToNoteName(midi) {

    const index =
        ((midi % 12) + 12) % 12;

    return NOTE_NAMES[index];
}


/*
 * Extrai a oitava.
 *
 * Exemplo:
 *
 * MIDI 60 → C4
 * MIDI 69 → A4
 */
export function midiToOctave(midi) {

    return (
        Math.floor(midi / 12) - 1
    );
}


/*
 * Calcula a diferença entre a frequência real
 * e a frequência exata da nota MIDI.
 *
 * Resultado:
 *
 * negativo = está grave
 * positivo = está agudo
 *
 * 100 cents = 1 semitom
 */
export function centsFromPitch(
    frequency,
    midi
) {

    const referenceFrequency =
        midiToFrequency(midi);

    return (
        1200 *
        Math.log2(
            frequency / referenceFrequency
        )
    );
}


/*
 * Recebe uma frequência e retorna todas as informações
 * musicais que nossa interface precisa.
 */
export function analyzeFrequency(frequency) {

    const midi =
        frequencyToMidi(frequency);

    if (midi === null) {
        return null;
    }

    const note =
        midiToNoteName(midi);

    const octave =
        midiToOctave(midi);

    const idealFrequency =
        midiToFrequency(midi);

    const cents =
        centsFromPitch(
            frequency,
            midi
        );

    return {
        frequency,
        midi,
        note,
        octave,
        idealFrequency,
        cents
    };
}