import {types} from 'node:util';
import {requireDomain} from '../../../packages/domain/src/errors.ts';

/** Copy a single native boolean prerequisite without invoking caller accessors.
 * This is a result-shape boundary, not proof of SQL semantics or authority. */
export function standard27ProductPrerequisiteResult<K extends string>(result:unknown,key:K):Readonly<Record<K,boolean>> {
 const fail=(ok:unknown)=>requireDomain(ok,'PRODUCT_EVIDENCE_CAPACITY_NOT_READY','Exact product prerequisite result required');
 fail(result&&typeof result==='object'&&!types.isProxy(result));
 const rows=Object.getOwnPropertyDescriptor(result,'rows');fail(rows?.enumerable&&'value'in rows);
 const list:unknown=rows!.value;fail(Array.isArray(list)&&!types.isProxy(list));
 fail(Reflect.ownKeys(list as object).length===2);
 const length=Object.getOwnPropertyDescriptor(list,'length');fail(length&&'value'in length&&length.value===1);
 const entry=Object.getOwnPropertyDescriptor(list,'0');fail(entry?.enumerable&&'value'in entry);
 const row:unknown=entry!.value;fail(row&&typeof row==='object'&&!types.isProxy(row)&&Object.getPrototypeOf(row)===Object.prototype);
 fail(Reflect.ownKeys(row as object).length===1);
 const field=Object.getOwnPropertyDescriptor(row,key);fail(field?.enumerable&&'value'in field&&typeof field.value==='boolean');
 return Object.freeze({[key]:field!.value}) as Readonly<Record<K,boolean>>;
}
