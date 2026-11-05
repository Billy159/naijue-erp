import { createRoot } from 'react-dom/client';
import Empty from '@arco-design/web-react/es/Empty';
import arcoCss from '@arco-design/web-react/dist/css/arco.css?inline';
import emptyCss from '@arco-design/web-react/es/Empty/style/index.css?inline';

// Accepted product-arco.jsx local CSS, copied without changes.
const categoryCss = `
:host{display:block;min-width:0;width:100%;font:13px Arial,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--ca-ink);--arcoblue-6:var(--ca-primary-rgb);--primary-6:var(--ca-primary-rgb);--color-text-1:var(--ca-ink);--color-text-2:var(--ca-ink-2);--color-border-2:var(--ca-control-border)}
#root{width:100%;min-width:0}#portal{position:fixed;inset:0;z-index:1600;pointer-events:none}#portal>*{pointer-events:auto}
.arco-select,.arco-cascader,.arco-input-wrapper{width:100%;font-size:13px}
.arco-select-view,.arco-cascader-view,.arco-input-wrapper{box-sizing:border-box;min-height:32px;height:32px;border:1px solid transparent!important;border-radius:var(--ca-radius-control)!important;background:var(--ca-surface-muted)!important;box-shadow:none!important}
.arco-select:hover .arco-select-view,.arco-cascader:hover .arco-cascader-view,.arco-input-wrapper:hover{border-color:var(--ca-control-border-hover)!important}
.arco-select.arco-select-focused .arco-select-view,.arco-cascader.arco-cascader-focused .arco-cascader-view,.arco-input-wrapper:focus-within{border-color:var(--ca-control-focus-border)!important;box-shadow:none!important}
.arco-select-view-input,.arco-cascader-view-input,.arco-input-inner{font-size:13px!important}
.arco-select-view-tag,.arco-input-tag-tag{height:23px;line-height:23px;background:var(--ca-surface)!important;color:var(--ca-ink)!important;border:0!important}
.arco-trigger-popup{z-index:1600;max-width:calc(100vw - 24px)}
.arco-select-popup,.arco-cascader-popup{border:1px solid var(--ca-popover-border);border-radius:var(--ca-radius-card);box-shadow:var(--ca-shadow-float);background:var(--ca-popover-bg)}
.arco-select-option,.arco-cascader-option{min-height:30px;font-size:13px}
.arco-select-option:hover,.arco-cascader-option:hover{background:var(--ca-popover-hover)}
.arco-tree{font-size:13px}.arco-tree-node{min-height:30px;color:var(--ca-ink)}.arco-tree-node:hover{background:var(--ca-surface-subtle)}.arco-tree-node-selected{background:var(--ca-primary-selected)!important;color:var(--ca-primary-ink)}.arco-tree-node-title{font-size:13px}.arco-tree-node-drag-icon{color:var(--ca-ink-3)}
.product-tree-search{margin:8px 0}.arco-input-wrapper.product-tree-search{width:100%}
`;
export const originalCategoryControlCss = arcoCss + categoryCss;
interface PagerOptions {
 page:number; size:number; total:number; button:(text:string,action:string,extra?:string,style?:string)=>string;
 pageAction:string; prevAction:string; nextAction:string; jumpAction:string; selectId:string; jumpId:string;
 sizes?:number[]; unit?:string; selectAria?:string; className?:string; showJump?:boolean;
}
function paginationMarkup({page,size,total,button,pageAction,prevAction,nextAction,jumpAction,selectId,jumpId,sizes=[100,200,500],unit='款',selectAria='每页商品款数',className='',showJump=true}: PagerOptions){
 const pages=Math.max(1,Math.ceil(total/size)),nums=new Set([1,pages,page-1,page,page+1].filter(n=>n>=1&&n<=pages));let previous=0;
 const numbered=[...nums].sort((a,b)=>a-b).map(n=>{const gap=n-previous>1?'<span class="iw-page-ellipsis">…</span>':'';previous=n;return gap+button(String(n),pageAction,`data-page="${n}" aria-label="第${n}页" ${n===page?'aria-current="page"':''}`,'iw-page-number')}).join('');
 const options=sizes.map(n=>`<option value="${n}" ${size===n?'selected':''}>${n}${unit}/页</option>`).join('');
 return `<div class="iw-pagination ${className}"><select id="${selectId}" class="iw-select" aria-label="${selectAria}">${options}</select><span>共 ${total.toLocaleString('zh-CN')} ${unit}${total?`，当前第 ${(page-1)*size+1}–${Math.min(page*size,total)} ${unit}`:''}</span>${pages>1?`<div class="actions">${button('‹',prevAction,page<=1?'disabled':'aria-label="上一页"','iw-page-arrow')}${numbered}${button('›',nextAction,page>=pages?'disabled':'aria-label="下一页"','iw-page-arrow')}${showJump?`<label class="iw-jump">跳至 <input id="${jumpId}" type="text" inputmode="numeric" aria-label="目标页码" value="${page}"> 页</label>${button('跳转',jumpAction,'','iw-jump-go')}`:''}</div>`:''}</div>`;
}
/** F4 passes the exact original pager option shape at this host boundary. */
export const renderOriginalPager = (options: Record<string, unknown>): string => paginationMarkup(options as unknown as PagerOptions);

/** Original INVENTORY_EMPTY DOM/style with cleanup scoped to this one host. */
export function mountOriginalEmpty(host: HTMLElement): () => void {
 const shadow=host.shadowRoot??host.attachShadow({mode:'open'}),style=document.createElement('style'),app=document.createElement('div');
 style.textContent=`${emptyCss}
      :host{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font:13px Arial,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--ca-ink)}
      .arco-empty{padding:0}
      .arco-empty .arco-empty-wrapper{color:var(--ca-ink-3)}
      .arco-empty .arco-empty-image{font-size:56px;line-height:1;margin-bottom:12px}
      .arco-empty .arco-icon{width:1em;height:1em}
      .arco-empty .arco-empty-description{font-size:13px;color:var(--ca-ink-2)}
      .inv-empty-copy{display:flex;flex-direction:column;align-items:center;gap:6px}
      .inv-empty-copy strong{font-size:15px;line-height:22px;font-weight:600;color:var(--ca-ink)}
      .inv-empty-copy span{line-height:20px;color:var(--ca-ink-2)}
    `;
 shadow.append(style,app);const root=createRoot(app);root.render(<Empty description={<div className="inv-empty-copy"><strong>{host.dataset.title}</strong><span>{host.dataset.description}</span></div>}/>);
 return()=>{root.unmount();style.remove();app.remove();};
}
