/*
 * ============================================================
 * srt-loader.js
 * ============================================================
 *
 * Carregamento e interpretação de arquivos SRT.
 *
 * Responsabilidades:
 *
 * - carregar um arquivo .srt por URL;
 * - interpretar timestamps;
 * - preservar frases e quebras de linha;
 * - ordenar as legendas;
 * - fornecer busca da legenda ativa;
 * - suportar offset independente da letra.
 *
 * Formato retornado:
 *
 * [
 *     {
 *         index: 1,
 *         start: 12.350,
 *         end: 16.800,
 *         text: "Primeira linha\nSegunda linha"
 *     }
 * ]
 *
 * Os tempos são sempre expressos em SEGUNDOS.
 *
 * ============================================================
 */


/*
 * ============================================================
 * CARREGAR SRT POR URL
 * ============================================================
 */

export async function loadSrtFromUrl(
    url
) {

    if (
        !url ||
        typeof url !==
            "string"
    ) {

        throw new Error(
            "URL do arquivo SRT inválida."
        );
    }


    const response =
        await fetch(
            url,
            {
                cache:
                    "no-cache"
            }
        );


    if (
        !response.ok
    ) {

        throw new Error(
            `Não foi possível carregar a letra (${response.status}).`
        );
    }


    const text =
        await response.text();


    return parseSrt(
        text
    );
}


/*
 * ============================================================
 * INTERPRETAR SRT
 * ============================================================
 */

export function parseSrt(
    source
) {

    if (
        source ===
        null ||
        source ===
        undefined
    ) {

        return [];
    }


    let text =
        String(
            source
        );


    /*
     * Remove BOM UTF-8 quando presente.
     */
    text =
        text.replace(
            /^\uFEFF/,
            ""
        );


    /*
     * Normaliza finais de linha:
     *
     * Windows CRLF
     * Mac antigo CR
     * Unix LF
     */
    text =
        text.replace(
            /\r\n?/g,
            "\n"
        );


    /*
     * Espaços extras no começo/fim do arquivo
     * não possuem valor semântico para SRT.
     */
    text =
        text.trim();


    if (
        !text
    ) {

        return [];
    }


    /*
     * Blocos SRT são separados por uma ou
     * mais linhas em branco.
     */
    const blocks =
        text.split(
            /\n[ \t]*\n+/g
        );


    const subtitles =
        [];


    for (
        const block of
        blocks
    ) {

        const subtitle =
            parseSubtitleBlock(
                block,
                subtitles.length
            );


        if (
            subtitle
        ) {

            subtitles.push(
                subtitle
            );
        }
    }


    /*
     * Mesmo que o arquivo esteja fora de ordem,
     * o aplicativo trabalhará cronologicamente.
     */
    subtitles.sort(
        (a, b) => {

            if (
                a.start !==
                b.start
            ) {

                return (
                    a.start -
                    b.start
                );
            }


            return (
                a.end -
                b.end
            );
        }
    );


    /*
     * Recriamos a ordem sequencial interna,
     * mas preservamos originalIndex para diagnóstico.
     */
    return subtitles.map(
        (
            subtitle,
            position
        ) => ({

            ...subtitle,

            position
        })
    );
}


/*
 * ============================================================
 * INTERPRETAR BLOCO
 * ============================================================
 */

function parseSubtitleBlock(
    block,
    fallbackIndex
) {

    const lines =
        String(
            block
        )
        .split(
            "\n"
        );


    /*
     * Remove apenas linhas completamente vazias
     * nas extremidades do bloco.
     */
    while (
        lines.length &&
        !lines[0].trim()
    ) {

        lines.shift();
    }


    while (
        lines.length &&
        !lines[
            lines.length -
            1
        ].trim()
    ) {

        lines.pop();
    }


    if (
        lines.length <
        2
    ) {

        return null;
    }


    /*
     * --------------------------------------------------------
     * LOCALIZAR LINHA DE TEMPO
     * --------------------------------------------------------
     *
     * O SRT normalmente possui:
     *
     * 1
     * 00:00:10,000 --> 00:00:14,000
     * Texto
     *
     * Mas alguns geradores omitem o número.
     */
    let timingLineIndex =
        lines.findIndex(
            line =>
                line.includes(
                    "-->"
                )
        );


    if (
        timingLineIndex ===
        -1
    ) {

        return null;
    }


    const timingLine =
        lines[
            timingLineIndex
        ];


    const timing =
        parseTimingLine(
            timingLine
        );


    if (
        !timing
    ) {

        return null;
    }


    /*
     * --------------------------------------------------------
     * ÍNDICE ORIGINAL
     * --------------------------------------------------------
     */

    let originalIndex =
        fallbackIndex +
        1;


    if (
        timingLineIndex >
        0
    ) {

        const possibleIndex =
            Number.parseInt(
                lines[0].trim(),
                10
            );


        if (
            Number.isFinite(
                possibleIndex
            )
        ) {

            originalIndex =
                possibleIndex;
        }
    }


    /*
     * --------------------------------------------------------
     * TEXTO
     * --------------------------------------------------------
     *
     * Tudo depois da linha temporal é tratado
     * como letra.
     *
     * As quebras de linha são preservadas.
     */
    const textLines =
        lines.slice(
            timingLineIndex +
            1
        );


    const subtitleText =
        textLines
            .join(
                "\n"
            )
            .trim();


    if (
        !subtitleText
    ) {

        return null;
    }


    return {

        index:
            originalIndex,

        originalIndex,

        start:
            timing.start,

        end:
            timing.end,

        duration:
            Math.max(
                0,
                timing.end -
                timing.start
            ),

        text:
            subtitleText
    };
}


/*
 * ============================================================
 * INTERPRETAR LINHA TEMPORAL
 * ============================================================
 */

function parseTimingLine(
    line
) {

    const parts =
        String(
            line
        )
        .split(
            "-->"
        );


    if (
        parts.length <
        2
    ) {

        return null;
    }


    /*
     * Alguns arquivos adicionam propriedades depois
     * do timestamp final.
     *
     * Exemplo:
     *
     * 00:00:01,000 --> 00:00:03,000 position:50%
     *
     * Pegamos apenas o primeiro token temporal.
     */
    const startText =
        parts[0]
            .trim();


    const endText =
        parts[1]
            .trim()
            .split(
                /\s+/
            )[0];


    const start =
        parseSrtTimestamp(
            startText
        );


    const end =
        parseSrtTimestamp(
            endText
        );


    if (
        !Number.isFinite(
            start
        ) ||
        !Number.isFinite(
            end
        )
    ) {

        return null;
    }


    if (
        end <
        start
    ) {

        return null;
    }


    return {

        start,

        end
    };
}


/*
 * ============================================================
 * TIMESTAMP SRT → SEGUNDOS
 * ============================================================
 *
 * Aceita:
 *
 * 00:01:23,456
 * 00:01:23.456
 * 01:23,456
 *
 * ============================================================
 */

export function parseSrtTimestamp(
    value
) {

    if (
        typeof value !==
        "string"
    ) {

        return NaN;
    }


    const normalized =
        value
            .trim()
            .replace(
                ".",
                ","
            );


    const match =
        normalized.match(
            /^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:,(\d{1,3}))?$/
        );


    if (
        !match
    ) {

        return NaN;
    }


    const hours =
        Number(
            match[1] ||
            0
        );


    const minutes =
        Number(
            match[2]
        );


    const seconds =
        Number(
            match[3]
        );


    const millisecondsText =
        match[4] ||
        "0";


    /*
     * "5"   → 500 ms
     * "50"  → 500 ms
     * "500" → 500 ms
     */
    const milliseconds =
        Number(
            millisecondsText.padEnd(
                3,
                "0"
            )
        );


    if (
        !Number.isFinite(
            hours
        ) ||
        !Number.isFinite(
            minutes
        ) ||
        !Number.isFinite(
            seconds
        ) ||
        !Number.isFinite(
            milliseconds
        )
    ) {

        return NaN;
    }


    if (
        minutes >
        59 ||
        seconds >
        59
    ) {

        return NaN;
    }


    return (
        hours *
            3600 +
        minutes *
            60 +
        seconds +
        milliseconds /
            1000
    );
}


/*
 * ============================================================
 * NORMALIZAR OFFSET DA LETRA
 * ============================================================
 */

export function normalizeLyricsOffset(
    value
) {

    const numeric =
        Number(
            value
        );


    return Number.isFinite(
        numeric
    )
        ? numeric
        : 0;
}


/*
 * ============================================================
 * TEMPO EFETIVO DA LETRA
 * ============================================================
 *
 * Convenção:
 *
 * offset positivo:
 *     legenda aparece MAIS TARDE.
 *
 * offset negativo:
 *     legenda aparece MAIS CEDO.
 *
 * Exemplo:
 *
 * SRT:
 *     start = 10.0
 *
 * lyricsOffset:
 *     +0.5
 *
 * exibição:
 *     10.5 s
 *
 * Para descobrir a legenda ativa usando
 * audio.currentTime, convertemos:
 *
 * lyricTime = audioTime - lyricsOffset
 *
 * ============================================================
 */

export function getLyricsTime(
    audioTime,
    lyricsOffset =
        0
) {

    const safeAudioTime =
        Number.isFinite(
            Number(
                audioTime
            )
        )
            ? Number(
                audioTime
            )
            : 0;


    const offset =
        normalizeLyricsOffset(
            lyricsOffset
        );


    return (
        safeAudioTime -
        offset
    );
}


/*
 * ============================================================
 * BUSCAR LEGENDA ATIVA
 * ============================================================
 *
 * Busca binária.
 *
 * Útil quando:
 *
 * - usuário pula para outro ponto da música;
 * - reinicia o áudio;
 * - precisamos encontrar legenda sem depender
 *   de um índice incremental.
 *
 * ============================================================
 */

export function findActiveSubtitle(
    subtitles,
    audioTime,
    lyricsOffset =
        0
) {

    if (
        !Array.isArray(
            subtitles
        ) ||
        subtitles.length ===
            0
    ) {

        return null;
    }


    const time =
        getLyricsTime(
            audioTime,
            lyricsOffset
        );


    let low =
        0;


    let high =
        subtitles.length -
        1;


    while (
        low <=
        high
    ) {

        const middle =
            Math.floor(
                (
                    low +
                    high
                ) /
                2
            );


        const subtitle =
            subtitles[
                middle
            ];


        if (
            time <
            subtitle.start
        ) {

            high =
                middle -
                1;


            continue;
        }


        if (
            time >
            subtitle.end
        ) {

            low =
                middle +
                1;


            continue;
        }


        return subtitle;
    }


    return null;
}


/*
 * ============================================================
 * ÍNDICE DA LEGENDA ATIVA
 * ============================================================
 */

export function findActiveSubtitleIndex(
    subtitles,
    audioTime,
    lyricsOffset =
        0
) {

    if (
        !Array.isArray(
            subtitles
        ) ||
        subtitles.length ===
            0
    ) {

        return -1;
    }


    const time =
        getLyricsTime(
            audioTime,
            lyricsOffset
        );


    let low =
        0;


    let high =
        subtitles.length -
        1;


    while (
        low <=
        high
    ) {

        const middle =
            Math.floor(
                (
                    low +
                    high
                ) /
                2
            );


        const subtitle =
            subtitles[
                middle
            ];


        if (
            time <
            subtitle.start
        ) {

            high =
                middle -
                1;

        } else if (
            time >
            subtitle.end
        ) {

            low =
                middle +
                1;

        } else {

            return middle;
        }
    }


    return -1;
}


/*
 * ============================================================
 * DURAÇÃO TOTAL DA LETRA
 * ============================================================
 */

export function getSrtDuration(
    subtitles
) {

    if (
        !Array.isArray(
            subtitles
        ) ||
        subtitles.length ===
            0
    ) {

        return 0;
    }


    return subtitles.reduce(
        (
            maximum,
            subtitle
        ) =>
            Math.max(
                maximum,
                Number(
                    subtitle.end
                ) ||
                0
            ),
        0
    );
}