#!/bin/bash
set -e
cd "$(dirname "$0")"
TL=timeline4.js node render3.mjs video q1.mp4 0 14 > s1.log 2>&1 &
TL=timeline4.js node render3.mjs video q2.mp4 14 28 > s2.log 2>&1 &
TL=timeline4.js node render3.mjs video q3.mp4 28 41 > s3.log 2>&1 &
wait
printf "file 'q1.mp4'\nfile 'q2.mp4'\nfile 'q3.mp4'\n" > parts4.txt
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i parts4.txt -c copy master4.mp4
# X-ready HD: H.264 Main, 1080p30, AAC, faststart
ffmpeg -hide_banner -loglevel error -y -i master4.mp4 -i music4.wav -map 0:v -map 1:a -vf fps=30 -c:v libx264 -profile:v main -level 4.0 -preset slow -crf 19 -maxrate 3.2M -bufsize 6.4M -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart noxsea-scanner-ad-robinhood-hd.mp4
echo ALLDONE
