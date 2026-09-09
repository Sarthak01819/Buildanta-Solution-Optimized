#!/bin/sh
# Rebuild what Yash actually looks at.
#
# The dev server is for editing; it hands the browser ~90 separate module
# files, which over a Cloudflare tunnel took 27 SECONDS to boot (the page
# looked broken because the app had not started yet). The built bundle boots
# in ~2.5s. So: every link Yash opens serves dist/, and dist/ must be rebuilt
# after every change he should see.
set -e
cd "$(dirname "$0")/.."
npm run build >/dev/null
pgrep -f "http.server 5295" >/dev/null || (nohup python3 -m http.server 5295 -d dist --bind 0.0.0.0 >/tmp/dist-serve.log 2>&1 &)
sleep 1
code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5295/)
[ "$code" = "200" ] || { echo "dist server not answering ($code)"; exit 1; }
echo "published: dist rebuilt and serving on :5295 (LAN :5280 + tunnel point here)"
