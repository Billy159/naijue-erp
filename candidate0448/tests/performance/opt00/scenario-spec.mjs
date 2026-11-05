/** Preparatory catalogue, NOT a new acceptance gate. */
export const BASELINE = Object.freeze({ gitBaseline:'59c6ae509fa17caddf58b8ea05d4abdaff16e227', candidateCommit:'0905e799e69b0a486b0ae3366774c0c8fc3e7232', candidateTree:'a2735e895e7a5a233cf9c85baa2d41744c1e4e61', node:'v24.21.0', npm:'11.9.0', datasetVersion:'opt00.synthetic.v2', fixedClock:'2026-10-20T12:00:00.000Z' });
const row=(id,family)=>Object.freeze({id,family,purpose:/(history-unknown|history-revision|reopen-collapse)$/.test(id)?'correctness-only':'performance-catalogue'});
export const SCENARIOS=Object.freeze([
 ...['sales','transfer'].flatMap(kind=>['few','distinct30','lines200'].map(size=>row(`${kind}.draft.${size}`,'existing-document'))),
 ...['wide','narrow','page1','page2','page3','imported','new-sku'].map(scope=>row(`products.${scope}`,'product-list')),
 ...['sales','transfer'].flatMap(kind=>['current','history','gifts','returns','empty','limited-hall','late-page','history-unknown','history-revision'].map(scope=>row(`${kind}.list.${scope}`,'document-list'))),
 ...[100,200,500].flatMap(size=>['first-layout','settings','reopen-collapse'].map(action=>row(`inventory.${size}.${action}`,'inventory'))),
 ...['detail','edit'].flatMap(mode=>['first-open','heavy-barcode-tab'].map(action=>row(`product.${mode}.${action}`,'product-detail')))
]);
export const SAMPLE_ORDER=Object.freeze(['cold-1','repeat-1','repeat-2']);
export const FIRST_BATCH_ORDER=Object.freeze(['sales.draft.distinct30','transfer.draft.distinct30','products.wide','products.narrow','sales.list.current','sales.list.late-page','transfer.list.current','transfer.list.late-page']);
export const NEGATIVE_CASES=Object.freeze(['unpublished-inventory','incomplete-source','invalid-size-relation','missing-sku','disabled-product','foreign-hall','revoked-account','read-failure','cancel-pending','navigate-pending','late-response']);
export function getScenario(id){const found=SCENARIOS.find(row=>row.id===id);if(!found)throw new TypeError('Unknown scenario');return found;}
