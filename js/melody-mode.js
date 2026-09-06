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
 * - offset de sincronização, se houver.
 *
 * O MP3 continua sendo o RELÓGIO MESTRE.
 *
 * Fluxo:
 *
 * catalogo.json
 *      ↓
 * música selecionada
 *      ↓
 * MP3 + MIDI
 *      ↓
 * backingAudio.currentTime
 *      ↓
 * Piano Roll + avaliação vocal
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
 * CATÁLOGO
 * ============================================================
 */

const CATALOG_URL =
    "./assets/musicas/catalogo.json";


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
 * ELEMENTOS DA INTERFACE
 * ============================================================
 */

const elements = {

    /*
     * Dados da música
     */

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


    /*
     * Arquivos
     */

    backingFileStatus:
        document.getElementById(
            "statusBackingTrack"
        ),

    midiStatus:
        document.getElementById(
            "statusMidi"
        ),


    /*
     * Configuração
     */

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


    /*
     * Áudio
     */

    backingAudio:
        document.getElementById(
            "backingTrackAudio"
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


    /*
     * Piano Roll
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
     * Resultado
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
 * VALIDAÇÃO DOS ELEMENTOS ESSENCIAIS
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

        resultadoEntrada:
            elements.resultOnset,

        resultadoCobertura:
            elements.resultCoverage,

        resultadoOmitidas:
            elements.resultMissed,

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


/*
 * Caminhos finais dos arquivos.
 */
let backingUrl =
    null;


let midiUrl =
    null;


/*
 * Offset da melodia em relação ao MP3.
 *
 * Positivo:
 * MIDI é deslocado para frente.
 *
 * Negativo:
 * MIDI é deslocado para trás.
 *
 * No caso atual validado naturalmente:
 * 0.
 */
let melodyOffsetSeconds =
    0;


/*
 * Estado da avaliação.
 */
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


/*
 * Timers usados apenas na prévia sonora MIDI.
 */
let melodyPreviewTimers =
    [];


/*
 * Tempo REAL do backing track.
 */
let backingSongTime =
    0;


/*
 * Tempo usado pela melodia MIDI.
 *
 * Pode diferir do MP3 caso haja offset.
 */
let currentSongTime =
    0;


let recentFrequencies =
    [];


let lastVoicePointTimestamp =
    0;


/*
 * Otimizações para músicas longas.
 */
let currentTargetIndex =
    0;


let nextFinalizeIndex =
    0;


/*
 * ============================================================
 * INICIALIZAÇÃO
 * ============================================================
 */

initialize();


async function initialize() {

    setLoadingState();


    try {

        /*
         * 1. Catálogo
         */
        catalog =
            await loadCatalog();


        /*
         * 2. Descobre qual música foi solicitada.
         */
        const songId =
            getSongIdFromUrl();


        /*
         * 3. Localiza a música.
         */
        currentSong =
            findSongInCatalog(
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
         * 4. Prepara caminhos e interface.
         */
        prepareSong(
            currentSong
        );


        /*
         * 5. MP3
         */
        setupBackingTrack();


        /*
         * 6. MIDI
         */
        await loadVocalMidi();


        /*
         * 7. Libera interface quando ambos
         * estiverem realmente disponíveis.
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
 * CATÁLOGO
 * ============================================================
 */

async function loadCatalog() {

    const response =
        await fetch(
            CATALOG_URL,
            {
                cache:
                    "no-cache"
            }
        );


    if (
        !response.ok
    ) {

        throw new Error(
            `Não foi possível carregar catalogo.json (${response.status}).`
        );
    }


    const data =
        await response.json();


    if (
        !data ||
        typeof data !==
            "object"
    ) {

        throw new Error(
            "O catálogo de músicas é inválido."
        );
    }


    return data;
}


/*
 * ============================================================
 * ID DA MÚSICA NA URL
 * ============================================================
 */

function getSongIdFromUrl() {

    const params =
        new URLSearchParams(
            window.location.search
        );


    /*
     * Principal:
     *
     * ?song=id-da-musica
     *
     * Aceitamos também ?id= como fallback.
     */
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
 * LOCALIZAR MÚSICA
 * ============================================================
 *
 * Suporta os dois formatos:
 *
 * FORMATO A
 *
 * {
 *     "genres": [
 *         {
 *             "id": "catolicas",
 *             "name": "Católicas",
 *             "songs": [...]
 *         }
 *     ]
 * }
 *
 * FORMATO B
 *
 * {
 *     "songs": [...]
 * }
 *
 * ============================================================
 */

function findSongInCatalog(
    catalogData,
    songId
) {

    if (
        !songId
    ) {

        return null;
    }


    /*
     * Formato simples.
     */
    if (
        Array.isArray(
            catalogData.songs
        )
    ) {

        const song =
            catalogData.songs.find(
                item =>
                    item.id ===
                    songId
            );


        if (
            song
        ) {

            return song;
        }
    }


    /*
     * Formato agrupado por gênero.
     */
    if (
        Array.isArray(
            catalogData.genres
        )
    ) {

        for (
            const genre of
            catalogData.genres
        ) {

            if (
                !Array.isArray(
                    genre.songs
                )
            ) {

                continue;
            }


            const song =
                genre.songs.find(
                    item =>
                        item.id ===
                        songId
                );


            if (
                song
            ) {

                /*
                 * Acrescentamos os dados do gênero
                 * caso não estejam na própria música.
                 */
                return {

                    ...song,

                    genre:
                        song.genre ||
                        genre.id ||
                        "",

                    genreName:
                        song.genreName ||
                        genre.name ||
                        ""
                };
            }
        }
    }


    return null;
}


/*
 * ============================================================
 * PREPARAR MÚSICA
 * ============================================================
 */

function prepareSong(
    song
) {

    /*
     * --------------------------------------------------------
     * Offset
     * --------------------------------------------------------
     *
     * Aceitamos:
     *
     * offset
     * syncOffset
     *
     * em SEGUNDOS.
     */
    const rawOffset =
        song.offset ??
        song.syncOffset ??
        0;


    melodyOffsetSeconds =
        Number.isFinite(
            Number(
                rawOffset
            )
        )
            ? Number(
                rawOffset
            )
            : 0;


    /*
     * --------------------------------------------------------
     * Arquivos
     * --------------------------------------------------------
     */

    const files =
        song.files ||
        {};


    const audioFile =
        files.audio ||
        song.audio ||
        "instrumental.mp3";


    const midiFile =
        files.midi ||
        song.midi ||
        "voz.mid";


    /*
     * --------------------------------------------------------
     * Caminho-base
     * --------------------------------------------------------
     *
     * Pode vir explicitamente:
     *
     * "path":
     * "./assets/musicas/catolicas/..."
     *
     * Caso não venha, montamos:
     *
     * ./assets/musicas/<genre>/<id>/
     */
    let basePath =
        song.path ||
        "";


    if (
        !basePath
    ) {

        if (
            !song.genre
        ) {

            throw new Error(
                `A música "${song.id}" não possui "path" nem "genre".`
            );
        }


        basePath =
            `./assets/musicas/${song.genre}/${song.id}/`;
    }


    basePath =
        ensureTrailingSlash(
            basePath
        );


    backingUrl =
        resolveSongFileUrl(
            basePath,
            audioFile
        );


    midiUrl =
        resolveSongFileUrl(
            basePath,
            midiFile
        );


    /*
     * --------------------------------------------------------
     * Interface
     * --------------------------------------------------------
     */

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


    /*
     * O HTML não precisa conhecer nenhum MP3.
     * A fonte agora vem do catálogo.
     */
    elements.backingAudio.pause();


    elements.backingAudio.removeAttribute(
        "src"
    );


    elements.backingAudio.src =
        backingUrl;
}


/*
 * ============================================================
 * RESOLVER CAMINHO DE ARQUIVO
 * ============================================================
 */

function resolveSongFileUrl(
    basePath,
    file
) {

    if (
        typeof file !==
        "string" ||
        !file.trim()
    ) {

        throw new Error(
            "Nome de arquivo da música inválido."
        );
    }


    const trimmed =
        file.trim();


    /*
     * URL absoluta ou caminho absoluto.
     */
    if (
        /^(https?:)?\/\//i.test(
            trimmed
        ) ||
        trimmed.startsWith(
            "/"
        )
    ) {

        return trimmed;
    }


    return (
        basePath +
        trimmed
    );
}


function ensureTrailingSlash(
    path
) {

    return path.endsWith(
        "/"
    )
        ? path
        : `${path}/`;
}


/*
 * ============================================================
 * BACKING TRACK
 * ============================================================
 */

function setupBackingTrack() {

    /*
     * Removemos listeners anteriores utilizando
     * propriedades on... porque esta página
     * trabalha com apenas uma música por carregamento.
     */

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


            /*
             * Se o catálogo possuir duração informada,
             * apenas registramos discrepância no console.
             *
             * O MP3 real continua sendo a autoridade.
             */
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
 * CARREGAR MIDI VOCAL
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
 * SELETOR DE TRILHAS MIDI
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
 * SELECIONAR TRILHA MIDI
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


    /*
     * ========================================================
     * CONVERSÃO PARA O FORMATO DO PIANO ROLL
     * ========================================================
     *
     * Aplicamos o offset aqui.
     *
     * Se offset = 0:
     *
     * MIDI permanece exatamente como foi importado.
     */
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
 * PRÉVIA DO INSTRUMENTAL
 * ============================================================
 */

async function startBackingPreview() {

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


    pianoRoll.setCurrentTime(
        0
    );


    pianoRoll.clearVoice();


    updateTimeInterface(
        0
    );


    try {

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


    /*
     * Como o offset já foi incorporado
     * às próprias notas, o relógio visual
     * continua sendo exatamente o MP3.
     */
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


    /*
     * currentTime pode lançar erro em uma
     * situação excepcional de áudio ainda não pronto.
     */
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


    pianoRoll.setCurrentTime(
        0
    );


    updateTimeInterface(
        0
    );


    updateExpectedNoteInterface(
        0
    );


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


    pianoRoll.setCurrentTime(
        0
    );


    pianoRoll.clearVoice();


    updateTimeInterface(
        0
    );


    try {

        await toneGenerator.ensureContext();


        const previewStart =
            performance.now();


        /*
         * Agenda cada nota no tempo real
         * definido pelo MIDI.
         */
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


    /*
     * Durante a prévia MIDI usamos a duração
     * MIDI para a barra visual.
     */
    updatePreviewTimeInterface(
        currentSongTime,
        getMelodyDuration(
            selectedMelody
        )
    );


    if (
        currentSongTime >=
        getMelodyDuration(
            selectedMelody
        )
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


    pianoRoll.setCurrentTime(
        0
    );


    updateTimeInterface(
        0
    );


    updateExpectedNoteInterface(
        0
    );


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

                onsetErrorMs:
                    null,

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

async function startTraining() {

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


    /*
     * O botão principal precisa permanecer
     * disponível para interromper.
     */
    elements.startButton.disabled =
        false;


    try {

        /*
         * Microfone.
         */
        await microphone.start();


        /*
         * ====================================================
         * IMPORTANTE
         * ====================================================
         *
         * Primeiro limpa.
         *
         * Depois cria noteStates.
         *
         * NÃO inverter esta ordem.
         * ====================================================
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


        /*
         * Contagem.
         */
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
         * COMEÇO REAL
         * ====================================================
         */

        elements.backingAudio.pause();


        elements.backingAudio.currentTime =
            0;


        /*
         * Primeiro inicia o MP3.
         *
         * Somente depois marcamos running.
         */
        await elements.backingAudio.play();


        running =
            true;


        backingSongTime =
            0;


        currentSongTime =
            0;


        elements.state.textContent =
            "Cantando";


        elements.backingState.textContent =
            "Tocando";


        setFeedback(
            "Acompanhe o instrumental e a melodia no piano roll.",
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
     * RELÓGIO MESTRE
     * ========================================================
     *
     * O tempo vem SEMPRE do MP3.
     * ========================================================
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
     * Traçado visual.
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


    evaluateVoiceSample(
        frequency,
        currentSongTime
    );
}


/*
 * ============================================================
 * ALVO ATIVO
 * ============================================================
 *
 * Otimizado para músicas com centenas
 * ou milhares de notas.
 *
 * Não percorremos toda a música a cada frame.
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


    /*
     * Se o relógio voltou para trás,
     * reinicia a busca.
     */
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


    /*
     * Avança enquanto a nota atual
     * já terminou.
     */
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
     * AFINAÇÃO
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
     * INTERFACE EM TEMPO REAL
     * ========================================================
     */

    const roundedCents =
        Math.round(
            cents
        );


    elements.currentError.textContent =
        `${
            roundedCents >
            0
                ? "+"
                : ""
        }${roundedCents} cents`;


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
     * FEEDBACK
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
 * FINALIZAR NOTAS EXPIRADAS
 * ============================================================
 *
 * Otimizado:
 *
 * percorremos apenas as próximas notas ainda
 * não avaliadas.
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
            note.start +
            note.duration +
            NOTE_TIME_MARGIN;


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


    /*
     * ========================================================
     * OMITIDA
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
     * ========================================================
     * RESULTADOS
     * ========================================================
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


    /*
     * ========================================================
     * COR DA BARRA
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
 * PONTUAÇÃO DE UMA NOTA
 * ============================================================
 *
 * 60% afinação
 * 20% entrada
 * 20% duração
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
     * AFINAÇÃO
     * ========================================================
     */

    const averageCents =
        state.centsValues.length >
        0
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


    /*
     * ========================================================
     * ENTRADA
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


    const durationScore =
        clampScore(
            coverage *
            100
        );


    /*
     * ========================================================
     * TOTAL
     * ========================================================
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


    return {

        pitchScore,

        timingScore,

        durationScore,

        totalScore
    };
}


/*
 * ============================================================
 * PONTUAÇÃO DE ENTRADA
 * ============================================================
 */

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


    const absolute =
        Math.abs(
            onset
        );


    if (
        absolute <=
        EXCELLENT_ONSET_MS
    ) {

        return 100;
    }


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
            100 -
            ratio *
                50
        );
    }


    return clampScore(
        50 -
        (
            absolute -
            ACCEPTABLE_ONSET_MS
        ) /
        10
    );
}


/*
 * ============================================================
 * COBERTURA DEFINITIVA
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


/*
 * ============================================================
 * COBERTURA DURANTE A NOTA
 * ============================================================
 */

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
            ? formatMidi(
                target.note.midi
            )
            : "—";


    /*
     * Se estamos em introdução/interlúdio,
     * não deixamos métricas antigas aparentando
     * pertencer ao silêncio atual.
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
                state.finalized
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
            "0";


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
 * TEMPO DO BACKING TRACK
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


    /*
     * Quando o MP3 termina,
     * qualquer nota ainda não julgada
     * também precisa receber resultado.
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


    try {

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
 * RESULTADO FINAL
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


    /*
     * ========================================================
     * PONTUAÇÃO GERAL
     * ========================================================
     */

    const totalScore =
        total >
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


    elements.finalScore.textContent =
        String(
            totalScore
        );


    /*
     * ========================================================
     * AFINAÇÃO
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
     * ERRO MÉDIO
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
     * NOTAS ACERTADAS
     * ========================================================
     */

    elements.resultNotes.textContent =
        `${excellent.length} / ${total}`;


    /*
     * ========================================================
     * ENTRADA
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
     * COBERTURA
     * ========================================================
     */

    elements.resultCoverage.textContent =
        total >
        0
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


    /*
     * ========================================================
     * OMITIDAS
     * ========================================================
     */

    elements.resultMissed.textContent =
        String(
            missed.length
        );


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

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                `resultado-nota ${getResultCssClass(
                    state.status
                )}`;


            /*
             * Nota.
             */
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
 * RESET DE INTERFACE
 * ============================================================
 */

function resetInterfaceStatistics() {

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


    /*
     * Durante prévia, o botão correspondente
     * continua habilitado para permitir parar.
     */
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


    /*
     * Quando não está bloqueado, respeitamos
     * disponibilidade dos arquivos.
     */
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
 * DURAÇÃO DA MELODIA
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
 * FORMATAÇÃO DE ENTRADA
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
 * DETALHES DO RESULTADO
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
 * AVALIAÇÃO FINAL
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
 * ENCERRAMENTO DA PÁGINA
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


        microphone.stop();


        toneGenerator.close();


        pianoRoll.destroy();
    }
);