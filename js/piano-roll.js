/*
 * ============================================================
 * piano-roll.js
 * ============================================================
 *
 * Renderizador Canvas do piano roll.
 *
 * Responsabilidades:
 *
 * - desenhar linhas das notas;
 * - desenhar barras da melodia;
 * - fazer o tempo "andar";
 * - desenhar playhead;
 * - desenhar trajetória vocal.
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

        this.canvas =
            canvas;


        this.ctx =
            canvas.getContext(
                "2d"
            );


        this.melody =
            null;


        this.currentTime =
            0;


        /*
         * Quantos segundos ficam visíveis
         * horizontalmente.
         */
        this.visibleSeconds =
            6;


        /*
         * Posição horizontal do playhead.
         *
         * 0.35 significa 35% da largura.
         *
         * Assim vemos:
         *
         * notas já cantadas à esquerda
         * e próximas notas à direita.
         */
        this.playheadRatio =
            0.35;


        this.minMidi =
            48;


        this.maxMidi =
            72;


        /*
         * Histórico da voz:
         *
         * {
         *     time,
         *     midiFloat
         * }
         */
        this.voicePoints =
            [];


        this.devicePixelRatio =
            Math.max(
                1,
                window.devicePixelRatio || 1
            );


        this.resizeObserver =
            new ResizeObserver(
                () => {
                    this.resize();
                }
            );


        this.resizeObserver.observe(
            this.canvas.parentElement
        );


        this.resize();
    }


    /*
     * --------------------------------------------------------
     * CARREGAR MELODIA
     * --------------------------------------------------------
     */

    setMelody(
        melody
    ) {

        this.melody =
            melody;


        if (
            melody &&
            melody.notes.length
        ) {

            const midis =
                melody.notes.map(
                    note =>
                        note.midi
                );


            /*
             * Acrescentamos margens verticais
             * para a voz poder aparecer um pouco
             * acima ou abaixo das notas da música.
             */
            this.minMidi =
                Math.min(
                    ...midis
                ) - 3;


            this.maxMidi =
                Math.max(
                    ...midis
                ) + 3;
        }


        this.currentTime =
            0;


        this.voicePoints =
            [];


        this.draw();
    }


    /*
     * --------------------------------------------------------
     * TAMANHO DO CANVAS
     * --------------------------------------------------------
     */

    resize() {

        const parent =
            this.canvas.parentElement;


        if (
            !parent
        ) {
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


        this.canvas.width =
            Math.floor(
                width *
                this.devicePixelRatio
            );


        this.canvas.height =
            Math.floor(
                height *
                this.devicePixelRatio
            );


        this.canvas.style.width =
            `${width}px`;


        this.canvas.style.height =
            `${height}px`;


        this.ctx.setTransform(
            this.devicePixelRatio,
            0,
            0,
            this.devicePixelRatio,
            0,
            0
        );


        this.width =
            width;


        this.height =
            height;


        this.draw();
    }


    /*
     * --------------------------------------------------------
     * TEMPO
     * --------------------------------------------------------
     */

    setCurrentTime(
        seconds
    ) {

        this.currentTime =
            Math.max(
                0,
                seconds
            );


        this.draw();
    }


    /*
     * --------------------------------------------------------
     * VOZ
     * --------------------------------------------------------
     */

    addVoicePoint(
        time,
        midiFloat
    ) {

        if (
            !Number.isFinite(
                time
            ) ||
            !Number.isFinite(
                midiFloat
            )
        ) {
            return;
        }


        this.voicePoints.push({

            time,

            midiFloat
        });


        /*
         * Não precisamos manter pontos muito antigos.
         *
         * Mantemos apenas uma margem adicional
         * para a esquerda.
         */
        const oldestTime =
            time -
            this.visibleSeconds *
            1.2;


        while (
            this.voicePoints.length &&
            this.voicePoints[0].time <
            oldestTime
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
     * --------------------------------------------------------
     * CONVERSÃO X
     * --------------------------------------------------------
     */

    timeToX(
        time
    ) {

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
     * --------------------------------------------------------
     * CONVERSÃO Y
     * --------------------------------------------------------
     */

    midiToY(
        midi
    ) {

        const range =
            this.maxMidi -
            this.minMidi +
            1;


        const noteHeight =
            this.height /
            range;


        /*
         * Notas agudas ficam em cima.
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


        return (
            this.height /
            range
        );
    }


    /*
     * --------------------------------------------------------
     * DESENHO PRINCIPAL
     * --------------------------------------------------------
     */

    draw() {

        if (
            !this.ctx ||
            !this.width ||
            !this.height
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


        this.drawGrid();


        if (
            this.melody
        ) {

            this.drawNotes();
        }


        this.drawVoice();


        this.drawPlayhead();
    }


    /*
     * --------------------------------------------------------
     * FUNDO
     * --------------------------------------------------------
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
     * --------------------------------------------------------
     * GRADE MUSICAL
     * --------------------------------------------------------
     */

    drawGrid() {

        const noteHeight =
            this.getNoteHeight();


        this.ctx.font =
            "11px system-ui";


        this.ctx.textBaseline =
            "middle";


        for (
            let midi = this.minMidi;
            midi <= this.maxMidi;
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
             * Destacamos os Dós como referência.
             */
            const isC =
                noteName === "C";


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
                noteHeight / 2
            );


            this.ctx.lineTo(
                this.width,
                y +
                noteHeight / 2
            );


            this.ctx.stroke();


            /*
             * Nome da nota à esquerda.
             */
            if (
                isC
            ) {

                this.ctx.fillStyle =
                    "rgba(255,255,255,0.45)";


                this.ctx.fillText(
                    `${noteName}${octave}`,
                    6,
                    y
                );
            }
        }


        /*
         * Linhas verticais de segundo.
         */
        const startTime =
            Math.floor(
                this.currentTime -
                this.visibleSeconds *
                this.playheadRatio
            );


        const endTime =
            Math.ceil(
                this.currentTime +
                this.visibleSeconds *
                (
                    1 -
                    this.playheadRatio
                )
            );


        for (
            let second = startTime;
            second <= endTime;
            second++
        ) {

            const x =
                this.timeToX(
                    second
                );


            this.ctx.strokeStyle =
                "rgba(255,255,255,0.06)";


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
    }


    /*
     * --------------------------------------------------------
     * BARRAS DA MELODIA
     * --------------------------------------------------------
     */

    drawNotes() {

        const noteHeight =
            this.getNoteHeight();


        const barHeight =
            Math.max(
                8,
                noteHeight * 0.65
            );


        for (
            const note of
            this.melody.notes
        ) {

            const startX =
                this.timeToX(
                    note.start
                );


            const endX =
                this.timeToX(
                    note.start +
                    note.duration
                );


            const width =
                endX -
                startX;


            /*
             * Fora da tela.
             */
            if (
                endX < 0 ||
                startX > this.width
            ) {
                continue;
            }


            const y =
                this.midiToY(
                    note.midi
                );


            const active =
                this.currentTime >=
                    note.start &&
                this.currentTime <=
                    note.start +
                    note.duration;


            const finished =
                this.currentTime >
                note.start +
                note.duration;


            if (
                active
            ) {

                this.ctx.fillStyle =
                    "rgba(104,168,255,0.95)";

            } else if (
                finished
            ) {

                this.ctx.fillStyle =
                    "rgba(104,168,255,0.28)";

            } else {

                this.ctx.fillStyle =
                    "rgba(104,168,255,0.62)";
            }


            this.roundRect(
                startX,
                y -
                    barHeight / 2,
                width,
                barHeight,
                5
            );


            this.ctx.fill();
        }
    }


    /*
     * --------------------------------------------------------
     * TRAJETÓRIA DA VOZ
     * --------------------------------------------------------
     */

    drawVoice() {

        if (
            this.voicePoints.length <
            2
        ) {
            return;
        }


        this.ctx.strokeStyle =
            "#62dd8b";


        this.ctx.lineWidth =
            3;


        this.ctx.lineJoin =
            "round";


        this.ctx.lineCap =
            "round";


        this.ctx.beginPath();


        let started =
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


            const y =
                this.midiToY(
                    point.midiFloat
                );


            /*
             * Não desenha segmentos enormes
             * através de períodos sem voz.
             */
            const discontinuity =
                previousTime !== null &&
                point.time -
                    previousTime >
                    0.18;


            if (
                !started ||
                discontinuity
            ) {

                this.ctx.moveTo(
                    x,
                    y
                );


                started =
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
    }


    /*
     * --------------------------------------------------------
     * PLAYHEAD
     * --------------------------------------------------------
     */

    drawPlayhead() {

        const x =
            this.width *
            this.playheadRatio;


        /*
         * Área levemente destacada
         * ao redor do instante atual.
         */
        this.ctx.fillStyle =
            "rgba(255,255,255,0.025)";


        this.ctx.fillRect(
            x - 7,
            0,
            14,
            this.height
        );


        this.ctx.strokeStyle =
            "rgba(255,255,255,0.95)";


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
         * Pequeno triângulo superior.
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
    }


    /*
     * --------------------------------------------------------
     * RECT COM BORDAS ARREDONDADAS
     * --------------------------------------------------------
     */

    roundRect(
        x,
        y,
        width,
        height,
        radius
    ) {

        /*
         * CanvasRenderingContext2D.roundRect
         * é amplamente suportado, mas mantemos
         * fallback simples.
         */
        if (
            typeof this.ctx.roundRect ===
            "function"
        ) {

            this.ctx.beginPath();


            this.ctx.roundRect(
                x,
                y,
                width,
                height,
                radius
            );


            return;
        }


        const r =
            Math.min(
                radius,
                Math.abs(width) / 2,
                height / 2
            );


        this.ctx.beginPath();


        this.ctx.moveTo(
            x + r,
            y
        );


        this.ctx.lineTo(
            x + width - r,
            y
        );


        this.ctx.quadraticCurveTo(
            x + width,
            y,
            x + width,
            y + r
        );


        this.ctx.lineTo(
            x + width,
            y + height - r
        );


        this.ctx.quadraticCurveTo(
            x + width,
            y + height,
            x + width - r,
            y + height
        );


        this.ctx.lineTo(
            x + r,
            y + height
        );


        this.ctx.quadraticCurveTo(
            x,
            y + height,
            x,
            y + height - r
        );


        this.ctx.lineTo(
            x,
            y + r
        );


        this.ctx.quadraticCurveTo(
            x,
            y,
            x + r,
            y
        );


        this.ctx.closePath();
    }


    destroy() {

        this.resizeObserver.disconnect();
    }
}