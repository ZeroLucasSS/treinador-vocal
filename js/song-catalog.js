/*
 * ============================================================
 * song-catalog.js
 * ============================================================
 *
 * Responsável por:
 *
 * - carregar catalogo.json;
 * - normalizar os dados;
 * - listar gêneros;
 * - listar músicas;
 * - localizar música pelo ID;
 * - construir os caminhos dos arquivos.
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

                const normalizedSongs =
                    Array.isArray(
                        genre.songs
                    )
                        ? genre.songs.map(
                            song =>
                                normalizeSong(
                                    song,
                                    genre
                                )
                        )
                        : [];


                return {

                    id:
                        String(
                            genre.id ||
                            ""
                        ),

                    name:
                        String(
                            genre.name ||
                            genre.id ||
                            "Sem categoria"
                        ),

                    songs:
                        normalizedSongs
                };
            }
        );


    return {

        version:
            Number(
                rawCatalog.version
            ) || 1,

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


    if (
        !song.folder
    ) {

        throw new Error(
            `A música "${song.id}" não possui a propriedade folder.`
        );
    }


    if (
        !song.files ||
        !song.files.audio ||
        !song.files.midi
    ) {

        throw new Error(
            `A música "${song.id}" precisa possuir arquivos audio e midi.`
        );
    }


    return {

        id:
            String(
                song.id
            ),

        title:
            String(
                song.title ||
                song.id
            ),

        artist:
            String(
                song.artist ||
                "Artista não informado"
            ),

        genre:
            String(
                song.genre ||
                genre.id
            ),

        genreName:
            String(
                genre.name ||
                genre.id
            ),

        folder:
            normalizeFolder(
                song.folder
            ),

        duration:
            Number.isFinite(
                Number(
                    song.duration
                )
            )
                ? Number(
                    song.duration
                )
                : null,

        difficulty:
            String(
                song.difficulty ||
                "beginner"
            ),

        language:
            String(
                song.language ||
                "pt-BR"
            ),

        files: {

            audio:
                String(
                    song.files.audio
                ),

            midi:
                String(
                    song.files.midi
                ),

            lyrics:
                song.files.lyrics
                    ? String(
                        song.files.lyrics
                    )
                    : null,

            cover:
                song.files.cover
                    ? String(
                        song.files.cover
                    )
                    : null
        }
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
            genre.songs
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


    return (
        `${MUSIC_ROOT}/` +
        `${song.folder}/` +
        `${fileName}`
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