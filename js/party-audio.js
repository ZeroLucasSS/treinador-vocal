// Short effects share the capture's output context, but never its monitoring gain
// or its analyser. The small media-like interface preserves PartyMode's lifecycle.
export class PartyAudio extends EventTarget {
    constructor(context) {
        super();
        this.context = context;
        this.usesAudioContext = true;
        this.src = "";
        this.paused = true;
        this.level = 1;
        this.request = 0;
        this.source = null;
        this.gain = null;
        this.abort = null;
        this.startedAt = 0;
        this.position = 0;
    }

    get volume() { return this.level; }
    set volume(value) {
        this.level = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
        if (this.gain) this.gain.gain.setValueAtTime(this.level, this.context.currentTime);
    }
    get currentTime() {
        return this.paused ? this.position : this.context.currentTime - this.startedAt;
    }
    set currentTime(value) { this.position = value; }

    async play() {
        this.pause();
        const request = this.request;
        this.abort = new AbortController();
        const response = await fetch(this.src, { signal: this.abort.signal });
        if (!response.ok) throw new Error(`Efeito sonoro indisponível (${response.status}): ${this.src}`);
        const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
        if (request !== this.request) return;
        if (this.context.state === "suspended") await this.context.resume();
        if (request !== this.request) return;
        if (this.context.state !== "running") throw new Error("A saída dos efeitos sonoros está interrompida.");
        this.abort = null;
        this.gain = this.context.createGain();
        this.gain.gain.value = this.level;
        this.source = this.context.createBufferSource();
        this.source.buffer = buffer;
        this.source.connect(this.gain);
        this.gain.connect(this.context.destination);
        this.source.onended = () => {
            if (request !== this.request) return;
            this.position = buffer.duration;
            this.paused = true;
            this.disconnect();
            this.dispatchEvent(new Event("ended"));
        };
        this.startedAt = this.context.currentTime;
        this.position = 0;
        this.paused = false;
        this.source.start();
    }

    disconnect() {
        if (this.source) {
            this.source.onended = null;
            this.source.disconnect();
        }
        this.gain?.disconnect();
        this.source = this.gain = null;
    }

    pause() {
        this.position = this.currentTime;
        this.paused = true;
        this.request++;
        this.abort?.abort();
        this.abort = null;
        if (this.source) {
            this.source.onended = null;
            try { this.source.stop(); } catch { /* Already ended. */ }
        }
        this.disconnect();
    }

    removeAttribute(name) {
        if (name === "src") { this.pause(); this.src = ""; }
    }
    load() { /* No media element: pause/removeAttribute already release resources. */ }
}
