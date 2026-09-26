/*
 * ============================================================
 * music-theory.js
 * ============================================================
 *
 * Funções relacionadas a:
 *
 * - frequência;
 * - nota MIDI;
 * - nome da nota;
 * - oitava;
 * - cents;
 * - pitch class;
 * - tonalidade;
 * - escalas maiores e menores;
 * - verificação de pertencimento à tonalidade.
 *
 * Referência adotada:
 *
 * A4 = 440 Hz
 *
 * ============================================================
 */


/*
 * ============================================================
 * CONSTANTES BÁSICAS
 * ============================================================
 */

export const A4_FREQUENCY =
    440;


/*
 * Usamos sustenidos internamente.
 *
 * MIDI:
 *
 * 60 = C4
 * 61 = C#4
 * 62 = D4
 * ...
 * 69 = A4
 *
 * Pitch classes:
 *
 * C  = 0
 * C# = 1
 * D  = 2
 * D# = 3
 * E  = 4
 * F  = 5
 * F# = 6
 * G  = 7
 * G# = 8
 * A  = 9
 * A# = 10
 * B  = 11
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
 * ============================================================
 * ALIASES DE NOTAS
 * ============================================================
 *
 * Internamente trabalhamos sempre com sustenidos.
 *
 * Portanto:
 *
 * Db → C#
 * Eb → D#
 * Gb → F#
 * Ab → G#
 * Bb → A#
 *
 * Também aceitamos algumas grafias enarmônicas menos comuns
 * para deixar a função mais robusta.
 * ============================================================
 */

const NOTE_ALIASES = {

    /*
     * C
     */
    "C":
        "C",

    "B#":
        "C",


    /*
     * C#
     */
    "C#":
        "C#",

    "DB":
        "C#",


    /*
     * D
     */
    "D":
        "D",


    /*
     * D#
     */
    "D#":
        "D#",

    "EB":
        "D#",


    /*
     * E
     */
    "E":
        "E",

    "FB":
        "E",


    /*
     * F
     */
    "F":
        "F",

    "E#":
        "F",


    /*
     * F#
     */
    "F#":
        "F#",

    "GB":
        "F#",


    /*
     * G
     */
    "G":
        "G",


    /*
     * G#
     */
    "G#":
        "G#",

    "AB":
        "G#",


    /*
     * A
     */
    "A":
        "A",


    /*
     * A#
     */
    "A#":
        "A#",

    "BB":
        "A#",


    /*
     * B
     */
    "B":
        "B",

    "CB":
        "B"
};


/*
 * ============================================================
 * PADRÕES DAS ESCALAS
 * ============================================================
 *
 * Valores representam semitons a partir da tônica.
 *
 * Escala maior:
 *
 * 1  2  3  4  5  6  7
 * 0  2  4  5  7  9  11
 *
 *
 * Escala menor natural:
 *
 * 1  2  b3 4  5  b6 b7
 * 0  2  3  5  7  8  10
 *
 * Nesta primeira implementação, "minor" significa
 * MENOR NATURAL.
 *
 * Futuramente poderemos acrescentar:
 *
 * - harmonicMinor;
 * - melodicMinor;
 * - dorian;
 * - mixolydian;
 * - etc.
 *
 * sem alterar as funções públicas já criadas.
 * ============================================================
 */

const SCALE_PATTERNS = {

    major: [
        0,
        2,
        4,
        5,
        7,
        9,
        11
    ],

    minor: [
        0,
        2,
        3,
        5,
        7,
        8,
        10
    ]
};


/*
 * ============================================================
 * CONVERSÃO FREQUÊNCIA → MIDI FRACIONÁRIO
 * ============================================================
 *
 * Exemplo:
 *
 * 440 Hz = 69
 *
 * Uma frequência ligeiramente abaixo de A4 poderá resultar,
 * por exemplo, em 68.92.
 * ============================================================
 */

export function frequencyToMidiFloat(
    frequency
) {

    if (
        !Number.isFinite(
            frequency
        ) ||
        frequency <=
            0
    ) {

        return null;
    }


    return (
        69 +
        12 *
        Math.log2(
            frequency /
            A4_FREQUENCY
        )
    );
}


/*
 * ============================================================
 * FREQUÊNCIA → MIDI INTEIRO
 * ============================================================
 *
 * Retorna a nota MIDI inteira mais próxima.
 * ============================================================
 */

export function frequencyToMidi(
    frequency
) {

    const midiFloat =
        frequencyToMidiFloat(
            frequency
        );


    if (
        midiFloat ===
        null
    ) {

        return null;
    }


    return Math.round(
        midiFloat
    );
}


/*
 * ============================================================
 * MIDI → FREQUÊNCIA
 * ============================================================
 */

export function midiToFrequency(
    midi
) {

    return (
        A4_FREQUENCY *
        Math.pow(
            2,
            (
                midi -
                69
            ) /
            12
        )
    );
}


/*
 * ============================================================
 * MIDI → NOME DA NOTA
 * ============================================================
 *
 * Exemplos:
 *
 * 60 → C
 * 61 → C#
 * 67 → G
 * ============================================================
 */

export function midiToNoteName(
    midi
) {

    const index =
        (
            (
                midi %
                12
            ) +
            12
        ) %
        12;


    return NOTE_NAMES[
        index
    ];
}


/*
 * ============================================================
 * MIDI → OITAVA
 * ============================================================
 *
 * Exemplos:
 *
 * MIDI 60 → C4
 * MIDI 69 → A4
 * ============================================================
 */

export function midiToOctave(
    midi
) {

    return (
        Math.floor(
            midi /
            12
        ) -
        1
    );
}


/*
 * ============================================================
 * CENTS
 * ============================================================
 *
 * Calcula a diferença entre a frequência real
 * e a frequência exata da nota MIDI.
 *
 * Resultado:
 *
 * negativo = está grave
 * positivo = está agudo
 *
 * 100 cents = 1 semitom
 * ============================================================
 */

export function centsFromPitch(
    frequency,
    midi
) {

    const referenceFrequency =
        midiToFrequency(
            midi
        );


    return (
        1200 *
        Math.log2(
            frequency /
            referenceFrequency
        )
    );
}


/*
 * ============================================================
 * ANALISAR FREQUÊNCIA
 * ============================================================
 *
 * Recebe uma frequência e retorna todas as informações
 * musicais que nossa interface já utiliza.
 *
 * IMPORTANTE:
 *
 * Esta função mantém a estrutura anterior para preservar
 * compatibilidade completa com o restante do aplicativo.
 * ============================================================
 */

export function analyzeFrequency(
    frequency
) {

    const midi =
        frequencyToMidi(
            frequency
        );


    if (
        midi ===
        null
    ) {

        return null;
    }


    const note =
        midiToNoteName(
            midi
        );


    const octave =
        midiToOctave(
            midi
        );


    const idealFrequency =
        midiToFrequency(
            midi
        );


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


/*
 * ============================================================
 * MIDI → PITCH CLASS
 * ============================================================
 *
 * Pitch class representa apenas a nota,
 * independentemente da oitava.
 *
 * Exemplos:
 *
 * C3 → 0
 * C4 → 0
 * C5 → 0
 *
 * A3 → 9
 * A4 → 9
 *
 * Essa função será fundamental para analisar
 * notas alternativas dentro da tonalidade.
 * ============================================================
 */

export function midiToPitchClass(
    midi
) {

    const value =
        Number(
            midi
        );


    if (
        !Number.isFinite(
            value
        )
    ) {

        return null;
    }


    const roundedMidi =
        Math.round(
            value
        );


    return (
        (
            roundedMidi %
            12
        ) +
        12
    ) %
    12;
}


/*
 * ============================================================
 * NORMALIZAR NOME DE NOTA
 * ============================================================
 *
 * Converte diferentes formas de escrita para
 * nossa representação interna em sustenidos.
 *
 * Exemplos:
 *
 * C  → C
 * c  → C
 * Db → C#
 * db → C#
 * Bb → A#
 *
 * Também aceita o símbolo ♭.
 * ============================================================
 */

export function normalizeNoteName(
    noteName
) {

    if (
        typeof noteName !==
        "string"
    ) {

        return null;
    }


    let value =
        noteName
            .trim()
            .toUpperCase();


    if (
        !value
    ) {

        return null;
    }


    /*
     * Normalizamos símbolos musicais Unicode.
     */
    value =
        value
            .replace(
                /♯/g,
                "#"
            )
            .replace(
                /♭/g,
                "B"
            );


    /*
     * No nosso mapa, a letra B na segunda posição
     * representa o bemol:
     *
     * DB
     * EB
     * GB
     * AB
     * BB
     */
    const normalized =
        NOTE_ALIASES[
            value
        ];


    return (
        normalized ||
        null
    );
}


/*
 * ============================================================
 * NOME DA NOTA → PITCH CLASS
 * ============================================================
 *
 * Exemplos:
 *
 * C  → 0
 * C# → 1
 * Db → 1
 * A  → 9
 * Bb → 10
 * ============================================================
 */

export function noteNameToPitchClass(
    noteName
) {

    const normalized =
        normalizeNoteName(
            noteName
        );


    if (
        normalized ===
        null
    ) {

        return null;
    }


    const index =
        NOTE_NAMES.indexOf(
            normalized
        );


    return (
        index >=
        0
            ? index
            : null
    );
}


/*
 * ============================================================
 * PITCH CLASS → NOME DA NOTA
 * ============================================================
 *
 * Trabalhamos sempre com sustenidos internamente.
 *
 * Exemplos:
 *
 * 0  → C
 * 1  → C#
 * 9  → A
 * 10 → A#
 * ============================================================
 */

export function pitchClassToNoteName(
    pitchClass
) {

    const value =
        Number(
            pitchClass
        );


    if (
        !Number.isFinite(
            value
        )
    ) {

        return null;
    }


    const index =
        (
            (
                Math.round(
                    value
                ) %
                12
            ) +
            12
        ) %
        12;


    return NOTE_NAMES[
        index
    ];
}


/*
 * ============================================================
 * NORMALIZAR MODO DA ESCALA
 * ============================================================
 *
 * Forma interna:
 *
 * major
 * minor
 *
 * Também aceitamos:
 *
 * maior
 * menor
 *
 * Isso nos dá alguma tolerância caso os metadados
 * futuramente sejam cadastrados em português.
 * ============================================================
 */

export function normalizeScaleMode(
    mode
) {

    if (
        typeof mode !==
        "string"
    ) {

        return null;
    }


    const value =
        mode
            .trim()
            .toLowerCase();


    if (
        value ===
        "major" ||
        value ===
        "maior"
    ) {

        return "major";
    }


    if (
        value ===
        "minor" ||
        value ===
        "menor"
    ) {

        return "minor";
    }


    return null;
}


/*
 * ============================================================
 * VALIDAR TONALIDADE
 * ============================================================
 *
 * Retorna true somente quando:
 *
 * - a tônica é reconhecida;
 * - o modo é reconhecido.
 *
 * Exemplos:
 *
 * isValidKeySignature("C", "major")
 * → true
 *
 * isValidKeySignature("Bb", "minor")
 * → true
 *
 * isValidKeySignature("H", "major")
 * → false
 * ============================================================
 */

export function isValidKeySignature(
    key,
    mode
) {

    return (
        noteNameToPitchClass(
            key
        ) !==
            null &&
        normalizeScaleMode(
            mode
        ) !==
            null
    );
}


/*
 * ============================================================
 * GERAR PITCH CLASSES DA ESCALA
 * ============================================================
 *
 * Exemplo:
 *
 * C maior
 *
 * getScalePitchClasses(
 *     "C",
 *     "major"
 * )
 *
 * retorna:
 *
 * [
 *     0,  // C
 *     2,  // D
 *     4,  // E
 *     5,  // F
 *     7,  // G
 *     9,  // A
 *     11  // B
 * ]
 *
 *
 * A menor natural retorna:
 *
 * [
 *     9,  // A
 *     11, // B
 *     0,  // C
 *     2,  // D
 *     4,  // E
 *     5,  // F
 *     7   // G
 * ]
 *
 * Se a tonalidade for inválida, retorna null.
 * ============================================================
 */

export function getScalePitchClasses(
    key,
    mode
) {

    const tonicPitchClass =
        noteNameToPitchClass(
            key
        );


    const normalizedMode =
        normalizeScaleMode(
            mode
        );


    if (
        tonicPitchClass ===
            null ||
        normalizedMode ===
            null
    ) {

        return null;
    }


    const pattern =
        SCALE_PATTERNS[
            normalizedMode
        ];


    return pattern.map(
        interval =>
            (
                tonicPitchClass +
                interval
            ) %
            12
    );
}


/*
 * ============================================================
 * GERAR NOMES DAS NOTAS DA ESCALA
 * ============================================================
 *
 * Exemplo:
 *
 * getScaleNoteNames(
 *     "C",
 *     "major"
 * )
 *
 * retorna:
 *
 * [
 *     "C",
 *     "D",
 *     "E",
 *     "F",
 *     "G",
 *     "A",
 *     "B"
 * ]
 *
 * Observação:
 *
 * Neste estágio usamos a grafia interna com sustenidos.
 *
 * Portanto Bb maior, por exemplo, poderá ser exibido
 * enarmonicamente com A#.
 *
 * Isso NÃO interfere na afinação nem na análise MIDI.
 *
 * Futuramente, se quisermos uma representação visual
 * musicalmente ortográfica perfeita, poderemos adicionar
 * uma camada específica para sustenidos/bemóis.
 * ============================================================
 */

export function getScaleNoteNames(
    key,
    mode
) {

    const pitchClasses =
        getScalePitchClasses(
            key,
            mode
        );


    if (
        pitchClasses ===
        null
    ) {

        return null;
    }


    return pitchClasses.map(
        pitchClass =>
            pitchClassToNoteName(
                pitchClass
            )
    );
}


/*
 * ============================================================
 * VERIFICAR PITCH CLASS NA ESCALA
 * ============================================================
 *
 * Exemplo:
 *
 * C maior:
 *
 * C  → true
 * D  → true
 * F# → false
 * ============================================================
 */

export function isPitchClassInScale(
    pitchClass,
    key,
    mode
) {

    const normalizedPitchClass =
        Number(
            pitchClass
        );


    if (
        !Number.isFinite(
            normalizedPitchClass
        )
    ) {

        return false;
    }


    const scale =
        getScalePitchClasses(
            key,
            mode
        );


    if (
        scale ===
        null
    ) {

        return false;
    }


    const normalized =
        (
            (
                Math.round(
                    normalizedPitchClass
                ) %
                12
            ) +
            12
        ) %
        12;


    return scale.includes(
        normalized
    );
}


/*
 * ============================================================
 * VERIFICAR MIDI NA ESCALA
 * ============================================================
 *
 * Esta será uma das funções centrais da futura
 * análise de "notas alternativas".
 *
 *
 * Exemplo:
 *
 * C maior:
 *
 * MIDI 60 = C4
 * → true
 *
 * MIDI 69 = A4
 * → true
 *
 * MIDI 61 = C#4
 * → false
 *
 *
 * A oitava NÃO importa:
 *
 * C3
 * C4
 * C5
 * C6
 *
 * pertencem igualmente à escala de C maior.
 * ============================================================
 */

export function isMidiInScale(
    midi,
    key,
    mode
) {

    const pitchClass =
        midiToPitchClass(
            midi
        );


    if (
        pitchClass ===
        null
    ) {

        return false;
    }


    return isPitchClassInScale(
        pitchClass,
        key,
        mode
    );
}


/*
 * ============================================================
 * VERIFICAR NOME DE NOTA NA ESCALA
 * ============================================================
 *
 * Útil principalmente para testes, interface
 * e futuras ferramentas de configuração.
 *
 * Exemplos:
 *
 * isNoteInScale(
 *     "F#",
 *     "C",
 *     "major"
 * )
 *
 * → false
 *
 *
 * isNoteInScale(
 *     "Bb",
 *     "F",
 *     "major"
 * )
 *
 * → true
 * ============================================================
 */

export function isNoteInScale(
    noteName,
    key,
    mode
) {

    const pitchClass =
        noteNameToPitchClass(
            noteName
        );


    if (
        pitchClass ===
        null
    ) {

        return false;
    }


    return isPitchClassInScale(
        pitchClass,
        key,
        mode
    );
}


/*
 * ============================================================
 * MESMA NOTA EM OUTRA OITAVA
 * ============================================================
 *
 * Ainda não usaremos esta função na pontuação.
 *
 * Ela apenas prepara a infraestrutura para distinguir:
 *
 * C4 ↔ C5
 *
 * de:
 *
 * C4 ↔ E4
 *
 *
 * Exemplos:
 *
 * MIDI 60 = C4
 * MIDI 72 = C5
 *
 * → true
 *
 *
 * MIDI 60 = C4
 * MIDI 64 = E4
 *
 * → false
 * ============================================================
 */

export function isSamePitchClass(
    midiA,
    midiB
) {

    const pitchClassA =
        midiToPitchClass(
            midiA
        );


    const pitchClassB =
        midiToPitchClass(
            midiB
        );


    if (
        pitchClassA ===
            null ||
        pitchClassB ===
            null
    ) {

        return false;
    }


    return (
        pitchClassA ===
        pitchClassB
    );
}


/*
 * ============================================================
 * ANALISAR MIDI EM RELAÇÃO À TONALIDADE
 * ============================================================
 *
 * Função auxiliar para as próximas etapas.
 *
 * Ainda NÃO altera score, piano roll ou resultado.
 *
 * Retorna uma estrutura pronta para consumo futuro:
 *
 * {
 *     midi: 69,
 *     pitchClass: 9,
 *     note: "A",
 *     octave: 4,
 *     key: "C",
 *     mode: "major",
 *     inScale: true
 * }
 *
 * Se a tonalidade informada for inválida,
 * key/mode serão normalizados quando possível e
 * validKey será false.
 * ============================================================
 */

export function analyzeMidiInKey(
    midi,
    key,
    mode
) {

    const numericMidi =
        Number(
            midi
        );


    if (
        !Number.isFinite(
            numericMidi
        )
    ) {

        return null;
    }


    const roundedMidi =
        Math.round(
            numericMidi
        );


    const pitchClass =
        midiToPitchClass(
            roundedMidi
        );


    const normalizedKey =
        normalizeNoteName(
            key
        );


    const normalizedMode =
        normalizeScaleMode(
            mode
        );


    const validKey =
        (
            normalizedKey !==
                null &&
            normalizedMode !==
                null
        );


    return {

        midi:
            roundedMidi,

        pitchClass,

        note:
            midiToNoteName(
                roundedMidi
            ),

        octave:
            midiToOctave(
                roundedMidi
            ),

        key:
            normalizedKey,

        mode:
            normalizedMode,

        validKey,

        inScale:
            validKey
                ? isMidiInScale(
                    roundedMidi,
                    normalizedKey,
                    normalizedMode
                )
                : false
    };
}