/* Arco Select island for the existing inventory search field. The Demo remains static. */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Select from '@arco-design/web-react/es/Select';
import Tag from '@arco-design/web-react/es/Tag';
import Image from '@arco-design/web-react/es/Image';
import Popover from '@arco-design/web-react/es/Popover';
import Empty from '@arco-design/web-react/es/Empty';
import IconSearch from '@arco-design/web-react/icon/react-icon/IconSearch';
import arcoCss from '@arco-design/web-react/dist/css/arco.css?inline';
import emptyCss from '@arco-design/web-react/es/Empty/style/index.css?inline';

const bridge = window.INVENTORY_SELECT_BRIDGE;
const css = `
:host{display:block;width:100%;min-width:0;font:13px Arial,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--ca-ink);--arcoblue-6:var(--ca-primary-rgb);--primary-6:var(--ca-primary-rgb);--color-text-1:var(--ca-ink);--color-text-2:var(--ca-ink-2);--color-border-2:var(--ca-control-border)}
#root{width:100%;min-width:0}
#portal{position:fixed;inset:0;z-index:1600;pointer-events:none}
#portal>*{pointer-events:auto}
.arco-select{display:block;width:100%;font-size:13px}
.arco-select .arco-select-view{height:32px;min-height:32px;max-height:32px;overflow:hidden;border:1px solid transparent;border-radius:var(--ca-radius-control);background:var(--ca-surface-muted);box-shadow:none}
.arco-select:hover .arco-select-view{border-color:transparent;background:var(--ca-surface-muted)}
.arco-select.arco-select-focused .arco-select-view{border-color:var(--ca-control-focus-border);background:var(--ca-surface-muted);box-shadow:none}
.arco-select.arco-select-focused:not(.inv-has-tags) .arco-select-view{background:var(--ca-surface)}
.arco-select .arco-input-tag,.arco-select .arco-input-tag:hover,.arco-select .arco-input-tag.arco-input-tag-focus{background:transparent!important}
.arco-select .arco-input-tag-view,.arco-select .arco-input-tag-inner{min-width:0}
.arco-select .arco-input-tag-inner{flex-wrap:nowrap;white-space:nowrap}
.arco-select .arco-input-tag .arco-input-tag-tag,
.arco-select.arco-select-focused .arco-input-tag .arco-input-tag-tag{height:23px;line-height:23px;max-width:none;flex:none;white-space:nowrap;background:var(--ca-surface);color:var(--ca-ink);border:0;border-radius:3px;box-shadow:none}
.arco-select .arco-tag-content{overflow:visible;text-overflow:clip;white-space:nowrap}
.arco-select .inv-tag{display:inline-flex;align-items:center;gap:2px;height:23px;max-width:none;padding:0 4px 0 7px;border:0;border-radius:3px;background:var(--ca-surface);color:var(--ca-ink);white-space:nowrap}
.inv-tag-copy{border:0;padding:0;background:transparent;color:inherit;font:inherit;line-height:21px;cursor:copy;white-space:nowrap}
.inv-tag-copy:focus-visible{outline:1px solid var(--ca-control-focus-border);outline-offset:1px}
.arco-select .inv-tag .arco-tag-close-icon{margin-left:0}
.arco-select .arco-tag-close-icon,.arco-select .arco-icon-hover{color:var(--ca-ink-2)}
.arco-select .arco-input-tag .arco-input-tag-tag:has(.inv-count),
.arco-select.arco-select-focused .arco-input-tag .arco-input-tag-tag:has(.inv-count){padding-inline:3px;border:0;background:transparent}
.inv-count{white-space:nowrap;color:var(--ca-ink-2);font-size:12px}
.arco-select-view input{font-size:13px;min-width:42px;background:transparent}
.arco-select-view .arco-select-view-suffix{flex:none}
.arco-trigger-popup{max-width:calc(100vw - 24px)}
.arco-select-popup{padding:0;border:1px solid var(--ca-popover-border);border-radius:var(--ca-radius-card);box-shadow:var(--ca-shadow-float);background:var(--ca-popover-bg)}
.arco-select-popup:has(.inv-menu-grid){border:0;box-shadow:none;background:transparent}
.arco-select-popup-inner{max-height:320px;overflow:auto;padding:4px!important}
.arco-select-option{display:flex;align-items:center;min-height:36px;padding:4px 8px!important;color:var(--ca-ink)!important;background:var(--ca-popover-bg);font-size:13px}
.arco-select-option-selected{background:var(--ca-surface-subtle)!important;color:var(--ca-ink)!important}
.arco-select-option-hover{background:var(--ca-popover-hover)!important;color:var(--ca-ink)!important}
.arco-select-option-disabled{background:var(--ca-popover-bg)!important;color:var(--ca-disabled-ink)!important}
.arco-select-option-content{width:100%;min-width:0}
.inv-menu-grid{display:grid;grid-template-columns:var(--inv-list-width) minmax(0,1fr);gap:8px;align-items:start;min-height:0}
.inv-menu-grid-empty{display:block;min-height:0}
.inv-menu-list{min-width:0;min-height:0;overflow:hidden;border:1px solid var(--ca-popover-border);border-radius:var(--ca-radius-card);box-shadow:var(--ca-shadow-float);background:var(--ca-popover-bg)}
.inv-result-heading{display:grid;grid-template-columns:170px minmax(0,1fr);gap:10px;align-items:center;min-height:28px;padding:4px 12px;border-bottom:1px solid var(--ca-line);color:var(--ca-ink-2);font-size:12px;font-weight:400}
.inv-menu-list .arco-select-popup-inner{box-sizing:border-box;max-height:306px;overflow-y:auto;padding:2px 4px!important;scrollbar-gutter:stable}
.inv-menu-list .arco-select-option-wrapper{display:flex;align-items:center;min-height:30px;max-height:30px;margin:0;padding:0}
.inv-menu-list .arco-select-checkbox{display:none}
.inv-menu-list .arco-select-option{box-sizing:border-box;flex:1;height:30px;min-height:30px;padding:4px 8px!important}
.inv-option-row{display:flex;gap:10px;align-items:center;width:100%;min-width:0;color:var(--ca-ink)}
.inv-option-code{flex:none;width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:400;color:var(--ca-ink);font-variant-numeric:tabular-nums}
.inv-option-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:400;color:var(--ca-ink-2)}
.inv-preview{box-sizing:border-box;min-width:0;padding:8px 10px;background:var(--ca-surface-subtle);border-radius:var(--ca-radius-card);box-shadow:var(--ca-shadow-float);color:var(--ca-ink)}
.inv-preview-title{margin-bottom:6px;font-size:13px;line-height:18px;font-weight:600;color:var(--ca-ink-2)}
.inv-photo-grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px 4px;align-items:start;margin-bottom:10px}
.inv-photo-item{display:block;min-width:0;cursor:zoom-in;outline:none}
.inv-photo-tile{box-sizing:border-box;display:block;width:100%;aspect-ratio:1;padding:2px;border-radius:3px;background:var(--ca-surface);overflow:hidden}
.inv-photo-item:hover .inv-photo-tile,.inv-photo-item:focus-visible .inv-photo-tile{box-shadow:inset 0 0 0 1px var(--ca-control-focus-border)}
.inv-photo-tile .arco-image{display:block!important;width:100%!important;height:100%!important;background:var(--ca-surface)}
.inv-photo-tile .arco-image-img{width:100%!important;height:100%!important;object-fit:cover;object-position:center 35%}
.inv-photo-label{display:block;overflow:hidden;margin-top:3px;text-align:center;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:16px;color:var(--ca-ink-2)}
.inv-photo-zoom .arco-popover-inner{padding:8px}
.inv-photo-zoom-content .arco-image{display:block;background:var(--ca-surface-muted)}
.inv-photo-zoom-content .arco-image-img{width:100%!important;height:100%!important;object-fit:contain}
.inv-photo-zoom-label{display:block;margin-top:5px;text-align:center;color:var(--ca-ink);font-size:12px}
.inv-preview-info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 10px;font-size:14px;line-height:20px}
.inv-preview-field{min-width:0;overflow-wrap:anywhere}
.inv-preview-field small{font-size:13px;color:var(--ca-ink-2)}
.inv-preview-no-photo{margin:2px 0 6px;color:var(--ca-ink-2);font-size:12px}
.inv-menu-heading{display:flex;align-items:center;justify-content:space-between;min-height:30px;padding:4px 12px;font-size:13px;font-weight:400;color:var(--ca-ink-2);border-bottom:1px solid var(--ca-line)}
.inv-menu-heading button{padding:0;border:0;background:transparent;color:var(--ca-ink-2);cursor:pointer;font:inherit}
.inv-menu-heading button:hover,.inv-menu-heading button:focus-visible{color:var(--ca-primary-ink);text-decoration:underline}
.inv-history-menu .arco-select-checkbox{display:none}
.inv-history-menu .arco-select-popup-inner{max-height:248px;padding:2px 4px!important}
.inv-history-menu .arco-select-option-wrapper{padding:0}
.inv-history-menu .arco-select-option{min-height:30px;padding:4px 8px!important;font-size:13px;font-weight:400}
.inv-recent{display:flex;align-items:center;gap:8px;width:100%;min-width:0;color:var(--ca-ink)}
.inv-recent span{flex:1;min-width:0;overflow-wrap:anywhere;line-height:18px}
.inv-recent button{border:0;background:transparent;color:var(--ca-ink-2);cursor:pointer;font:inherit}
.inv-recent button{width:18px;height:22px;padding:0;font-size:17px;line-height:22px;opacity:0}
.arco-select-option-wrapper:hover .inv-recent button,.arco-select-option-hover .inv-recent button,.inv-recent button:focus-visible{opacity:1}
.inv-recent button:hover{color:var(--ca-primary-ink)}
.inv-no-result{padding:12px;color:var(--ca-ink-2);font-size:13px}
@media(max-width:740px){.inv-menu-grid{grid-template-columns:1fr;gap:4px}}
`;

let root;
let mountedHost;
let emptyRoot;
let emptyHost;

function measureGeometry(host) {
  const rect = host.getBoundingClientRect();
  const category = document.getElementById('inventory-arco-category')?.getBoundingClientRect() || document.getElementById('product-arco-category')?.getBoundingClientRect();
  const warehouse = document.getElementById('inventory-arco-warehouses')?.getBoundingClientRect() || document.getElementById('product-arco-seasons')?.getBoundingClientRect();
  const sameRow = category && warehouse && Math.abs(category.top - rect.top) < 3 && Math.abs(warehouse.top - rect.top) < 3;
  return { left: rect.left, width: rect.width, viewport: window.innerWidth, filterRight: sameRow ? warehouse.right : 0 };
}

function PreviewPanel({ data, portal }) {
  if (!data) return null;
  return <aside className="inv-preview">
    <div className="inv-preview-title">商品资料</div>
    {data.photos.length ? <div className="inv-photo-grid">{data.photos.map(photo =>
      <Popover key={photo.color} className="inv-photo-zoom" trigger={['hover', 'focus']} position="right" getPopupContainer={() => portal}
        content={<div className="inv-photo-zoom-content"><Image src={photo.url} alt={`${photo.color}商品图片放大图`} width={260} height={260} preview={false} tabIndex={-1} /><span className="inv-photo-zoom-label">{photo.color}</span></div>}>
        <div className="inv-photo-item" tabIndex={0} aria-label={`悬停或聚焦查看${photo.color}商品图片`}>
          <span className="inv-photo-tile"><Image src={window.PRODUCT_MEDIA?.thumbnail(photo.url)||photo.url} alt={`${photo.color}商品图片`} preview={false} tabIndex={-1} lazyload loading="lazy" decoding="async" /></span>
          <span className="inv-photo-label" title={photo.color}>{photo.color}</span>
        </div>
      </Popover>)}</div> : <div className="inv-preview-no-photo">该商品尚未提供图片</div>}
    <div className="inv-preview-info">{data.fields.filter(([label]) => label !== '年份').map(([label, value]) => <div className="inv-preview-field" key={label}><small>{label}</small> {value}</div>)}</div>
  </aside>;
}

function InventorySelect({ portal, host, source }) {
  const initial = useRef(source.snapshot()).current;
  const [selected, setSelected] = useState(initial.selected);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState(source.historyItems());
  const [previewId, setPreviewId] = useState('');
  const [visiblePage, setVisiblePage] = useState({ key: '', limit: 20 });
  const remoteMode=!!(window.REAL_DATA_MODE&&initial.dataset!=='stress');
  const [opened,setOpened]=useState(false);
  const [selecting,setSelecting]=useState(false);
  const choiceLabels=useRef(new Map());
  const selectionSerial=useRef(0);
  const [remote,setRemote]=useState({key:'',items:[],total:0,page:0,status:'idle',error:''});
  const remoteSerial=useRef(0),remoteBusy=useRef(false);
  const [geometry, setGeometry] = useState(() => measureGeometry(host));
  const selectRef = useRef(null);
  const previewFrame = useRef(0);
  const search = input.trim();
  const localMatches = useMemo(() => !remoteMode&&search ? source.search(search) : [], [search, initial.dataset, remoteMode]);
  const matches=remoteMode?(remote.key===search?remote.items:[]):localMatches;
  const visibleLimit = visiblePage.key === search ? visiblePage.limit : 20;
  const shown = remoteMode?matches:matches.slice(0, visibleLimit);
  const recent = !search&&!remoteMode;
  const availableWidth = Math.max(0, geometry.viewport - geometry.left - 12);
  const alignedWidth = geometry.filterRight ? geometry.filterRight - geometry.left : 0;
  const popupWidth = Math.min(recent || !shown.length ? geometry.width : Math.max(geometry.width + 308, alignedWidth), availableWidth);
  const listWidth = Math.min(geometry.width, Math.max(250, popupWidth - 308));
  const visibleTagLimit = useMemo(() => {
    if (selected.length < 2) return 3;
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return Math.min(3, selected.length);
    context.font = '13px Arial';
    const widths = selected.slice(0, 3).map(code => context.measureText(code).width + 39);
    for (let count = Math.min(3, selected.length); count > 1; count--) {
      const reserved = selected.length > count ? 112 : 64;
      if (widths.slice(0, count).reduce((total, width) => total + width, 0) + (count - 1) * 4 + reserved <= geometry.width) return count;
    }
    return 1;
  }, [selected, geometry.width]);

  function syncActivePreview() {
    cancelAnimationFrame(previewFrame.current);
    previewFrame.current = requestAnimationFrame(() => {
      const active = portal.querySelector('.inv-menu-list .arco-select-option-hover[data-product-id]');
      setPreviewId(active?.getAttribute('data-product-id') || '');
    });
  }

  useLayoutEffect(() => {
    const measure = () => {
      const next = measureGeometry(host);
      setGeometry(current => current.left === next.left && current.width === next.width && current.viewport === next.viewport && current.filterRight === next.filterRight ? current : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [host]);

  async function loadRemote(page=1,serial=remoteSerial.current) {
    if(!opened||remoteBusy.current)return;
    remoteBusy.current=true;
    setRemote(old=>({...old,key:search,...(page===1?{items:[],total:0,page:0}:{}),status:'loading',error:''}));
    try {const result=source.remoteSearch?await source.remoteSearch(search,page):await window.LEGACY_REAL.productReader.list({filters:{q:search},page,size:20,purpose:'picker'});if(serial!==remoteSerial.current||!host.isConnected)return;
      for(const row of result.items)choiceLabels.current.set(row.id,row.code||row.id);
      setRemote(old=>({key:search,items:page===1?result.items:[...new Map([...old.items,...result.items].map(row=>[row.id,row])).values()],total:result.total,page,status:'ready',error:''}));
    } catch(error) {if(serial===remoteSerial.current)setRemote(old=>({...old,status:'error',error:error.message}));}
    finally {if(serial===remoteSerial.current)remoteBusy.current=false;}
  }
  useEffect(()=>{const serial=++remoteSerial.current;remoteBusy.current=false;if(!remoteMode||!opened){setRemote({key:search,items:[],total:0,page:0,status:'idle',error:''});return;}
    const timer=window.setTimeout(()=>loadRemote(1,serial),200);return ()=>{window.clearTimeout(timer);remoteSerial.current++;};
  },[search,remoteMode,opened]);
  useEffect(() => {
    if (recent) setPreviewId('');
    else syncActivePreview();
  }, [recent]);
  useEffect(() => {
    if (!search||remoteMode) return;
    const exactId = source.exact(search);
    if (!exactId) return;
    const timer = window.setTimeout(() => {
      source.rememberHistory(exactId);
      setHistory(source.historyItems());
    }, 600);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => () => {cancelAnimationFrame(previewFrame.current);remoteSerial.current++;selectionSerial.current++;}, []);

  const optionList = recent
    ? history.length ? history.map((q, index) =>
        <Select.Option key={q} value={`__recent__${index}`}>
          <span className="inv-recent"><span title={q}>{q}</span><button type="button" aria-label={`删除最近搜索 ${q}`} title="删除" onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }} onClick={e => { e.preventDefault(); e.stopPropagation(); source.removeHistory(q); setHistory(source.historyItems()); }}>×</button></span>
        </Select.Option>) : <Select.Option value="__recent_empty__" disabled>暂无最近搜索</Select.Option>
    : shown.map(p =>
        <Select.Option key={p.id} value={p.id} data-product-id={p.id} onMouseEnter={() => setPreviewId(p.id)}>
          <span className="inv-option-row"><span className="inv-option-code">{p.code||p.id}</span><span className="inv-option-name">{p.name}</span></span>
        </Select.Option>);
  const preview = shown.find(p => p.id === previewId) || shown[0];
  const previewData = remoteMode&&preview?{fields:[['款号',preview.code],['商品名称',preview.name],['商品分类',preview.categoryName],['季节',preview.season],['年份',preview.year]].filter(([,v])=>v!=null&&v!==''),photos:preview.cover?.url?[{color:'商品图片',url:preview.cover.url}]:[]}:preview ? source.previewData(preview.id) : null;

  const selectedLabel=id=>source.selectedLabel?.(id)||choiceLabels.current.get(id)||id;
  async function remoteExact(raw){
    if(source.remoteExact)return source.remoteExact(raw);
    const result=await window.LEGACY_REAL.productReader.resolveBarcode(String(raw).trim());
    if(result.kind==='ambiguous')return null;
    const rows=result.kind==='sku'?(result.candidates||[]):result.kind==='product'?(result.products||[]):[];
    if(rows.length!==1)return null;
    const row=rows[0];choiceLabels.current.set(row.productId,row.productCode||row.code);return row.productId;
  }
  async function updateSelected(ids) {
    const next = [...new Set(ids)];
    const added = next.filter(id => !selected.includes(id));
    const serial=++selectionSerial.current;
    if(remoteMode&&added.length){setSelecting(true);try{const ids=added.map(id=>id.startsWith('product:')?id.slice(8):id),result=await window.LEGACY_REAL.productReader.ensureDetails({productIds:ids});if(ids.some(id=>!(result.products||[]).some(p=>p.uuid===id)))throw Error('部分所选商品详情未读取成功或已不可见，请重试');if(serial!==selectionSerial.current||!host.isConnected)return;}catch(error){if(serial===selectionSerial.current&&host.isConnected)window.toast?.(error.message);return;}finally{if(serial===selectionSerial.current&&host.isConnected)setSelecting(false);}}
    [...added].reverse().map(id=>remoteMode?selectedLabel(id):id).forEach(source.rememberHistory);
    if (added.length) setHistory(source.historyItems());
    source.setSelected(next);
    setSelected(next);
    setInput('');
    setPreviewId('');
    requestAnimationFrame(() => selectRef.current?.focus());
  }

  async function chooseHistory(q) {
    const serial=remoteSerial.current;let exact;try{exact=remoteMode?await remoteExact(q):source.exact(q);if(serial!==remoteSerial.current||!host.isConnected)return;}catch(error){window.toast?.(error.message);return;}
    if (exact) updateSelected([...selected, exact]);
    else requestAnimationFrame(() => { setInput(q); selectRef.current?.focus(); });
  }

  function handleChange(values) {
    const next = Array.isArray(values) ? values : [];
    const recentValue = next.find(x => String(x).startsWith('__recent__'));
    if (recentValue) {
      const index = Number(String(recentValue).replace('__recent__', ''));
      if (history[index]) chooseHistory(history[index]);
      return;
    }
    updateSelected(next);
  }

  async function handlePaste(e) {
    const raw = e.clipboardData?.getData('text') || '';
    const parts = raw.split(/[\s,，;；、]+/).map(x => x.trim()).filter(Boolean);
    if (parts.length < 2) return;
    e.preventDefault();
    const codes = [...new Set(parts)];
    const serial=remoteSerial.current;let found;try{found=[];for(const code of codes){found.push(remoteMode?await remoteExact(code):source.exact(code));if(serial!==remoteSerial.current||!host.isConnected)return;}}catch(error){window.toast?.(error.message);return;}
    const ids = [...new Set(found.filter(Boolean))];
    if (ids.length) updateSelected([...selected, ...ids]);
    const missed = found.filter(id => !id).length;
    if (missed) window.toast?.(`${missed} 个款号未匹配，已跳过`);
  }

  function loadOnScroll(e) {
    const scroller = e.target;
    if (!scroller?.classList?.contains('arco-select-popup-inner')) return;
    if(remoteMode){if(scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<48&&shown.length<remote.total&&remote.status==='ready')loadRemote(remote.page+1);return;}
    if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48 && shown.length < matches.length) {
      setVisiblePage({ key: search, limit: Math.min(matches.length, visibleLimit + 20) });
    }
  }

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      window.toast?.(`已复制款号 ${code}`);
    } catch {
      window.toast?.('复制失败，请检查剪贴板权限');
    }
    requestAnimationFrame(() => selectRef.current?.focus());
  }

  return <Select
    ref={selectRef}
    id="iw-arco-select"
    className={selected.length ? 'inv-has-tags' : ''}
    aria-label="商品搜索，多选"
    mode="multiple"
    showSearch
    value={selected}
    inputValue={input}
    children={optionList}
    filterOption={false}
    loading={remoteMode&&remote.status==='loading'}
    disabled={selecting}
    size="default"
    arrowIcon={<IconSearch />}
    renderTag={({ value, closable, onClose }) => {const label=remoteMode?selectedLabel(String(value)):value;return <Tag className="inv-tag" closable={closable} onClose={onClose}><button type="button" className="inv-tag-copy" title={`点击复制款号 ${value}`} aria-label={`复制款号 ${value}`} onMouseDown={e => e.preventDefault()} onClick={e => { e.stopPropagation(); copyCode(String(label)); }}>{label}</button></Tag>;}}
    maxTagCount={{ count: visibleTagLimit, render: count => <span className="inv-count" title={selected.slice(visibleTagLimit).join('、')}>+{count} 更多</span>, showPopover: false }}
    placeholder="商品款号 / 名称 / 系统货号"
    notFoundContent={<div className="inv-no-result">{remoteMode&&remote.status==='loading'?'正在查询商品…':remoteMode&&remote.status==='error'?remote.error:'没有匹配商品，可继续输入'}</div>}
    renderFormat={(_, value) => String(value)}
    getPopupContainer={() => portal}
    triggerProps={{ position: 'bl', autoAlignPopupWidth: false, popupStyle: { width: popupWidth } }}
    onInputValueChange={(value,reason) => { if(reason==='manual'){selectionSerial.current++;setSelecting(false);}setPreviewId(''); setInput(value); }}
    onChange={handleChange}
    onPaste={handlePaste}
    onFocus={() => setHistory(source.historyItems())}
    onVisibleChange={visible => {setOpened(visible);if(visible)syncActivePreview();else {selectionSerial.current++;setSelecting(false);}}}
    onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') syncActivePreview(); }}
    dropdownRender={menu => recent ? <div className="inv-history-menu"><div className="inv-menu-heading"><span>最近搜索</span>{history.length > 0 && <button type="button" aria-label="清空最近搜索" onMouseDown={e => e.preventDefault()} onClick={() => { source.clearHistory(); setHistory([]); }}>清空</button>}</div>{menu}</div> : <div className={preview ? 'inv-menu-grid' : 'inv-menu-grid inv-menu-grid-empty'} style={{ '--inv-list-width': `${listWidth}px` }}><div className="inv-menu-list" onScrollCapture={loadOnScroll}>{shown.length > 0 && <div className="inv-result-heading" aria-hidden="true"><span>商品款号</span><span>商品名称</span></div>}{menu}{remoteMode&&<div className="inv-no-result">共 {remote.total} 项 · 已显示 {shown.length}{shown.length<remote.total&&<button type="button" disabled={remote.status==='loading'} onMouseDown={e=>e.preventDefault()} onClick={()=>loadRemote(remote.page+1)}>加载下一页</button>}</div>}{remoteMode&&remote.status==='error'&&<div role="alert" className="inv-no-result">{remote.error} <button type="button" onClick={()=>loadRemote(remote.page?remote.page+1:1)}>重试</button></div>}</div><PreviewPanel data={previewData} portal={portal} /></div>}
  />;
}

window.INVENTORY_SELECT = {
  beforeRender() {
    if (root) root.unmount();
    root = undefined;
    mountedHost = undefined;
  },
  mount(host, source = bridge) {
    if (!host || host === mountedHost) return;
    this.beforeRender();
    mountedHost = host;
    const shadow = host.attachShadow({ mode: 'open' });
    const arcoStyle = document.createElement('style');
    arcoStyle.textContent = arcoCss.replace(/\bbody\s*\{/g, ':host {');
    const localStyle = document.createElement('style');
    localStyle.textContent = css;
    const app = document.createElement('div');
    app.id = 'root';
    const portal = document.createElement('div');
    portal.id = 'portal';
    shadow.append(arcoStyle, localStyle, app, portal);
    root = createRoot(app);
    root.render(<InventorySelect portal={portal} host={host} source={source} />);
  },
};
if (document.querySelector('#product-arco-search')) window.INVENTORY_SELECT.mount(document.querySelector('#product-arco-search'), window.PRODUCT_FILTER_BRIDGES?.search);
window.INVENTORY_EMPTY = {
  beforeRender() {
    if (emptyRoot) emptyRoot.unmount();
    emptyRoot = undefined;
    emptyHost = undefined;
  },
  mount(host) {
    if (!host || host === emptyHost) return;
    this.beforeRender();
    emptyHost = host;
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `${emptyCss}
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
    const app = document.createElement('div');
    shadow.append(style, app);
    emptyRoot = createRoot(app);
    emptyRoot.render(<Empty description={<div className="inv-empty-copy"><strong>{host.dataset.title}</strong><span>{host.dataset.description}</span></div>} />);
  },
};
window.render();
