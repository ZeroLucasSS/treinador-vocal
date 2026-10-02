import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

function fixture() {
    const context = vm.createContext({ document: { readyState: 'loading', addEventListener() {} },
        window: { clearTimeout() {}, innerWidth: 1920, innerHeight: 600 },
        getComputedStyle: () => ({ paddingTop: '12px', paddingBottom: '38px',
            borderTopWidth: '4px', borderBottomWidth: '10px' }), console });
    const source = readFileSync(new URL('../js/party-mode.js', import.meta.url), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
    vm.runInContext(source + '\nglobalThis.controller = partyMode;', context);
    return context.controller;
}

test('captions are selected only from their category, with category-specific legacy defaults', () => {
    const party = fixture();
    const manifest = { captions: { good: ['Bom!'], struggling: ['Tente!'] } };
    assert.equal(party.chooseMemeCaption('good', manifest), 'Bom!');
    assert.equal(party.chooseMemeCaption('struggling', manifest), 'Tente!');
    assert.equal(party.chooseMemeCaption('great', {}), 'Incrível!');
    assert.equal(party.chooseMemeCaption('comeback', null), 'Boa recuperação!');
});

test('blank, malformed and excessively long captions are ignored; whitespace and duplicates are normalized', () => {
    const party = fixture();
    assert.equal(party.chooseMemeCaption('good', { captions: { good: [null, 4, '', ' ', 'x'.repeat(121)] } }), 'Está indo bem!');
    assert.equal(party.chooseMemeCaption('good', { captions: { good: ['  Boa   voz!  ', 'Boa voz!'] } }), 'Boa voz!');
    assert.equal(party.chooseMemeCaption('great', { captions: { great: 'not an array' } }), 'Incrível!');
});

test('recent phrases are avoided within their category and a single phrase remains reusable', () => {
    const party = fixture();
    party.recentCaptions.good = ['A', 'B'];
    assert.equal(party.chooseMemeCaption('good', { captions: { good: ['A', 'B', 'C'] } }), 'C');
    assert.equal(party.chooseMemeCaption('good', { captions: { good: ['A', 'B'] } }), 'A');
    assert.equal(party.chooseMemeCaption('good', { captions: { good: ['B'] } }), 'B');
    assert.equal(party.chooseMemeCaption('great', { captions: { great: ['B'] } }), 'B');
});

test('a cancelled media load cannot display or record a caption', async () => {
    const party = fixture();
    party.isActive = () => true;
    party.memeStage = {};
    party.memeMediaContainer = {};
    party.memeCaption = { textContent: '' };
    party.memeAnnouncement = { textContent: '' };
    party.positionMemeStage = () => {};
    let complete;
    party.createMemeMedia = () => new Promise(resolve => { complete = resolve; });
    const pending = party.showMeme('test.png', 'good', 'Bom!');
    party.memeRequestToken++;
    complete({ tagName: 'IMG' });
    assert.equal(await pending, false);
    assert.equal(party.memeCaption.textContent, '');
    assert.equal(party.memeAnnouncement.textContent, '');
    assert.equal(party.recentCaptions.good, undefined);
});

test('removing media clears both the visible caption and the accessible announcement', () => {
    const party = fixture();
    party.memeCaption = { textContent: 'Bom!' };
    party.memeAnnouncement = { textContent: 'Bom!' };
    party.memeMediaContainer = { querySelector: () => null, replaceChildren() {} };
    party.removeCurrentMemeMedia();
    assert.equal(party.memeCaption.textContent, '');
    assert.equal(party.memeAnnouncement.textContent, '');
});


test('a resize that hides a tall caption allows shorter future memes without another resize', () => {
    const party = fixture();
    party.available = true;
    party.memeActive = true;
    party.findPrimaryCanvasRect = () => ({ left: 750 });
    party.memeStage = { dataset: {}, style: { setProperty() {} } };
    party.memeCard = { offsetWidth: 680, style: {} };
    party.memeMediaContainer = { style: {} };
    party.memeCaption = { textContent: 'Long caption',
        get offsetHeight() { return this.textContent ? 300 : 0; } };
    let hidden = 0;
    party.hideMeme = immediate => {
        assert.equal(immediate, true);
        hidden++;
        party.memeActive = false;
        party.memeCaption.textContent = '';
    };
    party.positionMemeStage();
    assert.equal(hidden, 1);
    assert.equal(party.memeActive, false);
    assert.equal(party.memeStageAvailable, true);
    assert.equal(party.memeStage.dataset.available, 'true');
});
