#!/usr/bin/env bash
# Check every theory diagram for text that is cut off, overlapping, or wider than its box.
#   tools/diagrams.sh        all stages
#   tools/diagrams.sh 5      one stage
# Needs headless Chromium (text can only be measured in a browser). Exit code 0 = no problems.
set -u
cd "$(dirname "$0")/.."
TMP="$HOME/snap/chromium/common/rq-diagrams-$$"; mkdir -p "$TMP"   # own folder and port, so several checks can run at once
PORT=$((8800 + RANDOM % 900))
python3 tools/serve.py "$PORT" >/dev/null 2>&1 & SRV=$!
trap 'kill $SRV 2>/dev/null; rm -rf "$TMP"' EXIT
sleep 1
OUT=$(timeout -k 3 60 chromium --headless=new --no-sandbox --enable-unsafe-swiftshader --user-data-dir="$TMP/profile" --window-size=1200,900 \
  --virtual-time-budget=15000 --dump-dom "http://localhost:$PORT/tools/diagram-audit.html${1:+?only=$1}" 2>/dev/null \
  | python3 -c 'import sys,re,html; m=re.search(r"<pre id=\"out\">(.*?)</pre>", sys.stdin.read(), re.S); print(html.unescape(m.group(1)) if m else "DIAGRAMS: audit page did not load")')
echo "$OUT"
echo "$OUT" | grep -q "DIAGRAMS: 0 problem" 
