-- Approved v15: CATEGORY.REORDER / UNDO_REORDER only. SOURCE ONLY; C is the actual executor.
-- Exact predecessor is schema 1..26: original v14/123, or proven v16-from-v14/129.
-- The latter preserves v16 and yields the existing v16-from-v15/130 routine profile. Old migrations remain immutable.
-- No table, column, index, enum, FK, trigger or generic write authority is added.
BEGIN;
DO $$
DECLARE required record; routine_count integer;
BEGIN
 SELECT count(*) INTO routine_count FROM pg_catalog.pg_proc WHERE pronamespace='naijue_erp'::regnamespace AND prokind IN ('f','p');
 IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26]
  OR routine_count NOT IN (123,129)
  OR to_regprocedure('naijue_erp.maintenance_check_category_order(naijue_erp.audit_change)') IS NOT NULL THEN
  RAISE EXCEPTION 'Exact v14 or proven v16-from-v14 predecessor required for category order v15' USING ERRCODE='23514';
 END IF;
 -- Reverse installation order is accepted only for the complete observed v16
 -- predecessor routine set, not any schema26 database with 129 functions.
 IF routine_count=129 THEN
  FOR required IN SELECT * FROM (VALUES
   ('naijue_erp.assert_core_initialization_v14(uuid,uuid,boolean)','5ca42bcac20e7ad3affb3ac09829fd27c481752a303b1090133f23ecee3ad99d'),
   ('naijue_erp.assert_history_typed_closure(uuid,jsonb,jsonb)','8556e917e6a251dd1eb97974fbb6f793d3e46a1ef10f6ef7fd77fb7ad539d00f'),
   ('naijue_erp.assert_native_bootstrap_accounts(uuid)','171c59ba962a287dd02bb9eac993512e114783a470063108a07ba5e206cbabca'),
   ('naijue_erp.assert_native_product_season_source(naijue_erp.import_source_row)','3a753b412fa4a648e26c4a2e398a4b52cc694c04dc1352a98513cb2220d4d661'),
   ('naijue_erp.assert_retained_sku_reference(uuid)','4c956a82b9531b1f385f9aecd9c6d20fa84ce6d434bb0a41d2a0c96ebb7fae5d'),
   ('naijue_erp.assign_runtime_document_number()','bca336abcd0ef4a57c22d2ee19564e7ea744257303fb8eec06c822efd551500e'),
   ('naijue_erp.check_hall_default_customer_enabled()','6a89df4342530f3a3bdd185abbdd372b3372799b341a17ae9ad65be86ded91ee'),
   ('naijue_erp.cutoff_import_lock()','82a621b9cea39c9cc273d5cb790b364fad004875760644633280d2e24e64ccc7'),
   ('naijue_erp.exact_historical_customer_source_matches(jsonb,jsonb)','ac26aa52f4131d996d6abe0db810a0e0817a12ffa043cdfb2250c951bfd0f011'),
   ('naijue_erp.freeze_cutoff_sales_detail()','dcfa1a3abb87368cf2f18663880f9a2ea9377a3599e985e13c7241220fd85a12'),
   ('naijue_erp.freeze_imported_identity()','0a17cf0a670ca8c9d34f2de1ec34de9b5197410fc01f82af4273a26e877a44e5'),
   ('naijue_erp.guard_balance_identity()','02f2db383ff8c5826c7148f73bb780319c977bffa5798bc233159d83d89e58fc'),
   ('naijue_erp.guard_contributor_link()','2937ecd3e974e2ad78e0bfce4790b96d97953d4bf113406a838063b366895983'),
   ('naijue_erp.guard_cutoff_ledger()','71ecb569279de61709578ffe2f29d85140993ed155fce07e7beb797307c491b5'),
   ('naijue_erp.guard_exact_historical_customer_current_usage()','78e895d72d6f806089d2bc7cb877293e1263d26ba8265dd7f3b5e2203e956245'),
   ('naijue_erp.guard_header_native_reference()','1584d2600c763f0d38cd3dd4fa7dd14ea90465ef9376d7165a58d71bce0dec3c'),
   ('naijue_erp.guard_header_native_reference_publication()','3419f73d296fcb84f77eff79edaa5034cb90f33a6363d0687d316ee697f785c0'),
   ('naijue_erp.guard_history_closure_stage()','d05947c6d7ef430d043c10038cce1d72f7e44e4efb2a2112c499ea8d107d47e0'),
   ('naijue_erp.guard_history_insert()','bbd40680f3196904c9c9e986c6f8cef0bee77c4cbb19663b8333e8b6150e1f2f'),
   ('naijue_erp.guard_history_numeric_ledger()','b32ccd2af06876d91fe4b33a4e2309a3f79af7d012ddf301ce84b773118e5794'),
   ('naijue_erp.guard_history_publication()','6ad32797b7fe81e6427b3abec90aca378778be9af30b014b55966fbed0bff77e'),
   ('naijue_erp.guard_history_typed_publication()','fc386026e40ca43d36bdb5e7422001878a7f91c95c2e36bce28272b4d792e506'),
   ('naijue_erp.guard_import_accounting_claim()','298996ca170c969aa06df8dfa44219b86a9db0ae4dc1c07f726167a518f62acf'),
   ('naijue_erp.guard_import_accounting_publication()','b41ad04a99fb7af999c22b13cdc7ad9b747e4df67e3f11bd44e7632d15a747a6'),
   ('naijue_erp.guard_import_batch()','f0e35d2d5978c92d26c1eab6525a87d2ae3450a525daa14131b479b03856d29a'),
   ('naijue_erp.guard_import_record()','8a79dbc011cdaf0582e2bd1eefc7ea94fce15d24f6aa1ac0fa25c43afb4e7e16'),
   ('naijue_erp.guard_maintenance_account_event()','965d9d3433b929ccd151b9a147eeef713770d7b7311e49c80cfaa3d17b118549'),
   ('naijue_erp.guard_maintenance_audit_actor()','ac0ce9c91f34b9d8d34eb5e7d26f595319bfa6ad3dfe3ae33a4f2f5edf1eb217'),
   ('naijue_erp.guard_maintenance_before_root()','574add1ad436482c7593725ac4b1b58cabe6b982b538cf0e1f22c1783723712f'),
   ('naijue_erp.guard_maintenance_child_write()','a19def51718e008e541482dd1e6f2d2ab9257842ce7e66ad6e62aedcfa216d8a'),
   ('naijue_erp.guard_native_catalogue_binding()','7418579c0d1c3a1951696a12ad165a421d26b87f0e449d9d7d250497dc2ddc21'),
   ('naijue_erp.guard_native_catalogue_publication()','d2eaa009760d63f245d562570ca4c8fce038633da5233a8c7ab7142190a30ceb'),
   ('naijue_erp.guard_native_creation_identity()','4827b76ff4df9beae18411033d2e6e13a04eea2d648aa58bb67d179145d107dc'),
   ('naijue_erp.guard_native_party_import_intent()','262e74a37ba12883a4978c4d99b6ecca000d245186b585a9e5b35ad31ccf8d7f'),
   ('naijue_erp.guard_native_payment_binding()','774cc9b1604a8d0948f73c7298fa67a10233962af218b89fe0b9675107148d35'),
   ('naijue_erp.guard_native_payment_publication()','993b114dfbec87428a42a9f6aa7d0a6ecbeef67fd85bc00754fa4eb80c7e6797'),
   ('naijue_erp.guard_product_image_color()','a49cc6bc4c49931eb50c81dd95e08a760b2ea6de73e19a0496611fe63fe22b18'),
   ('naijue_erp.guard_product_season_selection()','bd97ac1bc0a8c9a3221c12b794f5976bf0e092a2907aa2dd9e6378b718d29560'),
   ('naijue_erp.guard_referenced_season_identity()','8eb0b3435f063f4a653c31f632fe6751fecc3864a375a72753bcf4090bb18f2c'),
   ('naijue_erp.guard_retained_catalogue_delete()','dec785b8b1f818b2daa3af4d3872139710cae32178516839e669f59aa6609758'),
   ('naijue_erp.guard_retained_catalogue_reference()','91cc169d60ca6db2700ed97e49632504cfba9d957ea467a4777137f946c6923c'),
   ('naijue_erp.guard_runtime_document_number()','52d92723d9ecb5f16eb57c5ae50e0f8cf322b4b5f3848ab88712f41aeb0887bd'),
   ('naijue_erp.guard_successor_publication26()','a055abd422ff4d81d0cf87e11cf659dcc221eda1a18b774cd62034c2c3f74c14'),
   ('naijue_erp.guard_successor_source26()','cdf91a3949d6aefbb16c67f7d82dcf99b60730f9a6884468c064102c9887b710'),
   ('naijue_erp.history_closure_count_map(jsonb,text[])','ef82c0a7124d288103df38503a849b96aa936289b2ee29166b4f0a6529f476d6'),
   ('naijue_erp.history_closure_digest(uuid,text,text,text,uuid,jsonb)','749101b8670e32814b875adaaf753da6c50ddcd0860d5ca3ebb000f996f1b63b'),
   ('naijue_erp.history_closure_document_rows(uuid,text,uuid,boolean)','f8401b06df7815f63f9a83e781961f55725f82246c87d86b7a99a9c19c482ce1'),
   ('naijue_erp.history_closure_encode(jsonb,integer)','b4ad51b2b17c9248c80de0ead3ae5f50bf5fe887e36597b081ce250a94623a5c'),
   ('naijue_erp.history_closure_finish(text,bigint,bytea)','94b84af2d05d8a9f34c0135a8c0d70f5b633a9b43e6ec6d2bca8de554e8abac8'),
   ('naijue_erp.history_closure_fold(bytea,text)','31ed823c127e85537196de072b76077749d939f3241fa53b9f1c76f8fdba9062'),
   ('naijue_erp.history_closure_projection(text,jsonb)','0af6d70c56a463c351be1dd732d345bbb533ae98b0b07e36f6ef08a4efd72011'),
   ('naijue_erp.history_closure_projection_columns(text)','a8a3d4d43341d86dfad188d191c3076203e06ea8f1a6919c4d0efddee76286a6'),
   ('naijue_erp.history_closure_projection_key(text,jsonb)','6e2584dac9f079fe2061570c15b13549a3abac512a2a809835046e6fe2c50222'),
   ('naijue_erp.history_closure_row_hash(text,text,jsonb)','c7ef0fdc273f23ab5ec1ae6c870746146dab90a6ecef8ecf319de0704df697bb'),
   ('naijue_erp.history_closure_rows(uuid)','098ba7215c7c893903e2b72762e2036e94bc23b763f3842e378b3d55b3d3f639'),
   ('naijue_erp.history_closure_seed(text)','532918606a4dd24ebae46a55dfe7d2f0803602798c63742bcd975b7e1179f2c7'),
   ('naijue_erp.history_effective_writes_closed()','c06027597f11a9cf7f2ae06bf5e47e5c21349b54851fb21df6895ef22a2855b7'),
   ('naijue_erp.history_numeric_current_facts(text,uuid)','dadecb6cce657834ce3719eb339f56f95dbbf27d6e0a92216940ed91697cadc8'),
   ('naijue_erp.history_numeric_money(jsonb,boolean)','8c588f3b6145cb1609898dd46e3abfb7b1bd37b3b9318f1863dcfac530ee200b'),
   ('naijue_erp.history_revision_not_enabled()','1e69497d7023ab61fdac15e358707c9b9b73b7f3b281a01c306c2fd25d3c985c'),
   ('naijue_erp.import_source_key_lock(text,text,text)','07404b25633a5c48ae1a530a48cdebed11107e187d660c99a7e781bb4957fa24'),
   ('naijue_erp.inventory_key_admission(uuid,uuid)','a9d7a2519941605e997e5ab59cff7cf847192ed910ef4107ba09aadc64e0fc7a'),
   ('naijue_erp.inventory_key_lock(uuid,uuid)','c6f444fbbfc527fec7f4031fd0ea7f07eb0a98202b11340e8f7da398fa117079'),
   ('naijue_erp.inventory_runtime_key_admitted(uuid,uuid)','945a2cc1e250ed1cedd3ca2083b80120174d06d015455bd4288d186e0c27f377'),
   ('naijue_erp.is_exact_historical_customer_only(uuid)','1f35799a742f402d86cde6a979511dc83ae74d62cd5c106ffcef162a68510403'),
   ('naijue_erp.is_native_party_import_insert(text,jsonb)','a3c8dfac77e8a4f060932aded92f53da97b68bdcf48d2ede19781c3e54c86412'),
   ('naijue_erp.keep_barcode_binding_identity()','14f6d02bca58955681e8d03236fb236cbfe3d041d35ecdb326cd3fa7e38d2733'),
   ('naijue_erp.keep_party_native_identity()','44c3a7110bf40ef38e73972b493f36279b28124097b31a9a6f25e5adc13ad4b9'),
   ('naijue_erp.keep_sales_line_owner()','95f3dc678bbdc8ac47a2f1c76fe13f872bed088e7484aebc46a523fc13cfd241'),
   ('naijue_erp.keep_transfer_header_provenance()','68d1af54e61704be47e9fe4097592e812d3f7a910dc2d7190351c2b427267bf6'),
   ('naijue_erp.keep_transfer_line_owner()','763d52e081f96f872adb50658403f5f2f7f83f7c914d002b0e771ebe9c055335'),
   ('naijue_erp.maintenance_account_credential_action(naijue_erp.audit_change,uuid)','f17617bc8f02fd0731d0a97eaca90553441235e032de1dbf9086e84c987fbe7a'),
   ('naijue_erp.maintenance_action_allowed(text,text)','186f88822ba597874734cb3349d0b9d95f63e5f8d8a34d3d05014e3420033c17'),
   ('naijue_erp.maintenance_administrator_mutex()','d6809b2abf7b3f211cd7422b517e867d0c1378f9e7fe9b98eacde2521c6d1ea8'),
   ('naijue_erp.maintenance_audit_is_current(uuid)','4537d6df2b73e17e386b100845049da08d3fab3584c87ef8d7095660198bf699'),
   ('naijue_erp.maintenance_check_account_credential(naijue_erp.audit_change,jsonb,jsonb)','577bf0a5de72c8dc6d080c1b4f18a669398d5738c16b75d11ecc1c89d0156ab7'),
   ('naijue_erp.maintenance_check_product_children(naijue_erp.audit_change,boolean)','c7edab87301fc05b7f33db2eb9df30b2da0d28ed9154dfa8d11cbba9fdbe6dad'),
   ('naijue_erp.maintenance_check_staff_accounts(naijue_erp.audit_change,jsonb,jsonb,boolean)','ea4e151ccb89d97ed40edc6e3164594bccda0fc28f2879f614f230830fdc0c22'),
   ('naijue_erp.maintenance_complete_row_matches(jsonb,jsonb)','34c25d78bc34ed57b1acbbdbfbca9b0adfd78dc8dcb6cc8c42cf5673f5da5d21'),
   ('naijue_erp.maintenance_evidence_matches(jsonb,jsonb)','cb201d859235d7af9ef52616c64b705e5586b11894d57fbc50b2b0a7615abaf3'),
   ('naijue_erp.maintenance_exact_rows_match(jsonb,jsonb,text)','8b21824423a27f20074768c09998fba819887c949b4f20b57e35db0815133161'),
   ('naijue_erp.maintenance_payment_halls(uuid)','d96c975c57af714d458275a383e0e2bdaeef9214d4bc64420207f36bcea55869'),
   ('naijue_erp.maintenance_product_child_row(text,uuid,uuid)','69145227348d366932814f079f0b63d1bb6109cc36d8bb8c9f8ae53fafd1b9fa'),
   ('naijue_erp.maintenance_root_table(text)','7ed286cf1e5bb8629b02e7cab4412dc0df502d560661be9823d234c466565fe3'),
   ('naijue_erp.maintenance_staff_accounts(uuid)','a191dc7b42cec0f41f42c6d371a2e959c90019983f4f79cef86db99d2e8fa989'),
   ('naijue_erp.native_creation_operation_valid(text,uuid,uuid)','118bbe55c39e00948ab087f808812522b565344b924e64916f6cfa91645a3f7a'),
   ('naijue_erp.party_key_values(text,text,boolean,integer)','d23eb5601f984007df5d52661a101a422852e20c0bcd75f1cadd5a5bbbaef649'),
   ('naijue_erp.published_inventory_key(uuid,uuid)','fa8234711ad74b3afd250b2143840baa863f05f1e23c92b85574b48b4208adc6'),
   ('naijue_erp.reject_immutable_change()','3daef49e525ad973be82350a1551e979198d21ff58f3f1bb92a4f7292e4d038c'),
   ('naijue_erp.reject_unimplemented_cutoff_write()','2e108a1bd9e9304f63cde9eb8b726c448ebcb2d2b371f8b3a8a41aebb6d21e0a'),
   ('naijue_erp.safe_maintenance_evidence(jsonb,integer)','4a0d9d21eadf3e839d1d0c23f7efe8a0ef14123dd521a553eefcc7362ab3f927'),
   ('naijue_erp.transfer_header_audit_values(naijue_erp.transfer_header)','0c92b020490243f55132a5acb15ecee8caca92fb88db5f75e877e2f2430ec8ad'),
   ('naijue_erp.transfer_line_audit_values(naijue_erp.transfer_line)','ce924832c6a9b4a762ff80e031279273f521e4e17139c7d89a4930004313f49e'),
   ('naijue_erp.valid_history_counts(jsonb)','6c143e2bf81bcd53e2c9074aa2ab4e1781c746bc7a99bb0064f378f77de80280'),
   ('naijue_erp.valid_product_season_ids(uuid[])','b6b3932264857c59998025cece6241a4e819b80f9bc72e6bf0ed4e907890cc65'),
   ('naijue_erp.validate_available_administrator_commit()','3a9a1bea930614761185af90b8591a539b855647974b68b004869c80f5e5ba18'),
   ('naijue_erp.validate_baseline_source_commit()','ec5e9a331d0f8148ec21e28d5e8a4ddb82ac66d923ea2490abee3f3000ed75c9'),
   ('naijue_erp.validate_document_specification_commit()','b02bff6115bcf2c87758f8313a57a1a693733ba3ea192fcb1657bd176c587c06'),
   ('naijue_erp.validate_exact_historical_customer_intent(naijue_erp.native_party_import_evidence,naijue_erp.import_batch)','b9968150e138d455658dd7d437c8026b7bfdce466146b961d64fd2934f099c98'),
   ('naijue_erp.validate_exact_native_reversal()','3ef72272c6cb9b7ccbfffc393a31fdd85babdb3efb333baae839482d571f362e'),
   ('naijue_erp.validate_history_closure_commit()','e61d2c5dd34792f5ca277cada1dc12a6904b1be95031c0a6c4810080b24dd03b'),
   ('naijue_erp.validate_history_numeric_balance_commit()','fab0bf7a3f1681d6034b09dbb5c7ad8efa606c6fa82f24fc101bc5b70636a837'),
   ('naijue_erp.validate_history_numeric_receipt_commit()','e69f92651dc7a8313e354d47bd4f1ffc1c97fb30aa5c56dcfc49f69511a1d7d6'),
   ('naijue_erp.validate_history_numeric_revision_commit()','6cc941ed8ea63927fea7f372da6477c5def8e809a8dde1c348d07331ff9be0b6'),
   ('naijue_erp.validate_history_product_proofs(uuid)','dab49bb495de85d5e66350affd348f85e0595411ea7ab7378104a3963db2a38e'),
   ('naijue_erp.validate_import_accounting_baseline_commit()','678cc0b409e43e420365733b21ce8e8ce0aa88b8d3b9b48f9a842edd41120c51'),
   ('naijue_erp.validate_import_accounting_checkpoint_commit()','edef6846035f1780c632183b32f81b63919cae4703a78c4bc21c44c507441f47'),
   ('naijue_erp.validate_import_accounting_claim_commit()','ad8e19c3f36b85ebbda107a2ca8e3c00ad10ca3005a232bd033bbab7613be756'),
   ('naijue_erp.validate_import_accounting_final_record_commit()','f1fca00daa56873221062706d2009293b6180156e69bfe6f5fc1ca64087ea312'),
   ('naijue_erp.validate_import_batch_commit()','dc2e8d344085056b53469be394eb9ced344db510bf6f6dc5576f4b0a9ea20140'),
   ('naijue_erp.validate_import_operation()','6ffc2561abe1bd4ff7465c82143c155bcaa0ad311b90f6679bef10ceae30c62f'),
   ('naijue_erp.validate_import_publish(uuid,jsonb)','873d1943b1ada13eeef43f6d28cb792755de48c461b1ebee7810e5278cd5d6e3'),
   ('naijue_erp.validate_import_source_commit()','524ec70d51970cfc79f4ec5e9a93f21bf20733781a2202121a4e91d1d6b66f3a'),
   ('naijue_erp.validate_ledger_receipt_source()','26f2f325172ef2878d4dffb4f1740d680e63458abd4b25e7a693e352664d15da'),
   ('naijue_erp.validate_maintenance_receipt_commit()','7a42aeef2738c9009bc9eaa4ecbf41feefb43b759fbed2514a005166d20ac384'),
   ('naijue_erp.validate_maintenance_root_commit()','8556d1ed234adb3bae1d99c9bb8e867db4070eadafa39dbb8b31752c7e24b512'),
   ('naijue_erp.validate_native_creation_commit()','a505ceb68946cc14a69b181cd43d6cebbedca9e9ea453c9920c243892f537cd7'),
   ('naijue_erp.validate_native_party_import_commit()','5383c9941e06c7748af6603eee56559b102b09305c11771a813c6cf859ad37e3'),
   ('naijue_erp.validate_party_native_commit()','dba217f39c61d3f4741a72a565851a41caaa18e44fb57aa2f8e3473d20810762'),
   ('naijue_erp.validate_party_receipt_commit()','fafc3389b3458b6d8ec4cad15f6f926dcc20bb059a819c496ed4db260d06b426'),
   ('naijue_erp.validate_sales_commit()','f00b31849f4f72d62103fc08cb4e157b4401717a1f2c7c05fc699663715f07a2'),
   ('naijue_erp.validate_sales_effect()','e6b2bbec00a6389ed92f9026af20f06c52168d37fe5a59d3ccfc0c29fb7cb1db'),
   ('naijue_erp.validate_sales_settlement()','c0ab9b6a91951a809e5fbfb6c34ed52fb164b76119d58d469d411c0b58e734a3'),
   ('naijue_erp.validate_sparse_balance_commit()','937b31d7ab0f1e5d8fb7febc26c051690b2df9dc79d451088eff73d75046399d'),
   ('naijue_erp.validate_transfer_balance_commit()','9bfaa1cdf1dea76ada35bae56dd40cb3e27c6acd28a93905ee2f06d17a8b2abb'),
   ('naijue_erp.validate_transfer_commit()','e6ceac3fddef4e61f649b8ef2d71db56042dc14c7622ca0a5c321de2ab7b3f38'),
   ('naijue_erp.validate_transfer_effect()','d901f8e428c9ef2440d9fb48aca3f638eef141bd62f116e88698c6f726ad0c73'),
   ('naijue_erp.validate_transfer_header_commit()','6d50fa80e2b445bc45645ff0f5592f2ed4e00836077224c1fe3510b4e563fa0c'),
   ('naijue_erp.validate_transfer_line_commit()','1443f443a884f0073209294476daf9a7ff0f45d6d32832e5d14557d513cfc4fb')
  ) p(signature,sha256) LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure(required.signature)
     AND encode(pg_catalog.sha256(convert_to(prosrc,'UTF8')),'hex')=required.sha256) THEN
    RAISE EXCEPTION 'Exact v16-from-v14 predecessor routine differs: %',required.signature USING ERRCODE='23514';
   END IF;
  END LOOP;
  FOR required IN SELECT * FROM (VALUES
   ('sales_header','sales_responsible_staff_fk'),('transfer_header','transfer_responsible_staff_fk')
  ) p(table_name,constraint_name) LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a
     WHERE a.attrelid=to_regclass('naijue_erp.'||required.table_name) AND a.attname='responsible_staff_id'
       AND a.atttypid='uuid'::regtype AND NOT a.attnotnull AND NOT a.attisdropped
       AND NOT a.atthasdef AND a.attgenerated='' AND a.attidentity='')
     OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c
       WHERE c.conrelid=to_regclass('naijue_erp.'||required.table_name) AND c.conname=required.constraint_name
         AND c.contype='f' AND c.convalidated AND NOT c.condeferrable
         AND c.confrelid='naijue_erp.staff'::regclass AND c.confupdtype='a' AND c.confdeltype='a'
         AND c.conkey=ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
           WHERE attrelid=c.conrelid AND attname='responsible_staff_id' AND NOT attisdropped)]::smallint[]
         AND c.confkey=ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
           WHERE attrelid=c.confrelid AND attname='id' AND NOT attisdropped)]::smallint[]) THEN
    RAISE EXCEPTION 'Exact v16 responsible column and foreign key required' USING ERRCODE='23514';
   END IF;
  END LOOP;
 END IF;
 FOR required IN SELECT * FROM (VALUES
  ('maintenance_action_allowed(text,text)','186f88822ba597874734cb3349d0b9d95f63e5f8d8a34d3d05014e3420033c17'),
  ('validate_maintenance_receipt_commit()','7a42aeef2738c9009bc9eaa4ecbf41feefb43b759fbed2514a005166d20ac384'),
  ('validate_maintenance_root_commit()','8556d1ed234adb3bae1d99c9bb8e867db4070eadafa39dbb8b31752c7e24b512'),
  ('assert_core_initialization_v14(uuid,uuid,boolean)','5ca42bcac20e7ad3affb3ac09829fd27c481752a303b1090133f23ecee3ad99d')
 ) p(signature,sha256) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('naijue_erp.'||required.signature)
    AND encode(pg_catalog.sha256(convert_to(prosrc,'UTF8')),'hex')=required.sha256) THEN
   RAISE EXCEPTION 'Category order predecessor routine differs' USING ERRCODE='23514';
  END IF;
 END LOOP;
END $$;

CREATE FUNCTION naijue_erp.maintenance_check_category_order(a naijue_erp.audit_change) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,naijue_erp AS $$
#variable_conflict use_column
DECLARE r naijue_erp.operation_receipt%ROWTYPE; original_r naijue_erp.operation_receipt%ROWTYPE; original_a naijue_erp.audit_change%ROWTYPE;
 actor record; before_order jsonb; after_order jsonb; metadata jsonb; member jsonb; old_member jsonb; new_member jsonb;
 original_before jsonb; original_after jsonb; expected_result jsonb; actual_rows jsonb; result_members jsonb;
 parent uuid; moved uuid; undo_of uuid; previous_id text; old_ids text[]; new_ids text[]; changed_ids uuid[]; written_ids uuid[];
 current_xid bigint:=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint; audit_command bigint; n integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:catalogue-maintenance',0));
 IF (a.object_type='CATEGORY' AND a.action IN ('REORDER','UNDO_REORDER') AND a.old_version IS NOT NULL
   AND a.new_version::bigint=a.old_version::bigint+1 AND naijue_erp.maintenance_audit_is_current(a.operation_id)
   AND jsonb_typeof(a.before_values)='object' AND a.before_values ?& ARRAY['version','display_order','category_order']
   AND a.before_values-ARRAY['version','display_order','category_order']='{}'::jsonb
   AND jsonb_typeof(a.after_values)='object' AND a.after_values ?& ARRAY['version','display_order','category_order']
   AND a.after_values-ARRAY['version','display_order','category_order']='{}'::jsonb
   AND a.before_values->'version'=to_jsonb(a.old_version) AND a.after_values->'version'=to_jsonb(a.new_version)
   AND naijue_erp.safe_maintenance_evidence(a.before_values) AND naijue_erp.safe_maintenance_evidence(a.after_values)) IS NOT TRUE THEN
  RAISE EXCEPTION 'Exact current category aggregate audit required' USING ERRCODE='23514';
 END IF;
 SELECT cmin::text::bigint INTO STRICT audit_command FROM naijue_erp.audit_change WHERE operation_id=a.operation_id;
 IF (SELECT count(*) FROM naijue_erp.audit_change WHERE xmin::text::bigint=current_xid)<>1
  OR (SELECT count(*) FROM naijue_erp.operation_receipt WHERE xmin::text::bigint=current_xid)<>1 THEN
  RAISE EXCEPTION 'One category operation audit and receipt per transaction required' USING ERRCODE='23514';
 END IF;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
 IF (r.target_type='CATEGORY' AND r.action=a.action AND r.target_id=a.object_id AND r.actor_account_id=a.actor_account_id
   AND r.status='COMMITTED' AND r.completed_at=a.occurred_at
   AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=r.id AND xmin::text::bigint=current_xid)) IS NOT TRUE THEN
  RAISE EXCEPTION 'Category operation receipt must close its same transaction audit' USING ERRCODE='23514';
 END IF;
 SELECT u.login_enabled,s.role,s.employment_status,s.hall_id INTO STRICT actor
  FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id WHERE u.id=a.actor_account_id FOR SHARE OF u,s;
 IF actor.login_enabled IS NOT TRUE OR actor.employment_status IS DISTINCT FROM '在职' OR actor.role NOT IN ('ADMIN','WAREHOUSE') THEN
  RAISE EXCEPTION 'Current category order authority unavailable' USING ERRCODE='42501';
 END IF;
 IF actor.hall_id IS NOT NULL THEN
  PERFORM 1 FROM naijue_erp.hall WHERE id=actor.hall_id AND enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current actor hall unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 before_order:=a.before_values->'category_order'; after_order:=a.after_values->'category_order';
 FOREACH metadata IN ARRAY ARRAY[before_order,after_order] LOOP
  IF (jsonb_typeof(metadata)='object' AND metadata ?& ARRAY['parent_id','moved_id','undo_of_operation_id','rows']
    AND metadata-ARRAY['parent_id','moved_id','undo_of_operation_id','rows']='{}'::jsonb
    AND (metadata->'parent_id'='null'::jsonb OR (jsonb_typeof(metadata->'parent_id')='string' AND (metadata->>'parent_id')::uuid::text=metadata->>'parent_id'))
    AND jsonb_typeof(metadata->'moved_id')='string' AND (metadata->>'moved_id')::uuid::text=metadata->>'moved_id'
    AND (metadata->'undo_of_operation_id'='null'::jsonb OR (jsonb_typeof(metadata->'undo_of_operation_id')='string' AND (metadata->>'undo_of_operation_id')::uuid::text=metadata->>'undo_of_operation_id'))
    AND jsonb_typeof(metadata->'rows')='array' AND jsonb_array_length(metadata->'rows') BETWEEN 2 AND 5000) IS NOT TRUE THEN
   RAISE EXCEPTION 'Closed complete category sibling metadata required' USING ERRCODE='23514';
  END IF;
  previous_id:=NULL;
  FOR member IN SELECT value FROM jsonb_array_elements(metadata->'rows') LOOP
   IF (jsonb_typeof(member)='object' AND member ?& ARRAY['id','version','display_order'] AND member-ARRAY['id','version','display_order']='{}'::jsonb
     AND jsonb_typeof(member->'id')='string' AND (member->>'id')::uuid::text=member->>'id'
     AND (previous_id IS NULL OR previous_id COLLATE "C" < (member->>'id') COLLATE "C")
     AND jsonb_typeof(member->'version')='number' AND member->>'version' ~ '^[1-9][0-9]*$' AND (member->>'version')::numeric BETWEEN 1 AND 2147483647
     AND jsonb_typeof(member->'display_order')='number' AND member->>'display_order' ~ '^-?(0|[1-9][0-9]*)$'
     AND (member->>'display_order')::numeric BETWEEN -2147483648 AND 2147483647) IS NOT TRUE THEN
    RAISE EXCEPTION 'Canonical unique bounded category sibling rows required' USING ERRCODE='23514';
   END IF;
   previous_id:=member->>'id';
  END LOOP;
 END LOOP;
 IF before_order-'rows' IS DISTINCT FROM after_order-'rows' OR jsonb_array_length(before_order->'rows')<>jsonb_array_length(after_order->'rows') THEN
  RAISE EXCEPTION 'Category sibling identity and parent cannot change' USING ERRCODE='23514';
 END IF;
 parent:=(after_order->>'parent_id')::uuid; moved:=(after_order->>'moved_id')::uuid; undo_of:=(after_order->>'undo_of_operation_id')::uuid;
 IF (a.action='REORDER') IS DISTINCT FROM (undo_of IS NULL) OR undo_of=a.operation_id THEN
  RAISE EXCEPTION 'Category action and original undo operation differ' USING ERRCODE='23514';
 END IF;
 changed_ids:=ARRAY[]::uuid[];
 FOR n IN 0..jsonb_array_length(after_order->'rows')-1 LOOP
  old_member:=before_order->'rows'->n; new_member:=after_order->'rows'->n;
  IF old_member->'id' IS DISTINCT FROM new_member->'id'
    OR (new_member->>'version')::bigint<>(old_member->>'version')::bigint+(CASE WHEN old_member->'display_order' IS DISTINCT FROM new_member->'display_order' THEN 1 ELSE 0 END) THEN
   RAISE EXCEPTION 'Changed category rows advance exactly once; all siblings retained' USING ERRCODE='23514';
  END IF;
  IF old_member->'display_order' IS DISTINCT FROM new_member->'display_order' THEN changed_ids:=array_append(changed_ids,(new_member->>'id')::uuid); END IF;
  IF new_member->>'id'=a.object_id::text AND (old_member->'version' IS DISTINCT FROM to_jsonb(a.old_version)
    OR new_member->'version' IS DISTINCT FROM to_jsonb(a.new_version)
    OR old_member->'display_order' IS DISTINCT FROM a.before_values->'display_order'
    OR new_member->'display_order' IS DISTINCT FROM a.after_values->'display_order') THEN
   RAISE EXCEPTION 'Category anchor sparse values differ from its exact member' USING ERRCODE='23514';
  END IF;
 END LOOP;
 IF cardinality(changed_ids)=0 OR NOT a.object_id=ANY(changed_ids)
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(after_order->'rows') m WHERE m->>'id'=moved::text) THEN
  RAISE EXCEPTION 'Actual changed category anchor and moved member required' USING ERRCODE='23514';
 END IF;
 SELECT array_agg(m->>'id' ORDER BY (m->>'display_order')::integer,(m->>'id') COLLATE "C") INTO old_ids FROM jsonb_array_elements(before_order->'rows') m;
 SELECT array_agg(m->>'id' ORDER BY (m->>'display_order')::integer,(m->>'id') COLLATE "C") INTO new_ids FROM jsonb_array_elements(after_order->'rows') m;
 IF a.action='REORDER' THEN
  IF a.object_id<>changed_ids[1] OR old_ids=new_ids OR array_remove(old_ids,moved::text) IS DISTINCT FROM array_remove(new_ids,moved::text)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(after_order->'rows') m WHERE (m->>'display_order')::integer<>array_position(new_ids,m->>'id')-1) THEN
   RAISE EXCEPTION 'Only the selected sibling may move into contiguous complete order' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT * INTO STRICT original_r FROM naijue_erp.operation_receipt WHERE id=undo_of;
  SELECT * INTO STRICT original_a FROM naijue_erp.audit_change WHERE operation_id=undo_of;
  original_before:=original_a.before_values->'category_order'; original_after:=original_a.after_values->'category_order';
  IF (original_r.target_type='CATEGORY' AND original_r.action='REORDER' AND original_r.status='COMMITTED'
    AND original_r.actor_account_id=a.actor_account_id AND original_r.target_id=a.object_id
    AND original_a.object_type='CATEGORY' AND original_a.action='REORDER' AND original_a.object_id=a.object_id
    AND original_a.actor_account_id=a.actor_account_id AND original_a.occurred_at=original_r.completed_at
    AND original_before-'rows'=original_after-'rows' AND original_after->'undo_of_operation_id'='null'::jsonb
    AND original_after->'parent_id'=after_order->'parent_id' AND original_after->'moved_id'=after_order->'moved_id'
    AND before_order->'rows'=original_after->'rows'
    AND jsonb_array_length(original_before->'rows')=jsonb_array_length(after_order->'rows')) IS NOT TRUE THEN
   RAISE EXCEPTION 'Undo requires the same actor original reorder and its unchanged complete poststate' USING ERRCODE='23514';
  END IF;
  FOR n IN 0..jsonb_array_length(after_order->'rows')-1 LOOP
   IF after_order->'rows'->n->'id' IS DISTINCT FROM original_before->'rows'->n->'id'
     OR after_order->'rows'->n->'display_order' IS DISTINCT FROM original_before->'rows'->n->'display_order' THEN
    RAISE EXCEPTION 'Undo restores only exact original integer orders' USING ERRCODE='23514';
   END IF;
  END LOOP;
 END IF;
 IF parent IS NOT NULL THEN
  PERFORM 1 FROM naijue_erp.product_category WHERE id=parent AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Actual retained category parent required' USING ERRCODE='23514'; END IF;
 END IF;
 PERFORM id FROM naijue_erp.product_category WHERE parent_id IS NOT DISTINCT FROM parent AND deleted_at IS NULL ORDER BY id FOR SHARE;
 SELECT jsonb_agg(jsonb_build_object('id',id,'version',version,'display_order',display_order) ORDER BY id) INTO actual_rows
  FROM naijue_erp.product_category WHERE parent_id IS NOT DISTINCT FROM parent AND deleted_at IS NULL;
 IF actual_rows IS DISTINCT FROM after_order->'rows' THEN
  RAISE EXCEPTION 'Final complete category siblings differ from aggregate after evidence' USING ERRCODE='23514';
 END IF;
 SELECT coalesce(array_agg(id ORDER BY id),ARRAY[]::uuid[]) INTO written_ids FROM naijue_erp.product_category WHERE xmin::text::bigint=current_xid;
 IF written_ids IS DISTINCT FROM changed_ids OR EXISTS(SELECT 1 FROM naijue_erp.product_category
   WHERE id=ANY(changed_ids) AND cmin::text::bigint<=audit_command) THEN
  RAISE EXCEPTION 'Only exact changed siblings may be written after the prepared audit' USING ERRCODE='23514';
 END IF;
 SELECT jsonb_agg(jsonb_build_object('id',m->'id','version',m->'version','displayOrder',m->'display_order')
   ORDER BY (m->>'display_order')::integer,(m->>'id') COLLATE "C") INTO result_members FROM jsonb_array_elements(after_order->'rows') m;
 expected_result:=jsonb_build_object('operationId',a.operation_id,'kind','CATEGORY','targetId',a.object_id,'version',a.new_version,
  'order',jsonb_build_object('parentId',parent,'undoOfOperationId',undo_of,'members',result_members));
 IF r.result_data IS DISTINCT FROM expected_result THEN
  RAISE EXCEPTION 'Category receipt must return the exact complete aggregate poststate' USING ERRCODE='23514';
 END IF;
END $$;
REVOKE ALL ON FUNCTION naijue_erp.maintenance_check_category_order(naijue_erp.audit_change) FROM PUBLIC;

-- Original routines below preserve every other family and bootstrap branch.
-- D1 inserts only narrow new CATEGORY branches; exact bodies are pinned by the v15 runtime probe.


CREATE OR REPLACE FUNCTION naijue_erp.maintenance_action_allowed(kind text, action text) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,naijue_erp AS $$
  SELECT CASE kind
    WHEN 'PRODUCT' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE','DELETE')
    WHEN 'CATEGORY' THEN action IN ('CREATE','EDIT','DELETE','REORDER','UNDO_REORDER')
    WHEN 'COLOR' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE','DELETE')
    WHEN 'FIT' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE','DELETE')
    WHEN 'HALL' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE')
    WHEN 'WAREHOUSE' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE')
    WHEN 'STAFF' THEN action IN ('CREATE','EDIT','LEAVE','REINSTATE')
    WHEN 'ACCOUNT' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE','RESET_PASSWORD')
    WHEN 'PAYMENT_METHOD' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE')
    WHEN 'PAYMENT_ACCOUNT' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE')
    ELSE false END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_maintenance_receipt_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE native_version integer; native_xid bigint; a naijue_erp.audit_change%ROWTYPE; root_table regclass;
BEGIN
  IF NEW.target_type='CATEGORY' AND NEW.action IN ('REORDER','UNDO_REORDER') THEN
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=NEW.id;
    PERFORM naijue_erp.maintenance_check_category_order(a);
    RETURN NULL;
  END IF;
  root_table:=naijue_erp.maintenance_root_table(NEW.target_type);
  IF root_table IS NULL THEN RETURN NULL; END IF;
  EXECUTE format('SELECT version,xmin::text::bigint FROM %s WHERE id=$1 FOR SHARE',root_table) INTO STRICT native_version,native_xid USING NEW.target_id;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=NEW.id;
  IF NOT naijue_erp.maintenance_audit_is_current(NEW.id) OR native_xid<>mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
    OR NEW.status<>'COMMITTED' OR (NEW.result_data->>'version')::numeric<>native_version
    OR a.object_type<>NEW.target_type OR a.object_id<>NEW.target_id OR a.actor_account_id<>NEW.actor_account_id
    OR a.action<>NEW.action OR a.new_version<>native_version OR a.occurred_at IS DISTINCT FROM NEW.completed_at
    OR jsonb_typeof(a.after_values) IS DISTINCT FROM 'object' OR a.after_values->'version' IS DISTINCT FROM to_jsonb(a.new_version)
    OR (a.old_version IS NULL AND (a.before_values IS NOT NULL OR a.action<>'CREATE'))
    OR (a.old_version IS NOT NULL AND (jsonb_typeof(a.before_values) IS DISTINCT FROM 'object'
      OR a.before_values->'version' IS DISTINCT FROM to_jsonb(a.old_version) OR a.action='CREATE'))
    OR NOT naijue_erp.safe_maintenance_evidence(a.before_values) OR NOT naijue_erp.safe_maintenance_evidence(a.after_values) THEN
    RAISE EXCEPTION 'Maintenance receipt audit and final native root must close together' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_maintenance_root_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE family text; a naijue_erp.audit_change%ROWTYPE; new_root jsonb; old_root jsonb; after_root jsonb; before_root jsonb;
  field record; present boolean; parent uuid; visited uuid[];
BEGIN
  family:=CASE TG_TABLE_NAME WHEN 'product' THEN 'PRODUCT' WHEN 'product_category' THEN 'CATEGORY'
    WHEN 'color' THEN 'COLOR' WHEN 'fit' THEN 'FIT' WHEN 'hall' THEN 'HALL' WHEN 'warehouse' THEN 'WAREHOUSE'
    WHEN 'staff' THEN 'STAFF' WHEN 'user_account' THEN 'ACCOUNT' WHEN 'payment_method' THEN 'PAYMENT_METHOD'
    WHEN 'payment_account' THEN 'PAYMENT_ACCOUNT' END;
  IF family IS NULL THEN RAISE EXCEPTION 'Unsupported maintenance root' USING ERRCODE='23514'; END IF;
  IF family='CATEGORY' THEN
    SELECT x.* INTO a FROM naijue_erp.audit_change x WHERE x.object_type='CATEGORY' AND x.action IN ('REORDER','UNDO_REORDER')
      AND naijue_erp.maintenance_audit_is_current(x.operation_id)
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(x.after_values->'category_order'->'rows') m WHERE m->>'id'=NEW.id::text);
    IF FOUND THEN
      IF TG_OP<>'UPDATE' OR NEW.id IS DISTINCT FROM OLD.id OR OLD.deleted_at IS NOT NULL
        OR NEW.display_order IS NOT DISTINCT FROM OLD.display_order OR NEW.version::bigint<>OLD.version::bigint+1
        OR to_jsonb(NEW)-ARRAY['display_order','version'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['display_order','version']
        OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a.before_values->'category_order'->'rows') m
          WHERE m=jsonb_build_object('id',OLD.id,'version',OLD.version,'display_order',OLD.display_order))
        OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a.after_values->'category_order'->'rows') m
          WHERE m=jsonb_build_object('id',NEW.id,'version',NEW.version,'display_order',NEW.display_order)) THEN
        RAISE EXCEPTION 'Every category sibling update must match its exact aggregate OLD and NEW' USING ERRCODE='23514';
      END IF;
      -- The receipt trigger checks the complete final aggregate once. This row
      -- trigger independently proves every actual OLD/NEW without N full scans.
      RETURN NULL;
    END IF;
  END IF;
  SELECT * INTO a FROM naijue_erp.audit_change WHERE object_type=family AND object_id=NEW.id AND new_version=NEW.version;
  present:=FOUND;
  -- Preserve the original first-import/bootstrap lanes and their separate source
  -- guards. Once a cutoff is published every ordinary root write needs evidence.
  IF NOT present AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN RETURN NULL; END IF;
  -- Existing authenticated self-password change deliberately has no maintenance
  -- receipt. Preserve only its exact non-secret metadata/password transition;
  -- every D2 reset with a receipt still takes the full closure below.
  IF NOT present AND family='ACCOUNT' THEN
    SELECT * INTO a FROM naijue_erp.audit_change x WHERE x.object_type='STAFF' AND x.object_id=NEW.staff_id
      AND naijue_erp.maintenance_audit_is_current(x.operation_id)
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(x.after_values->'accounts') q(v) WHERE v->>'id'=NEW.id::text AND v->'version'=to_jsonb(NEW.version));
    IF FOUND THEN
      PERFORM naijue_erp.maintenance_check_account_credential(a,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW));
      IF EXISTS(SELECT 1 FROM naijue_erp.auth_session WHERE account_id=NEW.id AND revoked_at IS NULL) THEN
        RAISE EXCEPTION 'Changed staff child account cannot retain old sessions' USING ERRCODE='23514';
      END IF;
      RETURN NULL;
    END IF;
  END IF;
  IF NOT present AND family='ACCOUNT' AND TG_OP='UPDATE' THEN
    IF to_jsonb(NEW)-ARRAY['password_hash','auth_version','version','updated_at']
        =to_jsonb(OLD)-ARRAY['password_hash','auth_version','version','updated_at']
      AND NEW.password_hash IS DISTINCT FROM OLD.password_hash
      AND NEW.password_hash ~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$'
      AND NEW.auth_version::bigint=OLD.auth_version::bigint+1 AND NEW.version::bigint=OLD.version::bigint+1 THEN RETURN NULL; END IF;
  END IF;
  IF NOT present OR NOT naijue_erp.maintenance_audit_is_current(a.operation_id) OR a.old_version IS DISTINCT FROM (CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.version END)
    OR a.new_version<>NEW.version OR (TG_OP='INSERT' AND (NEW.version<>1 OR a.action<>'CREATE'))
    OR (TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.version::bigint<>OLD.version::bigint+1 OR a.action='CREATE')) THEN
    RAISE EXCEPTION 'Native root requires its exact one-step maintenance audit' USING ERRCODE='23514';
  END IF;
  new_root:=to_jsonb(NEW)-'password_hash'; old_root:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD)-'password_hash' END;
  after_root:=a.after_values; before_root:=a.before_values;
  IF family='PRODUCT' THEN
    after_root:=after_root-ARRAY['skus','barcodes','images']; before_root:=before_root-ARRAY['skus','barcodes','images'];
    PERFORM naijue_erp.maintenance_check_product_children(a,false);
    IF TG_OP='INSERT' AND (new_root->>'default_barcode_scheme_id') IS NULL THEN
      RAISE EXCEPTION 'New runtime product requires an explicit real default barcode scheme' USING ERRCODE='23514';
    END IF;
  ELSIF family='PAYMENT_ACCOUNT' THEN
    after_root:=after_root-'payment_halls'; before_root:=before_root-'payment_halls';
    IF a.before_values ? 'payment_halls' OR a.after_values ? 'payment_halls' THEN
      IF NOT naijue_erp.maintenance_exact_rows_match(a.after_values->'payment_halls',naijue_erp.maintenance_payment_halls(NEW.id),'hall_id') THEN
        RAISE EXCEPTION 'Final payment hall relations differ from complete after evidence' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSIF family='STAFF' THEN
    after_root:=after_root-ARRAY['accounts','account_credentials']; before_root:=before_root-'accounts';
    PERFORM naijue_erp.maintenance_check_staff_accounts(a,old_root,new_root,false);
  ELSIF family='ACCOUNT' THEN
    after_root:=after_root-'account_credentials';
    PERFORM naijue_erp.maintenance_check_account_credential(a,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW));
    IF TG_OP='UPDATE' THEN
      IF NEW.staff_id IS DISTINCT FROM OLD.staff_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.auth_version::bigint<>OLD.auth_version::bigint+1 OR EXISTS(SELECT 1 FROM naijue_erp.auth_session WHERE account_id=NEW.id AND revoked_at IS NULL) THEN
        RAISE EXCEPTION 'Account safety epoch provenance and sessions must close together' USING ERRCODE='23514';
      END IF;
    ELSIF NEW.auth_version<>1 OR NEW.created_at IS DISTINCT FROM a.occurred_at THEN
      RAISE EXCEPTION 'New account starts at the original operation' USING ERRCODE='23514';
    END IF;
    IF NEW.updated_at IS DISTINCT FROM a.occurred_at THEN RAISE EXCEPTION 'Account time must match operation' USING ERRCODE='23514'; END IF;
    IF a.action IN ('DISABLE','RESTORE') THEN
      IF TG_OP<>'UPDATE' OR (NEW.login_enabled IS DISTINCT FROM (a.action='RESTORE'))
        OR NEW.login_enabled IS NOT DISTINCT FROM OLD.login_enabled
        OR to_jsonb(NEW)-ARRAY['login_enabled','auth_version','version','updated_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['login_enabled','auth_version','version','updated_at'] THEN
        RAISE EXCEPTION 'Account disable or restore must only change its actual login state and epochs' USING ERRCODE='23514';
      END IF;
    ELSIF a.action='RESET_PASSWORD' THEN
      IF TG_OP<>'UPDATE' OR to_jsonb(NEW)-ARRAY['password_hash','auth_version','version','updated_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['password_hash','auth_version','version','updated_at'] THEN
        RAISE EXCEPTION 'Password reset cannot change account identity or scope' USING ERRCODE='23514';
      END IF;
    END IF;
    IF NEW.login_enabled AND NOT EXISTS(SELECT 1 FROM naijue_erp.staff s LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id
      WHERE s.id=NEW.staff_id AND s.employment_status='在职' AND s.role IN ('ADMIN','WAREHOUSE','SALESPERSON')
        AND (s.role<>'SALESPERSON' OR s.hall_id IS NOT NULL) AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'Enabled account requires current active staff and usable scope' USING ERRCODE='23514';
    END IF;
  END IF;
  IF jsonb_typeof(after_root) IS DISTINCT FROM 'object' OR (old_root IS NULL AND before_root IS NOT NULL)
    OR (old_root IS NOT NULL AND jsonb_typeof(before_root) IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION 'Actual root sparse objects required' USING ERRCODE='23514';
  END IF;
  FOR field IN SELECT * FROM jsonb_each(new_root) LOOP
    IF old_root IS NULL OR field.value IS DISTINCT FROM old_root->field.key THEN
      IF NOT naijue_erp.maintenance_evidence_matches(after_root->field.key,field.value)
        OR (old_root IS NOT NULL AND NOT naijue_erp.maintenance_evidence_matches(before_root->field.key,old_root->field.key)) THEN
        RAISE EXCEPTION 'Audit must contain every actual changed native root value' USING ERRCODE='23514';
      END IF;
    ELSIF after_root ? field.key OR before_root ? field.key THEN
      RAISE EXCEPTION 'Unchanged native values cannot be copied into sparse audit' USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(after_root) AS k(name) WHERE NOT new_root ? k.name)
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(before_root) AS k(name) WHERE NOT old_root ? k.name) THEN
    RAISE EXCEPTION 'Audit root contains invented fields or credentials' USING ERRCODE='23514';
  END IF;
  IF family='HALL' THEN
    IF NEW.default_sales_warehouse_id IS NOT NULL THEN
      PERFORM 1 FROM naijue_erp.warehouse WHERE id=NEW.default_sales_warehouse_id FOR SHARE;
      IF NOT EXISTS(SELECT 1 FROM naijue_erp.warehouse WHERE id=NEW.default_sales_warehouse_id AND hall_id=NEW.id) THEN
        RAISE EXCEPTION 'Default sales warehouse must belong to the selected hall' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSIF family='WAREHOUSE' THEN
    PERFORM 1 FROM naijue_erp.hall WHERE default_sales_warehouse_id=NEW.id FOR SHARE;
    IF EXISTS(SELECT 1 FROM naijue_erp.hall WHERE default_sales_warehouse_id=NEW.id AND id<>NEW.hall_id) THEN
      RAISE EXCEPTION 'Warehouse move would invalidate an actual hall default' USING ERRCODE='23514';
    END IF;
  ELSIF family='CATEGORY' THEN
    parent:=NEW.parent_id; visited:=ARRAY[NEW.id];
    WHILE parent IS NOT NULL LOOP
      IF parent=ANY(visited) THEN RAISE EXCEPTION 'Category parent cycle rejected' USING ERRCODE='23514'; END IF;
      visited:=array_append(visited,parent);
      SELECT parent_id INTO STRICT parent FROM naijue_erp.product_category WHERE id=parent FOR SHARE;
    END LOOP;
  END IF;
  RETURN NULL;
END $$;

-- Wrap only the approved two actions around the complete original result expression.
-- All other predicates (including IMPORT CORE/full binding) remain byte-derived from the predecessor catalog.
DO $$
DECLARE old_expression text;
BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expression FROM pg_catalog.pg_constraint
  WHERE conrelid='naijue_erp.operation_receipt'::regclass AND conname='receipt_result_by_kind';
 ALTER TABLE naijue_erp.operation_receipt DROP CONSTRAINT receipt_result_by_kind;
 EXECUTE format($constraint$ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_result_by_kind CHECK ((CASE
  WHEN target_type='CATEGORY' AND action IN ('REORDER','UNDO_REORDER') THEN
   jsonb_typeof(result_data)='object' AND result_data ?& ARRAY['operationId','kind','targetId','version','order']
   AND result_data-ARRAY['operationId','kind','targetId','version','order']='{}'::jsonb
   AND jsonb_typeof(result_data->'operationId')='string' AND result_data->>'operationId'=id::text
   AND result_data->>'kind'='CATEGORY' AND jsonb_typeof(result_data->'targetId')='string' AND result_data->>'targetId'=target_id::text
   AND jsonb_typeof(result_data->'version')='number' AND result_data->>'version' ~ '^[1-9][0-9]*$'
   AND jsonb_typeof(result_data->'order')='object' AND result_data->'order' ?& ARRAY['parentId','undoOfOperationId','members']
   AND (result_data->'order')-ARRAY['parentId','undoOfOperationId','members']='{}'::jsonb
   AND jsonb_typeof(result_data->'order'->'members')='array'
  ELSE (%s) END) IS TRUE)$constraint$,old_expression);
END $$;
-- C must review/grant only this INVOKER helper's exact EXECUTE to the original runtime role.
COMMIT;
