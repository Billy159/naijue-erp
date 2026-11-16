"""Static issuer mapping and native-wire projection; never issues a clock or authority.
The existing issuer must first validate current service, approved inputs, actual
old failed/absent-plan facts, historical catalog plus current readback and budget.
"""
from pathlib import Path
import runpy
_identity=runpy.run_path(str(Path(__file__).resolve().with_name('identity_pair.py')),run_name='exact_local_identity_pair')
LOGICAL,MAPPING,OUTER,check_mapping,check_binding,need=(_identity[k] for k in ('LOGICAL','MAPPING','OUTER','check_mapping','check_binding','need'))

def native_scope():
    return {'requestKey':LOGICAL,'batchPlanPath':MAPPING['batchPlanPath']}

def pair_scope(host_scope,binding):
    # Return only static scope data. Existing finite fields are not minted here.
    need(host_scope.get('requestKey')==OUTER,'EXACT_OUTER_AUX03_HOST_REQUIRED')
    need(host_scope.get('preparationRequestKey')==LOGICAL and host_scope.get('batchPlanPath')==MAPPING['batchPlanPath'],'EXPLICIT_LOGICAL_SCOPE_REQUIRED')
    check_binding(binding)
    return {**host_scope,'preparationIdentityMapping':dict(MAPPING)}

def check_native_projection(outer,inner):
    check_mapping(outer.get('preparationIdentityMapping'));check_binding(outer.get('expectedBinding'))
    need(outer.get('requestKey')==OUTER and outer.get('preparationRequestKey')==LOGICAL,'EXACT_OUTER_AND_LOGICAL_KEYS_REQUIRED')
    # Do not add outer mapping fields to the closed native authorization schema.
    fields={'format','decision','binding','startsAt','expiresAt','maximumOperationSeconds','maximumCleanupSeconds','maximumJobSeconds','authorizationReference','independentSafetyReviewSha256'}
    need(type(inner)is dict and set(inner)==fields and inner['format']=='FRESH35_BATCHED_PREPARATION_AUTHORIZATION_V1'
         and inner['decision']=='AUTHORIZE_EXACT_BATCH_PREPARATION_AND_READONLY_ROOT_INSPECTION'
         and inner['binding']==outer['expectedBinding'] and inner['binding']['preparationScope']==native_scope()
         and inner['startsAt']==outer['startsAt'] and inner['expiresAt']==outer['expiresAt']
         and (inner['maximumOperationSeconds'],inner['maximumCleanupSeconds'],inner['maximumJobSeconds'])==(650,130,780),'CLOSED_UNCHANGED_NATIVE_AUTHORIZATION_REQUIRED')
    # Existing validateFresh35BatchedPreparationAuthorization still must run;
    # this static pairing does not validate current time or create a token.
