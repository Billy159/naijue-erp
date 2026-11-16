// Review component for the next isolated synthetic deployment, no CLI or DB connector.
// The build must stage the two pinned D1 files next to the existing stream modules.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {requestHash} from '../../packages/application/src/request-hash.ts';
import {HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256, sha256} from '../../packages/application/src/unified-import-contract.ts';
import {assertWholeSalesAdmissionV1} from '../../scripts/release/unified-install/whole-sales-admission-v1.mjs';
import {assertStreamProgramRequestSize} from './stream-program.mjs';
import {streamTypedHash, typedHashArray} from './stream-typed-hash.mjs';
import {compileMixedSyntheticPackage,writeMixedSyntheticPackage} from './mixed-transfer-profile-generator.mjs';

export const input = Object.freeze({
  manifestSha256:'7d403ffcf72a5e1d849004ed97df624850e525dff09bebfa777633a69633deab',
  scopeSha256:'c5d5939d20d79b1ef158043f760b00755c0547d04d60c4b33aac8bbf1edd1845',
  rows:511234,registryRows:470718,forecastStepCount:44682,
});

export async function prepareFullSizeSynthetic(fixtureDir) {
  const fixture = await writeMixedSyntheticPackage(fixtureDir,{
    scale:'full',baseProfile:false,hallExtraRefs:1,hallExtraRefPercent:90,
  });
  if (fixture.manifestSha256!==input.manifestSha256 || fixture.evidence.scope.sha256!==input.scopeSha256 ||
      fixture.expected.rows!==input.rows || fixture.expected.registryRows!==input.registryRows) {
    throw Error('MIXED_FULL_SYNTHETIC_FIXTURE_DIFFERS');
  }
  return input;
}

function stepName({method,request:{payload}}) {
  switch (method) {
    case 'masterChunk':return 'MASTER';
    case 'baselineKeys':return 'KEYS';
    case 'publish':return payload.phase==='BASELINE'?'BASELINE_PUBLISH':'DOCUMENT_PUBLISH';
    case 'documentChunk':return payload.mode==='STAGE'?'DOCUMENT_STAGE':'DOCUMENT_CHUNK';
    default:throw Error('MIXED_FULL_UNKNOWN_STEP');
  }
}

// Never escape the genuine same-client catalog-admission callback. Retain the
// owned index and graph for measuring and consuming the same program.
export async function withFullSizeSynthetic({fixtureDir,reportDir,target,client,admission},work) {
  if (!client || assertWholeSalesAdmissionV1(admission,target,client)!==
      HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256) {
    throw Error('MIXED_FULL_V2_ADMISSION_REQUIRED');
  }
  const raw = await readFile(join(fixtureDir,'package','manifest.json'));
  if (sha256(raw)!==input.manifestSha256) throw Error('MIXED_FULL_SYNTHETIC_MANIFEST_DIFFERS');

  const started = performance.now();
  const program = await compileMixedSyntheticPackage(fixtureDir,reportDir,{target,historicalSalesAdmission:admission});
  const prepareMs = performance.now()-started;
  try {
    const {identity,initialize} = program;
    if (identity.packageSha256!==input.manifestSha256 || initialize.payload.mode!=='NEW_EMPTY' ||
        initialize.payload.explicit_zero_approval?.sha256!==input.scopeSha256) {
      throw Error('MIXED_FULL_SYNTHETIC_PROGRAM_DIFFERS');
    }

    // One walkthrough for both the exact A-compatible typed hash and wire
    // metrics. The original writer later streams the same prepared program once.
    const phases = {};
    let rowCount = 0;
    let stepCount = 0;
    let maxStepWireBytes = 0;
    const measured = (async function*() {
      const iterator = program.steps[Symbol.asyncIterator]();
      try {
        for (;;) {
          const before = performance.now();
          const next = await iterator.next();
          if (next.done) break;
          const took = performance.now()-before;
          const step = next.value;
          const name = stepName(step);
          const bytes = assertStreamProgramRequestSize(step.request,name).wire_bytes;
          const rows = step.request.payload.rows?.length??0;
          const phase = phases[name]??={count:0,rows:0,totalWireBytes:0,maxWireBytes:0,cursorMs:0};
          phase.count++;
          phase.rows+=rows;
          phase.totalWireBytes+=bytes;
          phase.maxWireBytes=Math.max(phase.maxWireBytes,bytes);
          phase.cursorMs+=took;
          rowCount+=rows;
          stepCount++;
          maxStepWireBytes=Math.max(maxStepWireBytes,bytes);
          yield step;
        }
      } finally {
        if (typeof iterator.return==='function') await iterator.return();
      }
    })();
    const measureStarted = performance.now();
    const stepsSha256 = await streamTypedHash(typedHashArray(measured));
    const measureMs = performance.now()-measureStarted;
    const initializer = assertStreamProgramRequestSize(initialize,'INITIALIZE');
    if (rowCount!==input.rows) throw Error('MIXED_FULL_SYNTHETIC_ROW_COUNT_DIFFERS');
    const binding = Object.freeze({
      ...identity,
      importTargetSha256:requestHash(target),
      initializerOperationId:initialize.operation_id,
      initializerRequestKey:initialize.request_key,
      initializeRequestSha256:requestHash(initialize),stepsSha256,
      stepCount,stepCounts:Object.freeze(Object.fromEntries(Object.entries(phases).map(([k,v])=>[k,v.count]))),
      initializeWireBytes:initializer.wire_bytes,maxStepWireBytes,
    });
    const index = JSON.parse(await readFile(join(reportDir,'summary.json'),'utf8'));
    const metrics = {rowCount,stepCount,forecastStepCount:input.forecastStepCount,
      forecastMatches:stepCount===input.forecastStepCount,prepareMs,measureMs,initializer,phases,
      nodeRssHighWaterBytes:process.resourceUsage().maxRSS*1024,
      indexBytes:index.index_bytes,indexSha256:index.index_sha256,totalStepWireBytes:
        Object.values(phases).reduce((sum,phase)=>sum+phase.totalWireBytes,0)};
    if (assertWholeSalesAdmissionV1(admission,target,client)!==
        HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256) throw Error('MIXED_FULL_V2_ADMISSION_REQUIRED');
    return await work(client,program,binding,metrics);
  } finally {
    await program.dispose();
  }
}
