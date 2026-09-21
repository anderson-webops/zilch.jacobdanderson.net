# Zilch runtime artifact contract

The direct adapter serves a static Nuxt tree and one compiled Express probe API. [`deploy/runtime-artifact.json`](../deploy/runtime-artifact.json) independently specifies the exact Linux ARM64 runtime: entrypoints, required compiled modules, package identities, production dependencies, static assets, source identity, and writable-state declarations.

Zilch has no server-side player records, database, provider queue, generated client, native runtime binding, or durable application files. Logs remain in the existing service journal. Protected configuration, credentials, caches, and all writable state stay outside immutable releases. Adding any such dependency requires updating the contract, isolated fixtures, readiness behavior, preservation rules, and rollback compatibility.

The host compatibility contract remains `zilch-site`, `/srv/zilch.jacobdanderson.net`, `127.0.0.1:3018`, and Node 24.18.1 at `/opt/node-24.18.1/bin/node`. NP Service Request remains on `127.0.0.1:3016`. Artifact adoption does not authorize replacing a live host topology, changing DNS, or combining client services.

## Build and acceptance

Build on an unprivileged disposable Linux ARM64 runner with Node 24.18.1, npm 12.0.2, Python 3.11 or newer, and Bubblewrap with user namespaces. Start from a clean exact commit whose annotated `v<package-version>` tag peels to that revision. Load no production environment or provider data.

The release workflow runs clean installs, full and production audits, registry signatures, native-lock checks, lint, types, tests, builds, accessibility, promotion recovery tests, a fresh disposable-host bootstrap regression, and deployment checks. The bootstrap regression verifies the versioned root helper, preserved service state, legacy cache-parent hardening, a concurrent service-account cache-swap attempt, root extraction under `umask 0077`, execution by the distinct `zilch-site` UID, and static-file readability by the distinct Nginx worker UID. The workflow then creates repository-owned scratch beneath `.ai-work/runs/` and runs:

```bash
npm run package:runtime -- "$PWD/.ai-work/runs/tagged-artifact"
```

The packager copies only the declared compiled/static inputs and public manifests. It installs the independent backend production lock without fallback, audits and verifies signatures again, and rejects development or unrelated packages. The root workspace lock is provenance, not the installed server graph.

The verifier rejects private paths, undeclared native code, unsafe archive members, symlinks, version drift, source identity drift, missing production dependencies, and unsafe installed modes. Manifest format 2 records file modes. Root extraction explicitly normalizes the release root and directories to `0755`, service and static files to `0644`, and `.zilch-release-prepared.json` to root-owned `0600`. That private marker is administrative identity evidence and is not read by the Node service or Nginx. Required paths are checked independently of the archive's own inventory, preventing a self-consistent but incomplete artifact from passing. Format 1 is rejected for archives and new candidates. Its explicit compatibility flag is accepted only when directly verifying an already installed artifact-era rollback tree.

The exact archive is unpacked with an externally supplied SHA-256 digest and source commit. In a private mount, process, and network namespace, a read-only `/app` is tested without its source checkout, development dependencies, or real providers. Acceptance exercises:

- the compiled API entrypoint;
- GET and HEAD liveness/readiness with minimal, no-store responses;
- readiness failure and recovery;
- denied mutations and unknown routes;
- repeated termination signals during an open connection;
- graceful exit and restart;
- full copied-tree verification against the original archive; and
- deliberate removal of `back-end/dist/boundedRateStore.js`, which must fail both verification and startup.

Publish the archive, `SHA256SUMS`, `runtime-manifest.json`, and `acceptance.json` with the annotated release. Compare downloaded release assets against the successful tagged workflow before claiming source delivery complete. Production must unpack that archive unchanged, verify the installed contract, and exercise the candidate as `zilch-site` on a disposable loopback port before promotion. A production checkout must never run the source validator or rebuild this runtime. The obsolete `.zilch-runtime.sha256` marker is not part of this artifact format.

## Production verification

After any deployment copier, verify the staged tree with the root-installed verifier and the independently reviewed archive digest and commit. Never execute a verifier from a build-owned checkout and never regenerate an inventory from the copied tree:

```bash
sudo /usr/bin/python3 -I \
  /usr/local/libexec/zilch-release/<version>/scripts/runtime-artifact.py \
  verify /srv/zilch.jacobdanderson.net/releases/<release> \
  --archive /srv/zilch.jacobdanderson.net/quarantine/<archive>.tar.gz \
  --sha256 <published-sha256> --commit <published-full-source-commit>
```

A passing artifact test does not authorize activation. Use only the existing reviewed promotion mechanism in [`deploy/README.md`](../deploy/README.md), retain the exact prior release, and separately verify live identity, health, readiness, TLS, and both public address families. A server-origin probe using local address resolution is an origin check, not independent external-network acceptance. `builtAt` records artifact preparation time, not production activation.

Netlify remains a separate adapter that builds static Nuxt output and bundles `netlify/functions/api.ts`. Its Lambda-event tests and frontend checks remain required, but it does not consume this direct-host archive.

Changes to the administrative boundary require `npm run test:promotion` on isolated Linux and `scripts/test-bootstrap-in-vm.py --disposable-vm` on a deliberately staged fresh disposable Linux VM. The tag workflow provides both environments. The bootstrap regression's root-owned marker and absent-installation gates refuse normal hosts. Never stage that marker on production.
