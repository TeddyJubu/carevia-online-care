#!/bin/zsh
# usage: [OVERLAY=grad.png] film.sh <in.mp4> <out-dir> <name> "<grade filter>"
# Seamless loop (0.5s head-over-tail crossfade) + grade (+ optional baked overlay such as a grad-ND),
# then 1080p/720p H.264 and a WebP poster of the first frame.
set -e
in=$1; out=$2; name=$3; grade=${4:-null}
d=0.5
T=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
off=$(echo "$T - 2 * $d" | bc -l)
fg="[0:v]split[a][b];[a]trim=start=$d,setpts=PTS-STARTPTS[m];[b]trim=end=$d,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=$d:offset=$off,$grade"
extra=()
if [[ -n $OVERLAY ]]; then fg="${fg}[g];[g][1:v]overlay=format=auto"; extra=(-i "$OVERLAY"); fi
ffmpeg -v error -y -i "$in" $extra -filter_complex "${fg},format=yuv420p[v]" -map "[v]" -an -c:v libx264 -preset slow -crf 21 -tune film -profile:v high -movflags +faststart "$out/$name-1080.mp4"
ffmpeg -v error -y -i "$out/$name-1080.mp4" -vf scale=1280:720:flags=lanczos -an -c:v libx264 -preset slow -crf 24 -tune film -profile:v high -movflags +faststart "$out/$name-720.mp4"
ffmpeg -v error -y -i "$out/$name-1080.mp4" -frames:v 1 "$TMPDIR/$name-poster.png" && cwebp -quiet -q 80 "$TMPDIR/$name-poster.png" -o "$out/$name.webp"
ls -la "$out" | grep "$name"
