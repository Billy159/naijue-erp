-- Approved v16: current v14/v15 successor, original creator + separate responsible.
-- SOURCE ONLY. C verifies current target/OID/full canonical/ACL and backup before execution.
-- No original migration edits, source-history updates, backfill, grants or owner bypass.
BEGIN;
DO $predecessor$
DECLARE n integer; required record;
BEGIN
 IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26] THEN
  RAISE EXCEPTION 'Exact current schema26 predecessor required' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace AND prokind IN ('f','p');
 IF n NOT IN(123,124) THEN RAISE EXCEPTION 'Exact v14 or v15 predecessor, no replay or old v12' USING ERRCODE='23514'; END IF;
 FOR required IN SELECT * FROM (VALUES
 ('assert_core_initialization_v14','5ca42bcac20e7ad3affb3ac09829fd27c481752a303b1090133f23ecee3ad99d','5ca42bcac20e7ad3affb3ac09829fd27c481752a303b1090133f23ecee3ad99d'),
 ('assert_history_typed_closure','8556e917e6a251dd1eb97974fbb6f793d3e46a1ef10f6ef7fd77fb7ad539d00f','8556e917e6a251dd1eb97974fbb6f793d3e46a1ef10f6ef7fd77fb7ad539d00f'),
 ('assert_native_bootstrap_accounts','171c59ba962a287dd02bb9eac993512e114783a470063108a07ba5e206cbabca','171c59ba962a287dd02bb9eac993512e114783a470063108a07ba5e206cbabca'),
 ('assert_native_product_season_source','3a753b412fa4a648e26c4a2e398a4b52cc694c04dc1352a98513cb2220d4d661','3a753b412fa4a648e26c4a2e398a4b52cc694c04dc1352a98513cb2220d4d661'),
 ('assert_retained_sku_reference','4c956a82b9531b1f385f9aecd9c6d20fa84ce6d434bb0a41d2a0c96ebb7fae5d','4c956a82b9531b1f385f9aecd9c6d20fa84ce6d434bb0a41d2a0c96ebb7fae5d'),
 ('assign_runtime_document_number','bca336abcd0ef4a57c22d2ee19564e7ea744257303fb8eec06c822efd551500e','bca336abcd0ef4a57c22d2ee19564e7ea744257303fb8eec06c822efd551500e'),
 ('check_hall_default_customer_enabled','6a89df4342530f3a3bdd185abbdd372b3372799b341a17ae9ad65be86ded91ee','6a89df4342530f3a3bdd185abbdd372b3372799b341a17ae9ad65be86ded91ee'),
 ('cutoff_import_lock','82a621b9cea39c9cc273d5cb790b364fad004875760644633280d2e24e64ccc7','82a621b9cea39c9cc273d5cb790b364fad004875760644633280d2e24e64ccc7'),
 ('exact_historical_customer_source_matches','ac26aa52f4131d996d6abe0db810a0e0817a12ffa043cdfb2250c951bfd0f011','ac26aa52f4131d996d6abe0db810a0e0817a12ffa043cdfb2250c951bfd0f011'),
 ('freeze_cutoff_sales_detail','dcfa1a3abb87368cf2f18663880f9a2ea9377a3599e985e13c7241220fd85a12','dcfa1a3abb87368cf2f18663880f9a2ea9377a3599e985e13c7241220fd85a12'),
 ('freeze_imported_identity','0a17cf0a670ca8c9d34f2de1ec34de9b5197410fc01f82af4273a26e877a44e5','0a17cf0a670ca8c9d34f2de1ec34de9b5197410fc01f82af4273a26e877a44e5'),
 ('guard_balance_identity','02f2db383ff8c5826c7148f73bb780319c977bffa5798bc233159d83d89e58fc','02f2db383ff8c5826c7148f73bb780319c977bffa5798bc233159d83d89e58fc'),
 ('guard_contributor_link','2937ecd3e974e2ad78e0bfce4790b96d97953d4bf113406a838063b366895983','2937ecd3e974e2ad78e0bfce4790b96d97953d4bf113406a838063b366895983'),
 ('guard_cutoff_ledger','71ecb569279de61709578ffe2f29d85140993ed155fce07e7beb797307c491b5','71ecb569279de61709578ffe2f29d85140993ed155fce07e7beb797307c491b5'),
 ('guard_exact_historical_customer_current_usage','78e895d72d6f806089d2bc7cb877293e1263d26ba8265dd7f3b5e2203e956245','78e895d72d6f806089d2bc7cb877293e1263d26ba8265dd7f3b5e2203e956245'),
 ('guard_header_native_reference','1584d2600c763f0d38cd3dd4fa7dd14ea90465ef9376d7165a58d71bce0dec3c','1584d2600c763f0d38cd3dd4fa7dd14ea90465ef9376d7165a58d71bce0dec3c'),
 ('guard_header_native_reference_publication','3419f73d296fcb84f77eff79edaa5034cb90f33a6363d0687d316ee697f785c0','3419f73d296fcb84f77eff79edaa5034cb90f33a6363d0687d316ee697f785c0'),
 ('guard_history_closure_stage','d05947c6d7ef430d043c10038cce1d72f7e44e4efb2a2112c499ea8d107d47e0','d05947c6d7ef430d043c10038cce1d72f7e44e4efb2a2112c499ea8d107d47e0'),
 ('guard_history_insert','bbd40680f3196904c9c9e986c6f8cef0bee77c4cbb19663b8333e8b6150e1f2f','bbd40680f3196904c9c9e986c6f8cef0bee77c4cbb19663b8333e8b6150e1f2f'),
 ('guard_history_publication','6ad32797b7fe81e6427b3abec90aca378778be9af30b014b55966fbed0bff77e','6ad32797b7fe81e6427b3abec90aca378778be9af30b014b55966fbed0bff77e'),
 ('guard_history_typed_publication','fc386026e40ca43d36bdb5e7422001878a7f91c95c2e36bce28272b4d792e506','fc386026e40ca43d36bdb5e7422001878a7f91c95c2e36bce28272b4d792e506'),
 ('guard_import_accounting_claim','298996ca170c969aa06df8dfa44219b86a9db0ae4dc1c07f726167a518f62acf','298996ca170c969aa06df8dfa44219b86a9db0ae4dc1c07f726167a518f62acf'),
 ('guard_import_accounting_publication','b41ad04a99fb7af999c22b13cdc7ad9b747e4df67e3f11bd44e7632d15a747a6','b41ad04a99fb7af999c22b13cdc7ad9b747e4df67e3f11bd44e7632d15a747a6'),
 ('guard_import_batch','f0e35d2d5978c92d26c1eab6525a87d2ae3450a525daa14131b479b03856d29a','f0e35d2d5978c92d26c1eab6525a87d2ae3450a525daa14131b479b03856d29a'),
 ('guard_import_record','8a79dbc011cdaf0582e2bd1eefc7ea94fce15d24f6aa1ac0fa25c43afb4e7e16','8a79dbc011cdaf0582e2bd1eefc7ea94fce15d24f6aa1ac0fa25c43afb4e7e16'),
 ('guard_maintenance_account_event','965d9d3433b929ccd151b9a147eeef713770d7b7311e49c80cfaa3d17b118549','965d9d3433b929ccd151b9a147eeef713770d7b7311e49c80cfaa3d17b118549'),
 ('guard_maintenance_audit_actor','ac0ce9c91f34b9d8d34eb5e7d26f595319bfa6ad3dfe3ae33a4f2f5edf1eb217','ac0ce9c91f34b9d8d34eb5e7d26f595319bfa6ad3dfe3ae33a4f2f5edf1eb217'),
 ('guard_maintenance_before_root','574add1ad436482c7593725ac4b1b58cabe6b982b538cf0e1f22c1783723712f','574add1ad436482c7593725ac4b1b58cabe6b982b538cf0e1f22c1783723712f'),
 ('guard_maintenance_child_write','a19def51718e008e541482dd1e6f2d2ab9257842ce7e66ad6e62aedcfa216d8a','a19def51718e008e541482dd1e6f2d2ab9257842ce7e66ad6e62aedcfa216d8a'),
 ('guard_native_catalogue_binding','7418579c0d1c3a1951696a12ad165a421d26b87f0e449d9d7d250497dc2ddc21','7418579c0d1c3a1951696a12ad165a421d26b87f0e449d9d7d250497dc2ddc21'),
 ('guard_native_catalogue_publication','d2eaa009760d63f245d562570ca4c8fce038633da5233a8c7ab7142190a30ceb','d2eaa009760d63f245d562570ca4c8fce038633da5233a8c7ab7142190a30ceb'),
 ('guard_native_creation_identity','4827b76ff4df9beae18411033d2e6e13a04eea2d648aa58bb67d179145d107dc','4827b76ff4df9beae18411033d2e6e13a04eea2d648aa58bb67d179145d107dc'),
 ('guard_native_party_import_intent','262e74a37ba12883a4978c4d99b6ecca000d245186b585a9e5b35ad31ccf8d7f','262e74a37ba12883a4978c4d99b6ecca000d245186b585a9e5b35ad31ccf8d7f'),
 ('guard_native_payment_binding','774cc9b1604a8d0948f73c7298fa67a10233962af218b89fe0b9675107148d35','774cc9b1604a8d0948f73c7298fa67a10233962af218b89fe0b9675107148d35'),
 ('guard_native_payment_publication','993b114dfbec87428a42a9f6aa7d0a6ecbeef67fd85bc00754fa4eb80c7e6797','993b114dfbec87428a42a9f6aa7d0a6ecbeef67fd85bc00754fa4eb80c7e6797'),
 ('guard_product_image_color','a49cc6bc4c49931eb50c81dd95e08a760b2ea6de73e19a0496611fe63fe22b18','a49cc6bc4c49931eb50c81dd95e08a760b2ea6de73e19a0496611fe63fe22b18'),
 ('guard_product_season_selection','bd97ac1bc0a8c9a3221c12b794f5976bf0e092a2907aa2dd9e6378b718d29560','bd97ac1bc0a8c9a3221c12b794f5976bf0e092a2907aa2dd9e6378b718d29560'),
 ('guard_referenced_season_identity','8eb0b3435f063f4a653c31f632fe6751fecc3864a375a72753bcf4090bb18f2c','8eb0b3435f063f4a653c31f632fe6751fecc3864a375a72753bcf4090bb18f2c'),
 ('guard_retained_catalogue_delete','dec785b8b1f818b2daa3af4d3872139710cae32178516839e669f59aa6609758','dec785b8b1f818b2daa3af4d3872139710cae32178516839e669f59aa6609758'),
 ('guard_retained_catalogue_reference','91cc169d60ca6db2700ed97e49632504cfba9d957ea467a4777137f946c6923c','91cc169d60ca6db2700ed97e49632504cfba9d957ea467a4777137f946c6923c'),
 ('guard_runtime_document_number','52d92723d9ecb5f16eb57c5ae50e0f8cf322b4b5f3848ab88712f41aeb0887bd','52d92723d9ecb5f16eb57c5ae50e0f8cf322b4b5f3848ab88712f41aeb0887bd'),
 ('guard_successor_publication26','a055abd422ff4d81d0cf87e11cf659dcc221eda1a18b774cd62034c2c3f74c14','a055abd422ff4d81d0cf87e11cf659dcc221eda1a18b774cd62034c2c3f74c14'),
 ('guard_successor_source26','cdf91a3949d6aefbb16c67f7d82dcf99b60730f9a6884468c064102c9887b710','cdf91a3949d6aefbb16c67f7d82dcf99b60730f9a6884468c064102c9887b710'),
 ('history_closure_count_map','ef82c0a7124d288103df38503a849b96aa936289b2ee29166b4f0a6529f476d6','ef82c0a7124d288103df38503a849b96aa936289b2ee29166b4f0a6529f476d6'),
 ('history_closure_digest','749101b8670e32814b875adaaf753da6c50ddcd0860d5ca3ebb000f996f1b63b','749101b8670e32814b875adaaf753da6c50ddcd0860d5ca3ebb000f996f1b63b'),
 ('history_closure_document_rows','f8401b06df7815f63f9a83e781961f55725f82246c87d86b7a99a9c19c482ce1','f8401b06df7815f63f9a83e781961f55725f82246c87d86b7a99a9c19c482ce1'),
 ('history_closure_encode','b4ad51b2b17c9248c80de0ead3ae5f50bf5fe887e36597b081ce250a94623a5c','b4ad51b2b17c9248c80de0ead3ae5f50bf5fe887e36597b081ce250a94623a5c'),
 ('history_closure_finish','94b84af2d05d8a9f34c0135a8c0d70f5b633a9b43e6ec6d2bca8de554e8abac8','94b84af2d05d8a9f34c0135a8c0d70f5b633a9b43e6ec6d2bca8de554e8abac8'),
 ('history_closure_fold','31ed823c127e85537196de072b76077749d939f3241fa53b9f1c76f8fdba9062','31ed823c127e85537196de072b76077749d939f3241fa53b9f1c76f8fdba9062'),
 ('history_closure_projection','0af6d70c56a463c351be1dd732d345bbb533ae98b0b07e36f6ef08a4efd72011','0af6d70c56a463c351be1dd732d345bbb533ae98b0b07e36f6ef08a4efd72011'),
 ('history_closure_projection_columns','a8a3d4d43341d86dfad188d191c3076203e06ea8f1a6919c4d0efddee76286a6','a8a3d4d43341d86dfad188d191c3076203e06ea8f1a6919c4d0efddee76286a6'),
 ('history_closure_projection_key','6e2584dac9f079fe2061570c15b13549a3abac512a2a809835046e6fe2c50222','6e2584dac9f079fe2061570c15b13549a3abac512a2a809835046e6fe2c50222'),
 ('history_closure_row_hash','c7ef0fdc273f23ab5ec1ae6c870746146dab90a6ecef8ecf319de0704df697bb','c7ef0fdc273f23ab5ec1ae6c870746146dab90a6ecef8ecf319de0704df697bb'),
 ('history_closure_rows','098ba7215c7c893903e2b72762e2036e94bc23b763f3842e378b3d55b3d3f639','098ba7215c7c893903e2b72762e2036e94bc23b763f3842e378b3d55b3d3f639'),
 ('history_closure_seed','532918606a4dd24ebae46a55dfe7d2f0803602798c63742bcd975b7e1179f2c7','532918606a4dd24ebae46a55dfe7d2f0803602798c63742bcd975b7e1179f2c7'),
 ('history_effective_writes_closed','1110bb0854c27ad0ae2178742e7414bf49aa5509c57bbecf4a595f9f2ed19b97','1110bb0854c27ad0ae2178742e7414bf49aa5509c57bbecf4a595f9f2ed19b97'),
 ('history_revision_not_enabled','af9df40d3b0ea2128a2f879f0e6092c13ba8447ae28383742020aa9fc0bfba70','af9df40d3b0ea2128a2f879f0e6092c13ba8447ae28383742020aa9fc0bfba70'),
 ('import_source_key_lock','07404b25633a5c48ae1a530a48cdebed11107e187d660c99a7e781bb4957fa24','07404b25633a5c48ae1a530a48cdebed11107e187d660c99a7e781bb4957fa24'),
 ('inventory_key_admission','a9d7a2519941605e997e5ab59cff7cf847192ed910ef4107ba09aadc64e0fc7a','a9d7a2519941605e997e5ab59cff7cf847192ed910ef4107ba09aadc64e0fc7a'),
 ('inventory_key_lock','c6f444fbbfc527fec7f4031fd0ea7f07eb0a98202b11340e8f7da398fa117079','c6f444fbbfc527fec7f4031fd0ea7f07eb0a98202b11340e8f7da398fa117079'),
 ('inventory_runtime_key_admitted','945a2cc1e250ed1cedd3ca2083b80120174d06d015455bd4288d186e0c27f377','945a2cc1e250ed1cedd3ca2083b80120174d06d015455bd4288d186e0c27f377'),
 ('is_exact_historical_customer_only','1f35799a742f402d86cde6a979511dc83ae74d62cd5c106ffcef162a68510403','1f35799a742f402d86cde6a979511dc83ae74d62cd5c106ffcef162a68510403'),
 ('is_native_party_import_insert','a3c8dfac77e8a4f060932aded92f53da97b68bdcf48d2ede19781c3e54c86412','a3c8dfac77e8a4f060932aded92f53da97b68bdcf48d2ede19781c3e54c86412'),
 ('keep_barcode_binding_identity','14f6d02bca58955681e8d03236fb236cbfe3d041d35ecdb326cd3fa7e38d2733','14f6d02bca58955681e8d03236fb236cbfe3d041d35ecdb326cd3fa7e38d2733'),
 ('keep_party_native_identity','44c3a7110bf40ef38e73972b493f36279b28124097b31a9a6f25e5adc13ad4b9','44c3a7110bf40ef38e73972b493f36279b28124097b31a9a6f25e5adc13ad4b9'),
 ('keep_sales_line_owner','95f3dc678bbdc8ac47a2f1c76fe13f872bed088e7484aebc46a523fc13cfd241','95f3dc678bbdc8ac47a2f1c76fe13f872bed088e7484aebc46a523fc13cfd241'),
 ('keep_transfer_header_provenance','92fe79370e044f341cf8290a6d723a588ce53f7591077ceb45f1c9a201ad08c9','92fe79370e044f341cf8290a6d723a588ce53f7591077ceb45f1c9a201ad08c9'),
 ('keep_transfer_line_owner','763d52e081f96f872adb50658403f5f2f7f83f7c914d002b0e771ebe9c055335','763d52e081f96f872adb50658403f5f2f7f83f7c914d002b0e771ebe9c055335'),
 ('maintenance_account_credential_action','f17617bc8f02fd0731d0a97eaca90553441235e032de1dbf9086e84c987fbe7a','f17617bc8f02fd0731d0a97eaca90553441235e032de1dbf9086e84c987fbe7a'),
 ('maintenance_action_allowed','186f88822ba597874734cb3349d0b9d95f63e5f8d8a34d3d05014e3420033c17','50b2fa0fbf733d7c98b40aa612107a20262cb063852cb3f2cabbefc750742c4a'),
 ('maintenance_administrator_mutex','d6809b2abf7b3f211cd7422b517e867d0c1378f9e7fe9b98eacde2521c6d1ea8','d6809b2abf7b3f211cd7422b517e867d0c1378f9e7fe9b98eacde2521c6d1ea8'),
 ('maintenance_audit_is_current','4537d6df2b73e17e386b100845049da08d3fab3584c87ef8d7095660198bf699','4537d6df2b73e17e386b100845049da08d3fab3584c87ef8d7095660198bf699'),
 ('maintenance_check_account_credential','577bf0a5de72c8dc6d080c1b4f18a669398d5738c16b75d11ecc1c89d0156ab7','577bf0a5de72c8dc6d080c1b4f18a669398d5738c16b75d11ecc1c89d0156ab7'),
 ('maintenance_check_product_children','c7edab87301fc05b7f33db2eb9df30b2da0d28ed9154dfa8d11cbba9fdbe6dad','c7edab87301fc05b7f33db2eb9df30b2da0d28ed9154dfa8d11cbba9fdbe6dad'),
 ('maintenance_check_staff_accounts','ea4e151ccb89d97ed40edc6e3164594bccda0fc28f2879f614f230830fdc0c22','ea4e151ccb89d97ed40edc6e3164594bccda0fc28f2879f614f230830fdc0c22'),
 ('maintenance_complete_row_matches','34c25d78bc34ed57b1acbbdbfbca9b0adfd78dc8dcb6cc8c42cf5673f5da5d21','34c25d78bc34ed57b1acbbdbfbca9b0adfd78dc8dcb6cc8c42cf5673f5da5d21'),
 ('maintenance_evidence_matches','cb201d859235d7af9ef52616c64b705e5586b11894d57fbc50b2b0a7615abaf3','cb201d859235d7af9ef52616c64b705e5586b11894d57fbc50b2b0a7615abaf3'),
 ('maintenance_exact_rows_match','8b21824423a27f20074768c09998fba819887c949b4f20b57e35db0815133161','8b21824423a27f20074768c09998fba819887c949b4f20b57e35db0815133161'),
 ('maintenance_payment_halls','d96c975c57af714d458275a383e0e2bdaeef9214d4bc64420207f36bcea55869','d96c975c57af714d458275a383e0e2bdaeef9214d4bc64420207f36bcea55869'),
 ('maintenance_product_child_row','69145227348d366932814f079f0b63d1bb6109cc36d8bb8c9f8ae53fafd1b9fa','69145227348d366932814f079f0b63d1bb6109cc36d8bb8c9f8ae53fafd1b9fa'),
 ('maintenance_root_table','7ed286cf1e5bb8629b02e7cab4412dc0df502d560661be9823d234c466565fe3','7ed286cf1e5bb8629b02e7cab4412dc0df502d560661be9823d234c466565fe3'),
 ('maintenance_staff_accounts','a191dc7b42cec0f41f42c6d371a2e959c90019983f4f79cef86db99d2e8fa989','a191dc7b42cec0f41f42c6d371a2e959c90019983f4f79cef86db99d2e8fa989'),
 ('native_creation_operation_valid','118bbe55c39e00948ab087f808812522b565344b924e64916f6cfa91645a3f7a','118bbe55c39e00948ab087f808812522b565344b924e64916f6cfa91645a3f7a'),
 ('party_key_values','d23eb5601f984007df5d52661a101a422852e20c0bcd75f1cadd5a5bbbaef649','d23eb5601f984007df5d52661a101a422852e20c0bcd75f1cadd5a5bbbaef649'),
 ('published_inventory_key','fa8234711ad74b3afd250b2143840baa863f05f1e23c92b85574b48b4208adc6','fa8234711ad74b3afd250b2143840baa863f05f1e23c92b85574b48b4208adc6'),
 ('reject_immutable_change','3daef49e525ad973be82350a1551e979198d21ff58f3f1bb92a4f7292e4d038c','3daef49e525ad973be82350a1551e979198d21ff58f3f1bb92a4f7292e4d038c'),
 ('reject_unimplemented_cutoff_write','ac0a450bbd02ec19764b8ed3be32acde2177e394c4f9488230d39ff7c3a41509','ac0a450bbd02ec19764b8ed3be32acde2177e394c4f9488230d39ff7c3a41509'),
 ('safe_maintenance_evidence','4a0d9d21eadf3e839d1d0c23f7efe8a0ef14123dd521a553eefcc7362ab3f927','4a0d9d21eadf3e839d1d0c23f7efe8a0ef14123dd521a553eefcc7362ab3f927'),
 ('transfer_header_audit_values','2bd919b807e2bd27e2ef2c3c2520524c84f8ddbd81e9dfc71947c9292ea1f624','2bd919b807e2bd27e2ef2c3c2520524c84f8ddbd81e9dfc71947c9292ea1f624'),
 ('transfer_line_audit_values','ce924832c6a9b4a762ff80e031279273f521e4e17139c7d89a4930004313f49e','ce924832c6a9b4a762ff80e031279273f521e4e17139c7d89a4930004313f49e'),
 ('valid_history_counts','6c143e2bf81bcd53e2c9074aa2ab4e1781c746bc7a99bb0064f378f77de80280','6c143e2bf81bcd53e2c9074aa2ab4e1781c746bc7a99bb0064f378f77de80280'),
 ('valid_product_season_ids','b6b3932264857c59998025cece6241a4e819b80f9bc72e6bf0ed4e907890cc65','b6b3932264857c59998025cece6241a4e819b80f9bc72e6bf0ed4e907890cc65'),
 ('validate_available_administrator_commit','3a9a1bea930614761185af90b8591a539b855647974b68b004869c80f5e5ba18','3a9a1bea930614761185af90b8591a539b855647974b68b004869c80f5e5ba18'),
 ('validate_baseline_source_commit','ec5e9a331d0f8148ec21e28d5e8a4ddb82ac66d923ea2490abee3f3000ed75c9','ec5e9a331d0f8148ec21e28d5e8a4ddb82ac66d923ea2490abee3f3000ed75c9'),
 ('validate_document_specification_commit','b02bff6115bcf2c87758f8313a57a1a693733ba3ea192fcb1657bd176c587c06','b02bff6115bcf2c87758f8313a57a1a693733ba3ea192fcb1657bd176c587c06'),
 ('validate_exact_historical_customer_intent','b9968150e138d455658dd7d437c8026b7bfdce466146b961d64fd2934f099c98','b9968150e138d455658dd7d437c8026b7bfdce466146b961d64fd2934f099c98'),
 ('validate_exact_native_reversal','3ef72272c6cb9b7ccbfffc393a31fdd85babdb3efb333baae839482d571f362e','3ef72272c6cb9b7ccbfffc393a31fdd85babdb3efb333baae839482d571f362e'),
 ('validate_history_closure_commit','e61d2c5dd34792f5ca277cada1dc12a6904b1be95031c0a6c4810080b24dd03b','e61d2c5dd34792f5ca277cada1dc12a6904b1be95031c0a6c4810080b24dd03b'),
 ('validate_history_product_proofs','dab49bb495de85d5e66350affd348f85e0595411ea7ab7378104a3963db2a38e','dab49bb495de85d5e66350affd348f85e0595411ea7ab7378104a3963db2a38e'),
 ('validate_import_accounting_baseline_commit','678cc0b409e43e420365733b21ce8e8ce0aa88b8d3b9b48f9a842edd41120c51','678cc0b409e43e420365733b21ce8e8ce0aa88b8d3b9b48f9a842edd41120c51'),
 ('validate_import_accounting_checkpoint_commit','edef6846035f1780c632183b32f81b63919cae4703a78c4bc21c44c507441f47','edef6846035f1780c632183b32f81b63919cae4703a78c4bc21c44c507441f47'),
 ('validate_import_accounting_claim_commit','ad8e19c3f36b85ebbda107a2ca8e3c00ad10ca3005a232bd033bbab7613be756','ad8e19c3f36b85ebbda107a2ca8e3c00ad10ca3005a232bd033bbab7613be756'),
 ('validate_import_accounting_final_record_commit','f1fca00daa56873221062706d2009293b6180156e69bfe6f5fc1ca64087ea312','f1fca00daa56873221062706d2009293b6180156e69bfe6f5fc1ca64087ea312'),
 ('validate_import_batch_commit','dc2e8d344085056b53469be394eb9ced344db510bf6f6dc5576f4b0a9ea20140','dc2e8d344085056b53469be394eb9ced344db510bf6f6dc5576f4b0a9ea20140'),
 ('validate_import_operation','6ffc2561abe1bd4ff7465c82143c155bcaa0ad311b90f6679bef10ceae30c62f','6ffc2561abe1bd4ff7465c82143c155bcaa0ad311b90f6679bef10ceae30c62f'),
 ('validate_import_publish','873d1943b1ada13eeef43f6d28cb792755de48c461b1ebee7810e5278cd5d6e3','873d1943b1ada13eeef43f6d28cb792755de48c461b1ebee7810e5278cd5d6e3'),
 ('validate_import_source_commit','524ec70d51970cfc79f4ec5e9a93f21bf20733781a2202121a4e91d1d6b66f3a','524ec70d51970cfc79f4ec5e9a93f21bf20733781a2202121a4e91d1d6b66f3a'),
 ('validate_ledger_receipt_source','26f2f325172ef2878d4dffb4f1740d680e63458abd4b25e7a693e352664d15da','26f2f325172ef2878d4dffb4f1740d680e63458abd4b25e7a693e352664d15da'),
 ('validate_maintenance_receipt_commit','7a42aeef2738c9009bc9eaa4ecbf41feefb43b759fbed2514a005166d20ac384','77679e1e21858ae64ac1225660cf7a692f63b097d538254829def8164ea33ac5'),
 ('validate_maintenance_root_commit','8556d1ed234adb3bae1d99c9bb8e867db4070eadafa39dbb8b31752c7e24b512','002818dfd8d764e99221bb0548da1141054871ae674aba6bb9f6ce59c9d92d1c'),
 ('validate_native_creation_commit','a505ceb68946cc14a69b181cd43d6cebbedca9e9ea453c9920c243892f537cd7','a505ceb68946cc14a69b181cd43d6cebbedca9e9ea453c9920c243892f537cd7'),
 ('validate_native_party_import_commit','5383c9941e06c7748af6603eee56559b102b09305c11771a813c6cf859ad37e3','5383c9941e06c7748af6603eee56559b102b09305c11771a813c6cf859ad37e3'),
 ('validate_party_native_commit','dba217f39c61d3f4741a72a565851a41caaa18e44fb57aa2f8e3473d20810762','dba217f39c61d3f4741a72a565851a41caaa18e44fb57aa2f8e3473d20810762'),
 ('validate_party_receipt_commit','fafc3389b3458b6d8ec4cad15f6f926dcc20bb059a819c496ed4db260d06b426','fafc3389b3458b6d8ec4cad15f6f926dcc20bb059a819c496ed4db260d06b426'),
 ('validate_sales_commit','f00b31849f4f72d62103fc08cb4e157b4401717a1f2c7c05fc699663715f07a2','f00b31849f4f72d62103fc08cb4e157b4401717a1f2c7c05fc699663715f07a2'),
 ('validate_sales_effect','e6b2bbec00a6389ed92f9026af20f06c52168d37fe5a59d3ccfc0c29fb7cb1db','e6b2bbec00a6389ed92f9026af20f06c52168d37fe5a59d3ccfc0c29fb7cb1db'),
 ('validate_sales_settlement','d862252df7c25f0a57db82754bba56a812e3c88b8cd6150f5a198212fd47a591','d862252df7c25f0a57db82754bba56a812e3c88b8cd6150f5a198212fd47a591'),
 ('validate_sparse_balance_commit','84c96a25df3dc2442445d6bbf71444a62d231e30cf83cb635968cc8f6a0cdd09','84c96a25df3dc2442445d6bbf71444a62d231e30cf83cb635968cc8f6a0cdd09'),
 ('validate_transfer_balance_commit','9bfaa1cdf1dea76ada35bae56dd40cb3e27c6acd28a93905ee2f06d17a8b2abb','9bfaa1cdf1dea76ada35bae56dd40cb3e27c6acd28a93905ee2f06d17a8b2abb'),
 ('validate_transfer_commit','e6ceac3fddef4e61f649b8ef2d71db56042dc14c7622ca0a5c321de2ab7b3f38','e6ceac3fddef4e61f649b8ef2d71db56042dc14c7622ca0a5c321de2ab7b3f38'),
 ('validate_transfer_effect','d901f8e428c9ef2440d9fb48aca3f638eef141bd62f116e88698c6f726ad0c73','d901f8e428c9ef2440d9fb48aca3f638eef141bd62f116e88698c6f726ad0c73'),
 ('validate_transfer_header_commit','6d50fa80e2b445bc45645ff0f5592f2ed4e00836077224c1fe3510b4e563fa0c','6d50fa80e2b445bc45645ff0f5592f2ed4e00836077224c1fe3510b4e563fa0c'),
 ('validate_transfer_line_commit','1443f443a884f0073209294476daf9a7ff0f45d6d32832e5d14557d513cfc4fb','1443f443a884f0073209294476daf9a7ff0f45d6d32832e5d14557d513cfc4fb')
 ) p(name,v14,v15) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace AND proname=required.name
    AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')=CASE n WHEN 123 THEN required.v14 ELSE required.v15 END) THEN
   RAISE EXCEPTION 'Current predecessor function differs: %',required.name USING ERRCODE='23514'; END IF;
 END LOOP;
 IF n=124 AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('naijue_erp.maintenance_check_category_order(naijue_erp.audit_change)')
   AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='77c86d2788e88f2922a66c662a91b95c0f76d6ea00587148c36421feabde281e') THEN
  RAISE EXCEPTION 'Exact v15 category helper required' USING ERRCODE='23514'; END IF;
END $predecessor$;
ALTER TABLE naijue_erp.sales_header ADD COLUMN responsible_staff_id uuid NULL,
 ADD CONSTRAINT sales_responsible_staff_fk FOREIGN KEY(responsible_staff_id) REFERENCES naijue_erp.staff(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE naijue_erp.transfer_header ADD COLUMN responsible_staff_id uuid NULL,
 ADD CONSTRAINT transfer_responsible_staff_fk FOREIGN KEY(responsible_staff_id) REFERENCES naijue_erp.staff(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
DO $$
DECLARE rel regclass; col text; name text; old_expression text;
BEGIN
  FOR rel,col,name IN SELECT * FROM (VALUES
    ('naijue_erp.operation_receipt'::regclass,'target_type','receipt_target_kind'),
    ('naijue_erp.audit_change'::regclass,'object_type','audit_object_kind')) x(r,c,n) LOOP
    SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expression FROM pg_constraint WHERE conrelid=rel AND conname=name;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',rel,name);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (((%s) OR %I IN (''HISTORY_SALES'',''HISTORY_TRANSFER'')) IS TRUE)',rel,name,old_expression,col);
  END LOOP;
  FOR rel,col,name IN SELECT * FROM (VALUES
    ('naijue_erp.operation_receipt'::regclass,'target_type','receipt_action_by_kind'),
    ('naijue_erp.audit_change'::regclass,'object_type','audit_action_by_kind')) x(r,c,n) LOOP
    SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expression FROM pg_constraint WHERE conrelid=rel AND conname=name;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',rel,name);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK ((CASE WHEN %I IN (''HISTORY_SALES'',''HISTORY_TRANSFER'') THEN action=''HISTORY_REVISE'' ELSE (%s) END) IS TRUE)',rel,name,col,old_expression);
  END LOOP;
  SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expression FROM pg_constraint
    WHERE conrelid='naijue_erp.operation_receipt'::regclass AND conname='receipt_result_by_kind';
  ALTER TABLE naijue_erp.operation_receipt DROP CONSTRAINT receipt_result_by_kind;
  EXECUTE format($check$ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_result_by_kind CHECK ((CASE
    WHEN target_type IN ('HISTORY_SALES','HISTORY_TRANSFER') THEN
      jsonb_typeof(result_data)='object' AND result_data ?& ARRAY['operationId','dataset','kind','documentId','revisionId','version','ledgerEntryIds']
      AND result_data-ARRAY['operationId','dataset','kind','documentId','revisionId','version','ledgerEntryIds']='{}'::jsonb
      AND result_data->>'operationId'=id::text AND result_data->>'dataset'='HISTORY'
      AND result_data->>'kind'=CASE target_type WHEN 'HISTORY_SALES' THEN 'sales' ELSE 'transfers' END
      AND result_data->>'documentId'=target_id::text AND jsonb_typeof(result_data->'revisionId')='string'
      AND result_data->>'revisionId' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      AND jsonb_typeof(result_data->'version')='number' AND result_data->>'version' ~ '^[1-9][0-9]*$'
      AND (result_data->>'version')::numeric BETWEEN 2 AND 2147483647 AND jsonb_typeof(result_data->'ledgerEntryIds')='array'
    ELSE (%s) END) IS TRUE)$check$,old_expression);
  SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expression FROM pg_constraint
    WHERE conrelid='naijue_erp.inventory_ledger'::regclass AND conname='ledger_event_kind';
  ALTER TABLE naijue_erp.inventory_ledger DROP CONSTRAINT ledger_event_kind;
  EXECUTE format('ALTER TABLE naijue_erp.inventory_ledger ADD CONSTRAINT ledger_event_kind CHECK (((%s) OR event_kind=''HISTORY_REVISION'') IS TRUE)',old_expression);
  SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expression FROM pg_constraint
    WHERE conrelid='naijue_erp.inventory_ledger'::regclass AND conname='ledger_closed_source';
  ALTER TABLE naijue_erp.inventory_ledger DROP CONSTRAINT ledger_closed_source;
  EXECUTE format($check$ALTER TABLE naijue_erp.inventory_ledger ADD CONSTRAINT ledger_closed_source CHECK (((
    (%s) AND source_history_revision_id IS NULL AND source_history_sales_line_id IS NULL AND source_history_transfer_line_id IS NULL)
    OR (event_kind='HISTORY_REVISION' AND source_history_revision_id IS NOT NULL AND source_import_batch_id IS NULL
      AND source_sales_line_id IS NULL AND source_transfer_line_id IS NULL AND reverses_entry_id IS NULL AND source_document_version>1
      AND ((source_history_sales_line_id IS NOT NULL AND source_history_transfer_line_id IS NULL AND endpoint='SALES_WAREHOUSE')
        OR (source_history_sales_line_id IS NULL AND source_history_transfer_line_id IS NOT NULL AND endpoint IN ('FROM','TO'))))) IS TRUE)$check$,old_expression);
END $$;
ALTER TABLE naijue_erp.inventory_ledger
  ADD CONSTRAINT history_sales_operation_endpoint UNIQUE(operation_id,source_history_sales_line_id,endpoint),
  ADD CONSTRAINT history_transfer_operation_endpoint UNIQUE(operation_id,source_history_transfer_line_id,endpoint);

-- Complete original/effective facts. This helper never changes the immutable source.
CREATE FUNCTION naijue_erp.history_numeric_current_facts(kind text,target uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE h jsonb; d record; e jsonb; lines jsonb; settlements jsonb; result jsonb; document_version integer; effective_facts jsonb;
BEGIN
  IF kind='SALES' THEN
    SELECT to_jsonb(x) INTO STRICT h FROM naijue_erp.history_sales_header x WHERE x.id=target FOR UPDATE;
    SELECT to_jsonb(x) INTO e FROM naijue_erp.history_sales_effective x WHERE x.header_id=target FOR UPDATE;
  ELSIF kind='TRANSFER' THEN
    SELECT to_jsonb(x) INTO STRICT h FROM naijue_erp.history_transfer_header x WHERE x.id=target FOR UPDATE;
    SELECT to_jsonb(x) INTO e FROM naijue_erp.history_transfer_effective x WHERE x.header_id=target FOR UPDATE;
  ELSE RAISE EXCEPTION 'Actual historical document kind required' USING ERRCODE='23514'; END IF;
  document_version:=coalesce((e->>'version')::integer,(h->>'version')::integer);
  SELECT md.typed_document_sha256,md.line_count,md.settlement_count,r.id AS published_operation_id INTO STRICT d
    FROM naijue_erp.import_batch b JOIN naijue_erp.import_history_closure_manifest m ON m.batch_id=b.id
    JOIN naijue_erp.import_history_document_manifest md ON md.batch_id=b.id AND md.document_kind=kind
      AND (CASE kind WHEN 'SALES' THEN md.sales_header_id ELSE md.transfer_header_id END)=target
      AND md.header_source_row_id=(h->>'source_row_id')::uuid
    JOIN naijue_erp.import_record f ON f.import_batch_id=b.id AND f.target_type='IMPORT_BATCH' AND f.target_id=b.id
    JOIN naijue_erp.import_record_accounting_claim c ON c.import_batch_id=b.id AND c.import_record_id=f.id AND c.target_type=f.target_type AND c.target_id=f.target_id
    JOIN naijue_erp.operation_receipt r ON r.id=c.operation_id JOIN naijue_erp.audit_change a ON a.operation_id=r.id
    WHERE b.id=(h->>'batch_id')::uuid AND b.mapping_version='V2_HISTORY_NULLABLE_1' AND b.inventory_mode='CUTOFF_STOCK_BASELINE'
      AND b.status='IMPORTED' AND b.completed_at IS NOT NULL AND b.history_validation_passed IS TRUE
      AND b.history_actual_counts=b.history_expected_counts AND b.checkpoint->'counts'=b.checkpoint->'expected'
      AND b.checkpoint->'counts'->>'IMPORT_BATCH'='1' AND m.validator_version='HISTORY_TYPED_CLOSURE_V1'
      AND m.selection_sha256=b.source_hash AND m.authorized_payload_hash=b.history_payload_hash AND m.expected_counts=b.history_expected_counts
      AND m.document_count=(SELECT count(*) FROM naijue_erp.import_history_document_manifest x WHERE x.batch_id=b.id)
      AND f.status='IMPORTED' AND f.source_entity_type='INVENTORY_SCOPE_APPROVAL' AND f.source_key='FINAL_COMPLETE_SCOPE'
      AND f.source_record_hash=b.source_hash AND f.source_file_ref=b.source_manifest_ref
      AND f.decision_reason='COMPLETE_SCOPE;ABSENT_IS_ZERO;ALL_FILES_VERIFIED;FINAL_DELTA_VERIFIED;NO_UNRESOLVED_EXCEPTIONS'
      AND c.checkpoint_sequence=(b.checkpoint->>'sequence')::integer AND r.target_type='IMPORT' AND r.target_id=b.id
      AND r.action='IMPORT_PUBLISH' AND r.status='COMMITTED' AND r.result_data->>'status'='IMPORTED'
      AND r.result_data->>'batchId'=b.id::text AND r.result_data->>'sequence'=b.checkpoint->>'sequence' AND r.result_data->>'cursor'=b.checkpoint->>'cursor'
      AND a.object_type='IMPORT' AND a.object_id=b.id AND a.action=r.action AND a.actor_account_id=r.actor_account_id AND a.occurred_at=r.completed_at
      AND b.xmin::text::bigint<>mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND r.xmin::text::bigint<>mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
    FOR SHARE OF b,m,md,f,c,r,a;
  IF e IS NOT NULL AND NOT EXISTS(SELECT 1 FROM naijue_erp.history_revision x WHERE x.id=(e->>'revision_id')::uuid
    AND x.document_kind=kind AND (CASE kind WHEN 'SALES' THEN x.sales_id ELSE x.transfer_id END)=target
    AND x.to_version=document_version AND x.to_version=x.from_version+1 AND x.operation_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Original effective head has no exact revision' USING ERRCODE='23514'; END IF;
  IF e IS NOT NULL THEN SELECT after_facts INTO STRICT effective_facts FROM naijue_erp.history_revision WHERE id=(e->>'revision_id')::uuid; END IF;
  IF kind='SALES' THEN
    IF EXISTS(SELECT 1 FROM naijue_erp.history_sales_line l JOIN naijue_erp.history_sales_line_effective v ON v.line_id=l.id
      LEFT JOIN naijue_erp.history_revision x ON x.id=v.revision_id WHERE l.header_id=target
      AND (x.id IS NULL OR x.document_kind<>'SALES' OR x.sales_id<>target OR x.transfer_id IS NOT NULL OR x.to_version>document_version))
      OR EXISTS(SELECT 1 FROM naijue_erp.history_sales_settlement s JOIN naijue_erp.history_sales_settlement_effective v ON v.settlement_id=s.id
        LEFT JOIN naijue_erp.history_revision x ON x.id=v.revision_id WHERE s.header_id=target
        AND (x.id IS NULL OR x.document_kind<>'SALES' OR x.sales_id<>target OR x.transfer_id IS NOT NULL OR x.to_version>document_version)) THEN
      RAISE EXCEPTION 'Foreign or future effective row' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('lineId',l.id,'skuId',l.sku_id,'quantity',coalesce(v.quantity,l.quantity)::text,
      'dealPrice',coalesce(v.deal_price,l.deal_price)::text,'lineAmount',coalesce(v.line_amount,l.line_amount)::text,
      'allocatedDiscount',(CASE WHEN v.line_id IS NULL THEN l.allocated_discount ELSE v.allocated_discount END)::text) ORDER BY l.line_no,l.id),'[]') INTO lines
      FROM naijue_erp.history_sales_line l LEFT JOIN naijue_erp.history_sales_line_effective v ON v.line_id=l.id WHERE l.header_id=target;
    SELECT coalesce(jsonb_agg(jsonb_build_object('settlementId',s.id,'direction',s.direction,'amount',coalesce(v.amount,s.amount)::text) ORDER BY s.line_no,s.id),'[]') INTO settlements
      FROM naijue_erp.history_sales_settlement s LEFT JOIN naijue_erp.history_sales_settlement_effective v ON v.settlement_id=s.id WHERE s.header_id=target;
  ELSE
    IF EXISTS(SELECT 1 FROM naijue_erp.history_transfer_line l JOIN naijue_erp.history_transfer_line_effective v ON v.line_id=l.id
      LEFT JOIN naijue_erp.history_revision x ON x.id=v.revision_id WHERE l.header_id=target
      AND (x.id IS NULL OR x.document_kind<>'TRANSFER' OR x.transfer_id<>target OR x.sales_id IS NOT NULL OR x.to_version>document_version)) THEN
      RAISE EXCEPTION 'Foreign or future effective row' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('lineId',l.id,'skuId',l.sku_id,'quantity',coalesce(v.quantity,l.quantity)::text) ORDER BY l.line_no,l.id),'[]') INTO lines
      FROM naijue_erp.history_transfer_line l LEFT JOIN naijue_erp.history_transfer_line_effective v ON v.line_id=l.id WHERE l.header_id=target;
    settlements:='[]';
  END IF;
  IF jsonb_array_length(lines)<>d.line_count OR d.line_count NOT BETWEEN 1 AND 10000
    OR jsonb_array_length(settlements)<>d.settlement_count OR d.settlement_count NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'Complete bounded original line and settlement set required' USING ERRCODE='23514'; END IF;
  result:=jsonb_build_object('kind',CASE kind WHEN 'SALES' THEN 'sales' ELSE 'transfers' END,'documentId',target,'version',document_version,
    'previousRevisionId',e->>'revision_id','importBatchId',h->>'batch_id','publishedOperationId',d.published_operation_id,'documentManifestHash',d.typed_document_sha256,
    'sourceStatus',h->>'source_status','baselineEffect',CASE h->>'source_status' WHEN 'APPROVED' THEN 'INCLUDED_APPROVED' ELSE 'EXCLUDED_NOT_EFFECTIVE' END,
    'businessDate',CASE WHEN effective_facts IS NULL THEN h->'business_date' ELSE effective_facts->'businessDate' END,'responsibleStaffId',coalesce(effective_facts->'responsibleStaffId','null'::jsonb),'warehouseId',CASE kind WHEN 'SALES' THEN h->>'warehouse_id' ELSE NULL END,
    'fromWarehouseId',CASE kind WHEN 'TRANSFER' THEN coalesce(effective_facts->>'fromWarehouseId',h->>'from_warehouse_id') ELSE NULL END,'toWarehouseId',CASE kind WHEN 'TRANSFER' THEN coalesce(effective_facts->>'toWarehouseId',h->>'to_warehouse_id') ELSE NULL END,
    'lines',lines,'totals',CASE kind WHEN 'SALES' THEN jsonb_build_object('grossAmount',coalesce(e->>'gross_amount',(h->>'gross_amount')::numeric(18,2)::text),
      'orderDiscount',coalesce(e->>'order_discount',(h->>'order_discount')::numeric(18,2)::text),'netDue',coalesce(e->>'net_due',(h->>'net_due')::numeric(18,2)::text)) ELSE NULL END,'settlements',settlements);
  -- jsonb numeric head values lose scale; make the money strings canonical.
  IF kind='SALES' AND e IS NOT NULL THEN result:=jsonb_set(result,'{totals}',jsonb_build_object('grossAmount',(e->>'gross_amount')::numeric(18,2)::text,
    'orderDiscount',(e->>'order_discount')::numeric(18,2)::text,'netDue',(e->>'net_due')::numeric(18,2)::text)); END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION naijue_erp.history_numeric_current_facts(text,uuid) FROM PUBLIC;

CREATE FUNCTION naijue_erp.history_numeric_money(value jsonb,nonnegative boolean DEFAULT false) RETURNS numeric LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE amount text;
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Exact original money string required' USING ERRCODE='23514'; END IF;
  amount:=value #>> '{}';
  IF amount !~ '^-?(0|[1-9][0-9]{0,15})\.[0-9]{2}$' OR amount='-0.00' OR (nonnegative AND amount LIKE '-%') THEN
    RAISE EXCEPTION 'Exact bounded yuan amount required' USING ERRCODE='23514'; END IF;
  RETURN amount::numeric(18,2);
END $$;
REVOKE ALL ON FUNCTION naijue_erp.history_numeric_money(jsonb,boolean) FROM PUBLIC;

-- Keep the existing closed trigger attached; replace it with complete admission.
CREATE OR REPLACE FUNCTION naijue_erp.history_revision_not_enabled() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE actual jsonb; old_line jsonb; next_line jsonb; old_settlement jsonb; next_settlement jsonb;
  actor record; source_header jsonb; item record; effect jsonb; evidence jsonb; expected_effects integer:=0;
  difference numeric; old_effect numeric; next_effect numeric; money_changed boolean:=false; settled numeric;
  target uuid; action_kind text; size_before integer; effect_count integer; ledger_ids jsonb;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'History revisions are append-only' USING ERRCODE='23514'; END IF;
  target:=CASE NEW.document_kind WHEN 'SALES' THEN NEW.sales_id WHEN 'TRANSFER' THEN NEW.transfer_id END;
  action_kind:=CASE NEW.document_kind WHEN 'SALES' THEN 'sales' WHEN 'TRANSFER' THEN 'transfers' END;
  IF target IS NULL OR NEW.operation_id IS NULL OR NEW.operation_id=NEW.id OR length(NEW.request_key) NOT BETWEEN 1 AND 200
    OR length(btrim(NEW.reason)) NOT BETWEEN 1 AND 2000 OR NEW.to_version<>NEW.from_version+1 THEN
    RAISE EXCEPTION 'Original bounded historical revision identity required' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('naijue:receipt:['||to_json(NEW.actor_account_id::text)::text||','||to_json(NEW.request_key)::text||']',0));
  PERFORM pg_advisory_xact_lock(hashtextextended('naijue:history:'||action_kind||':'||target::text,0));
  actual:=naijue_erp.history_numeric_current_facts(NEW.document_kind,target);
  IF NEW.before_facts IS DISTINCT FROM actual OR (actual->>'version')::integer<>NEW.from_version THEN
    RAISE EXCEPTION 'Locked original effective version changed' USING ERRCODE='40001'; END IF;
  SELECT a.login_enabled,s.role,s.employment_status,s.hall_id INTO STRICT actor FROM naijue_erp.user_account a
    JOIN naijue_erp.staff s ON s.id=a.staff_id WHERE a.id=NEW.actor_account_id FOR SHARE OF a,s;
  IF actor.login_enabled IS NOT TRUE OR actor.employment_status IS DISTINCT FROM '在职' OR actor.role NOT IN ('ADMIN','WAREHOUSE','SALESPERSON') THEN
    RAISE EXCEPTION 'Current historical correction actor unavailable' USING ERRCODE='42501'; END IF;
  IF actor.hall_id IS NOT NULL THEN
    PERFORM 1 FROM naijue_erp.hall WHERE id=actor.hall_id AND enabled FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Current hall unavailable' USING ERRCODE='42501'; END IF;
  ELSIF actor.role='SALESPERSON' THEN RAISE EXCEPTION 'Salesperson hall required' USING ERRCODE='42501'; END IF;
  IF NEW.document_kind='SALES' THEN
    SELECT to_jsonb(h) INTO STRICT source_header FROM naijue_erp.history_sales_header h WHERE h.id=target;
    IF actor.role='SALESPERSON' AND source_header->>'hall_id' IS DISTINCT FROM actor.hall_id::text THEN
      RAISE EXCEPTION 'History sales outside current hall' USING ERRCODE='42501'; END IF;
  ELSE
    SELECT to_jsonb(h) INTO STRICT source_header FROM naijue_erp.history_transfer_header h WHERE h.id=target;
    IF actor.role='SALESPERSON' AND NOT EXISTS(SELECT 1 FROM naijue_erp.warehouse w
      WHERE w.id IN ((actual->>'fromWarehouseId')::uuid,(actual->>'toWarehouseId')::uuid) AND w.hall_id=actor.hall_id)
      AND NOT coalesce((source_header->>'created_role_source'='SALESPERSON' AND source_header->>'created_hall_id'=actor.hall_id::text
        AND source_header->>'created_hall_provenance'<>'UNKNOWN' AND source_header->>'created_by_source_key' IS NOT NULL),false) THEN
      RAISE EXCEPTION 'History transfer outside current hall' USING ERRCODE='42501'; END IF;
  END IF;
  IF NEW.stock_effect_basis<>'CUTOFF_BASELINE_DELTA_V1' OR NEW.after_facts-ARRAY['version','previousRevisionId','lines','totals','settlements','businessDate','fromWarehouseId','toWarehouseId','responsibleStaffId']
      IS DISTINCT FROM actual-ARRAY['version','previousRevisionId','lines','totals','settlements','businessDate','fromWarehouseId','toWarehouseId','responsibleStaffId']
    OR NEW.after_facts->'version' IS DISTINCT FROM to_jsonb(NEW.to_version) OR NEW.after_facts->>'previousRevisionId' IS DISTINCT FROM NEW.id::text
    OR jsonb_typeof(NEW.after_facts->'lines') IS DISTINCT FROM 'array' OR jsonb_typeof(NEW.after_facts->'settlements') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'History correction cannot change source identity, scope, status or time' USING ERRCODE='23514'; END IF;
  IF NEW.after_facts-ARRAY['version','previousRevisionId','lines','totals','settlements'] IS DISTINCT FROM actual-ARRAY['version','previousRevisionId','lines','totals','settlements'] THEN
    IF actual->>'sourceStatus'<>'DRAFT' OR actual->>'baselineEffect'<>'EXCLUDED_NOT_EFFECTIVE' THEN
      RAISE EXCEPTION 'Only original draft historical heads may change' USING ERRCODE='23514'; END IF;
    IF NEW.after_facts->'businessDate' IS DISTINCT FROM actual->'businessDate' THEN
      IF jsonb_typeof(NEW.after_facts->'businessDate') IS DISTINCT FROM 'string'
        OR NEW.after_facts->>'businessDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        OR (NEW.after_facts->>'businessDate')::date::text IS DISTINCT FROM NEW.after_facts->>'businessDate' THEN
        RAISE EXCEPTION 'Actual nonnull business date required' USING ERRCODE='23514'; END IF;
    END IF;
    IF NEW.after_facts->'responsibleStaffId' IS DISTINCT FROM actual->'responsibleStaffId' THEN
      IF jsonb_typeof(NEW.after_facts->'responsibleStaffId') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'Responsible employee cannot be guessed or cleared' USING ERRCODE='23514'; END IF;
      PERFORM id FROM naijue_erp.staff WHERE id=(NEW.after_facts->>'responsibleStaffId')::uuid FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Actual responsible staff required' USING ERRCODE='23514'; END IF;
    END IF;
    IF NEW.document_kind='SALES' THEN
      IF NEW.after_facts->'fromWarehouseId' IS DISTINCT FROM actual->'fromWarehouseId' OR NEW.after_facts->'toWarehouseId' IS DISTINCT FROM actual->'toWarehouseId' THEN
        RAISE EXCEPTION 'Sales revision cannot change transfer endpoints' USING ERRCODE='23514'; END IF;
    ELSE
      IF jsonb_typeof(NEW.after_facts->'fromWarehouseId') IS DISTINCT FROM 'string' OR jsonb_typeof(NEW.after_facts->'toWarehouseId') IS DISTINCT FROM 'string'
        OR NEW.after_facts->>'fromWarehouseId'=NEW.after_facts->>'toWarehouseId' THEN
        RAISE EXCEPTION 'Two distinct actual warehouse endpoints required' USING ERRCODE='23514'; END IF;
      FOR item IN SELECT value FROM jsonb_array_elements(jsonb_build_array(NEW.after_facts->'fromWarehouseId',NEW.after_facts->'toWarehouseId')) LOOP
        PERFORM w.id FROM naijue_erp.warehouse w JOIN naijue_erp.hall h ON h.id=w.hall_id WHERE w.id=(item.value #>> '{}')::uuid
          AND (item.value IN(actual->'fromWarehouseId',actual->'toWarehouseId') OR w.enabled OR (item.value=NEW.after_facts->'fromWarehouseId' AND EXISTS(SELECT 1 FROM naijue_erp.inventory_balance stock WHERE stock.warehouse_id=w.id AND stock.quantity<>0))) FOR SHARE OF w,h;
        IF NOT FOUND THEN RAISE EXCEPTION 'Proposed warehouse unavailable' USING ERRCODE='23514'; END IF;
      END LOOP;
      IF actor.role='SALESPERSON' AND NOT EXISTS(SELECT 1 FROM naijue_erp.warehouse w WHERE w.id IN((NEW.after_facts->>'fromWarehouseId')::uuid,(NEW.after_facts->>'toWarehouseId')::uuid) AND w.hall_id=actor.hall_id)
        AND NOT coalesce((source_header->>'created_role_source'='SALESPERSON' AND source_header->>'created_hall_id'=actor.hall_id::text AND source_header->>'created_hall_provenance'<>'UNKNOWN' AND source_header->>'created_by_source_key' IS NOT NULL),false) THEN
        RAISE EXCEPTION 'Proposed historical endpoints outside current permission' USING ERRCODE='42501'; END IF;
    END IF;
  END IF;
  IF NEW.after_facts-ARRAY['version','previousRevisionId'] IS NOT DISTINCT FROM actual-ARRAY['version','previousRevisionId'] THEN
    RAISE EXCEPTION 'Empty historical correction' USING ERRCODE='23514'; END IF;
  size_before:=jsonb_array_length(actual->'lines');
  IF jsonb_array_length(NEW.after_facts->'lines')<>size_before OR jsonb_array_length(NEW.after_facts->'settlements')<>jsonb_array_length(actual->'settlements') THEN
    RAISE EXCEPTION 'Cannot add or remove original historical rows' USING ERRCODE='23514'; END IF;
  evidence:=NEW.stock_effect_evidence;
  IF evidence-ARRAY['schemaVersion','importBatchId','publishedOperationId','documentManifestHash','previousRevisionId','oldEffectiveVersion','newEffectiveVersion','sourceStatus','effects','ledgerEntryIds']<>'{}'
    OR evidence->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR evidence->'importBatchId' IS DISTINCT FROM actual->'importBatchId'
    OR evidence->'publishedOperationId' IS DISTINCT FROM actual->'publishedOperationId' OR evidence->'documentManifestHash' IS DISTINCT FROM actual->'documentManifestHash'
    OR evidence->'previousRevisionId' IS DISTINCT FROM actual->'previousRevisionId' OR evidence->'oldEffectiveVersion' IS DISTINCT FROM actual->'version'
    OR evidence->'newEffectiveVersion' IS DISTINCT FROM to_jsonb(NEW.to_version) OR evidence->'sourceStatus' IS DISTINCT FROM actual->'sourceStatus'
    OR jsonb_typeof(evidence->'effects') IS DISTINCT FROM 'array' OR jsonb_typeof(evidence->'ledgerEntryIds') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Exact original publication and effective version evidence required' USING ERRCODE='23514'; END IF;
  FOR item IN SELECT value,ordinality FROM jsonb_array_elements(actual->'lines') WITH ORDINALITY LOOP
    old_line:=item.value;next_line:=NEW.after_facts->'lines'->(item.ordinality::integer-1);
    IF jsonb_typeof(next_line) IS DISTINCT FROM 'object' OR next_line-ARRAY['quantity','dealPrice','lineAmount','allocatedDiscount']
      IS DISTINCT FROM old_line-ARRAY['quantity','dealPrice','lineAmount','allocatedDiscount'] OR jsonb_typeof(next_line->'quantity') IS DISTINCT FROM 'string'
      OR (next_line->>'quantity') !~ '^-?(0|[1-9][0-9]*)$' OR (next_line->>'quantity')::bigint::text<>next_line->>'quantity' THEN
      RAISE EXCEPTION 'Only original line numeric values may change' USING ERRCODE='23514'; END IF;
    IF NEW.document_kind='SALES' THEN
      PERFORM naijue_erp.history_numeric_money(next_line->'dealPrice',true),naijue_erp.history_numeric_money(next_line->'lineAmount');
      IF next_line->'allocatedDiscount' IS DISTINCT FROM 'null'::jsonb THEN PERFORM naijue_erp.history_numeric_money(next_line->'allocatedDiscount',true); END IF;
      IF next_line-'quantity' IS DISTINCT FROM old_line-'quantity' THEN money_changed:=true; END IF;
    ELSIF next_line-ARRAY['lineId','skuId','quantity']<>'{}'::jsonb THEN
      RAISE EXCEPTION 'Transfer supports only original quantity corrections' USING ERRCODE='23514'; END IF;
    difference:=(next_line->>'quantity')::numeric-(old_line->>'quantity')::numeric;
    IF actual->>'sourceStatus'='APPROVED' AND difference<>0 THEN
      IF actual->'businessDate'='null'::jsonb THEN RAISE EXCEPTION 'Original business date required for a stock delta' USING ERRCODE='23514'; END IF;
      expected_effects:=expected_effects+CASE NEW.document_kind WHEN 'SALES' THEN 1 ELSE 2 END;
    END IF;
  END LOOP;
  IF NEW.document_kind='SALES' THEN
    IF (NEW.after_facts->'totals')-ARRAY['grossAmount','orderDiscount','netDue']<>'{}'::jsonb THEN RAISE EXCEPTION 'Exact original totals fields required' USING ERRCODE='23514'; END IF;
    PERFORM naijue_erp.history_numeric_money(NEW.after_facts->'totals'->'grossAmount'),naijue_erp.history_numeric_money(NEW.after_facts->'totals'->'orderDiscount',true),naijue_erp.history_numeric_money(NEW.after_facts->'totals'->'netDue');
    money_changed:=money_changed OR NEW.after_facts->'totals' IS DISTINCT FROM actual->'totals';
    settled:=0;
    FOR item IN SELECT value,ordinality FROM jsonb_array_elements(actual->'settlements') WITH ORDINALITY LOOP
      old_settlement:=item.value;next_settlement:=NEW.after_facts->'settlements'->(item.ordinality::integer-1);
      IF next_settlement-'amount' IS DISTINCT FROM old_settlement-'amount' THEN RAISE EXCEPTION 'Original settlement identity and direction cannot change' USING ERRCODE='23514'; END IF;
      settled:=settled+CASE next_settlement->>'direction' WHEN 'RECEIVE' THEN 1 ELSE -1 END*naijue_erp.history_numeric_money(next_settlement->'amount',true);
      money_changed:=money_changed OR next_settlement IS DISTINCT FROM old_settlement;
    END LOOP;
    IF money_changed AND settled<>naijue_erp.history_numeric_money(NEW.after_facts->'totals'->'netDue') THEN
      RAISE EXCEPTION 'Corrected receive/refund must balance exact effective net due' USING ERRCODE='23514'; END IF;
  ELSIF NEW.after_facts->'totals' IS DISTINCT FROM 'null'::jsonb OR NEW.after_facts->'settlements'<>'[]'::jsonb THEN
    RAISE EXCEPTION 'Transfer has no money correction branch' USING ERRCODE='23514'; END IF;
  IF jsonb_array_length(evidence->'effects')<>expected_effects OR jsonb_array_length(evidence->'ledgerEntryIds')<>expected_effects
    OR (SELECT count(DISTINCT value->>'ledgerEntryId') FROM jsonb_array_elements(evidence->'effects'))<>expected_effects
    OR (SELECT count(DISTINCT (value->>'lineId',value->>'endpoint')) FROM jsonb_array_elements(evidence->'effects'))<>expected_effects THEN
    RAISE EXCEPTION 'Exact nonzero original line/endpoint delta set required' USING ERRCODE='23514'; END IF;
  SELECT coalesce(jsonb_agg(value->'ledgerEntryId' ORDER BY ordinality),'[]') INTO ledger_ids FROM jsonb_array_elements(evidence->'effects') WITH ORDINALITY;
  IF evidence->'ledgerEntryIds' IS DISTINCT FROM ledger_ids THEN RAISE EXCEPTION 'Exact delta ledger identity list required' USING ERRCODE='23514'; END IF;
  FOR effect IN SELECT value FROM jsonb_array_elements(evidence->'effects') LOOP
    IF jsonb_typeof(effect) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(effect))<>9
      OR NOT effect ?& ARRAY['lineId','warehouseId','skuId','endpoint','quantityDelta','ledgerEntryId','oldEffect','newEffect','delta']
      OR (effect->>'ledgerEntryId') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Exact bounded delta evidence fields required' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(effect) WHERE jsonb_typeof(value)<>'string') THEN
      RAISE EXCEPTION 'Delta identities and exact numeric evidence must remain strings' USING ERRCODE='23514'; END IF;
    SELECT value INTO STRICT old_line FROM jsonb_array_elements(actual->'lines') WHERE value->>'lineId'=effect->>'lineId';
    SELECT value INTO STRICT next_line FROM jsonb_array_elements(NEW.after_facts->'lines') WHERE value->>'lineId'=effect->>'lineId';
    old_effect:=CASE effect->>'endpoint' WHEN 'TO' THEN 1 ELSE -1 END*(old_line->>'quantity')::numeric;
    next_effect:=CASE effect->>'endpoint' WHEN 'TO' THEN 1 ELSE -1 END*(next_line->>'quantity')::numeric;
    difference:=next_effect-old_effect;
    IF actual->>'sourceStatus'<>'APPROVED' OR difference=0 OR effect->>'skuId' IS DISTINCT FROM old_line->>'skuId'
      OR effect->>'warehouseId' IS DISTINCT FROM (CASE effect->>'endpoint' WHEN 'SALES_WAREHOUSE' THEN actual->>'warehouseId' WHEN 'FROM' THEN actual->>'fromWarehouseId' WHEN 'TO' THEN actual->>'toWarehouseId' END)
      OR (NEW.document_kind='SALES' AND effect->>'endpoint'<>'SALES_WAREHOUSE') OR (NEW.document_kind='TRANSFER' AND effect->>'endpoint' NOT IN ('FROM','TO'))
      OR effect->>'oldEffect' IS DISTINCT FROM old_effect::text OR effect->>'newEffect' IS DISTINCT FROM next_effect::text OR effect->>'delta' IS DISTINCT FROM difference::text
      OR (effect->>'quantityDelta')::bigint::text IS DISTINCT FROM difference::text THEN
      RAISE EXCEPTION 'Only exact approved historical stock difference is permitted' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.history_effective_writes_closed() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE revision naijue_erp.history_revision%ROWTYPE; value jsonb; previous jsonb; expected jsonb; actual jsonb; parent uuid; target uuid;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Historical effective identities cannot be deleted' USING ERRCODE='23514'; END IF;
  value:=to_jsonb(NEW); IF TG_OP='UPDATE' THEN previous:=to_jsonb(OLD); END IF;
  SELECT * INTO STRICT revision FROM naijue_erp.history_revision r WHERE r.id=(value->>'revision_id')::uuid
    AND r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
  target:=CASE revision.document_kind WHEN 'SALES' THEN revision.sales_id ELSE revision.transfer_id END;
  IF TG_TABLE_NAME IN ('history_sales_effective','history_transfer_effective') THEN
    IF (value->>'header_id')::uuid<>target OR (value->>'version')::integer<>revision.to_version
      OR (TG_TABLE_NAME='history_sales_effective') IS DISTINCT FROM (revision.document_kind='SALES')
      OR (TG_OP='INSERT' AND (revision.from_version<>1 OR revision.before_facts->'previousRevisionId'<>'null'::jsonb))
      OR (TG_OP='UPDATE' AND ((previous->>'header_id')::uuid<>target OR (previous->>'version')::integer<>revision.from_version
        OR previous->'revision_id' IS DISTINCT FROM revision.before_facts->'previousRevisionId')) THEN
      RAISE EXCEPTION 'Effective head requires the exact original revision CAS' USING ERRCODE='40001'; END IF;
    IF TG_TABLE_NAME='history_sales_effective' THEN
      actual:=jsonb_build_object('grossAmount',(value->>'gross_amount')::numeric(18,2)::text,'orderDiscount',(value->>'order_discount')::numeric(18,2)::text,'netDue',(value->>'net_due')::numeric(18,2)::text);
      IF actual IS DISTINCT FROM revision.after_facts->'totals' THEN RAISE EXCEPTION 'Effective sales head differs from approved numeric facts' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='history_sales_line_effective' THEN
    SELECT header_id INTO STRICT parent FROM naijue_erp.history_sales_line WHERE id=(value->>'line_id')::uuid FOR SHARE;
    SELECT item INTO STRICT expected FROM jsonb_array_elements(revision.after_facts->'lines') item WHERE item->>'lineId'=value->>'line_id';
    actual:=jsonb_build_object('quantity',(value->>'quantity')::bigint::text,'dealPrice',(value->>'deal_price')::numeric(18,2)::text,
      'lineAmount',(value->>'line_amount')::numeric(18,2)::text,'allocatedDiscount',CASE WHEN value->'allocated_discount'='null'::jsonb THEN NULL ELSE (value->>'allocated_discount')::numeric(18,2)::text END);
    IF revision.document_kind<>'SALES' OR parent<>target OR actual IS DISTINCT FROM expected-ARRAY['lineId','skuId']
      OR (TG_OP='UPDATE' AND previous->'line_id' IS DISTINCT FROM value->'line_id') THEN
      RAISE EXCEPTION 'Effective sales line must retain original parent and exact numeric facts' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='history_transfer_line_effective' THEN
    SELECT header_id INTO STRICT parent FROM naijue_erp.history_transfer_line WHERE id=(value->>'line_id')::uuid FOR SHARE;
    SELECT item INTO STRICT expected FROM jsonb_array_elements(revision.after_facts->'lines') item WHERE item->>'lineId'=value->>'line_id';
    IF revision.document_kind<>'TRANSFER' OR parent<>target OR (value->>'quantity')::bigint::text IS DISTINCT FROM expected->>'quantity'
      OR (TG_OP='UPDATE' AND previous->'line_id' IS DISTINCT FROM value->'line_id') THEN
      RAISE EXCEPTION 'Effective transfer quantity must retain original parent' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='history_sales_settlement_effective' THEN
    SELECT header_id INTO STRICT parent FROM naijue_erp.history_sales_settlement WHERE id=(value->>'settlement_id')::uuid FOR SHARE;
    SELECT item INTO STRICT expected FROM jsonb_array_elements(revision.after_facts->'settlements') item WHERE item->>'settlementId'=value->>'settlement_id';
    IF revision.document_kind<>'SALES' OR parent<>target OR (value->>'amount')::numeric(18,2)::text IS DISTINCT FROM expected->>'amount'
      OR (TG_OP='UPDATE' AND previous->'settlement_id' IS DISTINCT FROM value->'settlement_id') THEN
      RAISE EXCEPTION 'Effective settlement retains original account and direction' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'Unknown historical projection' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION naijue_erp.guard_history_numeric_ledger() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE revision naijue_erp.history_revision%ROWTYPE; effect jsonb;
BEGIN
  IF NEW.event_kind<>'HISTORY_REVISION' THEN RETURN NEW; END IF;
  SELECT * INTO STRICT revision FROM naijue_erp.history_revision r WHERE r.id=NEW.source_history_revision_id
    AND r.operation_id=NEW.operation_id AND r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
  SELECT value INTO STRICT effect FROM jsonb_array_elements(revision.stock_effect_evidence->'effects') WHERE value->>'ledgerEntryId'=NEW.id::text;
  IF NEW.source_document_version IS DISTINCT FROM revision.to_version OR NEW.reverses_entry_id IS NOT NULL OR NEW.source_import_batch_id IS NOT NULL
    OR NEW.source_sales_line_id IS NOT NULL OR NEW.source_transfer_line_id IS NOT NULL
    OR NEW.business_date::text IS DISTINCT FROM revision.before_facts->>'businessDate' OR NEW.posted_at IS DISTINCT FROM revision.changed_at
    OR NEW.warehouse_id::text IS DISTINCT FROM effect->>'warehouseId' OR NEW.sku_id::text IS DISTINCT FROM effect->>'skuId'
    OR NEW.endpoint IS DISTINCT FROM effect->>'endpoint' OR NEW.quantity_delta::text IS DISTINCT FROM effect->>'quantityDelta'
    OR (revision.document_kind='SALES' AND (NEW.source_history_sales_line_id::text IS DISTINCT FROM effect->>'lineId' OR NEW.source_history_transfer_line_id IS NOT NULL))
    OR (revision.document_kind='TRANSFER' AND (NEW.source_history_transfer_line_id::text IS DISTINCT FROM effect->>'lineId' OR NEW.source_history_sales_line_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Exact current historical revision delta source required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION naijue_erp.guard_history_numeric_ledger() FROM PUBLIC;
CREATE TRIGGER history_numeric_ledger_guard BEFORE INSERT ON naijue_erp.inventory_ledger FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_history_numeric_ledger();

CREATE FUNCTION naijue_erp.validate_history_numeric_revision_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; actual jsonb; expected jsonb; target uuid; target_kind text;
BEGIN
  target:=CASE NEW.document_kind WHEN 'SALES' THEN NEW.sales_id ELSE NEW.transfer_id END;
  target_kind:=CASE NEW.document_kind WHEN 'SALES' THEN 'HISTORY_SALES' ELSE 'HISTORY_TRANSFER' END;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt q WHERE q.id=NEW.operation_id
    AND q.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change q WHERE q.operation_id=r.id
    AND q.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
  IF r.target_type<>target_kind OR r.target_id<>target OR r.action<>'HISTORY_REVISE' OR r.status<>'COMMITTED'
    OR r.actor_account_id<>NEW.actor_account_id OR r.request_key<>NEW.request_key OR r.completed_at<>NEW.changed_at
    OR r.result_data->>'revisionId' IS DISTINCT FROM NEW.id::text OR r.result_data->>'version' IS DISTINCT FROM NEW.to_version::text
    OR r.result_data->'ledgerEntryIds' IS DISTINCT FROM NEW.stock_effect_evidence->'ledgerEntryIds'
    OR a.object_type<>r.target_type OR a.object_id<>r.target_id OR a.actor_account_id<>r.actor_account_id OR a.action<>r.action
    OR a.old_version<>NEW.from_version OR a.new_version<>NEW.to_version OR a.occurred_at<>NEW.changed_at
    OR a.before_values IS DISTINCT FROM NEW.before_facts OR a.after_values IS DISTINCT FROM NEW.after_facts THEN
    RAISE EXCEPTION 'Historical revision must close with its original audit and receipt' USING ERRCODE='23514'; END IF;
  actual:=naijue_erp.history_numeric_current_facts(NEW.document_kind,target);
  IF actual IS DISTINCT FROM NEW.after_facts THEN RAISE EXCEPTION 'Full committed effective document differs from revision' USING ERRCODE='23514'; END IF;
  SELECT coalesce(jsonb_agg(l.id::text ORDER BY l.id),'[]') INTO actual FROM naijue_erp.inventory_ledger l WHERE l.operation_id=NEW.operation_id;
  SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') INTO expected FROM jsonb_array_elements_text(NEW.stock_effect_evidence->'ledgerEntryIds');
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Historical delta ledger set must be exact, including empty money-only set' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.operation_id=NEW.operation_id
    AND (l.event_kind<>'HISTORY_REVISION' OR l.source_history_revision_id IS DISTINCT FROM NEW.id)) THEN
    RAISE EXCEPTION 'Historical operation cannot piggyback another stock source' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION naijue_erp.validate_history_numeric_revision_commit() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER history_numeric_revision_commit AFTER INSERT ON naijue_erp.history_revision
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_history_numeric_revision_commit();

CREATE FUNCTION naijue_erp.validate_history_numeric_receipt_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
  IF NEW.target_type NOT IN ('HISTORY_SALES','HISTORY_TRANSFER') THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.history_revision r WHERE r.operation_id=NEW.id AND r.id::text=NEW.result_data->>'revisionId'
    AND r.actor_account_id=NEW.actor_account_id AND r.request_key=NEW.request_key AND r.changed_at=NEW.completed_at
    AND r.to_version::text=NEW.result_data->>'version' AND r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
    AND ((NEW.target_type='HISTORY_SALES' AND r.document_kind='SALES' AND r.sales_id=NEW.target_id AND r.transfer_id IS NULL)
      OR (NEW.target_type='HISTORY_TRANSFER' AND r.document_kind='TRANSFER' AND r.transfer_id=NEW.target_id AND r.sales_id IS NULL))) THEN
    RAISE EXCEPTION 'Historical receipt cannot commit without its original current revision' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION naijue_erp.validate_history_numeric_receipt_commit() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER history_numeric_receipt_commit AFTER INSERT ON naijue_erp.operation_receipt
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_history_numeric_receipt_commit();

CREATE FUNCTION naijue_erp.validate_history_numeric_balance_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; revision naijue_erp.history_revision%ROWTYPE;
  final_row naijue_erp.inventory_balance%ROWTYPE; total numeric; effects bigint; prior_quantity numeric; prior_version numeric;
BEGIN
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=NEW.last_operation_id;
  IF r.target_type NOT IN ('HISTORY_SALES','HISTORY_TRANSFER') THEN RETURN NULL; END IF;
  SELECT * INTO STRICT revision FROM naijue_erp.history_revision x WHERE x.operation_id=r.id
    AND x.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
  IF r.action<>'HISTORY_REVISE' OR r.status<>'COMMITTED' OR revision.changed_at<>r.completed_at
    OR NOT naijue_erp.inventory_runtime_key_admitted(NEW.warehouse_id,NEW.sku_id) THEN
    RAISE EXCEPTION 'History balance requires original admitted revision operation' USING ERRCODE='23514'; END IF;
  -- Only the first event for this same operation/key validates its final cumulative delta.
  -- A previously committed operation cannot be reused: current revision xmin was checked above.
  IF TG_OP='UPDATE' THEN
    IF OLD.last_operation_id IS NOT DISTINCT FROM NEW.last_operation_id THEN RETURN NULL; END IF;
    prior_quantity:=OLD.quantity::numeric;prior_version:=OLD.version::numeric;
  ELSE
    prior_quantity:=0;prior_version:=0;
    IF EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.warehouse_id=NEW.warehouse_id AND l.sku_id=NEW.sku_id AND l.operation_id<>r.id) THEN
      RAISE EXCEPTION 'Previously used historical key cannot be reconstructed from zero' USING ERRCODE='23514'; END IF;
  END IF;
  SELECT coalesce(sum(quantity_delta::numeric),0),count(*) INTO total,effects FROM naijue_erp.inventory_ledger
    WHERE operation_id=r.id AND warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id;
  SELECT * INTO STRICT final_row FROM naijue_erp.inventory_balance WHERE warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id;
  IF effects=0 OR final_row.quantity::numeric IS DISTINCT FROM prior_quantity+total OR final_row.version::numeric IS DISTINCT FROM prior_version+effects
    OR final_row.last_operation_id IS DISTINCT FROM r.id OR final_row.updated_at IS DISTINCT FROM r.completed_at
    OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.operation_id=r.id AND l.warehouse_id=NEW.warehouse_id AND l.sku_id=NEW.sku_id
      AND (l.event_kind<>'HISTORY_REVISION' OR l.source_history_revision_id IS DISTINCT FROM revision.id OR l.posted_at IS DISTINCT FROM r.completed_at)) THEN
    RAISE EXCEPTION 'Historical balance must equal current operation/key delta and effect count' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION naijue_erp.validate_history_numeric_balance_commit() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER history_numeric_balance_commit AFTER INSERT OR UPDATE ON naijue_erp.inventory_balance
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_history_numeric_balance_commit();

-- Original sparse validator is retained below with one finite HISTORY dispatch.
-- C applies only after reviewing the complete exact source and original target.
CREATE OR REPLACE FUNCTION naijue_erp.validate_sparse_balance_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; final_row naijue_erp.inventory_balance%ROWTYPE; baseline naijue_erp.inventory_ledger%ROWTYPE;
  b naijue_erp.import_batch%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; total numeric; effects bigint;
BEGIN
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = NEW.last_operation_id;
  IF r.target_type IN ('HISTORY_SALES','HISTORY_TRANSFER') THEN
    IF r.action<>'HISTORY_REVISE' OR NOT EXISTS(SELECT 1 FROM naijue_erp.history_revision x WHERE x.operation_id=r.id
      AND x.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN
      RAISE EXCEPTION 'Exact current historical revision required for sparse dispatch' USING ERRCODE='23514'; END IF;
    -- The installed history_numeric_balance_commit validates this exact key/operation.
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF r.target_type = 'IMPORT' THEN RAISE EXCEPTION 'an import receipt cannot overwrite existing stock' USING ERRCODE = '23514'; END IF;
    -- Preserve existing native SALES/TRANSFER transaction contracts and validators.
    RETURN NULL;
  END IF;
  IF r.target_type IN ('SALES', 'TRANSFER') THEN
    -- ONLY a first runtime approval may turn proven absence into an actual native balance.
    IF r.action <> 'APPROVE' OR r.status <> 'COMMITTED' OR NOT naijue_erp.inventory_runtime_key_admitted(NEW.warehouse_id, NEW.sku_id) THEN
      RAISE EXCEPTION 'first native balance requires published runtime approval' USING ERRCODE = '23514'; END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE status = 'IMPORTED' AND inventory_mode = 'CUTOFF_STOCK_BASELINE';
    IF b.completed_at IS NULL OR (b.checkpoint->>'sequence')::bigint <= 0
      OR b.checkpoint->'expected'->>'IMPORT_BATCH' IS DISTINCT FROM '1'
      OR b.checkpoint->'counts' IS DISTINCT FROM b.checkpoint->'expected'
      OR (b.checkpoint->>'cursor')::numeric IS DISTINCT FROM
        (b.checkpoint->'counts'->>'WAREHOUSE')::numeric + (b.checkpoint->'counts'->>'SKU')::numeric
        + (b.checkpoint->'counts'->>'INVENTORY_LEDGER')::numeric + (b.checkpoint->'counts'->>'IMPORT_BATCH')::numeric
      OR NOT EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id = b.id AND status = 'IMPORTED'
        AND target_type = 'IMPORT_BATCH' AND target_id = b.id AND source_entity_type = 'INVENTORY_SCOPE_APPROVAL'
        AND source_key = 'FINAL_COMPLETE_SCOPE'
        AND decision_reason = 'COMPLETE_SCOPE;ABSENT_IS_ZERO;ALL_FILES_VERIFIED;FINAL_DELTA_VERIFIED;NO_UNRESOLVED_EXCEPTIONS'
        AND source_record_hash = b.source_hash AND source_file_ref = b.source_manifest_ref) THEN
      RAISE EXCEPTION 'first native balance requires complete immutable publication' USING ERRCODE = '23514'; END IF;
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id = r.id;
    IF a.object_type IS DISTINCT FROM r.target_type OR a.object_id IS DISTINCT FROM r.target_id
      OR a.action IS DISTINCT FROM 'APPROVE' OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.new_version::text IS DISTINCT FROM r.result_data->>'version' OR a.old_version + 1 IS DISTINCT FROM a.new_version THEN
      RAISE EXCEPTION 'first native balance requires exact native receipt and audit' USING ERRCODE = '23514'; END IF;
    IF (r.target_type = 'SALES' AND NOT EXISTS (SELECT 1 FROM naijue_erp.sales_header h WHERE h.id = r.target_id
        AND h.stock_basis = 'RUNTIME_LEDGER' AND h.status = 'APPROVED' AND h.version = a.new_version))
      OR (r.target_type = 'TRANSFER' AND NOT EXISTS (SELECT 1 FROM naijue_erp.transfer_header h WHERE h.id = r.target_id
        AND h.stock_basis = 'RUNTIME_LEDGER' AND h.status = 'APPROVED' AND h.version = a.new_version)) THEN
      RAISE EXCEPTION 'first native balance cannot use cutoff history or another document' USING ERRCODE = '23514'; END IF;
    -- Prior used keys are retained by ledger_retains_balance. Never rebuild missing history from zero.
    IF EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id AND operation_id <> r.id)
      OR EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger l
        LEFT JOIN naijue_erp.sales_line sl ON sl.id = l.source_sales_line_id
        LEFT JOIN naijue_erp.transfer_line tl ON tl.id = l.source_transfer_line_id
        WHERE l.operation_id = r.id AND l.warehouse_id = NEW.warehouse_id AND l.sku_id = NEW.sku_id
          AND (l.event_kind <> 'APPROVE' OR l.reverses_entry_id IS NOT NULL OR l.source_import_batch_id IS NOT NULL
            OR l.source_document_version IS DISTINCT FROM a.new_version OR l.posted_at IS DISTINCT FROM r.completed_at
            OR (r.target_type = 'SALES' AND (sl.sales_id IS DISTINCT FROM r.target_id OR l.source_transfer_line_id IS NOT NULL))
            OR (r.target_type = 'TRANSFER' AND (tl.transfer_id IS DISTINCT FROM r.target_id OR l.source_sales_line_id IS NOT NULL)))) THEN
      RAISE EXCEPTION 'first native balance requires only exact new operation effects' USING ERRCODE = '23514'; END IF;
    -- Bounded CURRENT operation/key only, never a full-history SUM. Repeated real lines increment independently.
    SELECT COALESCE(SUM(quantity_delta::numeric), 0), COUNT(*) INTO total, effects FROM naijue_erp.inventory_ledger
      WHERE operation_id = r.id AND warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id;
    SELECT * INTO STRICT final_row FROM naijue_erp.inventory_balance WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id;
    IF effects = 0 OR final_row.quantity::numeric IS DISTINCT FROM total OR final_row.version::numeric IS DISTINCT FROM effects
      OR final_row.last_operation_id IS DISTINCT FROM r.id OR final_row.updated_at IS DISTINCT FROM r.completed_at THEN
      RAISE EXCEPTION 'first native balance must equal exact cumulative operation delta and effect count' USING ERRCODE = '23514'; END IF;
    RETURN NULL;
  END IF;
  IF r.target_type <> 'IMPORT' OR r.action <> 'IMPORT_CHUNK' THEN
    RAISE EXCEPTION 'unsupported fresh balance receipt' USING ERRCODE = '23514'; END IF;
  SELECT * INTO STRICT baseline FROM naijue_erp.inventory_ledger WHERE operation_id = r.id
    AND warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id AND event_kind = 'CUTOFF_BASELINE';
  SELECT * INTO STRICT final_row FROM naijue_erp.inventory_balance WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id;
  IF final_row.quantity IS DISTINCT FROM baseline.quantity_delta OR final_row.version <> 1
    OR final_row.last_operation_id IS DISTINCT FROM r.id OR final_row.updated_at IS DISTINCT FROM r.completed_at
    OR baseline.source_import_batch_id IS DISTINCT FROM r.target_id THEN
    RAISE EXCEPTION 'fresh baseline balance requires its exact nonzero real import effect' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;

-- No issuer/read purpose is widened here. C must export/review exact successor
-- metadata and independently opt into HISTORY_REVISION before mounting writes.

CREATE OR REPLACE FUNCTION naijue_erp.reject_unimplemented_cutoff_write() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.stock_basis = 'CUTOFF_HISTORY' THEN RAISE EXCEPTION 'historical command integration not implemented' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.stock_basis = 'CUTOFF_HISTORY' OR (TG_OP = 'UPDATE' AND OLD.stock_basis = 'CUTOFF_HISTORY') THEN
    RAISE EXCEPTION 'historical command integration not implemented' USING ERRCODE = '23514'; END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.responsible_staff_id IS NOT NULL AND NEW.status<>'DRAFT' THEN RAISE EXCEPTION 'Responsible staff is selected only on draft save' USING ERRCODE='23514'; END IF;
  ELSIF TG_OP='UPDATE' AND NEW.responsible_staff_id IS DISTINCT FROM OLD.responsible_staff_id THEN
    IF OLD.status<>'DRAFT' OR NEW.status<>'DRAFT' OR NEW.responsible_staff_id IS NULL THEN RAISE EXCEPTION 'Responsible change requires draft save and actual staff' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_sales_settlement() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE target uuid; h naijue_erp.sales_header%ROWTYPE; total numeric; count_rows bigint; evidence naijue_erp.audit_change%ROWTYPE; receipt naijue_erp.operation_receipt%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'sales_header' THEN target := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN target := OLD.sales_id;
  ELSE target := NEW.sales_id;
  END IF;
  SELECT * INTO STRICT h FROM naijue_erp.sales_header WHERE id = target;
  SELECT COUNT(*), COALESCE(SUM(CASE direction WHEN 'RECEIVE' THEN amount ELSE -amount END), 0)
    INTO count_rows, total FROM naijue_erp.sales_settlement WHERE sales_id = target;
  IF count_rows > 3 OR (h.status = 'APPROVED' AND total <> h.net_due) THEN
    RAISE EXCEPTION 'invalid final sales settlement count or approval equality' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME='sales_header' THEN
    IF TG_OP='INSERT' OR NEW.responsible_staff_id IS DISTINCT FROM OLD.responsible_staff_id THEN
      SELECT * INTO STRICT evidence FROM naijue_erp.audit_change WHERE object_type='SALES' AND object_id=NEW.id AND new_version=NEW.version;
      SELECT * INTO STRICT receipt FROM naijue_erp.operation_receipt WHERE id=evidence.operation_id;
      IF evidence.action<>'SAVE' OR receipt.action<>'SAVE' OR receipt.target_type<>'SALES' OR receipt.target_id<>NEW.id OR receipt.actor_account_id<>evidence.actor_account_id
        OR receipt.status<>'COMMITTED' OR receipt.result_data->>'version' IS DISTINCT FROM NEW.version::text
        OR evidence.after_values->'header'->'responsibleStaffId' IS DISTINCT FROM to_jsonb(NEW)->'responsible_staff_id' THEN
        RAISE EXCEPTION 'Responsible employee requires original SAVE audit and receipt' USING ERRCODE='23514'; END IF;
      IF TG_OP='UPDATE' AND (evidence.old_version IS DISTINCT FROM OLD.version OR evidence.before_values->'header'->'responsibleStaffId' IS DISTINCT FROM to_jsonb(OLD)->'responsible_staff_id') THEN
        RAISE EXCEPTION 'Responsible before value differs from actual old header' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.keep_transfer_header_provenance() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'retained transfer header cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF NEW.stock_basis <> 'RUNTIME_LEDGER' THEN
    RAISE EXCEPTION 'historical transfer writes are not enabled' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 1 OR NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'runtime transfer must start as version one draft' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR OLD.stock_basis <> 'RUNTIME_LEDGER'
      OR ROW(NEW.created_by_account_id, NEW.created_hall_id, NEW.created_role, NEW.created_at, NEW.stock_basis)
        IS DISTINCT FROM ROW(OLD.created_by_account_id, OLD.created_hall_id, OLD.created_role, OLD.created_at, OLD.stock_basis) THEN
      RAISE EXCEPTION 'immutable transfer identity or creator provenance' USING ERRCODE = '23514';
    END IF;
    IF NEW.version::bigint <> OLD.version::bigint + 1 OR OLD.status = 'VOID'
      OR (OLD.status = 'APPROVED' AND NEW.status <> 'DRAFT') THEN
      RAISE EXCEPTION 'invalid transfer version or state transition' USING ERRCODE = '23514';
    END IF;
    IF NOT (OLD.status = 'DRAFT' AND NEW.status = 'DRAFT')
      AND ROW(NEW.number, NEW.business_date, NEW.from_warehouse_id, NEW.to_warehouse_id, NEW.note)
        IS DISTINCT FROM ROW(OLD.number, OLD.business_date, OLD.from_warehouse_id, OLD.to_warehouse_id, OLD.note) THEN
      RAISE EXCEPTION 'posting actions cannot edit transfer business facts' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.responsible_staff_id IS NOT NULL AND NEW.status<>'DRAFT' THEN RAISE EXCEPTION 'Responsible staff is selected only on draft save' USING ERRCODE='23514'; END IF;
  ELSIF TG_OP='UPDATE' AND NEW.responsible_staff_id IS DISTINCT FROM OLD.responsible_staff_id THEN
    IF OLD.status<>'DRAFT' OR NEW.status<>'DRAFT' OR NEW.responsible_staff_id IS NULL THEN RAISE EXCEPTION 'Responsible change requires draft save and actual staff' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.transfer_header_audit_values(source_row naijue_erp.transfer_header) RETURNS jsonb LANGUAGE sql STABLE STRICT
SET search_path=pg_catalog,naijue_erp AS $$
  SELECT jsonb_build_object('number', (source_row).number, 'businessDate', to_char((source_row).business_date, 'YYYY-MM-DD'),
    'fromWarehouseId', (source_row).from_warehouse_id, 'toWarehouseId', (source_row).to_warehouse_id,
    'status', (source_row).status, 'version', (source_row).version, 'note', (source_row).note, 'responsibleStaffId',(source_row).responsible_staff_id);
$$;

COMMIT;
