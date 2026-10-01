// Run with: node --test tests/*.test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = name => readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(devices = []) {
    const elements = new Map();
    const element = () => ({ value: '', listeners: {}, disabled: false, hidden: false,
        addEventListener(type, handler) { this.listeners[type] = handler; },
        replaceChildren(...options) { this.options = options; },
    });
    const media = { enumerateDevices: async () => devices,
        getUserMedia: async () => { throw new Error('unexpected permission request'); },
        addEventListener() {}, removeEventListener() {} };
    const context = vm.createContext({
        console: { group() {}, groupEnd() {}, log() {}, info() {}, warn() {} },
        navigator: { mediaDevices: media },
        document: { visibilityState: 'visible',
            getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
            addEventListener() {}, removeEventListener() {} },
        Option: class { constructor(text, value) { this.text = text; this.value = value; } },
        HTMLMediaElement: class { setSinkId() {} },
        AudioContext: class { setSinkId() {} },
    });
    vm.runInContext(source('audio-devices').replace(/^export /gm, '') +
        '\nglobalThis.api = { AudioOutputRouter, AudioDeviceControls, audioOutput };', context);
    return { ...context.api, context, elements, media };
}

const sink = (reject = () => false) => ({ sinkId: '', calls: [],
    async setSinkId(id) { this.calls.push(id); if (reject(id)) throw new Error('route failed'); this.sinkId = id; } });

test('automatic output leaves the system alone; all registered and future sounds follow a manual selection', async () => {
    const { AudioOutputRouter } = fixture();
    const router = new AudioOutputRouter();
    const backing = sink(), midi = sink(), effect = sink();
    await router.register(backing);
    await router.register(midi);
    assert.deepEqual(backing.calls, []);
    await router.select('usb');
    await router.register(effect);
    assert.equal(backing.sinkId, 'usb');
    assert.equal(midi.sinkId, 'usb');
    assert.equal(effect.sinkId, 'usb');
    await router.select('');
    assert.equal(backing.sinkId, '');
    assert.equal(effect.sinkId, '');
});

test('a partial output failure rolls every sound back to the previous device', async () => {
    const { AudioOutputRouter } = fixture();
    const router = new AudioOutputRouter();
    const backing = sink(), midi = sink(id => id === 'broken');
    await router.register(backing);
    await router.register(midi);
    await router.select('usb');
    await assert.rejects(router.select('broken'));
    assert.equal(router.deviceId, 'usb');
    assert.equal(backing.sinkId, 'usb');
    assert.equal(midi.sinkId, 'usb');
});

test('failed rollback returns to automatic and detached sounds are no longer rerouted', async () => {
    const { AudioOutputRouter } = fixture();
    const router = new AudioOutputRouter();
    let fail = false;
    const backing = sink(id => fail && id === 'usb'), midi = sink(id => id === 'broken');
    await router.register(backing);
    await router.register(midi);
    await router.select('usb');
    fail = true;
    await assert.rejects(router.select('broken'));
    assert.equal(router.deviceId, '');
    assert.equal(backing.sinkId, '');
    router.unregister(midi);
    await router.select('speaker');
    assert.equal(midi.sinkId, '');
});

function controlsFixture(devices) {
    const f = fixture(devices);
    const microphone = { findPreferredInternalMicrophone: inputs => inputs[0] };
    const lost = [];
    const controls = new f.AudioDeviceControls({ microphone, beforeChange() {},
        prepareOutput: async () => {}, onCaptureLost: async message => lost.push(message) });
    return { ...f, controls, microphone, lost };
}

test('device list keeps automatic and manual options; locking preserves the visible selection', async () => {
    const { controls, elements } = controlsFixture([
        { kind: 'audioinput', deviceId: 'internal', label: 'Interno' },
        { kind: 'audioinput', deviceId: 'usb', label: 'USB' },
    ]);
    controls.init();
    await tick();
    const input = elements.get('seletorMicrofone');
    assert.match(input.options[0].text, /Interno/);
    assert.equal(input.options.length, 3);
    input.value = 'usb';
    input.listeners.change();
    controls.setLocked(true);
    assert.equal(controls.inputId, 'usb');
    assert.equal(input.value, 'usb');
    assert.equal(input.disabled, true);
});

test('permission is requested only by a click and its temporary stream is always closed', async () => {
    const { controls, media, elements } = controlsFixture([]);
    let requests = 0, stops = 0;
    media.getUserMedia = async () => { requests++; return { getTracks: () => [{ stop() { stops++; } }] }; };
    controls.init();
    await tick();
    assert.equal(requests, 0);
    media.enumerateDevices = async () => { throw new Error('enumeration failed'); };
    elements.get('autorizarMicrofone').listeners.click();
    await tick();
    assert.equal(requests, 1);
    assert.equal(stops, 1);
    assert.equal(controls.busy, false);
});

test('an ended capture stops training and actual fallback is reflected in the selection', async () => {
    const { controls, microphone, lost } = controlsFixture([]);
    const track = { readyState: 'live', addEventListener(type, handler) { this.ended = handler; }, removeEventListener() {} };
    microphone.stream = { getAudioTracks: () => [track] };
    microphone.selectedDeviceId = 'internal';
    microphone.selectedDeviceLabel = 'Interno';
    microphone.selectionFallback = true;
    controls.inputId = 'missing';
    controls.captureStarted();
    assert.equal(controls.inputId, '');
    assert.match(controls.status.textContent, /Em uso: Interno/);
    track.ended();
    await tick();
    assert.equal(lost.length, 1);
    assert.equal(controls.activeTrack, null);
});

test('older enumeration cannot overwrite a newer device list', async () => {
    const { controls, media } = controlsFixture([]);
    let release;
    media.enumerateDevices = () => new Promise(resolve => { release = resolve; });
    const old = controls.refresh();
    media.enumerateDevices = async () => [{ kind: 'audioinput', deviceId: 'usb', label: 'USB' }];
    await controls.refresh();
    release([]);
    await old;
    assert.equal(controls.devices[0].deviceId, 'usb');
});

test('unsupported output retains automatic with an explanation instead of a false manual control', () => {
    const { controls, context } = controlsFixture([]);
    context.AudioContext = class {};
    controls.render();
    assert.equal(controls.output.disabled, true);
    assert.match(controls.help.textContent, /controlada pelo sistema/);
});

test('microphone automatic ranking is preserved and manual capture uses an exact device constraint', async () => {
    const f = fixture();
    const requests = [];
    const track = { label: 'USB', getSettings: () => ({ deviceId: 'usb' }), stop() {} };
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    f.media.getUserMedia = async constraints => { requests.push(constraints); return stream; };
    f.media.enumerateDevices = async () => [{ kind: 'audioinput', deviceId: 'usb', label: 'USB microphone' }];
    f.context.window = { AudioContext: class {
        state = 'running';
        createMediaStreamSource() { return { connect() {} }; }
        createAnalyser() { return {}; }
    } };
    vm.runInContext(source('audio').replace(/^export /gm, '') + '\nglobalThis.mic = new MicrophoneAudio();', f.context);
    const mic = f.context.mic;
    mic.wait = async () => {};
    let ranked = 0;
    const rank = mic.findPreferredInternalMicrophone.bind(mic);
    mic.findPreferredInternalMicrophone = devices => { ranked++; return rank(devices); };
    await mic.start('usb');
    assert.equal(requests[1].audio.deviceId.exact, 'usb');
    assert.equal(requests[1].audio.echoCancellation, false);
    assert.equal(ranked, 0);
    mic.running = false;
    await mic.start();
    assert.equal(ranked, 1);
    assert.equal(mic.selectedDeviceId, 'usb');
});


test('disconnected output restores automatic and stops a running training session', async () => {
    const { controls, audioOutput, lost } = controlsFixture([]);
    const backing = sink();
    await audioOutput.register(backing);
    await audioOutput.select('gone');
    controls.activeTrack = { readyState: 'live' };
    await controls.refresh();
    assert.equal(lost.length, 1);
    assert.equal(audioOutput.deviceId, '');
    assert.equal(backing.sinkId, '');
});

test('denied permission leaves controls usable and explains the failure', async () => {
    const { controls, media, elements } = controlsFixture([]);
    media.getUserMedia = async () => { const error = new Error('denied'); error.name = 'NotAllowedError'; throw error; };
    controls.init();
    await tick();
    elements.get('autorizarMicrofone').listeners.click();
    await tick();
    assert.equal(controls.busy, false);
    assert.equal(elements.get('autorizarMicrofone').disabled, false);
    assert.match(controls.status.textContent, /Permissão não concedida/);
});
