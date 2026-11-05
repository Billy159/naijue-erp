-- VERSION 0027: unified ordinary document conversion and baseline evidence.
-- SOURCE ONLY. Installing this file is not authorized production execution.
-- Predecessor: the complete reviewed 40-file aa10 source profile, not numbered26 alone.
-- No historical relation is retired; immutable original FKs and evidence remain.
BEGIN;
SET LOCAL search_path = pg_catalog, naijue_erp;
DO $preflight$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration)
      IS DISTINCT FROM ARRAY(SELECT generate_series(1,26)) THEN
    RAISE EXCEPTION 'UNIFIED27_EXACT26_PREFIX_REQUIRED' USING ERRCODE='23514';
  END IF;
  -- Immutable source_name may be an export/run label, not the durable namespace.
  -- A separately reviewed, explicit identity/backfill migration is required for
  -- nonempty old carriers; do not silently copy source_name or rewrite old rows.
  IF EXISTS(SELECT 1 FROM naijue_erp.import_record) THEN
    RAISE EXCEPTION 'UNIFIED27_SOURCE_NAMESPACE_REVIEW_REQUIRED: nonempty retained import_record; supply reviewed cross-batch namespace/collision mapping before this upgrade' USING ERRCODE='23514';
  END IF;
END $preflight$;

-- All predecessor bodies are pinned; unrelated security is not substituted.
DO $parent$
DECLARE f jsonb;
BEGIN
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace) <> 137 THEN
  RAISE EXCEPTION 'UNIFIED27_COMPLETE40_ROUTINE_COUNT_REQUIRED' USING ERRCODE='23514'; END IF;
 FOR f IN SELECT value FROM jsonb_array_elements($pins$[{"signature":"naijue_erp.guard_recorded_live_balance_pair()","sha256":"58700e3775442434c910b94fa66110d0880189c530bf7fdd839131f1ca8ad63e"},{"signature":"naijue_erp.validate_recorded_live_balance_commit()","sha256":"b32828510d3b85ae04c9d3849bcc494abe3cf337f0908996d72142fc171fb523"},{"signature":"naijue_erp.history_effective_set_guard()","sha256":"324d469b4452aa8a5b37cc51cf2e41ad50fdd94718738dbb59d6796dfbdb83a1"},{"signature":"naijue_erp.history_numeric_ledger_set_guard()","sha256":"83d5ef1ec17d817433ac8b19b3921eba86208f2979a41581a198813bc88ddef3"},{"signature":"naijue_erp.lock_category_tree_statement()","sha256":"fe2f9bd7ed49d52697cb8a5aab6100bc61f2246c0f8ad02f945a7dbbd4a54834"},{"signature":"naijue_erp.validate_category_final_component()","sha256":"f6eba82eceeaf19ad781500cebcfc5b515f38bf11ed428d41897e909b821a07d"},{"signature":"naijue_erp.assert_barcode_scheme_initialization_v19(uuid,uuid)","sha256":"8d4f7d457403d6c4737e5a9b38d6d4f48c0ef3c5e94dd2e8ff408d3b57a198ca"},{"signature":"naijue_erp.validate_history_numeric_balance_commit()","sha256":"fab0bf7a3f1681d6034b09dbb5c7ad8efa606c6fa82f24fc101bc5b70636a837"},{"signature":"naijue_erp.validate_history_numeric_receipt_commit()","sha256":"e69f92651dc7a8313e354d47bd4f1ffc1c97fb30aa5c56dcfc49f69511a1d7d6"},{"signature":"naijue_erp.validate_history_numeric_revision_commit()","sha256":"a73089ea7b30cfdb43f616ee1e8ae5fbc2f9a47d4c713b322b4012a28c6fe01c"},{"signature":"naijue_erp.guard_history_numeric_ledger()","sha256":"014f98557c5fc57e5e6f0ba3d21483be5e7eb3e3adbc86c9162dcd120df40797"},{"signature":"naijue_erp.history_numeric_money(jsonb,boolean)","sha256":"8c588f3b6145cb1609898dd46e3abfb7b1bd37b3b9318f1863dcfac530ee200b"},{"signature":"naijue_erp.history_numeric_current_facts(text,uuid)","sha256":"e9b62d95e68633c4fa2e0d5de8ba8d4fd5a577fa863941332553818ff01de8dc"},{"signature":"naijue_erp.maintenance_check_category_order(naijue_erp.audit_change)","sha256":"77c86d2788e88f2922a66c662a91b95c0f76d6ea00587148c36421feabde281e"},{"signature":"naijue_erp.assert_core_initialization_v14(uuid,uuid,boolean)","sha256":"8a8374fb193ed9e5ddcc388b0141a91dc17420cef0baee4ffbb700cd9737add5"},{"signature":"naijue_erp.assert_history_typed_closure(uuid,jsonb,jsonb)","sha256":"8556e917e6a251dd1eb97974fbb6f793d3e46a1ef10f6ef7fd77fb7ad539d00f"},{"signature":"naijue_erp.assert_native_bootstrap_accounts(uuid)","sha256":"171c59ba962a287dd02bb9eac993512e114783a470063108a07ba5e206cbabca"},{"signature":"naijue_erp.assert_native_product_season_source(naijue_erp.import_source_row)","sha256":"3a753b412fa4a648e26c4a2e398a4b52cc694c04dc1352a98513cb2220d4d661"},{"signature":"naijue_erp.assert_retained_sku_reference(uuid)","sha256":"4c956a82b9531b1f385f9aecd9c6d20fa84ce6d434bb0a41d2a0c96ebb7fae5d"},{"signature":"naijue_erp.assign_runtime_document_number()","sha256":"bca336abcd0ef4a57c22d2ee19564e7ea744257303fb8eec06c822efd551500e"},{"signature":"naijue_erp.check_hall_default_customer_enabled()","sha256":"6a89df4342530f3a3bdd185abbdd372b3372799b341a17ae9ad65be86ded91ee"},{"signature":"naijue_erp.cutoff_import_lock()","sha256":"82a621b9cea39c9cc273d5cb790b364fad004875760644633280d2e24e64ccc7"},{"signature":"naijue_erp.exact_historical_customer_source_matches(jsonb,jsonb)","sha256":"ac26aa52f4131d996d6abe0db810a0e0817a12ffa043cdfb2250c951bfd0f011"},{"signature":"naijue_erp.freeze_cutoff_sales_detail()","sha256":"dcfa1a3abb87368cf2f18663880f9a2ea9377a3599e985e13c7241220fd85a12"},{"signature":"naijue_erp.freeze_imported_identity()","sha256":"0a17cf0a670ca8c9d34f2de1ec34de9b5197410fc01f82af4273a26e877a44e5"},{"signature":"naijue_erp.guard_balance_identity()","sha256":"02f2db383ff8c5826c7148f73bb780319c977bffa5798bc233159d83d89e58fc"},{"signature":"naijue_erp.guard_contributor_link()","sha256":"2937ecd3e974e2ad78e0bfce4790b96d97953d4bf113406a838063b366895983"},{"signature":"naijue_erp.guard_cutoff_ledger()","sha256":"71ecb569279de61709578ffe2f29d85140993ed155fce07e7beb797307c491b5"},{"signature":"naijue_erp.guard_exact_historical_customer_current_usage()","sha256":"78e895d72d6f806089d2bc7cb877293e1263d26ba8265dd7f3b5e2203e956245"},{"signature":"naijue_erp.guard_header_native_reference()","sha256":"1584d2600c763f0d38cd3dd4fa7dd14ea90465ef9376d7165a58d71bce0dec3c"},{"signature":"naijue_erp.guard_header_native_reference_publication()","sha256":"3419f73d296fcb84f77eff79edaa5034cb90f33a6363d0687d316ee697f785c0"},{"signature":"naijue_erp.guard_history_closure_stage()","sha256":"d05947c6d7ef430d043c10038cce1d72f7e44e4efb2a2112c499ea8d107d47e0"},{"signature":"naijue_erp.guard_history_insert()","sha256":"98fcf82074f4aaf0712b2af3aca5a12a7e4975933712caffd577e652eca7e12f"},{"signature":"naijue_erp.guard_history_publication()","sha256":"6ad32797b7fe81e6427b3abec90aca378778be9af30b014b55966fbed0bff77e"},{"signature":"naijue_erp.guard_history_typed_publication()","sha256":"fc386026e40ca43d36bdb5e7422001878a7f91c95c2e36bce28272b4d792e506"},{"signature":"naijue_erp.guard_import_accounting_claim()","sha256":"298996ca170c969aa06df8dfa44219b86a9db0ae4dc1c07f726167a518f62acf"},{"signature":"naijue_erp.guard_import_accounting_publication()","sha256":"b41ad04a99fb7af999c22b13cdc7ad9b747e4df67e3f11bd44e7632d15a747a6"},{"signature":"naijue_erp.guard_import_batch()","sha256":"f0e35d2d5978c92d26c1eab6525a87d2ae3450a525daa14131b479b03856d29a"},{"signature":"naijue_erp.guard_import_record()","sha256":"8a79dbc011cdaf0582e2bd1eefc7ea94fce15d24f6aa1ac0fa25c43afb4e7e16"},{"signature":"naijue_erp.guard_maintenance_account_event()","sha256":"965d9d3433b929ccd151b9a147eeef713770d7b7311e49c80cfaa3d17b118549"},{"signature":"naijue_erp.guard_maintenance_audit_actor()","sha256":"ac0ce9c91f34b9d8d34eb5e7d26f595319bfa6ad3dfe3ae33a4f2f5edf1eb217"},{"signature":"naijue_erp.guard_maintenance_before_root()","sha256":"574add1ad436482c7593725ac4b1b58cabe6b982b538cf0e1f22c1783723712f"},{"signature":"naijue_erp.guard_maintenance_child_write()","sha256":"a19def51718e008e541482dd1e6f2d2ab9257842ce7e66ad6e62aedcfa216d8a"},{"signature":"naijue_erp.guard_native_catalogue_binding()","sha256":"7418579c0d1c3a1951696a12ad165a421d26b87f0e449d9d7d250497dc2ddc21"},{"signature":"naijue_erp.guard_native_catalogue_publication()","sha256":"d2eaa009760d63f245d562570ca4c8fce038633da5233a8c7ab7142190a30ceb"},{"signature":"naijue_erp.guard_native_creation_identity()","sha256":"4827b76ff4df9beae18411033d2e6e13a04eea2d648aa58bb67d179145d107dc"},{"signature":"naijue_erp.guard_native_party_import_intent()","sha256":"262e74a37ba12883a4978c4d99b6ecca000d245186b585a9e5b35ad31ccf8d7f"},{"signature":"naijue_erp.guard_native_payment_binding()","sha256":"774cc9b1604a8d0948f73c7298fa67a10233962af218b89fe0b9675107148d35"},{"signature":"naijue_erp.guard_native_payment_publication()","sha256":"993b114dfbec87428a42a9f6aa7d0a6ecbeef67fd85bc00754fa4eb80c7e6797"},{"signature":"naijue_erp.guard_product_image_color()","sha256":"a49cc6bc4c49931eb50c81dd95e08a760b2ea6de73e19a0496611fe63fe22b18"},{"signature":"naijue_erp.guard_product_season_selection()","sha256":"bd97ac1bc0a8c9a3221c12b794f5976bf0e092a2907aa2dd9e6378b718d29560"},{"signature":"naijue_erp.guard_referenced_season_identity()","sha256":"8eb0b3435f063f4a653c31f632fe6751fecc3864a375a72753bcf4090bb18f2c"},{"signature":"naijue_erp.guard_retained_catalogue_delete()","sha256":"dec785b8b1f818b2daa3af4d3872139710cae32178516839e669f59aa6609758"},{"signature":"naijue_erp.guard_retained_catalogue_reference()","sha256":"91cc169d60ca6db2700ed97e49632504cfba9d957ea467a4777137f946c6923c"},{"signature":"naijue_erp.guard_runtime_document_number()","sha256":"52d92723d9ecb5f16eb57c5ae50e0f8cf322b4b5f3848ab88712f41aeb0887bd"},{"signature":"naijue_erp.guard_successor_publication26()","sha256":"a055abd422ff4d81d0cf87e11cf659dcc221eda1a18b774cd62034c2c3f74c14"},{"signature":"naijue_erp.guard_successor_source26()","sha256":"cdf91a3949d6aefbb16c67f7d82dcf99b60730f9a6884468c064102c9887b710"},{"signature":"naijue_erp.history_closure_count_map(jsonb,text[])","sha256":"ef82c0a7124d288103df38503a849b96aa936289b2ee29166b4f0a6529f476d6"},{"signature":"naijue_erp.history_closure_digest(uuid,text,text,text,uuid,jsonb)","sha256":"749101b8670e32814b875adaaf753da6c50ddcd0860d5ca3ebb000f996f1b63b"},{"signature":"naijue_erp.history_closure_document_rows(uuid,text,uuid,boolean)","sha256":"f8401b06df7815f63f9a83e781961f55725f82246c87d86b7a99a9c19c482ce1"},{"signature":"naijue_erp.history_closure_encode(jsonb,integer)","sha256":"b4ad51b2b17c9248c80de0ead3ae5f50bf5fe887e36597b081ce250a94623a5c"},{"signature":"naijue_erp.history_closure_finish(text,bigint,bytea)","sha256":"94b84af2d05d8a9f34c0135a8c0d70f5b633a9b43e6ec6d2bca8de554e8abac8"},{"signature":"naijue_erp.history_closure_fold(bytea,text)","sha256":"31ed823c127e85537196de072b76077749d939f3241fa53b9f1c76f8fdba9062"},{"signature":"naijue_erp.history_closure_projection(text,jsonb)","sha256":"0af6d70c56a463c351be1dd732d345bbb533ae98b0b07e36f6ef08a4efd72011"},{"signature":"naijue_erp.history_closure_projection_columns(text)","sha256":"a8a3d4d43341d86dfad188d191c3076203e06ea8f1a6919c4d0efddee76286a6"},{"signature":"naijue_erp.history_closure_projection_key(text,jsonb)","sha256":"6e2584dac9f079fe2061570c15b13549a3abac512a2a809835046e6fe2c50222"},{"signature":"naijue_erp.history_closure_row_hash(text,text,jsonb)","sha256":"c7ef0fdc273f23ab5ec1ae6c870746146dab90a6ecef8ecf319de0704df697bb"},{"signature":"naijue_erp.history_closure_rows(uuid)","sha256":"098ba7215c7c893903e2b72762e2036e94bc23b763f3842e378b3d55b3d3f639"},{"signature":"naijue_erp.history_closure_seed(text)","sha256":"532918606a4dd24ebae46a55dfe7d2f0803602798c63742bcd975b7e1179f2c7"},{"signature":"naijue_erp.history_effective_writes_closed()","sha256":"5cfe1d51d7cfa4f30c5fe758ed3b203ec714fa4fc99185a901454d705ea3ba54"},{"signature":"naijue_erp.history_revision_not_enabled()","sha256":"5d66ae3f7ad2dd49fe1d935299e44386923dfcc073d9485b992f03980c661a7c"},{"signature":"naijue_erp.import_source_key_lock(text,text,text)","sha256":"07404b25633a5c48ae1a530a48cdebed11107e187d660c99a7e781bb4957fa24"},{"signature":"naijue_erp.inventory_key_admission(uuid,uuid)","sha256":"a9d7a2519941605e997e5ab59cff7cf847192ed910ef4107ba09aadc64e0fc7a"},{"signature":"naijue_erp.inventory_key_lock(uuid,uuid)","sha256":"c6f444fbbfc527fec7f4031fd0ea7f07eb0a98202b11340e8f7da398fa117079"},{"signature":"naijue_erp.inventory_runtime_key_admitted(uuid,uuid)","sha256":"945a2cc1e250ed1cedd3ca2083b80120174d06d015455bd4288d186e0c27f377"},{"signature":"naijue_erp.is_exact_historical_customer_only(uuid)","sha256":"1f35799a742f402d86cde6a979511dc83ae74d62cd5c106ffcef162a68510403"},{"signature":"naijue_erp.is_native_party_import_insert(text,jsonb)","sha256":"a3c8dfac77e8a4f060932aded92f53da97b68bdcf48d2ede19781c3e54c86412"},{"signature":"naijue_erp.keep_barcode_binding_identity()","sha256":"14f6d02bca58955681e8d03236fb236cbfe3d041d35ecdb326cd3fa7e38d2733"},{"signature":"naijue_erp.keep_party_native_identity()","sha256":"44c3a7110bf40ef38e73972b493f36279b28124097b31a9a6f25e5adc13ad4b9"},{"signature":"naijue_erp.keep_sales_line_owner()","sha256":"95f3dc678bbdc8ac47a2f1c76fe13f872bed088e7484aebc46a523fc13cfd241"},{"signature":"naijue_erp.keep_transfer_header_provenance()","sha256":"68d1af54e61704be47e9fe4097592e812d3f7a910dc2d7190351c2b427267bf6"},{"signature":"naijue_erp.keep_transfer_line_owner()","sha256":"763d52e081f96f872adb50658403f5f2f7f83f7c914d002b0e771ebe9c055335"},{"signature":"naijue_erp.maintenance_account_credential_action(naijue_erp.audit_change,uuid)","sha256":"f17617bc8f02fd0731d0a97eaca90553441235e032de1dbf9086e84c987fbe7a"},{"signature":"naijue_erp.maintenance_action_allowed(text,text)","sha256":"50b2fa0fbf733d7c98b40aa612107a20262cb063852cb3f2cabbefc750742c4a"},{"signature":"naijue_erp.maintenance_administrator_mutex()","sha256":"d6809b2abf7b3f211cd7422b517e867d0c1378f9e7fe9b98eacde2521c6d1ea8"},{"signature":"naijue_erp.maintenance_audit_is_current(uuid)","sha256":"4537d6df2b73e17e386b100845049da08d3fab3584c87ef8d7095660198bf699"},{"signature":"naijue_erp.maintenance_check_account_credential(naijue_erp.audit_change,jsonb,jsonb)","sha256":"577bf0a5de72c8dc6d080c1b4f18a669398d5738c16b75d11ecc1c89d0156ab7"},{"signature":"naijue_erp.maintenance_check_product_children(naijue_erp.audit_change,boolean)","sha256":"c7edab87301fc05b7f33db2eb9df30b2da0d28ed9154dfa8d11cbba9fdbe6dad"},{"signature":"naijue_erp.maintenance_check_staff_accounts(naijue_erp.audit_change,jsonb,jsonb,boolean)","sha256":"ea4e151ccb89d97ed40edc6e3164594bccda0fc28f2879f614f230830fdc0c22"},{"signature":"naijue_erp.maintenance_complete_row_matches(jsonb,jsonb)","sha256":"34c25d78bc34ed57b1acbbdbfbca9b0adfd78dc8dcb6cc8c42cf5673f5da5d21"},{"signature":"naijue_erp.maintenance_evidence_matches(jsonb,jsonb)","sha256":"cb201d859235d7af9ef52616c64b705e5586b11894d57fbc50b2b0a7615abaf3"},{"signature":"naijue_erp.maintenance_exact_rows_match(jsonb,jsonb,text)","sha256":"8b21824423a27f20074768c09998fba819887c949b4f20b57e35db0815133161"},{"signature":"naijue_erp.maintenance_payment_halls(uuid)","sha256":"d96c975c57af714d458275a383e0e2bdaeef9214d4bc64420207f36bcea55869"},{"signature":"naijue_erp.maintenance_product_child_row(text,uuid,uuid)","sha256":"69145227348d366932814f079f0b63d1bb6109cc36d8bb8c9f8ae53fafd1b9fa"},{"signature":"naijue_erp.maintenance_root_table(text)","sha256":"7ed286cf1e5bb8629b02e7cab4412dc0df502d560661be9823d234c466565fe3"},{"signature":"naijue_erp.maintenance_staff_accounts(uuid)","sha256":"a191dc7b42cec0f41f42c6d371a2e959c90019983f4f79cef86db99d2e8fa989"},{"signature":"naijue_erp.native_creation_operation_valid(text,uuid,uuid)","sha256":"118bbe55c39e00948ab087f808812522b565344b924e64916f6cfa91645a3f7a"},{"signature":"naijue_erp.party_key_values(text,text,boolean,integer)","sha256":"d23eb5601f984007df5d52661a101a422852e20c0bcd75f1cadd5a5bbbaef649"},{"signature":"naijue_erp.published_inventory_key(uuid,uuid)","sha256":"fa8234711ad74b3afd250b2143840baa863f05f1e23c92b85574b48b4208adc6"},{"signature":"naijue_erp.reject_immutable_change()","sha256":"3daef49e525ad973be82350a1551e979198d21ff58f3f1bb92a4f7292e4d038c"},{"signature":"naijue_erp.reject_unimplemented_cutoff_write()","sha256":"2e108a1bd9e9304f63cde9eb8b726c448ebcb2d2b371f8b3a8a41aebb6d21e0a"},{"signature":"naijue_erp.safe_maintenance_evidence(jsonb,integer)","sha256":"4a0d9d21eadf3e839d1d0c23f7efe8a0ef14123dd521a553eefcc7362ab3f927"},{"signature":"naijue_erp.transfer_header_audit_values(naijue_erp.transfer_header)","sha256":"0c92b020490243f55132a5acb15ecee8caca92fb88db5f75e877e2f2430ec8ad"},{"signature":"naijue_erp.transfer_line_audit_values(naijue_erp.transfer_line)","sha256":"ce924832c6a9b4a762ff80e031279273f521e4e17139c7d89a4930004313f49e"},{"signature":"naijue_erp.valid_history_counts(jsonb)","sha256":"6c143e2bf81bcd53e2c9074aa2ab4e1781c746bc7a99bb0064f378f77de80280"},{"signature":"naijue_erp.valid_product_season_ids(uuid[])","sha256":"b6b3932264857c59998025cece6241a4e819b80f9bc72e6bf0ed4e907890cc65"},{"signature":"naijue_erp.validate_available_administrator_commit()","sha256":"3a9a1bea930614761185af90b8591a539b855647974b68b004869c80f5e5ba18"},{"signature":"naijue_erp.validate_baseline_source_commit()","sha256":"ec5e9a331d0f8148ec21e28d5e8a4ddb82ac66d923ea2490abee3f3000ed75c9"},{"signature":"naijue_erp.validate_exact_historical_customer_intent(naijue_erp.native_party_import_evidence,naijue_erp.import_batch)","sha256":"b9968150e138d455658dd7d437c8026b7bfdce466146b961d64fd2934f099c98"},{"signature":"naijue_erp.validate_document_specification_commit()","sha256":"b02bff6115bcf2c87758f8313a57a1a693733ba3ea192fcb1657bd176c587c06"},{"signature":"naijue_erp.validate_exact_native_reversal()","sha256":"3ef72272c6cb9b7ccbfffc393a31fdd85babdb3efb333baae839482d571f362e"},{"signature":"naijue_erp.validate_history_closure_commit()","sha256":"e61d2c5dd34792f5ca277cada1dc12a6904b1be95031c0a6c4810080b24dd03b"},{"signature":"naijue_erp.validate_history_product_proofs(uuid)","sha256":"dab49bb495de85d5e66350affd348f85e0595411ea7ab7378104a3963db2a38e"},{"signature":"naijue_erp.validate_import_accounting_baseline_commit()","sha256":"678cc0b409e43e420365733b21ce8e8ce0aa88b8d3b9b48f9a842edd41120c51"},{"signature":"naijue_erp.validate_import_accounting_checkpoint_commit()","sha256":"06ac9742cb16adb281f7610d299ef9dedb61c125038f12be55275760d4a4c0c9"},{"signature":"naijue_erp.validate_import_accounting_claim_commit()","sha256":"ad8e19c3f36b85ebbda107a2ca8e3c00ad10ca3005a232bd033bbab7613be756"},{"signature":"naijue_erp.validate_import_accounting_final_record_commit()","sha256":"f1fca00daa56873221062706d2009293b6180156e69bfe6f5fc1ca64087ea312"},{"signature":"naijue_erp.validate_import_batch_commit()","sha256":"7ce01945fcd6fd68817724cc27d8f135da82ef2f4e3929a8ad5e4cf232310b3b"},{"signature":"naijue_erp.validate_import_operation()","sha256":"73d13792e2a9dde79b239cb2c059a89c5552823503a002ce1b7bdad75aa1b3ff"},{"signature":"naijue_erp.validate_import_publish(uuid,jsonb)","sha256":"873d1943b1ada13eeef43f6d28cb792755de48c461b1ebee7810e5278cd5d6e3"},{"signature":"naijue_erp.validate_import_source_commit()","sha256":"524ec70d51970cfc79f4ec5e9a93f21bf20733781a2202121a4e91d1d6b66f3a"},{"signature":"naijue_erp.validate_ledger_receipt_source()","sha256":"26f2f325172ef2878d4dffb4f1740d680e63458abd4b25e7a693e352664d15da"},{"signature":"naijue_erp.validate_maintenance_receipt_commit()","sha256":"77679e1e21858ae64ac1225660cf7a692f63b097d538254829def8164ea33ac5"},{"signature":"naijue_erp.validate_maintenance_root_commit()","sha256":"002818dfd8d764e99221bb0548da1141054871ae674aba6bb9f6ce59c9d92d1c"},{"signature":"naijue_erp.validate_native_creation_commit()","sha256":"a505ceb68946cc14a69b181cd43d6cebbedca9e9ea453c9920c243892f537cd7"},{"signature":"naijue_erp.validate_native_party_import_commit()","sha256":"5383c9941e06c7748af6603eee56559b102b09305c11771a813c6cf859ad37e3"},{"signature":"naijue_erp.validate_party_native_commit()","sha256":"dba217f39c61d3f4741a72a565851a41caaa18e44fb57aa2f8e3473d20810762"},{"signature":"naijue_erp.validate_party_receipt_commit()","sha256":"fafc3389b3458b6d8ec4cad15f6f926dcc20bb059a819c496ed4db260d06b426"},{"signature":"naijue_erp.validate_sales_commit()","sha256":"f00b31849f4f72d62103fc08cb4e157b4401717a1f2c7c05fc699663715f07a2"},{"signature":"naijue_erp.validate_sales_effect()","sha256":"e6b2bbec00a6389ed92f9026af20f06c52168d37fe5a59d3ccfc0c29fb7cb1db"},{"signature":"naijue_erp.validate_sales_settlement()","sha256":"c0ab9b6a91951a809e5fbfb6c34ed52fb164b76119d58d469d411c0b58e734a3"},{"signature":"naijue_erp.validate_sparse_balance_commit()","sha256":"937b31d7ab0f1e5d8fb7febc26c051690b2df9dc79d451088eff73d75046399d"},{"signature":"naijue_erp.validate_transfer_balance_commit()","sha256":"9bfaa1cdf1dea76ada35bae56dd40cb3e27c6acd28a93905ee2f06d17a8b2abb"},{"signature":"naijue_erp.validate_transfer_commit()","sha256":"e6ceac3fddef4e61f649b8ef2d71db56042dc14c7622ca0a5c321de2ab7b3f38"},{"signature":"naijue_erp.validate_transfer_effect()","sha256":"d901f8e428c9ef2440d9fb48aca3f638eef141bd62f116e88698c6f726ad0c73"},{"signature":"naijue_erp.validate_transfer_header_commit()","sha256":"6d50fa80e2b445bc45645ff0f5592f2ed4e00836077224c1fe3510b4e563fa0c"},{"signature":"naijue_erp.validate_transfer_line_commit()","sha256":"1443f443a884f0073209294476daf9a7ff0f45d6d32832e5d14557d513cfc4fb"}]$pins$::jsonb) LOOP
  IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure(f->>'signature')) IS DISTINCT FROM f->>'sha256' THEN
   RAISE EXCEPTION 'UNIFIED27_PREDECESSOR_BODY_DIFFERS: %',f->>'signature' USING ERRCODE='23514'; END IF;
 END LOOP;
END $parent$;

ALTER TABLE naijue_erp.import_batch ADD CONSTRAINT import_batch_namespace_key UNIQUE(id, source_name);
ALTER TABLE naijue_erp.import_record
  ADD COLUMN source_system text NOT NULL CHECK(source_system ~ '^[a-z][a-z0-9_.:-]*$'),
  ADD CONSTRAINT import_record_batch_namespace FOREIGN KEY(import_batch_id, source_system)
    REFERENCES naijue_erp.import_batch(id, source_name) ON DELETE NO ACTION;
CREATE UNIQUE INDEX import_global_source_identity ON naijue_erp.import_record(source_system, source_entity_type, source_key)
  WHERE target_id IS NOT NULL AND status IN ('ACCEPTED','IMPORTED');
DROP INDEX naijue_erp.import_scope_target_once;
CREATE UNIQUE INDEX import_document_target_once ON naijue_erp.import_record(target_type, target_id)
  WHERE status IN ('ACCEPTED','IMPORTED') AND target_type IN ('SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE');
CREATE INDEX import_record_target_lookup ON naijue_erp.import_record(target_type,target_id);
ALTER TABLE naijue_erp.import_record DROP CONSTRAINT import_record_target_type_check,
  ADD CONSTRAINT import_record_target_type_check CHECK(target_type IN
    ('WAREHOUSE','SKU','INVENTORY_LEDGER','IMPORT_BATCH','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE'));
ALTER TABLE naijue_erp.import_batch DROP CONSTRAINT import_batch_inventory_mode_check,
  ADD CONSTRAINT import_batch_inventory_mode_check CHECK(inventory_mode IN ('CUTOFF_STOCK_BASELINE', 'DOCUMENT_CONVERSION'));
DROP INDEX naijue_erp.import_one_published_cutoff;
CREATE UNIQUE INDEX import_one_published_cutoff ON naijue_erp.import_batch(inventory_mode)
  WHERE status = 'IMPORTED' AND inventory_mode = 'CUTOFF_STOCK_BASELINE';
ALTER TABLE naijue_erp.sales_header
  ADD COLUMN created_by_staff_id uuid REFERENCES naijue_erp.staff(id) ON DELETE NO ACTION,
  ADD COLUMN approved_by_staff_id uuid REFERENCES naijue_erp.staff(id) ON DELETE NO ACTION,
  ALTER COLUMN created_by_account_id DROP NOT NULL,
  ALTER COLUMN created_at DROP NOT NULL,
  ALTER COLUMN updated_at DROP NOT NULL;
ALTER TABLE naijue_erp.transfer_header
  ADD COLUMN created_by_staff_id uuid REFERENCES naijue_erp.staff(id) ON DELETE NO ACTION,
  ADD COLUMN approved_by_staff_id uuid REFERENCES naijue_erp.staff(id) ON DELETE NO ACTION,
  ALTER COLUMN created_by_account_id DROP NOT NULL,
  ALTER COLUMN created_at DROP NOT NULL,
  ALTER COLUMN updated_at DROP NOT NULL,
  ALTER COLUMN created_role DROP NOT NULL;
ALTER TABLE naijue_erp.inventory_ledger
  ADD COLUMN baseline_anchor_operation_id uuid REFERENCES naijue_erp.operation_receipt(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE naijue_erp.sales_line
  ALTER COLUMN allocated_discount DROP NOT NULL, ALTER COLUMN is_gift DROP NOT NULL,
  ALTER COLUMN product_code_snapshot DROP NOT NULL, ALTER COLUMN product_name_snapshot DROP NOT NULL,
  ALTER COLUMN color_name_snapshot DROP NOT NULL, ALTER COLUMN fit_name_snapshot DROP NOT NULL, ALTER COLUMN size_name_snapshot DROP NOT NULL;
ALTER TABLE naijue_erp.transfer_line
  ALTER COLUMN product_code_snapshot DROP NOT NULL, ALTER COLUMN product_name_snapshot DROP NOT NULL,
  ALTER COLUMN color_name_snapshot DROP NOT NULL, ALTER COLUMN fit_name_snapshot DROP NOT NULL, ALTER COLUMN size_name_snapshot DROP NOT NULL;
ALTER TABLE naijue_erp.sales_settlement
  ALTER COLUMN account_name_snapshot DROP NOT NULL, ALTER COLUMN method_name_snapshot DROP NOT NULL;
-- Replace only the original unnamed status/approval CHECK, not money/date/FKs.
DO $approval$
DECLARE rel regclass; c name; found integer;
BEGIN
 FOREACH rel IN ARRAY ARRAY['naijue_erp.sales_header'::regclass,'naijue_erp.transfer_header'::regclass] LOOP
  found:=0;
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid=rel AND contype='c'
    AND pg_get_expr(conbin,conrelid) LIKE '%approved_by_account_id%'
    AND pg_get_expr(conbin,conrelid) LIKE '%approved_at%' LOOP
   EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',rel,c); found:=found+1;
  END LOOP;
  IF found<>1 THEN RAISE EXCEPTION 'UNIFIED27_APPROVAL_CHECK_SHAPE_DIFFERS: %',rel USING ERRCODE='23514'; END IF;
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT unified_approval_state CHECK(status=''APPROVED'' OR (approved_by_account_id IS NULL AND approved_by_staff_id IS NULL AND approved_at IS NULL))',rel);
 END LOOP;
END $approval$;

-- Preserve every previous target/action alternative exactly; only an ordinary
-- MIGRATE_DOCUMENT branch is added. Generated target FKs and reciprocal audit FKs stay.
DO $unions$
DECLARE rel regclass; tag text; constraint_name text; old_expression text;
BEGIN
 FOR rel,tag,constraint_name IN SELECT * FROM (VALUES
  ('naijue_erp.operation_receipt'::regclass,'target_type','receipt_action_by_kind'),
  ('naijue_erp.audit_change'::regclass,'object_type','audit_action_by_kind')) x(r,t,c) LOOP
  SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expression FROM pg_constraint WHERE conrelid=rel AND conname=constraint_name;
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',rel,constraint_name);
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK(((%s) OR (%I IN (''SALES'',''TRANSFER'') AND action=''MIGRATE_DOCUMENT'')) IS TRUE)',rel,constraint_name,old_expression,tag);
 END LOOP;
 -- The original version step CHECK is unnamed and must be found precisely.
 FOR constraint_name IN SELECT conname FROM pg_constraint WHERE conrelid='naijue_erp.audit_change'::regclass AND contype='c'
  AND pg_get_expr(conbin,conrelid) LIKE '%COALESCE(old_version%'
  AND pg_get_expr(conbin,conrelid) LIKE '%new_version%' LOOP
  EXECUTE format('ALTER TABLE naijue_erp.audit_change DROP CONSTRAINT %I',constraint_name);
 END LOOP;
END $unions$;
ALTER TABLE naijue_erp.audit_change ADD CONSTRAINT audit_version_by_action CHECK(
  (action = 'MIGRATE_DOCUMENT' AND old_version IS NULL AND new_version > 0 AND before_values IS NULL AND object_type IN ('SALES','TRANSFER'))
  OR (action <> 'MIGRATE_DOCUMENT' AND new_version = COALESCE(old_version,0)+1));
CREATE UNIQUE INDEX document_migration_anchor_once ON naijue_erp.operation_receipt(target_type, target_id) WHERE action = 'MIGRATE_DOCUMENT';
-- The old result predicate already accepts ordinary target/version/status and
-- exact ledgerEntryIds, without an action whitelist. Keep it unchanged; add the
-- required compact migration metadata with a separate closed action predicate.
ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT migration_result_metadata CHECK(action<>'MIGRATE_DOCUMENT' OR (
  target_type IN ('SALES','TRANSFER') AND result_data ?& ARRAY['batchId','sourceRecordId','exposureDigest','baseline']
  AND result_data->'ledgerEntryIds'='[]'::jsonb
  AND result_data->>'exposureDigest' ~ '^[0-9a-f]{64}$'
  AND jsonb_typeof(result_data->'baseline')='object') IS TRUE);

-- Find only CHECKs whose existing reversal boolean needs the new XOR branch;
-- keep every other conjunct (including the recorded balance pair) unchanged.
DO $reversals$
DECLARE c record; expression text; needle text := '((event_kind = ''UNAPPROVE''::text) = (reverses_entry_id IS NOT NULL))';
BEGIN
 FOR c IN SELECT conname,pg_get_expr(conbin,conrelid) expression FROM pg_constraint
  WHERE conrelid='naijue_erp.inventory_ledger'::regclass AND contype='c'
    AND pg_get_expr(conbin,conrelid) LIKE '%reverses_entry_id IS NOT NULL%' LOOP
  expression:=replace(c.expression,needle,'((event_kind = ''UNAPPROVE''::text) = (num_nonnulls(reverses_entry_id, baseline_anchor_operation_id) = 1))');
  IF expression=c.expression THEN RAISE EXCEPTION 'UNIFIED27_REVERSAL_CHECK_SHAPE_DIFFERS: %',c.conname USING ERRCODE='23514'; END IF;
  EXECUTE format('ALTER TABLE naijue_erp.inventory_ledger DROP CONSTRAINT %I',c.conname);
  EXECUTE format('ALTER TABLE naijue_erp.inventory_ledger ADD CONSTRAINT %I CHECK(%s)',c.conname,expression);
 END LOOP;
END $reversals$;
ALTER TABLE naijue_erp.inventory_ledger ADD CONSTRAINT ledger_reversal_evidence_xor CHECK((
  (event_kind='UNAPPROVE' AND num_nonnulls(reverses_entry_id, baseline_anchor_operation_id) = 1)
  OR (event_kind<>'UNAPPROVE' AND reverses_entry_id IS NULL AND baseline_anchor_operation_id IS NULL)) IS TRUE);
CREATE UNIQUE INDEX baseline_sales_reversal_once ON naijue_erp.inventory_ledger(baseline_anchor_operation_id, source_sales_line_id, endpoint)
  WHERE baseline_anchor_operation_id IS NOT NULL AND source_sales_line_id IS NOT NULL;
CREATE UNIQUE INDEX baseline_transfer_reversal_once ON naijue_erp.inventory_ledger(baseline_anchor_operation_id, source_transfer_line_id, endpoint)
  WHERE baseline_anchor_operation_id IS NOT NULL AND source_transfer_line_id IS NOT NULL;

CREATE FUNCTION naijue_erp.assert_unified_current_actor(account uuid, at_time timestamptz, kind text, target uuid, command text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
DECLARE actor record; h jsonb; target_hall uuid; target_from_hall uuid; target_to_hall uuid;
BEGIN
 SELECT a.id,s.id AS staff_id,s.role,s.hall_id INTO STRICT actor FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id
  LEFT JOIN naijue_erp.hall hall ON hall.id=s.hall_id
  WHERE a.id=account AND a.login_enabled AND s.employment_status='在职' AND (s.hall_id IS NULL OR hall.enabled) FOR SHARE OF a,s;
 IF at_time IS NULL OR (command='MIGRATE_DOCUMENT' AND at_time IS DISTINCT FROM transaction_timestamp()) THEN
  RAISE EXCEPTION 'current command must carry actual transaction actor/time' USING ERRCODE='23514'; END IF;
 IF kind='SALES' THEN
  SELECT to_jsonb(x) INTO STRICT h FROM naijue_erp.sales_header x WHERE id=target;
  target_hall:=(h->>'hall_id')::uuid;
  IF actor.role NOT IN ('ADMIN','WAREHOUSE','SALESPERSON') OR (actor.role='SALESPERSON' AND (actor.hall_id IS NULL OR actor.hall_id IS DISTINCT FROM target_hall OR command='UNAPPROVE'
      OR (command='APPROVE' AND h->>'created_by_account_id' IS DISTINCT FROM account::text))) THEN
   RAISE EXCEPTION 'ordinary sales actor role/hall/unapprove scope denied' USING ERRCODE='42501'; END IF;
 ELSIF kind='TRANSFER' THEN
  SELECT to_jsonb(x),f.hall_id,t.hall_id INTO STRICT h,target_from_hall,target_to_hall
    FROM naijue_erp.transfer_header x JOIN naijue_erp.warehouse f ON f.id=x.from_warehouse_id JOIN naijue_erp.warehouse t ON t.id=x.to_warehouse_id WHERE x.id=target;
  IF actor.role NOT IN ('ADMIN','WAREHOUSE','SALESPERSON') OR (actor.role='SALESPERSON' AND (actor.hall_id IS NULL OR
      (actor.hall_id IS DISTINCT FROM target_from_hall AND actor.hall_id IS DISTINCT FROM target_to_hall
       AND NOT coalesce((h->>'created_role'='SALESPERSON' AND h->>'created_hall_id'=actor.hall_id::text AND h->>'created_by_account_id' IS NOT NULL),false)))) THEN
   RAISE EXCEPTION 'ordinary transfer actor scope denied' USING ERRCODE='42501'; END IF;
 ELSE RAISE EXCEPTION 'ordinary document kind required' USING ERRCODE='23514'; END IF;
 IF command='MIGRATE_DOCUMENT' AND actor.role<>'ADMIN' THEN RAISE EXCEPTION 'document conversion requires current administrator' USING ERRCODE='42501'; END IF;
END $$;

-- A typed migration snapshot is immutable evidence only, never the read model.
-- Numeric quantities and money are encoded as exact decimal strings.
CREATE FUNCTION naijue_erp.unified_document_snapshot(kind text,target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE h jsonb; lines jsonb; settlements jsonb;
BEGIN
 IF kind='SALES' THEN
  SELECT to_jsonb(x)||jsonb_build_object('gross_amount',x.gross_amount::text,'order_discount',x.order_discount::text,'net_due',x.net_due::text)
    INTO STRICT h FROM naijue_erp.sales_header x WHERE id=target;
  SELECT coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('quantity',x.quantity::text,'reference_price',x.reference_price::text,'deal_price',x.deal_price::text,
    'line_amount',x.line_amount::text,'allocated_discount',x.allocated_discount::text) ORDER BY x.line_no,x.id),'[]') INTO lines FROM naijue_erp.sales_line x WHERE sales_id=target;
  SELECT coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('amount',x.amount::text) ORDER BY x.line_no,x.id),'[]') INTO settlements FROM naijue_erp.sales_settlement x WHERE sales_id=target;
 ELSIF kind='TRANSFER' THEN
  SELECT to_jsonb(x) INTO STRICT h FROM naijue_erp.transfer_header x WHERE id=target;
  SELECT coalesce(jsonb_agg((to_jsonb(x)-'current_line_no')||jsonb_build_object('quantity',x.quantity::text) ORDER BY x.line_no,x.id),'[]') INTO lines FROM naijue_erp.transfer_line x WHERE transfer_id=target;
  settlements:='[]';
 ELSE RAISE EXCEPTION 'ordinary snapshot kind required' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('header',h,'lines',lines,'settlements',settlements);
END $$;

CREATE FUNCTION naijue_erp.assert_document_migration(operation uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; b naijue_erp.import_batch%ROWTYPE;
 s naijue_erp.import_record%ROWTYPE; baseline naijue_erp.import_batch%ROWTYPE; snap jsonb; evidence jsonb; h jsonb; expected_type text;
BEGIN
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=operation;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
 snap:=naijue_erp.unified_document_snapshot(r.target_type,r.target_id); h:=snap->'header';
 SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=(h->>'import_batch_id')::uuid;
 SELECT * INTO STRICT s FROM naijue_erp.import_record WHERE id=(r.result_data->>'sourceRecordId')::uuid;
 evidence:=a.after_values->'baseline';
 SELECT * INTO STRICT baseline FROM naijue_erp.import_batch WHERE id=(evidence->>'baselineBatchId')::uuid;
 expected_type:=CASE r.target_type WHEN 'SALES' THEN 'SALES_HEADER' WHEN 'TRANSFER' THEN 'TRANSFER_HEADER' END;
 IF r.action<>'MIGRATE_DOCUMENT' OR r.status<>'COMMITTED' OR r.target_type NOT IN ('SALES','TRANSFER')
  OR b.inventory_mode<>'DOCUMENT_CONVERSION' OR b.mapping_version<>'DOCUMENT_CONVERSION_V1' OR b.status NOT IN ('STAGED','VALIDATING','IMPORTED')
  OR r.result_data->>'batchId' IS DISTINCT FROM b.id::text OR s.import_batch_id<>b.id OR s.source_system<>b.source_name
  OR s.target_type IS DISTINCT FROM expected_type OR s.target_id IS DISTINCT FROM r.target_id OR s.status<>'IMPORTED'
  OR s.reviewed_at IS NULL OR s.source_entity_type IS DISTINCT FROM expected_type
  OR a.object_type<>r.target_type OR a.object_id<>r.target_id OR a.action<>r.action OR a.actor_account_id<>r.actor_account_id
  OR a.occurred_at IS DISTINCT FROM r.completed_at OR a.old_version IS NOT NULL OR a.before_values IS NOT NULL
  OR a.new_version::text IS DISTINCT FROM h->>'version' OR r.result_data->>'version' IS DISTINCT FROM h->>'version'
  OR r.result_data->>'status' IS DISTINCT FROM h->>'status' OR r.result_data->'ledgerEntryIds'<>'[]'
  OR (a.after_values - ARRAY['baseline','sourceRecordId']) IS DISTINCT FROM snap
  OR a.after_values->>'sourceRecordId' IS DISTINCT FROM s.id::text OR r.result_data->'baseline' IS DISTINCT FROM evidence
  OR r.result_data->>'exposureDigest' IS DISTINCT FROM encode(sha256(convert_to(snap::text,'UTF8')),'hex')
  OR h->>'stock_basis'<>'CUTOFF_HISTORY' OR baseline.inventory_mode<>'CUTOFF_STOCK_BASELINE' OR baseline.status<>'IMPORTED'
  OR evidence->>'state' IS DISTINCT FROM 'CONFIRMED' OR evidence->>'baselineManifestSha256' IS DISTINCT FROM baseline.source_hash
  OR (evidence->>'cutoffAt')::timestamptz IS DISTINCT FROM baseline.cutoff_at OR b.cutoff_at IS DISTINCT FROM baseline.cutoff_at
  OR (evidence->>'coverageDigest' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true
  OR (evidence - ARRAY['state','baselineBatchId','baselineManifestSha256','cutoffAt','coverageDigest'])<>'{}' THEN
  RAISE EXCEPTION 'migration requires exact typed ordinary snapshot, source/baseline coverage, actor, version and audit' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE operation_id=r.id) OR EXISTS(SELECT 1 FROM naijue_erp.inventory_balance WHERE last_operation_id=r.id) THEN
  RAISE EXCEPTION 'migration creates no inventory effects' USING ERRCODE='23514'; END IF;
 PERFORM naijue_erp.assert_unified_current_actor(r.actor_account_id,r.completed_at,r.target_type,r.target_id,r.action);
 -- All actual detail identities are mapped once, including zero-quantity lines and
 -- every settlement occurrence; many-to-one SKU aliases remain legal separately.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'lines') item WHERE NOT EXISTS(SELECT 1 FROM naijue_erp.import_record m
   WHERE m.import_batch_id=b.id AND m.status='IMPORTED' AND m.target_type=CASE r.target_type WHEN 'SALES' THEN 'SALES_LINE' ELSE 'TRANSFER_LINE' END
     AND m.source_entity_type=m.target_type AND m.target_id=(item->>'id')::uuid))
  OR (r.target_type='SALES' AND EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'settlements') item WHERE NOT EXISTS(SELECT 1 FROM naijue_erp.import_record m
    WHERE m.import_batch_id=b.id AND m.status='IMPORTED' AND m.target_type='SALES_SETTLEMENT' AND m.source_entity_type=m.target_type AND m.target_id=(item->>'id')::uuid))) THEN
  RAISE EXCEPTION 'migration requires complete stable detail/settlement source mappings' USING ERRCODE='23514'; END IF;
END $$;

CREATE FUNCTION naijue_erp.assert_document_conversion_batch(next_row naijue_erp.import_batch, prior jsonb, mutation text, final_state boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
DECLARE kind text; actual bigint; total numeric:=0; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
BEGIN
 PERFORM naijue_erp.cutoff_import_lock();
 IF mutation='DELETE' OR next_row.inventory_mode<>'DOCUMENT_CONVERSION' OR next_row.mapping_version<>'DOCUMENT_CONVERSION_V1'
   OR next_row.history_payload_hash IS NOT NULL OR next_row.history_expected_counts IS NOT NULL
   OR next_row.history_actual_counts IS NOT NULL OR next_row.history_validation_passed IS TRUE
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE' AND cutoff_at=next_row.cutoff_at)
   OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE source_import_batch_id=next_row.id)
   OR EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r JOIN naijue_erp.inventory_ledger l ON l.operation_id=r.id WHERE r.target_type='IMPORT' AND r.target_id=next_row.id) THEN
  RAISE EXCEPTION 'conversion cannot post or rebaseline inventory; one exact previously published cutoff is required' USING ERRCODE='23514'; END IF;
 IF mutation='INSERT' THEN
  IF next_row.status<>'STAGED' OR next_row.checkpoint->>'sequence'<>'0' OR next_row.checkpoint->>'cursor'<>'0' THEN
   RAISE EXCEPTION 'conversion must stage at zero' USING ERRCODE='23514'; END IF;
 ELSE
  IF prior IS NULL OR prior->>'status' IN ('IMPORTED','FAILED')
    OR (to_jsonb(next_row)-ARRAY['status','checkpoint','completed_at']) IS DISTINCT FROM (prior-ARRAY['status','checkpoint','completed_at'])
    OR next_row.checkpoint->'expected' IS DISTINCT FROM prior->'checkpoint'->'expected'
    OR (next_row.checkpoint->>'sequence')::numeric<>(prior->'checkpoint'->>'sequence')::numeric+1
    OR (next_row.checkpoint->>'cursor')::numeric<(prior->'checkpoint'->>'cursor')::numeric
    OR next_row.status NOT IN ('VALIDATING','IMPORTED','FAILED') THEN
   RAISE EXCEPTION 'immutable conversion source or invalid checkpoint/state transition' USING ERRCODE='23514'; END IF;
 END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(next_row.checkpoint->'expected'))<>6
  OR (SELECT count(*) FROM jsonb_object_keys(next_row.checkpoint->'counts'))<>6 THEN
  RAISE EXCEPTION 'conversion requires exactly six ordinary target counters' USING ERRCODE='23514'; END IF;
 FOREACH kind IN ARRAY ARRAY['SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE','IMPORT_BATCH'] LOOP
  IF jsonb_typeof(next_row.checkpoint->'expected'->kind) IS DISTINCT FROM 'number'
   OR jsonb_typeof(next_row.checkpoint->'counts'->kind) IS DISTINCT FROM 'number'
   OR (next_row.checkpoint->'expected'->>kind ~ '^[0-9]+$') IS DISTINCT FROM true
   OR (next_row.checkpoint->'counts'->>kind ~ '^[0-9]+$') IS DISTINCT FROM true
   OR (next_row.checkpoint->'counts'->>kind)::numeric>(next_row.checkpoint->'expected'->>kind)::numeric
   OR (prior IS NOT NULL AND (next_row.checkpoint->'counts'->>kind)::numeric<(prior->'checkpoint'->'counts'->>kind)::numeric) THEN
   RAISE EXCEPTION 'conversion counter type/range/monotonicity mismatch' USING ERRCODE='23514'; END IF;
  total:=total+(next_row.checkpoint->'counts'->>kind)::numeric;
  IF final_state THEN
   SELECT count(*) INTO actual FROM naijue_erp.import_record WHERE import_batch_id=next_row.id AND target_type=kind AND status='IMPORTED';
   IF actual::numeric<>(next_row.checkpoint->'counts'->>kind)::numeric THEN
    RAISE EXCEPTION 'conversion counters must equal exact committed ordinary identities: %',kind USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 IF total<>(next_row.checkpoint->>'cursor')::numeric OR next_row.checkpoint->'expected'->>'IMPORT_BATCH'<>'1' THEN
  RAISE EXCEPTION 'conversion exact cursor/final approval scope mismatch' USING ERRCODE='23514'; END IF;
 IF NOT final_state THEN RETURN; END IF;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND object_id=next_row.id AND new_version=(next_row.checkpoint->>'sequence')::integer+1;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
 IF a.after_values IS DISTINCT FROM next_row.checkpoint OR a.actor_account_id<>r.actor_account_id OR a.occurred_at IS DISTINCT FROM r.completed_at
   OR r.target_type<>'IMPORT' OR r.target_id<>next_row.id OR r.result_data->>'sequence' IS DISTINCT FROM next_row.checkpoint->>'sequence'
   OR r.result_data->>'cursor' IS DISTINCT FROM next_row.checkpoint->>'cursor' OR r.result_data->>'status' IS DISTINCT FROM next_row.status
   OR (mutation='INSERT' AND (a.old_version IS NOT NULL OR a.before_values IS NOT NULL OR r.action<>'IMPORT_STAGE'))
   OR (mutation='UPDATE' AND (a.old_version IS DISTINCT FROM (prior->'checkpoint'->>'sequence')::integer+1 OR a.before_values IS DISTINCT FROM prior->'checkpoint'))
   OR r.action IS DISTINCT FROM (CASE next_row.status WHEN 'STAGED' THEN 'IMPORT_STAGE' WHEN 'IMPORTED' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
   OR r.result_data->'ledgerEntryIds'<>'[]'
   OR (next_row.status='IMPORTED' AND next_row.completed_at IS DISTINCT FROM r.completed_at) THEN
  RAISE EXCEPTION 'conversion checkpoint requires its exact atomic import audit/receipt' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM naijue_erp.user_account ua JOIN naijue_erp.staff st ON st.id=ua.staff_id
   WHERE ua.id=r.actor_account_id AND ua.login_enabled AND st.employment_status='在职' AND st.role='ADMIN')
  OR r.completed_at IS DISTINCT FROM transaction_timestamp() THEN
  RAISE EXCEPTION 'conversion batch requires actual current administrator and transaction time' USING ERRCODE='42501'; END IF;
 IF next_row.status='IMPORTED' THEN
  IF next_row.checkpoint->'counts' IS DISTINCT FROM next_row.checkpoint->'expected'
    OR EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=next_row.id AND status NOT IN ('IMPORTED','EXCLUDED'))
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=next_row.id AND target_type='IMPORT_BATCH' AND target_id=next_row.id
      AND status='IMPORTED' AND source_entity_type='DOCUMENT_CONVERSION_APPROVAL' AND source_key='FINAL_DOCUMENT_CONVERSION'
      AND source_record_hash=next_row.source_hash AND source_file_ref=next_row.source_manifest_ref
      AND decision_reason='DOCUMENT_CONVERSION_V1;CURRENT_EFFECTIVE;ARCHIVE_RESTORE_VERIFIED;BASELINE_COVERAGE_CONFIRMED;NO_REBASELINE;NO_UNRESOLVED_EXCEPTIONS')
    OR EXISTS(SELECT 1 FROM naijue_erp.import_record m WHERE m.import_batch_id=next_row.id AND m.status='IMPORTED'
      AND m.target_type IN ('SALES_HEADER','TRANSFER_HEADER') AND NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt anchor
        WHERE anchor.action='MIGRATE_DOCUMENT' AND anchor.target_id=m.target_id
          AND anchor.target_type=CASE m.target_type WHEN 'SALES_HEADER' THEN 'SALES' ELSE 'TRANSFER' END)) THEN
   RAISE EXCEPTION 'conversion publication requires complete ordinary anchors and exact retained approval/archive evidence' USING ERRCODE='23514'; END IF;
 END IF;
END $$;

CREATE FUNCTION naijue_erp.guard_unified_document() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
DECLARE n jsonb:=to_jsonb(NEW); o jsonb:=to_jsonb(OLD); immutable text[];
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ordinary document identity and audit linkage are retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.import_batch_id IS NULL THEN
   SELECT staff_id INTO STRICT NEW.created_by_staff_id FROM naijue_erp.user_account WHERE id=NEW.created_by_account_id;
   IF NEW.stock_basis<>'RUNTIME_LEDGER' OR NEW.version<>1 OR NEW.status<>'DRAFT' OR NEW.created_by_account_id IS NULL OR NEW.created_at IS NULL OR NEW.updated_at IS NULL THEN
    RAISE EXCEPTION 'new ordinary document requires actual version1 draft creator/time' USING ERRCODE='23514'; END IF;
  ELSIF NEW.stock_basis<>'CUTOFF_HISTORY' OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id
       AND inventory_mode='DOCUMENT_CONVERSION' AND mapping_version='DOCUMENT_CONVERSION_V1' AND status IN ('STAGED','VALIDATING')) THEN
   RAISE EXCEPTION 'imported ordinary document requires its closed standard conversion batch' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.import_batch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=OLD.import_batch_id AND inventory_mode='DOCUMENT_CONVERSION' AND status='IMPORTED') THEN
   RAISE EXCEPTION 'unpublished converted ordinary documents cannot accept commands' USING ERRCODE='23514'; END IF;
  IF NEW.status='APPROVED' THEN
   SELECT staff_id INTO STRICT NEW.approved_by_staff_id FROM naijue_erp.user_account WHERE id=NEW.approved_by_account_id;
  ELSE NEW.approved_by_staff_id:=NULL; END IF;
  immutable:=ARRAY['id','number','stock_basis','import_batch_id','created_by_account_id','created_by_staff_id','created_hall_id','created_at'];
  IF TG_TABLE_NAME='transfer_header' THEN immutable:=array_append(immutable,'created_role'); END IF;
  IF EXISTS(SELECT 1 FROM unnest(immutable) key WHERE n->key IS DISTINCT FROM o->key)
    OR NEW.version::bigint<>OLD.version::bigint+1 OR OLD.status='VOID'
    OR (OLD.status='APPROVED' AND NEW.status<>'DRAFT') THEN
   RAISE EXCEPTION 'ordinary document immutable origin, status or version mismatch' USING ERRCODE='23514'; END IF;
  IF NOT(OLD.status='DRAFT' AND NEW.status='DRAFT') AND (n-ARRAY['status','version','updated_at','approved_by_account_id','approved_by_staff_id','approved_at'])
       IS DISTINCT FROM (o-ARRAY['status','version','updated_at','approved_by_account_id','approved_by_staff_id','approved_at']) THEN
   RAISE EXCEPTION 'posting actions cannot edit ordinary business facts' USING ERRCODE='23514'; END IF;
  IF n->'responsible_staff_id' IS DISTINCT FROM o->'responsible_staff_id' AND (OLD.status<>'DRAFT' OR NEW.status<>'DRAFT' OR n->>'responsible_staff_id' IS NULL) THEN
   RAISE EXCEPTION 'responsibility changes require actual staff on draft SAVE' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
-- Replacement guards are fully constrained, not a disable-all-green path.
DROP TRIGGER sales_cutoff_freeze ON naijue_erp.sales_header;
CREATE TRIGGER sales_cutoff_freeze BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.sales_header FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_unified_document();
DROP TRIGGER transfer_header_provenance ON naijue_erp.transfer_header;
CREATE TRIGGER transfer_header_provenance BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.transfer_header FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_unified_document();

CREATE OR REPLACE FUNCTION naijue_erp.freeze_cutoff_sales_detail() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
DECLARE h naijue_erp.sales_header%ROWTYPE; owner_id uuid;
BEGIN
 IF TG_OP='DELETE' THEN owner_id:=OLD.sales_id; ELSE owner_id:=NEW.sales_id; END IF;
 SELECT * INTO STRICT h FROM naijue_erp.sales_header WHERE id=owner_id FOR UPDATE;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.sales_id IS DISTINCT FROM OLD.sales_id) THEN
  RAISE EXCEPTION 'ordinary detail identity/owner cannot move' USING ERRCODE='23514'; END IF;
 IF h.status<>'DRAFT' AND NOT (TG_OP='INSERT' AND EXISTS(SELECT 1 FROM naijue_erp.import_batch b WHERE b.id=h.import_batch_id AND b.inventory_mode='DOCUMENT_CONVERSION' AND b.status IN ('STAGED','VALIDATING'))) THEN
  RAISE EXCEPTION 'ordinary details may only change in draft SAVE, except exact initial conversion' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN
  IF TG_TABLE_NAME='sales_line' THEN RAISE EXCEPTION 'ordinary line identities are retained; deactivate lines rather than delete' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_sales_settlement() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
DECLARE target uuid; h naijue_erp.sales_header%ROWTYPE; total numeric; evidence naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='sales_header' THEN target:=NEW.id; ELSIF TG_OP='DELETE' THEN target:=OLD.sales_id; ELSE target:=NEW.sales_id; END IF;
 SELECT * INTO STRICT h FROM naijue_erp.sales_header WHERE id=target;
 SELECT * INTO STRICT evidence FROM naijue_erp.audit_change WHERE object_type='SALES' AND object_id=target AND new_version=h.version;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=evidence.operation_id;
 SELECT coalesce(sum(CASE direction WHEN 'RECEIVE' THEN amount ELSE -amount END),0) INTO total FROM naijue_erp.sales_settlement WHERE sales_id=target;
 -- Preserve unresolved original amounts/status in CLEANED plus exceptions;
 -- never fabricate settlement rows or admit an unbalanced APPROVED target.
 -- DRAFT remains allowed to be unbalanced. Migration does not bypass approval.
 IF h.status='APPROVED' AND total IS DISTINCT FROM h.net_due THEN
  RAISE EXCEPTION 'ordinary approved state requires settlement net equal to net due' USING ERRCODE='23514'; END IF;
 IF evidence.action='MIGRATE_DOCUMENT' THEN PERFORM naijue_erp.assert_document_migration(r.id); RETURN NULL; END IF;
 IF TG_TABLE_NAME='sales_header' AND (TG_OP='INSERT' OR to_jsonb(NEW)->'responsible_staff_id' IS DISTINCT FROM to_jsonb(OLD)->'responsible_staff_id') THEN
  IF evidence.action<>'SAVE' OR r.action<>'SAVE' OR r.target_type<>'SALES' OR r.target_id<>target OR r.actor_account_id<>evidence.actor_account_id
    OR evidence.after_values->'header'->'responsibleStaffId' IS DISTINCT FROM to_jsonb(h)->'responsible_staff_id' THEN
   RAISE EXCEPTION 'ordinary responsibility requires matching SAVE audit/receipt' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (evidence.old_version IS DISTINCT FROM OLD.version OR evidence.before_values->'header'->'responsibleStaffId' IS DISTINCT FROM to_jsonb(OLD)->'responsible_staff_id') THEN
   RAISE EXCEPTION 'ordinary responsibility before evidence mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION naijue_erp.validate_unified_baseline_reversal() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; h jsonb; line jsonb; expected numeric; kind text; owner_id uuid; matches bigint;
BEGIN
 IF NEW.baseline_anchor_operation_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=NEW.baseline_anchor_operation_id;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
 kind:=CASE WHEN NEW.source_sales_line_id IS NOT NULL THEN 'SALES' ELSE 'TRANSFER' END;
 IF kind='SALES' THEN SELECT sales_id INTO STRICT owner_id FROM naijue_erp.sales_line WHERE id=NEW.source_sales_line_id;
  SELECT to_jsonb(x) INTO STRICT h FROM naijue_erp.sales_header x WHERE id=owner_id FOR UPDATE;
 ELSE SELECT transfer_id INTO STRICT owner_id FROM naijue_erp.transfer_line WHERE id=NEW.source_transfer_line_id;
  SELECT to_jsonb(x) INTO STRICT h FROM naijue_erp.transfer_header x WHERE id=owner_id FOR UPDATE;
 END IF;
 SELECT count(*),jsonb_agg(value)->0 INTO matches,line FROM jsonb_array_elements(a.after_values->'lines') WHERE value->>'id'=coalesce(NEW.source_sales_line_id,NEW.source_transfer_line_id)::text;
 expected:=CASE NEW.endpoint WHEN 'SALES_WAREHOUSE' THEN (line->>'quantity')::numeric WHEN 'FROM' THEN (line->>'quantity')::numeric WHEN 'TO' THEN -(line->>'quantity')::numeric ELSE NULL END;
 IF NEW.event_kind<>'UNAPPROVE' OR NEW.reverses_entry_id IS NOT NULL OR r.action<>'MIGRATE_DOCUMENT' OR r.target_type<>kind OR r.target_id<>owner_id
   OR r.status<>'COMMITTED' OR a.action<>r.action OR a.actor_account_id<>r.actor_account_id OR a.object_id<>r.target_id OR a.object_type<>r.target_type
   OR a.occurred_at IS DISTINCT FROM r.completed_at OR a.old_version IS NOT NULL OR a.new_version::text IS DISTINCT FROM h->>'version'
   OR h->>'status'<>'APPROVED' OR h->>'stock_basis'<>'CUTOFF_HISTORY' OR a.after_values->'header'->>'status'<>'APPROVED'
   OR (h->>'version')::bigint+1<>NEW.source_document_version OR matches<>1 OR line->>'is_current'<>'true'
   OR line->>'sku_id' IS DISTINCT FROM NEW.sku_id::text OR a.after_values->'header'->>'business_date' IS DISTINCT FROM NEW.business_date::text
   OR NEW.quantity_delta::numeric IS DISTINCT FROM expected
   OR NEW.warehouse_id::text IS DISTINCT FROM (CASE NEW.endpoint WHEN 'SALES_WAREHOUSE' THEN a.after_values->'header'->>'warehouse_id'
       WHEN 'FROM' THEN a.after_values->'header'->>'from_warehouse_id' WHEN 'TO' THEN a.after_values->'header'->>'to_warehouse_id' END)
   OR a.after_values->'baseline'->>'state' IS DISTINCT FROM 'CONFIRMED'
   OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE (source_sales_line_id=NEW.source_sales_line_id OR source_transfer_line_id=NEW.source_transfer_line_id)
       AND event_kind='APPROVE') THEN
  RAISE EXCEPTION 'baseline reversal must match exact first approved ordinary exposure, line, endpoint, quantity and version' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER baseline_reversal_source BEFORE INSERT ON naijue_erp.inventory_ledger FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_unified_baseline_reversal();

-- Every current operation is still the same ordinary actor/version/receipt path.
CREATE FUNCTION naijue_erp.validate_unified_ordinary_operation() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
DECLARE a naijue_erp.audit_change%ROWTYPE; h jsonb; staff_id uuid; effects bigint; expected bigint;
BEGIN
 IF NEW.target_type NOT IN ('SALES','TRANSFER') THEN RETURN NULL; END IF;
 IF NEW.action='MIGRATE_DOCUMENT' THEN PERFORM naijue_erp.assert_document_migration(NEW.id); RETURN NULL; END IF;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=NEW.id;
 IF NEW.target_type='SALES' THEN SELECT to_jsonb(x) INTO STRICT h FROM naijue_erp.sales_header x WHERE id=NEW.target_id;
 ELSE SELECT to_jsonb(x) INTO STRICT h FROM naijue_erp.transfer_header x WHERE id=NEW.target_id; END IF;
 SELECT ua.staff_id INTO STRICT staff_id FROM naijue_erp.user_account ua WHERE ua.id=NEW.actor_account_id;
 PERFORM naijue_erp.assert_unified_current_actor(NEW.actor_account_id,NEW.completed_at,NEW.target_type,NEW.target_id,NEW.action);
 IF a.object_type<>NEW.target_type OR a.object_id<>NEW.target_id OR a.action<>NEW.action OR a.actor_account_id<>NEW.actor_account_id
  OR h->>'status' IS DISTINCT FROM (CASE NEW.action WHEN 'APPROVE' THEN 'APPROVED' WHEN 'VOID' THEN 'VOID' ELSE 'DRAFT' END)
  OR a.occurred_at IS DISTINCT FROM NEW.completed_at OR a.new_version::text IS DISTINCT FROM h->>'version'
  OR NEW.result_data->>'version' IS DISTINCT FROM h->>'version' OR NEW.result_data->>'status' IS DISTINCT FROM h->>'status'
  OR (h->>'updated_at')::timestamptz IS DISTINCT FROM NEW.completed_at
  OR (NEW.action='APPROVE' AND (h->>'approved_by_account_id' IS DISTINCT FROM NEW.actor_account_id::text
    OR h->>'approved_by_staff_id' IS DISTINCT FROM staff_id::text OR (h->>'approved_at')::timestamptz IS DISTINCT FROM NEW.completed_at))
  OR (a.old_version IS NOT NULL AND (a.new_version<>a.old_version+1 OR (NEW.target_type='SALES' AND NEW.action IN ('APPROVE','UNAPPROVE','VOID')
     AND a.before_values->'header'->>'status' IS DISTINCT FROM (CASE NEW.action WHEN 'UNAPPROVE' THEN 'APPROVED' ELSE 'DRAFT' END))))
  OR (a.old_version IS NULL AND (NEW.action<>'SAVE' OR h->>'version'<>'1' OR h->>'created_by_account_id' IS DISTINCT FROM NEW.actor_account_id::text
    OR h->>'created_by_staff_id' IS DISTINCT FROM staff_id::text OR (h->>'created_at')::timestamptz IS DISTINCT FROM NEW.completed_at))
  OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=NEW.id AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
  OR NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE operation_id=NEW.id AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN
  RAISE EXCEPTION 'ordinary operation requires real current actor/time, exact final state and same-transaction audit/receipt' USING ERRCODE='23514'; END IF;
 -- Sales approval/unapproval must cover each actual NONZERO line once, including
 -- duplicate SKU occurrences; no stock row is invented for zero quantities.
 IF NEW.target_type='SALES' THEN
  SELECT count(*) INTO expected FROM naijue_erp.sales_line WHERE sales_id=NEW.target_id AND is_current AND quantity<>0;
  SELECT count(*) INTO effects FROM naijue_erp.inventory_ledger WHERE operation_id=NEW.id;
  IF NEW.action IN ('APPROVE','UNAPPROVE') AND (effects<>expected OR EXISTS(SELECT 1 FROM naijue_erp.sales_line ln WHERE sales_id=NEW.target_id AND is_current AND quantity<>0
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE operation_id=NEW.id AND source_sales_line_id=ln.id AND endpoint='SALES_WAREHOUSE'
      AND quantity_delta::numeric=ln.quantity::numeric*CASE NEW.action WHEN 'APPROVE' THEN -1 ELSE 1 END))) THEN
   RAISE EXCEPTION 'ordinary sales requires exact nonzero source-line effects' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER unified_ordinary_operation_consistency AFTER INSERT ON naijue_erp.operation_receipt
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(NEW.target_type IN ('SALES','TRANSFER')) EXECUTE FUNCTION naijue_erp.validate_unified_ordinary_operation();

-- Explicit successors retain all non-conversion predecessor validation.

CREATE OR REPLACE FUNCTION naijue_erp.guard_import_batch() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
BEGIN
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    PERFORM naijue_erp.assert_document_conversion_batch(NEW,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,false); RETURN NEW;
  END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'import batch is retained' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'STAGED' OR NEW.checkpoint->>'sequence' <> '0' OR NEW.checkpoint->>'cursor' <> '0'
      OR EXISTS (SELECT 1 FROM naijue_erp.import_batch WHERE status = 'IMPORTED') THEN
      RAISE EXCEPTION 'import must start staged at a stable zero checkpoint' USING ERRCODE = '23514'; END IF;
  ELSE
    IF OLD.status IN ('IMPORTED', 'FAILED') OR ROW(NEW.id, NEW.source_name, NEW.source_manifest_ref, NEW.source_hash, NEW.cutoff_at, NEW.mapping_version, NEW.inventory_mode, NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id, OLD.source_name, OLD.source_manifest_ref, OLD.source_hash, OLD.cutoff_at, OLD.mapping_version, OLD.inventory_mode, OLD.created_at)
      OR (NEW.checkpoint->'expected' IS DISTINCT FROM OLD.checkpoint->'expected' AND NOT (OLD.history_payload_hash IS NULL AND OLD.history_expected_counts IS NULL AND OLD.checkpoint->'expected'='{}'::jsonb AND NEW.history_payload_hash IS NOT NULL AND NEW.history_expected_counts IS NOT NULL AND NEW.status='STAGED'))
      OR (NEW.checkpoint->>'sequence')::bigint <> (OLD.checkpoint->>'sequence')::bigint + 1
      OR (NEW.checkpoint->>'cursor')::bigint < (OLD.checkpoint->>'cursor')::bigint THEN
      RAISE EXCEPTION 'immutable source or invalid checkpoint transition' USING ERRCODE = '23514'; END IF;
    IF NEW.status = 'IMPORTED' THEN PERFORM naijue_erp.validate_import_publish(NEW.id, NEW.checkpoint); END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_import_batch_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE core_operation uuid; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; kind text; processed numeric; counted numeric := 0;
BEGIN
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    PERFORM naijue_erp.assert_document_conversion_batch(NEW,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,true); RETURN NULL;
  END IF;
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
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    PERFORM naijue_erp.assert_document_conversion_batch(NEW,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,true); RETURN NULL;
  END IF;
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

CREATE OR REPLACE FUNCTION naijue_erp.guard_history_publication() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE kind text; actual bigint;
BEGIN
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    IF NEW.mapping_version<>'DOCUMENT_CONVERSION_V1' OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE batch_id=NEW.id) THEN
      RAISE EXCEPTION 'standard conversion cannot enter the legacy raw/history publication pipeline' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  -- Legacy published batches remain valid. No alternative mapping can carry this data.
  IF NEW.mapping_version <> 'V2_HISTORY_NULLABLE_1' THEN
    IF NEW.history_expected_counts IS NOT NULL OR NEW.history_actual_counts IS NOT NULL OR NEW.history_payload_hash IS NOT NULL OR NEW.history_validation_passed THEN
      RAISE EXCEPTION 'history metadata requires the explicit v2 mapping' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  IF NEW.history_expected_counts IS NULL AND NEW.history_payload_hash IS NULL THEN
    IF NEW.status<>'STAGED' OR NEW.completed_at IS NOT NULL OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed
      OR NEW.checkpoint->'expected'<>'{}'::jsonb THEN RAISE EXCEPTION 'Only closed unbound CORE structure may omit future full metadata' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND OLD.history_expected_counts IS NULL AND OLD.history_payload_hash IS NULL THEN
    IF NEW.status<>'STAGED' OR NEW.completed_at IS NOT NULL OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed
      OR NOT naijue_erp.valid_history_counts(NEW.history_expected_counts) OR NEW.history_payload_hash !~ '^[a-f0-9]{64}$'
      OR NEW.checkpoint->'counts' IS DISTINCT FROM OLD.checkpoint->'counts' OR NEW.checkpoint->'cursor' IS DISTINCT FROM OLD.checkpoint->'cursor' THEN
      RAISE EXCEPTION 'Full binding changes only one real metadata/expected/sequence transition' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.history_expected_counts IS NULL OR NEW.history_payload_hash IS NULL THEN
    RAISE EXCEPTION 'v2 requires frozen expected counts and exact payload hash at staging' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.history_expected_counts IS DISTINCT FROM OLD.history_expected_counts
    OR NEW.history_payload_hash IS DISTINCT FROM OLD.history_payload_hash) THEN
    RAISE EXCEPTION 'historical input identity cannot change on retry' USING ERRCODE = '23514'; END IF;
  IF NEW.status <> 'IMPORTED' THEN RETURN NEW; END IF;
  IF NOT NEW.history_validation_passed OR NEW.history_actual_counts IS DISTINCT FROM NEW.history_expected_counts THEN
    RAISE EXCEPTION 'historical validation and exact counts required for atomic publication' USING ERRCODE = '23514'; END IF;
  FOREACH kind IN ARRAY ARRAY['history_sales_header','history_sales_line','history_sales_settlement','history_transfer_header','history_transfer_line','import_source_row','import_sku_alias','import_stock_contributor'] LOOP
    EXECUTE format('SELECT count(*) FROM naijue_erp.%I WHERE batch_id = $1', kind) INTO actual USING NEW.id;
    IF actual::numeric <> (NEW.history_expected_counts->>kind)::numeric THEN
      RAISE EXCEPTION 'historical table count mismatch: %', kind USING ERRCODE = '23514'; END IF;
  END LOOP;
  PERFORM naijue_erp.validate_history_product_proofs(NEW.id);
  -- Only imported SKU bindings; no PRODUCT carrier or native barcode schema change.
  SELECT count(*) INTO actual FROM naijue_erp.import_source_row s
    JOIN naijue_erp.sku_barcode bc ON bc.barcode = s.field_provenance->>'native_barcode'
      AND bc.sku_id::text = s.field_provenance->>'native_sku_id'
    WHERE s.batch_id = NEW.id AND s.entity_type = 'BARCODE';
  IF actual::numeric <> (NEW.history_expected_counts->>'barcodes')::numeric
    OR actual <> (SELECT count(*) FROM naijue_erp.import_source_row WHERE batch_id = NEW.id AND entity_type = 'BARCODE') THEN
    RAISE EXCEPTION 'SKU barcode evidence does not reconcile' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.history_sales_header WHERE batch_id = NEW.id AND business_date IS NULL)
    OR EXISTS (SELECT 1 FROM naijue_erp.history_transfer_header WHERE batch_id = NEW.id AND business_date IS NULL) THEN
    RAISE EXCEPTION 'unresolved business dates cannot publish' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.import_sku_alias a WHERE a.batch_id = NEW.id AND NOT EXISTS (
    SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = a.batch_id AND r.target_type = 'SKU'
      AND r.status = 'IMPORTED' AND r.target_id = a.canonical_sku_id AND r.source_key = a.canonical_source_key)) THEN
    RAISE EXCEPTION 'alias canonical source does not match native imported scope' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.import_stock_contributor c JOIN naijue_erp.import_source_row s ON s.id = c.source_row_id
    WHERE c.batch_id = NEW.id AND NOT EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = c.batch_id
      AND r.target_type = 'WAREHOUSE' AND r.status = 'IMPORTED' AND r.target_id = c.warehouse_id
      AND r.source_key = s.field_provenance->'stock_contribution'->>'warehouseSourceId')) THEN
    RAISE EXCEPTION 'contributor source warehouse does not match native imported scope' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.import_stock_contributor c LEFT JOIN naijue_erp.inventory_ledger l ON l.id = c.baseline_ledger_id
    WHERE c.batch_id = NEW.id AND (l.id IS NULL OR l.event_kind <> 'CUTOFF_BASELINE' OR l.source_import_batch_id <> c.batch_id
      OR l.warehouse_id <> c.warehouse_id OR l.sku_id <> c.canonical_sku_id
      OR NOT EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = c.batch_id
        AND r.target_type = 'INVENTORY_LEDGER' AND r.status = 'IMPORTED' AND r.target_id = c.baseline_ledger_id
        AND r.source_key = c.canonical_stock_source_key))) THEN
    RAISE EXCEPTION 'stock contributor must bind its exact baseline' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.import_stock_contributor WHERE batch_id = NEW.id
    GROUP BY warehouse_id, canonical_sku_id HAVING count(DISTINCT source_unit) <> 1 OR bool_or(length(btrim(source_unit)) = 0)) THEN
    RAISE EXCEPTION 'incompatible or unknown stock units require explicit resolution' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger l LEFT JOIN (
      SELECT baseline_ledger_id, sum(signed_quantity::numeric) total FROM naijue_erp.import_stock_contributor
      WHERE batch_id = NEW.id GROUP BY baseline_ledger_id) c ON c.baseline_ledger_id = l.id
    WHERE l.source_import_batch_id = NEW.id AND (c.total IS NULL OR c.total <> l.quantity_delta)) THEN
    RAISE EXCEPTION 'stock contribution sums differ from cutoff baseline' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_header_native_reference_publication() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, naijue_erp AS $$
BEGIN
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    IF NEW.mapping_version<>'DOCUMENT_CONVERSION_V1' OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE batch_id=NEW.id) THEN
      RAISE EXCEPTION 'standard conversion cannot enter the legacy raw/history publication pipeline' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.mapping_version <> 'V2_HISTORY_NULLABLE_1' OR NEW.status <> 'IMPORTED' THEN RETURN NEW; END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  IF EXISTS (
    SELECT 1 FROM naijue_erp.history_sales_header h
    JOIN naijue_erp.import_source_row s ON s.batch_id=h.batch_id AND s.id=h.source_row_id
    CROSS JOIN LATERAL (VALUES
      ('所属厅来源编号','HALL',h.hall_id),('客户来源编号','CUSTOMER',h.customer_id),
      ('营业员来源编号','STAFF',h.salesperson_id),('原创建厅编号','HALL',h.created_hall_id)
    ) v(field,entity,native_id)
    WHERE h.batch_id=NEW.id AND (jsonb_typeof(s.normalized_fields->v.field) IS DISTINCT FROM 'string'
      OR (s.normalized_fields->>v.field='' AND v.native_id IS NOT NULL)
      OR (s.normalized_fields->>v.field<>'' AND (v.native_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM naijue_erp.import_header_native_reference r WHERE r.batch_id=NEW.id
          AND r.entity_type=v.entity AND r.source_key=s.normalized_fields->>v.field
          AND COALESCE(r.native_hall_id,r.native_customer_id,r.native_staff_id)=v.native_id))))
  ) OR EXISTS (
    SELECT 1 FROM naijue_erp.history_transfer_header h
    JOIN naijue_erp.import_source_row s ON s.batch_id=h.batch_id AND s.id=h.source_row_id
    WHERE h.batch_id=NEW.id AND (jsonb_typeof(s.normalized_fields->'原创建厅编号') IS DISTINCT FROM 'string'
      OR (s.normalized_fields->>'原创建厅编号'='' AND h.created_hall_id IS NOT NULL)
      OR (s.normalized_fields->>'原创建厅编号'<>'' AND (h.created_hall_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM naijue_erp.import_header_native_reference r WHERE r.batch_id=NEW.id AND r.entity_type='HALL'
          AND r.source_key=s.normalized_fields->>'原创建厅编号' AND r.native_hall_id=h.created_hall_id))))
  ) THEN RAISE EXCEPTION 'historical header has incomplete same-batch native reference coverage' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT h.batch_id,h.source_row_id,'仓库来源编号'::text AS field,h.warehouse_id AS native_id FROM naijue_erp.history_sales_header h
      UNION ALL SELECT h.batch_id,h.source_row_id,'调出仓来源编号',h.from_warehouse_id FROM naijue_erp.history_transfer_header h
      UNION ALL SELECT h.batch_id,h.source_row_id,'调入仓来源编号',h.to_warehouse_id FROM naijue_erp.history_transfer_header h
    ) h JOIN naijue_erp.import_source_row s ON s.batch_id=h.batch_id AND s.id=h.source_row_id
    WHERE h.batch_id=NEW.id AND (jsonb_typeof(s.normalized_fields->h.field) IS DISTINCT FROM 'string'
      OR s.normalized_fields->>h.field='' OR NOT EXISTS (
        SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=NEW.id
          AND r.source_entity_type='WAREHOUSE' AND r.target_type='WAREHOUSE' AND r.status='IMPORTED'
          AND r.source_key=s.normalized_fields->>h.field AND r.target_id=h.native_id))
  ) THEN RAISE EXCEPTION 'historical header warehouse lacks exact same-batch imported identity' USING ERRCODE='23514'; END IF;
  -- Do not let direct source-only inserts evade relation coverage by omitting
  -- the directory row altogether. Writer atomicity is not a publication proof.
  IF EXISTS (
    SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=NEW.id
      AND s.entity_type IN ('HALL','CUSTOMER','STAFF') AND NOT EXISTS (
        SELECT 1 FROM naijue_erp.import_header_native_reference r WHERE r.batch_id=s.batch_id
          AND r.source_row_id=s.id AND r.entity_type=s.entity_type AND r.source_key=s.source_key)
  ) THEN RAISE EXCEPTION 'historical native dictionary source lacks exact reference directory coverage' USING ERRCODE='23514'; END IF;
  -- Cover nonempty relations in the directory's own original dictionary rows.
  IF EXISTS (
    SELECT 1 FROM naijue_erp.import_header_native_reference d
    JOIN naijue_erp.import_source_row s ON s.batch_id=d.batch_id AND s.id=d.source_row_id
    CROSS JOIN LATERAL (
      SELECT '默认客户来源编号'::text AS field,'CUSTOMER'::text AS entity,'default_customer_id'::text AS native_column WHERE d.entity_type='HALL'
      UNION ALL SELECT '默认销货仓来源编号','WAREHOUSE','default_sales_warehouse_id' WHERE d.entity_type='HALL'
      UNION ALL SELECT '所属厅来源编号','HALL','hall_id' WHERE d.entity_type='STAFF'
    ) v
    WHERE d.batch_id=NEW.id AND (jsonb_typeof(s.normalized_fields->v.field) IS DISTINCT FROM 'string'
      OR (s.normalized_fields->>v.field='' AND d.native_snapshot->>v.native_column IS NOT NULL)
      OR (s.normalized_fields->>v.field<>'' AND (d.native_snapshot->>v.native_column IS NULL
        OR (v.entity='WAREHOUSE' AND NOT EXISTS (
          SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=NEW.id
            AND r.source_entity_type='WAREHOUSE' AND r.target_type='WAREHOUSE' AND r.status='IMPORTED'
            AND r.source_key=s.normalized_fields->>v.field AND r.target_id::text=d.native_snapshot->>v.native_column))
        OR (v.entity<>'WAREHOUSE' AND NOT EXISTS (
          SELECT 1 FROM naijue_erp.import_header_native_reference r WHERE r.batch_id=NEW.id
            AND r.entity_type=v.entity AND r.source_key=s.normalized_fields->>v.field
            AND COALESCE(r.native_hall_id,r.native_customer_id,r.native_staff_id)::text=d.native_snapshot->>v.native_column)))))
  ) THEN RAISE EXCEPTION 'historical native directory has incomplete original relation coverage' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_native_catalogue_publication() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    IF NEW.mapping_version<>'DOCUMENT_CONVERSION_V1' OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE batch_id=NEW.id) THEN
      RAISE EXCEPTION 'standard conversion cannot enter the legacy raw/history publication pipeline' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.mapping_version<>'V2_HISTORY_NULLABLE_1' OR NEW.status<>'IMPORTED' THEN RETURN NEW; END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  IF EXISTS (SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=NEW.id
    AND s.entity_type IN ('CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SEASON','SIZE_GROUP_MEMBER')
    AND NOT EXISTS (SELECT 1 FROM naijue_erp.import_native_catalogue_binding x
      WHERE x.batch_id=s.batch_id AND x.source_row_id=s.id AND x.entity_type=s.entity_type AND x.source_key=s.source_key)) THEN
    RAISE EXCEPTION 'native dictionary occurrence lacks typed creation binding' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_native_payment_publication() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    IF NEW.mapping_version<>'DOCUMENT_CONVERSION_V1' OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE batch_id=NEW.id) THEN
      RAISE EXCEPTION 'standard conversion cannot enter the legacy raw/history publication pipeline' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.mapping_version<>'V2_HISTORY_NULLABLE_1' OR NEW.status<>'IMPORTED' THEN RETURN NEW; END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  IF EXISTS(SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=NEW.id
    AND s.entity_type IN ('PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL') AND NOT EXISTS(
      SELECT 1 FROM naijue_erp.import_native_payment_binding x WHERE x.batch_id=s.batch_id AND x.source_row_id=s.id
        AND x.entity_type=s.entity_type AND x.source_key=s.source_key)) THEN
    RAISE EXCEPTION 'payment occurrence lacks typed creation binding' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_history_typed_publication() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE m naijue_erp.import_history_closure_manifest%ROWTYPE;plan jsonb;documents jsonb;
BEGIN
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    IF NEW.mapping_version<>'DOCUMENT_CONVERSION_V1' OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE batch_id=NEW.id) THEN
      RAISE EXCEPTION 'standard conversion cannot enter the legacy raw/history publication pipeline' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
 IF NEW.mapping_version='V2_HISTORY_NULLABLE_1' AND NEW.status='IMPORTED' THEN
  IF TG_OP<>'UPDATE' THEN
   RAISE EXCEPTION 'history19 publication requires existing selected batch' USING ERRCODE='23514'; END IF;
  IF OLD.status NOT IN('STAGED','VALIDATING') OR NEW.history_validation_passed IS DISTINCT FROM TRUE
   OR NEW.history_actual_counts IS DISTINCT FROM NEW.history_expected_counts
   OR NEW.checkpoint->'counts' IS DISTINCT FROM NEW.checkpoint->'expected'
   OR NEW.checkpoint->'counts'->>'IMPORT_BATCH' IS DISTINCT FROM '1'
   OR NEW.completed_at IS NULL THEN
   RAISE EXCEPTION 'history19 complete original accounting and readback required' USING ERRCODE='23514'; END IF;
  SELECT * INTO m FROM naijue_erp.import_history_closure_manifest WHERE batch_id=NEW.id;
  IF NOT FOUND OR m.validator_version<>'HISTORY_TYPED_CLOSURE_V1'
   OR m.selection_sha256 IS DISTINCT FROM NEW.source_hash
   OR m.authorized_payload_hash IS DISTINCT FROM NEW.history_payload_hash
   OR m.expected_counts IS DISTINCT FROM NEW.history_expected_counts THEN
   RAISE EXCEPTION 'history19 immutable selected closure manifest required' USING ERRCODE='23514'; END IF;
  plan:=jsonb_build_object('version',m.validator_version,'selectionSha256',m.selection_sha256,'authorizedPayloadHash',m.authorized_payload_hash,
   'sourceManifestSha256',m.source_manifest_sha256,'typedManifestSha256',m.typed_manifest_sha256,'documentManifestSha256',m.document_manifest_sha256,
   'expectedCounts',m.expected_counts,'sourceEntityCounts',m.source_entity_counts,'documentCount',m.document_count);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',d.document_kind,'sourceKey',d.source_key,'headerSourceRowId',d.header_source_row_id::text,
   'headerId',COALESCE(d.sales_header_id,d.transfer_header_id)::text,'headerSourceSha256',d.header_source_sha256,'lineCount',d.line_count,
   'settlementCount',d.settlement_count,'sourceDocumentSha256',d.source_document_sha256,'typedDocumentSha256',d.typed_document_sha256)
   ORDER BY d.document_kind,COALESCE(d.sales_header_id,d.transfer_header_id)),'[]'::jsonb) INTO documents
   FROM naijue_erp.import_history_document_manifest d WHERE d.batch_id=NEW.id;
  -- Independently recompute complete SQL fields, bidirectional source/typed
  -- coverage, global and per-document roots. No count or passed flag shortcut.
  PERFORM naijue_erp.assert_history_typed_closure(NEW.id,plan,documents);
 END IF;
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_import_accounting_publication() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE kind text; actual bigint;
BEGIN
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    IF NEW.mapping_version<>'DOCUMENT_CONVERSION_V1' OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE batch_id=NEW.id) THEN
      RAISE EXCEPTION 'standard conversion cannot enter the legacy raw/history publication pipeline' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.mapping_version<>'V2_HISTORY_NULLABLE_1' OR NEW.status<>'IMPORTED' THEN RETURN NEW; END IF;
  -- Full readback is an observation at publication, NEVER progress-counter assignment or backfill.
  IF EXISTS(SELECT 1 FROM naijue_erp.import_record r LEFT JOIN naijue_erp.import_record_accounting_claim c
      ON c.import_batch_id=r.import_batch_id AND c.import_record_id=r.id
    WHERE r.import_batch_id=NEW.id AND r.status='IMPORTED' AND c.import_record_id IS NULL) THEN
    RAISE EXCEPTION 'every published native record requires its original once-only accounting ownership' USING ERRCODE='23514'; END IF;
  FOREACH kind IN ARRAY ARRAY['WAREHOUSE','SKU','INVENTORY_LEDGER','IMPORT_BATCH'] LOOP
    SELECT count(*) INTO actual FROM naijue_erp.import_record_accounting_claim WHERE import_batch_id=NEW.id AND target_type=kind;
    IF actual<>(NEW.checkpoint->'counts'->>kind)::bigint OR actual<>(NEW.checkpoint->'expected'->>kind)::bigint THEN
      RAISE EXCEPTION 'published claim scope differs from frozen native progress' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_successor_publication26() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp AS $$
DECLARE original_source naijue_erp.import_source_row%ROWTYPE; target uuid; matched bigint;
BEGIN
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    IF NEW.mapping_version<>'DOCUMENT_CONVERSION_V1' OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE batch_id=NEW.id) THEN
      RAISE EXCEPTION 'standard conversion cannot enter the legacy raw/history publication pipeline' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.mapping_version<>'V2_HISTORY_NULLABLE_1' OR NEW.status<>'IMPORTED' THEN RETURN NEW; END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  -- Original19 conservation, typed closure, approval/audit/accounting and no-STAGED
  -- visibility guards remain enabled. This adds actual successor-field readback.
  FOR original_source IN SELECT * FROM naijue_erp.import_source_row WHERE batch_id=NEW.id AND entity_type='PRODUCT' ORDER BY id FOR SHARE LOOP
    PERFORM naijue_erp.assert_native_product_season_source(original_source);
  END LOOP;
  -- Only a complete, genuinely customer/history-free first baseline has no
  -- historical supplement to prove. Missing or unknown declarations never match.
  -- Original19 still independently re-reads the whole closure and FINAL facts.
  IF EXISTS(SELECT 1 FROM naijue_erp.import_history_closure_manifest m
      WHERE m.batch_id=NEW.id AND m.validator_version='HISTORY_TYPED_CLOSURE_V1'
        AND m.selection_sha256=NEW.source_hash AND m.authorized_payload_hash=NEW.history_payload_hash
        AND m.expected_counts=NEW.history_expected_counts AND m.document_count=0
        AND m.source_entity_counts @> '{"CUSTOMER":0,"SALES_HEADER":0,"SALES_LINE":0,"SETTLEMENT":0,"TRANSFER_HEADER":0,"TRANSFER_LINE":0}'::jsonb
        AND m.expected_counts @> '{"history_sales_header":0,"history_sales_line":0,"history_sales_settlement":0,"history_transfer_header":0,"history_transfer_line":0}'::jsonb)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id<>NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=NEW.id
      AND s.entity_type IN('CUSTOMER','SALES_HEADER','SALES_LINE','SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE'))
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_header WHERE batch_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_line WHERE batch_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_settlement WHERE batch_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.history_transfer_header WHERE batch_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.history_transfer_line WHERE batch_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_history_document_manifest WHERE batch_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.customer)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.native_party_import_evidence e
      WHERE e.entity_type='CUSTOMER' OR e.selection->>'source'='HISTORICAL_CUSTOMER_SUPPLEMENT_V1')
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_header_native_reference
      WHERE entity_type='CUSTOMER' OR native_customer_id IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_source_row s
      WHERE s.field_provenance->>'native_customer_id' IS NOT NULL
        OR s.file_ref='dictionaries/historical-customers.json'
        OR s.field_provenance->'history_header_reference_staging'->'selection'->>'source'='HISTORICAL_CUSTOMER_SUPPLEMENT_V1')
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.hall WHERE default_customer_id IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.sales_header WHERE customer_id IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  -- The two original identities form one reviewed supplement; neither can be
  -- omitted, replaced, promoted to current business or attached to another batch.
  FOREACH target IN ARRAY ARRAY['2e5bd72a-c1cb-4090-90be-091deb49bb2e'::uuid,'f8a29ce8-e296-4b95-9612-ca7bb62507bd'::uuid] LOOP
    PERFORM naijue_erp.is_exact_historical_customer_only(target);
    SELECT count(*) INTO matched FROM naijue_erp.native_party_import_evidence e
      JOIN naijue_erp.import_source_row s ON s.batch_id=e.batch_id AND s.id=e.source_row_id
      WHERE e.batch_id=NEW.id AND e.entity_type='CUSTOMER' AND e.native_id=target
        AND e.selection->>'source'='HISTORICAL_CUSTOMER_SUPPLEMENT_V1';
    IF matched<>1 OR NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_header h
      JOIN naijue_erp.import_source_row hs ON hs.batch_id=h.batch_id AND hs.id=h.source_row_id
      JOIN naijue_erp.import_source_row cs ON cs.batch_id=h.batch_id AND cs.entity_type='CUSTOMER'
        AND cs.field_provenance->>'native_customer_id'=target::text
      WHERE h.batch_id=NEW.id AND h.customer_id=target AND h.number=cs.raw_fields->>'sourceDocumentNumber')
      OR EXISTS(SELECT 1 FROM naijue_erp.hall WHERE default_customer_id=target)
      OR EXISTS(SELECT 1 FROM naijue_erp.sales_header WHERE customer_id=target) THEN
      RAISE EXCEPTION 'Both exact historical customers must close with their original history and no current usage' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_import_record() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE;
BEGIN
  IF EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id AND inventory_mode='DOCUMENT_CONVERSION') THEN
    PERFORM naijue_erp.cutoff_import_lock();
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id FOR UPDATE;
    PERFORM naijue_erp.import_source_key_lock(NEW.source_system,NEW.source_entity_type,NEW.source_key);
    IF b.mapping_version<>'DOCUMENT_CONVERSION_V1' OR b.status NOT IN ('STAGED','VALIDATING') OR NEW.source_system<>b.source_name
      OR NEW.target_type NOT IN ('SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE','IMPORT_BATCH')
      OR NEW.status NOT IN ('IMPORTED','EXCLUDED') OR (NEW.status='IMPORTED' AND NEW.reviewed_at IS NULL)
      OR (NEW.status='EXCLUDED' AND (NEW.target_id IS NOT NULL OR coalesce(length(btrim(NEW.decision_reason)),0)=0)) THEN
      RAISE EXCEPTION 'closed standard conversion identity/decision scope mismatch' USING ERRCODE='23514'; END IF;
    IF NEW.status='IMPORTED' THEN
      IF NEW.target_type='SALES_HEADER' THEN PERFORM 1 FROM naijue_erp.sales_header WHERE id=NEW.target_id AND import_batch_id=b.id;
      ELSIF NEW.target_type='SALES_LINE' THEN PERFORM 1 FROM naijue_erp.sales_line x JOIN naijue_erp.sales_header h ON h.id=x.sales_id WHERE x.id=NEW.target_id AND h.import_batch_id=b.id;
      ELSIF NEW.target_type='SALES_SETTLEMENT' THEN PERFORM 1 FROM naijue_erp.sales_settlement x JOIN naijue_erp.sales_header h ON h.id=x.sales_id WHERE x.id=NEW.target_id AND h.import_batch_id=b.id;
      ELSIF NEW.target_type='TRANSFER_HEADER' THEN PERFORM 1 FROM naijue_erp.transfer_header WHERE id=NEW.target_id AND import_batch_id=b.id;
      ELSIF NEW.target_type='TRANSFER_LINE' THEN PERFORM 1 FROM naijue_erp.transfer_line x JOIN naijue_erp.transfer_header h ON h.id=x.transfer_id WHERE x.id=NEW.target_id AND h.import_batch_id=b.id;
      ELSIF NEW.target_type='IMPORT_BATCH' THEN PERFORM 1 FROM naijue_erp.import_batch WHERE id=NEW.target_id AND id=b.id;
      END IF;
      IF NOT FOUND THEN RAISE EXCEPTION 'ordinary conversion target identity/owner does not exist' USING ERRCODE='23503'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id = NEW.import_batch_id FOR UPDATE;
  IF b.status NOT IN ('STAGED', 'VALIDATING') OR EXISTS (SELECT 1 FROM naijue_erp.import_batch WHERE status = 'IMPORTED') THEN
    RAISE EXCEPTION 'import source scope is frozen' USING ERRCODE = '23514'; END IF;
  -- Cross-batch identity is the fixed namespace + source category + ORIGINAL key, never a filename.
  PERFORM naijue_erp.import_source_key_lock(b.source_name, NEW.source_entity_type, NEW.source_key);
  IF EXISTS (SELECT 1 FROM naijue_erp.import_record r JOIN naijue_erp.import_batch prior ON prior.id = r.import_batch_id
    WHERE prior.source_name = b.source_name AND r.source_entity_type = NEW.source_entity_type AND r.source_key = NEW.source_key) THEN
    RAISE EXCEPTION 'source identity already has an immutable destination; resume original batch' USING ERRCODE = '23505';
  END IF;
  IF NEW.status = 'IMPORTED' THEN
    IF NEW.target_type = 'WAREHOUSE' THEN PERFORM 1 FROM naijue_erp.warehouse WHERE id = NEW.target_id FOR KEY SHARE;
    ELSIF NEW.target_type = 'SKU' THEN PERFORM 1 FROM naijue_erp.sku WHERE id = NEW.target_id FOR KEY SHARE;
    ELSIF NEW.target_type = 'IMPORT_BATCH' THEN PERFORM 1 FROM naijue_erp.import_batch WHERE id = NEW.target_id AND id = b.id;
    ELSIF NEW.target_type = 'INVENTORY_LEDGER' THEN RETURN NEW; -- Reciprocal baseline/source check is deferred below.
    ELSE RAISE EXCEPTION 'unsupported import target' USING ERRCODE = '23514'; END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'import target identity does not exist' USING ERRCODE = '23503'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_sales_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE h naijue_erp.sales_header%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; actual_ids jsonb; receipt_ids jsonb; count_effects bigint;
BEGIN
  IF NEW.action='MIGRATE_DOCUMENT' THEN PERFORM naijue_erp.assert_document_migration(NEW.id); RETURN NULL; END IF;
  SELECT * INTO STRICT h FROM naijue_erp.sales_header WHERE id = NEW.target_id;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id = NEW.id;
  IF NEW.result_data->>'version' IS DISTINCT FROM h.version::text OR NEW.result_data->>'status' IS DISTINCT FROM h.status
    OR a.new_version <> h.version THEN
    RAISE EXCEPTION 'receipt/audit do not describe committed document version' USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb), COUNT(*) INTO actual_ids, count_effects
    FROM naijue_erp.inventory_ledger WHERE operation_id = NEW.id;
  SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb) INTO receipt_ids FROM jsonb_array_elements_text(NEW.result_data->'ledgerEntryIds');
  IF actual_ids <> receipt_ids OR (NEW.action IN ('SAVE', 'VOID') AND count_effects <> 0)
     THEN
    RAISE EXCEPTION 'receipt does not match immutable inventory effects' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM naijue_erp.inventory_ledger l JOIN naijue_erp.sales_line sl ON sl.id = l.source_sales_line_id
      LEFT JOIN naijue_erp.inventory_balance b ON b.warehouse_id = l.warehouse_id AND b.sku_id = l.sku_id
    WHERE l.operation_id = NEW.id AND (sl.sales_id <> NEW.target_id OR l.event_kind <> NEW.action
      OR l.source_document_version <> h.version OR b.last_operation_id IS DISTINCT FROM NEW.id)
  ) THEN
    RAISE EXCEPTION 'inventory source or balance is not committed with this operation' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_transfer_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE h naijue_erp.transfer_header%ROWTYPE; a naijue_erp.audit_change%ROWTYPE;
  actual_ids jsonb; receipt_ids jsonb; count_effects bigint; current_lines bigint; before_lines jsonb; after_lines jsonb;
BEGIN
  IF NEW.action='MIGRATE_DOCUMENT' THEN PERFORM naijue_erp.assert_document_migration(NEW.id); RETURN NULL; END IF;
  SELECT * INTO STRICT h FROM naijue_erp.transfer_header WHERE id = NEW.target_id;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id = NEW.id;
  IF NEW.result_data->>'version' IS DISTINCT FROM h.version::text OR NEW.result_data->>'status' IS DISTINCT FROM h.status
    OR a.new_version <> h.version OR a.actor_account_id <> NEW.actor_account_id OR a.object_type <> 'TRANSFER'
    OR a.object_id <> h.id OR a.action <> NEW.action
    OR h.updated_at IS DISTINCT FROM NEW.completed_at OR a.occurred_at IS DISTINCT FROM NEW.completed_at
    OR (NEW.action = 'APPROVE' AND (h.approved_by_account_id IS DISTINCT FROM NEW.actor_account_id OR h.approved_at IS DISTINCT FROM NEW.completed_at))
    OR h.status <> (CASE NEW.action WHEN 'APPROVE' THEN 'APPROVED' WHEN 'VOID' THEN 'VOID' ELSE 'DRAFT' END)
    OR jsonb_typeof(a.after_values) IS DISTINCT FROM 'object' OR jsonb_typeof(a.after_values->'lines') IS DISTINCT FROM 'array'
    OR (a.after_values - ARRAY['header', 'lines']) <> '{}'::jsonb
    OR a.after_values->'header' IS DISTINCT FROM naijue_erp.transfer_header_audit_values(h)
    OR (a.old_version IS NULL AND (NEW.action <> 'SAVE' OR h.version <> 1 OR a.before_values IS NOT NULL
      OR h.created_by_account_id IS DISTINCT FROM NEW.actor_account_id OR h.created_at IS DISTINCT FROM NEW.completed_at))
    OR (a.old_version IS NOT NULL AND (jsonb_typeof(a.before_values) IS DISTINCT FROM 'object'
      OR jsonb_typeof(a.before_values->'header') IS DISTINCT FROM 'object' OR jsonb_typeof(a.before_values->'lines') IS DISTINCT FROM 'array'
      OR (a.before_values - ARRAY['header', 'lines']) <> '{}'::jsonb
      OR a.before_values->'header'->>'version' IS DISTINCT FROM a.old_version::text
      OR a.before_values->'header'->>'status' IS DISTINCT FROM CASE NEW.action WHEN 'UNAPPROVE' THEN 'APPROVED' ELSE 'DRAFT' END)) THEN
    RAISE EXCEPTION 'receipt audit action status key fields or version does not describe final transfer' USING ERRCODE = '23514';
  END IF;
  before_lines := COALESCE(a.before_values->'lines', '[]'::jsonb);
  after_lines := a.after_values->'lines';
  IF NEW.action <> 'SAVE' AND (before_lines <> '[]'::jsonb OR after_lines <> '[]'::jsonb) THEN
    RAISE EXCEPTION 'posting audit must omit unchanged native transfer lines' USING ERRCODE = '23514';
  END IF;
  -- Deltas contain actual added/changed/deactivated rows only. No whole-native-line scan
  -- or previous-audit reconstruction is required to read or write the current document.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(after_lines) AS delta(value)
    LEFT JOIN naijue_erp.transfer_line ln ON ln.id::text = delta.value->>'id' AND ln.transfer_id = h.id
    WHERE jsonb_typeof(delta.value) IS DISTINCT FROM 'object' OR jsonb_typeof(delta.value->'id') IS DISTINCT FROM 'string'
      OR ln.id IS NULL OR delta.value IS DISTINCT FROM naijue_erp.transfer_line_audit_values(ln)
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(before_lines) AS prior(value)
    WHERE jsonb_typeof(prior.value) IS DISTINCT FROM 'object' OR jsonb_typeof(prior.value->'id') IS DISTINCT FROM 'string'
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(after_lines) AS next(value) WHERE next.value->>'id' = prior.value->>'id')
  ) OR EXISTS (
    SELECT delta.value->>'id' FROM jsonb_array_elements(before_lines) AS delta(value) GROUP BY delta.value->>'id' HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT delta.value->>'id' FROM jsonb_array_elements(after_lines) AS delta(value) GROUP BY delta.value->>'id' HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(before_lines) AS prior(value)
    JOIN jsonb_array_elements(after_lines) AS next(value) ON next.value->>'id' = prior.value->>'id' WHERE next.value = prior.value
  ) THEN
    RAISE EXCEPTION 'invalid duplicate unchanged or non-native sparse transfer line delta' USING ERRCODE = '23514';
  END IF;
  SELECT COUNT(*) INTO current_lines FROM naijue_erp.transfer_line WHERE transfer_id = h.id AND is_current;
  SELECT COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb), COUNT(*) INTO actual_ids, count_effects
    FROM naijue_erp.inventory_ledger WHERE operation_id = NEW.id;
  SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb) INTO receipt_ids FROM jsonb_array_elements_text(NEW.result_data->'ledgerEntryIds');
  IF current_lines = 0 OR actual_ids <> receipt_ids OR (NEW.action IN ('SAVE', 'VOID') AND count_effects <> 0)
    OR (NEW.action IN ('APPROVE', 'UNAPPROVE') AND count_effects <> current_lines * 2) THEN
    RAISE EXCEPTION 'transfer receipt does not match exact two-ended inventory effect set' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM naijue_erp.inventory_ledger l
    LEFT JOIN naijue_erp.transfer_line tl ON tl.id = l.source_transfer_line_id
    LEFT JOIN naijue_erp.inventory_balance b ON b.warehouse_id = l.warehouse_id AND b.sku_id = l.sku_id
    WHERE l.operation_id = NEW.id AND (l.source_sales_line_id IS NOT NULL OR tl.transfer_id IS DISTINCT FROM h.id OR NOT tl.is_current
      OR l.event_kind <> NEW.action OR l.source_document_version <> h.version OR l.sku_id <> tl.sku_id OR l.business_date <> h.business_date
      OR l.posted_at IS DISTINCT FROM NEW.completed_at
      OR l.warehouse_id IS DISTINCT FROM CASE l.endpoint WHEN 'FROM' THEN h.from_warehouse_id WHEN 'TO' THEN h.to_warehouse_id ELSE NULL END
      OR l.quantity_delta::numeric IS DISTINCT FROM (CASE l.endpoint WHEN 'FROM' THEN -tl.quantity::numeric WHEN 'TO' THEN tl.quantity::numeric ELSE NULL END)
        * CASE NEW.action WHEN 'UNAPPROVE' THEN -1 ELSE 1 END
      OR b.last_operation_id IS DISTINCT FROM NEW.id)
  ) OR (NEW.action IN ('APPROVE', 'UNAPPROVE') AND EXISTS (
    SELECT 1 FROM naijue_erp.transfer_line tl CROSS JOIN (VALUES ('FROM'), ('TO')) required(endpoint)
    WHERE tl.transfer_id = h.id AND tl.is_current AND NOT EXISTS (
      SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.operation_id = NEW.id AND l.source_transfer_line_id = tl.id AND l.endpoint = required.endpoint
    )
  )) THEN
    RAISE EXCEPTION 'transfer endpoint source quantity or covered balance differs from committed operation' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_transfer_header_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
BEGIN
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type = 'TRANSFER' AND object_id = NEW.id AND new_version = NEW.version;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = a.operation_id;
  IF r.action='MIGRATE_DOCUMENT' THEN
    IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'migration initializes ordinary rows only' USING ERRCODE='23514'; END IF;
    PERFORM naijue_erp.assert_document_migration(r.id); RETURN NULL;
  END IF;
  IF r.target_type <> 'TRANSFER' OR r.target_id <> NEW.id OR r.actor_account_id <> a.actor_account_id OR r.action <> a.action
    OR a.after_values->'header' IS DISTINCT FROM naijue_erp.transfer_header_audit_values(NEW) THEN
    RAISE EXCEPTION 'native transfer header requires matching operation and key-field audit' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF a.old_version IS NOT NULL OR a.before_values IS NOT NULL OR a.action <> 'SAVE' THEN
      RAISE EXCEPTION 'new transfer requires initial save evidence' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF a.old_version IS DISTINCT FROM OLD.version OR a.before_values->'header' IS DISTINCT FROM naijue_erp.transfer_header_audit_values(OLD) THEN
      RAISE EXCEPTION 'transfer key-field before evidence differs from replaced native header' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF (SELECT version FROM naijue_erp.transfer_header WHERE id = NEW.id) IS DISTINCT FROM NEW.version THEN
    RAISE EXCEPTION 'one final transfer version per command transaction is required' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_transfer_line_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE h naijue_erp.transfer_header%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
  before_line jsonb; after_line jsonb; before_count bigint; after_count bigint;
BEGIN
  -- A no-op UPDATE does not create a changed-line audit entry. Generated current_line_no
  -- is derived only; all actual line fields are included in the single-row comparison.
  IF TG_OP = 'UPDATE' THEN
    IF naijue_erp.transfer_line_audit_values(OLD) IS NOT DISTINCT FROM naijue_erp.transfer_line_audit_values(NEW) THEN RETURN NULL; END IF;
  END IF;
  SELECT * INTO STRICT h FROM naijue_erp.transfer_header WHERE id = NEW.transfer_id;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type = 'TRANSFER' AND object_id = h.id AND new_version = h.version;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = a.operation_id;
  IF r.action='MIGRATE_DOCUMENT' THEN
    IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'migration initializes ordinary rows only' USING ERRCODE='23514'; END IF;
    PERFORM naijue_erp.assert_document_migration(r.id); RETURN NULL;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE operation_id=r.id AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
    OR h.status <> 'DRAFT' OR a.action <> 'SAVE'
    OR r.target_type <> 'TRANSFER' OR r.target_id <> h.id OR r.action <> 'SAVE' OR r.actor_account_id <> a.actor_account_id THEN
    RAISE EXCEPTION 'native transfer line mutations require matching draft SAVE operation' USING ERRCODE = '23514';
  END IF;
  SELECT COUNT(*), (jsonb_agg(delta.value))->0 INTO before_count, before_line
    FROM jsonb_array_elements(COALESCE(a.before_values->'lines', '[]'::jsonb)) AS delta(value) WHERE delta.value->>'id' = NEW.id::text;
  SELECT COUNT(*), (jsonb_agg(delta.value))->0 INTO after_count, after_line
    FROM jsonb_array_elements(a.after_values->'lines') AS delta(value) WHERE delta.value->>'id' = NEW.id::text;
  IF after_count <> 1 OR after_line IS DISTINCT FROM naijue_erp.transfer_line_audit_values(NEW) THEN
    RAISE EXCEPTION 'changed native transfer line requires exact sparse after evidence' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF before_count <> 0 THEN RAISE EXCEPTION 'inserted transfer line cannot have prior-row evidence' USING ERRCODE = '23514'; END IF;
  ELSE
    IF before_count <> 1 OR before_line IS DISTINCT FROM naijue_erp.transfer_line_audit_values(OLD) THEN
      RAISE EXCEPTION 'changed native transfer line requires exact sparse before evidence' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_sales_effect() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE h naijue_erp.sales_header%ROWTYPE; ln naijue_erp.sales_line%ROWTYPE; original naijue_erp.inventory_ledger%ROWTYPE;
BEGIN
  SELECT * INTO STRICT ln FROM naijue_erp.sales_line WHERE id = NEW.source_sales_line_id;
  SELECT * INTO STRICT h FROM naijue_erp.sales_header WHERE id = ln.sales_id;
  IF NOT ln.is_current OR ln.sku_id <> NEW.sku_id OR h.warehouse_id <> NEW.warehouse_id
    OR h.business_date <> NEW.business_date OR h.version + 1 <> NEW.source_document_version
    OR (NEW.event_kind = 'APPROVE' AND h.status <> 'DRAFT') OR (NEW.event_kind = 'UNAPPROVE' AND h.status <> 'APPROVED') THEN
    RAISE EXCEPTION 'inconsistent runtime sales source' USING ERRCODE = '23514';
  END IF;
  IF NEW.event_kind = 'UNAPPROVE' AND NEW.baseline_anchor_operation_id IS NULL THEN
    SELECT * INTO STRICT original FROM naijue_erp.inventory_ledger WHERE id = NEW.reverses_entry_id;
    IF original.event_kind <> 'APPROVE' OR original.source_sales_line_id <> NEW.source_sales_line_id
      OR original.warehouse_id <> NEW.warehouse_id OR original.sku_id <> NEW.sku_id
      OR original.source_document_version <> h.version OR original.quantity_delta::numeric + NEW.quantity_delta::numeric <> 0 THEN
      RAISE EXCEPTION 'invalid original runtime reversal' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_transfer_effect() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE h naijue_erp.transfer_header%ROWTYPE; ln naijue_erp.transfer_line%ROWTYPE;
  original naijue_erp.inventory_ledger%ROWTYPE; expected_delta numeric;
BEGIN
  SELECT * INTO STRICT ln FROM naijue_erp.transfer_line WHERE id = NEW.source_transfer_line_id FOR SHARE;
  SELECT * INTO STRICT h FROM naijue_erp.transfer_header WHERE id = ln.transfer_id FOR UPDATE;
  expected_delta := CASE NEW.endpoint WHEN 'FROM' THEN -ln.quantity::numeric WHEN 'TO' THEN ln.quantity::numeric ELSE NULL END;
  IF NEW.event_kind = 'UNAPPROVE' THEN expected_delta := -expected_delta; END IF;
  IF NOT ln.is_current OR ln.sku_id <> NEW.sku_id
    OR NEW.warehouse_id IS DISTINCT FROM (CASE NEW.endpoint WHEN 'FROM' THEN h.from_warehouse_id WHEN 'TO' THEN h.to_warehouse_id ELSE NULL END)
    OR NEW.quantity_delta::numeric IS DISTINCT FROM expected_delta OR h.business_date <> NEW.business_date
    OR h.version::bigint + 1 <> NEW.source_document_version
    OR (NEW.event_kind = 'APPROVE' AND h.status <> 'DRAFT') OR (NEW.event_kind = 'UNAPPROVE' AND h.status <> 'APPROVED') THEN
    RAISE EXCEPTION 'inconsistent runtime transfer source or endpoint effect' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM naijue_erp.inventory_balance WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id FOR UPDATE;
  IF NOT FOUND THEN
    IF (NEW.event_kind <> 'APPROVE' AND NEW.baseline_anchor_operation_id IS NULL) OR NEW.reverses_entry_id IS NOT NULL
      OR NOT naijue_erp.inventory_runtime_key_admitted(NEW.warehouse_id, NEW.sku_id)
      OR EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id) THEN
      RAISE EXCEPTION 'transfer inventory coverage is not ready' USING ERRCODE = '23514'; END IF;
    -- The deferred sparse INSERT validator requires this exact operation's native receipt/audit and final real delta.
  END IF;
  IF NEW.event_kind = 'UNAPPROVE' AND NEW.baseline_anchor_operation_id IS NULL THEN
    SELECT * INTO STRICT original FROM naijue_erp.inventory_ledger WHERE id = NEW.reverses_entry_id;
    IF original.event_kind <> 'APPROVE' OR original.source_sales_line_id IS NOT NULL
      OR original.source_transfer_line_id IS DISTINCT FROM NEW.source_transfer_line_id OR original.endpoint IS DISTINCT FROM NEW.endpoint
      OR original.warehouse_id <> NEW.warehouse_id OR original.sku_id <> NEW.sku_id OR original.business_date <> NEW.business_date
      OR original.source_document_version <> h.version OR original.quantity_delta::numeric + NEW.quantity_delta::numeric <> 0 THEN
      RAISE EXCEPTION 'invalid exact original transfer reversal' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_exact_native_reversal() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE original naijue_erp.inventory_ledger%ROWTYPE;
BEGIN
  IF NEW.event_kind = 'UNAPPROVE' AND NEW.baseline_anchor_operation_id IS NULL THEN
    SELECT * INTO STRICT original FROM naijue_erp.inventory_ledger WHERE id = NEW.reverses_entry_id;
    IF original.event_kind <> 'APPROVE'
      OR original.source_sales_line_id IS DISTINCT FROM NEW.source_sales_line_id
      OR original.source_transfer_line_id IS DISTINCT FROM NEW.source_transfer_line_id
      OR original.endpoint IS DISTINCT FROM NEW.endpoint OR original.warehouse_id <> NEW.warehouse_id OR original.sku_id <> NEW.sku_id
      OR original.business_date <> NEW.business_date OR original.quantity_delta::numeric + NEW.quantity_delta::numeric <> 0 THEN
      RAISE EXCEPTION 'reversal must match exact original native source and endpoint' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Sparse first movement may be a separately proved baseline reversal, not an inferred zero.
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
    IF r.action NOT IN ('APPROVE','UNAPPROVE') OR r.status <> 'COMMITTED' OR NOT naijue_erp.inventory_runtime_key_admitted(NEW.warehouse_id, NEW.sku_id) THEN
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
      OR a.action IS DISTINCT FROM r.action OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.new_version::text IS DISTINCT FROM r.result_data->>'version' OR a.old_version + 1 IS DISTINCT FROM a.new_version THEN
      RAISE EXCEPTION 'first native balance requires exact native receipt and audit' USING ERRCODE = '23514'; END IF;
    IF (r.target_type = 'SALES' AND NOT EXISTS (SELECT 1 FROM naijue_erp.sales_header h WHERE h.id = r.target_id
        AND h.status = CASE r.action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'DRAFT' END AND h.version = a.new_version))
      OR (r.target_type = 'TRANSFER' AND NOT EXISTS (SELECT 1 FROM naijue_erp.transfer_header h WHERE h.id = r.target_id
        AND h.status = CASE r.action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'DRAFT' END AND h.version = a.new_version)) THEN
      RAISE EXCEPTION 'first native balance cannot use cutoff history or another document' USING ERRCODE = '23514'; END IF;
    -- Prior used keys are retained by ledger_retains_balance. Never rebuild missing history from zero.
    IF EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id AND operation_id <> r.id)
      OR EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger l
        LEFT JOIN naijue_erp.sales_line sl ON sl.id = l.source_sales_line_id
        LEFT JOIN naijue_erp.transfer_line tl ON tl.id = l.source_transfer_line_id
        WHERE l.operation_id = r.id AND l.warehouse_id = NEW.warehouse_id AND l.sku_id = NEW.sku_id
          AND (l.event_kind <> r.action OR l.reverses_entry_id IS NOT NULL OR (r.action='UNAPPROVE' AND l.baseline_anchor_operation_id IS NULL) OR (r.action='APPROVE' AND l.baseline_anchor_operation_id IS NOT NULL) OR l.source_import_batch_id IS NOT NULL
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

CREATE OR REPLACE FUNCTION naijue_erp.guard_recorded_live_balance_pair() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,naijue_erp AS $pair$
DECLARE current_quantity bigint;
BEGIN
  IF NEW.event_kind NOT IN ('APPROVE','UNAPPROVE') THEN
    IF NEW.quantity_before IS NOT NULL OR NEW.quantity_after IS NOT NULL THEN
      RAISE EXCEPTION 'Historical revision and baseline balances remain unrecorded' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.quantity_before IS NULL OR NEW.quantity_after IS NULL THEN
    RAISE EXCEPTION 'New native live ledger requires both recorded balances' USING ERRCODE='23514'; END IF;
  -- Alphabetically after original cutoff/validate_* guards. They and the original
  -- app already own this inventory key/current balance. No new or inverted lock.
  SELECT quantity INTO current_quantity FROM naijue_erp.inventory_balance
    WHERE warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id;
  IF FOUND THEN
    IF NEW.quantity_before IS DISTINCT FROM current_quantity THEN
      RAISE EXCEPTION 'Recorded before differs from original current locked balance' USING ERRCODE='23514'; END IF;
  ELSE
    -- Absence itself is not zero authority. Original native-source coverage and
    -- deferred sparse INSERT publication/receipt/audit checks remain mandatory.
    IF (NEW.event_kind<>'APPROVE' AND NEW.baseline_anchor_operation_id IS NULL) OR NEW.reverses_entry_id IS NOT NULL OR NEW.quantity_before<>0
      OR naijue_erp.inventory_runtime_key_admitted(NEW.warehouse_id,NEW.sku_id) IS DISTINCT FROM true
      OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id)
    THEN RAISE EXCEPTION 'Only original proven first approval may record zero before' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $pair$;

CREATE UNIQUE INDEX audit_sales_document_version ON naijue_erp.audit_change(object_id,new_version) WHERE object_type='SALES';
CREATE FUNCTION naijue_erp.unified_sales_header_audit_values(h naijue_erp.sales_header) RETURNS jsonb LANGUAGE sql STABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
 SELECT jsonb_build_object('version',h.version,'createdByStaffId',h.created_by_staff_id,'approvedByStaffId',h.approved_by_staff_id,'responsibleStaffId',h.responsible_staff_id,'number',h.number,'businessType',h.business_type,
  'businessDate',h.business_date,'hallId',h.hall_id,'salespersonId',h.salesperson_id,'customerId',h.customer_id,'warehouseId',h.warehouse_id,
  'status',h.status,'grossAmount',(h.gross_amount*100)::bigint::text,'orderDiscount',(h.order_discount*100)::bigint::text,'netDue',(h.net_due*100)::bigint::text,
  'note',h.note,'updatedAt',h.updated_at,'approvedByAccountId',h.approved_by_account_id,'approvedAt',h.approved_at);
$$;
-- New ordinary transfer commands carry both staff fields explicitly, even
-- when the original facts are NULL. Old immutable audit JSON is not rewritten.
CREATE OR REPLACE FUNCTION naijue_erp.transfer_header_audit_values(source_row naijue_erp.transfer_header) RETURNS jsonb LANGUAGE sql STABLE STRICT
SET search_path=pg_catalog,naijue_erp AS $$
 SELECT jsonb_build_object('number',(source_row).number,'businessDate',to_char((source_row).business_date,'YYYY-MM-DD'),
  'fromWarehouseId',(source_row).from_warehouse_id,'toWarehouseId',(source_row).to_warehouse_id,
  'status',(source_row).status,'version',(source_row).version,'note',(source_row).note,'responsibleStaffId',(source_row).responsible_staff_id,
  'createdByStaffId',(source_row).created_by_staff_id,'approvedByStaffId',(source_row).approved_by_staff_id);
$$;
CREATE FUNCTION naijue_erp.unified_sales_line_audit_values(ln naijue_erp.sales_line) RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
 SELECT jsonb_build_object('id',ln.id,'lineNo',ln.line_no,'skuId',ln.sku_id,'quantity',ln.quantity::text,
  'referencePrice',(ln.reference_price*100)::bigint::text,'dealPrice',(ln.deal_price*100)::bigint::text,'pricingRule',ln.pricing_rule,'discountTenths',ln.discount_tenths,
  'zeroConfirmed',ln.zero_confirmed,'lineAmount',(ln.line_amount*100)::bigint::text,'allocatedDiscount',(ln.allocated_discount*100)::bigint::text,
  'isGift',ln.is_gift,'isCurrent',ln.is_current,'snapshot',jsonb_build_object('productCode',ln.product_code_snapshot,'productName',ln.product_name_snapshot,
    'colorName',ln.color_name_snapshot,'fitName',ln.fit_name_snapshot,'sizeName',ln.size_name_snapshot,'barcode',ln.barcode_snapshot));
$$;
CREATE FUNCTION naijue_erp.validate_unified_sales_header_commit() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; before_header jsonb; after_header jsonb; field text;
BEGIN
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='SALES' AND object_id=NEW.id AND new_version=NEW.version;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
 IF r.action='MIGRATE_DOCUMENT' THEN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'migration initializes ordinary sales only' USING ERRCODE='23514'; END IF;
  PERFORM naijue_erp.assert_document_migration(r.id); RETURN NULL;
 END IF;
 after_header:=naijue_erp.unified_sales_header_audit_values(NEW);
 IF TG_OP='INSERT' THEN before_header:=NULL;
 ELSE before_header:=naijue_erp.unified_sales_header_audit_values(OLD); END IF;
 IF r.target_type<>'SALES' OR r.target_id<>NEW.id OR r.action<>a.action OR r.actor_account_id<>a.actor_account_id
   OR (TG_OP='INSERT' AND (a.old_version IS NOT NULL OR a.before_values IS NOT NULL OR a.action<>'SAVE'))
   OR (TG_OP='UPDATE' AND a.old_version IS DISTINCT FROM OLD.version) OR jsonb_typeof(a.after_values->'header') IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'sales header requires exact ordinary audit/receipt and predecessor version' USING ERRCODE='23514'; END IF;
 FOR field IN SELECT jsonb_object_keys(after_header) LOOP
  IF field='version' OR before_header IS NULL OR before_header->field IS DISTINCT FROM after_header->field THEN
   IF NOT(a.after_values->'header' ? field) OR (before_header IS NOT NULL AND NOT(a.before_values->'header' ? field)) THEN
    RAISE EXCEPTION 'changed header evidence must include explicit NULL rather than omit field: %',field USING ERRCODE='23514'; END IF;
   -- JSON timestamp spellings differ between JS ISO and PostgreSQL; compare
   -- evidenced instants only for these actual action-time fields.
   IF field IN ('updatedAt','approvedAt') THEN
    IF (a.after_values->'header'->>field)::timestamptz IS DISTINCT FROM (after_header->>field)::timestamptz
      OR (before_header IS NOT NULL AND (a.before_values->'header'->>field)::timestamptz IS DISTINCT FROM (before_header->>field)::timestamptz) THEN
     RAISE EXCEPTION 'sales changed timestamp evidence differs: %',field USING ERRCODE='23514'; END IF;
   ELSIF a.after_values->'header'->field IS DISTINCT FROM after_header->field OR
     (before_header IS NOT NULL AND a.before_values->'header'->field IS DISTINCT FROM before_header->field) THEN
    RAISE EXCEPTION 'sales changed header evidence differs: %',field USING ERRCODE='23514';
   END IF;
  END IF;
 END LOOP;
 IF (SELECT version FROM naijue_erp.sales_header WHERE id=NEW.id) IS DISTINCT FROM NEW.version THEN
  RAISE EXCEPTION 'one final ordinary version per transaction required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER unified_sales_header_command_consistency AFTER INSERT OR UPDATE ON naijue_erp.sales_header
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_unified_sales_header_commit();

CREATE FUNCTION naijue_erp.validate_unified_sales_line_commit() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
DECLARE h naijue_erp.sales_header%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 final_row naijue_erp.sales_line%ROWTYPE; before_line jsonb; after_line jsonb; prior_event jsonb; next_event jsonb;
 n_before bigint; n_after bigint; direct_event boolean; release_event boolean; continuation_event boolean; old_same_transaction boolean;
BEGIN
 SELECT * INTO STRICT h FROM naijue_erp.sales_header WHERE id=NEW.sales_id;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='SALES' AND object_id=h.id AND new_version=h.version;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
 IF r.action='MIGRATE_DOCUMENT' THEN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'migration initializes ordinary lines only' USING ERRCODE='23514'; END IF;
  PERFORM naijue_erp.assert_document_migration(r.id); RETURN NULL;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE operation_id=r.id AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=r.id AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
   OR h.status<>'DRAFT' OR r.action<>'SAVE' OR r.target_type<>'SALES' OR r.target_id<>h.id OR r.actor_account_id<>a.actor_account_id THEN
  RAISE EXCEPTION 'ordinary sales line mutation requires draft SAVE' USING ERRCODE='23514'; END IF;
 -- Deferred events retain each physical OLD/NEW tuple, not just the final row.
 -- The ordinary UoW releases occupied positions with a pure true->false UPDATE,
 -- then UPSERTs the final line. Validate the native final row once per event,
 -- while still proving every intermediate event rather than normalizing blindly.
 SELECT * INTO STRICT final_row FROM naijue_erp.sales_line WHERE id=NEW.id AND sales_id=NEW.sales_id;
 next_event:=naijue_erp.unified_sales_line_audit_values(NEW);
 IF TG_OP='UPDATE' THEN prior_event:=naijue_erp.unified_sales_line_audit_values(OLD); END IF;
 SELECT count(*),jsonb_agg(value)->0 INTO n_after,after_line FROM jsonb_array_elements(a.after_values->'lines') WHERE value->>'id'=NEW.id::text;
 SELECT count(*),jsonb_agg(value)->0 INTO n_before,before_line FROM jsonb_array_elements(coalesce(a.before_values->'lines','[]')) WHERE value->>'id'=NEW.id::text;
 -- An actual no-op has no sparse delta, but it must already equal the final
 -- native row. Do not blindly return before reading the final audit: a no-op
 -- rewrite of a previously inactive row must not warm xmin for a forged before.
 IF TG_OP='UPDATE' AND n_before=0 AND n_after=0 AND prior_event IS NOT DISTINCT FROM next_event
    AND next_event IS NOT DISTINCT FROM naijue_erp.unified_sales_line_audit_values(final_row) THEN RETURN NULL; END IF;
 IF n_after<>1 OR after_line IS DISTINCT FROM naijue_erp.unified_sales_line_audit_values(final_row) THEN
  RAISE EXCEPTION 'ordinary sales changed-line final after evidence differs' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF n_before<>0 OR next_event IS DISTINCT FROM after_line THEN
   RAISE EXCEPTION 'ordinary inserted sales line requires exact final evidence and no prior row' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 IF n_before<>1 OR before_line IS NOT DISTINCT FROM after_line THEN
  RAISE EXCEPTION 'ordinary sales changed-line before evidence missing, duplicate or unchanged' USING ERRCODE='23514'; END IF;
 old_same_transaction:=OLD.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
 direct_event:=prior_event IS NOT DISTINCT FROM before_line AND next_event IS NOT DISTINCT FROM after_line;
 release_event:=prior_event IS NOT DISTINCT FROM before_line AND prior_event->'isCurrent'='true'::jsonb
   AND next_event IS NOT DISTINCT FROM jsonb_set(prior_event,'{isCurrent}','false'::jsonb);
 continuation_event:=old_same_transaction AND before_line->'isCurrent'='true'::jsonb AND prior_event->'isCurrent'='false'::jsonb
   AND prior_event IS NOT DISTINCT FROM jsonb_set(before_line,'{isCurrent}','false'::jsonb)
   AND next_event IS NOT DISTINCT FROM after_line;
 IF (direct_event OR release_event OR continuation_event) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'ordinary sales line event is not an exact direct change or proven position-release transition' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER unified_sales_line_command_consistency AFTER INSERT OR UPDATE ON naijue_erp.sales_line
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_unified_sales_line_commit();

-- Existing exact historical-only customer classification belongs to the old
-- publication pipeline. The common ordinary reference path checks a real FK
-- customer, not two frozen source IDs. Its command audit/actor guard above is
-- retained; customer creation/maintenance/hall old-policy triggers are untouched.
CREATE FUNCTION naijue_erp.guard_unified_sales_customer_reference() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
 PERFORM 1 FROM naijue_erp.customer WHERE id=NEW.customer_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ordinary sales requires an existing canonical customer' USING ERRCODE='23503'; END IF;
 IF TG_OP='UPDATE' AND NEW.customer_id IS DISTINCT FROM OLD.customer_id AND (OLD.status<>'DRAFT' OR NEW.status<>'DRAFT') THEN
  RAISE EXCEPTION 'customer reference changes require ordinary draft SAVE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER sales_historical_only_customer ON naijue_erp.sales_header;
CREATE TRIGGER sales_historical_only_customer BEFORE INSERT OR UPDATE ON naijue_erp.sales_header
 FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_unified_sales_customer_reference();

CREATE FUNCTION naijue_erp.unified_sales_settlement_audit_values(row_value naijue_erp.sales_settlement) RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
 SELECT jsonb_build_object('id',(row_value).id,'salesId',(row_value).sales_id,'lineNo',(row_value).line_no,'paymentAccountId',(row_value).payment_account_id,
  'paymentMethodId',(row_value).payment_method_id_snapshot,'direction',(row_value).direction,'amount',((row_value).amount*100)::bigint::text);
$$;
CREATE FUNCTION naijue_erp.validate_unified_sales_settlement_commit() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
DECLARE h naijue_erp.sales_header%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 target uuid; row_id uuid; before_row jsonb; after_row jsonb; n_before bigint; n_after bigint;
BEGIN
 IF TG_OP='DELETE' THEN target:=OLD.sales_id; row_id:=OLD.id; ELSE target:=NEW.sales_id; row_id:=NEW.id; END IF;
 IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NULL; END IF;
 SELECT * INTO STRICT h FROM naijue_erp.sales_header WHERE id=target;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='SALES' AND object_id=target AND new_version=h.version;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
 IF r.action='MIGRATE_DOCUMENT' THEN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'migration initializes settlement occurrences only' USING ERRCODE='23514'; END IF;
  PERFORM naijue_erp.assert_document_migration(r.id); RETURN NULL;
 END IF;
 IF h.status<>'DRAFT' OR r.action<>'SAVE' OR r.target_type<>'SALES' OR r.target_id<>target OR r.actor_account_id<>a.actor_account_id
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=r.id AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE operation_id=r.id AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN
  RAISE EXCEPTION 'settlement mutation requires exact same-transaction ordinary draft SAVE' USING ERRCODE='23514'; END IF;
 SELECT count(*),jsonb_agg(value)->0 INTO n_before,before_row FROM jsonb_array_elements(coalesce(a.before_values->'settlements','[]')) WHERE value->>'id'=row_id::text;
 SELECT count(*),jsonb_agg(value)->0 INTO n_after,after_row FROM jsonb_array_elements(a.after_values->'settlements') WHERE value->>'id'=row_id::text;
 IF (TG_OP='INSERT' AND n_before<>0) OR (TG_OP<>'INSERT' AND (n_before<>1 OR before_row IS DISTINCT FROM naijue_erp.unified_sales_settlement_audit_values(OLD)))
   OR (TG_OP='DELETE' AND n_after<>0) OR (TG_OP<>'DELETE' AND (n_after<>1 OR after_row IS DISTINCT FROM naijue_erp.unified_sales_settlement_audit_values(NEW))) THEN
  RAISE EXCEPTION 'settlement exact before/after occurrence evidence differs' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.sales_id IS DISTINCT FROM OLD.sales_id) THEN
  RAISE EXCEPTION 'settlement canonical identity/owner cannot move' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND NEW.payment_account_id=OLD.payment_account_id AND ROW(NEW.account_name_snapshot,NEW.method_name_snapshot,NEW.payment_method_id_snapshot)
    IS DISTINCT FROM ROW(OLD.account_name_snapshot,OLD.method_name_snapshot,OLD.payment_method_id_snapshot) THEN
  RAISE EXCEPTION 'unchanged account retains original known/unknown snapshots' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER unified_sales_settlement_command_consistency AFTER INSERT OR UPDATE OR DELETE ON naijue_erp.sales_settlement
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_unified_sales_settlement_commit();
CREATE FUNCTION naijue_erp.guard_retained_settlement_identity() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
 -- INSERT ... ON CONFLICT UPDATE runs this guard before conflict resolution.
 -- Lock the canonical owner first, as ordinary DELETE/UPDATE do, so a concurrent
 -- deletion cannot turn an allowed existing-row UPSERT into retired-ID reuse.
 PERFORM 1 FROM naijue_erp.sales_header WHERE id=NEW.sales_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'settlement canonical sales owner must exist' USING ERRCODE='23503'; END IF;
 -- A source-bound existing row may be updated through the common SAVE path;
 -- the owner, exact before/after and same-transaction audit guards remain.
 -- A removed occurrence survives in immutable audit and cannot be resurrected.
 IF EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE target_type='SALES_SETTLEMENT' AND target_id=NEW.id AND status IN ('ACCEPTED','IMPORTED'))
   AND NOT EXISTS(SELECT 1 FROM naijue_erp.sales_settlement WHERE id=NEW.id AND sales_id=NEW.sales_id) THEN
  RAISE EXCEPTION 'retired source settlement identity cannot be recycled' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER retained_settlement_identity BEFORE INSERT ON naijue_erp.sales_settlement FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_retained_settlement_identity();

-- Legacy current-state writers retire logically, not physically. Original
-- receipt/audit/history/ledger FKs and all stored identities stay intact.
DO $history_readonly$
DECLARE relation_name text;
BEGIN
 FOREACH relation_name IN ARRAY ARRAY['history_sales_header','history_sales_line','history_sales_settlement',
  'history_transfer_header','history_transfer_line','history_revision','history_sales_effective','history_transfer_effective',
  'history_sales_line_effective','history_transfer_line_effective','history_sales_settlement_effective'] LOOP
  EXECUTE format('CREATE TRIGGER unified_history_readonly BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.%I FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change()',relation_name);
 END LOOP;
END $history_readonly$;

-- New routines have no public execution grant. Installation establishes schema
-- only: parent must separately review importer/runtime roles and exact27 issuer.
REVOKE ALL ON FUNCTION naijue_erp.assert_unified_current_actor(uuid,timestamptz,text,uuid,text),
 naijue_erp.unified_document_snapshot(text,uuid),naijue_erp.assert_document_migration(uuid),
 naijue_erp.assert_document_conversion_batch(naijue_erp.import_batch,jsonb,text,boolean),
 naijue_erp.guard_unified_document(),naijue_erp.validate_unified_baseline_reversal(),
 naijue_erp.validate_unified_ordinary_operation(),naijue_erp.unified_sales_header_audit_values(naijue_erp.sales_header),
 naijue_erp.unified_sales_line_audit_values(naijue_erp.sales_line),naijue_erp.validate_unified_sales_header_commit(),
 naijue_erp.validate_unified_sales_line_commit(),naijue_erp.guard_unified_sales_customer_reference(),
 naijue_erp.unified_sales_settlement_audit_values(naijue_erp.sales_settlement),naijue_erp.validate_unified_sales_settlement_commit(),
 naijue_erp.guard_retained_settlement_identity() FROM PUBLIC;
INSERT INTO naijue_erp.schema_migration(version,description)
VALUES (27,'Unified ordinary document conversion, exact real migration anchors and baseline reversal; retained legacy FKs; source-only');
COMMIT;
