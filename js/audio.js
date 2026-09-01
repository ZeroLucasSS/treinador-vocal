/*
 * ============================================================
 * audio.js
 * ============================================================
 *
 * Responsável por:
 *
 * - pedir autorização do microfone;
 * - criar o AudioContext;
 * - receber amostras em tempo real;
 * - calcular o nível aproximado do sinal;
 * - entregar os dados ao restante do aplicativo.
 *
 * ============================================================
 */


export class MicrophoneAudio {

    constructor() {

        this.stream =
            null;

        this.audioContext =
            null;

        this.source =
            null;

        this.analyser =
            null;

        this.buffer =
            null;

        this.running =
            false;
    }


    /*
     * Ativa o microfone.
     */
    async start() {

        if (this.running) {
            return;
        }


        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {
            throw new Error(
                "Este navegador não oferece suporte ao acesso ao microfone."
            );
        }


        /*
         * Configurações importantes para canto.
         *
         * Tentamos evitar que o navegador altere demais
         * o áudio antes que façamos nossa análise.
         */
        const constraints = {

            audio: {

                echoCancellation: false,

                noiseSuppression: false,

                autoGainControl: false,

                channelCount: 1
            }

        };


        this.stream =
            await navigator.mediaDevices.getUserMedia(
                constraints
            );


        const AudioContextClass =
            window.AudioContext ||
            window.webkitAudioContext;


        if (!AudioContextClass) {

            this.stop();

            throw new Error(
                "Web Audio API não suportada neste navegador."
            );
        }


        this.audioContext =
            new AudioContextClass();


        /*
         * Alguns navegadores móveis iniciam o AudioContext
         * suspenso mesmo após interação do usuário.
         */
        if (
            this.audioContext.state ===
            "suspended"
        ) {
            await this.audioContext.resume();
        }


        this.source =
            this.audioContext.createMediaStreamSource(
                this.stream
            );


        this.analyser =
            this.audioContext.createAnalyser();


        /*
         * 4096 amostras oferecem uma resolução razoável
         * para frequências graves da voz.
         */
        this.analyser.fftSize =
            4096;


        this.analyser.smoothingTimeConstant =
            0;


        this.buffer =
            new Float32Array(
                this.analyser.fftSize
            );


        this.source.connect(
            this.analyser
        );


        /*
         * Não conectamos o analyser ao destino.
         *
         * Portanto:
         *
         * microfone → análise
         *
         * e NÃO:
         *
         * microfone → alto-falante
         *
         * Isso evita eco e microfonia.
         */
        this.running =
            true;
    }


    /*
     * Copia o áudio atual para nosso buffer.
     */
    getTimeDomainData() {

        if (
            !this.running ||
            !this.analyser ||
            !this.buffer
        ) {
            return null;
        }


        this.analyser.getFloatTimeDomainData(
            this.buffer
        );


        return this.buffer;
    }


    /*
     * Calcula RMS:
     *
     * uma medida simples da intensidade atual do sinal.
     *
     * Retorna aproximadamente:
     *
     * 0.000 = silêncio
     * 0.020 = sinal baixo
     * 0.100 = sinal razoável
     * 0.500 = sinal muito forte
     */
    calculateRms(buffer) {

        if (
            !buffer ||
            buffer.length === 0
        ) {
            return 0;
        }


        let sumSquares = 0;


        for (
            let i = 0;
            i < buffer.length;
            i++
        ) {

            const sample =
                buffer[i];

            sumSquares +=
                sample * sample;
        }


        return Math.sqrt(
            sumSquares /
            buffer.length
        );
    }


    /*
     * Encerra completamente a captura.
     */
    async stop() {

        this.running =
            false;


        if (this.source) {

            try {
                this.source.disconnect();
            } catch (error) {
                console.warn(error);
            }

            this.source =
                null;
        }


        if (this.analyser) {

            try {
                this.analyser.disconnect();
            } catch (error) {
                console.warn(error);
            }

            this.analyser =
                null;
        }


        if (this.stream) {

            this.stream
                .getTracks()
                .forEach(
                    track => track.stop()
                );

            this.stream =
                null;
        }


        if (this.audioContext) {

            try {

                if (
                    this.audioContext.state !==
                    "closed"
                ) {
                    await this.audioContext.close();
                }

            } catch (error) {

                console.warn(error);
            }


            this.audioContext =
                null;
        }


        this.buffer =
            null;
    }


    get sampleRate() {

        return (
            this.audioContext
                ? this.audioContext.sampleRate
                : null
        );
    }
}