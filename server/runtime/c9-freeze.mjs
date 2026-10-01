/** Validate the original C9 scope, source values and fixed result before writes. */
export function validateC9Freeze(review,freeze,rows,plan){
  const targets=new Map(review.records.map(x=>[x.skuId,x]));
  const frozen=new Map(freeze.records.map(x=>[x.skuId,x]));
  const sources=new Map(rows.map(x=>[x.sku_id,x]));
  const accepted=new Map(plan.accepted.map(x=>[x.sku_id,x]));
  if(review.review!=='C9'||review.count!==531||targets.size!==531||freeze.version!==1||freeze.count!==531
    ||freeze.scope!=='C9 only'||freeze.itemField!=='defaultBarcode'||freeze.generatedCount!==531
    ||freeze.reviewSourceSha256!==review.sourceSha256||frozen.size!==531||sources.size!==531||rows.length!==531)
    throw Error('C9_FREEZE_SCOPE_MISMATCH');
  for(const [sku,target] of targets){
    const r=sources.get(sku),f=frozen.get(sku),candidate=accepted.get(sku);
    if(!r||!f||target.sourceProduct!==r.code||f.productCode!==r.code||target.reviewId!==f.reviewId
      ||String(r.a.sourceBarcodeSchemeCode)!==target.scheme||f.scheme!==target.scheme
      ||String(r.a.defaultBarcode)!==f.sourceDefaultBarcode
      ||String(r.options.COLOR)!==target.sourceColor||f.sourceColor!==target.sourceColor
      ||String(r.options.SIZE)!==target.sourceSize||f.sourceSize!==target.sourceSize)
      throw Error('C9_FROZEN_SOURCE_CHANGED:'+target.reviewId);
    if(f.decision!=='SPEC_BARCODE'||!candidate||candidate.barcode!==f.barcode)
      throw Error('C9_FROZEN_BARCODE_CHANGED:'+target.reviewId);
    if(candidate.sourceItemField!=='defaultBarcode'||candidate.goods!==f.sourceDefaultBarcode)
      throw Error('C9_FROZEN_ITEM_FIELD_CHANGED:'+target.reviewId);
  }
  const unresolved=[...plan.issues,...plan.collisions];
  if(unresolved.length||accepted.size!==531||plan.accepted.length!==531)throw Error('C9_FREEZE_UNRESOLVED');
  return {approvedExceptions:[],unresolved};
}
