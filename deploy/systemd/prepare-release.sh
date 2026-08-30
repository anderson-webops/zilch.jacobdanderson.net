#!/usr/bin/env bash
set -euo pipefail

system_path=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
node_bin_dir="${NODE_BIN_DIR:-/usr/bin}"
if [[ "$node_bin_dir" != /* ]] || [[ ! -x "$node_bin_dir/node" ]] || [[ ! -x "$node_bin_dir/npm" ]]; then
	echo "NODE_BIN_DIR must be an absolute directory containing executable node and npm binaries." >&2
	exit 1
fi
node_bin_dir_real="$(cd -- "$node_bin_dir" && pwd -P)"
PATH="$node_bin_dir_real:$system_path"
export PATH
export NUXT_TELEMETRY_DISABLED=1
export PUPPETEER_SKIP_DOWNLOAD=true
export SKIP_INSTALL_SIMPLE_GIT_HOOKS=1

staging_root="${STAGING_ROOT:-/srv/zilch.jacobdanderson.net/staging}"

if [[ $# -ne 1 ]]; then
		echo "Usage: prepare-release.sh /srv/zilch.jacobdanderson.net/staging/<release>" >&2
	exit 2
fi
if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
	echo "Prepare releases as the unprivileged zilch-site deployment user, not root." >&2
	exit 1
fi

staging_root_real="$(cd -- "$staging_root" && pwd -P)"
candidate="$(cd -- "$1" && pwd -P)"
case "$candidate/" in
	"$staging_root_real/"*) ;;
	*) echo "Candidate must resolve beneath $staging_root_real: $candidate" >&2; exit 1 ;;
esac
if [[ "$candidate" == "$staging_root_real" ]]; then
	echo "Candidate must be a release checkout beneath, not equal to, $staging_root_real." >&2
	exit 1
fi
if [[ ! -f "$candidate/package-lock.json" || ! -d "$candidate/.git" || -L "$candidate/.git" ]] \
	|| ! git -C "$candidate" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
	|| [[ "$(git -C "$candidate" rev-parse --git-common-dir)" != ".git" ]]; then
	echo "Candidate must be a standalone Git clone with an internal .git directory and the committed root lockfile." >&2
	exit 1
fi
if [[ -n "$(git -C "$candidate" status --porcelain)" ]]; then
	echo "Candidate checkout must be clean before preparation." >&2
	exit 1
fi

for environment_directory in "$candidate" "$candidate/front-end" "$candidate/back-end"; do
	while IFS= read -r -d '' environment_file; do
		if [[ "$(basename -- "$environment_file")" != ".env.example" ]]; then
			echo "Release preparation refuses source-local environment files: $environment_file" >&2
			exit 1
		fi
	done < <(find "$environment_directory" -maxdepth 1 -type f \( -name '.env' -o -name '.env.*' \) -print0)
done

if [[ "$(node --version)" != "v24.18.1" || "$(npm --version)" != "12.0.2" ]]; then
	echo "Preparation requires Node 24.18.1 and npm 12.0.2." >&2
	exit 1
fi

origin_url="$(git -C "$candidate" remote get-url origin 2>/dev/null || true)"
case "$origin_url" in
	https://github.com/anderson-webops/zilch.jacobdanderson.net | \
	https://github.com/anderson-webops/zilch.jacobdanderson.net.git | \
	git@github.com:anderson-webops/zilch.jacobdanderson.net.git) ;;
	*) echo "origin must be the canonical anderson-webops/zilch.jacobdanderson.net repository." >&2; exit 1 ;;
esac

git -C "$candidate" fetch --quiet origin \
	+refs/heads/main:refs/remotes/origin/main \
	+refs/tags/*:refs/tags/*
git -C "$candidate" config --local --unset-all http.https://github.com/.extraheader 2>/dev/null || true
ZILCH_COMMIT_SHA="$(git -C "$candidate" rev-parse HEAD)"
ZILCH_VERSION="$(node -p 'require(process.argv[1]).version' "$candidate/package.json")"
ZILCH_RELEASE="v$ZILCH_VERSION"
ZILCH_BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export ZILCH_COMMIT_SHA ZILCH_VERSION ZILCH_RELEASE ZILCH_BUILT_AT
release_tag="$ZILCH_RELEASE"

if [[ "$(git -C "$candidate" cat-file -t "refs/tags/$release_tag" 2>/dev/null || true)" != "tag" ]]; then
	echo "$release_tag must exist as an annotated release tag before preparation." >&2
	exit 1
fi
if [[ "$(git -C "$candidate" rev-parse "$release_tag^{}")" != "$ZILCH_COMMIT_SHA" ]]; then
	echo "$release_tag must peel to the exact candidate revision." >&2
	exit 1
fi
if [[ "$(git -C "$candidate" rev-parse origin/main)" != "$ZILCH_COMMIT_SHA" ]]; then
	echo "The release candidate must be the exact fetched origin/main revision." >&2
	exit 1
fi

npm_cache="${NPM_CONFIG_CACHE:-$(dirname "$staging_root_real")/shared/npm-cache}"
mkdir -p "$npm_cache"
NPM_CONFIG_CACHE="$(cd -- "$npm_cache" && pwd -P)"
export NPM_CONFIG_CACHE

unset NODE_ENV
cd -- "$candidate"
node scripts/clean.mjs
npm ci --include=dev --include=optional --strict-allow-scripts
npm run audit:all
npm run audit:prod
npm run audit:api
npm audit signatures
npm run validate
npm run a11y
node scripts/write-release-metadata.mjs

npm ci --prefix back-end --omit=dev --include=optional --workspaces=false --ignore-scripts --no-fund --no-audit
node scripts/check-api-install.mjs
npm audit --prefix back-end --omit=dev --audit-level=low
npm ls --prefix back-end --omit=dev --all >/dev/null
node scripts/prune-direct-runtime.mjs
node scripts/verify-production-install.mjs
node scripts/direct-runtime-smoke.mjs
node scripts/write-runtime-manifest.mjs

echo "Prepared and hashed Zilch staging runtime $candidate at $ZILCH_COMMIT_SHA."
