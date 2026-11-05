'use strict';
// Bounded actual-CSS jsdom precedence regression. No browser, scripts, network,
// geometry measurement, computed font-rasterization or pixel-parity assertion.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const repo='/workspace/shared/naijue-erp-rewrite';
const {JSDOM}=require(require.resolve('jsdom',{paths:[repo]}));
const files=[
 'apps/web/src/demo-presentation/tokens.css',
 'apps/web/src/demo-presentation/frame.css',
 'apps/web/src/demo-presentation/controls.css',
 'apps/web/src/inventory/inventory.css',
];
const sources=files.map(name=>({name,text:fs.readFileSync(path.join(repo,name),'utf8')}));
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
const current=sources.map(({text})=>text.replace(/^@import[^;]+;/gm,'')).join('\n');
assert.match(current,/:where\(\.demo-ui\) button,:where\(\.demo-ui\) input,:where\(\.demo-ui\) select,:where\(\.demo-ui\) textarea\{font:inherit;color:inherit}/);
const markup=`<div class="demo-ui"><div class="iw-workbench">
 <div class="iw-query-actions"><button id="primary" class="iw-button iw-primary">查询</button><button id="text" class="iw-text-button">高级筛选</button></div>
 <button id="secondary" class="iw-button">普通按钮</button><button id="link" class="iw-link">查看范围</button>
 <div class="iw-pagination"><button id="pager" class="iw-page-button">2</button></div>
 <div class="iw-settings"><div class="iw-actions"><button id="ghost" class="iw-button iw-ghost">关闭</button></div></div>
 <button id="stock" class="mx-stock">-2</button><div class="iw-head"><h1 id="heading">库存状况表</h1></div><section class="mx-section"><h3 id="sectionHeading">尺码组</h3></section>
 </div></div><button id="outside">Not in the Demo</button>`;
function values(css){
 const dom=new JSDOM(`<style>${css}</style>${markup}`);
 try{return Object.fromEntries(['primary','text','secondary','link','pager','ghost','stock','heading','sectionHeading','outside'].map(id=>{
  const value=dom.window.getComputedStyle(dom.window.document.getElementById(id));
  return [id,{color:value.color,fontWeight:value.fontWeight,fontSize:value.fontSize,lineHeight:value.lineHeight}];
 }));}finally{dom.window.close();}
}
const actual=values(current);
assert.equal(actual.primary.color,'var(--ca-on-primary)');
assert.equal(actual.primary.fontWeight,'500');
assert.equal(actual.secondary.fontWeight,'500');
assert.equal(actual.text.color,'var(--ca-ink-2)');
assert.equal(actual.text.fontWeight,'400');
assert.equal(actual.link.color,'var(--ca-primary-ink)');
assert.equal(actual.pager.color,'var(--ca-ink-2)');
assert.equal(actual.ghost.color,'var(--ca-button-text)');
assert.equal(actual.ghost.fontWeight,'500');
assert.equal(actual.stock.color,'var(--ca-ink)');
assert.ok(['400','normal'].includes(actual.stock.fontWeight)); // CSS normal equals numeric 400; jsdom may canonicalize font:inherit.
assert.equal(actual.heading.fontSize,'20px');
assert.equal(actual.heading.lineHeight,'30px');
assert.equal(actual.heading.fontWeight,'600');
// JSDOM does not resolve the font-family custom property in a shorthand.
// Expand ONLY that property to its exact declared token value for an additional
// inherited-line-height oracle. All source selectors and other declarations stay.
const declaredFont=current.match(/--ca-font-sans:([^;]+);/)[1];
const resolveFont=css=>css.replaceAll('var(--ca-font-sans)',declaredFont);
const inheritedTypography=values(resolveFont(current));
assert.equal(inheritedTypography.primary.lineHeight,'1.5');
assert.equal(inheritedTypography.text.lineHeight,'1.5');
assert.equal(inheritedTypography.sectionHeading.lineHeight,'1.5');
assert.equal(inheritedTypography.sectionHeading.fontSize,'13px');
assert.equal(inheritedTypography.sectionHeading.fontWeight,'600');
const typographyBefore=values(resolveFont(current
 .replace('font:inherit;font-size:13px;color:var(--ca-ink);border-radius:4px','font:13px var(--ca-font-sans);color:var(--ca-ink);border-radius:4px')
 .replace('font-size:13px;line-height:inherit;margin:0;padding:8px 10px','font-size:13px;line-height:20px;margin:0;padding:8px 10px')));
assert.equal(typographyBefore.primary.lineHeight,'normal');
assert.equal(typographyBefore.text.lineHeight,'normal');
assert.equal(typographyBefore.sectionHeading.lineHeight,'20px');
// Deliberately reintroduce ONLY the earlier reset in memory. Demonstrate that
// final computed rule selection, not the mere presence of declarations, fails.
const before=values(current.replace(/:where\(\.demo-ui\) (button|input|select|textarea)/g,'.demo-ui $1'));
assert.equal(before.primary.color,'var(--ca-ink)');
assert.notEqual(before.primary.fontWeight,'500');
assert.equal(before.text.color,'var(--ca-ink)');
assert.equal(before.link.color,'var(--ca-ink)');
assert.deepEqual(actual.outside,before.outside);
const result={status:'pass',scope:'Actual owned CSS in jsdom; CSS custom-property role strings are compared without asserting resolved color, contrast, widths, rasterization or browser pixels.',checks:['primary white-ink role and 500 weight beat scoped reset','neutral/text/link/pager/ghost roles beat scoped reset','stock explicit normal ink and 400 weight survive reset','inventory h1 retains 20px/30px/600','outside native button unaffected by scoped reset','negative control restoring previous scoped specificity reproduces dark primary/link/text ink','exact font-token expansion confirms inherited1.5 control/section-heading line-height; previous shorthand/20px negative control reproduces differences'],actual,negativeControl:before,inheritedTypography,typographyNegativeControl:typographyBefore,sourceFiles:sources.map(({name,text})=>({path:name,sha256:hash(text)}))};
fs.writeFileSync('/workspace/shared/frozen-inventory-review/cascade-precedence.json',JSON.stringify(result,null,2)+'\n');
process.stdout.write('PASS actual-CSS cascade precedence: primary/neutral/link/pager/ghost/stock/h1; old-reset negative control reproduces dark ink; inherited1.5 line-height and old-typography negative controls pass. No real-browser/pixel claim.\n');
