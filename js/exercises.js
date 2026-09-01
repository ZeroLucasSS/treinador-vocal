/*
 * ============================================================
 * exercises.js
 * ============================================================
 *
 * Catálogo de exercícios da Etapa 3.
 *
 * Todas as notas são armazenadas internamente
 * como números MIDI.
 *
 * Referências:
 *
 * 48 = C3
 * 55 = G3
 * 60 = C4
 * 69 = A4
 *
 * ============================================================
 */


/*
 * Faixa inicial confortável para nossos primeiros testes.
 *
 * Evitamos notas muito graves e muito agudas enquanto
 * calibramos o sistema com vozes reais.
 */
export const PRACTICE_NOTES = [
    52, // E3
    53, // F3
    55, // G3
    57, // A3
    59, // B3
    60, // C4
    62, // D4
    64  // E4
];


/*
 * Retorna uma nota aleatória da faixa de treino.
 */
export function randomPracticeNote() {

    const index =
        Math.floor(
            Math.random() *
            PRACTICE_NOTES.length
        );

    return PRACTICE_NOTES[index];
}


/*
 * Evita repetir imediatamente a mesma nota.
 */
export function randomPracticeNoteExcept(
    excludedMidi
) {

    const available =
        PRACTICE_NOTES.filter(
            midi =>
                midi !== excludedMidi
        );


    const index =
        Math.floor(
            Math.random() *
            available.length
        );


    return available[index];
}


/*
 * ============================================================
 * DEFINIÇÕES DOS EXERCÍCIOS
 * ============================================================
 */

export const EXERCISES = {

    single: {

        id: "single",

        title:
            "Nota única",

        description:
            "Ouça uma nota e tente reproduzi-la corretamente.",

        /*
         * Quanto tempo o aluno deve permanecer dentro
         * da faixa correta.
         */
        requiredHoldMs:
            700,

        build() {

            const note =
                randomPracticeNote();

            return {
                notes: [note]
            };
        }
    },


    sustain: {

        id: "sustain",

        title:
            "Sustentação",

        description:
            "Encontre a nota e mantenha-a afinada por três segundos.",

        requiredHoldMs:
            3000,

        build() {

            const note =
                randomPracticeNote();

            return {
                notes: [note]
            };
        }
    },


    interval: {

        id: "interval",

        title:
            "Intervalos",

        description:
            "Ouça duas notas e reproduza cada uma na mesma ordem.",

        /*
         * Tempo necessário em cada nota.
         */
        requiredHoldMs:
            800,

        build() {

            const first =
                randomPracticeNote();

            /*
             * Intervalos simples:
             *
             * 2 = segunda maior
             * 3 = terça menor
             * 4 = terça maior
             * 5 = quarta justa
             * 7 = quinta justa
             */
            const possibleIntervals =
                [
                    2,
                    3,
                    4,
                    5,
                    7,
                    -2,
                    -3,
                    -4,
                    -5
                ];


            let candidates =
                possibleIntervals
                    .map(
                        interval =>
                            first +
                            interval
                    )
                    .filter(
                        midi =>
                            midi >= 48 &&
                            midi <= 67
                    );


            if (
                candidates.length === 0
            ) {

                candidates = [
                    randomPracticeNoteExcept(
                        first
                    )
                ];
            }


            const second =
                candidates[
                    Math.floor(
                        Math.random() *
                        candidates.length
                    )
                ];


            return {
                notes: [
                    first,
                    second
                ]
            };
        }
    },


    sequence: {

        id: "sequence",

        title:
            "Pequena sequência",

        description:
            "Ouça uma pequena frase musical e reproduza as notas uma a uma.",

        requiredHoldMs:
            650,

        build() {

            /*
             * Algumas pequenas frases pré-definidas.
             *
             * Nesta fase isso é preferível a sequências
             * totalmente aleatórias, porque tendem a soar musicais.
             */
            const sequences = [

                [
                    55, // G3
                    57, // A3
                    59, // B3
                    57, // A3
                    55  // G3
                ],

                [
                    60, // C4
                    62, // D4
                    64, // E4
                    62, // D4
                    60  // C4
                ],

                [
                    57, // A3
                    59, // B3
                    60, // C4
                    59, // B3
                    57  // A3
                ],

                [
                    52, // E3
                    55, // G3
                    57, // A3
                    55, // G3
                    52  // E3
                ],

                [
                    55, // G3
                    59, // B3
                    60, // C4
                    59, // B3
                    55  // G3
                ]
            ];


            const index =
                Math.floor(
                    Math.random() *
                    sequences.length
                );


            return {
                notes: [
                    ...sequences[index]
                ]
            };
        }
    }
};


/*
 * Recupera um exercício pelo ID.
 */
export function getExercise(
    exerciseId
) {

    return (
        EXERCISES[exerciseId] ||
        EXERCISES.single
    );
}