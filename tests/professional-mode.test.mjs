import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfessionalSession } from '../js/professional-mode.js';
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function sing(s, start, seconds, pitch, rate = 60) {
    const events = [];
    for (let i = 0; i < seconds * rate; i++) events.push(...s.sample(start + i / rate, pitch));
    events.push(...s.sample(start + seconds));
    return events;
}
test('all scale degrees and octaves; minor and enharmonic keys; invalid keys', () => {
    const s = new ProfessionalSession('C', 'major');
    for (const note of [0, 2, 4, 5, 7, 9, 11]) for (const octave of [2, 4, 6]) close(s.classify(note + octave * 12).quality, 100);
    for (const note of [61, 63, 66, 68, 70]) close(s.classify(note).quality, 0);
    close(new ProfessionalSession('C', 'minor').classify(63).quality, 100);
    close(new ProfessionalSession('C', 'minor').classify(64).quality, 0);
    assert.deepEqual(new ProfessionalSession('Db', 'major').scale, new ProfessionalSession('C#', 'major').scale);
    assert.throws(() => new ProfessionalSession('H', 'major'));
    assert.throws(() => new ProfessionalSession('C', 'unknown'));
});
test('continuous cents control credit without rounding away detuning', () => {
    const s = new ProfessionalSession('C', 'major');
    for (const [pitch, credit] of [[60,100],[60.25,100],[60.35,0],[60.45,0],[60.6,0],[59.9,100]]) close(s.classify(pitch).quality,credit);
    assert.equal(s.classify(59.9).nearestMidi, 60);
    assert.equal(s.classify(null), null);
    assert.equal(s.classify(NaN), null);
});
test('percentage and celebration windows depend on voice time, not frame rate', () => {
    for (const rate of [20,30,60,120]) {
        const s = new ProfessionalSession('C','major');
        const events = sing(s,12,3,60,rate);
        close(s.summary().inTuneSeconds,3);
        close(s.summary().precision,100);
        close(s.summary().voicedSeconds,3);
        assert.equal(events.length,3);
        assert.equal(s.bestCombo,3);
        events.forEach(event => close(event.score,100));
    }
});
test('silence is free, out-of-key voice lowers precision, no voice has no result', () => {
    const s = new ProfessionalSession('C','major');
    s.sample(0); s.sample(10);
    assert.equal(s.summary().precision,null);
    sing(s,11,2,60);
    const tuned = s.inTuneSeconds;
    s.sample(20);
    close(s.inTuneSeconds,tuned); close(s.summary().precision,100);
    sing(s,21,2,61);
    close(s.inTuneSeconds,2); close(s.summary().precision,50); close(s.voicedSeconds,4);
    assert.equal(s.combo,0); assert.equal(s.bestCombo,2);
});
test('gaps, duplicate timestamps and backward clocks never manufacture voice', () => {
    const s = new ProfessionalSession('C','major');
    s.sample(1,60); s.sample(1,60); s.sample(.5,60); s.sample(20,60);
    close(s.inTuneSeconds,0);
    s.sample(20.1,60); close(s.inTuneSeconds,.1);
    assert.equal(s.summary().hasEvaluation,false);
});
test('full history survives view pruning and marks short silences', () => {
    const s = new ProfessionalSession('C','major');
    sing(s,0,40,60,20); s.sample(40.05,67); s.sample(40.10);
    const length = s.history.length;
    assert.ok(s.visibleHistory(40).length < length);
    assert.equal(s.history[0].time,0); assert.equal(s.history.length,length);
    assert.ok(s.visibleHistory(0).some(p=>p.time===0));
    assert.ok(s.history.some(p=>p.time===40 && p.midiFloat===null));
    const summary = JSON.stringify(s.summary()); s.visibleHistory(2);
    assert.equal(JSON.stringify(s.summary()),summary);
});
test('finish closes the last interval once; next presentation starts fresh', () => {
    const s = new ProfessionalSession('C','major');
    for(let i=0;i<15;i++) s.sample(i/10,60);
    assert.equal(s.finish(1.5).length,1); close(s.inTuneSeconds,1.5);
    s.finish(1.5); close(s.inTuneSeconds,1.5);
    assert.equal(new ProfessionalSession('C','major').history.length,0);
});

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
test('catalog accepts audio-only professional songs and retains existing MIDI URLs', () => {
    const context=vm.createContext({});
    const source=readFileSync(new URL('../js/song-catalog.js',import.meta.url),'utf8').replace(/^export /gm,'');
    vm.runInContext(source,context);
    const run=text=>vm.runInContext(text,context);
    run(`const song={id:'test',folder:'pop/test',title:'Test',artist:'Singer',key:'C',mode:'major',files:{audio:'instrumental.mp3'}};
        const normalized=normalizeSong(song,{id:'pop',name:'Pop'});`);
    assert.equal(run('normalized.files.midi'),null);
    assert.equal(run('getSongMidiUrl(normalized)'),null);
    assert.ok(run('getSongAudioUrl(normalized)').endsWith('instrumental.mp3'));
    run(`song.files.midi='voz.mid';const withMidi=normalizeSong(song,{id:'pop',name:'Pop'});`);
    assert.ok(run('getSongMidiUrl(withMidi)').endsWith('voz.mid'));
    assert.throws(()=>run(`normalizeSong({...song,files:{}},{id:'pop',name:'Pop'})`));
});


test('percentage is the actual share of time in tune, not a quality average or note count', () => {
    for (const rate of [20, 30, 60, 120]) {
        const s = new ProfessionalSession('C', 'major');
        sing(s, 0, 3, 60.25, rate);
        sing(s, 5, 1, 60.35, rate);
        const result = s.summary();
        close(result.precision, 75);
        close(result.inTuneSeconds, 3);
        close(result.outOfTuneSeconds, 1);
        close(result.voicedSeconds, 4);
        assert.equal('points' in result, false);
        s.sample(20);
        close(s.summary().precision, 75);
    }
});

test('all voiced time outside tolerance gives zero percent; tolerance boundary is inclusive', () => {
    const s = new ProfessionalSession('C', 'major');
    assert.equal(s.classify(60.25).status, 'inTune');
    assert.equal(s.classify(59.75).status, 'inTune');
    assert.notEqual(s.classify(60.2501).status, 'inTune');
    sing(s, 0, 2, 60.35);
    close(s.summary().precision, 0);
    close(s.summary().outOfTuneSeconds, 2);
});


test('first detected sample is immediately classified and brief notes count in full', () => {
    const s = new ProfessionalSession('C', 'major');
    s.sample(0,60);
    assert.equal(s.history[0].status,'inTune');
    s.sample(.016,61);
    close(s.inTuneSeconds,.016);
    s.sample(.032);
    close(s.summary().outOfTuneSeconds,.016);
    close(s.voicedSeconds,.032);
});

test('initial detuning counts from voice onset without attack forgiveness', () => {
    const s = new ProfessionalSession('C', 'major');
    for (let i=0;i<100;i++) s.sample(i*.02,i<6 ? 60.4 : 60.05);
    s.sample(2);
    close(s.summary().precision,94);
    close(s.summary().outOfTuneSeconds,.12);
});

test('rapid changes and pauses do not discard short notes or grant grace', () => {
    const s = new ProfessionalSession('C', 'major');
    for (let i=0;i<200;i++) s.sample(i*.01,i%2 ? 61 : 60);
    s.sample(2);
    close(s.summary().precision,50);
    close(s.voicedSeconds,2);
    sing(s,3,.1,72,100);
    close(s.inTuneSeconds,1.1);
    close(s.voicedSeconds,2.1);
});
