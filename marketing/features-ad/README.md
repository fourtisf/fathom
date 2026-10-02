# Noxsea AI tools ad (48s)

Product ad built on the real UI: the signed-in `/app` (captured DOM + real CSS) in an iframe, animated frame by
frame by `timeline.js`:

1. Hook: "Your AI just learned new tricks." / "It still forgets you."
2. The AI tools strip lights up.
3. Create images: image mode, Landscape, a Noxsea banner prompt, diffusion-style reveal.
4. Deep Research: plan → 4 searches → 12 sources → cited report.
5. Reads screenshots: a chart pasted in, read by the vision model.
6. Contract audit: verified source → audit card → findings.
7. Voice (on-device transcription) and Claude Opus 5.5 in the model menu.
8. End card: "Private AI that does more." · noxsea.xyz/app.

The generated image, chart, answers and the TideVault contract are illustrative (the end card says
"Illustrative outputs · Demo contract"). `music.py` synthesizes the soundtrack, synced to the cuts.

To re-render:
1. Run the stack locally: web on 127.0.0.1:3300, API on 4200 (mock inference and `IMAGE_PROVIDER=mock` are fine).
2. `node capture.mjs .` captures `app.html` (signs in with a throwaway test wallet; needs playwright + viem).
   Extract the SVG sprite from `app.html` into `sprite.html`.
3. `python3 music.py && ./render-all.sh` (needs Playwright/Chromium, ffmpeg, numpy). Output:
   `noxsea-ai-tools-ad-hd.mp4` (1080p30 H.264 + AAC, X-ready).
