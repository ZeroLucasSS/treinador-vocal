/*
 * ============================================================
 * melody-mode.js
 * ============================================================
 *
 * MODO DE MELODIA CONTÍNUA
 *
 * Fluxo:
 *
 * escolher melodia
 *       ↓
 * ouvir referência
 *       ↓
 * contagem regressiva
 *       ↓
 * relógio musical
 *       ↓
 * piano roll se move
 *       ↓
 * microfone detecta voz
 *       ↓
 * voz é desenhada no Canvas
 *       ↓
 * comparação temporal
 *       ↓
 * pontuação final
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
    frequencyToMidiFloat,
    midiToFrequency,
    midiToNoteName,
    midiToOctave
} from "./music-theory.js";


import {
    ToneGenerator
} from "./tone-generator.js";


import {
    MELODIES,
    getMelody,
    getMelodyDuration
} from "./melodies.js";


import {
    PianoRoll
} from "./piano-roll.js";


/*
 * ============================================================
 * CONFIGURAÇÕES
 * ============================================================
 */

const MIN_RMS =
    0.01;


const MIN_PROBABILITY =
    0.70;


const SMOOTHING_WINDOW =
    5;


/*
 * Quantas vezes por segundo aproximadamente
 * armazenaremos pontos vocais.
 *
 * O detector continuará rodando em requestAnimationFrame,
 * mas não precisamos desenhar 60 pontos/s.
 */
const VOICE_POINT_INTERVAL_MS =
    45;


/*
 * Pequena tolerância temporal.
 *
 * Como a pessoa não é uma máquina, aceitamos que uma nota
 * seja avaliada ligeiramente além de suas bordas.
 */
const NOTE_TIME_MARGIN =
    0.08;


/*
 * ============================================================
 * DIFICULDADES
 * ============================================================
 */

const DIFFICULTIES = {

    beginner: {

        tolerance:
            40,

        near:
            90
    },


    intermediate: {

        tolerance:
            25,

        near:
            70
    },


    advanced: {

        tolerance:
            15,

        near:
            50
    }
};


/*
 * ============================================================
 * ELEMENTOS
 * ============================================================
 */

const elements = {

    melodySelect:
        document.getElementById(
            "seletorMelodia"
        ),

    difficultySelect:
        document.getElementById(
            "seletorDificuldade"
        ),

    listenButton:
        document.getElementById(
            "botaoOuvir"
        ),

    startButton:
        document.getElementById(
            "botaoIniciar"
        ),

    state:
        document.getElementById(
            "estado"
        ),

    microphoneState:
        document.getElementById(
            "estadoMicrofone"
        ),

    progress:
        document.getElementById(
            "progressoMusica"
        ),

    currentScore:
        document.getElementById(
            "pontuacaoAtual"
        ),

    melodyName:
        document.getElementById(
            "nomeMelodia"
        ),

    canvas:
        document.getElementById(
            "pianoRoll"
        ),

    counter:
        document.getElementById(
            "contador"
        ),

    currentTime:
        document.getElementById(
            "tempoAtual"
        ),

    totalTime:
        document.getElementById(
            "tempoTotal"
        ),

    timeBar:
        document.getElementById(
            "barraTempo"
        ),

    expectedNote:
        document.getElementById(
            "notaEsperada"
        ),

    sungNote:
        document.getElementById(
            "notaCantada"
        ),

    feedback:
        document.getElementById(
            "feedback"
        ),

    currentError:
        document.getElementById(
            "erroAtual"
        ),

    accuracy:
        document.getElementById(
            "precisao"
        ),

    evaluatedNotes:
        document.getElementById(
            "notasAvaliadas"
        ),

    result:
        document.getElementById(
            "resultado"
        ),

    finalScore:
        document.getElementById(
            "pontuacaoFinal"
        ),

    finalEvaluation:
        document.getElementById(
            "avaliacaoFinal"
        ),

    resultAccuracy:
        document.getElementById(
            "resultadoPrecisao"
        ),

    resultError:
        document.getElementById(
            "resultadoErro"
        ),

    resultNotes:
        document.getElementById(
            "resultadoNotas"
        ),

    repeatButton:
        document.getElementById(
            "botaoRepetir"
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

        minFrequency:
            70,

        maxFrequency:
            1000,

        threshold:
            0.12
    });


const toneGenerator =
    new ToneGenerator();


const pianoRoll =
    new PianoRoll(
        elements.canvas
    );


/*
 * ============================================================
 * ESTADO
 * ============================================================
 */

let selectedMelody =
    MELODIES[0];


let running =
    false;


let previewPlaying =
    false;


let animationFrameId =
    null;


let startTimestamp =
    0;


let currentSongTime =
    0;


let recentFrequencies =
    [];


let lastVoicePointTimestamp =
    0;


/*
 * Estatísticas temporais.
 *
 * Cada frame válido de voz dentro de uma nota
 * produz uma amostra.
 */
let totalSamples =
    0;


let correctSamples =
    0;


let centsSamples =
    [];


/*
 * Mantemos registro das notas que efetivamente
 * receberam voz durante seu período.
 */
let evaluatedNoteIndexes =
    new Set();


let hitNoteIndexes =
    new Set();


/*
 * ============================================================
 * INICIALIZAÇÃO
 * ============================================================
 */

populateMelodySelector();


selectMelody(
    selectedMelody.id
);


/*
 * ============================================================
 * EVENTOS
 * ============================================================
 */

elements.melodySelect.addEventListener(
    "change",
    () => {

        if (
            running ||
            previewPlaying
        ) {
            return;
        }


        selectMelody(
            elements.melodySelect.value
        );
    }
);


elements.listenButton.addEventListener(
    "click",
    async () => {

        if (
            running ||
            previewPlaying
        ) {
            return;
        }


        await previewMelody();
    }
);


elements.startButton.addEventListener(
    "click",
    async () => {

        if (
            running
        ) {

            await stopTraining();

        } else {

            await startTraining();
        }
    }
);


elements.repeatButton.addEventListener(
    "click",
    async () => {

        elements.result
            .classList
            .add(
                "oculto"
            );


        await startTraining();
    }
);


/*
 * ============================================================
 * SELETOR
 * ============================================================
 */

function populateMelodySelector() {

    elements.melodySelect.innerHTML =
        "";


    for (
        const melody of
        MELODIES
    ) {

        const option =
            document.createElement(
                "option"
            );


        option.value =
            melody.id;


        option.textContent =
            melody.name;


        elements.melodySelect.appendChild(
            option
        );
    }
}


/*
 * ============================================================
 * CARREGAR MELODIA
 * ============================================================
 */

function selectMelody(
    id
) {

    selectedMelody =
        getMelody(
            id
        );


    elements.melodyName.textContent =
        selectedMelody.name;


    const duration =
        getMelodyDuration(
            selectedMelody
        );


    elements.totalTime.textContent =
        formatTime(
            duration
        );


    elements.currentTime.textContent =
        "0:00";


    elements.progress.textContent =
        "0%";


    elements.timeBar.style.width =
        "0%";


    elements.expectedNote.textContent =
        "—";


    elements.sungNote.textContent =
        "—";


    elements.currentError.textContent =
        "—";


    elements.accuracy.textContent =
        "—";


    elements.evaluatedNotes.textContent =
        "0";


    elements.currentScore.textContent =
        "0";


    pianoRoll.setMelody(
        selectedMelody
    );


    pianoRoll.setCurrentTime(
        0
    );


    pianoRoll.clearVoice();


    setFeedback(
        selectedMelody.description,
        "neutro"
    );
}


/*
 * ============================================================
 * OUVIR MELODIA
 * ============================================================
 */

async function previewMelody() {

    previewPlaying =
        true;


    lockControls(
        true
    );


    elements.state.textContent =
        "Ouvindo";


    setFeedback(
        "Ouça a melodia com atenção.",
        "neutro"
    );


    try {

        await toneGenerator.ensureContext();


        const previewStart =
            performance.now();


        /*
         * O tone-generator existente toca sequências
         * com durações padronizadas.
         *
         * Aqui precisamos respeitar os tempos exatos
         * da nossa melodia, portanto fazemos a agenda
         * nota por nota.
         */
        const promises =
            selectedMelody.notes.map(
                note => {

                    return playScheduledNote(
                        note,
                        previewStart
                    );
                }
            );


        /*
         * Enquanto toca, fazemos o piano roll andar
         * visualmente também.
         */
        await animatePreview(
            previewStart
        );


        await Promise.all(
            promises
        );


    } catch (error) {

        console.error(
            error
        );


        setFeedback(
            "Não foi possível reproduzir a melodia.",
            "errado"
        );

    } finally {

        previewPlaying =
            false;


        lockControls(
            false
        );


        elements.state.textContent =
            "Pronto";


        pianoRoll.setCurrentTime(
            0
        );


        updateTimeInterface(
            0
        );
    }
}


/*
 * Agenda visual/sonoramente uma nota
 * em relação ao início da prévia.
 */
async function playScheduledNote(
    note,
    previewStart
) {

    const elapsed =
        performance.now() -
        previewStart;


    const waitMs =
        Math.max(
            0,
            note.start * 1000 -
            elapsed
        );


    await wait(
        waitMs
    );


    if (
        !previewPlaying
    ) {
        return;
    }


    await toneGenerator.playNote(
        note.midi,
        note.duration * 1000
    );
}


/*
 * Anima o piano roll durante a prévia.
 */
async function animatePreview(
    previewStart
) {

    const duration =
        getMelodyDuration(
            selectedMelody
        );


    return new Promise(
        resolve => {

            function frame() {

                if (
                    !previewPlaying
                ) {

                    resolve();

                    return;
                }


                const elapsed =
                    (
                        performance.now() -
                        previewStart
                    ) /
                    1000;


                pianoRoll.setCurrentTime(
                    elapsed
                );


                updateTimeInterface(
                    elapsed
                );


                if (
                    elapsed >=
                    duration
                ) {

                    resolve();

                    return;
                }


                requestAnimationFrame(
                    frame
                );
            }


            frame();
        }
    );
}


/*
 * ============================================================
 * INICIAR TREINO
 * ============================================================
 */

async function startTraining() {

    elements.result
        .classList
        .add(
            "oculto"
        );


    lockControls(
        true
    );


    elements.startButton.disabled =
        true;


    try {

        await toneGenerator.ensureContext();


        await microphone.start();


        elements.microphoneState.textContent =
            "Ativo";


        resetStatistics();


        pianoRoll.setMelody(
            selectedMelody
        );


        pianoRoll.clearVoice();


        elements.state.textContent =
            "Preparando";


        /*
         * Contagem regressiva.
         */
        await countdown();


        running =
            true;


        startTimestamp =
            performance.now();


        currentSongTime =
            0;


        elements.startButton.disabled =
            false;


        elements.startButton.textContent =
            "Interromper treino";


        elements.startButton.classList.add(
            "parar"
        );


        elements.state.textContent =
            "Cantando";


        setFeedback(
            "Acompanhe as barras e cante.",
            "neutro"
        );


        processFrame();


    } catch (error) {

        console.error(
            error
        );


        setFeedback(
            error.name === "NotAllowedError"
                ? "Permissão do microfone negada."
                : `Não foi possível iniciar: ${error.message}`,
            "errado"
        );


        await stopTraining();


    } finally {

        if (
            !running
        ) {

            elements.startButton.disabled =
                false;


            lockControls(
                false
            );
        }
    }
}


/*
 * ============================================================
 * CONTAGEM REGRESSIVA
 * ============================================================
 */

async function countdown() {

    elements.counter
        .classList
        .remove(
            "oculto"
        );


    for (
        const value of
        [3, 2, 1]
    ) {

        elements.counter.textContent =
            value;


        await wait(
            700
        );
    }


    elements.counter.textContent =
        "♪";


    await wait(
        400
    );


    elements.counter
        .classList
        .add(
            "oculto"
        );
}


/*
 * ============================================================
 * LOOP PRINCIPAL
 * ============================================================
 */

function processFrame() {

    if (
        !running
    ) {
        return;
    }


    const now =
        performance.now();


    currentSongTime =
        (
            now -
            startTimestamp
        ) /
        1000;


    const duration =
        getMelodyDuration(
            selectedMelody
        );


    /*
     * Atualiza deslocamento do piano roll.
     */
    pianoRoll.setCurrentTime(
        currentSongTime
    );


    updateTimeInterface(
        currentSongTime
    );


    /*
     * Final da música.
     */
    if (
        currentSongTime >=
        duration
    ) {

        finishTraining();

        return;
    }


    processMicrophone(
        now
    );


    animationFrameId =
        requestAnimationFrame(
            processFrame
        );
}


/*
 * ============================================================
 * MICROFONE
 * ============================================================
 */

function processMicrophone(
    timestamp
) {

    const buffer =
        microphone.getTimeDomainData();


    if (
        !buffer
    ) {
        return;
    }


    const rms =
        microphone.calculateRms(
            buffer
        );


    if (
        rms <
        MIN_RMS
    ) {

        elements.sungNote.textContent =
            "—";


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

        return;
    }


    const frequency =
        smoothFrequency(
            detection.frequency
        );


    if (
        !frequency
    ) {
        return;
    }


    const midiFloat =
        frequencyToMidiFloat(
            frequency
        );


    if (
        midiFloat ===
        null
    ) {
        return;
    }


    /*
     * Não precisamos guardar 60 pontos por segundo.
     */
    if (
        timestamp -
        lastVoicePointTimestamp >=
        VOICE_POINT_INTERVAL_MS
    ) {

        pianoRoll.addVoicePoint(
            currentSongTime,
            midiFloat
        );


        lastVoicePointTimestamp =
            timestamp;
    }


    updateSungNote(
        midiFloat
    );


    evaluateCurrentPitch(
        frequency
    );
}


/*
 * ============================================================
 * AVALIAÇÃO TEMPORAL
 * ============================================================
 */

function evaluateCurrentPitch(
    frequency
) {

    const noteInfo =
        getActiveTargetNote(
            currentSongTime
        );


    /*
     * Estamos num espaço entre notas.
     *
     * Não penalizamos silêncio ou voz fora desse período
     * nesta primeira implementação.
     */
    if (
        !noteInfo
    ) {

        elements.expectedNote.textContent =
            "—";


        elements.currentError.textContent =
            "—";


        setFeedback(
            "Aguarde a próxima nota...",
            "neutro"
        );


        return;
    }


    const {
        note,
        index
    } =
        noteInfo;


    elements.expectedNote.textContent =
        formatMidi(
            note.midi
        );


    evaluatedNoteIndexes.add(
        index
    );


    const targetFrequency =
        midiToFrequency(
            note.midi
        );


    const cents =
        1200 *
        Math.log2(
            frequency /
            targetFrequency
        );


    const absCents =
        Math.abs(
            cents
        );


    const difficulty =
        DIFFICULTIES[
            elements.difficultySelect.value
        ];


    totalSamples++;


    centsSamples.push(
        absCents
    );


    const rounded =
        Math.round(
            cents
        );


    const sign =
        rounded > 0
            ? "+"
            : "";


    elements.currentError.textContent =
        `${sign}${rounded} cents`;


    /*
     * CORRETO
     */
    if (
        absCents <=
        difficulty.tolerance
    ) {

        correctSamples++;


        hitNoteIndexes.add(
            index
        );


        setFeedback(
            "Afinado!",
            "correto"
        );

    } else if (
        absCents <=
        difficulty.near
    ) {

        if (
            cents <
            0
        ) {

            setFeedback(
                "Quase — suba um pouco.",
                "proximo"
            );

        } else {

            setFeedback(
                "Quase — desça um pouco.",
                "proximo"
            );
        }

    } else {

        if (
            cents <
            0
        ) {

            setFeedback(
                "Abaixo da nota — suba a voz.",
                "errado"
            );

        } else {

            setFeedback(
                "Acima da nota — desça a voz.",
                "errado"
            );
        }
    }


    updateLiveStatistics();
}


/*
 * ============================================================
 * NOTA ATIVA NO TEMPO ATUAL
 * ============================================================
 */

function getActiveTargetNote(
    time
) {

    for (
        let index = 0;
        index <
        selectedMelody.notes.length;
        index++
    ) {

        const note =
            selectedMelody.notes[
                index
            ];


        const start =
            note.start -
            NOTE_TIME_MARGIN;


        const end =
            note.start +
            note.duration +
            NOTE_TIME_MARGIN;


        if (
            time >= start &&
            time <= end
        ) {

            return {
                note,
                index
            };
        }
    }


    return null;
}


/*
 * ============================================================
 * NOTA CANTADA
 * ============================================================
 */

function updateSungNote(
    midiFloat
) {

    const nearestMidi =
        Math.round(
            midiFloat
        );


    elements.sungNote.textContent =
        formatMidi(
            nearestMidi
        );
}


/*
 * ============================================================
 * ESTATÍSTICAS
 * ============================================================
 */

function updateLiveStatistics() {

    const precision =
        totalSamples > 0
            ? (
                correctSamples /
                totalSamples
            ) * 100
            : 0;


    /*
     * A pontuação em tempo real considera
     * principalmente a proporção de frames corretos.
     */
    const score =
        Math.round(
            precision
        );


    elements.accuracy.textContent =
        `${precision.toFixed(0)}%`;


    elements.currentScore.textContent =
        score;


    elements.evaluatedNotes.textContent =
        evaluatedNoteIndexes.size;
}


/*
 * ============================================================
 * TEMPO
 * ============================================================
 */

function updateTimeInterface(
    time
) {

    const duration =
        getMelodyDuration(
            selectedMelody
        );


    const limited =
        Math.max(
            0,
            Math.min(
                duration,
                time
            )
        );


    const ratio =
        duration > 0
            ? limited /
                duration
            : 0;


    const percentage =
        Math.round(
            ratio *
            100
        );


    elements.currentTime.textContent =
        formatTime(
            limited
        );


    elements.progress.textContent =
        `${percentage}%`;


    elements.timeBar.style.width =
        `${percentage}%`;
}


/*
 * ============================================================
 * FINALIZAR
 * ============================================================
 */

async function finishTraining() {

    if (
        !running
    ) {
        return;
    }


    running =
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
        "Desligado";


    elements.state.textContent =
        "Concluído";


    elements.startButton.textContent =
        "Iniciar treino";


    elements.startButton.classList.remove(
        "parar"
    );


    lockControls(
        false
    );


    updateTimeInterface(
        getMelodyDuration(
            selectedMelody
        )
    );


    showResults();
}


/*
 * ============================================================
 * INTERROMPER
 * ============================================================
 */

async function stopTraining() {

    running =
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
        "Desligado";


    elements.state.textContent =
        "Pronto";


    elements.startButton.textContent =
        "Iniciar treino";


    elements.startButton.classList.remove(
        "parar"
    );


    elements.startButton.disabled =
        false;


    lockControls(
        false
    );


    setFeedback(
        "Treino interrompido.",
        "neutro"
    );
}


/*
 * ============================================================
 * RESULTADO FINAL
 * ============================================================
 */

function showResults() {

    const sampleAccuracy =
        totalSamples > 0
            ? (
                correctSamples /
                totalSamples
            ) * 100
            : 0;


    const totalNotes =
        selectedMelody.notes.length;


    const noteAccuracy =
        totalNotes > 0
            ? (
                hitNoteIndexes.size /
                totalNotes
            ) * 100
            : 0;


    /*
     * Pontuação combinada:
     *
     * 70% = precisão durante o tempo cantado
     * 30% = quantas notas da melodia foram atingidas
     */
    const score =
        Math.round(
            sampleAccuracy *
                0.70 +
            noteAccuracy *
                0.30
        );


    const averageError =
        calculateAverage(
            centsSamples
        );


    elements.finalScore.textContent =
        score;


    elements.resultAccuracy.textContent =
        `${sampleAccuracy.toFixed(0)}%`;


    elements.resultError.textContent =
        centsSamples.length
            ? `${averageError.toFixed(1)} cents`
            : "—";


    elements.resultNotes.textContent =
        `${hitNoteIndexes.size} / ${totalNotes}`;


    elements.finalEvaluation.textContent =
        getFinalEvaluation(
            score
        );


    elements.result
        .classList
        .remove(
            "oculto"
        );


    setFeedback(
        "Melodia concluída!",
        "correto"
    );


    setTimeout(
        () => {

            elements.result.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

        },
        150
    );
}


/*
 * ============================================================
 * RESET DAS ESTATÍSTICAS
 * ============================================================
 */

function resetStatistics() {

    totalSamples =
        0;


    correctSamples =
        0;


    centsSamples =
        [];


    evaluatedNoteIndexes =
        new Set();


    hitNoteIndexes =
        new Set();


    recentFrequencies =
        [];


    lastVoicePointTimestamp =
        0;


    elements.currentScore.textContent =
        "0";


    elements.accuracy.textContent =
        "—";


    elements.evaluatedNotes.textContent =
        "0";


    elements.expectedNote.textContent =
        "—";


    elements.sungNote.textContent =
        "—";


    elements.currentError.textContent =
        "—";


    updateTimeInterface(
        0
    );
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
        frequency <= 0
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
 * CONTROLES
 * ============================================================
 */

function lockControls(
    locked
) {

    elements.melodySelect.disabled =
        locked;


    elements.difficultySelect.disabled =
        locked;


    elements.listenButton.disabled =
        locked;
}


/*
 * ============================================================
 * FEEDBACK
 * ============================================================
 */

function setFeedback(
    text,
    type
) {

    elements.feedback.textContent =
        text;


    elements.feedback.className =
        `feedback ${type}`;
}


/*
 * ============================================================
 * FORMATAÇÕES
 * ============================================================
 */

function formatMidi(
    midi
) {

    return (
        midiToNoteName(
            midi
        ) +
        midiToOctave(
            midi
        )
    );
}


function formatTime(
    seconds
) {

    const safe =
        Math.max(
            0,
            seconds
        );


    const minutes =
        Math.floor(
            safe /
            60
        );


    const remainingSeconds =
        Math.floor(
            safe %
            60
        );


    return (
        `${minutes}:` +
        String(
            remainingSeconds
        ).padStart(
            2,
            "0"
        )
    );
}


function calculateAverage(
    values
) {

    if (
        !values.length
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


function getFinalEvaluation(
    score
) {

    if (
        score >= 95
    ) {

        return (
            "Excelente. Você acompanhou a melodia com grande precisão de altura e tempo."
        );
    }


    if (
        score >= 85
    ) {

        return (
            "Muito bom. A maior parte da melodia foi cantada com boa afinação."
        );
    }


    if (
        score >= 70
    ) {

        return (
            "Bom resultado. Repita a melodia tentando permanecer mais tempo dentro das barras."
        );
    }


    if (
        score >= 50
    ) {

        return (
            "Você conseguiu acompanhar parte da melodia. Use a prévia sonora e observe principalmente as mudanças de altura."
        );
    }


    return (
        "Esta melodia ainda está exigente. Ouça novamente a referência e tente acompanhar primeiro o desenho das notas."
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
 * LIMPEZA
 * ============================================================
 */

window.addEventListener(
    "pagehide",
    () => {

        running =
            false;


        previewPlaying =
            false;


        microphone.stop();


        toneGenerator.close();


        pianoRoll.destroy();
    }
);