import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

function fixture() {
    const nodes = [];
    const context = {
        state: 'running', currentTime: 1, destination: {},
        async decodeAudioData() { return { duration: 2 }; },
        createGain() {
            const node = { gain: { value: 1, setValueAtTime(v) { this.value = v; } },
                connect(dest) { this.dest = dest; }, disconnect() { this.dest = null; } };
            nodes.push(node); return node;
        },
        createBufferSource() {
            const node = { connect(dest) { this.dest = dest; }, start() { this.started = true; },
                stop() { this.stopped = true; }, disconnect() { this.dest = null; } };
            nodes.push(node); return node;
        }
    };
    const sandbox = vm.createContext({ EventTarget, Event, AbortController,
        fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }) });
    vm.runInContext(readFileSync(new URL('../js/party-audio.js', import.meta.url), 'utf8')
        .replace('export class', 'class') + '\nglobalThis.Player = PartyAudio;', sandbox);
    const player = new sandbox.Player(context);
    player.src = '/effect.mp3';
    return { player, context, nodes, sandbox };
}

test('effects use their own gain and release nodes without stopping capture', async () => {
    const { player, context, nodes } = fixture();
    player.volume = .8;
    await player.play();
    assert.equal(nodes[0].gain.value, .8);
    assert.equal(nodes[0].dest, context.destination);
    assert.equal(nodes[1].dest, nodes[0]);
    assert.equal(nodes[1].started, true);
    player.volume = .4;
    assert.equal(nodes[0].gain.value, .4);
    player.pause();
    assert.equal(nodes[1].stopped, true);
    assert.equal(nodes[0].dest, null);
    assert.equal(context.state, 'running');
});

test('cancellation while decoding prevents late playback', async () => {
    const { player, context, nodes } = fixture();
    let finish;
    context.decodeAudioData = () => new Promise(resolve => { finish = resolve; });
    const playing = player.play();
    while (!finish) await Promise.resolve();
    player.pause();
    finish({ duration: 2 });
    await playing;
    assert.equal(nodes.length, 0);
    assert.equal(player.paused, true);
});

test('natural completion emits ended and disconnects nodes', async () => {
    const { player, nodes } = fixture();
    let ended = 0;
    player.addEventListener('ended', () => ended++);
    await player.play();
    nodes[1].onended();
    assert.equal(ended, 1);
    assert.equal(player.paused, true);
    assert.equal(player.currentTime, 2);
    assert.equal(nodes[0].dest, null);
});

test('unavailable files fail before connecting to output', async () => {
    const { player, nodes, sandbox } = fixture();
    sandbox.fetch = async () => ({ ok: false, status: 404 });
    await assert.rejects(player.play(), /404/);
    assert.equal(nodes.length, 0);
});

test('every configured Party sound exists', () => {
    const manifestUrl = new URL('../assets/party/party-manifest.json', import.meta.url);
    const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
    for (const files of Object.values(manifest.sounds)) {
        for (const file of files) assert.ok(existsSync(new URL(file, manifestUrl)), file);
    }
});
