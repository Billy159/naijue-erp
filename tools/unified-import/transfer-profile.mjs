/** Synthetic distribution calibrated from aggregate moments and six public bands.
 * No document-level input. The extra 47–49-line cohorts model repeated SKU rows. */
const ordinaryApproved = [
  [[1,1152],[2,1183],[3,2],[4,1172],[5,1225]],
  [[6,565],[7,551],[8,2],[9,553],[10,564]],
  [[11,484],[12,462],[13,473],[15,471],[16,465],[17,470],[18,1],[19,2],[20,4]],
  [[21,4],[23,4],[24,1],[26,636],[27,620],[28,624],[29,1],[30,617],[31,626],[32,629],[33,1],[36,2],[37,2],[38,1],[42,1],[50,1]],
  [[51,9],[54,3],[58,1],[60,1],[61,4],[62,1],[63,1],[64,101],[65,97],[66,95],[67,95],[68,103],[69,83],[70,2],[71,93],[72,94],[73,99],[74,98],[75,103],[76,81],[77,1],[78,3],[80,4],[81,1],[82,3],[83,1],[86,1],[88,2],[91,2],[95,1],[97,1],[99,1],[100,2]],
  [[101,10],[102,2],[109,1],[110,3],[111,3],[112,1],[114,2],[115,1],[117,2],[119,2],[120,1],[126,1],[128,3],[129,1],[131,1],[134,1],[141,1],[143,1],[149,1],[156,1]],
].flat();
const draft = [[4,20],[8,12],[15,14],[30,27],[74,5],[75,5]];
const targetUniqueHits = 11_622_501;
const repeatTargets = new Map([[47,268],[48,313],[49,46]]);
const range = n => Array.from({length:n}, (_,i) => i);
const weight = row => row.length + 3;

function random(seed) {
  let state = seed;
  return n => {
    state = (Math.imul(state,1664525)+1013904223) >>> 0;
    return Math.floor(state / 4294967296 * n);
  };
}

function repeatedCohort(length, copies, repeats, extra = 0) {
  const budget = repeatTargets.get(length);
  let index = 0;
  return range(copies).map(i => ({
    length, status:'APPROVED',
    repeatMembership:range(repeats + Number(i < extra)).map(() => {
      const membership = Math.floor((index+1)*budget / (copies*repeats+extra)) -
        Math.floor(index*budget / (copies*repeats+extra));
      index++;
      return membership;
    }),
  }));
}

export function syntheticTransferDocuments() {
  const plain = (bands,status) => bands.flatMap(([length,n]) =>
    range(n).map(() => ({length,status,repeatMembership:[]})));
  const docs = [
    ...plain(ordinaryApproved,'APPROVED'), ...plain(draft,'DRAFT'),
    ...repeatedCohort(47,93,3), ...repeatedCohort(48,114,2,96), ...repeatedCohort(49,48,1),
  ];
  const pick = random(261114);
  for(let i=docs.length-1;i>0;i--){
    const j = pick(i+1);
    [docs[i],docs[j]] = [docs[j],docs[i]];
  }

  const approved = docs.filter(doc => doc.status==='APPROVED');
  const uniqueWeight = approved.reduce((sum,doc) => sum + weight(doc)*(doc.length-doc.repeatMembership.length*2),0);
  const repeatedWeight = approved.reduce((sum,doc) => sum + weight(doc)*doc.repeatMembership.reduce((a,b)=>a+b,0),0);
  const regularGoal = targetUniqueHits-repeatedWeight;
  let ideal = 0;
  let assigned = 0;
  for (const doc of docs) {
    const count = doc.length-doc.repeatMembership.length*2;
    if (doc.status==='DRAFT') {
      doc.regularMembership = 0;
      continue;
    }
    ideal += weight(doc)*count*regularGoal/uniqueWeight;
    doc.regularMembership = Math.min(count*2,Math.max(0,Math.round((ideal-assigned)/weight(doc))));
    assigned += weight(doc)*doc.regularMembership;
  }
  // One- and two-line cohorts have weights 4 and 5. Use their spare capacity
  // to land the rounded weighted hit budget without changing any document size.
  const delta = regularGoal-assigned;
  const x = range(201).map(i=>i-100).filter(i=>(delta-4*i)%5===0)
    .sort((a,b)=>(Math.abs(a)+Math.abs((delta-4*a)/5))-(Math.abs(b)+Math.abs((delta-4*b)/5)))[0];
  const y = (delta-4*x)/5;
  for (const [length, adjustment] of [[1,x],[2,y]]) {
    const direction = Math.sign(adjustment);
    const room = approved.filter(doc=>doc.length===length && doc.regularMembership+direction>=0 &&
      doc.regularMembership+direction<=2*length);
    if (room.length<Math.abs(adjustment)) throw Error('SYNTHETIC_TRANSFER_HIT_ROUNDING');
    for(const doc of room.slice(0,Math.abs(adjustment))) doc.regularMembership+=direction;
  }
  return docs;
}

export function syntheticTransferMetrics(docs) {
  const band = length => length<=5?'1-5':length<=10?'6-10':length<=20?'11-20':length<=50?'21-50':length<=100?'51-100':'101+';
  const counts = {'1-5':0,'6-10':0,'11-20':0,'21-50':0,'51-100':0,'101+':0};
  const statuses = {APPROVED:0,DRAFT:0};
  const linesByStatus = {APPROVED:0,DRAFT:0};
  let maxLines=0, assertions=0, oldCalls=0, uniqueCalls=0, oldHits=0, uniqueHits=0;
  let duplicateDocs=0, duplicates=0, approvedLengthSquared=0;
  for (const doc of docs) {
    const {length,status,repeatMembership,regularMembership}=doc;
    counts[band(length)]++;
    statuses[status]++;
    linesByStatus[status]+=length;
    maxLines=Math.max(maxLines,length);
    if(status!=='APPROVED')continue;
    const repeatedHits=repeatMembership.reduce((a,b)=>a+b,0);
    const unique=length-repeatMembership.length;
    approvedLengthSquared+=length*length;
    assertions+=weight(doc);
    oldCalls+=2*length*weight(doc);
    uniqueCalls+=2*unique*weight(doc);
    oldHits+=(regularMembership+2*repeatedHits)*weight(doc);
    uniqueHits+=(regularMembership+repeatedHits)*weight(doc);
    duplicates+=repeatMembership.length;
    duplicateDocs+=Number(repeatMembership.length>0);
  }
  return {counts,statuses,linesByStatus,maxLines,assertions,approvedLengthSquared,oldCalls,uniqueCalls,
    oldHits,uniqueHits,duplicateDocs,duplicates,hitRatio:oldHits/oldCalls,callReductionRatio:(oldCalls-uniqueCalls)/oldCalls};
}

export function syntheticTransferRows(warehouses, skus, inventoryValues) {
  const docs = syntheticTransferDocuments();
  const explicit = new Map(warehouses.map(id=>[id,new Set()]));
  for(const {warehouse_id,sku_id} of inventoryValues) explicit.get(warehouse_id).add(sku_id);
  const pick = random(739391);
  const pairs = warehouses.slice(0,-1).map((from,i)=>{
    const to=warehouses[i+1];
    const pools=[[],[],[]];
    for (const sku of skus) pools[Number(explicit.get(from).has(sku))+Number(explicit.get(to).has(sku))].push(sku);
    return {from,to,pools};
  });
  for (const doc of docs) {
    const {from,to,pools}=pairs[pick(pairs.length)];
    doc.from_warehouse_id=from;
    doc.to_warehouse_id=to;
    const cursors=pools.map(pool=>pick(pool.length));
    const choose = membership => {
      const pool = pools[membership];
      return pool[cursors[membership]++ % pool.length];
    };
    const skuIds = [];
    for (const membership of doc.repeatMembership) {
      const sku = choose(membership);
      skuIds.push(sku,sku);
    }
    const free = doc.length-skuIds.length;
    const doubled = Math.floor(doc.regularMembership/2);
    const single = doc.regularMembership%2;
    if (Math.min(...pools.map(pool=>pool.length))<doc.length) throw Error('SYNTHETIC_TRANSFER_SKU_POOL_TOO_SMALL');
    for(let i=0;i<free;i++) skuIds.push(choose(i<doubled?2:i<doubled+single?1:0));
    for(let i=skuIds.length-1;i>0;i--){
      const j=pick(i+1);
      [skuIds[i],skuIds[j]]=[skuIds[j],skuIds[i]];
    }
    doc.skuIds=skuIds;
  }
  return docs;
}
