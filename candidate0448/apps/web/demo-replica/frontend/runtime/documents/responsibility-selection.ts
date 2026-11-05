import type {TransferCommandWorkspace} from '../../../../src/transfers/commands/controller.ts';
import {entityId} from '../../../../../../packages/domain/src/values.ts';
/** Keep all raw strings, including invalid input, while changing only the explicit responsible employee. */
export function selectTransferResponsible(workspace:TransferCommandWorkspace,selected:{id:string;name:string}):boolean{
 const current=workspace.getSnapshot().editor;if(!current?.draft||!current.input)return false;
 let id;try{id=entityId('staff',selected.id);}catch{return false;}
 const input=current.input;if(!workspace.replaceDraft({...current.draft,header:{...current.draft.header,responsibleStaffId:id}}))return false;
 workspace.updateInput(input);return true;
}
