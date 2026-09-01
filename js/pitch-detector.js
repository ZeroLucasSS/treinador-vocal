/*
 * ============================================================
 * pitch-detector.js
 * ============================================================
 *
 * Detector de frequência fundamental baseado no algoritmo YIN.
 *
 * O objetivo desta primeira implementação não é avaliar canto.
 * Ela simplesmente tenta responder:
 *
 * "Qual é a frequência fundamental dominante neste momento?"
 *
 * ============================================================
 */


export class PitchDetector {

    constructor({
        threshold = 0.12,
        minFrequency = 70,
        maxFrequency = 1000
    } = {}) {

        this.threshold =
            threshold;

        this.minFrequency =
            minFrequency;

        this.maxFrequency =
            maxFrequency;

        this.yinBuffer =
            new Float32Array(0);
    }


    /*
     * Detecta a frequência fundamental.
     *
     * Recebe:
     *
     * buffer     → amostras do áudio
     * sampleRate → taxa de amostragem do AudioContext
     *
     * Retorna:
     *
     * {
     *     frequency,
     *     probability
     * }
     *
     * ou null.
     */
    detect(
        buffer,
        sampleRate
    ) {

        if (
            !buffer ||
            buffer.length < 4 ||
            !sampleRate
        ) {
            return null;
        }


        /*
         * tau representa o período do sinal
         * medido em quantidade de amostras.
         *
         * Frequência alta → período pequeno.
         * Frequência baixa → período grande.
         */
        const minTau =
            Math.max(
                2,
                Math.floor(
                    sampleRate /
                    this.maxFrequency
                )
            );

        const maxTau =
            Math.min(
                Math.floor(
                    sampleRate /
                    this.minFrequency
                ),
                Math.floor(
                    buffer.length / 2
                )
            );


        if (maxTau <= minTau) {
            return null;
        }


        /*
         * Garante espaço suficiente
         * para nossos cálculos.
         */
        if (
            this.yinBuffer.length <
            maxTau + 1
        ) {
            this.yinBuffer =
                new Float32Array(
                    maxTau + 1
                );
        }


        const yin =
            this.yinBuffer;


        /*
         * --------------------------------------------------------
         * PASSO 1
         *
         * Difference function.
         * --------------------------------------------------------
         */
        yin.fill(
            0,
            0,
            maxTau + 1
        );


        for (
            let tau = 1;
            tau <= maxTau;
            tau++
        ) {

            let sum = 0;

            const limit =
                buffer.length - tau;


            for (
                let i = 0;
                i < limit;
                i++
            ) {

                const delta =
                    buffer[i] -
                    buffer[i + tau];

                sum +=
                    delta * delta;
            }


            yin[tau] = sum;
        }


        /*
         * --------------------------------------------------------
         * PASSO 2
         *
         * Cumulative mean normalized difference.
         * --------------------------------------------------------
         */

        yin[0] = 1;

        let runningSum = 0;


        for (
            let tau = 1;
            tau <= maxTau;
            tau++
        ) {

            runningSum +=
                yin[tau];


            if (runningSum === 0) {

                yin[tau] = 1;

            } else {

                yin[tau] *=
                    tau /
                    runningSum;
            }
        }


        /*
         * --------------------------------------------------------
         * PASSO 3
         *
         * Encontrar o primeiro vale suficientemente confiável.
         * --------------------------------------------------------
         */

        let tauEstimate = -1;


        for (
            let tau = minTau;
            tau <= maxTau;
            tau++
        ) {

            if (
                yin[tau] <
                this.threshold
            ) {

                /*
                 * Continua enquanto a função ainda estiver descendo.
                 *
                 * Queremos o fundo do vale.
                 */
                while (
                    tau + 1 <= maxTau &&
                    yin[tau + 1] <
                    yin[tau]
                ) {
                    tau++;
                }

                tauEstimate = tau;

                break;
            }
        }


        /*
         * Se nenhum candidato cruzar o limiar,
         * tentamos encontrar simplesmente o menor vale.
         */
        if (tauEstimate === -1) {

            let bestTau =
                minTau;

            let bestValue =
                yin[minTau];


            for (
                let tau = minTau + 1;
                tau <= maxTau;
                tau++
            ) {

                if (
                    yin[tau] <
                    bestValue
                ) {

                    bestValue =
                        yin[tau];

                    bestTau =
                        tau;
                }
            }


            /*
             * Se nem mesmo o melhor candidato for minimamente
             * convincente, consideramos que não há pitch confiável.
             */
            if (
                bestValue >
                0.35
            ) {
                return null;
            }


            tauEstimate =
                bestTau;
        }


        /*
         * --------------------------------------------------------
         * PASSO 4
         *
         * Interpolação parabólica.
         *
         * Isso permite estimar uma frequência entre duas amostras,
         * aumentando bastante a precisão.
         * --------------------------------------------------------
         */

        const betterTau =
            this.parabolicInterpolation(
                yin,
                tauEstimate,
                maxTau
            );


        if (
            !Number.isFinite(betterTau) ||
            betterTau <= 0
        ) {
            return null;
        }


        const frequency =
            sampleRate /
            betterTau;


        if (
            frequency <
            this.minFrequency ||
            frequency >
            this.maxFrequency
        ) {
            return null;
        }


        /*
         * Quanto menor yin[tau], melhor.
         *
         * Transformamos isso em uma "probabilidade"
         * aproximada de 0 a 1.
         */
        const probability =
            Math.max(
                0,
                Math.min(
                    1,
                    1 - yin[tauEstimate]
                )
            );


        return {
            frequency,
            probability
        };
    }


    /*
     * Refinamento do período estimado usando
     * os valores imediatamente vizinhos.
     */
    parabolicInterpolation(
        buffer,
        tau,
        maxTau
    ) {

        if (
            tau <= 1 ||
            tau >= maxTau
        ) {
            return tau;
        }


        const left =
            buffer[tau - 1];

        const center =
            buffer[tau];

        const right =
            buffer[tau + 1];


        const denominator =
            2 *
            (
                2 * center -
                right -
                left
            );


        if (
            Math.abs(denominator) <
            1e-12
        ) {
            return tau;
        }


        const adjustment =
            (right - left) /
            denominator;


        return (
            tau +
            adjustment
        );
    }
}