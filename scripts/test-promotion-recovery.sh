#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "$0")/.." && pwd)
node=$(realpath "$(command -v node)")
test "$(uname -s)" = Linux
test "$(id -u)" -ne 0
test "$(node --version)" = v24.18.1
mkdir -p "$root/.ai-work/runs"
history_root=$(mktemp -d "$root/.ai-work/runs/promotion-history.XXXXXXXX")
cleanup() {
	rm -r -- "$history_root"
}
trap cleanup EXIT
for version in 1.4.3 1.4.7; do
	case "$version" in
		1.4.3) expected_commit=bdeb027e5895572d741d9ad85bfee25b2e0319c5 ;;
		1.4.7) expected_commit=600e2cda985393b0c60ddcd65467de5e83987082 ;;
	esac
	actual_commit=$(git -C "$root" rev-parse "v$version^{}")
	if [[ "$actual_commit" != "$expected_commit" ]]; then
		echo "Historical recovery tag v$version no longer resolves to the reviewed commit." >&2
		exit 1
	fi
	git -C "$root" show "v$version:deploy/runtime-artifact.json" >"$history_root/v$version.runtime-artifact.json"
	git -C "$root" show "v$version:deploy/nginx/zilch.jacobdanderson.net.server.conf" >"$history_root/v$version.nginx.conf"
	printf '%s\n' "$actual_commit" >"$history_root/v$version.commit"
done
chmod 0644 "$history_root"/*
# Root authority and writable system-command stubs exist only inside this namespace.
timeout -k 5 120 bwrap --unshare-all --die-with-parent --new-session --uid 0 --gid 0 \
  --ro-bind /usr /usr --symlink usr/bin /bin --symlink usr/lib /lib \
	--tmpfs /usr/local --ro-bind "$node" /runtime/node --proc /proc --dev /dev --tmpfs /tmp \
	--ro-bind "$history_root" /history \
  --ro-bind "$root/deploy" /source/deploy --ro-bind "$root/scripts" /source/scripts \
  --ro-bind "$root/package.json" /source/package.json \
  --clearenv --setenv PATH /runtime:/usr/bin:/bin --setenv HOME /tmp \
  --chdir /tmp /usr/bin/python3 -B /source/scripts/test-promotion-recovery.py "${1:-all}"
