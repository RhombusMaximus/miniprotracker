// miniprotracker :: render a .mod to WAV via the library (Node CLI)
// usage: node tools/render.mjs <file.mod> <out.wav> [seconds] [gain]
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ProTracker = require('../src/protracker.js');

const mod = process.argv[2];
const out = process.argv[3] || 'out.wav';
const seconds = parseFloat(process.argv[4] || '32');
const gain = process.argv[5] !== undefined ? parseFloat(process.argv[5]) : 0.5;

const bytes = new Uint8Array(fs.readFileSync(mod));
const parsed = ProTracker.parse(bytes);
console.log('title:', JSON.stringify(parsed.title), '| channels:', parsed.channels,
  '| patterns:', parsed.patterns.length, '| orders:', parsed.songLength);

const t0 = Date.now();
const { pcm, sampleRate, duration } = ProTracker.render(parsed, {
  sampleRate: 44100, gain, loops: 100, maxSeconds: seconds,
});
console.log('rendered', pcm.length, 'samples =', duration.toFixed(2) + 's, in', (Date.now() - t0) + 'ms');

const buf16 = Buffer.alloc(pcm.length * 2);
for (let i = 0; i < pcm.length; i++) {
  const s = Math.max(-1, Math.min(1, pcm[i]));
  buf16.writeInt16LE((s * 32767) | 0, i * 2);
}
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + buf16.length, 4);
hdr.write('WAVE', 8); hdr.write('fmt ', 12);
hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20);
hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(sampleRate, 24);
hdr.writeUInt32LE(sampleRate * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34);
hdr.write('data', 36); hdr.writeUInt32LE(buf16.length, 40);
fs.writeFileSync(out, Buffer.concat([hdr, buf16]));
fs.writeFileSync(out.replace('.wav', '.f32'), Buffer.from(pcm.buffer, pcm.byteOffset, pcm.length * 4));
console.log('wrote', out, '+ raw f32');