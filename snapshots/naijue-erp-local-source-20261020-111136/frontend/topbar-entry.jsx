/* Independent account entry; settings remain deferred until their page is opened. */
import arcoCss from '@arco-design/web-react/dist/css/arco.css?inline';
import accountCss from './topbar-account.css?inline';
import './topbar-account.jsx';
for(const [key,contents] of [['arco-account',arcoCss],['account-fields',accountCss]]){
 if(document.querySelector('style[data-erp-style="'+key+'"]'))continue;
 const style=document.createElement('style');style.dataset.erpStyle=key;style.textContent=contents;document.head.append(style);
}
