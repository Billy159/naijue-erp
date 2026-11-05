# Fresh35 source binding drift, 2026-11-04 18:11 UTC

The complete postcondition tests previously passed 5/5 using the current real178 source binding. A later parallel source edit changed a file included in the whole-sales source spec. No database operation was performed. The evidence hashes and source checks are unchanged; the matching check now refuses the successor.

Observed predecessor evidence source spec: `396d45bd8303a6f8e0e453e93467f4f17643a835e5f0b6574864d37df4f1a81a`.
Current source spec observed before rerun: `1252b5382664ff8bcfdeaefd646306cdfdf11abf7437ec678c806a9940cc6a15`.

The following rerun is preserved as a failure log, not a regression pass or a new-target failure. Exact source differences are pending reconciliation; no pin is rewritten to hide them.

```text
✔ postcondition renderer refuses caller invented metadata/complete flags (4.931121ms)
✖ pinned real178 metadata projects exact full152 definitions, ACL and structural cohorts (1586.912016ms)
✖ metadata derivation rejects body/source/mapping drift and does not treat a cloned evidence as pinned (1279.513373ms)
✖ complete postcondition source binds original dump, mapped schema and every declared collection (1418.639489ms)
✖ a genuine metadata object with changed mapped source still rejects (3082.633583ms)
ℹ tests 5
ℹ suites 0
ℹ pass 1
ℹ fail 4
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7914.347592

✖ failing tests:

test at tests/fresh35-catalog-postconditions.test.mjs:10:1
✖ pinned real178 metadata projects exact full152 definitions, ACL and structural cohorts (1586.912016ms)
  Error: FRESH35_POSTCONDITION_PREDECESSOR_SOURCE_DIFFERS
      at need (file:///workspace/scratch/f6bee04e937b/erp-unified-latest-20261102/scripts/release/unified-install/fresh35-catalog-postconditions.mjs:13:37)
      at projectFresh35CoreMetadata (file:///workspace/scratch/f6bee04e937b/erp-unified-latest-20261102/scripts/release/unified-install/fresh35-catalog-postconditions.mjs:48:37)
      at TestContext.<anonymous> (file:///workspace/scratch/f6bee04e937b/erp-unified-latest-20261102/tests/fresh35-catalog-postconditions.test.mjs:11:110)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/fresh35-catalog-postconditions.test.mjs:17:1
✖ metadata derivation rejects body/source/mapping drift and does not treat a cloned evidence as pinned (1279.513373ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /ROUTINE_SOURCE_DIFFERS/. Input:
  
  'Error: FRESH35_POSTCONDITION_PREDECESSOR_SOURCE_DIFFERS'
  
      at TestContext.<anonymous> (file:///workspace/scratch/f6bee04e937b/erp-unified-latest-20261102/tests/fresh35-catalog-postconditions.test.mjs:19:86)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: Error: FRESH35_POSTCONDITION_PREDECESSOR_SOURCE_DIFFERS
        at need (file:///workspace/scratch/f6bee04e937b/erp-unified-latest-20261102/scripts/release/unified-install/fresh35-catalog-postconditions.mjs:13:37)
        at projectFresh35CoreMetadata (file:///workspace/scratch/f6bee04e937b/erp-unified-latest-20261102/scripts/release/unified-install/fresh35-catalog-postconditions.mjs:48:37)
        at file:///workspace/scratch/f6bee04e937b/erp-unified-latest-20261102/tests/fresh35-catalog-postconditions.test.mjs:19:97
        at getActual (node:assert:611:5)
        at strict.throws (node:assert:759:24)
        at TestContext.<anonymous> (file:///workspace/scratch/f6bee04e937b/erp-unified-latest-20261102/tests/fresh35-catalog-postconditions.test.mjs:19:86)
        at async Test.run (node:internal/test_runner/test:1409:7)
        at async Test.processPendingSubtests (node:internal/test_runner/test:974:7),
    expected: /ROUTINE_SOURCE_DIFFERS/,
    operator: 'throws',
    diff: 'simple'
  }

test at tests/fresh35-catalog-postconditions.test.mjs:24:1
✖ complete postcondition source binds original dump, mapped schema and every declared collection (1418.639489ms)
  Error: FRESH35_POSTCONDITION_PREDECESSOR_SOURCE_DIFFERS
      at need (file:///workspace/scratch/f6bee04e937b/erp-unified-latest-20261102/scripts/release/unified-install/fresh35-catalog-postconditions.mjs:13:37)
      at projectFresh35CoreMetadata (file:///workspace/scratch/f6bee04e937b/erp-unified-latest-20261102/scripts/release/unified-install/fresh35-catalog-postconditions.mjs:48:37)
      at buildFresh35CatalogPostconditions (file:///workspace/scratch/f6bee04e937b/erp-unified-latest-20261102/scripts/release/unified-install/fresh35-catalog-postconditions.mjs:114:94)
      at TestContext.<anonymous> (file:///workspace/scratch/f6bee04e937b/erp-unified-latest-20261102/tests/fresh35-catalog-postconditions.test.mjs:25:111)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/fresh35-catalog-postconditions.test.mjs:34:1
✖ a genuine metadata object with changed mapped source still rejects (3082.633583ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /METADATA_SCHEMA_DIFFERS/. Input:
  
  'Error: FRESH35_POSTCONDITION_PREDECESSOR_SOURCE_DIFFERS'
  
      at TestContext.<anonymous> (file:///workspace/scratch/f6bee04e937b/erp-unified-latest-20261102/tests/fresh35-catalog-postconditions.test.mjs:42:9)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: Error: FRESH35_POSTCONDITION_PREDECESSOR_SOURCE_DIFFERS
        at need (file:///workspace/scratch/f6bee04e937b/erp-unified-latest-20261102/scripts/release/unified-install/fresh35-catalog-postconditions.mjs:13:37)
        at projectFresh35CoreMetadata (file:///workspace/scratch/f6bee04e937b/erp-unified-latest-20261102/scripts/release/unified-install/fresh35-catalog-postconditions.mjs:48:37)
        at buildFresh35CatalogPostconditions (file:///workspace/scratch/f6bee04e937b/erp-unified-latest-20261102/scripts/release/unified-install/fresh35-catalog-postconditions.mjs:114:94)
        at file:///workspace/scratch/f6bee04e937b/erp-unified-latest-20261102/tests/fresh35-catalog-postconditions.test.mjs:42:20
        at getActual (node:assert:611:5)
        at strict.throws (node:assert:759:24)
        at TestContext.<anonymous> (file:///workspace/scratch/f6bee04e937b/erp-unified-latest-20261102/tests/fresh35-catalog-postconditions.test.mjs:42:9)
        at async Test.run (node:internal/test_runner/test:1409:7)
        at async Test.processPendingSubtests (node:internal/test_runner/test:974:7),
    expected: /METADATA_SCHEMA_DIFFERS/,
    operator: 'throws',
    diff: 'simple'
  }

```

## 精确差异诊断（18:12 UTC）

唯一改变whole-sales sourceSpec的已定位文件是 `tools/unified-import/stream-import-cli.mjs`，由并行“Fresh35早期失败诊断”任务编辑：

- before SHA256: `b3f59717d979f499067b1ac7639d641f9750df334b5c6107e17c479bcf0cd4c8`
- after SHA256: `e43218ea85f0584630222cbdfc79f53b7784d9e68804114da78bcd0b40e8e070`

改动为help元数据、usage参数、option白名单及参数解析后的Fresh35 NOT_STARTED早期返回。仅在内存把这一条before SHA代入当前sourceSpec的JSON计算公式，结果精确回到旧证据 `396d45bd…f1a81a`。这只是定位证据，没有写回任何pin、原文件或源spec，也没有将旧证据重新标成当前spec。负责该文件的worker已暂停后续改动并保全前后版本。
