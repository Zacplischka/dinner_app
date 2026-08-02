#!/bin/zsh
# 1536x1024 (3:2) master -> centre-crop 4:3 -> 1200x900 WebP, per #313.
# Usage: imgpipe.sh <in.png> <out.webp>
set -e
cwebp -quiet -crop 84 0 1366 1024 -resize 1200 900 -q 82 "$1" -o "$2"
