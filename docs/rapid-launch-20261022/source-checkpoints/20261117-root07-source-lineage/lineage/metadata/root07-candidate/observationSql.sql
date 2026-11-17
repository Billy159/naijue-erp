WITH objects AS (SELECT 'pg_catalog.pg_class'::regclass AS classid,oid AS objid FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace
 UNION SELECT 'pg_catalog.pg_proc'::regclass,oid FROM pg_catalog.pg_proc WHERE pronamespace='naijue_erp'::regnamespace
 UNION SELECT 'pg_catalog.pg_type'::regclass,oid FROM pg_catalog.pg_type WHERE typnamespace='naijue_erp'::regnamespace
 UNION SELECT 'pg_catalog.pg_namespace'::regclass,'naijue_erp'::regnamespace
 UNION SELECT 'pg_catalog.pg_constraint'::regclass,oid FROM pg_catalog.pg_constraint WHERE connamespace='naijue_erp'::regnamespace
 UNION SELECT 'pg_catalog.pg_trigger'::regclass,t.oid FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid WHERE r.relnamespace='naijue_erp'::regnamespace
 UNION SELECT 'pg_catalog.pg_attrdef'::regclass,d.oid FROM pg_catalog.pg_attrdef d JOIN pg_catalog.pg_class r ON r.oid=d.adrelid WHERE r.relnamespace='naijue_erp'::regnamespace
 UNION SELECT 'pg_catalog.pg_policy'::regclass,p.oid FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class r ON r.oid=p.polrelid WHERE r.relnamespace='naijue_erp'::regnamespace) SELECT jsonb_build_object(
 'format','FRESH35_COMBINED_ACTUAL_CATALOG_V1','sourceSetSha256','db127efd32e1953fa550e56bd715b6ea334cc9d7e141217c4da8151bcd8c7803',
 'identity',jsonb_build_object('systemIdentifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()),'databaseOid',(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()),'database',current_database(),'owner',current_user,'actor',session_user,'serverVersionNum',current_setting('server_version_num'),'host',host(inet_server_addr()),'port',inet_server_port()),
 'catalog',jsonb_build_object(
 'relations',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM pg_catalog.pg_class r WHERE r.relnamespace='naijue_erp'::regnamespace),
 'columns',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class r ON r.oid=a.attrelid WHERE r.relnamespace='naijue_erp'::regnamespace),
 'routines',(SELECT coalesce(jsonb_agg(jsonb_build_object('identity',pg_catalog.pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid),'catalog',to_jsonb(p))),'[]'::jsonb) FROM pg_catalog.pg_proc p WHERE p.pronamespace='naijue_erp'::regnamespace),
 'types',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM pg_catalog.pg_type t WHERE t.typnamespace='naijue_erp'::regnamespace),
 'constraints',(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) FROM pg_catalog.pg_constraint c WHERE c.connamespace='naijue_erp'::regnamespace),
 'indexes',(SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class r ON r.oid=i.indexrelid WHERE r.relnamespace='naijue_erp'::regnamespace),
 'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid WHERE r.relnamespace='naijue_erp'::regnamespace),
 'sequences',(SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) FROM pg_catalog.pg_sequence s JOIN pg_catalog.pg_class r ON r.oid=s.seqrelid WHERE r.relnamespace='naijue_erp'::regnamespace),
 'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class r ON r.oid=p.polrelid WHERE r.relnamespace='naijue_erp'::regnamespace),
 'defaultAcl',(SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) FROM pg_catalog.pg_default_acl d WHERE d.defaclnamespace='naijue_erp'::regnamespace OR d.defaclrole=(SELECT nspowner FROM pg_namespace WHERE nspname='naijue_erp')),
 'dependencies',(SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) FROM pg_catalog.pg_depend d JOIN objects o ON o.classid=d.classid AND o.objid=d.objid WHERE true),
 'sharedDependencies',(SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) FROM pg_catalog.pg_shdepend d JOIN objects o ON o.classid=d.classid AND o.objid=d.objid WHERE d.dbid=(SELECT oid FROM pg_database WHERE datname=current_database())),
 'schema',(SELECT coalesce(jsonb_agg(to_jsonb(n)),'[]'::jsonb) FROM pg_catalog.pg_namespace n WHERE n.nspname='naijue_erp'),
 'database',(SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) FROM pg_catalog.pg_database d WHERE d.datname=current_database()),
 'roles',(SELECT coalesce(jsonb_agg(to_jsonb(r)-'rolpassword'),'[]'::jsonb) FROM pg_catalog.pg_roles r WHERE left(r.rolname,3)<>'pg_'),
 'membership',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) FROM pg_catalog.pg_auth_members a JOIN pg_catalog.pg_roles r ON r.oid=a.member WHERE left(r.rolname,3)<>'pg_'),
 'bootstrapObserver',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
 'catalog',pg_catalog.to_jsonb(f),'definition',pg_catalog.pg_get_functiondef(f.oid),'owner',o.rolname,'language',l.lanname,
 'dependencies',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d)),'[]'::pg_catalog.jsonb) FROM pg_catalog.pg_depend d WHERE d.classid='pg_catalog.pg_proc'::pg_catalog.regclass AND d.objid=f.oid),
 'sharedDependencies',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d)),'[]'::pg_catalog.jsonb) FROM pg_catalog.pg_shdepend d WHERE d.dbid=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()) AND d.classid='pg_catalog.pg_proc'::pg_catalog.regclass AND d.objid=f.oid)
 )),'[]'::pg_catalog.jsonb) FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_roles o ON o.oid=f.proowner JOIN pg_catalog.pg_language l ON l.oid=f.prolang
 WHERE f.pronamespace='pg_catalog'::pg_catalog.regnamespace AND f.proname='fresh35_exclusive_backends')),
 'lineage',(SELECT jsonb_agg(jsonb_build_object('version',version,'description',description) ORDER BY version) FROM naijue_erp.schema_migration))::text AS catalog_json;