-- Explicit NEW_EMPTY standard initialization/import profile after installed 0027.
-- SOURCE ONLY. Parent owns all engine execution and role/target approval.
-- No source workbook, historical account, production seed, schema bypass or new table/column.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp;
SET LOCAL TimeZone='UTC';
DO $parent$
DECLARE item jsonb; r record;
BEGIN
 IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY(SELECT generate_series(1,27))
   OR (SELECT count(*) FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>152 THEN
  RAISE EXCEPTION 'STANDARD_EXACT_INSTALLED27_REQUIRED' USING ERRCODE='23514'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements($pins$[{"name":"assert_barcode_scheme_initialization_v19","sha256":"8d4f7d457403d6c4737e5a9b38d6d4f48c0ef3c5e94dd2e8ff408d3b57a198ca"},{"name":"assert_core_initialization_v14","sha256":"8a8374fb193ed9e5ddcc388b0141a91dc17420cef0baee4ffbb700cd9737add5"},{"name":"assert_document_conversion_batch","sha256":"eac2eefb79004daf16c754c88daa3697fc0a303717fcd21c9b022af272a35399"},{"name":"assert_document_migration","sha256":"6877764ca291998c7373a86341d16c2f5bf3f08d0d27b6314e6545ed63ec9fca"},{"name":"assert_history_typed_closure","sha256":"8556e917e6a251dd1eb97974fbb6f793d3e46a1ef10f6ef7fd77fb7ad539d00f"},{"name":"assert_native_bootstrap_accounts","sha256":"171c59ba962a287dd02bb9eac993512e114783a470063108a07ba5e206cbabca"},{"name":"assert_native_product_season_source","sha256":"3a753b412fa4a648e26c4a2e398a4b52cc694c04dc1352a98513cb2220d4d661"},{"name":"assert_retained_sku_reference","sha256":"4c956a82b9531b1f385f9aecd9c6d20fa84ce6d434bb0a41d2a0c96ebb7fae5d"},{"name":"assert_unified_current_actor","sha256":"0a7fd1974200a8145e0e57a351c4f46f85a02636541eccde436196fccadc4731"},{"name":"assign_runtime_document_number","sha256":"bca336abcd0ef4a57c22d2ee19564e7ea744257303fb8eec06c822efd551500e"},{"name":"check_hall_default_customer_enabled","sha256":"6a89df4342530f3a3bdd185abbdd372b3372799b341a17ae9ad65be86ded91ee"},{"name":"cutoff_import_lock","sha256":"82a621b9cea39c9cc273d5cb790b364fad004875760644633280d2e24e64ccc7"},{"name":"exact_historical_customer_source_matches","sha256":"ac26aa52f4131d996d6abe0db810a0e0817a12ffa043cdfb2250c951bfd0f011"},{"name":"freeze_cutoff_sales_detail","sha256":"eb20d59095a3b407870735af5ad574ec7c1e8801311278392ef9547de1af719b"},{"name":"freeze_imported_identity","sha256":"0a17cf0a670ca8c9d34f2de1ec34de9b5197410fc01f82af4273a26e877a44e5"},{"name":"guard_balance_identity","sha256":"02f2db383ff8c5826c7148f73bb780319c977bffa5798bc233159d83d89e58fc"},{"name":"guard_contributor_link","sha256":"2937ecd3e974e2ad78e0bfce4790b96d97953d4bf113406a838063b366895983"},{"name":"guard_cutoff_ledger","sha256":"71ecb569279de61709578ffe2f29d85140993ed155fce07e7beb797307c491b5"},{"name":"guard_exact_historical_customer_current_usage","sha256":"78e895d72d6f806089d2bc7cb877293e1263d26ba8265dd7f3b5e2203e956245"},{"name":"guard_header_native_reference","sha256":"1584d2600c763f0d38cd3dd4fa7dd14ea90465ef9376d7165a58d71bce0dec3c"},{"name":"guard_header_native_reference_publication","sha256":"b09bda8d276cd7cd8937dfcb24c479928016fe75b9f16e76cb7e541d9dfb1719"},{"name":"guard_history_closure_stage","sha256":"d05947c6d7ef430d043c10038cce1d72f7e44e4efb2a2112c499ea8d107d47e0"},{"name":"guard_history_insert","sha256":"98fcf82074f4aaf0712b2af3aca5a12a7e4975933712caffd577e652eca7e12f"},{"name":"guard_history_numeric_ledger","sha256":"014f98557c5fc57e5e6f0ba3d21483be5e7eb3e3adbc86c9162dcd120df40797"},{"name":"guard_history_publication","sha256":"0b53107aa76b5103d819bb7e8c50fc96ad5216555529ff9eac293d79d4fcd42b"},{"name":"guard_history_typed_publication","sha256":"d3449e5691c9311d085a85783ff24df6f32b165b50b3cc19b55dbb8f3c30772b"},{"name":"guard_import_accounting_claim","sha256":"298996ca170c969aa06df8dfa44219b86a9db0ae4dc1c07f726167a518f62acf"},{"name":"guard_import_accounting_publication","sha256":"7696441bccca815501fe7a51e497abddf966597a8ead707ad37e0b52bc3f2704"},{"name":"guard_import_batch","sha256":"92c97bb9668bd8fec6f1c8cd46fb9adce3aaf361e302739d0cf98073e1f7e237"},{"name":"guard_import_record","sha256":"eb5a1e032283586dcc0898ea1cb8932d3b45dae0c6552af6d1c077fa25af54e6"},{"name":"guard_maintenance_account_event","sha256":"965d9d3433b929ccd151b9a147eeef713770d7b7311e49c80cfaa3d17b118549"},{"name":"guard_maintenance_audit_actor","sha256":"ac0ce9c91f34b9d8d34eb5e7d26f595319bfa6ad3dfe3ae33a4f2f5edf1eb217"},{"name":"guard_maintenance_before_root","sha256":"574add1ad436482c7593725ac4b1b58cabe6b982b538cf0e1f22c1783723712f"},{"name":"guard_maintenance_child_write","sha256":"a19def51718e008e541482dd1e6f2d2ab9257842ce7e66ad6e62aedcfa216d8a"},{"name":"guard_native_catalogue_binding","sha256":"7418579c0d1c3a1951696a12ad165a421d26b87f0e449d9d7d250497dc2ddc21"},{"name":"guard_native_catalogue_publication","sha256":"0c2052e7341acea54570fcf0dc541d48f21d106f47ba1ed400ef51ccc63386cf"},{"name":"guard_native_creation_identity","sha256":"4827b76ff4df9beae18411033d2e6e13a04eea2d648aa58bb67d179145d107dc"},{"name":"guard_native_party_import_intent","sha256":"262e74a37ba12883a4978c4d99b6ecca000d245186b585a9e5b35ad31ccf8d7f"},{"name":"guard_native_payment_binding","sha256":"774cc9b1604a8d0948f73c7298fa67a10233962af218b89fe0b9675107148d35"},{"name":"guard_native_payment_publication","sha256":"c494542b943c2f60dadaa1eb9f355f12c1de8c22b8e2237b3ddb11ef6450bdfe"},{"name":"guard_product_image_color","sha256":"a49cc6bc4c49931eb50c81dd95e08a760b2ea6de73e19a0496611fe63fe22b18"},{"name":"guard_product_season_selection","sha256":"bd97ac1bc0a8c9a3221c12b794f5976bf0e092a2907aa2dd9e6378b718d29560"},{"name":"guard_recorded_live_balance_pair","sha256":"f608bb3f3e1e69782022cc6f3a7313b0b7db0e9266dc5c78335744d46f9ccff8"},{"name":"guard_referenced_season_identity","sha256":"8eb0b3435f063f4a653c31f632fe6751fecc3864a375a72753bcf4090bb18f2c"},{"name":"guard_retained_catalogue_delete","sha256":"dec785b8b1f818b2daa3af4d3872139710cae32178516839e669f59aa6609758"},{"name":"guard_retained_catalogue_reference","sha256":"91cc169d60ca6db2700ed97e49632504cfba9d957ea467a4777137f946c6923c"},{"name":"guard_retained_settlement_identity","sha256":"12c13344ab5c786db30fe3b7bc0af1ad3b270c6433bf6245311de5f9f17c2022"},{"name":"guard_runtime_document_number","sha256":"52d92723d9ecb5f16eb57c5ae50e0f8cf322b4b5f3848ab88712f41aeb0887bd"},{"name":"guard_successor_publication26","sha256":"0c04d575867921541fe88a4f5300355603b6496fdb7db5f6ef4271372d6c1fdc"},{"name":"guard_successor_source26","sha256":"cdf91a3949d6aefbb16c67f7d82dcf99b60730f9a6884468c064102c9887b710"},{"name":"guard_unified_document","sha256":"e484c3224442c219825b19ed15c8cb56de9548728e374dfa783da5e65186f4fb"},{"name":"guard_unified_sales_customer_reference","sha256":"d8b2cfcba9d8ea3d1169074958afb43a425b234efae6dc4574606899970a59e3"},{"name":"history_closure_count_map","sha256":"ef82c0a7124d288103df38503a849b96aa936289b2ee29166b4f0a6529f476d6"},{"name":"history_closure_digest","sha256":"749101b8670e32814b875adaaf753da6c50ddcd0860d5ca3ebb000f996f1b63b"},{"name":"history_closure_document_rows","sha256":"f8401b06df7815f63f9a83e781961f55725f82246c87d86b7a99a9c19c482ce1"},{"name":"history_closure_encode","sha256":"b4ad51b2b17c9248c80de0ead3ae5f50bf5fe887e36597b081ce250a94623a5c"},{"name":"history_closure_finish","sha256":"94b84af2d05d8a9f34c0135a8c0d70f5b633a9b43e6ec6d2bca8de554e8abac8"},{"name":"history_closure_fold","sha256":"31ed823c127e85537196de072b76077749d939f3241fa53b9f1c76f8fdba9062"},{"name":"history_closure_projection","sha256":"0af6d70c56a463c351be1dd732d345bbb533ae98b0b07e36f6ef08a4efd72011"},{"name":"history_closure_projection_columns","sha256":"a8a3d4d43341d86dfad188d191c3076203e06ea8f1a6919c4d0efddee76286a6"},{"name":"history_closure_projection_key","sha256":"6e2584dac9f079fe2061570c15b13549a3abac512a2a809835046e6fe2c50222"},{"name":"history_closure_row_hash","sha256":"c7ef0fdc273f23ab5ec1ae6c870746146dab90a6ecef8ecf319de0704df697bb"},{"name":"history_closure_rows","sha256":"098ba7215c7c893903e2b72762e2036e94bc23b763f3842e378b3d55b3d3f639"},{"name":"history_closure_seed","sha256":"532918606a4dd24ebae46a55dfe7d2f0803602798c63742bcd975b7e1179f2c7"},{"name":"history_effective_set_guard","sha256":"324d469b4452aa8a5b37cc51cf2e41ad50fdd94718738dbb59d6796dfbdb83a1"},{"name":"history_effective_writes_closed","sha256":"5cfe1d51d7cfa4f30c5fe758ed3b203ec714fa4fc99185a901454d705ea3ba54"},{"name":"history_numeric_current_facts","sha256":"e9b62d95e68633c4fa2e0d5de8ba8d4fd5a577fa863941332553818ff01de8dc"},{"name":"history_numeric_ledger_set_guard","sha256":"83d5ef1ec17d817433ac8b19b3921eba86208f2979a41581a198813bc88ddef3"},{"name":"history_numeric_money","sha256":"8c588f3b6145cb1609898dd46e3abfb7b1bd37b3b9318f1863dcfac530ee200b"},{"name":"history_revision_not_enabled","sha256":"5d66ae3f7ad2dd49fe1d935299e44386923dfcc073d9485b992f03980c661a7c"},{"name":"import_source_key_lock","sha256":"07404b25633a5c48ae1a530a48cdebed11107e187d660c99a7e781bb4957fa24"},{"name":"inventory_key_admission","sha256":"a9d7a2519941605e997e5ab59cff7cf847192ed910ef4107ba09aadc64e0fc7a"},{"name":"inventory_key_lock","sha256":"c6f444fbbfc527fec7f4031fd0ea7f07eb0a98202b11340e8f7da398fa117079"},{"name":"inventory_runtime_key_admitted","sha256":"945a2cc1e250ed1cedd3ca2083b80120174d06d015455bd4288d186e0c27f377"},{"name":"is_exact_historical_customer_only","sha256":"1f35799a742f402d86cde6a979511dc83ae74d62cd5c106ffcef162a68510403"},{"name":"is_native_party_import_insert","sha256":"a3c8dfac77e8a4f060932aded92f53da97b68bdcf48d2ede19781c3e54c86412"},{"name":"keep_barcode_binding_identity","sha256":"14f6d02bca58955681e8d03236fb236cbfe3d041d35ecdb326cd3fa7e38d2733"},{"name":"keep_party_native_identity","sha256":"44c3a7110bf40ef38e73972b493f36279b28124097b31a9a6f25e5adc13ad4b9"},{"name":"keep_sales_line_owner","sha256":"95f3dc678bbdc8ac47a2f1c76fe13f872bed088e7484aebc46a523fc13cfd241"},{"name":"keep_transfer_header_provenance","sha256":"68d1af54e61704be47e9fe4097592e812d3f7a910dc2d7190351c2b427267bf6"},{"name":"keep_transfer_line_owner","sha256":"763d52e081f96f872adb50658403f5f2f7f83f7c914d002b0e771ebe9c055335"},{"name":"lock_category_tree_statement","sha256":"fe2f9bd7ed49d52697cb8a5aab6100bc61f2246c0f8ad02f945a7dbbd4a54834"},{"name":"maintenance_account_credential_action","sha256":"f17617bc8f02fd0731d0a97eaca90553441235e032de1dbf9086e84c987fbe7a"},{"name":"maintenance_action_allowed","sha256":"50b2fa0fbf733d7c98b40aa612107a20262cb063852cb3f2cabbefc750742c4a"},{"name":"maintenance_administrator_mutex","sha256":"d6809b2abf7b3f211cd7422b517e867d0c1378f9e7fe9b98eacde2521c6d1ea8"},{"name":"maintenance_audit_is_current","sha256":"4537d6df2b73e17e386b100845049da08d3fab3584c87ef8d7095660198bf699"},{"name":"maintenance_check_account_credential","sha256":"577bf0a5de72c8dc6d080c1b4f18a669398d5738c16b75d11ecc1c89d0156ab7"},{"name":"maintenance_check_category_order","sha256":"77c86d2788e88f2922a66c662a91b95c0f76d6ea00587148c36421feabde281e"},{"name":"maintenance_check_product_children","sha256":"c7edab87301fc05b7f33db2eb9df30b2da0d28ed9154dfa8d11cbba9fdbe6dad"},{"name":"maintenance_check_staff_accounts","sha256":"ea4e151ccb89d97ed40edc6e3164594bccda0fc28f2879f614f230830fdc0c22"},{"name":"maintenance_complete_row_matches","sha256":"34c25d78bc34ed57b1acbbdbfbca9b0adfd78dc8dcb6cc8c42cf5673f5da5d21"},{"name":"maintenance_evidence_matches","sha256":"cb201d859235d7af9ef52616c64b705e5586b11894d57fbc50b2b0a7615abaf3"},{"name":"maintenance_exact_rows_match","sha256":"8b21824423a27f20074768c09998fba819887c949b4f20b57e35db0815133161"},{"name":"maintenance_payment_halls","sha256":"d96c975c57af714d458275a383e0e2bdaeef9214d4bc64420207f36bcea55869"},{"name":"maintenance_product_child_row","sha256":"69145227348d366932814f079f0b63d1bb6109cc36d8bb8c9f8ae53fafd1b9fa"},{"name":"maintenance_root_table","sha256":"7ed286cf1e5bb8629b02e7cab4412dc0df502d560661be9823d234c466565fe3"},{"name":"maintenance_staff_accounts","sha256":"a191dc7b42cec0f41f42c6d371a2e959c90019983f4f79cef86db99d2e8fa989"},{"name":"native_creation_operation_valid","sha256":"118bbe55c39e00948ab087f808812522b565344b924e64916f6cfa91645a3f7a"},{"name":"party_key_values","sha256":"d23eb5601f984007df5d52661a101a422852e20c0bcd75f1cadd5a5bbbaef649"},{"name":"published_inventory_key","sha256":"fa8234711ad74b3afd250b2143840baa863f05f1e23c92b85574b48b4208adc6"},{"name":"reject_immutable_change","sha256":"3daef49e525ad973be82350a1551e979198d21ff58f3f1bb92a4f7292e4d038c"},{"name":"reject_unimplemented_cutoff_write","sha256":"2e108a1bd9e9304f63cde9eb8b726c448ebcb2d2b371f8b3a8a41aebb6d21e0a"},{"name":"safe_maintenance_evidence","sha256":"4a0d9d21eadf3e839d1d0c23f7efe8a0ef14123dd521a553eefcc7362ab3f927"},{"name":"transfer_header_audit_values","sha256":"f3795ec8bb218f81d9f274f794796584d1dd86ee3a2c841dd1cab95b11db6852"},{"name":"transfer_line_audit_values","sha256":"ce924832c6a9b4a762ff80e031279273f521e4e17139c7d89a4930004313f49e"},{"name":"unified_document_snapshot","sha256":"5b5b17b5b977321452ebe545825c2df19527a9e0072cb9ed0ab3ec102e02e7ed"},{"name":"unified_sales_header_audit_values","sha256":"cb5c332b2f8aaf99cca4a7c24234060fb74d8990a9d1cac252d13862cc23e91d"},{"name":"unified_sales_line_audit_values","sha256":"f3635675d41b2644a5cb002e84a4b4a6b4b979fbd4e6e22362db4181f59548ae"},{"name":"unified_sales_settlement_audit_values","sha256":"32b79f3e0708ef9839a278bf4e3b628ca072f922bbbf297ab23f7368ace4be54"},{"name":"valid_history_counts","sha256":"6c143e2bf81bcd53e2c9074aa2ab4e1781c746bc7a99bb0064f378f77de80280"},{"name":"valid_product_season_ids","sha256":"b6b3932264857c59998025cece6241a4e819b80f9bc72e6bf0ed4e907890cc65"},{"name":"validate_available_administrator_commit","sha256":"3a9a1bea930614761185af90b8591a539b855647974b68b004869c80f5e5ba18"},{"name":"validate_baseline_source_commit","sha256":"ec5e9a331d0f8148ec21e28d5e8a4ddb82ac66d923ea2490abee3f3000ed75c9"},{"name":"validate_category_final_component","sha256":"f6eba82eceeaf19ad781500cebcfc5b515f38bf11ed428d41897e909b821a07d"},{"name":"validate_document_specification_commit","sha256":"b02bff6115bcf2c87758f8313a57a1a693733ba3ea192fcb1657bd176c587c06"},{"name":"validate_exact_historical_customer_intent","sha256":"b9968150e138d455658dd7d437c8026b7bfdce466146b961d64fd2934f099c98"},{"name":"validate_exact_native_reversal","sha256":"4fc5952fe054d3c429c601c29b0d84d61cdae8ecf893eafb3d7e06e144b7dd86"},{"name":"validate_history_closure_commit","sha256":"e61d2c5dd34792f5ca277cada1dc12a6904b1be95031c0a6c4810080b24dd03b"},{"name":"validate_history_numeric_balance_commit","sha256":"fab0bf7a3f1681d6034b09dbb5c7ad8efa606c6fa82f24fc101bc5b70636a837"},{"name":"validate_history_numeric_receipt_commit","sha256":"e69f92651dc7a8313e354d47bd4f1ffc1c97fb30aa5c56dcfc49f69511a1d7d6"},{"name":"validate_history_numeric_revision_commit","sha256":"a73089ea7b30cfdb43f616ee1e8ae5fbc2f9a47d4c713b322b4012a28c6fe01c"},{"name":"validate_history_product_proofs","sha256":"dab49bb495de85d5e66350affd348f85e0595411ea7ab7378104a3963db2a38e"},{"name":"validate_import_accounting_baseline_commit","sha256":"678cc0b409e43e420365733b21ce8e8ce0aa88b8d3b9b48f9a842edd41120c51"},{"name":"validate_import_accounting_checkpoint_commit","sha256":"aa964dee26415bd96e86154068b3ff076fb285d8144523ec2afc84264ab69fc3"},{"name":"validate_import_accounting_claim_commit","sha256":"ad8e19c3f36b85ebbda107a2ca8e3c00ad10ca3005a232bd033bbab7613be756"},{"name":"validate_import_accounting_final_record_commit","sha256":"f1fca00daa56873221062706d2009293b6180156e69bfe6f5fc1ca64087ea312"},{"name":"validate_import_batch_commit","sha256":"3c0a05e33866ab556ef5651b933babba35e99645ed947b9055fa63b549a0fbdc"},{"name":"validate_import_operation","sha256":"73d13792e2a9dde79b239cb2c059a89c5552823503a002ce1b7bdad75aa1b3ff"},{"name":"validate_import_publish","sha256":"873d1943b1ada13eeef43f6d28cb792755de48c461b1ebee7810e5278cd5d6e3"},{"name":"validate_import_source_commit","sha256":"524ec70d51970cfc79f4ec5e9a93f21bf20733781a2202121a4e91d1d6b66f3a"},{"name":"validate_ledger_receipt_source","sha256":"26f2f325172ef2878d4dffb4f1740d680e63458abd4b25e7a693e352664d15da"},{"name":"validate_maintenance_receipt_commit","sha256":"77679e1e21858ae64ac1225660cf7a692f63b097d538254829def8164ea33ac5"},{"name":"validate_maintenance_root_commit","sha256":"002818dfd8d764e99221bb0548da1141054871ae674aba6bb9f6ce59c9d92d1c"},{"name":"validate_native_creation_commit","sha256":"a505ceb68946cc14a69b181cd43d6cebbedca9e9ea453c9920c243892f537cd7"},{"name":"validate_native_party_import_commit","sha256":"5383c9941e06c7748af6603eee56559b102b09305c11771a813c6cf859ad37e3"},{"name":"validate_party_native_commit","sha256":"dba217f39c61d3f4741a72a565851a41caaa18e44fb57aa2f8e3473d20810762"},{"name":"validate_party_receipt_commit","sha256":"fafc3389b3458b6d8ec4cad15f6f926dcc20bb059a819c496ed4db260d06b426"},{"name":"validate_recorded_live_balance_commit","sha256":"b32828510d3b85ae04c9d3849bcc494abe3cf337f0908996d72142fc171fb523"},{"name":"validate_sales_commit","sha256":"9fb5cba9244e3114b3734031673af9075ba491310431b75919cd476404626672"},{"name":"validate_sales_effect","sha256":"6cfa34cd77905b50cc258b855109174f90a9d6d18c55e6dc884b2deca088bbca"},{"name":"validate_sales_settlement","sha256":"149111d2da2a62f37a65578f76af7fddc156bbf3e8797e13c653d8481d294b21"},{"name":"validate_sparse_balance_commit","sha256":"acc1a0c0b8dd7a2c1ed0619eb97a7b4942ac8765d7d5d3a7d1432faf7d12c31b"},{"name":"validate_transfer_balance_commit","sha256":"9bfaa1cdf1dea76ada35bae56dd40cb3e27c6acd28a93905ee2f06d17a8b2abb"},{"name":"validate_transfer_commit","sha256":"5d5bb1cea93e658a8d3d1fd0a7146e12e2748b089f942e5d3294e5d78626667b"},{"name":"validate_transfer_effect","sha256":"fb480e5d0b18d3ede9861261ed6523d357cbc51f8b57cf0798c39a72891e5507"},{"name":"validate_transfer_header_commit","sha256":"790e449c0931268c220711fa1d6b85a627ec476a337992dea68f2856664ab4f4"},{"name":"validate_transfer_line_commit","sha256":"55f8b1f1723c545fdb10e64321d03d5e80a10f63c8c90b374ef7f7426ef36239"},{"name":"validate_unified_baseline_reversal","sha256":"e79f446269183dc9af235f7408344462e933f4ddd687231a671fc8b195923aed"},{"name":"validate_unified_ordinary_operation","sha256":"4df5ec2f7c3a25d2461a56586f83f20d63773f01e6ca80b9c45429676a1969a4"},{"name":"validate_unified_sales_header_commit","sha256":"a8ce6dd5da8e1098f097ffed58304b2ab857b5b576e4e868804f76d5018a6339"},{"name":"validate_unified_sales_line_commit","sha256":"a31692ba5b18b9da6701ccd12d3101af1a5e85ba15b60e1e7150a6e4723d8ef5"},{"name":"validate_unified_sales_settlement_commit","sha256":"d2da5c47e935406e114fc06a487f128fbbe7d370d9b204ac10df956cba7d9abd"}]$pins$::jsonb) LOOP
  IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace AND proname=item->>'name') IS DISTINCT FROM item->>'sha256' THEN
   RAISE EXCEPTION 'STANDARD_PREDECESSOR_BODY_DIFFERS: %',item->>'name' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR r IN SELECT * FROM pg_roles WHERE rolname IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2','erp_unified27_runtime_2393dbc6db9581c2') LOOP
  IF r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid)
    OR r.oid IN ((SELECT nspowner FROM pg_namespace WHERE nspname='naijue_erp'),(SELECT datdba FROM pg_database WHERE datname=current_database())) THEN
   RAISE EXCEPTION 'STANDARD_NONOWNER_TEST_ROLE_UNSAFE' USING ERRCODE='42501'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2','erp_unified27_runtime_2393dbc6db9581c2'))<>3 THEN
  RAISE EXCEPTION 'STANDARD_THREE_APPROVED_NOLOGIN_ROLES_REQUIRED' USING ERRCODE='42501'; END IF;
END $parent$;

-- Preserve exact nonnull source hall default facts across the real hall/warehouse cycle.
ALTER TABLE naijue_erp.hall ALTER CONSTRAINT hall_default_sales_warehouse_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE naijue_erp.import_record DROP CONSTRAINT import_record_target_type_check;
ALTER TABLE naijue_erp.import_record ADD CONSTRAINT import_record_target_type_check CHECK(target_type IN (
 'HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL',
 'INVENTORY_KEY','INVENTORY_LEDGER','IMPORT_BATCH','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE'));
CREATE UNIQUE INDEX standard_inventory_key_once ON naijue_erp.import_record(import_batch_id,target_id) WHERE target_type='INVENTORY_KEY' AND status='IMPORTED';
CREATE UNIQUE INDEX import_batch_namespace_binding_once ON naijue_erp.import_record(target_id) WHERE source_entity_type='BATCH_NAMESPACE_BINDING' AND status='IMPORTED';
CREATE UNIQUE INDEX standard_baseline_activation_once ON naijue_erp.operation_receipt((result_data->>'baselineBatchId'))
 WHERE target_type='IMPORT' AND action='IMPORT_PUBLISH' AND result_data->>'profile'='STANDARD_IMPORT_SQL_V1' AND result_data->>'phase'='DOCUMENT_PUBLISH';
DO $checks$
DECLARE rel regclass; tag text; c text; previous text;
BEGIN
 FOR rel,tag,c IN SELECT * FROM (VALUES ('naijue_erp.operation_receipt'::regclass,'target_type','receipt_action_by_kind'),('naijue_erp.audit_change'::regclass,'object_type','audit_action_by_kind')) x(r,t,n) LOOP
  SELECT pg_get_expr(conbin,conrelid) INTO STRICT previous FROM pg_constraint WHERE conrelid=rel AND conname=c;
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',rel,c);
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK(((%s) OR (%I=''IMPORT'' AND action=''IMPORT_INITIALIZE_CURRENT_ADMIN'')) IS TRUE)',rel,c,previous,tag);
 END LOOP;
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT previous FROM pg_constraint WHERE conrelid='naijue_erp.operation_receipt'::regclass AND conname='receipt_result_by_kind';
 ALTER TABLE naijue_erp.operation_receipt DROP CONSTRAINT receipt_result_by_kind;
 EXECUTE format($sql$ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_result_by_kind CHECK((CASE WHEN target_type='IMPORT' AND result_data->>'profile'='STANDARD_IMPORT_SQL_V1' THEN
  action IN ('IMPORT_INITIALIZE_CURRENT_ADMIN','IMPORT_STAGE','IMPORT_CHUNK','IMPORT_PUBLISH')
  AND jsonb_typeof(result_data)='object' AND result_data ?& ARRAY['profile','operationId','batchId','sequence','cursor','status','ledgerEntryIds','sourceRecordIds','phase','planSha256','packageManifestSha256','baselineBatchId','documentBatchId']
  AND result_data-ARRAY['profile','operationId','batchId','sequence','cursor','status','ledgerEntryIds','sourceRecordIds','phase','planSha256','packageManifestSha256','baselineBatchId','documentBatchId']='{}'::jsonb
  AND result_data->>'operationId'=id::text AND result_data->>'batchId'=target_id::text
  AND result_data->>'sequence' ~ '^[0-9]+$' AND result_data->>'cursor' ~ '^[0-9]+$'
  AND result_data->>'status' IN ('STAGED','VALIDATING','IMPORTED') AND jsonb_typeof(result_data->'ledgerEntryIds')='array' AND jsonb_typeof(result_data->'sourceRecordIds')='array'
  AND result_data->>'phase' IN ('INITIALIZE','MASTER','KEYS','BASELINE_SEAL','DOCUMENT_STAGE','DOCUMENTS','DOCUMENT_PUBLISH')
  AND result_data->>'planSha256' ~ '^[0-9a-f]{64}$' AND result_data->>'packageManifestSha256' ~ '^[0-9a-f]{64}$'
 ELSE (%s) END) IS TRUE)$sql$,previous);
END $checks$;

CREATE FUNCTION naijue_erp.standard_inventory_key_id(warehouse uuid,sku uuid) RETURNS uuid LANGUAGE sql IMMUTABLE STRICT
SET search_path=pg_catalog,naijue_erp AS $$
 SELECT substring(encode(sha256(convert_to('[s"naijue-cutoff-v1",s"inventory-key-v1",s"'||warehouse::text||'",s"'||sku::text||'"]','UTF8')),'hex') FROM 1 FOR 32)::uuid;
$$;

CREATE FUNCTION naijue_erp.standard_import_identity(session_token text,role_kind text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE selected text:=current_setting('role'); actual name; expected text; role_row record; account uuid; selected_hash text;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'STANDARD_READ_COMMITTED_REQUIRED' USING ERRCODE='25000'; END IF;
 -- This is PostgreSQL's protected SET ROLE identity, not a custom application GUC.
 -- Controller session_user may remain privileged: evidence is SET_ROLE_ONLY_NOT_NONOWNER_LOGIN.
 actual:=CASE WHEN selected='none' THEN session_user ELSE selected::name END;
 expected:=CASE role_kind WHEN 'INITIALIZER' THEN 'erp_unified27_initializer_2393dbc6db9581c2'
  WHEN 'IMPORTER' THEN 'erp_unified27_importer_2393dbc6db9581c2'
  WHEN 'ROLE_IMPORTER' THEN 'erp_unified27_importer_2393dbc6db9581c2'
  WHEN 'INSPECT' THEN actual::text ELSE NULL END;
 IF expected IS NULL OR actual::text<>expected OR (role_kind='INSPECT' AND actual::text NOT IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')) THEN
  RAISE EXCEPTION 'STANDARD_PROTECTED_ROLE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT role_row FROM pg_roles WHERE rolname=actual;
 IF role_row.rolcanlogin OR role_row.rolsuper OR role_row.rolcreatedb OR role_row.rolcreaterole OR role_row.rolreplication OR role_row.rolbypassrls
  OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=role_row.oid)
  OR role_row.oid IN ((SELECT nspowner FROM pg_namespace WHERE nspname='naijue_erp'),(SELECT datdba FROM pg_database WHERE datname=current_database()))
  OR NOT pg_has_role(session_user,role_row.oid,'SET') THEN RAISE EXCEPTION 'STANDARD_PROTECTED_ROLE_UNSAFE' USING ERRCODE='42501'; END IF;
 IF role_kind IN ('INITIALIZER','ROLE_IMPORTER') OR (role_kind='INSPECT' AND actual::text='erp_unified27_initializer_2393dbc6db9581c2') THEN RETURN NULL; END IF;
 IF session_token IS NULL OR session_token !~ '^[A-Za-z0-9_-]{43}$' THEN RAISE EXCEPTION 'STANDARD_AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 -- Canonical unpadded base64url encoding has only four significant final bits.
 IF right(session_token,1) !~ '^[AEIMQUYcgkosw048]$' THEN RAISE EXCEPTION 'STANDARD_AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 selected_hash:=encode(sha256(convert_to('naijue-erp:session:v1:'||session_token,'UTF8')),'hex');
 SELECT a.id INTO account FROM naijue_erp.auth_session se JOIN naijue_erp.user_account a ON a.id=se.account_id
  JOIN naijue_erp.staff st ON st.id=a.staff_id LEFT JOIN naijue_erp.hall h ON h.id=st.hall_id
  WHERE se.token_hash=selected_hash AND se.revoked_at IS NULL AND se.created_at<=clock_timestamp() AND se.expires_at>clock_timestamp()
   AND se.auth_version=a.auth_version AND a.login_enabled AND st.employment_status='在职' AND st.role='ADMIN' AND (st.hall_id IS NULL OR h.enabled)
  FOR SHARE OF se,a,st;
 IF account IS NULL THEN RAISE EXCEPTION 'STANDARD_AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN account;
END $$;

CREATE FUNCTION naijue_erp.standard_import_record_proof(record_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE s naijue_erp.import_record%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; b naijue_erp.import_batch%ROWTYPE; pointer jsonb; item jsonb;
BEGIN
 SELECT * INTO STRICT s FROM naijue_erp.import_record WHERE id=record_id;
 SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=s.import_batch_id;
 pointer:=s.decision_reason::jsonb;
 IF pointer->>'format'<>'STANDARD_IMPORT_POINTER_V1' OR pointer-ARRAY['format','code','operationId']<>'{}' OR pointer->>'code'<>'SOURCE_BOUND' THEN
  RAISE EXCEPTION 'STANDARD_RECORD_POINTER_INVALID' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=(pointer->>'operationId')::uuid;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
 SELECT value INTO STRICT item FROM jsonb_array_elements(a.after_values->'records') WHERE value->>'id'=s.id::text;
 IF s.status<>'IMPORTED' OR s.reviewed_at IS NULL OR s.source_system<>b.source_name OR r.target_type<>'IMPORT' OR r.target_id<>b.id
  OR r.result_data->>'profile'<>'STANDARD_IMPORT_SQL_V1' OR r.status<>'COMMITTED' OR a.object_type<>r.target_type OR a.object_id<>r.target_id OR a.action<>r.action
  OR a.actor_account_id<>r.actor_account_id OR a.occurred_at IS DISTINCT FROM r.completed_at
  OR item->>'source_key'<>s.source_key OR item->>'entity_type'<>s.source_entity_type OR item->>'target_type'<>s.target_type
  OR item->>'target_id'<>s.target_id::text OR item->>'source_hash'<>s.source_record_hash OR item->>'file_ref'<>s.source_file_ref
  OR r.result_data->>'packageManifestSha256'<>b.source_hash OR a.after_values->'request'->>'namespace'<>b.source_name THEN
  RAISE EXCEPTION 'STANDARD_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
 RETURN item||jsonb_build_object('operation_id',r.id,'batch_id',b.id,'source_system',b.source_name,'source_hash',b.source_hash,'cutoff_at',b.cutoff_at,
  'current_operation',(SELECT rr.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint FROM naijue_erp.operation_receipt rr WHERE rr.id=r.id));
END $$;

CREATE FUNCTION naijue_erp.standard_import_row_intent(kind text,native_row jsonb) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE a naijue_erp.audit_change%ROWTYPE; item jsonb; expected jsonb; table_name text;
BEGIN
 IF current_setting('role') NOT IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2') THEN RETURN false; END IF;
 table_name:=lower(kind);
 IF kind NOT IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') THEN RETURN false; END IF;
 FOR a IN SELECT * FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1'
  AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint LOOP
  FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') WHERE value->>'target_type'=kind LOOP
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',table_name) INTO expected USING item->'fields';
   IF expected=native_row THEN RETURN true; END IF;
  END LOOP;
 END LOOP;
 RETURN false;
END $$;

CREATE FUNCTION naijue_erp.standard_inventory_key_proof(warehouse uuid,sku uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE s naijue_erp.import_record%ROWTYPE; b naijue_erp.import_batch%ROWTYPE; proof jsonb;
BEGIN
 IF NOT naijue_erp.standard_business_ready() AND current_setting('role')<>'erp_unified27_importer_2393dbc6db9581c2' THEN RETURN jsonb_build_object('state','UNKNOWN'); END IF;
 SELECT * INTO b FROM naijue_erp.import_batch WHERE inventory_mode='CUTOFF_STOCK_BASELINE' AND mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' AND status='IMPORTED';
 IF NOT FOUND THEN RETURN jsonb_build_object('state','UNKNOWN'); END IF;
 SELECT * INTO s FROM naijue_erp.import_record WHERE import_batch_id=b.id AND target_type='INVENTORY_KEY' AND target_id=naijue_erp.standard_inventory_key_id(warehouse,sku) AND status='IMPORTED';
 IF NOT FOUND THEN RETURN jsonb_build_object('state','UNKNOWN','baseline_batch_id',b.id); END IF;
 proof:=naijue_erp.standard_import_record_proof(s.id);
 IF proof->'fields'->>'warehouse_id'<>warehouse::text OR proof->'fields'->>'sku_id'<>sku::text THEN RAISE EXCEPTION 'STANDARD_KEY_IDENTITY_INVALID' USING ERRCODE='23514'; END IF;
 RETURN proof||jsonb_build_object('state',CASE WHEN (proof->'fields'->>'quantity')::bigint=0 THEN 'EXPLICIT_ZERO' ELSE 'NONZERO' END,'baseline_batch_id',b.id);
END $$;

CREATE FUNCTION naijue_erp.standard_business_ready() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp AS $$
 SELECT EXISTS(SELECT 1 FROM naijue_erp.import_batch baseline JOIN naijue_erp.operation_receipt r
  ON r.result_data->>'baselineBatchId'=baseline.id::text AND r.target_type='IMPORT' AND r.action='IMPORT_PUBLISH'
    AND r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' AND r.result_data->>'phase'='DOCUMENT_PUBLISH'
  JOIN naijue_erp.import_batch documents ON documents.id=r.target_id
  WHERE baseline.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' AND baseline.inventory_mode='CUTOFF_STOCK_BASELINE' AND baseline.status='IMPORTED'
   AND documents.inventory_mode='DOCUMENT_CONVERSION' AND documents.mapping_version='DOCUMENT_CONVERSION_V1' AND documents.status='IMPORTED'
   AND documents.source_hash=baseline.source_hash AND documents.source_name=baseline.source_name AND documents.cutoff_at=baseline.cutoff_at
   AND r.result_data->>'packageManifestSha256'=baseline.source_hash AND r.status='COMMITTED');
$$;

CREATE FUNCTION naijue_erp.assert_standard_import_operation(operation uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; b naijue_erp.import_batch%ROWTYPE;
 item jsonb; actual jsonb; expected jsonb; table_name text; kind text; before_cp jsonb; after_cp jsonb; keys text[]; field text;
 delta numeric; total numeric:=0; ids jsonb; claimed jsonb; account_staff uuid; row_count bigint;
BEGIN
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=operation;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
 SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
 before_cp:=a.before_values; after_cp:=a.after_values->'checkpoint';
 IF r.target_type<>'IMPORT' OR r.result_data->>'profile'<>'STANDARD_IMPORT_SQL_V1' OR a.after_values->>'profile'<>'STANDARD_IMPORT_SQL_V1'
  OR r.status<>'COMMITTED' OR a.object_type<>r.target_type OR a.object_id<>r.target_id OR a.action<>r.action OR a.actor_account_id<>r.actor_account_id
  OR a.occurred_at IS DISTINCT FROM r.completed_at OR a.new_version::text IS DISTINCT FROM ((after_cp->>'sequence')::integer+1)::text
  OR after_cp IS DISTINCT FROM b.checkpoint OR r.result_data->>'sequence' IS DISTINCT FROM after_cp->>'sequence'
  OR r.result_data->>'cursor' IS DISTINCT FROM after_cp->>'cursor' OR r.result_data->>'status' IS DISTINCT FROM b.status
  OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM b.id::text OR a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
  OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
  OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at THEN
  RAISE EXCEPTION 'STANDARD_OPERATION_CLOSURE_INVALID' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id
  WHERE u.id=r.actor_account_id AND u.login_enabled AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
  RAISE EXCEPTION 'STANDARD_CURRENT_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF r.result_data->>'phase'='INITIALIZE' THEN PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');
 ELSE PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER'); END IF;
 keys:=CASE WHEN b.inventory_mode='DOCUMENT_CONVERSION' THEN ARRAY['SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE','IMPORT_BATCH']
  ELSE ARRAY['MASTER','INVENTORY_KEY','INVENTORY_EFFECT','NAMESPACE','IMPORT_BATCH'] END;
 IF (SELECT count(*) FROM jsonb_object_keys(after_cp->'counts'))<>cardinality(keys) OR (SELECT count(*) FROM jsonb_object_keys(after_cp->'expected'))<>cardinality(keys) THEN
  RAISE EXCEPTION 'STANDARD_COUNTER_SET_INVALID' USING ERRCODE='23514'; END IF;
 FOREACH field IN ARRAY keys LOOP
  IF jsonb_typeof(after_cp->'counts'->field) IS DISTINCT FROM 'number' OR jsonb_typeof(after_cp->'expected'->field) IS DISTINCT FROM 'number'
   OR (after_cp->'counts'->>field ~ '^[0-9]+$') IS DISTINCT FROM true OR (after_cp->'expected'->>field ~ '^[0-9]+$') IS DISTINCT FROM true
   OR (after_cp->'counts'->>field)::numeric>(after_cp->'expected'->>field)::numeric THEN RAISE EXCEPTION 'STANDARD_COUNTER_RANGE_INVALID' USING ERRCODE='23514'; END IF;
  total:=total+(after_cp->'counts'->>field)::numeric;
  SELECT count(*) INTO row_count FROM jsonb_array_elements(a.after_values->'records') value WHERE
   CASE field WHEN 'MASTER' THEN value->>'target_type' NOT IN ('INVENTORY_KEY','IMPORT_BATCH','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE')
    WHEN 'INVENTORY_EFFECT' THEN value->>'target_type'='INVENTORY_KEY' AND (value->'fields'->>'quantity')::bigint<>0
    WHEN 'NAMESPACE' THEN value->>'entity_type'='BATCH_NAMESPACE_BINDING'
    WHEN 'IMPORT_BATCH' THEN value->>'target_type'='IMPORT_BATCH' AND value->>'entity_type'<>'BATCH_NAMESPACE_BINDING'
    ELSE value->>'target_type'=field END;
  delta:=(after_cp->'counts'->>field)::numeric-coalesce((before_cp->'counts'->>field)::numeric,0);
  IF delta<>row_count THEN RAISE EXCEPTION 'STANDARD_EXACT_PROGRESS_DELTA_INVALID: %',field USING ERRCODE='23514'; END IF;
 END LOOP;
 IF total<>(after_cp->>'cursor')::numeric OR (before_cp IS NULL AND ((after_cp->>'sequence')::integer<>0 OR a.old_version IS NOT NULL))
  OR (before_cp IS NOT NULL AND ((after_cp->>'sequence')::numeric<>(before_cp->>'sequence')::numeric+1 OR a.old_version<>(before_cp->>'sequence')::integer+1 OR a.old_version IS NULL)) THEN
  RAISE EXCEPTION 'STANDARD_CHECKPOINT_CHAIN_INVALID' USING ERRCODE='23514'; END IF;
 SELECT coalesce(jsonb_agg(id::text ORDER BY id),'[]') INTO ids FROM naijue_erp.import_record WHERE id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(a.after_values->'records'));
 SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') INTO claimed FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
 IF ids IS DISTINCT FROM claimed THEN RAISE EXCEPTION 'STANDARD_RECEIPT_SOURCE_SET_INVALID' USING ERRCODE='23514'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
  PERFORM naijue_erp.standard_import_record_proof((item->>'id')::uuid);
  kind:=item->>'target_type';table_name:=lower(kind);
  IF kind='INVENTORY_KEY' THEN
   IF (item->'fields'->>'quantity')::bigint=0 THEN
    IF item->>'ledger_entry_id' IS NOT NULL OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE source_import_batch_id=b.id AND warehouse_id=(item->'fields'->>'warehouse_id')::uuid AND sku_id=(item->'fields'->>'sku_id')::uuid) THEN
     RAISE EXCEPTION 'STANDARD_EXPLICIT_ZERO_CANNOT_POST_LEDGER' USING ERRCODE='23514'; END IF;
   ELSIF NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l JOIN naijue_erp.inventory_balance q ON q.warehouse_id=l.warehouse_id AND q.sku_id=l.sku_id
    WHERE l.id=(item->>'ledger_entry_id')::uuid AND l.operation_id=r.id AND l.source_import_batch_id=b.id AND l.event_kind='CUTOFF_BASELINE'
      AND l.warehouse_id=(item->'fields'->>'warehouse_id')::uuid AND l.sku_id=(item->'fields'->>'sku_id')::uuid AND l.quantity_delta=(item->'fields'->>'quantity')::bigint
      AND q.quantity=l.quantity_delta AND q.version=1 AND q.last_operation_id=r.id AND q.updated_at=r.completed_at) THEN
    RAISE EXCEPTION 'STANDARD_NONZERO_BASELINE_EFFECT_INVALID' USING ERRCODE='23514'; END IF;
  ELSIF kind='IMPORT_BATCH' THEN
   IF item->>'target_id'<>b.id::text THEN RAISE EXCEPTION 'STANDARD_BATCH_IDENTITY_INVALID' USING ERRCODE='23514'; END IF;
  ELSE
   IF kind NOT IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') THEN
    RAISE EXCEPTION 'STANDARD_TARGET_KIND_INVALID' USING ERRCODE='23514'; END IF;
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',table_name) INTO expected USING item->'fields';
   IF kind='SIZE_GROUP_MEMBER' THEN SELECT to_jsonb(t) INTO actual FROM naijue_erp.size_group_member t WHERE size_group_id=(item->'fields'->>'size_group_id')::uuid AND size_id=(item->'fields'->>'size_id')::uuid;
   ELSIF kind='PAYMENT_ACCOUNT_HALL' THEN SELECT to_jsonb(t) INTO actual FROM naijue_erp.payment_account_hall t WHERE payment_account_id=(item->'fields'->>'payment_account_id')::uuid AND hall_id=(item->'fields'->>'hall_id')::uuid;
   ELSE EXECUTE format('SELECT to_jsonb(t) FROM naijue_erp.%I t WHERE id=$1',table_name) INTO actual USING (item->>'target_id')::uuid; END IF;
   IF kind='TRANSFER_LINE' THEN expected:=expected-'current_line_no';actual:=actual-'current_line_no'; END IF;
   IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'STANDARD_TYPED_NATIVE_ROW_DIFFERS: %',kind USING ERRCODE='23514'; END IF;
   IF kind='HALL' AND expected->>'default_sales_warehouse_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM naijue_erp.warehouse WHERE id=(expected->>'default_sales_warehouse_id')::uuid AND hall_id=(expected->>'id')::uuid) THEN RAISE EXCEPTION 'STANDARD_HALL_DEFAULT_OWNERSHIP_INVALID' USING ERRCODE='23514'; END IF;
   IF kind='PRODUCT_CATEGORY' AND EXISTS(WITH RECURSIVE ancestry AS (SELECT c.id,c.parent_id,ARRAY[c.id] visited,false cycle FROM naijue_erp.product_category c WHERE c.id=(expected->>'id')::uuid UNION ALL SELECT c.id,c.parent_id,a.visited||c.id,c.id=ANY(a.visited) FROM ancestry a JOIN naijue_erp.product_category c ON c.id=a.parent_id WHERE NOT a.cycle) SELECT 1 FROM ancestry WHERE cycle) THEN RAISE EXCEPTION 'STANDARD_CATEGORY_CYCLE_DENIED' USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(id::text ORDER BY id),'[]') INTO ids FROM naijue_erp.inventory_ledger WHERE operation_id=r.id;
 SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') INTO claimed FROM jsonb_array_elements_text(r.result_data->'ledgerEntryIds');
 IF ids IS DISTINCT FROM claimed OR (r.result_data->>'phase'<>'KEYS' AND ids<>'[]') THEN RAISE EXCEPTION 'STANDARD_EXACT_EFFECT_SET_INVALID' USING ERRCODE='23514'; END IF;
 IF r.result_data->>'phase'='INITIALIZE' THEN
  SELECT staff_id INTO STRICT account_staff FROM naijue_erp.user_account WHERE id=r.actor_account_id AND login_enabled AND auth_version=1 AND version=1
   AND password_hash ~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$' AND created_at=r.completed_at AND updated_at=r.completed_at;
  IF account_staff::text IS DISTINCT FROM a.after_values->'current_admin'->>'staff_id'
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.staff WHERE id=account_staff AND role='ADMIN' AND hall_id IS NULL AND employment_status='在职' AND version=1) THEN
   RAISE EXCEPTION 'STANDARD_CURRENT_PROVISIONING_CLOSURE_INVALID' USING ERRCODE='23514'; END IF;
 END IF;
 IF b.status='IMPORTED' AND after_cp->'counts' IS DISTINCT FROM after_cp->'expected' THEN RAISE EXCEPTION 'STANDARD_PUBLISH_COUNTS_INCOMPLETE' USING ERRCODE='23514'; END IF;
END $$;

CREATE FUNCTION naijue_erp.standard_import_command(request jsonb,private_parameter text,command_phase text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE actor uuid; operation uuid; batch uuid; fingerprint text; prior naijue_erp.operation_receipt%ROWTYPE; prior_a naijue_erp.audit_change%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; baseline naijue_erp.import_batch%ROWTYPE; initial_request jsonb; payload jsonb; cp jsonb; old_cp jsonb; records jsonb:='[]';
 entry jsonb; fields jsonb; item jsonb; result jsonb; source_ids jsonb:='[]'; ledger_ids jsonb:='[]'; expected jsonb; actual jsonb; cfg jsonb; admin jsonb;
 table_name text; kind text; target uuid; record_id uuid; source_hash text; quantity bigint; counter text; action_name text; phase text; source_key text; file_ref text;
 n integer; source_count integer; total numeric; parsed jsonb; doc jsonb; doc_id uuid; child_op uuid; child_result jsonb; snap jsonb; anchor_baseline jsonb; key_proof jsonb; endpoints record;
 pk_exists boolean; registry_basis text; encoded text; parent_row record; any_rows boolean;
BEGIN
 -- Every mutation and status uses this same real transaction lock barrier.
 PERFORM naijue_erp.cutoff_import_lock();
 IF jsonb_typeof(request) IS DISTINCT FROM 'object' OR request-ARRAY['protocol','operation_id','request_key','batch_id','plan_sha256','package_manifest_sha256','namespace','cutoff_at','payload']<>'{}'
  OR NOT(request ?& ARRAY['protocol','operation_id','request_key','batch_id','plan_sha256','package_manifest_sha256','namespace','cutoff_at','payload'])
  OR request->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1' OR jsonb_typeof(request->'payload') IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_each(request) e WHERE e.key<>'payload' AND jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR (request->>'plan_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true OR (request->>'package_manifest_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true
  OR (request->>'namespace' ~ '^[a-z][a-z0-9_.:-]*$') IS DISTINCT FROM true OR coalesce(length(request->>'request_key'),0)=0 THEN
  RAISE EXCEPTION 'STANDARD_REQUEST_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
 operation:=(request->>'operation_id')::uuid;batch:=(request->>'batch_id')::uuid;payload:=request->'payload';
 IF operation IS NULL OR batch IS NULL THEN RAISE EXCEPTION 'STANDARD_OPERATION_ID_REQUIRED' USING ERRCODE='23514'; END IF;
 IF command_phase='INITIALIZE' THEN
  PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');actor:=(payload->'admin'->>'account_id')::uuid;
  fingerprint:=encode(sha256(convert_to(command_phase||':'||request::text||':'||coalesce(private_parameter,''),'UTF8')),'hex');
 ELSE actor:=naijue_erp.standard_import_identity(private_parameter,'IMPORTER');fingerprint:=encode(sha256(convert_to(command_phase||':'||request::text,'UTF8')),'hex'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:standard-receipt:'||actor::text||':'||(request->>'request_key'),0));
 SELECT * INTO prior FROM naijue_erp.operation_receipt WHERE actor_account_id=actor AND request_key=request->>'request_key';
 IF FOUND THEN
  SELECT * INTO STRICT prior_a FROM naijue_erp.audit_change WHERE operation_id=prior.id;
  IF prior.id<>operation OR prior.target_id<>batch OR prior.target_type<>'IMPORT' OR prior.request_hash<>fingerprint OR prior_a.after_values->'request' IS DISTINCT FROM request THEN
   RAISE EXCEPTION 'STANDARD_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','operation_id',prior.id,'batch_id',batch,'request_sha256',prior.request_hash,'state','COMMITTED','sequence',prior.result_data->'sequence','cursor',prior.result_data->'cursor','receipt',prior.result_data);
 END IF;
 IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' AND r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN RAISE EXCEPTION 'STANDARD_ONE_MUTATION_PER_TRANSACTION' USING ERRCODE='25000'; END IF;
 IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=operation) THEN RAISE EXCEPTION 'STANDARD_OPERATION_ID_CONFLICT' USING ERRCODE='23505'; END IF;
 IF command_phase='INITIALIZE' THEN
  IF payload-ARRAY['mode','manifest_ref','registry_sha256','alignment_sha256','document_batch_id','namespace_record_id','admin','expected','expected_master_counts','expected_documents']<>'{}'
   OR NOT(payload ?& ARRAY['mode','manifest_ref','registry_sha256','alignment_sha256','document_batch_id','namespace_record_id','admin','expected','expected_master_counts','expected_documents'])
   OR payload->>'mode' IS DISTINCT FROM 'NEW_EMPTY' OR payload->'admin'-ARRAY['staff_id','account_id','login_name','staff_name']<>'{}'
   OR private_parameter IS NULL OR private_parameter !~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$'
   OR coalesce(length(btrim(payload->>'manifest_ref')),0)=0 OR (payload->>'registry_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true OR (payload->>'alignment_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true
   OR coalesce(length(btrim(payload->'admin'->>'login_name')),0)=0 OR coalesce(length(btrim(payload->'admin'->>'staff_name')),0)=0 THEN
   RAISE EXCEPTION 'STANDARD_INITIALIZATION_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(payload->'admin') IS DISTINCT FROM 'object' OR NOT(payload->'admin' ?& ARRAY['staff_id','account_id','login_name','staff_name'])
   OR (payload->'admin'->>'staff_id')::uuid IS NULL OR actor IS NULL OR (payload->>'document_batch_id')::uuid IS NULL OR (payload->>'namespace_record_id')::uuid IS NULL
   OR payload->>'document_batch_id'=batch::text
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(payload->'expected_master_counts') k) IS DISTINCT FROM ARRAY['BARCODE_SCHEME','COLOR','CUSTOMER','FIT','HALL','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','PAYMENT_METHOD','PRODUCT','PRODUCT_CATEGORY','PRODUCT_IMAGE','SEASON','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SKU','SKU_BARCODE','STAFF','SUPPLIER','WAREHOUSE']
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(payload->'expected_documents') k) IS DISTINCT FROM ARRAY['IMPORT_BATCH','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE']
   OR EXISTS(SELECT 1 FROM jsonb_each(payload->'expected_master_counts') e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'number' OR (e.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR e.value::text::numeric>500)
   OR EXISTS(SELECT 1 FROM jsonb_each(payload->'expected_documents') e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'number' OR (e.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR e.value::text::numeric>2147483646)
   OR (SELECT sum(value::text::numeric) FROM jsonb_each(payload->'expected_master_counts')) IS DISTINCT FROM (payload->'expected'->>'MASTER')::numeric
   OR (payload->'expected'->>'MASTER')::numeric>500 OR payload->'expected'->>'NAMESPACE' IS DISTINCT FROM '1' OR payload->'expected'->>'IMPORT_BATCH' IS DISTINCT FROM '1' OR payload->'expected_documents'->>'IMPORT_BATCH' IS DISTINCT FROM '1'
   THEN RAISE EXCEPTION 'STANDARD_INITIALIZATION_CLOSED_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
  -- No existing baseline/account/master/history adoption is silently enabled.
  FOR parent_row IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='naijue_erp' AND c.relkind IN ('r','p') AND c.relname<>'schema_migration' LOOP
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I)',parent_row.relname) INTO any_rows;
   IF any_rows THEN RAISE EXCEPTION 'STANDARD_NEW_EMPTY_ONLY: populated target requires separately reviewed adoption' USING ERRCODE='23514'; END IF;
  END LOOP;
  admin:=payload->'admin';
  INSERT INTO naijue_erp.staff(id,name,hall_id,role,contact,employment_status,version)
   VALUES((admin->>'staff_id')::uuid,admin->>'staff_name',NULL,'ADMIN',NULL,'在职',1);
  INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)
   VALUES(actor,(admin->>'staff_id')::uuid,admin->>'login_name',private_parameter,true,1,1,transaction_timestamp(),transaction_timestamp());
  expected:=payload->'expected';
  cp:=jsonb_build_object('sequence',0,'cursor',0,'counts','{"MASTER":0,"INVENTORY_KEY":0,"INVENTORY_EFFECT":0,"NAMESPACE":0,"IMPORT_BATCH":0}'::jsonb,'expected',expected);
  INSERT INTO naijue_erp.import_batch(id,source_name,source_manifest_ref,source_hash,cutoff_at,mapping_version,inventory_mode,status,checkpoint,created_at)
   VALUES(batch,request->>'namespace',payload->>'manifest_ref',request->>'package_manifest_sha256',(request->>'cutoff_at')::timestamptz,'STANDARD_INITIAL_EXPLICIT_KEYS_V1','CUTOFF_STOCK_BASELINE','STAGED',cp,transaction_timestamp());
  phase:='INITIALIZE';action_name:='IMPORT_INITIALIZE_CURRENT_ADMIN';old_cp:=NULL;
 ELSIF command_phase='DOCUMENTS' AND payload->>'mode'='STAGE' THEN
  IF payload-ARRAY['mode','baseline_batch_id','expected_sequence','expected','rows','documents']<>'{}' OR payload->'expected_sequence'<>'null' OR payload->'rows'<>'[]' OR payload->'documents'<>'[]' THEN
   RAISE EXCEPTION 'STANDARD_DOCUMENT_STAGE_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT baseline FROM naijue_erp.import_batch WHERE id=(payload->>'baseline_batch_id')::uuid FOR UPDATE;
  IF baseline.mapping_version<>'STANDARD_INITIAL_EXPLICIT_KEYS_V1' OR baseline.status<>'IMPORTED' OR baseline.source_name<>request->>'namespace'
    OR baseline.source_hash<>request->>'package_manifest_sha256' OR baseline.cutoff_at<>(request->>'cutoff_at')::timestamptz THEN RAISE EXCEPTION 'STANDARD_BASELINE_MISMATCH_NO_REBASELINE' USING ERRCODE='23514'; END IF;
  SELECT a.after_values->'request' INTO STRICT initial_request FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id WHERE r.target_type='IMPORT' AND r.target_id=baseline.id AND r.action='IMPORT_INITIALIZE_CURRENT_ADMIN';
  IF initial_request->'payload'->>'document_batch_id'<>batch::text OR payload->'expected' IS DISTINCT FROM initial_request->'payload'->'expected_documents' THEN RAISE EXCEPTION 'STANDARD_DOCUMENT_PLAN_MISMATCH' USING ERRCODE='23514'; END IF;
  cp:=jsonb_build_object('sequence',0,'cursor',0,'counts','{"SALES_HEADER":0,"SALES_LINE":0,"SALES_SETTLEMENT":0,"TRANSFER_HEADER":0,"TRANSFER_LINE":0,"IMPORT_BATCH":0}'::jsonb,'expected',payload->'expected');
  INSERT INTO naijue_erp.import_batch(id,source_name,source_manifest_ref,source_hash,cutoff_at,mapping_version,inventory_mode,status,checkpoint,created_at)
   VALUES(batch,request->>'namespace',baseline.source_manifest_ref,request->>'package_manifest_sha256',baseline.cutoff_at,'DOCUMENT_CONVERSION_V1','DOCUMENT_CONVERSION','STAGED',cp,transaction_timestamp());
  phase:='DOCUMENT_STAGE';action_name:='IMPORT_STAGE';old_cp:=NULL;
 ELSE
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=batch FOR UPDATE;
  IF b.status NOT IN ('STAGED','VALIDATING') OR b.source_name<>request->>'namespace' OR b.source_hash<>request->>'package_manifest_sha256'
   OR b.cutoff_at<>(request->>'cutoff_at')::timestamptz OR (payload->>'expected_sequence')::integer IS DISTINCT FROM (b.checkpoint->>'sequence')::integer THEN RAISE EXCEPTION 'STANDARD_BATCH_CAS_OR_SOURCE_CONFLICT' USING ERRCODE='23514'; END IF;
  IF b.inventory_mode='CUTOFF_STOCK_BASELINE' THEN baseline:=b;
  ELSE SELECT * INTO STRICT baseline FROM naijue_erp.import_batch WHERE id=(payload->>'baseline_batch_id')::uuid; END IF;
  SELECT a.after_values->'request' INTO STRICT initial_request FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id WHERE r.target_type='IMPORT' AND r.target_id=baseline.id AND r.action='IMPORT_INITIALIZE_CURRENT_ADMIN';
  IF initial_request->>'plan_sha256'<>request->>'plan_sha256' THEN RAISE EXCEPTION 'STANDARD_EXECUTION_PLAN_CONFLICT' USING ERRCODE='23514'; END IF;
  cfg:=initial_request->'payload';old_cp:=b.checkpoint;cp:=jsonb_set(old_cp,'{sequence}',to_jsonb((old_cp->>'sequence')::integer+1));
  IF command_phase IN ('MASTER','KEYS') THEN
   IF b.inventory_mode<>'CUTOFF_STOCK_BASELINE' OR b.mapping_version<>'STANDARD_INITIAL_EXPLICIT_KEYS_V1' OR payload-ARRAY['expected_sequence','rows']<>'{}'
    OR jsonb_typeof(payload->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'rows') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'STANDARD_CHUNK_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  ELSIF command_phase='DOCUMENTS' THEN
   IF b.inventory_mode<>'DOCUMENT_CONVERSION' OR payload->>'mode' IS DISTINCT FROM 'CHUNK' OR payload-ARRAY['mode','baseline_batch_id','expected_sequence','expected','rows','documents']<>'{}'
    OR payload->'expected' IS DISTINCT FROM b.checkpoint->'expected' OR jsonb_typeof(payload->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'rows') NOT BETWEEN 1 AND 500
    OR jsonb_typeof(payload->'documents') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'documents')<1 THEN RAISE EXCEPTION 'STANDARD_DOCUMENT_CHUNK_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  ELSIF command_phase='PUBLISH' THEN
   IF payload-ARRAY['phase','expected_sequence','baseline_batch_id','approval_record_id']<>'{}' OR payload->>'phase' NOT IN ('BASELINE','DOCUMENTS')
    OR (payload->>'baseline_batch_id')::uuid<>baseline.id OR (payload->>'phase'='BASELINE') IS DISTINCT FROM (b.inventory_mode='CUTOFF_STOCK_BASELINE') THEN RAISE EXCEPTION 'STANDARD_PUBLISH_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'STANDARD_COMMAND_KIND_INVALID' USING ERRCODE='23514'; END IF;
  phase:=CASE command_phase WHEN 'MASTER' THEN 'MASTER' WHEN 'KEYS' THEN 'KEYS' WHEN 'DOCUMENTS' THEN 'DOCUMENTS' ELSE CASE payload->>'phase' WHEN 'BASELINE' THEN 'BASELINE_SEAL' ELSE 'DOCUMENT_PUBLISH' END END;
  action_name:=CASE command_phase WHEN 'PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END;
  IF b.inventory_mode='CUTOFF_STOCK_BASELINE' AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=batch AND source_entity_type='BATCH_NAMESPACE_BINDING') THEN
   fields:=jsonb_build_object('batch_id',batch,'source_system',b.source_name,'manifest_sha256',b.source_hash,'registry_sha256',cfg->>'registry_sha256');
   records:=records||jsonb_build_array(jsonb_build_object('id',cfg->>'namespace_record_id','entity_type','BATCH_NAMESPACE_BINDING','source_key',batch::text,'target_type','IMPORT_BATCH','target_id',batch,'file_ref',b.source_manifest_ref,
    'fields',fields,'source_hash',encode(sha256(convert_to(fields::text,'UTF8')),'hex')));
  END IF;
  IF command_phase IN ('MASTER','DOCUMENTS','KEYS') THEN
   FOR entry IN SELECT value FROM jsonb_array_elements(payload->'rows') LOOP
    fields:=entry->'fields';source_key:=entry->>'source_key';file_ref:=entry->>'file_ref';record_id:=(entry->>'record_id')::uuid;
    IF jsonb_typeof(fields) IS DISTINCT FROM 'object' OR jsonb_typeof(entry->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(entry->'source_refs')<1
     OR coalesce(length(source_key),0)=0 OR coalesce(length(btrim(file_ref)),0)=0 THEN RAISE EXCEPTION 'STANDARD_SOURCE_ROW_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
    IF command_phase='KEYS' THEN
     IF entry-ARRAY['record_id','source_key','file_ref','source_refs','fields','ledger_entry_id']<>'{}' OR fields-ARRAY['warehouse_id','sku_id','quantity']<>'{}'
      OR jsonb_typeof(fields->'quantity') IS DISTINCT FROM 'string' OR (fields->>'quantity' ~ '^(0|[1-9][0-9]*|-[1-9][0-9]*)$') IS DISTINCT FROM true THEN RAISE EXCEPTION 'STANDARD_EXPLICIT_KEY_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     quantity:=(fields->>'quantity')::bigint;kind:='INVENTORY_KEY';target:=naijue_erp.standard_inventory_key_id((fields->>'warehouse_id')::uuid,(fields->>'sku_id')::uuid);
     IF (quantity=0) IS DISTINCT FROM (entry->>'ledger_entry_id' IS NULL) THEN RAISE EXCEPTION 'STANDARD_ZERO_LEDGER_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
    ELSE
     IF entry-ARRAY['record_id','entity_type','source_key','target_id','identity_basis','file_ref','source_refs','fields']<>'{}' OR NOT(entry ?& ARRAY['record_id','entity_type','source_key','target_id','identity_basis','file_ref','source_refs','fields']) THEN RAISE EXCEPTION 'STANDARD_TYPED_ROW_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     kind:=entry->>'entity_type';target:=(entry->>'target_id')::uuid;registry_basis:=entry->>'identity_basis';
     IF (command_phase='MASTER' AND kind NOT IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL'))
      OR (command_phase='DOCUMENTS' AND kind NOT IN ('SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE')) THEN RAISE EXCEPTION 'STANDARD_FINITE_TARGET_REQUIRED' USING ERRCODE='23514'; END IF;
     IF kind IN ('SIZE_GROUP_MEMBER','PAYMENT_ACCOUNT_HALL') THEN
      encoded:='[s"naijue-cutoff-v1",s"standard-composite-target-v1",s'||to_json(request->>'namespace')::text||',s'||to_json(kind)::text||',s'||to_json(source_key)::text||']';
      IF registry_basis IS DISTINCT FROM 'DERIVED_COMPOSITE' OR substring(encode(sha256(convert_to(encoded,'UTF8')),'hex') FROM 1 FOR 32)::uuid<>target THEN RAISE EXCEPTION 'STANDARD_COMPOSITE_PROOF_ID_INVALID' USING ERRCODE='23514'; END IF;
     ELSIF fields->>'id' IS DISTINCT FROM target::text OR registry_basis IS NULL OR registry_basis NOT IN ('EXISTING_VERIFIED','STABLE_IMPORT_ID_V1') THEN RAISE EXCEPTION 'STANDARD_REGISTRY_TARGET_INVALID' USING ERRCODE='23514'; END IF;
     IF kind IN ('SALES_HEADER','TRANSFER_HEADER','PRODUCT_IMAGE') AND (fields->>'created_by_account_id' IS NOT NULL OR fields->>'approved_by_account_id' IS NOT NULL) THEN RAISE EXCEPTION 'STANDARD_ORIGINAL_ACCOUNT_MAPPING_UNPROVEN_NEW_TARGET' USING ERRCODE='23514'; END IF;
     IF kind IN ('WAREHOUSE','SKU') AND fields->>'created_operation_id' IS NOT NULL THEN RAISE EXCEPTION 'STANDARD_SOURCE_IDENTITY_IS_NOT_POSTCUTOFF_CREATION' USING ERRCODE='23514'; END IF;
     -- Exact canonical string inputs precede PostgreSQL's typmod coercion. A
     -- decimal(18,2) must never silently round an original three-decimal amount.
     FOR parent_row IN SELECT attname,atttypid FROM pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||lower(kind)) AND attnum>0 AND NOT attisdropped AND atttypid IN (20,1700) LOOP
      IF fields->parent_row.attname IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(fields->parent_row.attname) IS DISTINCT FROM 'string'
        OR (parent_row.atttypid=20 AND (fields->>parent_row.attname ~ '^(0|[1-9][0-9]*|-[1-9][0-9]*)$') IS DISTINCT FROM true)
        OR (parent_row.atttypid=1700 AND (fields->>parent_row.attname ~ '^-?(0|[1-9][0-9]*)[.][0-9]{2}$') IS DISTINCT FROM true)) THEN
       RAISE EXCEPTION 'STANDARD_EXACT_NUMERIC_STRING_REQUIRED: %',parent_row.attname USING ERRCODE='23514'; END IF;
     END LOOP;
    END IF;
    parsed:=jsonb_build_object('source_key',source_key,'fields',fields,'source_refs',entry->'source_refs');source_hash:=encode(sha256(convert_to(parsed::text,'UTF8')),'hex');
    item:=jsonb_build_object('id',record_id,'entity_type',CASE WHEN command_phase='KEYS' THEN 'INVENTORY_BASELINE' ELSE kind END,'source_key',source_key,'target_type',kind,'target_id',target,'file_ref',file_ref,
      'fields',fields,'source_refs',entry->'source_refs','identity_basis',entry->'identity_basis','source_hash',source_hash);
    IF command_phase='KEYS' THEN item:=item||jsonb_build_object('ledger_entry_id',entry->>'ledger_entry_id'); END IF;
    records:=records||jsonb_build_array(item);
   END LOOP;
  ELSE
   fields:=jsonb_build_object('baseline_batch_id',baseline.id,'manifest_sha256',b.source_hash,'cutoff_at',b.cutoff_at,'alignment_sha256',cfg->>'alignment_sha256');
   records:=records||jsonb_build_array(jsonb_build_object('id',payload->>'approval_record_id','entity_type',CASE phase WHEN 'BASELINE_SEAL' THEN 'STANDARD_BASELINE_APPROVAL' ELSE 'DOCUMENT_CONVERSION_APPROVAL' END,
    'source_key',CASE phase WHEN 'BASELINE_SEAL' THEN 'FINAL_EXPLICIT_KEYS' ELSE 'FINAL_DOCUMENT_CONVERSION' END,'target_type','IMPORT_BATCH','target_id',batch,'file_ref',b.source_manifest_ref,'fields',fields,
    'source_hash',CASE phase WHEN 'DOCUMENT_PUBLISH' THEN b.source_hash ELSE encode(sha256(convert_to(fields::text,'UTF8')),'hex') END));
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(records) LOOP
   kind:=item->>'target_type';counter:=CASE WHEN item->>'entity_type'='BATCH_NAMESPACE_BINDING' THEN 'NAMESPACE' WHEN kind IN ('IMPORT_BATCH','INVENTORY_KEY','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') THEN kind ELSE 'MASTER' END;
   cp:=jsonb_set(cp,ARRAY['counts',counter],to_jsonb((cp->'counts'->>counter)::integer+1));
   IF kind='INVENTORY_KEY' AND (item->'fields'->>'quantity')::bigint<>0 THEN cp:=jsonb_set(cp,'{counts,INVENTORY_EFFECT}',to_jsonb((cp->'counts'->>'INVENTORY_EFFECT')::integer+1));ledger_ids:=ledger_ids||jsonb_build_array(item->>'ledger_entry_id'); END IF;
   source_ids:=source_ids||jsonb_build_array(item->>'id');
  END LOOP;
  SELECT sum(value::numeric) INTO total FROM jsonb_each_text(cp->'counts');
  cp:=jsonb_set(cp,'{cursor}',to_jsonb(total));
 END IF;
 -- The public request, typed intents and exact result are prepared before native
 -- mutations. All final-state validators run deferred; no guard is disabled.
 result:=jsonb_build_object('profile','STANDARD_IMPORT_SQL_V1','operationId',operation,'batchId',batch,'sequence',cp->'sequence','cursor',cp->'cursor',
  'status',CASE WHEN command_phase='PUBLISH' THEN 'IMPORTED' WHEN command_phase='INITIALIZE' OR phase='DOCUMENT_STAGE' THEN 'STAGED' ELSE 'VALIDATING' END,
  'ledgerEntryIds',ledger_ids,'sourceRecordIds',source_ids,'phase',phase,'planSha256',request->>'plan_sha256','packageManifestSha256',request->>'package_manifest_sha256',
  'baselineBatchId',CASE WHEN command_phase='INITIALIZE' THEN batch ELSE baseline.id END,'documentBatchId',CASE WHEN command_phase='INITIALIZE' THEN payload->>'document_batch_id' ELSE initial_request->'payload'->>'document_batch_id' END);
 INSERT INTO naijue_erp.operation_receipt(id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,completed_at)
  VALUES(operation,actor,request->>'request_key',fingerprint,action_name,'IMPORT',batch,'COMMITTED',result,transaction_timestamp());
 INSERT INTO naijue_erp.audit_change(id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,occurred_at)
  VALUES(operation,operation,actor,'IMPORT',batch,action_name,CASE WHEN old_cp IS NULL THEN NULL ELSE (old_cp->>'sequence')::integer+1 END,(cp->>'sequence')::integer+1,old_cp,
   jsonb_build_object('profile','STANDARD_IMPORT_SQL_V1','phase',phase,'request',request,'checkpoint',cp,'records',records,'origin',CASE WHEN command_phase='INITIALIZE' THEN 'CURRENT_PROVISIONING' ELSE 'STANDARD_SOURCE' END,
    'current_admin',CASE WHEN command_phase='INITIALIZE' THEN payload->'admin' ELSE NULL END),transaction_timestamp());
 FOR item IN SELECT value FROM jsonb_array_elements(records) LOOP
  INSERT INTO naijue_erp.import_record(id,import_batch_id,source_system,source_entity_type,source_key,source_record_hash,source_file_ref,target_type,target_id,status,decision_reason,reviewed_at)
   VALUES((item->>'id')::uuid,batch,request->>'namespace',item->>'entity_type',item->>'source_key',item->>'source_hash',item->>'file_ref',item->>'target_type',(item->>'target_id')::uuid,'IMPORTED',
    jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',operation)::text,transaction_timestamp());
 END LOOP;
 IF command_phase IN ('MASTER','DOCUMENTS') AND phase<>'DOCUMENT_STAGE' THEN
  FOR item IN SELECT value FROM jsonb_array_elements(records) WHERE value->>'target_type'<>'IMPORT_BATCH' ORDER BY
   array_position(ARRAY['BARCODE_SCHEME','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','CUSTOMER','SUPPLIER','HALL','WAREHOUSE','STAFF','PRODUCT','SKU','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','TRANSFER_HEADER','SALES_LINE','TRANSFER_LINE','SALES_SETTLEMENT'],value->>'target_type'),
   CASE WHEN value->>'target_type'='PRODUCT_CATEGORY' THEN value->'fields'->>'parent_id' IS NOT NULL ELSE false END, value->>'target_id' LOOP
   kind:=item->>'target_type';table_name:=lower(kind);fields:=item->'fields';
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',table_name) INTO expected USING fields;
   IF kind='SIZE_GROUP_MEMBER' THEN SELECT to_jsonb(t) INTO actual FROM naijue_erp.size_group_member t WHERE size_group_id=(fields->>'size_group_id')::uuid AND size_id=(fields->>'size_id')::uuid;
   ELSIF kind='PAYMENT_ACCOUNT_HALL' THEN SELECT to_jsonb(t) INTO actual FROM naijue_erp.payment_account_hall t WHERE payment_account_id=(fields->>'payment_account_id')::uuid AND hall_id=(fields->>'hall_id')::uuid;
   ELSE EXECUTE format('SELECT to_jsonb(t) FROM naijue_erp.%I t WHERE id=$1',table_name) INTO actual USING (item->>'target_id')::uuid; END IF;
   IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(fields) key) IS DISTINCT FROM
      (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||table_name) AND attnum>0 AND NOT attisdropped AND attgenerated='') THEN
    RAISE EXCEPTION 'STANDARD_EXACT_TYPED_FIELDS_REQUIRED: %',kind USING ERRCODE='23514'; END IF;
   IF actual IS NOT NULL THEN
    IF command_phase<>'MASTER' OR item->>'identity_basis' IS DISTINCT FROM 'EXISTING_VERIFIED' OR actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'STANDARD_EXISTING_IDENTITY_CONFLICT' USING ERRCODE='23505'; END IF;
   ELSE
    IF kind='TRANSFER_LINE' THEN
     INSERT INTO naijue_erp.transfer_line(id,transfer_id,line_no,sku_id,quantity,product_code_snapshot,product_name_snapshot,color_name_snapshot,fit_name_snapshot,size_name_snapshot,barcode_snapshot,is_current)
      SELECT t.id,t.transfer_id,t.line_no,t.sku_id,t.quantity,t.product_code_snapshot,t.product_name_snapshot,t.color_name_snapshot,t.fit_name_snapshot,t.size_name_snapshot,t.barcode_snapshot,t.is_current FROM jsonb_populate_record(NULL::naijue_erp.transfer_line,fields) t;
    ELSE EXECUTE format('INSERT INTO naijue_erp.%I SELECT (jsonb_populate_record(NULL::naijue_erp.%I,$1)).*',table_name,table_name) USING fields; END IF;
   END IF;
  END LOOP;
 ELSIF command_phase='KEYS' THEN
  FOR item IN SELECT value FROM jsonb_array_elements(records) WHERE value->>'target_type'='INVENTORY_KEY' LOOP
   fields:=item->'fields';quantity:=(fields->>'quantity')::bigint;
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=batch AND target_type='WAREHOUSE' AND target_id=(fields->>'warehouse_id')::uuid)
     OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=batch AND target_type='SKU' AND target_id=(fields->>'sku_id')::uuid)
     OR EXISTS(SELECT 1 FROM naijue_erp.inventory_balance WHERE warehouse_id=(fields->>'warehouse_id')::uuid AND sku_id=(fields->>'sku_id')::uuid)
     OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id=(fields->>'warehouse_id')::uuid AND sku_id=(fields->>'sku_id')::uuid) THEN RAISE EXCEPTION 'STANDARD_KEY_SCOPE_OR_REBASELINE_DENIED' USING ERRCODE='23514'; END IF;
   IF quantity<>0 THEN
    INSERT INTO naijue_erp.inventory_ledger(id,operation_id,event_kind,warehouse_id,sku_id,quantity_delta,source_document_version,endpoint,business_date,posted_at,source_import_batch_id)
     VALUES((item->>'ledger_entry_id')::uuid,operation,'CUTOFF_BASELINE',(fields->>'warehouse_id')::uuid,(fields->>'sku_id')::uuid,quantity,NULL,'IMPORT_BASELINE',left(request->>'cutoff_at',10)::date,transaction_timestamp(),batch);
    INSERT INTO naijue_erp.inventory_balance(warehouse_id,sku_id,quantity,version,last_operation_id,updated_at)
     VALUES((fields->>'warehouse_id')::uuid,(fields->>'sku_id')::uuid,quantity,1,operation,transaction_timestamp());
   END IF;
  END LOOP;
 END IF;
 IF command_phase='DOCUMENTS' AND phase='DOCUMENTS' THEN
  anchor_baseline:=jsonb_build_object('state','CONFIRMED','baselineBatchId',baseline.id,'baselineManifestSha256',baseline.source_hash,'cutoffAt',baseline.cutoff_at,'coverageDigest',cfg->>'alignment_sha256');
  FOR doc IN SELECT value FROM jsonb_array_elements(payload->'documents') LOOP
   IF doc-ARRAY['kind','id','operation_id','request_key','source_record_id']<>'{}' OR doc->>'kind' NOT IN ('SALES','TRANSFER') THEN RAISE EXCEPTION 'STANDARD_DOCUMENT_MANIFEST_INVALID' USING ERRCODE='23514'; END IF;
   kind:=doc->>'kind';doc_id:=(doc->>'id')::uuid;child_op:=(doc->>'operation_id')::uuid;snap:=naijue_erp.unified_document_snapshot(kind,doc_id);
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE id=(doc->>'source_record_id')::uuid AND import_batch_id=batch AND target_id=doc_id AND target_type=kind||'_HEADER') THEN RAISE EXCEPTION 'STANDARD_DOCUMENT_SOURCE_IDENTITY_INVALID' USING ERRCODE='23514'; END IF;
   child_result:=jsonb_build_object('operationId',child_op,CASE kind WHEN 'SALES' THEN 'salesId' ELSE 'transferId' END,doc_id,'version',(snap->'header'->>'version')::integer,
    'status',snap->'header'->>'status','ledgerEntryIds','[]'::jsonb,'batchId',batch,'sourceRecordId',doc->>'source_record_id','exposureDigest',encode(sha256(convert_to(snap::text,'UTF8')),'hex'),'baseline',anchor_baseline);
   INSERT INTO naijue_erp.operation_receipt(id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,completed_at)
    VALUES(child_op,actor,doc->>'request_key',encode(sha256(convert_to(doc::text||snap::text,'UTF8')),'hex'),'MIGRATE_DOCUMENT',kind,doc_id,'COMMITTED',child_result,transaction_timestamp());
   INSERT INTO naijue_erp.audit_change(id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,occurred_at)
    VALUES(child_op,child_op,actor,kind,doc_id,'MIGRATE_DOCUMENT',NULL,(snap->'header'->>'version')::integer,NULL,snap||jsonb_build_object('baseline',anchor_baseline,'sourceRecordId',doc->>'source_record_id'),transaction_timestamp());
  END LOOP;
 END IF;
 IF command_phase='PUBLISH' THEN
  IF cp->'counts' IS DISTINCT FROM cp->'expected' THEN RAISE EXCEPTION 'STANDARD_PUBLICATION_INCOMPLETE' USING ERRCODE='23514'; END IF;
  IF phase='BASELINE_SEAL' THEN
   FOR kind IN SELECT jsonb_object_keys(cfg->'expected_master_counts') LOOP
    SELECT count(*) INTO n FROM naijue_erp.import_record WHERE import_batch_id=batch AND target_type=kind AND status='IMPORTED';
    IF n<>(cfg->'expected_master_counts'->>kind)::integer THEN RAISE EXCEPTION 'STANDARD_MASTER_CLOSURE_INCOMPLETE: %',kind USING ERRCODE='23514'; END IF;
   END LOOP;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=baseline.id AND status='IMPORTED' AND mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
     AND source_hash=b.source_hash AND source_name=b.source_name AND cutoff_at=b.cutoff_at) THEN RAISE EXCEPTION 'STANDARD_ACTIVATION_BASELINE_MISMATCH' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM naijue_erp.import_record s WHERE s.import_batch_id=batch AND s.target_type IN ('SALES_HEADER','TRANSFER_HEADER') AND NOT EXISTS(
    SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.action='MIGRATE_DOCUMENT' AND r.target_id=s.target_id AND r.target_type=CASE s.target_type WHEN 'SALES_HEADER' THEN 'SALES' ELSE 'TRANSFER' END)) THEN RAISE EXCEPTION 'STANDARD_MIGRATION_CLOSURE_INCOMPLETE' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF command_phase<>'INITIALIZE' AND phase<>'DOCUMENT_STAGE' THEN
  UPDATE naijue_erp.import_batch SET checkpoint=cp,status=CASE WHEN command_phase='PUBLISH' THEN 'IMPORTED' ELSE 'VALIDATING' END,
    completed_at=CASE WHEN command_phase='PUBLISH' THEN transaction_timestamp() ELSE NULL END WHERE id=batch;
 END IF;
 -- Execute the real retained deferred validators under this finite API owner,
 -- before returning to the execute-only role. No trigger or constraint is skipped.
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
 RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','operation_id',operation,'batch_id',batch,'request_sha256',fingerprint,'state','COMMITTED','sequence',cp->'sequence','cursor',cp->'cursor','receipt',result);
END $$;

CREATE FUNCTION naijue_erp.standard_initialize_current_admin(request jsonb,encoded_scrypt text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp AS $$ SELECT naijue_erp.standard_import_command(request,encoded_scrypt,'INITIALIZE'); $$;
CREATE FUNCTION naijue_erp.standard_import_master_chunk(request jsonb,session_token text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp AS $$ SELECT naijue_erp.standard_import_command(request,session_token,'MASTER'); $$;
CREATE FUNCTION naijue_erp.standard_import_baseline_keys(request jsonb,session_token text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp AS $$ SELECT naijue_erp.standard_import_command(request,session_token,'KEYS'); $$;
CREATE FUNCTION naijue_erp.standard_import_document_chunk(request jsonb,session_token text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp AS $$ SELECT naijue_erp.standard_import_command(request,session_token,'DOCUMENTS'); $$;
CREATE FUNCTION naijue_erp.standard_publish_import(request jsonb,session_token text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp AS $$ SELECT naijue_erp.standard_import_command(request,session_token,'PUBLISH'); $$;

CREATE FUNCTION naijue_erp.standard_import_status(request jsonb,session_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE actor uuid; r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE;
BEGIN
 PERFORM naijue_erp.cutoff_import_lock();
 IF current_setting('role')='erp_unified27_initializer_2393dbc6db9581c2' THEN
  PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');actor:=(request->'payload'->'admin'->>'account_id')::uuid;
 ELSE actor:=naijue_erp.standard_import_identity(session_token,'IMPORTER'); END IF;
 IF request->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1' OR coalesce(length(request->>'request_key'),0)=0 OR actor IS NULL THEN RAISE EXCEPTION 'STANDARD_STATUS_REQUEST_INVALID' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:standard-receipt:'||actor::text||':'||(request->>'request_key'),0));
 SELECT * INTO r FROM naijue_erp.operation_receipt WHERE actor_account_id=actor AND request_key=request->>'request_key';
 IF NOT FOUND THEN RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','operation_id',request->>'operation_id','batch_id',request->>'batch_id','request_sha256',NULL,'state','ABSENT','sequence',NULL,'cursor',NULL,'receipt',NULL); END IF;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
 IF r.id::text IS DISTINCT FROM request->>'operation_id' OR r.target_id::text IS DISTINCT FROM request->>'batch_id' OR a.after_values->'request' IS DISTINCT FROM request
  OR r.target_type<>'IMPORT' OR r.result_data->>'profile'<>'STANDARD_IMPORT_SQL_V1' OR (current_setting('role')='erp_unified27_initializer_2393dbc6db9581c2' AND r.action<>'IMPORT_INITIALIZE_CURRENT_ADMIN') THEN
  RAISE EXCEPTION 'STANDARD_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','operation_id',r.id,'batch_id',r.target_id,'request_sha256',r.request_hash,'state','COMMITTED','sequence',r.result_data->'sequence','cursor',r.result_data->'cursor','receipt',r.result_data);
END $$;

CREATE FUNCTION naijue_erp.standard_import_inspect_target(request jsonb,session_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE system_identifier text; database_oid text; fingerprint text; actor uuid; metadata jsonb;
BEGIN
 IF request IS DISTINCT FROM '{"protocol":"STANDARD_IMPORT_SQL_V1"}'::jsonb THEN RAISE EXCEPTION 'STANDARD_INSPECT_REQUEST_INVALID' USING ERRCODE='23514'; END IF;
 actor:=naijue_erp.standard_import_identity(session_token,'INSPECT');
 SELECT c.system_identifier::text INTO STRICT system_identifier FROM pg_control_system() c;
 SELECT oid::text INTO STRICT database_oid FROM pg_database WHERE datname=current_database();
 SELECT jsonb_build_object('routines',(SELECT jsonb_agg(jsonb_build_array(p.proname,pg_get_function_identity_arguments(p.oid),p.proowner,coalesce(p.proacl::text,''),pg_get_functiondef(p.oid)) ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace='naijue_erp'::regnamespace),
  'relations',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relowner,c.relrowsecurity,coalesce(c.relacl::text,'')) ORDER BY c.relname) FROM pg_class c WHERE c.relnamespace='naijue_erp'::regnamespace),
  'constraints',(SELECT jsonb_agg(jsonb_build_array(c.conname,c.conrelid::regclass::text,pg_get_constraintdef(c.oid),c.convalidated) ORDER BY c.oid) FROM pg_constraint c WHERE c.connamespace='naijue_erp'::regnamespace),
  'policies',(SELECT jsonb_agg(jsonb_build_array(p.polrelid::regclass::text,p.polname,p.polroles,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.oid) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='naijue_erp'::regnamespace)) INTO metadata;
 fingerprint:=encode(sha256(convert_to(metadata::text,'UTF8')),'hex');
 RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','system_identifier',system_identifier,'database_oid',database_oid,'database_name',current_database(),'catalog_sha256',fingerprint,
  'current_user',current_user,'session_user',session_user,'role_mode',current_setting('role'),'proof_scope','SET_ROLE_ONLY_NOT_NONOWNER_LOGIN');
END $$;

CREATE FUNCTION naijue_erp.standard_import_verify(request jsonb,session_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE actor uuid; status jsonb; documents_batch naijue_erp.import_batch%ROWTYPE; baseline naijue_erp.import_batch%ROWTYPE;
 source_counts jsonb:='{}'; documents jsonb:='[]'; inventory_keys jsonb:='[]'; counts bigint; kind text; current_version integer; initial_version integer; expected_version integer; steps integer;
 source_row record; header_row record; step record; stock_key record; row_value jsonb; prior_value jsonb; header_expected jsonb; header_actual jsonb; lines_expected jsonb; lines_actual jsonb;
 settlements_expected jsonb; settlements_actual jsonb; retired jsonb; snap jsonb; current_snap jsonb; before_header jsonb; after_header jsonb; field record; evidence_value jsonb;
 proof jsonb; admission record; quantity numeric; ledger_total numeric; effects bigint; balance naijue_erp.inventory_balance%ROWTYPE; has_balance boolean; item record;
 initial_receipt naijue_erp.operation_receipt%ROWTYPE; initial_audit naijue_erp.audit_change%ROWTYPE; initialized jsonb; source_total bigint; expected_counts jsonb;
BEGIN
 PERFORM naijue_erp.cutoff_import_lock();actor:=naijue_erp.standard_import_identity(session_token,'IMPORTER');
 status:=naijue_erp.standard_import_status(request,session_token);
 IF status->>'state'<>'COMMITTED' OR status->'receipt'->>'phase'<>'DOCUMENT_PUBLISH' OR NOT naijue_erp.standard_business_ready() THEN RAISE EXCEPTION 'STANDARD_VERIFY_PUBLISHED_PACKAGE_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT documents_batch FROM naijue_erp.import_batch WHERE id=(request->>'batch_id')::uuid;
 SELECT * INTO STRICT baseline FROM naijue_erp.import_batch WHERE id=(status->'receipt'->>'baselineBatchId')::uuid;
 SELECT a.after_values->'request'->'payload' INTO STRICT initialized FROM naijue_erp.operation_receipt r JOIN naijue_erp.audit_change a ON a.operation_id=r.id WHERE r.target_type='IMPORT' AND r.target_id=baseline.id AND r.action='IMPORT_INITIALIZE_CURRENT_ADMIN';
 -- Fence every imported header first, then every actual inventory key in the
 -- same global ordering used by ordinary commands. This is a live readback,
 -- not receipt counting and not an attempt to restore original current values.
 FOR header_row IN SELECT h.id FROM naijue_erp.sales_header h WHERE h.import_batch_id=documents_batch.id ORDER BY h.id FOR SHARE LOOP NULL; END LOOP;
 FOR header_row IN SELECT h.id FROM naijue_erp.transfer_header h WHERE h.import_batch_id=documents_batch.id ORDER BY h.id FOR SHARE LOOP NULL; END LOOP;
 FOR stock_key IN
  SELECT DISTINCT k.warehouse_id,k.sku_id FROM (
   SELECT (p->'fields'->>'warehouse_id')::uuid warehouse_id,(p->'fields'->>'sku_id')::uuid sku_id
    FROM naijue_erp.import_record s CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) p WHERE s.import_batch_id=baseline.id AND s.target_type='INVENTORY_KEY'
   UNION ALL SELECT l.warehouse_id,l.sku_id FROM naijue_erp.inventory_ledger l LEFT JOIN naijue_erp.sales_line sl ON sl.id=l.source_sales_line_id LEFT JOIN naijue_erp.sales_header sh ON sh.id=sl.sales_id
     LEFT JOIN naijue_erp.transfer_line tl ON tl.id=l.source_transfer_line_id LEFT JOIN naijue_erp.transfer_header th ON th.id=tl.transfer_id
    WHERE sh.import_batch_id=documents_batch.id OR th.import_batch_id=documents_batch.id
  ) k ORDER BY k.warehouse_id,k.sku_id LOOP
   PERFORM naijue_erp.inventory_key_lock(stock_key.warehouse_id,stock_key.sku_id);
   PERFORM 1 FROM naijue_erp.inventory_balance WHERE warehouse_id=stock_key.warehouse_id AND sku_id=stock_key.sku_id FOR SHARE;
 END LOOP;
 FOR kind IN SELECT unnest(ARRAY['HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE','INVENTORY_KEY','IMPORT_BATCH']) LOOP
  SELECT count(*) INTO counts FROM naijue_erp.import_record WHERE import_batch_id IN (baseline.id,documents_batch.id) AND target_type=kind AND status='IMPORTED';
  source_counts:=source_counts||jsonb_build_object(kind,counts);
 END LOOP;
 IF source_counts->>'IMPORT_BATCH'<>'3' OR (source_counts->>'INVENTORY_KEY')::numeric<>(baseline.checkpoint->'expected'->>'INVENTORY_KEY')::numeric THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
 FOR kind IN SELECT jsonb_object_keys(initialized->'expected_master_counts') LOOP
  IF source_counts->kind IS DISTINCT FROM initialized->'expected_master_counts'->kind THEN RAISE EXCEPTION 'STANDARD_VERIFY_MASTER_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOREACH kind IN ARRAY ARRAY['SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE'] LOOP
  IF source_counts->kind IS DISTINCT FROM documents_batch.checkpoint->'expected'->kind THEN RAISE EXCEPTION 'STANDARD_VERIFY_DOCUMENT_SOURCE_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR source_row IN SELECT s.* FROM naijue_erp.import_record s WHERE s.import_batch_id IN (baseline.id,documents_batch.id) AND s.status='IMPORTED' ORDER BY s.id LOOP
  proof:=naijue_erp.standard_import_record_proof(source_row.id);
  IF source_row.target_type NOT IN ('INVENTORY_KEY','IMPORT_BATCH','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') THEN
   IF source_row.target_type='SIZE_GROUP_MEMBER' THEN SELECT to_jsonb(t) INTO row_value FROM naijue_erp.size_group_member t WHERE size_group_id=(proof->'fields'->>'size_group_id')::uuid AND size_id=(proof->'fields'->>'size_id')::uuid FOR SHARE;
   ELSIF source_row.target_type='PAYMENT_ACCOUNT_HALL' THEN SELECT to_jsonb(t) INTO row_value FROM naijue_erp.payment_account_hall t WHERE payment_account_id=(proof->'fields'->>'payment_account_id')::uuid AND hall_id=(proof->'fields'->>'hall_id')::uuid FOR SHARE;
   ELSE EXECUTE format('SELECT to_jsonb(t) FROM naijue_erp.%I t WHERE id=$1 FOR SHARE',lower(source_row.target_type)) INTO row_value USING source_row.target_id; END IF;
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',lower(source_row.target_type)) INTO prior_value USING proof->'fields';
   IF row_value IS DISTINCT FROM prior_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_MASTER_NATIVE_FACTS_DIFFERS' USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 FOR source_row IN SELECT * FROM naijue_erp.import_record WHERE import_batch_id=documents_batch.id AND target_type IN ('SALES_HEADER','TRANSFER_HEADER') ORDER BY target_type,target_id LOOP
  kind:=CASE source_row.target_type WHEN 'SALES_HEADER' THEN 'SALES' ELSE 'TRANSFER' END;
  SELECT * INTO STRICT initial_receipt FROM naijue_erp.operation_receipt WHERE target_type=kind AND target_id=source_row.target_id AND action='MIGRATE_DOCUMENT';
  SELECT * INTO STRICT initial_audit FROM naijue_erp.audit_change WHERE operation_id=initial_receipt.id;
  snap:=initial_audit.after_values-ARRAY['baseline','sourceRecordId'];current_snap:=naijue_erp.unified_document_snapshot(kind,source_row.target_id);
  initial_version:=initial_audit.new_version;current_version:=(current_snap->'header'->>'version')::integer;expected_version:=initial_version;steps:=0;retired:='{}';
  IF initial_receipt.actor_account_id<>initial_audit.actor_account_id OR initial_audit.old_version IS NOT NULL OR initial_audit.before_values IS NOT NULL
   OR initial_receipt.result_data->>'exposureDigest' IS DISTINCT FROM encode(sha256(convert_to(snap::text,'UTF8')),'hex')
   OR initial_audit.after_values->>'sourceRecordId'<>source_row.id::text OR current_version<initial_version THEN RAISE EXCEPTION 'STANDARD_VERIFY_ORIGINAL_MIGRATION_INVALID' USING ERRCODE='23514'; END IF;
  proof:=naijue_erp.standard_import_record_proof(source_row.id);
  IF kind='SALES' THEN
   row_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,proof->'fields'));prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,snap->'header'));
  ELSE row_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_header,proof->'fields'));prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_header,snap->'header')); END IF;
  IF row_value IS DISTINCT FROM prior_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_TO_ORIGINAL_HEADER_DIFFERS' USING ERRCODE='23514'; END IF;
  FOR row_value IN SELECT value FROM jsonb_array_elements(snap->'lines') LOOP
   SELECT naijue_erp.standard_import_record_proof(s.id) INTO STRICT proof FROM naijue_erp.import_record s WHERE s.import_batch_id=documents_batch.id AND s.target_type=kind||'_LINE' AND s.target_id=(row_value->>'id')::uuid;
   IF kind='SALES' THEN prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_line,proof->'fields'));evidence_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_line,row_value));
   ELSE prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_line,proof->'fields'))-'current_line_no';evidence_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_line,row_value))-'current_line_no'; END IF;
   IF prior_value IS DISTINCT FROM evidence_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_TO_ORIGINAL_LINE_DIFFERS' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR row_value IN SELECT value FROM jsonb_array_elements(snap->'settlements') LOOP
   SELECT naijue_erp.standard_import_record_proof(s.id) INTO STRICT proof FROM naijue_erp.import_record s WHERE s.import_batch_id=documents_batch.id AND s.target_type='SALES_SETTLEMENT' AND s.target_id=(row_value->>'id')::uuid;
   IF to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_settlement,proof->'fields')) IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_settlement,row_value)) THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_TO_ORIGINAL_SETTLEMENT_DIFFERS' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR field IN SELECT unnest(ARRAY['id','number','stock_basis','import_batch_id','created_by_account_id','created_by_staff_id','created_hall_id','created_at']) key LOOP
   IF current_snap->'header'->field.key IS DISTINCT FROM snap->'header'->field.key THEN RAISE EXCEPTION 'STANDARD_VERIFY_IMMUTABLE_DOCUMENT_ORIGIN_DIFFERS' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF kind='SALES' THEN
   header_expected:=naijue_erp.unified_sales_header_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_header,snap->'header'));
   header_actual:=naijue_erp.unified_sales_header_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_header,current_snap->'header'));
   SELECT coalesce(jsonb_object_agg(v->>'id',naijue_erp.unified_sales_line_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_line,v))),'{}') INTO lines_expected FROM jsonb_array_elements(snap->'lines') v;
   SELECT coalesce(jsonb_object_agg(l.id::text,naijue_erp.unified_sales_line_audit_values(l)),'{}') INTO lines_actual FROM naijue_erp.sales_line l WHERE sales_id=source_row.target_id;
   SELECT coalesce(jsonb_object_agg(v->>'id',naijue_erp.unified_sales_settlement_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_settlement,v))),'{}') INTO settlements_expected FROM jsonb_array_elements(snap->'settlements') v;
   SELECT coalesce(jsonb_object_agg(s.id::text,naijue_erp.unified_sales_settlement_audit_values(s)),'{}') INTO settlements_actual FROM naijue_erp.sales_settlement s WHERE sales_id=source_row.target_id;
  ELSE
   header_expected:=naijue_erp.transfer_header_audit_values(jsonb_populate_record(NULL::naijue_erp.transfer_header,snap->'header'));
   header_actual:=naijue_erp.transfer_header_audit_values(jsonb_populate_record(NULL::naijue_erp.transfer_header,current_snap->'header'));
   SELECT coalesce(jsonb_object_agg(v->>'id',naijue_erp.transfer_line_audit_values(jsonb_populate_record(NULL::naijue_erp.transfer_line,v))),'{}') INTO lines_expected FROM jsonb_array_elements(snap->'lines') v;
   SELECT coalesce(jsonb_object_agg(l.id::text,naijue_erp.transfer_line_audit_values(l)),'{}') INTO lines_actual FROM naijue_erp.transfer_line l WHERE transfer_id=source_row.target_id;
   settlements_expected:='{}';settlements_actual:='{}';
   IF current_snap->'header'->'created_role' IS DISTINCT FROM snap->'header'->'created_role' THEN RAISE EXCEPTION 'STANDARD_VERIFY_CREATION_ROLE_DIFFERS' USING ERRCODE='23514'; END IF;
  END IF;
  FOR step IN SELECT a.*,r.actor_account_id receipt_actor,r.action receipt_action,r.target_type receipt_kind,r.target_id receipt_target,r.completed_at,r.result_data,r.status receipt_status
   FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id WHERE a.object_type=kind AND a.object_id=source_row.target_id AND a.new_version>initial_version AND a.new_version<=current_version ORDER BY a.new_version LOOP
   IF step.old_version IS DISTINCT FROM expected_version OR step.new_version<>expected_version+1 OR step.action NOT IN ('SAVE','APPROVE','UNAPPROVE','VOID') OR step.action<>step.receipt_action
    OR step.receipt_kind<>kind OR step.receipt_target<>source_row.target_id OR step.actor_account_id<>step.receipt_actor OR step.receipt_status<>'COMMITTED'
    OR step.occurred_at IS DISTINCT FROM step.completed_at OR step.result_data->>'version'<>step.new_version::text THEN RAISE EXCEPTION 'STANDARD_VERIFY_ORDINARY_CHAIN_INVALID' USING ERRCODE='23514'; END IF;
   before_header:=step.before_values->'header';after_header:=step.after_values->'header';
   FOR field IN SELECT * FROM jsonb_each(before_header) LOOP
    evidence_value:=field.value;
    IF field.key IN ('updatedAt','approvedAt') THEN evidence_value:=coalesce(to_jsonb((evidence_value#>>'{}')::timestamptz),'null'); END IF;
    IF header_expected->field.key IS DISTINCT FROM evidence_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_HEADER_BEFORE_DIFFERS' USING ERRCODE='23514'; END IF;
   END LOOP;
   FOR field IN SELECT * FROM jsonb_each(after_header) LOOP
    evidence_value:=field.value;
    IF field.key IN ('updatedAt','approvedAt') THEN evidence_value:=coalesce(to_jsonb((evidence_value#>>'{}')::timestamptz),'null'); END IF;
    header_expected:=jsonb_set(header_expected,ARRAY[field.key],evidence_value);
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.before_values->'lines','[]')) LOOP
    IF lines_expected->(row_value->>'id') IS DISTINCT FROM row_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_LINE_BEFORE_DIFFERS' USING ERRCODE='23514'; END IF;
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.after_values->'lines','[]')) LOOP
    IF lines_expected ? (row_value->>'id') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(step.before_values->'lines','[]')) v WHERE v->>'id'=row_value->>'id') THEN RAISE EXCEPTION 'STANDARD_VERIFY_LINE_IDENTITY_REBOUND' USING ERRCODE='23514'; END IF;
    lines_expected:=jsonb_set(lines_expected,ARRAY[row_value->>'id'],row_value);
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.before_values->'settlements','[]')) LOOP
    IF settlements_expected->(row_value->>'id') IS DISTINCT FROM row_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_SETTLEMENT_BEFORE_DIFFERS' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(step.after_values->'settlements','[]')) v WHERE v->>'id'=row_value->>'id') THEN
     settlements_expected:=settlements_expected-(row_value->>'id');retired:=retired||jsonb_build_object(row_value->>'id',true);
    END IF;
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.after_values->'settlements','[]')) LOOP
    IF retired ? (row_value->>'id') OR (settlements_expected ? (row_value->>'id') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(step.before_values->'settlements','[]')) v WHERE v->>'id'=row_value->>'id')) THEN RAISE EXCEPTION 'STANDARD_VERIFY_SETTLEMENT_IDENTITY_REBOUND' USING ERRCODE='23514'; END IF;
    settlements_expected:=jsonb_set(settlements_expected,ARRAY[row_value->>'id'],row_value);
   END LOOP;
   expected_version:=step.new_version;steps:=steps+1;
  END LOOP;
  IF expected_version<>current_version OR header_expected IS DISTINCT FROM header_actual OR lines_expected IS DISTINCT FROM lines_actual OR settlements_expected IS DISTINCT FROM settlements_actual THEN
   RAISE EXCEPTION 'STANDARD_VERIFY_CURRENT_NATIVE_PROJECTION_DIFFERS' USING ERRCODE='23514'; END IF;
  IF steps=0 AND current_snap IS DISTINCT FROM snap THEN RAISE EXCEPTION 'STANDARD_VERIFY_UNCHANGED_NATIVE_SNAPSHOT_DIFFERS' USING ERRCODE='23514'; END IF;
  documents:=documents||jsonb_build_array(jsonb_build_object('kind',kind,'id',source_row.target_id,'initial_version',initial_version,'current_version',current_version,'state',CASE WHEN steps=0 THEN 'UNCHANGED' ELSE 'VERIFIED_CHANGED_AFTER_IMPORT' END,'audit_steps',steps));
 END LOOP;
 FOR stock_key IN
  SELECT DISTINCT k.warehouse_id,k.sku_id FROM (
   SELECT (p->'fields'->>'warehouse_id')::uuid warehouse_id,(p->'fields'->>'sku_id')::uuid sku_id FROM naijue_erp.import_record s CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) p WHERE s.import_batch_id=baseline.id AND s.target_type='INVENTORY_KEY'
   UNION ALL SELECT l.warehouse_id,l.sku_id FROM naijue_erp.inventory_ledger l LEFT JOIN naijue_erp.sales_line sl ON sl.id=l.source_sales_line_id LEFT JOIN naijue_erp.sales_header sh ON sh.id=sl.sales_id
    LEFT JOIN naijue_erp.transfer_line tl ON tl.id=l.source_transfer_line_id LEFT JOIN naijue_erp.transfer_header th ON th.id=tl.transfer_id WHERE sh.import_batch_id=documents_batch.id OR th.import_batch_id=documents_batch.id
  ) k ORDER BY k.warehouse_id,k.sku_id LOOP
  proof:=naijue_erp.standard_inventory_key_proof(stock_key.warehouse_id,stock_key.sku_id);
  IF proof->>'state'='UNKNOWN' THEN
   SELECT * INTO STRICT admission FROM naijue_erp.inventory_key_admission(stock_key.warehouse_id,stock_key.sku_id);
   IF admission.admitted IS DISTINCT FROM true THEN RAISE EXCEPTION 'STANDARD_VERIFY_UNPROVEN_KEY_UNKNOWN_NOT_ZERO' USING ERRCODE='23514'; END IF;
   quantity:=0;proof:=jsonb_build_object('state','POST_CUTOFF_NATIVE');
  ELSE quantity:=(proof->'fields'->>'quantity')::numeric; END IF;
  SELECT coalesce(sum(quantity_delta::numeric),0),count(*) INTO ledger_total,effects FROM naijue_erp.inventory_ledger WHERE warehouse_id=stock_key.warehouse_id AND sku_id=stock_key.sku_id;
  IF EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l LEFT JOIN naijue_erp.operation_receipt r ON r.id=l.operation_id LEFT JOIN naijue_erp.audit_change a ON a.operation_id=r.id
   WHERE l.warehouse_id=stock_key.warehouse_id AND l.sku_id=stock_key.sku_id AND (r.id IS NULL OR a.operation_id IS NULL OR r.status<>'COMMITTED' OR a.actor_account_id<>r.actor_account_id OR a.object_id<>r.target_id
    OR a.object_type<>r.target_type OR a.action<>r.action OR a.occurred_at IS DISTINCT FROM r.completed_at OR NOT(r.result_data->'ledgerEntryIds' ? l.id::text))) THEN RAISE EXCEPTION 'STANDARD_VERIFY_LEDGER_OPERATION_PROOF_INVALID' USING ERRCODE='23514'; END IF;
  SELECT * INTO balance FROM naijue_erp.inventory_balance WHERE warehouse_id=stock_key.warehouse_id AND sku_id=stock_key.sku_id;has_balance:=FOUND;
  IF (effects=0 AND (proof->>'state'<>'EXPLICIT_ZERO' OR has_balance)) OR (effects>0 AND (NOT has_balance OR balance.quantity::numeric<>ledger_total OR balance.version::numeric<>effects
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r JOIN naijue_erp.inventory_ledger l ON l.operation_id=r.id WHERE r.id=balance.last_operation_id AND l.warehouse_id=stock_key.warehouse_id AND l.sku_id=stock_key.sku_id AND r.completed_at=balance.updated_at))) THEN RAISE EXCEPTION 'STANDARD_VERIFY_CURRENT_BALANCE_LEDGER_DIFFERS' USING ERRCODE='23514'; END IF;
  inventory_keys:=inventory_keys||jsonb_build_array(jsonb_build_object('warehouse_id',stock_key.warehouse_id,'sku_id',stock_key.sku_id,'coverage',proof->>'state','baseline_quantity',quantity::text,'ledger_total',ledger_total::text,'ledger_entries',effects,
   'balance_quantity',CASE WHEN has_balance THEN balance.quantity::text ELSE NULL END,'balance_version',CASE WHEN has_balance THEN balance.version ELSE NULL END,'verified',true));
 END LOOP;
 RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','plan_sha256',request->>'plan_sha256','batch_id',documents_batch.id,'baseline_batch_id',baseline.id,'verified',true,'documents',documents,'source_counts',source_counts,
  'inventory_keys',inventory_keys,'scope','CURRENT_NATIVE_AND_IMMUTABLE_IMPORT_PROOF_FENCED','proof_scope','SET_ROLE_ONLY_NOT_NONOWNER_LOGIN');
END $$;

-- Exact standard-profile successors; predecessor branches remain intact.
CREATE OR REPLACE FUNCTION naijue_erp.guard_import_batch() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
BEGIN
  IF NEW.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' THEN
    PERFORM naijue_erp.cutoff_import_lock();
    IF TG_OP='DELETE' OR NEW.inventory_mode<>'CUTOFF_STOCK_BASELINE' OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed THEN
      RAISE EXCEPTION 'STANDARD_BASELINE_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');
      IF NEW.status<>'STAGED' OR NEW.checkpoint->>'sequence' IS DISTINCT FROM '0' OR NEW.checkpoint->>'cursor' IS DISTINCT FROM '0' OR EXISTS(SELECT 1 FROM naijue_erp.import_batch) THEN RAISE EXCEPTION 'STANDARD_BASELINE_MUST_START_EMPTY_ZERO' USING ERRCODE='23514'; END IF;
    ELSE
      PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
      IF OLD.status IN ('IMPORTED','FAILED') OR (to_jsonb(NEW)-ARRAY['checkpoint','status','completed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['checkpoint','status','completed_at'])
       OR NEW.checkpoint->'expected' IS DISTINCT FROM OLD.checkpoint->'expected' OR (NEW.checkpoint->>'sequence')::numeric<>(OLD.checkpoint->>'sequence')::numeric+1
       OR (NEW.checkpoint->>'cursor')::numeric<(OLD.checkpoint->>'cursor')::numeric OR NEW.status NOT IN ('VALIDATING','IMPORTED') THEN RAISE EXCEPTION 'STANDARD_BASELINE_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NEW;
  END IF;
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
  SELECT x.operation_id INTO core_operation FROM naijue_erp.audit_change x WHERE x.object_type='IMPORT' AND x.object_id=NEW.id AND x.new_version=(NEW.checkpoint->>'sequence')::integer+1 AND x.after_values->>'profile'='STANDARD_IMPORT_SQL_V1';
  IF FOUND THEN
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=core_operation;
    IF a.before_values IS DISTINCT FROM (CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.checkpoint END) OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint THEN RAISE EXCEPTION 'STANDARD_BATCH_ACTUAL_TRANSITION_DIFFERS' USING ERRCODE='23514'; END IF;
    PERFORM naijue_erp.assert_standard_import_operation(core_operation); RETURN NULL;
  END IF;
  IF NEW.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' THEN RAISE EXCEPTION 'STANDARD_BATCH_RECEIPT_REQUIRED' USING ERRCODE='23514'; END IF;
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

CREATE OR REPLACE FUNCTION naijue_erp.validate_import_operation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; actual_ids jsonb; receipt_ids jsonb;
BEGIN
  IF NEW.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' THEN PERFORM naijue_erp.assert_standard_import_operation(NEW.id); RETURN NULL; END IF;
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

CREATE OR REPLACE FUNCTION naijue_erp.guard_import_record() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE;
BEGIN
  IF NEW.decision_reason LIKE '{%"STANDARD_IMPORT_POINTER_V1"%' THEN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    PERFORM naijue_erp.cutoff_import_lock();
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id FOR UPDATE;
    PERFORM naijue_erp.import_source_key_lock(NEW.source_system,NEW.source_entity_type,NEW.source_key);
    IF b.status NOT IN ('STAGED','VALIDATING') OR NEW.status<>'IMPORTED' OR NEW.source_system IS DISTINCT FROM b.source_name OR NEW.reviewed_at IS DISTINCT FROM transaction_timestamp()
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id
       CROSS JOIN LATERAL jsonb_array_elements(a.after_values->'records') item
       WHERE a.operation_id=(NEW.decision_reason::jsonb->>'operationId')::uuid AND a.object_type='IMPORT' AND a.object_id=b.id AND a.after_values->>'profile'='STANDARD_IMPORT_SQL_V1'
        AND a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint AND r.actor_account_id=a.actor_account_id AND r.completed_at=NEW.reviewed_at
        AND item->>'id'=NEW.id::text AND item->>'entity_type'=NEW.source_entity_type AND item->>'source_key'=NEW.source_key AND item->>'target_type'=NEW.target_type
        AND item->>'target_id'=NEW.target_id::text AND item->>'source_hash'=NEW.source_record_hash AND item->>'file_ref'=NEW.source_file_ref) THEN
      RAISE EXCEPTION 'STANDARD_SOURCE_PREPARED_INTENT_REQUIRED' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
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

CREATE OR REPLACE FUNCTION naijue_erp.validate_import_source_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE l naijue_erp.inventory_ledger%ROWTYPE;
BEGIN
  IF NEW.decision_reason LIKE '{%"STANDARD_IMPORT_POINTER_V1"%' THEN
    PERFORM naijue_erp.standard_import_record_proof(NEW.id);
    PERFORM naijue_erp.assert_standard_import_operation((NEW.decision_reason::jsonb->>'operationId')::uuid); RETURN NULL;
  END IF;
  IF NEW.target_type = 'INVENTORY_LEDGER' AND NEW.status = 'IMPORTED' THEN
    SELECT * INTO STRICT l FROM naijue_erp.inventory_ledger WHERE id = NEW.target_id;
    IF l.event_kind <> 'CUTOFF_BASELINE' OR l.source_import_batch_id IS DISTINCT FROM NEW.import_batch_id
      OR NEW.source_entity_type <> 'INVENTORY_BASELINE' THEN
      RAISE EXCEPTION 'source record does not point at its own immutable baseline' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_baseline_source_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE;
BEGIN
  IF NEW.event_kind='CUTOFF_BASELINE' AND EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=NEW.source_import_batch_id AND mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1') THEN
    IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_record s CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) proof
      WHERE s.import_batch_id=NEW.source_import_batch_id AND s.target_type='INVENTORY_KEY' AND s.target_id=naijue_erp.standard_inventory_key_id(NEW.warehouse_id,NEW.sku_id)
       AND proof->>'ledger_entry_id'=NEW.id::text AND proof->>'operation_id'=NEW.operation_id::text AND (proof->'fields'->>'quantity')::bigint=NEW.quantity_delta)
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.id=NEW.operation_id AND r.result_data->>'phase'='KEYS' AND r.completed_at=NEW.posted_at) THEN
      RAISE EXCEPTION 'STANDARD_BASELINE_EXPLICIT_KEY_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END IF;
  IF NEW.event_kind <> 'CUTOFF_BASELINE' THEN RETURN NULL; END IF;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = NEW.operation_id;
  IF r.target_type <> 'IMPORT' OR r.target_id IS DISTINCT FROM NEW.source_import_batch_id OR r.action <> 'IMPORT_CHUNK'
    OR r.completed_at IS DISTINCT FROM NEW.posted_at
    OR NOT (r.result_data->'ledgerEntryIds' ? NEW.id::text)
    OR NOT EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id = NEW.source_import_batch_id
      AND target_type = 'INVENTORY_LEDGER' AND target_id = NEW.id AND status = 'IMPORTED' AND source_entity_type = 'INVENTORY_BASELINE') THEN
    RAISE EXCEPTION 'baseline requires its native source and actual import operation' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_cutoff_ledger() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE;
BEGIN
  IF NEW.event_kind='CUTOFF_BASELINE' AND EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=NEW.source_import_batch_id AND mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1') THEN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER'); PERFORM naijue_erp.cutoff_import_lock(); PERFORM naijue_erp.inventory_key_lock(NEW.warehouse_id,NEW.sku_id);
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.source_import_batch_id FOR UPDATE;
    IF b.status NOT IN ('STAGED','VALIDATING') OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED')
     OR EXISTS(SELECT 1 FROM naijue_erp.inventory_balance WHERE warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id)
     OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id) THEN RAISE EXCEPTION 'STANDARD_REBASELINE_DENIED' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  PERFORM naijue_erp.inventory_key_lock(NEW.warehouse_id, NEW.sku_id);
  IF NEW.event_kind = 'CUTOFF_BASELINE' THEN
    PERFORM naijue_erp.cutoff_import_lock();
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id = NEW.source_import_batch_id FOR UPDATE;
    IF b.status NOT IN ('STAGED', 'VALIDATING') OR EXISTS (SELECT 1 FROM naijue_erp.import_batch WHERE status = 'IMPORTED')
      OR NOT EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id = b.id AND status = 'IMPORTED' AND target_type = 'WAREHOUSE' AND target_id = NEW.warehouse_id)
      OR NOT EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id = b.id AND status = 'IMPORTED' AND target_type = 'SKU' AND target_id = NEW.sku_id)
      OR EXISTS (SELECT 1 FROM naijue_erp.inventory_balance WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id)
      OR EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id) THEN
      RAISE EXCEPTION 'baseline requires owned complete identities and a previously unused key' USING ERRCODE = '23514';
    END IF;
  ELSIF NOT naijue_erp.inventory_runtime_key_admitted(NEW.warehouse_id, NEW.sku_id) THEN
    RAISE EXCEPTION 'inventory scope is not published' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

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
    IF b.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' THEN
      IF NOT naijue_erp.standard_business_ready() OR (naijue_erp.standard_inventory_key_proof(NEW.warehouse_id,NEW.sku_id)->>'state' NOT IN ('EXPLICIT_ZERO')
        AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_key_admission(NEW.warehouse_id,NEW.sku_id) k WHERE k.admitted AND (k.warehouse_basis='POST_CUTOFF_CREATED' OR k.sku_basis='POST_CUTOFF_CREATED')))
       THEN RAISE EXCEPTION 'STANDARD_FIRST_BALANCE_REQUIRES_PROVEN_ZERO_OR_NATIVE_CREATION' USING ERRCODE='23514'; END IF;
    ELSE
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
    END IF;
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

CREATE OR REPLACE FUNCTION naijue_erp.inventory_key_admission(warehouse uuid,sku uuid)
RETURNS TABLE(admitted boolean,published_batch_id uuid,warehouse_basis text,sku_basis text,warehouse_created_operation_id uuid,sku_created_operation_id uuid)
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,naijue_erp AS $$
DECLARE batches uuid[]; batch naijue_erp.import_batch%ROWTYPE; valid_sku boolean;
BEGIN
  admitted:=false; published_batch_id:=NULL; warehouse_basis:=NULL; sku_basis:=NULL;
  warehouse_created_operation_id:=NULL; sku_created_operation_id:=NULL;
  SELECT array_agg(id ORDER BY id) INTO batches FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE';
  IF coalesce(cardinality(batches),0)<>1 THEN RETURN NEXT; RETURN; END IF;
  SELECT * INTO STRICT batch FROM naijue_erp.import_batch WHERE id=batches[1];
  IF batch.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' THEN
    published_batch_id:=batch.id;
    IF NOT naijue_erp.standard_business_ready() THEN RETURN NEXT; RETURN; END IF;
    SELECT w.created_operation_id INTO warehouse_created_operation_id FROM naijue_erp.warehouse w JOIN naijue_erp.hall h ON h.id=w.hall_id WHERE w.id=warehouse;
    IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
    SELECT s.created_operation_id,EXISTS(SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id=p.size_group_id AND m.size_id=s.size_id)
     INTO sku_created_operation_id,valid_sku FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id=s.product_id JOIN naijue_erp.color c ON c.id=s.color_id JOIN naijue_erp.fit f ON f.id=s.fit_id JOIN naijue_erp.size z ON z.id=s.size_id WHERE s.id=sku;
    IF NOT FOUND OR NOT valid_sku THEN RETURN NEXT; RETURN; END IF;
    IF EXISTS(SELECT 1 FROM naijue_erp.import_record s WHERE s.import_batch_id=batch.id AND s.target_type='WAREHOUSE' AND s.target_id=warehouse) THEN warehouse_basis:='CUTOFF_MEMBER';
    ELSIF naijue_erp.native_creation_operation_valid('WAREHOUSE',warehouse,warehouse_created_operation_id) THEN warehouse_basis:='POST_CUTOFF_CREATED'; END IF;
    IF EXISTS(SELECT 1 FROM naijue_erp.import_record s WHERE s.import_batch_id=batch.id AND s.target_type='SKU' AND s.target_id=sku) THEN sku_basis:='CUTOFF_MEMBER';
    ELSIF naijue_erp.native_creation_operation_valid('SKU',sku,sku_created_operation_id) THEN sku_basis:='POST_CUTOFF_CREATED'; END IF;
    admitted:=warehouse_basis IS NOT NULL AND sku_basis IS NOT NULL AND (naijue_erp.standard_inventory_key_proof(warehouse,sku)->>'state'<>'UNKNOWN' OR warehouse_basis='POST_CUTOFF_CREATED' OR sku_basis='POST_CUTOFF_CREATED');
    RETURN NEXT; RETURN;
  END IF;
  IF batch.completed_at IS NULL OR (batch.checkpoint->>'sequence')::bigint<=0
    OR batch.checkpoint->'expected'->>'IMPORT_BATCH' IS DISTINCT FROM '1' OR batch.checkpoint->'counts' IS DISTINCT FROM batch.checkpoint->'expected'
    OR (batch.checkpoint->>'cursor')::numeric IS DISTINCT FROM (batch.checkpoint->'counts'->>'WAREHOUSE')::numeric
      +(batch.checkpoint->'counts'->>'SKU')::numeric+(batch.checkpoint->'counts'->>'INVENTORY_LEDGER')::numeric+(batch.checkpoint->'counts'->>'IMPORT_BATCH')::numeric
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=batch.id AND r.status='IMPORTED'
      AND r.target_type='IMPORT_BATCH' AND r.target_id=batch.id AND r.source_entity_type='INVENTORY_SCOPE_APPROVAL' AND r.source_key='FINAL_COMPLETE_SCOPE'
      AND r.decision_reason='COMPLETE_SCOPE;ABSENT_IS_ZERO;ALL_FILES_VERIFIED;FINAL_DELTA_VERIFIED;NO_UNRESOLVED_EXCEPTIONS'
      AND r.source_record_hash=batch.source_hash AND r.source_file_ref=batch.source_manifest_ref) THEN RETURN NEXT; RETURN; END IF;
  published_batch_id:=batch.id;
  SELECT w.created_operation_id INTO warehouse_created_operation_id FROM naijue_erp.warehouse w JOIN naijue_erp.hall h ON h.id=w.hall_id WHERE w.id=warehouse;
  IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
  SELECT s.created_operation_id,EXISTS(SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id=p.size_group_id AND m.size_id=s.size_id)
    INTO sku_created_operation_id,valid_sku FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id=s.product_id
    JOIN naijue_erp.color c ON c.id=s.color_id JOIN naijue_erp.fit f ON f.id=s.fit_id JOIN naijue_erp.size z ON z.id=s.size_id WHERE s.id=sku;
  IF NOT FOUND OR NOT valid_sku THEN RETURN NEXT; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=batch.id AND r.status='IMPORTED' AND r.target_type='WAREHOUSE' AND r.target_id=warehouse) THEN
    warehouse_basis:='CUTOFF_MEMBER';
  ELSIF naijue_erp.native_creation_operation_valid('WAREHOUSE',warehouse,warehouse_created_operation_id) THEN warehouse_basis:='POST_CUTOFF_CREATED'; END IF;
  IF EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=batch.id AND r.status='IMPORTED' AND r.target_type='SKU' AND r.target_id=sku) THEN
    sku_basis:='CUTOFF_MEMBER';
  ELSIF naijue_erp.native_creation_operation_valid('SKU',sku,sku_created_operation_id) THEN sku_basis:='POST_CUTOFF_CREATED'; END IF;
  admitted:=warehouse_basis IS NOT NULL AND sku_basis IS NOT NULL;
  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.published_inventory_key(warehouse uuid, sku uuid) RETURNS boolean LANGUAGE sql STABLE
  SET search_path = pg_catalog, naijue_erp AS $$
  SELECT CASE WHEN EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1') THEN naijue_erp.standard_business_ready() AND naijue_erp.standard_inventory_key_proof(warehouse,sku)->>'state'<>'UNKNOWN' ELSE EXISTS (SELECT 1 FROM naijue_erp.import_batch b WHERE b.status = 'IMPORTED' AND b.inventory_mode = 'CUTOFF_STOCK_BASELINE'
    AND EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = b.id AND r.status = 'IMPORTED' AND r.target_type = 'WAREHOUSE' AND r.target_id = warehouse)
    AND EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = b.id AND r.status = 'IMPORTED' AND r.target_type = 'SKU' AND r.target_id = sku)) END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_recorded_live_balance_pair() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,naijue_erp AS $pair$
DECLARE current_quantity bigint;
BEGIN
  IF NEW.event_kind='UNAPPROVE' AND NEW.baseline_anchor_operation_id IS NOT NULL AND EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1')
   AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_balance WHERE warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id)
   AND naijue_erp.standard_inventory_key_proof(NEW.warehouse_id,NEW.sku_id)->>'state' IS DISTINCT FROM 'EXPLICIT_ZERO' THEN
    RAISE EXCEPTION 'STANDARD_BASELINE_REVERSAL_ABSENCE_IS_NOT_ZERO' USING ERRCODE='23514'; END IF;
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

CREATE OR REPLACE FUNCTION naijue_erp.native_creation_operation_valid(kind text,target uuid,operation uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,naijue_erp AS $$
DECLARE receipt naijue_erp.operation_receipt%ROWTYPE; audit naijue_erp.audit_change%ROWTYPE; item jsonb; actual jsonb;
BEGIN
  IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.id=operation AND r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1') THEN RETURN false; END IF;
  IF operation IS NULL OR target IS NULL OR kind IS NULL OR kind NOT IN ('WAREHOUSE','SKU') THEN RETURN false; END IF;
  SELECT * INTO receipt FROM naijue_erp.operation_receipt WHERE id=operation;
  IF NOT FOUND OR receipt.status<>'COMMITTED' THEN RETURN false; END IF;
  SELECT * INTO audit FROM naijue_erp.audit_change WHERE operation_id=operation;
  IF NOT FOUND OR audit.actor_account_id<>receipt.actor_account_id OR audit.object_type<>receipt.target_type
    OR audit.object_id<>receipt.target_id OR audit.action<>receipt.action OR audit.occurred_at<>receipt.completed_at
    OR audit.new_version::text IS DISTINCT FROM receipt.result_data->>'version' THEN RETURN false; END IF;
  IF kind='WAREHOUSE' THEN
    RETURN coalesce(receipt.target_type='WAREHOUSE' AND receipt.target_id=target AND receipt.action='CREATE'
      AND audit.old_version IS NULL AND audit.new_version=1 AND audit.before_values IS NULL
      AND audit.after_values->>'id'=target::text AND audit.after_values->>'created_operation_id'=operation::text
      AND audit.after_values->'version'='1'::jsonb,false);
  END IF;
  IF receipt.target_type<>'PRODUCT' OR receipt.action NOT IN ('CREATE','EDIT')
    OR jsonb_typeof(audit.after_values->'skus') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  SELECT to_jsonb(s) INTO actual FROM naijue_erp.sku s WHERE s.id=target AND s.product_id=receipt.target_id AND s.created_operation_id=operation;
  IF actual IS NULL THEN RETURN false; END IF;
  SELECT value INTO item FROM jsonb_array_elements(audit.after_values->'skus') WHERE value->>'id'=target::text;
  IF item IS NULL OR item->>'created_operation_id' IS DISTINCT FROM operation::text OR item->'version' IS DISTINCT FROM '1'::jsonb THEN RETURN false; END IF;
  -- Enabled/version may legitimately change later. Original coordinate, code,
  -- parent and immutable creation operation must still be the original ones.
  RETURN item ?& ARRAY['id','product_id','color_id','fit_id','size_id','sku_code','created_operation_id']
    AND item-ARRAY['enabled','version']=actual-ARRAY['enabled','version'];
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_native_creation_identity() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE audit naijue_erp.audit_change%ROWTYPE; family text;
BEGIN
  IF TG_OP='INSERT' AND naijue_erp.standard_import_row_intent(upper(TG_TABLE_NAME),to_jsonb(NEW)) THEN
    IF NEW.created_operation_id IS NOT NULL THEN RAISE EXCEPTION 'STANDARD_SOURCE_IS_NOT_POSTCUTOFF_CREATION' USING ERRCODE='23514'; END IF; RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id<>OLD.id OR NEW.created_operation_id IS DISTINCT FROM OLD.created_operation_id THEN
      RAISE EXCEPTION 'Retained native identity cannot acquire or replace a creation operation' USING ERRCODE='23514';
    END IF;
    IF TG_TABLE_NAME='sku' THEN
      IF ROW(NEW.product_id,NEW.color_id,NEW.fit_id,NEW.size_id,NEW.sku_code)
        IS DISTINCT FROM ROW(OLD.product_id,OLD.color_id,OLD.fit_id,OLD.size_id,OLD.sku_code) THEN
        RAISE EXCEPTION 'Retained SKU coordinates and code cannot be rebound' USING ERRCODE='23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.created_operation_id IS NULL THEN
    IF EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN
      RAISE EXCEPTION 'Post-cutoff native creation requires its original audited operation' USING ERRCODE='23514';
    END IF;
    -- Preserve source-owned initial import INSERT guards, not a zero/adoption lane.
    RETURN NEW;
  END IF;
  IF NEW.version<>1 OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN
    RAISE EXCEPTION 'Runtime creation must start at version1 after cutoff publication' USING ERRCODE='23514';
  END IF;
  SELECT * INTO STRICT audit FROM naijue_erp.audit_change WHERE operation_id=NEW.created_operation_id;
  family:=CASE TG_TABLE_NAME WHEN 'warehouse' THEN 'WAREHOUSE' WHEN 'sku' THEN 'PRODUCT' END;
  IF audit.object_type IS DISTINCT FROM family OR audit.action NOT IN ('CREATE','EDIT')
    OR NOT naijue_erp.maintenance_audit_is_current(audit.operation_id)
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id
      LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE a.id=audit.actor_account_id AND a.login_enabled
      AND s.employment_status='在职' AND (s.role IN ('ADMIN','WAREHOUSE')
        OR (TG_TABLE_NAME='sku' AND s.role='SALESPERSON' AND s.hall_id IS NOT NULL AND h.enabled
          AND audit.object_type='PRODUCT' AND audit.action='EDIT'
          AND audit.before_values=jsonb_build_object('version',audit.old_version,'skus','[]'::jsonb)
          AND audit.after_values-ARRAY['version','skus']='{}'::jsonb
          AND audit.after_values->'version'=to_jsonb(audit.new_version) AND jsonb_typeof(audit.after_values->'skus')='array'))
      AND (s.hall_id IS NULL OR h.enabled)) THEN
    RAISE EXCEPTION 'Native creation requires current trusted maintenance authority and same-transaction prepared audit' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='warehouse' THEN
    IF audit.object_id<>NEW.id OR audit.action<>'CREATE' THEN
      RAISE EXCEPTION 'Warehouse creation operation targets another root' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='sku' THEN
    IF audit.object_id<>NEW.product_id THEN
      RAISE EXCEPTION 'SKU creation operation targets another product' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.is_native_party_import_insert(kind text, snapshot jsonb) RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp AS $$
  SELECT naijue_erp.standard_import_row_intent(kind,snapshot) OR EXISTS (SELECT 1 FROM naijue_erp.native_party_import_evidence e WHERE e.entity_type=kind
    AND e.native_id::text=snapshot->>'id' AND e.native_snapshot=snapshot AND e.creation_xid=pg_current_xact_id()
    AND e.validator_version='NATIVE_PARTY_IMPORT_V1' AND snapshot->'version'='1'::jsonb);
$$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_maintenance_before_root() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE family text; audit naijue_erp.audit_change%ROWTYPE; actual jsonb; before_accounts jsonb; after_accounts jsonb; item jsonb; following jsonb;
BEGIN
  IF TG_OP='INSERT' AND naijue_erp.standard_import_row_intent(upper(TG_TABLE_NAME),to_jsonb(NEW)) THEN RETURN NEW; END IF;
  family:=CASE TG_TABLE_NAME WHEN 'product' THEN 'PRODUCT' WHEN 'payment_account' THEN 'PAYMENT_ACCOUNT' WHEN 'staff' THEN 'STAFF' END;
  SELECT * INTO audit FROM naijue_erp.audit_change WHERE object_type=family AND object_id=NEW.id AND new_version=NEW.version;
  IF NOT FOUND THEN
    IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Prepare original root audit before aggregate mutation' USING ERRCODE='23514';
    RETURN NEW;
  END IF;
  IF NOT naijue_erp.maintenance_audit_is_current(audit.operation_id) THEN
    RAISE EXCEPTION 'Prepared root audit must belong to this original transaction' USING ERRCODE='23514';
  END IF;
  IF family='PRODUCT' THEN PERFORM naijue_erp.maintenance_check_product_children(audit,true);
  ELSIF family='PAYMENT_ACCOUNT' AND (audit.before_values ? 'payment_halls' OR audit.after_values ? 'payment_halls') THEN
    actual:=naijue_erp.maintenance_payment_halls(NEW.id);
    IF (TG_OP='INSERT' AND actual<>'[]'::jsonb) OR (TG_OP='UPDATE' AND NOT naijue_erp.maintenance_exact_rows_match(audit.before_values->'payment_halls',actual,'hall_id'))
      OR jsonb_typeof(audit.after_values->'payment_halls') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Payment hall before evidence must equal the complete actual relation set' USING ERRCODE='23514';
    END IF;
  ELSIF family='STAFF' THEN
    PERFORM naijue_erp.maintenance_check_staff_accounts(audit,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW),true);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_maintenance_root_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE family text; a naijue_erp.audit_change%ROWTYPE; new_root jsonb; old_root jsonb; after_root jsonb; before_root jsonb;
  field record; present boolean; parent uuid; visited uuid[];
BEGIN
  IF TG_OP='INSERT' AND naijue_erp.standard_import_row_intent(upper(TG_TABLE_NAME),to_jsonb(NEW)) THEN RETURN NULL; END IF;
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

CREATE OR REPLACE FUNCTION naijue_erp.guard_maintenance_child_write() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE family text; child_kind text; root_id uuid; root_version integer; row_before jsonb; row_after jsonb;
  audit naijue_erp.audit_change%ROWTYPE; before_item jsonb; after_item jsonb;
BEGIN
  IF TG_OP='INSERT' AND naijue_erp.standard_import_row_intent(upper(TG_TABLE_NAME),to_jsonb(NEW)) THEN RETURN NEW; END IF;
  row_before:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  row_after:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  IF TG_TABLE_NAME='payment_account_hall' THEN
    family:='PAYMENT_ACCOUNT'; child_kind:='payment_halls'; root_id:=(coalesce(row_after,row_before)->>'payment_account_id')::uuid;
    SELECT version INTO STRICT root_version FROM naijue_erp.payment_account WHERE id=root_id;
    IF TG_OP='UPDATE' AND row_before IS DISTINCT FROM row_after THEN
      RAISE EXCEPTION 'Payment hall relation identities require explicit delete/insert' USING ERRCODE='23514';
    END IF;
  ELSE
    family:='PRODUCT'; child_kind:=CASE TG_TABLE_NAME WHEN 'sku' THEN 'skus' WHEN 'sku_barcode' THEN 'barcodes' WHEN 'product_image' THEN 'images' END;
    IF child_kind IS NULL THEN RAISE EXCEPTION 'Unsupported child relation' USING ERRCODE='23514'; END IF;
    IF child_kind='barcodes' THEN SELECT product_id INTO STRICT root_id FROM naijue_erp.sku WHERE id=(coalesce(row_after,row_before)->>'sku_id')::uuid;
    ELSE root_id:=(coalesce(row_after,row_before)->>'product_id')::uuid; END IF;
    SELECT version INTO STRICT root_version FROM naijue_erp.product WHERE id=root_id;
    IF TG_OP='DELETE' AND child_kind<>'images' THEN RAISE EXCEPTION 'SKU and barcode identity must be retained' USING ERRCODE='23514'; END IF;
  END IF;
  SELECT * INTO audit FROM naijue_erp.audit_change WHERE object_type=family AND object_id=root_id AND new_version=root_version;
  IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF audit.operation_id IS NULL OR NOT naijue_erp.maintenance_audit_is_current(audit.operation_id)
    OR jsonb_typeof(audit.after_values->child_kind) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Every child mutation requires the same prepared current root operation' USING ERRCODE='23514';
  END IF;
  IF child_kind='payment_halls' THEN
    IF row_before IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(audit.before_values->child_kind) x(v) WHERE v=row_before)
      OR row_after IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(audit.after_values->child_kind) x(v) WHERE v=row_after) THEN
      RAISE EXCEPTION 'Payment relation event is outside complete prepared before/after sets' USING ERRCODE='23514';
    END IF;
  ELSE
    IF row_before IS NOT NULL THEN
      SELECT value INTO before_item FROM jsonb_array_elements(audit.before_values->child_kind) WHERE value->>'id'=row_before->>'id';
      IF NOT naijue_erp.maintenance_complete_row_matches(before_item,row_before) THEN
        RAISE EXCEPTION 'Actual original child differs from before evidence' USING ERRCODE='23514';
      END IF;
    END IF;
    IF row_after IS NOT NULL THEN
      SELECT value INTO after_item FROM jsonb_array_elements(audit.after_values->child_kind) WHERE value->>'id'=row_after->>'id';
      IF NOT naijue_erp.maintenance_complete_row_matches(after_item,row_after) THEN
        RAISE EXCEPTION 'Actual new child differs from after evidence' USING ERRCODE='23514';
      END IF;
    ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(audit.after_values->child_kind) x(v) WHERE v->>'id'=row_before->>'id') THEN
      -- Proposed only: retain logical image identity while materializing an exact
      -- already-prepared final mapping; no temporary fake image row is permitted.
      SELECT value INTO STRICT after_item FROM jsonb_array_elements(audit.after_values->child_kind)
        WHERE value->>'id'=row_before->>'id';
      IF (child_kind='images' AND jsonb_typeof(after_item)='object'
        AND after_item->'id'=before_item->'id' AND after_item->'product_id'=before_item->'product_id'
        AND after_item->>'product_id'=root_id::text
        AND after_item->'created_at'=before_item->'created_at'
        AND after_item->'created_by_account_id'=before_item->'created_by_account_id'
        AND jsonb_typeof(before_item->'version')='number' AND jsonb_typeof(after_item->'version')='number'
        AND before_item->>'version' ~ '^[1-9][0-9]*$' AND after_item->>'version' ~ '^[1-9][0-9]*$'
        AND (after_item->>'version')::bigint=(before_item->>'version')::bigint+1) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Removed child cannot remain in after evidence except exact prepared image identity replacement' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_product_season_selection() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,naijue_erp AS $$
DECLARE found_count bigint; audit naijue_erp.audit_change%ROWTYPE;
BEGIN
  IF NOT naijue_erp.valid_product_season_ids(NEW.season_ids) THEN
    RAISE EXCEPTION 'Canonical one-dimensional distinct season identities required' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.season_id IS DISTINCT FROM OLD.season_id THEN
      RAISE EXCEPTION 'Original scalar season is retained provenance' USING ERRCODE='23514';
    END IF;
    IF OLD.season_ids IS NOT NULL AND NEW.season_ids IS NULL THEN
      RAISE EXCEPTION 'Known season selection cannot become unknown' USING ERRCODE='23514';
    END IF;
    IF NEW.season_ids IS NOT DISTINCT FROM OLD.season_ids THEN RETURN NEW; END IF;
  END IF;
  -- The reviewed host is READ COMMITTED. A historical transaction snapshot
  -- cannot safely implement this array's cross-row reference check; fail closed.
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Season reference mutation requires a current read-committed snapshot' USING ERRCODE='25000';
  END IF;
  SELECT count(*) INTO found_count FROM (
    SELECT id FROM naijue_erp.season WHERE id=ANY(NEW.season_ids) ORDER BY id FOR KEY SHARE
  ) locked;
  IF found_count<>coalesce(cardinality(NEW.season_ids),0) THEN
    RAISE EXCEPTION 'Every selected season must be an actual dictionary identity' USING ERRCODE='23503';
  END IF;
  IF TG_OP='INSERT' AND naijue_erp.standard_import_row_intent('PRODUCT',to_jsonb(NEW)) THEN RETURN NEW; END IF;
  SELECT * INTO audit FROM naijue_erp.audit_change WHERE object_type='PRODUCT' AND object_id=NEW.id AND new_version=NEW.version;
  IF FOUND THEN
    IF NOT naijue_erp.maintenance_audit_is_current(audit.operation_id)
      OR (TG_OP='INSERT' AND (NEW.season_ids IS NULL OR NEW.season_id IS NOT NULL))
      OR NOT naijue_erp.maintenance_evidence_matches(audit.after_values->'season_ids',coalesce(to_jsonb(NEW.season_ids),'null'::jsonb)) THEN
      RAISE EXCEPTION 'Season selection must belong to the same prepared product root' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND NOT naijue_erp.maintenance_evidence_matches(audit.before_values->'season_ids',coalesce(to_jsonb(OLD.season_ids),'null'::jsonb)) THEN
      RAISE EXCEPTION 'Original season selection evidence differs' USING ERRCODE='23514';
    END IF;
  ELSIF EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN
    RAISE EXCEPTION 'Published season changes require original product maintenance evidence' USING ERRCODE='23514';
  END IF;
  -- Unpublished source conversion remains subject to the original source/binding
  -- guards. This migration supplies no bypass, mapping, default or backfill.
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.is_exact_historical_customer_only(target uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,naijue_erp AS $$
DECLARE matched bigint;
BEGIN
  IF EXISTS(SELECT 1 FROM naijue_erp.import_record s JOIN naijue_erp.import_batch b ON b.id=s.import_batch_id WHERE s.target_type='CUSTOMER' AND s.target_id=target AND s.status='IMPORTED' AND b.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' AND s.decision_reason LIKE '{%"STANDARD_IMPORT_POINTER_V1"%') THEN RETURN false; END IF;
  IF target IS NULL OR target NOT IN ('2e5bd72a-c1cb-4090-90be-091deb49bb2e'::uuid,'f8a29ce8-e296-4b95-9612-ca7bb62507bd'::uuid) THEN RETURN false; END IF;
  SELECT count(*) INTO matched FROM naijue_erp.customer c
    JOIN naijue_erp.native_party_import_evidence e ON e.entity_type='CUSTOMER' AND e.native_id=c.id
    JOIN naijue_erp.import_source_row s ON s.id=e.source_row_id AND s.batch_id=e.batch_id
    JOIN naijue_erp.import_header_native_reference h ON h.batch_id=e.batch_id AND h.source_row_id=s.id
      AND h.entity_type='CUSTOMER' AND h.native_customer_id=c.id AND h.source_key=e.source_key
    WHERE c.id=target AND e.selection->>'source'='HISTORICAL_CUSTOMER_SUPPLEMENT_V1'
      AND e.selection->>'approvalSha256'='e471ccdef09f385688d8f5709e072a033d471f0c6fdba8b7bb1b49ad55a9408a'
      AND naijue_erp.exact_historical_customer_source_matches(to_jsonb(s),to_jsonb(c))
      AND e.native_snapshot=to_jsonb(c) AND h.native_snapshot=to_jsonb(c) AND h.native_version=c.version
      AND to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,e.source_snapshot))=to_jsonb(s);
  IF matched<>1 THEN
    RAISE EXCEPTION 'Pinned historical customer source closure is absent or inconsistent' USING ERRCODE='23514';
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.assert_document_conversion_batch(next_row naijue_erp.import_batch, prior jsonb, mutation text, final_state boolean)
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
 IF (CASE WHEN r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' THEN a.after_values->'checkpoint' ELSE a.after_values END) IS DISTINCT FROM next_row.checkpoint OR a.actor_account_id<>r.actor_account_id OR a.occurred_at IS DISTINCT FROM r.completed_at
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
      AND (CASE WHEN r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' THEN decision_reason::jsonb->>'format'='STANDARD_IMPORT_POINTER_V1' AND decision_reason::jsonb->>'operationId'=r.id::text ELSE decision_reason='DOCUMENT_CONVERSION_V1;CURRENT_EFFECTIVE;ARCHIVE_RESTORE_VERIFIED;BASELINE_COVERAGE_CONFIRMED;NO_REBASELINE;NO_UNRESOLVED_EXCEPTIONS' END))
    OR EXISTS(SELECT 1 FROM naijue_erp.import_record m WHERE m.import_batch_id=next_row.id AND m.status='IMPORTED'
      AND m.target_type IN ('SALES_HEADER','TRANSFER_HEADER') AND NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt anchor
        WHERE anchor.action='MIGRATE_DOCUMENT' AND anchor.target_id=m.target_id
          AND anchor.target_type=CASE m.target_type WHEN 'SALES_HEADER' THEN 'SALES' ELSE 'TRANSFER' END)) THEN
   RAISE EXCEPTION 'conversion publication requires complete ordinary anchors and exact retained approval/archive evidence' USING ERRCODE='23514'; END IF;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.assert_document_migration(operation uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER
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
 IF baseline.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' THEN
  PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
  IF NOT naijue_erp.standard_import_row_intent(expected_type,CASE r.target_type WHEN 'SALES' THEN to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,h)) ELSE to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_header,h)) END) OR baseline.source_name<>b.source_name OR baseline.source_hash<>b.source_hash
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'lines') item CROSS JOIN LATERAL (
     SELECT (h->>'warehouse_id')::uuid warehouse WHERE r.target_type='SALES'
     UNION ALL SELECT (h->>'from_warehouse_id')::uuid WHERE r.target_type='TRANSFER'
     UNION ALL SELECT (h->>'to_warehouse_id')::uuid WHERE r.target_type='TRANSFER') endpoint
     WHERE h->>'status'='APPROVED' AND item->>'is_current'='true' AND (item->>'quantity')::bigint<>0
       AND naijue_erp.standard_inventory_key_proof(endpoint.warehouse,(item->>'sku_id')::uuid)->>'state'='UNKNOWN') THEN
   RAISE EXCEPTION 'STANDARD_MIGRATION_EXPLICIT_ENDPOINT_COVERAGE_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 -- All actual detail identities are mapped once, including zero-quantity lines and
 -- every settlement occurrence; many-to-one SKU aliases remain legal separately.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'lines') item WHERE NOT EXISTS(SELECT 1 FROM naijue_erp.import_record m
   WHERE m.import_batch_id=b.id AND m.status='IMPORTED' AND m.target_type=CASE r.target_type WHEN 'SALES' THEN 'SALES_LINE' ELSE 'TRANSFER_LINE' END
     AND m.source_entity_type=m.target_type AND m.target_id=(item->>'id')::uuid))
  OR (r.target_type='SALES' AND EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'settlements') item WHERE NOT EXISTS(SELECT 1 FROM naijue_erp.import_record m
    WHERE m.import_batch_id=b.id AND m.status='IMPORTED' AND m.target_type='SALES_SETTLEMENT' AND m.source_entity_type=m.target_type AND m.target_id=(item->>'id')::uuid))) THEN
  RAISE EXCEPTION 'migration requires complete stable detail/settlement source mappings' USING ERRCODE='23514'; END IF;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_unified_document() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
DECLARE n jsonb:=to_jsonb(NEW); o jsonb:=to_jsonb(OLD); immutable text[];
BEGIN
 IF EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1') AND NOT naijue_erp.standard_business_ready()
   AND NOT(TG_OP='INSERT' AND naijue_erp.standard_import_row_intent(upper(TG_TABLE_NAME),to_jsonb(NEW))) THEN
  RAISE EXCEPTION 'STANDARD_DOCUMENT_PUBLICATION_REQUIRED_FOR_ALL_COMMANDS' USING ERRCODE='23514'; END IF;
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


-- The runtime role sees no staged document, source proof, balance, or ledger.
-- The finite SECURITY DEFINER API bypasses RLS as its owner, never as the caller.
DO $policies$
DECLARE table_name text; predicate text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['sales_header','sales_line','sales_settlement','transfer_header','transfer_line','inventory_ledger','inventory_balance','import_batch','import_record','operation_receipt','audit_change','runtime_document_number_allocation'] LOOP
  EXECUTE format('ALTER TABLE naijue_erp.%I ENABLE ROW LEVEL SECURITY',table_name);
  predicate:='naijue_erp.standard_business_ready()';
  IF table_name IN ('sales_header','transfer_header') THEN predicate:=predicate||' AND (import_batch_id IS NULL OR EXISTS(SELECT 1 FROM naijue_erp.import_batch b WHERE b.id=import_batch_id AND b.status=''IMPORTED''))';
  ELSIF table_name IN ('sales_line','sales_settlement') THEN predicate:=predicate||' AND EXISTS(SELECT 1 FROM naijue_erp.sales_header h WHERE h.id=sales_id)';
  ELSIF table_name='transfer_line' THEN predicate:=predicate||' AND EXISTS(SELECT 1 FROM naijue_erp.transfer_header h WHERE h.id=transfer_id)'; END IF;
  EXECUTE format('CREATE POLICY standard_published_runtime ON naijue_erp.%I TO erp_unified27_runtime_2393dbc6db9581c2 USING (%s) WITH CHECK (%s)',table_name,predicate,predicate);
 END LOOP;
END $policies$;

-- NEW_EMPTY publication also hides staged master/catalog facts. Authentication
-- sees only the separately provisioned current account-linked staff, never an
-- invented imported USER_ACCOUNT lane. Existing-target adoption is unsupported.
DO $master_policies$
DECLARE table_name text; predicate text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['hall','warehouse','customer','supplier','staff','product_category','color','fit','size','size_group','size_group_member','season','product','sku','barcode_scheme','sku_barcode','product_image','payment_method','payment_account','payment_account_hall'] LOOP
  EXECUTE format('ALTER TABLE naijue_erp.%I ENABLE ROW LEVEL SECURITY',table_name);
  predicate:='naijue_erp.standard_business_ready()';
  IF table_name='staff' THEN predicate:=predicate||' OR (staff.role=''ADMIN'' AND staff.hall_id IS NULL AND staff.employment_status=''在职'' AND EXISTS(SELECT 1 FROM naijue_erp.user_account a WHERE a.staff_id=staff.id AND a.login_enabled AND a.version=1 AND a.auth_version=1 AND a.created_at=a.updated_at))'; END IF;
  EXECUTE format('CREATE POLICY standard_published_master_runtime ON naijue_erp.%I TO erp_unified27_runtime_2393dbc6db9581c2 USING (%s) WITH CHECK (naijue_erp.standard_business_ready())',table_name,predicate);
 END LOOP;
END $master_policies$;

-- Exactly the approved NOLOGIN roles; no login, membership, schema ownership,
-- DDL, trigger control, CREATE, credential seed, or PUBLIC API execute grant.
GRANT USAGE ON SCHEMA naijue_erp TO erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;
DO $acl$
DECLARE function_row record;
BEGIN
 FOR function_row IN SELECT p.oid::regprocedure signature FROM pg_proc p WHERE p.pronamespace='naijue_erp'::regnamespace AND (p.proname LIKE 'standard_%' OR p.proname='assert_standard_import_operation') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2',function_row.signature);
 END LOOP;
END $acl$;
GRANT EXECUTE ON FUNCTION naijue_erp.standard_initialize_current_admin(jsonb,text),naijue_erp.standard_import_status(jsonb,text),naijue_erp.standard_import_inspect_target(jsonb,text) TO erp_unified27_initializer_2393dbc6db9581c2;
GRANT EXECUTE ON FUNCTION naijue_erp.standard_import_master_chunk(jsonb,text),naijue_erp.standard_import_baseline_keys(jsonb,text),naijue_erp.standard_import_document_chunk(jsonb,text),naijue_erp.standard_publish_import(jsonb,text),naijue_erp.standard_import_status(jsonb,text),naijue_erp.standard_import_inspect_target(jsonb,text),naijue_erp.standard_import_verify(jsonb,text) TO erp_unified27_importer_2393dbc6db9581c2;
-- Finite APIs and their forced deferred validators call private proof helpers
-- as their owner. Caller roles get no direct private source/auth/proof EXECUTE.
-- Runtime gets only the four helpers needed by retained ordinary invoker guards.
GRANT EXECUTE ON FUNCTION naijue_erp.standard_inventory_key_id(uuid,uuid),naijue_erp.standard_import_row_intent(text,jsonb),naijue_erp.standard_inventory_key_proof(uuid,uuid),naijue_erp.standard_business_ready() TO erp_unified27_runtime_2393dbc6db9581c2;
GRANT EXECUTE ON FUNCTION naijue_erp.assert_unified_current_actor(uuid,timestamptz,text,uuid,text),naijue_erp.unified_document_snapshot(text,uuid),naijue_erp.unified_sales_header_audit_values(naijue_erp.sales_header),naijue_erp.unified_sales_line_audit_values(naijue_erp.sales_line),naijue_erp.unified_sales_settlement_audit_values(naijue_erp.sales_settlement) TO erp_unified27_runtime_2393dbc6db9581c2;
-- Runtime authentication uses the existing scrypt/session codec; credentials are
-- not package records and the importer has no table grant to create sessions.
GRANT SELECT ON naijue_erp.hall,naijue_erp.warehouse,naijue_erp.customer,naijue_erp.supplier,naijue_erp.staff,naijue_erp.user_account,naijue_erp.product_category,naijue_erp.color,naijue_erp.fit,naijue_erp.size,naijue_erp.size_group,naijue_erp.size_group_member,naijue_erp.season,naijue_erp.product,naijue_erp.sku,naijue_erp.barcode_scheme,naijue_erp.sku_barcode,naijue_erp.product_image,naijue_erp.payment_method,naijue_erp.payment_account,naijue_erp.payment_account_hall TO erp_unified27_runtime_2393dbc6db9581c2;
GRANT SELECT,INSERT,UPDATE ON naijue_erp.auth_session TO erp_unified27_runtime_2393dbc6db9581c2;
GRANT SELECT,INSERT,UPDATE ON naijue_erp.sales_header,naijue_erp.sales_line,naijue_erp.sales_settlement,naijue_erp.transfer_header,naijue_erp.transfer_line,naijue_erp.inventory_balance TO erp_unified27_runtime_2393dbc6db9581c2;
GRANT DELETE ON naijue_erp.sales_settlement TO erp_unified27_runtime_2393dbc6db9581c2;
GRANT SELECT,INSERT ON naijue_erp.inventory_ledger,naijue_erp.operation_receipt,naijue_erp.audit_change TO erp_unified27_runtime_2393dbc6db9581c2;
GRANT SELECT ON naijue_erp.import_batch,naijue_erp.import_record TO erp_unified27_runtime_2393dbc6db9581c2;
GRANT SELECT,INSERT ON naijue_erp.runtime_document_number_allocation TO erp_unified27_runtime_2393dbc6db9581c2;
GRANT USAGE ON SEQUENCE naijue_erp.runtime_sales_document_number_seq,naijue_erp.runtime_transfer_document_number_seq TO erp_unified27_runtime_2393dbc6db9581c2;
-- PostgreSQL row-locking SELECT requires UPDATE on one column. These grants
-- confer row locks, never identity mutation: a finite role-only rejecting trigger
-- closes even no-op UPDATE(id=id). Real non-id UPDATE stays ungranted.
GRANT UPDATE(id) ON naijue_erp.user_account,naijue_erp.staff,naijue_erp.hall,naijue_erp.warehouse,naijue_erp.customer,naijue_erp.payment_account,naijue_erp.payment_method,naijue_erp.product,naijue_erp.sku,naijue_erp.color,naijue_erp.fit,naijue_erp.size,naijue_erp.sku_barcode TO erp_unified27_runtime_2393dbc6db9581c2;
GRANT UPDATE(size_group_id) ON naijue_erp.size_group_member TO erp_unified27_runtime_2393dbc6db9581c2;
GRANT UPDATE(document_id) ON naijue_erp.runtime_document_number_allocation TO erp_unified27_runtime_2393dbc6db9581c2;
GRANT SELECT ON naijue_erp.schema_migration TO erp_unified27_runtime_2393dbc6db9581c2;
DO $row_lock_only$
DECLARE table_name text; identity_column text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['user_account','staff','hall','warehouse','customer','payment_account','payment_method','product','sku','color','fit','size','sku_barcode','size_group_member'] LOOP
  identity_column:=CASE WHEN table_name='size_group_member' THEN 'size_group_id' ELSE 'id' END;
  EXECUTE format('CREATE TRIGGER standard_runtime_reference_lock_only BEFORE UPDATE OF %I ON naijue_erp.%I FOR EACH ROW WHEN (current_setting(''role'')=''erp_unified27_runtime_2393dbc6db9581c2'') EXECUTE FUNCTION naijue_erp.reject_immutable_change()',identity_column,table_name);
 END LOOP;
END $row_lock_only$;
-- Initializer/importer execute only: no direct native/source/audit/stock DML.
DO $final$
BEGIN
 IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='naijue_erp'::regnamespace AND NOT t.tgisinternal)<>227 THEN RAISE EXCEPTION 'STANDARD_TRIGGER_SET_DIFFERS' USING ERRCODE='23514'; END IF;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>168 THEN RAISE EXCEPTION 'STANDARD_ROUTINE_SET_DIFFERS' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2','erp_unified27_runtime_2393dbc6db9581c2') AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN RAISE EXCEPTION 'STANDARD_ROLE_SAFETY_DIFFERS' USING ERRCODE='42501'; END IF;
END $final$;
COMMIT;
