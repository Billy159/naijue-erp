/** Parsing only: this helper never opens a socket or mutates a target. */
export function parseDeleteSafetyTarget(raw) {
 let c; try { c=JSON.parse(raw); } catch { throw Error('EXPLICIT_DISPOSABLE_SYNTHETIC_TARGET_REQUIRED'); }
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(',');
 const account=x=>exact(x,['user','password'])&&typeof x.user==='string'&&x.user.length>0&&typeof x.password==='string'&&x.password.length>0;
 if(!exact(c,['scenario','confirmedSynthetic','confirmedDisposable','host','port','database','runtime','observer','productId','actorAccountId'])||!['zero-no-references','hidden-reference'].includes(c.scenario)||c.confirmedSynthetic!==true||c.confirmedDisposable!==true||!['127.0.0.1','::1'].includes(c.host)||!Number.isInteger(c.port)||c.port<=1024||c.port>65535||c.port===5432||typeof c.database!=='string'||!/^synthetic_delete_[a-z0-9_]+$/.test(c.database)||!account(c.runtime)||!account(c.observer)||c.runtime.user===c.observer.user||!uuid.test(c.productId)||!uuid.test(c.actorAccountId))throw Error('EXPLICIT_DISPOSABLE_SYNTHETIC_TARGET_REQUIRED');
 return c;
}
