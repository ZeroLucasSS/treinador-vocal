/*
 * ============================================================
 * library.js
 * ============================================================
 *
 * AGA-KÊ COMICS — BIBLIOTECA HQ
 *
 * Responsável por:
 *
 * - carregar o catálogo de músicas;
 * - exibir gêneros como seções recolhíveis;
 * - renderizar músicas sob demanda;
 * - pesquisar por música, artista ou gênero;
 * - exibir contadores da biblioteca;
 * - controlar estados de carregamento, erro e busca vazia;
 * - gerar os cards que levam ao KaraoKê HQ.
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
 * CONFIGURAÇÕES
 * ============================================================
 */

const SEARCH_DEBOUNCE_MS =
    120;


/*
 * Ícones meramente visuais.
 *
 * Se um gênero não estiver nesta lista,
 * utilizamos uma nota musical como fallback.
 *
 * Os nomes são normalizados antes da comparação.
 */
const GENRE_ICONS = {

    /* Rock / derivados */
    rock: "🎸",
    poprock: "🎸",
    alternativo: "🎸",
    indie: "🎸",
    punk: "⚡",
    metal: "🤘",
    heavymetal: "🤘",

    /* Pop */
    pop: "🎤",
    dancepop: "💃",
    synthpop: "🎹",

    /* Sertanejo / country */
    sertanejo: "🤠",
    sertaneja: "🤠",
    country: "🤠",

    /* Samba / Pagode */
    samba: "🥁",
    pagode: "🥁",

    /* Reggae */
    reggae: "🌴",

    /* Gospel / religioso */
    gospel: "🙏",
    worship: "🙌",
    catolica: "✝",
    catolicas: "✝",
    cristao: "✝",
    crista: "✝",
    religioso: "✝",

    /* Românticas */
    romantica: "❤️",
    romanticas: "❤️",
    romantic: "❤️",

    /* MPB */
    mpb: "🎶",

    /* Funk */
    funk: "🔥",

    /* Rap / Hip-Hop */
    rap: "🎙️",
    hiphop: "🎙️",
    trap: "🎧",

    /* Eletrônica */
    eletronica: "🎧",
    eletronico: "🎧",
    edm: "🎧",
    house: "🎛️",
    techno: "🎛️",

    /* Jazz / Blues / Soul */
    jazz: "🎷",
    blues: "🎷",
    soul: "🎙️",
    rnb: "🎙️",

    /* Forró / Nordeste */
    forro: "💑",
    baiao: "💑",
    xote: "💑",
    piseiro: "💑",

    /* Axé */
    axe: "☀️",

    /* Arrocha */
    arrocha: "💔",

    /* Brega */
    brega: "💖",

    /* Frevo */
    frevo: "☂️",

    /* Maracatu */
    maracatu: "🥁",

    /* Clássico */
    classica: "🎼",
    classico: "🎼",
    opera: "🎼",

    /* Infantil */
    infantil: "⭐",

    /* Instrumental */
    instrumental: "🎹",

    /* Acústico */
    acustico: "🎻",

    /* Latina */
    latina: "💃",
    latin: "💃",
    salsa: "💃",
    merengue: "💃",
    bachata: "💃",
    reggaeton: "🔥",

    /* Disco */
    disco: "💿",

    /* Lo-fi */
    lofi: "🌙",

    /* K-pop */
    kpop: "✨",

    /* Trilhas / soundtrack */
    trilha: "🎬",
    soundtrack: "🎬",

    /* Folk */
    folk: "🪕",

    /* Outros estilos populares */
    dance: "💃",
    balada: "💫",
    vozviolao: "🎸",
    acapella: "🎤"
};


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
        ),


    totalSongs:
        document.getElementById(
            "totalMusicasBiblioteca"
        ),

    totalGenres:
        document.getElementById(
            "totalGenerosBiblioteca"
        ),


    searchInput:
        document.getElementById(
            "campoBuscaBiblioteca"
        ),

    clearSearchButton:
        document.getElementById(
            "botaoLimparBusca"
        ),

    searchSummary:
        document.getElementById(
            "resumoBuscaBiblioteca"
        ),


    searchArea:
        document.getElementById(
            "areaResultadosBusca"
        ),

    searchGrid:
        document.getElementById(
            "gridResultadosBusca"
        ),


    noResults:
        document.getElementById(
            "estadoSemResultados"
        )
};


/*
 * ============================================================
 * ESTADO
 * ============================================================
 */

let catalogData =
    null;


let genresWithSongs =
    [];


let allSongs =
    [];


let searchTimer =
    null;


/*
 * ============================================================
 * INICIALIZAÇÃO
 * ============================================================
 */

validateRequiredElements();


bindEvents();


initializeLibrary();


/*
 * ============================================================
 * VALIDAR ELEMENTOS
 * ============================================================
 */

function validateRequiredElements() {

    const required = {

        estadoBiblioteca:
            elements.state,

        catalogoMusicas:
            elements.catalog,

        totalMusicasBiblioteca:
            elements.totalSongs,

        totalGenerosBiblioteca:
            elements.totalGenres,

        campoBuscaBiblioteca:
            elements.searchInput,

        botaoLimparBusca:
            elements.clearSearchButton,

        resumoBuscaBiblioteca:
            elements.searchSummary,

        areaResultadosBusca:
            elements.searchArea,

        gridResultadosBusca:
            elements.searchGrid,

        estadoSemResultados:
            elements.noResults
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
            `Elementos obrigatórios da biblioteca não encontrados: ${missing.join(", ")}`
        );
    }
}


/*
 * ============================================================
 * EVENTOS
 * ============================================================
 */

function bindEvents() {

    elements.searchInput
        .addEventListener(
            "input",
            handleSearchInput
        );


    elements.searchInput
        .addEventListener(
            "search",
            () => {

                performSearch(
                    elements.searchInput.value
                );
            }
        );


    elements.clearSearchButton
        .addEventListener(
            "click",
            clearSearch
        );
}


/*
 * ============================================================
 * CARREGAR BIBLIOTECA
 * ============================================================
 */

async function initializeLibrary() {

    showLoadingState();


    try {

        catalogData =
            await loadSongCatalog();


        prepareCatalogData(
            catalogData
        );


        updateLibraryCounters();


        renderCatalog();


        hideLibraryState();


    } catch (error) {

        console.error(
            "Erro ao carregar biblioteca:",
            error
        );


        showErrorState(
            error
        );
    }
}


/*
 * ============================================================
 * PREPARAR CATÁLOGO
 * ============================================================
 */

function prepareCatalogData(
    catalog
) {

    const genres =
        Array.isArray(
            catalog?.genres
        )
            ? catalog.genres
            : [];


    genresWithSongs =
        genres.filter(
            genre =>
                Array.isArray(
                    genre.songs
                ) &&
                genre.songs.length >
                    0
        );


    /*
     * Criamos uma lista plana apenas para busca.
     *
     * As músicas continuam pertencendo aos gêneros
     * no catálogo original.
     */
    allSongs =
        genresWithSongs.flatMap(
            genre =>
                genre.songs.map(
                    song => ({

                        ...song,

                        genre:
                            song.genre ||
                            genre.id ||
                            "",

                        genreName:
                            song.genreName ||
                            genre.name ||
                            genre.id ||
                            "Sem categoria"
                    })
                )
        );
}


/*
 * ============================================================
 * CONTADORES
 * ============================================================
 */

function updateLibraryCounters() {

    elements.totalSongs.textContent =
        String(
            allSongs.length
        );


    elements.totalGenres.textContent =
        String(
            genresWithSongs.length
        );
}


/*
 * ============================================================
 * ESTADO — CARREGANDO
 * ============================================================
 */

function showLoadingState() {

    elements.state
        .classList
        .remove(
            "oculto",
            "erro"
        );


    elements.state.innerHTML =
        "";


    const icon =
        document.createElement(
            "span"
        );


    icon.className =
        "estado-biblioteca-icone";


    icon.setAttribute(
        "aria-hidden",
        "true"
    );


    icon.textContent =
        "♫";


    const text =
        document.createElement(
            "span"
        );


    text.textContent =
        "Carregando músicas...";


    elements.state.append(
        icon,
        text
    );
}


/*
 * ============================================================
 * ESTADO — ERRO
 * ============================================================
 */

function showErrorState(
    error
) {

    elements.state
        .classList
        .remove(
            "oculto"
        );


    elements.state
        .classList
        .add(
            "erro"
        );


    elements.state.textContent =
        `Não foi possível carregar a biblioteca: ${
            error?.message ||
            "erro desconhecido."
        }`;


    elements.catalog.innerHTML =
        "";


    elements.searchArea
        .classList
        .add(
            "oculto"
        );


    elements.noResults
        .classList
        .add(
            "oculto"
        );


    elements.totalSongs.textContent =
        "—";


    elements.totalGenres.textContent =
        "—";
}


/*
 * ============================================================
 * ESCONDER ESTADO
 * ============================================================
 */

function hideLibraryState() {

    elements.state
        .classList
        .add(
            "oculto"
        );


    elements.state
        .classList
        .remove(
            "erro"
        );
}


/*
 * ============================================================
 * RENDERIZAR CATÁLOGO
 * ============================================================
 */

function renderCatalog() {

    elements.catalog.innerHTML =
        "";


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


    const fragment =
        document.createDocumentFragment();


    genresWithSongs.forEach(
        (
            genre,
            index
        ) => {

            fragment.appendChild(
                createGenreSection(
                    genre,
                    index
                )
            );
        }
    );


    elements.catalog.appendChild(
        fragment
    );
}


/*
 * ============================================================
 * CRIAR SEÇÃO DE GÊNERO
 * ============================================================
 */

function createGenreSection(
    genre,
    index
) {

    const section =
        document.createElement(
            "section"
        );


    section.className =
        "secao-genero";


    section.dataset.genreId =
        String(
            genre.id ||
            index
        );


    section.dataset.rendered =
        "false";


    /*
     * ID usado por aria-controls.
     */
    const contentId =
        `genero-conteudo-${sanitizeId(
            genre.id ||
            genre.name ||
            String(index)
        )}-${index}`;


    /*
     * ========================================================
     * CABEÇALHO CLICÁVEL
     * ========================================================
     */

    const header =
        document.createElement(
            "button"
        );


    header.className =
        "genero-cabecalho";


    header.type =
        "button";


    header.setAttribute(
        "aria-expanded",
        "false"
    );


    header.setAttribute(
        "aria-controls",
        contentId
    );


    /*
     * Ícone.
     */
    const icon =
        document.createElement(
            "span"
        );


    icon.className =
        "genero-icone";


    icon.setAttribute(
        "aria-hidden",
        "true"
    );


    icon.textContent =
        getGenreIcon(
            genre
        );


    /*
     * Identidade.
     */
    const identity =
        document.createElement(
            "span"
        );


    identity.className =
        "genero-identidade";


    const label =
        document.createElement(
            "span"
        );


    label.className =
        "genero-etiqueta";


    label.textContent =
        "GÊNERO MUSICAL";


    const title =
        document.createElement(
            "h2"
        );


    title.textContent =
        genre.name ||
        genre.id ||
        "Sem categoria";


    identity.append(
        label,
        title
    );


    /*
     * Ação.
     */
    const action =
        document.createElement(
            "span"
        );


    action.className =
        "genero-acao";


    const count =
        document.createElement(
            "span"
        );


    count.className =
        "genero-contagem";


    count.textContent =
        formatSongCount(
            genre.songs.length
        );


    const expand =
        document.createElement(
            "span"
        );


    expand.className =
        "genero-expandir";


    const expandText =
        document.createElement(
            "span"
        );


    expandText.className =
        "genero-expandir-texto";


    expandText.textContent =
        "Explorar";


    const arrow =
        document.createElement(
            "span"
        );


    arrow.className =
        "genero-seta";


    arrow.setAttribute(
        "aria-hidden",
        "true"
    );


    arrow.textContent =
        "▼";


    expand.append(
        expandText,
        arrow
    );


    action.append(
        count,
        expand
    );


    header.append(
        icon,
        identity,
        action
    );


    /*
     * ========================================================
     * CONTEÚDO RECOLHÍVEL
     * ========================================================
     */

    const content =
        document.createElement(
            "div"
        );


    content.className =
        "genero-conteudo";


    content.id =
        contentId;


    const grid =
        document.createElement(
            "div"
        );


    grid.className =
        "grid-musicas";


    content.appendChild(
        grid
    );


    /*
     * ========================================================
     * EVENTO
     * ========================================================
     */

    header.addEventListener(
        "click",
        () => {

            toggleGenreSection(
                section,
                genre,
                grid,
                header,
                expandText
            );
        }
    );


    section.append(
        header,
        content
    );


    return section;
}


/*
 * ============================================================
 * ABRIR / FECHAR GÊNERO
 * ============================================================
 */

function toggleGenreSection(
    section,
    genre,
    grid,
    header,
    expandText
) {

    const isOpen =
        section.classList.contains(
            "aberto"
        );


    if (
        isOpen
    ) {

        closeGenreSection(
            section,
            header,
            expandText
        );

        return;
    }


    openGenreSection(
        section,
        genre,
        grid,
        header,
        expandText
    );
}


/*
 * ============================================================
 * ABRIR GÊNERO
 * ============================================================
 */

function openGenreSection(
    section,
    genre,
    grid,
    header,
    expandText
) {

    /*
     * Lazy rendering.
     *
     * Os cards só são construídos quando o gênero
     * é aberto pela primeira vez.
     */
    if (
        section.dataset.rendered !==
        "true"
    ) {

        renderGenreSongs(
            genre,
            grid
        );


        section.dataset.rendered =
            "true";
    }


    section.classList.add(
        "aberto"
    );


    header.setAttribute(
        "aria-expanded",
        "true"
    );


    expandText.textContent =
        "Recolher";
}


/*
 * ============================================================
 * FECHAR GÊNERO
 * ============================================================
 */

function closeGenreSection(
    section,
    header,
    expandText
) {

    section.classList.remove(
        "aberto"
    );


    header.setAttribute(
        "aria-expanded",
        "false"
    );


    expandText.textContent =
        "Explorar";
}


/*
 * ============================================================
 * RENDERIZAR MÚSICAS DO GÊNERO
 * ============================================================
 */

function renderGenreSongs(
    genre,
    grid
) {

    grid.innerHTML =
        "";


    const fragment =
        document.createDocumentFragment();


    genre.songs.forEach(
        song => {

            const preparedSong = {

                ...song,

                genre:
                    song.genre ||
                    genre.id ||
                    "",

                genreName:
                    song.genreName ||
                    genre.name ||
                    genre.id ||
                    ""
            };


            fragment.appendChild(
                createSongCard(
                    preparedSong
                )
            );
        }
    );


    grid.appendChild(
        fragment
    );
}


/*
 * ============================================================
 * BUSCA — INPUT
 * ============================================================
 */

function handleSearchInput() {

    if (
        searchTimer !==
        null
    ) {

        window.clearTimeout(
            searchTimer
        );
    }


    searchTimer =
        window.setTimeout(
            () => {

                searchTimer =
                    null;


                performSearch(
                    elements.searchInput.value
                );
            },
            SEARCH_DEBOUNCE_MS
        );
}


/*
 * ============================================================
 * EXECUTAR BUSCA
 * ============================================================
 */

function performSearch(
    rawQuery
) {

    const query =
        normalizeSearchText(
            rawQuery
        );


    /*
     * Campo vazio:
     * voltamos à navegação por gênero.
     */
    if (
        !query
    ) {

        showCatalogMode();

        return;
    }


    const matches =
        allSongs.filter(
            song =>
                songMatchesSearch(
                    song,
                    query
                )
        );


    showSearchMode(
        rawQuery,
        matches
    );
}


/*
 * ============================================================
 * VERIFICAR CORRESPONDÊNCIA DA BUSCA
 * ============================================================
 */

function songMatchesSearch(
    song,
    normalizedQuery
) {

    const searchableFields = [

        song.title,

        song.artist,

        song.genreName,

        song.genre
    ];


    return searchableFields.some(
        value =>
            normalizeSearchText(
                value
            )
            .includes(
                normalizedQuery
            )
    );
}


/*
 * ============================================================
 * EXIBIR MODO DE BUSCA
 * ============================================================
 */

function showSearchMode(
    rawQuery,
    matches
) {

    elements.clearSearchButton
        .classList
        .remove(
            "oculto"
        );


    /*
     * O catálogo por gêneros sai de cena.
     */
    elements.catalog
        .classList
        .add(
            "oculto"
        );


    elements.searchGrid.innerHTML =
        "";


    /*
     * Nenhum resultado.
     */
    if (
        matches.length ===
        0
    ) {

        elements.searchArea
            .classList
            .add(
                "oculto"
            );


        elements.noResults
            .classList
            .remove(
                "oculto"
            );


        updateSearchSummary(
            rawQuery,
            0
        );


        return;
    }


    /*
     * Existem resultados.
     */
    elements.noResults
        .classList
        .add(
            "oculto"
        );


    elements.searchArea
        .classList
        .remove(
            "oculto"
        );


    const fragment =
        document.createDocumentFragment();


    matches.forEach(
        song => {

            fragment.appendChild(
                createSongCard(
                    song,
                    {
                        showGenre:
                            true
                    }
                )
            );
        }
    );


    elements.searchGrid.appendChild(
        fragment
    );


    updateSearchSummary(
        rawQuery,
        matches.length
    );
}


/*
 * ============================================================
 * EXIBIR MODO CATÁLOGO
 * ============================================================
 */

function showCatalogMode() {

    elements.catalog
        .classList
        .remove(
            "oculto"
        );


    elements.searchArea
        .classList
        .add(
            "oculto"
        );


    elements.noResults
        .classList
        .add(
            "oculto"
        );


    elements.searchGrid.innerHTML =
        "";


    elements.searchSummary
        .classList
        .add(
            "oculto"
        );


    elements.searchSummary.textContent =
        "";


    elements.clearSearchButton
        .classList
        .add(
            "oculto"
        );
}


/*
 * ============================================================
 * RESUMO DA BUSCA
 * ============================================================
 */

function updateSearchSummary(
    rawQuery,
    count
) {

    const cleanQuery =
        String(
            rawQuery ||
            ""
        )
        .trim();


    let message =
        "";


    if (
        count ===
        0
    ) {

        message =
            `Nenhuma música encontrada para “${cleanQuery}”.`;

    } else if (
        count ===
        1
    ) {

        message =
            `1 música encontrada para “${cleanQuery}”.`;

    } else {

        message =
            `${count} músicas encontradas para “${cleanQuery}”.`;
    }


    elements.searchSummary.textContent =
        message;


    elements.searchSummary
        .classList
        .remove(
            "oculto"
        );
}


/*
 * ============================================================
 * LIMPAR BUSCA
 * ============================================================
 */

function clearSearch() {

    if (
        searchTimer !==
        null
    ) {

        window.clearTimeout(
            searchTimer
        );


        searchTimer =
            null;
    }


    elements.searchInput.value =
        "";


    showCatalogMode();


    elements.searchInput.focus();
}


/*
 * ============================================================
 * CRIAR CARD DE MÚSICA
 * ============================================================
 */

function createSongCard(
    song,
    options =
        {}
) {

    const {
        showGenre =
            false
    } = options;


    const article =
        document.createElement(
            "article"
        );


    article.className =
        "card-musica";


    /*
     * ========================================================
     * CAPA
     * ========================================================
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


        image.decoding =
            "async";


        image.addEventListener(
            "error",
            () => {

                cover.innerHTML =
                    "";


                cover.textContent =
                    "♫";
            },
            {
                once:
                    true
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
     * ========================================================
     * CONTEÚDO
     * ========================================================
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
        song.title ||
        "Música sem título";


    const artist =
        document.createElement(
            "p"
        );


    artist.className =
        "artista";


    artist.textContent =
        song.artist ||
        "Artista não informado";


    /*
     * ========================================================
     * METADADOS
     * ========================================================
     */

    const metadata =
        document.createElement(
            "div"
        );


    metadata.className =
        "metadados";


    const duration =
        formatSongDuration(
            song.duration
        );


    if (
        duration
    ) {

        metadata.appendChild(
            createMetadata(
                duration
            )
        );
    }


    metadata.appendChild(
        createMetadata(
            difficultyLabel(
                song.difficulty
            )
        )
    );


    /*
     * Na busca é útil mostrar o gênero,
     * pois os resultados misturam categorias.
     */
    if (
        showGenre &&
        song.genreName
    ) {

        metadata.appendChild(
            createMetadata(
                song.genreName
            )
        );
    }


    /*
     * ========================================================
     * BOTÃO
     * ========================================================
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


    const buttonIcon =
        document.createElement(
            "span"
        );


    buttonIcon.setAttribute(
        "aria-hidden",
        "true"
    );


    buttonIcon.textContent =
        "▶";


    const buttonText =
        document.createElement(
            "span"
        );


    buttonText.textContent =
        "Cantar agora";


    button.append(
        buttonIcon,
        buttonText
    );


    /*
     * ========================================================
     * MONTAGEM
     * ========================================================
     */

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
 * CRIAR METADADO
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
        String(
            text ||
            ""
        );


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
        String(
            difficulty ||
            ""
        )
        .toLowerCase()
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


/*
 * ============================================================
 * CONTAGEM DE MÚSICAS
 * ============================================================
 */

function formatSongCount(
    count
) {

    const safeCount =
        Number(
            count
        ) || 0;


    return (
        safeCount ===
        1
            ? "1 música"
            : `${safeCount} músicas`
    );
}


/*
 * ============================================================
 * ÍCONE DO GÊNERO
 * ============================================================
 */

function getGenreIcon(
    genre
) {

    const candidates = [

        genre?.id,

        genre?.name
    ];


    for (
        const candidate of
        candidates
    ) {

        const normalized =
            normalizeGenreKey(
                candidate
            );


        if (
            normalized &&
            GENRE_ICONS[
                normalized
            ]
        ) {

            return GENRE_ICONS[
                normalized
            ];
        }


        /*
         * Permite IDs compostos:
         *
         * rock-nacional
         * pop-rock
         * musica-catolica
         */
        const matchedKey =
            Object.keys(
                GENRE_ICONS
            )
            .find(
                key =>
                    normalized.includes(
                        key
                    )
            );


        if (
            matchedKey
        ) {

            return GENRE_ICONS[
                matchedKey
            ];
        }
    }


    return "♫";
}


/*
 * ============================================================
 * NORMALIZAÇÃO PARA BUSCA
 * ============================================================
 */

function normalizeSearchText(
    value
) {

    return String(
        value ||
        ""
    )
    .normalize(
        "NFD"
    )
    .replace(
        /[\u0300-\u036f]/g,
        ""
    )
    .toLocaleLowerCase(
        "pt-BR"
    )
    .replace(
        /\s+/g,
        " "
    )
    .trim();
}


/*
 * ============================================================
 * NORMALIZAÇÃO DE CHAVE DE GÊNERO
 * ============================================================
 */

function normalizeGenreKey(
    value
) {

    return normalizeSearchText(
        value
    )
    .replace(
        /[^a-z0-9]+/g,
        ""
    );
}


/*
 * ============================================================
 * ID HTML SEGURO
 * ============================================================
 */

function sanitizeId(
    value
) {

    const normalized =
        normalizeSearchText(
            value
        )
        .replace(
            /[^a-z0-9]+/g,
            "-"
        )
        .replace(
            /^-+|-+$/g,
            ""
        );


    return (
        normalized ||
        "genero"
    );
}