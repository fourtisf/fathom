# Noxsea Token Scanner ads

Product ad built on the real UI: the public Token Scanner (`/scan`) and the signed-in chat (`/app`), captured from
the running app and shown in two iframes with their real CSS. `timeline3.js` animates both frame by frame (hook
text, camera, cursor, paste, scan, risk card, whip pan into the app, streaming answer, end card). `music3.py`
synthesizes the soundtrack, synced to the cuts. The token, address and numbers are made-up demo data.

To re-render:
1. Run the stack locally: web on 127.0.0.1:3300, API on 4200 (mock inference is fine).
2. `node capture3.mjs .` captures `scan.html` and `app.html` (signs in with a throwaway test wallet; needs
   playwright + viem). Extract the SVG sprite from `app.html` into `sprite.html`.
3. `python3 music3.py && ./render-all3.sh` (needs Playwright/Chromium, ffmpeg, numpy).

## v2: Robinhood Chain (41s)

`timeline4.js` + `music4.py` + `render-all4.sh` (`TL=timeline4.js` selects the timeline in `render3.mjs`).
Scans three large-cap demo tokens on Robinhood Chain (clean results), then a fresh one with three red flags,
asks Noxsea AI about it, and ends on "Know the difference in seconds." The tokens (Tidal, Lumen, Northstar,
Moon Hood Inu), their logos, addresses and numbers are fictional, and the end card says "Demo tokens shown".
