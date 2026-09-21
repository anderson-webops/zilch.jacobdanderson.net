#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
temporary_root="$(mktemp -d)"
# ShellCheck cannot infer that EXIT traps invoke this function.
# shellcheck disable=SC2317,SC2329
cleanup() {
	rm -rf -- "$temporary_root"
}
trap cleanup EXIT

shellcheck \
	"$project_root/deploy/systemd/install-service.sh" \
	"$project_root/scripts/validate-tagged-source.sh" \
	"$project_root/deploy/systemd/promote-release.sh" \
	"$project_root/deploy/validate-configs.sh"

service_file="$project_root/deploy/systemd/zilch-api.service"
if ! grep -Fqx 'ExecStart=/opt/node-24.18.1/bin/node back-end/dist/server.js' "$service_file"; then
	echo "Production service must use the isolated Node 24.18.1 runtime." >&2
	exit 1
fi
node_executable="$(command -v node)"
sed "s#^ExecStart=/opt/node-24.18.1/bin/node #ExecStart=$node_executable #" \
	"$service_file" >"$temporary_root/zilch-api.service"
systemd-analyze verify "$temporary_root/zilch-api.service"

mkdir -p \
	"$temporary_root/cert" \
	"$temporary_root/logs" \
	"$temporary_root/public" \
	"$temporary_root/run"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
	-subj '/CN=zilch.jacobdanderson.net' \
	-keyout "$temporary_root/cert/privkey.pem" \
	-out "$temporary_root/cert/fullchain.pem" >/dev/null 2>&1

cat >"$temporary_root/nginx.conf" <<EOF
pid $temporary_root/run/nginx.pid;
error_log $temporary_root/logs/error.log;
events {}
http {
  include /etc/nginx/mime.types;
  access_log $temporary_root/logs/access.log;
  include $temporary_root/zilch.server.conf;
}
EOF

for server_config in \
	"$project_root/deploy/nginx/zilch.jacobdanderson.net.server.conf" \
	"$project_root/deploy/nginx/zilch.jacobdanderson.net.legacy-v1.4.1.server.conf"; do
	sed \
		-e "s#/etc/nginx/snippets/zilch-security-headers.conf#$project_root/deploy/nginx/zilch-security-headers.conf#g" \
		-e "s#/etc/letsencrypt/live/zilch.jacobdanderson.net/fullchain.pem#$temporary_root/cert/fullchain.pem#g" \
		-e "s#/etc/letsencrypt/live/zilch.jacobdanderson.net/privkey.pem#$temporary_root/cert/privkey.pem#g" \
		-e "s#/srv/zilch.jacobdanderson.net/current/front-end/.output/public#$temporary_root/public#g" \
		"$server_config" >"$temporary_root/zilch.server.conf"
	nginx -t -p "$temporary_root" -c "$temporary_root/nginx.conf"
done
echo "Shell, systemd, and current plus legacy Nginx configuration validation passed"
