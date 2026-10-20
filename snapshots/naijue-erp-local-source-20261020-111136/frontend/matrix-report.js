/* Business report adapter: reuse the existing typed XLSX writer and print preview. */
(function(){
  const h=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
  async function create(rows,title){
    const data=await SALES_EXPORT.create(rows),zip=await JSZip.loadAsync(data),file=zip.file('xl/workbook.xml'),xml=await file.async('string');
    const sheet=await zip.file('xl/worksheets/sheet1.xml').async('string');
    zip.file('xl/worksheets/sheet1.xml',sheet.replace(/ s="1"/g,' s="0"'));
    zip.file('xl/workbook.xml',xml.replace('name="销货单查询结果"','name="'+h(title)+'"'));
    return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
  }
  async function download(rows,title,{signal,guard=()=>true}={}){
    const check=()=>{if(signal?.aborted||!guard())throw Object.assign(Error('输出已取消或读取范围已变化'),{stale:true});};
    check();const bytes=await create(rows,title);check();
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),a=document.createElement('a');
    a.href=url;a.download=title+'.xlsx';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function inventoryPrintDocument({content,caption,productCount,cellCount}){
    return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>库存状况打印</title><style>'+
      '@page{size:A4 landscape;margin:9mm}body{font:11px Arial,"PingFang SC",sans-serif;color:#263440}table{width:100%;border-collapse:collapse;table-layout:auto}'+
      'th,td{padding:4px;overflow-wrap:break-word;border:1px solid #dce1e5;text-align:right}th{background:#f3f5f7}thead{display:table-header-group}tr{break-inside:avoid}'+
      '.identity{text-align:left}.mx-section h2{font-size:12px}.mx-section{break-inside:auto;margin-bottom:12px}.subtotal,.total{background:#f3f5f7}small{font-weight:normal}'+
      '</style></head><body><h1>库存状况表</h1><p>'+h(caption)+'</p><p>全部匹配 '+h(productCount)+' 款 · '+h(cellCount)+' 个原库存单元；未知格不计为零。</p>'+content+'</body></html>';
  }
  window.MATRIX_REPORT={create,download,inventoryPrintDocument};
})();
