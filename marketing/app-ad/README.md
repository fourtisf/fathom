# Noxsea app ad (48s)

Product ad built on the real app UI: `base.html` is the signed-in chat page captured from the running app
(real CSS, fonts and icons load from it), and `timeline.js` animates it frame by frame (camera, cursor,
typing, streaming answers, captions). `music2.py` synthesizes the soundtrack, synced to the cuts.

To re-render: run the web app on 127.0.0.1:3300 (`pnpm --filter web build && next start -p 3300`), then
`python3 music2.py && ./render-all2.sh` (needs Playwright/Chromium, ffmpeg, numpy).
