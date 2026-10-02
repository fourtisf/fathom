# Noxsea launch ad (60s)

"Noxsea is live" plus a tour of the product, built on the real UI: the landing page, `/app` before and after
sign-in, and `/scan`, captured from the running app (DOM + real CSS) in four iframes and animated frame by
frame by `timeline.js`:

1. Hook: "Private AI. No logs. No KYC." / "Now live."
2. Landing tour: hero → AI tools → models (with logos).
3. Sign in with a wallet (signature request, no gas) → +25 free credits.
4. Private chat with "Not logged", then the burn timer set to 1 hour.
5. Compare mode: DeepSeek V4 Pro vs Kimi K3.
6. Token Scanner: a demo token with three red flags.
7. AI tools montage: images, Deep Research, screenshots, contract audit.
8. Claude Opus 5.5 in the model menu.
9. End card: "The AI that forgets you." · noxsea.xyz.

The token, contract and AI outputs are illustrative (the end card says "Illustrative outputs · Demo token and
contract"). The wallet popup is generic, not a real wallet's UI. `music.py` synthesizes the soundtrack.

To re-render:
1. Run the stack locally: web on 127.0.0.1:3300, API on 4200 (mock inference is fine).
2. `node capture.mjs .` captures `landing.html`, `scan.html`, `gate.html` and `app.html` (signs in with a
   throwaway test wallet; needs playwright + viem). Copy `sprite.html` and `frame.css` from `../features-ad`.
3. `python3 music.py && ./render-all.sh` (Playwright/Chromium, ffmpeg, numpy). Output: `noxsea-launch-ad-hd.mp4`.
