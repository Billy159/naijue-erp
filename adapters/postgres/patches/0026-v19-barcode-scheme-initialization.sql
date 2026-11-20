-- Approved corrected v19: same-batch six-scheme initialization only. SOURCE, not an execution receipt.
-- Exact v16-from-v15 parent; no migrations/schema data, existing guards or grants changed.
BEGIN;
DO $predecessor$
DECLARE n bigint; required record;
BEGIN
 IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26] THEN
  RAISE EXCEPTION 'Exact schema26 v16-from-v15 required' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace AND prokind IN('f','p');
 IF n<>130 THEN RAISE EXCEPTION 'Exact130 routine parent required; no replay/from-v14' USING ERRCODE='23514'; END IF;
 FOR required IN SELECT * FROM (VALUES
 ('assert_core_initialization_v14','5ca42bcac20e7ad3affb3ac09829fd27c481752a303b1090133f23ecee3ad99d'),
 ('assert_history_typed_closure','8556e917e6a251dd1eb97974fbb6f793d3e46a1ef10f6ef7fd77fb7ad539d00f'),
 ('assert_native_bootstrap_accounts','171c59ba962a287dd02bb9eac993512e114783a470063108a07ba5e206cbabca'),
 ('assert_native_product_season_source','3a753b412fa4a648e26c4a2e398a4b52cc694c04dc1352a98513cb2220d4d661'),
 ('assert_retained_sku_reference','4c956a82b9531b1f385f9aecd9c6d20fa84ce6d434bb0a41d2a0c96ebb7fae5d'),
 ('assign_runtime_document_number','bca336abcd0ef4a57c22d2ee19564e7ea744257303fb8eec06c822efd551500e'),
 ('check_hall_default_customer_enabled','6a89df4342530f3a3bdd185abbdd372b3372799b341a17ae9ad65be86ded91ee'),
 ('cutoff_import_lock','82a621b9cea39c9cc273d5cb790b364fad004875760644633280d2e24e64ccc7'),
 ('exact_historical_customer_source_matches','ac26aa52f4131d996d6abe0db810a0e0817a12ffa043cdfb2250c951bfd0f011'),
 ('freeze_cutoff_sales_detail','dcfa1a3abb87368cf2f18663880f9a2ea9377a3599e985e13c7241220fd85a12'),
 ('freeze_imported_identity','0a17cf0a670ca8c9d34f2de1ec34de9b5197410fc01f82af4273a26e877a44e5'),
 ('guard_balance_identity','02f2db383ff8c5826c7148f73bb780319c977bffa5798bc233159d83d89e58fc'),
 ('guard_contributor_link','2937ecd3e974e2ad78e0bfce4790b96d97953d4bf113406a838063b366895983'),
 ('guard_cutoff_ledger','71ecb569279de61709578ffe2f29d85140993ed155fce07e7beb797307c491b5'),
 ('guard_exact_historical_customer_current_usage','78e895d72d6f806089d2bc7cb877293e1263d26ba8265dd7f3b5e2203e956245'),
 ('guard_header_native_reference','1584d2600c763f0d38cd3dd4fa7dd14ea90465ef9376d7165a58d71bce0dec3c'),
 ('guard_header_native_reference_publication','3419f73d296fcb84f77eff79edaa5034cb90f33a6363d0687d316ee697f785c0'),
 ('guard_history_closure_stage','d05947c6d7ef430d043c10038cce1d72f7e44e4efb2a2112c499ea8d107d47e0'),
 ('guard_history_insert','bbd40680f3196904c9c9e986c6f8cef0bee77c4cbb19663b8333e8b6150e1f2f'),
 ('guard_history_numeric_ledger','b32ccd2af06876d91fe4b33a4e2309a3f79af7d012ddf301ce84b773118e5794'),
 ('guard_history_publication','6ad32797b7fe81e6427b3abec90aca378778be9af30b014b55966fbed0bff77e'),
 ('guard_history_typed_publication','fc386026e40ca43d36bdb5e7422001878a7f91c95c2e36bce28272b4d792e506'),
 ('guard_import_accounting_claim','298996ca170c969aa06df8dfa44219b86a9db0ae4dc1c07f726167a518f62acf'),
 ('guard_import_accounting_publication','b41ad04a99fb7af999c22b13cdc7ad9b747e4df67e3f11bd44e7632d15a747a6'),
 ('guard_import_batch','f0e35d2d5978c92d26c1eab6525a87d2ae3450a525daa14131b479b03856d29a'),
 ('guard_import_record','8a79dbc011cdaf0582e2bd1eefc7ea94fce15d24f6aa1ac0fa25c43afb4e7e16'),
 ('guard_maintenance_account_event','965d9d3433b929ccd151b9a147eeef713770d7b7311e49c80cfaa3d17b118549'),
 ('guard_maintenance_audit_actor','ac0ce9c91f34b9d8d34eb5e7d26f595319bfa6ad3dfe3ae33a4f2f5edf1eb217'),
 ('guard_maintenance_before_root','574add1ad436482c7593725ac4b1b58cabe6b982b538cf0e1f22c1783723712f'),
 ('guard_maintenance_child_write','a19def51718e008e541482dd1e6f2d2ab9257842ce7e66ad6e62aedcfa216d8a'),
 ('guard_native_catalogue_binding','7418579c0d1c3a1951696a12ad165a421d26b87f0e449d9d7d250497dc2ddc21'),
 ('guard_native_catalogue_publication','d2eaa009760d63f245d562570ca4c8fce038633da5233a8c7ab7142190a30ceb'),
 ('guard_native_creation_identity','4827b76ff4df9beae18411033d2e6e13a04eea2d648aa58bb67d179145d107dc'),
 ('guard_native_party_import_intent','262e74a37ba12883a4978c4d99b6ecca000d245186b585a9e5b35ad31ccf8d7f'),
 ('guard_native_payment_binding','774cc9b1604a8d0948f73c7298fa67a10233962af218b89fe0b9675107148d35'),
 ('guard_native_payment_publication','993b114dfbec87428a42a9f6aa7d0a6ecbeef67fd85bc00754fa4eb80c7e6797'),
 ('guard_product_image_color','a49cc6bc4c49931eb50c81dd95e08a760b2ea6de73e19a0496611fe63fe22b18'),
 ('guard_product_season_selection','bd97ac1bc0a8c9a3221c12b794f5976bf0e092a2907aa2dd9e6378b718d29560'),
 ('guard_referenced_season_identity','8eb0b3435f063f4a653c31f632fe6751fecc3864a375a72753bcf4090bb18f2c'),
 ('guard_retained_catalogue_delete','dec785b8b1f818b2daa3af4d3872139710cae32178516839e669f59aa6609758'),
 ('guard_retained_catalogue_reference','91cc169d60ca6db2700ed97e49632504cfba9d957ea467a4777137f946c6923c'),
 ('guard_runtime_document_number','52d92723d9ecb5f16eb57c5ae50e0f8cf322b4b5f3848ab88712f41aeb0887bd'),
 ('guard_successor_publication26','a055abd422ff4d81d0cf87e11cf659dcc221eda1a18b774cd62034c2c3f74c14'),
 ('guard_successor_source26','cdf91a3949d6aefbb16c67f7d82dcf99b60730f9a6884468c064102c9887b710'),
 ('history_closure_count_map','ef82c0a7124d288103df38503a849b96aa936289b2ee29166b4f0a6529f476d6'),
 ('history_closure_digest','749101b8670e32814b875adaaf753da6c50ddcd0860d5ca3ebb000f996f1b63b'),
 ('history_closure_document_rows','f8401b06df7815f63f9a83e781961f55725f82246c87d86b7a99a9c19c482ce1'),
 ('history_closure_encode','b4ad51b2b17c9248c80de0ead3ae5f50bf5fe887e36597b081ce250a94623a5c'),
 ('history_closure_finish','94b84af2d05d8a9f34c0135a8c0d70f5b633a9b43e6ec6d2bca8de554e8abac8'),
 ('history_closure_fold','31ed823c127e85537196de072b76077749d939f3241fa53b9f1c76f8fdba9062'),
 ('history_closure_projection','0af6d70c56a463c351be1dd732d345bbb533ae98b0b07e36f6ef08a4efd72011'),
 ('history_closure_projection_columns','a8a3d4d43341d86dfad188d191c3076203e06ea8f1a6919c4d0efddee76286a6'),
 ('history_closure_projection_key','6e2584dac9f079fe2061570c15b13549a3abac512a2a809835046e6fe2c50222'),
 ('history_closure_row_hash','c7ef0fdc273f23ab5ec1ae6c870746146dab90a6ecef8ecf319de0704df697bb'),
 ('history_closure_rows','098ba7215c7c893903e2b72762e2036e94bc23b763f3842e378b3d55b3d3f639'),
 ('history_closure_seed','532918606a4dd24ebae46a55dfe7d2f0803602798c63742bcd975b7e1179f2c7'),
 ('history_effective_writes_closed','c06027597f11a9cf7f2ae06bf5e47e5c21349b54851fb21df6895ef22a2855b7'),
 ('history_numeric_current_facts','dadecb6cce657834ce3719eb339f56f95dbbf27d6e0a92216940ed91697cadc8'),
 ('history_numeric_money','8c588f3b6145cb1609898dd46e3abfb7b1bd37b3b9318f1863dcfac530ee200b'),
 ('history_revision_not_enabled','1e69497d7023ab61fdac15e358707c9b9b73b7f3b281a01c306c2fd25d3c985c'),
 ('import_source_key_lock','07404b25633a5c48ae1a530a48cdebed11107e187d660c99a7e781bb4957fa24'),
 ('inventory_key_admission','a9d7a2519941605e997e5ab59cff7cf847192ed910ef4107ba09aadc64e0fc7a'),
 ('inventory_key_lock','c6f444fbbfc527fec7f4031fd0ea7f07eb0a98202b11340e8f7da398fa117079'),
 ('inventory_runtime_key_admitted','945a2cc1e250ed1cedd3ca2083b80120174d06d015455bd4288d186e0c27f377'),
 ('is_exact_historical_customer_only','1f35799a742f402d86cde6a979511dc83ae74d62cd5c106ffcef162a68510403'),
 ('is_native_party_import_insert','a3c8dfac77e8a4f060932aded92f53da97b68bdcf48d2ede19781c3e54c86412'),
 ('keep_barcode_binding_identity','14f6d02bca58955681e8d03236fb236cbfe3d041d35ecdb326cd3fa7e38d2733'),
 ('keep_party_native_identity','44c3a7110bf40ef38e73972b493f36279b28124097b31a9a6f25e5adc13ad4b9'),
 ('keep_sales_line_owner','95f3dc678bbdc8ac47a2f1c76fe13f872bed088e7484aebc46a523fc13cfd241'),
 ('keep_transfer_header_provenance','68d1af54e61704be47e9fe4097592e812d3f7a910dc2d7190351c2b427267bf6'),
 ('keep_transfer_line_owner','763d52e081f96f872adb50658403f5f2f7f83f7c914d002b0e771ebe9c055335'),
 ('maintenance_account_credential_action','f17617bc8f02fd0731d0a97eaca90553441235e032de1dbf9086e84c987fbe7a'),
 ('maintenance_action_allowed','50b2fa0fbf733d7c98b40aa612107a20262cb063852cb3f2cabbefc750742c4a'),
 ('maintenance_administrator_mutex','d6809b2abf7b3f211cd7422b517e867d0c1378f9e7fe9b98eacde2521c6d1ea8'),
 ('maintenance_audit_is_current','4537d6df2b73e17e386b100845049da08d3fab3584c87ef8d7095660198bf699'),
 ('maintenance_check_account_credential','577bf0a5de72c8dc6d080c1b4f18a669398d5738c16b75d11ecc1c89d0156ab7'),
 ('maintenance_check_category_order','77c86d2788e88f2922a66c662a91b95c0f76d6ea00587148c36421feabde281e'),
 ('maintenance_check_product_children','c7edab87301fc05b7f33db2eb9df30b2da0d28ed9154dfa8d11cbba9fdbe6dad'),
 ('maintenance_check_staff_accounts','ea4e151ccb89d97ed40edc6e3164594bccda0fc28f2879f614f230830fdc0c22'),
 ('maintenance_complete_row_matches','34c25d78bc34ed57b1acbbdbfbca9b0adfd78dc8dcb6cc8c42cf5673f5da5d21'),
 ('maintenance_evidence_matches','cb201d859235d7af9ef52616c64b705e5586b11894d57fbc50b2b0a7615abaf3'),
 ('maintenance_exact_rows_match','8b21824423a27f20074768c09998fba819887c949b4f20b57e35db0815133161'),
 ('maintenance_payment_halls','d96c975c57af714d458275a383e0e2bdaeef9214d4bc64420207f36bcea55869'),
 ('maintenance_product_child_row','69145227348d366932814f079f0b63d1bb6109cc36d8bb8c9f8ae53fafd1b9fa'),
 ('maintenance_root_table','7ed286cf1e5bb8629b02e7cab4412dc0df502d560661be9823d234c466565fe3'),
 ('maintenance_staff_accounts','a191dc7b42cec0f41f42c6d371a2e959c90019983f4f79cef86db99d2e8fa989'),
 ('native_creation_operation_valid','118bbe55c39e00948ab087f808812522b565344b924e64916f6cfa91645a3f7a'),
 ('party_key_values','d23eb5601f984007df5d52661a101a422852e20c0bcd75f1cadd5a5bbbaef649'),
 ('published_inventory_key','fa8234711ad74b3afd250b2143840baa863f05f1e23c92b85574b48b4208adc6'),
 ('reject_immutable_change','3daef49e525ad973be82350a1551e979198d21ff58f3f1bb92a4f7292e4d038c'),
 ('reject_unimplemented_cutoff_write','2e108a1bd9e9304f63cde9eb8b726c448ebcb2d2b371f8b3a8a41aebb6d21e0a'),
 ('safe_maintenance_evidence','4a0d9d21eadf3e839d1d0c23f7efe8a0ef14123dd521a553eefcc7362ab3f927'),
 ('transfer_header_audit_values','0c92b020490243f55132a5acb15ecee8caca92fb88db5f75e877e2f2430ec8ad'),
 ('transfer_line_audit_values','ce924832c6a9b4a762ff80e031279273f521e4e17139c7d89a4930004313f49e'),
 ('valid_history_counts','6c143e2bf81bcd53e2c9074aa2ab4e1781c746bc7a99bb0064f378f77de80280'),
 ('valid_product_season_ids','b6b3932264857c59998025cece6241a4e819b80f9bc72e6bf0ed4e907890cc65'),
 ('validate_available_administrator_commit','3a9a1bea930614761185af90b8591a539b855647974b68b004869c80f5e5ba18'),
 ('validate_baseline_source_commit','ec5e9a331d0f8148ec21e28d5e8a4ddb82ac66d923ea2490abee3f3000ed75c9'),
 ('validate_document_specification_commit','b02bff6115bcf2c87758f8313a57a1a693733ba3ea192fcb1657bd176c587c06'),
 ('validate_exact_historical_customer_intent','b9968150e138d455658dd7d437c8026b7bfdce466146b961d64fd2934f099c98'),
 ('validate_exact_native_reversal','3ef72272c6cb9b7ccbfffc393a31fdd85babdb3efb333baae839482d571f362e'),
 ('validate_history_closure_commit','e61d2c5dd34792f5ca277cada1dc12a6904b1be95031c0a6c4810080b24dd03b'),
 ('validate_history_numeric_balance_commit','fab0bf7a3f1681d6034b09dbb5c7ad8efa606c6fa82f24fc101bc5b70636a837'),
 ('validate_history_numeric_receipt_commit','e69f92651dc7a8313e354d47bd4f1ffc1c97fb30aa5c56dcfc49f69511a1d7d6'),
 ('validate_history_numeric_revision_commit','6cc941ed8ea63927fea7f372da6477c5def8e809a8dde1c348d07331ff9be0b6'),
 ('validate_history_product_proofs','dab49bb495de85d5e66350affd348f85e0595411ea7ab7378104a3963db2a38e'),
 ('validate_import_accounting_baseline_commit','678cc0b409e43e420365733b21ce8e8ce0aa88b8d3b9b48f9a842edd41120c51'),
 ('validate_import_accounting_checkpoint_commit','edef6846035f1780c632183b32f81b63919cae4703a78c4bc21c44c507441f47'),
 ('validate_import_accounting_claim_commit','ad8e19c3f36b85ebbda107a2ca8e3c00ad10ca3005a232bd033bbab7613be756'),
 ('validate_import_accounting_final_record_commit','f1fca00daa56873221062706d2009293b6180156e69bfe6f5fc1ca64087ea312'),
 ('validate_import_batch_commit','dc2e8d344085056b53469be394eb9ced344db510bf6f6dc5576f4b0a9ea20140'),
 ('validate_import_operation','6ffc2561abe1bd4ff7465c82143c155bcaa0ad311b90f6679bef10ceae30c62f'),
 ('validate_import_publish','873d1943b1ada13eeef43f6d28cb792755de48c461b1ebee7810e5278cd5d6e3'),
 ('validate_import_source_commit','524ec70d51970cfc79f4ec5e9a93f21bf20733781a2202121a4e91d1d6b66f3a'),
 ('validate_ledger_receipt_source','26f2f325172ef2878d4dffb4f1740d680e63458abd4b25e7a693e352664d15da'),
 ('validate_maintenance_receipt_commit','77679e1e21858ae64ac1225660cf7a692f63b097d538254829def8164ea33ac5'),
 ('validate_maintenance_root_commit','002818dfd8d764e99221bb0548da1141054871ae674aba6bb9f6ce59c9d92d1c'),
 ('validate_native_creation_commit','a505ceb68946cc14a69b181cd43d6cebbedca9e9ea453c9920c243892f537cd7'),
 ('validate_native_party_import_commit','5383c9941e06c7748af6603eee56559b102b09305c11771a813c6cf859ad37e3'),
 ('validate_party_native_commit','dba217f39c61d3f4741a72a565851a41caaa18e44fb57aa2f8e3473d20810762'),
 ('validate_party_receipt_commit','fafc3389b3458b6d8ec4cad15f6f926dcc20bb059a819c496ed4db260d06b426'),
 ('validate_sales_commit','f00b31849f4f72d62103fc08cb4e157b4401717a1f2c7c05fc699663715f07a2'),
 ('validate_sales_effect','e6b2bbec00a6389ed92f9026af20f06c52168d37fe5a59d3ccfc0c29fb7cb1db'),
 ('validate_sales_settlement','c0ab9b6a91951a809e5fbfb6c34ed52fb164b76119d58d469d411c0b58e734a3'),
 ('validate_sparse_balance_commit','937b31d7ab0f1e5d8fb7febc26c051690b2df9dc79d451088eff73d75046399d'),
 ('validate_transfer_balance_commit','9bfaa1cdf1dea76ada35bae56dd40cb3e27c6acd28a93905ee2f06d17a8b2abb'),
 ('validate_transfer_commit','e6ceac3fddef4e61f649b8ef2d71db56042dc14c7622ca0a5c321de2ab7b3f38'),
 ('validate_transfer_effect','d901f8e428c9ef2440d9fb48aca3f638eef141bd62f116e88698c6f726ad0c73'),
 ('validate_transfer_header_commit','6d50fa80e2b445bc45645ff0f5592f2ed4e00836077224c1fe3510b4e563fa0c'),
 ('validate_transfer_line_commit','1443f443a884f0073209294476daf9a7ff0f45d6d32832e5d14557d513cfc4fb')
 ) x(name,body_sha256) LOOP
  IF (SELECT count(*) FROM pg_proc p WHERE p.pronamespace='naijue_erp'::regnamespace AND p.proname=required.name AND p.prokind='f'
   AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=required.body_sha256)<>1 THEN
   RAISE EXCEPTION 'Exact predecessor routine differs: %',required.name USING ERRCODE='23514'; END IF;
 END LOOP;
END $predecessor$;
DO $actions$
DECLARE rel regclass; col text; name text; expression text;
BEGIN
 FOR rel,col,name IN SELECT * FROM (VALUES
 ('naijue_erp.operation_receipt'::regclass,'target_type','receipt_action_by_kind'),
 ('naijue_erp.audit_change'::regclass,'object_type','audit_action_by_kind')) x(r,c,n) LOOP
  SELECT pg_get_expr(conbin,conrelid) INTO STRICT expression FROM pg_constraint WHERE conrelid=rel AND conname=name;
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',rel,name);
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (((%s) OR (%I=''IMPORT'' AND action=''IMPORT_INITIALIZE_BARCODE_SCHEMES'')) IS TRUE)',rel,name,expression,col);
 END LOOP;
END $actions$;

CREATE FUNCTION naijue_erp.assert_barcode_scheme_initialization_v19(selected_batch uuid, selected_operation uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp AS $$

#variable_conflict use_column
DECLARE init jsonb; before_cp jsonb; after_cp jsonb; scheme_rows jsonb; birth_binding uuid; fresh boolean;
 approved jsonb:=$approved$[{"sourceSchemeKey":"2018","native":{"id":"c0b009e7-6f61-447a-b87e-ceea62711ec9","name":"18年货品","barcode_type":"Code128","rule_description":"原方案描述快照；保留每条原条码和已确认SKU绑定，不依据本说明重新生成、补位、截断或改码。声明总长仅保留方案说明，不代替每条历史原码。","code_length":9,"rule_version":"NATIVE_SOURCE_RETAINED_V1","status":"HISTORICAL"}},{"sourceSchemeKey":"2020","native":{"id":"82656465-2758-4be8-a965-412a971e9c4b","name":"2020年新方案","barcode_type":"Code128","rule_description":"原方案描述快照；保留每条原条码和已确认SKU绑定，不依据本说明重新生成、补位、截断或改码。2020颜色1位、尺码2位的最后补充优先于原表旧备注。声明总长仅保留方案说明，不代替每条历史原码。","code_length":14,"rule_version":"NATIVE_SOURCE_RETAINED_V1","status":"HISTORICAL"}},{"sourceSchemeKey":"2021","native":{"id":"bc7ff32c-1025-4c30-8950-0b33a492c538","name":"2021年条码方案","barcode_type":"Code128","rule_description":"原方案描述快照；保留每条原条码和已确认SKU绑定，不依据本说明重新生成、补位、截断或改码。声明总长仅保留方案说明，不代替每条历史原码。","code_length":13,"rule_version":"NATIVE_SOURCE_RETAINED_V1","status":"HISTORICAL"}},{"sourceSchemeKey":"2021fit","native":{"id":"48c4fe44-7521-44c1-a0e3-c547a1691028","name":"2021年版型条码方案","barcode_type":"Code128","rule_description":"原方案描述快照；保留每条原条码和已确认SKU绑定，不依据本说明重新生成、补位、截断或改码。声明总长仅保留方案说明，不代替每条历史原码。","code_length":14,"rule_version":"NATIVE_SOURCE_RETAINED_V1","status":"HISTORICAL"}},{"sourceSchemeKey":"2023","native":{"id":"9c584ada-9d42-4159-9e51-208577657021","name":"2023年条码方案","barcode_type":"Code128","rule_description":"原方案描述快照；保留每条原条码和已确认SKU绑定，不依据本说明重新生成、补位、截断或改码。声明总长仅保留方案说明，不代替每条历史原码。","code_length":14,"rule_version":"NATIVE_SOURCE_RETAINED_V1","status":"HISTORICAL"}},{"sourceSchemeKey":"2026","native":{"id":"0e70e45e-1a51-4d44-afe8-0002cf3fb7ef","name":"2026年条码方案","barcode_type":"Code128","rule_description":"原方案描述快照；保留每条原条码和已确认SKU绑定，不依据本说明重新生成、补位、截断或改码。声明总长仅保留方案说明，不代替每条历史原码。","code_length":15,"rule_version":"NATIVE_SOURCE_RETAINED_V1","status":"CURRENT"}}]$approved$;
 pins jsonb:=$pins${"proposalSha256":"826e63b33e8e2f52a521d5ba3e930899d61092dfb22f65b11db4f799f7efef00","approvalSha256":"f9da50c270c14321b17af06255a5f0649daf8b55a725b6a29fe483f342517533","writeContractReplySha256":"9ec37b0219f227fa39e754364ea04f1962866664283812f8d9b383ba19b2acfc"}$pins$;
 b naijue_erp.import_batch%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE;
 cr naijue_erp.operation_receipt%ROWTYPE; ca naijue_erp.audit_change%ROWTYPE; e naijue_erp.native_party_import_evidence%ROWTYPE;
 birth jsonb; members jsonb; item jsonb; cp jsonb; full_binding jsonb; member jsonb; step jsonb; state jsonb; actual jsonb; field record;
 ma naijue_erp.audit_change%ROWTYPE; mr naijue_erp.operation_receipt%ROWTYPE; before_root jsonb; after_root jsonb; table_name text; n bigint;
 batch_heap_xmin bigint; receipt_heap_xmin bigint;
 zero_cp jsonb:='{"sequence":0,"cursor":0,"counts":{"WAREHOUSE":0,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0},"expected":{}}';
 core_cp jsonb:='{"sequence":1,"cursor":22,"counts":{"WAREHOUSE":22,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0},"expected":{}}';
BEGIN
 PERFORM naijue_erp.cutoff_import_lock();
 SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=selected_batch FOR UPDATE;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=selected_operation;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
 SELECT * INTO STRICT cr FROM naijue_erp.operation_receipt WHERE target_type='IMPORT' AND target_id=b.id AND action='IMPORT_CORE_STAGE' AND status='COMMITTED';
 SELECT * INTO STRICT ca FROM naijue_erp.audit_change WHERE operation_id=cr.id;
 birth:=ca.after_values; members:=birth->'coreSourceMembers';
 IF (birth ?& ARRAY['schemaVersion','phase','coreSourceDigest','coreCounts','coreSourceMembers','authority','checkpoint','fullBinding','fullFrozen']
  AND birth-ARRAY['schemaVersion','phase','coreSourceDigest','coreCounts','coreSourceMembers','authority','checkpoint','fullBinding','fullFrozen']='{}'::jsonb
  AND birth->'schemaVersion'='1'::jsonb AND birth->>'phase'='CORE_INITIALIZED_V1' AND birth->>'coreSourceDigest'~'^[a-f0-9]{64}$'
  AND birth->'coreCounts'='{"STAFF":49,"HALL":22,"WAREHOUSE":22,"CUSTOMER":22,"USER_ACCOUNT":49}'::jsonb
  AND birth->'checkpoint'=core_cp AND birth->'fullBinding'='null'::jsonb AND birth->'fullFrozen'='false'::jsonb
  AND jsonb_typeof(members)='object' AND members ?& ARRAY['parties','accounts'] AND members-ARRAY['parties','accounts']='{}'::jsonb
  AND jsonb_typeof(members->'parties')='array' AND jsonb_array_length(members->'parties')=115
  AND jsonb_typeof(members->'accounts')='array' AND jsonb_array_length(members->'accounts')=49
  AND birth->'authority' ?& ARRAY['account_capture_sha256','account_decisions_sha256','identity_review_sha256','bootstrap_execution_review_sha256','source_identity_facts_sha256','approved_employee_plan_sha256','old_source_batch_id','old_source_manifest_sha256','target','actorAccountId','batchId','namespace','selectionSha256','cutoffAt','bootstrapAt','commandHash','operationId']
  AND (birth->'authority')-ARRAY['account_capture_sha256','account_decisions_sha256','identity_review_sha256','bootstrap_execution_review_sha256','source_identity_facts_sha256','approved_employee_plan_sha256','old_source_batch_id','old_source_manifest_sha256','target','actorAccountId','batchId','namespace','selectionSha256','cutoffAt','bootstrapAt','commandHash','operationId']='{}'::jsonb
  AND birth->'authority'->>'actorAccountId'=cr.actor_account_id::text AND birth->'authority'->>'batchId'=b.id::text
  AND birth->'authority'->>'namespace'=b.source_name AND birth->'authority'->>'selectionSha256'=b.source_hash
  AND birth->'authority'->>'commandHash'=cr.request_hash AND birth->'authority'->>'operationId'=cr.id::text
  AND naijue_erp.maintenance_evidence_matches(birth->'authority'->'cutoffAt',to_jsonb(b.cutoff_at))
  AND naijue_erp.maintenance_evidence_matches(birth->'authority'->'bootstrapAt',to_jsonb(b.created_at))
  AND ca.old_version=1 AND ca.new_version=2 AND ca.before_values=zero_cp
  AND ca.object_type='IMPORT' AND ca.object_id=b.id AND ca.action='IMPORT_CORE_STAGE' AND ca.actor_account_id=cr.actor_account_id
  AND ca.occurred_at=cr.completed_at AND cr.created_at=b.created_at AND cr.completed_at=b.created_at
  AND cr.result_data=jsonb_build_object('operationId',cr.id,'batchId',b.id,'sequence',1,'cursor',22,'status','STAGED','ledgerEntryIds','[]'::jsonb,
   'phase','CORE_INITIALIZED_V1','coreSourceDigest',birth->'coreSourceDigest','coreCounts',birth->'coreCounts')) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Exact immutable CORE birth/audit/receipt required' USING ERRCODE='23514'; END IF;
 IF (SELECT count(DISTINCT x->>'sourceRowId') FROM jsonb_array_elements(members->'parties') x)<>115
  OR (SELECT count(DISTINCT x->>'nativeId') FROM jsonb_array_elements(members->'parties') x)<>115
  OR (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(members->'accounts') x)<>49
  OR (SELECT count(DISTINCT x->>'staff_id') FROM jsonb_array_elements(members->'accounts') x)<>49 THEN
  RAISE EXCEPTION 'CORE members must retain distinct source/native identities' USING ERRCODE='23514'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(members->'parties') LOOP
  IF (jsonb_typeof(item)='object' AND item ?& ARRAY['sourceRowId','entity','sourceKey','nativeId']
    AND item-ARRAY['sourceRowId','entity','sourceKey','nativeId']='{}'::jsonb AND item->>'entity' IN('STAFF','HALL','WAREHOUSE','CUSTOMER')) IS DISTINCT FROM TRUE THEN
   RAISE EXCEPTION 'Exact CORE party member tuple required' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT e FROM naijue_erp.native_party_import_evidence WHERE batch_id=b.id AND source_row_id=(item->>'sourceRowId')::uuid
   AND entity_type=item->>'entity' AND source_key=item->>'sourceKey' AND native_id=(item->>'nativeId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_source_row s WHERE s.id=e.source_row_id AND s.batch_id=e.batch_id
   AND to_jsonb(s)=to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,e.source_snapshot))) THEN
   RAISE EXCEPTION 'CORE immutable source differs from birth evidence' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY['STAFF','HALL','WAREHOUSE','CUSTOMER'] LOOP
  SELECT count(*) INTO n FROM jsonb_array_elements(members->'parties') x WHERE x->>'entity'=table_name;
  IF n<>(birth->'coreCounts'->>table_name)::bigint THEN RAISE EXCEPTION 'CORE exact entity member counts required' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(members->'accounts') LOOP
  IF (item ?& ARRAY['id','staff_id','login_enabled','auth_version','version','created_at','updated_at']
   AND item-ARRAY['id','staff_id','login_enabled','auth_version','version','created_at','updated_at']='{}'::jsonb
   AND item->'version'='1'::jsonb AND item->'auth_version'='1'::jsonb
   AND EXISTS(SELECT 1 FROM naijue_erp.native_party_import_evidence e JOIN naijue_erp.import_source_row s ON s.id=e.source_row_id
    WHERE e.batch_id=b.id AND e.entity_type='STAFF' AND e.native_id=(item->>'staff_id')::uuid
    AND s.field_provenance->'fields'->'bootstrap_accounts'->'raw'->'accounts'->0->'native_snapshot'=item)
   AND EXISTS(SELECT 1 FROM naijue_erp.user_account u WHERE u.id=(item->>'id')::uuid AND u.staff_id=(item->>'staff_id')::uuid)) IS DISTINCT FROM TRUE THEN
   RAISE EXCEPTION 'CORE retains original safe account birth proof and live identity only' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM naijue_erp.import_record_accounting_claim WHERE operation_id=cr.id)<>22
  OR EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim c LEFT JOIN naijue_erp.import_record rec ON rec.id=c.import_record_id
   LEFT JOIN naijue_erp.native_party_import_evidence e ON e.batch_id=c.import_batch_id AND e.entity_type='WAREHOUSE' AND e.native_id=c.target_id
   WHERE c.operation_id=cr.id AND (c.import_batch_id<>b.id OR c.target_type<>'WAREHOUSE' OR c.checkpoint_sequence<>1 OR c.claimed_at<>b.created_at
    OR rec.import_batch_id IS DISTINCT FROM b.id OR rec.target_type IS DISTINCT FROM 'WAREHOUSE' OR rec.target_id IS DISTINCT FROM c.target_id
    OR rec.status IS DISTINCT FROM 'IMPORTED' OR rec.source_entity_type IS DISTINCT FROM 'WAREHOUSE'
    OR rec.source_key IS DISTINCT FROM e.source_key OR rec.source_record_hash IS DISTINCT FROM e.source_snapshot->>'row_sha256'
    OR rec.source_file_ref IS DISTINCT FROM e.source_snapshot->>'file_ref'
    OR e.warehouse_record IS DISTINCT FROM jsonb_build_object('id',rec.id,'reviewedAt',e.warehouse_record->'reviewedAt','decisionReason',rec.decision_reason)
    OR rec.reviewed_at IS DISTINCT FROM (e.warehouse_record->>'reviewedAt')::timestamptz
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(members->'parties') x WHERE x->>'entity'='WAREHOUSE' AND x->>'nativeId'=c.target_id::text))) THEN
  RAISE EXCEPTION 'CORE must retain its22 exact original warehouse claims and creator records' USING ERRCODE='23514'; END IF;

 init:=a.after_values->'schemeInitialization'; before_cp:=a.before_values->'checkpoint'; after_cp:=a.after_values->'checkpoint';
 fresh:=(SELECT q.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint FROM naijue_erp.operation_receipt q WHERE q.id=r.id);
 IF (r.target_type='IMPORT' AND r.target_id=b.id AND r.action='IMPORT_INITIALIZE_BARCODE_SCHEMES' AND r.status='COMMITTED'
  AND r.actor_account_id=cr.actor_account_id AND length(btrim(r.request_key))>0 AND r.request_hash~'^[a-f0-9]{64}$'
  AND a.object_type='IMPORT' AND a.object_id=b.id AND a.action=r.action AND a.actor_account_id=r.actor_account_id
  AND a.occurred_at=r.completed_at AND r.created_at=r.completed_at AND a.new_version=a.old_version+1
  AND a.before_values ?& ARRAY['checkpoint','schemes'] AND a.before_values-ARRAY['checkpoint','schemes']='{}'::jsonb
  AND a.before_values->'schemes'='[]'::jsonb
  AND a.after_values ?& ARRAY['checkpoint','schemeInitialization','commandHash'] AND a.after_values-ARRAY['checkpoint','schemeInitialization','commandHash']='{}'::jsonb
  AND a.after_values->>'commandHash'=r.request_hash
  AND before_cp ?& ARRAY['sequence','cursor','counts','expected'] AND before_cp-ARRAY['sequence','cursor','counts','expected']='{}'::jsonb
  AND jsonb_typeof(before_cp->'sequence')='number' AND before_cp->>'sequence'~'^[1-9][0-9]*$'
  AND jsonb_typeof(before_cp->'cursor')='number' AND before_cp->>'cursor'~'^[0-9]+$'
  AND (before_cp->>'sequence')::bigint+1=(after_cp->>'sequence')::bigint
  AND a.old_version=(before_cp->>'sequence')::integer+1 AND a.new_version=(after_cp->>'sequence')::integer+1
  AND after_cp=jsonb_set(before_cp,'{sequence}',to_jsonb((before_cp->>'sequence')::integer+1))
  AND init ?& ARRAY['version','coreReceiptId','coreSourceDigest','fixedSourceNamespace','selectionSha256','cutoffAt','target','approvalPins','schemes']
  AND init-ARRAY['version','coreReceiptId','coreSourceDigest','fixedSourceNamespace','selectionSha256','cutoffAt','target','approvalPins','schemes']='{}'::jsonb
  AND init->>'version'='BARCODE_SCHEME_INITIALIZATION_V19' AND init->>'coreReceiptId'=cr.id::text AND init->>'coreSourceDigest'=birth->>'coreSourceDigest'
  AND init->>'fixedSourceNamespace'=b.source_name AND init->>'selectionSha256'=b.source_hash
  AND naijue_erp.maintenance_evidence_matches(init->'cutoffAt',to_jsonb(b.cutoff_at)) AND init->'approvalPins'=pins
  AND init->'target'=jsonb_build_object('database',current_database(),'role',current_user,'serverAddress',inet_server_addr()::text,'serverPort',inet_server_port(),'postmasterStartedAt',pg_postmaster_start_time()::text)
  AND jsonb_typeof(init->'schemes')='array' AND jsonb_array_length(init->'schemes')=6
  AND (SELECT jsonb_agg(x ORDER BY x->>'sourceSchemeKey') FROM jsonb_array_elements(init->'schemes') x)=approved
  AND b.mapping_version='V2_HISTORY_NULLABLE_1' AND b.inventory_mode='CUTOFF_STOCK_BASELINE'
  AND b.status IN('STAGED','VALIDATING') AND b.completed_at IS NULL AND NOT b.history_validation_passed
  AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED')
  AND (SELECT count(*) FROM naijue_erp.operation_receipt WHERE target_type='IMPORT' AND target_id=b.id AND action=r.action)=1
  AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE operation_id=r.id)
  AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE operation_id=r.id)
  AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_balance WHERE last_operation_id=r.id)
  AND EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff st ON st.id=u.staff_id LEFT JOIN naijue_erp.hall h ON h.id=st.hall_id
   WHERE u.id=r.actor_account_id AND u.login_enabled AND st.employment_status='在职' AND st.role='ADMIN' AND (st.hall_id IS NULL OR h.enabled))) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Exact original source-bound six-scheme operation/birth/actor/checkpoint audit and receipt required' USING ERRCODE='23514'; END IF;
 IF (r.result_data=jsonb_build_object('operationId',r.id,'batchId',b.id,'sequence',after_cp->'sequence','cursor',after_cp->'cursor','status',r.result_data->'status','ledgerEntryIds','[]'::jsonb)
  AND r.result_data->>'status' IN('STAGED','VALIDATING')) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Original six-field zero-effect initialization receipt required' USING ERRCODE='23514'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id),'[]'::jsonb) INTO scheme_rows FROM naijue_erp.barcode_scheme q;
 IF scheme_rows IS DISTINCT FROM (SELECT jsonb_agg(x->'native' ORDER BY x->'native'->>'id') FROM jsonb_array_elements(approved) x) THEN
  RAISE EXCEPTION 'Whole scheme table must retain all exact six approved snapshots on creation and replay' USING ERRCODE='23514'; END IF;
 IF fresh AND (b.checkpoint IS DISTINCT FROM after_cp OR r.result_data->>'status' IS DISTINCT FROM b.status
  OR EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE batch_id=b.id AND entity_type='BARCODE')
  OR EXISTS(SELECT 1 FROM naijue_erp.sku_barcode)) THEN
  RAISE EXCEPTION 'First scheme initialization precedes all barcode effects and advances only sequence' USING ERRCODE='23514'; END IF;
 IF (b.checkpoint->>'sequence')::bigint<(after_cp->>'sequence')::bigint THEN
  RAISE EXCEPTION 'Committed scheme checkpoint cannot disappear on replay' USING ERRCODE='23514'; END IF;
 IF b.history_payload_hash IS NOT NULL THEN
  SELECT id INTO STRICT birth_binding FROM naijue_erp.operation_receipt WHERE target_type='IMPORT' AND target_id=b.id AND action='IMPORT_BIND_FULL_SOURCE' AND status='COMMITTED';
  PERFORM naijue_erp.assert_core_initialization_v14(b.id,birth_binding,false);
 ELSIF b.history_expected_counts IS NOT NULL OR b.checkpoint->'expected'<>'{}'::jsonb THEN
  RAISE EXCEPTION 'Original unbound CORE metadata cannot be partially substituted' USING ERRCODE='23514'; END IF;
END $$;
REVOKE ALL ON FUNCTION naijue_erp.assert_barcode_scheme_initialization_v19(uuid,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION naijue_erp.validate_import_batch_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE core_operation uuid; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; kind text; processed numeric; counted numeric := 0;
BEGIN
  IF TG_OP='UPDATE' THEN
    SELECT * INTO a FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND object_id=NEW.id
      AND new_version=((NEW.checkpoint->>'sequence')::bigint+1)::integer;
    IF FOUND AND a.action='IMPORT_INITIALIZE_BARCODE_SCHEMES' THEN
      IF OLD.checkpoint IS DISTINCT FROM a.before_values->'checkpoint' OR NEW.checkpoint IS DISTINCT FROM a.after_values->'checkpoint' THEN
        RAISE EXCEPTION 'Initialization event must retain original before and exact successor checkpoint' USING ERRCODE='23514'; END IF;
      PERFORM naijue_erp.assert_barcode_scheme_initialization_v19(NEW.id,a.operation_id); RETURN NULL;
    END IF;
  END IF;
  IF NEW.mapping_version='V2_HISTORY_NULLABLE_1' AND (NEW.history_payload_hash IS NULL OR (TG_OP='UPDATE' AND OLD.history_payload_hash IS NULL)) THEN
    SELECT core_receipt.id INTO STRICT core_operation FROM naijue_erp.operation_receipt core_receipt WHERE core_receipt.target_type='IMPORT' AND core_receipt.target_id=NEW.id
      AND core_receipt.action=CASE WHEN NEW.history_payload_hash IS NULL THEN 'IMPORT_CORE_STAGE' ELSE 'IMPORT_BIND_FULL_SOURCE' END;
    PERFORM naijue_erp.assert_core_initialization_v14(NEW.id,core_operation,NEW.history_payload_hash IS NULL);
    IF NEW.history_payload_hash IS NULL THEN
      IF TG_OP='INSERT' THEN
        IF NEW.checkpoint<>'{"sequence":0,"cursor":0,"counts":{"WAREHOUSE":0,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0},"expected":{}}'::jsonb
          OR NEW.status<>'STAGED' OR NEW.created_at IS DISTINCT FROM (SELECT created_at FROM naijue_erp.import_batch WHERE id=NEW.id) THEN
          RAISE EXCEPTION 'CORE initial deferred INSERT must retain actual zero image' USING ERRCODE='23514'; END IF;
      ELSIF OLD.checkpoint<>'{"sequence":0,"cursor":0,"counts":{"WAREHOUSE":0,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0},"expected":{}}'::jsonb
        OR NEW.checkpoint IS DISTINCT FROM (SELECT checkpoint FROM naijue_erp.import_batch WHERE id=NEW.id) THEN
        RAISE EXCEPTION 'CORE deferred UPDATE must be its one actual zero-to22 transition' USING ERRCODE='23514'; END IF;
    ELSE
      IF TG_OP<>'UPDATE' OR OLD.checkpoint->'expected'<>'{}'::jsonb OR NEW.checkpoint IS DISTINCT FROM (SELECT checkpoint FROM naijue_erp.import_batch WHERE id=NEW.id) THEN
        RAISE EXCEPTION 'Full binding must be the exact once-only current checkpoint transition' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NULL;
  END IF;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type = 'IMPORT' AND object_id = NEW.id
    AND new_version = ((NEW.checkpoint->>'sequence')::bigint + 1)::integer;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = a.operation_id;
  IF r.target_type <> 'IMPORT' OR r.target_id <> NEW.id OR a.after_values IS DISTINCT FROM NEW.checkpoint
    OR (SELECT checkpoint FROM naijue_erp.import_batch WHERE id = NEW.id) IS DISTINCT FROM NEW.checkpoint THEN
    RAISE EXCEPTION 'one atomic native import checkpoint audit and receipt are required' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF a.old_version IS NOT NULL OR a.before_values IS NOT NULL OR r.action <> 'IMPORT_STAGE' THEN
      RAISE EXCEPTION 'stage requires initial import evidence' USING ERRCODE = '23514'; END IF;
  ELSIF a.old_version::bigint IS DISTINCT FROM (OLD.checkpoint->>'sequence')::bigint + 1 OR a.before_values IS DISTINCT FROM OLD.checkpoint THEN
    RAISE EXCEPTION 'checkpoint before evidence differs from replaced progress' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(NEW.checkpoint->'counts')) <> 4
    OR (SELECT count(*) FROM jsonb_object_keys(NEW.checkpoint->'expected')) <> 4 THEN
    RAISE EXCEPTION 'only the four approved target counters are accepted' USING ERRCODE = '23514'; END IF;
  FOREACH kind IN ARRAY ARRAY['WAREHOUSE', 'SKU', 'INVENTORY_LEDGER', 'IMPORT_BATCH'] LOOP
    IF ((NEW.checkpoint->'counts'->>kind) ~ '^[0-9]+$') IS DISTINCT FROM TRUE
      OR ((NEW.checkpoint->'expected'->>kind) ~ '^[0-9]+$') IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'missing exact import counters' USING ERRCODE = '23514'; END IF;
    -- Constant-sized metadata check only. Successful bounded INSERT results advance
    -- counts in the application transaction; the one full source reconciliation is publication.
    processed := (NEW.checkpoint->'counts'->>kind)::numeric;
    IF processed > (NEW.checkpoint->'expected'->>kind)::numeric
      OR (TG_OP = 'UPDATE' AND processed < (OLD.checkpoint->'counts'->>kind)::numeric) THEN
      RAISE EXCEPTION 'invalid monotonic bounded source progress' USING ERRCODE = '23514'; END IF;
    counted := counted + processed;
  END LOOP;
  IF counted <> (NEW.checkpoint->>'cursor')::numeric THEN RAISE EXCEPTION 'checkpoint cursor must match its bounded progress counters' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_import_accounting_checkpoint_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE core_operation uuid; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; kind text; actual bigint; total bigint;
BEGIN
  IF TG_OP='UPDATE' THEN
    SELECT * INTO a FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND object_id=NEW.id
      AND new_version=((NEW.checkpoint->>'sequence')::bigint+1)::integer;
    IF FOUND AND a.action='IMPORT_INITIALIZE_BARCODE_SCHEMES' THEN
      IF OLD.checkpoint IS DISTINCT FROM a.before_values->'checkpoint' OR NEW.checkpoint IS DISTINCT FROM a.after_values->'checkpoint' THEN
        RAISE EXCEPTION 'Initialization event must retain original before and exact successor checkpoint' USING ERRCODE='23514'; END IF;
      PERFORM naijue_erp.assert_barcode_scheme_initialization_v19(NEW.id,a.operation_id); RETURN NULL;
    END IF;
  END IF;
  IF NEW.mapping_version='V2_HISTORY_NULLABLE_1' AND (NEW.history_payload_hash IS NULL OR (TG_OP='UPDATE' AND OLD.history_payload_hash IS NULL)) THEN
    SELECT core_receipt.id INTO STRICT core_operation FROM naijue_erp.operation_receipt core_receipt WHERE core_receipt.target_type='IMPORT' AND core_receipt.target_id=NEW.id
      AND core_receipt.action=CASE WHEN NEW.history_payload_hash IS NULL THEN 'IMPORT_CORE_STAGE' ELSE 'IMPORT_BIND_FULL_SOURCE' END;
    PERFORM naijue_erp.assert_core_initialization_v14(NEW.id,core_operation,NEW.history_payload_hash IS NULL);
    IF NEW.history_payload_hash IS NULL THEN
      IF TG_OP='INSERT' THEN
        IF NEW.checkpoint<>'{"sequence":0,"cursor":0,"counts":{"WAREHOUSE":0,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0},"expected":{}}'::jsonb
          OR NEW.status<>'STAGED' OR NEW.created_at IS DISTINCT FROM (SELECT created_at FROM naijue_erp.import_batch WHERE id=NEW.id) THEN
          RAISE EXCEPTION 'CORE initial deferred INSERT must retain actual zero image' USING ERRCODE='23514'; END IF;
      ELSIF OLD.checkpoint<>'{"sequence":0,"cursor":0,"counts":{"WAREHOUSE":0,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0},"expected":{}}'::jsonb
        OR NEW.checkpoint IS DISTINCT FROM (SELECT checkpoint FROM naijue_erp.import_batch WHERE id=NEW.id) THEN
        RAISE EXCEPTION 'CORE deferred UPDATE must be its one actual zero-to22 transition' USING ERRCODE='23514'; END IF;
    ELSE
      IF TG_OP<>'UPDATE' OR OLD.checkpoint->'expected'<>'{}'::jsonb OR NEW.checkpoint IS DISTINCT FROM (SELECT checkpoint FROM naijue_erp.import_batch WHERE id=NEW.id) THEN
        RAISE EXCEPTION 'Full binding must be the exact once-only current checkpoint transition' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NULL;
  END IF;
  IF NEW.mapping_version<>'V2_HISTORY_NULLABLE_1' THEN RETURN NULL; END IF;
  IF jsonb_typeof(NEW.checkpoint->'sequence') IS DISTINCT FROM 'number'
    OR jsonb_typeof(NEW.checkpoint->'cursor') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'V2 checkpoint sequence and cursor must retain JSON integer number types' USING ERRCODE='23514'; END IF;
  FOREACH kind IN ARRAY ARRAY['WAREHOUSE','SKU','INVENTORY_LEDGER','IMPORT_BATCH'] LOOP
    IF jsonb_typeof(NEW.checkpoint->'counts'->kind) IS DISTINCT FROM 'number'
      OR jsonb_typeof(NEW.checkpoint->'expected'->kind) IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'V2 native counters must retain JSON integer number types' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF TG_OP='INSERT' THEN
    IF NEW.checkpoint->>'sequence'<>'0' OR NEW.checkpoint->>'cursor'<>'0'
      OR NEW.checkpoint->'counts' IS DISTINCT FROM '{"WAREHOUSE":0,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0}'::jsonb
      OR EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE import_batch_id=NEW.id) THEN
      RAISE EXCEPTION 'V2 accounting must stage at the original unclaimed zero checkpoint' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END IF;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND object_id=NEW.id
    AND new_version=((NEW.checkpoint->>'sequence')::bigint+1)::integer;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
  SELECT count(*) INTO total FROM naijue_erp.import_record_accounting_claim WHERE operation_id=r.id;
  IF (r.action='IMPORT_CHUNK' AND (total<1 OR total>500)) OR (r.action='IMPORT_PUBLISH' AND total<>1)
    OR r.action NOT IN ('IMPORT_CHUNK','IMPORT_PUBLISH')
    OR EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim c WHERE c.operation_id=r.id
      AND (c.import_batch_id<>NEW.id OR c.checkpoint_sequence::bigint<>(NEW.checkpoint->>'sequence')::bigint))
    OR (NEW.checkpoint->>'cursor')::bigint-(OLD.checkpoint->>'cursor')::bigint<>total THEN
    RAISE EXCEPTION 'checkpoint cursor and original action require the exact bounded new claim set' USING ERRCODE='23514'; END IF;
  FOREACH kind IN ARRAY ARRAY['WAREHOUSE','SKU','INVENTORY_LEDGER','IMPORT_BATCH'] LOOP
    SELECT count(*) INTO actual FROM naijue_erp.import_record_accounting_claim WHERE operation_id=r.id AND target_type=kind;
    IF (NEW.checkpoint->'counts'->>kind)::bigint-(OLD.checkpoint->'counts'->>kind)::bigint<>actual THEN
      RAISE EXCEPTION 'checkpoint target delta differs from its original receipt-owned new claims' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF (r.action='IMPORT_CHUNK' AND EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE operation_id=r.id AND target_type='IMPORT_BATCH'))
    OR (r.action='IMPORT_PUBLISH' AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE operation_id=r.id AND target_type='IMPORT_BATCH')) THEN
    RAISE EXCEPTION 'final approval is accounted once only by original PUBLISH' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_import_operation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; actual_ids jsonb; receipt_ids jsonb;
BEGIN
  IF NEW.action='IMPORT_INITIALIZE_BARCODE_SCHEMES' THEN
    PERFORM naijue_erp.assert_barcode_scheme_initialization_v19(NEW.target_id,NEW.id); RETURN NULL;
  END IF;
  IF NEW.action IN('IMPORT_CORE_STAGE','IMPORT_BIND_FULL_SOURCE') THEN
    PERFORM naijue_erp.assert_core_initialization_v14(NEW.target_id,NEW.id,NEW.action='IMPORT_CORE_STAGE');
    IF EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE operation_id=NEW.id) THEN RAISE EXCEPTION 'CORE/binding has no ledger effect' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END IF;
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id = NEW.target_id;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id = NEW.id;
  SELECT COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb) INTO actual_ids FROM naijue_erp.inventory_ledger WHERE operation_id = NEW.id;
  SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb) INTO receipt_ids FROM jsonb_array_elements_text(NEW.result_data->'ledgerEntryIds');
  IF actual_ids IS DISTINCT FROM receipt_ids THEN RAISE EXCEPTION 'import receipt requires exact bounded baseline effect set' USING ERRCODE = '23514'; END IF;
  IF a.object_type <> 'IMPORT' OR a.object_id <> b.id OR a.action <> NEW.action
    OR a.actor_account_id <> NEW.actor_account_id OR a.occurred_at IS DISTINCT FROM NEW.completed_at
    OR a.after_values IS DISTINCT FROM b.checkpoint OR a.new_version::bigint <> (b.checkpoint->>'sequence')::bigint + 1
    OR NEW.result_data->>'sequence' IS DISTINCT FROM b.checkpoint->>'sequence'
    OR NEW.result_data->>'cursor' IS DISTINCT FROM b.checkpoint->>'cursor' OR NEW.result_data->>'status' IS DISTINCT FROM b.status
    OR (NEW.action = 'IMPORT_STAGE' AND (a.old_version IS NOT NULL OR a.before_values IS NOT NULL OR b.status <> 'STAGED'))
    OR (NEW.action = 'IMPORT_CHUNK' AND b.status <> 'VALIDATING') OR (NEW.action = 'IMPORT_PUBLISH' AND b.status <> 'IMPORTED')
    OR EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE operation_id = NEW.id AND (event_kind <> 'CUTOFF_BASELINE' OR source_import_batch_id IS DISTINCT FROM b.id))
    OR (NEW.action <> 'IMPORT_CHUNK' AND EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE operation_id = NEW.id)) THEN
    RAISE EXCEPTION 'import receipt audit checkpoint or exact baseline operation differs' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;

COMMIT;
