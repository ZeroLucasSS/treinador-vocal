/*
 * ============================================================
 * melodies.js
 * ============================================================
 *
 * Biblioteca de melodias utilizadas pelo modo
 * de melodia contínua / piano roll.
 *
 * Cada nota é representada por:
 *
 * {
 *     midi: 60,
 *     start: 0.0,
 *     duration: 0.8
 * }
 *
 * Onde:
 *
 * midi
 *     número MIDI da nota
 *
 * start
 *     instante de início em segundos
 *
 * duration
 *     duração da nota em segundos
 *
 * ============================================================
 */


/*
 * ============================================================
 * CATÁLOGO DE MELODIAS
 * ============================================================
 */

export const MELODIES = [

    /*
     * --------------------------------------------------------
     * ESCALA DE DÓ MAIOR
     * --------------------------------------------------------
     *
     * C4 D4 E4 F4 G4 A4 B4 C5
     * C5 B4 A4 G4 F4 E4 D4 C4
     *
     * Boa para:
     *
     * - testar sincronismo;
     * - testar mudanças graduais de altura;
     * - testar o traçado vocal;
     * - validar as cores das barras.
     * --------------------------------------------------------
     */

    {
        id:
            "escala-maior",

        name:
            "Escala de Dó Maior",

        description:
            "Escala ascendente e descendente para treinar mudanças graduais de altura.",

        notes: [

            {
                midi: 60,
                start: 0.0,
                duration: 0.8
            },

            {
                midi: 62,
                start: 1.0,
                duration: 0.8
            },

            {
                midi: 64,
                start: 2.0,
                duration: 0.8
            },

            {
                midi: 65,
                start: 3.0,
                duration: 0.8
            },

            {
                midi: 67,
                start: 4.0,
                duration: 0.8
            },

            {
                midi: 69,
                start: 5.0,
                duration: 0.8
            },

            {
                midi: 71,
                start: 6.0,
                duration: 0.8
            },

            {
                midi: 72,
                start: 7.0,
                duration: 1.2
            },


            /*
             * Descendente
             */

            {
                midi: 71,
                start: 8.5,
                duration: 0.8
            },

            {
                midi: 69,
                start: 9.5,
                duration: 0.8
            },

            {
                midi: 67,
                start: 10.5,
                duration: 0.8
            },

            {
                midi: 65,
                start: 11.5,
                duration: 0.8
            },

            {
                midi: 64,
                start: 12.5,
                duration: 0.8
            },

            {
                midi: 62,
                start: 13.5,
                duration: 0.8
            },

            {
                midi: 60,
                start: 14.5,
                duration: 1.5
            }
        ]
    },


    /*
     * --------------------------------------------------------
     * FRASE MELÓDICA SIMPLES
     * --------------------------------------------------------
     *
     * G3 A3 B3 A3 G3
     * A3 B3 C4 B3 A3 G3
     *
     * Boa para começar a aproximar o sistema
     * de uma frase musical real.
     * --------------------------------------------------------
     */

    {
        id:
            "frase-simples",

        name:
            "Frase Melódica Simples",

        description:
            "Pequena frase musical com movimentos conjuntos e mudanças suaves de direção.",

        notes: [

            {
                midi: 55,
                start: 0.0,
                duration: 1.0
            },

            {
                midi: 57,
                start: 1.2,
                duration: 1.0
            },

            {
                midi: 59,
                start: 2.4,
                duration: 1.0
            },

            {
                midi: 57,
                start: 3.6,
                duration: 1.0
            },

            {
                midi: 55,
                start: 4.8,
                duration: 1.4
            },


            {
                midi: 57,
                start: 6.5,
                duration: 0.8
            },

            {
                midi: 59,
                start: 7.5,
                duration: 0.8
            },

            {
                midi: 60,
                start: 8.5,
                duration: 1.3
            },


            {
                midi: 59,
                start: 10.1,
                duration: 0.8
            },

            {
                midi: 57,
                start: 11.1,
                duration: 0.8
            },

            {
                midi: 55,
                start: 12.1,
                duration: 1.8
            }
        ]
    },


    /*
     * --------------------------------------------------------
     * PEQUENOS SALTOS
     * --------------------------------------------------------
     *
     * Exercício com terças e saltos curtos.
     *
     * Ajuda a testar:
     *
     * - entrada correta após mudança maior de frequência;
     * - capacidade de encontrar a nova nota;
     * - erros de aproximação;
     * - estabilidade depois do salto.
     * --------------------------------------------------------
     */

    {
        id:
            "saltos",

        name:
            "Pequenos Saltos",

        description:
            "Treino com terças e pequenos saltos para praticar mudanças mais rápidas de altura.",

        notes: [

            {
                midi: 55,
                start: 0.0,
                duration: 1.0
            },

            {
                midi: 59,
                start: 1.2,
                duration: 1.0
            },

            {
                midi: 57,
                start: 2.4,
                duration: 1.0
            },

            {
                midi: 60,
                start: 3.6,
                duration: 1.0
            },

            {
                midi: 59,
                start: 4.8,
                duration: 1.3
            },


            {
                midi: 55,
                start: 6.4,
                duration: 1.0
            },

            {
                midi: 60,
                start: 7.6,
                duration: 1.0
            },

            {
                midi: 57,
                start: 8.8,
                duration: 1.0
            },

            {
                midi: 59,
                start: 10.0,
                duration: 1.0
            },

            {
                midi: 55,
                start: 11.2,
                duration: 1.8
            }
        ]
    }
];


/*
 * ============================================================
 * RECUPERAR MELODIA
 * ============================================================
 *
 * Procura pelo ID.
 *
 * Se o ID não existir, retorna a primeira melodia
 * do catálogo para evitar quebra do aplicativo.
 * ============================================================
 */

export function getMelody(
    id
) {

    const melody =
        MELODIES.find(
            item =>
                item.id === id
        );


    return (
        melody ||
        MELODIES[0]
    );
}


/*
 * ============================================================
 * DURAÇÃO TOTAL DA MELODIA
 * ============================================================
 *
 * Não usamos simplesmente o início da última nota.
 *
 * A duração real é:
 *
 * start + duration
 *
 * da nota que terminar mais tarde.
 * ============================================================
 */

export function getMelodyDuration(
    melody
) {

    if (
        !melody ||
        !Array.isArray(
            melody.notes
        ) ||
        melody.notes.length === 0
    ) {

        return 0;
    }


    let maximumEnd =
        0;


    for (
        const note of
        melody.notes
    ) {

        const start =
            Number(
                note.start
            );


        const duration =
            Number(
                note.duration
            );


        if (
            !Number.isFinite(
                start
            ) ||
            !Number.isFinite(
                duration
            )
        ) {

            continue;
        }


        const end =
            start +
            duration;


        if (
            end >
            maximumEnd
        ) {

            maximumEnd =
                end;
        }
    }


    return maximumEnd;
}