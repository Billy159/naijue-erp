/* Product controls share the inventory workbench's Arco palette and 32px rhythm. */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Cascader from '@arco-design/web-react/es/Cascader';
import Select from '@arco-design/web-react/es/Select';
import Tree from '@arco-design/web-react/es/Tree';
import Input from '@arco-design/web-react/es/Input';
import Modal from '@arco-design/web-react/es/Modal';
import Transfer from '@arco-design/web-react/es/Transfer';
import Upload from '@arco-design/web-react/es/Upload';
import Image from '@arco-design/web-react/es/Image';
import Dropdown from '@arco-design/web-react/es/Dropdown';
import Menu from '@arco-design/web-react/es/Menu';
import Drawer from '@arco-design/web-react/es/Drawer';
import Tabs from '@arco-design/web-react/es/Tabs';
import arcoCss from '@arco-design/web-react/dist/css/arco.css?inline';

const css = `
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
const roots = new Map();
const modalHost = document.createElement('div');
modalHost.id = 'pc-arco-modal-root';
document.body.append(modalHost);
const modalRoot = createRoot(modalHost);
const globalArcoStyle = document.createElement('style');
globalArcoStyle.textContent = arcoCss;
document.head.append(globalArcoStyle);
const modalCss = document.createElement('style');
modalCss.textContent = `
.pc-arco-modal,.pc-arco-modal .arco-modal{width:min(480px,94vw)!important;border-radius:4px;padding:0;color:var(--ca-ink);font:13px var(--ca-font-sans)}
.pc-arco-modal.pc-wide,.pc-arco-modal.pc-wide .arco-modal{width:min(780px,94vw)!important}
.pc-arco-modal .arco-modal-header{height:auto;min-height:43px;padding:11px 14px;border-bottom:1px solid var(--ca-line)}
.pc-arco-modal .arco-modal-title{font-size:16px;font-weight:600}
.pc-arco-modal .arco-modal-content{padding:12px 14px;max-height:min(65vh,650px);overflow:auto;border-bottom:0}
.pc-arco-modal .arco-modal-footer{padding:9px 14px;border-top:1px solid var(--ca-line)}
.pc-arco-modal .pc-modal-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px}
.pc-arco-modal .pc-delete-left{margin-right:auto;color:var(--ca-critical)}
.pc-arco-modal .pc-modal-body .field{display:flex;flex-direction:column;gap:4px;margin:0 0 9px;color:var(--ca-ink-2);font-size:12px}
.pc-arco-modal .pc-modal-body input{box-sizing:border-box;height:32px;font-size:13px}
.pc-arco-modal .pc-modal-body .pc-arco-host{margin:4px 0 12px}
.pc-arco-modal .pc-spec-transfer{min-height:320px;height:auto;margin:0 0 8px}
.pc-arco-modal .pc-spec-transfer .arco-transfer{width:100%;min-height:296px;font-size:13px}
.pc-arco-modal .pc-spec-transfer .arco-transfer-view{min-width:0;flex:1;height:296px;border-color:var(--ca-line)}
.pc-arco-modal .pc-spec-transfer .arco-transfer-view-content-item{min-height:31px}
.pc-arco-modal .pc-spec-transfer .arco-transfer-view-header{background:var(--ca-table-head)}
`;
document.head.append(modalCss);
let modalVisible = false;
function renderModal(title='',body='',footer='',wide=false,onCancel=()=>{}) {
  modalVisible = !!title;
  flushSync(() => modalRoot.render(modalVisible ? <Modal visible title={title} footer={<div className="pc-modal-foot" dangerouslySetInnerHTML={{__html:footer}} />}
    className={'pc-arco-modal iw-arco-controls'+(wide?' pc-wide':'')} maskClosable={false} unmountOnExit
    onCancel={onCancel} onOk={onCancel}>
    <div className="pc-modal-body" dangerouslySetInnerHTML={{__html:body}} />
  </Modal> : null));
}
function mount(host, view) {
  if (!host) return;
  const shadow = host.attachShadow({ mode: 'open' });
  const base = document.createElement('style'); base.textContent = arcoCss;
  const local = document.createElement('style'); local.textContent = css;
  const app = document.createElement('div'); app.id = 'root';
  const portal = document.createElement('div'); portal.id = 'portal';
  shadow.append(base, local, app, portal);
  const root = createRoot(app); roots.set(host, root); root.render(view(portal));
}
function mountLight(host, view) {
  if (!host) return;
  const root = createRoot(host); roots.set(host, root); flushSync(() => root.render(view()));
}
function Category({ source, portal }) {
  const nodes = source.nodes();
  const children = nodes.filter(x => x.parent === 'all').sort((a,b)=>(a.order||0)-(b.order||0)).map(x => ({value:x.id,label:x.name,children:nodes.filter(y => y.parent === x.id).sort((a,b)=>(a.order||0)-(b.order||0)).map(y => ({value:y.id,label:y.name}))}));
  const categoryPath = id => {
    const path = [];
    let node = nodes.find(item => item.id === id);
    while (node) { path.unshift(node.id); node = nodes.find(item => item.id === node.parent); }
    return path;
  };
  const [value, setValue] = useState(categoryPath(source.value()));
  return <Cascader options={children} changeOnSelect expandTrigger="click" allowClear={false} showSearch placeholder="选择商品分类"
    value={value} getPopupContainer={() => portal} onVisibleChange={visible=>{if(!visible)source.onClose?.();}}
    onChange={next => { const path = Array.isArray(next) ? next : [next]; setValue(path); source.setValue(path.at(-1) || ''); }} />;
}
function Choice({ source, portal }) {
  const initial = source.value();
  const [value, setValue] = useState(initial === null || initial === '' ? undefined : initial);
  const items = source.items();
  return <Select mode={source.multiple ? 'multiple' : undefined} showSearch={source.showSearch !== false} allowClear={!source.required}
    placeholder={source.placeholder || '请选择'} value={value} maxTagCount="responsive"
    getPopupContainer={() => portal} triggerProps={{autoAlignPopupWidth:true}}
    onChange={next => { setValue(next); source.setValue(next); }}>
    {items.map(item => <Select.Option key={item.id} value={item.id}>{item.name}</Select.Option>)}
  </Select>;
}
function TextInput({ source }) {
  const [value,setValue] = useState(source.value() || '');
  return <Input name={source.name} value={value} maxLength={source.maxLength || 80}
    placeholder={source.placeholder || ''} onChange={next => { setValue(next); source.setValue(next); }} />;
}
function SpecTransfer({ source }) {
  const items = source.items();
  const order = new Map(items.map((item,index) => [item.id,index]));
  const [selected,setSelected] = useState(source.value().filter(id => order.has(id)));
  const header=(title,total)=>({checkbox})=><><span className="arco-transfer-view-header-title">{checkbox} {title}</span><span className="arco-transfer-view-header-unit">{total} 项</span></>;
  return <Transfer dataSource={items.map(item => ({key:item.id,value:item.name}))}
    className="pc-spec-transfer" targetKeys={selected} showSearch={{className:'iw-arco-input iw-search-input',size:'default'}}
    searchPlaceholder={['搜索名称或编码','搜索已选']} titleTexts={[header(source.availableTitle,items.length-selected.length),header(source.selectedTitle,selected.length)]}
    operationTexts={['加入已选','移除已选']}
    filterOption={(query,item) => {
      const original=items.find(row => row.id === item.key);
      return `${original?.name||''} ${original?.code||''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
    }}
    onChange={keys => { const next=[...keys].sort((a,b)=>order.get(a)-order.get(b));setSelected(next);source.setValue(next); }} />;
}
function ProductPhotos({ source, onPreviewVisibleChange }) {
  const [preview,setPreview] = useState(null);
  const images=source.items();
  const colors=source.colors();
  const upload=(role,colorId='',replaceId='',caption='+ 添加') => <Upload className="pc-arco-upload" listType={replaceId?'text':'picture-card'} showUploadList={false}
    accept="image/png,image/jpeg,image/webp" multiple={!replaceId&&role!=='颜色配图'}
    beforeUpload={(file,files) => { if(!files?.length||files[0]===file)source.upload(files?.length?files:[file],role,colorId,replaceId);return false; }}>
    <span>{caption}</span>
  </Upload>;
  const tile=(im,role) => <div className="pc-arco-photo" key={im.id}>
    <button type="button" className="pc-arco-photo-preview" onClick={() => {setPreview(im);onPreviewVisibleChange?.(true);}} aria-label={'预览 '+im.name}>
      <Image src={window.PRODUCT_MEDIA?.thumbnail(im.url)||im.url} alt={im.name} preview={false} width="100%" height="100%" lazyload loading="lazy" decoding="async" />
    </button>
    {!source.readonly&&<Dropdown trigger="click" position="br" unmountOnExit={false} droplist={<Menu className="pc-photo-menu">
      <Menu.Item key="replace">{upload(role,im.colorId||'',im.id,'替换')}</Menu.Item>
      <Menu.Item key="delete" onClick={()=>source.remove(im.id)}>删除</Menu.Item>
    </Menu>}><button type="button" className="pc-photo-more" aria-label={'图片操作 '+im.name}>···</button></Dropdown>}
  </div>;
  const regular=(role,title) => <section className="pc-photo-section" key={role}>
    <h3>{title}</h3><div className="pc-arco-photo-row">
      {images.filter(im => im.role===role).map(im => tile(im,role))}
      {!source.readonly&&upload(role)}
      {source.inDrawer&&!images.some(im=>im.role===role)&&<span className="hint">暂无图片</span>}
    </div>
  </section>;
  return <div className="pc-arco-photos">
    <p className="hint">{source.inDrawer?'点击图片查看大图':'支持 PNG、JPEG、WebP，单张不超过 8 MB；图片随商品保存。'}</p>
    {['主图','白底图','吊牌图','详情图'].map(role=>regular(role,role))}
    <section className="pc-photo-section pc-color-matrix"><h3>颜色图</h3>
      <div className="pc-color-photo-grid pc-arco-photo-row">{colors.map(color => {
        const im=images.find(image=>image.role==='颜色配图'&&image.colorId===color.id);
        return <div key={color.id}>
          <div className="pc-color-photo-cell"><div className="pc-color-photo-name" title={color.name}>{color.name}</div>
            {im?tile(im,'颜色配图'):!source.readonly?upload('颜色配图',color.id,'','+ 添加'):<div className="pc-color-photo-empty">{source.inDrawer?'暂无图片':''}</div>}
          </div>
        </div>;
      })}</div>
      {!colors.length&&<p className="hint">{source.inDrawer?'暂无当前颜色':'先在规格页选择当前颜色。'}</p>}
    </section>
    <Image.Preview src={preview?.url||''} visible={!!preview} onVisibleChange={visible=>{if(!visible){setPreview(null);onPreviewVisibleChange?.(false);}}} getPopupContainer={()=>document.body} />
  </div>;
}
const drawerHost=document.createElement('div');
drawerHost.id='pc-product-drawer-root';
document.body.append(drawerHost);
const drawerRoot=createRoot(drawerHost);
let drawerSession=null;
let drawerSequence=0;
function ReadonlyProductPanel({source,tab}){
  const host=useRef(null);
  useLayoutEffect(()=>{source.mount(host.current,tab);},[source,tab]);
  return <section ref={host} className="pc-detail-body" dangerouslySetInnerHTML={{__html:source.body(tab)}} />;
}
function ProductDrawer({session}){
  const [tab,setTab]=useState('base');
  const [imagePreviewOpen,setImagePreviewOpen]=useState(false);
  const {source}=session;
  return <Drawer visible={session.visible} title={<div className="pc-product-drawer-title"><span>{source.product.id} · {source.product.name}</span><small>只读</small></div>}
    className="pc-product-drawer iw-arco-controls" width="min(660px,100vw)" footer={null} placement="right"
    focusLock autoFocus maskClosable escToExit={!imagePreviewOpen} unmountOnExit onCancel={closeProductDrawer}
    afterClose={()=>{if(drawerSession===session){drawerSession=null;drawerRoot.render(null);source.onClose?.();}}}>
    <div className="pc-detail-workbench">
      <Tabs className="pc-product-drawer-tabs" type="line" size="small" activeTab={tab} onChange={setTab} destroyOnHide>
        <Tabs.TabPane key="base" title="基础资料"><ReadonlyProductPanel source={source} tab="base" /></Tabs.TabPane>
        <Tabs.TabPane key="specs" title="规格"><ReadonlyProductPanel source={source} tab="specs" /></Tabs.TabPane>
        <Tabs.TabPane key="images" title="图片"><section className="pc-detail-body"><ProductPhotos source={source.photos} onPreviewVisibleChange={setImagePreviewOpen} /></section></Tabs.TabPane>
      </Tabs>
    </div>
  </Drawer>;
}
function openProductDrawer(source){
  const session={source,visible:true,key:++drawerSequence};drawerSession=session;
  flushSync(()=>drawerRoot.render(<ProductDrawer key={session.key} session={session} />));
}
function closeProductDrawer(){
  if(!drawerSession?.visible)return;
  drawerSession.visible=false;
  flushSync(()=>drawerRoot.render(<ProductDrawer key={drawerSession.key} session={drawerSession} />));
}
function CategoryTree({ source }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(source.expanded());
  const [selected, setSelected] = useState([source.selected()]);
  const nodes=source.nodes().filter(n=>n.id!=='all'&&!n.legacy);
  const matching=new Set();
  if(query.trim()) for(const node of nodes.filter(n=>source.path(n.id).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))){
    let id=node.id; while(id&&id!=='all'){matching.add(id);id=nodes.find(x=>x.id===id)?.parent;}
  }
  const treeData=nodes.filter(n=>n.parent==='all').sort((a,b)=>(a.order||0)-(b.order||0)).map(parent=>({key:parent.id,title:parent.name,children:nodes.filter(n=>n.parent===parent.id).sort((a,b)=>(a.order||0)-(b.order||0)).map(child=>({key:child.id,title:child.name}))}));
  const visible= query.trim()?treeData.filter(n=>matching.has(n.key)).map(n=>({...n,children:n.children.filter(c=>matching.has(c.key))})):treeData;
  const dataByKey=new Map(nodes.map(n=>[n.id,n]));
  return <><Input.Search className="product-tree-search" placeholder="搜索分类" value={query} onChange={setQuery} allowClear />
    <Tree blockNode draggable selectedKeys={selected} expandedKeys={query.trim()?treeData.filter(n=>matching.has(n.key)).map(n=>n.key):expanded}
      treeData={visible} onSelect={keys=>{setSelected(keys); if(keys[0])source.select(keys[0]);}}
      onExpand={keys=>{setExpanded(keys);source.expand?.(keys);}}
      allowDrop={({dragNode,dropNode,dropPosition})=>dropPosition!==0&&dataByKey.get(dragNode?.key)?.parent===dataByKey.get(dropNode?.key)?.parent}
      onDrop={({dragNode,dropNode,dropPosition})=>{if(dropPosition!==0&&dragNode&&dropNode)source.reorder(dragNode.key,dropNode.key,dropPosition<0?'before':'after');}} />
  </>;
}
window.PRODUCT_ARCO = {
  openProductDrawer,closeProductDrawer,
  beforeRender() { for (const root of roots.values()) root.unmount(); roots.clear(); },
  category(host, source) { mount(host, portal => <Category source={source} portal={portal} />); },
  select(host, source) {
    if(!host)return;
    if(!source.multiple&&window.UNIFIED_SINGLE_SELECT){
      const items=source.items();
      window.UNIFIED_SINGLE_SELECT.mount(host,{items:items.map(item=>({value:item.id,label:item.name,disabled:item.disabled})),value:source.value(),label:source.placeholder,placeholder:source.placeholder,allowClear:!source.required,showSearch:source.showSearch,flatValue:true,currentLabel:source.currentLabel?.(),onChange:source.setValue});
    }else mount(host, portal => <Choice source={source} portal={portal} />);
  },
  transfer(host, source) { mountLight(host, () => <SpecTransfer source={source} />); },
  photos(host, source) { mountLight(host, () => <ProductPhotos source={source} />); },
  tree(host, source) { mount(host, () => <CategoryTree source={source} />); },
  input(host, source) { mountLight(host, () => <TextInput source={source} />); },
  modal(title, body, footer, wide, onCancel) { renderModal(title, body, footer, wide, onCancel); },
  closeModal() { renderModal(); },
};
