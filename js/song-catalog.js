/*
 * ============================================================
 * song-catalog.js
 * ============================================================
 *
 * Camada central do catálogo de músicas.
 *
 * Responsabilidades:
 *
 * - carregar catalogo.json;
 * - validar e normalizar dados;
 * - listar gêneros;
 * - listar músicas;
 * - localizar música pelo ID;
 * - construir URLs dos arquivos;
 * - fornecer URL da letra SRT;
 * - normalizar offsets de MIDI e letra;
 * - construir URL da tela de treino.
 *
 * O restante do aplicativo NÃO precisa conhecer
 * a estrutura física das pastas.
 *
 * ============================================================
 */


const CATALOG_URL =
    "./assets/musicas/catalogo.json";


const MUSIC_ROOT =
    "./assets/musicas";


let cachedCatalog =
    null;


/*
 * ============================================================
 * CARREGAR CATÁLOGO
 * ============================================================
 */

export async function loadSongCatalog() {

    if (
        cachedCatalog
    ) {

        return cachedCatalog;
    }


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
            `Não foi possível carregar o catálogo de músicas (${response.status}).`
        );
    }


    const rawCatalog =
        await response.json();


    cachedCatalog =
        normalizeCatalog(
            rawCatalog
        );


    return cachedCatalog;
}


/*
 * ============================================================
 * LIMPAR CACHE
 * ============================================================
 *
 * Útil principalmente para desenvolvimento.
 * ============================================================
 */

export function clearSongCatalogCache() {

    cachedCatalog =
        null;
}


/*
 * ============================================================
 * NORMALIZAR CATÁLOGO
 * ============================================================
 */

function normalizeCatalog(
    rawCatalog
) {

    if (
        !rawCatalog ||
        !Array.isArray(
            rawCatalog.genres
        )
    ) {

        throw new Error(
            "O arquivo catalogo.json possui uma estrutura inválida."
        );
    }


    const genres =
        rawCatalog.genres.map(
            genre => {

                const genreId =
                    String(
                        genre?.id ||
                        ""
                    )
                    .trim();


                const genreName =
                    String(
                        genre?.name ||
                        genreId ||
                        "Sem categoria"
                    )
                    .trim();


                const normalizedSongs =
                    Array.isArray(
                        genre?.songs
                    )
                        ? genre.songs.map(
                            song =>
                                normalizeSong(
                                    song,
                                    {
                                        id:
                                            genreId,

                                        name:
                                            genreName
                                    }
                                )
                        )
                        : [];


                return {

                    id:
                        genreId,

                    name:
                        genreName,

                    songs:
                        normalizedSongs
                };
            }
        );


    return {

        version:
            normalizePositiveInteger(
                rawCatalog.version,
                1
            ),

        genres
    };
}


/*
 * ============================================================
 * NORMALIZAR MÚSICA
 * ============================================================
 */

function normalizeSong(
    song,
    genre
) {

    if (
        !song ||
        !song.id
    ) {

        throw new Error(
            "Foi encontrada uma música sem ID no catálogo."
        );
    }


    const id =
        String(
            song.id
        )
        .trim();


    if (
        !song.folder
    ) {

        throw new Error(
            `A música "${id}" não possui a propriedade folder.`
        );
    }


    if (
        !song.files ||
        !song.files.audio ||
        !song.files.midi
    ) {

        throw new Error(
            `A música "${id}" precisa possuir arquivos audio e midi.`
        );
    }


    return {

        id,

        title:
            String(
                song.title ||
                id
            )
            .trim(),

        artist:
            String(
                song.artist ||
                "Artista não informado"
            )
            .trim(),

        genre:
            String(
                song.genre ||
                genre.id
            )
            .trim(),

        genreName:
            String(
                song.genreName ||
                genre.name ||
                genre.id ||
                "Sem categoria"
            )
            .trim(),

        folder:
            normalizeFolder(
                song.folder
            ),

        duration:
            normalizeNullablePositiveNumber(
                song.duration
            ),

        difficulty:
            normalizeDifficulty(
                song.difficulty
            ),

        language:
            String(
                song.language ||
                "pt-BR"
            )
            .trim(),

        /*
         * ====================================================
         * SINCRONIZAÇÃO
         * ====================================================
         *
         * Sempre retornamos números.
         *
         * Dessa forma o restante do aplicativo
         * nunca precisa lidar com undefined/null.
         *
         * Unidade:
         * SEGUNDOS.
         */
        offset:
            normalizeOffset(
                song.offset
            ),

        lyricsOffset:
            normalizeOffset(
                song.lyricsOffset
            ),

        files: {

            audio:
                normalizeRequiredFileName(
                    song.files.audio,
                    id,
                    "audio"
                ),

            midi:
                normalizeRequiredFileName(
                    song.files.midi,
                    id,
                    "midi"
                ),

            lyrics:
                normalizeOptionalFileName(
                    song.files.lyrics
                ),

            cover:
                normalizeOptionalFileName(
                    song.files.cover
                )
        }
    };
}


/*
 * ============================================================
 * NORMALIZAR OFFSET
 * ============================================================
 *
 * Exemplos válidos:
 *
 * 0
 * -0.25
 * 0.480
 * "0.25"
 *
 * Valores inválidos viram zero.
 *
 * Unidade:
 * segundos.
 *
 * ============================================================
 */

export function normalizeSongOffset(
    value
) {

    return normalizeOffset(
        value
    );
}


function normalizeOffset(
    value
) {

    if (
        value ===
        null ||
        value ===
        undefined ||
        value ===
        ""
    ) {

        return 0;
    }


    const numeric =
        Number(
            value
        );


    return Number.isFinite(
        numeric
    )
        ? numeric
        : 0;
}


/*
 * ============================================================
 * OBTER OFFSETS
 * ============================================================
 */

export function getSongOffsets(
    song
) {

    return {

        midi:
            normalizeOffset(
                song?.offset
            ),

        lyrics:
            normalizeOffset(
                song?.lyricsOffset
            )
    };
}


/*
 * ============================================================
 * NORMALIZAR PASTA
 * ============================================================
 */

function normalizeFolder(
    folder
) {

    return String(
        folder
    )
    .trim()
    .replace(
        /\\/g,
        "/"
    )
    .replace(
        /^\/+/,
        ""
    )
    .replace(
        /\/+$/,
        ""
    );
}


/*
 * ============================================================
 * NORMALIZAR ARQUIVO OBRIGATÓRIO
 * ============================================================
 */

function normalizeRequiredFileName(
    value,
    songId,
    fileType
) {

    const normalized =
        String(
            value ||
            ""
        )
        .trim();


    if (
        !normalized
    ) {

        throw new Error(
            `A música "${songId}" não possui o arquivo obrigatório "${fileType}".`
        );
    }


    return normalizeFileName(
        normalized
    );
}


/*
 * ============================================================
 * NORMALIZAR ARQUIVO OPCIONAL
 * ============================================================
 */

function normalizeOptionalFileName(
    value
) {

    if (
        value ===
        null ||
        value ===
        undefined
    ) {

        return null;
    }


    const normalized =
        String(
            value
        )
        .trim();


    if (
        !normalized
    ) {

        return null;
    }


    return normalizeFileName(
        normalized
    );
}


/*
 * ============================================================
 * NORMALIZAR NOME DE ARQUIVO
 * ============================================================
 */

function normalizeFileName(
    value
) {

    return String(
        value
    )
    .trim()
    .replace(
        /\\/g,
        "/"
    )
    .replace(
        /^\/+/,
        ""
    );
}


/*
 * ============================================================
 * NORMALIZAR DURAÇÃO
 * ============================================================
 */

function normalizeNullablePositiveNumber(
    value
) {

    const numeric =
        Number(
            value
        );


    if (
        !Number.isFinite(
            numeric
        ) ||
        numeric <
            0
    ) {

        return null;
    }


    return numeric;
}


/*
 * ============================================================
 * NORMALIZAR INTEIRO POSITIVO
 * ============================================================
 */

function normalizePositiveInteger(
    value,
    fallback
) {

    const numeric =
        Number.parseInt(
            value,
            10
        );


    if (
        !Number.isFinite(
            numeric
        ) ||
        numeric <
            1
    ) {

        return fallback;
    }


    return numeric;
}


/*
 * ============================================================
 * NORMALIZAR DIFICULDADE
 * ============================================================
 */

function normalizeDifficulty(
    value
) {

    const difficulty =
        String(
            value ||
            "beginner"
        )
        .trim()
        .toLowerCase();


    switch (
        difficulty
    ) {

        case "advanced":
        case "intermediate":
        case "beginner":

            return difficulty;


        default:

            return "beginner";
    }
}


/*
 * ============================================================
 * LISTAR TODAS AS MÚSICAS
 * ============================================================
 */

export function getAllSongs(
    catalog
) {

    if (
        !catalog ||
        !Array.isArray(
            catalog.genres
        )
    ) {

        return [];
    }


    return catalog.genres.flatMap(
        genre =>
            Array.isArray(
                genre.songs
            )
                ? genre.songs
                : []
    );
}


/*
 * ============================================================
 * LISTAR GÊNEROS
 * ============================================================
 */

export function getGenres(
    catalog
) {

    if (
        !catalog ||
        !Array.isArray(
            catalog.genres
        )
    ) {

        return [];
    }


    return catalog.genres;
}


/*
 * ============================================================
 * LOCALIZAR GÊNERO
 * ============================================================
 */

export function findGenreById(
    catalog,
    genreId
) {

    if (
        !catalog ||
        !Array.isArray(
            catalog.genres
        )
    ) {

        return null;
    }


    return (
        catalog.genres.find(
            genre =>
                genre.id ===
                genreId
        ) ||
        null
    );
}


/*
 * ============================================================
 * LOCALIZAR MÚSICA
 * ============================================================
 */

export function findSongById(
    catalog,
    songId
) {

    if (
        !songId
    ) {

        return null;
    }


    const songs =
        getAllSongs(
            catalog
        );


    return (
        songs.find(
            song =>
                song.id ===
                songId
        ) ||
        null
    );
}


/*
 * ============================================================
 * PRIMEIRA MÚSICA DO CATÁLOGO
 * ============================================================
 */

export function getFirstSong(
    catalog
) {

    return (
        getAllSongs(
            catalog
        )[0] ||
        null
    );
}


/*
 * ============================================================
 * CONSTRUIR CAMINHO DE ARQUIVO
 * ============================================================
 */

export function getSongFileUrl(
    song,
    fileType
) {

    if (
        !song ||
        !song.files
    ) {

        return null;
    }


    const fileName =
        song.files[
            fileType
        ];


    if (
        !fileName
    ) {

        return null;
    }


    const folder =
        normalizeFolder(
            song.folder
        );


    const normalizedFile =
        normalizeFileName(
            fileName
        );


    return (
        `${MUSIC_ROOT}/` +
        `${folder}/` +
        `${normalizedFile}`
    );
}


/*
 * ============================================================
 * URL DO INSTRUMENTAL
 * ============================================================
 */

export function getSongAudioUrl(
    song
) {

    return getSongFileUrl(
        song,
        "audio"
    );
}


/*
 * ============================================================
 * URL DO MIDI
 * ============================================================
 */

export function getSongMidiUrl(
    song
) {

    return getSongFileUrl(
        song,
        "midi"
    );
}


/*
 * ============================================================
 * URL DA LETRA
 * ============================================================
 */

export function getSongLyricsUrl(
    song
) {

    return getSongFileUrl(
        song,
        "lyrics"
    );
}


/*
 * ============================================================
 * URL DA CAPA
 * ============================================================
 */

export function getSongCoverUrl(
    song
) {

    return getSongFileUrl(
        song,
        "cover"
    );
}


/*
 * ============================================================
 * VERIFICAR SE POSSUI LETRA
 * ============================================================
 */

export function songHasLyrics(
    song
) {

    return Boolean(
        song?.files?.lyrics
    );
}


/*
 * ============================================================
 * URL DA TELA DE TREINO
 * ============================================================
 */

export function getSongTrainingUrl(
    song
) {

    if (
        !song
    ) {

        return "./melodia.html";
    }


    return (
        "./melodia.html?song=" +
        encodeURIComponent(
            song.id
        )
    );
}


/*
 * ============================================================
 * FORMATAR TEMPO
 * ============================================================
 */

export function formatSongDuration(
    seconds
) {

    if (
        !Number.isFinite(
            Number(
                seconds
            )
        )
    ) {

        return "—";
    }


    const safe =
        Math.max(
            0,
            Number(
                seconds
            )
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
        )
        .padStart(
            2,
            "0"
        )
    );
}