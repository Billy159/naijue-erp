/** TEST ONLY presentation opt-in for the explicitly paired in-memory HISTORY fixture.
 * This is not a backend grant, runtime capability, metadata approval or release profile. */
import {parseProductionHostConfiguration} from '../../src/production-host/configuration.ts';
export const HISTORY_SYNTHETIC_PROFILE='SYNTHETIC-HISTORY-DRAFT-MEMORY-NOT-PG-NOT-PRODUCTION';
export function createHistorySyntheticPublicConfiguration(base){
 const checked=parseProductionHostConfiguration(base);
 if(checked.http.origin!=='https://synthetic-management.invalid'||checked.http.basePath!=='/api'||checked.routes.transfers!==true)throw TypeError('Exact isolated synthetic HISTORY host required');
 return parseProductionHostConfiguration({...checked,routes:{...checked.routes,historyRevision:{transfers:true}}});
}
