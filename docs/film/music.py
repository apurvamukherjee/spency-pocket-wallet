"""Original soundtrack for the Spency film: calm ambient pop, A minor, 90 BPM, ~62 s. Synthesized from scratch."""
import wave
import numpy as np

SR = 44100
DUR = 62.0
BPM = 90
BEAT = 60 / BPM
BAR = 4 * BEAT
N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)

def hz(midi): return 440.0 * 2 ** ((midi - 69) / 12)

# Am – F – C – G, two bars each (MIDI chord tones around middle C).
PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ROOT = [45, 41, 48, 43]
def chord_at(t):
    i = int(t // (2 * BAR)) % 4
    return PROG[i], ROOT[i]

def env_adsr(n, a, d, s, r):
    e = np.ones(n) * s
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = min(na, n); e[:na] = np.linspace(0, 1, na, endpoint=False)
    nd = min(nd, n - na); e[na:na + nd] = np.linspace(1, s, nd, endpoint=False)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e

def add(sig, start, gl, gr):
    i = int(start * SR); j = min(N, i + len(sig))
    if i >= N: return
    L[i:j] += sig[: j - i] * gl; R[i:j] += sig[: j - i] * gr


# Pads: each chord held two bars, detuned saws softened, slow attack.
t2 = np.arange(int(2 * BAR * SR + 1.5 * SR)) / SR
for k, start in enumerate(np.arange(0, DUR - 2, 2 * BAR)):
    notes, _ = chord_at(start + 0.01)
    sig = np.zeros_like(t2)
    for m in notes + [notes[0] + 12]:
        for det in (-0.08, 0.0, 0.07):
            f = hz(m) * 2 ** (det / 12)
            ph = rng.random()
            saw = 2 * ((f * t2 + ph) % 1) - 1
            sig += 0.6 * np.sin(2 * np.pi * f * t2 + ph) + 0.12 * saw
    sig /= 18
    sig *= env_adsr(len(t2), 1.2, 0.5, 0.85, 1.4)
    add(sig, start, 0.9, 0.75 if k % 2 else 0.95)

# Pluck arpeggio from bar 2: 8th notes over chord tones, up an octave, with soft decay.
pat = [0, 1, 2, 1, 3, 2, 1, 2]
nd = int(0.9 * SR); tp = np.arange(nd) / SR
start_arp, end_arp = 1 * BAR, DUR - 3 * BAR
t = start_arp; step = 0
while t < end_arp:
    notes, _ = chord_at(t)
    tones = notes + [notes[0] + 12]
    m = tones[pat[step % 8]] + 12
    f = hz(m)
    sig = (np.sin(2 * np.pi * f * tp) + 0.35 * np.sin(2 * np.pi * 2 * f * tp) + 0.1 * np.sin(2 * np.pi * 3 * f * tp))
    sig *= np.exp(-tp * 5.5) * (1 - np.exp(-tp * 400)) * 0.11
    pan = 0.5 + 0.35 * np.sin(step * 0.7)
    add(sig, t, 1 - pan * 0.6, 0.4 + pan * 0.6)
    t += BEAT / 2; step += 1

# Bass from bar 4: root on beats 1 and 3.
nb = int(1.3 * SR); tb = np.arange(nb) / SR
t = 3 * BAR
while t < DUR - 2 * BAR:
    _, root = chord_at(t)
    f = hz(root - 12)
    sig = (np.sin(2 * np.pi * f * tb) + 0.25 * np.sin(2 * np.pi * 2 * f * tb)) * env_adsr(nb, 0.02, 0.4, 0.5, 0.5) * 0.22
    add(sig, t, 1, 1)
    t += 2 * BEAT

# Soft kick (bars 7–20) and shaker on off-beats (bars 11–20).
nk = int(0.35 * SR); tk = np.arange(nk) / SR
kick = np.sin(2 * np.pi * (48 * tk + 90 * (1 - np.exp(-tk * 30)) / 30)) * np.exp(-tk * 9) * 0.5
ns = int(0.08 * SR)
for b in range(int(DUR / BEAT)):
    tb0 = b * BEAT
    bar = tb0 / BAR
    if 6 <= bar < 20:
        add(kick, tb0, 1, 1)
    if 10 <= bar < 20:
        sh = rng.standard_normal(ns) * np.exp(-np.arange(ns) / SR * 60) * 0.05
        sh = np.diff(np.concatenate([[0], sh]))  # brighten
        add(sh, tb0 + BEAT / 2, 0.8, 1.0)

# Final chord: a long F → C resolution swell over the end card.
tf = np.arange(int(6 * SR)) / SR
sig = np.zeros_like(tf)
for m in [48, 52, 55, 60, 64, 67]:
    sig += np.sin(2 * np.pi * hz(m) * tf + rng.random())
sig *= env_adsr(len(tf), 1.5, 1.0, 0.8, 3.0) / 14
add(sig, DUR - 7.0, 0.95, 0.95)

# Reverb: convolve with a decaying stereo noise tail (FFT).
def reverb(x, seed, secs=2.6, mix=0.28):
    ir_n = int(secs * SR)
    r = np.random.default_rng(seed).standard_normal(ir_n) * np.exp(-np.arange(ir_n) / SR * 3.2)
    r[: int(0.02 * SR)] = 0
    size = 1 << int(np.ceil(np.log2(len(x) + ir_n)))
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(r, size), size)[: len(x)]
    wet /= np.max(np.abs(wet)) + 1e-9
    return x * (1 - mix) + wet * mix * np.max(np.abs(x))

L = reverb(L, 1); R = reverb(R, 2)
mix = np.stack([L, R], axis=1)
fade_in = int(1.5 * SR); fade_out = int(3.5 * SR)
mix[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
mix[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None] ** 1.5
mix = np.tanh(mix / (np.max(np.abs(mix)) + 1e-9) * 1.3)
mix *= 0.89 / np.max(np.abs(mix))
pcm = (mix * 32767).astype(np.int16)
with wave.open("soundtrack.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("ok", pcm.shape[0] / SR, "s")
