/*
 * ============================================================
 * melody-mode.js
 * ============================================================
 *
 * MODO MELODIA CONTÍNUA — PIANO ROLL
 *
 * Esta versão trabalha em conjunto com:
 *
 * - melodia.html atualizado
 * - melody.css atualizado
 * - piano-roll.js atualizado
 *
 * Responsabilidades:
 *
 * - selecionar a melodia;
 * - reproduzir a referência;
 * - iniciar o treino;
 * - controlar o relógio musical;
 * - capturar o microfone;
 * - detectar a frequência;
 * - desenhar a trajetória vocal;
 * - descobrir qual barra está ativa;
 * - avaliar cada nota individualmente;
 * - medir afinação;
 * - medir entrada;
 * - medir cobertura/duração;
 * - calcular pontuação por nota;
 * - enviar o resultado ao piano roll;
 * - colorir as barras concluídas;
 * - gerar o relatório final.
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
 * CONFIGURAÇÕES DE ÁUDIO
 * ============================================================
 */


/*
 * Sinais abaixo deste RMS são considerados
 * silêncio ou ruído insuficiente.
 */
const MIN_RMS =
    0.01;


/*
 * Confiança mínima aceita pelo detector YIN.
 */
const MIN_PROBABILITY =
    0.70;


/*
 * Quantidade de leituras recentes usadas
 * no filtro de mediana.
 */
const SMOOTHING_WINDOW =
    5;


/*
 * Intervalo mínimo entre os pontos visuais
 * enviados ao piano roll.
 *
 * O detector pode trabalhar em ~60 FPS,
 * mas não precisamos desenhar 60 pontos por segundo.
 */
const VOICE_POINT_INTERVAL_MS =
    45;


/*
 * Se houver uma interrupção maior do que isso
 * entre duas amostras vocais, não contamos
 * o intervalo inteiro como tempo cantado.
 */
const MAX_VOICED_SAMPLE_GAP =
    0.15;


/*
 * ============================================================
 * CONFIGURAÇÕES TEMPORAIS
 * ============================================================
 */


/*
 * Margem antes e depois da barra.
 *
 * Ajuda a medir entradas um pouco antecipadas
 * ou atrasadas.
 */
const NOTE_TIME_MARGIN =
    0.12;


/*
 * Entrada até ±120 ms:
 *
 * excelente.
 */
const EXCELLENT_ONSET_MS =
    120;


/*
 * Entrada até ±300 ms:
 *
 * ainda aceitável.
 */
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
 * ELEMENTOS DA INTERFACE
 * ============================================================
 */

const elements = {

    /*
     * Configuração
     */

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


    /*
     * Status
     */

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


    /*
     * Piano roll
     */

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


    /*
     * Feedback
     */

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


    /*
     * Resultado final
     */

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
 * VALIDAÇÃO DOS ELEMENTOS
 * ============================================================
 *
 * Se algum ID essencial estiver errado no HTML,
 * queremos descobrir imediatamente.
 * ============================================================
 */

validateRequiredElements();


function validateRequiredElements() {

    const required = {

        seletorMelodia:
            elements.melodySelect,

        seletorDificuldade:
            elements.difficultySelect,

        botaoOuvir:
            elements.listenButton,

        botaoIniciar:
            elements.startButton,

        pianoRoll:
            elements.canvas,

        contador:
            elements.counter,

        notaEsperada:
            elements.expectedNote,

        notaCantada:
            elements.sungNote,

        feedback:
            elements.feedback,

        entradaAtual:
            elements.currentOnset,

        coberturaAtual:
            elements.currentCoverage,

        pontuacaoNotaAtual:
            elements.currentNoteScore,

        resultadoEntrada:
            elements.resultOnset,

        resultadoCobertura:
            elements.resultCoverage,

        resultadoOmitidas:
            elements.resultMissed,

        listaResultadosNotas:
            elements.noteResultsList
    };


    const missing =
        Object.entries(
            required
        )
        .filter(
            ([, element]) =>
                !element
        )
        .map(
            ([id]) =>
                id
        );


    if (
        missing.length >
        0
    ) {

        throw new Error(
            "Elementos obrigatórios não encontrados no melodia.html: " +
            missing.join(", ")
        );
    }
}


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

let selectedMelody =
    MELODIES[0];


let running =
    false;


let previewPlaying =
    false;


let countdownRunning =
    false;


let animationFrameId =
    null;


let previewAnimationFrameId =
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
 * Cada posição corresponde à respectiva barra
 * de selectedMelody.notes.
 */
let noteStates =
    [];


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


/*
 * Troca de melodia.
 */
elements.melodySelect.addEventListener(
    "change",
    () => {

        if (
            running ||
            previewPlaying ||
            countdownRunning
        ) {
            return;
        }


        selectMelody(
            elements.melodySelect.value
        );
    }
);


/*
 * Ouvir a referência.
 */
elements.listenButton.addEventListener(
    "click",
    async () => {

        if (
            running ||
            previewPlaying ||
            countdownRunning
        ) {
            return;
        }


        await previewMelody();
    }
);


/*
 * Iniciar ou interromper treino.
 */
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


/*
 * Repetir a mesma melodia.
 */
elements.repeatButton.addEventListener(
    "click",
    async () => {

        if (
            running ||
            countdownRunning
        ) {
            return;
        }


        elements.result
            .classList
            .add(
                "oculto"
            );


        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });


        await startTraining();
    }
);


/*
 * ============================================================
 * POPULAR LISTA DE MELODIAS
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
 * SELECIONAR MELODIA
 * ============================================================
 */

function selectMelody(
    id
) {

    selectedMelody =
        getMelody(
            id
        );


    elements.melodySelect.value =
        selectedMelody.id;


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


    resetInterfaceStatistics();


    pianoRoll.setMelody(
        selectedMelody
    );


    pianoRoll.setCurrentTime(
        0
    );


    pianoRoll.clearVoice();


    pianoRoll.clearNoteResults();


    setFeedback(
        selectedMelody.description,
        "neutro"
    );


    elements.state.textContent =
        "Pronto";


    elements.microphoneState.textContent =
        "Desligado";
}


/*
 * ============================================================
 * CRIAR ESTADOS INDIVIDUAIS DAS NOTAS
 * ============================================================
 */

function createNoteStates() {

    noteStates =
        selectedMelody.notes.map(
            (
                note,
                index
            ) => {

                return {

                    /*
                     * Identidade
                     */

                    index,

                    midi:
                        note.midi,


                    /*
                     * Tempo esperado
                     */

                    expectedStart:
                        note.start,

                    expectedEnd:
                        note.start +
                        note.duration,

                    expectedDuration:
                        note.duration,


                    /*
                     * Entrada vocal
                     */

                    firstVoiceTime:
                        null,

                    onsetErrorMs:
                        null,


                    /*
                     * Últimas amostras
                     */

                    lastVoiceTime:
                        null,

                    lastSampleTime:
                        null,


                    /*
                     * Quantidade de áudio recebido
                     */

                    voiceSamples:
                        0,

                    correctSamples:
                        0,

                    nearSamples:
                        0,


                    /*
                     * Erros de pitch
                     */

                    centsValues:
                        [],


                    /*
                     * Tempo realmente vocalizado
                     */

                    voicedTime:
                        0,


                    /*
                     * Resultado final
                     */

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
                };
            }
        );
}


/*
 * ============================================================
 * PRÉVIA SONORA
 * ============================================================
 */

async function previewMelody() {

    if (
        previewPlaying
    ) {
        return;
    }


    previewPlaying =
        true;


    lockConfigurationControls(
        true
    );


    elements.state.textContent =
        "Ouvindo";


    elements.result
        .classList
        .add(
            "oculto"
        );


    setFeedback(
        "Ouça a melodia com atenção.",
        "neutro"
    );


    pianoRoll.clearVoice();


    pianoRoll.clearNoteResults();


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
         * Cada nota será disparada no seu tempo próprio.
         */
        const notePromises =
            selectedMelody.notes.map(
                note => {

                    return playScheduledPreviewNote(
                        note,
                        previewStart
                    );
                }
            );


        await animatePreview(
            previewStart
        );


        await Promise.allSettled(
            notePromises
        );


    } catch (error) {

        console.error(
            "Erro ao reproduzir melodia:",
            error
        );


        setFeedback(
            "Não foi possível reproduzir a melodia.",
            "errado"
        );


    } finally {

        previewPlaying =
            false;


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


        lockConfigurationControls(
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
 * ============================================================
 * NOTA INDIVIDUAL DA PRÉVIA
 * ============================================================
 */

async function playScheduledPreviewNote(
    note,
    previewStart
) {

    const elapsedMs =
        performance.now() -
        previewStart;


    const targetStartMs =
        note.start *
        1000;


    const delay =
        Math.max(
            0,
            targetStartMs -
            elapsedMs
        );


    await wait(
        delay
    );


    if (
        !previewPlaying
    ) {
        return;
    }


    await toneGenerator.playNote(
        note.midi,
        note.duration *
            1000
    );
}


/*
 * ============================================================
 * ANIMAÇÃO DA PRÉVIA
 * ============================================================
 */

function animatePreview(
    previewStart
) {

    const duration =
        getMelodyDuration(
            selectedMelody
        );


    return new Promise(
        resolve => {

            const frame =
                () => {

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


                    updateExpectedNoteInterface(
                        elapsed
                    );


                    if (
                        elapsed >=
                        duration
                    ) {

                        previewAnimationFrameId =
                            null;


                        resolve();

                        return;
                    }


                    previewAnimationFrameId =
                        requestAnimationFrame(
                            frame
                        );
                };


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

    if (
        running ||
        countdownRunning
    ) {
        return;
    }


    elements.result
        .classList
        .add(
            "oculto"
        );


    /*
     * O botão continua disponível para podermos
     * interromper inclusive durante a contagem regressiva.
     */
    elements.startButton.textContent =
        "Interromper treino";


    elements.startButton
        .classList
        .add(
            "parar"
        );


    lockConfigurationControls(
        true
    );


    try {

        /*
         * Primeiro preparamos o contexto de áudio.
         */
        await toneGenerator.ensureContext();


        /*
         * Depois iniciamos o microfone.
         */
        await microphone.start();


        /*
         * ====================================================
         * IMPORTANTE
         * ====================================================
         *
         * Primeiro limpamos a interface e os estados
         * pertencentes ao treino anterior.
         *
         * Somente DEPOIS criamos os estados da nova melodia.
         *
         * Na versão anterior a ordem estava invertida:
         *
         * createNoteStates();
         * resetInterfaceStatistics();
         *
         * Como resetInterfaceStatistics() contém:
         *
         * noteStates = [];
         *
         * todas as notas recém-criadas eram apagadas
         * imediatamente.
         *
         * ====================================================
         */

        resetInterfaceStatistics();


        createNoteStates();


        /*
         * Reinicia o piano roll.
         */
        pianoRoll.setMelody(
            selectedMelody
        );


        pianoRoll.clearVoice();


        pianoRoll.clearNoteResults();


        recentFrequencies =
            [];


        lastVoicePointTimestamp =
            0;


        elements.microphoneState.textContent =
            "Ativo";


        elements.state.textContent =
            "Preparando";


        setFeedback(
            "Prepare-se para cantar.",
            "neutro"
        );


        countdownRunning =
            true;


        const countdownCompleted =
            await countdown();


        countdownRunning =
            false;


        /*
         * Se a contagem foi interrompida,
         * não iniciamos o relógio musical.
         */
        if (
            !countdownCompleted
        ) {

            return;
        }


        /*
         * ====================================================
         * INÍCIO REAL DA MELODIA
         * ====================================================
         */

        running =
            true;


        startTimestamp =
            performance.now();


        currentSongTime =
            0;


        elements.state.textContent =
            "Cantando";


        setFeedback(
            "Acompanhe as barras e cante.",
            "neutro"
        );


        processFrame();


    } catch (error) {

        console.error(
            "Erro ao iniciar treino:",
            error
        );


        if (
            error.name ===
            "NotAllowedError"
        ) {

            setFeedback(
                "A permissão do microfone foi negada.",
                "errado"
            );

        } else if (
            error.name ===
            "NotFoundError"
        ) {

            setFeedback(
                "Nenhum microfone foi encontrado.",
                "errado"
            );

        } else {

            setFeedback(
                `Não foi possível iniciar o treino: ${error.message}`,
                "errado"
            );
        }


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

            /*
             * Se stopTraining() foi chamado,
             * countdownRunning passa a false.
             */
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
     * Atualiza o deslocamento do canvas.
     */
    pianoRoll.setCurrentTime(
        currentSongTime
    );


    /*
     * Atualiza barra temporal.
     */
    updateTimeInterface(
        currentSongTime
    );


    /*
     * Mesmo em silêncio mostramos
     * qual nota está atravessando o playhead.
     */
    updateExpectedNoteInterface(
        currentSongTime
    );


    /*
     * Julga todas as notas cujo período já terminou.
     *
     * É aqui que as barras azuis passadas
     * passam a verde/amarelo/vermelho/cinza.
     */
    finalizeExpiredNotes(
        currentSongTime
    );


    /*
     * Final da melodia.
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


    if (!buffer) {
        return;
    }


    const rms =
        microphone.calculateRms(
            buffer
        );


    /*
     * Silêncio.
     */
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
     * Traçado da voz no piano roll.
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


    /*
     * Nota nominal cantada.
     */
    updateSungNote(
        midiFloat
    );


    /*
     * Avaliação musical/temporal.
     */
    evaluateVoiceSample(
        frequency,
        currentSongTime
    );
}


/*
 * ============================================================
 * QUAL BARRA DEVE RECEBER ESTA AMOSTRA?
 * ============================================================
 */

function getEvaluationTarget(
    time
) {

    /*
     * --------------------------------------------------------
     * 1. Prioridade máxima:
     *
     * período real da barra.
     *
     * Usamos:
     *
     * start <= time < end
     *
     * Assim a fronteira entre duas notas consecutivas
     * pertence à segunda nota, não à primeira.
     * --------------------------------------------------------
     */

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
            note.start;


        const end =
            note.start +
            note.duration;


        if (
            time >=
            start &&
            time <
            end
        ) {

            return {
                note,
                index
            };
        }
    }


    /*
     * --------------------------------------------------------
     * 2. Margem temporal.
     *
     * Usada somente quando não estamos dentro
     * do período real de nenhuma barra.
     *
     * Isso permite capturar pequenas entradas antecipadas
     * ou finalizações ligeiramente atrasadas.
     * --------------------------------------------------------
     */

    let bestTarget =
        null;


    let bestDistance =
        Infinity;


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
            note.start;


        const end =
            note.start +
            note.duration;


        if (
            time <
                start -
                    NOTE_TIME_MARGIN ||
            time >
                end +
                    NOTE_TIME_MARGIN
        ) {

            continue;
        }


        /*
         * Distância até a barra.
         */
        let distance =
            0;


        if (
            time <
            start
        ) {

            distance =
                start -
                time;

        } else if (
            time >
            end
        ) {

            distance =
                time -
                end;
        }


        if (
            distance <
            bestDistance
        ) {

            bestDistance =
                distance;


            bestTarget = {
                note,
                index
            };
        }
    }


    return bestTarget;
}


/*
 * ============================================================
 * AVALIAR AMOSTRA VOCAL
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


    /*
     * Voz detectada durante uma pausa.
     *
     * Nesta etapa não penalizamos isso.
     */
    if (
        !target
    ) {

        elements.currentError.textContent =
            "—";


        elements.currentOnset.textContent =
            "—";


        elements.currentCoverage.textContent =
            "—";


        elements.currentNoteScore.textContent =
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
        target;


    const state =
        noteStates[
            index
        ];


    /*
     * Uma barra já julgada não recebe
     * mais dados.
     */
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


    /*
     * ========================================================
     * PRIMEIRA AMOSTRA = ENTRADA
     * ========================================================
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
                note.start
            ) *
            1000;
    }


    /*
     * ========================================================
     * TEMPO REALMENTE CANTADO
     * ========================================================
     */

    if (
        state.lastSampleTime !==
        null
    ) {

        const delta =
            time -
            state.lastSampleTime;


        /*
         * Só somamos continuidade real.
         *
         * Uma pausa longa não pode ser interpretada
         * como canto sustentado.
         */
        if (
            delta >
                0 &&
            delta <=
                MAX_VOICED_SAMPLE_GAP
        ) {

            /*
             * Limitamos a cobertura ao período real
             * da barra.
             */
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


    /*
     * ========================================================
     * ESTATÍSTICAS DE PITCH
     * ========================================================
     */

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
     * ========================================================
     * MÉTRICAS AO VIVO
     * ========================================================
     */

    const roundedCents =
        Math.round(
            cents
        );


    const sign =
        roundedCents >
        0
            ? "+"
            : "";


    elements.currentError.textContent =
        `${sign}${roundedCents} cents`;


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


    /*
     * Exibimos uma estimativa da pontuação
     * enquanto a nota ainda está ocorrendo.
     */
    const liveScores =
        calculateNoteScores(
            state,
            false
        );


    elements.currentNoteScore.textContent =
        liveScores.totalScore;


    /*
     * ========================================================
     * FEEDBACK IMEDIATO
     * ========================================================
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


    /*
     * Atualiza também a afinação média
     * da barra atual.
     */
    const currentAverageCents =
        calculateAverage(
            state.centsValues
        );


    const currentPitchScore =
        calculatePitchScore(
            currentAverageCents,
            state,
            difficulty
        );


    elements.accuracy.textContent =
        `${currentPitchScore}%`;
}


/*
 * ============================================================
 * FINALIZAR NOTAS CUJO TEMPO TERMINOU
 * ============================================================
 */

function finalizeExpiredNotes(
    time
) {

    if (
        !noteStates.length
    ) {
        return;
    }


    /*
     * Cada barra é independente.
     *
     * Não dependemos de um contador sequencial externo.
     *
     * Portanto, se qualquer barra já venceu,
     * ela será julgada.
     */
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


            const evaluationEnd =
                note.start +
                note.duration +
                NOTE_TIME_MARGIN;


            if (
                time >=
                evaluationEnd
            ) {

                finalizeNote(
                    index
                );
            }
        }
    );
}


/*
 * ============================================================
 * FINALIZAR UMA BARRA
 * ============================================================
 */

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


    /*
     * A partir deste ponto a barra não recebe mais amostras.
     */
    state.finalized =
        true;


    /*
     * ========================================================
     * BARRA NÃO CANTADA
     * ========================================================
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


        /*
         * Envia imediatamente o resultado
         * para o piano roll.
         *
         * A barra deverá ficar cinza.
         */
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


        clearCurrentNoteMetricsIfNeeded(
            index
        );


        return;
    }


    /*
     * ========================================================
     * ERRO MÉDIO
     * ========================================================
     */

    state.averageCents =
        calculateAverage(
            state.centsValues
        );


    /*
     * ========================================================
     * COBERTURA
     * ========================================================
     */

    state.coverage =
        calculateCoverage(
            state
        );


    /*
     * ========================================================
     * PONTUAÇÕES
     * ========================================================
     */

    const scores =
        calculateNoteScores(
            state,
            true
        );


    state.pitchScore =
        scores.pitchScore;


    state.timingScore =
        scores.timingScore;


    state.durationScore =
        scores.durationScore;


    state.score =
        scores.totalScore;


    /*
     * ========================================================
     * CLASSIFICAÇÃO VISUAL
     * ========================================================
     */

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


    /*
     * ========================================================
     * ENVIA RESULTADO AO PIANO ROLL
     * ========================================================
     *
     * Este é o ponto responsável por transformar:
     *
     * azul → verde
     * azul → amarelo
     * azul → vermelho
     *
     * imediatamente após a barra terminar.
     * ========================================================
     */

    pianoRoll.setNoteResult(
        index,
        {
            status:
                state.status,

            score:
                state.score
        }
    );


    /*
     * Mostra a pontuação definitiva da última barra
     * recém-avaliada.
     */
    elements.currentNoteScore.textContent =
        state.score;


    updateLiveStatistics();


    clearCurrentNoteMetricsIfNeeded(
        index
    );
}


/*
 * ============================================================
 * PONTUAÇÃO DA NOTA
 * ============================================================
 */

function calculateNoteScores(
    state,
    finalized
) {

    const difficulty =
        getCurrentDifficulty();


    const averageCents =
        state.centsValues.length
            ? calculateAverage(
                state.centsValues
            )
            : difficulty.near;


    /*
     * ========================================================
     * 1. AFINAÇÃO
     * ========================================================
     *
     * Consideramos dois aspectos:
     *
     * A) erro médio absoluto;
     * B) porcentagem de amostras dentro da tolerância.
     *
     * Isso evita que um pequeno trecho muito ruim
     * domine completamente a nota.
     * ========================================================
     */

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


    const correctRatioScore =
        correctRatio *
        100;


    const pitchScore =
        Math.round(
            meanErrorScore *
                0.55 +
            correctRatioScore *
                0.45
        );


    /*
     * ========================================================
     * 2. ENTRADA
     * ========================================================
     */

    const timingScore =
        calculateTimingScore(
            state.onsetErrorMs
        );


    /*
     * ========================================================
     * 3. DURAÇÃO / COBERTURA
     * ========================================================
     */

    let coverage =
        calculateCoverage(
            state
        );


    /*
     * Enquanto a barra ainda está em andamento,
     * uma cobertura pequena é natural.
     *
     * Para o valor "ao vivo", comparamos com quanto
     * da nota já deveria ter transcorrido.
     */
    if (
        !finalized
    ) {

        const elapsedExpected =
            Math.max(
                0,
                Math.min(
                    currentSongTime -
                        state.expectedStart,
                    state.expectedDuration
                )
            );


        if (
            elapsedExpected >
            0
        ) {

            coverage =
                Math.max(
                    0,
                    Math.min(
                        1,
                        state.voicedTime /
                            elapsedExpected
                    )
                );
        }
    }


    const durationScore =
        Math.round(
            coverage *
            100
        );


    /*
     * ========================================================
     * PONTUAÇÃO TOTAL
     * ========================================================
     *
     * 60% afinação
     * 20% entrada
     * 20% duração
     * ========================================================
     */

    const totalScore =
        Math.round(
            pitchScore *
                0.60 +
            timingScore *
                0.20 +
            durationScore *
                0.20
        );


    return {

        pitchScore:
            clampScore(
                pitchScore
            ),

        timingScore:
            clampScore(
                timingScore
            ),

        durationScore:
            clampScore(
                durationScore
            ),

        totalScore:
            clampScore(
                totalScore
            )
    };
}


/*
 * ============================================================
 * PONTUAÇÃO DE AFINAÇÃO
 * ============================================================
 */

function calculatePitchScore(
    averageCents,
    state,
    difficulty
) {

    if (
        !Number.isFinite(
            averageCents
        ) ||
        !state ||
        state.voiceSamples ===
            0
    ) {

        return 0;
    }


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
        state.correctSamples /
        state.voiceSamples;


    return clampScore(
        Math.round(
            meanErrorScore *
                0.55 +
            correctRatio *
                100 *
                0.45
        )
    );
}


/*
 * ============================================================
 * PONTUAÇÃO DE ENTRADA
 * ============================================================
 */

function calculateTimingScore(
    onsetErrorMs
) {

    if (
        !Number.isFinite(
            onsetErrorMs
        )
    ) {

        return 0;
    }


    const absolute =
        Math.abs(
            onsetErrorMs
        );


    /*
     * Até ±120 ms:
     * nota máxima.
     */
    if (
        absolute <=
        EXCELLENT_ONSET_MS
    ) {

        return 100;
    }


    /*
     * Entre 120 e 300 ms:
     *
     * cai suavemente de 100 para 50.
     */
    if (
        absolute <=
        ACCEPTABLE_ONSET_MS
    ) {

        const ratio =
            (
                absolute -
                EXCELLENT_ONSET_MS
            ) /
            (
                ACCEPTABLE_ONSET_MS -
                EXCELLENT_ONSET_MS
            );


        return clampScore(
            Math.round(
                100 -
                ratio *
                    50
            )
        );
    }


    /*
     * Após 300 ms:
     *
     * perde aproximadamente 1 ponto
     * a cada 10 ms adicionais.
     */
    const penalty =
        (
            absolute -
            ACCEPTABLE_ONSET_MS
        ) /
        10;


    return clampScore(
        Math.round(
            50 -
            penalty
        )
    );
}


/*
 * ============================================================
 * COBERTURA
 * ============================================================
 */

function calculateCoverage(
    state
) {

    if (
        !state ||
        !Number.isFinite(
            state.expectedDuration
        ) ||
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
 * NOTA ESPERADA NA INTERFACE
 * ============================================================
 */

function updateExpectedNoteInterface(
    time
) {

    const active =
        getStrictActiveTarget(
            time
        );


    if (
        !active
    ) {

        elements.expectedNote.textContent =
            "—";


        return;
    }


    elements.expectedNote.textContent =
        formatMidi(
            active.note.midi
        );
}


/*
 * ============================================================
 * NOTA ESTRITAMENTE ATIVA
 * ============================================================
 *
 * Esta função é usada apenas para interface.
 *
 * Não usa margens.
 * ============================================================
 */

function getStrictActiveTarget(
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
            note.start;


        const end =
            note.start +
            note.duration;


        if (
            time >=
                start &&
            time <
                end
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
 * LIMPAR MÉTRICAS DA NOTA ANTERIOR
 * ============================================================
 */

function clearCurrentNoteMetricsIfNeeded(
    finalizedIndex
) {

    const active =
        getStrictActiveTarget(
            currentSongTime
        );


    /*
     * Se ainda estivermos visualmente na mesma barra
     * por alguns milissegundos, mantemos o resultado.
     */
    if (
        active &&
        active.index ===
            finalizedIndex
    ) {

        return;
    }


    elements.currentOnset.textContent =
        "—";


    elements.currentCoverage.textContent =
        "—";
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
 * ESTATÍSTICAS EM TEMPO REAL
 * ============================================================
 */

function updateLiveStatistics() {

    const finalized =
        noteStates.filter(
            state =>
                state.finalized
        );


    const sung =
        finalized.filter(
            state =>
                state.voiceSamples >
                0
        );


    /*
     * Pontuação atual considera inclusive barras omitidas.
     *
     * Portanto, silêncio em uma nota já terminada
     * pesa corretamente como zero.
     */
    const currentTotalScore =
        finalized.length >
        0
            ? calculateAverage(
                finalized.map(
                    state =>
                        state.score
                )
            )
            : 0;


    elements.currentScore.textContent =
        Math.round(
            currentTotalScore
        );


    /*
     * Pontuação média de afinação das notas
     * efetivamente cantadas.
     */
    const averagePitchScore =
        sung.length >
        0
            ? calculateAverage(
                sung.map(
                    state =>
                        state.pitchScore
                )
            )
            : null;


    elements.accuracy.textContent =
        averagePitchScore !==
        null
            ? `${Math.round(
                averagePitchScore
            )}%`
            : "—";


    elements.evaluatedNotes.textContent =
        finalized.length;
}


/*
 * ============================================================
 * ATUALIZAR TEMPO
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
        duration >
        0
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
 * FINALIZAR TREINO
 * ============================================================
 */

async function finishTraining() {

    if (
        !running
    ) {
        return;
    }


    /*
     * Impede nova chamada enquanto aguardamos
     * o encerramento do microfone.
     */
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
     * Algumas barras podem terminar exatamente
     * junto do fim da melodia.
     *
     * Garantimos que todas sejam julgadas.
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


    await microphone.stop();


    elements.microphoneState.textContent =
        "Desligado";


    elements.state.textContent =
        "Concluído";


    elements.startButton.textContent =
        "Iniciar treino";


    elements.startButton
        .classList
        .remove(
            "parar"
        );


    lockConfigurationControls(
        false
    );


    updateTimeInterface(
        getMelodyDuration(
            selectedMelody
        )
    );


    elements.expectedNote.textContent =
        "—";


    elements.sungNote.textContent =
        "—";


    showResults();
}


/*
 * ============================================================
 * INTERROMPER TREINO
 * ============================================================
 */

async function stopTraining() {

    /*
     * Interrompe também a contagem regressiva.
     */
    countdownRunning =
        false;


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


    elements.counter
        .classList
        .add(
            "oculto"
        );


    if (
        microphone.running
    ) {

        await microphone.stop();
    }


    elements.microphoneState.textContent =
        "Desligado";


    elements.state.textContent =
        "Pronto";


    elements.startButton.textContent =
        "Iniciar treino";


    elements.startButton
        .classList
        .remove(
            "parar"
        );


    elements.startButton.disabled =
        false;


    lockConfigurationControls(
        false
    );


    setFeedback(
        "Treino interrompido.",
        "neutro"
    );
}


/*
 * ============================================================
 * RELATÓRIO FINAL
 * ============================================================
 */

function showResults() {

    const totalNotes =
        noteStates.length;


    const sungNotes =
        noteStates.filter(
            state =>
                state.voiceSamples >
                0
        );


    const missedNotes =
        noteStates.filter(
            state =>
                state.status ===
                "missed"
        );


    /*
     * Consideramos "acertada" qualquer nota
     * verde/excellent.
     */
    const excellentNotes =
        noteStates.filter(
            state =>
                state.status ===
                "excellent"
        );


    /*
     * Nota geral:
     *
     * média das pontuações individuais,
     * incluindo zeros.
     */
    const totalScore =
        totalNotes >
        0
            ? Math.round(
                calculateAverage(
                    noteStates.map(
                        state =>
                            state.score
                    )
                )
            )
            : 0;


    /*
     * Pontuação média de afinação.
     */
    const averagePitchScore =
        sungNotes.length >
        0
            ? calculateAverage(
                sungNotes.map(
                    state =>
                        state.pitchScore
                )
            )
            : null;


    /*
     * Erro médio absoluto em cents.
     */
    const pitchStates =
        sungNotes.filter(
            state =>
                Number.isFinite(
                    state.averageCents
                )
        );


    const averageCents =
        pitchStates.length >
        0
            ? calculateAverage(
                pitchStates.map(
                    state =>
                        state.averageCents
                )
            )
            : null;


    /*
     * Média absoluta do erro de entrada.
     *
     * Para o resumo, não importa aqui se entrou
     * antes ou depois; queremos saber a magnitude média.
     */
    const onsetStates =
        sungNotes.filter(
            state =>
                Number.isFinite(
                    state.onsetErrorMs
                )
        );


    const averageOnset =
        onsetStates.length >
        0
            ? calculateAverage(
                onsetStates.map(
                    state =>
                        Math.abs(
                            state.onsetErrorMs
                        )
                )
            )
            : null;


    /*
     * Cobertura média.
     *
     * Aqui incluímos TODAS as notas,
     * inclusive as omitidas com cobertura zero.
     *
     * Isso torna a métrica mais representativa
     * da execução completa.
     */
    const averageCoverage =
        totalNotes >
        0
            ? calculateAverage(
                noteStates.map(
                    state =>
                        state.coverage
                )
            )
            : 0;


    /*
     * ========================================================
     * PREENCHE RESULTADO
     * ========================================================
     */

    elements.finalScore.textContent =
        totalScore;


    elements.resultAccuracy.textContent =
        averagePitchScore !==
        null
            ? `${averagePitchScore.toFixed(0)}%`
            : "—";


    elements.resultError.textContent =
        averageCents !==
        null
            ? `${averageCents.toFixed(1)} cents`
            : "—";


    elements.resultNotes.textContent =
        `${excellentNotes.length} / ${totalNotes}`;


    elements.resultOnset.textContent =
        averageOnset !==
        null
            ? `${averageOnset.toFixed(0)} ms`
            : "—";


    elements.resultCoverage.textContent =
        `${Math.round(
            averageCoverage *
            100
        )}%`;


    elements.resultMissed.textContent =
        missedNotes.length;


    elements.finalEvaluation.textContent =
        getFinalEvaluation(
            totalScore
        );


    /*
     * Lista detalhada.
     */
    buildNoteResultsList();


    elements.result
        .classList
        .remove(
            "oculto"
        );


    setFeedback(
        "Melodia concluída!",
        "correto"
    );


    /*
     * Leva o usuário ao relatório.
     */
    setTimeout(
        () => {

            elements.result.scrollIntoView({

                behavior:
                    "smooth",

                block:
                    "start"
            });

        },
        150
    );
}


/*
 * ============================================================
 * RESULTADO NOTA A NOTA
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

            const note =
                selectedMelody.notes[
                    index
                ];


            /*
             * Container.
             */
            const item =
                document.createElement(
                    "div"
                );


            item.className =
                `resultado-nota ${getResultCssClass(
                    state.status
                )}`;


            /*
             * Número + nota.
             */
            const indexElement =
                document.createElement(
                    "div"
                );


            indexElement.className =
                "resultado-nota-indice";


            indexElement.textContent =
                `${index + 1}. ${formatMidi(
                    note.midi
                )}`;


            /*
             * Métricas.
             */
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


                appendDetail(
                    details,
                    `Duração esperada: ${note.duration.toFixed(2)} s`
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


                appendDetail(
                    details,
                    `Tempo: ${state.timingScore}%`
                );


                appendDetail(
                    details,
                    `Duração: ${state.durationScore}%`
                );
            }


            /*
             * Pontuação.
             */
            const score =
                document.createElement(
                    "div"
                );


            score.className =
                "resultado-nota-pontos";


            score.textContent =
                `${state.score} pts`;


            item.appendChild(
                indexElement
            );


            item.appendChild(
                details
            );


            item.appendChild(
                score
            );


            elements.noteResultsList.appendChild(
                item
            );
        }
    );
}


/*
 * ============================================================
 * ADICIONAR DETALHE SEM USAR innerHTML
 * ============================================================
 */

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


/*
 * ============================================================
 * CLASSE CSS DO RESULTADO
 * ============================================================
 */

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


/*
 * ============================================================
 * RESET DA INTERFACE
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


    elements.currentTime.textContent =
        "0:00";


    elements.progress.textContent =
        "0%";


    elements.timeBar.style.width =
        "0%";


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
}


/*
 * ============================================================
 * SUAVIZAÇÃO DA FREQUÊNCIA
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
        ]
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
 * DIFICULDADE ATUAL
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
 * BLOQUEAR CONFIGURAÇÃO
 * ============================================================
 *
 * IMPORTANTE:
 *
 * não bloqueamos o botão principal.
 *
 * Ele precisa continuar disponível para
 * "Interromper treino".
 * ============================================================
 */

function lockConfigurationControls(
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
    type = "neutro"
) {

    elements.feedback.textContent =
        text;


    elements.feedback.className =
        `feedback ${type}`;
}


/*
 * ============================================================
 * FORMATAÇÃO MIDI
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


/*
 * ============================================================
 * FORMATAÇÃO DE TEMPO
 * ============================================================
 */

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


/*
 * ============================================================
 * FORMATAÇÃO DA ENTRADA
 * ============================================================
 */

function formatSignedMilliseconds(
    milliseconds
) {

    if (
        !Number.isFinite(
            milliseconds
        )
    ) {

        return "—";
    }


    const rounded =
        Math.round(
            milliseconds
        );


    if (
        rounded ===
        0
    ) {

        return "0 ms";
    }


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
 * MÉDIA
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
            (sum, value) =>
                sum + value,
            0
        ) /
        values.length
    );
}


/*
 * ============================================================
 * LIMITAR SCORE
 * ============================================================
 */

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


/*
 * ============================================================
 * TEXTO FINAL
 * ============================================================
 */

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
            "Muito bom. Você acompanhou a melodia com boa precisão e poucas perdas de sincronismo."
        );
    }


    if (
        score >=
        65
    ) {

        return (
            "Bom resultado. Observe no piano roll quais barras ficaram amarelas ou vermelhas e tente corrigi-las na próxima execução."
        );
    }


    if (
        score >=
        45
    ) {

        return (
            "Você já consegue acompanhar parte da melodia. Priorize acertar a altura, a entrada e a sustentação das barras mais difíceis."
        );
    }


    return (
        "A melodia ainda está desafiadora. Ouça novamente a referência e use as barras coloridas para identificar os trechos que precisam de mais atenção."
    );
}


/*
 * ============================================================
 * ESPERA
 * ============================================================
 */

function wait(
    milliseconds
) {

    return new Promise(
        resolve => {

            setTimeout(
                resolve,
                milliseconds
            );
        }
    );
}


/*
 * ============================================================
 * ENCERRAMENTO DA PÁGINA
 * ============================================================
 */

window.addEventListener(
    "pagehide",
    () => {

        running =
            false;


        previewPlaying =
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
        }


        if (
            previewAnimationFrameId !==
            null
        ) {

            cancelAnimationFrame(
                previewAnimationFrameId
            );
        }


        microphone.stop();


        toneGenerator.close();


        pianoRoll.destroy();
    }
);