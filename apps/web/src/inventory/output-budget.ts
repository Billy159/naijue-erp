/** Initial bounded-browser technical limits, not a business permission or streaming guarantee. */
export const inventoryOutputLimits=Object.freeze({rows:10000,cells:250000,rowBytes:16*1024*1024,xmlBytes:16*1024*1024,zipBytes:8*1024*1024});
export class InventoryOutputTooLargeError extends Error{constructor(){super('结果超过当前浏览器导出预算，请缩小查询范围。');this.name='InventoryOutputTooLargeError';}}
const encoder=new TextEncoder();
export class InventoryOutputBudget{
 #rows=0;#cells=0;#rowBytes=0;#xmlBytes=0;#zipBytes=0;
 reserveRow(row:readonly string[]):void{this.#rows++;this.#cells+=row.length;this.#rowBytes+=encoder.encode(JSON.stringify(row)).byteLength;if(this.#rows>inventoryOutputLimits.rows||this.#cells>inventoryOutputLimits.cells||this.#rowBytes>inventoryOutputLimits.rowBytes)throw new InventoryOutputTooLargeError();}
 reserveXml(xml:string):void{this.#xmlBytes+=encoder.encode(xml).byteLength;if(this.#xmlBytes>inventoryOutputLimits.xmlBytes)throw new InventoryOutputTooLargeError();}
 reserveZip(bytes:number):void{this.#zipBytes+=bytes;if(this.#zipBytes>inventoryOutputLimits.zipBytes)throw new InventoryOutputTooLargeError();}
}
export function assertInventoryDownloadSize(bytes:number):void{if(bytes>inventoryOutputLimits.zipBytes)throw new InventoryOutputTooLargeError();}
