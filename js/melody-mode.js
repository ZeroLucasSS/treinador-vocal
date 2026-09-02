/*
 * ============================================================
 * melody-mode.js
 * ============================================================
 *
 * MIDI VOCAL + BACKING TRACK
 *
 * Música-base:
 *
 * "Ninguém te ama como Eu"
 *
 * MP3:
 *
 * ./assets/audio/
 * ninguem-te-ama-como-eu-instrumental.mp3
 *
 * MIDI:
 *
 * ./assets/midi/
 * ninguem-te-ama-como-eu-voz.mid
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
    PianoRoll
} from "./piano-roll.js";


import {
    loadMidiFromUrl,
    chooseBestMelodyTrack
} from "./midi-loader.js";


/*
 * ============================================================
 * ARQUIVOS
 * ============================================================
 */

const MIDI_URL =
    "./assets/midi/ninguem-te-ama-como-eu-voz.mid";


/*
 * 4:37
 */
const EXPECTED_DURATION =
    277;


/*
 * Aceitamos pequena diferença
 * entre metadados dos arquivos.
 */
const DURATION_WARNING_TOLERANCE =
    5;


/*
 * ============================================================
 * ÁUDIO / DETECÇÃO
 * ============================================================
 */

const MIN_RMS =
    0.01;


const MIN_PROBABILITY =
    0.70;


const SMOOTHING_WINDOW =
    5;


const VOICE_POINT_INTERVAL_MS =
    45;


const MAX_VOICED_SAMPLE_GAP =
    0.15;


/*
 * ============================================================
 * AVALIAÇÃO TEMPORAL
 * ============================================================
 */

const NOTE_TIME_MARGIN =
    0.12;


const EXCELLENT_ONSET_MS =
    120;


const ACCEPTABLE_ONSET_MS =
    300;


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
 * DOM
 * ============================================================
 */

const elements = {

    trackSelect:
        document.getElementById(
            "seletorTrilhaMidi"
        ),

    difficultySelect:
        document.getElementById(
            "seletorDificuldade"
        ),

    melodyListenButton:
        document.getElementById(
            "botaoOuvir"
        ),

    backingListenButton:
        document.getElementById(
            "botaoOuvirInstrumental"
        ),

    startButton:
        document.getElementById(
            "botaoIniciar"
        ),

    headphoneConfirmation:
        document.getElementById(
            "confirmarFones"
        ),

    backingAudio:
        document.getElementById(
            "backingTrackAudio"
        ),

    backingFileStatus:
        document.getElementById(
            "statusBackingTrack"
        ),

    midiStatus:
        document.getElementById(
            "statusMidi"
        ),

    state:
        document.getElementById(
            "estado"
        ),

    microphoneState:
        document.getElementById(
            "estadoMicrofone"
        ),

    backingState:
        document.getElementById(
            "estadoBacking"
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

    currentOnset:
        document.getElementById(
            "entradaAtual"
        ),

    currentCoverage:
        document.getElementById(
            "coberturaAtual"
        ),

    currentNoteScore:
        document.getElementById(
            "pontuacaoNotaAtual"
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

    resultOnset:
        document.getElementById(
            "resultadoEntrada"
        ),

    resultCoverage:
        document.getElementById(
            "resultadoCobertura"
        ),

    resultMissed:
        document.getElementById(
            "resultadoOmitidas"
        ),

    noteResultsList:
        document.getElementById(
            "listaResultadosNotas"
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
 * ESTADO GLOBAL
 * ============================================================
 */

let midiData =
    null;


let selectedTrack =
    null;


/*
 * Formato compreendido pelo piano roll:
 *
 * {
 *     id,
 *     name,
 *     description,
 *     notes
 * }
 */
let selectedMelody =
    null;


let noteStates =
    [];


let running =
    false;


let countdownRunning =
    false;


let backingPreviewPlaying =
    false;


let melodyPreviewPlaying =
    false;


let animationFrameId =
    null;


let previewAnimationFrameId =
    null;


let melodyPreviewTimers =
    [];


let currentSongTime =
    0;


let recentFrequencies =
    [];


let lastVoicePointTimestamp =
    0;


/*
 * ============================================================
 * INICIALIZAÇÃO
 * ============================================================
 */

initialize();


async function initialize() {

    elements.state.textContent =
        "Carregando";


    setupBackingTrack();


    try {

        await loadVocalMidi();


    } catch (error) {

        console.error(
            "Erro ao carregar MIDI:",
            error
        );


        elements.midiStatus.textContent =
            "Erro ao carregar";


        elements.melodyName.textContent =
            "MIDI não disponível";


        setFeedback(
            `Não foi possível carregar o MIDI vocal: ${error.message}`,
            "errado"
        );


        elements.startButton.disabled =
            true;


        elements.melodyListenButton.disabled =
            true;
    }
}


/*
 * ============================================================
 * BACKING TRACK
 * ============================================================
 */

function setupBackingTrack() {

    elements.backingAudio.addEventListener(
        "loadedmetadata",
        () => {

            const duration =
                elements.backingAudio.duration;


            elements.totalTime.textContent =
                formatTime(
                    duration
                );


            const difference =
                Math.abs(
                    duration -
                    EXPECTED_DURATION
                );


            if (
                difference <=
                DURATION_WARNING_TOLERANCE
            ) {

                elements.backingFileStatus.textContent =
                    `Pronto — ${formatTime(duration)}`;

            } else {

                elements.backingFileStatus.textContent =
                    `Pronto — ${formatTime(duration)} ⚠`;
            }


            checkFilesReady();
        }
    );


    elements.backingAudio.addEventListener(
        "error",
        () => {

            elements.backingFileStatus.textContent =
                "Arquivo não encontrado";


            elements.startButton.disabled =
                true;


            setFeedback(
                "Não foi possível carregar o instrumental MP3.",
                "errado"
            );
        }
    );


    elements.backingAudio.load();
}


/*
 * ============================================================
 * CARREGAR MIDI VOCAL
 * ============================================================
 */

async function loadVocalMidi() {

    elements.midiStatus.textContent =
        "Lendo arquivo...";


    midiData =
        await loadMidiFromUrl(
            MIDI_URL
        );


    const playableTracks =
        midiData.tracks.filter(
            track =>
                track.noteCount >
                0
        );


    if (
        playableTracks.length ===
        0
    ) {

        throw new Error(
            "Nenhuma nota foi encontrada no arquivo MIDI."
        );
    }


    populateTrackSelector(
        playableTracks
    );


    const bestTrack =
        chooseBestMelodyTrack(
            midiData
        );


    if (!bestTrack) {

        throw new Error(
            "Não foi possível escolher uma trilha melódica."
        );
    }


    elements.trackSelect.value =
        String(
            bestTrack.index
        );


    selectMidiTrack(
        bestTrack.index
    );


    elements.trackSelect.disabled =
        false;


    elements.melodyListenButton.disabled =
        false;


    const totalNotes =
        playableTracks.reduce(
            (
                sum,
                track
            ) =>
                sum +
                track.noteCount,
            0
        );


    elements.midiStatus.textContent =
        `${playableTracks.length} trilha(s), ${totalNotes} notas`;


    checkFilesReady();
}


/*
 * ============================================================
 * POPULAR SELETOR DE TRILHAS
 * ============================================================
 */

function populateTrackSelector(
    tracks
) {

    elements.trackSelect.innerHTML =
        "";


    tracks.forEach(
        track => {

            const option =
                document.createElement(
                    "option"
                );


            option.value =
                String(
                    track.index
                );


            let label =
                track.name;


            label +=
                ` — ${track.noteCount} notas`;


            if (
                track.polyphonic
            ) {

                label +=
                    " — polifônica";
            }


            option.textContent =
                label;


            elements.trackSelect.appendChild(
                option
            );
        }
    );
}


/*
 * ============================================================
 * SELECIONAR TRILHA MIDI
 * ============================================================
 */

function selectMidiTrack(
    trackIndex
) {

    const numericIndex =
        Number(
            trackIndex
        );


    selectedTrack =
        midiData.tracks.find(
            track =>
                track.index ===
                numericIndex
        );


    if (!selectedTrack) {

        throw new Error(
            "Trilha MIDI não encontrada."
        );
    }


    selectedMelody = {

        id:
            `midi-track-${selectedTrack.index}`,

        name:
            selectedTrack.name,

        description:
            buildTrackDescription(
                selectedTrack
            ),

        notes:
            selectedTrack.notes.map(
                note => ({

                    midi:
                        note.midi,

                    start:
                        note.start,

                    duration:
                        note.duration
                })
            )
    };


    resetInterfaceStatistics();


    pianoRoll.setMelody(
        selectedMelody
    );


    pianoRoll.setCurrentTime(
        0
    );


    pianoRoll.clearVoice();


    pianoRoll.clearNoteResults();


    elements.melodyName.textContent =
        selectedTrack.name;


    setFeedback(
        buildTrackDescription(
            selectedTrack
        ),
        selectedTrack.polyphonic
            ? "proximo"
            : "neutro"
    );
}


/*
 * ============================================================
 * DESCRIÇÃO DA TRILHA
 * ============================================================
 */

function buildTrackDescription(
    track
) {

    const minNote =
        track.minMidi !==
        null
            ? formatMidi(
                track.minMidi
            )
            : "—";


    const maxNote =
        track.maxMidi !==
        null
            ? formatMidi(
                track.maxMidi
            )
            : "—";


    const mode =
        track.polyphonic
            ? "polifônica"
            : "monofônica";


    return (
        `${track.noteCount} notas · ` +
        `${formatTime(track.duration)} · ` +
        `${minNote} a ${maxNote} · ` +
        mode
    );
}


/*
 * ============================================================
 * ARQUIVOS PRONTOS
 * ============================================================
 */

function checkFilesReady() {

    const mp3Ready =
        Number.isFinite(
            elements.backingAudio.duration
        ) &&
        elements.backingAudio.duration >
            0;


    const midiReady =
        selectedMelody !==
        null &&
        selectedMelody.notes.length >
            0;


    if (
        mp3Ready &&
        midiReady
    ) {

        elements.startButton.disabled =
            false;


        elements.state.textContent =
            "Pronto";


        setFeedback(
            "MIDI vocal e instrumental carregados. Confira a trilha selecionada e use fones de ouvido.",
            "neutro"
        );
    }
}


/*
 * ============================================================
 * EVENTOS
 * ============================================================
 */

elements.trackSelect.addEventListener(
    "change",
    () => {

        if (
            running ||
            countdownRunning ||
            backingPreviewPlaying ||
            melodyPreviewPlaying
        ) {

            return;
        }


        selectMidiTrack(
            Number(
                elements.trackSelect.value
            )
        );
    }
);


elements.melodyListenButton.addEventListener(
    "click",
    async () => {

        if (
            running ||
            countdownRunning ||
            backingPreviewPlaying
        ) {

            return;
        }


        if (
            melodyPreviewPlaying
        ) {

            stopMelodyPreview();

        } else {

            await startMelodyPreview();
        }
    }
);


elements.backingListenButton.addEventListener(
    "click",
    async () => {

        if (
            running ||
            countdownRunning ||
            melodyPreviewPlaying
        ) {

            return;
        }


        if (
            backingPreviewPlaying
        ) {

            stopBackingPreview();

        } else {

            await startBackingPreview();
        }
    }
);


elements.startButton.addEventListener(
    "click",
    async () => {

        if (
            running ||
            countdownRunning
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
 * PRÉVIA DO INSTRUMENTAL
 * ============================================================
 */

async function startBackingPreview() {

    if (
        !Number.isFinite(
            elements.backingAudio.duration
        )
    ) {

        return;
    }


    backingPreviewPlaying =
        true;


    lockControls(
        true
    );


    elements.backingListenButton.disabled =
        false;


    elements.backingListenButton.textContent =
        "⏹ Parar instrumental";


    elements.state.textContent =
        "Ouvindo instrumental";


    elements.backingState.textContent =
        "Tocando";


    elements.backingAudio.currentTime =
        0;


    pianoRoll.setCurrentTime(
        0
    );


    try {

        await elements.backingAudio.play();


        animateBackingPreview();


    } catch (error) {

        console.error(
            error
        );


        stopBackingPreview();


        setFeedback(
            "Não foi possível reproduzir o instrumental.",
            "errado"
        );
    }
}


function animateBackingPreview() {

    if (
        !backingPreviewPlaying
    ) {

        return;
    }


    currentSongTime =
        elements.backingAudio.currentTime;


    pianoRoll.setCurrentTime(
        currentSongTime
    );


    updateTimeInterface(
        currentSongTime
    );


    updateExpectedNoteInterface(
        currentSongTime
    );


    if (
        elements.backingAudio.ended
    ) {

        stopBackingPreview();

        return;
    }


    previewAnimationFrameId =
        requestAnimationFrame(
            animateBackingPreview
        );
}


function stopBackingPreview() {

    backingPreviewPlaying =
        false;


    elements.backingAudio.pause();


    elements.backingAudio.currentTime =
        0;


    if (
        previewAnimationFrameId !==
        null
    ) {

        cancelAnimationFrame(
            previewAnimationFrameId
        );


        previewAnimationFrameId =
            null;
    }


    elements.backingListenButton.textContent =
        "🎧 Ouvir instrumental";


    elements.state.textContent =
        "Pronto";


    elements.backingState.textContent =
        "Parado";


    lockControls(
        false
    );


    pianoRoll.setCurrentTime(
        0
    );


    updateTimeInterface(
        0
    );


    updateExpectedNoteInterface(
        0
    );
}


/*
 * ============================================================
 * PRÉVIA DA MELODIA MIDI
 * ============================================================
 *
 * Diferentemente da versão anterior,
 * respeitamos start e duration reais.
 * ============================================================
 */

async function startMelodyPreview() {

    if (
        !selectedMelody
    ) {

        return;
    }


    melodyPreviewPlaying =
        true;


    lockControls(
        true
    );


    elements.melodyListenButton.disabled =
        false;


    elements.melodyListenButton.textContent =
        "⏹ Parar melodia";


    elements.state.textContent =
        "Ouvindo MIDI";


    pianoRoll.setCurrentTime(
        0
    );


    updateTimeInterface(
        0
    );


    try {

        await toneGenerator.ensureContext();


        const previewStart =
            performance.now();


        /*
         * Agenda visual.
         */
        animateMelodyPreview(
            previewStart
        );


        /*
         * Agenda notas.
         */
        selectedMelody.notes.forEach(
            note => {

                const timer =
                    setTimeout(
                        () => {

                            if (
                                !melodyPreviewPlaying
                            ) {

                                return;
                            }


                            toneGenerator.playNote(
                                note.midi,
                                Math.max(
                                    30,
                                    note.duration *
                                        1000
                                )
                            );

                        },
                        Math.max(
                            0,
                            note.start *
                                1000
                        )
                    );


                melodyPreviewTimers.push(
                    timer
                );
            }
        );


    } catch (error) {

        console.error(
            error
        );


        stopMelodyPreview();


        setFeedback(
            "Não foi possível reproduzir a melodia MIDI.",
            "errado"
        );
    }
}


function animateMelodyPreview(
    previewStart
) {

    if (
        !melodyPreviewPlaying
    ) {

        return;
    }


    currentSongTime =
        (
            performance.now() -
            previewStart
        ) /
        1000;


    pianoRoll.setCurrentTime(
        currentSongTime
    );


    updateTimeInterface(
        currentSongTime
    );


    updateExpectedNoteInterface(
        currentSongTime
    );


    if (
        currentSongTime >=
        selectedTrack.duration
    ) {

        stopMelodyPreview();

        return;
    }


    previewAnimationFrameId =
        requestAnimationFrame(
            () =>
                animateMelodyPreview(
                    previewStart
                )
        );
}


function stopMelodyPreview() {

    melodyPreviewPlaying =
        false;


    melodyPreviewTimers.forEach(
        timer =>
            clearTimeout(
                timer
            )
    );


    melodyPreviewTimers =
        [];


    if (
        previewAnimationFrameId !==
        null
    ) {

        cancelAnimationFrame(
            previewAnimationFrameId
        );


        previewAnimationFrameId =
            null;
    }


    elements.melodyListenButton.textContent =
        "🔊 Ouvir melodia MIDI";


    elements.state.textContent =
        "Pronto";


    lockControls(
        false
    );


    pianoRoll.setCurrentTime(
        0
    );


    updateTimeInterface(
        0
    );


    updateExpectedNoteInterface(
        0
    );
}


/*
 * ============================================================
 * ESTADOS DAS NOTAS
 * ============================================================
 */

function createNoteStates() {

    noteStates =
        selectedMelody.notes.map(
            (
                note,
                index
            ) => ({

                index,

                midi:
                    note.midi,

                expectedStart:
                    note.start,

                expectedEnd:
                    note.start +
                    note.duration,

                expectedDuration:
                    note.duration,

                firstVoiceTime:
                    null,

                onsetErrorMs:
                    null,

                lastVoiceTime:
                    null,

                lastSampleTime:
                    null,

                voiceSamples:
                    0,

                correctSamples:
                    0,

                nearSamples:
                    0,

                centsValues:
                    [],

                voicedTime:
                    0,

                finalized:
                    false,

                status:
                    "pending",

                score:
                    0,

                averageCents:
                    null,

                coverage:
                    0,

                pitchScore:
                    0,

                timingScore:
                    0,

                durationScore:
                    0
            })
        );
}


/*
 * ============================================================
 * INICIAR TREINO
 * ============================================================
 */

async function startTraining() {

    if (
        !selectedMelody
    ) {

        setFeedback(
            "A melodia MIDI ainda não foi carregada.",
            "errado"
        );


        return;
    }


    if (
        !elements.headphoneConfirmation.checked
    ) {

        setFeedback(
            "Confirme que está usando fones de ouvido antes de iniciar.",
            "proximo"
        );


        return;
    }


    if (
        running ||
        countdownRunning
    ) {

        return;
    }


    stopBackingPreview();


    stopMelodyPreview();


    elements.result
        .classList
        .add(
            "oculto"
        );


    elements.startButton.textContent =
        "Interromper treino";


    elements.startButton
        .classList
        .add(
            "parar"
        );


    lockControls(
        true
    );


    /*
     * Botão principal permanece disponível.
     */
    elements.startButton.disabled =
        false;


    try {

        await microphone.start();


        /*
         * IMPORTANTE:
         *
         * primeiro limpa.
         * depois cria estados.
         */
        resetInterfaceStatistics();


        createNoteStates();


        pianoRoll.setMelody(
            selectedMelody
        );


        pianoRoll.clearVoice();


        pianoRoll.clearNoteResults();


        elements.microphoneState.textContent =
            "Ativo";


        elements.backingState.textContent =
            "Aguardando";


        elements.state.textContent =
            "Preparando";


        countdownRunning =
            true;


        const completed =
            await countdown();


        countdownRunning =
            false;


        if (
            !completed
        ) {

            return;
        }


        /*
         * ====================================================
         * MP3 = RELÓGIO MESTRE
         * ====================================================
         */

        elements.backingAudio.pause();


        elements.backingAudio.currentTime =
            0;


        await elements.backingAudio.play();


        running =
            true;


        currentSongTime =
            0;


        elements.state.textContent =
            "Cantando";


        elements.backingState.textContent =
            "Tocando";


        setFeedback(
            "Acompanhe o instrumental e a melodia MIDI.",
            "neutro"
        );


        processFrame();


    } catch (error) {

        console.error(
            error
        );


        setFeedback(
            error.name ===
                "NotAllowedError"
                ? "A permissão do microfone foi negada."
                : `Não foi possível iniciar: ${error.message}`,
            "errado"
        );


        await stopTraining();
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


    try {

        for (
            const value of
            [3, 2, 1]
        ) {

            if (
                !countdownRunning
            ) {

                return false;
            }


            elements.counter.textContent =
                value;


            await wait(
                700
            );
        }


        if (
            !countdownRunning
        ) {

            return false;
        }


        elements.counter.textContent =
            "♪";


        await wait(
            400
        );


        return (
            countdownRunning
        );


    } finally {

        elements.counter
            .classList
            .add(
                "oculto"
            );
    }
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


    /*
     * ========================================================
     * O MP3 É O RELÓGIO MESTRE
     * ========================================================
     */

    currentSongTime =
        elements.backingAudio.currentTime;


    pianoRoll.setCurrentTime(
        currentSongTime
    );


    updateTimeInterface(
        currentSongTime
    );


    updateExpectedNoteInterface(
        currentSongTime
    );


    finalizeExpiredNotes(
        currentSongTime
    );


    processMicrophone(
        performance.now()
    );


    if (
        elements.backingAudio.ended
    ) {

        finishTraining();

        return;
    }


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


    if (!buffer) {

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

        elements.sungNote.textContent =
            "—";


        return;
    }


    const frequency =
        smoothFrequency(
            detection.frequency
        );


    if (!frequency) {

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


    evaluateVoiceSample(
        frequency,
        currentSongTime
    );
}


/*
 * ============================================================
 * ALVO ATIVO
 * ============================================================
 */

function getEvaluationTarget(
    time
) {

    /*
     * Para uma trilha vocal monofônica,
     * esta busca retorna uma nota.
     *
     * Se a trilha for polifônica,
     * usa a primeira nota ativa.
     */
    for (
        let index =
            0;
        index <
            selectedMelody.notes.length;
        index++
    ) {

        const note =
            selectedMelody.notes[
                index
            ];


        const end =
            note.start +
            note.duration;


        if (
            time >=
                note.start &&
            time <
                end
        ) {

            return {

                note,

                index
            };
        }


        /*
         * Como notas estão ordenadas,
         * podemos parar quando já passamos
         * do tempo procurado.
         */
        if (
            note.start >
            time
        ) {

            break;
        }
    }


    return null;
}


/*
 * ============================================================
 * AVALIAÇÃO VOCAL
 * ============================================================
 */

function evaluateVoiceSample(
    frequency,
    time
) {

    const target =
        getEvaluationTarget(
            time
        );


    if (!target) {

        elements.currentError.textContent =
            "—";


        elements.currentOnset.textContent =
            "—";


        elements.currentCoverage.textContent =
            "—";


        elements.currentNoteScore.textContent =
            "—";


        return;
    }


    const state =
        noteStates[
            target.index
        ];


    if (
        !state ||
        state.finalized
    ) {

        return;
    }


    const difficulty =
        getCurrentDifficulty();


    const targetFrequency =
        midiToFrequency(
            target.note.midi
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


    /*
     * --------------------------------------------------------
     * ENTRADA
     * --------------------------------------------------------
     */

    if (
        state.firstVoiceTime ===
        null
    ) {

        state.firstVoiceTime =
            time;


        state.onsetErrorMs =
            (
                time -
                target.note.start
            ) *
            1000;
    }


    /*
     * --------------------------------------------------------
     * COBERTURA
     * --------------------------------------------------------
     */

    if (
        state.lastSampleTime !==
        null
    ) {

        const delta =
            time -
            state.lastSampleTime;


        if (
            delta >
                0 &&
            delta <=
                MAX_VOICED_SAMPLE_GAP
        ) {

            const intervalStart =
                Math.max(
                    state.lastSampleTime,
                    state.expectedStart
                );


            const intervalEnd =
                Math.min(
                    time,
                    state.expectedEnd
                );


            const validDelta =
                intervalEnd -
                intervalStart;


            if (
                validDelta >
                0
            ) {

                state.voicedTime +=
                    validDelta;
            }
        }
    }


    state.lastSampleTime =
        time;


    state.lastVoiceTime =
        time;


    state.voiceSamples++;


    state.centsValues.push(
        absCents
    );


    if (
        absCents <=
        difficulty.tolerance
    ) {

        state.correctSamples++;

    } else if (
        absCents <=
        difficulty.near
    ) {

        state.nearSamples++;
    }


    /*
     * --------------------------------------------------------
     * INTERFACE
     * --------------------------------------------------------
     */

    const rounded =
        Math.round(
            cents
        );


    elements.currentError.textContent =
        `${rounded > 0 ? "+" : ""}${rounded} cents`;


    elements.currentOnset.textContent =
        formatSignedMilliseconds(
            state.onsetErrorMs
        );


    const coverage =
        calculateCoverage(
            state
        );


    elements.currentCoverage.textContent =
        `${Math.round(
            coverage *
            100
        )}%`;


    const scores =
        calculateNoteScores(
            state
        );


    elements.currentNoteScore.textContent =
        scores.totalScore;


    elements.accuracy.textContent =
        `${scores.pitchScore}%`;


    /*
     * --------------------------------------------------------
     * FEEDBACK
     * --------------------------------------------------------
     */

    if (
        absCents <=
        difficulty.tolerance
    ) {

        setFeedback(
            "Afinado!",
            "correto"
        );

    } else if (
        absCents <=
        difficulty.near
    ) {

        setFeedback(
            cents <
                0
                ? "Quase — suba um pouco."
                : "Quase — desça um pouco.",
            "proximo"
        );

    } else {

        setFeedback(
            cents <
                0
                ? "Abaixo da nota — suba a voz."
                : "Acima da nota — desça a voz.",
            "errado"
        );
    }
}


/*
 * ============================================================
 * FINALIZAR NOTAS
 * ============================================================
 */

function finalizeExpiredNotes(
    time
) {

    selectedMelody.notes.forEach(
        (
            note,
            index
        ) => {

            const state =
                noteStates[
                    index
                ];


            if (
                !state ||
                state.finalized
            ) {

                return;
            }


            if (
                time >=
                note.start +
                note.duration +
                NOTE_TIME_MARGIN
            ) {

                finalizeNote(
                    index
                );
            }
        }
    );
}


function finalizeNote(
    index
) {

    const state =
        noteStates[
            index
        ];


    if (
        !state ||
        state.finalized
    ) {

        return;
    }


    state.finalized =
        true;


    /*
     * --------------------------------------------------------
     * OMITIDA
     * --------------------------------------------------------
     */

    if (
        state.voiceSamples ===
        0
    ) {

        state.status =
            "missed";


        state.score =
            0;


        state.averageCents =
            null;


        state.coverage =
            0;


        state.pitchScore =
            0;


        state.timingScore =
            0;


        state.durationScore =
            0;


        pianoRoll.setNoteResult(
            index,
            {

                status:
                    "missed",

                score:
                    0
            }
        );


        updateLiveStatistics();


        return;
    }


    /*
     * --------------------------------------------------------
     * RESULTADO
     * --------------------------------------------------------
     */

    state.averageCents =
        calculateAverage(
            state.centsValues
        );


    state.coverage =
        calculateCoverage(
            state
        );


    const scores =
        calculateNoteScores(
            state
        );


    state.pitchScore =
        scores.pitchScore;


    state.timingScore =
        scores.timingScore;


    state.durationScore =
        scores.durationScore;


    state.score =
        scores.totalScore;


    if (
        state.score >=
        80
    ) {

        state.status =
            "excellent";

    } else if (
        state.score >=
        55
    ) {

        state.status =
            "partial";

    } else {

        state.status =
            "error";
    }


    pianoRoll.setNoteResult(
        index,
        {

            status:
                state.status,

            score:
                state.score
        }
    );


    updateLiveStatistics();
}


/*
 * ============================================================
 * PONTUAÇÃO
 * ============================================================
 */

function calculateNoteScores(
    state
) {

    const difficulty =
        getCurrentDifficulty();


    const averageCents =
        state.centsValues.length
            ? calculateAverage(
                state.centsValues
            )
            : difficulty.near;


    const meanErrorScore =
        Math.max(
            0,
            Math.min(
                100,
                100 *
                (
                    1 -
                    averageCents /
                    difficulty.near
                )
            )
        );


    const correctRatio =
        state.voiceSamples >
        0
            ? state.correctSamples /
                state.voiceSamples
            : 0;


    const pitchScore =
        clampScore(
            meanErrorScore *
                0.55 +
            correctRatio *
                100 *
                0.45
        );


    const timingScore =
        calculateTimingScore(
            state.onsetErrorMs
        );


    const durationScore =
        clampScore(
            calculateCoverage(
                state
            ) *
            100
        );


    const totalScore =
        clampScore(
            pitchScore *
                0.60 +
            timingScore *
                0.20 +
            durationScore *
                0.20
        );


    return {

        pitchScore,

        timingScore,

        durationScore,

        totalScore
    };
}


function calculateTimingScore(
    onset
) {

    if (
        !Number.isFinite(
            onset
        )
    ) {

        return 0;
    }


    const value =
        Math.abs(
            onset
        );


    if (
        value <=
        EXCELLENT_ONSET_MS
    ) {

        return 100;
    }


    if (
        value <=
        ACCEPTABLE_ONSET_MS
    ) {

        const ratio =
            (
                value -
                EXCELLENT_ONSET_MS
            ) /
            (
                ACCEPTABLE_ONSET_MS -
                EXCELLENT_ONSET_MS
            );


        return clampScore(
            100 -
            ratio *
                50
        );
    }


    return clampScore(
        50 -
        (
            value -
            ACCEPTABLE_ONSET_MS
        ) /
        10
    );
}


function calculateCoverage(
    state
) {

    if (
        state.expectedDuration <=
        0
    ) {

        return 0;
    }


    return Math.max(
        0,
        Math.min(
            1,
            state.voicedTime /
                state.expectedDuration
        )
    );
}


/*
 * ============================================================
 * INTERFACE DE NOTA
 * ============================================================
 */

function updateExpectedNoteInterface(
    time
) {

    const target =
        getEvaluationTarget(
            time
        );


    elements.expectedNote.textContent =
        target
            ? formatMidi(
                target.note.midi
            )
            : "—";
}


function updateSungNote(
    midiFloat
) {

    elements.sungNote.textContent =
        formatMidi(
            Math.round(
                midiFloat
            )
        );
}


/*
 * ============================================================
 * ESTATÍSTICAS AO VIVO
 * ============================================================
 */

function updateLiveStatistics() {

    const finalized =
        noteStates.filter(
            state =>
                state.finalized
        );


    elements.evaluatedNotes.textContent =
        finalized.length;


    const score =
        finalized.length
            ? calculateAverage(
                finalized.map(
                    state =>
                        state.score
                )
            )
            : 0;


    elements.currentScore.textContent =
        Math.round(
            score
        );
}


/*
 * ============================================================
 * LINHA DO TEMPO
 * ============================================================
 */

function updateTimeInterface(
    time
) {

    const duration =
        Number.isFinite(
            elements.backingAudio.duration
        )
            ? elements.backingAudio.duration
            : EXPECTED_DURATION;


    const safe =
        Math.max(
            0,
            Math.min(
                duration,
                time
            )
        );


    const ratio =
        duration >
        0
            ? safe /
                duration
            : 0;


    elements.currentTime.textContent =
        formatTime(
            safe
        );


    elements.totalTime.textContent =
        formatTime(
            duration
        );


    elements.progress.textContent =
        `${Math.round(
            ratio *
            100
        )}%`;


    elements.timeBar.style.width =
        `${ratio * 100}%`;
}


/*
 * ============================================================
 * FINALIZAR TREINO
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


    /*
     * Finaliza somente notas cujo tempo
     * já passou.
     *
     * Se o MIDI terminar antes do MP3,
     * todas já terão sido avaliadas.
     */
    noteStates.forEach(
        (
            state,
            index
        ) => {

            if (
                !state.finalized
            ) {

                finalizeNote(
                    index
                );
            }
        }
    );


    elements.backingAudio.pause();


    await microphone.stop();


    elements.microphoneState.textContent =
        "Desligado";


    elements.backingState.textContent =
        "Concluído";


    elements.state.textContent =
        "Concluído";


    elements.startButton.textContent =
        "Iniciar treino";


    elements.startButton
        .classList
        .remove(
            "parar"
        );


    lockControls(
        false
    );


    showResults();
}


/*
 * ============================================================
 * INTERROMPER TREINO
 * ============================================================
 */

async function stopTraining() {

    running =
        false;


    countdownRunning =
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


    elements.backingAudio.pause();


    elements.backingAudio.currentTime =
        0;


    await microphone.stop();


    elements.microphoneState.textContent =
        "Desligado";


    elements.backingState.textContent =
        "Parado";


    elements.state.textContent =
        "Pronto";


    elements.startButton.textContent =
        "Iniciar treino";


    elements.startButton
        .classList
        .remove(
            "parar"
        );


    lockControls(
        false
    );


    pianoRoll.setCurrentTime(
        0
    );


    updateTimeInterface(
        0
    );


    updateExpectedNoteInterface(
        0
    );


    setFeedback(
        "Treino interrompido.",
        "neutro"
    );
}


/*
 * ============================================================
 * RESULTADO
 * ============================================================
 */

function showResults() {

    const total =
        noteStates.length;


    const sung =
        noteStates.filter(
            state =>
                state.voiceSamples >
                0
        );


    const missed =
        noteStates.filter(
            state =>
                state.status ===
                "missed"
        );


    const excellent =
        noteStates.filter(
            state =>
                state.status ===
                "excellent"
        );


    const totalScore =
        total
            ? Math.round(
                calculateAverage(
                    noteStates.map(
                        state =>
                            state.score
                    )
                )
            )
            : 0;


    elements.finalScore.textContent =
        totalScore;


    elements.resultAccuracy.textContent =
        sung.length
            ? `${Math.round(
                calculateAverage(
                    sung.map(
                        state =>
                            state.pitchScore
                    )
                )
            )}%`
            : "—";


    const errorStates =
        sung.filter(
            state =>
                Number.isFinite(
                    state.averageCents
                )
        );


    elements.resultError.textContent =
        errorStates.length
            ? `${calculateAverage(
                errorStates.map(
                    state =>
                        state.averageCents
                )
            ).toFixed(1)} cents`
            : "—";


    elements.resultNotes.textContent =
        `${excellent.length} / ${total}`;


    const onsetStates =
        sung.filter(
            state =>
                Number.isFinite(
                    state.onsetErrorMs
                )
        );


    elements.resultOnset.textContent =
        onsetStates.length
            ? `${Math.round(
                calculateAverage(
                    onsetStates.map(
                        state =>
                            Math.abs(
                                state.onsetErrorMs
                            )
                    )
                )
            )} ms`
            : "—";


    elements.resultCoverage.textContent =
        total
            ? `${Math.round(
                calculateAverage(
                    noteStates.map(
                        state =>
                            state.coverage
                    )
                ) *
                100
            )}%`
            : "—";


    elements.resultMissed.textContent =
        missed.length;


    elements.finalEvaluation.textContent =
        getFinalEvaluation(
            totalScore
        );


    buildNoteResultsList();


    elements.result
        .classList
        .remove(
            "oculto"
        );


    setFeedback(
        "Treino concluído!",
        "correto"
    );
}


/*
 * ============================================================
 * LISTA NOTA A NOTA
 * ============================================================
 */

function buildNoteResultsList() {

    elements.noteResultsList.innerHTML =
        "";


    noteStates.forEach(
        (
            state,
            index
        ) => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                `resultado-nota ${getResultCssClass(
                    state.status
                )}`;


            const title =
                document.createElement(
                    "div"
                );


            title.className =
                "resultado-nota-indice";


            title.textContent =
                `${index + 1}. ${formatMidi(
                    state.midi
                )}`;


            const details =
                document.createElement(
                    "div"
                );


            details.className =
                "resultado-nota-detalhes";


            if (
                state.status ===
                "missed"
            ) {

                appendDetail(
                    details,
                    "Não cantada"
                );

            } else {

                appendDetail(
                    details,
                    `Erro: ${state.averageCents.toFixed(1)} cents`
                );


                appendDetail(
                    details,
                    `Entrada: ${formatSignedMilliseconds(
                        state.onsetErrorMs
                    )}`
                );


                appendDetail(
                    details,
                    `Cobertura: ${Math.round(
                        state.coverage *
                        100
                    )}%`
                );


                appendDetail(
                    details,
                    `Afinação: ${state.pitchScore}%`
                );
            }


            const score =
                document.createElement(
                    "div"
                );


            score.className =
                "resultado-nota-pontos";


            score.textContent =
                `${state.score} pts`;


            item.append(
                title,
                details,
                score
            );


            elements.noteResultsList
                .appendChild(
                    item
                );
        }
    );
}


/*
 * ============================================================
 * RESET
 * ============================================================
 */

function resetInterfaceStatistics() {

    noteStates =
        [];


    recentFrequencies =
        [];


    lastVoicePointTimestamp =
        0;


    currentSongTime =
        0;


    elements.currentScore.textContent =
        "0";


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


    elements.currentOnset.textContent =
        "—";


    elements.currentCoverage.textContent =
        "—";


    elements.currentNoteScore.textContent =
        "—";


    elements.noteResultsList.innerHTML =
        "";


    updateTimeInterface(
        0
    );
}


/*
 * ============================================================
 * CONTROLES
 * ============================================================
 */

function lockControls(
    locked
) {

    elements.trackSelect.disabled =
        locked;


    elements.difficultySelect.disabled =
        locked;


    elements.melodyListenButton.disabled =
        locked;


    elements.backingListenButton.disabled =
        locked;


    if (
        backingPreviewPlaying
    ) {

        elements.backingListenButton.disabled =
            false;
    }


    if (
        melodyPreviewPlaying
    ) {

        elements.melodyListenButton.disabled =
            false;
    }
}


/*
 * ============================================================
 * DIFICULDADE
 * ============================================================
 */

function getCurrentDifficulty() {

    return (
        DIFFICULTIES[
            elements.difficultySelect.value
        ] ||
        DIFFICULTIES.beginner
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
        [...recentFrequencies]
            .sort(
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
        sorted[
            middle - 1
        ] +
        sorted[
            middle
        ]
    ) / 2;
}


/*
 * ============================================================
 * FORMATADORES
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
            Number(
                seconds
            ) || 0
        );


    const minutes =
        Math.floor(
            safe /
            60
        );


    const remaining =
        Math.floor(
            safe %
            60
        );


    return (
        `${minutes}:` +
        String(
            remaining
        )
        .padStart(
            2,
            "0"
        )
    );
}


function formatSignedMilliseconds(
    value
) {

    if (
        !Number.isFinite(
            value
        )
    ) {

        return "—";
    }


    const rounded =
        Math.round(
            value
        );


    if (
        rounded >
        0
    ) {

        return `+${rounded} ms`;
    }


    return `${rounded} ms`;
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
        !Array.isArray(
            values
        ) ||
        values.length ===
            0
    ) {

        return 0;
    }


    return (
        values.reduce(
            (
                sum,
                value
            ) =>
                sum +
                value,
            0
        ) /
        values.length
    );
}


function clampScore(
    value
) {

    return Math.max(
        0,
        Math.min(
            100,
            Math.round(
                value
            )
        )
    );
}


function setFeedback(
    text,
    type =
        "neutro"
) {

    elements.feedback.textContent =
        text;


    elements.feedback.className =
        `feedback ${type}`;
}


function appendDetail(
    container,
    text
) {

    const span =
        document.createElement(
            "span"
        );


    span.textContent =
        text;


    container.appendChild(
        span
    );
}


function getResultCssClass(
    status
) {

    switch (
        status
    ) {

        case "excellent":

            return "excelente";


        case "partial":

            return "parcial";


        case "error":

            return "erro";


        case "missed":

            return "omitida";


        default:

            return "";
    }
}


function getFinalEvaluation(
    score
) {

    if (
        score >=
        90
    ) {

        return (
            "Excelente execução. Afinação, entrada e sustentação estiveram muito bem coordenadas."
        );
    }


    if (
        score >=
        80
    ) {

        return (
            "Muito bom. Você acompanhou a melodia com boa precisão."
        );
    }


    if (
        score >=
        65
    ) {

        return (
            "Bom resultado. Observe no piano roll os trechos que precisam de mais atenção."
        );
    }


    if (
        score >=
        45
    ) {

        return (
            "Você acompanhou parte da melodia. Trabalhe especialmente as barras vermelhas e cinzas."
        );
    }


    return (
        "Continue praticando. O piano roll mostrará quais trechos da melodia precisam ser estudados com mais atenção."
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


        countdownRunning =
            false;


        backingPreviewPlaying =
            false;


        melodyPreviewPlaying =
            false;


        elements.backingAudio.pause();


        melodyPreviewTimers.forEach(
            timer =>
                clearTimeout(
                    timer
                )
        );


        microphone.stop();


        toneGenerator.close();


        pianoRoll.destroy();
    }
);