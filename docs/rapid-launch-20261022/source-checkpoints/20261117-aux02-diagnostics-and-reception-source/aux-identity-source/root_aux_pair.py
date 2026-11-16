"""Minimal root admission addition, to be paired with the existing frozen-job guard.
Does not replace its live C, lock, finite authority, file, policy or history checks.
"""
from identity_pair import OUTER,LOGICAL,WRITER,MAPPING,check_mapping,check_binding,need

def check_root_aux_pair(job,outer_authority,policy):
    need(job.get('jobId')==outer_authority.get('requestKey')==OUTER,'ONLY_EXACT_NEW_AUX02_ATTEMPT_ALLOWED')
    need(policy['jobs']['prepare']['jobId']==OUTER and policy['jobs']['writer']['jobId']==WRITER,'ORIGINAL_BUSINESS_WRITER_AND_AUX02_REQUIRED')
    need(policy['jobs']['prepare']['timeoutSeconds']==780 and policy['jobs']['writer']['timeoutSeconds']==3000,'ORIGINAL_PHASE_BUDGETS_REQUIRED')
    check_mapping(outer_authority.get('preparationIdentityMapping'))
    check_binding(outer_authority.get('expectedBinding'))
    need(outer_authority.get('preparationRequestKey')==LOGICAL
         and outer_authority.get('batchPlanPath')==MAPPING['batchPlanPath'],'OUTER_ATTEMPT_IS_NOT_NATIVE_LOGICAL_SCOPE')
    need(outer_authority.get('maximumJobSeconds')==780 and outer_authority.get('maximumChildSeconds')==650
         and outer_authority.get('maximumCleanupSeconds')==130,'EXACT_PREPARATION_BUDGET_REQUIRED')
