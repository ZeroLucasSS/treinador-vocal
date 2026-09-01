/*
 * ============================================================
 * tone-generator.js
 * ============================================================
 *
 * Gera notas de referência utilizando Web Audio API.
 *
 * Não utiliza arquivos MP3.
 *
 * A nota é sintetizada diretamente pelo navegador.
 *
 * ============================================================
 */


import {
    midiToFrequency
} from "./music-theory.js";


export class ToneGenerator {

    constructor() {

        this.audioContext =
            null;

        this.masterGain =
            null;
    }


    /*
     * Cria ou reativa o AudioContext.
     *
     * Navegadores móveis exigem que isso aconteça
     * após alguma interação do usuário.
     */
    async ensureContext() {

        const AudioContextClass =
            window.AudioContext ||
            window.webkitAudioContext;


        if (!AudioContextClass) {

            throw new Error(
                "Web Audio API não suportada."
            );
        }


        if (
            !this.audioContext ||
            this.audioContext.state ===
            "closed"
        ) {

            this.audioContext =
                new AudioContextClass();


            this.masterGain =
                this.audioContext
                    .createGain();


            this.masterGain.gain.value =
                0.45;


            this.masterGain.connect(
                this.audioContext.destination
            );
        }


        if (
            this.audioContext.state ===
            "suspended"
        ) {

            await this.audioContext.resume();
        }
    }


    /*
     * Toca uma nota MIDI.
     */
    async playNote(
        midi,
        durationMs = 850
    ) {

        await this.ensureContext();


        const now =
            this.audioContext.currentTime;


        const duration =
            durationMs / 1000;


        const oscillator =
            this.audioContext
                .createOscillator();


        const gain =
            this.audioContext
                .createGain();


        oscillator.type =
            "sine";


        oscillator.frequency.value =
            midiToFrequency(midi);


        /*
         * Pequeno envelope:
         *
         * entrada suave
         * sustentação
         * saída suave
         *
         * Evita "cliques" no áudio.
         */
        gain.gain.setValueAtTime(
            0.0001,
            now
        );


        gain.gain.exponentialRampToValueAtTime(
            0.7,
            now + 0.025
        );


        gain.gain.setValueAtTime(
            0.7,
            Math.max(
                now + 0.03,
                now + duration - 0.08
            )
        );


        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            now + duration
        );


        oscillator.connect(
            gain
        );


        gain.connect(
            this.masterGain
        );


        oscillator.start(
            now
        );


        oscillator.stop(
            now + duration + 0.02
        );


        return new Promise(
            resolve => {

                setTimeout(
                    resolve,
                    durationMs
                );
            }
        );
    }


    /*
     * Toca uma sequência inteira.
     */
    async playSequence(
        notes,
        {
            noteDurationMs = 650,
            gapMs = 180
        } = {}
    ) {

        for (
            let i = 0;
            i < notes.length;
            i++
        ) {

            await this.playNote(
                notes[i],
                noteDurationMs
            );


            if (
                i <
                notes.length - 1
            ) {

                await this.wait(
                    gapMs
                );
            }
        }
    }


    wait(ms) {

        return new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    ms
                )
        );
    }


    async close() {

        if (
            this.audioContext &&
            this.audioContext.state !==
            "closed"
        ) {

            await this.audioContext.close();
        }


        this.audioContext =
            null;

        this.masterGain =
            null;
    }
}