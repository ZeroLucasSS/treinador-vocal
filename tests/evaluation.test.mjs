// Run with: node --test tests/evaluation.test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = name => readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8');
const script = text => text.replace(/^import\s+[\s\S]*?from\s+"[^"]+";\s*/gm, '')
    .replace(/^export /gm, '');

function fixture() {
    const events = [];
    const element = () => ({ textContent: '', value: 'beginner', innerHTML: '',
        classList: { add() {}, remove() {} }, style: {}, append() {}, appendChild() {},
        addEventListener() {}, scrollIntoView() {} });
    const document = { readyState: 'loading', getElementById: element, querySelector: element,
        querySelectorAll: () => [], createElement: element, addEventListener() {},
        dispatchEvent: event => events.push(event) };
    const context = vm.createContext({ document, console: { info() {}, debug() {} },
        window: { addEventListener() {}, setTimeout() {}, clearTimeout() {} },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        MicrophoneAudio: class {}, PitchDetector: class {}, ToneGenerator: class {},
        PianoRoll: class { constructor() { this.results = new Map(); } setNoteResult(i, r) { this.results.set(i, r); } }
    });
    const run = text => vm.runInContext(text, context);
    run(script(source('evaluation-rules')));
    run(script(source('music-theory')));
    run(script(source('melody-mode')).replace(/^initialize\(\);/m, ''));
    run(script(source('party-mode')));
    run(`partyMode.isActive = () => true;
        partyMode.updateVisualEnvironment = () => {};
        partyMode.dispatch = () => {};
        partyMode.maybeRunSoundEvent = () => {};
        partyMode.maybeRunCheckpoint = () => {};
        function prepare(notes, mode = 'beginner') {
            elements.difficultySelect.value = mode;
            selectedMelody = { notes };
            currentCombo = bestCombo = 0;
            createNoteStates();
        }`);
    return { run, events };
}

test('optional boundary is inclusive and exclusive to karaoke', () => {
    const { run } = fixture();
    assert.equal(run(`isOptionalNote(.25, 'beginner')`), true);
    for (const value of ['.250001', '0', '-1', 'NaN']) {
        assert.equal(run(`isOptionalNote(${value}, 'beginner')`), false);
    }
    for (const mode of ['intermediate', 'advanced']) {
        assert.equal(run(`isOptionalNote(.1, '${mode}')`), false);
    }
});

test('optional silence preserves combo and is excluded from summaries and party history', () => {
    const { run, events } = fixture();
    run(`prepare([{ start: 0, duration: .1, midi: 60 }, { start: .2, duration: 1, midi: 60 }]);
        currentCombo = 5; finalizeNote(0);`);
    assert.equal(run('currentCombo'), 5);
    assert.equal(run('noteStates[0].score'), null);
    assert.equal(run('buildKaraokeSessionSummary().totalNotes'), 1);
    assert.equal(events.some(e => e.type === 'karaoke:combo-updated'), false);
    run(`partyMode.handleNoteFinalized({ detail: buildKaraokeNoteEventDetail(noteStates[0]) });`);
    assert.equal(run('partyMode.performanceHistory.length'), 0);
    assert.equal(run('partyMode.sessionStats.finalized'), 0);
    run('finalizeNote(1)');
    assert.equal(run('noteStates[1].status'), 'missed');
    assert.equal(run('currentCombo'), 0);
    assert.equal(run('buildKaraokeSessionSummary().missedNotes'), 1);
});

test('all-optional song has no numeric UI result or performance celebration', () => {
    const { run } = fixture();
    run(`prepare([{ start: 0, duration: .25, midi: 60 }]); finalizeNote(0); showResults();`);
    assert.equal(run('elements.finalScore.textContent'), '—');
    assert.match(run('elements.finalEvaluation.textContent'), /Sem avaliação/);
    assert.equal(run('elements.finalResultSticker.textContent'), 'SEM AVALIAÇÃO');
    assert.equal(run('buildKaraokeSessionSummary().hasEvaluation'), false);
    run(`for (const method of ['stopBackgroundVideo', 'hideMeme', 'stopPartySound', 'clearParticles', 'resetVisualEnvironment']) partyMode[method] = () => {};
        partyMode.triggerVisualFlash = () => { throw new Error('unexpected celebration'); };
        partyMode.handleSessionEnded({ detail: buildKaraokeSessionSummary() });`);
});

test('anticipation and delayed release select one matching note and count accepted voice time', () => {
    const { run } = fixture();
    run(`prepare([{ start: 1, duration: 1, midi: 60 }, { start: 2, duration: 1, midi: 62 }]);`);
    assert.equal(run(`findVoiceTarget(selectedMelody.notes, noteStates, .86, 72, 'beginner').index`), 0);
    assert.equal(run(`findVoiceTarget(selectedMelody.notes, noteStates, .84, 60, 'beginner')`), null);
    assert.equal(run(`findVoiceTarget(selectedMelody.notes, noteStates, 1.94, 62, 'beginner').index`), 1);
    assert.equal(run(`findVoiceTarget(selectedMelody.notes, noteStates, 2.06, 60, 'beginner').index`), 0);
    assert.equal(run(`findVoiceTarget(selectedMelody.notes, noteStates, .9, 65, 'beginner')`), null);
    run(`evaluateVoiceSample(midiToFrequency(60), .86, 60);
        evaluateVoiceSample(midiToFrequency(60), .96, 60);`);
    assert.equal(run('noteStates[0].voiceSamples'), 2);
    assert.equal(run('noteStates[1].voiceSamples'), 0);
    assert.ok(Math.abs(run('noteStates[0].voicedTime') - .1) < 1e-9);
    run('finalizeExpiredNotes(2.13)');
    assert.equal(run('noteStates[0].finalized'), false);
    run('finalizeExpiredNotes(2.16)');
    assert.equal(run('noteStates[0].finalized'), true);
    assert.equal(run(`findVoiceTarget(selectedMelody.notes, noteStates, 2.1, 60, 'beginner')?.index`), 1);
});

test('short neighbours cap grace windows; training and cover keep exact MIDI intervals', () => {
    const { run } = fixture();
    run(`prepare([{ start: 0, duration: .1, midi: 60 }, { start: .1, duration: 1, midi: 62 }]);`);
    assert.equal(run(`getEvaluationWindow(selectedMelody.notes, 1, 'beginner').start`), .05);
    for (const mode of ['intermediate', 'advanced']) {
        assert.equal(run(`findVoiceTarget([{ start: 1, duration: 1, midi: 60 }], [], .95, 60, '${mode}')`), null);
        assert.equal(run(`findVoiceTarget([{ start: 1, duration: 1, midi: 60 }], [], 2.05, 60, '${mode}')`), null);
    }
});

test('migrated profiles and relaxed sustain retain real silence penalties', () => {
    const { run } = fixture();
    assert.equal(run('DIFFICULTIES.intermediate.tuningTolerance'), 40);
    assert.equal(run('DIFFICULTIES.advanced.tuningTolerance'), 25);
    assert.equal(run('DIFFICULTIES.intermediate.requiredCoverage'), .25);
    assert.equal(run('DIFFICULTIES.advanced.requiredCoverage'), .45);
    const required = run('getRequiredCoverageForNote(1, DIFFICULTIES.beginner)');
    assert.ok(required > .145 && required < .147);
    assert.equal(run('calculateDurationScore({ expectedDuration: 1 }, .15, DIFFICULTIES.beginner)'), 100);
    assert.equal(run('calculateDurationScore({ expectedDuration: 1 }, 0, DIFFICULTIES.beginner)'), 0);
    assert.equal(run('calculateDurationScore({ expectedDuration: .18, voiceSamples: 1 }, 0, DIFFICULTIES.intermediate)'), 100);
});

test('score and coverage averages exclude optional notes', () => {
    const { run } = fixture();
    run(`prepare([{ start: 0, duration: .1, midi: 60 }, { start: 1, duration: 1, midi: 60 }]);
        finalizeNote(0);
        Object.assign(noteStates[1], { finalized: true, score: 90, coverage: .2, status: 'excellent', averageCents: 0 });
        updateLiveStatistics(); showResults();`);
    assert.equal(run('elements.currentScore.textContent'), '90');
    assert.equal(run('elements.finalScore.textContent'), '90');
    assert.equal(run('elements.resultCoverage.textContent'), '20%');
    assert.equal(run('buildKaraokeSessionSummary().totalScore'), 90);
});

test('great uses mode-specific thresholds while retaining minimum sample and positive ratio', () => {
    const { run } = fixture();
    run(`partyMode.sessionInfo = { singingMode: 'beginner' };
        partyMode.performanceHistory = Array.from({ length: 4 }, () => ({ score: 82, status: 'excellent' }));
        partyMode.updatePerformanceDiagnosis();`);
    assert.equal(run('partyMode.performanceDiagnosis.state'), 'great');
    for (const mode of ['intermediate', 'advanced']) {
        run(`partyMode.sessionInfo.singingMode = '${mode}'; partyMode.updatePerformanceDiagnosis();`);
        assert.equal(run('partyMode.performanceDiagnosis.state'), 'good');
    }
    run(`partyMode.sessionInfo.singingMode = 'beginner'; partyMode.performanceHistory.pop(); partyMode.updatePerformanceDiagnosis();`);
    assert.equal(run('partyMode.performanceDiagnosis.state'), 'warming-up');
    run(`partyMode.performanceHistory = Array.from({ length: 10 }, (_, i) => ({ score: i < 6 ? 100 : 70, status: i < 6 ? 'excellent' : 'partial' })); partyMode.updatePerformanceDiagnosis();`);
    assert.equal(run('partyMode.performanceDiagnosis.state'), 'great');
    assert.equal(run('partyMode.performanceDiagnosis.positiveRatio'), 1);
    assert.equal(run('partyMode.classifyCheckpointCategory({ cumulativeAverage: 80, segmentAverage: 80 })'), 'great');
    run(`partyMode.sessionInfo.singingMode = 'intermediate'`);
    run('partyMode.updatePerformanceDiagnosis()');
    assert.equal(run('partyMode.performanceDiagnosis.state'), 'good');
    assert.equal(run('partyMode.performanceDiagnosis.positiveRatio'), .6);
    assert.equal(run('partyMode.classifyCheckpointCategory({ cumulativeAverage: 80, segmentAverage: 80 })'), 'good');
});

test('piano roll preserves optional status and never renders it as a zero-point result', () => {
    const context = vm.createContext({});
    vm.runInContext(script(source('piano-roll')), context);
    const result = vm.runInContext(`const roll = Object.create(PianoRoll.prototype);
        roll.noteResults = new Map(); roll.draw = () => {};
        roll.setNoteResult(0, { status: 'optional', score: null });
        roll.noteResults.get(0);`, context);
    assert.equal(result.status, 'optional');
    assert.equal(result.score, null);
});

test('well-sung alternatives build combos and reach great in all modes without changing melody credit', () => {
    for (const mode of ['beginner', 'intermediate', 'advanced']) {
        const { run } = fixture();
        run(`prepare(Array.from({ length: 4 }, (_, i) => ({ start: i, duration: 1, midi: 60 })), '${mode}');
            currentSong = { key: 'C', mode: 'major' };
            partyMode.sessionInfo = { singingMode: '${mode}' };
            for (let i = 0; i < 4; i++) {
                for (let sample = 0; sample <= 6; sample++) {
                    evaluateVoiceSample(midiToFrequency(62.2), i + sample * .1, 62.2);
                }
                finalizeNote(i);
                partyMode.handleNoteFinalized({ detail: buildKaraokeNoteEventDetail(noteStates[i]) });
            }`);
        assert.equal(run('currentCombo'), 4, mode);
        assert.equal(run('bestCombo'), 4, mode);
        assert.equal(run('noteStates[0].status'), 'partial', mode);
        assert.equal(run('noteStates[0].visualStatus'), 'alternative', mode);
        assert.equal(run('partyMode.performanceDiagnosis.state'), 'great', mode);
        assert.equal(run('partyMode.performanceDiagnosis.positiveRatio'), 1, mode);
        assert.equal(run('partyMode.sessionStats.alternative'), 4, mode);
        assert.equal(run('partyMode.performanceHistory[0].melodyScore'), run('noteStates[0].score'));
        assert.ok(run('partyMode.performanceHistory[0].score > noteStates[0].score'));
        assert.equal(run(`partyMode.classifyCheckpointCategory({
            cumulativeAverage: partyMode.sessionStats.scoreSum / 4,
            segmentAverage: partyMode.averageScores(partyMode.performanceHistory)
        })`), 'great');
        assert.equal(run('getGamifiedFeedback(noteStates[0]).type'), 'bom');
    }
});

test('poor alternatives, out-of-key notes and silence still break combos', () => {
    for (const sungMidi of [62.49, 61, null]) {
        const { run } = fixture();
        run(`prepare([{ start: 0, duration: 1, midi: 60 }]);
            currentSong = { key: 'C', mode: 'major' };
            currentCombo = 5;
            if (${sungMidi} !== null) {
                for (let sample = 0; sample <= 6; sample++) {
                    evaluateVoiceSample(midiToFrequency(${sungMidi}), sample * .1, ${sungMidi});
                }
            }
            finalizeNote(0);
            partyMode.handleNoteFinalized({ detail: buildKaraokeNoteEventDetail(noteStates[0]) });`);
        assert.equal(run('currentCombo'), 0);
        assert.equal(run('isPositivePerformance(noteStates[0])'), false);
        assert.equal(run('partyMode.performanceDiagnosis.positiveRatio'), 0);
    }
});

test('optional alternatives stay excluded and literal melody keeps the same performance score', () => {
    const { run } = fixture();
    run(`prepare([{ start: 0, duration: .1, midi: 60 }, { start: 1, duration: 1, midi: 60 }]);
        currentSong = { key: 'C', mode: 'major' }; currentCombo = 5;
        evaluateVoiceSample(midiToFrequency(62), .05, 62); finalizeNote(0);
        updateCombo(noteStates[0]);`);
    assert.equal(run('currentCombo'), 5);
    assert.equal(run('isPositivePerformance(noteStates[0])'), false);
    run(`for (let sample = 0; sample <= 6; sample++) {
        evaluateVoiceSample(midiToFrequency(60.2), 1 + sample * .1, 60.2);
    }
    finalizeNote(1);`);
    assert.equal(run('noteStates[1].performanceScore'), run('noteStates[1].score'));
});

test('yellow notes build combos only in karaoke, preserving their score and color', () => {
    for (const mode of ['beginner', 'intermediate', 'advanced']) {
        const { run } = fixture();
        run(`prepare([{ start: 0, duration: 1, midi: 60 }], '${mode}');
            currentCombo = 2;
            const difficulty = getCurrentDifficulty();
            const pitch = 60 + (difficulty.tuningTolerance + difficulty.tuningNear) / 200;
            for (let sample = 0; sample <= 6; sample++) {
                evaluateVoiceSample(midiToFrequency(pitch), sample * .1, pitch);
            }
            finalizeNote(0);`);
        assert.equal(run('noteStates[0].status'), 'partial', mode);
        assert.equal(run('noteStates[0].visualStatus'), 'partial', mode);
        assert.equal(run('noteStates[0].score'), 64, mode);
        assert.equal(run('noteStates[0].performanceScore'), 64, mode);
        assert.equal(run('currentCombo'), mode === 'beginner' ? 3 : 0, mode);
    }
});

test('yellow-only karaoke reaches good but not great; errors and optional notes remain excluded', () => {
    const { run } = fixture();
    run(`partyMode.sessionInfo = { singingMode: 'beginner' };
        for (let i = 0; i < 4; i++) partyMode.handleNoteFinalized({ detail: {
            noteIndex: i, status: 'partial', score: 75, performanceScore: 75
        } });`);
    assert.equal(run('partyMode.performanceDiagnosis.state'), 'good');
    assert.equal(run('partyMode.performanceDiagnosis.positiveRatio'), 1);
    assert.equal(run('partyMode.performanceDiagnosis.recentAverage'), 75);
    for (const status of ['error', 'missed', 'optional']) {
        assert.equal(run(`isPositivePerformance({ status: '${status}', score: 0 }, 'beginner')`), false);
    }
    assert.equal(run(`isPositivePerformance({ status: 'partial', optional: true, score: 75 }, 'beginner')`), false);
    for (const score of [55, 79]) {
        assert.equal(run(`isPositivePerformance({ status: 'partial', score: ${score} }, 'beginner')`), true);
        assert.equal(run(`isPositivePerformance({ status: 'partial', score: ${score} }, 'advanced')`), false);
    }
});
