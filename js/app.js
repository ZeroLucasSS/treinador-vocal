/*
 * ============================================================
 * app.js
 * ============================================================
 *
 * Controlador principal da Etapa 1.
 *
 * Fluxo:
 *
 * microfone
 *    ↓
 * áudio
 *    ↓
 * detector YIN
 *    ↓
 * frequência
 *    ↓
 * teoria musical
 *    ↓
 * interface
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
    analyzeFrequency
} from "./music-theory.js";


/*
 * ============================================================
 * ELEMENTOS DA INTERFACE
 * ============================================================
 */

const elements = {

    button:
        document.getElementById(
            "botaoMicrofone"
        ),

    microphoneState:
        document.getElementById(
            "estadoMicrofone"
        ),

    note:
        document.getElementById(
            "nota"
        ),

    octave:
        document.getElementById(
            "oitava"
        ),

    frequency:
        document.getElementById(
            "frequencia"
        ),

    cents:
        document.getElementById(
            "cents"
        ),

    indicator:
        document.getElementById(
            "indicador"
        ),

    midi:
        document.getElementById(
            "midi"
        ),

    idealFrequency:
        document.getElementById(
            "frequenciaIdeal"
        ),

    signalLevel:
        document.getElementById(
            "nivelSinal"
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

        /*
         * Voz masculina e feminina básica.
         *
         * Para nosso projeto atual, 70–1000 Hz é
         * uma faixa bastante segura.
         */
        minFrequency: 70,

        maxFrequency: 1000,

        threshold: 0.12
    });


/*
 * ============================================================
 * CONFIGURAÇÕES DO PROTÓTIPO
 * ============================================================
 */


/*
 * Abaixo deste RMS consideramos o sinal baixo demais
 * para tentar identificar uma nota.
 *
 * Este valor será calibrado futuramente em aparelhos reais.
 */
const MIN_RMS =
    0.01;


/*
 * Exigimos alguma confiança mínima do detector.
 */
const MIN_PROBABILITY =
    0.70;


/*
 * Quantas frequências recentes usaremos para suavizar
 * a leitura apresentada.
 */
const SMOOTHING_WINDOW =
    5;


/*
 * Quanto tempo sem uma leitura válida antes de apagarmos
 * a nota anterior da tela.
 */
const NO_PITCH_TIMEOUT =
    450;


/*
 * ============================================================
 * ESTADO
 * ============================================================
 */

let animationFrameId =
    null;


let recentFrequencies =
    [];


let lastValidPitchTime =
    0;


/*
 * ============================================================
 * BOTÃO PRINCIPAL
 * ============================================================
 */

elements.button.addEventListener(
    "click",
    async () => {

        if (microphone.running) {

            await stopMicrophone();

        } else {

            await startMicrophone();
        }
    }
);


/*
 * ============================================================
 * INICIAR
 * ============================================================
 */

async function startMicrophone() {

    elements.button.disabled =
        true;


    elements.message.className =
        "mensagem";


    elements.message.textContent =
        "Solicitando acesso ao microfone...";


    try {

        await microphone.start();


        recentFrequencies =
            [];


        lastValidPitchTime =
            performance.now();


        elements.microphoneState
            .classList
            .add("ativo");


        elements.microphoneState.textContent =
            "● Microfone ativo";


        elements.button.textContent =
            "Desativar microfone";


        elements.button
            .classList
            .add("parar");


        elements.message.textContent =
            "Cante uma vogal sustentada, como “aaaa”.";


        /*
         * Começa o ciclo contínuo de análise.
         */
        processAudio();


    } catch (error) {

        console.error(
            "Erro ao iniciar microfone:",
            error
        );


        elements.message.className =
            "mensagem erro";


        if (
            error.name ===
            "NotAllowedError"
        ) {

            elements.message.textContent =
                "A permissão do microfone foi negada. " +
                "Autorize o acesso nas configurações do navegador.";

        } else if (
            error.name ===
            "NotFoundError"
        ) {

            elements.message.textContent =
                "Nenhum microfone foi encontrado neste aparelho.";

        } else {

            elements.message.textContent =
                "Não foi possível iniciar o microfone: " +
                error.message;
        }


        resetInterface();
    }


    elements.button.disabled =
        false;
}


/*
 * ============================================================
 * PARAR
 * ============================================================
 */

async function stopMicrophone() {

    elements.button.disabled =
        true;


    if (animationFrameId !== null) {

        cancelAnimationFrame(
            animationFrameId
        );

        animationFrameId =
            null;
    }


    await microphone.stop();


    recentFrequencies =
        [];


    resetInterface();


    elements.message.className =
        "mensagem";


    elements.message.textContent =
        "Microfone desligado.";


    elements.button.disabled =
        false;
}


/*
 * ============================================================
 * CICLO DE PROCESSAMENTO
 * ============================================================
 */

function processAudio() {

    if (!microphone.running) {
        return;
    }


    const buffer =
        microphone.getTimeDomainData();


    if (!buffer) {

        scheduleNextFrame();

        return;
    }


    /*
     * Primeiro verificamos se existe sinal suficiente.
     */
    const rms =
        microphone.calculateRms(
            buffer
        );


    updateSignalLevel(rms);


    /*
     * Evitamos rodar o detector sobre quase silêncio.
     *
     * Além de economizar processamento,
     * isso evita frequências falsas.
     */
    if (
        rms <
        MIN_RMS
    ) {

        handleNoPitch();

        scheduleNextFrame();

        return;
    }


    /*
     * Detecta frequência fundamental.
     */
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


    /*
     * Adiciona a leitura ao filtro temporal.
     */
    const smoothedFrequency =
        smoothFrequency(
            detection.frequency
        );


    if (!smoothedFrequency) {

        handleNoPitch();

        scheduleNextFrame();

        return;
    }


    lastValidPitchTime =
        performance.now();


    /*
     * Converte Hz → nota musical.
     */
    const musicalData =
        analyzeFrequency(
            smoothedFrequency
        );


    if (musicalData) {

        updatePitchInterface(
            musicalData
        );
    }


    scheduleNextFrame();
}


/*
 * Solicita próxima atualização sincronizada
 * com a renderização do navegador.
 */
function scheduleNextFrame() {

    animationFrameId =
        requestAnimationFrame(
            processAudio
        );
}


/*
 * ============================================================
 * SUAVIZAÇÃO
 * ============================================================
 *
 * Uma voz real varia o tempo inteiro.
 *
 * Em vez de apresentar cada leitura bruta,
 * mantemos algumas leituras recentes e usamos a mediana.
 *
 * A mediana é muito boa para eliminar valores discrepantes.
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
        ]
        .sort(
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
 * INTERFACE — NOTA DETECTADA
 * ============================================================
 */

function updatePitchInterface(
    data
) {

    elements.note.textContent =
        data.note;


    elements.octave.textContent =
        data.octave;


    elements.frequency.textContent =
        `${data.frequency.toFixed(1)} Hz`;


    elements.midi.textContent =
        data.midi;


    elements.idealFrequency.textContent =
        `${data.idealFrequency.toFixed(1)} Hz`;


    updateCents(
        data.cents
    );
}


/*
 * ============================================================
 * MEDIDOR DE CENTS
 * ============================================================
 */

function updateCents(cents) {

    /*
     * Como a nota MIDI selecionada é sempre a mais próxima,
     * normalmente ficaremos entre -50 e +50 cents.
     */
    const limitedCents =
        Math.max(
            -50,
            Math.min(
                50,
                cents
            )
        );


    /*
     * -50 cents → 0%
     *   0 cents → 50%
     * +50 cents → 100%
     */
    const position =
        50 +
        limitedCents;


    elements.indicator.style.left =
        `${position}%`;


    const rounded =
        Math.round(cents);


    const sign =
        rounded > 0
            ? "+"
            : "";


    elements.cents.textContent =
        `${sign}${rounded} cents`;


    elements.cents.className =
        "cents";


    const absolute =
        Math.abs(cents);


    if (
        absolute <= 15
    ) {

        elements.cents.classList.add(
            "afinado"
        );


    } else if (
        absolute <= 30
    ) {

        elements.cents.classList.add(
            "proximo"
        );


    } else {

        elements.cents.classList.add(
            "distante"
        );
    }
}


/*
 * ============================================================
 * NÍVEL DO SINAL
 * ============================================================
 */

function updateSignalLevel(rms) {

    let description;


    if (rms < 0.005) {

        description =
            "Silêncio";


    } else if (rms < 0.02) {

        description =
            "Baixo";


    } else if (rms < 0.08) {

        description =
            "Bom";


    } else if (rms < 0.25) {

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

    /*
     * Não apagamos instantaneamente.
     *
     * Pequenas consoantes, respirações e interrupções
     * são normais durante o canto.
     */
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


    clearPitchDisplay();
}


/*
 * ============================================================
 * RESET DA TELA
 * ============================================================
 */

function clearPitchDisplay() {

    elements.note.textContent =
        "—";


    elements.octave.textContent =
        "";


    elements.frequency.textContent =
        "-- Hz";


    elements.cents.textContent =
        "-- cents";


    elements.cents.className =
        "cents";


    elements.indicator.style.left =
        "50%";


    elements.midi.textContent =
        "—";


    elements.idealFrequency.textContent =
        "—";
}


function resetInterface() {

    clearPitchDisplay();


    elements.signalLevel.textContent =
        "—";


    elements.microphoneState.textContent =
        "Microfone desligado";


    elements.microphoneState
        .classList
        .remove("ativo");


    elements.button.textContent =
        "Ativar microfone";


    elements.button
        .classList
        .remove("parar");
}


/*
 * ============================================================
 * LIMPEZA
 * ============================================================
 *
 * Caso o navegador descarregue a página,
 * encerramos os tracks do microfone.
 * ============================================================
 */

window.addEventListener(
    "pagehide",
    () => {

        if (microphone.running) {
            microphone.stop();
        }
    }
);


/*
 * Estado inicial.
 */
resetInterface();