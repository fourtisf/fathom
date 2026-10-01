#!/bin/bash
set -e
cd "$(dirname "$0")"
node render2.mjs video p1.mp4 0 16 > r1.log 2>&1 &
node render2.mjs video p2.mp4 16 32 > r2.log 2>&1 &
node render2.mjs video p3.mp4 32 48 > r3.log 2>&1 &
wait
printf "file 'p1.mp4'\nfile 'p2.mp4'\nfile 'p3.mp4'\n" > parts.txt
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i parts.txt -c copy master.mp4
# X-ready HD: H.264 Main, 1080p30, AAC, faststart
ffmpeg -hide_banner -loglevel error -y -i master.mp4 -i music2.wav -map 0:v -map 1:a -vf fps=30 -c:v libx264 -profile:v main -level 4.0 -preset slow -crf 19 -maxrate 3.2M -bufsize 6.4M -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart noxsea-app-ad-hd.mp4
echo ALLDONE
