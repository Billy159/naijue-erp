# Reproduce (bash, explicit cwd, login:false)

```bash
cd /workspace/scratch/1f717a486422/naijue-erp-dev-59c6ae50
source /workspace/scratch/1f717a486422/toolchain/use-exact-node.sh
test "$(node --version)" = v24.21.0
test "$(npm --version 2>/dev/null)" = 11.9.0
node --test tests/performance/opt00/*.test.mjs
```

This is an offline contract suite only, not full app/browser/PG acceptance. Its
fixtures do not consume credentials, `.env`, original backups or real data.

The following require **fresh** output directories/files. `EEXIST` is intentional:
never overwrite a frozen version or remove it just to make regeneration succeed.

```bash
node tests/performance/opt00/fixture-generator.mjs --outdir \
 /workspace/scratch/1f717a486422/development-results-20261031/performance-opt00/fixtures-v2
node tests/performance/opt00/http-profile.mjs --outdir \
 /workspace/scratch/1f717a486422/development-results-20261031/performance-opt00/http-profiles-v2
node tests/performance/opt00/evidence.mjs --fixture \
 /workspace/scratch/1f717a486422/development-results-20261031/performance-opt00/fixtures-v2/fixture.json \
 --out /workspace/scratch/1f717a486422/development-results-20261031/performance-opt00/pending-planning.json
node tests/performance/opt00/collect-readonly-pg.mjs --status
```

The last command reports execution-disabled/PENDING; it loads no driver and does
not connect. Real PG target/schema/SQL registration/lifecycle requires DB-owner
review. Synthetic HTTP browser collection can proceed independently, but only
through UI owner's `browser-host/**` workflow and controller coordination.

Only after production-build owner confirms a finished immutable production output:

```bash
node tests/performance/opt00/collect-bundles.mjs \
 --artifacts /ABS/OWNER_CONFIRMED_FINISHED_PRODUCTION_BUILD \
 --source /workspace/scratch/1f717a486422/development-results-20261031/cumulative-C03-work/candidate \
 --out /ABS/FRESH_OPT00_ARTIFACT_BYTES_JSON
```

No candidate build command or arbitrary SQL connection command is provided. Do not
claim actual browser/DB timing from offline tests, generated planning slots or
artifact byte counts. UI owner exclusively owns all CUA/host actions.
