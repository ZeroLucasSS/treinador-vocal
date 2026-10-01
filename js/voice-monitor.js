import { audioOutput } from "./audio-devices.js";

// The monitor branches from the source, never from the analysis buffer.
export class VoiceMonitor {
    constructor({ microphone, onTest }) {
        this.microphone = microphone;
        this.onTest = onTest;
        this.context = null;
        this.source = null;
        this.gain = null;
        this.enabled = false;
        this.volume = 0.2;
        this.version = 0;
        this.locked = false;
        this.testState = "idle";
        this.message = "Retorno desligado.";
        this.toggle = document.getElementById("reproduzirVoz");
        this.slider = document.getElementById("volumeVoz");
        this.volumeLabel = document.getElementById("valorVolumeVoz");
        this.testButton = document.getElementById("testarVoz");
        this.muteButton = document.getElementById("silenciarVoz");
        this.status = document.getElementById("estadoRetornoVoz");
        this.listeningMode = document.getElementById("modoEscuta");
        this.listeningHelp = document.getElementById("ajudaModoEscuta");
        this.routeChanged = () => {
            if (this.context) this.mute("Dispositivos de áudio alterados. Confira a saída e reative o retorno se desejar.");
        };
        this.contextChanged = () => {
            if (this.context?.state !== "running") this.mute("Retorno silenciado porque o áudio foi interrompido.");
        };
    }

    init() {
        this.toggle.addEventListener("change", () => void this.setEnabled(this.toggle.checked));
        this.slider.addEventListener("input", () => this.setVolume(Number(this.slider.value) / 100));
        this.muteButton.addEventListener("click", () => this.mute());
        this.testButton.addEventListener("click", () => void this.onTest());
        this.listeningMode.addEventListener("change", () => {
            this.mute("Configuração de escuta alterada. Confira o volume antes de ativar o retorno.");
            this.render();
        });
        navigator.mediaDevices?.addEventListener?.("devicechange", this.routeChanged);
        audioOutput.beforeChange.add(this.routeChanged);
        this.render();
    }

    async attach() {
        this.release();
        const version = this.version;
        const { audioContext: context, source } = this.microphone;
        if (!context || !source) return;
        this.context = context;
        this.source = source;
        this.gain = context.createGain();
        this.gain.gain.value = 0;
        try {
            await audioOutput.register(context);
            if (version !== this.version) {
                audioOutput.unregister(context);
                return;
            }
            source.connect(this.gain);
            this.gain.connect(context.destination);
            context.addEventListener("sinkchange", this.routeChanged);
            context.addEventListener("statechange", this.contextChanged);
            if (this.enabled) await this.setEnabled(true);
            else this.render();
        } catch (error) {
            this.mute("Não foi possível reproduzir a voz na saída selecionada. A análise continua disponível.");
            this.release();
            this.render();
        }
    }

    async setEnabled(enabled) {
        if (!enabled) return this.mute();
        this.enabled = true;
        if (!this.context || !this.gain) {
            if (this.microphone.running) return this.attach();
            this.message = "Retorno preparado. Use Testar voz ou inicie o treino.";
            return this.render();
        }
        const version = this.version;
        try {
            await audioOutput.apply(this.context);
            if (this.context?.state === "suspended") await this.context.resume();
            if (version !== this.version || !this.enabled) return;
            this.applyVolume();
            this.message = "Sua voz está sendo reproduzida na saída selecionada.";
        } catch (error) {
            this.mute("Falha na saída de áudio. Retorno silenciado; confira os dispositivos.");
        }
        this.render();
    }

    setVolume(value) {
        this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
        this.applyVolume();
        this.render();
    }

    applyVolume() {
        if (!this.gain || !this.context) return;
        const now = this.context.currentTime;
        this.gain.gain.cancelScheduledValues(now);
        // Immediate silence; small ramps for other changes avoid clicks.
        if (!this.enabled || this.volume === 0) this.gain.gain.setValueAtTime(0, now);
        else this.gain.gain.setTargetAtTime(this.volume, now, 0.015);
    }

    mute(message = "Retorno silenciado. A análise da voz continua durante o treino.") {
        this.enabled = false;
        this.applyVolume();
        this.message = message;
        this.render();
    }

    release() {
        this.version++;
        if (this.context) {
            this.context.removeEventListener("sinkchange", this.routeChanged);
            this.context.removeEventListener("statechange", this.contextChanged);
            audioOutput.unregister(this.context);
        }
        if (this.gain) {
            this.gain.gain.cancelScheduledValues(this.context.currentTime);
            this.gain.gain.setValueAtTime(0, this.context.currentTime);
            try { this.source.disconnect(this.gain); } catch { /* Already disconnected. */ }
            this.gain.disconnect();
        }
        this.gain = this.context = this.source = null;
    }

    detach() {
        this.mute("Retorno desligado.");
        this.release();
        this.render();
    }

    setLocked(locked) {
        this.locked = locked;
        this.render();
    }

    setTestState(state) {
        this.testState = state;
        this.render();
    }

    render() {
        this.toggle.checked = this.enabled;
        this.slider.value = String(Math.round(this.volume * 100));
        this.volumeLabel.textContent = `${Math.round(this.volume * 100)}%`;
        this.muteButton.disabled = !this.enabled;
        this.testButton.textContent = this.testState === "active" ? "Encerrar teste de voz"
            : this.testState === "starting" ? "Preparando microfone…" : "Testar voz";
        this.testButton.disabled = this.testState === "starting" ||
            (this.locked && this.testState !== "active") || !navigator.mediaDevices?.getUserMedia;
        this.listeningMode.disabled = this.locked;
        this.status.textContent = this.enabled && this.context && this.volume === 0
            ? "Retorno ligado, com volume em 0%." : this.message;
        this.listeningHelp.textContent = this.listeningMode.value === "speakers"
            ? "Com caixas de som, comece com volume baixo e mantenha o microfone afastado delas para evitar microfonia. O instrumental captado pelo microfone pode prejudicar a pontuação. Prefira conexões por cabo; Bluetooth pode atrasar sua voz."
            : "Fones reduzem a entrada do instrumental no microfone e favorecem a avaliação. Se já ouvir sua voz por uma interface ou mesa, deixe o retorno do aplicativo desligado para evitar duplicação.";
    }

    destroy() {
        this.detach();
        navigator.mediaDevices?.removeEventListener?.("devicechange", this.routeChanged);
        audioOutput.beforeChange.delete(this.routeChanged);
    }
}
