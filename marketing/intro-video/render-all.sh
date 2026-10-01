#!/bin/bash
set -e
# Needs node + playwright (Chromium), ffmpeg, python3 + numpy. Run: python3 music.py && ./render-all.sh
cd "$(dirname "$0")"
# split 0-44s into 3 chunks on exact frame boundaries (60fps)
node render.mjs part1.mp4 60 0 14.8 > r1.log 2>&1 &
node render.mjs part2.mp4 60 14.8 29.6 > r2.log 2>&1 &
node render.mjs part3.mp4 60 29.6 44 > r3.log 2>&1 &
wait
printf "file 'part1.mp4'\nfile 'part2.mp4'\nfile 'part3.mp4'\n" > parts.txt
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i parts.txt -c copy silent.mp4
ffmpeg -hide_banner -loglevel error -y -i silent.mp4 -i music.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart noxsea-intro.mp4
echo ALLDONE
