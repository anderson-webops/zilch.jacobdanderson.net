#!/usr/bin/env bash
# Install a signed current Nginx only on disposable Ubuntu CI runners.
set -euo pipefail
umask 022

if [[ ${EUID:-$(id -u)} -ne 0 || "${CI:-}" != true || "${RUNNER_ENVIRONMENT:-}" != github-hosted ]]; then
	echo 'This helper is restricted to disposable GitHub-hosted CI runners.' >&2
	exit 1
fi

# shellcheck source=/dev/null
. /etc/os-release
if [[ "${ID:-}" != ubuntu || ! "${VERSION_CODENAME:-}" =~ ^(noble|resolute)$ ]]; then
	echo 'The reviewed Nginx CI repository supports only Ubuntu 24.04 or 26.04.' >&2
	exit 1
fi

apt-get update -qq
apt-get install --yes --no-install-recommends ca-certificates curl gnupg
temporary_key=$(mktemp)
cleanup() {
	rm -f -- "$temporary_key"
}
trap cleanup EXIT
curl --fail --show-error --silent --proto '=https' --tlsv1.2 \
	--output "$temporary_key" https://nginx.org/keys/nginx_signing.key
expected_fingerprint=573BFD6B3D8FBC641079A6ABABF5BD827BD9BF62
if ! gpg --batch --show-keys --with-colons "$temporary_key" \
		| awk -F: '$1 == "fpr" { print $10 }' \
		| grep -Fxq "$expected_fingerprint"; then
	echo 'The official Nginx signing key fingerprint did not match the reviewed value.' >&2
	exit 1
fi
gpg --batch --yes --dearmor --output /usr/share/keyrings/nginx-archive-keyring.gpg "$temporary_key"
printf '%s\n' \
	"deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] https://nginx.org/packages/mainline/ubuntu $VERSION_CODENAME nginx" \
	>/etc/apt/sources.list.d/nginx.list
printf '%s\n' \
	'Package: *' \
	'Pin: origin nginx.org' \
	'Pin: release o=nginx' \
	'Pin-Priority: 900' \
	>/etc/apt/preferences.d/99nginx
apt-get update -qq
apt-get install --yes --no-install-recommends nginx
installed_version=$(nginx -v 2>&1 | sed -n 's#^nginx version: nginx/##p')
if [[ -z "$installed_version" ]] || ! dpkg --compare-versions "$installed_version" ge 1.25.1 \
		|| ! nginx -V 2>&1 | grep -Fq -- '--with-http_v2_module'; then
	echo 'CI requires a signed Nginx release that supports the standalone http2 directive.' >&2
	exit 1
fi
printf 'Validated Nginx %s from the signed official repository.\n' "$installed_version"
