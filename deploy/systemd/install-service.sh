#!/usr/bin/env bash
# Bootstrap from a separately reviewed, root-owned checkout. Never from a build tree.
set -euo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
unset NODE_OPTIONS NODE_PATH PYTHONPATH PYTHONHOME
umask 077

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo 'Run the reviewed administrative installer as root.' >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source_root="$(cd -- "$script_dir/../.." && pwd -P)"
node_bin_dir="${NODE_BIN_DIR:-/opt/node-24.18.1/bin}"
node_bin="$node_bin_dir/node"

/usr/bin/python3 -I "$script_dir/trusted-paths.py" --tree "$script_dir" \
  "$source_root/scripts/runtime-artifact.py" "$source_root/deploy/runtime-artifact.json" \
  "$source_root/deploy/nginx/zilch.jacobdanderson.net.server.conf" \
  "$source_root/deploy/nginx/zilch.jacobdanderson.net.legacy-v1.4.1.server.conf" \
  "$source_root/package.json" "$node_bin"
if [[ ! -x "$node_bin" || "$("$node_bin" --version)" != v24.18.1 ]]; then
  echo 'NODE_BIN_DIR must select the protected Node 24.18.1 runtime without replacing /usr/bin/node.' >&2
  exit 1
fi

version="$("$node_bin" -p 'require(process.argv[1]).version' "$source_root/package.json")"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo 'The source package version is invalid.' >&2
  exit 1
fi

base=/srv/zilch.jacobdanderson.net
unit=/etc/systemd/system/zilch-api.service
helper_parent=/usr/local/libexec/zilch-release
helper_root="$helper_parent/$version"
wrapper=/usr/local/sbin/zilch-promote-release
first_install=false
created_group=false
created_user=false
created_helper_parent=false
created_helper=false
created_unit=false
wrapper_new=''

# ShellCheck cannot infer that the EXIT trap invokes this function.
# shellcheck disable=SC2317,SC2329
cleanup_on_exit() {
  local status=$?
  trap - EXIT
  if [[ -n "$wrapper_new" && -e "$wrapper_new" ]]; then
    unlink -- "$wrapper_new"
  fi
  if [[ "$status" -ne 0 ]]; then
    if [[ "$created_unit" == true && -f "$unit" ]]; then
      unlink -- "$unit"
      systemctl daemon-reload || true
    fi
    if [[ "$created_helper" == true ]]; then
      unlink -- \
        "$helper_root/deploy/systemd/promote-release.sh" \
        "$helper_root/deploy/systemd/trusted-paths.py" \
        "$helper_root/scripts/runtime-artifact.py" \
        "$helper_root/deploy/runtime-artifact.json" \
        "$helper_root/deploy/nginx/zilch.jacobdanderson.net.server.conf" \
        "$helper_root/deploy/nginx/zilch.jacobdanderson.net.legacy-v1.4.1.server.conf" 2>/dev/null || true
      rmdir -- "$helper_root/deploy/systemd" "$helper_root/deploy/nginx" "$helper_root/deploy" "$helper_root/scripts" "$helper_root" 2>/dev/null || true
    fi
    if [[ "$created_helper_parent" == true ]]; then
      rmdir -- "$helper_parent" 2>/dev/null || true
    fi
    if [[ "$first_install" == true ]]; then
      rmdir -- \
        "$base/shared/npm-cache" "$base/shared" "$base/staging" \
        "$base/quarantine" "$base/releases" "$base" 2>/dev/null || true
      if [[ "$created_user" == true ]]; then userdel zilch-site || true; fi
      if [[ "$created_group" == true ]]; then groupdel zilch-site || true; fi
    fi
  fi
  exit "$status"
}
trap cleanup_on_exit EXIT

exec 9>/run/lock/zilch-install-service.lock
if ! flock -n 9; then
  echo 'Another Zilch installation or helper upgrade is active.' >&2
  exit 1
fi

if [[ ! -e "$base" && ! -L "$base" ]]; then
  first_install=true
  for managed_path in "$unit" "$wrapper"; do
    if [[ -e "$managed_path" || -L "$managed_path" ]]; then
      echo "First installation requires an unused target: $managed_path" >&2
      exit 1
    fi
  done
  if getent group zilch-site >/dev/null || getent passwd zilch-site >/dev/null; then
    echo 'First installation requires unused zilch-site user and group names.' >&2
    exit 1
  fi
  if ss -H -ltn 'sport = :3018' | grep -q .; then
    echo 'TCP port 3018 is already in use. Preserve NP Service Request on 3016 and review a different Zilch port.' >&2
    exit 1
  fi
  groupadd --system zilch-site
  created_group=true
  useradd --system --gid zilch-site --home-dir "$base" --shell /usr/sbin/nologin zilch-site
  created_user=true
fi

if ! getent group zilch-site >/dev/null || ! id zilch-site >/dev/null 2>&1; then
  echo 'The dedicated zilch-site user and group must exist.' >&2
  exit 1
fi
service_uid="$(id -u zilch-site)"
service_gid="$(id -g zilch-site)"

install_unit=false
if [[ ! -e "$unit" && ! -L "$unit" ]]; then
  install_unit=true
elif [[ -L "$unit" || ! -f "$unit" ]]; then
  echo "Existing unit path needs operator review; left unchanged: $unit" >&2
  exit 1
else
  /usr/bin/python3 -I "$script_dir/trusted-paths.py" "$unit"
fi

ensure_directory() {
  local path="$1" owner="$2" group="$3" mode="$4"
  if [[ -L "$path" ]]; then
    echo "Expected a real managed directory: $path" >&2
    exit 1
  fi
  if [[ ! -e "$path" ]]; then
    install -d -o "$owner" -g "$group" -m "$mode" "$path"
  elif [[ ! -d "$path" ]]; then
    echo "Expected a real managed directory: $path" >&2
    exit 1
  fi
  if [[ "$(stat -c '%u:%g:%a' "$path")" != "$owner:$group:$mode" ]]; then
    echo "Existing managed directory metadata needs operator review; left unchanged: $path" >&2
    exit 1
  fi
}

ensure_directory "$base" 0 0 755
/usr/bin/python3 -I "$script_dir/trusted-paths.py" "$base"
ensure_directory "$base/staging" 0 "$service_gid" 1730
ensure_directory "$base/quarantine" 0 0 700
ensure_directory "$base/releases" 0 0 755

# The cache itself is writable by the build account, but its parent must not be.
# Accept and harden the exact legacy owner once. Because $base and its ancestors
# are already protected, the service account cannot replace the shared entry
# between this check and chown. Afterward it cannot swap npm-cache during a
# privileged helper upgrade.
if [[ -L "$base/shared" ]]; then
  echo "Expected a real managed directory: $base/shared" >&2
  exit 1
elif [[ ! -e "$base/shared" ]]; then
  install -d -o 0 -g "$service_gid" -m 0750 "$base/shared"
elif [[ ! -d "$base/shared" ]]; then
  echo "Expected a real managed directory: $base/shared" >&2
  exit 1
else
  shared_metadata="$(stat -c '%u:%g:%a' "$base/shared")"
  if [[ "$shared_metadata" == "$service_uid:$service_gid:750" ]]; then
    chown -h 0:"$service_gid" "$base/shared"
    chmod 0750 "$base/shared"
  elif [[ "$shared_metadata" != "0:$service_gid:750" ]]; then
    echo "Existing managed directory metadata needs operator review; left unchanged: $base/shared" >&2
    exit 1
  fi
fi
ensure_directory "$base/shared" 0 "$service_gid" 750
ensure_directory "$base/shared/npm-cache" "$service_uid" "$service_gid" 700

for protected_path in "$base" "$base/quarantine" "$base/releases" "$base/shared"; do
  /usr/bin/python3 -I "$script_dir/trusted-paths.py" "$protected_path"
done

if [[ -e "$helper_parent" || -L "$helper_parent" ]]; then
  /usr/bin/python3 -I "$script_dir/trusted-paths.py" "$helper_parent"
else
  install -d -o 0 -g 0 -m 0755 "$helper_parent"
  created_helper_parent=true
fi
if [[ -e "$helper_root" || -L "$helper_root" ]]; then
  echo "Reviewed helper version already exists: $helper_root. Do not overwrite it." >&2
  exit 1
fi

install -d -o 0 -g 0 -m 0755 \
  "$helper_root" "$helper_root/scripts" "$helper_root/deploy" \
  "$helper_root/deploy/nginx" "$helper_root/deploy/systemd"
created_helper=true
install -o 0 -g 0 -m 0755 "$script_dir/promote-release.sh" "$script_dir/trusted-paths.py" "$helper_root/deploy/systemd/"
install -o 0 -g 0 -m 0755 "$source_root/scripts/runtime-artifact.py" "$helper_root/scripts/"
install -o 0 -g 0 -m 0644 "$source_root/deploy/runtime-artifact.json" "$helper_root/deploy/"
install -o 0 -g 0 -m 0644 \
  "$source_root/deploy/nginx/zilch.jacobdanderson.net.server.conf" \
  "$source_root/deploy/nginx/zilch.jacobdanderson.net.legacy-v1.4.1.server.conf" \
  "$helper_root/deploy/nginx/"

/usr/bin/python3 -I "$script_dir/trusted-paths.py" --tree "$helper_root"
if [[ -e "$wrapper" || -L "$wrapper" ]]; then
  /usr/bin/python3 -I "$script_dir/trusted-paths.py" "$wrapper"
fi
wrapper_new="$(mktemp /usr/local/sbin/.zilch-promote-release.XXXXXXXX)"
printf '#!/bin/sh\nexec %s "$@"\n' "$helper_root/deploy/systemd/promote-release.sh" >"$wrapper_new"
chown 0:0 "$wrapper_new"
chmod 0755 "$wrapper_new"

if [[ "$install_unit" == true ]]; then
  install -o 0 -g 0 -m 0644 "$script_dir/zilch-api.service" "$unit"
  created_unit=true
  systemctl daemon-reload
fi

mv -Tf -- "$wrapper_new" "$wrapper"
wrapper_new=''
trap - EXIT
if [[ "$first_install" == true ]]; then
  echo "Installed the disabled Zilch service and protected release helper $version. No service was started."
else
  echo "Installed protected Zilch release helper $version. Existing service state and host topology were left unchanged."
fi
