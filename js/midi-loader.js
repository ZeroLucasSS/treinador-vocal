/*
 * ============================================================
 * midi-loader.js
 * ============================================================
 *
 * Parser MIDI Standard File (SMF) totalmente local.
 *
 * Suporta:
 *
 * - MIDI formato 0;
 * - MIDI formato 1;
 * - múltiplas trilhas;
 * - running status;
 * - Note On;
 * - Note Off;
 * - nomes de trilha;
 * - canais MIDI;
 * - mudanças de andamento;
 * - conversão tick -> segundos;
 * - detecção básica de polifonia;
 *
 * Não depende de bibliotecas externas.
 *
 * ============================================================
 */


/*
 * ============================================================
 * CARREGAR MIDI POR URL
 * ============================================================
 */

export async function loadMidiFromUrl(
    url
) {

    const response =
        await fetch(
            url
        );


    if (
        !response.ok
    ) {

        throw new Error(
            `Não foi possível carregar o MIDI (${response.status}).`
        );
    }


    const buffer =
        await response.arrayBuffer();


    return parseMidi(
        buffer
    );
}


/*
 * ============================================================
 * PARSER PRINCIPAL
 * ============================================================
 */

export function parseMidi(
    arrayBuffer
) {

    const reader =
        new MidiReader(
            arrayBuffer
        );


    /*
     * --------------------------------------------------------
     * CABEÇALHO
     * --------------------------------------------------------
     */

    const headerId =
        reader.readString(
            4
        );


    if (
        headerId !==
        "MThd"
    ) {

        throw new Error(
            "Arquivo inválido: cabeçalho MIDI MThd não encontrado."
        );
    }


    const headerLength =
        reader.readUint32();


    if (
        headerLength <
        6
    ) {

        throw new Error(
            "Cabeçalho MIDI inválido."
        );
    }


    const format =
        reader.readUint16();


    const trackCount =
        reader.readUint16();


    const division =
        reader.readUint16();


    /*
     * Esta versão trabalha com PPQN.
     *
     * SMPTE usa bit superior ligado.
     */
    if (
        division &
        0x8000
    ) {

        throw new Error(
            "Este MIDI utiliza divisão SMPTE. Nesta etapa o aplicativo trabalha com MIDI baseado em PPQN."
        );
    }


    const ticksPerQuarter =
        division;


    /*
     * Ignora bytes extras do header,
     * caso existam.
     */
    if (
        headerLength >
        6
    ) {

        reader.skip(
            headerLength -
            6
        );
    }


    /*
     * --------------------------------------------------------
     * TRILHAS
     * --------------------------------------------------------
     */

    const rawTracks =
        [];


    for (
        let trackIndex =
            0;
        trackIndex <
            trackCount;
        trackIndex++
    ) {

        const trackId =
            reader.readString(
                4
            );


        if (
            trackId !==
            "MTrk"
        ) {

            throw new Error(
                `Trilha MIDI ${trackIndex + 1} inválida: MTrk não encontrado.`
            );
        }


        const trackLength =
            reader.readUint32();


        const trackEnd =
            reader.position +
            trackLength;


        const track =
            parseTrack(
                reader,
                trackIndex,
                trackEnd
            );


        rawTracks.push(
            track
        );


        /*
         * Garante posição exatamente
         * no final da trilha.
         */
        reader.position =
            trackEnd;
    }


    /*
     * --------------------------------------------------------
     * MAPA GLOBAL DE TEMPO
     * --------------------------------------------------------
     */

    const tempoEvents =
        collectTempoEvents(
            rawTracks
        );


    const tempoMap =
        buildTempoMap(
            tempoEvents,
            ticksPerQuarter
        );


    /*
     * --------------------------------------------------------
     * CONVERTE NOTAS PARA SEGUNDOS
     * --------------------------------------------------------
     */

    const tracks =
        rawTracks.map(
            track => {

                const notes =
                    buildNotesForTrack(
                        track,
                        tempoMap,
                        ticksPerQuarter
                    );


                const channels =
                    Array.from(
                        new Set(
                            notes.map(
                                note =>
                                    note.channel
                            )
                        )
                    )
                    .sort(
                        (a, b) =>
                            a - b
                    );


                const minMidi =
                    notes.length
                        ? Math.min(
                            ...notes.map(
                                note =>
                                    note.midi
                            )
                        )
                        : null;


                const maxMidi =
                    notes.length
                        ? Math.max(
                            ...notes.map(
                                note =>
                                    note.midi
                            )
                        )
                        : null;


                const duration =
                    notes.length
                        ? Math.max(
                            ...notes.map(
                                note =>
                                    note.start +
                                    note.duration
                            )
                        )
                        : 0;


                const polyphonic =
                    detectPolyphony(
                        notes
                    );


                return {

                    index:
                        track.index,

                    name:
                        track.name ||
                        `Trilha ${track.index + 1}`,

                    notes,

                    noteCount:
                        notes.length,

                    channels,

                    minMidi,

                    maxMidi,

                    duration,

                    polyphonic
                };
            }
        );


    /*
     * Duração total.
     */
    const duration =
        tracks.length
            ? Math.max(
                ...tracks.map(
                    track =>
                        track.duration
                )
            )
            : 0;


    return {

        format,

        ticksPerQuarter,

        trackCount,

        duration,

        tracks,

        tempoMap
    };
}


/*
 * ============================================================
 * PARSER DE TRILHA
 * ============================================================
 */

function parseTrack(
    reader,
    trackIndex,
    trackEnd
) {

    let absoluteTick =
        0;


    let runningStatus =
        null;


    let trackName =
        "";


    const events =
        [];


    while (
        reader.position <
        trackEnd
    ) {

        /*
         * Delta time.
         */
        const delta =
            reader.readVariableLength();


        absoluteTick +=
            delta;


        let status =
            reader.peekUint8();


        /*
         * Running status:
         *
         * byte abaixo de 0x80 significa
         * que o status anterior continua válido.
         */
        if (
            status <
            0x80
        ) {

            if (
                runningStatus ===
                null
            ) {

                throw new Error(
                    "Running status MIDI inválido."
                );
            }


            status =
                runningStatus;

        } else {

            status =
                reader.readUint8();


            /*
             * Apenas mensagens de canal
             * usam running status.
             */
            if (
                status >=
                    0x80 &&
                status <=
                    0xEF
            ) {

                runningStatus =
                    status;

            } else {

                runningStatus =
                    null;
            }
        }


        /*
         * ----------------------------------------------------
         * META EVENT
         * ----------------------------------------------------
         */

        if (
            status ===
            0xFF
        ) {

            const type =
                reader.readUint8();


            const length =
                reader.readVariableLength();


            const start =
                reader.position;


            /*
             * Nome da trilha.
             */
            if (
                type ===
                0x03
            ) {

                trackName =
                    reader.readString(
                        length
                    );

            }

            /*
             * Tempo.
             *
             * 3 bytes:
             * microssegundos por semínima.
             */
            else if (
                type ===
                0x51 &&
                length ===
                3
            ) {

                const microsecondsPerQuarter =
                    (
                        reader.readUint8() <<
                        16
                    ) |
                    (
                        reader.readUint8() <<
                        8
                    ) |
                    reader.readUint8();


                events.push({

                    type:
                        "tempo",

                    tick:
                        absoluteTick,

                    microsecondsPerQuarter
                });

            }

            /*
             * Fim de trilha.
             */
            else if (
                type ===
                0x2F
            ) {

                reader.position =
                    start +
                    length;


                break;

            } else {

                reader.position =
                    start +
                    length;
            }


            continue;
        }


        /*
         * ----------------------------------------------------
         * SYSTEM EXCLUSIVE
         * ----------------------------------------------------
         */

        if (
            status ===
                0xF0 ||
            status ===
                0xF7
        ) {

            const length =
                reader.readVariableLength();


            reader.skip(
                length
            );


            continue;
        }


        /*
         * ----------------------------------------------------
         * EVENTO DE CANAL
         * ----------------------------------------------------
         */

        const eventType =
            status &
            0xF0;


        const channel =
            status &
            0x0F;


        /*
         * NOTE OFF
         */
        if (
            eventType ===
            0x80
        ) {

            const note =
                reader.readUint8();


            const velocity =
                reader.readUint8();


            events.push({

                type:
                    "noteOff",

                tick:
                    absoluteTick,

                note,

                velocity,

                channel
            });


            continue;
        }


        /*
         * NOTE ON
         */
        if (
            eventType ===
            0x90
        ) {

            const note =
                reader.readUint8();


            const velocity =
                reader.readUint8();


            /*
             * Note On com velocity 0
             * equivale a Note Off.
             */
            events.push({

                type:
                    velocity ===
                    0
                        ? "noteOff"
                        : "noteOn",

                tick:
                    absoluteTick,

                note,

                velocity,

                channel
            });


            continue;
        }


        /*
         * Polyphonic Key Pressure
         */
        if (
            eventType ===
            0xA0
        ) {

            reader.skip(
                2
            );


            continue;
        }


        /*
         * Control Change
         */
        if (
            eventType ===
            0xB0
        ) {

            reader.skip(
                2
            );


            continue;
        }


        /*
         * Program Change
         */
        if (
            eventType ===
            0xC0
        ) {

            reader.skip(
                1
            );


            continue;
        }


        /*
         * Channel Pressure
         */
        if (
            eventType ===
            0xD0
        ) {

            reader.skip(
                1
            );


            continue;
        }


        /*
         * Pitch Bend
         */
        if (
            eventType ===
            0xE0
        ) {

            reader.skip(
                2
            );


            continue;
        }


        throw new Error(
            `Evento MIDI desconhecido: 0x${status.toString(16)}`
        );
    }


    return {

        index:
            trackIndex,

        name:
            trackName.trim(),

        events
    };
}


/*
 * ============================================================
 * EVENTOS DE TEMPO
 * ============================================================
 */

function collectTempoEvents(
    tracks
) {

    const tempos =
        [];


    tracks.forEach(
        track => {

            track.events.forEach(
                event => {

                    if (
                        event.type ===
                        "tempo"
                    ) {

                        tempos.push(
                            event
                        );
                    }
                }
            );
        }
    );


    tempos.sort(
        (a, b) =>
            a.tick -
            b.tick
    );


    /*
     * MIDI padrão:
     *
     * 120 BPM
     * =
     * 500000 microssegundos por semínima.
     */
    if (
        !tempos.length ||
        tempos[0].tick >
            0
    ) {

        tempos.unshift({

            type:
                "tempo",

            tick:
                0,

            microsecondsPerQuarter:
                500000
        });
    }


    /*
     * Remove eventos repetidos
     * exatamente no mesmo tick.
     *
     * O último vence.
     */
    const normalized =
        [];


    tempos.forEach(
        tempo => {

            const previous =
                normalized[
                    normalized.length -
                    1
                ];


            if (
                previous &&
                previous.tick ===
                    tempo.tick
            ) {

                normalized[
                    normalized.length -
                    1
                ] =
                    tempo;

            } else {

                normalized.push(
                    tempo
                );
            }
        }
    );


    return normalized;
}


/*
 * ============================================================
 * MAPA DE TEMPO
 * ============================================================
 */

function buildTempoMap(
    tempoEvents,
    ticksPerQuarter
) {

    let accumulatedSeconds =
        0;


    let previousTick =
        0;


    let previousTempo =
        tempoEvents[0]
            .microsecondsPerQuarter;


    const map =
        [];


    tempoEvents.forEach(
        (
            event,
            index
        ) => {

            if (
                index >
                0
            ) {

                const tickDelta =
                    event.tick -
                    previousTick;


                accumulatedSeconds +=
                    ticksToSecondsWithTempo(
                        tickDelta,
                        ticksPerQuarter,
                        previousTempo
                    );
            }


            map.push({

                tick:
                    event.tick,

                seconds:
                    accumulatedSeconds,

                microsecondsPerQuarter:
                    event.microsecondsPerQuarter
            });


            previousTick =
                event.tick;


            previousTempo =
                event.microsecondsPerQuarter;
        }
    );


    return map;
}


/*
 * ============================================================
 * TICK PARA SEGUNDOS
 * ============================================================
 */

function tickToSeconds(
    tick,
    tempoMap,
    ticksPerQuarter
) {

    let segment =
        tempoMap[0];


    /*
     * Procuramos o último evento
     * cujo tick <= tick desejado.
     */
    for (
        let index =
            1;
        index <
            tempoMap.length;
        index++
    ) {

        if (
            tempoMap[index].tick >
            tick
        ) {

            break;
        }


        segment =
            tempoMap[index];
    }


    const remainingTicks =
        tick -
        segment.tick;


    return (
        segment.seconds +
        ticksToSecondsWithTempo(
            remainingTicks,
            ticksPerQuarter,
            segment.microsecondsPerQuarter
        )
    );
}


function ticksToSecondsWithTempo(
    ticks,
    ticksPerQuarter,
    microsecondsPerQuarter
) {

    return (
        (
            ticks /
            ticksPerQuarter
        ) *
        (
            microsecondsPerQuarter /
            1000000
        )
    );
}


/*
 * ============================================================
 * CONSTRUIR NOTAS
 * ============================================================
 */

function buildNotesForTrack(
    track,
    tempoMap,
    ticksPerQuarter
) {

    /*
     * Chave:
     *
     * canal:nota
     *
     * Uma fila é usada para suportar
     * Note Ons repetidos da mesma nota.
     */
    const activeNotes =
        new Map();


    const notes =
        [];


    track.events.forEach(
        event => {

            if (
                event.type !==
                    "noteOn" &&
                event.type !==
                    "noteOff"
            ) {

                return;
            }


            const key =
                `${event.channel}:${event.note}`;


            /*
             * ------------------------------------------------
             * NOTE ON
             * ------------------------------------------------
             */

            if (
                event.type ===
                "noteOn"
            ) {

                if (
                    !activeNotes.has(
                        key
                    )
                ) {

                    activeNotes.set(
                        key,
                        []
                    );
                }


                activeNotes
                    .get(
                        key
                    )
                    .push({

                        tick:
                            event.tick,

                        velocity:
                            event.velocity
                    });


                return;
            }


            /*
             * ------------------------------------------------
             * NOTE OFF
             * ------------------------------------------------
             */

            const queue =
                activeNotes.get(
                    key
                );


            if (
                !queue ||
                queue.length ===
                0
            ) {

                return;
            }


            const startEvent =
                queue.shift();


            const startTick =
                startEvent.tick;


            const endTick =
                event.tick;


            if (
                endTick <=
                startTick
            ) {

                return;
            }


            const start =
                tickToSeconds(
                    startTick,
                    tempoMap,
                    ticksPerQuarter
                );


            const end =
                tickToSeconds(
                    endTick,
                    tempoMap,
                    ticksPerQuarter
                );


            const duration =
                end -
                start;


            if (
                duration <=
                0
            ) {

                return;
            }


            notes.push({

                midi:
                    event.note,

                start,

                duration,

                velocity:
                    startEvent.velocity,

                channel:
                    event.channel,

                startTick,

                endTick
            });
        }
    );


    notes.sort(
        (a, b) => {

            if (
                a.start !==
                b.start
            ) {

                return (
                    a.start -
                    b.start
                );
            }


            return (
                a.midi -
                b.midi
            );
        }
    );


    return notes;
}


/*
 * ============================================================
 * POLIFONIA
 * ============================================================
 */

function detectPolyphony(
    notes
) {

    if (
        notes.length <
        2
    ) {

        return false;
    }


    /*
     * Pequena tolerância contra
     * arredondamento de ponto flutuante.
     */
    const EPSILON =
        0.003;


    let latestEnd =
        notes[0].start +
        notes[0].duration;


    for (
        let index =
            1;
        index <
            notes.length;
        index++
    ) {

        const note =
            notes[index];


        if (
            note.start <
            latestEnd -
            EPSILON
        ) {

            return true;
        }


        latestEnd =
            Math.max(
                latestEnd,
                note.start +
                note.duration
            );
    }


    return false;
}


/*
 * ============================================================
 * ESCOLHER MELHOR TRILHA MELÓDICA
 * ============================================================
 */

export function chooseBestMelodyTrack(
    midiData
) {

    if (
        !midiData ||
        !Array.isArray(
            midiData.tracks
        )
    ) {

        return null;
    }


    const candidates =
        midiData.tracks.filter(
            track =>
                track.noteCount >
                0
        );


    if (
        !candidates.length
    ) {

        return null;
    }


    /*
     * Preferência:
     *
     * 1. monofônica;
     * 2. maior quantidade de notas;
     * 3. maior duração.
     */
    const sorted =
        [...candidates]
            .sort(
                (a, b) => {

                    if (
                        a.polyphonic !==
                        b.polyphonic
                    ) {

                        return (
                            a.polyphonic
                                ? 1
                                : -1
                        );
                    }


                    if (
                        a.noteCount !==
                        b.noteCount
                    ) {

                        return (
                            b.noteCount -
                            a.noteCount
                        );
                    }


                    return (
                        b.duration -
                        a.duration
                    );
                }
            );


    return sorted[0];
}


/*
 * ============================================================
 * READER BINÁRIO
 * ============================================================
 */

class MidiReader {

    constructor(
        arrayBuffer
    ) {

        this.data =
            new Uint8Array(
                arrayBuffer
            );


        this.position =
            0;
    }


    ensure(
        count
    ) {

        if (
            this.position +
            count >
            this.data.length
        ) {

            throw new Error(
                "Fim inesperado do arquivo MIDI."
            );
        }
    }


    readUint8() {

        this.ensure(
            1
        );


        return this.data[
            this.position++
        ];
    }


    peekUint8() {

        this.ensure(
            1
        );


        return this.data[
            this.position
        ];
    }


    readUint16() {

        this.ensure(
            2
        );


        const value =
            (
                this.data[
                    this.position
                ] <<
                8
            ) |
            this.data[
                this.position +
                1
            ];


        this.position +=
            2;


        return value;
    }


    readUint32() {

        this.ensure(
            4
        );


        const value =
            (
                (
                    this.data[
                        this.position
                    ] <<
                    24
                ) >>>
                0
            ) +
            (
                this.data[
                    this.position +
                    1
                ] <<
                16
            ) +
            (
                this.data[
                    this.position +
                    2
                ] <<
                8
            ) +
            this.data[
                this.position +
                3
            ];


        this.position +=
            4;


        return (
            value >>>
            0
        );
    }


    readString(
        length
    ) {

        this.ensure(
            length
        );


        const bytes =
            this.data.slice(
                this.position,
                this.position +
                length
            );


        this.position +=
            length;


        /*
         * TextDecoder lida melhor com
         * nomes de trilha UTF-8/ASCII.
         */
        try {

            return new TextDecoder()
                .decode(
                    bytes
                );

        } catch {

            return Array.from(
                bytes
            )
            .map(
                byte =>
                    String.fromCharCode(
                        byte
                    )
            )
            .join(
                ""
            );
        }
    }


    readVariableLength() {

        let value =
            0;


        let byte;


        let count =
            0;


        do {

            byte =
                this.readUint8();


            value =
                (
                    value <<
                    7
                ) |
                (
                    byte &
                    0x7F
                );


            count++;


            if (
                count >
                4
            ) {

                throw new Error(
                    "Valor MIDI variável inválido."
                );
            }

        } while (
            byte &
            0x80
        );


        return value;
    }


    skip(
        count
    ) {

        this.ensure(
            count
        );


        this.position +=
            count;
    }
}