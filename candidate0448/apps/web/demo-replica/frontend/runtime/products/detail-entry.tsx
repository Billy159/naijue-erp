import { Component, type ReactNode } from 'react';
import {createRoot} from 'react-dom/client';
import {ProductDetail,type ProductDetailOptions} from './detail.tsx';
/** A failed leaf must not erase the shell or expose exception/business details. */
class ProductDetailBoundary extends Component<{children:ReactNode;close:()=>void},{failed:boolean}> {
 override state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 override render(){return this.state.failed?<div className="iw-state" role="alert">商品页面暂时无法显示。 <button type="button" className="btn" onClick={this.props.close}>返回商品列表</button></div>:this.props.children;}
}
export async function mountProductDetail(host:HTMLElement,options:ProductDetailOptions){
 if(!options.scope.active)return()=>{};
 const root=createRoot(host);
 root.render(<ProductDetailBoundary close={()=>{if(options.scope.active)options.close();}}><ProductDetail {...options}/></ProductDetailBoundary>);
 let disposed=false;return()=>{if(disposed)return;disposed=true;root.unmount();};
}
