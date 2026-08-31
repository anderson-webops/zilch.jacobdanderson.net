# Direct production rollout

Production uses static Nuxt output served by host Nginx plus one loopback-only Express health process managed by systemd. Netlify remains a separate supported adapter. No container runtime is required.

The direct release path is deliberately split into four gates: source release approval, unprivileged staging, root-owned verification and freezing, and external acceptance. A successful local promotion does not by itself prove that public DNS, routing, or firewall policy works.

## Release gate

Do not prepare a host candidate until all of the following are true:

1. The three package manifests and both lockfiles carry the intended version, and the root dependency install and full validation suite pass.
2. The exact release commit is on the dedicated `anderson-webops/zilch.jacobdanderson.net` `main` branch and its branch CI run has passed.
3. An annotated tag named exactly `v<package-version>` points to that same commit. Do not copy inherited template tags into the dedicated repository.
4. The `Validate direct production release` workflow has passed for that exact tag.
5. `origin/main` and the peeled annotated tag resolve to the same full commit SHA.

The tag workflow repeats the direct-runtime preparation checks on a clean runner. It validates the tag but does not publish an artifact or deploy the host. Host preparation below repeats those checks in the production environment.

## First installation

1. Inventory the current A and AAAA answers, Nginx server names and listeners, TCP port `3018`, `/srv/zilch.jacobdanderson.net`, the `zilch-site` user and group, `zilch-api.service`, and `/usr/local/sbin/zilch-promote-release`. Stop if any target belongs to another application. Port `3016` belongs to NP Service Request and must remain untouched. Do not assume a prior DNS or port observation is still current.
2. Verify `/opt/node-24.18.1/bin/node` is Node `24.18.1` and `/opt/node-24.18.1/bin/npm` is npm `12.0.2`, together with the host commands checked by `install-service.sh`. Do not replace or relink the host-wide `/usr/bin` runtime for this service.
3. From the reviewed release source, run `sudo deploy/systemd/install-service.sh` once. The installer fails closed if any managed target already exists. It creates writable staging, root-only quarantine, immutable release, and shared cache directories; installs the disabled service; and installs the promotion program as the root-owned `/usr/local/sbin/zilch-promote-release`.
4. Install `deploy/nginx/zilch.jacobdanderson.net.http-bootstrap.conf` using the host's existing enabled-site convention. Create `/var/lib/letsencrypt`, test the complete Nginx configuration, reload it, and obtain a certificate with the ACME webroot for exactly `zilch.jacobdanderson.net`.
5. Install the shared header snippet at its fixed include path, then replace the bootstrap server with the TLS server configuration:

   ```bash
   sudo install -d -o root -g root -m 0755 /etc/nginx/snippets
   sudo install -o root -g root -m 0644 \
     deploy/nginx/zilch-security-headers.conf \
     /etc/nginx/snippets/zilch-security-headers.conf
   ```

   Install `deploy/nginx/zilch.jacobdanderson.net.server.conf` using the same enabled-site convention. Run `sudo nginx -t` before reloading Nginx. At this point the API remains disabled and the static root has no selected release, which is expected until the first successful promotion.

Do not rerun the first-install script as an upgrade mechanism. Changes to the installed promoter, unit, or Nginx files require a separately reviewed root-owned upgrade procedure tied to an approved release.

## Prepare a tagged candidate

Choose a new staging name for the approved tag. The `zilch-site` account has no interactive shell, so run each preparation command directly through `sudo`:

```bash
release=v1.0.2
candidate="/srv/zilch.jacobdanderson.net/staging/$release"

sudo -u zilch-site -- git clone \
  --branch "$release" \
  --single-branch \
  https://github.com/anderson-webops/zilch.jacobdanderson.net.git \
  "$candidate"

sudo -u zilch-site -- env \
  NPM_CONFIG_CACHE=/srv/zilch.jacobdanderson.net/shared/npm-cache \
  "$candidate/deploy/systemd/prepare-release.sh" "$candidate"
```

Preparation refuses root, linked worktrees, source-local environment files, dirty source, the wrong repository, a revision other than the freshly fetched `origin/main`, and a missing, lightweight, or mismatched package-version tag. It removes stale generated output, installs only from the committed lockfiles, audits dependencies and registry signatures, runs source, game, API, build, accessibility, and deployment checks, installs and tests the minimal direct API runtime, then records the complete runtime in a SHA-256 manifest.

Do not edit the candidate after preparation. The root promoter snapshots its identity and manifest, copies only the declared runtime through root-only quarantine, verifies the copied file set and hashes, and freezes the result as a root-owned read-only release before activation.

## Promote and retry

Promote only with the installed root-owned command:

```bash
sudo env PUBLIC_HOST=zilch.jacobdanderson.net \
  /usr/local/sbin/zilch-promote-release "$candidate"
```

The immutable target is named `/srv/zilch.jacobdanderson.net/releases/<tag>-<first-12-commit-characters>`. Promotion checks the public `main` and annotated tag, exact marker bytes, the complete runtime manifest, ownership and modes, Nginx syntax, API health, HTTP redirection, TLS over local IPv4 and IPv6, security and cache headers, static assets, method denial, and reserved API denial. It then atomically selects the release and enables the service only after successful verification.

If activation fails after the immutable target was created, correct the host problem and retry that exact path without rebuilding or modifying it. For example, for `v1.0.2` at commit `0123456789abcdef...`, retry `/srv/zilch.jacobdanderson.net/releases/v1.0.2-0123456789ab`. If no immutable target exists, fix the preparation failure and retry the staging candidate. Keep `main` and the tag unchanged while a release is awaiting retry.

When a previous immutable release exists, a failed activation attempts to restore and reverify it, including its prior boot-enablement state. On a failed first activation, the new selection is removed and the service is stopped and disabled. Treat any reported rollback degradation as an immediate operator incident. Never edit an immutable release in place.

## External acceptance

The promoter deliberately resolves the production hostname to the host's own loopback listeners. After it succeeds, run acceptance checks from a separate external system or network so public DNS and both network paths are actually exercised:

```bash
curl --ipv4 --fail --show-error --silent https://zilch.jacobdanderson.net/api/health
curl --ipv6 --fail --show-error --silent https://zilch.jacobdanderson.net/api/health
curl --ipv4 --fail --show-error --silent https://zilch.jacobdanderson.net/release.json
curl --ipv6 --fail --show-error --silent https://zilch.jacobdanderson.net/release.json
curl --ipv4 --head --show-error http://zilch.jacobdanderson.net/
curl --ipv6 --head --show-error http://zilch.jacobdanderson.net/
```

Confirm all of the following before declaring the release live:

- The current public A and AAAA answers are the intended host, HTTPS succeeds over both families with the correct certificate, and HTTP redirects to the fixed HTTPS hostname.
- Both `/release.json` responses are byte-identical to the selected immutable release marker and name the approved tag and full commit SHA.
- `/api/health` returns only `{ "ok": true }` with `Cache-Control: no-store`; unsafe methods return `405`; and unknown API routes return `404`.
- The root document is revalidated, hashed `/_nuxt/` assets are immutable, and the root page, social preview, SVG favicon, and security headers load over both families.
- In a real browser, a game can start, roll, select scoring dice, bank, pass turns, resume after reload, and finish Final Chase using keyboard and pointer input.

Only after external acceptance should the writable staging checkout be removed under the server's retention procedure. Keep at least the selected release and the reviewed rollback target. Never replace A or AAAA records as a shortcut for a certificate, listener, routing, or firewall failure.
