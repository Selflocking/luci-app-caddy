#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

if [ -z "${CADDY_BIN:-}" ]; then
	CADDY_BIN=$(command -v caddy || true)
fi
if [ -n "$CADDY_BIN" ]; then
	[ -x "$CADDY_BIN" ] || { echo 'CADDY_BIN must point to an executable Caddy binary.' >&2; exit 1; }
	export CADDY_BIN
else
	echo 'CADDY_BIN is unset: real Caddy integration and RPC backend tests will be skipped.' >&2
fi

for file in htdocs/luci-static/resources/caddy/*.js htdocs/luci-static/resources/view/caddy/*.js; do
	node --check "$file"
done
for file in root/etc/init.d/caddy-luci root/usr/libexec/caddy-luci-run root/usr/libexec/rpcd/luci.caddy; do
	sh -n "$file"
done
npm test
python3 -m unittest discover -s tests -p 'test_*.py' -v
