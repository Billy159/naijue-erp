import {JSDOM} from 'jsdom';
/** Build-only explicit local adapter. Edit real HTML attribute source ranges,
 * never script text/embedded JSON, and preserve all other original HTML bytes. */
export function localizeCanonicalAssets(html,expectedOrigin){
  const origin=new URL(expectedOrigin);if(origin.protocol!=='https:'||origin.origin!==expectedOrigin)throw new TypeError('Exact synthetic HTTPS origin required');
  const dom=new JSDOM(html,{includeNodeLocations:true}),edits=[];
  try{for(const element of dom.window.document.querySelectorAll('[href],[src]'))for(const name of ['href','src']){
    const value=element.getAttribute(name);if(value===null)continue;
    if(!/^https?:/i.test(value)&&!value.startsWith('/assets/'))continue;
    const url=new URL(value,expectedOrigin);
    if(url.origin!==expectedOrigin||!url.pathname.startsWith('/assets/')||url.username||url.password||url.search||url.hash||/(?:\.\.|%2e|%2f|%5c|\\)/i.test(value)||value!==(value.startsWith('/')?url.pathname:expectedOrigin+url.pathname))throw new TypeError('Unexpected or unsafe absolute asset attribute');
    const location=dom.nodeLocation(element)?.attrs?.[name];if(!location)throw new TypeError('Original asset attribute range missing');
    const original=html.slice(location.startOffset,location.endOffset),match=/^(\s*(?:href|src)\s*=\s*)(["'])([\s\S]*)\2$/i.exec(original);if(!match)throw new TypeError('Quoted source asset attribute required');
    edits.push({start:location.startOffset,end:location.endOffset,text:match[1]+match[2]+url.pathname+match[2]});
  }}finally{dom.window.close();}
  let result=html;for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.text+result.slice(edit.end);return result;
}
