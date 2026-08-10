#!/bin/sh
# Publish the current build to the PERMANENT preview URL.
#
#   https://buildanta-site.pages.dev
#
# Replaces the trycloudflare quick tunnel, which cost us three dead links in a
# day: a quick tunnel is ephemeral, dies with its process, and mints a NEW
# random URL on restart — so it did not merely go down, it silently
# invalidated whatever link Yash was holding. This URL never changes and does
# not care whether the Mac is on.
#
# Measured gain, same file, same build:
#   python http.server (old)   537 KB, uncompressed, from one Mac in Kanpur
#   Cloudflare Pages (now)     138 KB brotli, HTTP/2, from the Indian edge
#   repeat visits              assets are immutable-cached, so ~0 KB
#
# Deploys ONLY when asked, by Yash's choice — nothing reaches the link by
# accident while we are still changing things hourly.
#
#   sh tools/deploy-preview.sh
set -e
cd "$(dirname "$0")/.."
OUT="${TMPDIR:-/tmp}/buildanta-pages"

npm run build >/dev/null
rm -rf "$OUT" && mkdir -p "$OUT"
cp -R dist/. "$OUT"/

# Private preview: asked to stay out of search, and TOLD to, for the crawlers
# that ignore robots.txt.
cat > "$OUT/robots.txt" <<'TXT'
User-agent: *
Disallow: /
TXT
cat > "$OUT/_headers" <<'TXT'
/*
  X-Robots-Tag: noindex, nofollow
/assets/*
  Cache-Control: public, max-age=31536000, immutable
TXT

npx --yes wrangler@latest pages deploy "$OUT" \
  --project-name=buildanta-site --branch=main --commit-dirty=true

echo
echo "live: https://buildanta-site.pages.dev"
