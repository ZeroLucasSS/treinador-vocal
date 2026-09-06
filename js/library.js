/*
 * ============================================================
 * library.js
 * ============================================================
 *
 * Interface da biblioteca de músicas.
 *
 * O conteúdo é construído dinamicamente
 * a partir de catalogo.json.
 *
 * ============================================================
 */


import {
    loadSongCatalog,
    getSongFileUrl,
    getSongTrainingUrl,
    formatSongDuration
} from "./song-catalog.js";


/*
 * ============================================================
 * ELEMENTOS
 * ============================================================
 */

const elements = {

    state:
        document.getElementById(
            "estadoBiblioteca"
        ),

    catalog:
        document.getElementById(
            "catalogoMusicas"
        )
};


/*
 * ============================================================
 * INICIALIZAÇÃO
 * ============================================================
 */

initializeLibrary();


async function initializeLibrary() {

    try {

        const catalog =
            await loadSongCatalog();


        renderCatalog(
            catalog
        );


        elements.state
            .classList
            .add(
                "oculto"
            );


    } catch (error) {

        console.error(
            "Erro ao carregar biblioteca:",
            error
        );


        elements.state.textContent =
            `Não foi possível carregar a biblioteca: ${error.message}`;


        elements.state
            .classList
            .add(
                "erro"
            );
    }
}


/*
 * ============================================================
 * RENDERIZAR CATÁLOGO
 * ============================================================
 */

function renderCatalog(
    catalog
) {

    elements.catalog.innerHTML =
        "";


    const genresWithSongs =
        catalog.genres.filter(
            genre =>
                genre.songs.length >
                0
        );


    if (
        genresWithSongs.length ===
        0
    ) {

        elements.state.textContent =
            "Nenhuma música foi cadastrada.";


        elements.state
            .classList
            .remove(
                "oculto"
            );


        return;
    }


    genresWithSongs.forEach(
        genre => {

            const section =
                createGenreSection(
                    genre
                );


            elements.catalog.appendChild(
                section
            );
        }
    );
}


/*
 * ============================================================
 * CRIAR SEÇÃO DE GÊNERO
 * ============================================================
 */

function createGenreSection(
    genre
) {

    const section =
        document.createElement(
            "section"
        );


    section.className =
        "secao-genero";


    /*
     * Cabeçalho
     */
    const header =
        document.createElement(
            "div"
        );


    header.className =
        "genero-cabecalho";


    const title =
        document.createElement(
            "h2"
        );


    title.textContent =
        genre.name;


    const count =
        document.createElement(
            "span"
        );


    count.textContent =
        genre.songs.length ===
            1
                ? "1 música"
                : `${genre.songs.length} músicas`;


    header.append(
        title,
        count
    );


    /*
     * Grid
     */
    const grid =
        document.createElement(
            "div"
        );


    grid.className =
        "grid-musicas";


    genre.songs.forEach(
        song => {

            grid.appendChild(
                createSongCard(
                    song
                )
            );
        }
    );


    section.append(
        header,
        grid
    );


    return section;
}


/*
 * ============================================================
 * CRIAR CARD
 * ============================================================
 */

function createSongCard(
    song
) {

    const article =
        document.createElement(
            "article"
        );


    article.className =
        "card-musica";


    /*
     * --------------------------------------------------------
     * CAPA
     * --------------------------------------------------------
     */

    const cover =
        document.createElement(
            "div"
        );


    cover.className =
        "capa-musica";


    const coverUrl =
        getSongFileUrl(
            song,
            "cover"
        );


    if (
        coverUrl
    ) {

        const image =
            document.createElement(
                "img"
            );


        image.src =
            coverUrl;


        image.alt =
            `Capa de ${song.title}`;


        image.loading =
            "lazy";


        image.addEventListener(
            "error",
            () => {

                cover.innerHTML =
                    "";


                cover.textContent =
                    "♫";
            }
        );


        cover.appendChild(
            image
        );


    } else {

        cover.textContent =
            "♫";
    }


    /*
     * --------------------------------------------------------
     * CONTEÚDO
     * --------------------------------------------------------
     */

    const content =
        document.createElement(
            "div"
        );


    content.className =
        "card-musica-conteudo";


    const title =
        document.createElement(
            "h3"
        );


    title.textContent =
        song.title;


    const artist =
        document.createElement(
            "p"
        );


    artist.className =
        "artista";


    artist.textContent =
        song.artist;


    /*
     * Metadados
     */
    const metadata =
        document.createElement(
            "div"
        );


    metadata.className =
        "metadados";


    metadata.appendChild(
        createMetadata(
            formatSongDuration(
                song.duration
            )
        )
    );


    metadata.appendChild(
        createMetadata(
            difficultyLabel(
                song.difficulty
            )
        )
    );


    /*
     * Botão
     */
    const button =
        document.createElement(
            "a"
        );


    button.className =
        "botao-treinar";


    button.href =
        getSongTrainingUrl(
            song
        );


    button.textContent =
        "▶ Treinar";


    content.append(
        title,
        artist,
        metadata,
        button
    );


    article.append(
        cover,
        content
    );


    return article;
}


/*
 * ============================================================
 * METADADO
 * ============================================================
 */

function createMetadata(
    text
) {

    const span =
        document.createElement(
            "span"
        );


    span.className =
        "metadado";


    span.textContent =
        text;


    return span;
}


/*
 * ============================================================
 * DIFICULDADE
 * ============================================================
 */

function difficultyLabel(
    difficulty
) {

    switch (
        difficulty
    ) {

        case "advanced":

            return "Avançado";


        case "intermediate":

            return "Intermediário";


        case "beginner":

        default:

            return "Iniciante";
    }
}