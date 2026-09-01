/*
 * ============================================================
 * piano-roll.js
 * ============================================================
 *
 * Renderizador visual do modo de melodia contínua.
 *
 * Responsabilidades:
 *
 * - desenhar a grade musical;
 * - desenhar as barras das notas;
 * - movimentar a melodia no tempo;
 * - destacar a barra atualmente ativa;
 * - desenhar o playhead;
 * - desenhar o traçado da voz;
 * - receber o resultado individual de cada nota;
 * - colorir barras concluídas conforme o desempenho.
 *
 * Estados de uma barra:
 *
 * pending
 *     nota ainda não avaliada
 *
 * excellent
 *     bom desempenho
 *
 * partial
 *     desempenho parcial
 *
 * error
 *     nota cantada, mas com desempenho insuficiente
 *
 * missed
 *     nenhuma voz válida detectada naquela nota
 *
 * ============================================================
 */


import {
    midiToNoteName,
    midiToOctave
} from "./music-theory.js";


export class PianoRoll {

    constructor(
        canvas
    ) {

        if (!canvas) {

            throw new Error(
                "Canvas do piano roll não encontrado."
            );
        }


        this.canvas =
            canvas;


        this.ctx =
            canvas.getContext(
                "2d"
            );


        if (!this.ctx) {

            throw new Error(
                "Não foi possível criar o contexto 2D do piano roll."
            );
        }


        /*
         * ====================================================
         * ESTADO PRINCIPAL
         * ====================================================
         */

        this.melody =
            null;


        this.currentTime =
            0;


        /*
         * Quantos segundos da música ficam visíveis
         * horizontalmente ao mesmo tempo.
         */
        this.visibleSeconds =
            6;


        /*
         * O playhead fica em 35% da largura.
         *
         * Assim conseguimos enxergar:
         *
         * passado à esquerda;
         * futuro à direita.
         */
        this.playheadRatio =
            0.35;


        /*
         * Limites verticais iniciais.
         *
         * Eles serão recalculados quando
         * uma melodia for carregada.
         */
        this.minMidi =
            48;


        this.maxMidi =
            72;


        /*
         * Histórico visual da voz.
         *
         * Cada elemento:
         *
         * {
         *     time: 4.25,
         *     midiFloat: 55.12
         * }
         */
        this.voicePoints =
            [];


        /*
         * Resultado consolidado das barras.
         *
         * Estrutura:
         *
         * Map(
         *     index,
         *     {
         *         status: "excellent",
         *         score: 91
         *     }
         * )
         */
        this.noteResults =
            new Map();


        /*
         * Tamanho real do canvas em CSS pixels.
         */
        this.width =
            0;


        this.height =
            0;


        /*
         * Mantemos limite razoável para DPR.
         *
         * Alguns aparelhos Android possuem DPR muito alto
         * e isso pode criar um canvas desnecessariamente pesado.
         */
        this.devicePixelRatio =
            Math.min(
                3,
                Math.max(
                    1,
                    window.devicePixelRatio || 1
                )
            );


        /*
         * ====================================================
         * OBSERVAÇÃO DE TAMANHO
         * ====================================================
         */

        if (
            typeof ResizeObserver !==
            "undefined"
        ) {

            this.resizeObserver =
                new ResizeObserver(
                    () => {

                        this.resize();
                    }
                );


            if (
                this.canvas.parentElement
            ) {

                this.resizeObserver.observe(
                    this.canvas.parentElement
                );
            }

        } else {

            /*
             * Fallback para navegadores sem ResizeObserver.
             */
            this.resizeObserver =
                null;


            this.boundResize =
                () => {

                    this.resize();
                };


            window.addEventListener(
                "resize",
                this.boundResize
            );
        }


        this.resize();
    }


    /*
     * ========================================================
     * MELODIA
     * ========================================================
     */

    setMelody(
        melody
    ) {

        this.melody =
            melody || null;


        /*
         * Recalcula automaticamente
         * a faixa vertical necessária.
         */
        if (
            this.melody &&
            Array.isArray(
                this.melody.notes
            ) &&
            this.melody.notes.length >
                0
        ) {

            const midis =
                this.melody.notes
                    .map(
                        note =>
                            Number(
                                note.midi
                            )
                    )
                    .filter(
                        midi =>
                            Number.isFinite(
                                midi
                            )
                    );


            if (
                midis.length >
                0
            ) {

                /*
                 * Margem de três semitons acima
                 * e abaixo da melodia.
                 *
                 * Isso permite visualizar desvios
                 * da voz sem cortar imediatamente
                 * o traçado.
                 */
                this.minMidi =
                    Math.floor(
                        Math.min(
                            ...midis
                        ) - 3
                    );


                this.maxMidi =
                    Math.ceil(
                        Math.max(
                            ...midis
                        ) + 3
                    );


                /*
                 * Garante faixa vertical mínima.
                 */
                const minimumRange =
                    12;


                const currentRange =
                    this.maxMidi -
                    this.minMidi;


                if (
                    currentRange <
                    minimumRange
                ) {

                    const missing =
                        minimumRange -
                        currentRange;


                    const lower =
                        Math.floor(
                            missing /
                            2
                        );


                    const upper =
                        missing -
                        lower;


                    this.minMidi -=
                        lower;


                    this.maxMidi +=
                        upper;
                }
            }
        }


        this.currentTime =
            0;


        this.voicePoints =
            [];


        this.noteResults.clear();


        this.draw();
    }


    /*
     * ========================================================
     * RESULTADOS DAS BARRAS
     * ========================================================
     */

    setNoteResult(
        index,
        result
    ) {

        if (
            !Number.isInteger(
                index
            ) ||
            index <
            0
        ) {
            return;
        }


        if (
            !result ||
            typeof result !==
            "object"
        ) {
            return;
        }


        const allowedStatuses =
            new Set([
                "pending",
                "excellent",
                "partial",
                "error",
                "missed"
            ]);


        const status =
            allowedStatuses.has(
                result.status
            )
                ? result.status
                : "pending";


        const score =
            Number.isFinite(
                Number(
                    result.score
                )
            )
                ? Math.max(
                    0,
                    Math.min(
                        100,
                        Math.round(
                            Number(
                                result.score
                            )
                        )
                    )
                )
                : null;


        this.noteResults.set(
            index,
            {
                status,
                score
            }
        );


        /*
         * Redesenho imediato.
         *
         * Isso é importante porque permite que
         * uma barra troque de azul para sua cor
         * definitiva assim que a avaliação terminar.
         */
        this.draw();
    }


    getNoteResult(
        index
    ) {

        return (
            this.noteResults.get(
                index
            ) ||
            null
        );
    }


    clearNoteResults() {

        this.noteResults.clear();


        this.draw();
    }


    /*
     * ========================================================
     * TAMANHO DO CANVAS
     * ========================================================
     */

    resize() {

        const parent =
            this.canvas.parentElement;


        if (!parent) {
            return;
        }


        const rect =
            parent.getBoundingClientRect();


        const width =
            Math.max(
                1,
                rect.width
            );


        const height =
            Math.max(
                1,
                rect.height
            );


        this.width =
            width;


        this.height =
            height;


        const pixelWidth =
            Math.max(
                1,
                Math.round(
                    width *
                    this.devicePixelRatio
                )
            );


        const pixelHeight =
            Math.max(
                1,
                Math.round(
                    height *
                    this.devicePixelRatio
                )
            );


        /*
         * Só alteramos as dimensões internas
         * quando necessário.
         *
         * Alterar width/height limpa o canvas.
         */
        if (
            this.canvas.width !==
            pixelWidth
        ) {

            this.canvas.width =
                pixelWidth;
        }


        if (
            this.canvas.height !==
            pixelHeight
        ) {

            this.canvas.height =
                pixelHeight;
        }


        this.canvas.style.width =
            `${width}px`;


        this.canvas.style.height =
            `${height}px`;


        /*
         * Trabalhamos internamente em CSS pixels.
         */
        this.ctx.setTransform(
            this.devicePixelRatio,
            0,
            0,
            this.devicePixelRatio,
            0,
            0
        );


        this.draw();
    }


    /*
     * ========================================================
     * TEMPO
     * ========================================================
     */

    setCurrentTime(
        seconds
    ) {

        const value =
            Number(
                seconds
            );


        if (
            !Number.isFinite(
                value
            )
        ) {
            return;
        }


        this.currentTime =
            Math.max(
                0,
                value
            );


        this.draw();
    }


    /*
     * ========================================================
     * TRAÇADO DA VOZ
     * ========================================================
     */

    addVoicePoint(
        time,
        midiFloat
    ) {

        const safeTime =
            Number(
                time
            );


        const safeMidi =
            Number(
                midiFloat
            );


        if (
            !Number.isFinite(
                safeTime
            ) ||
            !Number.isFinite(
                safeMidi
            )
        ) {
            return;
        }


        this.voicePoints.push({

            time:
                safeTime,

            midiFloat:
                safeMidi
        });


        /*
         * Mantemos apenas os pontos que ainda
         * podem aparecer no lado esquerdo da tela.
         *
         * Uma pequena margem adicional evita
         * cortes visuais abruptos.
         */
        const oldestVisibleTime =
            this.currentTime -
            (
                this.visibleSeconds *
                this.playheadRatio
            );


        const oldestStoredTime =
            oldestVisibleTime -
            1;


        while (
            this.voicePoints.length >
                0 &&
            this.voicePoints[0].time <
                oldestStoredTime
        ) {

            this.voicePoints.shift();
        }
    }


    clearVoice() {

        this.voicePoints =
            [];


        this.draw();
    }


    /*
     * ========================================================
     * CONVERSÃO DE TEMPO PARA X
     * ========================================================
     */

    timeToX(
        time
    ) {

        if (
            !this.width
        ) {
            return 0;
        }


        const playheadX =
            this.width *
            this.playheadRatio;


        const pixelsPerSecond =
            this.width /
            this.visibleSeconds;


        return (
            playheadX +
            (
                time -
                this.currentTime
            ) *
            pixelsPerSecond
        );
    }


    /*
     * ========================================================
     * CONVERSÃO MIDI PARA Y
     * ========================================================
     */

    midiToY(
        midi
    ) {

        const range =
            this.maxMidi -
            this.minMidi +
            1;


        if (
            range <= 0 ||
            !this.height
        ) {
            return 0;
        }


        const noteHeight =
            this.height /
            range;


        /*
         * MIDI maior = mais agudo.
         *
         * No canvas, Y menor fica mais alto.
         */
        return (
            this.height -
            (
                midi -
                this.minMidi +
                0.5
            ) *
            noteHeight
        );
    }


    getNoteHeight() {

        const range =
            this.maxMidi -
            this.minMidi +
            1;


        if (
            range <= 0
        ) {
            return 1;
        }


        return (
            this.height /
            range
        );
    }


    /*
     * ========================================================
     * DESENHO PRINCIPAL
     * ========================================================
     */

    draw() {

        if (
            !this.ctx ||
            this.width <= 0 ||
            this.height <= 0
        ) {
            return;
        }


        this.ctx.clearRect(
            0,
            0,
            this.width,
            this.height
        );


        this.drawBackground();


        this.drawHorizontalGrid();


        this.drawVerticalGrid();


        if (
            this.melody &&
            Array.isArray(
                this.melody.notes
            )
        ) {

            this.drawNotes();
        }


        this.drawVoice();


        this.drawPlayhead();
    }


    /*
     * ========================================================
     * FUNDO
     * ========================================================
     */

    drawBackground() {

        this.ctx.fillStyle =
            "#121418";


        this.ctx.fillRect(
            0,
            0,
            this.width,
            this.height
        );
    }


    /*
     * ========================================================
     * GRADE HORIZONTAL
     * ========================================================
     */

    drawHorizontalGrid() {

        const noteHeight =
            this.getNoteHeight();


        this.ctx.save();


        this.ctx.font =
            "11px system-ui, sans-serif";


        this.ctx.textBaseline =
            "middle";


        for (
            let midi =
                this.minMidi;
            midi <=
                this.maxMidi;
            midi++
        ) {

            const y =
                this.midiToY(
                    midi
                );


            const noteName =
                midiToNoteName(
                    midi
                );


            const octave =
                midiToOctave(
                    midi
                );


            /*
             * Destacamos os Dós para ajudar
             * na orientação vertical.
             */
            const isC =
                noteName ===
                "C";


            /*
             * Região alternada extremamente sutil.
             */
            if (
                midi %
                2 ===
                0
            ) {

                this.ctx.fillStyle =
                    "rgba(255,255,255,0.012)";


                this.ctx.fillRect(
                    0,
                    y -
                        noteHeight /
                        2,
                    this.width,
                    noteHeight
                );
            }


            this.ctx.strokeStyle =
                isC
                    ? "rgba(255,255,255,0.13)"
                    : "rgba(255,255,255,0.055)";


            this.ctx.lineWidth =
                1;


            this.ctx.beginPath();


            this.ctx.moveTo(
                0,
                y +
                    noteHeight /
                    2
            );


            this.ctx.lineTo(
                this.width,
                y +
                    noteHeight /
                    2
            );


            this.ctx.stroke();


            /*
             * Mostramos o nome dos Dós
             * como referência de oitava.
             */
            if (
                isC
            ) {

                this.ctx.fillStyle =
                    "rgba(255,255,255,0.45)";


                this.ctx.fillText(
                    `${noteName}${octave}`,
                    7,
                    y
                );
            }
        }


        this.ctx.restore();
    }


    /*
     * ========================================================
     * GRADE VERTICAL DE TEMPO
     * ========================================================
     */

    drawVerticalGrid() {

        const visibleBefore =
            this.visibleSeconds *
            this.playheadRatio;


        const visibleAfter =
            this.visibleSeconds *
            (
                1 -
                this.playheadRatio
            );


        const startTime =
            Math.floor(
                this.currentTime -
                visibleBefore
            );


        const endTime =
            Math.ceil(
                this.currentTime +
                visibleAfter
            );


        this.ctx.save();


        for (
            let second =
                startTime;
            second <=
                endTime;
            second++
        ) {

            const x =
                this.timeToX(
                    second
                );


            /*
             * Segundo zero recebe leve destaque.
             */
            const isZero =
                second ===
                0;


            this.ctx.strokeStyle =
                isZero
                    ? "rgba(255,255,255,0.12)"
                    : "rgba(255,255,255,0.06)";


            this.ctx.lineWidth =
                1;


            this.ctx.beginPath();


            this.ctx.moveTo(
                x,
                0
            );


            this.ctx.lineTo(
                x,
                this.height
            );


            this.ctx.stroke();
        }


        this.ctx.restore();
    }


    /*
     * ========================================================
     * BARRAS DA MELODIA
     * ========================================================
     */

    drawNotes() {

        const noteHeight =
            this.getNoteHeight();


        const barHeight =
            Math.max(
                9,
                noteHeight *
                0.64
            );


        this.melody.notes.forEach(
            (
                note,
                index
            ) => {

                const midi =
                    Number(
                        note.midi
                    );


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
                        midi
                    ) ||
                    !Number.isFinite(
                        start
                    ) ||
                    !Number.isFinite(
                        duration
                    )
                ) {
                    return;
                }


                const end =
                    start +
                    duration;


                const startX =
                    this.timeToX(
                        start
                    );


                const endX =
                    this.timeToX(
                        end
                    );


                /*
                 * Não desenhamos objetos totalmente
                 * fora da área visível.
                 */
                if (
                    endX <
                    -10 ||
                    startX >
                    this.width +
                    10
                ) {
                    return;
                }


                const width =
                    Math.max(
                        2,
                        endX -
                        startX
                    );


                const y =
                    this.midiToY(
                        midi
                    );


                /*
                 * Uma barra só é considerada ativa
                 * durante seu período musical real.
                 */
                const active =
                    this.currentTime >=
                        start &&
                    this.currentTime <
                        end;


                const result =
                    this.getNoteResult(
                        index
                    );


                /*
                 * =================================================
                 * COR DA BARRA
                 * =================================================
                 *
                 * Resultado definitivo tem prioridade absoluta.
                 *
                 * Isso garante que uma barra já julgada
                 * nunca volte a aparecer azul.
                 */
                this.ctx.fillStyle =
                    this.getNoteColor(
                        result,
                        active
                    );


                this.beginRoundedRect(
                    startX,
                    y -
                        barHeight /
                        2,
                    width,
                    barHeight,
                    5
                );


                this.ctx.fill();


                /*
                 * =================================================
                 * CONTORNO
                 * =================================================
                 *
                 * Apenas barras ainda não consolidadas
                 * recebem o contorno branco de "nota atual".
                 */
                if (
                    active &&
                    !result
                ) {

                    this.ctx.strokeStyle =
                        "rgba(255,255,255,0.95)";


                    this.ctx.lineWidth =
                        2;


                    this.ctx.stroke();
                }


                /*
                 * Barra consolidada recebe um
                 * contorno muito discreto.
                 */
                if (
                    result
                ) {

                    this.ctx.strokeStyle =
                        "rgba(255,255,255,0.12)";


                    this.ctx.lineWidth =
                        1;


                    this.ctx.stroke();
                }


                /*
                 * =================================================
                 * PONTUAÇÃO NA BARRA
                 * =================================================
                 */

                if (
                    result &&
                    Number.isFinite(
                        result.score
                    ) &&
                    width >=
                        42
                ) {

                    const scoreText =
                        String(
                            result.score
                        );


                    this.ctx.save();


                    this.ctx.font =
                        "900 10px system-ui, sans-serif";


                    this.ctx.textBaseline =
                        "middle";


                    const textMetrics =
                        this.ctx.measureText(
                            scoreText
                        );


                    const paddingX =
                        5;


                    const badgeWidth =
                        textMetrics.width +
                        paddingX *
                        2;


                    const badgeHeight =
                        Math.min(
                            16,
                            Math.max(
                                12,
                                barHeight -
                                    2
                            )
                        );


                    const badgeX =
                        startX +
                        4;


                    const badgeY =
                        y -
                        badgeHeight /
                        2;


                    /*
                     * Só desenhamos o badge
                     * se couber dentro da barra.
                     */
                    if (
                        badgeWidth +
                            8 <=
                        width
                    ) {

                        this.ctx.fillStyle =
                            "rgba(0,0,0,0.58)";


                        this.beginRoundedRect(
                            badgeX,
                            badgeY,
                            badgeWidth,
                            badgeHeight,
                            badgeHeight /
                                2
                        );


                        this.ctx.fill();


                        this.ctx.fillStyle =
                            "rgba(255,255,255,0.95)";


                        this.ctx.fillText(
                            scoreText,
                            badgeX +
                                paddingX,
                            y
                        );
                    }


                    this.ctx.restore();
                }
            }
        );
    }


    /*
     * ========================================================
     * COR DAS NOTAS
     * ========================================================
     */

    getNoteColor(
        result,
        active
    ) {

        /*
         * Resultado consolidado sempre vence.
         */
        if (
            result
        ) {

            switch (
                result.status
            ) {

                case "excellent":

                    return (
                        "rgba(98,221,139,0.92)"
                    );


                case "partial":

                    return (
                        "rgba(244,201,93,0.90)"
                    );


                case "error":

                    return (
                        "rgba(255,107,107,0.90)"
                    );


                case "missed":

                    return (
                        "rgba(120,126,138,0.48)"
                    );


                case "pending":

                default:

                    break;
            }
        }


        /*
         * Barra atualmente atravessando o playhead.
         */
        if (
            active
        ) {

            return (
                "rgba(104,168,255,0.96)"
            );
        }


        /*
         * Barras ainda não avaliadas.
         */
        return (
            "rgba(104,168,255,0.62)"
        );
    }


    /*
     * ========================================================
     * TRAJETÓRIA DA VOZ
     * ========================================================
     */

    drawVoice() {

        if (
            this.voicePoints.length <
            1
        ) {
            return;
        }


        this.ctx.save();


        this.ctx.strokeStyle =
            "#62dd8b";


        this.ctx.lineWidth =
            3;


        this.ctx.lineJoin =
            "round";


        this.ctx.lineCap =
            "round";


        this.ctx.shadowColor =
            "rgba(98,221,139,0.28)";


        this.ctx.shadowBlur =
            5;


        this.ctx.beginPath();


        let segmentStarted =
            false;


        let previousTime =
            null;


        for (
            const point of
            this.voicePoints
        ) {

            const x =
                this.timeToX(
                    point.time
                );


            /*
             * Ponto fora da tela.
             */
            if (
                x <
                -20 ||
                x >
                this.width +
                    20
            ) {

                previousTime =
                    point.time;


                segmentStarted =
                    false;


                continue;
            }


            const y =
                this.midiToY(
                    point.midiFloat
                );


            /*
             * Se passou muito tempo sem voz,
             * não conectamos dois trechos separados.
             */
            const discontinuity =
                previousTime !==
                    null &&
                (
                    point.time -
                    previousTime
                ) >
                    0.18;


            if (
                !segmentStarted ||
                discontinuity
            ) {

                this.ctx.moveTo(
                    x,
                    y
                );


                segmentStarted =
                    true;

            } else {

                this.ctx.lineTo(
                    x,
                    y
                );
            }


            previousTime =
                point.time;
        }


        this.ctx.stroke();


        /*
         * Pequeno ponto no registro vocal mais recente.
         */
        const lastPoint =
            this.voicePoints[
                this.voicePoints.length -
                1
            ];


        if (
            lastPoint
        ) {

            const x =
                this.timeToX(
                    lastPoint.time
                );


            const y =
                this.midiToY(
                    lastPoint.midiFloat
                );


            if (
                x >=
                    0 &&
                x <=
                    this.width
            ) {

                this.ctx.shadowBlur =
                    0;


                this.ctx.fillStyle =
                    "#62dd8b";


                this.ctx.beginPath();


                this.ctx.arc(
                    x,
                    y,
                    3.5,
                    0,
                    Math.PI *
                        2
                );


                this.ctx.fill();
            }
        }


        this.ctx.restore();
    }


    /*
     * ========================================================
     * PLAYHEAD
     * ========================================================
     */

    drawPlayhead() {

        const x =
            this.width *
            this.playheadRatio;


        this.ctx.save();


        /*
         * Faixa translúcida ao redor
         * do instante atual.
         */
        this.ctx.fillStyle =
            "rgba(255,255,255,0.025)";


        this.ctx.fillRect(
            x - 7,
            0,
            14,
            this.height
        );


        /*
         * Linha principal.
         */
        this.ctx.strokeStyle =
            "rgba(255,255,255,0.96)";


        this.ctx.lineWidth =
            2;


        this.ctx.beginPath();


        this.ctx.moveTo(
            x,
            0
        );


        this.ctx.lineTo(
            x,
            this.height
        );


        this.ctx.stroke();


        /*
         * Triângulo superior.
         */
        this.ctx.fillStyle =
            "#ffffff";


        this.ctx.beginPath();


        this.ctx.moveTo(
            x - 7,
            0
        );


        this.ctx.lineTo(
            x + 7,
            0
        );


        this.ctx.lineTo(
            x,
            9
        );


        this.ctx.closePath();


        this.ctx.fill();


        this.ctx.restore();
    }


    /*
     * ========================================================
     * RECT ARREDONDADO
     * ========================================================
     */

    beginRoundedRect(
        x,
        y,
        width,
        height,
        radius
    ) {

        /*
         * Protege contra largura negativa.
         */
        const safeWidth =
            Math.max(
                0,
                width
            );


        const safeHeight =
            Math.max(
                0,
                height
            );


        const safeRadius =
            Math.max(
                0,
                Math.min(
                    radius,
                    safeWidth /
                        2,
                    safeHeight /
                        2
                )
            );


        /*
         * API moderna.
         */
        if (
            typeof this.ctx.roundRect ===
            "function"
        ) {

            this.ctx.beginPath();


            this.ctx.roundRect(
                x,
                y,
                safeWidth,
                safeHeight,
                safeRadius
            );


            return;
        }


        /*
         * Fallback.
         */
        const right =
            x +
            safeWidth;


        const bottom =
            y +
            safeHeight;


        this.ctx.beginPath();


        this.ctx.moveTo(
            x +
                safeRadius,
            y
        );


        this.ctx.lineTo(
            right -
                safeRadius,
            y
        );


        this.ctx.quadraticCurveTo(
            right,
            y,
            right,
            y +
                safeRadius
        );


        this.ctx.lineTo(
            right,
            bottom -
                safeRadius
        );


        this.ctx.quadraticCurveTo(
            right,
            bottom,
            right -
                safeRadius,
            bottom
        );


        this.ctx.lineTo(
            x +
                safeRadius,
            bottom
        );


        this.ctx.quadraticCurveTo(
            x,
            bottom,
            x,
            bottom -
                safeRadius
        );


        this.ctx.lineTo(
            x,
            y +
                safeRadius
        );


        this.ctx.quadraticCurveTo(
            x,
            y,
            x +
                safeRadius,
            y
        );


        this.ctx.closePath();
    }


    /*
     * ========================================================
     * LIMPEZA
     * ========================================================
     */

    destroy() {

        if (
            this.resizeObserver
        ) {

            this.resizeObserver.disconnect();
        }


        if (
            this.boundResize
        ) {

            window.removeEventListener(
                "resize",
                this.boundResize
            );
        }


        this.voicePoints =
            [];


        this.noteResults.clear();


        this.melody =
            null;
    }
}