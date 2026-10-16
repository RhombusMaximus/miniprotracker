#!/usr/bin/env python3
"""miniprotracker :: generate an original 4-channel ProTracker demo module.

Writes demo/demo.mod — a small original tune (MIT, part of this repo) so the
player ships with something legally clean to play. 2 patterns + 4 orders,
walking bass, snare, a sustained lead, and a 2xx portamento slide.
"""
import struct

def cell(sample, period, fx_cmd=0, fx_arg=0):
    assert 0 <= sample <= 31 and 0 <= period <= 0x0FFF and fx_cmd <= 0xF
    b0 = ((sample & 0xF0) << 4) | ((period >> 8) & 0x0F)
    b1 = period & 0xFF
    b2 = ((sample & 0x0F) << 4) | fx_cmd
    b3 = fx_arg
    return struct.pack('BBBB', b0, b1, b2, b3)

# note periods (finetune 0):  C-3=214 D#3=202 F-3=180 G-3=160 A-3=151 C-4=107
C3, Ds3, F3, G3, A3, C4 = 214, 202, 180, 160, 151, 107
BASS = [C3, F3, G3, C3, F3, A3, G3, F3]

# --- synthesize original 8-bit samples ---
import math
def s8(x):
    v = int(x)
    v = max(-128, min(127, v))
    return v & 0xFF   # stored as unsigned byte; MOD sample data is signed

def make_bass():
    # one cycle of a buzzy bass at ~C-3 when played at period 214
    n = 64  # bytes per cycle -> 8287/64 = 130Hz fundamental... use 128 for ~65Hz
    n = 128
    return bytes(s8(100 * math.sin(2 * math.pi * i / n) + 20 * math.sin(6 * math.pi * i / n))
                 for i in range(n)) * 8   # 8 cycles, loopable

def make_snare():
    import random
    random.seed(7)
    return bytes(s8(90 * math.exp(-i / 300) * (1 if (i // 2) % 2 == 0 else -1) + random.uniform(-25, 25))
                 for i in range(1500))

def make_lead():
    n = 32
    return bytes(s8(70 * math.sin(2 * math.pi * i / n) + 35 * math.sin(4 * math.pi * i / n))
                 for i in range(n)) * 16

def make_klax():
    return bytes(s8(80 * math.sin(2 * math.pi * (i * i / 4000))) for i in range(2000))

samples = [
    ('minibass', make_bass()),   # 1
    ('minisnare', make_snare()), # 2
    ('minilead', make_lead()),   # 3
    ('miniklax', make_klax()),   # 4
]

out = bytearray()
out += b'MiniTracker demo!'.ljust(20, b'\0')
for name, data in samples:
    out += name.encode().ljust(22, b'\0')
    out += struct.pack('>H', len(data) // 2)
    out += bytes([0, 64])                 # finetune 0, volume 64
    out += struct.pack('>H', 0)           # repeat offset
    out += struct.pack('>H', (len(data) // 2) if name == 'minibass' or name == 'minilead' else 0)
for i in range(31 - len(samples)):
    out += b'\0' * 30

orders = [0, 0, 1, 1]
out += bytes([len(orders), 0])            # song length, restart
out += bytes(orders) + bytes(128 - len(orders))
out += b'M.K.'

def pattern(bassline, lead_notes, slide_row=-1):
    rows = [[cell(0, 0, 0, 0)] * 4 for _ in range(64)]
    for i, p in enumerate(bassline):
        rows[i * 2][0] = cell(1, p)
        rows[i * 2 + 1][0] = cell(0, 0)
    for i in range(0, 64, 2):
        # drums need a note period to trigger (PT: instrument without note is silent)
        rows[i][1] = cell(2, 214) if (i // 2) % 2 == 0 else cell(0, 0)
    for i, (p, arp) in enumerate(lead_notes):
        rows[i][2] = cell(3, p, 0, arp) if arp else cell(3, p)
    for i in range(0, 64, 4):
        rows[i][3] = cell(4, 214) if (i // 4) % 2 == 0 else cell(0, 0)
    if slide_row >= 0:
        rows[slide_row][3] = cell(0, 0, 2, 8)
    return rows

lead0 = [(C4, 0), (0, 0), (A3, 0), (0, 0), (G3, 0), (0, 0), (F3, 0), (0, 0)] * 8
lead1 = [(C4, 0), (0, 0), (A3, 0), (0, 0), (G3, 0), (0, 0), (F3, 0), (0, 0)] * 8

for rows in (pattern(BASS, lead0), pattern(BASS, lead1, slide_row=48)):
    for row in rows:
        for c in row:
            out += c

for name, data in samples:
    out += data

import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'demo/demo.mod'
open(path, 'wb').write(bytes(out))
print('wrote', path, len(out), 'bytes')