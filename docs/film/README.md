# The Spency film

A one-minute walkthrough of Spency, made entirely from the app itself: screenshots of the demo month, an original soundtrack and captions. No stock footage, no licensed music, no real account data.

- [`spency-film.mp4`](../spency-film.mp4): 1920×1080, 30 fps, H.264 + AAC, burned-in captions plus an optional English subtitle track.
- [`spency-film.srt`](../spency-film.srt): the captions on their own.

## How it's made

| Step | Script | What it does |
|---|---|---|
| 1 | [`capture.js`](capture.js) | Drives the demo build with Playwright at 2× and saves each screen, including the Inbox swipe frame by frame. |
| 2 | [`login.js`](login.js) | Captures the sign-in page (needs a build with Supabase settings; any placeholder project works). |
| 3 | [`music.py`](music.py) | Synthesizes the soundtrack with numpy: an A minor, F, C, G progression at 90 BPM with pads, a plucked arpeggio, soft bass and drums, and reverb. Original, so free to use under the project's MIT license. |
| 4 | [`render.py`](render.py) | Composes every frame with Pillow (device frames, headlines, captions, crossfades), pipes them to ffmpeg, and mixes in the soundtrack normalised to −16 LUFS. |

## Rebuild it

Needs Node with Playwright, Python 3 with numpy and Pillow, ffmpeg, and the Inter font.

```bash
npm run build && npx next start -p 3200      # demo build: no Supabase variables set
cd docs/film && mkdir -p shots
node capture.js                              # BASE=http://localhost:3200 by default
python3 music.py                             # writes soundtrack.wav
python3 render.py                            # writes spency-film.mp4 and spency-film.srt here
cp spency-film.mp4 spency-film.srt ..        # docs/ is where the README links
```

`python3 render.py stills` renders a dozen preview frames instead of the whole film.
