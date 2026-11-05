import assert from 'node:assert/strict';
import test from 'node:test';
import { productPopupPosition } from './popup-host.ts';
test('product popup viewport projection clamps right/left and flips above only when below is insufficient',()=>{
  const right=productPopupPosition({left:880,top:120,bottom:152,width:160},{width:500,height:320},{width:1000,height:800});
  assert.deepEqual(right,{width:500,maxHeight:776,left:488,top:156});
  const bottom=productPopupPosition({left:20,top:710,bottom:742,width:190},{width:300,height:320},{width:1000,height:800});
  assert.equal(bottom.top,386);assert.equal(bottom.left,20);
  const narrow=productPopupPosition({left:-50,top:20,bottom:52,width:500},{width:900,height:1000},{width:250,height:200});
  assert.equal(narrow.width,226);assert.equal(narrow.left,12);assert.equal(narrow.top,12);assert.equal(narrow.maxHeight,176);
});
