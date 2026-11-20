-- HV2-P04: post-B07+B14 exact133 predecessor, source only, C/T45 executes only on approved isolated target.
BEGIN;
DO $parent$ DECLARE f jsonb; BEGIN
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace AND prokind IN('f','p'))<>133
 THEN RAISE EXCEPTION 'Exact post-B07+B14 predecessor required'; END IF;
 FOR f IN SELECT value FROM jsonb_array_elements($pins$[{"signature":"naijue_erp.assert_barcode_scheme_initialization_v19(uuid,uuid)","sha256":"8d4f7d457403d6c4737e5a9b38d6d4f48c0ef3c5e94dd2e8ff408d3b57a198ca"},{"signature":"naijue_erp.assert_core_initialization_v14(uuid,uuid,boolean)","sha256":"8a8374fb193ed9e5ddcc388b0141a91dc17420cef0baee4ffbb700cd9737add5"},{"signature":"naijue_erp.assert_history_typed_closure(uuid,jsonb,jsonb)","sha256":"8556e917e6a251dd1eb97974fbb6f793d3e46a1ef10f6ef7fd77fb7ad539d00f"},{"signature":"naijue_erp.assert_native_bootstrap_accounts(uuid)","sha256":"171c59ba962a287dd02bb9eac993512e114783a470063108a07ba5e206cbabca"},{"signature":"naijue_erp.assert_native_product_season_source(naijue_erp.import_source_row)","sha256":"3a753b412fa4a648e26c4a2e398a4b52cc694c04dc1352a98513cb2220d4d661"},{"signature":"naijue_erp.assert_retained_sku_reference(uuid)","sha256":"4c956a82b9531b1f385f9aecd9c6d20fa84ce6d434bb0a41d2a0c96ebb7fae5d"},{"signature":"naijue_erp.assign_runtime_document_number()","sha256":"bca336abcd0ef4a57c22d2ee19564e7ea744257303fb8eec06c822efd551500e"},{"signature":"naijue_erp.check_hall_default_customer_enabled()","sha256":"6a89df4342530f3a3bdd185abbdd372b3372799b341a17ae9ad65be86ded91ee"},{"signature":"naijue_erp.cutoff_import_lock()","sha256":"82a621b9cea39c9cc273d5cb790b364fad004875760644633280d2e24e64ccc7"},{"signature":"naijue_erp.exact_historical_customer_source_matches(jsonb,jsonb)","sha256":"ac26aa52f4131d996d6abe0db810a0e0817a12ffa043cdfb2250c951bfd0f011"},{"signature":"naijue_erp.freeze_cutoff_sales_detail()","sha256":"dcfa1a3abb87368cf2f18663880f9a2ea9377a3599e985e13c7241220fd85a12"},{"signature":"naijue_erp.freeze_imported_identity()","sha256":"0a17cf0a670ca8c9d34f2de1ec34de9b5197410fc01f82af4273a26e877a44e5"},{"signature":"naijue_erp.guard_balance_identity()","sha256":"02f2db383ff8c5826c7148f73bb780319c977bffa5798bc233159d83d89e58fc"},{"signature":"naijue_erp.guard_contributor_link()","sha256":"2937ecd3e974e2ad78e0bfce4790b96d97953d4bf113406a838063b366895983"},{"signature":"naijue_erp.guard_cutoff_ledger()","sha256":"71ecb569279de61709578ffe2f29d85140993ed155fce07e7beb797307c491b5"},{"signature":"naijue_erp.guard_exact_historical_customer_current_usage()","sha256":"78e895d72d6f806089d2bc7cb877293e1263d26ba8265dd7f3b5e2203e956245"},{"signature":"naijue_erp.guard_header_native_reference()","sha256":"1584d2600c763f0d38cd3dd4fa7dd14ea90465ef9376d7165a58d71bce0dec3c"},{"signature":"naijue_erp.guard_header_native_reference_publication()","sha256":"3419f73d296fcb84f77eff79edaa5034cb90f33a6363d0687d316ee697f785c0"},{"signature":"naijue_erp.guard_history_closure_stage()","sha256":"d05947c6d7ef430d043c10038cce1d72f7e44e4efb2a2112c499ea8d107d47e0"},{"signature":"naijue_erp.guard_history_insert()","sha256":"98fcf82074f4aaf0712b2af3aca5a12a7e4975933712caffd577e652eca7e12f"},{"signature":"naijue_erp.guard_history_numeric_ledger()","sha256":"b32ccd2af06876d91fe4b33a4e2309a3f79af7d012ddf301ce84b773118e5794"},{"signature":"naijue_erp.guard_history_publication()","sha256":"6ad32797b7fe81e6427b3abec90aca378778be9af30b014b55966fbed0bff77e"},{"signature":"naijue_erp.guard_history_typed_publication()","sha256":"fc386026e40ca43d36bdb5e7422001878a7f91c95c2e36bce28272b4d792e506"},{"signature":"naijue_erp.guard_import_accounting_claim()","sha256":"298996ca170c969aa06df8dfa44219b86a9db0ae4dc1c07f726167a518f62acf"},{"signature":"naijue_erp.guard_import_accounting_publication()","sha256":"b41ad04a99fb7af999c22b13cdc7ad9b747e4df67e3f11bd44e7632d15a747a6"},{"signature":"naijue_erp.guard_import_batch()","sha256":"f0e35d2d5978c92d26c1eab6525a87d2ae3450a525daa14131b479b03856d29a"},{"signature":"naijue_erp.guard_import_record()","sha256":"8a79dbc011cdaf0582e2bd1eefc7ea94fce15d24f6aa1ac0fa25c43afb4e7e16"},{"signature":"naijue_erp.guard_maintenance_account_event()","sha256":"965d9d3433b929ccd151b9a147eeef713770d7b7311e49c80cfaa3d17b118549"},{"signature":"naijue_erp.guard_maintenance_audit_actor()","sha256":"ac0ce9c91f34b9d8d34eb5e7d26f595319bfa6ad3dfe3ae33a4f2f5edf1eb217"},{"signature":"naijue_erp.guard_maintenance_before_root()","sha256":"574add1ad436482c7593725ac4b1b58cabe6b982b538cf0e1f22c1783723712f"},{"signature":"naijue_erp.guard_maintenance_child_write()","sha256":"a19def51718e008e541482dd1e6f2d2ab9257842ce7e66ad6e62aedcfa216d8a"},{"signature":"naijue_erp.guard_native_catalogue_binding()","sha256":"7418579c0d1c3a1951696a12ad165a421d26b87f0e449d9d7d250497dc2ddc21"},{"signature":"naijue_erp.guard_native_catalogue_publication()","sha256":"d2eaa009760d63f245d562570ca4c8fce038633da5233a8c7ab7142190a30ceb"},{"signature":"naijue_erp.guard_native_creation_identity()","sha256":"4827b76ff4df9beae18411033d2e6e13a04eea2d648aa58bb67d179145d107dc"},{"signature":"naijue_erp.guard_native_party_import_intent()","sha256":"262e74a37ba12883a4978c4d99b6ecca000d245186b585a9e5b35ad31ccf8d7f"},{"signature":"naijue_erp.guard_native_payment_binding()","sha256":"774cc9b1604a8d0948f73c7298fa67a10233962af218b89fe0b9675107148d35"},{"signature":"naijue_erp.guard_native_payment_publication()","sha256":"993b114dfbec87428a42a9f6aa7d0a6ecbeef67fd85bc00754fa4eb80c7e6797"},{"signature":"naijue_erp.guard_product_image_color()","sha256":"a49cc6bc4c49931eb50c81dd95e08a760b2ea6de73e19a0496611fe63fe22b18"},{"signature":"naijue_erp.guard_product_season_selection()","sha256":"bd97ac1bc0a8c9a3221c12b794f5976bf0e092a2907aa2dd9e6378b718d29560"},{"signature":"naijue_erp.guard_referenced_season_identity()","sha256":"8eb0b3435f063f4a653c31f632fe6751fecc3864a375a72753bcf4090bb18f2c"},{"signature":"naijue_erp.guard_retained_catalogue_delete()","sha256":"dec785b8b1f818b2daa3af4d3872139710cae32178516839e669f59aa6609758"},{"signature":"naijue_erp.guard_retained_catalogue_reference()","sha256":"91cc169d60ca6db2700ed97e49632504cfba9d957ea467a4777137f946c6923c"},{"signature":"naijue_erp.guard_runtime_document_number()","sha256":"52d92723d9ecb5f16eb57c5ae50e0f8cf322b4b5f3848ab88712f41aeb0887bd"},{"signature":"naijue_erp.guard_successor_publication26()","sha256":"a055abd422ff4d81d0cf87e11cf659dcc221eda1a18b774cd62034c2c3f74c14"},{"signature":"naijue_erp.guard_successor_source26()","sha256":"cdf91a3949d6aefbb16c67f7d82dcf99b60730f9a6884468c064102c9887b710"},{"signature":"naijue_erp.history_closure_count_map(jsonb,text[])","sha256":"ef82c0a7124d288103df38503a849b96aa936289b2ee29166b4f0a6529f476d6"},{"signature":"naijue_erp.history_closure_digest(uuid,text,text,text,uuid,jsonb)","sha256":"749101b8670e32814b875adaaf753da6c50ddcd0860d5ca3ebb000f996f1b63b"},{"signature":"naijue_erp.history_closure_document_rows(uuid,text,uuid,boolean)","sha256":"f8401b06df7815f63f9a83e781961f55725f82246c87d86b7a99a9c19c482ce1"},{"signature":"naijue_erp.history_closure_encode(jsonb,integer)","sha256":"b4ad51b2b17c9248c80de0ead3ae5f50bf5fe887e36597b081ce250a94623a5c"},{"signature":"naijue_erp.history_closure_finish(text,bigint,bytea)","sha256":"94b84af2d05d8a9f34c0135a8c0d70f5b633a9b43e6ec6d2bca8de554e8abac8"},{"signature":"naijue_erp.history_closure_fold(bytea,text)","sha256":"31ed823c127e85537196de072b76077749d939f3241fa53b9f1c76f8fdba9062"},{"signature":"naijue_erp.history_closure_projection(text,jsonb)","sha256":"0af6d70c56a463c351be1dd732d345bbb533ae98b0b07e36f6ef08a4efd72011"},{"signature":"naijue_erp.history_closure_projection_columns(text)","sha256":"a8a3d4d43341d86dfad188d191c3076203e06ea8f1a6919c4d0efddee76286a6"},{"signature":"naijue_erp.history_closure_projection_key(text,jsonb)","sha256":"6e2584dac9f079fe2061570c15b13549a3abac512a2a809835046e6fe2c50222"},{"signature":"naijue_erp.history_closure_row_hash(text,text,jsonb)","sha256":"c7ef0fdc273f23ab5ec1ae6c870746146dab90a6ecef8ecf319de0704df697bb"},{"signature":"naijue_erp.history_closure_rows(uuid)","sha256":"098ba7215c7c893903e2b72762e2036e94bc23b763f3842e378b3d55b3d3f639"},{"signature":"naijue_erp.history_closure_seed(text)","sha256":"532918606a4dd24ebae46a55dfe7d2f0803602798c63742bcd975b7e1179f2c7"},{"signature":"naijue_erp.history_effective_writes_closed()","sha256":"c06027597f11a9cf7f2ae06bf5e47e5c21349b54851fb21df6895ef22a2855b7"},{"signature":"naijue_erp.history_numeric_current_facts(text,uuid)","sha256":"dadecb6cce657834ce3719eb339f56f95dbbf27d6e0a92216940ed91697cadc8"},{"signature":"naijue_erp.history_numeric_money(jsonb,boolean)","sha256":"8c588f3b6145cb1609898dd46e3abfb7b1bd37b3b9318f1863dcfac530ee200b"},{"signature":"naijue_erp.history_revision_not_enabled()","sha256":"581a44ad13d184d594731b7c9ded219a3933fdb8a6c58f2ed63463fdc795ac4f"},{"signature":"naijue_erp.import_source_key_lock(text,text,text)","sha256":"07404b25633a5c48ae1a530a48cdebed11107e187d660c99a7e781bb4957fa24"},{"signature":"naijue_erp.inventory_key_admission(uuid,uuid)","sha256":"a9d7a2519941605e997e5ab59cff7cf847192ed910ef4107ba09aadc64e0fc7a"},{"signature":"naijue_erp.inventory_key_lock(uuid,uuid)","sha256":"c6f444fbbfc527fec7f4031fd0ea7f07eb0a98202b11340e8f7da398fa117079"},{"signature":"naijue_erp.inventory_runtime_key_admitted(uuid,uuid)","sha256":"945a2cc1e250ed1cedd3ca2083b80120174d06d015455bd4288d186e0c27f377"},{"signature":"naijue_erp.is_exact_historical_customer_only(uuid)","sha256":"1f35799a742f402d86cde6a979511dc83ae74d62cd5c106ffcef162a68510403"},{"signature":"naijue_erp.is_native_party_import_insert(text,jsonb)","sha256":"a3c8dfac77e8a4f060932aded92f53da97b68bdcf48d2ede19781c3e54c86412"},{"signature":"naijue_erp.keep_barcode_binding_identity()","sha256":"14f6d02bca58955681e8d03236fb236cbfe3d041d35ecdb326cd3fa7e38d2733"},{"signature":"naijue_erp.keep_party_native_identity()","sha256":"44c3a7110bf40ef38e73972b493f36279b28124097b31a9a6f25e5adc13ad4b9"},{"signature":"naijue_erp.keep_sales_line_owner()","sha256":"95f3dc678bbdc8ac47a2f1c76fe13f872bed088e7484aebc46a523fc13cfd241"},{"signature":"naijue_erp.keep_transfer_header_provenance()","sha256":"68d1af54e61704be47e9fe4097592e812d3f7a910dc2d7190351c2b427267bf6"},{"signature":"naijue_erp.keep_transfer_line_owner()","sha256":"763d52e081f96f872adb50658403f5f2f7f83f7c914d002b0e771ebe9c055335"},{"signature":"naijue_erp.maintenance_account_credential_action(naijue_erp.audit_change,uuid)","sha256":"f17617bc8f02fd0731d0a97eaca90553441235e032de1dbf9086e84c987fbe7a"},{"signature":"naijue_erp.maintenance_action_allowed(text,text)","sha256":"50b2fa0fbf733d7c98b40aa612107a20262cb063852cb3f2cabbefc750742c4a"},{"signature":"naijue_erp.maintenance_administrator_mutex()","sha256":"d6809b2abf7b3f211cd7422b517e867d0c1378f9e7fe9b98eacde2521c6d1ea8"},{"signature":"naijue_erp.maintenance_audit_is_current(uuid)","sha256":"4537d6df2b73e17e386b100845049da08d3fab3584c87ef8d7095660198bf699"},{"signature":"naijue_erp.maintenance_check_account_credential(naijue_erp.audit_change,jsonb,jsonb)","sha256":"577bf0a5de72c8dc6d080c1b4f18a669398d5738c16b75d11ecc1c89d0156ab7"},{"signature":"naijue_erp.maintenance_check_category_order(naijue_erp.audit_change)","sha256":"77c86d2788e88f2922a66c662a91b95c0f76d6ea00587148c36421feabde281e"},{"signature":"naijue_erp.maintenance_check_product_children(naijue_erp.audit_change,boolean)","sha256":"c7edab87301fc05b7f33db2eb9df30b2da0d28ed9154dfa8d11cbba9fdbe6dad"},{"signature":"naijue_erp.maintenance_check_staff_accounts(naijue_erp.audit_change,jsonb,jsonb,boolean)","sha256":"ea4e151ccb89d97ed40edc6e3164594bccda0fc28f2879f614f230830fdc0c22"},{"signature":"naijue_erp.maintenance_complete_row_matches(jsonb,jsonb)","sha256":"34c25d78bc34ed57b1acbbdbfbca9b0adfd78dc8dcb6cc8c42cf5673f5da5d21"},{"signature":"naijue_erp.maintenance_evidence_matches(jsonb,jsonb)","sha256":"cb201d859235d7af9ef52616c64b705e5586b11894d57fbc50b2b0a7615abaf3"},{"signature":"naijue_erp.maintenance_exact_rows_match(jsonb,jsonb,text)","sha256":"8b21824423a27f20074768c09998fba819887c949b4f20b57e35db0815133161"},{"signature":"naijue_erp.maintenance_payment_halls(uuid)","sha256":"d96c975c57af714d458275a383e0e2bdaeef9214d4bc64420207f36bcea55869"},{"signature":"naijue_erp.maintenance_product_child_row(text,uuid,uuid)","sha256":"69145227348d366932814f079f0b63d1bb6109cc36d8bb8c9f8ae53fafd1b9fa"},{"signature":"naijue_erp.maintenance_root_table(text)","sha256":"7ed286cf1e5bb8629b02e7cab4412dc0df502d560661be9823d234c466565fe3"},{"signature":"naijue_erp.maintenance_staff_accounts(uuid)","sha256":"a191dc7b42cec0f41f42c6d371a2e959c90019983f4f79cef86db99d2e8fa989"},{"signature":"naijue_erp.native_creation_operation_valid(text,uuid,uuid)","sha256":"118bbe55c39e00948ab087f808812522b565344b924e64916f6cfa91645a3f7a"},{"signature":"naijue_erp.party_key_values(text,text,boolean,integer)","sha256":"d23eb5601f984007df5d52661a101a422852e20c0bcd75f1cadd5a5bbbaef649"},{"signature":"naijue_erp.published_inventory_key(uuid,uuid)","sha256":"fa8234711ad74b3afd250b2143840baa863f05f1e23c92b85574b48b4208adc6"},{"signature":"naijue_erp.reject_immutable_change()","sha256":"3daef49e525ad973be82350a1551e979198d21ff58f3f1bb92a4f7292e4d038c"},{"signature":"naijue_erp.reject_unimplemented_cutoff_write()","sha256":"2e108a1bd9e9304f63cde9eb8b726c448ebcb2d2b371f8b3a8a41aebb6d21e0a"},{"signature":"naijue_erp.safe_maintenance_evidence(jsonb,integer)","sha256":"4a0d9d21eadf3e839d1d0c23f7efe8a0ef14123dd521a553eefcc7362ab3f927"},{"signature":"naijue_erp.transfer_header_audit_values(naijue_erp.transfer_header)","sha256":"0c92b020490243f55132a5acb15ecee8caca92fb88db5f75e877e2f2430ec8ad"},{"signature":"naijue_erp.transfer_line_audit_values(naijue_erp.transfer_line)","sha256":"ce924832c6a9b4a762ff80e031279273f521e4e17139c7d89a4930004313f49e"},{"signature":"naijue_erp.valid_history_counts(jsonb)","sha256":"6c143e2bf81bcd53e2c9074aa2ab4e1781c746bc7a99bb0064f378f77de80280"},{"signature":"naijue_erp.valid_product_season_ids(uuid[])","sha256":"b6b3932264857c59998025cece6241a4e819b80f9bc72e6bf0ed4e907890cc65"},{"signature":"naijue_erp.validate_available_administrator_commit()","sha256":"3a9a1bea930614761185af90b8591a539b855647974b68b004869c80f5e5ba18"},{"signature":"naijue_erp.validate_baseline_source_commit()","sha256":"ec5e9a331d0f8148ec21e28d5e8a4ddb82ac66d923ea2490abee3f3000ed75c9"},{"signature":"naijue_erp.validate_document_specification_commit()","sha256":"b02bff6115bcf2c87758f8313a57a1a693733ba3ea192fcb1657bd176c587c06"},{"signature":"naijue_erp.validate_exact_historical_customer_intent(naijue_erp.native_party_import_evidence,naijue_erp.import_batch)","sha256":"b9968150e138d455658dd7d437c8026b7bfdce466146b961d64fd2934f099c98"},{"signature":"naijue_erp.validate_exact_native_reversal()","sha256":"3ef72272c6cb9b7ccbfffc393a31fdd85babdb3efb333baae839482d571f362e"},{"signature":"naijue_erp.validate_history_closure_commit()","sha256":"e61d2c5dd34792f5ca277cada1dc12a6904b1be95031c0a6c4810080b24dd03b"},{"signature":"naijue_erp.validate_history_numeric_balance_commit()","sha256":"fab0bf7a3f1681d6034b09dbb5c7ad8efa606c6fa82f24fc101bc5b70636a837"},{"signature":"naijue_erp.validate_history_numeric_receipt_commit()","sha256":"e69f92651dc7a8313e354d47bd4f1ffc1c97fb30aa5c56dcfc49f69511a1d7d6"},{"signature":"naijue_erp.validate_history_numeric_revision_commit()","sha256":"6cc941ed8ea63927fea7f372da6477c5def8e809a8dde1c348d07331ff9be0b6"},{"signature":"naijue_erp.validate_history_product_proofs(uuid)","sha256":"dab49bb495de85d5e66350affd348f85e0595411ea7ab7378104a3963db2a38e"},{"signature":"naijue_erp.validate_import_accounting_baseline_commit()","sha256":"678cc0b409e43e420365733b21ce8e8ce0aa88b8d3b9b48f9a842edd41120c51"},{"signature":"naijue_erp.validate_import_accounting_checkpoint_commit()","sha256":"06ac9742cb16adb281f7610d299ef9dedb61c125038f12be55275760d4a4c0c9"},{"signature":"naijue_erp.validate_import_accounting_claim_commit()","sha256":"ad8e19c3f36b85ebbda107a2ca8e3c00ad10ca3005a232bd033bbab7613be756"},{"signature":"naijue_erp.validate_import_accounting_final_record_commit()","sha256":"f1fca00daa56873221062706d2009293b6180156e69bfe6f5fc1ca64087ea312"},{"signature":"naijue_erp.validate_import_batch_commit()","sha256":"7ce01945fcd6fd68817724cc27d8f135da82ef2f4e3929a8ad5e4cf232310b3b"},{"signature":"naijue_erp.validate_import_operation()","sha256":"73d13792e2a9dde79b239cb2c059a89c5552823503a002ce1b7bdad75aa1b3ff"},{"signature":"naijue_erp.validate_import_publish(uuid,jsonb)","sha256":"873d1943b1ada13eeef43f6d28cb792755de48c461b1ebee7810e5278cd5d6e3"},{"signature":"naijue_erp.validate_import_source_commit()","sha256":"524ec70d51970cfc79f4ec5e9a93f21bf20733781a2202121a4e91d1d6b66f3a"},{"signature":"naijue_erp.validate_ledger_receipt_source()","sha256":"26f2f325172ef2878d4dffb4f1740d680e63458abd4b25e7a693e352664d15da"},{"signature":"naijue_erp.validate_maintenance_receipt_commit()","sha256":"77679e1e21858ae64ac1225660cf7a692f63b097d538254829def8164ea33ac5"},{"signature":"naijue_erp.validate_maintenance_root_commit()","sha256":"002818dfd8d764e99221bb0548da1141054871ae674aba6bb9f6ce59c9d92d1c"},{"signature":"naijue_erp.validate_native_creation_commit()","sha256":"a505ceb68946cc14a69b181cd43d6cebbedca9e9ea453c9920c243892f537cd7"},{"signature":"naijue_erp.validate_native_party_import_commit()","sha256":"5383c9941e06c7748af6603eee56559b102b09305c11771a813c6cf859ad37e3"},{"signature":"naijue_erp.validate_party_native_commit()","sha256":"dba217f39c61d3f4741a72a565851a41caaa18e44fb57aa2f8e3473d20810762"},{"signature":"naijue_erp.validate_party_receipt_commit()","sha256":"fafc3389b3458b6d8ec4cad15f6f926dcc20bb059a819c496ed4db260d06b426"},{"signature":"naijue_erp.validate_sales_commit()","sha256":"f00b31849f4f72d62103fc08cb4e157b4401717a1f2c7c05fc699663715f07a2"},{"signature":"naijue_erp.validate_sales_effect()","sha256":"e6b2bbec00a6389ed92f9026af20f06c52168d37fe5a59d3ccfc0c29fb7cb1db"},{"signature":"naijue_erp.validate_sales_settlement()","sha256":"c0ab9b6a91951a809e5fbfb6c34ed52fb164b76119d58d469d411c0b58e734a3"},{"signature":"naijue_erp.validate_sparse_balance_commit()","sha256":"937b31d7ab0f1e5d8fb7febc26c051690b2df9dc79d451088eff73d75046399d"},{"signature":"naijue_erp.validate_transfer_balance_commit()","sha256":"9bfaa1cdf1dea76ada35bae56dd40cb3e27c6acd28a93905ee2f06d17a8b2abb"},{"signature":"naijue_erp.validate_transfer_commit()","sha256":"e6ceac3fddef4e61f649b8ef2d71db56042dc14c7622ca0a5c321de2ab7b3f38"},{"signature":"naijue_erp.validate_transfer_effect()","sha256":"d901f8e428c9ef2440d9fb48aca3f638eef141bd62f116e88698c6f726ad0c73"},{"signature":"naijue_erp.validate_transfer_header_commit()","sha256":"6d50fa80e2b445bc45645ff0f5592f2ed4e00836077224c1fe3510b4e563fa0c"},{"signature":"naijue_erp.validate_transfer_line_commit()","sha256":"1443f443a884f0073209294476daf9a7ff0f45d6d32832e5d14557d513cfc4fb"},{"signature":"naijue_erp.lock_category_tree_statement()","sha256":"fe2f9bd7ed49d52697cb8a5aab6100bc61f2246c0f8ad02f945a7dbbd4a54834"},{"signature":"naijue_erp.validate_category_final_component()","sha256":"f6eba82eceeaf19ad781500cebcfc5b515f38bf11ed428d41897e909b821a07d"}]$pins$::jsonb) LOOP
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure(f->>'signature')) IS DISTINCT FROM f->>'sha256'
 THEN RAISE EXCEPTION 'P04 predecessor body mismatch'; END IF; END LOOP;
END $parent$;

CREATE OR REPLACE FUNCTION naijue_erp.history_revision_not_enabled() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $body$
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
      IF NOT (NEW.after_facts ? 'responsibleStaffId') THEN
        RAISE EXCEPTION 'Explicit responsible staff fact required' USING ERRCODE='23514';
      ELSIF jsonb_typeof(NEW.after_facts->'responsibleStaffId')='null' THEN
        NULL; -- Approved unknown/clear; never substitute the audit actor.
      ELSIF jsonb_typeof(NEW.after_facts->'responsibleStaffId')='string' THEN
        IF NEW.after_facts->>'responsibleStaffId' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
          RAISE EXCEPTION 'Actual responsible staff UUID required' USING ERRCODE='23514'; END IF;
        PERFORM id FROM naijue_erp.staff WHERE id=(NEW.after_facts->>'responsibleStaffId')::uuid FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Actual responsible staff required' USING ERRCODE='23514'; END IF;
      ELSE
        RAISE EXCEPTION 'Explicit nullable responsible staff required' USING ERRCODE='23514';
      END IF;
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
  FOR old_line,next_line IN
   WITH old_rows AS MATERIALIZED(SELECT value,ordinality FROM jsonb_array_elements(actual->'lines') WITH ORDINALITY),
    next_rows AS MATERIALIZED(SELECT value,ordinality FROM jsonb_array_elements(NEW.after_facts->'lines') WITH ORDINALITY)
   SELECT o.value,n.value FROM old_rows o JOIN next_rows n USING(ordinality) ORDER BY o.ordinality LOOP
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
    FOR old_settlement,next_settlement IN
     WITH old_rows AS MATERIALIZED(SELECT value,ordinality FROM jsonb_array_elements(actual->'settlements') WITH ORDINALITY),
      next_rows AS MATERIALIZED(SELECT value,ordinality FROM jsonb_array_elements(NEW.after_facts->'settlements') WITH ORDINALITY)
     SELECT o.value,n.value FROM old_rows o JOIN next_rows n USING(ordinality) ORDER BY o.ordinality LOOP
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
  FOR effect,old_line,next_line IN
   WITH old_rows AS MATERIALIZED(SELECT value FROM jsonb_array_elements(actual->'lines')),
    next_rows AS MATERIALIZED(SELECT value FROM jsonb_array_elements(NEW.after_facts->'lines')),
    effects AS MATERIALIZED(SELECT value FROM jsonb_array_elements(evidence->'effects'))
   SELECT e.value,o.value,n.value FROM effects e
    LEFT JOIN old_rows o ON o.value->>'lineId'=e.value->>'lineId'
    LEFT JOIN next_rows n ON n.value->>'lineId'=e.value->>'lineId' LOOP
    IF old_line IS NULL OR next_line IS NULL THEN RAISE EXCEPTION 'Original delta line missing' USING ERRCODE='23514'; END IF;
    IF jsonb_typeof(effect) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(effect))<>9
      OR NOT effect ?& ARRAY['lineId','warehouseId','skuId','endpoint','quantityDelta','ledgerEntryId','oldEffect','newEffect','delta']
      OR (effect->>'ledgerEntryId') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Exact bounded delta evidence fields required' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(effect) WHERE jsonb_typeof(value)<>'string') THEN
      RAISE EXCEPTION 'Delta identities and exact numeric evidence must remain strings' USING ERRCODE='23514'; END IF;
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
END $body$;

CREATE OR REPLACE FUNCTION naijue_erp.history_effective_writes_closed() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $body$
DECLARE revision naijue_erp.history_revision%ROWTYPE; value jsonb; previous jsonb; expected jsonb; actual jsonb; parent uuid; target uuid;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Historical effective identities cannot be deleted' USING ERRCODE='23514'; END IF;
  value:=to_jsonb(NEW); IF TG_OP='UPDATE' THEN previous:=to_jsonb(OLD); END IF;
  IF TG_TABLE_NAME IN('history_sales_line_effective','history_transfer_line_effective','history_sales_settlement_effective') THEN
   IF TG_OP='UPDATE' AND (previous->'line_id' IS DISTINCT FROM value->'line_id' OR previous->'settlement_id' IS DISTINCT FROM value->'settlement_id') THEN
    RAISE EXCEPTION 'Historical projection identity is immutable' USING ERRCODE='23514'; END IF;
   RETURN NEW; -- Full same-transaction row facts are checked once by the statement trigger.
  END IF;
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
  ELSIF TG_TABLE_NAME IN('history_sales_line_effective','history_transfer_line_effective','history_sales_settlement_effective') THEN
    IF TG_OP='UPDATE' AND (previous->'line_id' IS DISTINCT FROM value->'line_id' OR previous->'settlement_id' IS DISTINCT FROM value->'settlement_id') THEN
     RAISE EXCEPTION 'Historical projection identity is immutable' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'Unknown historical projection' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $body$;

CREATE FUNCTION naijue_erp.history_effective_set_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,naijue_erp AS $set$
DECLARE invalid boolean;
BEGIN
 WITH revisions AS MATERIALIZED(
  SELECT r.* FROM naijue_erp.history_revision r JOIN(SELECT DISTINCT revision_id FROM history_new) n ON r.id=n.revision_id
  WHERE r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
 ), expected AS MATERIALIZED(
  SELECT r.id revision_id,r.document_kind,r.sales_id,r.transfer_id,e.value
  FROM revisions r CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN TG_TABLE_NAME='history_sales_settlement_effective' THEN r.after_facts->'settlements' ELSE r.after_facts->'lines' END)e(value)
 ), actual AS MATERIALIZED(SELECT to_jsonb(n) value FROM history_new n)
 SELECT EXISTS(SELECT 1 FROM actual a LEFT JOIN expected e
  ON e.revision_id=(a.value->>'revision_id')::uuid
   AND e.value->>CASE WHEN TG_TABLE_NAME='history_sales_settlement_effective' THEN 'settlementId' ELSE 'lineId' END
    =a.value->>CASE WHEN TG_TABLE_NAME='history_sales_settlement_effective' THEN 'settlement_id' ELSE 'line_id' END
  WHERE e.revision_id IS NULL OR CASE TG_TABLE_NAME
   WHEN 'history_sales_line_effective' THEN e.document_kind<>'SALES'
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_line l WHERE l.id=(a.value->>'line_id')::uuid AND l.header_id=e.sales_id)
    OR jsonb_build_object('quantity',(a.value->>'quantity')::bigint::text,'dealPrice',(a.value->>'deal_price')::numeric(18,2)::text,'lineAmount',(a.value->>'line_amount')::numeric(18,2)::text,'allocatedDiscount',CASE WHEN a.value->'allocated_discount'='null'::jsonb THEN NULL ELSE (a.value->>'allocated_discount')::numeric(18,2)::text END) IS DISTINCT FROM e.value-ARRAY['lineId','skuId']
   WHEN 'history_transfer_line_effective' THEN e.document_kind<>'TRANSFER'
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.history_transfer_line l WHERE l.id=(a.value->>'line_id')::uuid AND l.header_id=e.transfer_id)
    OR (a.value->>'quantity')::bigint::text IS DISTINCT FROM e.value->>'quantity'
   WHEN 'history_sales_settlement_effective' THEN e.document_kind<>'SALES'
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_settlement l WHERE l.id=(a.value->>'settlement_id')::uuid AND l.header_id=e.sales_id)
    OR (a.value->>'amount')::numeric(18,2)::text IS DISTINCT FROM e.value->>'amount'
   ELSE true END) INTO invalid;
 IF invalid THEN RAISE EXCEPTION 'Historical projection set differs from original revision facts' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $set$;
CREATE TRIGGER history_sales_line_effective_set_insert AFTER INSERT ON naijue_erp.history_sales_line_effective REFERENCING NEW TABLE AS history_new FOR EACH STATEMENT EXECUTE FUNCTION naijue_erp.history_effective_set_guard();
CREATE TRIGGER history_sales_line_effective_set_update AFTER UPDATE ON naijue_erp.history_sales_line_effective REFERENCING NEW TABLE AS history_new FOR EACH STATEMENT EXECUTE FUNCTION naijue_erp.history_effective_set_guard();
CREATE TRIGGER history_transfer_line_effective_set_insert AFTER INSERT ON naijue_erp.history_transfer_line_effective REFERENCING NEW TABLE AS history_new FOR EACH STATEMENT EXECUTE FUNCTION naijue_erp.history_effective_set_guard();
CREATE TRIGGER history_transfer_line_effective_set_update AFTER UPDATE ON naijue_erp.history_transfer_line_effective REFERENCING NEW TABLE AS history_new FOR EACH STATEMENT EXECUTE FUNCTION naijue_erp.history_effective_set_guard();
CREATE TRIGGER history_sales_settlement_effective_set_insert AFTER INSERT ON naijue_erp.history_sales_settlement_effective REFERENCING NEW TABLE AS history_new FOR EACH STATEMENT EXECUTE FUNCTION naijue_erp.history_effective_set_guard();
CREATE TRIGGER history_sales_settlement_effective_set_update AFTER UPDATE ON naijue_erp.history_sales_settlement_effective REFERENCING NEW TABLE AS history_new FOR EACH STATEMENT EXECUTE FUNCTION naijue_erp.history_effective_set_guard();

CREATE OR REPLACE FUNCTION naijue_erp.guard_history_numeric_ledger() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $body$
DECLARE revision_version integer;
BEGIN
  IF NEW.event_kind<>'HISTORY_REVISION' THEN RETURN NEW; END IF;
  SELECT r.to_version INTO STRICT revision_version FROM naijue_erp.history_revision r WHERE r.id=NEW.source_history_revision_id
    AND r.operation_id=NEW.operation_id AND r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
  IF NEW.source_document_version IS DISTINCT FROM revision_version OR NEW.reverses_entry_id IS NOT NULL OR NEW.source_import_batch_id IS NOT NULL
   OR NEW.source_sales_line_id IS NOT NULL OR NEW.source_transfer_line_id IS NOT NULL THEN
   RAISE EXCEPTION 'Original historical ledger lane required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $body$;

CREATE FUNCTION naijue_erp.history_numeric_ledger_set_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,naijue_erp AS $ledger$
DECLARE invalid boolean;
BEGIN
 WITH revisions AS MATERIALIZED(
  SELECT r.* FROM naijue_erp.history_revision r JOIN(SELECT DISTINCT source_history_revision_id id FROM history_new WHERE event_kind='HISTORY_REVISION') n USING(id)
  WHERE r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
 ), expected AS MATERIALIZED(
  SELECT r.id revision_id,r.operation_id,r.document_kind,r.to_version,r.before_facts->>'businessDate' business_date,r.changed_at,e.value
   FROM revisions r CROSS JOIN LATERAL jsonb_array_elements(r.stock_effect_evidence->'effects')e(value)
 ) SELECT EXISTS(SELECT 1 FROM history_new n LEFT JOIN expected e ON e.revision_id=n.source_history_revision_id AND e.value->>'ledgerEntryId'=n.id::text
  WHERE n.event_kind='HISTORY_REVISION' AND (e.revision_id IS NULL OR n.operation_id IS DISTINCT FROM e.operation_id
   OR n.source_document_version IS DISTINCT FROM e.to_version OR n.business_date::text IS DISTINCT FROM e.business_date OR n.posted_at IS DISTINCT FROM e.changed_at
   OR n.warehouse_id::text IS DISTINCT FROM e.value->>'warehouseId' OR n.sku_id::text IS DISTINCT FROM e.value->>'skuId'
   OR n.endpoint IS DISTINCT FROM e.value->>'endpoint' OR n.quantity_delta::text IS DISTINCT FROM e.value->>'quantityDelta'
   OR (e.document_kind='SALES' AND(n.source_history_sales_line_id::text IS DISTINCT FROM e.value->>'lineId' OR n.source_history_transfer_line_id IS NOT NULL))
   OR (e.document_kind='TRANSFER' AND(n.source_history_transfer_line_id::text IS DISTINCT FROM e.value->>'lineId' OR n.source_history_sales_line_id IS NOT NULL)))) INTO invalid;
 IF invalid THEN RAISE EXCEPTION 'Historical ledger set differs from exact current revision effects' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $ledger$;
CREATE TRIGGER history_numeric_ledger_set_insert AFTER INSERT ON naijue_erp.inventory_ledger
REFERENCING NEW TABLE AS history_new FOR EACH STATEMENT EXECUTE FUNCTION naijue_erp.history_numeric_ledger_set_guard();
-- Original deferred revision/audit/receipt/full-projection/ledger/balance closure remains attached and unchanged.
COMMIT;
