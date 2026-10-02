import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

function fixture() {
    const elements = new Map();
    const listeners = new Map();
    const gains = [];
    const analysis = {};
    const connections = new Set([analysis]);
    const source = { connect(node) { connections.add(node); }, disconnect(node) { connections.delete(node); } };
    const context = {
        currentTime: 0, state: 'running', sinkId: '', destination: {},
        async setSinkId(id) { this.sinkId = id; }, async resume() { this.state = 'running'; },
        addEventListener(name, fn) { listeners.set(name, fn); },
        removeEventListener(name) { listeners.delete(name); },
        createGain() {
            const gain = { gain: { value: 1, cancelScheduledValues() {},
                setValueAtTime(value) { this.value = value; }, setTargetAtTime(value) { this.value = value; } },
                connect(node) { this.destination = node; }, disconnect() { this.destination = null; } };
            gains.push(gain);
            return gain;
        }
    };
    const microphone = { audioContext: context, source, running: false };
    const mediaListeners = new Map();
    const sandbox = vm.createContext({
        navigator: { mediaDevices: { getUserMedia() {},
            addEventListener(name, fn) { mediaListeners.set(name, fn); },
            removeEventListener(name) { mediaListeners.delete(name); } } },
        document: { getElementById(id) {
            if (!elements.has(id)) elements.set(id, { value: '', listeners: {},
                addEventListener(name, fn) { this.listeners[name] = fn; } });
            return elements.get(id);
        } },
    });
    const load = name => readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
    vm.runInContext(load('audio-devices') + '\nglobalThis.router = audioOutput;', sandbox);
    vm.runInContext(load('voice-monitor') + '\nglobalThis.Monitor = VoiceMonitor;', sandbox);
    const monitor = new sandbox.Monitor({ microphone, onTest() {} });
    monitor.init();
    return { monitor, microphone, context, router: sandbox.router, gains, connections, analysis,
        elements, listeners, mediaListeners };
}

test('monitor starts disabled, branches from source and never changes the analysis connection', async () => {
    const f = fixture();
    await f.monitor.attach();
    assert.equal(f.monitor.enabled, false);
    assert.equal(f.gains[0].gain.value, 0);
    assert.equal(f.connections.size, 2);
    await f.monitor.setEnabled(true);
    assert.equal(f.gains[0].gain.value, .2);
    f.monitor.setVolume(.7);
    assert.equal(f.gains[0].gain.value, .7);
    f.monitor.mute();
    assert.equal(f.gains[0].gain.value, 0);
    assert.ok(f.connections.has(f.analysis));
    assert.equal(f.connections.size, 2);
});

test('gain is limited and volume changes cannot unmute the return', async () => {
    const f = fixture();
    await f.monitor.attach();
    await f.monitor.setEnabled(true);
    f.monitor.setVolume(20);
    assert.equal(f.gains[0].gain.value, 1);
    f.monitor.mute();
    f.monitor.setVolume(.5);
    assert.equal(f.gains[0].gain.value, 0);
    f.monitor.setVolume(NaN);
    assert.equal(f.monitor.volume, 0);
});

test('routing is applied before the voice is connected and fallback silences it first', async () => {
    const f = fixture();
    f.router.deviceId = 'speakers';
    f.context.setSinkId = async function (id) {
        assert.equal(f.gains[0].gain.value, 0);
        this.sinkId = id;
    };
    await f.monitor.setEnabled(true);
    await f.monitor.attach();
    assert.equal(f.context.sinkId, 'speakers');
    assert.equal(f.gains[0].gain.value, .2);
    await f.router.select('');
    assert.equal(f.gains[0].gain.value, 0);
    assert.equal(f.monitor.enabled, false);
});

test('route failure keeps voice silent, releases its graph and preserves analysis', async () => {
    const f = fixture();
    f.router.deviceId = 'missing';
    f.context.setSinkId = async () => { throw new Error('not found'); };
    await f.monitor.setEnabled(true);
    await f.monitor.attach();
    assert.equal(f.monitor.enabled, false);
    assert.equal(f.gains[0].gain.value, 0);
    assert.equal(f.connections.size, 1);
    assert.ok(f.connections.has(f.analysis));
    assert.equal(f.router.targets.size, 0);
});

test('stopping during pending routing cannot reconnect or register the old context', async () => {
    const f = fixture();
    f.router.deviceId = 'slow';
    let release;
    f.context.setSinkId = () => new Promise(resolve => { release = resolve; });
    await f.monitor.setEnabled(true);
    const pending = f.monitor.attach();
    f.monitor.detach();
    release();
    await pending;
    assert.equal(f.connections.size, 1);
    assert.equal(f.router.targets.size, 0);
    assert.equal(f.monitor.context, null);
    assert.equal(f.monitor.enabled, false);
});

test('device changes, context interruptions and explicit mute never stop microphone analysis', async () => {
    const f = fixture();
    await f.monitor.attach();
    await f.monitor.setEnabled(true);
    f.mediaListeners.get('devicechange')();
    assert.equal(f.gains[0].gain.value, 0);
    await f.monitor.setEnabled(true);
    f.context.state = 'suspended';
    f.listeners.get('statechange')();
    assert.equal(f.monitor.enabled, false);
    assert.ok(f.connections.has(f.analysis));
    f.monitor.destroy();
    assert.equal(f.router.targets.size, 0);
    assert.equal(f.router.beforeChange.size, 0);
    assert.equal(f.mediaListeners.size, 0);
});

test('volume and mute remain accessible during training; test remains stoppable', () => {
    const f = fixture();
    f.monitor.setLocked(true);
    assert.equal(f.elements.get('testarVoz').disabled, true);
    assert.notEqual(f.elements.get('volumeVoz').disabled, true);
    assert.notEqual(f.elements.get('reproduzirVoz').disabled, true);
    f.monitor.setTestState('active');
    assert.equal(f.elements.get('testarVoz').disabled, false);
    assert.equal(f.elements.get('testarVoz').textContent, 'Encerrar teste de voz');
});


test('capture context remains available to effects when muted and is cleared on detach', async () => {
    const f = fixture();
    await f.monitor.attach();
    assert.equal(f.router.captureContext, f.context);
    await f.monitor.setEnabled(true);
    f.monitor.mute();
    assert.equal(f.router.captureContext, f.context);
    f.monitor.detach();
    assert.equal(f.router.captureContext, null);
});
