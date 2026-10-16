# miniprotracker

A minimal ProTracker (.mod) player in pure JavaScript. No dependencies, no
WASM, no build step — one file parses and renders 4/6/8-channel Amiga
modules to PCM, in Node or in a page.

```js
const ProTracker = require('./src/protracker.js');
const mod = ProTracker.parse(bytes);
const { pcm, sampleRate, duration } = ProTracker.render(mod, { loops: 1 });
```

## Why

The Ur-Quan Masters' melee theme (`battle.mod`, "Attack!" by Dan Nicholson)
needed a player small enough to embed in a no-dependency canvas game. The
library renders that module with **0.992 median window correlation** against
a libopenmpt reference (see Validation). It is also the soundtrack player for
[Gravity Melee](https://rhombusmaximus.github.io/gravity-melee/).

## What's in the box

- `src/protracker.js` — the whole library (~18KB): parser, PT2.3A effects
  engine, mixer, offline `render()`
- `demo/index.html` — drop-a-mod browser player
- `tools/render.mjs` — mod → WAV from the command line
- `tools/validate.mjs` — A/B harness against libopenmpt (WASM)
- `tools/make_demo_mod.py` — regenerates the original MIT demo module
- `tests/` — `node --test`

## API

### `ProTracker.parse(bytes)` → module object
Accepts a `Uint8Array` of a ProTracker module (magic `M.K.`, `M!K!`, `FLT4`,
`4CHN`, `FEST`, `6CHN`, `8CHN`, `FLT8`, `OCTA`, `CD81`). Returns title,
channels, samples (with decoded `Float32Array` data), orders, and patterns
(64 rows of per-channel cells: `{sample, period, effect}`).

### `ProTracker.render(module, opts)` → `{pcm, sampleRate, duration}`
Renders offline to mono PCM. Options: `sampleRate` (44100), `gain` (0.25),
`loops` (how many song wraps), `maxSeconds` (hard cap). Render a loop's worth
once and loop it in your audio API — that's the intended use.

### Extras
`Engine` (tick-level state machine), `PERIODS` (the 16-finetune V2.1A table),
`notePeriod`/`periodToNote` (with extended octaves above the table),
`AMIGA_CLOCK` (PAL 3546895; freq = clock/period, so period 428 = C-4 ≈ 8363 Hz).

## Effects coverage

Implemented with ProTracker 2.3A semantics: arpeggio (with the classic
36-note wraparound for in-table notes), portamento up/down (with argument
memory), tone portamento, vibrato, tremolo, combined slides (5xy/6xy),
sample offset, volume slide, volume set, position jump, pattern break,
pattern loop, fine portamentos, fine volume slides, retrigger, note cut,
note delay, and speed/tempo (Fxx). Channel panning is ignored in the mono mix.

**Honest caveats:** arpeggio matches ProTracker's documented behavior and its
pitch behavior was probe-verified against libopenmpt, but this library does
not reproduce libopenmpt's Amiga-look-up-table arpeggio emulation
byte-for-byte, so arp-heavy modules will not sample-match exactly.
Note-delay and pattern-delay are approximations. Verified formats: the
shipped `demo.mod` and the real-world `battle.mod` (see below).

## Validation

`tools/validate.mjs` renders a module with this library and with libopenmpt
(WASM via `@audio/decode-mod`), aligns the two, and reports windowed
correlation. Reference recipe: 44100 Hz mono, zero-order hold.

| Module | Median window corr | Mean | Verdict |
|---|---|---|---|
| `battle.mod` (SC2 melee theme, 4ch, one-shot samples) | **0.992** | 0.979 | PASS |
| `demo.mod` (original groove, looping samples) | 0.927 | 0.882 | solid |

Residual error vs libopenmpt is dominated by its volume ramping/click
suppression and its Amiga mixer quirks; this library mixes raw like a real
Amiga. Reproduce with:

```bash
npm install
node tools/validate.mjs demo/demo.mod 12
```

## License

MIT. The embedded period table is the ProTracker V2.1A play-routine table
(Amiga hardware values). `demo.mod` is original content in this repo (MIT).