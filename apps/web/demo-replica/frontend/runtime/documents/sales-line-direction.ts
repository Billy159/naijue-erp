import {quantity,negateQuantity} from '../../../../../../packages/domain/src/values.ts';
/** A direction choice may change only a valid nonzero exact quantity's sign.
 * Invalid drafts stay untouched; the int64 minimum cannot be made positive. */
export function salesLineDirectionQuantity(raw:string,direction:'IN'|'OUT'):string|null{
 try{if(direction!=='IN'&&direction!=='OUT')return null;const value=quantity(raw);if(value===0n)return null;return ((value<0n)===(direction==='IN')?value:negateQuantity(value)).toString();}catch{return null;}
}
