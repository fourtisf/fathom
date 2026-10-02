#!/bin/bash
# Premium v2: deterministic renderer (render-bf.mjs), timeline2.js + overlay2.css, music2.wav.
set -e
cd "$(dirname "$0")"
export TL=timeline2.js OV=overlay2.css SETTLE=1
# Chunks split at dips/dissolves, so the camera smoothing restarting at a seam doesn't show.
node render-bf.mjs video q1.mp4 0 16.6 > b1.log 2>&1 &
node render-bf.mjs video q2.mp4 16.6 29.8 > b2.log 2>&1 &
node render-bf.mjs video q3.mp4 29.8 44.6 > b3.log 2>&1 &
node render-bf.mjs video q4.mp4 44.6 60 > b4.log 2>&1 &
wait
printf "file 'q1.mp4'\nfile 'q2.mp4'\nfile 'q3.mp4'\nfile 'q4.mp4'\n" > parts2.txt
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i parts2.txt -c copy master2.mp4
# X-ready HD: H.264 Main, 1080p30, AAC, faststart (a little more bitrate for the film grain)
ffmpeg -hide_banner -loglevel error -y -i master2.mp4 -i music2.wav -map 0:v -map 1:a -vf fps=30 -c:v libx264 -profile:v main -level 4.0 -preset slow -crf 18 -maxrate 4.5M -bufsize 9M -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart noxsea-launch-ad-premium.mp4
echo ALLDONE
