// miniprotracker :: A/B validation against a libopenmpt reference render
//
// usage: npm i @audio/decode-mod   (validation-only dependency)
//        node tools/validate.mjs <file.mod> [seconds]
//
// Renders <file.mod> with this library and with libopenmpt (WASM), aligns the
// two, and reports windowed correlation + relative RMS error. Reference and
// mine use the same recipe: 44100 Hz mono, zero-order hold (raw Amiga mixing).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ProTracker = require('../src/protracker.js');
const refMod = await import('@audio/decode-mod');
const refDecode = refMod.default || refMod.decode;

const file = process.argv[2];
const seconds = parseFloat(process.argv[3] || '32');
const bytes = new Uint8Array(fs.readFileSync(file));

const meta = await refMod.info(bytes);
console.log('module:', JSON.stringify(meta.title), '| type:', meta.typeLong,
  '| channels:', meta.channels, '| patterns:', meta.patterns,
  '| orders:', meta.orders, '| est duration:', meta.duration.toFixed(1) + 's');

const t0 = Date.now();
const ref = await refDecode(bytes, {
  sampleRate: 44100, channels: 1, interpolation: 1, stereoSeparation: 0,
  duration: seconds,
});
console.log(`reference: ${ref.channelData[0].length} samples (libopenmpt wasm)`);

const mod = ProTracker.parse(bytes);
const mine = ProTracker.render(mod, { sampleRate: 44100, loops: 100, maxSeconds: seconds });
console.log(`ours:      ${mine.pcm.length} samples (pure JS, ${Date.now() - t0}ms incl. reference)`);

// align via FFT cross-correlation
function xcorrLag(a, b) {
  const N = 2 ** Math.ceil(Math.log2(a.length + b.length));
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < a.length; i++) re[i] = a[i];
  // crude FFT is overkill; use direct scan over a small window instead
  let best = [0, -2];
  for (let lag = -1000; lag <= 1000; lag++) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i + 1000 < a.length; i += 7) {
      const bi = i + lag;
      if (bi < 0 || bi >= b.length) continue;
      dot += a[i] * b[bi]; na += a[i] * a[i]; nb += b[bi] * b[bi];
    }
    const c = dot / (Math.sqrt(na * nb) + 1e-12);
    if (c > best[1]) best = [lag, c];
  }
  return best;
}
const A = ref.channelData[0], B = mine.pcm;
const [lag, lagCorr] = xcorrLag(A, B);
console.log('best alignment lag:', lag, 'samples');

// windowed stats after alignment
let k = 0, dot = 0, nb = 0;
for (let i = 0; i < A.length; i++) { dot += A[i] * B[i]; nb += B[i] * B[i]; }
k = dot / (nb || 1);
const W = 2205;
const corrs = [];
let sse = 0, sst = 0;
const off = Math.max(0, -lag);
for (let i = 0; i + W < Math.min(A.length, B.length - off); i += W) {
  let d = 0, na = 0, nb2 = 0, ab = 0;
  for (let j = 0; j < W; j++) {
    const a = A[i + j], b = k * B[off + i + j];
    const e = a - b;
    sse += e * e; sst += a * a;
    d += a * b; na += a * a; nb2 += b * b;
  }
  corrs.push(d / (Math.sqrt(na * nb2) + 1e-12));
}
corrs.sort((x, y) => x - y);
const rel = Math.sqrt(sse / sst);
console.log('gain (ref/mine):', k.toFixed(3));
console.log('window correlation: median', corrs[corrs.length >> 1].toFixed(3),
  '| mean', (corrs.reduce((s, x) => s + x, 0) / corrs.length).toFixed(3),
  '| p10', corrs[Math.floor(corrs.length * 0.1)].toFixed(3));
console.log('relative RMS error:', (rel * 100).toFixed(1) + '%');
console.log(rel < 0.35 && corrs[corrs.length >> 1] > 0.9 ? 'PASS' : 'REVIEW');