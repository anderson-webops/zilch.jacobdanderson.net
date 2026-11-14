#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "$0")/.." && pwd)
output=$(realpath "${1:?Pass the current artifact qualification directory}")
case "$output/" in "$root/.ai-work/runs/"*) ;; *) echo 'Retained runtime evidence must remain in owning repository scratch.' >&2; exit 1;; esac
test "$(id -u)" -ne 0
test "$(uname -s)" = Linux
test "$(uname -m)" = aarch64
node=$(realpath "$(command -v node)")
test "$("$node" --version)" = v26.13.1
commit=af63255b8fc2f6ca95df7c35ee01aef547ffe610
sha=c3dc13bd06cf78540ec9d3a297d5256ab57ff8d195768396734b9e5f9fc84871
archive_name=zilch-v1.4.18-af63255b8fc2-linux-arm64.tar.gz
prior="$output/retained-v1.4.18"
mkdir -m 700 "$prior" "$prior/source" "$prior/runtime"
git -C "$root" archive "$commit" scripts/runtime-artifact.py deploy/runtime-artifact.json | tar -x -C "$prior/source"
printf '%s  %s\n' \
  e5e53e47b85eda06000af6107ac8fbc9711e75134e90fc515a67bb826ea31f29 "$prior/source/scripts/runtime-artifact.py" \
  044cf62c51e69acdda97b33f79ea00e09d13580de4b6f68f2037eaad3ff10e5d "$prior/source/deploy/runtime-artifact.json" | sha256sum --check
curl --fail --location --proto '=https' --proto-redir '=https' \
  --retry 2 --connect-timeout 15 --max-time 120 \
  "https://github.com/anderson-webops/zilch.jacobdanderson.net/releases/download/v1.4.18/$archive_name" \
  --output "$prior/$archive_name"
python3 -B "$prior/source/scripts/runtime-artifact.py" unpack "$prior/runtime" \
  --archive "$prior/$archive_name" --sha256 "$sha" --commit "$commit"
loader_mounts=()
if test -d /usr/lib64; then
  loader_mounts=(--symlink usr/lib64 /lib64)
fi
timeout -k 5 90 bwrap --unshare-all --die-with-parent --new-session \
  --ro-bind /usr /usr --symlink usr/bin /bin --symlink usr/lib /lib "${loader_mounts[@]}" \
  --ro-bind "$node" /runtime/node --proc /proc --dev /dev --tmpfs /tmp \
  --ro-bind "$prior/runtime" /app \
  --ro-bind "$root/scripts/artifact-acceptance/runtime.mjs" /harness/runtime.mjs \
  --ro-bind "$root/scripts/direct-runtime-smoke.mjs" /harness/direct-runtime-smoke.mjs \
  --clearenv --setenv PATH /runtime:/usr/bin:/bin --setenv HOME /tmp \
  --chdir /app /runtime/node /harness/runtime.mjs retained-v1.4.18
python3 -B "$prior/source/scripts/runtime-artifact.py" verify "$prior/runtime" \
  --archive "$prior/$archive_name" --sha256 "$sha" --commit "$commit"
