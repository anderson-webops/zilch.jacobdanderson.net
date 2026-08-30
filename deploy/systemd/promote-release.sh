#!/usr/bin/env bash
set -euo pipefail

PATH=/opt/node-24.18.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
export LC_ALL=C

node_bin=/opt/node-24.18.1/bin/node

staging_root=/srv/zilch.jacobdanderson.net/staging
quarantine_root=/srv/zilch.jacobdanderson.net/quarantine
release_root=/srv/zilch.jacobdanderson.net/releases
current_link=/srv/zilch.jacobdanderson.net/current
service_name=zilch-api.service
health_url=http://127.0.0.1:3018/api/health
public_host="${PUBLIC_HOST:-}"
public_origin=https://zilch.jacobdanderson.net
source_url=https://github.com/anderson-webops/zilch.jacobdanderson.net.git
resolve_ipv4=zilch.jacobdanderson.net:443:127.0.0.1
resolve_ipv6='zilch.jacobdanderson.net:443:[::1]'
resolve_http_ipv4=zilch.jacobdanderson.net:80:127.0.0.1
resolve_http_ipv6='zilch.jacobdanderson.net:80:[::1]'

if [[ $# -ne 1 ]]; then
	echo "Usage: PUBLIC_HOST=zilch.jacobdanderson.net zilch-promote-release <prepared-staging-or-immutable-release>" >&2
	exit 2
fi
if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
	echo "Run the installed promotion command with root privileges." >&2
	exit 1
fi
if [[ "$0" != "/usr/local/sbin/zilch-promote-release" ]]; then
	echo "Promotion must run from the installed root-owned command: /usr/local/sbin/zilch-promote-release" >&2
	exit 1
fi
if [[ ! -x "$node_bin" || "$("$node_bin" --version)" != "v24.18.1" ]]; then
	echo "$node_bin must be Node 24.18.1." >&2
	exit 1
fi
if [[ "$public_host" != "zilch.jacobdanderson.net" ]]; then
	echo "PUBLIC_HOST must be exactly zilch.jacobdanderson.net." >&2
	exit 1
fi

exec 9>/run/lock/zilch-promote-release.lock
if ! flock -n 9; then
	echo "Another Zilch promotion is already running." >&2
	exit 1
fi

staging_root_real="$(cd -- "$staging_root" && pwd -P)"
quarantine_root_real="$(cd -- "$quarantine_root" && pwd -P)"
release_root_real="$(cd -- "$release_root" && pwd -P)"
if [[ "$(stat -c '%U:%G:%a' "$staging_root_real")" != "root:zilch-site:1730" \
	|| "$(stat -c '%U:%G:%a' "$quarantine_root_real")" != "root:root:700" \
	|| "$(stat -c '%U:%G:%a' "$release_root_real")" != "root:root:755" ]]; then
	echo "Managed staging, quarantine, and immutable release parent ownership or modes are unsafe." >&2
	exit 1
fi
candidate="$(cd -- "$1" && pwd -P)"
case "$candidate/" in
	"$staging_root_real/"*) candidate_kind=staging ;;
	"$release_root_real/"*) candidate_kind=immutable ;;
	*) echo "Candidate must resolve beneath the Zilch staging or immutable release root: $candidate" >&2; exit 1 ;;
esac
if [[ "$candidate" == "$staging_root_real" || "$candidate" == "$release_root_real" ]]; then
	echo "Candidate must be a release checkout, not a managed parent directory." >&2
	exit 1
fi
if [[ -e "$current_link" && ! -L "$current_link" ]]; then
	echo "Refusing to replace non-symlink deployment path: $current_link" >&2
	exit 1
fi

runtime_entries=(
	.zilch-release-prepared.json
	package.json
	package-lock.json
	back-end/package.json
	back-end/package-lock.json
	back-end/dist
	back-end/node_modules
	front-end/.output/public
)

for required_path in "${runtime_entries[@]}" .zilch-runtime.sha256; do
	if [[ ! -e "$candidate/$required_path" && ! -L "$candidate/$required_path" ]]; then
		echo "Release candidate is missing $required_path." >&2
		exit 1
	fi
done
for required_file in \
	.zilch-release-prepared.json \
	.zilch-runtime.sha256 \
	back-end/dist/server.js \
	back-end/node_modules/express/package.json \
	front-end/.output/public/index.html \
	front-end/.output/public/release.json; do
	if [[ ! -f "$candidate/$required_file" || -L "$candidate/$required_file" ]]; then
		echo "Required runtime file must be a regular non-symlink: $required_file" >&2
		exit 1
	fi
done

next_link=""
incoming=""
marker_snapshot="$(mktemp)"
manifest_snapshot="$(mktemp)"
response_health=""
response_release=""
headers_ipv4=""
headers_ipv6=""
# ShellCheck cannot infer that EXIT traps invoke this function.
# shellcheck disable=SC2317,SC2329
cleanup() {
	if [[ -n "$next_link" && -L "$next_link" ]]; then unlink -- "$next_link"; fi
	if [[ -n "$incoming" && "$incoming/" == "$quarantine_root_real/.incoming."* && -d "$incoming" ]]; then
		rm -rf -- "$incoming"
	fi
	for temporary_file in "$marker_snapshot" "$manifest_snapshot" "$response_health" "$response_release" "$headers_ipv4" "$headers_ipv6"; do
		if [[ -n "$temporary_file" ]]; then rm -f -- "$temporary_file"; fi
	done
}
trap cleanup EXIT

install -m 0600 "$candidate/.zilch-release-prepared.json" "$marker_snapshot"
install -m 0600 "$candidate/.zilch-runtime.sha256" "$manifest_snapshot"

read_marker() {
	"$node_bin" -e '
const fs = require("node:fs")
const marker = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
if (Object.keys(marker).sort().join(",") !== "builtAt,commitSha,release,repository") process.exit(1)
if (marker.repository !== "anderson-webops/zilch.jacobdanderson.net") process.exit(1)
if (!/^v\d+\.\d+\.\d+$/.test(marker.release)) process.exit(1)
if (!/^[0-9a-f]{40}$/.test(marker.commitSha)) process.exit(1)
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(marker.builtAt) || Number.isNaN(Date.parse(marker.builtAt))) process.exit(1)
console.log(marker.release)
console.log(marker.commitSha)
console.log(marker.builtAt)
console.log(marker.repository)
' "$1"
}

mapfile -t expected_marker < <(read_marker "$marker_snapshot")
if [[ ${#expected_marker[@]} -ne 4 ]]; then
	echo "Prepared release marker is invalid." >&2
	exit 1
fi
release_name="${expected_marker[0]}"
expected_commit="${expected_marker[1]}"

remote_main="$(git ls-remote --exit-code "$source_url" refs/heads/main | awk 'NR == 1 { print $1 }')"
remote_tag="$(git ls-remote --exit-code "$source_url" "refs/tags/$release_name^{}" | awk 'NR == 1 { print $1 }')"
if [[ "$remote_tag" != "$expected_commit" \
	|| ( "$candidate_kind" == "staging" && "$remote_main" != "$expected_commit" ) ]]; then
	echo "A staging marker must match public origin/main and every marker must match its public annotated release tag." >&2
	exit 1
fi

verify_runtime_manifest() {
	local target="$1"
	local manifest="$target/.zilch-runtime.sha256"
	local current_files declared_files unsafe_entry
	current_files="$(mktemp)"
	declared_files="$(mktemp)"

	unsafe_entry="$(find "${runtime_entries[@]/#/$target/}" "$manifest" -xdev \( -type l -o -type s -o -type b -o -type c -o -type p -o -type f -links +1 \) -print -quit)"
	if [[ -n "$unsafe_entry" ]]; then
		echo "Runtime contains a symlink, special file, or hard link: $unsafe_entry" >&2
		rm -f -- "$current_files" "$declared_files"
		return 1
	fi
	if ! awk '
		length($0) < 67 || substr($0, 65, 2) != "  " || substr($0, 1, 64) !~ /^[0-9a-f]+$/ { exit 1 }
		{ count += 1 }
		END { if (count == 0) exit 1 }
	' "$manifest"; then
		echo "Runtime manifest has an invalid format." >&2
		rm -f -- "$current_files" "$declared_files"
		return 1
	fi
	cut -c67- "$manifest" >"$declared_files"
	if ! sort -c -u "$declared_files" 2>/dev/null; then
		echo "Runtime manifest paths must be uniquely byte-sorted." >&2
		rm -f -- "$current_files" "$declared_files"
		return 1
	fi
	(
		cd -- "$target"
		find "${runtime_entries[@]}" -xdev -type f -print | sort >"$current_files"
	)
	if ! cmp -s "$current_files" "$declared_files"; then
		echo "Runtime file set differs from the prepared manifest." >&2
		rm -f -- "$current_files" "$declared_files"
		return 1
	fi
	if ! (cd -- "$target" && sha256sum --check --strict --quiet .zilch-runtime.sha256); then
		echo "Runtime content differs from the prepared SHA-256 manifest." >&2
		rm -f -- "$current_files" "$declared_files"
		return 1
	fi
	rm -f -- "$current_files" "$declared_files"
}

verify_release_identity() {
	local target="$1"
	local package_release
	local -a actual_marker
	mapfile -t actual_marker < <(read_marker "$target/.zilch-release-prepared.json")
	if [[ "${actual_marker[*]-}" != "${expected_marker[*]}" ]]; then
		echo "Frozen release identity differs from the root-owned marker snapshot." >&2
		return 1
	fi
	if ! cmp -s "$marker_snapshot" "$target/.zilch-release-prepared.json" \
		|| ! cmp -s "$marker_snapshot" "$target/front-end/.output/public/release.json"; then
		echo "Private, public, and root-owned release markers must be byte-for-byte identical." >&2
		return 1
	fi
	package_release="v$("$node_bin" -p 'require(process.argv[1]).version' "$target/package.json")"
	if [[ "$package_release" != "$release_name" ]]; then
		echo "Frozen package version does not match the release marker." >&2
		return 1
	fi
}

verify_frozen_tree() {
	local target="$1"
	local unsafe_mode
	unsafe_mode="$(find "$target" -xdev \( ! -user root -o -type d ! -perm -0555 -o -type f ! -perm -0444 -o -perm /222 \) -print -quit)"
	if [[ -n "$unsafe_mode" ]]; then
		echo "Immutable release is not entirely root-owned, readable, traversable, and read-only: $unsafe_mode" >&2
		return 1
	fi
	if ! runuser -u zilch-site -- test -r "$target/back-end/dist/server.js" \
		|| ! runuser -u zilch-site -- test -r "$target/front-end/.output/public/index.html"; then
		echo "The service account cannot read the immutable API and frontend entry points." >&2
		return 1
	fi
}

verify_rollback_identity() {
	local target="$1"
	local rollback_release rollback_commit rollback_remote_tag package_release
	local -a rollback_marker
	mapfile -t rollback_marker < <(read_marker "$target/.zilch-release-prepared.json")
	if [[ ${#rollback_marker[@]} -ne 4 ]] \
		|| ! cmp -s "$target/.zilch-release-prepared.json" "$target/front-end/.output/public/release.json"; then
		echo "Rollback target has an invalid or mismatched release marker." >&2
		return 1
	fi
	rollback_release="${rollback_marker[0]}"
	rollback_commit="${rollback_marker[1]}"
	rollback_remote_tag="$(git ls-remote --exit-code "$source_url" "refs/tags/$rollback_release^{}" | awk 'NR == 1 { print $1 }')"
	package_release="v$("$node_bin" -p 'require(process.argv[1]).version' "$target/package.json")"
	if [[ "$rollback_remote_tag" != "$rollback_commit" || "$package_release" != "$rollback_release" ]]; then
		echo "Rollback target is not tied to its public annotated release tag." >&2
		return 1
	fi
}

final_target="$release_root_real/$release_name-${expected_commit:0:12}"
if [[ "$candidate_kind" == "staging" ]]; then
	unsafe_source="$(find "${runtime_entries[@]/#/$candidate/}" "$candidate/.zilch-runtime.sha256" -xdev \( -type l -o -type s -o -type b -o -type c -o -type p -o -type f -links +1 \) -print -quit)"
	if [[ -n "$unsafe_source" ]]; then
		echo "Staging runtime contains a symlink, special file, or hard link: $unsafe_source" >&2
		exit 1
	fi
	if findmnt -rn -o TARGET | awk -v root="$candidate" '$0 == root || index($0, root "/") == 1 { found = 1 } END { exit !found }'; then
		echo "Staging runtime must not contain a nested mount." >&2
		exit 1
	fi
	if [[ -e "$final_target" || -L "$final_target" ]]; then
		echo "Immutable release already exists: $final_target" >&2
		exit 1
	fi
	incoming="$(mktemp -d "$quarantine_root_real/.incoming.XXXXXX")"
	install -d -m 0755 "$incoming/back-end" "$incoming/front-end/.output"
	install -m 0644 "$marker_snapshot" "$incoming/.zilch-release-prepared.json"
	install -m 0600 "$manifest_snapshot" "$incoming/.zilch-runtime.sha256"
	for source_file in package.json package-lock.json back-end/package.json back-end/package-lock.json; do
		install -m 0644 "$candidate/$source_file" "$incoming/$source_file"
	done
	cp -R --no-dereference --one-file-system --no-preserve=ownership \
		"$candidate/back-end/dist" "$candidate/back-end/node_modules" "$incoming/back-end/"
	cp -R --no-dereference --one-file-system --no-preserve=ownership \
		"$candidate/front-end/.output/public" "$incoming/front-end/.output/"
	verify_runtime_manifest "$incoming"
	verify_release_identity "$incoming"
	find "$incoming" -xdev -type d -exec chmod 0555 {} +
	find "$incoming" -xdev -type f -exec chmod 0444 {} +
	verify_runtime_manifest "$incoming"
	verify_frozen_tree "$incoming"
	mv -- "$incoming" "$final_target"
	incoming=""
else
	if [[ "$candidate" != "$final_target" ]]; then
		echo "Immutable retry path does not match the release identity: $final_target" >&2
		exit 1
	fi
	verify_frozen_tree "$candidate"
fi

verify_runtime_manifest "$final_target"
verify_release_identity "$final_target"
verify_frozen_tree "$final_target"

if ! nginx -t; then
	echo "Nginx configuration must pass before activation. The immutable release can be retried after the host is corrected." >&2
	exit 1
fi

previous_target=""
if [[ -L "$current_link" ]]; then
	previous_target="$(readlink -f -- "$current_link" 2>/dev/null || true)"
	if [[ -z "$previous_target" ]]; then
		echo "Existing deployment symlink does not resolve: $current_link" >&2
		exit 1
	fi
	case "$previous_target/" in
		"$release_root_real/"*) ;;
		*) echo "Existing deployment target is outside $release_root_real: $previous_target" >&2; exit 1 ;;
	esac
	verify_runtime_manifest "$previous_target"
	verify_frozen_tree "$previous_target"
	verify_rollback_identity "$previous_target"
fi

service_was_enabled=false
if systemctl is-enabled --quiet "$service_name"; then
	service_was_enabled=true
fi

next_link="${current_link}.next.$$"
response_health="$(mktemp)"
response_release="$(mktemp)"
headers_ipv4="$(mktemp)"
headers_ipv6="$(mktemp)"

activate_target() {
	local target="$1"
	ln -s -- "$target" "$next_link"
	mv -Tf -- "$next_link" "$current_link"
}

restore_service_enablement() {
	if [[ "$service_was_enabled" == "true" ]]; then
		systemctl enable "$service_name"
	else
		systemctl disable "$service_name"
	fi
}

health_is_minimal() {
	local actual="$1"
	"$node_bin" -e '
const fs = require("node:fs")
const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
if (JSON.stringify(body) !== JSON.stringify({ ok: true })) process.exit(1)
' "$actual"
}

strict_page_headers() {
	local headers="$1"
	grep -Eiq "^Content-Security-Policy:.*frame-ancestors 'none'([;[:space:]]|$)" "$headers" \
		&& grep -Eiq '^Strict-Transport-Security:[[:space:]]*max-age=31536000' "$headers" \
		&& grep -Eiq '^X-Content-Type-Options:[[:space:]]*nosniff' "$headers" \
		&& grep -Eiq '^X-Frame-Options:[[:space:]]*DENY' "$headers" \
		&& grep -Eiq '^Cross-Origin-Embedder-Policy:[[:space:]]*require-corp' "$headers" \
		&& grep -Eiq '^Cross-Origin-Opener-Policy:[[:space:]]*same-origin' "$headers" \
		&& grep -Eiq '^Cross-Origin-Resource-Policy:[[:space:]]*same-origin' "$headers"
}

no_store_headers() {
	grep -Eiq '^Cache-Control:[[:space:]]*no-store([[:space:]]|$)' "$1"
}

revalidation_headers() {
	grep -Eiq '^Cache-Control:[[:space:]]*no-cache([[:space:]]|$)' "$1"
}

immutable_headers() {
	grep -Eiq '^Cache-Control:.*max-age=31536000.*immutable' "$1"
}

content_type_is() {
	grep -Eiq "^Content-Type:[[:space:]]*$2([;[:space:]]|$)" "$1"
}

edge_status() {
	local family="$1"
	local resolve="$2"
	local url="$3"
	shift 3
	curl --noproxy '*' "$family" --silent --show-error --max-time 5 --resolve "$resolve" \
		--output /dev/null --write-out '%{http_code}' "$@" "$url"
}

redirect_is_canonical() {
	local family="$1"
	local resolve="$2"
	[[ "$(curl --noproxy '*' "$family" --silent --show-error --max-time 5 --resolve "$resolve" \
		--output /dev/null --write-out '%{http_code} %{redirect_url}' http://zilch.jacobdanderson.net/)" \
		== "301 https://zilch.jacobdanderson.net/" ]]
}

wait_for_target() {
	local target="$1"
	local marker="$target/.zilch-release-prepared.json"
	local asset_file asset_path
	asset_file="$(find "$target/front-end/.output/public/_nuxt" -type f -print -quit)"
	if [[ -z "$asset_file" ]]; then return 1; fi
	asset_path="${asset_file#"$target/front-end/.output/public"}"

	for _ in {1..40}; do
		if curl --noproxy '*' --fail --silent --show-error --max-time 5 "$health_url" --output "$response_health" \
			&& health_is_minimal "$response_health" \
			&& redirect_is_canonical --ipv4 "$resolve_http_ipv4" \
			&& redirect_is_canonical --ipv6 "$resolve_http_ipv6" \
			&& curl --noproxy '*' --ipv4 --fail --silent --show-error --max-time 5 --resolve "$resolve_ipv4" --dump-header "$headers_ipv4" "$public_origin/release.json" --output "$response_release" \
			&& cmp -s "$marker" "$response_release" && strict_page_headers "$headers_ipv4" && no_store_headers "$headers_ipv4" \
			&& curl --noproxy '*' --ipv6 --fail --silent --show-error --max-time 5 --resolve "$resolve_ipv6" --dump-header "$headers_ipv6" "$public_origin/release.json" --output "$response_release" \
			&& cmp -s "$marker" "$response_release" && strict_page_headers "$headers_ipv6" && no_store_headers "$headers_ipv6" \
			&& curl --noproxy '*' --ipv4 --fail --silent --show-error --max-time 5 --resolve "$resolve_ipv4" --dump-header "$headers_ipv4" "$public_origin/" --output /dev/null \
			&& strict_page_headers "$headers_ipv4" && revalidation_headers "$headers_ipv4" \
			&& curl --noproxy '*' --ipv6 --fail --silent --show-error --max-time 5 --resolve "$resolve_ipv6" --dump-header "$headers_ipv6" "$public_origin/" --output /dev/null \
			&& strict_page_headers "$headers_ipv6" && revalidation_headers "$headers_ipv6" \
			&& curl --noproxy '*' --ipv4 --fail --silent --show-error --max-time 5 --resolve "$resolve_ipv4" --dump-header "$headers_ipv4" "$public_origin$asset_path" --output /dev/null \
			&& strict_page_headers "$headers_ipv4" && immutable_headers "$headers_ipv4" \
			&& curl --noproxy '*' --ipv6 --fail --silent --show-error --max-time 5 --resolve "$resolve_ipv6" --dump-header "$headers_ipv6" "$public_origin$asset_path" --output /dev/null \
			&& strict_page_headers "$headers_ipv6" && immutable_headers "$headers_ipv6" \
			&& curl --noproxy '*' --ipv4 --fail --silent --show-error --max-time 5 --resolve "$resolve_ipv4" --dump-header "$headers_ipv4" "$public_origin/og.png" --output /dev/null \
			&& strict_page_headers "$headers_ipv4" && content_type_is "$headers_ipv4" image/png \
			&& curl --noproxy '*' --ipv6 --fail --silent --show-error --max-time 5 --resolve "$resolve_ipv6" --dump-header "$headers_ipv6" "$public_origin/og.png" --output /dev/null \
			&& strict_page_headers "$headers_ipv6" && content_type_is "$headers_ipv6" image/png \
			&& curl --noproxy '*' --ipv4 --fail --silent --show-error --max-time 5 --resolve "$resolve_ipv4" --dump-header "$headers_ipv4" "$public_origin/zilch-mark.svg" --output /dev/null \
			&& strict_page_headers "$headers_ipv4" && content_type_is "$headers_ipv4" image/svg+xml \
			&& curl --noproxy '*' --ipv6 --fail --silent --show-error --max-time 5 --resolve "$resolve_ipv6" --dump-header "$headers_ipv6" "$public_origin/zilch-mark.svg" --output /dev/null \
			&& strict_page_headers "$headers_ipv6" && content_type_is "$headers_ipv6" image/svg+xml \
			&& [[ "$(edge_status --ipv4 "$resolve_ipv4" "$public_origin/api/health" -X POST -H 'Content-Type: application/json' --data '{}')" == "405" ]] \
			&& [[ "$(edge_status --ipv6 "$resolve_ipv6" "$public_origin/api/health" -X POST -H 'Content-Type: application/json' --data '{}')" == "405" ]] \
			&& [[ "$(edge_status --ipv4 "$resolve_ipv4" "$public_origin/api/admin")" == "404" ]] \
			&& [[ "$(edge_status --ipv6 "$resolve_ipv6" "$public_origin/api/admin")" == "404" ]]; then
			return 0
		fi
		sleep 1
	done
	return 1
}

if activate_target "$final_target" \
	&& systemctl restart "$service_name" \
	&& nginx -t \
	&& systemctl reload nginx \
	&& wait_for_target "$final_target" \
	&& systemctl enable "$service_name"; then
	echo "Promoted immutable $final_target and verified the local IPv4/IPv6 TLS edge. External reachability remains a separate acceptance gate."
	exit 0
fi

echo "Candidate health, identity, or local edge policy failed; attempting to restore the previous direct release." >&2
if [[ -n "$previous_target" && "$previous_target" != "$final_target" ]]; then
	rollback_ok=true
	if ! activate_target "$previous_target"; then rollback_ok=false; fi
	if ! systemctl restart "$service_name"; then rollback_ok=false; fi
	if ! nginx -t; then
		rollback_ok=false
	elif ! systemctl reload nginx; then
		rollback_ok=false
	fi
	if ! wait_for_target "$previous_target"; then rollback_ok=false; fi
	if ! restore_service_enablement; then rollback_ok=false; fi
	if [[ "$rollback_ok" == "true" ]]; then
		echo "The previous immutable release was restored and reverified." >&2
	else
		echo "Rollback was attempted, but the restored service is degraded and requires immediate operator review." >&2
	fi
elif [[ -z "$previous_target" ]]; then
	if ! unlink -- "$current_link"; then true; fi
	if ! systemctl stop "$service_name"; then true; fi
	if ! systemctl disable "$service_name"; then true; fi
	if nginx -t; then
		if ! systemctl reload nginx; then true; fi
	fi
else
	if ! restore_service_enablement; then
		echo "The previous service enablement state could not be restored." >&2
	fi
	echo "The failing release was already current; it remains selected for diagnosis and can be retried after correction." >&2
fi
exit 1
