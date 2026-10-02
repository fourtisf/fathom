"""Synthesize an original ambient/tech soundtrack for the Noxsea launch ad (no samples, no licensing)."""
import numpy as np
import wave

SR = 48000
DUR = 60.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)

def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)

def env_ad(n, a, d):
    """attack/decay envelope over n samples, a/d in seconds."""
    x = np.arange(n) / SR
    e = np.minimum(1, x / max(a, 1e-4)) * np.exp(-np.maximum(0, x - a) / d)
    return e

def add(buf, start_s, sig):
    i = int(start_s * SR)
    if i >= N:
        return
    j = min(N, i + sig.shape[1])
    buf[:, i:j] += sig[:, : j - i]

def pan(sig, p):  # p -1..1
    l = np.cos((p + 1) * np.pi / 4)
    r = np.sin((p + 1) * np.pi / 4)
    return np.vstack([sig * l, sig * r])

def fft_filter(x, lo=None, hi=None, sr=SR):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / sr)
    h = np.ones_like(f)
    if hi:
        h *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if lo:
        h *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** 4)
    return np.fft.irfft(X * h, len(x))

# ---------------- chords ----------------
CH = [  # (bass root, pad notes)
    (38, [50, 53, 57, 60, 64]),  # Dm9
    (34, [46, 50, 53, 57, 60]),  # Bbmaj9
    (41, [45, 53, 57, 60, 64]),  # Fmaj7/A
    (36, [48, 55, 62, 64, 67]),  # Csus2 add
]
SEG = 4.8
pad = np.zeros((2, N))
shimmer = np.zeros((2, N))
bass = np.zeros((2, N))
k = 0
s = 0.0
while s < DUR:
    root, notes = CH[k % 4]
    L = SEG + 2.0
    n = int(L * SR)
    x = np.arange(n) / SR
    e = np.minimum(1, x / 1.4) * np.clip((L - x) / 2.0, 0, 1)
    voice = np.zeros((2, n))
    for ni, m in enumerate(notes):
        f0 = mtof(m)
        for side, det in ((0, -5), (1, 5)):
            sig = np.zeros(n)
            for d in (det, -det * .6, 0):
                f = f0 * 2 ** (d / 1200)
                ph = rng.uniform(0, 2 * np.pi)
                for h in range(1, 7):
                    amp = (1 / h) * np.exp(-h * f / 1600)
                    sig += amp * np.sin(2 * np.pi * f * h * x + ph * h)
            # slow tremolo for movement
            sig *= 1 + .12 * np.sin(2 * np.pi * (.15 + ni * .03) * x + ni)
            voice[side] += sig
    pad_seg = voice * e * .035
    add(pad, s, pad_seg)
    # shimmer: soft high octaves, slowly breathing, for air on top
    sh = np.zeros((2, n))
    for ni, m in enumerate(notes[1:]):
        f = mtof(m + 24)
        for side in (0, 1):
            sh[side] += np.sin(2 * np.pi * f * (1 + (side - .5) * .002) * x + ni) * (.5 + .5 * np.sin(2 * np.pi * (.21 + ni * .05) * x + ni * 1.7 + side))
    add(shimmer, s, sh * e * .006)
    # sub bass
    fb = mtof(root)
    bsig = (np.sin(2 * np.pi * fb * x) + .25 * np.sin(2 * np.pi * 2 * fb * x)) * e * .09
    add(bass, s, np.vstack([bsig, bsig]))
    s += SEG
    k += 1

# ---------------- arp (features section) ----------------
arp = np.zeros((2, N))
BEAT = 0.6  # 100 bpm
step = BEAT / 2
A0, A1 = 5.2, 54.4
i = 0
tt = A0
while tt < A1:
    ci = int(tt // SEG) % 4
    tones = sorted(CH[ci][1])
    seq = [tones[0] + 12, tones[2] + 12, tones[3] + 12, tones[4] + 12, tones[3] + 12, tones[2] + 12, tones[1] + 12, tones[2] + 24]
    m = seq[i % len(seq)]
    f = mtof(m)
    n = int(1.2 * SR)
    x = np.arange(n) / SR
    sig = (np.sin(2 * np.pi * f * x) + .3 * np.sin(2 * np.pi * 2 * f * x) + .08 * np.sin(2 * np.pi * 3 * f * x)) * env_ad(n, .004, .22)
    # fade the arp in over its first bars and out before the end card
    g = min(1, (tt - A0) / 4.0) * min(1, (A1 - tt) / 1.5)
    acc = 1.0 if i % 2 == 0 else .7
    add(arp, tt, pan(sig * .15 * g * acc, -.45 if i % 2 else .45))
    tt += step
    i += 1

# ---------------- drums ----------------
drums = np.zeros((2, N))
def kick():
    n = int(.6 * SR)
    x = np.arange(n) / SR
    f = 45 + 85 * np.exp(-x * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-x * 7) * .55
def hat():
    n = int(.12 * SR)
    x = np.arange(n) / SR
    nz = np.diff(rng.standard_normal(n + 1))
    return nz * np.exp(-x * 55) * .03
K, H = kick(), hat()
D0, D1 = 5.2, 54.2
b = 0
tt = D0
while tt < D1:
    g = min(1, (tt - D0) / 2.4)
    if b % 2 == 0:
        add(drums, tt, np.vstack([K, K]) * g)
    add(drums, tt + BEAT / 2, pan(H * g, .3))
    tt += BEAT
    b += 1

# ---------------- fx: risers, booms, whooshes ----------------
fx = np.zeros((2, N))
def boom(amp=1.0):
    n = int(3.5 * SR)
    x = np.arange(n) / SR
    f = 32 + 40 * np.exp(-x * 6)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-x * 1.4)
    nz = fft_filter(rng.standard_normal(n), hi=600) * np.exp(-x * 9) * .5
    sig = (body + nz) * .6 * amp
    return np.vstack([sig, sig])
def riser(L):
    n = int(L * SR)
    x = np.arange(n) / SR
    nz = rng.standard_normal(n)
    # sweep: blend lowpassed -> highpassed noise
    lo = fft_filter(nz, hi=900)
    hi = fft_filter(nz, lo=2500, hi=9000)
    w = (x / L) ** 2
    sig = (lo * (1 - w) + hi * w) * (x / L) ** 2.2 * .18
    tone = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (2 * x / L)) / SR) * (x / L) ** 3 * .03
    return pan(sig + tone, 0)
def whoosh(L=.9):
    n = int(L * SR)
    x = np.arange(n) / SR
    nz = fft_filter(rng.standard_normal(n), lo=400, hi=4000)
    e = np.sin(np.pi * x / L) ** 2
    sig = nz * e * .07
    return np.vstack([sig * np.linspace(1, .4, n), sig * np.linspace(.4, 1, n)])
def chime(m, amp=.08):
    n = int(3 * SR)
    x = np.arange(n) / SR
    f = mtof(m)
    sig = (np.sin(2 * np.pi * f * x) + .4 * np.sin(2 * np.pi * 2.01 * f * x) + .15 * np.sin(2 * np.pi * 3.98 * f * x)) * env_ad(n, .003, .9) * amp
    return np.vstack([sig, sig])

add(fx, 0.4, chime(74, .05))              # "Private AI. No logs. No KYC."
add(fx, 1.3, riser(1.4))
add(fx, 2.72, boom(.8))                   # "Now live."
add(fx, 2.75, chime(81, .05))
add(fx, 2.95, chime(86, .035))
add(fx, 3.75, riser(1.3))
add(fx, 5.05, boom(.85))                  # landing lands
add(fx, 5.1, chime(79, .05))
add(fx, 7.4, whoosh(1.0) * .7)            # scroll to tools
add(fx, 9.2, whoosh(1.0) * .7)            # scroll to models
for cut in (11.4, 29.8, 36.8):            # camera whips between pages
    add(fx, cut - .45, whoosh(1.2) * 1.3)
    add(fx, cut + .1, boom(.3))
for cut in (16.6, 23.6, 40.6, 44.6, 48.0, 51.4):   # same-page scene changes
    add(fx, cut - .35, whoosh(.8) * .9)
for click in (12.55, 13.8, 18.1, 22.25, 24.2, 25.5, 31.45, 51.95, 53.35):
    add(fx, click, chime(93, .018))       # UI ticks
add(fx, 12.75, chime(84, .025))           # wallet popup
add(fx, 14.3, boom(.4))                   # signed in
add(fx, 14.9, chime(88, .04))             # +25 credits
add(fx, 15.05, chime(93, .035))
add(fx, 15.2, chime(100, .02))
add(fx, 22.3, chime(70, .03))             # burn timer set
add(fx, 30.35, whoosh(.6) * .6)           # token pasted
add(fx, 32.05, boom(.6))                  # red flags
add(fx, 32.08, chime(70, .04))
for j in range(3):
    add(fx, 33.7 + j * .25, chime(82 - j, .02))
add(fx, 37.3, boom(.45))                  # image arrives
add(fx, 37.35, chime(86, .04))
add(fx, 37.55, chime(93, .03))
for i in range(4):
    add(fx, 41.25 + i * .19, chime(81 + i * 2, .016))   # research queries
add(fx, 49.0, chime(84, .03))             # audit card
add(fx, 53.4, chime(86, .035))            # Opus picked
add(fx, 53.52, chime(93, .028))
add(fx, 53.4, riser(1.7))                 # build to the end card
add(fx, 55.15, boom(.95))
add(fx, 55.2, chime(74, .06))
add(fx, 55.5, chime(81, .045))
for i in range(8):
    add(fx, 55.8 + i * .1, chime(84 + i * 2, .016))

# ---------------- reverb ----------------
def reverb(x, secs=3.2, decay=.75):
    n = int(secs * SR)
    tt_ = np.arange(n) / SR
    out = np.zeros_like(x)
    for c in range(2):
        ir = rng.standard_normal(n) * np.exp(-tt_ / decay)
        ir = fft_filter(ir, hi=6000)
        ir /= np.sqrt(np.sum(ir ** 2))
        L = x.shape[1] + n
        nfft = 1 << (L - 1).bit_length()
        out[c] = np.fft.irfft(np.fft.rfft(x[c], nfft) * np.fft.rfft(ir, nfft), nfft)[: x.shape[1]]
    return out

wet_src = pad * .8 + arp + fx * .5 + shimmer * 2
mix = pad + shimmer + bass + arp + drums + fx + reverb(wet_src) * .45

# gentle intro/outro
fade = np.ones(N)
fi = int(1.0 * SR)
fade[:fi] = np.linspace(0, 1, fi) ** 1.5
fo0 = int(58.3 * SR)
fade[fo0:] = np.linspace(1, 0, N - fo0) ** 1.3
mix *= fade

# master: soft clip + normalize to -1 dBFS peak, keep RMS sane
pre = np.max(np.abs(mix))
print(f'pre-clip peak {pre:.2f}')
mix = mix / pre * 1.1
mix = np.tanh(mix) / np.tanh(1.1)
peak = np.max(np.abs(mix))
mix *= (10 ** (-1 / 20)) / peak
rms = np.sqrt(np.mean(mix ** 2))
print(f"peak -1.0 dBFS, rms {20 * np.log10(rms):.1f} dBFS")

pcm = (np.clip(mix, -1, 1) * 32767).astype('<i2').T.copy()
with wave.open('music.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
