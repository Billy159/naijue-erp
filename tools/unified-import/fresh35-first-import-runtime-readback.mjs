import {BoundedPostgresPool} from '../../adapters/postgres/src/bounded-pool.ts';
import {createRuntime27CommandIssuer} from '../../adapters/postgres/src/runtime27-command-issuer.ts';
import {admitFresh35CompactZeroOrdinaryPoolV2,closeFresh35OrdinaryAdmissionV2} from './fresh35-host-session.mjs';
import {compareWholePackageRuntimeProjection,readWholePackageRuntimeProjection} from './whole-package-runtime-readback.mjs';

/** The private carrier supplies the current ordinary login and the original
 * committed import binding. This entry owns one pool for the readback. */
export async function reconcileFresh35FirstImportRuntime(
 {postgres,currentService,parentPins,successorSha256},binding,warehouseEvidence,aggregateEvidence
){
 const {host,port,database,user}=postgres.target;
 const pool=new BoundedPostgresPool(postgres);
 let admission;
 try{
  admission=await admitFresh35CompactZeroOrdinaryPoolV2(pool,{host,port,database,user},currentService,parentPins,successorSha256);
  const issuer=createRuntime27CommandIssuer(pool,{database,user,port},'WHOLE_V2',admission);
  const projection=await readWholePackageRuntimeProjection(issuer,binding);
  const comparison=compareWholePackageRuntimeProjection(projection,warehouseEvidence,aggregateEvidence);
  return {projection,comparison};
 }finally{
  try{if(admission)closeFresh35OrdinaryAdmissionV2(admission,pool);}
  finally{await pool.dispose();}
 }
}
