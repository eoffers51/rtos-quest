#!/usr/bin/env bash
# Capture screenshots of the game for visual review.
#   tools/shots.sh            game-level screens and lesson 1
#   tools/shots.sh 3 101      game-level screens and those lessons
# Writes PNG files to reviews/shots/. Uses headless Chromium and its own static server on port 8791.
set -u
cd "$(dirname "$0")/.."
OUT="reviews/shots"; mkdir -p "$OUT"
TMP="$HOME/snap/chromium/common/rq-shots"; mkdir -p "$TMP"   # snap Chromium can only write under its own data folder
PORT=8791
python3 tools/serve.py "$PORT" >/dev/null 2>&1 & SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1
shoot() { # name, url path, [width height]
  local f="$TMP/$1.png"; rm -f "$f"
  # Chromium writes the file within a few seconds but can linger; stop waiting as soon as the image is complete.
  timeout -k 3 40 chromium --headless=new --no-sandbox --hide-scrollbars --enable-unsafe-swiftshader --ignore-gpu-blocklist \
    --user-data-dir="$TMP/profile-$1" --window-size="${3:-1440},${4:-900}" --screenshot="$f" "http://localhost:$PORT/$2" >/dev/null 2>&1 &
  local pid=$! last=-1 size=0
  for _ in $(seq 1 70); do sleep 0.5; size=$(stat -c %s "$f" 2>/dev/null || echo 0); if [ "$size" -gt 0 ] && [ "$size" = "$last" ]; then break; fi; last=$size; done
  kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null; rm -rf "$TMP/profile-$1"
  if [ -s "$f" ]; then cp "$f" "$OUT/$1.png"; echo "ok   $OUT/$1.png"; else echo "FAIL $1"; fi
}
if [ "${1:-}" = "--one" ]; then shoot "$2" "$3" "${4:-}" "${5:-}"; exit 0; fi   # optional width and height
# five captures at a time
PIDS=()
q() { shoot "$@" & PIDS+=($!); if [ "${#PIDS[@]}" -ge 5 ]; then wait "${PIDS[@]}"; PIDS=(); fi; }
q game-title "?shot=title"
q game-journey "?shot=journey"
q game-phone "?shot=play#m1" 400 860
for id in "${@:-1}"; do
  q "lesson-$id-briefing" "?shot=play#m$id"   # first view: briefing dialogue over the editor and rover
  q "lesson-$id-fail" "?shot=fail#m$id"       # after flashing the starting code
  q "lesson-$id-solved" "?shot=solved#m$id"   # result screen for the reference solution
  for sec in 0 2 4; do q "lesson-$id-manual-$sec" "?shot=manual&sec=$sec#m$id"; done
done
[ "${#PIDS[@]}" -gt 0 ] && wait "${PIDS[@]}"
ls "$OUT" | wc -l | xargs echo "screenshots in $OUT:"
