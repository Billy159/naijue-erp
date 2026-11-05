/** Small reproducible inputs only. Allocates long strings only when explicitly called. */
import {detail as nativeDetail} from '../../../../apps/web/src/transfers/tests/fixtures.ts';
export const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export function epochFixture({memberNameBytes=5000}={}){
 if(!Number.isSafeInteger(memberNameBytes)||memberNameBytes<20||memberNameBytes>65536)throw Error('Use the explicitly reviewed native-text range');
 const original=nativeDetail(),oldGroups=[0,1].map(n=>({id:uid(10000+n),name:'Original group '+n,sizes:[{id:uid(20000+n),name:'S'+n,displayOrder:0}]}));
 const targetGroups=[0,1].map(n=>({id:uid(11000+n),name:'Preexisting target '+n,sizes:[oldGroups[n].sizes[0],...Array.from({length:999},(_,i)=>{const prefix=`N${n}-${String(i).padStart(3,'0')}-`;return {id:uid(30000+n*1000+i),name:prefix+'A'.repeat(memberNameBytes-prefix.length),displayOrder:i+1};})]}));
 const currentSkus=original.document.lines.map((line,n)=>({id:line.skuId,skuCode:'FINITE-'+n,productId:uid(40000+n),productCode:'P'+n,productName:'Product '+n,colorId:uid(41000),colorName:'Color',fitId:uid(42000),fitName:'Fit',sizeId:oldGroups[n].sizes[0].id,sizeName:oldGroups[n].sizes[0].name,sizeGroupId:targetGroups[n].id,barcodeAvailability:'UNAVAILABLE'}));
 original.catalog={skus:currentSkus.map(({id,skuCode,sizeName,barcodeAvailability,...row},n)=>({skuId:id,...row,sizeGroupId:oldGroups[n].id})),sizeGroups:oldGroups.map((group,n)=>({sizeGroupId:group.id,code:'OLD-'+n,name:group.name,members:group.sizes.map(size=>({sizeId:size.id,code:null,name:size.name,displayOrder:size.displayOrder}))}))};
 // All groups and all memberships already exist at BOTH epochs. Only a
 // conditional ordinary product EDIT changes product.size_group_id A -> B.
 // Group source-code order is TARGET-A, 97 fillers, 2 old groups, TARGET-Z.
 const fillers=Array.from({length:97},(_,n)=>({id:uid(50000+n),name:'Finite filler '+n,sizes:[]}));
 const dictionary=[targetGroups[0],...fillers,...oldGroups,targetGroups[1]];
 const products=currentSkus.map(row=>({id:row.productId,code:row.productCode,name:row.productName,retailPrice:null,minimumPriceAvailability:'UNAVAILABLE',sizeGroupId:row.sizeGroupId}));
 const nativeCodeOrder=['A-TARGET',...fillers.map((_,n)=>'B-'+String(n).padStart(3,'0')),'OLD-0','OLD-1','Z-TARGET'];
 return {original,currentSkus,products,oldGroups,targetGroups,dictionary,nativeCodeOrder,parameters:{groups:101,targetGroups:2,membersPerTarget:1000,totalTargetMembers:2000,memberNameBytes,preexistingDictionaryAtBothEpochs:true,onlyProposedMutation:'product.size_group_id changes from short A to preexisting B; no size/group/member/name changes'}};
}
export function tupleEnvelope(groups){return {version:1,groups:groups.map(group=>[group.id,group.name,group.sizes.map(size=>[size.id,size.name,size.displayOrder])])};}
