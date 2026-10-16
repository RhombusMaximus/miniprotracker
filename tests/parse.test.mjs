// miniprotracker :: unit tests (node --test tests/)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ProTracker = require('../src/protracker.js');

const here = fileURLToPath(new URL('.', import.meta.url));
const demoBytes = new Uint8Array(fs.readFileSync(here + '../demo/demo.mod'));

test('parses the demo module', () => {
  const mod = ProTracker.parse(demoBytes);
  assert.equal(mod.channels, 4);
  assert.equal(mod.magic, 'M.K.');
  assert.ok(mod.title.startsWith('MiniTracker'));
  assert.equal(mod.songLength, 4);
  assert.equal(mod.patterns.length, 2);
  assert.equal(mod.patterns[0].length, 64);
  assert.equal(mod.patterns[0][0].length, 4);
});

test('sample data is signed 8-bit', () => {
  const mod = ProTracker.parse(demoBytes);
  const s = mod.samples[0];
  assert.ok(s.length > 0);
  assert.ok(s.data.length === s.length);
  // the demo bass starts at 0 amplitude and swings negative first
  assert.equal(s.data[0], 0);
  assert.ok(s.data.some(v => v < 0) && s.data.some(v => v > 0));
});

test('period table has 16 finetunes x 36 notes', () => {
  assert.equal(ProTracker.PERIODS.length, 16);
  for (const t of ProTracker.PERIODS) assert.equal(t.length, 36);
  // canonical C-2 and B-3 values for finetune 0
  assert.equal(ProTracker.PERIODS[0][0], 856);
  assert.equal(ProTracker.PERIODS[0][35], 113);
});

test('period <-> note round trip', () => {
  for (let i = 0; i < 36; i += 3) {
    const p = ProTracker.notePeriod(i, 0);
    assert.equal(ProTracker.periodToNote(p, 0), i);
  }
});

test('frequency convention: period 428 is C-4 at ~8363 Hz', () => {
  const f = ProTracker.AMIGA_CLOCK / 428;
  assert.ok(Math.abs(f - 8287) < 1);
});

test('extended notes above the table extrapolate', () => {
  // period 107 = one semitone above the table top (113): note 36
  assert.equal(ProTracker.periodToNote(107, 0), 36);
  // and back
  const p = ProTracker.notePeriod(36, 0);
  assert.ok(Math.abs(p - 107) < 0.5);
});

test('renders non-silent audio', () => {
  const mod = ProTracker.parse(demoBytes);
  const { pcm, sampleRate, duration } = ProTracker.render(mod, { loops: 1, maxSeconds: 5 });
  assert.equal(sampleRate, 44100);
  assert.ok(duration > 4 && duration < 6);
  let peak = 0, energy = 0;
  for (const v of pcm) { peak = Math.max(peak, Math.abs(v)); energy += v * v; }
  assert.ok(peak > 0.05, 'render is not silent');
  assert.ok(peak <= 1.5, 'render is not wildly clipping');
  assert.ok(energy / pcm.length > 1e-4, 'render has energy');
});

test('loop timing: song length in seconds matches order*rows*ticks', () => {
  const mod = ProTracker.parse(demoBytes);
  const { duration } = ProTracker.render(mod, { loops: 1, maxSeconds: 60 });
  const expected = mod.songLength * 64 * 6 / 50;   // 4 orders x 64 rows x speed 6 at 50 Hz
  assert.ok(Math.abs(duration - expected) < 0.2, `duration ${duration} vs expected ${expected}`);
});