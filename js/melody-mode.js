import { audioOutput, AudioDeviceControls } from "./audio-devices.js";
import { isOptionalNote, getEvaluationWindow, findVoiceTarget, isPositivePerformance } from "./evaluation-rules.js";

/*
 * ============================================================
 * melody-mode.js
 * ============================================================
 *
 * MODO MELODIA — ARQUITETURA MULTIMÚSICAS
 *
 * Este arquivo NÃO conhece nenhuma música específica.
 *
 * A música é determinada pela URL:
 *
 * melodia.html?song=ninguem-te-ama-como-eu-marcos-andre
 *
 * O catálogo é carregado de:
 *
 * ./assets/musicas/catalogo.json
 *
 * A partir do catálogo o sistema descobre:
 *
 * - título;
 * - artista;
 * - gênero;
 * - backing track MP3;
 * - MIDI vocal;
 * - letra SRT;
 * - offsets independentes de MIDI e letra.
 *
 * O MP3 continua sendo o RELÓGIO MESTRE.
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
    midiToOctave,
    isMidiInScale,
    isSamePitchClass
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


import {
    loadSrtFromUrl,
    getLyricsTime
} from "./srt-loader.js";


import {
    loadSongCatalog,
    findSongById,
    getSongAudioUrl,
    getSongMidiUrl,
    getSongLyricsUrl,
    getSongSyllablesUrl,
    getSongBackgroundVideoUrl,
    getSongOffsets
} from "./song-catalog.js";


import {
    buildKaraokeModel,
    getKaraokeStateAtTime
} from "./karaoke-engine.js";


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


const TRANSIENT_NOTE_MAX_DURATION =
    0.18;


/*
 * ============================================================
 * AVALIAÇÃO MUSICAL ALTERNATIVA
 * ============================================================
 */


/*
 * Uma nota alternativa pertencente à tonalidade pode receber
 * no máximo 70% do crédito de pitch de uma reprodução literal
 * da melodia.
 *
 * Exemplo:
 *
 * afinação perfeita da nota alternativa:
 *
 * 100 × 0.70 = 70 pontos de pitch
 */
const SCALE_ALTERNATIVE_PITCH_FACTOR =
    0.70;


/*
 * Uma classificação precisa representar pelo menos 60%
 * das amostras da nota para ser considerada predominante.
 *
 * Isso evita que execuções muito instáveis sejam rotuladas
 * artificialmente como "alternativa tonal".
 */
const DOMINANT_CLASSIFICATION_MIN_RATIO =
    0.60;




/*
 * ============================================================
 * EVENTOS PÚBLICOS DO TREINO
 * ============================================================
 *
 * O melody-mode.js continua sem conhecer o PartyMode.
 *
 * Ele apenas publica eventos neutros no document.
 *
 * Qualquer módulo interessado pode escutá-los sem criar
 * dependência direta com a lógica musical principal.
 * ============================================================
 */

const KARAOKE_EVENTS = {

    sessionStarted:
        "karaoke:session-started",

    noteFinalized:
        "karaoke:note-finalized",

    comboUpdated:
        "karaoke:combo-updated",

    sessionEnded:
        "karaoke:session-ended",

    sessionStopped:
        "karaoke:session-stopped"
};


/*
 * ============================================================
 * DISPARAR EVENTO DO TREINO
 * ============================================================
 */

function dispatchKaraokeEvent(
    eventName,
    detail =
        {}
) {

    if (
        !eventName
    ) {

        return;
    }


    document.dispatchEvent(
        new CustomEvent(
            eventName,
            {
                detail
            }
        )
    );
}


/*
 * ============================================================
 * DETALHES DE UMA NOTA FINALIZADA
 * ============================================================
 *
 * Criamos um objeto simples e independente.
 *
 * O PartyMode NÃO recebe a referência original do noteState,
 * portanto não poderá alterar acidentalmente a avaliação.
 * ============================================================
 */

function buildKaraokeNoteEventDetail(
    state
) {

    if (
        !state
    ) {

        return null;
    }


    return {

        optional: state.optional,

        noteIndex:
            state.index,

        expectedMidi:
            state.midi,

        sungMidi:
            state.dominantSungMidi,

        score:
            state.score,

        performanceScore: state.performanceScore,

        pitchScore:
            state.pitchScore,

        timingScore:
            state.timingScore,

        durationScore:
            state.durationScore,

        status:
            state.status,

        visualStatus:
            state.visualStatus,

        classification:
            state.dominantVoiceClassification,

        classificationRatio:
            state.dominantVoiceRatio,

        coverage:
            state.coverage,

        expectedDuration:
            state.expectedDuration,

        requiredCoverage:
            getRequiredCoverageForNote(
                state.expectedDuration,
                getCurrentDifficulty()
            ),

        transient:
            state.expectedDuration > 0 &&
            state.expectedDuration <= TRANSIENT_NOTE_MAX_DURATION,

        onsetErrorMs:
            state.onsetErrorMs,

        averageCents:
            state.averageCents,

        voiceSamples:
            state.voiceSamples,

        combo:
            currentCombo,

        bestCombo:
            bestCombo,

        songTime:
            currentSongTime,

        songId:
            currentSong?.id ??
            null,

        songTitle:
            currentSong?.title ??
            null
    };
}


/*
 * ============================================================
 * RESUMO DA SESSÃO
 * ============================================================
 */

function buildKaraokeSessionSummary() {

    const evaluatedStates = noteStates.filter(state => !state.optional);

    const total =
        evaluatedStates.length;


    const sung =
        evaluatedStates.filter(
            state =>
                state.voiceSamples >
                0
        );


    const missed =
        evaluatedStates.filter(
            state =>
                state.status ===
                "missed"
        );


    const melodyNotes =
        evaluatedStates.filter(
            state =>
                state.dominantVoiceClassification ===
                    "exactMelody" ||
                state.dominantVoiceClassification ===
                    "octaveMelody"
        );


    const alternativeNotes =
        evaluatedStates.filter(
            state =>
                state.dominantVoiceClassification ===
                "scaleAlternative"
        );


    const outOfKeyNotes =
        evaluatedStates.filter(
            state =>
                state.dominantVoiceClassification ===
                "outOfKey"
        );


    const unstableNotes =
        evaluatedStates.filter(
            state =>
                state.voiceSamples >
                    0 &&
                state.dominantVoiceClassification ===
                    null
        );


    const totalScore =
        total >
        0
            ? Math.round(
                calculateAverage(
                    evaluatedStates.map(
                        state =>
                            state.score
                    )
                )
            )
            : 0;


    return {

        songId:
            currentSong?.id ??
            null,

        songTitle:
            currentSong?.title ??
            null,

        optionalNotes: noteStates.length - total,
        hasEvaluation: total > 0,

        totalNotes:
            total,

        sungNotes:
            sung.length,

        melodyNotes:
            melodyNotes.length,

        alternativeNotes:
            alternativeNotes.length,

        outOfKeyNotes:
            outOfKeyNotes.length,

        missedNotes:
            missed.length,

        unstableNotes:
            unstableNotes.length,

        totalScore,

        bestCombo,

        songTime:
            currentSongTime
    };
}



/*
 * ============================================================
 * DIFICULDADES
 * ============================================================
 *
 * tolerance:
 * faixa considerada afinada/correta.
 *
 * near:
 * faixa ainda considerada próxima da nota.
 *
 * requiredCoverage:
 * cobertura máxima exigida, aproximada em notas longas.
 *
 * minimumCoverage:
 * cobertura mínima da curva após a região transitória.
 *
 * coverageTau:
 * constante de tempo em segundos para o crescimento exponencial.
 * Notas de até 180 ms satisfazem duração com uma amostra vocal.
 *
 * A duração do MIDI pode não corresponder exatamente
 * à duração natural de uma sílaba cantada, especialmente
 * quando o MIDI foi obtido por conversão automática de voz.
 * ============================================================
 */

const DIFFICULTIES = {

    beginner: {

        // MODO KARAOKÊ
        tolerance:
            150,

        near:
            300,

        /*
         * Afinação interna da nota realmente cantada.
         *
         * Exemplo:
         *
         * usuário canta A4 + 18 cents
         *
         * mesmo que o alvo MIDI seja C5,
         * estes valores medem a qualidade do A4.
         */
        tuningTolerance:
            40,

        tuningNear:
            50,

        requiredCoverage:
            0.18,

        minimumCoverage:
            0.03,

        coverageTau:
            0.55,

        excellentOnsetMs:
            450,

        acceptableOnsetMs:
            1000
    },


    intermediate: {

        // MODO TREINO
        tolerance:
            150,

        near:
            300,

        tuningTolerance:
            40,

        tuningNear:
            50,

        requiredCoverage:
            0.25,

        minimumCoverage:
            0.04,

        coverageTau:
            0.55,

        excellentOnsetMs:
            450,

        acceptableOnsetMs:
            1000
    },


    advanced: {

        // MODO COVER
        tolerance:
            70,

        near:
            140,

        tuningTolerance:
            25,

        tuningNear:
            45,

        requiredCoverage:
            0.45,

        minimumCoverage:
            0.08,

        coverageTau:
            0.6,

        excellentOnsetMs:
            250,

        acceptableOnsetMs:
            600
    }
};


/*
 * ============================================================
 * ELEMENTOS
 * ============================================================
 */

const elements = {

    songTitle:
        document.getElementById(
            "tituloMusica"
        ),

    songArtist:
        document.getElementById(
            "artistaMusica"
        ),

    songGenre:
        document.getElementById(
            "generoMusica"
        ),


    backingFileStatus:
        document.getElementById(
            "statusBackingTrack"
        ),

    midiStatus:
        document.getElementById(
            "statusMidi"
        ),

    lyricsStatus:
        document.getElementById(
            "statusLetra"
        ),


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


    midiOffsetValue:
        document.getElementById(
            "valorOffsetMidi"
        ),

    lyricsOffsetValue:
        document.getElementById(
            "valorOffsetLetra"
        ),


    backingAudio:
        document.getElementById(
            "backingTrackAudio"
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


    lyricsPanel:
        document.getElementById(
            "painelLetra"
        ),

    currentLyrics:
        document.getElementById(
            "letraAtual"
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


    /*
     * ========================================================
     * GAMIFICAÇÃO
     * ========================================================
     */

    currentCombo:
        document.getElementById(
            "comboAtual"
        ),

    comboValue:
        document.getElementById(
            "comboValor"
        ),

    stageSticker:
        document.getElementById(
            "adesivoPalco"
        ),

    gamifiedFeedback:
        document.getElementById(
            "feedbackGamificado"
        ),

    gamifiedFeedbackText:
        document.getElementById(
            "feedbackGamificadoTexto"
        ),

    gamifiedFeedbackIcon:
        document.querySelector(
            "#feedbackGamificado .feedback-gamificado-icone"
        ),

    scoreHighlight:
        document.querySelector(
            ".pontuacao-destaque"
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


    /*
    * ========================================================
    * CLASSIFICAÇÃO MUSICAL DO RESULTADO
    * ========================================================
    */

    /*
    * Melodia original:
    *
    * exactMelody
    * +
    * octaveMelody
    */
    resultNotes:
        document.getElementById(
            "resultadoNotas"
        ),


    /*
    * Nota diferente da melodia,
    * mas pertencente à tonalidade.
    */
    resultAlternatives:
        document.getElementById(
            "resultadoAlternativas"
        ),


    /*
    * Nota predominante fora da tonalidade.
    */
    resultOutOfKey:
        document.getElementById(
            "resultadoForaDoTom"
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


    /*
     * Gamificação do resultado final.
     */
    finalResultSticker:
        document.getElementById(
            "resultadoSeloFinal"
        ),

    resultBestCombo:
        document.getElementById(
            "resultadoMelhorCombo"
        ),

    resultExcellentNotes:
        document.getElementById(
            "resultadoExcelentes"
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
 * VALIDAR ELEMENTOS
 * ============================================================
 */

validateRequiredElements();


function validateRequiredElements() {

    const required = {

        seletorTrilhaMidi:
            elements.trackSelect,

        seletorDificuldade:
            elements.difficultySelect,

        botaoOuvir:
            elements.melodyListenButton,

        botaoOuvirInstrumental:
            elements.backingListenButton,

        botaoIniciar:
            elements.startButton,

        confirmarFones:
            elements.headphoneConfirmation,

        backingTrackAudio:
            elements.backingAudio,

        pianoRoll:
            elements.canvas,

        estado:
            elements.state,

        estadoMicrofone:
            elements.microphoneState,

        estadoBacking:
            elements.backingState,

        progressoMusica:
            elements.progress,

        pontuacaoAtual:
            elements.currentScore,

        nomeMelodia:
            elements.melodyName,

        contador:
            elements.counter,

        tempoAtual:
            elements.currentTime,

        tempoTotal:
            elements.totalTime,

        barraTempo:
            elements.timeBar,

        valorOffsetMidi:
            elements.midiOffsetValue,

        valorOffsetLetra:
            elements.lyricsOffsetValue,

        painelLetra:
            elements.lyricsPanel,

        letraAtual:
            elements.currentLyrics,

        notaEsperada:
            elements.expectedNote,

        notaCantada:
            elements.sungNote,

        feedback:
            elements.feedback,

        erroAtual:
            elements.currentError,

        precisao:
            elements.accuracy,

        notasAvaliadas:
            elements.evaluatedNotes,

        entradaAtual:
            elements.currentOnset,

        coberturaAtual:
            elements.currentCoverage,

        pontuacaoNotaAtual:
            elements.currentNoteScore,


        /*
         * Gamificação.
         */
        comboAtual:
            elements.currentCombo,

        comboValor:
            elements.comboValue,

        adesivoPalco:
            elements.stageSticker,

        feedbackGamificado:
            elements.gamifiedFeedback,

        feedbackGamificadoTexto:
            elements.gamifiedFeedbackText,

        feedbackGamificadoIcone:
            elements.gamifiedFeedbackIcon,

        pontuacaoDestaque:
            elements.scoreHighlight,


        resultado:
            elements.result,

        pontuacaoFinal:
            elements.finalScore,

        avaliacaoFinal:
            elements.finalEvaluation,

        resultadoPrecisao:
            elements.resultAccuracy,


        resultadoErro:
            elements.resultError,


        resultadoNotas:
            elements.resultNotes,


        resultadoAlternativas:
            elements.resultAlternatives,


        resultadoForaDoTom:
            elements.resultOutOfKey,


        resultadoEntrada:
            elements.resultOnset,


        resultadoCobertura:
            elements.resultCoverage,


        resultadoOmitidas:
            elements.resultMissed,


        resultadoSeloFinal:
            elements.finalResultSticker,

        resultadoMelhorCombo:
            elements.resultBestCombo,

        resultadoExcelentes:
            elements.resultExcellentNotes,

        listaResultadosNotas:
            elements.noteResultsList,

        botaoRepetir:
            elements.repeatButton
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

let catalog =
    null;


let currentSong =
    null;


let midiData =
    null;


let selectedTrack =
    null;


let selectedMelody =
    null;


let backingUrl =
    null;


let midiUrl =
    null;


let lyricsUrl =
    null;


/*
 * SRT silábico.
 *
 * Este arquivo pertence à mesma linha temporal
 * do MIDI e utiliza melodyOffsetSeconds.
 */
let syllablesUrl =
    null;


/*
 * Vídeo de fundo opcional.
 *
 * Apenas repassado ao Modo Festa via
 * karaoke:session-started.
 */
let backgroundVideoUrl =
    null;


/*
 * Positivo = atrasar MIDI.
 * Negativo = adiantar MIDI.
 */
let melodyOffsetSeconds =
    0;


/*
 * Positivo = atrasar letra.
 * Negativo = adiantar letra.
 */
let lyricsOffsetSeconds =
    0;


let subtitles =
    [];


let currentSubtitleIndex =
    0;


/*
 * ============================================================
 * KARAOKÊ SILÁBICO
 * ============================================================
 */

/*
 * Conteúdo bruto de voz_silabas.srt.
 */
let syllableSubtitles =
    [];


/*
 * Modelo construído pelo karaoke-engine.js.
 *
 * Contém:
 *
 * frase ↔ sílabas ↔ notas MIDI
 */
let karaokeModel =
    null;


/*
 * Estado visual atualmente renderizado.
 *
 * Serve para evitar reconstruir o DOM da letra
 * desnecessariamente em todos os frames.
 */
let renderedKaraokePhraseIndex =
    null;


let renderedKaraokeSyllableIndex =
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


let backingSongTime =
    0;


let currentSongTime =
    0;


let recentFrequencies =
    [];


let lastVoicePointTimestamp =
    0;


let currentTargetIndex =
    0;


let nextFinalizeIndex =
    0;


/*
 * ============================================================
 * GAMIFICAÇÃO
 * ============================================================
 *
 * A gamificação é exclusivamente visual.
 *
 * Ela NÃO modifica:
 *
 * - score da nota;
 * - score final;
 * - tolerâncias;
 * - classificação de dificuldade.
 */

let currentCombo =
    0;


let bestCombo =
    0;


let gamifiedFeedbackTimer =
    null;


let stageStickerTimer =
    null;


/*
 * ============================================================
 * INICIALIZAÇÃO
 * ============================================================
 */

let audioDeviceControls = null;

initialize();


async function initialize() {

    audioDeviceControls = new AudioDeviceControls({
        microphone,
        prepareOutput: () => toneGenerator.ensureContext(),
        beforeChange: () => {
            stopBackingPreview();
            stopMelodyPreview();
        },
        onCaptureLost: async message => {
            await stopTraining();
            setFeedback(message, "errado");
        }
    });
    audioDeviceControls.init();
    await audioOutput.register(elements.backingAudio);
    setLoadingState();


    try {

        /*
         * ====================================================
         * 1. CATÁLOGO
         * ====================================================
         *
         * O carregamento e a normalização agora pertencem
         * exclusivamente ao song-catalog.js.
         *
         * Isso garante que:
         *
         * - key;
         * - mode;
         * - difficulty;
         * - language;
         * - offsets;
         * - arquivos;
         * - gênero;
         *
         * cheguem ao melody-mode.js já normalizados.
         * ====================================================
         */

        catalog =
            await loadSongCatalog();


        /*
         * ====================================================
         * 2. ID SOLICITADO NA URL
         * ====================================================
         */

        const songId =
            getSongIdFromUrl();


        /*
         * ====================================================
         * 3. LOCALIZAR MÚSICA
         * ====================================================
         *
         * Também delegamos essa responsabilidade
         * ao song-catalog.js.
         * ====================================================
         */

        currentSong =
            findSongById(
                catalog,
                songId
            );


        if (
            !currentSong
        ) {

            throw new Error(
                songId
                    ? `A música "${songId}" não foi encontrada no catálogo.`
                    : "Nenhuma música foi informada."
            );
        }


        /*
         * Diagnóstico útil durante esta etapa de evolução.
         */
        console.info(
            "🎵 Música carregada pelo song-catalog:",
            {
                id:
                    currentSong.id,

                title:
                    currentSong.title,

                genre:
                    currentSong.genre,

                genreName:
                    currentSong.genreName,

                key:
                    currentSong.key,

                mode:
                    currentSong.mode
            }
        );


        /*
         * ====================================================
         * 4. PREPARAR MÚSICA
         * ====================================================
         */

        prepareSong(
            currentSong
        );


        /*
         * ====================================================
         * 5. MP3
         * ====================================================
         */

        setupBackingTrack();


        /*
         * ====================================================
         * 6. MIDI
         * ====================================================
         *
         * Precisa ser carregado antes da construção
         * do modelo de karaokê.
         * ====================================================
         */

        await loadVocalMidi();


        /*
         * ====================================================
         * 7. LETRA TRADICIONAL
         * ====================================================
         */

        await loadLyrics();


        /*
         * ====================================================
         * 8. LETRA SILÁBICA
         * ====================================================
         */

        await loadSyllables();


        /*
         * ====================================================
         * 9. MODELO DO KARAOKÊ
         * ====================================================
         */

        rebuildKaraokeModel();


        /*
         * ====================================================
         * 10. LIBERAR INTERFACE
         * ====================================================
         */

        checkFilesReady();


    } catch (error) {

        handleInitializationError(
            error
        );
    }
}


/*
 * ============================================================
 * ESTADO INICIAL
 * ============================================================
 */

function setLoadingState() {

    elements.state.textContent =
        "Carregando";


    elements.backingFileStatus.textContent =
        "Carregando...";


    elements.midiStatus.textContent =
        "Carregando...";


    elements.lyricsStatus.textContent =
        "Carregando...";


    elements.melodyName.textContent =
        "Carregando...";


    elements.trackSelect.disabled =
        true;


    elements.melodyListenButton.disabled =
        true;


    elements.backingListenButton.disabled =
        true;


    elements.startButton.disabled =
        true;


    setFeedback(
        "Carregando os arquivos da música...",
        "neutro"
    );
}


/*
 * ============================================================
 * ID DA MÚSICA
 * ============================================================
 */

function getSongIdFromUrl() {

    const params =
        new URLSearchParams(
            window.location.search
        );


    const value =
        params.get(
            "song"
        ) ||
        params.get(
            "id"
        );


    return (
        value
            ? value.trim()
            : null
    );
}


/*
 * ============================================================
 * PREPARAR MÚSICA
 * ============================================================
 */

function prepareSong(
    song
) {

    const offsets =
        getSongOffsets(
            song
        );


    melodyOffsetSeconds =
        offsets.midi;


    lyricsOffsetSeconds =
        offsets.lyrics;


    backingUrl =
        getSongAudioUrl(
            song
        );


    midiUrl =
        getSongMidiUrl(
            song
        );


    lyricsUrl =
        getSongLyricsUrl(
            song
        );


    syllablesUrl =
        getSongSyllablesUrl(
            song
        );


    backgroundVideoUrl =
        getSongBackgroundVideoUrl(
            song
        );


    if (
        !backingUrl ||
        !midiUrl
    ) {

        throw new Error(
            `A música "${song.id}" não possui os arquivos obrigatórios de áudio e MIDI.`
        );
    }


    /*
     * ========================================================
     * TONALIDADE
     * ========================================================
     *
     * Enviamos a tonalidade da música ao piano roll.
     *
     * O PianoRoll é responsável somente pela representação
     * visual da escala.
     *
     * Isso NÃO modifica:
     *
     * - pontuação;
     * - cents;
     * - tolerâncias;
     * - resultado das notas;
     * - combo.
     * ========================================================
     */

    if (
        song.key &&
        song.mode
    ) {

        pianoRoll.setKeySignature(
            song.key,
            song.mode
        );


        console.info(
            "🎼 Tonalidade da música:",
            {
                key:
                    song.key,

                mode:
                    song.mode
            }
        );

    } else {

        /*
         * Fallback defensivo.
         *
         * Se uma música antiga não possuir tonalidade,
         * simplesmente não mostramos as linhas.
         */
        pianoRoll.clearKeySignature();


        console.warn(
            `A música "${song.id}" não possui key/mode.`
        );
    }


    updateSyncInterface();


    document.title =
        `${song.title} — Treinador Vocal`;


    if (
        elements.songTitle
    ) {

        elements.songTitle.textContent =
            song.title ||
            "—";
    }


    if (
        elements.songArtist
    ) {

        elements.songArtist.textContent =
            song.artist ||
            "—";
    }


    if (
        elements.songGenre
    ) {

        elements.songGenre.textContent =
            song.genreName ||
            song.genre ||
            "";
    }


    elements.melodyName.textContent =
        song.title ||
        "Melodia vocal";


    elements.backingAudio.pause();


    elements.backingAudio.removeAttribute(
        "src"
    );


    elements.backingAudio.src =
        backingUrl;
}


/*
 * ============================================================
 * BACKING TRACK
 * ============================================================
 */


/*
 * ============================================================
 * DESBLOQUEAR ÁUDIO EM DISPOSITIVOS MÓVEIS
 * ============================================================
 *
 * Safari/iOS e alguns navegadores Android exigem que a
 * primeira reprodução de um elemento <audio> aconteça
 * diretamente dentro de uma ação do usuário.
 *
 * No treino normal existe:
 *
 * clique
 *   ↓
 * microfone
 *   ↓
 * countdown
 *   ↓
 * audio.play()
 *
 * Nesse momento alguns navegadores já não consideram o
 * play() parte do gesto original.
 *
 * Portanto fazemos uma reprodução silenciosa imediatamente
 * após o clique e pausamos em seguida.
 *
 * Depois disso o mesmo elemento de áudio fica "desbloqueado"
 * para a reprodução real após a contagem regressiva.
 * ============================================================
 */

async function unlockBackingAudio() {

    const audio =
        elements.backingAudio;


    if (
        !audio ||
        !audio.src
    ) {

        throw new Error(
            "O instrumental ainda não foi preparado."
        );
    }


    /*
     * Se já desbloqueamos este elemento nesta página,
     * não há necessidade de repetir todo o processo.
     */
    if (
        audio.dataset.mobileUnlocked ===
        "true"
    ) {

        return;
    }


    const previousMuted =
        audio.muted;


    const previousVolume =
        audio.volume;


    const previousTime =
        Number.isFinite(
            audio.currentTime
        )
            ? audio.currentTime
            : 0;


    try {

        /*
         * Muted é preferível a volume = 0 em dispositivos
         * móveis, pois navegadores tratam mídia silenciada
         * de maneira mais permissiva.
         */
        audio.muted =
            true;


        audio.volume =
            0;


        /*
         * IMPORTANTE:
         *
         * Esta chamada precisa acontecer enquanto ainda
         * estamos diretamente dentro do clique do usuário.
         */
        const playPromise =
            audio.play();


        if (
            playPromise &&
            typeof playPromise.then ===
            "function"
        ) {

            await playPromise;
        }


        /*
         * Uma vez aceito o play(), o elemento foi liberado.
         */
        audio.pause();


        try {

            audio.currentTime =
                previousTime;

        } catch (error) {

            /*
             * Alguns navegadores podem não permitir seek
             * enquanto os metadados ainda não estão totalmente
             * disponíveis. Isso não impede o desbloqueio.
             */
            console.debug(
                "Não foi possível restaurar o tempo durante o desbloqueio:",
                error
            );
        }


        audio.dataset.mobileUnlocked =
            "true";


        console.info(
            "Backing track desbloqueado para reprodução móvel."
        );


    } catch (error) {

        console.warn(
            "Não foi possível desbloquear o backing track:",
            error
        );


        throw error;


    } finally {

        audio.muted =
            previousMuted;


        audio.volume =
            previousVolume;
    }
}


function setupBackingTrack() {

    elements.backingAudio.onloadedmetadata =
        () => {

            const duration =
                elements.backingAudio.duration;


            elements.totalTime.textContent =
                formatTime(
                    duration
                );


            elements.backingFileStatus.textContent =
                `Pronto — ${formatTime(duration)}`;


            if (
                Number.isFinite(
                    Number(
                        currentSong?.duration
                    )
                )
            ) {

                const expected =
                    Number(
                        currentSong.duration
                    );


                const difference =
                    Math.abs(
                        duration -
                        expected
                    );


                if (
                    difference >
                    3
                ) {

                    console.warn(
                        "A duração do MP3 difere da duração cadastrada:",
                        {
                            catalogo:
                                expected,

                            mp3:
                                duration,

                            diferenca:
                                difference
                        }
                    );
                }
            }


            checkFilesReady();
        };


    elements.backingAudio.onerror =
        () => {

            elements.backingFileStatus.textContent =
                "Erro ao carregar";


            elements.startButton.disabled =
                true;


            setFeedback(
                "Não foi possível carregar o instrumental desta música.",
                "errado"
            );


            console.error(
                "Erro ao carregar backing track:",
                backingUrl
            );
        };


    elements.backingAudio.onended =
        () => {

            if (
                running
            ) {

                finishTraining();
            }
        };


    elements.backingAudio.load();
}


/*
 * ============================================================
 * MIDI
 * ============================================================
 */

async function loadVocalMidi() {

    elements.midiStatus.textContent =
        "Lendo arquivo...";


    midiData =
        await loadMidiFromUrl(
            midiUrl
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
            "Nenhuma nota foi encontrada no MIDI vocal."
        );
    }


    populateTrackSelector(
        playableTracks
    );


    const bestTrack =
        chooseBestMelodyTrack(
            midiData
        );


    if (
        !bestTrack
    ) {

        throw new Error(
            "Não foi possível identificar uma trilha melódica no MIDI."
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
        `${playableTracks.length} trilha(s) · ${totalNotes} notas`;


    checkFilesReady();
}


/*
 * ============================================================
 * LETRA SRT
 * ============================================================
 */

/*
 * ============================================================
 * CARREGAR LETRA TRADICIONAL
 * ============================================================
 *
 * letra.srt
 *
 * Responsável por preservar:
 *
 * - palavras completas;
 * - espaços;
 * - acentos;
 * - pontuação;
 * - organização das frases.
 *
 * Continua opcional.
 * ============================================================
 */

async function loadLyrics() {

    subtitles =
        [];


    currentSubtitleIndex =
        0;


    resetLyricsInterface();


    if (
        !lyricsUrl
    ) {

        elements.lyricsStatus.textContent =
            "Não disponível";


        elements.currentLyrics.textContent =
            "Letra não disponível";


        elements.currentLyrics.classList.add(
            "sem-frase"
        );


        updateSyncControlsState();

        return;
    }


    elements.lyricsStatus.textContent =
        "Lendo letra...";


    try {

        subtitles =
            await loadSrtFromUrl(
                lyricsUrl
            );


        if (
            subtitles.length ===
            0
        ) {

            elements.lyricsStatus.textContent =
                "Letra vazia";


            elements.currentLyrics.textContent =
                "Letra não disponível";


            updateSyncControlsState();

            return;
        }


        elements.lyricsStatus.textContent =
            `${subtitles.length} frase(s)`;


        resetLyricsInterface();


    } catch (error) {

        console.warn(
            "Não foi possível carregar letra.srt:",
            error
        );


        subtitles =
            [];


        elements.lyricsStatus.textContent =
            "Erro na letra";


        elements.currentLyrics.textContent =
            "Letra não disponível";


        elements.currentLyrics.classList.add(
            "sem-frase"
        );
    }


    rebuildKaraokeModel();


    updateSyncControlsState();
}


/*
 * ============================================================
 * CARREGAR SRT SILÁBICO
 * ============================================================
 *
 * voz_silabas.srt
 *
 * Cada entrada representa uma sílaba associada
 * temporalmente a uma nota MIDI.
 *
 * O arquivo é opcional.
 *
 * Se não existir, o aplicativo continua funcionando
 * com a legenda tradicional.
 * ============================================================
 */

async function loadSyllables() {

    syllableSubtitles =
        [];


    karaokeModel =
        null;


    renderedKaraokePhraseIndex =
        null;


    renderedKaraokeSyllableIndex =
        null;


    if (
        !syllablesUrl
    ) {

        console.info(
            "[KARAOKE] Música sem voz_silabas.srt. " +
            "Usando legenda tradicional."
        );


        updateLyricsFileStatus();

        return;
    }


    try {

        syllableSubtitles =
            await loadSrtFromUrl(
                syllablesUrl
            );


        if (
            syllableSubtitles.length ===
            0
        ) {

            console.warn(
                "[KARAOKE] voz_silabas.srt está vazio."
            );


            updateLyricsFileStatus();

            return;
        }


        console.info(
            `[KARAOKE] ${syllableSubtitles.length} sílaba(s) carregada(s).`
        );


    } catch (error) {

        console.warn(
            "[KARAOKE] Não foi possível carregar voz_silabas.srt:",
            error
        );


        syllableSubtitles =
            [];
    }


    rebuildKaraokeModel();


    updateLyricsFileStatus();
}


/*
 * ============================================================
 * STATUS DOS ARQUIVOS DE LETRA
 * ============================================================
 */

function updateLyricsFileStatus() {

    if (
        subtitles.length >
            0 &&
        syllableSubtitles.length >
            0
    ) {

        elements.lyricsStatus.textContent =
            (
                `${subtitles.length} frase(s) · ` +
                `${syllableSubtitles.length} sílaba(s)`
            );


        return;
    }


    if (
        subtitles.length >
        0
    ) {

        elements.lyricsStatus.textContent =
            `${subtitles.length} frase(s)`;


        return;
    }


    if (
        syllableSubtitles.length >
        0
    ) {

        elements.lyricsStatus.textContent =
            `${syllableSubtitles.length} sílaba(s)`;


        return;
    }


    elements.lyricsStatus.textContent =
        "Não disponível";
}


/*
 * ============================================================
 * CONSTRUIR MODELO DO KARAOKÊ
 * ============================================================
 *
 * IMPORTANTE:
 *
 * Utilizamos selectedTrack.notes,
 * e NÃO selectedMelody.notes.
 *
 * Motivo:
 *
 * selectedMelody já possui melodyOffsetSeconds aplicado.
 *
 * voz_silabas.srt contém os tempos originais do MIDI.
 *
 * O offset será aplicado posteriormente por
 * getKaraokeStateAtTime().
 *
 * Isso evita aplicar o offset duas vezes.
 * ============================================================
 */

function rebuildKaraokeModel() {

    karaokeModel =
        null;


    renderedKaraokePhraseIndex =
        null;


    renderedKaraokeSyllableIndex =
        null;


    /*
     * Para o modo completo precisamos:
     *
     * frase + sílabas + MIDI.
     */
    if (
        subtitles.length ===
            0 ||
        syllableSubtitles.length ===
            0 ||
        !selectedTrack ||
        !Array.isArray(
            selectedTrack.notes
        ) ||
        selectedTrack.notes.length ===
            0
    ) {

        return;
    }


    try {

        karaokeModel =
            buildKaraokeModel({

                phrases:
                    subtitles,

                syllables:
                    syllableSubtitles,

                /*
                 * TEMPOS MIDI ORIGINAIS.
                 */
                notes:
                    selectedTrack.notes
            });


        if (
            !karaokeModel ||
            !karaokeModel.valid
        ) {

            console.warn(
                "[KARAOKE] O modelo não pôde ser validado. " +
                "A legenda tradicional será utilizada."
            );


            karaokeModel =
                null;


            return;
        }


        console.info(
            "[KARAOKE] Modelo ativado com sucesso.",
            {
                mode:
                    karaokeModel.mode,

                frases:
                    karaokeModel.phrases.length,

                silabas:
                    karaokeModel.syllables.length,

                pares:
                    karaokeModel.pairs.length
            }
        );


    } catch (error) {

        console.error(
            "[KARAOKE] Erro ao construir modelo:",
            error
        );


        karaokeModel =
            null;
    }
}


/*
 * ============================================================
 * SELETOR DE TRILHAS
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
                track.name ||
                `Trilha ${track.index + 1}`;


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
 * SELECIONAR TRILHA
 * ============================================================
 */

function selectMidiTrack(
    trackIndex
) {

    if (
        !midiData
    ) {

        return;
    }


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


    if (
        !selectedTrack
    ) {

        throw new Error(
            "Trilha MIDI não encontrada."
        );
    }


    rebuildSelectedMelody();


    /*
    * A troca de trilha MIDI também exige
    * reconstruir a relação nota ↔ sílaba.
    */
    rebuildKaraokeModel();


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
        currentSong.title;


    const description =
        buildTrackDescription(
            selectedTrack
        );


    if (
        selectedTrack.polyphonic
    ) {

        setFeedback(
            `${description}. Atenção: esta trilha contém notas simultâneas.`,
            "proximo"
        );

    } else {

        setFeedback(
            description,
            "neutro"
        );
    }


    updateSyncControlsState();
}


/*
 * ============================================================
 * CONSTRUIR MELODIA APLICANDO OFFSET
 * ============================================================
 */

function rebuildSelectedMelody() {

    if (
        !selectedTrack ||
        !currentSong
    ) {

        return;
    }


    selectedMelody = {

        id:
            `${currentSong.id}-track-${selectedTrack.index}`,

        name:
            currentSong.title,

        artist:
            currentSong.artist ||
            "",

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
                        Math.max(
                            0,
                            note.start +
                            melodyOffsetSeconds
                        ),

                    duration:
                        note.duration
                })
            )
    };
}


/*
 * ============================================================
 * OFFSET MIDI
 * ============================================================
 */

function setMidiOffset(
    value
) {

    const numeric =
        Number(
            value
        );


    if (
        !Number.isFinite(
            numeric
        )
    ) {

        return;
    }


    melodyOffsetSeconds =
        roundOffset(
            numeric
        );


    rebuildSelectedMelody();


    if (
        selectedMelody
    ) {

        pianoRoll.setMelody(
            selectedMelody
        );


        pianoRoll.setCurrentTime(
            currentSongTime
        );


        currentTargetIndex =
            0;


        nextFinalizeIndex =
            0;


        updateExpectedNoteInterface(
            currentSongTime
        );
    }

    /*
     * MIDI e sílabas compartilham offset.
     */
    renderedKaraokePhraseIndex =
        null;


    renderedKaraokeSyllableIndex =
        null;


    updateLyricsInterface(
        backingSongTime
    );


    updateSyncInterface();
}


/*
 * ============================================================
 * OFFSET LETRA
 * ============================================================
 */

function setLyricsOffset(
    value
) {

    const numeric =
        Number(
            value
        );


    if (
        !Number.isFinite(
            numeric
        )
    ) {

        return;
    }


    lyricsOffsetSeconds =
        roundOffset(
            numeric
        );


    currentSubtitleIndex =
        0;


    /*
     * No modo karaokê, o tempo principal da frase
     * é determinado pela linha temporal vocal:
     *
     * MIDI + voz_silabas.srt.
     *
     * Portanto lyricsOffset permanece relevante
     * somente para o fallback tradicional.
     */
    if (
        !karaokeModel ||
        !karaokeModel.valid
    ) {

        updateLyricsInterface(
            backingSongTime
        );
    }


    updateSyncInterface();
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


    const type =
        track.polyphonic
            ? "polifônica"
            : "monofônica";


    return (
        `${track.noteCount} notas · ` +
        `${formatTime(track.duration)} · ` +
        `${minNote} a ${maxNote} · ` +
        type
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
        Array.isArray(
            selectedMelody.notes
        ) &&
        selectedMelody.notes.length >
            0;


    elements.backingListenButton.disabled =
        !mp3Ready;


    elements.melodyListenButton.disabled =
        !midiReady;


    if (
        mp3Ready &&
        midiReady
    ) {

        elements.startButton.disabled =
            false;


        elements.state.textContent =
            "Pronto";


        setFeedback(
            "Instrumental e melodia vocal carregados. Use fones de ouvido para iniciar o treino.",
            "neutro"
        );
    }


    updateSyncControlsState();
}


/*
 * ============================================================
 * EVENTOS PRINCIPAIS
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
            elements.trackSelect.value
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

        if (audioDeviceControls?.busy) return;

        if (
            running ||
            countdownRunning
        ) {

            await stopTraining();

            return;
        }


        /*
         * ====================================================
         * DESBLOQUEIO DE ÁUDIO MOBILE
         * ====================================================
         *
         * Precisa acontecer AQUI, diretamente no clique,
         * antes de:
         *
         * - microphone.start()
         * - countdown()
         * - qualquer espera assíncrona prolongada
         *
         * Isso é especialmente importante em:
         *
         * - Safari / iPhone / iPad
         * - Chrome Android
         * - dispositivos com fones Bluetooth
         * ====================================================
         */

        try {

            await unlockBackingAudio();


        } catch (error) {

            console.error(
                "Falha ao liberar reprodução do instrumental:",
                error
            );


            setFeedback(
                "O navegador bloqueou a reprodução do instrumental. Toque novamente em iniciar.",
                "errado"
            );


            return;
        }


        await startTraining();
    }
);


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


        await startTraining();
    }
);


/*
 * ============================================================
 * BOTÕES DE SINCRONIZAÇÃO
 * ============================================================
 */

document.querySelectorAll(
    ".botao-sync"
)
.forEach(
    button => {

        button.addEventListener(
            "click",
            () => {

                if (
                    running ||
                    countdownRunning ||
                    melodyPreviewPlaying
                ) {

                    return;
                }


                const target =
                    button.dataset.syncTarget;


                const reset =
                    button.dataset.syncReset ===
                    "true";


                const delta =
                    Number(
                        button.dataset.syncDelta ||
                        0
                    );


                if (
                    target ===
                    "midi"
                ) {

                    setMidiOffset(
                        reset
                            ? 0
                            : melodyOffsetSeconds +
                                delta
                    );

                    return;
                }


                if (
                    target ===
                    "lyrics"
                ) {

                    setLyricsOffset(
                        reset
                            ? 0
                            : lyricsOffsetSeconds +
                                delta
                    );
                }
            }
        );
    }
);


/*
 * ============================================================
 * PRÉVIA DO INSTRUMENTAL
 * ============================================================
 */

async function startBackingPreview() {

    if (audioDeviceControls?.busy) return;

    if (
        !Number.isFinite(
            elements.backingAudio.duration
        )
    ) {

        setFeedback(
            "O instrumental ainda não está disponível.",
            "errado"
        );


        return;
    }


    stopMelodyPreview();


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


    elements.backingAudio.pause();


    elements.backingAudio.currentTime =
        0;


    backingSongTime =
        0;


    currentSongTime =
        0;


    currentTargetIndex =
        0;


    currentSubtitleIndex =
        0;


    pianoRoll.setCurrentTime(
        0
    );


    pianoRoll.clearVoice();


    updateTimeInterface(
        0
    );


    resetLyricsInterface();


    try {

        await audioOutput.apply(elements.backingAudio);
        await elements.backingAudio.play();


        animateBackingPreview();


    } catch (error) {

        console.error(
            "Erro ao reproduzir instrumental:",
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


    backingSongTime =
        elements.backingAudio.currentTime;


    currentSongTime =
        backingSongTime;


    pianoRoll.setCurrentTime(
        currentSongTime
    );


    updateTimeInterface(
        backingSongTime
    );


    updateExpectedNoteInterface(
        currentSongTime
    );


    updateLyricsInterface(
        backingSongTime
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


    try {

        elements.backingAudio.currentTime =
            0;

    } catch {
        // Nenhuma ação necessária.
    }


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


    elements.backingState.textContent =
        "Parado";


    if (
        !running &&
        !countdownRunning
    ) {

        elements.state.textContent =
            "Pronto";
    }


    backingSongTime =
        0;


    currentSongTime =
        0;


    currentTargetIndex =
        0;


    currentSubtitleIndex =
        0;


    pianoRoll.setCurrentTime(
        0
    );


    updateTimeInterface(
        0
    );


    updateExpectedNoteInterface(
        0
    );


    resetLyricsInterface();


    lockControls(
        false
    );
}


/*
 * ============================================================
 * PRÉVIA DA MELODIA MIDI
 * ============================================================
 */

async function startMelodyPreview() {

    if (audioDeviceControls?.busy) return;

    if (
        !selectedMelody
    ) {

        return;
    }


    stopBackingPreview();


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


    currentSongTime =
        0;


    currentTargetIndex =
        0;


    pianoRoll.setCurrentTime(
        0
    );


    pianoRoll.clearVoice();


    updateTimeInterface(
        0
    );


    resetLyricsInterface();


    try {

        await toneGenerator.ensureContext();


        const previewStart =
            performance.now();


        selectedMelody.notes.forEach(
            note => {

                const timer =
                    window.setTimeout(
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


        animateMelodyPreview(
            previewStart
        );


    } catch (error) {

        console.error(
            "Erro na prévia MIDI:",
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


    updateExpectedNoteInterface(
        currentSongTime
    );


    const melodyDuration =
        getMelodyDuration(
            selectedMelody
        );


    updatePreviewTimeInterface(
        currentSongTime,
        melodyDuration
    );


    if (
        currentSongTime >=
        melodyDuration
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


    if (
        !running &&
        !countdownRunning
    ) {

        elements.state.textContent =
            "Pronto";
    }


    currentSongTime =
        0;


    currentTargetIndex =
        0;


    pianoRoll.setCurrentTime(
        0
    );


    updateTimeInterface(
        0
    );


    updateExpectedNoteInterface(
        0
    );


    resetLyricsInterface();


    lockControls(
        false
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

                optional: isOptionalNote(note.duration, elements.difficultySelect.value),

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

                lastVoiceTime:
                    null,

                lastSampleTime:
                    null,

                voiceSamples:
                    0,

                /*
                 * Estes contadores continuam representando
                 * proximidade da MELodia original.
                 */
                correctSamples:
                    0,

                nearSamples:
                    0,


                /*
                 * ====================================================
                 * ERRO DE AFINAÇÃO REAL
                 * ====================================================
                 *
                 * centsValues agora representa o erro em relação
                 * à NOTA REALMENTE CANTADA.
                 *
                 * Exemplo:
                 *
                 * A4 + 8 cents
                 *
                 * armazena:
                 *
                 * 8
                 */
                centsValues:
                    [],


                /*
                 * Distância em cents até a nota MIDI original.
                 *
                 * É preservada como informação de fidelidade
                 * à melodia.
                 */
                melodyCentsValues:
                    [],


                /*
                 * Pontuação musical calculada para cada amostra.
                 *
                 * Aqui já entram:
                 *
                 * exactMelody       × 1.00
                 * octaveMelody      × 1.00
                 * scaleAlternative  × 0.70
                 * outOfKey          × 0.00
                 */
                samplePitchScores:
                    [],

                // Afinação sem desconto pela escolha de uma alternativa tonal.
                samplePerformanceScores: [],
                performanceScore: 0,


                voicedTime:
                    0,


                /*
                 * ====================================================
                 * CLASSIFICAÇÃO MUSICAL
                 * ====================================================
                 */

                voiceClassifications: {

                    exactMelody:
                        0,

                    octaveMelody:
                        0,

                    scaleAlternative:
                        0,

                    outOfKey:
                        0
                },


                /*
                 * Quantas vezes cada MIDI arredondado foi detectado.
                 *
                 * Exemplo:
                 *
                 * {
                 *     69: 18,
                 *     67: 3
                 * }
                 *
                 * permitirá concluir que A4 (MIDI 69)
                 * foi a nota predominante.
                 */
                sungMidiCounts:
                    Object.create(
                        null
                    ),


                dominantVoiceClassification:
                    null,

                dominantVoiceRatio:
                    0,

                dominantSungMidi:
                    null,


                finalized:
                    false,

                /*
                * Classificação tradicional de desempenho.
                *
                * Continua sendo usada por:
                *
                * - combo;
                * - gamificação;
                * - estatísticas;
                * - resultado numérico.
                */
                status:
                    "pending",


                /*
                * Estado exclusivamente visual da barra.
                *
                * Pode assumir também:
                *
                * "alternative"
                *
                * sem alterar state.status.
                */
                visualStatus:
                    "pending",


                score:
                    0,

                onsetErrorMs:
                    null,


                /*
                 * Erro médio de afinação da nota realmente cantada.
                 */
                averageCents:
                    null,


                /*
                 * Distância média até a melodia original.
                 *
                 * Guardamos separadamente para uso futuro
                 * nos resultados detalhados.
                 */
                averageMelodyCents:
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


    currentTargetIndex =
        0;


    nextFinalizeIndex =
        0;
}


/*
 * ============================================================
 * INICIAR TREINO
 * ============================================================
 */


/*
 * ============================================================
 * CONFIGURAR SESSÃO DE ÁUDIO PARA PLAYBACK + MICROFONE
 * ============================================================
 *
 * Em navegadores compatíveis, especialmente Safari/iOS,
 * informamos explicitamente que esta página precisa:
 *
 * - reproduzir áudio;
 * - capturar microfone;
 * - fazer ambas as coisas simultaneamente.
 *
 * Isso ajuda o sistema operacional a escolher corretamente
 * a rota de áudio, inclusive com headsets Bluetooth.
 * ============================================================
 */

function configurePlayAndRecordAudioSession() {

    try {

        if (
            "audioSession" in navigator &&
            navigator.audioSession
        ) {

            /*
             * Primeiro voltamos ao modo automático.
             *
             * Em alguns dispositivos iOS isso ajuda a forçar
             * uma nova avaliação da rota de áudio.
             */
            navigator.audioSession.type =
                "auto";


            console.info(
                "AudioSession definida temporariamente como auto."
            );

        }

    } catch (error) {

        console.warn(
            "Não foi possível redefinir AudioSession:",
            error
        );
    }
}


/*
 * ============================================================
 * ATIVAR MODO PLAY-AND-RECORD
 * ============================================================
 */

function activatePlayAndRecordAudioSession() {

    try {

        if (
            "audioSession" in navigator &&
            navigator.audioSession
        ) {

            navigator.audioSession.type =
                "play-and-record";


            console.info(
                "AudioSession definida como play-and-record."
            );
        }

    } catch (error) {

        console.warn(
            "Não foi possível ativar play-and-record:",
            error
        );
    }
}


async function startTraining() {

    if (audioDeviceControls?.busy) return;

    if (
        !selectedMelody
    ) {

        setFeedback(
            "A melodia desta música ainda não foi carregada.",
            "errado"
        );


        return;
    }


    if (
        !Number.isFinite(
            elements.backingAudio.duration
        )
    ) {

        setFeedback(
            "O instrumental ainda não está pronto.",
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


    elements.startButton.disabled =
        false;


    try {

        /*
        * ========================================================
        * PREPARAR ROTEAMENTO DE ÁUDIO MOBILE
        * ========================================================
        */

        configurePlayAndRecordAudioSession();


        /*
        * Abrimos o microfone primeiro.
        *
        * É nesse momento que o sistema pode mudar o perfil
        * Bluetooth de reprodução para headset/telefonia.
        */
        await microphone.start(audioDeviceControls?.inputId || null);
        audioDeviceControls?.captureStarted();
        if (microphone.stream?.getAudioTracks()[0]?.readyState === "ended") {
            throw new Error("O microfone foi desconectado. Atualize os dispositivos e tente novamente.");
        }


        /*
        * Agora declaramos explicitamente que precisamos
        * reproduzir E gravar simultaneamente.
        *
        * Em iOS isso pode forçar uma correção da rota
        * de entrada/saída após o getUserMedia().
        */
        activatePlayAndRecordAudioSession();


        /*
        * IMPORTANTE:
        *
        * mantenha esta ordem:
        *
        * 1. resetInterfaceStatistics()
        * 2. createNoteStates()
        */

        resetInterfaceStatistics();

        createNoteStates();


        pianoRoll.setMelody(
            selectedMelody
        );


        pianoRoll.setCurrentTime(
            0
        );


        pianoRoll.clearVoice();


        pianoRoll.clearNoteResults();

        noteStates.filter(state => state.optional).forEach(state => {
            pianoRoll.setNoteResult(state.index, { status: "optional", score: null });
        });
        updateLiveStatistics();


        resetLyricsInterface();


        recentFrequencies =
            [];


        lastVoicePointTimestamp =
            0;


        elements.microphoneState.textContent =
            "Ativo";


        elements.backingState.textContent =
            "Aguardando";


        elements.state.textContent =
            "Preparando";


        setFeedback(
            "Prepare-se para cantar.",
            "neutro"
        );


        countdownRunning =
            true;


        updateSyncControlsState();


        const completed =
            await countdown();


        countdownRunning =
            false;


        if (
            !completed
        ) {

            return;
        }


        elements.backingAudio.pause();


        elements.backingAudio.currentTime =
            0;


        /*
        * ============================================================
        * INICIAR BACKING TRACK
        * ============================================================
        *
        * O elemento já deve ter sido desbloqueado pelo clique
        * do usuário antes da chamada de startTraining().
        *
        * Mesmo assim tratamos especificamente uma eventual
        * falha de reprodução para não confundi-la com erro
        * de permissão do microfone.
        * ============================================================
        */

        try {

            await audioOutput.apply(elements.backingAudio);
            await elements.backingAudio.play();


        } catch (audioError) {

            console.error(
                "Erro ao iniciar backing track durante o treino:",
                audioError
            );


            setFeedback(
                "O instrumental não pôde ser reproduzido. Toque novamente em iniciar.",
                "errado"
            );


            throw new Error(
                `Falha na reprodução do instrumental: ${
                    audioError.message ||
                    audioError.name ||
                    "erro desconhecido"
                }`
            );
        }


        running =
            true;


        backingSongTime =
            0;


        currentSongTime =
            0;


        currentSubtitleIndex =
            0;


        /*
        * ========================================================
        * EVENTO — SESSÃO INICIADA
        * ========================================================
        *
        * Somente publicamos depois que:
        *
        * - microfone foi preparado;
        * - countdown terminou;
        * - backing track conseguiu tocar;
        * - running passou para true.
        *
        * Assim evitamos criar uma sessão falsa caso o início falhe.
        * ========================================================
        */

        dispatchKaraokeEvent(
            KARAOKE_EVENTS.sessionStarted,
            {
                songId:
                    currentSong?.id ??
                    null,

                songTitle:
                    currentSong?.title ??
                    null,

                artist:
                    currentSong?.artist ??
                    null,

                key:
                    currentSong?.key ??
                    null,

                mode:
                    currentSong?.mode ??
                    null,

                singingMode:
                    elements.difficultySelect.value,

                totalNotes:
                    noteStates.filter(state => !state.optional).length,

                optionalNotes: noteStates.filter(state => state.optional).length,

                backgroundVideo:
                    backgroundVideoUrl ??
                    null
            }
        );


        elements.state.textContent =
            "Cantando";


        elements.backingState.textContent =
            "Tocando";


        setFeedback(
            "Acompanhe o instrumental, a letra e a melodia no piano roll.",
            "neutro"
        );


        updateSyncControlsState();


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

            if (
                !countdownRunning
            ) {

                return false;
            }


            elements.counter.textContent =
                String(
                    value
                );


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


        return countdownRunning;


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
     * MP3 = RELÓGIO MESTRE.
     */
    backingSongTime =
        elements.backingAudio.currentTime;


    currentSongTime =
        backingSongTime;


    pianoRoll.setCurrentTime(
        currentSongTime
    );


    updateTimeInterface(
        backingSongTime
    );


    updateExpectedNoteInterface(
        currentSongTime
    );


    updateLyricsInterface(
        backingSongTime
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
            null ||
        !Number.isFinite(
            midiFloat
        )
    ) {

        return;
    }


    /*
     * ========================================================
     * TRAÇADO DA VOZ
     * ========================================================
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
     * ========================================================
     * NOTA CANTADA NA INTERFACE
     * ========================================================
     */

    updateSungNote(
        midiFloat
    );


    /*
     * ========================================================
     * AVALIAÇÃO
     * ========================================================
     *
     * Além da frequência, agora enviamos também o MIDI
     * fracionário detectado.
     *
     * A pontuação continua usando frequency normalmente.
     *
     * midiFloat será utilizado apenas para a nova
     * classificação musical.
     * ========================================================
     */

    evaluateVoiceSample(
        frequency,
        currentSongTime,
        midiFloat
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

    if (
        !selectedMelody ||
        selectedMelody.notes.length ===
            0
    ) {

        return null;
    }


    if (
        currentTargetIndex >
        0 &&
        selectedMelody.notes[
            currentTargetIndex
        ]?.start >
        time
    ) {

        currentTargetIndex =
            0;
    }


    while (
        currentTargetIndex <
        selectedMelody.notes.length
    ) {

        const note =
            selectedMelody.notes[
                currentTargetIndex
            ];


        const end =
            note.start +
            note.duration;


        if (
            time >=
            end
        ) {

            currentTargetIndex++;

            continue;
        }


        break;
    }


    const note =
        selectedMelody.notes[
            currentTargetIndex
        ];


    if (
        !note
    ) {

        return null;
    }


    if (
        time >=
            note.start &&
        time <
            note.start +
            note.duration
    ) {

        return {

            note,

            index:
                currentTargetIndex
        };
    }


    return null;
}


/*
 * ============================================================
 * CLASSIFICAÇÃO MUSICAL DA VOZ
 * ============================================================
 */

function classifyVoicePitch(
    midiFloat,
    targetMidi
) {

    const sungMidi =
        Math.round(
            Number(
                midiFloat
            )
        );


    const expectedMidi =
        Math.round(
            Number(
                targetMidi
            )
        );


    if (
        !Number.isFinite(
            sungMidi
        ) ||
        !Number.isFinite(
            expectedMidi
        )
    ) {

        return null;
    }


    /*
     * ========================================================
     * 1. MELODIA EXATA
     * ========================================================
     *
     * Mesma nota e mesma oitava.
     *
     * Exemplo:
     *
     * alvo: C5
     * voz:  C5
     */

    if (
        sungMidi ===
        expectedMidi
    ) {

        return "exactMelody";
    }


    /*
     * ========================================================
     * 2. MESMA NOTA EM OUTRA OITAVA
     * ========================================================
     *
     * Exemplo:
     *
     * alvo: C5
     * voz:  C4
     */

    if (
        isSamePitchClass(
            sungMidi,
            expectedMidi
        )
    ) {

        return "octaveMelody";
    }


    /*
     * ========================================================
     * 3. ALTERNATIVA TONAL
     * ========================================================
     */

    if (
        currentSong?.key &&
        currentSong?.mode &&
        isMidiInScale(
            sungMidi,
            currentSong.key,
            currentSong.mode
        )
    ) {

        return "scaleAlternative";
    }


    /*
     * ========================================================
     * 4. FORA DO TOM
     * ========================================================
     */

    return "outOfKey";
}


/*
 * ============================================================
 * REGISTRAR CLASSIFICAÇÃO
 * ============================================================
 */

function registerVoiceClassification(
    state,
    classification
) {

    if (
        !state ||
        !classification ||
        !state.voiceClassifications
    ) {

        return;
    }


    if (
        !Object.prototype.hasOwnProperty.call(
            state.voiceClassifications,
            classification
        )
    ) {

        return;
    }


    state.voiceClassifications[
        classification
    ]++;
}


/*
 * ============================================================
 * REGISTRAR MIDI REALMENTE CANTADO
 * ============================================================
 */

function registerSungMidi(
    state,
    midiFloat
) {

    if (
        !state
    ) {

        return;
    }


    const sungMidi =
        Math.round(
            Number(
                midiFloat
            )
        );


    if (
        !Number.isFinite(
            sungMidi
        )
    ) {

        return;
    }


    const key =
        String(
            sungMidi
        );


    state.sungMidiCounts[
        key
    ] =
        (
            state.sungMidiCounts[
                key
            ] ||
            0
        ) +
        1;
}


/*
 * ============================================================
 * MIDI CANTADO PREDOMINANTE
 * ============================================================
 */

function getDominantSungMidi(
    state
) {

    if (
        !state ||
        !state.sungMidiCounts
    ) {

        return null;
    }


    const entries =
        Object.entries(
            state.sungMidiCounts
        );


    if (
        entries.length ===
        0
    ) {

        return null;
    }


    entries.sort(
        (
            a,
            b
        ) =>
            Number(
                b[1]
            ) -
            Number(
                a[1]
            )
    );


    const midi =
        Number(
            entries[0][0]
        );


    return Number.isFinite(
        midi
    )
        ? midi
        : null;
}


/*
 * ============================================================
 * CLASSIFICAÇÃO PREDOMINANTE
 * ============================================================
 *
 * Uma categoria somente é considerada predominante quando
 * representa pelo menos 60% das amostras válidas.
 *
 * Caso contrário:
 *
 * classification = null
 *
 * A pontuação continua funcionando normalmente pela média
 * das amostras; apenas não rotulamos a execução como uma
 * categoria musical estável.
 * ============================================================
 */

function getDominantVoiceClassificationSummary(
    state
) {

    if (
        !state ||
        !state.voiceClassifications
    ) {

        return {
            classification:
                null,

            ratio:
                0
        };
    }


    const entries =
        Object.entries(
            state.voiceClassifications
        );


    const total =
        entries.reduce(
            (
                sum,
                [, count]
            ) =>
                sum +
                Number(
                    count ||
                    0
                ),
            0
        );


    if (
        total <=
        0
    ) {

        return {
            classification:
                null,

            ratio:
                0
        };
    }


    entries.sort(
        (
            a,
            b
        ) =>
            Number(
                b[1]
            ) -
            Number(
                a[1]
            )
    );


    const [
        classification,
        count
    ] =
        entries[0];


    const ratio =
        Number(
            count
        ) /
        total;


    return {

        classification:
            ratio >=
            DOMINANT_CLASSIFICATION_MIN_RATIO
                ? classification
                : null,

        ratio
    };
}


/*
 * ============================================================
 * PONTUAÇÃO DE PITCH DE UMA ÚNICA AMOSTRA
 * ============================================================
 *
 * Primeiro avaliamos quão afinada está a NOTA REALMENTE
 * cantada.
 *
 * Depois aplicamos o valor musical daquela escolha:
 *
 * exactMelody       → × 1.00
 * octaveMelody      → × 1.00
 * scaleAlternative  → × 0.70
 * outOfKey          → × 0.00
 * ============================================================
 */

function calculateSamplePitchScore(
    classification,
    absoluteTuningCents,
    difficulty
) {

    if (
        !classification ||
        !Number.isFinite(
            absoluteTuningCents
        )
    ) {

        return 0;
    }


    const tolerance =
        Math.max(
            1,
            Number(
                difficulty.tuningTolerance ??
                30
            )
        );


    const near =
        Math.max(
            tolerance +
                1,
            Number(
                difficulty.tuningNear ??
                50
            )
        );


    let tuningScore =
        0;


    /*
     * Dentro da região afinada:
     *
     * 0 cents         → 100
     * limite tolerance → 80
     */
    if (
        absoluteTuningCents <=
        tolerance
    ) {

        tuningScore =
            100 -
            (
                absoluteTuningCents /
                tolerance
            ) *
            20;

    } else if (
        absoluteTuningCents <=
        near
    ) {

        /*
         * Região de aproximação:
         *
         * tolerance → 80
         * near      → 0
         */

        const ratio =
            (
                absoluteTuningCents -
                tolerance
            ) /
            (
                near -
                tolerance
            );


        tuningScore =
            80 *
            (
                1 -
                ratio
            );

    } else {

        tuningScore =
            0;
    }


    let musicalFactor =
        0;


    switch (
        classification
    ) {

        case "exactMelody":

        case "octaveMelody":

            musicalFactor =
                1;

            break;


        case "scaleAlternative":

            musicalFactor =
                SCALE_ALTERNATIVE_PITCH_FACTOR;

            break;


        case "outOfKey":

        default:

            musicalFactor =
                0;

            break;
    }


    return clampScore(
        tuningScore *
        musicalFactor
    );
}


/*
 * ============================================================
 * AVALIAÇÃO DA VOZ
 * ============================================================
 */

function evaluateVoiceSample(
    frequency,
    time,
    midiFloat
) {

    const target =
        findVoiceTarget(
            selectedMelody.notes, noteStates, time, midiFloat,
            elements.difficultySelect.value, nextFinalizeIndex
        );


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


    if (
        !state ||
        state.finalized
    ) {

        return;
    }


    if (state.optional) {
        elements.currentNoteScore.textContent = "Opcional";
        elements.currentError.textContent = "—";
        elements.currentOnset.textContent = "—";
        elements.currentCoverage.textContent = "—";
        return;
    }

    const difficulty =
        getCurrentDifficulty();


    /*
     * ========================================================
     * NOTA REALMENTE CANTADA
     * ========================================================
     */

    const sungMidi =
        Math.round(
            midiFloat
        );


    const sungFrequency =
        midiToFrequency(
            sungMidi
        );


    /*
     * ========================================================
     * ERRO DE AFINAÇÃO REAL
     * ========================================================
     *
     * Mede a frequência contra o centro da nota que o cantor
     * realmente está produzindo.
     *
     * Exemplo:
     *
     * A4 + 7 cents
     *
     * → tuningCents = +7
     */

    const tuningCents =
        1200 *
        Math.log2(
            frequency /
            sungFrequency
        );


    const absTuningCents =
        Math.abs(
            tuningCents
        );


    /*
     * ========================================================
     * DISTÂNCIA ATÉ A MELODIA ORIGINAL
     * ========================================================
     *
     * Guardamos separadamente.
     */

    const targetFrequency =
        midiToFrequency(
            note.midi
        );


    const melodyCents =
        1200 *
        Math.log2(
            frequency /
            targetFrequency
        );


    const absMelodyCents =
        Math.abs(
            melodyCents
        );


    /*
     * ========================================================
     * CLASSIFICAÇÃO MUSICAL
     * ========================================================
     */

    const voiceClassification =
        classifyVoicePitch(
            midiFloat,
            note.midi
        );


    registerVoiceClassification(
        state,
        voiceClassification
    );


    registerSungMidi(
        state,
        midiFloat
    );


    /*
     * ========================================================
     * SCORE DE PITCH DA AMOSTRA
     * ========================================================
     */

    const samplePitchScore =
        calculateSamplePitchScore(
            voiceClassification,
            absTuningCents,
            difficulty
        );


    state.samplePitchScores.push(
        samplePitchScore
    );

    state.samplePerformanceScores.push(
        calculateSamplePitchScore(
            voiceClassification === "scaleAlternative" ? "exactMelody" : voiceClassification,
            absTuningCents,
            difficulty
        )
    );


    /*
     * ========================================================
     * ENTRADA
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
     * COBERTURA / SUSTENTAÇÃO
     * ========================================================
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

            const evaluationWindow = getEvaluationWindow(
                selectedMelody.notes, index, elements.difficultySelect.value
            );

            const intervalStart =
                Math.max(
                    state.lastSampleTime,
                    evaluationWindow.start
                );


            const intervalEnd =
                Math.min(
                    time,
                    evaluationWindow.end
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


    /*
     * centsValues agora representa a afinação real
     * da nota escolhida.
     */
    state.centsValues.push(
        absTuningCents
    );


    /*
     * Distância para a melodia original continua disponível
     * separadamente.
     */
    state.melodyCentsValues.push(
        absMelodyCents
    );


    /*
     * ========================================================
     * CONTADORES DE FIDELIDADE À MELODIA
     * ========================================================
     *
     * Apenas melodia exata ou adaptação de oitava contam
     * como reprodução da nota melódica.
     */

    const isMelodicNote =
        voiceClassification ===
            "exactMelody" ||
        voiceClassification ===
            "octaveMelody";


    if (
        isMelodicNote &&
        absTuningCents <=
            difficulty.tuningTolerance
    ) {

        state.correctSamples++;

    } else if (
        isMelodicNote &&
        absTuningCents <=
            difficulty.tuningNear
    ) {

        state.nearSamples++;
    }


    /*
     * ========================================================
     * INTERFACE — ERRO ATUAL
     * ========================================================
     *
     * Agora mostramos o erro de afinação da nota realmente
     * cantada, e não a distância brutal até a nota MIDI.
     */

    const roundedTuningCents =
        Math.round(
            tuningCents
        );


    elements.currentError.textContent =
        `${
            roundedTuningCents >
            0
                ? "+"
                : ""
        }${roundedTuningCents} cents`;


    elements.currentOnset.textContent =
        formatSignedMilliseconds(
            state.onsetErrorMs
        );


    const liveCoverage =
        calculateLiveCoverage(
            state,
            time
        );


    elements.currentCoverage.textContent =
        `${Math.round(
            liveCoverage *
            100
        )}%`;


    const liveScores =
        calculateNoteScores(
            state,
            false,
            time
        );


    elements.currentNoteScore.textContent =
        String(
            liveScores.totalScore
        );


    elements.accuracy.textContent =
        `${liveScores.pitchScore}%`;


    /*
     * ========================================================
     * FEEDBACK MUSICAL
     * ========================================================
     */

    switch (
        voiceClassification
    ) {

        case "exactMelody": {

            if (
                absTuningCents <=
                difficulty.tuningTolerance
            ) {

                setFeedback(
                    "Afinado!",
                    "correto"
                );

            } else {

                setFeedback(
                    tuningCents <
                        0
                        ? "Quase — suba um pouco."
                        : "Quase — desça um pouco.",
                    "proximo"
                );
            }

            break;
        }


        case "octaveMelody": {

            if (
                absTuningCents <=
                difficulty.tuningTolerance
            ) {

                setFeedback(
                    "Mesma nota em outra oitava.",
                    "correto"
                );

            } else {

                setFeedback(
                    tuningCents <
                        0
                        ? "Outra oitava — suba um pouco."
                        : "Outra oitava — desça um pouco.",
                    "proximo"
                );
            }

            break;
        }


        case "scaleAlternative": {

            if (
                absTuningCents <=
                difficulty.tuningNear
            ) {

                setFeedback(
                    "Nota alternativa dentro do tom.",
                    "proximo"
                );

            } else {

                setFeedback(
                    tuningCents <
                        0
                        ? "Alternativa no tom — suba um pouco."
                        : "Alternativa no tom — desça um pouco.",
                    "proximo"
                );
            }

            break;
        }


        case "outOfKey":

        default: {

            setFeedback(
                "Nota fora da tonalidade.",
                "errado"
            );

            break;
        }
    }
}


/*
 * ============================================================
 * FINALIZAR NOTAS EXPIRADAS
 * ============================================================
 */

function finalizeExpiredNotes(
    time
) {

    while (
        nextFinalizeIndex <
        selectedMelody.notes.length
    ) {

        const note =
            selectedMelody.notes[
                nextFinalizeIndex
            ];


        const evaluationEnd =
            Math.max(
                note.start + note.duration + NOTE_TIME_MARGIN,
                getEvaluationWindow(selectedMelody.notes, nextFinalizeIndex,
                    elements.difficultySelect.value).end
            );


        if (
            time <
            evaluationEnd
        ) {

            break;
        }


        finalizeNote(
            nextFinalizeIndex
        );


        nextFinalizeIndex++;
    }
}


/*
 * ============================================================
 * FINALIZAR NOTA
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


    state.finalized =
        true;

    if (state.optional) {
        state.status = "optional";
        state.visualStatus = "optional";
        state.score = null;
        state.performanceScore = null;
        pianoRoll.setNoteResult(index, { status: "optional", score: null });
        updateLiveStatistics();
        dispatchKaraokeEvent(KARAOKE_EVENTS.noteFinalized, buildKaraokeNoteEventDetail(state));
        return;
    }


    /*
     * ========================================================
     * NOTA NÃO CANTADA
     * ========================================================
     */

    if (
        state.voiceSamples ===
        0
    ) {

        state.status =
            "missed";


        state.visualStatus =
            "missed";


        state.score =
            0;


        state.averageCents =
            null;


        state.averageMelodyCents =
            null;


        state.coverage =
            0;


        state.pitchScore =
            0;


        state.timingScore =
            0;


        state.durationScore =
            0;


        state.dominantVoiceClassification =
            null;


        state.dominantVoiceRatio =
            0;


        state.dominantSungMidi =
            null;


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


        handleFinalizedNoteGamification(
            state
        );


        /*
        * Mesmo uma nota omitida é informação importante
        * para o PartyMode.
        *
        * Neste ponto o combo já foi atualizado.
        */
        dispatchKaraokeEvent(
            KARAOKE_EVENTS.noteFinalized,
            buildKaraokeNoteEventDetail(
                state
            )
        );


        return;
    }


    /*
     * ========================================================
     * AFINAÇÃO CONSOLIDADA
     * ========================================================
     */

    state.averageCents =
        state.centsValues.length >
            0
            ? calculateAverage(
                state.centsValues
            )
            : null;


    state.averageMelodyCents =
        state.melodyCentsValues.length >
            0
            ? calculateAverage(
                state.melodyCentsValues
            )
            : null;


    state.coverage =
        calculateCoverage(
            state
        );


    /*
     * ========================================================
     * CLASSIFICAÇÃO MUSICAL PREDOMINANTE
     * ========================================================
     */

    const classificationSummary =
        getDominantVoiceClassificationSummary(
            state
        );


    state.dominantVoiceClassification =
        classificationSummary.classification;


    state.dominantVoiceRatio =
        classificationSummary.ratio;


    /*
     * ========================================================
     * NOTA REALMENTE CANTADA
     * ========================================================
     */

    state.dominantSungMidi =
        getDominantSungMidi(
            state
        );


    /*
     * ========================================================
     * SCORES
     * ========================================================
     */

    const scores =
        calculateNoteScores(
            state,
            true,
            state.expectedEnd
        );


    state.pitchScore =
        scores.pitchScore;


    state.timingScore =
        scores.timingScore;


    state.durationScore =
        scores.durationScore;


    state.score =
        scores.totalScore;

    state.performanceScore = scores.performanceScore;


    /*
     * ========================================================
     * CLASSIFICAÇÃO TRADICIONAL DO SCORE
     * ========================================================
     *
     * Mantemos por enquanto:
     *
     * excellent
     * partial
     * error
     *
     * No próximo passo, piano-roll.js combinará isso com
     * dominantVoiceClassification para mostrar o ciano
     * das alternativas tonais.
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
    * ESTADO VISUAL DA BARRA
    * ========================================================
    *
    * A classificação numérica e a classificação visual
    * são deliberadamente independentes.
    *
    *
    * state.status
    *
    *     excellent
    *     partial
    *     error
    *     missed
    *
    * continua representando a QUALIDADE DA EXECUÇÃO.
    *
    *
    * state.visualStatus
    *
    * pode assumir também:
    *
    *     alternative
    *
    * e representa a NATUREZA MUSICAL da execução no
    * piano roll.
    *
    *
    * Portanto:
    *
    * scaleAlternative predominante
    *     → barra roxa
    *
    * exactMelody
    * octaveMelody
    * classificação instável
    *     → mantém verde / amarelo / vermelho conforme score
    *
    *
    * IMPORTANTE:
    *
    * Esta decisão NÃO modifica:
    *
    * - state.status;
    * - state.score;
    * - pitchScore;
    * - timingScore;
    * - durationScore;
    * - combo;
    * - gamificação.
    * ========================================================
    */

    let visualStatus =
        state.status;


    /*
    * Uma alternativa tonal somente recebe o estado visual
    * especial quando ela foi suficientemente predominante.
    *
    * Essa segurança já está embutida em:
    *
    * dominantVoiceClassification
    *
    * porque getDominantVoiceClassificationSummary()
    * exige o limite definido em:
    *
    * DOMINANT_CLASSIFICATION_MIN_RATIO.
    */
    if (
        state.dominantVoiceClassification ===
        "scaleAlternative"
    ) {

        visualStatus =
            "alternative";
    }


    /*
    * Guardamos também no estado da nota para que,
    * futuramente, o resultado final possa consultar
    * exatamente como a barra foi apresentada.
    */
    state.visualStatus =
        visualStatus;


    /*
    * ========================================================
    * PIANO ROLL
    * ========================================================
    */

    pianoRoll.setNoteResult(
        index,
        {
            status:
                state.visualStatus,

            score:
                state.score
        }
    );


    /*
     * Diagnóstico temporário útil durante os testes.
     */
    console.debug(
        "🎤 Nota vocal finalizada:",
        {
            expectedMidi:
                state.midi,

            sungMidi:
                state.dominantSungMidi,

            classification:
                state.dominantVoiceClassification,

            classificationRatio:
                Math.round(
                    state.dominantVoiceRatio *
                    100
                ),

            performanceStatus:
                state.status,

            visualStatus:
                state.visualStatus,

            pitchScore:
                state.pitchScore,

            expectedDuration:
                state.expectedDuration,

            coverage:
                state.coverage,

            requiredCoverage:
                getRequiredCoverageForNote(
                    state.expectedDuration,
                    getCurrentDifficulty()
                ),

            durationScore:
                state.durationScore,

            transient:
                state.expectedDuration > 0 &&
                state.expectedDuration <= TRANSIENT_NOTE_MAX_DURATION,

            totalScore:
                state.score
        }
    );


    updateLiveStatistics();


    handleFinalizedNoteGamification(
        state
    );


    /*
    * ========================================================
    * EVENTO — NOTA FINALIZADA
    * ========================================================
    *
    * Disparamos somente DEPOIS da gamificação porque
    * handleFinalizedNoteGamification() atualiza o combo.
    *
    * Assim o PartyMode já recebe:
    *
    * combo
    * bestCombo
    *
    * em seus valores finais para esta nota.
    * ========================================================
    */

    dispatchKaraokeEvent(
        KARAOKE_EVENTS.noteFinalized,
        buildKaraokeNoteEventDetail(
            state
        )
    );
}


/*
 * ============================================================
 * GAMIFICAÇÃO — NOTA FINALIZADA
 * ============================================================
 */

function handleFinalizedNoteGamification(
    state
) {

    if (
        !state
    ) {

        return;
    }


    /*
     * Primeiro atualizamos a sequência.
     *
     * A função retorna uma configuração especial
     * quando um marco de combo é atingido.
     */
    const comboFeedback =
        updateCombo(
            state
        );


    /*
     * Marcos de combo têm prioridade visual sobre
     * o feedback normal da nota.
     */
    if (
        comboFeedback
    ) {

        showGamifiedFeedback(
            comboFeedback
        );


        updateStageSticker(
            comboFeedback.text,
            "estado-combo"
        );


        pulseScoreHighlight();


        return;
    }


    /*
     * Feedback pedagógico normal da nota.
     */
    const feedback =
        getGamifiedFeedback(
            state
        );


    if (
        feedback
    ) {

        showGamifiedFeedback(
            feedback
        );


        updateStageSticker(
            feedback.stickerText ??
                feedback.text,
            feedback.stickerClass ??
                "estado-ritmo"
        );
    }


    /*
     * O placar recebe pulso apenas quando houve
     * um resultado positivo.
     */
    if (isPositivePerformance(state, elements.difficultySelect.value)) {

        pulseScoreHighlight();
    }
}


/*
 * ============================================================
 * COMBO
 * ============================================================
 *
 * Combo não altera a pontuação.
 *
 * Alternativas tonais bem executadas também mantêm a sequência.
 */

/*
 * ============================================================
 * COMBO
 * ============================================================
 *
 * Combo não altera a pontuação.
 *
 * Alternativas tonais bem executadas também mantêm a sequência.
 * ============================================================
 */

function updateCombo(
    state
) {

    if (!state || state.optional || state.status === "optional") return null;

    if (isPositivePerformance(state, elements.difficultySelect.value)) {

        currentCombo +=
            1;


        bestCombo =
            Math.max(
                bestCombo,
                currentCombo
            );

    } else {

        currentCombo =
            0;
    }


    updateComboInterface();


    /*
     * ========================================================
     * EVENTO — COMBO ATUALIZADO
     * ========================================================
     *
     * É publicado em toda nota finalizada.
     *
     * Isso é útil inclusive quando o combo volta para zero.
     * ========================================================
     */

    dispatchKaraokeEvent(
        KARAOKE_EVENTS.comboUpdated,
        {
            combo:
                currentCombo,

            bestCombo:
                bestCombo,

            noteIndex:
                state.index,

            noteScore:
                state.score,

            noteStatus:
                state.status,

            classification:
                state.dominantVoiceClassification,

            songTime:
                currentSongTime
        }
    );


    /*
     * ========================================================
     * MARCOS VISUAIS
     * ========================================================
     */

    if (
        currentCombo ===
        3
    ) {

        return {

            text:
                "×3 COMBO!",

            icon:
                "★",

            type:
                "combo"
        };
    }


    if (
        currentCombo ===
        5
    ) {

        return {

            text:
                "COMBO ×5!",

            icon:
                "🔥",

            type:
                "combo"
        };
    }


    if (
        currentCombo >=
            10 &&
        currentCombo %
            5 ===
            0
    ) {

        return {

            text:
                `SUPER COMBO ×${currentCombo}!`,

            icon:
                "⚡",

            type:
                "combo"
        };
    }


    return null;
}


/*
 * ============================================================
 * INTERFACE DO COMBO
 * ============================================================
 */

function updateComboInterface() {

    elements.comboValue.textContent =
        `×${currentCombo}`;


    elements.currentCombo
        .classList
        .remove(
            "combo-inativo",
            "combo-ativo",
            "combo-destaque"
        );


    if (
        currentCombo <=
        0
    ) {

        elements.currentCombo
            .classList
            .add(
                "combo-inativo"
            );


        return;
    }


    if (
        currentCombo >=
        5
    ) {

        elements.currentCombo
            .classList
            .add(
                "combo-destaque"
            );

        return;
    }


    elements.currentCombo
        .classList
        .add(
            "combo-ativo"
        );
}


/*
 * ============================================================
 * ESCOLHER FEEDBACK DA NOTA
 * ============================================================
 *
 * O objetivo não é somente comemorar.
 *
 * Quando há problema, tentamos identificar qual dimensão
 * teve pior desempenho:
 *
 * - afinação;
 * - entrada/ritmo;
 * - sustentação.
 */

function getGamifiedFeedback(
    state
) {

    if (
        !state
    ) {

        return null;
    }


    /*
     * Nota omitida.
     */
    if (
        state.status ===
        "missed"
    ) {

        return {
            text:
                "TENTE A PRÓXIMA!",

            icon:
                "♪",

            type:
                "atencao",

            stickerText:
                "SIGA O RITMO!",

            stickerClass:
                "estado-atencao"
        };
    }


    /*
     * Excelente acima de 90.
     */
    if (
        state.score >=
        90
    ) {

        return {
            text:
                "PERFEITO!",

            icon:
                "★",

            type:
                "perfeito",

            stickerText:
                "PERFEITO!",

            stickerClass:
                "estado-perfeito"
        };
    }


    /*
     * Execução positiva, incluindo alternativas tonais bem cantadas.
     */
    if (isPositivePerformance(state, elements.difficultySelect.value)) {

        return {
            text:
                "MUITO BOM!",

            icon:
                "★",

            type:
                "bom",

            stickerText:
                "ISSO AÍ!",

            stickerClass:
                "estado-perfeito"
        };
    }


    /*
     * Descobrimos qual das três dimensões
     * mais prejudicou a nota.
     */
    const weakest =
        getWeakestNoteDimension(
            state
        );


    /*
     * Resultado parcial.
     */
    if (
        state.status ===
        "partial"
    ) {

        if (
            weakest ===
            "timing"
        ) {

            return {
                text:
                    "SIGA O RITMO!",

                icon:
                    "♫",

                type:
                    "atencao",

                stickerText:
                    "SIGA O RITMO!",

                stickerClass:
                    "estado-ritmo"
            };
        }


        if (
            weakest ===
            "duration"
        ) {

            return {
                text:
                    "SEGURE A NOTA!",

                icon:
                    "♪",

                type:
                    "atencao",

                stickerText:
                    "SUSTENTE!",

                stickerClass:
                    "estado-atencao"
            };
        }


        if (
            weakest ===
            "pitch"
        ) {

            return {
                text:
                    "QUASE!",

                icon:
                    "★",

                type:
                    "atencao",

                stickerText:
                    "QUASE!",

                stickerClass:
                    "estado-atencao"
            };
        }


        return {
            text:
                "BOA!",

            icon:
                "★",

            type:
                "bom",

            stickerText:
                "BOA!",

            stickerClass:
                "estado-perfeito"
        };
    }


    /*
     * Resultado de erro.
     */
    if (
        weakest ===
        "timing"
    ) {

        return {
            text:
                "SIGA O RITMO!",

            icon:
                "♫",

            type:
                "atencao",

            stickerText:
                "SIGA O RITMO!",

            stickerClass:
                "estado-ritmo"
        };
    }


    if (
        weakest ===
        "duration"
    ) {

        return {
            text:
                "SEGURE A NOTA!",

            icon:
                "♪",

            type:
                "atencao",

            stickerText:
                "SUSTENTE!",

            stickerClass:
                "estado-atencao"
        };
    }


    return {
        text:
            "FORA DO TOM!",

        icon:
            "!",

        type:
            "erro",

        stickerText:
            "FORA DO TOM!",

        stickerClass:
            "estado-erro"
    };
}


/*
 * ============================================================
 * PIOR DIMENSÃO DA NOTA
 * ============================================================
 */

function getWeakestNoteDimension(
    state
) {

    const values = [
        {
            type:
                "pitch",

            score:
                Number(
                    state.pitchScore
                ) || 0
        },

        {
            type:
                "timing",

            score:
                Number(
                    state.timingScore
                ) || 0
        },

        {
            type:
                "duration",

            score:
                Number(
                    state.durationScore
                ) || 0
        }
    ];


    values.sort(
        (
            a,
            b
        ) =>
            a.score -
            b.score
    );


    return values[
        0
    ].type;
}


/*
 * ============================================================
 * EXIBIR SELO GAMIFICADO
 * ============================================================
 */

function showGamifiedFeedback(
    config
) {

    if (
        !config ||
        !elements.gamifiedFeedback
    ) {

        return;
    }


    if (
        gamifiedFeedbackTimer !==
        null
    ) {

        window.clearTimeout(
            gamifiedFeedbackTimer
        );


        gamifiedFeedbackTimer =
            null;
    }


    elements.gamifiedFeedbackText.textContent =
        config.text ??
        "";


    elements.gamifiedFeedbackIcon.textContent =
        config.icon ??
        "★";


    /*
     * Reinicia todas as classes visuais.
     */
    elements.gamifiedFeedback.className =
        "feedback-gamificado";


    if (
        config.type
    ) {

        elements.gamifiedFeedback
            .classList
            .add(
                config.type
            );
    }


    /*
     * Forçamos um reflow apenas para reiniciar
     * a animação quando dois feedbacks aparecem
     * em sequência.
     */
    void elements.gamifiedFeedback.offsetWidth;


    elements.gamifiedFeedback
        .classList
        .add(
            "exibir"
        );


    gamifiedFeedbackTimer =
        window.setTimeout(
            () => {

                elements.gamifiedFeedback
                    .classList
                    .add(
                        "oculto"
                    );


                elements.gamifiedFeedback
                    .classList
                    .remove(
                        "exibir"
                    );


                gamifiedFeedbackTimer =
                    null;
            },
            780
        );
}


/*
 * ============================================================
 * ADESIVO DO PALCO
 * ============================================================
 */

function updateStageSticker(
    text,
    stateClass =
        "estado-ritmo"
) {

    if (
        stageStickerTimer !==
        null
    ) {

        window.clearTimeout(
            stageStickerTimer
        );


        stageStickerTimer =
            null;
    }


    elements.stageSticker.textContent =
        text;


    elements.stageSticker.className =
        `adesivo-hq adesivo-superior ${stateClass}`;


    stageStickerTimer =
        window.setTimeout(
            () => {

                resetStageSticker();


                stageStickerTimer =
                    null;
            },
            1100
        );
}


function resetStageSticker() {

    elements.stageSticker.textContent =
        "SIGA O RITMO!";


    elements.stageSticker.className =
        "adesivo-hq adesivo-superior estado-ritmo";
}


/*
 * ============================================================
 * PULSO DA PONTUAÇÃO
 * ============================================================
 */

function pulseScoreHighlight() {

    elements.scoreHighlight
        .classList
        .remove(
            "pontuacao-pulso"
        );


    /*
     * Reinicia a animação caso notas excelentes
     * ocorram rapidamente em sequência.
     */
    void elements.scoreHighlight.offsetWidth;


    elements.scoreHighlight
        .classList
        .add(
            "pontuacao-pulso"
        );
}


/*
 * ============================================================
 * PONTUAÇÃO
 * ============================================================
 */

function calculateNoteScores(
    state,
    finalized =
        true,
    time =
        currentSongTime
) {

    const difficulty =
        getCurrentDifficulty();


    /*
     * ========================================================
     * PITCH
     * ========================================================
     *
     * Cada amostra já foi avaliada musicalmente.
     *
     * Exemplos:
     *
     * exactMelody:
     *     até 100
     *
     * octaveMelody:
     *     até 100
     *
     * scaleAlternative:
     *     até 70
     *
     * outOfKey:
     *     0
     */

    const pitchScore =
        state.samplePitchScores.length >
            0
            ? clampScore(
                calculateAverage(
                    state.samplePitchScores
                )
            )
            : 0;


    /*
     * ========================================================
     * TIMING
     * ========================================================
     */

    const timingScore =
        calculateTimingScore(
            state.onsetErrorMs
        );


    /*
     * ========================================================
     * COBERTURA
     * ========================================================
     */

    const coverage =
        finalized
            ? calculateCoverage(
                state
            )
            : calculateLiveCoverage(
                state,
                time
            );


    /*
     * ========================================================
     * DURAÇÃO / SUSTENTAÇÃO
     * ========================================================
     */

    const durationScore =
        calculateDurationScore(
            state,
            coverage,
            difficulty
        );


    /*
     * ========================================================
     * SCORE FINAL DA NOTA
     * ========================================================
     *
     * Mantemos os pesos existentes:
     *
     * pitch    60%
     * timing   20%
     * duração  20%
     */

    const totalScore =
        clampScore(
            pitchScore *
                0.60 +
            timingScore *
                0.20 +
            durationScore *
                0.20
        );

    // Apenas alternativas predominantes recebem crédito musical integral
    // para combo/festa. Erros, duração e entrada continuam sendo avaliados.
    const performancePitchScore = state.samplePerformanceScores?.length > 0
        ? calculateAverage(state.samplePerformanceScores) : pitchScore;
    const performanceScore = state.dominantVoiceClassification === "scaleAlternative"
        ? clampScore(performancePitchScore * 0.60 + timingScore * 0.20 + durationScore * 0.20)
        : totalScore;

    return {

        performanceScore,

        pitchScore,

        timingScore,

        durationScore,

        totalScore
    };
}


/*
 * Cobertura exigida cresce suavemente após a região transitória.
 * Para diagnóstico, notas transitórias mostram o mínimo da curva;
 * seu score de duração depende apenas da presença de amostras.
 */
function getRequiredCoverageForNote(
    expectedDuration,
    difficulty
) {

    const maxCoverage =
        Math.max(
            0,
            Math.min(
                1,
                Number.isFinite(difficulty?.requiredCoverage)
                    ? difficulty.requiredCoverage
                    : 1
            )
        );


    const minCoverage =
        Math.max(
            0,
            Math.min(
                maxCoverage,
                Number.isFinite(difficulty?.minimumCoverage)
                    ? difficulty.minimumCoverage
                    : maxCoverage
            )
        );


    const tau =
        Number.isFinite(difficulty?.coverageTau) &&
        difficulty.coverageTau > 0
            ? difficulty.coverageTau
            : 0.60;


    // Duração inválida não reduz a exigência de cobertura.
    if (
        !Number.isFinite(expectedDuration) ||
        expectedDuration <= 0
    ) {

        return maxCoverage;
    }


    const effectiveDuration =
        Math.max(
            0,
            expectedDuration -
                TRANSIENT_NOTE_MAX_DURATION
        );


    return minCoverage +
        (maxCoverage - minCoverage) *
        (1 - Math.exp(-effectiveDuration / tau));
}


function calculateDurationScore(
    state,
    coverage,
    difficulty
) {

    if (
        !state ||
        !Number.isFinite(state.expectedDuration) ||
        state.expectedDuration <= 0
    ) {

        return 0;
    }


    if (
        state.expectedDuration <=
        TRANSIENT_NOTE_MAX_DURATION
    ) {

        return state.voiceSamples > 0
            ? 100
            : 0;
    }


    if (
        !Number.isFinite(coverage) ||
        coverage <= 0
    ) {

        return 0;
    }


    const requiredCoverage =
        getRequiredCoverageForNote(
            state.expectedDuration,
            difficulty
        );


    return clampScore(
        Math.min(
            1,
            coverage / Math.max(Number.EPSILON, requiredCoverage)
        ) * 100
    );
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


    const difficulty =
        getCurrentDifficulty();


    const excellentOnsetMs =
        difficulty.excellentOnsetMs ??
        300;


    const acceptableOnsetMs =
        difficulty.acceptableOnsetMs ??
        700;


    const absolute =
        Math.abs(
            onset
        );


    /*
     * Entrada excelente.
     */
    if (
        absolute <=
        excellentOnsetMs
    ) {

        return 100;
    }


    /*
     * Entre excelente e aceitável:
     *
     * cai gradualmente de 100 para 50.
     */
    if (
        absolute <=
        acceptableOnsetMs
    ) {

        const ratio =
            (
                absolute -
                excellentOnsetMs
            ) /
            (
                acceptableOnsetMs -
                excellentOnsetMs
            );


        return clampScore(
            100 -
            ratio *
                50
        );
    }


    /*
     * Após a faixa aceitável,
     * a pontuação continua caindo,
     * mas não despenca instantaneamente.
     */
    const excess =
        absolute -
        acceptableOnsetMs;


    return clampScore(
        50 -
        excess /
            20
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


function calculateLiveCoverage(
    state,
    time
) {

    if (
        !state ||
        state.expectedDuration <=
            0
    ) {

        return 0;
    }


    const elapsedExpected =
        Math.max(
            0,
            Math.min(
                time -
                state.expectedStart,
                state.expectedDuration
            )
        );


    if (
        elapsedExpected <=
        0
    ) {

        return 0;
    }


    return Math.max(
        0,
        Math.min(
            1,
            state.voicedTime /
                elapsedExpected
        )
    );
}


/*
 * ============================================================
 * NOTA ESPERADA
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
            ? formatMidi(target.note.midi) +
                (isOptionalNote(target.note.duration, elements.difficultySelect.value)
                    ? " · opcional" : "")
            : "—";


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
    }
}


/*
 * ============================================================
 * NOTA CANTADA
 * ============================================================
 */

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
                state.finalized && !state.optional
        );


    elements.evaluatedNotes.textContent =
        String(
            finalized.length
        );


    if (
        finalized.length ===
        0
    ) {

        elements.currentScore.textContent =
            "—";

        return;
    }


    const score =
        calculateAverage(
            finalized.map(
                state =>
                    state.score
            )
        );


    elements.currentScore.textContent =
        String(
            Math.round(
                score
            )
        );
}


/*
 * ============================================================
 * TEMPO DO MP3
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
            : Number(
                currentSong?.duration
            ) ||
                0;


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
        `${Math.max(
            0,
            Math.min(
                100,
                ratio *
                    100
            )
        )}%`;
}


/*
 * ============================================================
 * TEMPO DA PRÉVIA MIDI
 * ============================================================
 */

function updatePreviewTimeInterface(
    time,
    duration
) {

    const safeDuration =
        Math.max(
            0,
            Number(
                duration
            ) ||
            0
        );


    const safe =
        Math.max(
            0,
            Math.min(
                safeDuration,
                time
            )
        );


    const ratio =
        safeDuration >
        0
            ? safe /
                safeDuration
            : 0;


    elements.currentTime.textContent =
        formatTime(
            safe
        );


    elements.totalTime.textContent =
        formatTime(
            safeDuration
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


    try {

        audioDeviceControls?.captureStopped();
        await microphone.stop();

    } catch (error) {

        console.warn(
            "Não foi possível encerrar o microfone normalmente:",
            error
        );
    }


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


    updateTimeInterface(
        elements.backingAudio.duration
    );


    elements.expectedNote.textContent =
        "—";


    elements.sungNote.textContent =
        "—";


    resetLyricsInterface();


    showResults();


    /*
    * ========================================================
    * EVENTO — SESSÃO CONCLUÍDA
    * ========================================================
    */

    dispatchKaraokeEvent(
        KARAOKE_EVENTS.sessionEnded,
        buildKaraokeSessionSummary()
    );
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


    elements.counter
        .classList
        .add(
            "oculto"
        );


    elements.backingAudio.pause();


    try {

        elements.backingAudio.currentTime =
            0;

    } catch {
        // Nenhuma ação.
    }


    try {

        audioDeviceControls?.captureStopped();
        await microphone.stop();

    } catch {
        // Nenhuma ação.
    }


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


    backingSongTime =
        0;


    currentSongTime =
        0;


    currentTargetIndex =
        0;


    currentSubtitleIndex =
        0;


    pianoRoll.setCurrentTime(
        0
    );


    updateTimeInterface(
        0
    );


    updateExpectedNoteInterface(
        0
    );


    resetLyricsInterface();


    setFeedback(
        "Treino interrompido.",
        "neutro"
    );


    /*
    * Não tratamos interrupção como final feliz da música.
    *
    * O PartyMode pode apenas limpar seu estado interno,
    * sem futuramente disparar uma celebração de encerramento.
    */
    dispatchKaraokeEvent(
        KARAOKE_EVENTS.sessionStopped,
        {
            songId:
                currentSong?.id ??
                null,

            songTitle:
                currentSong?.title ??
                null
        }
    );
}


/*
 * ============================================================
 * RESULTADO FINAL
 * ============================================================
 */

function showResults() {

    const evaluatedStates = noteStates.filter(state => !state.optional);

    const total =
        evaluatedStates.length;


    /*
     * ========================================================
     * NOTAS CANTADAS
     * ========================================================
     */

    const sung =
        evaluatedStates.filter(
            state =>
                state.voiceSamples >
                0
        );


    /*
     * ========================================================
     * NOTAS NÃO CANTADAS
     * ========================================================
     */

    const missed =
        evaluatedStates.filter(
            state =>
                state.status ===
                "missed"
        );


    /*
     * ========================================================
     * NOTAS EXCELENTES
     * ========================================================
     *
     * Esta classificação continua sendo usada pela
     * gamificação.
     *
     * Ela representa QUALIDADE da execução, e não
     * natureza musical da nota.
     * ========================================================
     */

    const excellent =
        evaluatedStates.filter(
            state =>
                state.status ===
                "excellent"
        );


    /*
     * ========================================================
     * CLASSIFICAÇÃO MUSICAL
     * ========================================================
     *
     * Cada nota finalizada já possui:
     *
     * dominantVoiceClassification
     *
     * com um dos seguintes valores:
     *
     * exactMelody
     * octaveMelody
     * scaleAlternative
     * outOfKey
     * null
     *
     *
     * A classificação só existe quando uma categoria
     * atingiu a predominância mínima configurada.
     * ========================================================
     */


    /*
     * --------------------------------------------------------
     * NOTAS DA MELODIA
     * --------------------------------------------------------
     *
     * Incluímos:
     *
     * exactMelody
     *     nota MIDI original.
     *
     * octaveMelody
     *     mesma nota musical em outra oitava.
     */

    const melodyNotes =
        evaluatedStates.filter(
            state =>
                state.dominantVoiceClassification ===
                    "exactMelody" ||
                state.dominantVoiceClassification ===
                    "octaveMelody"
        );


    /*
     * --------------------------------------------------------
     * NOTAS ALTERNATIVAS
     * --------------------------------------------------------
     *
     * Outra nota musical, porém pertencente
     * à tonalidade da música.
     */

    const alternativeNotes =
        evaluatedStates.filter(
            state =>
                state.dominantVoiceClassification ===
                    "scaleAlternative"
        );


    /*
     * --------------------------------------------------------
     * FORA DO TOM
     * --------------------------------------------------------
     */

    const outOfKeyNotes =
        evaluatedStates.filter(
            state =>
                state.dominantVoiceClassification ===
                    "outOfKey"
        );


    /*
     * --------------------------------------------------------
     * CLASSIFICAÇÃO INSTÁVEL
     * --------------------------------------------------------
     *
     * A nota foi cantada, mas nenhuma categoria musical
     * atingiu o percentual mínimo de predominância.
     *
     * Não existe cartão específico para ela neste momento.
     *
     * Guardamos apenas para diagnóstico.
     */

    const unstableNotes =
        evaluatedStates.filter(
            state =>
                state.voiceSamples >
                    0 &&
                state.dominantVoiceClassification ===
                    null
        );


    /*
     * ========================================================
     * PONTUAÇÃO TOTAL
     * ========================================================
     */

    const totalScore =
        total >
        0
            ? Math.round(
                calculateAverage(
                    evaluatedStates.map(
                        state =>
                            state.score
                    )
                )
            )
            : 0;


    /*
     * ========================================================
     * PONTUAÇÃO FINAL
     * ========================================================
     */

    elements.finalScore.textContent =
        total > 0 ? String(totalScore) : "—";


    /*
     * ========================================================
     * PONTUAÇÃO DE AFINAÇÃO
     * ========================================================
     */

    elements.resultAccuracy.textContent =
        sung.length >
        0
            ? `${Math.round(
                calculateAverage(
                    sung.map(
                        state =>
                            state.pitchScore
                    )
                )
            )}%`
            : "—";


    /*
     * ========================================================
     * ERRO MÉDIO DE AFINAÇÃO
     * ========================================================
     *
     * averageCents representa o erro da nota realmente
     * cantada em relação ao centro daquela própria nota.
     *
     * Portanto uma alternativa tonal afinada não recebe
     * um erro gigantesco apenas por não ser a nota MIDI.
     * ========================================================
     */

    const errorStates =
        sung.filter(
            state =>
                Number.isFinite(
                    state.averageCents
                )
        );


    elements.resultError.textContent =
        errorStates.length >
        0
            ? `${calculateAverage(
                errorStates.map(
                    state =>
                        state.averageCents
                )
            ).toFixed(1)} cents`
            : "—";


    /*
     * ========================================================
     * RESULTADO MUSICAL
     * ========================================================
     */


    /*
     * Melodia original + adaptação de oitava.
     */
    elements.resultNotes.textContent =
        String(
            melodyNotes.length
        );


    /*
     * Alternativas pertencentes ao tom.
     */
    elements.resultAlternatives.textContent =
        String(
            alternativeNotes.length
        );


    /*
     * Execuções predominantemente fora do tom.
     */
    elements.resultOutOfKey.textContent =
        String(
            outOfKeyNotes.length
        );


    /*
     * ========================================================
     * ENTRADA MÉDIA
     * ========================================================
     */

    const onsetStates =
        sung.filter(
            state =>
                Number.isFinite(
                    state.onsetErrorMs
                )
        );


    elements.resultOnset.textContent =
        onsetStates.length >
        0
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


    /*
     * ========================================================
     * COBERTURA MÉDIA
     * ========================================================
     */

    elements.resultCoverage.textContent =
        total >
        0
            ? `${Math.round(
                calculateAverage(
                    evaluatedStates.map(
                        state =>
                            state.coverage
                    )
                ) *
                100
            )}%`
            : "—";


    /*
     * ========================================================
     * NOTAS NÃO CANTADAS
     * ========================================================
     */

    elements.resultMissed.textContent =
        String(
            missed.length
        );


    /*
     * ========================================================
     * AVALIAÇÃO TEXTUAL FINAL
     * ========================================================
     */

    elements.finalEvaluation.textContent =
        total > 0 ? getFinalEvaluation(totalScore) :
            "Esta música só tem notas opcionais neste modo. Sem avaliação de pontos.";


    /*
     * ========================================================
     * DIAGNÓSTICO DA NOVA CLASSIFICAÇÃO
     * ========================================================
     *
     * Útil principalmente durante os primeiros testes.
     * ========================================================
     */

    console.info(
        "🎼 Resumo musical da execução:",
        {

            totalNotes:
                total,

            sungNotes:
                sung.length,

            melodyNotes:
                melodyNotes.length,

            alternativeNotes:
                alternativeNotes.length,

            outOfKeyNotes:
                outOfKeyNotes.length,

            missedNotes:
                missed.length,

            unstableNotes:
                unstableNotes.length
        }
    );


    /*
     * ========================================================
     * GAMIFICAÇÃO FINAL
     * ========================================================
     */

    updateFinalGamification(
        totalScore,
        excellent.length
    );


    /*
     * ========================================================
     * DETALHAMENTO NOTA A NOTA
     * ========================================================
     */

    if (total === 0) {
        elements.finalResultSticker.textContent = "SEM AVALIAÇÃO";
        elements.finalResultSticker.className = "explosao-resultado";
    }

    buildNoteResultsList();


    /*
     * ========================================================
     * EXIBIR RESULTADO
     * ========================================================
     */

    elements.result
        .classList
        .remove(
            "oculto"
        );


    setFeedback(
        "Treino concluído!",
        "correto"
    );


    window.setTimeout(
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
 * GAMIFICAÇÃO — RESULTADO FINAL
 * ============================================================
 */

function updateFinalGamification(
    totalScore,
    excellentCount
) {

    elements.resultBestCombo.textContent =
        String(
            bestCombo
        );


    elements.resultExcellentNotes.textContent =
        String(
            excellentCount
        );


    /*
     * Limpa classes de uma execução anterior.
     */
    elements.finalResultSticker.className =
        "explosao-resultado";


    let text =
        "CONTINUE!";


    let cssClass =
        "resultado-continue";


    /*
     * A avaliação visual não interfere
     * na pontuação real.
     */
    if (
        totalScore >=
        90
    ) {

        text =
            "PERFEITO!";

        cssClass =
            "resultado-perfeito";

    } else if (
        totalScore >=
        80
    ) {

        text =
            "MANDOU BEM!";

        cssClass =
            "resultado-excelente";

    } else if (
        totalScore >=
        70
    ) {

        text =
            "MUITO BOM!";

        cssClass =
            "resultado-bom";

    } else if (
        totalScore >=
        55
    ) {

        text =
            "BOA!";

        cssClass =
            "resultado-bom";
    }


    elements.finalResultSticker.textContent =
        text;


    elements.finalResultSticker
        .classList
        .add(
            cssClass
        );


    /*
     * Reinicia a animação.
     */
    void elements.finalResultSticker.offsetWidth;


    elements.finalResultSticker
        .classList
        .add(
            "animar"
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


            if (state.optional) {
                appendDetail(details, "Nota opcional — não participa da pontuação");
            } else if (
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


                appendDetail(
                    details,
                    `Tempo: ${state.timingScore}%`
                );


                appendDetail(
                    details,
                    `Duração: ${state.durationScore}%`
                );
            }


            const score =
                document.createElement(
                    "div"
                );


            score.className =
                "resultado-nota-pontos";


            score.textContent =
                state.optional ? "—" : `${state.score} pts`;


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

    /*
     * ========================================================
     * ESTADO DA AVALIAÇÃO
     * ========================================================
     */

    noteStates =
        [];


    recentFrequencies =
        [];


    lastVoicePointTimestamp =
        0;


    currentTargetIndex =
        0;


    nextFinalizeIndex =
        0;


    backingSongTime =
        0;


    currentSongTime =
        0;


    currentSubtitleIndex =
        0;


    /*
     * ========================================================
     * INTERFACE PRINCIPAL
     * ========================================================
     */

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


    /*
     * ========================================================
     * RESULTADO FINAL
     * ========================================================
     *
     * Limpamos também todos os dados da execução anterior.
     * ========================================================
     */

    elements.finalScore.textContent =
        "0";


    elements.finalEvaluation.textContent =
        "";


    elements.resultAccuracy.textContent =
        "—";


    elements.resultError.textContent =
        "—";


    elements.resultNotes.textContent =
        "—";


    elements.resultAlternatives.textContent =
        "—";


    elements.resultOutOfKey.textContent =
        "—";


    elements.resultOnset.textContent =
        "—";


    elements.resultCoverage.textContent =
        "—";


    elements.resultMissed.textContent =
        "—";


    /*
     * ========================================================
     * DETALHAMENTO NOTA A NOTA
     * ========================================================
     */

    elements.noteResultsList.innerHTML =
        "";


    /*
     * ========================================================
     * GAMIFICAÇÃO
     * ========================================================
     */

    resetGamification();


    /*
     * ========================================================
     * KARAOKÊ / TEMPO
     * ========================================================
     */

    resetLyricsInterface();


    updateTimeInterface(
        0
    );
}


/*
 * ============================================================
 * RESET DA GAMIFICAÇÃO
 * ============================================================
 */

function resetGamification() {

    currentCombo =
        0;


    bestCombo =
        0;


    /*
     * Cancela timers antigos.
     */
    if (
        gamifiedFeedbackTimer !==
        null
    ) {

        window.clearTimeout(
            gamifiedFeedbackTimer
        );


        gamifiedFeedbackTimer =
            null;
    }


    if (
        stageStickerTimer !==
        null
    ) {

        window.clearTimeout(
            stageStickerTimer
        );


        stageStickerTimer =
            null;
    }


    /*
     * Combo.
     */
    elements.comboValue.textContent =
        "×0";


    elements.currentCombo.className =
        "combo-atual combo-inativo";


    /*
     * Overlay do piano roll.
     */
    elements.gamifiedFeedback.className =
        "feedback-gamificado oculto";


    elements.gamifiedFeedbackText.textContent =
        "PERFEITO!";


    elements.gamifiedFeedbackIcon.textContent =
        "★";


    /*
     * Adesivo.
     */
    resetStageSticker();


    /*
     * Pulso do placar.
     */
    elements.scoreHighlight
        .classList
        .remove(
            "pontuacao-pulso"
        );


    /*
     * Resultado final.
     */
    elements.resultBestCombo.textContent =
        "0";


    elements.resultExcellentNotes.textContent =
        "0";


    elements.finalResultSticker.textContent =
        "POW!";


    elements.finalResultSticker.className =
        "explosao-resultado";
}


/*
 * ============================================================
 * BLOQUEIO DOS CONTROLES
 * ============================================================
 */

function lockControls(
    locked
) {

    audioDeviceControls?.setLocked(locked);

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


    if (
        !locked
    ) {

        elements.trackSelect.disabled =
            !midiData;


        elements.melodyListenButton.disabled =
            !selectedMelody;


        elements.backingListenButton.disabled =
            !Number.isFinite(
                elements.backingAudio.duration
            );


        elements.startButton.disabled =
            !(
                selectedMelody &&
                Number.isFinite(
                    elements.backingAudio.duration
                )
            );
    }


    updateSyncControlsState();
}


/*
 * ============================================================
 * CONTROLES DE SINCRONIZAÇÃO
 * ============================================================
 */

function updateSyncControlsState() {

    /*
     * MIDI pode ser ajustado durante a prévia
     * do instrumental.
     *
     * Não permitimos durante:
     *
     * - treino;
     * - contagem regressiva;
     * - prévia MIDI isolada.
     */
    const midiEnabled =
        Boolean(
            selectedTrack
        ) &&
        !running &&
        !countdownRunning &&
        !melodyPreviewPlaying;


    /*
    * lyricsOffset pertence à legenda tradicional.
    *
    * Quando o karaokê silábico está ativo,
    * sílabas e MIDI compartilham melodyOffsetSeconds.
    */
    const lyricsEnabled =
        subtitles.length >
            0 &&
        !(
            karaokeModel &&
            karaokeModel.valid
        ) &&
        !running &&
        !countdownRunning &&
        !melodyPreviewPlaying;


    document.querySelectorAll(
        '.botao-sync[data-sync-target="midi"]'
    )
    .forEach(
        button => {

            button.disabled =
                !midiEnabled;
        }
    );


    document.querySelectorAll(
        '.botao-sync[data-sync-target="lyrics"]'
    )
    .forEach(
        button => {

            button.disabled =
                !lyricsEnabled;
        }
    );
}


function updateSyncInterface() {

    elements.midiOffsetValue.textContent =
        formatOffsetMilliseconds(
            melodyOffsetSeconds
        );


    elements.lyricsOffsetValue.textContent =
        formatOffsetMilliseconds(
            lyricsOffsetSeconds
        );


    updateSyncControlsState();
}


function roundOffset(
    value
) {

    return Math.round(
        Number(
            value
        ) *
        1000
    ) /
    1000;
}


function formatOffsetMilliseconds(
    seconds
) {

    const milliseconds =
        Math.round(
            Number(
                seconds
            ) *
            1000
        );


    if (
        milliseconds ===
        0
    ) {

        return "0 ms";
    }


    return milliseconds >
        0
            ? `+${milliseconds} ms`
            : `${milliseconds} ms`;
}


/*
 * ============================================================
 * LETRA SINCRONIZADA
 * ============================================================
 */

/*
 * ============================================================
 * ATUALIZAR LETRA
 * ============================================================
 *
 * Prioridade:
 *
 * 1. karaokê silábico;
 * 2. legenda tradicional.
 *
 * ============================================================
 */

function updateLyricsInterface(
    audioTime
) {

    /*
     * ========================================================
     * MODO KARAOKÊ
     * ========================================================
     */

    if (
        karaokeModel &&
        karaokeModel.valid
    ) {

        updateKaraokeLyricsInterface(
            audioTime
        );


        return;
    }


    /*
     * ========================================================
     * FALLBACK — LEGENDA TRADICIONAL
     * ========================================================
     */

    updateLegacyLyricsInterface(
        audioTime
    );
}


/*
 * ============================================================
 * KARAOKÊ — ATUALIZAÇÃO EM TEMPO REAL
 * ============================================================
 */

function updateKaraokeLyricsInterface(
    audioTime
) {

    const state =
        getKaraokeStateAtTime(
            karaokeModel,
            audioTime,
            melodyOffsetSeconds
        );


    const phrase =
        state.phrase;


    const syllable =
        state.syllable;


    /*
     * Estamos fora de qualquer frase.
     */
    if (
        !phrase
    ) {

        if (
            renderedKaraokePhraseIndex !==
            null
        ) {

            elements.currentLyrics.textContent =
                "♪";


            elements.currentLyrics.classList.add(
                "sem-frase"
            );


            elements.currentLyrics.classList.remove(
                "karaoke-ativo"
            );


            renderedKaraokePhraseIndex =
                null;


            renderedKaraokeSyllableIndex =
                null;
        }


        return;
    }


    const phraseChanged =
        renderedKaraokePhraseIndex !==
        phrase.index;


    const currentSyllableIndex =
        syllable
            ? syllable.index
            : null;


    const syllableChanged =
        renderedKaraokeSyllableIndex !==
        currentSyllableIndex;


    /*
     * Não reconstruímos o DOM em todo frame.
     */
    if (
        !phraseChanged &&
        !syllableChanged
    ) {

        return;
    }


    renderKaraokePhrase(
        phrase,
        syllable,
        state.sourceTime
    );


    renderedKaraokePhraseIndex =
        phrase.index;


    renderedKaraokeSyllableIndex =
        currentSyllableIndex;
}


/*
 * ============================================================
 * RENDERIZAR FRASE DO KARAOKÊ
 * ============================================================
 */

function renderKaraokePhrase(
    phrase,
    activeSyllable,
    sourceTime
) {

    const container =
        elements.currentLyrics;


    /*
     * Limpa a renderização anterior.
     *
     * Usamos nós DOM e textContent.
     * Não utilizamos innerHTML com texto do SRT.
     */
    container.replaceChildren();


    container.classList.remove(
        "sem-frase"
    );


    container.classList.add(
        "karaoke-ativo"
    );


    const text =
        String(
            phrase.text ||
            ""
        );


    const mappedSyllables =
        phrase.syllables
            .filter(
                syllable =>
                    Number.isInteger(
                        syllable.charStart
                    ) &&
                    Number.isInteger(
                        syllable.charEnd
                    ) &&
                    syllable.charStart >=
                        0 &&
                    syllable.charEnd >
                        syllable.charStart
            )
            .sort(
                (
                    first,
                    second
                ) =>
                    first.charStart -
                    second.charStart
            );


    /*
     * Caso o alinhamento textual não tenha sido possível,
     * mostramos a frase completa sem destaque.
     */
    if (
        mappedSyllables.length ===
        0
    ) {

        container.textContent =
            text;


        return;
    }


    let cursor =
        0;


    for (
        const syllable of
        mappedSyllables
    ) {

        /*
         * Texto que existe antes da sílaba:
         *
         * espaços,
         * vírgulas,
         * pontuação etc.
         */
        if (
            syllable.charStart >
            cursor
        ) {

            container.appendChild(
                document.createTextNode(
                    text.slice(
                        cursor,
                        syllable.charStart
                    )
                )
            );
        }


        const span =
            document.createElement(
                "span"
            );


        span.textContent =
            text.slice(
                syllable.charStart,
                syllable.charEnd
            );


        span.classList.add(
            "karaoke-silaba"
        );


        /*
         * ====================================================
         * SÍLABA ATUAL
         * ====================================================
         */

        if (
            activeSyllable &&
            syllable.index ===
                activeSyllable.index
        ) {

            span.classList.add(
                "karaoke-silaba-atual"
            );


            span.setAttribute(
                "aria-current",
                "true"
            );


        /*
         * ====================================================
         * JÁ CANTADA
         * ====================================================
         */

        } else if (
            syllable.end <
            sourceTime
        ) {

            span.classList.add(
                "karaoke-silaba-passada"
            );


        /*
         * ====================================================
         * AINDA NÃO CANTADA
         * ====================================================
         */

        } else {

            span.classList.add(
                "karaoke-silaba-futura"
            );
        }


        container.appendChild(
            span
        );


        cursor =
            syllable.charEnd;
    }


    /*
     * Restante do texto:
     *
     * normalmente pontuação final.
     */
    if (
        cursor <
        text.length
    ) {

        container.appendChild(
            document.createTextNode(
                text.slice(
                    cursor
                )
            )
        );
    }
}


/*
 * ============================================================
 * LEGENDA TRADICIONAL
 * ============================================================
 *
 * Compatibilidade com músicas que ainda não possuem
 * voz_silabas.srt.
 * ============================================================
 */

function updateLegacyLyricsInterface(
    audioTime
) {

    if (
        subtitles.length ===
        0
    ) {

        return;
    }


    const lyricTime =
        getLyricsTime(
            audioTime,
            lyricsOffsetSeconds
        );


    /*
     * Se o tempo voltou para trás,
     * reinicia a busca.
     */
    if (
        currentSubtitleIndex >
            0 &&
        lyricTime <
            subtitles[
                currentSubtitleIndex
            ]?.start
    ) {

        currentSubtitleIndex =
            0;
    }


    while (
        currentSubtitleIndex <
            subtitles.length &&
        lyricTime >
            subtitles[
                currentSubtitleIndex
            ].end
    ) {

        currentSubtitleIndex++;
    }


    const subtitle =
        subtitles[
            currentSubtitleIndex
        ];


    if (
        subtitle &&
        lyricTime >=
            subtitle.start &&
        lyricTime <=
            subtitle.end
    ) {

        elements.currentLyrics.textContent =
            subtitle.text;


        elements.currentLyrics.classList.remove(
            "sem-frase"
        );


        elements.currentLyrics.classList.remove(
            "karaoke-ativo"
        );


        return;
    }


    elements.currentLyrics.textContent =
        "♪";


    elements.currentLyrics.classList.add(
        "sem-frase"
    );


    elements.currentLyrics.classList.remove(
        "karaoke-ativo"
    );
}


function resetLyricsInterface() {

    currentSubtitleIndex =
        0;


    renderedKaraokePhraseIndex =
        null;


    renderedKaraokeSyllableIndex =
        null;


    elements.currentLyrics.replaceChildren();


    /*
     * Existe algum tipo de letra disponível.
     */
    if (
        subtitles.length >
            0 ||
        syllableSubtitles.length >
            0 ||
        lyricsUrl ||
        syllablesUrl
    ) {

        elements.currentLyrics.textContent =
            "♪";

    } else {

        elements.currentLyrics.textContent =
            "Letra não disponível";
    }


    elements.currentLyrics.classList.add(
        "sem-frase"
    );


    elements.currentLyrics.classList.remove(
        "karaoke-ativo"
    );
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
 * DURAÇÃO MIDI
 * ============================================================
 */

function getMelodyDuration(
    melody
) {

    if (
        !melody ||
        !Array.isArray(
            melody.notes
        ) ||
        melody.notes.length ===
            0
    ) {

        return 0;
    }


    let maximumEnd =
        0;


    for (
        const note of
        melody.notes
    ) {

        const end =
            note.start +
            note.duration;


        if (
            end >
            maximumEnd
        ) {

            maximumEnd =
                end;
        }
    }


    return maximumEnd;
}


/*
 * ============================================================
 * FEEDBACK
 * ============================================================
 */

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
 * FORMATAÇÃO TEMPO
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
            ) ||
            0
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


/*
 * ============================================================
 * FORMATAÇÃO MILISSEGUNDOS
 * ============================================================
 */

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
        rounded ===
        0
    ) {

        return "0 ms";
    }


    return rounded >
        0
            ? `+${rounded} ms`
            : `${rounded} ms`;
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
 * RESULTADOS
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
            "Muito bom. Você acompanhou a melodia com boa precisão e poucas perdas de sincronismo."
        );
    }


    if (
        score >=
        65
    ) {

        return (
            "Bom resultado. Observe as barras amarelas e vermelhas e trabalhe esses trechos novamente."
        );
    }


    if (
        score >=
        45
    ) {

        return (
            "Você acompanhou parte da melodia. Priorize as notas com menor afinação, entrada ou sustentação."
        );
    }


    return (
        "Continue praticando. Use as cores do piano roll para localizar os trechos que mais precisam de atenção."
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
 * ERRO DE INICIALIZAÇÃO
 * ============================================================
 */

function handleInitializationError(
    error
) {

    console.error(
        "Falha ao inicializar modo melodia:",
        error
    );


    elements.state.textContent =
        "Erro";


    elements.startButton.disabled =
        true;


    elements.melodyListenButton.disabled =
        true;


    elements.backingListenButton.disabled =
        true;


    elements.trackSelect.disabled =
        true;


    setFeedback(
        `Não foi possível carregar a música: ${error.message}`,
        "errado"
    );
}


/*
 * ============================================================
 * ENCERRAMENTO
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


        melodyPreviewTimers.forEach(
            timer =>
                clearTimeout(
                    timer
                )
        );


        melodyPreviewTimers =
            [];


        elements.backingAudio.pause();


        audioDeviceControls?.destroy();
        audioOutput.unregister(elements.backingAudio);
        microphone.stop();


        toneGenerator.close();


        pianoRoll.destroy();
    }
);
