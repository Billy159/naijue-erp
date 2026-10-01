/** Verify every C8 source identity and result before any barcode write. */
export function validateC8Freeze(review,freeze,rows,plan,existing){
  const targets=new Map(review.records.map(x=>[x.skuId,x]));
  const frozen=new Map(freeze.records.map(x=>[x.skuId,x]));
  const sources=new Map(rows.map(x=>[x.sku_id,x]));
  const accepted=new Map(plan.accepted.map(x=>[x.sku_id,x]));
  const approvedExceptions=[];
  if(freeze.version!==2||freeze.itemField!=='defaultBarcode'||freeze.generatedCount!==163||freeze.approvedExceptionCount!==0
    ||review.count!==163||freeze.count!==163||targets.size!==163||frozen.size!==163||rows.length!==163||sources.size!==163
    ||freeze.reviewSourceSha256!==review.sourceSha256)throw Error('C8_FREEZE_SCOPE_MISMATCH');
  for(const [sku,target] of targets){
    const r=sources.get(sku),f=frozen.get(sku),candidate=accepted.get(sku);
    if(!r||!f||f.reviewId!==target.reviewId||r.code!==target.sourceProduct||r.code!==f.productCode
      ||String(r.a.sourceBarcodeSchemeCode)!==f.scheme||String(r.a.defaultBarcode)!==f.sourceDefaultBarcode
      ||String(r.options.COLOR)!==f.sourceColor||String(r.options.SIZE)!==f.sourceSize)throw Error('C8_FROZEN_SOURCE_CHANGED:'+target.reviewId);
    if(f.decision==='SPEC_BARCODE'){
      if(!candidate||candidate.barcode!==f.barcode)throw Error('C8_FROZEN_BARCODE_CHANGED:'+target.reviewId);
      if(candidate.sourceItemField!=='defaultBarcode'||candidate.goods!==f.sourceDefaultBarcode)throw Error('C8_FROZEN_ITEM_FIELD_CHANGED:'+target.reviewId);
    }else throw Error('C8_FREEZE_UNKNOWN_DECISION:'+target.reviewId);
  }
  const unresolved=[...plan.issues,...plan.collisions];
  if(unresolved.length||accepted.size!==163||plan.accepted.length!==163)throw Error('C8_FREEZE_UNRESOLVED');
  return {approvedExceptions,unresolved};
}
