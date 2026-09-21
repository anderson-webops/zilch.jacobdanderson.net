# Direct production rollout

Production uses static Nuxt output served by host Nginx plus one loopback-only Express probe process managed by systemd. Netlify is a separate supported adapter. No production container runtime is required.

The rollout has four distinct gates: reviewed source release, accepted Linux ARM64 artifact, root-controlled activation, and external acceptance. Source delivery and a passing local promotion test do not prove that production changed or that public routing works.

## Fixed compatibility contract

- Repository: `anderson-webops/zilch.jacobdanderson.net`
- Runtime: Node `24.18.1` from `/opt/node-24.18.1/bin` and npm `12.0.2` for builds
- Service account: `zilch-site`
- Service: `zilch-api.service`
- Release root: `/srv/zilch.jacobdanderson.net/releases`
- Selected release: `/srv/zilch.jacobdanderson.net/current`
- Protected archive storage: `/srv/zilch.jacobdanderson.net/quarantine`
- API listener: `127.0.0.1:3018`
- Public host: `zilch.jacobdanderson.net`

Port `3016` belongs to NP Service Request and must remain untouched. Preserve the existing users, paths, ports, Nginx policy, certificates, and IPv4/IPv6 listeners. Do not replace the host-wide `/usr/bin/node`, move another service, or change DNS to make a deployment pass.

## Release gate

Do not activate a candidate until all of the following are true:

1. All three package manifests and both lockfiles have the intended version.
2. Clean locked installs, full and production audits, signature checks, lint, types, tests, builds, accessibility, and deployment checks pass.
3. The exact commit is on `origin/main` and branch CI has passed.
4. An annotated tag named exactly `v<package-version>` peels to that commit.
5. The `Validate direct production release` workflow has passed for that tag.
6. The workflow's Linux ARM64 archive, `SHA256SUMS`, runtime manifest, and acceptance receipt have been downloaded and compared with the published release assets.

The accepted archive is the deployable object. Do not rebuild on the production host and do not regenerate its manifest after copying it. `scripts/validate-tagged-source.sh` is a non-production CI/source validator and explicitly refuses `/srv` and `/var/www` trees. No source builder remains in the production helper directory. The removed `.zilch-runtime.sha256` file is not an activation input.

## Protected administrative boundary

Never run a privileged installer, verifier, or promotion helper from a build-owned checkout. Package scripts can modify that checkout even if it started clean, and changing ownership later does not revoke an already-open writable file descriptor.

Bootstrap or upgrade administrative helpers from a fresh, independently reviewed, root-created checkout of the published tag beneath root-controlled ancestors. Review `deploy/systemd/install-service.sh` before running it. The installer copies immutable, versioned helpers beneath `/usr/local/libexec/zilch-release/<version>/` and atomically updates `/usr/local/sbin/zilch-promote-release`. It preserves an existing unit and does not start or restart the service.

The unprivileged build account may write only staging and its npm cache. Archives, release trees, helper code, deployment recovery records, and their ancestors stay root-controlled and non-writable to the service account. Existing paths with unexpected ownership, modes, or symlinks require operator review and are not silently normalized.

`/srv/zilch.jacobdanderson.net/shared` is a root-owned, service-group-readable
boundary. Only its `npm-cache` child is owned by `zilch-site`. The installer
accepts and hardens the exact earlier service-owned `shared` directory once so
the service account cannot replace the cache path during a privileged helper
upgrade; any other metadata drift remains a hard stop.

## First installation or helper upgrade

Before first installation, inventory the existing A and AAAA answers, Nginx server names/listeners, ports `3016` and `3018`, managed paths, users, and units. Stop if any intended Zilch target belongs to another application.

From the protected reviewed checkout:

```bash
sudo env NODE_BIN_DIR=/opt/node-24.18.1/bin \
  deploy/systemd/install-service.sh
```

On first installation, the script creates the dedicated account and the protected release layout, installs a disabled service, and installs the versioned promotion helper. On an existing compatible installation, it adds the reviewed helper version while leaving the live release, unit, and service state unchanged.

Install or update Nginx files only through the host's separately reviewed procedure. Test the complete Nginx configuration before reload. The repository files preserve the fixed host and proxy `/api`, `/healthz`, and `/readyz` to `127.0.0.1:3018`.

## Accept and stage the artifact

Use the tagged workflow's exact Linux ARM64 outputs. Verify release asset names, the published checksum, the full source commit, and the acceptance receipt before transferring the archive. Place it beneath `/srv/zilch.jacobdanderson.net/quarantine` without exposing it to the service account.

Create a fresh empty root-owned target beneath the release root and unpack with the installed verifier, not source-owned code:

```bash
release=v1.4.5
commit=<full-40-character-source-commit>
archive=/srv/zilch.jacobdanderson.net/quarantine/zilch-$release-${commit:0:12}-linux-arm64.tar.gz
sha256=<published-archive-sha256>
candidate=/srv/zilch.jacobdanderson.net/releases/$release-${commit:0:12}

sudo install -d -o root -g root -m 0755 "$candidate"
sudo /usr/bin/python3 -I \
  /usr/local/libexec/zilch-release/1.4.5/scripts/runtime-artifact.py \
  unpack "$candidate" --archive "$archive" --sha256 "$sha256" --commit "$commit"
```

The root extractor itself establishes root ownership and the exact recorded modes. Do not recursively chmod or copy the resulting tree. The verifier rejects unsafe archive paths, symlinks, private files, undeclared native code, development dependencies, missing required modules, hash drift, release identity drift, and unsafe installed modes. Root extraction makes the release tree traversable and readable by the separate service and Nginx identities while keeping `.zilch-release-prepared.json` root-owned at mode `0600`. The marker is required for administrative identity checks but is not a service runtime dependency. Keep the original archive and externally supplied digest available for promotion so a rehashed incomplete copy cannot pass.

Before promotion, the server integration must confirm that the release assets came from the successful exact tagged workflow, reverify the installed tree against the unchanged archive, and start the candidate as `zilch-site` on a disposable loopback port. Exercise its liveness, readiness, and graceful shutdown without changing `current`. Do not copy files from a source checkout into the extracted tree.

## Promote and roll back

Promote only with the installed root-owned wrapper:

```bash
sudo env PUBLIC_HOST=zilch.jacobdanderson.net \
  NODE_BIN_DIR=/opt/node-24.18.1/bin \
  /usr/local/sbin/zilch-promote-release \
  "$candidate" "$archive" "$sha256" "$commit"
```

The helper treats candidate files only as data. It independently verifies the candidate against the protected archive, validates trusted paths, takes an exclusive lock, installs the reviewed current Nginx server block at its fixed production path, selects the release atomically, restarts only `zilch-api.service`, and checks health, readiness, exact release identity, HTTP redirection, TLS through local IPv4 and IPv6, security headers, minimal probe responses, and denied unknown API operations. The Nginx destination cannot be overridden in production.

An unsuccessful exit or HUP/INT/TERM after mutation restores the prior pointer and its service enablement state, then rechecks it. A failed first activation removes only the new pointer and stops/disables the new service. Rollback continues after individual recovery errors; a degraded rollback leaves a mode `0600` recovery record beneath the protected mode `0700` `.deployment-recovery` directory. Preserve that evidence and the retained releases for operator repair. Never edit an immutable release in place.

The only accepted pre-artifact rollback target is `v1.4.1` at commit `fc43e474c0c402fdea39828e02a59cab9aa60661`. It has `/api/health` but no readiness endpoint. The promoter uses that route only for this exact identity and atomically restores the installed historical Nginx server block before reloading Nginx. Every artifact-era target must pass the full liveness and readiness gates and must be revalidated before rollback. Other pre-artifact identities are rejected. Migrations are not part of Zilch because it has no server-side database or application state.

## External acceptance

After the promoter succeeds, verify from a separate external network with current public DNS and real certificate validation:

```bash
curl --ipv4 --fail --show-error --silent https://zilch.jacobdanderson.net/healthz
curl --ipv6 --fail --show-error --silent https://zilch.jacobdanderson.net/readyz
curl --ipv4 --fail --show-error --silent https://zilch.jacobdanderson.net/release.json
curl --ipv6 --fail --show-error --silent https://zilch.jacobdanderson.net/release.json
curl --ipv4 --head --show-error http://zilch.jacobdanderson.net/
curl --ipv6 --head --show-error http://zilch.jacobdanderson.net/
```

Confirm that:

- HTTPS succeeds over both address families and HTTP redirects to the fixed HTTPS host.
- `/release.json` is byte-identical to the selected release marker and names the approved tag and full commit.
- GET `/healthz` and `/readyz` return only `{"ok":true}` with `Cache-Control: no-store`; HEAD has no body; neither route sets cookies, redirects, requires authentication, or reveals secrets, database names, host details, process metrics, or environment data.
- Unknown API paths return `404`, and unsafe methods are denied.
- The root page is revalidated, hashed assets are immutable, and the security headers, social preview, and favicon load.
- A browser game can start, roll, score, bank, pass turns, reload/resume, and finish Final Chase with keyboard and pointer input.

Only then record the release as live. Keep at least the selected release and one verified rollback target. Production activation remains a separate operator action from this source workflow. Local SNI checks performed from the production server remain origin checks and must not be described as independent WAN acceptance.
