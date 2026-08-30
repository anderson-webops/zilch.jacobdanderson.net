#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
	echo "Run install-service.sh with root privileges." >&2
	exit 1
fi
if [[ ! -x /usr/bin/node || "$(/usr/bin/node --version)" != "v24.18.1" \
	|| ! -x /usr/bin/npm || "$(/usr/bin/npm --version)" != "12.0.2" ]]; then
	echo "/usr/bin/node and /usr/bin/npm must be Node 24.18.1 and npm 12.0.2." >&2
	exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

for required_command in /usr/bin/curl /usr/bin/findmnt /usr/bin/flock /usr/bin/git /usr/bin/sha256sum /usr/sbin/nginx /usr/sbin/runuser; do
	if [[ ! -x "$required_command" ]]; then
		echo "Required production command is missing: $required_command" >&2
		exit 1
	fi
done

exec 9>/run/lock/zilch-install-service.lock
if ! flock -n 9; then
	echo "Another Zilch installation is already running." >&2
	exit 1
fi

if ss -H -ltn 'sport = :3016' | grep -q .; then
	echo "TCP port 3016 is already in use; choose and review a different dedicated loopback port before installing." >&2
	exit 1
fi

for managed_path in \
	/srv/zilch.jacobdanderson.net \
	/etc/systemd/system/zilch-api.service \
	/usr/local/sbin/zilch-promote-release; do
	if [[ -e "$managed_path" || -L "$managed_path" ]]; then
		echo "First installation requires an unused target; found $managed_path. Inventory it and use a reviewed upgrade procedure." >&2
		exit 1
	fi
done
if getent group zilch-site >/dev/null || getent passwd zilch-site >/dev/null; then
	echo "First installation requires the zilch-site user and group names to be unused." >&2
	exit 1
fi
if systemctl list-unit-files zilch-api.service --no-legend 2>/dev/null | grep -q '^zilch-api\.service'; then
	echo "First installation refuses an existing zilch-api.service registration." >&2
	exit 1
fi

# Everything below is newly owned by this first-install run. If a later step
# fails, remove only those exact empty paths and identities so a corrected
# installer can be run again without inheriting a partial deployment.
# shellcheck disable=SC2329
rollback_partial_install() {
	local exit_code="$1"
	set +e
	rm -f -- /etc/systemd/system/zilch-api.service /usr/local/sbin/zilch-promote-release
	systemctl daemon-reload
	rmdir -- \
		/srv/zilch.jacobdanderson.net/shared/npm-cache \
		/srv/zilch.jacobdanderson.net/shared \
		/srv/zilch.jacobdanderson.net/staging \
		/srv/zilch.jacobdanderson.net/quarantine \
		/srv/zilch.jacobdanderson.net/releases \
		/srv/zilch.jacobdanderson.net
	userdel zilch-site
	groupdel zilch-site
	exit "$exit_code"
}
trap 'rollback_partial_install "$?"' ERR

groupadd --system zilch-site
useradd --system --gid zilch-site --home-dir /srv/zilch.jacobdanderson.net --shell /usr/sbin/nologin zilch-site

install -d -o root -g root -m 0755 /srv/zilch.jacobdanderson.net
install -d -o root -g zilch-site -m 1730 /srv/zilch.jacobdanderson.net/staging
install -d -o root -g root -m 0700 /srv/zilch.jacobdanderson.net/quarantine
install -d -o root -g root -m 0755 /srv/zilch.jacobdanderson.net/releases
install -d -o zilch-site -g zilch-site -m 0750 /srv/zilch.jacobdanderson.net/shared
install -d -o zilch-site -g zilch-site -m 0700 /srv/zilch.jacobdanderson.net/shared/npm-cache
install -o root -g root -m 0644 "$script_dir/zilch-api.service" /etc/systemd/system/zilch-api.service
install -o root -g root -m 0755 "$script_dir/promote-release.sh" /usr/local/sbin/zilch-promote-release

systemctl daemon-reload
trap - ERR

echo "Installed the disabled Zilch API service and root-owned promotion command. First promotion enables the verified service."
