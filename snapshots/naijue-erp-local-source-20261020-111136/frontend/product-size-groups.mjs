/** Current group defaults only. Historical sizes are never candidates here. */
export function currentSizeGroups(){
 const definitions=[
  ['UPPER','男装上衣尺码',['165/S','170/M','175/L','180/XL','185/2XL','190/3XL','195/4XL','200/5XL','205/6XL','无尺码']],
  ['PANTS','男装裤子尺码',['30','31','32','33','34','35','36','38','40','无尺码']],
  ['WOMEN','女装尺码组',['150/XS','155/S','160/M','165/L','170/XL','175/2XL','180/3XL','185/4XL','190/5XL','195/6XL','无尺码']],
  ['SHOES','鞋码',['38','39','40','41','42','43','44']],
  ['KIDS','童装尺码',['90','100','110','120','130','140']],
  ['FREE','配饰均码',['均码']]
 ];
 const groups=definitions.map(([id,name,names])=>({id,name,sizes:names.map((name,index)=>({id:id+'-demo-size-'+index,name,code:''}))}));
 for(const [group,id,name] of [['UPPER','UPPER-2026-size-xs','160/XS'],['PANTS','PANTS-2026-size-29','29'],['FREE','FREE-2026-size-none','无尺码']])groups.find(x=>x.id===group).sizes.unshift({id,name,code:''});
 // Codes from the user's six-group crosswalk. Existing size IDs stay stable.
 for(const group of groups)for(const [index,size] of group.sizes.entries()){
  if(['UPPER','PANTS','WOMEN'].includes(group.id))size.code=size.name==='无尺码'?'900':String(({UPPER:201,PANTS:901,WOMEN:251})[group.id]+index);
 }
 return groups;
}

/** Apply accepted display decisions; the original SKU/code/name are retained. */
export function currentSizeMapping(row){
 const groups=currentSizeGroups(),female=/女装/.test(row.target[0]);
 const groupId=female?'WOMEN':row.targetGroup,group=groups.find(x=>x.id===groupId);
 let name=row.targetSize;
 if(row.sourceSize==='无尺码')name='无尺码';
 else if(female){
  // The earlier audit normalized some women's names against the men's group.
  // Use the preserved target label (height + letter) before that normalization.
  const originalName=String(row.target[3]||row.sourceSize),height=originalName.match(/^(\d{3})\//),letter=originalName.match(/(?:^|[ /])((?:[2-6])?XL|XS|S|M|L)$/);
  if(height&&letter)name=height[1]+'/'+letter[1];
 }
 else if(groupId==='PANTS'){const letter=String(name).split('/').at(-1),index=['XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'].indexOf(letter);if(index>=0)name=['29','30','31','32','33','34','35','36','38','40'][index];}
 const size=group?.sizes.find(x=>x.name===name);
 return size?{...row,targetGroup:groupId,targetSize:name,issue:null,target:[group.name,row.target[1],size.code||row.target[2],name],originalTarget:row.target,originalIssue:row.issue}:row;
}
