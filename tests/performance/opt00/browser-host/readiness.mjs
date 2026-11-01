/** Test-harness DOM observation only. A form shell is never an edit-ready proof.
 * @param {{document:Document,kind:'sales'|'transfer',lines:{id:string,skuId:string,quantity:string,rowKey?:string,sizeId?:string}[],dictionaryGroupIds?:string[],wantedGroupIds?:string[],wantedSizeIds?:string[],wantedGroups?:{id:string,sizeIds:string[]}[]}} input
 */
export function inspectEditReady({document,kind,lines,dictionaryGroupIds=[],wantedGroupIds=[],wantedSizeIds=[],wantedGroups=[]}) {
  const selector=kind==='sales'?'#page section.sale-workbench.sale-editor':kind==='transfer'?'#page section.transfer-editor':null;
  if(!selector)throw new TypeError('Explicit synthetic document kind required');
  const form=document.querySelector(selector);
  if(!form||form.closest('[hidden],[inert]')||form.querySelector('h1')?.textContent!==(kind==='sales'?'编辑销货单':'编辑调拨单'))return {ready:false,reason:'form-not-ready'};
  const actual=[...form.querySelectorAll(kind==='sales'?'tr[data-entry-row] input[aria-label="本行数量"]':'input[data-transfer-quantity][data-transfer-row][data-transfer-size]')].filter(node=>!node.closest('[hidden],[inert]'));
  const byId=new Map();
  const lineKey=line=>kind==='sales'?line.id:JSON.stringify([line.rowKey,line.sizeId]);
  const wanted=new Set(lines.map(lineKey));
  for(const node of actual){const id=kind==='sales'?node.closest('tr[data-entry-row]').getAttribute('data-entry-row'):JSON.stringify([node.getAttribute('data-transfer-row'),node.getAttribute('data-transfer-size')]);if(byId.has(id))return {ready:false,reason:'duplicate-input-identity'};byId.set(id,node);if(!wanted.has(id)&&!node.disabled&&node.value!=='')return {ready:false,reason:'unexpected-filled-line'};}
  for(const line of lines){const node=byId.get(lineKey(line));if(!node||node.disabled||node.value!==line.quantity)return {ready:false,reason:'saved-line-not-editable'};}
  if(kind==='transfer'){
    if(!wantedGroupIds.length||wantedGroupIds.some(id=>!dictionaryGroupIds.includes(id)))return {ready:false,reason:'dictionary-not-complete'};
    const groups=new Set([...form.querySelectorAll('.mx-section[data-size-system]')].map(node=>node.getAttribute('data-size-system')));
    if(wantedGroupIds.some(id=>!groups.has(id)))return {ready:false,reason:'dictionary-group-not-rendered'};
    if(!wantedGroups.length)return {ready:false,reason:'per-group-axis-proof-required'};
    for(const wantedGroup of wantedGroups){const sections=[...form.querySelectorAll('.mx-section[data-size-system]')].filter(section=>section.getAttribute('data-size-system')===wantedGroup.id);const axes=new Set(sections.flatMap(section=>[...section.querySelectorAll('thead th[data-size-id]')].map(node=>node.getAttribute('data-size-id'))).filter(Boolean));if(axes.size!==wantedGroup.sizeIds.length||wantedGroup.sizeIds.some(id=>!axes.has(id)))return {ready:false,reason:'wrong-group-axis'};}
    const axes=new Set([...form.querySelectorAll('th[data-size-id]')].map(node=>node.getAttribute('data-size-id')));
    if(wantedSizeIds.some(id=>!axes.has(id)))return {ready:false,reason:'dictionary-axis-not-rendered'};
  }
  return {ready:true,reason:'all-saved-quantities-editable',savedLineCount:lines.length,matchedInputCount:lines.length,actualInputCount:actual.length,
    matchedInputs:lines.map(line=>{const key=lineKey(line),node=byId.get(key);return {key,value:node.value,disabled:node.disabled};}),
    ...(kind==='transfer'?{dictionaryGroupIds:[...dictionaryGroupIds],renderedSizeIds:[...new Set([...form.querySelectorAll('th[data-size-id]')].map(node=>node.getAttribute('data-size-id')))]}:{})};
}
