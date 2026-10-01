# Noxsea Token Scanner ad (36s)

Product ad built on the real UI: the public Token Scanner (`/scan`) and the signed-in chat (`/app`), captured from
the running app and shown in two iframes with their real CSS. `timeline3.js` animates both frame by frame (hook
text, camera, cursor, paste, scan, risk card, whip pan into the app, streaming answer, end card). `music3.py`
synthesizes the soundtrack, synced to the cuts. The token, address and numbers are made-up demo data.

To re-render:
1. Run the stack locally: web on 127.0.0.1:3300, API on 4200 (mock inference is fine).
2. `node capture3.mjs .` captures `scan.html` and `app.html` (signs in with a throwaway test wallet; needs
   playwright + viem). Extract the SVG sprite from `app.html` into `sprite.html`.
3. `python3 music3.py && ./render-all3.sh` (needs Playwright/Chromium, ffmpeg, numpy).
