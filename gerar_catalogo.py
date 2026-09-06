"""
============================================================
gerar_catalogo.py
============================================================

Gerador automático do catálogo de músicas
do Treinador Vocal.

------------------------------------------------------------
ESTRUTURA ESPERADA
------------------------------------------------------------

assets/
└── musicas/
    ├── catalogo.json
    │
    ├── catolicas/
    │   ├── genero.json
    │   │
    │   └── nome-da-musica-artista/
    │       ├── musica.json
    │       ├── instrumental.mp3
    │       ├── voz.mid
    │       ├── letra.srt
    │       └── capa.jpg
    │
    └── pop-rock/
        └── outra-musica-artista/
            ├── musica.json
            ├── instrumental.mp3
            ├── voz.mid
            ├── letra.srt
            └── capa.jpg


------------------------------------------------------------
EXEMPLO DE musica.json
------------------------------------------------------------

{
    "title": "Ninguém te ama como Eu",
    "artist": "Marcos André",
    "difficulty": "intermediate",
    "language": "pt-BR",
    "offset": -0.24,
    "lyricsOffset": 0
}


------------------------------------------------------------
CONVENÇÃO DOS OFFSETS
------------------------------------------------------------

Unidade:
    segundos

offset:
    sincronização MIDI ↔ MP3

lyricsOffset:
    sincronização SRT ↔ MP3

Valor positivo:
    atrasa o elemento.

Valor negativo:
    adianta o elemento.

Exemplo:

    "offset": -0.24

significa:

    adiantar o MIDI em 240 ms.


------------------------------------------------------------
EXEMPLO OPCIONAL DE genero.json
------------------------------------------------------------

{
    "name": "Católicas"
}


------------------------------------------------------------
O SCRIPT DETECTA AUTOMATICAMENTE
------------------------------------------------------------

- ID do gênero;
- nome do gênero;
- ID da música;
- pasta;
- instrumental.mp3;
- voz.mid;
- letra.srt;
- capa;
- duração do MP3.

Também copia de musica.json:

- title;
- artist;
- difficulty;
- language;
- offset;
- lyricsOffset.


------------------------------------------------------------
DEPENDÊNCIA
------------------------------------------------------------

pip install mutagen

============================================================
"""

from __future__ import annotations

import json
import math
import sys
import unicodedata

from pathlib import Path
from typing import Any


# ============================================================
# CONFIGURAÇÕES
# ============================================================

PROJECT_ROOT = (
    Path(__file__)
    .resolve()
    .parent
)


MUSIC_ROOT = (
    PROJECT_ROOT
    / "assets"
    / "musicas"
)


CATALOG_PATH = (
    MUSIC_ROOT
    / "catalogo.json"
)


SONG_METADATA_FILENAME = (
    "musica.json"
)


GENRE_METADATA_FILENAME = (
    "genero.json"
)


AUDIO_FILENAME = (
    "instrumental.mp3"
)


MIDI_FILENAME = (
    "voz.mid"
)


LYRICS_FILENAME = (
    "letra.srt"
)


COVER_FILENAMES = (
    "capa.jpg",
    "capa.jpeg",
    "capa.png",
    "capa.webp",
)


DEFAULT_DIFFICULTY = (
    "beginner"
)


DEFAULT_LANGUAGE = (
    "pt-BR"
)


DEFAULT_OFFSET = (
    0.0
)


DEFAULT_LYRICS_OFFSET = (
    0.0
)


CATALOG_VERSION = (
    1
)


VALID_DIFFICULTIES = {
    "beginner",
    "intermediate",
    "advanced",
}


# ============================================================
# TERMINAL
# ============================================================

class Terminal:

    OK = "[OK]"

    INFO = "[INFO]"

    WARN = "[AVISO]"

    ERROR = "[ERRO]"


# ============================================================
# ERRO ESPECÍFICO
# ============================================================

class CatalogGenerationError(
    Exception
):
    pass


# ============================================================
# EXECUÇÃO PRINCIPAL
# ============================================================

def main() -> int:

    print()

    print(
        "=" * 68
    )

    print(
        " GERADOR DO CATÁLOGO DE MÚSICAS"
    )

    print(
        "=" * 68
    )

    print()


    try:

        validate_music_root()


        old_catalog = (
            load_existing_catalog()
        )


        genres = scan_genres(
            old_catalog
        )


        validate_duplicate_song_ids(
            genres
        )


        catalog = {

            "version":
                CATALOG_VERSION,

            "genres":
                genres,
        }


        write_catalog(
            catalog
        )


        print_summary(
            catalog
        )


        return 0


    except CatalogGenerationError as error:

        print()

        print(
            f"{Terminal.ERROR} {error}"
        )

        print()

        return 1


    except Exception as error:

        print()

        print(
            f"{Terminal.ERROR} "
            "Erro inesperado:"
        )

        print(
            f"       "
            f"{type(error).__name__}: "
            f"{error}"
        )

        print()

        return 1


# ============================================================
# VALIDAR PASTA PRINCIPAL
# ============================================================

def validate_music_root() -> None:

    if not MUSIC_ROOT.exists():

        raise CatalogGenerationError(
            "A pasta de músicas não foi encontrada:\n"
            f"{MUSIC_ROOT}"
        )


    if not MUSIC_ROOT.is_dir():

        raise CatalogGenerationError(
            "O caminho de músicas não é uma pasta:\n"
            f"{MUSIC_ROOT}"
        )


# ============================================================
# CARREGAR CATÁLOGO EXISTENTE
# ============================================================

def load_existing_catalog() -> dict[str, Any]:

    if not CATALOG_PATH.exists():

        return {

            "version":
                CATALOG_VERSION,

            "genres":
                [],
        }


    try:

        with CATALOG_PATH.open(
            "r",
            encoding="utf-8"
        ) as file:

            data = json.load(
                file
            )


    except json.JSONDecodeError as error:

        raise CatalogGenerationError(
            "O catalogo.json existente contém JSON inválido.\n"
            f"Linha {error.lineno}, "
            f"coluna {error.colno}: "
            f"{error.msg}"
        ) from error


    except OSError as error:

        raise CatalogGenerationError(
            "Não foi possível ler o catalogo.json existente."
        ) from error


    if not isinstance(
        data,
        dict
    ):

        return {

            "version":
                CATALOG_VERSION,

            "genres":
                [],
        }


    return data


# ============================================================
# NOMES DE GÊNEROS EXISTENTES
# ============================================================

def get_existing_genre_names(
    old_catalog: dict[str, Any]
) -> dict[str, str]:

    result: dict[
        str,
        str
    ] = {}


    genres = old_catalog.get(
        "genres",
        []
    )


    if not isinstance(
        genres,
        list
    ):

        return result


    for genre in genres:

        if not isinstance(
            genre,
            dict
        ):

            continue


        genre_id = str(
            genre.get(
                "id",
                ""
            )
        ).strip()


        genre_name = str(
            genre.get(
                "name",
                ""
            )
        ).strip()


        if (
            genre_id
            and genre_name
        ):

            result[
                genre_id
            ] = genre_name


    return result


# ============================================================
# VARRER GÊNEROS
# ============================================================

def scan_genres(
    old_catalog: dict[str, Any]
) -> list[dict[str, Any]]:

    existing_names = (
        get_existing_genre_names(
            old_catalog
        )
    )


    genres: list[
        dict[str, Any]
    ] = []


    genre_directories = sorted(
        (
            path
            for path
            in MUSIC_ROOT.iterdir()
            if path.is_dir()
            and not path.name.startswith(
                "."
            )
            and not path.name.startswith(
                "_"
            )
        ),
        key=lambda path:
            normalize_sort_text(
                path.name
            )
    )


    if not genre_directories:

        print(
            f"{Terminal.WARN} "
            "Nenhuma pasta de gênero foi encontrada."
        )

        return genres


    for genre_directory in genre_directories:

        genre_id = (
            genre_directory.name
        )


        genre_name = get_genre_name(
            genre_directory,
            existing_names
        )


        print(
            f"{Terminal.INFO} "
            f"Gênero: {genre_name}"
        )


        songs = scan_songs(
            genre_directory,
            genre_id
        )


        genres.append(
            {

                "id":
                    genre_id,

                "name":
                    genre_name,

                "songs":
                    songs,
            }
        )


        print(
            f"       "
            f"{len(songs)} música(s)"
        )

        print()


    return genres


# ============================================================
# OBTER NOME DO GÊNERO
# ============================================================

def get_genre_name(
    genre_directory: Path,
    existing_names: dict[str, str]
) -> str:

    metadata_path = (
        genre_directory
        / GENRE_METADATA_FILENAME
    )


    # --------------------------------------------------------
    # 1. genero.json
    # --------------------------------------------------------

    if metadata_path.exists():

        metadata = read_json_file(
            metadata_path
        )


        name = str(
            metadata.get(
                "name",
                ""
            )
        ).strip()


        if name:

            return name


    # --------------------------------------------------------
    # 2. Nome já presente no catálogo
    # --------------------------------------------------------

    if (
        genre_directory.name
        in existing_names
    ):

        return existing_names[
            genre_directory.name
        ]


    # --------------------------------------------------------
    # 3. Gerar pelo slug
    # --------------------------------------------------------

    return slug_to_display_name(
        genre_directory.name
    )


# ============================================================
# VARRER MÚSICAS
# ============================================================

def scan_songs(
    genre_directory: Path,
    genre_id: str
) -> list[dict[str, Any]]:

    songs: list[
        dict[str, Any]
    ] = []


    song_directories = sorted(
        (
            path
            for path
            in genre_directory.iterdir()
            if path.is_dir()
            and not path.name.startswith(
                "."
            )
            and not path.name.startswith(
                "_"
            )
        ),
        key=lambda path:
            normalize_sort_text(
                path.name
            )
    )


    for song_directory in song_directories:

        try:

            song = build_song_entry(
                genre_id,
                song_directory
            )


            songs.append(
                song
            )


            print_song_summary(
                song
            )


        except CatalogGenerationError as error:

            raise CatalogGenerationError(
                "Problema na pasta:\n"
                f"{song_directory}\n\n"
                f"{error}"
            ) from error


    return songs


# ============================================================
# CONSTRUIR REGISTRO DA MÚSICA
# ============================================================

def build_song_entry(
    genre_id: str,
    song_directory: Path
) -> dict[str, Any]:

    metadata_path = (
        song_directory
        / SONG_METADATA_FILENAME
    )


    if not metadata_path.exists():

        raise CatalogGenerationError(
            f"O arquivo "
            f"{SONG_METADATA_FILENAME} "
            "não foi encontrado."
        )


    metadata = read_json_file(
        metadata_path
    )


    # ========================================================
    # ID
    # ========================================================

    song_id = str(
        metadata.get(
            "id",
            song_directory.name
        )
    ).strip()


    if not song_id:

        raise CatalogGenerationError(
            "A música não possui um ID válido."
        )


    # ========================================================
    # TÍTULO
    # ========================================================

    title = str(
        metadata.get(
            "title",
            ""
        )
    ).strip()


    if not title:

        raise CatalogGenerationError(
            f'O campo "title" é obrigatório '
            f"em {SONG_METADATA_FILENAME}."
        )


    # ========================================================
    # ARTISTA
    # ========================================================

    artist = str(
        metadata.get(
            "artist",
            ""
        )
    ).strip()


    if not artist:

        raise CatalogGenerationError(
            f'O campo "artist" é obrigatório '
            f"em {SONG_METADATA_FILENAME}."
        )


    # ========================================================
    # DIFICULDADE
    # ========================================================

    difficulty = str(
        metadata.get(
            "difficulty",
            DEFAULT_DIFFICULTY
        )
    ).strip().lower()


    if (
        difficulty
        not in VALID_DIFFICULTIES
    ):

        raise CatalogGenerationError(
            "Dificuldade inválida: "
            f'"{difficulty}".\n'
            "Valores permitidos:\n"
            "beginner, intermediate ou advanced."
        )


    # ========================================================
    # IDIOMA
    # ========================================================

    language = str(
        metadata.get(
            "language",
            DEFAULT_LANGUAGE
        )
    ).strip()


    if not language:

        language = (
            DEFAULT_LANGUAGE
        )


    # ========================================================
    # OFFSET MIDI
    # ========================================================

    offset = read_offset_field(
        metadata,
        "offset",
        DEFAULT_OFFSET
    )


    # ========================================================
    # OFFSET DA LETRA
    # ========================================================

    lyrics_offset = read_offset_field(
        metadata,
        "lyricsOffset",
        DEFAULT_LYRICS_OFFSET
    )


    # ========================================================
    # ARQUIVOS OBRIGATÓRIOS
    # ========================================================

    audio_path = (
        song_directory
        / AUDIO_FILENAME
    )


    midi_path = (
        song_directory
        / MIDI_FILENAME
    )


    if not audio_path.exists():

        raise CatalogGenerationError(
            "Arquivo obrigatório ausente: "
            f"{AUDIO_FILENAME}"
        )


    if not audio_path.is_file():

        raise CatalogGenerationError(
            f"{AUDIO_FILENAME} "
            "não é um arquivo válido."
        )


    if not midi_path.exists():

        raise CatalogGenerationError(
            "Arquivo obrigatório ausente: "
            f"{MIDI_FILENAME}"
        )


    if not midi_path.is_file():

        raise CatalogGenerationError(
            f"{MIDI_FILENAME} "
            "não é um arquivo válido."
        )


    # ========================================================
    # ARQUIVOS OPCIONAIS
    # ========================================================

    lyrics_path = (
        song_directory
        / LYRICS_FILENAME
    )


    cover_path = find_cover(
        song_directory
    )


    # ========================================================
    # DURAÇÃO
    # ========================================================

    duration = get_song_duration(
        audio_path,
        metadata
    )


    # ========================================================
    # PASTA RELATIVA
    # ========================================================

    relative_folder = (
        song_directory
        .relative_to(
            MUSIC_ROOT
        )
        .as_posix()
    )


    # ========================================================
    # REGISTRO FINAL
    # ========================================================

    result: dict[
        str,
        Any
    ] = {

        "id":
            song_id,

        "title":
            title,

        "artist":
            artist,

        "genre":
            genre_id,

        "folder":
            relative_folder,

        "duration":
            duration,

        "difficulty":
            difficulty,

        "language":
            language,

        # Estes dois campos são SEMPRE escritos.
        # Assim o catalogo.json fica explícito
        # sobre a calibração de cada música.

        "offset":
            offset,

        "lyricsOffset":
            lyrics_offset,

        "files": {

            "audio":
                AUDIO_FILENAME,

            "midi":
                MIDI_FILENAME,

            "lyrics":
                (
                    LYRICS_FILENAME
                    if (
                        lyrics_path.exists()
                        and lyrics_path.is_file()
                    )
                    else None
                ),

            "cover":
                (
                    cover_path.name
                    if cover_path
                    else None
                ),
        },
    }


    return result


# ============================================================
# LER OFFSET
# ============================================================

def read_offset_field(
    metadata: dict[str, Any],
    field_name: str,
    default: float
) -> float:

    """
    Lê um offset temporal em segundos.

    Valores válidos:

        0
        -0.24
        0.350
        "0.5"

    Se o campo não existir:
        usa default.

    Se existir e for inválido:
        interrompe a geração.
    """

    if (
        field_name
        not in metadata
    ):

        return float(
            default
        )


    value = metadata.get(
        field_name
    )


    if (
        value is None
        or value == ""
    ):

        return float(
            default
        )


    try:

        number = float(
            value
        )


    except (
        TypeError,
        ValueError
    ) as error:

        raise CatalogGenerationError(
            f'O campo "{field_name}" '
            "precisa ser um número em segundos.\n"
            f"Valor recebido: {value!r}"
        ) from error


    if not math.isfinite(
        number
    ):

        raise CatalogGenerationError(
            f'O campo "{field_name}" '
            "precisa ser um número finito."
        )


    # Evita -0.0 no JSON.
    if number == 0:

        return 0.0


    return round(
        number,
        6
    )


# ============================================================
# LOCALIZAR CAPA
# ============================================================

def find_cover(
    song_directory: Path
) -> Path | None:

    for filename in COVER_FILENAMES:

        candidate = (
            song_directory
            / filename
        )


        if (
            candidate.exists()
            and candidate.is_file()
        ):

            return candidate


    return None


# ============================================================
# DURAÇÃO DO MP3
# ============================================================

def get_song_duration(
    audio_path: Path,
    metadata: dict[str, Any]
) -> int:

    """
    Obtém automaticamente a duração do MP3.

    Caso mutagen não esteja instalado,
    permite fallback para:

        "duration": 277

    dentro de musica.json.
    """

    try:

        from mutagen.mp3 import MP3


    except ImportError:

        fallback = parse_optional_number(
            metadata.get(
                "duration"
            )
        )


        if (
            fallback is not None
            and fallback >
                0
        ):

            print(
                f"       "
                f"{Terminal.WARN} "
                "Mutagen não instalado; "
                "usando duration de musica.json."
            )


            return int(
                round(
                    fallback
                )
            )


        raise CatalogGenerationError(
            "A biblioteca Python 'mutagen' "
            "não está instalada.\n\n"
            "Instale-a uma única vez com:\n\n"
            "    pip install mutagen\n\n"
            "Ela é usada para descobrir "
            "automaticamente a duração "
            "do instrumental.mp3."
        )


    try:

        audio = MP3(
            audio_path
        )


        length = float(
            audio.info.length
        )


    except Exception as error:

        raise CatalogGenerationError(
            "Não foi possível determinar "
            f"a duração de {AUDIO_FILENAME}.\n"
            f"{error}"
        ) from error


    if (
        not math.isfinite(
            length
        ) or
        length <=
            0
    ):

        raise CatalogGenerationError(
            "A duração detectada do MP3 "
            "é inválida."
        )


    return int(
        round(
            length
        )
    )


# ============================================================
# LER JSON
# ============================================================

def read_json_file(
    path: Path
) -> dict[str, Any]:

    try:

        with path.open(
            "r",
            encoding="utf-8-sig"
        ) as file:

            data = json.load(
                file
            )


    except json.JSONDecodeError as error:

        raise CatalogGenerationError(
            f"JSON inválido em {path.name}.\n"
            f"Linha {error.lineno}, "
            f"coluna {error.colno}: "
            f"{error.msg}"
        ) from error


    except OSError as error:

        raise CatalogGenerationError(
            f"Não foi possível ler "
            f"{path.name}."
        ) from error


    if not isinstance(
        data,
        dict
    ):

        raise CatalogGenerationError(
            f"{path.name} precisa conter "
            "um objeto JSON."
        )


    return data


# ============================================================
# NÚMERO OPCIONAL
# ============================================================

def parse_optional_number(
    value: Any
) -> float | None:

    if value is None:

        return None


    try:

        number = float(
            value
        )


    except (
        TypeError,
        ValueError
    ):

        return None


    if not math.isfinite(
        number
    ):

        return None


    return number


# ============================================================
# VALIDAR IDs DUPLICADOS
# ============================================================

def validate_duplicate_song_ids(
    genres: list[dict[str, Any]]
) -> None:

    seen: dict[
        str,
        str
    ] = {}


    for genre in genres:

        for song in genre[
            "songs"
        ]:

            song_id = (
                song[
                    "id"
                ]
            )


            folder = (
                song[
                    "folder"
                ]
            )


            if song_id in seen:

                raise CatalogGenerationError(
                    "Existem duas músicas "
                    "com o mesmo ID:\n\n"
                    f'ID: "{song_id}"\n'
                    f"1. {seen[song_id]}\n"
                    f"2. {folder}\n\n"
                    "Cada música precisa "
                    "possuir um ID único."
                )


            seen[
                song_id
            ] = folder


# ============================================================
# ESCREVER CATÁLOGO
# ============================================================

def write_catalog(
    catalog: dict[str, Any]
) -> None:

    try:

        json_text = json.dumps(
            catalog,
            ensure_ascii=False,
            indent=4
        )


        json_text += "\n"


        CATALOG_PATH.write_text(
            json_text,
            encoding="utf-8"
        )


    except OSError as error:

        raise CatalogGenerationError(
            "Não foi possível salvar "
            "catalogo.json."
        ) from error


# ============================================================
# SLUG → NOME
# ============================================================

def slug_to_display_name(
    value: str
) -> str:

    text = (
        value
        .replace(
            "-",
            " "
        )
        .replace(
            "_",
            " "
        )
        .strip()
    )


    return text.title()


# ============================================================
# NORMALIZAR TEXTO PARA ORDENAÇÃO
# ============================================================

def normalize_sort_text(
    value: str
) -> str:

    normalized = (
        unicodedata.normalize(
            "NFKD",
            value
        )
    )


    without_accents = "".join(
        character
        for character
        in normalized
        if not unicodedata.combining(
            character
        )
    )


    return (
        without_accents
        .casefold()
    )


# ============================================================
# FORMATAR DURAÇÃO
# ============================================================

def format_duration(
    seconds: int | float
) -> str:

    safe = max(
        0,
        int(
            round(
                seconds
            )
        )
    )


    minutes = (
        safe //
        60
    )


    remaining = (
        safe %
        60
    )


    return (
        f"{minutes}:"
        f"{remaining:02d}"
    )


# ============================================================
# FORMATAR OFFSET PARA TERMINAL
# ============================================================

def format_offset(
    value: float
) -> str:

    milliseconds = int(
        round(
            value *
            1000
        )
    )


    if milliseconds > 0:

        return (
            f"+{milliseconds} ms"
        )


    return (
        f"{milliseconds} ms"
    )


# ============================================================
# RESUMO DA MÚSICA
# ============================================================

def print_song_summary(
    song: dict[str, Any]
) -> None:

    print(
        f"       "
        f"{Terminal.OK} "
        f"{song['title']} — "
        f"{song['artist']} "
        f"({format_duration(song['duration'])})"
    )


    print(
        "            "
        "MIDI: "
        f"{format_offset(song['offset'])}"
        " | "
        "Letra: "
        f"{format_offset(song['lyricsOffset'])}"
    )


    if (
        song[
            "files"
        ][
            "lyrics"
        ]
        is None
    ):

        print(
            "            "
            f"{Terminal.WARN} "
            "Sem letra.srt"
        )


# ============================================================
# RESUMO FINAL
# ============================================================

def print_summary(
    catalog: dict[str, Any]
) -> None:

    genres = (
        catalog[
            "genres"
        ]
    )


    songs = [

        song

        for genre
        in genres

        for song
        in genre[
            "songs"
        ]
    ]


    lyrics_count = sum(
        1
        for song
        in songs
        if song[
            "files"
        ][
            "lyrics"
        ]
    )


    print()

    print(
        "-" * 68
    )


    print(
        f"{Terminal.OK} "
        "Catálogo gerado com sucesso."
    )


    print()


    print(
        "Arquivo:"
    )


    print(
        f"    {CATALOG_PATH}"
    )


    print()


    print(
        f"Gêneros: {len(genres)}"
    )


    print(
        f"Músicas: {len(songs)}"
    )


    print(
        f"Com letra SRT: "
        f"{lyrics_count}"
    )


    print(
        "-" * 68
    )

    print()


# ============================================================
# INÍCIO
# ============================================================

if __name__ == "__main__":

    sys.exit(
        main()
    )