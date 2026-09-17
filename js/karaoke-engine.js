/*
 * ============================================================
 * karaoke-engine.js
 * ============================================================
 *
 * Motor de associação:
 *
 *     letra.srt
 *          +
 *     voz_silabas.srt
 *          +
 *       voz.mid
 *          ↓
 *     MODELO DE KARAOKÊ
 *
 *
 * RESPONSABILIDADES:
 *
 * 1. validar notas MIDI ↔ sílabas;
 *
 * 2. tentar primeiro a associação direta 1:1:
 *
 *        sílaba 0 ↔ nota 0
 *        sílaba 1 ↔ nota 1
 *        ...
 *
 * 3. caso a associação direta falhe,
 *    tentar associação temporal por sobreposição;
 *
 * 4. associar as sílabas às frases completas;
 *
 * 5. localizar cada sílaba dentro do texto original,
 *    preservando:
 *
 *        - espaços;
 *        - pontuação;
 *        - acentos;
 *        - capitalização.
 *
 * 6. calcular o tempo efetivo da frase;
 *
 * 7. fornecer funções rápidas para descobrir:
 *
 *        - frase atual;
 *        - sílaba atual;
 *        - nota atual;
 *
 *    usando o relógio mestre do MP3.
 *
 *
 * IMPORTANTE
 * ------------------------------------------------------------
 *
 * Este módulo NÃO reproduz áudio.
 *
 * Este módulo NÃO desenha HTML.
 *
 * Este módulo NÃO altera o piano roll.
 *
 * Ele apenas constrói e consulta o modelo de dados.
 *
 * ============================================================
 */


/*
 * ============================================================
 * CONFIGURAÇÃO PADRÃO
 * ============================================================
 */


/*
 * Diferença temporal máxima para considerar
 * nota e sílaba diretamente alinhadas.
 *
 * 20 ms.
 *
 * Em Tempo Perdido encontramos diferenças
 * inferiores a 1 ms, portanto há ampla margem.
 */
const DEFAULT_DIRECT_TOLERANCE_SECONDS =
    0.020;


/*
 * Pequena tolerância utilizada ao decidir
 * em qual frase uma sílaba começa.
 *
 * 30 ms.
 */
const DEFAULT_PHRASE_TOLERANCE_SECONDS =
    0.030;


/*
 * Sobreposição temporal mínima para aceitar
 * uma correspondência de fallback.
 *
 * 20% do menor dos dois intervalos.
 */
const DEFAULT_MIN_OVERLAP_RATIO =
    0.20;


/*
 * ============================================================
 * CONSTRUIR MODELO COMPLETO
 * ============================================================
 */

export function buildKaraokeModel({

    phrases,
    syllables,
    notes,

    directToleranceSeconds =
        DEFAULT_DIRECT_TOLERANCE_SECONDS,

    phraseToleranceSeconds =
        DEFAULT_PHRASE_TOLERANCE_SECONDS,

    minOverlapRatio =
        DEFAULT_MIN_OVERLAP_RATIO

} = {}) {

    /*
     * ========================================================
     * NORMALIZAÇÃO DE ENTRADA
     * ========================================================
     */

    const safePhrases =
        normalizePhraseInput(
            phrases
        );


    const safeSyllables =
        normalizeSyllableInput(
            syllables
        );


    const safeNotes =
        normalizeNoteInput(
            notes
        );


    /*
     * ========================================================
     * DIAGNÓSTICO INICIAL
     * ========================================================
     */

    const diagnostics = {

        phraseCount:
            safePhrases.length,

        syllableCount:
            safeSyllables.length,

        noteCount:
            safeNotes.length,

        directAlignment:
            null,

        noteAlignmentMode:
            null,

        noteMatches:
            0,

        unmatchedNotes:
            0,

        unmatchedSyllables:
            0,

        phraseMatches:
            0,

        phraseTextMatches:
            0,

        phraseTextMismatches:
            0,

        warnings:
            []
    };


    /*
     * ========================================================
     * NÃO HÁ DADOS SUFICIENTES
     * ========================================================
     */

    if (
        safeSyllables.length ===
        0
    ) {

        diagnostics.warnings.push(
            "Nenhuma sílaba foi fornecida."
        );


        return createEmptyModel(
            diagnostics
        );
    }


    if (
        safeNotes.length ===
        0
    ) {

        diagnostics.warnings.push(
            "Nenhuma nota MIDI foi fornecida."
        );


        return createEmptyModel(
            diagnostics
        );
    }


    /*
     * ========================================================
     * NOTAS ↔ SÍLABAS
     * ========================================================
     */

    const directValidation =
        validateDirectNoteSyllableAlignment(
            safeNotes,
            safeSyllables,
            directToleranceSeconds
        );


    diagnostics.directAlignment =
        directValidation;


    let noteSyllablePairs =
        [];


    /*
     * Caso ideal:
     *
     * número igual + tempos praticamente idênticos.
     */
    if (
        directValidation.valid
    ) {

        noteSyllablePairs =
            buildDirectNoteSyllablePairs(
                safeNotes,
                safeSyllables
            );


        diagnostics.noteAlignmentMode =
            "direct";


    } else {

        /*
         * Fallback:
         *
         * encontra correspondência pela maior
         * sobreposição temporal.
         */
        noteSyllablePairs =
            buildTemporalNoteSyllablePairs(
                safeNotes,
                safeSyllables,
                minOverlapRatio
            );


        diagnostics.noteAlignmentMode =
            "temporal";


        diagnostics.warnings.push(
            "A associação direta nota ↔ sílaba não foi validada. " +
            "Foi utilizado o alinhamento temporal por sobreposição."
        );
    }


    /*
     * Estatísticas do alinhamento.
     */

    diagnostics.noteMatches =
        noteSyllablePairs.filter(
            pair =>
                pair.note &&
                pair.syllable
        ).length;


    const matchedNoteIndices =
        new Set(
            noteSyllablePairs
                .filter(
                    pair =>
                        pair.note
                )
                .map(
                    pair =>
                        pair.note.index
                )
        );


    const matchedSyllableIndices =
        new Set(
            noteSyllablePairs
                .filter(
                    pair =>
                        pair.syllable
                )
                .map(
                    pair =>
                        pair.syllable.index
                )
        );


    diagnostics.unmatchedNotes =
        safeNotes.length -
        matchedNoteIndices.size;


    diagnostics.unmatchedSyllables =
        safeSyllables.length -
        matchedSyllableIndices.size;


    /*
     * ========================================================
     * FRASES ↔ SÍLABAS
     * ========================================================
     */

    const karaokePhrases =
        buildPhraseModels(
            safePhrases,
            safeSyllables,
            noteSyllablePairs,
            phraseToleranceSeconds,
            diagnostics
        );


    /*
     * ========================================================
     * MAPA RÁPIDO DE SÍLABAS
     * ========================================================
     */

    const karaokeSyllables =
        buildKaraokeSyllableList(
            safeSyllables,
            noteSyllablePairs,
            karaokePhrases
        );


    /*
     * ========================================================
     * MODELO FINAL
     * ========================================================
     */

    const valid =
        diagnostics.noteMatches >
            0 &&
        karaokeSyllables.length >
            0;


    const model = {

        valid,

        mode:
            diagnostics.noteAlignmentMode,

        phrases:
            karaokePhrases,

        syllables:
            karaokeSyllables,

        pairs:
            noteSyllablePairs,

        diagnostics
    };


    /*
     * Logamos um resumo para facilitar
     * testes no console durante a implantação.
     */
    logKaraokeDiagnostics(
        model
    );


    return model;
}


/*
 * ============================================================
 * VALIDAR CORRESPONDÊNCIA DIRETA
 * ============================================================
 *
 * Confirma se:
 *
 * 1. quantidade de notas === quantidade de sílabas;
 *
 * 2. nota N e sílaba N possuem tempos suficientemente próximos.
 *
 * ============================================================
 */

export function validateDirectNoteSyllableAlignment(
    notes,
    syllables,
    toleranceSeconds =
        DEFAULT_DIRECT_TOLERANCE_SECONDS
) {

    const safeNotes =
        normalizeNoteInput(
            notes
        );


    const safeSyllables =
        normalizeSyllableInput(
            syllables
        );


    const tolerance =
        normalizePositiveNumber(
            toleranceSeconds,
            DEFAULT_DIRECT_TOLERANCE_SECONDS
        );


    const result = {

        valid:
            false,

        sameCount:
            safeNotes.length ===
            safeSyllables.length,

        noteCount:
            safeNotes.length,

        syllableCount:
            safeSyllables.length,

        matchedCount:
            0,

        toleranceSeconds:
            tolerance,

        toleranceMs:
            tolerance *
            1000,

        maxStartErrorSeconds:
            null,

        maxEndErrorSeconds:
            null,

        maxDurationErrorSeconds:
            null,

        maxStartErrorMs:
            null,

        maxEndErrorMs:
            null,

        maxDurationErrorMs:
            null,

        firstMismatch:
            null
    };


    if (
        !result.sameCount ||
        safeNotes.length ===
            0
    ) {

        return result;
    }


    let maxStartError =
        0;


    let maxEndError =
        0;


    let maxDurationError =
        0;


    for (
        let index = 0;
        index <
        safeNotes.length;
        index++
    ) {

        const note =
            safeNotes[
                index
            ];


        const syllable =
            safeSyllables[
                index
            ];


        const startError =
            Math.abs(
                note.start -
                syllable.start
            );


        const endError =
            Math.abs(
                note.end -
                syllable.end
            );


        const durationError =
            Math.abs(
                note.duration -
                syllable.duration
            );


        maxStartError =
            Math.max(
                maxStartError,
                startError
            );


        maxEndError =
            Math.max(
                maxEndError,
                endError
            );


        maxDurationError =
            Math.max(
                maxDurationError,
                durationError
            );


        if (
            startError <=
                tolerance &&
            endError <=
                tolerance
        ) {

            result.matchedCount++;

            continue;
        }


        /*
         * Guardamos somente o primeiro problema.
         */
        if (
            result.firstMismatch ===
            null
        ) {

            result.firstMismatch = {

                index,

                noteStart:
                    note.start,

                noteEnd:
                    note.end,

                syllableStart:
                    syllable.start,

                syllableEnd:
                    syllable.end,

                startErrorSeconds:
                    startError,

                endErrorSeconds:
                    endError,

                startErrorMs:
                    startError *
                    1000,

                endErrorMs:
                    endError *
                    1000
            };
        }
    }


    result.maxStartErrorSeconds =
        maxStartError;


    result.maxEndErrorSeconds =
        maxEndError;


    result.maxDurationErrorSeconds =
        maxDurationError;


    result.maxStartErrorMs =
        maxStartError *
        1000;


    result.maxEndErrorMs =
        maxEndError *
        1000;


    result.maxDurationErrorMs =
        maxDurationError *
        1000;


    result.valid =
        result.matchedCount ===
        safeNotes.length;


    return result;
}


/*
 * ============================================================
 * ASSOCIAÇÃO DIRETA
 * ============================================================
 */

function buildDirectNoteSyllablePairs(
    notes,
    syllables
) {

    return syllables.map(
        (
            syllable,
            index
        ) => {

            const note =
                notes[
                    index
                ];


            return {

                index,

                mode:
                    "direct",

                note,

                syllable,

                overlapSeconds:
                    calculateOverlapSeconds(
                        note,
                        syllable
                    ),

                overlapRatio:
                    calculateOverlapRatio(
                        note,
                        syllable
                    ),

                startErrorSeconds:
                    note.start -
                    syllable.start,

                endErrorSeconds:
                    note.end -
                    syllable.end
            };
        }
    );
}


/*
 * ============================================================
 * FALLBACK TEMPORAL
 * ============================================================
 *
 * Cada sílaba busca a nota ainda não utilizada
 * com maior sobreposição temporal.
 *
 * ============================================================
 */

function buildTemporalNoteSyllablePairs(
    notes,
    syllables,
    minOverlapRatio
) {

    const pairs =
        [];


    const usedNotes =
        new Set();


    for (
        const syllable of
        syllables
    ) {

        let bestNote =
            null;


        let bestRatio =
            0;


        let bestOverlap =
            0;


        for (
            const note of
            notes
        ) {

            if (
                usedNotes.has(
                    note.index
                )
            ) {

                continue;
            }


            /*
             * Como as listas estão ordenadas,
             * notas muito posteriores não precisam
             * continuar sendo verificadas.
             */
            if (
                note.start >
                syllable.end +
                1
            ) {

                break;
            }


            if (
                note.end <
                syllable.start -
                1
            ) {

                continue;
            }


            const overlap =
                calculateOverlapSeconds(
                    note,
                    syllable
                );


            if (
                overlap <=
                0
            ) {

                continue;
            }


            const ratio =
                calculateOverlapRatio(
                    note,
                    syllable
                );


            if (
                ratio >
                bestRatio
            ) {

                bestRatio =
                    ratio;


                bestOverlap =
                    overlap;


                bestNote =
                    note;
            }
        }


        if (
            bestNote &&
            bestRatio >=
                minOverlapRatio
        ) {

            usedNotes.add(
                bestNote.index
            );


            pairs.push({

                index:
                    pairs.length,

                mode:
                    "temporal",

                note:
                    bestNote,

                syllable,

                overlapSeconds:
                    bestOverlap,

                overlapRatio:
                    bestRatio,

                startErrorSeconds:
                    bestNote.start -
                    syllable.start,

                endErrorSeconds:
                    bestNote.end -
                    syllable.end
            });

        } else {

            /*
             * Mantemos a sílaba no modelo
             * mesmo que nenhuma nota segura
             * tenha sido encontrada.
             */
            pairs.push({

                index:
                    pairs.length,

                mode:
                    "unmatched",

                note:
                    null,

                syllable,

                overlapSeconds:
                    0,

                overlapRatio:
                    0,

                startErrorSeconds:
                    null,

                endErrorSeconds:
                    null
            });
        }
    }


    return pairs;
}


/*
 * ============================================================
 * CONSTRUIR FRASES
 * ============================================================
 */

function buildPhraseModels(
    phrases,
    syllables,
    pairs,
    phraseToleranceSeconds,
    diagnostics
) {

    if (
        phrases.length ===
        0
    ) {

        diagnostics.warnings.push(
            "Nenhuma frase foi fornecida. " +
            "O karaokê poderá usar sílabas, mas não terá texto completo."
        );


        return [];
    }


    const result =
        [];


    for (
        let phraseIndex = 0;
        phraseIndex <
        phrases.length;
        phraseIndex++
    ) {

        const phrase =
            phrases[
                phraseIndex
            ];


        const nextPhrase =
            phrases[
                phraseIndex +
                1
            ] ||
            null;


        /*
         * ----------------------------------------------------
         * QUAIS SÍLABAS PERTENCEM A ESTA FRASE?
         * ----------------------------------------------------
         *
         * Usamos o início da frase atual e o início
         * da próxima frase.
         *
         * Isso resolve casos em que o end do SRT
         * tradicional termina antes da última sílaba.
         */
        const phraseSyllables =
            syllables.filter(
                syllable => {

                    const afterStart =
                        syllable.start >=
                        phrase.start -
                        phraseToleranceSeconds;


                    const beforeNext =
                        nextPhrase
                            ? syllable.start <
                                nextPhrase.start -
                                phraseToleranceSeconds
                            : true;


                    return (
                        afterStart &&
                        beforeNext
                    );
                }
            );


        /*
         * ----------------------------------------------------
         * ALINHAMENTO TEXTUAL
         * ----------------------------------------------------
         */

        const textAlignment =
            alignSyllablesToPhraseText(
                phrase.text,
                phraseSyllables
            );


        /*
         * ----------------------------------------------------
         * TEMPO EFETIVO
         * ----------------------------------------------------
         */

        let effectiveStart =
            phrase.start;


        let effectiveEnd =
            phrase.end;


        if (
            phraseSyllables.length >
            0
        ) {

            effectiveStart =
                Math.min(
                    phrase.start,
                    phraseSyllables[
                        0
                    ].start
                );


            const lastSyllable =
                phraseSyllables[
                    phraseSyllables.length -
                    1
                ];


            effectiveEnd =
                Math.max(
                    phrase.end,
                    lastSyllable.end
                );
        }


        /*
         * Não permitimos que a frase invada
         * temporalmente a próxima frase.
         */
        if (
            nextPhrase
        ) {

            effectiveEnd =
                Math.min(
                    effectiveEnd,
                    nextPhrase.start
                );
        }


        /*
         * ----------------------------------------------------
         * PARES NOTA ↔ SÍLABA DA FRASE
         * ----------------------------------------------------
         */

        const syllableIndices =
            new Set(
                phraseSyllables.map(
                    item =>
                        item.index
                )
            );


        const phrasePairs =
            pairs.filter(
                pair =>
                    pair.syllable &&
                    syllableIndices.has(
                        pair.syllable.index
                    )
            );


        /*
         * ----------------------------------------------------
         * REGISTRO
         * ----------------------------------------------------
         */

        const phraseModel = {

            index:
                phraseIndex,

            sourceIndex:
                phrase.sourceIndex,

            text:
                phrase.text,

            start:
                phrase.start,

            end:
                phrase.end,

            effectiveStart,

            effectiveEnd,

            duration:
                Math.max(
                    0,
                    effectiveEnd -
                    effectiveStart
                ),

            syllables:
                textAlignment.syllables,

            pairs:
                phrasePairs,

            textAlignmentValid:
                textAlignment.valid,

            normalizedText:
                textAlignment.normalizedPhrase,

            normalizedSyllables:
                textAlignment.normalizedSyllables
        };


        result.push(
            phraseModel
        );


        diagnostics.phraseMatches++;


        if (
            textAlignment.valid
        ) {

            diagnostics.phraseTextMatches++;

        } else {

            diagnostics.phraseTextMismatches++;


            diagnostics.warnings.push(
                `Não foi possível alinhar perfeitamente as sílabas ` +
                `da frase ${phraseIndex + 1}: "${phrase.text}"`
            );
        }
    }


    return result;
}


/*
 * ============================================================
 * ALINHAR SÍLABAS AO TEXTO ORIGINAL
 * ============================================================
 *
 * Exemplo:
 *
 * frase:
 *
 *     "Todos os dias, quando acordo"
 *
 * sílabas:
 *
 *     To
 *     dos
 *     os
 *     di
 *     as
 *     quan
 *     do
 *     a
 *     cor
 *     do
 *
 * Resultado:
 *
 * cada sílaba recebe charStart / charEnd
 * referentes ao texto ORIGINAL.
 *
 * ============================================================
 */

export function alignSyllablesToPhraseText(
    phraseText,
    syllables
) {

    const phrase =
        createNormalizedTextMap(
            phraseText
        );


    const safeSyllables =
        Array.isArray(
            syllables
        )
            ? syllables
            : [];


    const normalizedSyllables =
        safeSyllables
            .map(
                syllable =>
                    normalizeComparisonText(
                        syllable.text
                    )
            );


    const joinedSyllables =
        normalizedSyllables.join(
            ""
        );


    const exactTextMatch =
        phrase.normalized ===
        joinedSyllables;


    const aligned =
        [];


    let cursor =
        0;


    let allMapped =
        true;


    for (
        let index = 0;
        index <
        safeSyllables.length;
        index++
    ) {

        const syllable =
            safeSyllables[
                index
            ];


        const normalized =
            normalizedSyllables[
                index
            ];


        /*
         * Sílaba vazia após normalização.
         */
        if (
            !normalized
        ) {

            aligned.push({

                ...syllable,

                normalizedText:
                    "",

                charStart:
                    null,

                charEnd:
                    null,

                textMatched:
                    false
            });


            allMapped =
                false;


            continue;
        }


        /*
         * O caso ideal é a sílaba começar
         * exatamente na posição atual.
         */
        let position =
            phrase.normalized.indexOf(
                normalized,
                cursor
            );


        /*
         * Para evitar que uma sílaba seja associada
         * a uma ocorrência muito distante,
         * só aceitamos busca para frente.
         */
        if (
            position ===
            -1
        ) {

            aligned.push({

                ...syllable,

                normalizedText:
                    normalized,

                charStart:
                    null,

                charEnd:
                    null,

                textMatched:
                    false
            });


            allMapped =
                false;


            continue;
        }


        const normalizedEnd =
            position +
            normalized.length -
            1;


        const originalStart =
            phrase.map[
                position
            ];


        const originalLastCharacter =
            phrase.map[
                normalizedEnd
            ];


        if (
            originalStart ===
                undefined ||
            originalLastCharacter ===
                undefined
        ) {

            aligned.push({

                ...syllable,

                normalizedText:
                    normalized,

                charStart:
                    null,

                charEnd:
                    null,

                textMatched:
                    false
            });


            allMapped =
                false;


            continue;
        }


        aligned.push({

            ...syllable,

            normalizedText:
                normalized,

            /*
             * Índices para String.slice().
             */
            charStart:
                originalStart,

            charEnd:
                originalLastCharacter +
                1,

            textMatched:
                true
        });


        cursor =
            position +
            normalized.length;
    }


    return {

        valid:
            exactTextMatch &&
            allMapped,

        exactTextMatch,

        allMapped,

        originalText:
            String(
                phraseText ||
                ""
            ),

        normalizedPhrase:
            phrase.normalized,

        normalizedSyllables:
            joinedSyllables,

        syllables:
            aligned
    };
}


/*
 * ============================================================
 * NORMALIZAR TEXTO PARA COMPARAÇÃO
 * ============================================================
 *
 * Remove diferenças que não interferem
 * semanticamente na associação:
 *
 * - maiúsculas/minúsculas;
 * - acentos;
 * - espaços;
 * - pontuação.
 *
 * Exemplos:
 *
 * "Não tenho." → "naotenho"
 * "sílaba"      → "silaba"
 *
 * ============================================================
 */

export function normalizeComparisonText(
    value
) {

    return String(
        value ||
        ""
    )
    .normalize(
        "NFD"
    )
    .replace(
        /[\u0300-\u036f]/g,
        ""
    )
    .toLocaleLowerCase(
        "pt-BR"
    )
    .replace(
        /[^a-z0-9]/g,
        ""
    );
}


/*
 * ============================================================
 * TEXTO NORMALIZADO + MAPA DE CARACTERES
 * ============================================================
 *
 * Precisamos saber:
 *
 * texto normalizado:
 *
 *     todososdias
 *
 * veio originalmente de quais posições em:
 *
 *     Todos os dias,
 *
 * ============================================================
 */

function createNormalizedTextMap(
    value
) {

    const source =
        String(
            value ||
            ""
        );


    let normalized =
        "";


    const map =
        [];


    for (
        let originalIndex = 0;
        originalIndex <
        source.length;
        originalIndex++
    ) {

        const originalCharacter =
            source[
                originalIndex
            ];


        const decomposed =
            originalCharacter
                .normalize(
                    "NFD"
                )
                .replace(
                    /[\u0300-\u036f]/g,
                    ""
                )
                .toLocaleLowerCase(
                    "pt-BR"
                );


        for (
            const character of
            decomposed
        ) {

            if (
                /[a-z0-9]/.test(
                    character
                )
            ) {

                normalized +=
                    character;


                map.push(
                    originalIndex
                );
            }
        }
    }


    return {

        source,

        normalized,

        map
    };
}


/*
 * ============================================================
 * LISTA GLOBAL DE SÍLABAS DO KARAOKÊ
 * ============================================================
 */

function buildKaraokeSyllableList(
    syllables,
    pairs,
    phrases
) {

    const pairBySyllable =
        new Map();


    for (
        const pair of
        pairs
    ) {

        if (
            pair.syllable
        ) {

            pairBySyllable.set(
                pair.syllable.index,
                pair
            );
        }
    }


    const phraseInfoBySyllable =
        new Map();


    for (
        const phrase of
        phrases
    ) {

        for (
            const syllable of
            phrase.syllables
        ) {

            phraseInfoBySyllable.set(
                syllable.index,
                {

                    phraseIndex:
                        phrase.index,

                    charStart:
                        syllable.charStart,

                    charEnd:
                        syllable.charEnd,

                    textMatched:
                        syllable.textMatched
                }
            );
        }
    }


    return syllables.map(
        syllable => {

            const pair =
                pairBySyllable.get(
                    syllable.index
                ) ||
                null;


            const phraseInfo =
                phraseInfoBySyllable.get(
                    syllable.index
                ) ||
                null;


            return {

                index:
                    syllable.index,

                sourceIndex:
                    syllable.sourceIndex,

                text:
                    syllable.text,

                start:
                    syllable.start,

                end:
                    syllable.end,

                duration:
                    syllable.duration,

                phraseIndex:
                    phraseInfo
                        ? phraseInfo.phraseIndex
                        : null,

                charStart:
                    phraseInfo
                        ? phraseInfo.charStart
                        : null,

                charEnd:
                    phraseInfo
                        ? phraseInfo.charEnd
                        : null,

                textMatched:
                    phraseInfo
                        ? phraseInfo.textMatched
                        : false,

                note:
                    pair
                        ? pair.note
                        : null,

                midi:
                    pair?.note?.midi ??
                    null,

                noteIndex:
                    pair?.note?.index ??
                    null,

                alignmentMode:
                    pair?.mode ??
                    "unmatched",

                overlapRatio:
                    pair?.overlapRatio ??
                    0
            };
        }
    );
}


/*
 * ============================================================
 * CONSULTA DO ESTADO ATUAL
 * ============================================================
 *
 * vocalOffset:
 *
 * o MESMO offset utilizado para MIDI + sílabas.
 *
 * Valor positivo:
 *     conteúdo vocal é atrasado.
 *
 * Portanto:
 *
 * sourceTime = audioTime - vocalOffset
 *
 * ============================================================
 */

export function getKaraokeStateAtTime(
    model,
    audioTime,
    vocalOffset =
        0
) {

    if (
        !model ||
        !model.valid
    ) {

        return {

            phrase:
                null,

            syllable:
                null,

            note:
                null,

            sourceTime:
                normalizeTime(
                    audioTime
                )
        };
    }


    const safeAudioTime =
        normalizeTime(
            audioTime
        );


    const safeOffset =
        Number.isFinite(
            Number(
                vocalOffset
            )
        )
            ? Number(
                vocalOffset
            )
            : 0;


    const sourceTime =
        safeAudioTime -
        safeOffset;


    const phrase =
        findPhraseAtTime(
            model.phrases,
            sourceTime
        );


    const syllable =
        findSyllableAtTime(
            model.syllables,
            sourceTime
        );


    return {

        phrase,

        syllable,

        note:
            syllable?.note ||
            null,

        sourceTime,

        audioTime:
            safeAudioTime,

        vocalOffset:
            safeOffset
    };
}


/*
 * ============================================================
 * BUSCAR FRASE ATUAL
 * ============================================================
 */

export function findKaraokePhraseAtTime(
    model,
    audioTime,
    vocalOffset =
        0
) {

    if (
        !model ||
        !Array.isArray(
            model.phrases
        )
    ) {

        return null;
    }


    const sourceTime =
        normalizeTime(
            audioTime
        ) -
        normalizeOffset(
            vocalOffset
        );


    return findPhraseAtTime(
        model.phrases,
        sourceTime
    );
}


/*
 * ============================================================
 * BUSCAR SÍLABA ATUAL
 * ============================================================
 */

export function findKaraokeSyllableAtTime(
    model,
    audioTime,
    vocalOffset =
        0
) {

    if (
        !model ||
        !Array.isArray(
            model.syllables
        )
    ) {

        return null;
    }


    const sourceTime =
        normalizeTime(
            audioTime
        ) -
        normalizeOffset(
            vocalOffset
        );


    return findSyllableAtTime(
        model.syllables,
        sourceTime
    );
}


/*
 * ============================================================
 * BUSCA BINÁRIA DE FRASE
 * ============================================================
 */

function findPhraseAtTime(
    phrases,
    time
) {

    let low =
        0;


    let high =
        phrases.length -
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


        const phrase =
            phrases[
                middle
            ];


        if (
            time <
            phrase.effectiveStart
        ) {

            high =
                middle -
                1;

            continue;
        }


        if (
            time >
            phrase.effectiveEnd
        ) {

            low =
                middle +
                1;

            continue;
        }


        return phrase;
    }


    return null;
}


/*
 * ============================================================
 * BUSCA BINÁRIA DE SÍLABA
 * ============================================================
 */

function findSyllableAtTime(
    syllables,
    time
) {

    let low =
        0;


    let high =
        syllables.length -
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


        const syllable =
            syllables[
                middle
            ];


        if (
            time <
            syllable.start
        ) {

            high =
                middle -
                1;

            continue;
        }


        if (
            time >
            syllable.end
        ) {

            low =
                middle +
                1;

            continue;
        }


        return syllable;
    }


    return null;
}


/*
 * ============================================================
 * NORMALIZAR FRASES
 * ============================================================
 */

function normalizePhraseInput(
    phrases
) {

    if (
        !Array.isArray(
            phrases
        )
    ) {

        return [];
    }


    return phrases
        .map(
            (
                phrase,
                index
            ) => {

                const start =
                    normalizeTime(
                        phrase?.start
                    );


                const end =
                    Math.max(
                        start,
                        normalizeTime(
                            phrase?.end
                        )
                    );


                return {

                    index,

                    sourceIndex:
                        phrase?.originalIndex ??
                        phrase?.index ??
                        index +
                            1,

                    text:
                        String(
                            phrase?.text ||
                            ""
                        ),

                    start,

                    end,

                    duration:
                        Math.max(
                            0,
                            end -
                            start
                        )
                };
            }
        )
        .filter(
            phrase =>
                phrase.text.trim()
        )
        .sort(
            (
                a,
                b
            ) =>
                a.start -
                b.start
        )
        .map(
            (
                phrase,
                index
            ) => ({

                ...phrase,

                index
            })
        );
}


/*
 * ============================================================
 * NORMALIZAR SÍLABAS
 * ============================================================
 */

function normalizeSyllableInput(
    syllables
) {

    if (
        !Array.isArray(
            syllables
        )
    ) {

        return [];
    }


    return syllables
        .map(
            (
                syllable,
                index
            ) => {

                const start =
                    normalizeTime(
                        syllable?.start
                    );


                const end =
                    Math.max(
                        start,
                        normalizeTime(
                            syllable?.end
                        )
                    );


                return {

                    index,

                    sourceIndex:
                        syllable?.originalIndex ??
                        syllable?.index ??
                        index +
                            1,

                    text:
                        String(
                            syllable?.text ||
                            ""
                        )
                        .trim(),

                    start,

                    end,

                    duration:
                        Math.max(
                            0,
                            end -
                            start
                        )
                };
            }
        )
        .filter(
            syllable =>
                syllable.text
        )
        .sort(
            (
                a,
                b
            ) =>
                a.start -
                b.start
        )
        .map(
            (
                syllable,
                index
            ) => ({

                ...syllable,

                index
            })
        );
}


/*
 * ============================================================
 * NORMALIZAR NOTAS MIDI
 * ============================================================
 */

function normalizeNoteInput(
    notes
) {

    if (
        !Array.isArray(
            notes
        )
    ) {

        return [];
    }


    return notes
        .map(
            (
                note,
                index
            ) => {

                const start =
                    normalizeTime(
                        note?.start
                    );


                const duration =
                    Math.max(
                        0,
                        Number(
                            note?.duration
                        ) ||
                        0
                    );


                const end =
                    start +
                    duration;


                return {

                    index,

                    sourceIndex:
                        note?.index ??
                        index,

                    midi:
                        Number.isFinite(
                            Number(
                                note?.midi
                            )
                        )
                            ? Number(
                                note.midi
                            )
                            : null,

                    start,

                    end,

                    duration,

                    original:
                        note
                };
            }
        )
        .filter(
            note =>
                note.midi !==
                    null &&
                note.duration >
                    0
        )
        .sort(
            (
                a,
                b
            ) => {

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
        )
        .map(
            (
                note,
                index
            ) => ({

                ...note,

                index
            })
        );
}


/*
 * ============================================================
 * SOBREPOSIÇÃO TEMPORAL
 * ============================================================
 */

function calculateOverlapSeconds(
    first,
    second
) {

    const start =
        Math.max(
            first.start,
            second.start
        );


    const end =
        Math.min(
            first.end,
            second.end
        );


    return Math.max(
        0,
        end -
        start
    );
}


function calculateOverlapRatio(
    first,
    second
) {

    const overlap =
        calculateOverlapSeconds(
            first,
            second
        );


    if (
        overlap <=
        0
    ) {

        return 0;
    }


    const firstDuration =
        Math.max(
            0,
            first.end -
            first.start
        );


    const secondDuration =
        Math.max(
            0,
            second.end -
            second.start
        );


    const referenceDuration =
        Math.min(
            firstDuration,
            secondDuration
        );


    if (
        referenceDuration <=
        0
    ) {

        return 0;
    }


    return Math.min(
        1,
        overlap /
        referenceDuration
    );
}


/*
 * ============================================================
 * MODELO VAZIO
 * ============================================================
 */

function createEmptyModel(
    diagnostics
) {

    return {

        valid:
            false,

        mode:
            null,

        phrases:
            [],

        syllables:
            [],

        pairs:
            [],

        diagnostics
    };
}


/*
 * ============================================================
 * DIAGNÓSTICO NO CONSOLE
 * ============================================================
 */

export function logKaraokeDiagnostics(
    model
) {

    if (
        !model ||
        !model.diagnostics
    ) {

        return;
    }


    const diagnostics =
        model.diagnostics;


    console.group(
        "[KARAOKE] Diagnóstico"
    );


    console.log(
        "Frases:",
        diagnostics.phraseCount
    );


    console.log(
        "Sílabas:",
        diagnostics.syllableCount
    );


    console.log(
        "Notas MIDI:",
        diagnostics.noteCount
    );


    console.log(
        "Modo de alinhamento:",
        diagnostics.noteAlignmentMode ||
        "indisponível"
    );


    console.log(
        "Pares nota ↔ sílaba:",
        diagnostics.noteMatches
    );


    console.log(
        "Sílabas sem nota:",
        diagnostics.unmatchedSyllables
    );


    console.log(
        "Notas sem sílaba:",
        diagnostics.unmatchedNotes
    );


    console.log(
        "Frases com texto alinhado:",
        `${diagnostics.phraseTextMatches}/${diagnostics.phraseMatches}`
    );


    const direct =
        diagnostics.directAlignment;


    if (
        direct
    ) {

        console.log(
            "Alinhamento direto válido:",
            direct.valid
        );


        if (
            Number.isFinite(
                direct.maxStartErrorMs
            )
        ) {

            console.log(
                "Maior erro de início:",
                `${direct.maxStartErrorMs.toFixed(3)} ms`
            );
        }


        if (
            Number.isFinite(
                direct.maxEndErrorMs
            )
        ) {

            console.log(
                "Maior erro de fim:",
                `${direct.maxEndErrorMs.toFixed(3)} ms`
            );
        }


        if (
            Number.isFinite(
                direct.maxDurationErrorMs
            )
        ) {

            console.log(
                "Maior erro de duração:",
                `${direct.maxDurationErrorMs.toFixed(3)} ms`
            );
        }
    }


    if (
        diagnostics.warnings.length >
        0
    ) {

        console.warn(
            "Avisos:",
            diagnostics.warnings
        );
    }


    console.log(
        "Modelo válido:",
        model.valid
    );


    console.groupEnd();
}


/*
 * ============================================================
 * UTILITÁRIOS
 * ============================================================
 */

function normalizeTime(
    value
) {

    const numeric =
        Number(
            value
        );


    if (
        !Number.isFinite(
            numeric
        )
    ) {

        return 0;
    }


    return Math.max(
        0,
        numeric
    );
}


function normalizeOffset(
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


function normalizePositiveNumber(
    value,
    fallback
) {

    const numeric =
        Number(
            value
        );


    if (
        !Number.isFinite(
            numeric
        ) ||
        numeric <=
            0
    ) {

        return fallback;
    }


    return numeric;
}