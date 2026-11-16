"""Exact outer attempt/native logical scope pairing. No runtime registration or clock."""
OUTER='t45-r3-final33-plan-prepare-20261116-02'
LOGICAL='t45-r3-final33-plan-prepare-20261116-01'
WRITER='t45-r3-batched-real-execute-20261115-01'
PLAN='/var/lib/naijue-erp/fresh35-production/real-first-20261110-r3/reports/'+OUTER+'/batched-plan.sqlite'
MANIFEST='7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'
INDEX='b5a6e1449795ccd4eef72de1599335633e2ee55cd076a7a0a920e9c4b063e9dd'
SUMMARY='6751463c596b0330faf7851c255bf972cbede3cfad6c0fed027e5befd137336d'
MAPPING={'outerPreparationAttemptKey':OUTER,'nativeLogicalPreparationKey':LOGICAL,'businessWriterRequestKey':WRITER,'batchPlanPath':PLAN}

def need(ok,code):
    if not ok:raise ValueError(code)

def check_mapping(mapping):
    need(type(mapping)is dict and mapping==MAPPING,'EXACT_AUX02_LOGICAL01_MAPPING_REQUIRED')

def check_binding(binding):
    need(type(binding)is dict and binding.get('format')=='FRESH35_BATCHED_PREPARATION_BINDING_V1'
         and binding.get('preparationScope')=={'requestKey':LOGICAL,'batchPlanPath':PLAN},'EXACT_LOGICAL01_NEW02_PLAN_REQUIRED')
    i=binding.get('inputBinding')
    need(type(i)is dict and i.get('manifestSha256')==MANIFEST and i.get('indexSha256')==INDEX and i.get('summarySha256')==SUMMARY,'EXACT_EXISTING_INPUT_IDENTITY_REQUIRED')
