/*
 * ============================================================
 * session.js
 * ============================================================
 *
 * Responsável pelas sessões de treinamento:
 *
 * - dificuldade;
 * - quantidade de rodadas;
 * - tentativas;
 * - notas acertadas;
 * - pontuação;
 * - precisão média;
 * - histórico das rodadas.
 *
 * ============================================================
 */


/*
 * ============================================================
 * NÍVEIS DE DIFICULDADE
 * ============================================================
 */

export const DIFFICULTIES = {

    beginner: {

        id: "beginner",

        name: "Iniciante",

        toleranceCents: 40,

        nearToleranceCents: 90
    },


    intermediate: {

        id: "intermediate",

        name: "Intermediário",

        toleranceCents: 25,

        nearToleranceCents: 70
    },


    advanced: {

        id: "advanced",

        name: "Avançado",

        toleranceCents: 15,

        nearToleranceCents: 50
    }
};


/*
 * ============================================================
 * SESSÃO
 * ============================================================
 */

export class TrainingSession {

    constructor({
        difficulty = "beginner",
        totalRounds = 5
    } = {}) {

        this.difficulty =
            DIFFICULTIES[difficulty] ||
            DIFFICULTIES.beginner;


        this.totalRounds =
            totalRounds;


        this.currentRound =
            1;


        this.totalAttempts =
            0;


        this.totalHits =
            0;


        this.noteScores =
            [];


        this.absoluteCentsSamples =
            [];


        this.rounds =
            [];


        this.currentRoundScores =
            [];


        this.currentRoundAttempts =
            0;


        this.currentRoundHits =
            0;


        this.finished =
            false;
    }


    /*
     * Registra uma nova tentativa vocal.
     */
    registerAttempt() {

        this.totalAttempts++;

        this.currentRoundAttempts++;
    }


    /*
     * Registra uma nota concluída com sucesso.
     *
     * Recebe:
     *
     * averageAbsCents
     * attemptsForTarget
     */
    registerHit({
        averageAbsCents,
        attemptsForTarget = 1
    }) {

        this.totalHits++;

        this.currentRoundHits++;


        const score =
            this.calculateNoteScore(
                averageAbsCents,
                attemptsForTarget
            );


        this.noteScores.push(
            score
        );


        this.currentRoundScores.push(
            score
        );


        if (
            Number.isFinite(
                averageAbsCents
            )
        ) {

            this.absoluteCentsSamples.push(
                averageAbsCents
            );
        }


        return score;
    }


    /*
     * --------------------------------------------------------
     * PONTUAÇÃO
     * --------------------------------------------------------
     *
     * A nota considera:
     *
     * 1. precisão dentro da faixa permitida;
     * 2. quantidade de tentativas.
     *
     * Exemplo:
     *
     * muito próximo do centro + primeira tentativa
     * → aproximadamente 100 pontos
     *
     * perto do limite + várias tentativas
     * → pontuação menor
     *
     * --------------------------------------------------------
     */
    calculateNoteScore(
        averageAbsCents,
        attemptsForTarget
    ) {

        const tolerance =
            this.difficulty
                .toleranceCents;


        const normalizedError =
            Math.min(
                1,
                Math.max(
                    0,
                    averageAbsCents /
                    tolerance
                )
            );


        /*
         * Precisão vale até 80 pontos.
         *
         * Mesmo uma nota concluída no limite
         * ainda recebe pontuação razoável.
         */
        const accuracyScore =
            80 -
            (
                normalizedError *
                30
            );


        /*
         * Primeira tentativa:
         *
         * +20
         *
         * Cada tentativa adicional retira 5 pontos,
         * até o mínimo de zero neste componente.
         */
        const attemptScore =
            Math.max(
                0,
                20 -
                Math.max(
                    0,
                    attemptsForTarget - 1
                ) * 5
            );


        return Math.round(
            Math.max(
                0,
                Math.min(
                    100,
                    accuracyScore +
                    attemptScore
                )
            )
        );
    }


    /*
     * Encerra a rodada atual.
     */
    finishRound() {

        const score =
            this.currentRoundScores.length
                ? Math.round(
                    this.currentRoundScores
                        .reduce(
                            (sum, value) =>
                                sum + value,
                            0
                        ) /
                    this.currentRoundScores.length
                )
                : 0;


        const roundResult = {

            round:
                this.currentRound,

            score,

            hits:
                this.currentRoundHits,

            attempts:
                this.currentRoundAttempts
        };


        this.rounds.push(
            roundResult
        );


        this.currentRoundScores =
            [];


        this.currentRoundAttempts =
            0;


        this.currentRoundHits =
            0;


        if (
            this.currentRound >=
            this.totalRounds
        ) {

            this.finished =
                true;

        } else {

            this.currentRound++;
        }


        return roundResult;
    }


    /*
     * Pontuação geral da sessão.
     */
    getScore() {

        if (
            this.noteScores.length ===
            0
        ) {
            return 0;
        }


        return Math.round(
            this.noteScores.reduce(
                (sum, value) =>
                    sum + value,
                0
            ) /
            this.noteScores.length
        );
    }


    /*
     * Erro médio absoluto em cents.
     */
    getAverageCents() {

        if (
            this.absoluteCentsSamples.length ===
            0
        ) {
            return 0;
        }


        return (
            this.absoluteCentsSamples.reduce(
                (sum, value) =>
                    sum + value,
                0
            ) /
            this.absoluteCentsSamples.length
        );
    }


    /*
     * Resultado consolidado.
     */
    getSummary() {

        return {

            score:
                this.getScore(),

            hits:
                this.totalHits,

            attempts:
                this.totalAttempts,

            averageCents:
                this.getAverageCents(),

            difficulty:
                this.difficulty,

            rounds:
                [
                    ...this.rounds
                ]
        };
    }
}