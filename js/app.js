/*
 * ============================================================
 * app.js
 * ============================================================
 *
 * ETAPA 3 — EXERCÍCIOS
 *
 * Fluxo geral:
 *
 * escolhe exercício
 *       ↓
 * gera notas-alvo
 *       ↓
 * toca referência
 *       ↓
 * microfone
 *       ↓
 * detector YIN
 *       ↓
 * frequência detectada
 *       ↓
 * comparação com nota-alvo
 *       ↓
 * feedback + progresso
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


/*
 * ============================================================
 * CONFIGURAÇÕES
 * ============================================================
 */


/*
 * Sinal abaixo disso será considerado silêncio.
 */
const MIN_RMS =
    0.01;


/*
 * Confiança mínima do detector YIN.
 */
const MIN_PROBABILITY =
    0.70;


/*
 * Número de frequências usadas na suavização.
 */
const SMOOTHING_WINDOW =
    5;


/*
 * Quantos cents em torno da nota-alvo
 * contam como afinação correta.
 *
 * Começaremos com ±30 cents.
 *
 * Posteriormente poderemos criar níveis:
 *
 * iniciante = 35
 * intermediário = 25
 * avançado = 15
 */
const CORRECT_TOLERANCE_CENTS =
    30;


/*
 * Até esta distância ainda consideramos
 * que a pessoa está "próxima".
 */
const NEAR_TOLERANCE_CENTS =
    70;


/*
 * Depois desse tempo sem pitch,
 * apagamos a leitura da tela.
 */
const NO_PITCH_TIMEOUT =
    450;


/*
 * Após acertar uma nota da sequência,
 * fazemos uma pequena pausa antes
 * de avançar para a próxima.
 */
const ADVANCE_DELAY_MS =
    500;


/*
 * ============================================================
 * ELEMENTOS DA INTERFACE
 * ============================================================
 */

const elements = {

    exerciseButtons:
        Array.from(
            document.querySelectorAll(
                ".botao-exercicio"
            )
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

    cents:
        document.getElementById(
            "cents"
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

    targetFrequency:
        document.getElementById(
            "frequenciaAlvo"
        ),

    errorCents:
        document.getElementById(
            "erroCents"
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


let currentExercise =
    getExercise(
        selectedExerciseId
    );


let exerciseData =
    null;


let currentTargetIndex =
    0;


let exerciseRunning =
    false;


let exerciseCompleted =
    false;


let referencePlaying =
    false;


let advancingNote =
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
 * ============================================================
 * SELEÇÃO DE EXERCÍCIO
 * ============================================================
 */

elements.exerciseButtons.forEach(
    button => {

        button.addEventListener(
            "click",
            async () => {

                if (
                    exerciseRunning
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


                resetExerciseVisuals();
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
            exerciseRunning
        ) {

            await stopExercise();

        } else {

            await startExercise();
        }
    }
);


/*
 * ============================================================
 * BOTÃO DE OUVIR REFERÊNCIA
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
 * INICIAR EXERCÍCIO
 * ============================================================
 */

async function startExercise() {

    elements.mainButton.disabled =
        true;


    elements.message.className =
        "mensagem";


    elements.message.textContent =
        "Preparando exercício...";


    try {

        /*
         * Monta novo exercício.
         */
        currentExercise =
            getExercise(
                selectedExerciseId
            );


        exerciseData =
            currentExercise.build();


        currentTargetIndex =
            0;


        exerciseCompleted =
            false;


        advancingNote =
            false;


        holdStartTime =
            null;


        recentFrequencies =
            [];


        updateSequenceVisual();


        updateTargetVisual();


        /*
         * Abre primeiro o contexto do gerador de som.
         *
         * Isso acontece dentro do clique do usuário,
         * o que ajuda nos navegadores móveis.
         */
        await toneGenerator.ensureContext();


        /*
         * Ativa o microfone.
         */
        await microphone.start();


        exerciseRunning =
            true;


        lastValidPitchTime =
            performance.now();


        updateRunningInterface();


        /*
         * Toca a referência automaticamente.
         *
         * Durante a reprodução, a análise vocal continua
         * bloqueada para não confundirmos o alto-falante
         * com a voz do aluno.
         */
        await playExerciseReference();


        if (
            !exerciseRunning
        ) {
            return;
        }


        setFeedback(
            "Agora é sua vez. Cante a nota indicada.",
            "neutro"
        );


        elements.message.textContent =
            "Cante uma vogal sustentada, como “aaaa”.";


        processAudio();


    } catch (error) {

        console.error(
            "Erro ao iniciar exercício:",
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

        } else if (
            error.name ===
            "NotFoundError"
        ) {

            elements.message.textContent =
                "Nenhum microfone foi encontrado.";

        } else {

            elements.message.textContent =
                "Não foi possível iniciar o exercício: " +
                error.message;
        }


        await forceStop();
    }


    elements.mainButton.disabled =
        false;
}


/*
 * ============================================================
 * PARAR EXERCÍCIO
 * ============================================================
 */

async function stopExercise() {

    elements.mainButton.disabled =
        true;


    await forceStop();


    resetExerciseVisuals();


    elements.message.className =
        "mensagem";


    elements.message.textContent =
        "Exercício interrompido.";


    elements.mainButton.disabled =
        false;
}


/*
 * Encerramento interno.
 */
async function forceStop() {

    exerciseRunning =
        false;


    referencePlaying =
        false;


    advancingNote =
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


    recentFrequencies =
        [];


    updateStoppedInterface();
}


/*
 * ============================================================
 * REFERÊNCIA SONORA
 * ============================================================
 */

async function playExerciseReference() {

    if (
        !exerciseData
    ) {
        return;
    }


    referencePlaying =
        true;


    setFeedback(
        "Ouça com atenção...",
        "neutro"
    );


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


        /*
         * Pequena pausa para que o som do alto-falante
         * desapareça antes de começarmos a avaliar a voz.
         */
        await wait(
            300
        );

    } finally {

        referencePlaying =
            false;


        lastValidPitchTime =
            performance.now();
    }
}


/*
 * Toca somente a nota-alvo atual.
 */
async function playCurrentReference() {

    const targetMidi =
        getCurrentTargetMidi();


    if (
        targetMidi ===
        null
    ) {
        return;
    }


    referencePlaying =
        true;


    const previousFeedback =
        elements.feedback.textContent;


    setFeedback(
        "Ouça a nota...",
        "neutro"
    );


    clearDetectedPitch();


    try {

        await toneGenerator.playNote(
            targetMidi,
            900
        );


        await wait(
            250
        );

    } finally {

        referencePlaying =
            false;


        if (
            exerciseRunning
        ) {

            setFeedback(
                "Sua vez. Reproduza a nota.",
                "neutro"
            );

        } else {

            setFeedback(
                previousFeedback,
                "neutro"
            );
        }


        lastValidPitchTime =
            performance.now();
    }
}


/*
 * ============================================================
 * PROCESSAMENTO DE ÁUDIO
 * ============================================================
 */

function processAudio() {

    if (
        !exerciseRunning
    ) {
        return;
    }


    /*
     * Enquanto a referência toca,
     * não avaliamos o microfone.
     */
    if (
        referencePlaying ||
        advancingNote
    ) {

        scheduleNextFrame();

        return;
    }


    const buffer =
        microphone.getTimeDomainData();


    if (!buffer) {

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

        handleNoPitch();

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


    const smoothedFrequency =
        smoothFrequency(
            detection.frequency
        );


    if (
        !smoothedFrequency
    ) {

        handleNoPitch();

        scheduleNextFrame();

        return;
    }


    lastValidPitchTime =
        performance.now();


    const musicalData =
        analyzeFrequency(
            smoothedFrequency
        );


    if (
        !musicalData
    ) {

        scheduleNextFrame();

        return;
    }


    updateDetectedPitch(
        musicalData
    );


    evaluatePitch(
        smoothedFrequency
    );


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
        targetMidi ===
        null
    ) {
        return;
    }


    const targetFrequency =
        midiToFrequency(
            targetMidi
        );


    /*
     * Esta diferença é calculada diretamente
     * em relação à nota-alvo.
     *
     * Portanto, se o aluno cantar uma nota completamente
     * diferente, veremos algo como:
     *
     * -200 cents
     * +700 cents
     * -1200 cents
     *
     * etc.
     */
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


    /*
     * NOTA CORRETA
     */
    if (
        absoluteDifference <=
        CORRECT_TOLERANCE_CENTS
    ) {

        if (
            holdStartTime ===
            null
        ) {

            holdStartTime =
                performance.now();
        }


        const heldMs =
            performance.now() -
            holdStartTime;


        const requiredMs =
            currentExercise.requiredHoldMs;


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
                "Nota correta! Continue...",
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
     * Saiu da faixa correta:
     * o tempo de sustentação reinicia.
     */
    holdStartTime =
        null;


    updateExerciseProgress(
        0
    );


    /*
     * NOTA PRÓXIMA
     */
    if (
        absoluteDifference <=
        NEAR_TOLERANCE_CENTS
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
     * NOTA MAIS DISTANTE
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
 * CONCLUSÃO DA NOTA ATUAL
 * ============================================================
 */

async function completeCurrentTarget() {

    if (
        advancingNote ||
        exerciseCompleted
    ) {
        return;
    }


    advancingNote =
        true;


    holdStartTime =
        null;


    markCurrentSequenceNoteCompleted();


    const isLastNote =
        currentTargetIndex >=
        exerciseData.notes.length - 1;


    /*
     * Exercício terminado.
     */
    if (
        isLastNote
    ) {

        await completeExercise();

        return;
    }


    setFeedback(
        "Muito bem! Próxima nota...",
        "correto"
    );


    await wait(
        ADVANCE_DELAY_MS
    );


    if (
        !exerciseRunning
    ) {
        return;
    }


    currentTargetIndex++;


    recentFrequencies =
        [];


    updateTargetVisual();


    updateSequenceVisual();


    clearDetectedPitch();


    setFeedback(
        "Agora cante a próxima nota.",
        "neutro"
    );


    /*
     * Tocamos a nova nota isoladamente,
     * para ajudar nesta fase inicial.
     *
     * Mais tarde poderemos criar um modo
     * "memória", onde a sequência é ouvida
     * somente no início.
     */
    await playCurrentReference();


    advancingNote =
        false;


    lastValidPitchTime =
        performance.now();
}


/*
 * ============================================================
 * CONCLUSÃO DO EXERCÍCIO
 * ============================================================
 */

async function completeExercise() {

    exerciseCompleted =
        true;


    exerciseRunning =
        false;


    advancingNote =
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


    updateProgressRaw(
        1
    );


    setFeedback(
        "✓ Exercício concluído!",
        "correto"
    );


    elements.message.className =
        "mensagem";


    elements.message.textContent =
        "Excelente. Pressione o botão para gerar um novo exercício.";


    elements.microphoneState.textContent =
        "Microfone desligado";


    elements.microphoneState
        .classList
        .remove(
            "ativo"
        );


    elements.mainButton.textContent =
        "Novo exercício";


    elements.mainButton
        .classList
        .remove(
            "parar"
        );


    elements.listenButton.disabled =
        false;
}


/*
 * ============================================================
 * PROGRESSO
 * ============================================================
 */

function updateExerciseProgress(
    currentNoteProgress
) {

    if (
        !exerciseData
    ) {
        return;
    }


    const totalNotes =
        exerciseData.notes.length;


    /*
     * Quantidade de notas completas
     * antes da nota atual.
     */
    const completedNotes =
        currentTargetIndex;


    const totalProgress =
        (
            completedNotes +
            currentNoteProgress
        ) /
        totalNotes;


    updateProgressRaw(
        totalProgress
    );
}


function updateProgressRaw(
    progress
) {

    const limited =
        Math.max(
            0,
            Math.min(
                1,
                progress
            )
        );


    const percentage =
        Math.round(
            limited *
            100
        );


    elements.progressBar.style.width =
        `${percentage}%`;


    elements.progressText.textContent =
        `${percentage}%`;
}


/*
 * ============================================================
 * ALVO ATUAL
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
 * VISUAL DA SEQUÊNCIA
 * ============================================================
 */

function updateSequenceVisual() {

    elements.sequence.innerHTML =
        "";


    if (
        !exerciseData ||
        exerciseData.notes.length <= 1
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

    const children =
        Array.from(
            elements.sequence.children
        );


    const item =
        children[
            currentTargetIndex
        ];


    if (item) {

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
 * LEITURA DETECTADA
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
 * MEDIDOR DE DISTÂNCIA DA NOTA-ALVO
 * ============================================================
 */

function updateTargetMeter(
    cents
) {

    /*
     * Nosso medidor visual vai de:
     *
     * -100 cents → extremo esquerdo
     * +100 cents → extremo direito
     *
     * Valores maiores são apenas limitados visualmente.
     */
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


    elements.cents.className =
        "cents";


    const absolute =
        Math.abs(
            cents
        );


    if (
        absolute <=
        CORRECT_TOLERANCE_CENTS
    ) {

        elements.cents.textContent =
            "Afinado";


        elements.cents.classList.add(
            "afinado"
        );

    } else if (
        absolute <=
        NEAR_TOLERANCE_CENTS
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
 * ============================================================
 * SUAVIZAÇÃO
 * ============================================================
 */

function smoothFrequency(
    frequency
) {

    if (
        !Number.isFinite(frequency) ||
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
            sorted.length / 2
        );


    if (
        sorted.length % 2 === 1
    ) {

        return sorted[middle];
    }


    return (
        sorted[middle - 1] +
        sorted[middle]
    ) / 2;
}


/*
 * ============================================================
 * SINAL
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
 * AUSÊNCIA DE PITCH
 * ============================================================
 */

function handleNoPitch() {

    holdStartTime =
        null;


    /*
     * Se a pessoa parar de cantar durante a sustentação,
     * o tempo da nota atual reinicia.
     */
    if (
        exerciseRunning &&
        !referencePlaying &&
        !advancingNote
    ) {

        updateExerciseProgress(
            0
        );
    }


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
        exerciseRunning &&
        !referencePlaying &&
        !advancingNote
    ) {

        setFeedback(
            "Cante a nota indicada.",
            "neutro"
        );
    }
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
 * INTERFACE DE EXECUÇÃO
 * ============================================================
 */

function updateRunningInterface() {

    elements.microphoneState.textContent =
        "● Microfone ativo";


    elements.microphoneState
        .classList
        .add(
            "ativo"
        );


    elements.mainButton.textContent =
        "Interromper exercício";


    elements.mainButton
        .classList
        .add(
            "parar"
        );


    elements.listenButton.disabled =
        false;


    /*
     * Bloqueia troca de exercício durante uma sessão.
     */
    elements.exerciseButtons
        .forEach(
            button => {

                button.disabled =
                    true;
            }
        );
}


function updateStoppedInterface() {

    elements.microphoneState.textContent =
        "Microfone desligado";


    elements.microphoneState
        .classList
        .remove(
            "ativo"
        );


    elements.mainButton.textContent =
        "Iniciar exercício";


    elements.mainButton
        .classList
        .remove(
            "parar"
        );


    elements.exerciseButtons
        .forEach(
            button => {

                button.disabled =
                    false;
            }
        );
}


/*
 * ============================================================
 * RESET
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


function resetExerciseVisuals() {

    exerciseData =
        null;


    currentTargetIndex =
        0;


    exerciseCompleted =
        false;


    holdStartTime =
        null;


    recentFrequencies =
        [];


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


    clearDetectedPitch();


    updateProgressRaw(
        0
    );


    setFeedback(
        "Pressione “Iniciar exercício” para começar.",
        "neutro"
    );


    updateStoppedInterface();
}


/*
 * ============================================================
 * DESCRIÇÃO DO EXERCÍCIO
 * ============================================================
 */

function updateExerciseDescription() {

    elements.title.textContent =
        currentExercise.title;


    elements.description.textContent =
        currentExercise.description;
}


/*
 * ============================================================
 * PRÓXIMO FRAME
 * ============================================================
 */

function scheduleNextFrame() {

    animationFrameId =
        requestAnimationFrame(
            processAudio
        );
}


/*
 * ============================================================
 * UTILITÁRIO
 * ============================================================
 */

function wait(ms) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
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

        if (
            microphone.running
        ) {

            microphone.stop();
        }


        toneGenerator.close();
    }
);


/*
 * ============================================================
 * ESTADO INICIAL
 * ============================================================
 */

updateExerciseDescription();

resetExerciseVisuals();