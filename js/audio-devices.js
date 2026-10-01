/* Shared output routing. Automatic mode deliberately leaves the system route alone. */
export class AudioOutputRouter {
    constructor() {
        this.deviceId = "";
        this.targets = new Set();
        this.beforeChange = new Set();
    }

    get supported() {
        const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
        return typeof globalThis.HTMLMediaElement?.prototype.setSinkId === "function" &&
            typeof Context?.prototype.setSinkId === "function";
    }

    async apply(target, deviceId = this.deviceId) {
        if (target.sinkId === deviceId) return;
        if (!deviceId && !target.sinkId) return;
        if (typeof target.setSinkId !== "function") {
            throw new Error("Este navegador não permite alterar a saída de todos os sons.");
        }
        await target.setSinkId(deviceId);
    }

    async register(target) {
        await this.apply(target);
        this.targets.add(target);
    }

    unregister(target) {
        this.targets.delete(target);
    }

    async select(deviceId) {
        // Silence microphone monitoring before any output (including fallback) changes.
        for (const callback of this.beforeChange) callback();
        const previous = this.deviceId;
        const targets = [...this.targets].filter(target => target.state !== "closed");
        const results = await Promise.allSettled(targets.map(target => this.apply(target, deviceId)));
        if (results.some(result => result.status === "rejected")) {
            const rollback = await Promise.allSettled(targets.map(target => this.apply(target, previous)));
            if (rollback.some(result => result.status === "rejected")) {
                // Every subsequent playback reapplies this route before producing sound.
                this.deviceId = "";
                await Promise.allSettled(targets.map(target => this.apply(target, "")));
            }
            throw new Error("Não foi possível aplicar a saída a todos os sons. Confira a seleção e tente novamente.");
        }
        this.deviceId = deviceId;
    }
}

export const audioOutput = new AudioOutputRouter();

export class AudioDeviceControls {
    constructor({ microphone, beforeChange, prepareOutput, onCaptureLost }) {
        this.microphone = microphone;
        this.beforeChange = beforeChange;
        this.prepareOutput = prepareOutput;
        this.onCaptureLost = onCaptureLost;
        this.inputId = "";
        this.devices = [];
        this.busy = false;
        this.locked = false;
        this.activeTrack = null;
        this.message = "";
        this.refreshVersion = 0;
        this.input = document.getElementById("seletorMicrofone");
        this.output = document.getElementById("seletorSaidaAudio");
        this.status = document.getElementById("estadoDispositivosAudio");
        this.help = document.getElementById("ajudaSaidaAudio");
        this.refreshButton = document.getElementById("atualizarDispositivosAudio");
        this.permissionButton = document.getElementById("autorizarMicrofone");
        this.outputButton = document.getElementById("autorizarSaidaAudio");
        this.media = navigator.mediaDevices;
        this.handleDeviceChange = () => {
            if (this.busy) this.pendingRefresh = true;
            else void this.refresh();
        };
        this.handleVisibility = () => {
            if (document.visibilityState === "visible") this.handleDeviceChange();
        };
    }

    init() {
        this.input.addEventListener("change", () => {
            if (this.locked || this.busy) return this.render();
            this.inputId = this.input.value;
            this.message = "Microfone selecionado para o próximo treino.";
            this.render();
        });
        this.output.addEventListener("change", () => {
            const id = this.output.value;
            void this.perform(async () => {
                await this.prepareOutput();
                await audioOutput.select(id);
                this.message = "Saída de áudio selecionada.";
            });
        });
        this.refreshButton.addEventListener("click", () => void this.perform(async () => {
            if (await this.refresh()) this.message = "Lista de dispositivos atualizada.";
        }));
        this.permissionButton.addEventListener("click", () => void this.perform(async () => {
            let stream;
            try {
                stream = await this.media.getUserMedia({ audio: true });
                if (await this.refresh()) {
                    this.message = "Dispositivos identificados. O microfone será ativado ao iniciar o treino.";
                }
            } finally {
                stream?.getTracks().forEach(track => track.stop());
            }
        }));
        this.outputButton.addEventListener("click", () => void this.perform(async () => {
            // Must be called directly from the click, before awaiting other operations.
            const device = await this.media.selectAudioOutput();
            await this.prepareOutput();
            await audioOutput.select(device.deviceId);
            await this.refresh();
            this.message = "Saída de áudio selecionada.";
        }));
        this.media?.addEventListener?.("devicechange", this.handleDeviceChange);
        document.addEventListener("visibilitychange", this.handleVisibility);
        this.render();
        void this.refresh();
    }

    async perform(action) {
        if (this.locked || this.busy) return this.render();
        this.busy = true;
        this.refreshVersion++;
        this.message = "Atualizando dispositivos…";
        this.render();
        try {
            this.beforeChange();
            await action();
        } catch (error) {
            this.message = error.name === "NotAllowedError"
                ? "Permissão não concedida. Autorize o acesso nas configurações do navegador."
                : error.name === "NotFoundError"
                    ? "Dispositivo não encontrado. Conecte-o e atualize a lista."
                    : error.message || "Não foi possível atualizar os dispositivos.";
        } finally {
            this.busy = false;
            this.render();
            if (this.pendingRefresh) {
                this.pendingRefresh = false;
                void this.refresh();
            }
        }
    }

    async refresh() {
        if (!this.media?.enumerateDevices) return this.render();
        const version = ++this.refreshVersion;
        try {
            const devices = await this.media.enumerateDevices();
            if (version !== this.refreshVersion) return;
            this.devices = devices;
            this.preferredInput = this.microphone.findPreferredInternalMicrophone(
                devices.filter(device => device.kind === "audioinput")
            );
            if (this.inputId && !devices.some(device => device.kind === "audioinput" && device.deviceId === this.inputId)) {
                this.inputId = "";
                this.message = "O microfone selecionado não está disponível. Seleção automática restaurada.";
            }
            if (audioOutput.deviceId && !devices.some(device => device.kind === "audiooutput" && device.deviceId === audioOutput.deviceId)) {
                // Stop playback before restoring the system route.
                this.beforeChange();
                if (this.activeTrack) await this.onCaptureLost("A saída de áudio foi desconectada. Selecione uma saída e reinicie o treino.");
                await audioOutput.select("");
                this.message = "A saída selecionada não está disponível. Saída automática restaurada.";
            }
            if (this.activeTrack?.readyState === "ended") this.captureLost();
        } catch (error) {
            this.message = "Não foi possível atualizar a lista de dispositivos. " + (error.message || "");
            this.render();
            return false;
        }
        this.render();
        return true;
    }

    captureStarted() {
        this.captureStopped();
        this.activeTrack = this.microphone.stream?.getAudioTracks()[0] || null;
        this.trackEnded = () => this.captureLost();
        this.activeTrack?.addEventListener("ended", this.trackEnded);
        const actual = this.microphone.selectedDeviceId;
        const fallback = this.microphone.selectionFallback ||
            (this.inputId && this.inputId !== "default" && actual && this.inputId !== actual);
        this.message = fallback
            ? "O microfone solicitado não pôde ser usado. A captura está usando a entrada disponível."
            : "";
        if (fallback) this.inputId = "";
        this.render();
        void this.refresh();
    }

    captureStopped() {
        this.activeTrack?.removeEventListener("ended", this.trackEnded);
        this.activeTrack = null;
        this.render();
    }

    captureLost() {
        if (!this.activeTrack) return;
        this.captureStopped();
        this.message = "Microfone desconectado. Confira os dispositivos e reinicie o treino.";
        void this.onCaptureLost(this.message);
        this.render();
    }

    setLocked(locked) {
        this.locked = locked;
        this.render();
    }

    fill(select, devices, selected, automatic) {
        const options = [new Option(automatic, "")];
        const seen = new Set();
        for (const device of devices) {
            if (!device.deviceId || seen.has(device.deviceId)) continue;
            seen.add(device.deviceId);
            options.push(new Option(device.label || `Dispositivo ${options.length}`, device.deviceId));
        }
        select.replaceChildren(...options);
        select.value = selected;
    }

    render() {
        const inputs = this.devices.filter(device => device.kind === "audioinput");
        const outputs = this.devices.filter(device => device.kind === "audiooutput");
        const preferred = this.preferredInput;
        const name = this.activeTrack
            ? this.microphone.selectedDeviceLabel || "Microfone do sistema"
            : preferred?.label || "identificar ao iniciar";
        this.fill(this.input, inputs, this.inputId, `Automático — ${name}`);
        this.fill(this.output, outputs, audioOutput.deviceId, "Automático — Padrão do sistema");
        const disabled = this.locked || this.busy;
        this.input.disabled = disabled || !this.media?.getUserMedia;
        this.output.disabled = disabled || !audioOutput.supported;
        this.refreshButton.disabled = disabled || !this.media?.enumerateDevices;
        this.permissionButton.disabled = disabled || !this.media?.getUserMedia;
        this.permissionButton.hidden = inputs.some(device => device.label);
        this.outputButton.hidden = !audioOutput.supported || !this.media?.selectAudioOutput;
        this.outputButton.disabled = disabled;
        this.help.textContent = audioOutput.supported
            ? "A seleção se aplica ao instrumental, à melodia MIDI, aos efeitos e ao retorno da voz."
            : "A saída de áudio é controlada pelo sistema. Altere nas configurações do aparelho.";
        const capture = this.activeTrack
            ? `Em uso: ${this.microphone.selectedDeviceLabel || "Microfone do sistema"}.`
            : "Microfone inativo; a seleção será aplicada ao iniciar.";
        this.status.textContent = !this.media?.getUserMedia
            ? "Microfone indisponível. Abra o aplicativo por HTTPS em um navegador compatível."
            : `${capture} ${this.message || (!inputs.some(device => device.label) ? "Autorize o microfone para identificar os dispositivos." : "")}`;
    }

    destroy() {
        this.refreshVersion++;
        this.captureStopped();
        this.media?.removeEventListener?.("devicechange", this.handleDeviceChange);
        document.removeEventListener("visibilitychange", this.handleVisibility);
    }
}
