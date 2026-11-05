/* UI PROTOTYPE ONLY. Synthetic data; no API, database or durable storage. */
(function(root){
 const warehouses=[{id:'main',name:'总仓'},{id:'outlet',name:'网点仓'},{id:'wenzhou',name:'温州仓'},{id:'reserve',name:'备货仓'}];
 const products=[
 {id:'M26001',name:'商务免烫衬衫',category:'衬衫',fit:'常规版',price:239,enabled:true,colors:['藏青','白色'],sizes:['M','L','XL','2XL'],stock:{main:[[12,18,9,0],[7,14,11,6]],outlet:[[4,6,3,2],[2,5,3,1]],wenzhou:[[3,3,2,1],[1,4,2,1]],reserve:[[0,2,-1,0],[1,2,0,0]]}},
 {id:'M26002',name:'细条纹衬衫',category:'衬衫',fit:'修身版',price:219,enabled:true,colors:['蓝白','灰白','黑白'],sizes:['M','L','XL','2XL'],stock:{main:[[6,23,16,3],[4,7,6,0],[2,8,4,1]],outlet:[[2,8,5,1],[1,2,2,0],[0,2,1,0]],wenzhou:[[1,3,2,0],[0,1,1,0],[1,1,0,0]],reserve:[[0,1,2,0],[1,0,-2,0],[0,0,1,0]]}},
 {id:'M26003',name:'牛津纺衬衫',category:'衬衫',fit:'常规版',price:269,enabled:false,colors:['浅灰','浅蓝'],sizes:['M','L','XL','2XL'],stock:{main:[[8,20,12,4],[4,10,8,2]],outlet:[[2,4,3,1],[1,2,2,0]],wenzhou:[[1,2,1,0],[0,1,1,0]],reserve:[[0,0,1,0],[0,1,0,0]]}},
 {id:'M26004',name:'多色商务休闲裤',category:'裤装',fit:'直筒版',price:299,enabled:true,colors:['黑色','藏青','炭灰','浅灰','卡其','米白','深棕','军绿'],sizes:['29','30','31','32','33','34'],stock:{}}
 ];
 for(let w=0;w<warehouses.length;w++)products[3].stock[warehouses[w].id]=products[3].colors.map((_,c)=>products[3].sizes.map((_,s)=>w===3&&c===5&&s===2?-2:(c*3+s*5+w*2)%19));
 const sum=a=>a.reduce((x,y)=>x+y,0);
 function matrix(product,ids){return product.colors.map((_,c)=>product.sizes.map((_,s)=>sum(ids.map(w=>product.stock[w][c][s]))));}
 function totals(m){const cols=m.length?m[0].map((_,s)=>sum(m.map(r=>r[s]))):[];return {rows:m.map(sum),cols,total:sum(cols)};}
 function total(product,ids=warehouses.map(w=>w.id)){return totals(matrix(product,ids)).total;}
 function negativeCells(product,ids){return sum(ids.map(w=>sum(product.stock[w].map(r=>r.filter(v=>v<0).length))));}
 function transferSummary(product,from,quantities){let count=0,units=0,short=0,invalid=0;for(const [key,raw] of Object.entries(quantities)){if(raw==='')continue;const [c,s]=key.split(':').map(Number),n=Number(raw);if(!Number.isSafeInteger(n)||n<0||n>99999){invalid++;continue;}if(n===0)continue;count++;units+=n;short+=Math.max(0,n-product.stock[from][c][s]);}return {count,units,short,invalid};}
 const api={warehouses,products,sum,matrix,totals,total,negativeCells,transferSummary};root.ERP_DEMO=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
