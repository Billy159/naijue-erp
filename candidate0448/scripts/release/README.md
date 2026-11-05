# Production build and pack

These tools only build and verify files. They do not start the ERP, access PostgreSQL, install dependencies, connect to a server, deploy, migrate data, approve schema changes, or establish business acceptance.

Use the project Node **24.21.0** runtime. `build-production.mjs` rejects other versions and ambient `NODE_OPTIONS` / `ESBUILD_BINARY_PATH` overrides.

## Fixed export input

The builder accepts a **complete fixed export of a committed tree**, never the live WIP checkout. C first saves the intended work in a real commit, then prepares the complete exported tree with original executable modes. Do not omit files via export-ignore rules. Do not include `.git`, generated outputs, extra notes, symlinks, hardlinks, secret files, or uncommitted changes.

Place the raw bytes from `git cat-file commit FULL_COMMIT` at the export root as `.release-source-commit`. This tool does not invoke Git. It independently verifies the Git commit-object SHA1 and recursively recomputes the Git tree/blob hashes and file modes from the export. The computed tree must match the raw commit's tree. Merely writing a commit identifier or `clean:true` cannot label WIP as that commit.

The proof file and the root physical `node_modules` directory are excluded from the Git tree calculation. Dependencies must already be present as ordinary directories, from the same lock. The tool checks npm's installed lock against the committed lock for consumed packages, package versions, and actual source-input hashes; it records the esbuild native binary hash. It does not install packages or independently re-fetch npm tarball integrity. C remains responsible for the trusted dependency preparation.

The proof adds no source changes to the commit: it is tooling evidence in the exported tree. The export is checked before and after the build, and all consumed bytes are checked against committed or dependency input records. `.git` working checkouts, extra source-tree files, changed content/modes, unknown commit objects, or symlink roots fail closed.

## Build

```sh
node scripts/release/build-production.mjs \
  --source-root /ABS/fixed-export \
  --source-commit FULL_40_CHARACTER_COMMIT \
  --build-id rapid-launch-r1-UNIQUE \
  --public-config /ABS/public-production-configuration.json \
  --build-root /ABS/fresh-build-root \
  --manifest-dir /ABS/fresh-manifest-directory
```

All paths must be canonical absolute paths. Build-root and manifest-dir must not exist; their parents must exist. They must be separate from each other and from the source export. Public configuration must use F1's `naijue-erp-production-host` contract, `https://1n5635n614.goho.co`, `/api`, and `session.verifyOnMount=true`, with no secrets. These are public presentation settings; D1's private runtime configuration is never read by this tool.

The tool imports the fixed export's existing F1 `apps/web/src/production-host/build-production-host.mjs` and calls `buildProductionHost({ configuration, outdir: buildRoot/web, sourceCheckpoint })`. It reads the actual production-build receipt and raw esbuild metafile; no preview graph is reused or rewritten.

It builds D1's `apps/api/src/production-main.ts` into `backend/production-main.js` using the export's existing esbuild, `bundle:true`, `packages:'external'`, `platform:'node'`, `target:'node24'`, `format:'esm'`, and a real metafile. It never imports or runs the backend entry. Runtime external packages must remain root dependencies in the same copied package/lock, for C's later Linux runtime preparation.

All committed `adapters/postgres/migrations/NNNN_name.sql` files and package/lock files are copied byte for byte. The tool produces:

- build-root `web/`, `backend/`, `migrations/`, `package.json`, `package-lock.json`;
- manifest-dir `source-manifest.json` (`naijue-release-source-v1`) and `build-manifest.json` (`naijue-release-build-v1`);
- `build-receipt.json` only after the frozen pack validator accepts the actual inputs, output graph, HTML, and member set.

The builder does not fabricate output-graph entries for copied files. If F1 emits a CSS copy that is absent from its actual metafile, the frozen pack contract rejects it; F1/C must resolve that precise boundary, not relabel the copy as a built output. Failed fresh output directories and diagnostics remain for review; retry with new paths.

## Pack

```sh
node scripts/release/pack.mjs \
  --source-manifest /ABS/fresh-manifest-directory/source-manifest.json \
  --build-manifest /ABS/fresh-manifest-directory/build-manifest.json \
  --build-root /ABS/fresh-build-root \
  --out /ABS/fresh-release-package
```

The existing pack interface is authoritative. It emits `release.tar.gz`, `release-manifest.json`, `members.sha256`, and `pack-receipt.json` after one archive extraction/readback. Build/pack success is not deployment or real ERP acceptance.

## Tool checks

`node --test scripts/release/build-production.test.mjs` uses tiny synthetic source exports and real esbuild output graphs. It checks commit/tree binding, WIP mutation rejection, symlink/old-output rejection, and rejection of fixture inputs. These are build-tool checks only. Set `BUILD_TOOL_TEST_ROOT` to a fresh designated evidence directory; the tests leave their small fixtures and outputs there. The existing pack tests are reused, not rerun by this suite.
