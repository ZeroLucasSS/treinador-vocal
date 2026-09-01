/*
 * ============================================================
 * app.js
 * ============================================================
 *
 * TREINADOR VOCAL
 *
 * Etapa atual:
 *
 * - sessões;
 * - níveis de dificuldade;
 * - rodadas;
 * - tentativas;
 * - acertos;
 * - pontuação;
 * - relatório final.
 *
 * ============================================================
 */


import {
    MicrophoneAudio
} from "./audio.js";


import {
    PitchDetector
} from "./pitch-detector.js";


import {
    analyzeFrequency,
    midiToFrequency,
    midiToNoteName,
    midiToOctave
} from "./music-theory.js";


import {
    getExercise
} from "./exercises.js";


import {
    ToneGenerator
} from "./tone-generator.js";


import {
    TrainingSession,
    DIFFICULTIES
} from "./session.js";


/*
 * ============================================================
 * CONFIGURAÇÕES DE ÁUDIO
 * ============================================================
 */

const MIN_RMS =
    0.01;


const MIN_PROBABILITY =
    0.70;


const SMOOTHING_WINDOW =
    5;


const NO_PITCH_TIMEOUT =
    450;


/*
 * Um silêncio desta duração encerra a tentativa vocal atual.
 *
 * Ao voltar a cantar, contabilizamos nova tentativa.
 */
const NEW_ATTEMPT_SILENCE_MS =
    650;


const ADVANCE_DELAY_MS =
    650;


const NEXT_ROUND_DELAY_MS =
    1200;


/*
 * ============================================================
 * ELEMENTOS
 * ============================================================
 */

const elements = {

    configuration:
        document.getElementById(
            "configuracao"
        ),

    exerciseButtons:
        Array.from(
            document.querySelectorAll(
                ".botao-exercicio"
            )
        ),

    difficultyButtons:
        Array.from(
            document.querySelectorAll(
                ".botao-dificuldade"
            )
        ),

    roundCount:
        document.getElementById(
            "quantidadeRodadas"
        ),

    sessionStats:
        document.getElementById(
            "estatisticasSessao"
        ),

    sessionRound:
        document.getElementById(
            "estatisticaRodada"
        ),

    sessionHits:
        document.getElementById(
            "estatisticaAcertos"
        ),

    sessionAttempts:
        document.getElementById(
            "estatisticaTentativas"
        ),

    sessionScore:
        document.getElementById(
            "estatisticaPontuacao"
        ),

    title:
        document.getElementById(
            "tituloExercicio"
        ),

    description:
        document.getElementById(
            "descricaoExercicio"
        ),

    microphoneState:
        document.getElementById(
            "estadoMicrofone"
        ),

    targetNote:
        document.getElementById(
            "notaAlvo"
        ),

    targetOctave:
        document.getElementById(
            "oitavaAlvo"
        ),

    targetFrequency:
        document.getElementById(
            "frequenciaAlvo"
        ),

    listenButton:
        document.getElementById(
            "botaoOuvirNota"
        ),

    sequence:
        document.getElementById(
            "sequenciaVisual"
        ),

    detectedNote:
        document.getElementById(
            "nota"
        ),

    detectedOctave:
        document.getElementById(
            "oitava"
        ),

    detectedFrequency:
        document.getElementById(
            "frequencia"
        ),

    indicator:
        document.getElementById(
            "indicador"
        ),

    correctRange:
        document.getElementById(
            "faixaCorreta"
        ),

    cents:
        document.getElementById(
            "cents"
        ),

    errorCents:
        document.getElementById(
            "erroCents"
        ),

    feedback:
        document.getElementById(
            "feedback"
        ),

    progressText:
        document.getElementById(
            "textoProgresso"
        ),

    progressBar:
        document.getElementById(
            "barraProgresso"
        ),

    signalLevel:
        document.getElementById(
            "nivelSinal"
        ),

    mainButton:
        document.getElementById(
            "botaoPrincipal"
        ),

    message:
        document.getElementById(
            "mensagem"
        ),

    resultPanel:
        document.getElementById(
            "resultadoSessao"
        ),

    finalScore:
        document.getElementById(
            "pontuacaoFinal"
        ),

    finalEvaluation:
        document.getElementById(
            "avaliacaoFinal"
        ),

    resultHits:
        document.getElementById(
            "resultadoAcertos"
        ),

    resultAttempts:
        document.getElementById(
            "resultadoTentativas"
        ),

    resultAccuracy:
        document.getElementById(
            "resultadoPrecisao"
        ),

    roundsList:
        document.getElementById(
            "listaRodadas"
        ),

    newSessionButton:
        document.getElementById(
            "botaoNovaSessao"
        )
};


/*
 * ============================================================
 * COMPONENTES
 * ============================================================
 */

const microphone =
    new MicrophoneAudio();


const pitchDetector =
    new PitchDetector({

        minFrequency: 70,

        maxFrequency: 1000,

        threshold: 0.12
    });


const toneGenerator =
    new ToneGenerator();


/*
 * ============================================================
 * ESTADO
 * ============================================================
 */

let selectedExerciseId =
    "single";


let selectedDifficultyId =
    "beginner";


let currentExercise =
    getExercise(
        selectedExerciseId
    );


let trainingSession =
    null;


let exerciseData =
    null;


let currentTargetIndex =
    0;


let sessionRunning =
    false;


let referencePlaying =
    false;


let advancingNote =
    false;


let advancingRound =
    false;


let holdStartTime =
    null;


let animationFrameId =
    null;


let recentFrequencies =
    [];


let lastValidPitchTime =
    0;


/*
 * Controle das tentativas.
 */
let attemptActive =
    false;


let lastVoiceTime =
    0;


let attemptsForCurrentTarget =
    0;


/*
 * Durante o período correto,
 * armazenamos erros absolutos em cents.
 *
 * Isso permite calcular a precisão da nota.
 */
let correctCentsSamples =
    [];


/*
 * ============================================================
 * SELEÇÃO DO EXERCÍCIO
 * ============================================================
 */

elements.exerciseButtons.forEach(
    button => {

        button.addEventListener(
            "click",
            () => {

                if (
                    sessionRunning
                ) {
                    return;
                }


                selectedExerciseId =
                    button.dataset.exercise;


                currentExercise =
                    getExercise(
                        selectedExerciseId
                    );


                elements.exerciseButtons
                    .forEach(
                        item =>
                            item.classList.remove(
                                "ativo"
                            )
                    );


                button.classList.add(
                    "ativo"
                );


                updateExerciseDescription();
            }
        );
    }
);


/*
 * ============================================================
 * DIFICULDADE
 * ============================================================
 */

elements.difficultyButtons.forEach(
    button => {

        button.addEventListener(
            "click",
            () => {

                if (
                    sessionRunning
                ) {
                    return;
                }


                selectedDifficultyId =
                    button.dataset.difficulty;


                elements.difficultyButtons
                    .forEach(
                        item =>
                            item.classList.remove(
                                "ativo"
                            )
                    );


                button.classList.add(
                    "ativo"
                );


                updateCorrectRangeVisual();
            }
        );
    }
);


/*
 * ============================================================
 * BOTÃO PRINCIPAL
 * ============================================================
 */

elements.mainButton.addEventListener(
    "click",
    async () => {

        if (
            sessionRunning
        ) {

            await stopSession();

        } else {

            await startSession();
        }
    }
);


/*
 * ============================================================
 * NOVA SESSÃO
 * ============================================================
 */

elements.newSessionButton.addEventListener(
    "click",
    () => {

        elements.resultPanel
            .classList
            .add(
                "oculto"
            );


        elements.configuration
            .classList
            .remove(
                "oculto"
            );


        resetTrainingDisplay();


        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }
);


/*
 * ============================================================
 * OUVIR NOTA
 * ============================================================
 */

elements.listenButton.addEventListener(
    "click",
    async () => {

        if (
            !exerciseData ||
            referencePlaying
        ) {
            return;
        }


        await playCurrentReference();
    }
);


/*
 * ============================================================
 * INICIAR SESSÃO
 * ============================================================
 */

async function startSession() {

    elements.mainButton.disabled =
        true;


    try {

        const totalRounds =
            Number(
                elements.roundCount.value
            );


        trainingSession =
            new TrainingSession({

                difficulty:
                    selectedDifficultyId,

                totalRounds
            });


        currentExercise =
            getExercise(
                selectedExerciseId
            );


        sessionRunning =
            true;


        elements.resultPanel
            .classList
            .add(
                "oculto"
            );


        elements.configuration
            .classList
            .add(
                "oculto"
            );


        elements.sessionStats
            .classList
            .remove(
                "oculto"
            );


        await toneGenerator.ensureContext();


        await microphone.start();


        elements.microphoneState.textContent =
            "● Microfone ativo";


        elements.microphoneState
            .classList
            .add(
                "ativo"
            );


        elements.mainButton.textContent =
            "Interromper sessão";


        elements.mainButton
            .classList
            .add(
                "parar"
            );


        updateCorrectRangeVisual();


        updateSessionStats();


        await startRound();


        if (
            sessionRunning
        ) {

            processAudio();
        }


    } catch (error) {

        console.error(
            error
        );


        elements.message.className =
            "mensagem erro";


        if (
            error.name ===
            "NotAllowedError"
        ) {

            elements.message.textContent =
                "A permissão do microfone foi negada.";

        } else {

            elements.message.textContent =
                "Não foi possível iniciar a sessão: " +
                error.message;
        }


        await forceStop();
    }


    elements.mainButton.disabled =
        false;
}


/*
 * ============================================================
 * NOVA RODADA
 * ============================================================
 */

async function startRound() {

    if (
        !sessionRunning
    ) {
        return;
    }


    advancingRound =
        true;


    exerciseData =
        currentExercise.build();


    currentTargetIndex =
        0;


    resetCurrentTargetState();


    updateTargetVisual();


    updateSequenceVisual();


    updateProgressRaw(
        0
    );


    updateSessionStats();


    setFeedback(
        `Rodada ${trainingSession.currentRound} de ${trainingSession.totalRounds}. Ouça com atenção.`,
        "neutro"
    );


    elements.message.className =
        "mensagem";


    elements.message.textContent =
        "A referência será tocada antes de você cantar.";


    await playExerciseReference();


    if (
        !sessionRunning
    ) {
        return;
    }


    setFeedback(
        "Agora é sua vez. Cante a nota indicada.",
        "neutro"
    );


    elements.message.textContent =
        "Cante usando uma vogal sustentada, como “aaaa”.";


    advancingRound =
        false;


    lastValidPitchTime =
        performance.now();
}


/*
 * ============================================================
 * REFERÊNCIA
 * ============================================================
 */

async function playExerciseReference() {

    referencePlaying =
        true;


    clearDetectedPitch();


    try {

        if (
            exerciseData.notes.length ===
            1
        ) {

            await toneGenerator.playNote(
                exerciseData.notes[0],
                1000
            );

        } else {

            await toneGenerator.playSequence(
                exerciseData.notes,
                {
                    noteDurationMs: 650,
                    gapMs: 180
                }
            );
        }


        await wait(
            300
        );

    } finally {

        referencePlaying =
            false;


        attemptActive =
            false;


        lastVoiceTime =
            performance.now();
    }
}


/*
 * Referência da nota atual.
 */
async function playCurrentReference() {

    const midi =
        getCurrentTargetMidi();


    if (
        midi === null
    ) {
        return;
    }


    referencePlaying =
        true;


    clearDetectedPitch();


    setFeedback(
        "Ouça a nota...",
        "neutro"
    );


    try {

        await toneGenerator.playNote(
            midi,
            900
        );


        await wait(
            250
        );

    } finally {

        referencePlaying =
            false;


        attemptActive =
            false;


        lastVoiceTime =
            performance.now();


        if (
            sessionRunning
        ) {

            setFeedback(
                "Sua vez. Reproduza a nota.",
                "neutro"
            );
        }
    }
}


/*
 * ============================================================
 * LOOP DE ÁUDIO
 * ============================================================
 */

function processAudio() {

    if (
        !sessionRunning
    ) {
        return;
    }


    if (
        referencePlaying ||
        advancingNote ||
        advancingRound
    ) {

        scheduleNextFrame();

        return;
    }


    const buffer =
        microphone.getTimeDomainData();


    if (
        !buffer
    ) {

        scheduleNextFrame();

        return;
    }


    const rms =
        microphone.calculateRms(
            buffer
        );


    updateSignalLevel(
        rms
    );


    if (
        rms <
        MIN_RMS
    ) {

        handleSilence();

        scheduleNextFrame();

        return;
    }


    const detection =
        pitchDetector.detect(
            buffer,
            microphone.sampleRate
        );


    if (
        !detection ||
        detection.probability <
        MIN_PROBABILITY
    ) {

        handleNoPitch();

        scheduleNextFrame();

        return;
    }


    lastValidPitchTime =
        performance.now();


    lastVoiceTime =
        performance.now();


    /*
     * Se ainda não havia tentativa ativa,
     * começamos uma nova.
     */
    if (
        !attemptActive
    ) {

        attemptActive =
            true;


        attemptsForCurrentTarget++;


        trainingSession.registerAttempt();


        updateSessionStats();
    }


    const frequency =
        smoothFrequency(
            detection.frequency
        );


    if (
        !frequency
    ) {

        scheduleNextFrame();

        return;
    }


    const musicalData =
        analyzeFrequency(
            frequency
        );


    if (
        musicalData
    ) {

        updateDetectedPitch(
            musicalData
        );


        evaluatePitch(
            frequency
        );
    }


    scheduleNextFrame();
}


/*
 * ============================================================
 * AVALIAÇÃO
 * ============================================================
 */

function evaluatePitch(
    frequency
) {

    const targetMidi =
        getCurrentTargetMidi();


    if (
        targetMidi === null
    ) {
        return;
    }


    const targetFrequency =
        midiToFrequency(
            targetMidi
        );


    const centsDifference =
        1200 *
        Math.log2(
            frequency /
            targetFrequency
        );


    updateTargetMeter(
        centsDifference
    );


    const absoluteDifference =
        Math.abs(
            centsDifference
        );


    const tolerance =
        trainingSession
            .difficulty
            .toleranceCents;


    const nearTolerance =
        trainingSession
            .difficulty
            .nearToleranceCents;


    /*
     * ========================================================
     * CORRETO
     * ========================================================
     */

    if (
        absoluteDifference <=
        tolerance
    ) {

        if (
            holdStartTime ===
            null
        ) {

            holdStartTime =
                performance.now();


            correctCentsSamples =
                [];
        }


        correctCentsSamples.push(
            absoluteDifference
        );


        const heldMs =
            performance.now() -
            holdStartTime;


        const requiredMs =
            currentExercise
                .requiredHoldMs;


        const localProgress =
            Math.min(
                1,
                heldMs /
                requiredMs
            );


        updateExerciseProgress(
            localProgress
        );


        if (
            selectedExerciseId ===
            "sustain"
        ) {

            const remaining =
                Math.max(
                    0,
                    (
                        requiredMs -
                        heldMs
                    ) /
                    1000
                );


            setFeedback(
                `Muito bem! Sustente... ${remaining.toFixed(1)} s`,
                "correto"
            );

        } else {

            setFeedback(
                "Correto! Mantenha a afinação...",
                "correto"
            );
        }


        if (
            heldMs >=
            requiredMs
        ) {

            completeCurrentTarget();
        }


        return;
    }


    /*
     * Saiu da faixa correta.
     */
    holdStartTime =
        null;


    correctCentsSamples =
        [];


    updateExerciseProgress(
        0
    );


    /*
     * ========================================================
     * PRÓXIMO
     * ========================================================
     */

    if (
        absoluteDifference <=
        nearTolerance
    ) {

        if (
            centsDifference <
            0
        ) {

            setFeedback(
                "Quase! Suba um pouco a voz.",
                "proximo"
            );

        } else {

            setFeedback(
                "Quase! Desça um pouco a voz.",
                "proximo"
            );
        }


        return;
    }


    /*
     * ========================================================
     * DISTANTE
     * ========================================================
     */

    if (
        centsDifference <
        0
    ) {

        setFeedback(
            "Você está abaixo da nota. Suba a voz.",
            "errado"
        );

    } else {

        setFeedback(
            "Você está acima da nota. Desça a voz.",
            "errado"
        );
    }
}


/*
 * ============================================================
 * NOTA CONCLUÍDA
 * ============================================================
 */

async function completeCurrentTarget() {

    if (
        advancingNote ||
        advancingRound
    ) {
        return;
    }


    advancingNote =
        true;


    holdStartTime =
        null;


    const averageAbsCents =
        calculateAverage(
            correctCentsSamples
        );


    const noteScore =
        trainingSession.registerHit({

            averageAbsCents,

            attemptsForTarget:
                Math.max(
                    1,
                    attemptsForCurrentTarget
                )
        });


    updateSessionStats();


    markCurrentSequenceNoteCompleted();


    setFeedback(
        `✓ Nota concluída — ${noteScore} pontos`,
        "correto"
    );


    const isLastTarget =
        currentTargetIndex >=
        exerciseData.notes.length - 1;


    if (
        isLastTarget
    ) {

        await finishCurrentRound();

        return;
    }


    await wait(
        ADVANCE_DELAY_MS
    );


    if (
        !sessionRunning
    ) {
        return;
    }


    currentTargetIndex++;


    resetCurrentTargetState();


    updateTargetVisual();


    updateSequenceVisual();


    clearDetectedPitch();


    setFeedback(
        "Próxima nota.",
        "neutro"
    );


    await playCurrentReference();


    advancingNote =
        false;
}


/*
 * ============================================================
 * RODADA CONCLUÍDA
 * ============================================================
 */

async function finishCurrentRound() {

    advancingRound =
        true;


    const roundResult =
        trainingSession.finishRound();


    updateSessionStats();


    setFeedback(
        `✓ Rodada concluída — ${roundResult.score} pontos`,
        "correto"
    );


    if (
        trainingSession.finished
    ) {

        await finishSession();

        return;
    }


    await wait(
        NEXT_ROUND_DELAY_MS
    );


    if (
        !sessionRunning
    ) {
        return;
    }


    advancingNote =
        false;


    await startRound();
}


/*
 * ============================================================
 * FINAL DA SESSÃO
 * ============================================================
 */

async function finishSession() {

    sessionRunning =
        false;


    advancingNote =
        false;


    advancingRound =
        false;


    if (
        animationFrameId !==
        null
    ) {

        cancelAnimationFrame(
            animationFrameId
        );


        animationFrameId =
            null;
    }


    await microphone.stop();


    elements.microphoneState.textContent =
        "Microfone desligado";


    elements.microphoneState
        .classList
        .remove(
            "ativo"
        );


    elements.mainButton.textContent =
        "Sessão concluída";


    elements.mainButton.disabled =
        true;


    elements.mainButton
        .classList
        .remove(
            "parar"
        );


    updateProgressRaw(
        1
    );


    setFeedback(
        "✓ Sessão concluída!",
        "correto"
    );


    showSessionResults();
}


/*
 * ============================================================
 * RESULTADOS
 * ============================================================
 */

function showSessionResults() {

    const summary =
        trainingSession.getSummary();


    elements.finalScore.textContent =
        summary.score;


    elements.resultHits.textContent =
        summary.hits;


    elements.resultAttempts.textContent =
        summary.attempts;


    elements.resultAccuracy.textContent =
        `${summary.averageCents.toFixed(1)} cents`;


    elements.finalEvaluation.textContent =
        getEvaluationText(
            summary.score
        );


    elements.roundsList.innerHTML =
        "";


    summary.rounds.forEach(
        round => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "resultado-rodada";


            const left =
                document.createElement(
                    "div"
                );


            const title =
                document.createElement(
                    "strong"
                );


            title.textContent =
                `Rodada ${round.round}`;


            const info =
                document.createElement(
                    "div"
                );


            info.className =
                "resultado-rodada-info";


            info.textContent =
                `${round.hits} acertos · ${round.attempts} tentativas`;


            left.appendChild(
                title
            );


            left.appendChild(
                info
            );


            const score =
                document.createElement(
                    "span"
                );


            score.className =
                "resultado-rodada-pontos";


            score.textContent =
                `${round.score} pts`;


            item.appendChild(
                left
            );


            item.appendChild(
                score
            );


            elements.roundsList.appendChild(
                item
            );
        }
    );


    elements.resultPanel
        .classList
        .remove(
            "oculto"
        );


    setTimeout(
        () => {

            elements.resultPanel.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

        },
        150
    );
}


function getEvaluationText(
    score
) {

    if (
        score >=
        95
    ) {

        return (
            "Excelente controle de afinação. " +
            "Você permaneceu muito próximo das frequências-alvo."
        );
    }


    if (
        score >=
        85
    ) {

        return (
            "Muito bom. A afinação esteve consistente na maior parte do treino."
        );
    }


    if (
        score >=
        70
    ) {

        return (
            "Bom resultado. Continue treinando para encontrar e estabilizar as notas com mais precisão."
        );
    }


    if (
        score >=
        55
    ) {

        return (
            "Você conseguiu completar o treino. Tente repetir a sessão prestando atenção às indicações de subir ou descer a voz."
        );
    }


    return (
        "Este exercício ainda está exigente. Vale repetir em uma dificuldade menor e trabalhar cada nota com calma."
    );
}


/*
 * ============================================================
 * ESTATÍSTICAS EM TEMPO REAL
 * ============================================================
 */

function updateSessionStats() {

    if (
        !trainingSession
    ) {
        return;
    }


    elements.sessionRound.textContent =
        `${trainingSession.currentRound} / ${trainingSession.totalRounds}`;


    elements.sessionHits.textContent =
        trainingSession.totalHits;


    elements.sessionAttempts.textContent =
        trainingSession.totalAttempts;


    elements.sessionScore.textContent =
        trainingSession.getScore();
}


/*
 * ============================================================
 * ESTADO DO ALVO
 * ============================================================
 */

function resetCurrentTargetState() {

    holdStartTime =
        null;


    recentFrequencies =
        [];


    correctCentsSamples =
        [];


    attemptActive =
        false;


    attemptsForCurrentTarget =
        0;


    lastVoiceTime =
        performance.now();


    lastValidPitchTime =
        performance.now();
}


/*
 * ============================================================
 * ALVO
 * ============================================================
 */

function getCurrentTargetMidi() {

    if (
        !exerciseData ||
        !exerciseData.notes ||
        currentTargetIndex >=
        exerciseData.notes.length
    ) {

        return null;
    }


    return (
        exerciseData
            .notes[
                currentTargetIndex
            ]
    );
}


function updateTargetVisual() {

    const midi =
        getCurrentTargetMidi();


    if (
        midi ===
        null
    ) {

        elements.targetNote.textContent =
            "—";


        elements.targetOctave.textContent =
            "";


        elements.targetFrequency.textContent =
            "—";


        return;
    }


    elements.targetNote.textContent =
        midiToNoteName(
            midi
        );


    elements.targetOctave.textContent =
        midiToOctave(
            midi
        );


    elements.targetFrequency.textContent =
        `${midiToFrequency(midi).toFixed(1)} Hz`;


    elements.listenButton.disabled =
        false;
}


/*
 * ============================================================
 * SEQUÊNCIA VISUAL
 * ============================================================
 */

function updateSequenceVisual() {

    elements.sequence.innerHTML =
        "";


    if (
        !exerciseData ||
        exerciseData.notes.length <=
        1
    ) {

        return;
    }


    exerciseData.notes.forEach(
        (midi, index) => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "nota-sequencia";


            if (
                index <
                currentTargetIndex
            ) {

                item.classList.add(
                    "concluida"
                );

            } else if (
                index ===
                currentTargetIndex
            ) {

                item.classList.add(
                    "atual"
                );
            }


            item.textContent =
                `${midiToNoteName(midi)}${midiToOctave(midi)}`;


            elements.sequence.appendChild(
                item
            );
        }
    );
}


function markCurrentSequenceNoteCompleted() {

    const item =
        elements.sequence.children[
            currentTargetIndex
        ];


    if (
        item
    ) {

        item.classList.remove(
            "atual"
        );


        item.classList.add(
            "concluida"
        );
    }
}


/*
 * ============================================================
 * NOTA DETECTADA
 * ============================================================
 */

function updateDetectedPitch(
    data
) {

    elements.detectedNote.textContent =
        data.note;


    elements.detectedOctave.textContent =
        data.octave;


    elements.detectedFrequency.textContent =
        `${data.frequency.toFixed(1)} Hz`;
}


/*
 * ============================================================
 * MEDIDOR
 * ============================================================
 */

function updateTargetMeter(
    cents
) {

    const limited =
        Math.max(
            -100,
            Math.min(
                100,
                cents
            )
        );


    const position =
        (
            limited +
            100
        ) / 2;


    elements.indicator.style.left =
        `${position}%`;


    const rounded =
        Math.round(
            cents
        );


    const sign =
        rounded > 0
            ? "+"
            : "";


    elements.errorCents.textContent =
        `${sign}${rounded} cents`;


    const tolerance =
        trainingSession
            .difficulty
            .toleranceCents;


    const nearTolerance =
        trainingSession
            .difficulty
            .nearToleranceCents;


    elements.cents.className =
        "cents";


    if (
        Math.abs(cents) <=
        tolerance
    ) {

        elements.cents.textContent =
            "Afinado";


        elements.cents.classList.add(
            "afinado"
        );

    } else if (
        Math.abs(cents) <=
        nearTolerance
    ) {

        elements.cents.textContent =
            `${sign}${rounded} cents`;


        elements.cents.classList.add(
            "proximo"
        );

    } else {

        elements.cents.textContent =
            `${sign}${rounded} cents`;


        elements.cents.classList.add(
            "distante"
        );
    }
}


/*
 * Ajusta visualmente a largura da zona correta.
 *
 * O medidor cobre de -100 a +100 cents.
 */
function updateCorrectRangeVisual() {

    const difficulty =
        trainingSession
            ? trainingSession.difficulty
            : DIFFICULTIES[
                selectedDifficultyId
            ];


    const tolerance =
        difficulty.toleranceCents;


    const left =
        50 -
        (
            tolerance /
            2
        );


    const width =
        tolerance;


    elements.correctRange.style.left =
        `${left}%`;


    elements.correctRange.style.width =
        `${width}%`;
}


/*
 * ============================================================
 * PROGRESSO
 * ============================================================
 */

function updateExerciseProgress(
    localProgress
) {

    if (
        !exerciseData
    ) {
        return;
    }


    const completed =
        currentTargetIndex;


    const total =
        exerciseData.notes.length;


    const totalProgress =
        (
            completed +
            localProgress
        ) /
        total;


    updateProgressRaw(
        totalProgress
    );
}


function updateProgressRaw(
    progress
) {

    const value =
        Math.max(
            0,
            Math.min(
                1,
                progress
            )
        );


    const percentage =
        Math.round(
            value *
            100
        );


    elements.progressBar.style.width =
        `${percentage}%`;


    elements.progressText.textContent =
        `${percentage}%`;
}


/*
 * ============================================================
 * SUAVIZAÇÃO
 * ============================================================
 */

function smoothFrequency(
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


    recentFrequencies.push(
        frequency
    );


    if (
        recentFrequencies.length >
        SMOOTHING_WINDOW
    ) {

        recentFrequencies.shift();
    }


    const sorted =
        [
            ...recentFrequencies
        ].sort(
            (a, b) =>
                a - b
        );


    const middle =
        Math.floor(
            sorted.length /
            2
        );


    if (
        sorted.length %
        2 ===
        1
    ) {

        return sorted[
            middle
        ];
    }


    return (
        sorted[middle - 1] +
        sorted[middle]
    ) / 2;
}


/*
 * ============================================================
 * SILÊNCIO
 * ============================================================
 */

function handleSilence() {

    holdStartTime =
        null;


    correctCentsSamples =
        [];


    updateExerciseProgress(
        0
    );


    const silenceDuration =
        performance.now() -
        lastVoiceTime;


    if (
        attemptActive &&
        silenceDuration >=
        NEW_ATTEMPT_SILENCE_MS
    ) {

        attemptActive =
            false;
    }


    handleNoPitch();
}


function handleNoPitch() {

    const elapsed =
        performance.now() -
        lastValidPitchTime;


    if (
        elapsed <
        NO_PITCH_TIMEOUT
    ) {

        return;
    }


    recentFrequencies =
        [];


    clearDetectedPitch();


    if (
        sessionRunning &&
        !referencePlaying &&
        !advancingNote &&
        !advancingRound
    ) {

        setFeedback(
            "Cante a nota indicada.",
            "neutro"
        );
    }
}


/*
 * ============================================================
 * NÍVEL DO SINAL
 * ============================================================
 */

function updateSignalLevel(
    rms
) {

    let description;


    if (
        rms <
        0.005
    ) {

        description =
            "Silêncio";

    } else if (
        rms <
        0.02
    ) {

        description =
            "Baixo";

    } else if (
        rms <
        0.08
    ) {

        description =
            "Bom";

    } else if (
        rms <
        0.25
    ) {

        description =
            "Forte";

    } else {

        description =
            "Muito forte";
    }


    elements.signalLevel.textContent =
        description;
}


/*
 * ============================================================
 * FEEDBACK
 * ============================================================
 */

function setFeedback(
    text,
    type = "neutro"
) {

    elements.feedback.textContent =
        text;


    elements.feedback.className =
        `feedback ${type}`;
}


/*
 * ============================================================
 * RESET VISUAL
 * ============================================================
 */

function clearDetectedPitch() {

    elements.detectedNote.textContent =
        "—";


    elements.detectedOctave.textContent =
        "";


    elements.detectedFrequency.textContent =
        "-- Hz";


    elements.indicator.style.left =
        "50%";


    elements.cents.textContent =
        "Aguardando...";


    elements.cents.className =
        "cents";


    elements.errorCents.textContent =
        "—";
}


function resetTrainingDisplay() {

    trainingSession =
        null;


    exerciseData =
        null;


    sessionRunning =
        false;


    currentTargetIndex =
        0;


    elements.sessionStats
        .classList
        .add(
            "oculto"
        );


    elements.targetNote.textContent =
        "—";


    elements.targetOctave.textContent =
        "";


    elements.targetFrequency.textContent =
        "—";


    elements.sequence.innerHTML =
        "";


    elements.signalLevel.textContent =
        "—";


    elements.listenButton.disabled =
        true;


    elements.mainButton.disabled =
        false;


    elements.mainButton.textContent =
        "Iniciar sessão";


    elements.mainButton.classList.remove(
        "parar"
    );


    elements.microphoneState.textContent =
        "Microfone desligado";


    elements.microphoneState.classList.remove(
        "ativo"
    );


    clearDetectedPitch();


    updateProgressRaw(
        0
    );


    setFeedback(
        "Configure a sessão e pressione “Iniciar sessão”.",
        "neutro"
    );


    elements.message.className =
        "mensagem";


    elements.message.textContent =
        "Escolha o exercício, a dificuldade e a quantidade de rodadas.";


    updateCorrectRangeVisual();
}


/*
 * ============================================================
 * PARAR MANUALMENTE
 * ============================================================
 */

async function stopSession() {

    elements.mainButton.disabled =
        true;


    await forceStop();


    elements.configuration
        .classList
        .remove(
            "oculto"
        );


    elements.sessionStats
        .classList
        .add(
            "oculto"
        );


    resetTrainingDisplay();


    elements.message.textContent =
        "Sessão interrompida.";


    elements.mainButton.disabled =
        false;
}


async function forceStop() {

    sessionRunning =
        false;


    referencePlaying =
        false;


    advancingNote =
        false;


    advancingRound =
        false;


    holdStartTime =
        null;


    if (
        animationFrameId !==
        null
    ) {

        cancelAnimationFrame(
            animationFrameId
        );


        animationFrameId =
            null;
    }


    await microphone.stop();
}


/*
 * ============================================================
 * DESCRIÇÃO
 * ============================================================
 */

function updateExerciseDescription() {

    currentExercise =
        getExercise(
            selectedExerciseId
        );


    elements.title.textContent =
        currentExercise.title;


    elements.description.textContent =
        currentExercise.description;
}


/*
 * ============================================================
 * UTILITÁRIOS
 * ============================================================
 */

function calculateAverage(
    values
) {

    if (
        !values ||
        values.length ===
        0
    ) {

        return 0;
    }


    return (
        values.reduce(
            (sum, value) =>
                sum + value,
            0
        ) /
        values.length
    );
}


function scheduleNextFrame() {

    animationFrameId =
        requestAnimationFrame(
            processAudio
        );
}


function wait(
    milliseconds
) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                milliseconds
            )
    );
}


/*
 * ============================================================
 * SAÍDA DA PÁGINA
 * ============================================================
 */

window.addEventListener(
    "pagehide",
    () => {

        microphone.stop();

        toneGenerator.close();
    }
);


/*
 * ============================================================
 * INICIALIZAÇÃO
 * ============================================================
 */

updateExerciseDescription();

resetTrainingDisplay();