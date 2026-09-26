/*
 * ============================================================
 * audio.js
 * ============================================================
 *
 * Responsável por:
 *
 * - pedir autorização do microfone;
 * - descobrir os dispositivos de entrada disponíveis;
 * - preferir o microfone interno do aparelho;
 * - evitar, quando possível, o microfone Bluetooth;
 * - criar o AudioContext;
 * - receber amostras em tempo real;
 * - calcular o nível aproximado do sinal;
 * - entregar os dados ao restante do aplicativo.
 *
 * Objetivo especial no mobile:
 *
 *     SAÍDA:
 *     instrumental → fone Bluetooth
 *
 *     ENTRADA:
 *     voz → microfone interno do celular
 *
 * ============================================================
 */


export class MicrophoneAudio {

    constructor() {

        this.stream =
            null;

        this.audioContext =
            null;

        this.source =
            null;

        this.analyser =
            null;

        this.buffer =
            null;

        this.running =
            false;


        /*
         * Informações úteis para diagnóstico.
         */
        this.selectedDeviceId =
            null;

        this.selectedDeviceLabel =
            null;
    }


    /*
     * ========================================================
     * ATIVAR MICROFONE
     * ========================================================
     */

    async start() {

        if (
            this.running
        ) {

            return;
        }


        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {

            throw new Error(
                "Este navegador não oferece suporte ao acesso ao microfone."
            );
        }


        /*
         * Limpamos qualquer estado antigo.
         */
        this.selectedDeviceId =
            null;

        this.selectedDeviceLabel =
            null;


        /*
         * ====================================================
         * ETAPA 1
         *
         * Obter permissão temporariamente.
         *
         * Antes da primeira autorização, muitos navegadores
         * escondem os nomes dos dispositivos.
         *
         * Portanto abrimos um stream temporário, enumeramos
         * os dispositivos e depois fechamos esse stream.
         * ====================================================
         */

        let permissionStream =
            null;


        try {

            permissionStream =
                await navigator.mediaDevices.getUserMedia({

                    audio:
                        true
                });


            /*
             * Agora os labels normalmente estarão disponíveis.
             */
            const devices =
                await navigator.mediaDevices.enumerateDevices();


            const audioInputs =
                devices.filter(
                    device =>
                        device.kind ===
                        "audioinput"
                );


            console.group(
                "🎤 Dispositivos de entrada encontrados"
            );


            audioInputs.forEach(
                (
                    device,
                    index
                ) => {

                    console.log(
                        `[${index}]`,
                        {
                            label:
                                device.label,

                            deviceId:
                                device.deviceId,

                            groupId:
                                device.groupId
                        }
                    );
                }
            );


            console.groupEnd();


            /*
             * =================================================
             * ETAPA 2
             *
             * Tentar escolher um microfone que NÃO pareça ser
             * Bluetooth.
             * =================================================
             */

            const selectedDevice =
                this.findPreferredInternalMicrophone(
                    audioInputs
                );


            /*
             * Encerramos PRIMEIRO o stream temporário.
             *
             * Isso é importante porque queremos remover a
             * captura que o Android escolheu automaticamente
             * antes de abrir explicitamente o dispositivo
             * desejado.
             */
            permissionStream
                .getTracks()
                .forEach(
                    track =>
                        track.stop()
                );


            permissionStream =
                null;


            /*
             * Pequena pausa para permitir que o Android
             * estabilize a rota após fechar o stream padrão.
             */
            await this.wait(
                180
            );


            /*
             * =================================================
             * ETAPA 3
             *
             * Abrir explicitamente o dispositivo escolhido.
             * =================================================
             */

            if (
                selectedDevice &&
                selectedDevice.deviceId &&
                selectedDevice.deviceId !==
                    "default"
            ) {

                console.info(
                    "🎤 Tentando usar microfone interno:",
                    selectedDevice.label ||
                    "(sem nome)"
                );


                try {

                    this.stream =
                        await navigator.mediaDevices.getUserMedia({

                            audio: {

                                deviceId: {
                                    exact:
                                        selectedDevice.deviceId
                                },

                                echoCancellation:
                                    false,

                                noiseSuppression:
                                    false,

                                autoGainControl:
                                    false,

                                channelCount: {
                                    ideal:
                                        1
                                }
                            }
                        });


                } catch (deviceError) {

                    console.warn(
                        "Não foi possível abrir explicitamente o microfone escolhido.",
                        deviceError
                    );


                    /*
                     * Se a seleção por deviceId falhar,
                     * usamos o comportamento tradicional como
                     * fallback para não quebrar o aplicativo.
                     */
                    this.stream =
                        await this.openDefaultMicrophone();
                }


            } else {

                console.warn(
                    "Nenhum microfone interno inequívoco foi encontrado. Usando entrada padrão."
                );


                this.stream =
                    await this.openDefaultMicrophone();
            }


        } catch (error) {

            /*
             * Se o stream temporário ainda estiver aberto,
             * precisamos encerrá-lo.
             */
            if (
                permissionStream
            ) {

                permissionStream
                    .getTracks()
                    .forEach(
                        track =>
                            track.stop()
                    );
            }


            throw error;
        }


        /*
         * ====================================================
         * DESCOBRIR QUAL ENTRADA FOI REALMENTE USADA
         * ====================================================
         */

        this.inspectActiveMicrophone();


        /*
         * ====================================================
         * AUDIO CONTEXT
         * ====================================================
         */

        const AudioContextClass =
            window.AudioContext ||
            window.webkitAudioContext;


        if (
            !AudioContextClass
        ) {

            await this.stop();


            throw new Error(
                "Web Audio API não suportada neste navegador."
            );
        }


        this.audioContext =
            new AudioContextClass();


        /*
         * Alguns navegadores móveis iniciam o AudioContext
         * suspenso mesmo após interação do usuário.
         */
        if (
            this.audioContext.state ===
            "suspended"
        ) {

            await this.audioContext.resume();
        }


        /*
         * ====================================================
         * SOURCE
         * ====================================================
         */

        this.source =
            this.audioContext.createMediaStreamSource(
                this.stream
            );


        /*
         * ====================================================
         * ANALYSER
         * ====================================================
         */

        this.analyser =
            this.audioContext.createAnalyser();


        /*
         * 4096 amostras oferecem uma resolução razoável
         * para frequências graves da voz.
         */
        this.analyser.fftSize =
            4096;


        this.analyser.smoothingTimeConstant =
            0;


        this.buffer =
            new Float32Array(
                this.analyser.fftSize
            );


        this.source.connect(
            this.analyser
        );


        /*
         * NÃO conectamos o analyser ao destination.
         *
         * Portanto:
         *
         * microfone → análise
         *
         * e NÃO:
         *
         * microfone → fones
         *
         * Isso evita eco e microfonia.
         */
        this.running =
            true;
    }


    /*
     * ========================================================
     * ABRIR MICROFONE PADRÃO
     * ========================================================
     */

    async openDefaultMicrophone() {

        return await navigator.mediaDevices.getUserMedia({

            audio: {

                echoCancellation:
                    false,

                noiseSuppression:
                    false,

                autoGainControl:
                    false,

                channelCount: {
                    ideal:
                        1
                }
            }
        });
    }


    /*
     * ========================================================
     * ESCOLHER MICROFONE INTERNO
     * ========================================================
     *
     * A nomenclatura dos dispositivos varia muito entre:
     *
     * - Samsung;
     * - Motorola;
     * - Xiaomi;
     * - Pixel;
     * - outros fabricantes.
     *
     * Portanto usamos pontuação, e não apenas uma comparação
     * rígida de nome.
     * ========================================================
     */

    findPreferredInternalMicrophone(
        devices
    ) {

        if (
            !Array.isArray(
                devices
            ) ||
            devices.length ===
                0
        ) {

            return null;
        }


        const candidates =
            devices
                .map(
                    device => {

                        const label =
                            this.normalizeDeviceLabel(
                                device.label
                            );


                        let score =
                            0;


                        /*
                         * -------------------------------------
                         * FORTE INDÍCIO DE BLUETOOTH
                         * -------------------------------------
                         */

                        if (
                            this.looksLikeBluetooth(
                                label
                            )
                        ) {

                            score -=
                                1000;
                        }


                        /*
                         * -------------------------------------
                         * DISPOSITIVO "DEFAULT"
                         *
                         * Evitamos porque ele pode apontar
                         * justamente para o headset Bluetooth.
                         * -------------------------------------
                         */

                        if (
                            device.deviceId ===
                            "default"
                        ) {

                            score -=
                                200;
                        }


                        if (
                            label.includes(
                                "default"
                            ) ||
                            label.includes(
                                "padrao"
                            )
                        ) {

                            score -=
                                150;
                        }


                        /*
                         * -------------------------------------
                         * INDÍCIOS DE MICROFONE INTERNO
                         * -------------------------------------
                         */

                        const internalKeywords = [

                            "built in",
                            "builtin",

                            "internal",

                            "interno",
                            "interna",

                            "phone",
                            "smartphone",

                            "device",
                            "dispositivo",

                            "handset",

                            "bottom",
                            "bottom mic",

                            "top mic",

                            "primary",
                            "principal"
                        ];


                        internalKeywords.forEach(
                            keyword => {

                                if (
                                    label.includes(
                                        keyword
                                    )
                                ) {

                                    score +=
                                        100;
                                }
                            }
                        );


                        /*
                         * "Microphone" / "Microfone" sozinho
                         * recebe um pequeno bônus.
                         *
                         * Não damos pontuação alta porque
                         * alguns headsets também podem usar
                         * esse nome genérico.
                         */
                        if (
                            label.includes(
                                "microphone"
                            ) ||
                            label.includes(
                                "microfone"
                            ) ||
                            label.includes(
                                "mic "
                            ) ||
                            label.endsWith(
                                " mic"
                            )
                        ) {

                            score +=
                                20;
                        }


                        /*
                         * DeviceId físico é preferível ao alias
                         * "default".
                         */
                        if (
                            device.deviceId &&
                            device.deviceId !==
                                "default"
                        ) {

                            score +=
                                10;
                        }


                        return {

                            device,

                            label,

                            score
                        };
                    }
                );


        candidates.sort(
            (
                a,
                b
            ) =>
                b.score -
                a.score
        );


        console.group(
            "🎤 Ranking de microfones"
        );


        candidates.forEach(
            candidate => {

                console.log(
                    {
                        nome:
                            candidate.device.label,

                        pontuacao:
                            candidate.score,

                        bluetooth:
                            this.looksLikeBluetooth(
                                candidate.label
                            ),

                        deviceId:
                            candidate.device.deviceId
                    }
                );
            }
        );


        console.groupEnd();


        /*
         * Nunca escolhemos automaticamente um dispositivo que
         * tenha forte indicação de Bluetooth.
         */
        const best =
            candidates.find(
                candidate =>
                    candidate.score >
                    -500 &&
                    !this.looksLikeBluetooth(
                        candidate.label
                    )
            );


        if (
            !best
        ) {

            return null;
        }


        console.info(
            "🎤 Microfone preferido:",
            best.device.label ||
            "(sem nome)",
            "| score:",
            best.score
        );


        return best.device;
    }


    /*
     * ========================================================
     * IDENTIFICAR BLUETOOTH
     * ========================================================
     */

    looksLikeBluetooth(
        normalizedLabel
    ) {

        if (
            !normalizedLabel
        ) {

            return false;
        }


        const bluetoothTerms = [

            "bluetooth",

            "blue tooth",

            "bt headset",

            "bt headphone",

            "wireless headset",

            "hands free",

            "handsfree",

            "headset",

            "earbuds",

            "ear buds",

            "buds",

            "airpods",

            "galaxy buds",

            "jbl",

            "edifier",

            "soundcore",

            "redmi buds",

            "freebuds",

            "wh 1000",

            "wf 1000"
        ];


        return bluetoothTerms.some(
            term =>
                normalizedLabel.includes(
                    term
                )
        );
    }


    /*
     * ========================================================
     * NORMALIZAR LABEL
     * ========================================================
     */

    normalizeDeviceLabel(
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
            .toLowerCase()
            .replace(
                /[_-]+/g,
                " "
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim();
    }


    /*
     * ========================================================
     * INSPECIONAR MICROFONE ATIVO
     * ========================================================
     */

    inspectActiveMicrophone() {

        if (
            !this.stream
        ) {

            return;
        }


        const track =
            this.stream
                .getAudioTracks()[0];


        if (
            !track
        ) {

            console.warn(
                "Nenhuma trilha de áudio ativa."
            );

            return;
        }


        const settings =
            typeof track.getSettings ===
            "function"
                ? track.getSettings()
                : {};


        this.selectedDeviceId =
            settings.deviceId ||
            null;


        this.selectedDeviceLabel =
            track.label ||
            null;


        console.group(
            "🎤 Microfone realmente utilizado"
        );


        console.log(
            "Label:",
            track.label ||
            "(sem nome)"
        );


        console.log(
            "DeviceId:",
            settings.deviceId ||
            "(não informado)"
        );


        console.log(
            "Configurações:",
            settings
        );


        console.groupEnd();
    }


    /*
     * ========================================================
     * ESPERA
     * ========================================================
     */

    wait(
        milliseconds
    ) {

        return new Promise(
            resolve => {

                window.setTimeout(
                    resolve,
                    milliseconds
                );
            }
        );
    }


    /*
     * ========================================================
     * COPIAR ÁUDIO PARA BUFFER
     * ========================================================
     */

    getTimeDomainData() {

        if (
            !this.running ||
            !this.analyser ||
            !this.buffer
        ) {

            return null;
        }


        this.analyser.getFloatTimeDomainData(
            this.buffer
        );


        return this.buffer;
    }


    /*
     * ========================================================
     * CALCULAR RMS
     * ========================================================
     *
     * Retorna aproximadamente:
     *
     * 0.000 = silêncio
     * 0.020 = sinal baixo
     * 0.100 = sinal razoável
     * 0.500 = sinal muito forte
     * ========================================================
     */

    calculateRms(
        buffer
    ) {

        if (
            !buffer ||
            buffer.length ===
                0
        ) {

            return 0;
        }


        let sumSquares =
            0;


        for (
            let i = 0;
            i < buffer.length;
            i++
        ) {

            const sample =
                buffer[i];


            sumSquares +=
                sample *
                sample;
        }


        return Math.sqrt(
            sumSquares /
            buffer.length
        );
    }


    /*
     * ========================================================
     * ENCERRAR CAPTURA
     * ========================================================
     */

    async stop() {

        this.running =
            false;


        if (
            this.source
        ) {

            try {

                this.source.disconnect();


            } catch (error) {

                console.warn(
                    error
                );
            }


            this.source =
                null;
        }


        if (
            this.analyser
        ) {

            try {

                this.analyser.disconnect();


            } catch (error) {

                console.warn(
                    error
                );
            }


            this.analyser =
                null;
        }


        if (
            this.stream
        ) {

            this.stream
                .getTracks()
                .forEach(
                    track =>
                        track.stop()
                );


            this.stream =
                null;
        }


        if (
            this.audioContext
        ) {

            try {

                if (
                    this.audioContext.state !==
                    "closed"
                ) {

                    await this.audioContext.close();
                }


            } catch (error) {

                console.warn(
                    error
                );
            }


            this.audioContext =
                null;
        }


        this.buffer =
            null;


        this.selectedDeviceId =
            null;

        this.selectedDeviceLabel =
            null;
    }


    /*
     * ========================================================
     * SAMPLE RATE
     * ========================================================
     */

    get sampleRate() {

        return (
            this.audioContext
                ? this.audioContext.sampleRate
                : null
        );
    }
}