import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

function fixture() {
    const context = vm.createContext({ URL, console,
        document: { readyState: 'loading', addEventListener() {} },
        window: { location: { href: 'https://example.com/melodia.html' } } });
    const source = readFileSync(new URL('../js/party-mode.js', import.meta.url), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
    vm.runInContext(source + '\nglobalThis.controller = partyMode;', context);
    return context.controller;
}

test('volume precedence, zero, invalid entries and legacy defaults', () => {
    const party = fixture();
    const url = party.resolveManifestAssetUrl('./sounds/a.mp3');
    const settings = { default: .6, categories: { struggling: .3 }, items: { './sounds/a.mp3': 0 } };
    const manifest = { volumes: { sounds: settings } };
    assert.equal(party.resolvePartyVolume('sounds','struggling',url,manifest),0);
    for (const invalid of [null, '0.2', -1, 2, NaN, Infinity]) {
        settings.items['./sounds/a.mp3']=invalid;
        assert.equal(party.resolvePartyVolume('sounds','struggling',url,manifest),.3);
    }
    assert.equal(party.resolvePartyVolume('sounds','good',url,manifest),.6);
    assert.equal(party.resolvePartyVolume('sounds','good',url,{}),.8);
    assert.equal(party.resolvePartyVolume('memes','good',url,manifest),.42);
});

test('random effects and memes forward independent per-file volumes to playback', async () => {
    const party = fixture();
    const manifest = { sounds: { struggling: ['./s.mp3'] }, memes: { struggling: ['./m.mp4'] },
        volumes: { sounds: { categories: { struggling: .3 }, items: { './s.mp3': .12 } },
            memes: { items: { './m.mp4': .21 } } } };
    party.isActive=()=>true;
    party.memeStageAvailable=true;
    party.ensureManifestLoaded=async()=>manifest;
    party.playPartySound=async(url,category,options)=>options.volume;
    party.showMeme=async(url,category,caption,volume)=>volume;
    assert.equal(await party.showRandomSound('struggling'),.12);
    assert.equal(await party.showRandomMeme('struggling'),.21);
});

test('manifest lowers struggling effects and preserves other media defaults', () => {
    const party=fixture();
    const manifest=JSON.parse(readFileSync(new URL('../assets/party/party-manifest.json',import.meta.url),'utf8'));
    assert.equal(party.resolvePartyVolume('sounds','struggling','x',manifest),.3);
    assert.equal(party.resolvePartyVolume('sounds','great','x',manifest),.8);
    assert.equal(party.resolvePartyVolume('memes','struggling','x',manifest),.42);
});
