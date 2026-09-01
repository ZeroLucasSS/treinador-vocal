/*
 * ============================================================
 * melodies.js
 * ============================================================
 *
 * Biblioteca inicial de melodias.
 *
 * Formato:
 *
 * {
 *     midi: 60,
 *     start: 0,
 *     duration: 1
 * }
 *
 * Todos os tempos estão em segundos.
 *
 * ============================================================
 */


export const MELODIES = [

    {
        id: "escala-maior",

        name: "Escala de Dó Maior",

        description:
            "Escala ascendente e descendente.",

        notes: [

            { midi: 60, start: 0.0, duration: 0.8 },
            { midi: 62, start: 1.0, duration: 0.8 },
            { midi: 64, start: 2.0, duration: 0.8 },
            { midi: 65, start: 3.0, duration: 0.8 },
            { midi: 67, start: 4.0, duration: 0.8 },
            { midi: 69, start: 5.0, duration: 0.8 },
            { midi: 71, start: 6.0, duration: 0.8 },
            { midi: 72, start: 7.0, duration: 1.2 },

            { midi: 71, start: 8.5, duration: 0.8 },
            { midi: 69, start: 9.5, duration: 0.8 },
            { midi: 67, start: 10.5, duration: 0.8 },
            { midi: 65, start: 11.5, duration: 0.8 },
            { midi: 64, start: 12.5, duration: 0.8 },
            { midi: 62, start: 13.5, duration: 0.8 },
            { midi: 60, start: 14.5, duration: 1.5 }
        ]
    },


    {
        id: "frase-simples",

        name: "Frase Melódica Simples",

        description:
            "Pequena frase em graus conjuntos.",

        notes: [

            { midi: 55, start: 0.0, duration: 1.0 },
            { midi: 57, start: 1.2, duration: 1.0 },
            { midi: 59, start: 2.4, duration: 1.0 },
            { midi: 57, start: 3.6, duration: 1.0 },

            { midi: 55, start: 4.8, duration: 1.4 },

            { midi: 57, start: 6.5, duration: 0.8 },
            { midi: 59, start: 7.5, duration: 0.8 },
            { midi: 60, start: 8.5, duration: 1.3 },

            { midi: 59, start: 10.1, duration: 0.8 },
            { midi: 57, start: 11.1, duration: 0.8 },
            { midi: 55, start: 12.1, duration: 1.8 }
        ]
    },


    {
        id: "saltos",

        name: "Pequenos Saltos",

        description:
            "Treino com terças e pequenas mudanças de direção.",

        notes: [

            { midi: 55, start: 0.0, duration: 1.0 },
            { midi: 59, start: 1.2, duration: 1.0 },
            { midi: 57, start: 2.4, duration: 1.0 },
            { midi: 60, start: 3.6, duration: 1.0 },

            { midi: 59, start: 4.8, duration: 1.3 },

            { midi: 55, start: 6.4, duration: 1.0 },
            { midi: 60, start: 7.6, duration: 1.0 },
            { midi: 57, start: 8.8, duration: 1.0 },

            { midi: 59, start: 10.0, duration: 1.0 },
            { midi: 55, start: 11.2, duration: 1.8 }
        ]
    }
];


/*
 * Recupera melodia pelo ID.
 */
export function getMelody(
    id
) {

    return (
        MELODIES.find(
            melody =>
                melody.id === id
        ) ||
        MELODIES[0]
    );
}


/*
 * Duração total incluindo o final da última nota.
 */
export function getMelodyDuration(
    melody
) {

    if (
        !melody ||
        !melody.notes.length
    ) {

        return 0;
    }


    return Math.max(
        ...melody.notes.map(
            note =>
                note.start +
                note.duration
        )
    );
}