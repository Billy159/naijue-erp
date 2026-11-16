RECOVERY_KEY='r3-final33-recovery-input-20261117-01'
def recovery_private_scope(control, grant):
    if control!='/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64' or grant!='b16447fbc81f4d64':
        raise ValueError('RECOVERY_EXACT_EXISTING_GRANT_REQUIRED')
    return dict(format='T45_PRIVATE_STANDARD_IMPORT_DATA_STAGING_V1',
        decision='AUTHORIZE_EXACT_PRIVATE_STANDARD_IMPORT_DATA_STAGING',taskId='T45',grantId=grant,
        artifactKey=RECOVERY_KEY,manifestSha256='7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679',
        archiveSha256='244bba744ce2f737bc3d5419ee6ba4179abbd15173b1d532d800fff231e39d4d',archiveBytes=40960,
        targetDirectory=control+'/private-standard-import-data/'+RECOVERY_KEY,
        kind='PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT',fragmentIndex=1,fragmentOffset=0)
def recovery_private_authority(a, control, grant):
    fixed=recovery_private_scope(control,grant)
    if (type(a) is not dict or set(a)!=set(fixed)|{'startsAt','expiresAt','decisionReference'}
        or not all(a[k]==v for k,v in fixed.items())
        or any(type(a[k]) is not int for k in ('startsAt','expiresAt','fragmentIndex','fragmentOffset','archiveBytes'))
        or not 0<a['expiresAt']-a['startsAt']<=600000
        or type(a['decisionReference']) is not str or not 0<len(a['decisionReference'])<=512):
        raise ValueError('RECOVERY_EXACT_PRIVATE_SCOPE_REQUIRED')

