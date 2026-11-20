BEGIN ISOLATION LEVEL READ COMMITTED;
DO $hall165$
DECLARE
 source_model constant jsonb:=$source_routines$[{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.assert_document_conversion_batch(naijue_erp.import_batch,jsonb,text,boolean)","bodySha256":"b310e64b22ee3d58d63e976fe59466064702c6f173abeb6b5911e6da6cd3b472","definitionSha256":"5a17185763412263d0d2d5bb7b83807ae4ac2bf21227f3c775c72373cbe8a8b5"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.assert_document_migration(uuid)","bodySha256":"70afc73645344f522cb4aaedd7934fdcab3bc38e1bbe510862a201e6e35c49ca","definitionSha256":"cd7db579480a32462f43a1fd712a7808cb6f22a1224f8883748e9d8b20bf89b6"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.assert_retained_sku_reference(uuid)","bodySha256":"4c956a82b9531b1f385f9aecd9c6d20fa84ce6d434bb0a41d2a0c96ebb7fae5d","definitionSha256":"569288e1ba7ce3bdd12c2c981cee10a2370da890c080dc9b728701ec563e9b89"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.assert_standard_import_operation(uuid)","bodySha256":"94eb15996fa9090fb8b5cc2cc38e3574c45b3c67acedb1c1d47302687d20a21d","definitionSha256":"331cb648832769c2c3c48afe8dd73ef02a8263faea5d509964d1f2c78a34c320"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.assert_unified_current_actor(uuid,timestamp with time zone,text,uuid,text)","bodySha256":"0a7fd1974200a8145e0e57a351c4f46f85a02636541eccde436196fccadc4731","definitionSha256":"0d1475413a58da0c99b018d82aace6996bde4c9027f5464d507cae267385a5ce"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.assign_runtime_document_number()","bodySha256":"bca336abcd0ef4a57c22d2ee19564e7ea744257303fb8eec06c822efd551500e","definitionSha256":"58996ce23d8f0be25f4a2ad6d7e08eb44fc2ceb61ebadb0dfe811488db212893"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.check_hall_default_customer_enabled()","bodySha256":"6a89df4342530f3a3bdd185abbdd372b3372799b341a17ae9ad65be86ded91ee","definitionSha256":"ba08e3e7b6d275dea1ec540332eb40852bf0685c0c1b254aaa2e2001e5c50a3b"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.cutoff_import_lock()","bodySha256":"82a621b9cea39c9cc273d5cb790b364fad004875760644633280d2e24e64ccc7","definitionSha256":"acfed1107b87476233cda6ad873d3e44590225127bb4289a794a60587be7b62a"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.exact_historical_customer_source_matches(jsonb,jsonb)","bodySha256":"ac26aa52f4131d996d6abe0db810a0e0817a12ffa043cdfb2250c951bfd0f011","definitionSha256":"d4991697536980f870327494ff6d54f2dd9aecbaf5eba8a9fdff6f854b41ea15"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.freeze_cutoff_sales_detail()","bodySha256":"eb20d59095a3b407870735af5ad574ec7c1e8801311278392ef9547de1af719b","definitionSha256":"db6774caa299763fe6c2090eb0be134f012238395cc5a26a7e24e6f2d464bde4"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.freeze_imported_identity()","bodySha256":"0a17cf0a670ca8c9d34f2de1ec34de9b5197410fc01f82af4273a26e877a44e5","definitionSha256":"d9c778c91c12a115f8cfb6bc969fecd87a399061014cc75a3fa6ea390b933bad"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_balance_identity()","bodySha256":"02f2db383ff8c5826c7148f73bb780319c977bffa5798bc233159d83d89e58fc","definitionSha256":"88af4327a05f5d05b4043f4f32eb4b6565229dd15dd4dc80ffbb304ae9b6b47a"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_contributor_link()","bodySha256":"2937ecd3e974e2ad78e0bfce4790b96d97953d4bf113406a838063b366895983","definitionSha256":"3592206b4fad8876eb93d090c476a375228a0b3c10cf9984f46a376c66bb5712"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_cutoff_ledger()","bodySha256":"6b1119b4feaf986c15ffd302e3b832fa1bc9df103d34c5257cb7a16792013fc4","definitionSha256":"404337fa0971ba3adcae0a0eca2ac8e21090905a2463a95f6a918c3d2227678c"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_exact_historical_customer_current_usage()","bodySha256":"78e895d72d6f806089d2bc7cb877293e1263d26ba8265dd7f3b5e2203e956245","definitionSha256":"961d891f7c1c247006beb6a11bf2b2614da8a4c8263ffe3e9403ead66bede9ea"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_header_native_reference_publication()","bodySha256":"63c0f37c67c61b00681b1ee1146750f28e359309795ae266c62140edecf5ee0c","definitionSha256":"6a30edb645529461728e0889e5861d3f398e1f2822debe3960e42dd3de8382f4"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_history_numeric_ledger()","bodySha256":"32d766968972c01675d0aad91d554d7f726086f88a3fcee7d168e2d6ab09bb8e","definitionSha256":"049b0259a50bb575090038f1e8e80805f2a01bd7d79ecb88a8d4471c09d42f6e"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_history_publication()","bodySha256":"9df5c2973589aac649c7bab9be331fb02ea21c0ef851ef30857ae652e8646fc6","definitionSha256":"f82a0a8c82018259447ee20f6bf881e7197c57f3477692608f1547e042a1f754"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_history_typed_publication()","bodySha256":"79eccd51ec346950c9a93cd14314b6eab8c8ae576f7d17a2430131db4ea98648","definitionSha256":"89ebc7b8c9196975f9eb5065a43750394946c59334ea358714896992283f843c"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_import_accounting_publication()","bodySha256":"9df5c2973589aac649c7bab9be331fb02ea21c0ef851ef30857ae652e8646fc6","definitionSha256":"ff29a40ba4351cc90833f04b2a0f13754604a46bbd5ed8667858b889534c6943"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_import_batch()","bodySha256":"b22fb07f37a04ef8ae7c03df0780c0025588947ce85693bd49a3c53f34c4d702","definitionSha256":"ca79bf25ee27cd7956137365acde543e5b34b6f4ac7f53629896d5cf91ed3f03"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_import_record()","bodySha256":"da69cd96c48c1caf1c6afffca1ed267da2a2943b2e06d4d68a650a5a53b413e4","definitionSha256":"144b795f9e06a9d55c9651e52e78cf793e192680e3be4e079e788b035a45aeb9"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_maintenance_account_event()","bodySha256":"965d9d3433b929ccd151b9a147eeef713770d7b7311e49c80cfaa3d17b118549","definitionSha256":"056aeb6dabe60dd5a37d2ebc412453b618a340b6ea01c33bae0116b1b24d11e1"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_maintenance_audit_actor()","bodySha256":"1635b883d65abb3938b277287ff7b0b1bf28cdae367b54b282b3e81810486e89","definitionSha256":"2c36c4e0a6409e47375edec798b97985790250cb96d70635f1d86a2a7d654f93"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_maintenance_before_root()","bodySha256":"76d30c01785877cfab4bb2bf167e1cdcd583677d204b7d7efa0c2cc2c79fa05c","definitionSha256":"b0180f6eb1276704bfa73dcf68d89b973a65416e8a78914915382535ef97353a"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_maintenance_child_write()","bodySha256":"ceef464210d22280de7bc92ed900eebd3156ec65089ecdd8c55bbaca9c975d95","definitionSha256":"1f18ce1667a4ac6fa5de827cc03a52653eeb98cb85b5bf688e6c74b981a95638"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_native_catalogue_publication()","bodySha256":"63c0f37c67c61b00681b1ee1146750f28e359309795ae266c62140edecf5ee0c","definitionSha256":"a75e4100d568e2eb08791f1171cb82f2d9236d5d94496c691566d8aee3633862"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_native_creation_identity()","bodySha256":"765f060da0e51a0a18309502a412cc2196dcde633c3e9db0cbe4a2b6383d5111","definitionSha256":"b9f96235cd42f3ae41c887bfd42b8f90a43f1fb000f5766f17917b51497f7e58"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_native_payment_publication()","bodySha256":"63c0f37c67c61b00681b1ee1146750f28e359309795ae266c62140edecf5ee0c","definitionSha256":"0997832631767c076dc40e5dc6a5a592eaf5fd1e983f8d9265aa60e862c6d9bb"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_product_image_color()","bodySha256":"a49cc6bc4c49931eb50c81dd95e08a760b2ea6de73e19a0496611fe63fe22b18","definitionSha256":"0d22b1669e5cb047baf135f76e8f4dc1ed903c2cb403be1f2e1f48e9f6bc3c0f"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_product_season_selection()","bodySha256":"13b4d3e38dd2ebac9a2f5fa567538850e55651ef1c89190ecd4fd4e8f706cf67","definitionSha256":"3b1a6bdf8d3906d51bbb71d9d8a9743ae8336b5b6e112ecc6d999e6918ab3e65"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_recorded_live_balance_pair()","bodySha256":"5c27c87037c8333d7c4ff7a57eb08896b4230653b6d0c58f11e6e875333c7b0e","definitionSha256":"843c8de6b42ba3f3d2d8b39c64f2188cd998c1a1e596522b4ba6d9ee72715b80"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_referenced_season_identity()","bodySha256":"8eb0b3435f063f4a653c31f632fe6751fecc3864a375a72753bcf4090bb18f2c","definitionSha256":"84acf2f88a392b36b76267ed6ef5edc7d5983f9eaf73f29eb2222afafa7ee514"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_retained_catalogue_delete()","bodySha256":"dec785b8b1f818b2daa3af4d3872139710cae32178516839e669f59aa6609758","definitionSha256":"ff0d2456e1a92c2de7e15022e98babdc7002050c5c3fbce9e71231b60eb9fb06"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_retained_catalogue_reference()","bodySha256":"91cc169d60ca6db2700ed97e49632504cfba9d957ea467a4777137f946c6923c","definitionSha256":"afb27ec49d16bed1b578f8bb06f6177e03d863e49d90da82bcc763f8eb131172"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_retained_settlement_identity()","bodySha256":"73bde63d2dd84da3c5ad491f2b073344c2c6639e667f443f622c5b8d5ed006f6","definitionSha256":"befbc1503368eb77a3779146702ccccd4215e22765443e3b399d232c40cd8a45"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_runtime_document_number()","bodySha256":"52d92723d9ecb5f16eb57c5ae50e0f8cf322b4b5f3848ab88712f41aeb0887bd","definitionSha256":"e7036841a78af7d3ccd8d6a7e1c479cbdb1e47bd075ed21fa4516283af5e1ace"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_successor_publication26()","bodySha256":"1e734c202880c5f72cf54f60846334dd7d61a81f48512b6808d54dd789ea1f6f","definitionSha256":"e78f95935316138e5dac7a37d086aff105969aa622d6d09b804fe717ad81f893"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_unified_document()","bodySha256":"ff462d6a8a30eadea0d98991818cf15c9fd907db0d00956b3be51193846d3e83","definitionSha256":"7b36532a420abb426faf88323f7abe73e6d68b170f349c3456c81564549042a4"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_unified_sales_customer_reference()","bodySha256":"d8b2cfcba9d8ea3d1169074958afb43a425b234efae6dc4574606899970a59e3","definitionSha256":"9b6058b8053c21e5b5a3fc47f22447b69038f80e95244dcce35cfab288d32e70"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_closure_count_map(jsonb,text[])","bodySha256":"ef82c0a7124d288103df38503a849b96aa936289b2ee29166b4f0a6529f476d6","definitionSha256":"2b7a03e1b6e376b38d76982bb54d734f80b20a5ca2c00d567bca727ea36087d4"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_closure_encode(jsonb,integer)","bodySha256":"b4ad51b2b17c9248c80de0ead3ae5f50bf5fe887e36597b081ce250a94623a5c","definitionSha256":"85e6630cddf1cc7f8b95731539b303c2098d5ef9b0cbdc8cf5e375054b2f51e2"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_closure_finish(text,bigint,bytea)","bodySha256":"94b84af2d05d8a9f34c0135a8c0d70f5b633a9b43e6ec6d2bca8de554e8abac8","definitionSha256":"18676e9757bb08c80f8984f0d27867bdcdc24f714cdd90f165a98e4ed63405d0"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_closure_fold(bytea,text)","bodySha256":"31ed823c127e85537196de072b76077749d939f3241fa53b9f1c76f8fdba9062","definitionSha256":"675a58a5bbb094bcb5a1a1f5ffc38fa0ef566cb38461d2a5ddc07bbfc9ce0ddd"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_closure_projection(text,jsonb)","bodySha256":"0af6d70c56a463c351be1dd732d345bbb533ae98b0b07e36f6ef08a4efd72011","definitionSha256":"586a02648d7f5dfa760def405b7b113e4abe23a770daf84ce7e97830d5d35c05"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_closure_projection_columns(text)","bodySha256":"a8a3d4d43341d86dfad188d191c3076203e06ea8f1a6919c4d0efddee76286a6","definitionSha256":"490be4b72b381095a318f0c04dfe2cd290c077497688cc971e53092e5dbcda27"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_closure_projection_key(text,jsonb)","bodySha256":"6e2584dac9f079fe2061570c15b13549a3abac512a2a809835046e6fe2c50222","definitionSha256":"42d8ad2630778708fbd87787d5c8b0aca7daef93827baa0275f6cdb58257f80f"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_closure_row_hash(text,text,jsonb)","bodySha256":"c7ef0fdc273f23ab5ec1ae6c870746146dab90a6ecef8ecf319de0704df697bb","definitionSha256":"9ad3bd6273dcefaec0b37b0386cf9d9c88894f84433a2d6ba1e6349af27f44c6"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_closure_seed(text)","bodySha256":"532918606a4dd24ebae46a55dfe7d2f0803602798c63742bcd975b7e1179f2c7","definitionSha256":"f796d7757c12b8337e57adb5d4fce522cc17b50994f8e5f8d1a39af6cf0036ad"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_numeric_ledger_set_guard()","bodySha256":"661cd72f1df3a14d2fafa67ce1b1912657942ce9d670d0f8b1ea55f46200cd87","definitionSha256":"06ef2855ba8a943dc1d3301b38247e0b99af90098bfba4f1cea1ac3cd5f2bc11"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_numeric_money(jsonb,boolean)","bodySha256":"8c588f3b6145cb1609898dd46e3abfb7b1bd37b3b9318f1863dcfac530ee200b","definitionSha256":"9c148e18932d5679b42c33b826d16fe97761f2b0af9dac8779640305e72f86d7"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.import_source_key_lock(text,text,text)","bodySha256":"07404b25633a5c48ae1a530a48cdebed11107e187d660c99a7e781bb4957fa24","definitionSha256":"563985bbfe4c59594b767d3591cd5860468d5431cf4464573c80efb23233c275"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.inventory_key_admission(uuid,uuid)","bodySha256":"1b065e414d835954bdc9d28239b33612e806665880dc2434a2309fbc539b7b43","definitionSha256":"f629ed1c2d2388ddcd3838ccd7358c2bd7461f0b210d8ca5954cd89eed34e1a6"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.inventory_key_lock(uuid,uuid)","bodySha256":"c6f444fbbfc527fec7f4031fd0ea7f07eb0a98202b11340e8f7da398fa117079","definitionSha256":"17c21e8982e4668b4d6a3cd08de1d769c0189e76745490163ec22af6e4b77f98"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.inventory_runtime_key_admitted(uuid,uuid)","bodySha256":"945a2cc1e250ed1cedd3ca2083b80120174d06d015455bd4288d186e0c27f377","definitionSha256":"4d52e9aa232fe55fcf0834730defa932849452b80f5b45b860824e3b6c43db46"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.is_exact_historical_customer_only(uuid)","bodySha256":"8b3985b2e5e7f1db46b2a4a8c632acef1d10ec230bcca9e11ff538dae3965e7f","definitionSha256":"c5ac2c159ef291f80c16af6a06f85476c1755041ef70c645c471ee0424adce2a"},{"acl":["=X/erp35_owner_20261110_r3","erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.is_native_party_import_insert(text,jsonb)","bodySha256":"dfd1e1ca585e405b6314051578f4cc6218344e9dcdd599f188368165e41a4ffa","definitionSha256":"c46f68dfab23f61a7992b9be8c9b126d176dab3c245daf1c030a2735df46ee56"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.keep_barcode_binding_identity()","bodySha256":"14f6d02bca58955681e8d03236fb236cbfe3d041d35ecdb326cd3fa7e38d2733","definitionSha256":"adcedaddf94944b2408ecb9233e258d7d0ae95fcb23788539ef489b0777a6c6a"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.keep_party_native_identity()","bodySha256":"44c3a7110bf40ef38e73972b493f36279b28124097b31a9a6f25e5adc13ad4b9","definitionSha256":"56337106d8922056edc525f6460ae8912a025aa9802bcead1ea59442ba6beb0c"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.keep_sales_line_owner()","bodySha256":"95f3dc678bbdc8ac47a2f1c76fe13f872bed088e7484aebc46a523fc13cfd241","definitionSha256":"6ad66c9604b87a44584af533d7cbb1309c5c549db372e652de70dff0e5cf46ab"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.keep_transfer_header_provenance()","bodySha256":"68d1af54e61704be47e9fe4097592e812d3f7a910dc2d7190351c2b427267bf6","definitionSha256":"5f30518687ed0f26f22a25cae1f807668cff8ff3b1df8fd57634433e3db67c87"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.keep_transfer_line_owner()","bodySha256":"763d52e081f96f872adb50658403f5f2f7f83f7c914d002b0e771ebe9c055335","definitionSha256":"d0beaa0f1dd4220fe2be52a4f6d23eb311dcbebd253fdf12c350350a6596bd3c"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.lock_category_tree_statement()","bodySha256":"fe2f9bd7ed49d52697cb8a5aab6100bc61f2246c0f8ad02f945a7dbbd4a54834","definitionSha256":"52d6517ea163cd3218df0afb11a138712082df024b85c381d046ef99cba33eb0"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_account_credential_action(naijue_erp.audit_change,uuid)","bodySha256":"f17617bc8f02fd0731d0a97eaca90553441235e032de1dbf9086e84c987fbe7a","definitionSha256":"c0f1279988596da886a5a5521176dac0713d105c3716b777467486d7ab2dd3c3"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_action_allowed(text,text)","bodySha256":"50b2fa0fbf733d7c98b40aa612107a20262cb063852cb3f2cabbefc750742c4a","definitionSha256":"330ab20403dc85ce05996723bcf2b4d9adab0dcf67032dbd20a334a6e4b2f0e2"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_administrator_mutex()","bodySha256":"d6809b2abf7b3f211cd7422b517e867d0c1378f9e7fe9b98eacde2521c6d1ea8","definitionSha256":"91502ad2b6a16e92a30a10de1affe2b664161eb62c9441da82eda84b176bbc4b"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_audit_is_current(uuid)","bodySha256":"4537d6df2b73e17e386b100845049da08d3fab3584c87ef8d7095660198bf699","definitionSha256":"b0f899e6016c5abf4d2d37cd331ca1d49f83e6bf725702cababd9f76276494c3"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_check_account_credential(naijue_erp.audit_change,jsonb,jsonb)","bodySha256":"577bf0a5de72c8dc6d080c1b4f18a669398d5738c16b75d11ecc1c89d0156ab7","definitionSha256":"1f496cabd064a550b8e3408688561708101328813dd0288f12b66b201ee2cf1d"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_check_category_order(naijue_erp.audit_change)","bodySha256":"77c86d2788e88f2922a66c662a91b95c0f76d6ea00587148c36421feabde281e","definitionSha256":"55ae51ceb89b48f1bcfec1132cc70904683967a4da4735dff799b2f34c172414"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_check_product_children(naijue_erp.audit_change,boolean)","bodySha256":"c7edab87301fc05b7f33db2eb9df30b2da0d28ed9154dfa8d11cbba9fdbe6dad","definitionSha256":"f50388ccc03afbf91d084ed762f404d33b0db25d052674fee5a055a0174f5657"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_check_staff_accounts(naijue_erp.audit_change,jsonb,jsonb,boolean)","bodySha256":"ea4e151ccb89d97ed40edc6e3164594bccda0fc28f2879f614f230830fdc0c22","definitionSha256":"ea03918d24a74dc36ed815c2ea2b1b6a896c981beceade83c9d5ccb1d1a27f94"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_complete_row_matches(jsonb,jsonb)","bodySha256":"34c25d78bc34ed57b1acbbdbfbca9b0adfd78dc8dcb6cc8c42cf5673f5da5d21","definitionSha256":"c3222e301339286298c02a3a3be4a87c4542773b2d43ac7483bfa301e3d5d502"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_evidence_matches(jsonb,jsonb)","bodySha256":"cb201d859235d7af9ef52616c64b705e5586b11894d57fbc50b2b0a7615abaf3","definitionSha256":"e57b18261ba8ea8bad14f459e4f67ecab3136983fe0ae2e27d3262200bd5d5d2"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_exact_rows_match(jsonb,jsonb,text)","bodySha256":"8b21824423a27f20074768c09998fba819887c949b4f20b57e35db0815133161","definitionSha256":"1608f489850381897e8bbfccf8beaeeee411e071d55bb911e6ca4fbf449be970"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_payment_halls(uuid)","bodySha256":"d96c975c57af714d458275a383e0e2bdaeef9214d4bc64420207f36bcea55869","definitionSha256":"4194ad6410b9fefda6ba8509bd91b1e2098ecbeb2046a36f82598a2743188c14"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_product_child_row(text,uuid,uuid)","bodySha256":"69145227348d366932814f079f0b63d1bb6109cc36d8bb8c9f8ae53fafd1b9fa","definitionSha256":"21433b9057732eff1ccc83257a3c904fdcab4117010ed6a4fa44d1e859ba8380"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_root_table(text)","bodySha256":"7ed286cf1e5bb8629b02e7cab4412dc0df502d560661be9823d234c466565fe3","definitionSha256":"7f1cdfcedabdeaa91a47233853a1bf5ab9aeebc9898fcb6b49bf9a566e515216"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_staff_accounts(uuid)","bodySha256":"a191dc7b42cec0f41f42c6d371a2e959c90019983f4f79cef86db99d2e8fa989","definitionSha256":"ca3e3dffcc0eed42614e0bb1936ee8cf0ca94b722d95c83c485d799b0dbd0c1d"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.native_creation_operation_valid(text,uuid,uuid)","bodySha256":"ba468f303b532cae64a55c5e11b3f8c1416c6d4b3e84d918a97accd103e86d80","definitionSha256":"6c9c7638c2554b8b203c18fc689494817cc019ce9cce9af862220d83542d6a98"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.party_key_values(text,text,boolean,integer)","bodySha256":"d23eb5601f984007df5d52661a101a422852e20c0bcd75f1cadd5a5bbbaef649","definitionSha256":"1c17f6d44c800c37fa686710a6d72ef97eaafe0030632a53318ce3ff09a42664"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.published_inventory_key(uuid,uuid)","bodySha256":"2e303f71e2149d2216a3dbea86aafb347d43f6a4dfd87d4374804a722da3e2e0","definitionSha256":"2aa3ccf44c60bd2c6e37d655d1b32bcc66086e73c766221afcceafabbcafdfc3"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.reject_document_runtime_reference_id_update_v1()","bodySha256":"c7eeff622fa4921991bae5b65c865402b3dbc3ee3fb310beafdf12b28dfddea6","definitionSha256":"a94b17b01d1f6b3a3d6f97a73f6585eaae4592472c2b8d153d37062818d1a136"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.reject_immutable_change()","bodySha256":"3daef49e525ad973be82350a1551e979198d21ff58f3f1bb92a4f7292e4d038c","definitionSha256":"7caa730f4d1fc3ec363d541308d230da0b812168e333841f9c3f5271d0fc5176"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.reject_unimplemented_cutoff_write()","bodySha256":"2e108a1bd9e9304f63cde9eb8b726c448ebcb2d2b371f8b3a8a41aebb6d21e0a","definitionSha256":"f6ab1ef7c3c1c63755a95f8e9c94e78f236a5da6f2f6b49db0d95149b8da283c"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.safe_maintenance_evidence(jsonb,integer)","bodySha256":"4a0d9d21eadf3e839d1d0c23f7efe8a0ef14123dd521a553eefcc7362ab3f927","definitionSha256":"db198e40404d5f7226dae8af472d9d87b25fd5ed991e333f653e4034072bfa2d"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_initializer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_admin_provision_only_v1(jsonb,text)","bodySha256":"246d52606496638e803430db93402f0fabb5ac4233ada0e42010c04a1ce94453","definitionSha256":"c7a98e1cba04d7e37e0fac81da2953a5e5585e311b1d74a572018574abb10bf6"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_admin_provision_proof_v1(uuid,text,jsonb,boolean)","bodySha256":"d2ca61c2a3051b2bf9d3f242836e594b13ad37486e73f14e4bcf78c514793dc3","definitionSha256":"2de72df0d88b84255387c36b2f0f088900afd1818012003dadcd902680371146"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_business_ready()","bodySha256":"4f6893cc5ef4bbee1bd74d08435763fb3bfabf7dc5888ee72f03cf3387e412db","definitionSha256":"e71cbabcc0946d2a6c32b588166caaa6efe6f5a80fea8e1bb5a7019eb5a6a75f"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_baseline_keys(jsonb,text)","bodySha256":"a845e4994144692495f51927edc6fed638102cd9712ea8cea89e540585a0a452","definitionSha256":"19ab95eef7cacd0b1001a9a6892dc72fa63738d56ba316e4864d0c06672ef041"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_command(jsonb,text,text)","bodySha256":"7874ce87039cdc09115916bfd31ee55e6f0c52f42b68f37744e2e37d0914c1e0","definitionSha256":"a6bc495d1e2c5723ec1344d1507b29ee2a9aced947e97abd2a4959cdbd87f429"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_document_chunk(jsonb,text)","bodySha256":"2998782c615aebe3bd93db1e93c44cf63c3a4a5887ea88455497f93b9b6b43f0","definitionSha256":"9ce4de073ebf6045aadaec2bc2d25b0e6d5bced47599ca16914b80d72e9c58a7"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_identity(text,text)","bodySha256":"beed603f4022389da9e3bd4dd9c6e3422549e0aa70f20301df3cd09376cff423","definitionSha256":"5181d6b5b4cac03807950b57f338cd570e8b34c5863c0109931278218ab97511"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_inspect_target(jsonb,text)","bodySha256":"72e0c3c175f0d14aed324d3d926b38b6ac05ab4ead5e77d354de6ac04128d780","definitionSha256":"0a351de3018bffc409dbbef8a4a763f48ada73372583356371563f74cc471c34"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_master_chunk(jsonb,text)","bodySha256":"882112434e9a177ffb653a6d9c871b9ed81089e05a05228dfdc535ec9aca7813","definitionSha256":"7a08f54c6d6b0f2b838be7a97879d95ab4da1a2715a9d110b5983b3468f5e2cd"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_record_proof(uuid)","bodySha256":"a65b8d9360b782fcb291cee9c679416ec4355fd7bc467ae952cb5febe15a6566","definitionSha256":"1813f5bc1da1f7b5e7d03717d193cf136e45712accd6267cb21bc27b1b7d57b8"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_row_intent(text,jsonb)","bodySha256":"5933c1461819a212de6cfd9a4f6437506bce9d7eb4bf38243c0e3a8e12461baa","definitionSha256":"3e34ff7a47193dccd7ace35419ff4fdbcd0b79880a88bec22e573f653d6b3227"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_status(jsonb,text)","bodySha256":"9f675ee08ffe1c314e1ea2e8ad89ff26c80ed1219ab6dcac0d1c5c839639d013","definitionSha256":"9f0325fc4cb1ead377febe871fa6ba47ac74e043987bd84ba804f8498e33eb83"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_verify(jsonb,text)","bodySha256":"5ab152bdedb516e2994f1b4201c4803ce837f7b096848c3651ad88ac052c23af","definitionSha256":"1dec90885f4328bc21d167aa1d4c71246f179e64e4d68b1087fe460c20c176c0"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_initialize_current_admin(jsonb,text)","bodySha256":"3f8fe4ed7e9bcfc9e239581654845ec2cf1f629aaa9fa732b855f6dd621f96e1","definitionSha256":"43ca26ff3115df0bbf40c0e6df04b14ec44ed1ec02e030279aade25d2ac6e786"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_inventory_key_id(uuid,uuid)","bodySha256":"370852266a17d0c3797b1fb5d704c281c4418a99c3be0faf1bd7796ed7815720","definitionSha256":"d0ce596e3b20f7b8c4b43e3207b34a2b8de604c55b0aa74f6bd85fa074110164"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_inventory_key_proof(uuid,uuid)","bodySha256":"5ae5a016a2ca63d7fdb1c4fcdf7578bf39e6bfc509c5d80b8ca009ef7f64b677","definitionSha256":"0bdde56b6e9f2ff87d78a75c761c480868447dd256b2744c656f7e33d0e5f9d3"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_publish_import(jsonb,text)","bodySha256":"909b62e40c7e57db0a04f7f18a856c967c63cb3ed097f37179060888470a2ca7","definitionSha256":"bc3b34d0c9a39bdcb70f28d1ba2e199b085307b6cbf38c913367e6f3f427891a"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_closed_v2(uuid)","bodySha256":"68466068bb35b64ea72645fbce8086153bcd9c52c8c64ceb2ecc642b9106b9ea","definitionSha256":"f987f9482748644391e6576fd9182e6145daa2e1691b1a2b62548fd882a10678"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)","bodySha256":"691ffc7ed56d358d840fcbe3d07398985581445875e75e243b439bf4730919b3","definitionSha256":"96928fad2da0372b934cf3556dab3419cb3c37cd5684f6f4845c0829a1d3f1f6"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_context_v2(uuid)","bodySha256":"672efa05ef1a0665e2c0f429a86a102bc62f3eb7f61ef71a9f4532337fff86c6","definitionSha256":"d93ccfc8d73cfc6e1a614bc263c90f4f096b3cf530a9a8e6b71644d937804e30"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_importer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_finish_v2(uuid)","bodySha256":"c20f8bc1c90f38157eb51ef13f710e632e2aae14eb37473655c58151ca9214b9","definitionSha256":"481b1c7e32dc988db3acde44b086df2b0b6755edba10d7b2204dd094d77ed8f3"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_initializer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_inspect_v2(jsonb,text)","bodySha256":"9f6a685206405c0e5b3275d9a14621a88d6815c790dde422fa7803d889d93fd5","definitionSha256":"35d16b4c33c029b59db184868abe2a1facea7c8d3517638c06f7768719fb4708"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_initializer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_prepare_v2(jsonb,text)","bodySha256":"57d682fb7066de41287b6bf03d6c430cc89572c413a8aba02a7ac81a4e3c84a1","definitionSha256":"ef774fdfed8f5d0e0b0a9ca7a37192240ff65c725ae76bd9213f62fd707cfcd2"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_importer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_step_v2(uuid,integer,text,jsonb)","bodySha256":"3586857822aa74df1ce60cf1de0fd660263919b4944379f337e3352b6603069c","definitionSha256":"812ec38e92fe458475628a3cd3f5a41e01d8917cf913bacfb8a2ce9613bef865"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_validate_context_v2(uuid,boolean)","bodySha256":"1921cdcda04b78f6bb37a30565a2b0798c4f575594af5df145e55df3c7648003","definitionSha256":"1152bfe1caf3e6366406f80af2ada9f27f80fcf8a282d45210f0ad47a860d94d"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_initializer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_verify_v2(jsonb,text)","bodySha256":"005f47f4925a9d4118d7dcc461a42fe2568a4cddd21b2e73f28bae18ba5892ee","definitionSha256":"5433d23324c4f4d999d086f22759363232ae5484de5591f0969dd37ede2b858c"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_importer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_zero_amount_archive_trace(uuid)","bodySha256":"f45ff8ef2c47db7e049178c04e48379bed1e2975f88a084b335e6c26ac856782","definitionSha256":"cf893014b78bd902da0e6d438e4699a6947618a05db9c501346bcb70a625cc40"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.transfer_header_audit_values(naijue_erp.transfer_header)","bodySha256":"f3795ec8bb218f81d9f274f794796584d1dd86ee3a2c841dd1cab95b11db6852","definitionSha256":"e985ac45a3e06f38a82ee594a5cb9faa8b0b74914d8a05f9e777f3996aa2aeac"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.transfer_line_audit_values(naijue_erp.transfer_line)","bodySha256":"ce924832c6a9b4a762ff80e031279273f521e4e17139c7d89a4930004313f49e","definitionSha256":"82ef2ea7039ed9294355eceba248a9ee8b0ba4c41516bd3109e2b9f94db325ae"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.unified_document_snapshot(text,uuid)","bodySha256":"5b5b17b5b977321452ebe545825c2df19527a9e0072cb9ed0ab3ec102e02e7ed","definitionSha256":"b0401822d6d16c0f36e1837168d594dbe16619ada8f4534bc289ac62fc61e478"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.unified_sales_header_audit_values(naijue_erp.sales_header)","bodySha256":"cb5c332b2f8aaf99cca4a7c24234060fb74d8990a9d1cac252d13862cc23e91d","definitionSha256":"77869b04461ae450b28e4375f2f4d3d63ab640f39053c944713cc7b34a2e7ccc"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.unified_sales_line_audit_values(naijue_erp.sales_line)","bodySha256":"f3635675d41b2644a5cb002e84a4b4a6b4b979fbd4e6e22362db4181f59548ae","definitionSha256":"ffb2bd962351c4ef249c9c3654e65d4685bea819a032d3cfd0139e8f016dea38"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.unified_sales_settlement_audit_values(naijue_erp.sales_settlement)","bodySha256":"32b79f3e0708ef9839a278bf4e3b628ca072f922bbbf297ab23f7368ace4be54","definitionSha256":"4ea94c71bc4d61372f6909f4ac1e6540b44e83173adb67a9f13b7e3525cfdf17"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.valid_history_counts(jsonb)","bodySha256":"6c143e2bf81bcd53e2c9074aa2ab4e1781c746bc7a99bb0064f378f77de80280","definitionSha256":"75b66dfba94456f71ed1d06f97ec8c79fa188ba3b1240fb2b39a5c33e3549bdd"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.valid_product_season_ids(uuid[])","bodySha256":"b6b3932264857c59998025cece6241a4e819b80f9bc72e6bf0ed4e907890cc65","definitionSha256":"1f8215e042321e89e79c7da5ba52c40f003efac12ae4385cea28f7e1e56278cc"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_available_administrator_commit()","bodySha256":"3a9a1bea930614761185af90b8591a539b855647974b68b004869c80f5e5ba18","definitionSha256":"635a06e392231001a30980a543b928696900c5f1434eee73cbb7dface5b98855"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_baseline_source_commit()","bodySha256":"c5f0eb66c654852f8cb4dfa181e594304b65400f1538135f91701afabe14b1f4","definitionSha256":"77725aa3eed5c7c3cde674c3ec40fe131046ebce4945afe3944abc8b37f34fc1"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_category_final_component()","bodySha256":"f6eba82eceeaf19ad781500cebcfc5b515f38bf11ed428d41897e909b821a07d","definitionSha256":"d30bdb2c9c31fd6d0fa784d65b2cf97c9f027739035b95f20f273ab6a886bd5a"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_document_specification_commit()","bodySha256":"5c6dc02661516e469ebdada8469b4ac9626b77dbc26be026e11c06db759da047","definitionSha256":"408e537eaf1afe296c391424f94fd8a110f8440ee45e0172f5c79bd7b188a4d6"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_exact_native_reversal()","bodySha256":"4fc5952fe054d3c429c601c29b0d84d61cdae8ecf893eafb3d7e06e144b7dd86","definitionSha256":"0a04d47f40b01c796049d5104c54a85c245f95053b2c703d7e22b151a2490598"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_history_numeric_balance_commit()","bodySha256":"6766a0a3d31ceaecd363f01d13f1c749769303ff53eb8ff62d86aacc853e2d0a","definitionSha256":"41286367904c6c969d8d11025d1035cc295978bf1909f63ba513160cfd2f7c2a"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_history_numeric_receipt_commit()","bodySha256":"62ac483bf4cae3d87b5268574b3797533c27ef9e802bd7e1af7618a02e0963d1","definitionSha256":"530b72522c26cb05a9a2aa0f78f8fd6a4409b53061daa243a65a51a8c92fce79"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_import_accounting_baseline_commit()","bodySha256":"fa29bffe3a186de0f6d6fec85f23352afb57e9d8fe8ca6d92c948afff60025e1","definitionSha256":"ac9bed33cf5727d8733e9f999a4bca2fd517ffbd5c3aa5be1ee2a2b6d64be236"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_import_accounting_checkpoint_commit()","bodySha256":"b6e35be539a377241faedf36c616fe941e26b4b132baf822b9fa35e9d7ffbe3d","definitionSha256":"375f28bd5997233353725ee8c88d4a252b8fe0d126d35949f5ca0c5b81cb5f01"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_import_accounting_final_record_commit()","bodySha256":"2fc1ae00d5081ab5a28a0b02578aec6f77c104d26086e1157db96144d5b40d13","definitionSha256":"4bead0cad2e3cd4a22705935a8e173016a20fcfcc07d9e2b70af1c0589c2e278"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_import_batch_commit()","bodySha256":"b6e35be539a377241faedf36c616fe941e26b4b132baf822b9fa35e9d7ffbe3d","definitionSha256":"c8dc769373ce0013f3e0de1b7f1d6a68896ae2e7a3b06dba20b7073b079a2fc0"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_import_operation()","bodySha256":"4f5f0c85675b2505cf8f86c17d43a7082e4cf1e0be990c4840e452cdaa03fae6","definitionSha256":"3f35aeea7751ee2175ad3a20fb5709be51889a02e14fcabb6b260fd8aef8d958"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_import_publish(uuid,jsonb)","bodySha256":"873d1943b1ada13eeef43f6d28cb792755de48c461b1ebee7810e5278cd5d6e3","definitionSha256":"a9bf8fc095a06d34ff3bf821b2074d1c779a955e8794458715ae62daf94901d3"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_import_source_commit()","bodySha256":"428b38d454d4036634fd82e0a41e0c218a545ac5918dfa40a999d44e3b01f48b","definitionSha256":"2d67c951853aeba999034a4b6572e75949b03dd787e8087c284234347f40d15e"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_ledger_receipt_source()","bodySha256":"26f2f325172ef2878d4dffb4f1740d680e63458abd4b25e7a693e352664d15da","definitionSha256":"265eb0337a2a8ee90043cf5a5ed1bc6b662bb47c09edca198fde4282ca1ae7c0"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_maintenance_receipt_commit()","bodySha256":"77679e1e21858ae64ac1225660cf7a692f63b097d538254829def8164ea33ac5","definitionSha256":"c6b837b0611919173ae4caa9ca38d83d8c94812071c9490fa2675951499c45e1"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_maintenance_root_commit()","bodySha256":"bf853800c33c492dd0b8224e489c42dfb1c9a046231001a3d42be830a257f479","definitionSha256":"e61d45532c35fe568bf45745e43d401c69c3b5dce03601319556117ac8c8dcea"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_native_creation_commit()","bodySha256":"a505ceb68946cc14a69b181cd43d6cebbedca9e9ea453c9920c243892f537cd7","definitionSha256":"10ffffe6cd6db34f9a01fe3e6e1ec6aac8143487bc54ee9619270b5db90fff4f"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_party_native_commit()","bodySha256":"dba217f39c61d3f4741a72a565851a41caaa18e44fb57aa2f8e3473d20810762","definitionSha256":"920144e5b896809276e60c20dcaf9d5e2f6cd8a34aa1dbbcbb6769e1567da7ef"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_party_receipt_commit()","bodySha256":"fafc3389b3458b6d8ec4cad15f6f926dcc20bb059a819c496ed4db260d06b426","definitionSha256":"367d6f941c2f33959a4443e93ee0e018caecf4fdeee95ed184b67094444ed392"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_recorded_live_balance_commit()","bodySha256":"b32828510d3b85ae04c9d3849bcc494abe3cf337f0908996d72142fc171fb523","definitionSha256":"c179f472c1296d2f5c67daf27c7db9bd52bb83b87f1f102ea65d4fb0c8453be5"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_sales_commit()","bodySha256":"9fb5cba9244e3114b3734031673af9075ba491310431b75919cd476404626672","definitionSha256":"a950c449ec1ce9d42b7c9a78b5d2649ebaf89004df3fefead29cc2dc58825be4"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_sales_effect()","bodySha256":"6cfa34cd77905b50cc258b855109174f90a9d6d18c55e6dc884b2deca088bbca","definitionSha256":"55aa5c8a01806c6dc9ab155f7eb8de37fdefafedc86343251d60ef5b3537888c"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_sales_settlement()","bodySha256":"580340f008dcf9652fb18e041dde2b63ae2aa72abde3c5e8a772cb13cfb0990f","definitionSha256":"052f87f877666f0c9af3bbb9e8d2ffde39940d548c81f184840c4d73de8b8ee4"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_sparse_balance_commit()","bodySha256":"9f983ba16933b73d23fda0d957f4f93dc99cd6d4dc877cd826b11c48184a1d51","definitionSha256":"6beeec5de448b44062c0244a03f0b44c9f21d32ed0b9d1a3e8dd189e597e15d1"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_transfer_balance_commit()","bodySha256":"9bfaa1cdf1dea76ada35bae56dd40cb3e27c6acd28a93905ee2f06d17a8b2abb","definitionSha256":"76d77b6741db491376128c3e298833d7f1a765b17334b3afe6150f4031266192"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_transfer_commit()","bodySha256":"5d5bb1cea93e658a8d3d1fd0a7146e12e2748b089f942e5d3294e5d78626667b","definitionSha256":"7d7c0d30560fd51a396c1e3798dfa37285d676825390d19310ab7b3cc71a536e"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_transfer_effect()","bodySha256":"6c1f9a7133b8c896cd7f08a2227db891c48a28cbb6d9f783e6673ba05607ea36","definitionSha256":"dc0b3554f66f805402279634c5c8643e42aa1397f50da4746d98e1732e6694c7"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_transfer_header_commit()","bodySha256":"790e449c0931268c220711fa1d6b85a627ec476a337992dea68f2856664ab4f4","definitionSha256":"ca26353a21e3d863daa307e29282ea8dfcc4a99a7e0de19c7e7599dc1c290c65"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_transfer_line_commit()","bodySha256":"55f8b1f1723c545fdb10e64321d03d5e80a10f63c8c90b374ef7f7426ef36239","definitionSha256":"264bd7807c879a155ce5241d0947bbab750b48b51a8a017ab09dfdd4bf9dc6e4"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_unified_baseline_reversal()","bodySha256":"e79f446269183dc9af235f7408344462e933f4ddd687231a671fc8b195923aed","definitionSha256":"a52438c6dcbb516779082485ffd193b2c1ff96bb2c70cb36047ba7f71bddceae"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_unified_ordinary_operation()","bodySha256":"4df5ec2f7c3a25d2461a56586f83f20d63773f01e6ca80b9c45429676a1969a4","definitionSha256":"46134f83af3893b783c77e9f8ba1d4c3c7706f229244b64c5ee817423a7b8508"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_unified_sales_header_commit()","bodySha256":"a8ce6dd5da8e1098f097ffed58304b2ab857b5b576e4e868804f76d5018a6339","definitionSha256":"2f1f2d060a85455368679f15ef682264f30c63ac689cd866b264ebcd07538f4f"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_unified_sales_line_commit()","bodySha256":"a31692ba5b18b9da6701ccd12d3101af1a5e85ba15b60e1e7150a6e4723d8ef5","definitionSha256":"f740ea70fbdab8ab0bcec730c2f9b9e722284e4064063345ba1c4609c467f484"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_unified_sales_settlement_commit()","bodySha256":"d2da5c47e935406e114fc06a487f128fbbe7d370d9b204ac10df956cba7d9abd","definitionSha256":"2115b6c58d91cdd308ce53f2d1fdd024b1687d855e681364ec6d325727b04e9b"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_batched_import_inspect_kernel_v1(jsonb,jsonb,text)","bodySha256":"f72f28bbdf1b445fe51e2b82e201a07c066b63ae6c913c9cd6f595d646965908","definitionSha256":"206bb04cb10d126c89ce85de5cb61f5665b5e3add35a63700a78cf12568ad494"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_importer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_batched_import_inspect_v1(jsonb,jsonb)","bodySha256":"7d32f68a9ca8da595334cddbd18b09538163e6b2879bbd7f7bca8aa21fd2b0a8","definitionSha256":"4213c9ccea4932c6e16adca98d7d7eb08b5d1c87711d68d09303fcbc0be8a7b2"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_batched_import_assert_group_v1(uuid,jsonb)","bodySha256":"85cf4b9ceb0ea0f0615955336981a3fca3eac832d9cd0e5534824e6ee8d928be","definitionSha256":"198fafdd341534a24b4b06eaee0f97aeda8720b46780dd5e2f03850975a285c0"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_importer_2393dbc6db9581c2=X/erp35_owner_20261110_r3","erp_unified27_initializer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_batched_import_step_v1(jsonb,jsonb,integer,text,jsonb,text)","bodySha256":"4f0fdf5c6c9876bd294250d010dbfcacda1af2002f43b7997ed6f4f0555bae76","definitionSha256":"2ae9e852840a2590e9fb50c3399a35ef71aedbea940822748da7a03b5c42d15c"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_importer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_batched_import_complete_v1(jsonb,jsonb)","bodySha256":"20b676b0da8b22335b62f3ec14fa744922fe87ebed8ab9e16f9fc2c66a3e3464","definitionSha256":"a85fee7929293a06b9def5c00af637831890394225c95fd95803bbb1437d1d38"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer,jsonb)","bodySha256":"786f4c5647fc07fd399b5575898e1437d7e59cf8d1c21fea063a9997fca7245c","definitionSha256":"cf074e0a37bb753928d1f5797e051116065658ffa24c803749a69d1b57a33c49"},{"signature":"naijue_erp.standard_history_hall_projection_relation_v1()","owner":"erp35_owner_20261110_r3","acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"bodySha256":"4d6136e5327f2106dd827c717db4b40cf735bc1b600ceebaaee50d7398bff270","definitionSha256":"8886743f06c6d1ec473d64961edb8b07a74ce80d711ad769dd338f5abe3aba0b"},{"signature":"naijue_erp.standard_history_hall_projection_store_v1(jsonb,jsonb,jsonb,jsonb)","owner":"erp35_owner_20261110_r3","acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"bodySha256":"cbe8fab268f8497ef01b84395a0a328729d98e669c2b71cff28dc4941d5fa9bb","definitionSha256":"1a3584c8311c0f07a7bc9dc135024ed24d6681134b9bd654dce8f30bfe352865"},{"signature":"naijue_erp.assert_final_history_origin_v1(uuid,uuid,uuid,jsonb)","owner":"erp35_owner_20261110_r3","acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"bodySha256":"3096dc6aca80efe02f3baa2b1eec9f746bf8fda9fedbf6155c02671c32cb6eef","definitionSha256":"89cbd6a05dea21a0759d4f03d5ced6d0f6435fa5c8d31b253fad1474906bdc2f"},{"signature":"naijue_erp.assert_document_migration_checked_v1(uuid,uuid)","owner":"erp35_owner_20261110_r3","acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"bodySha256":"6626142d1d59957663def0105198e168829dd2e32e89e11e1aa51c0597fa086c","definitionSha256":"846c0eec9664167f5dcd415b23a2cde32e42bc4471fa7256bfefc2a1a664913a"}]$source_routines$::jsonb;
 target_model constant jsonb:=$target_routines$[{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.assert_document_conversion_batch(naijue_erp.import_batch,jsonb,text,boolean)","bodySha256":"b310e64b22ee3d58d63e976fe59466064702c6f173abeb6b5911e6da6cd3b472","definitionSha256":"5a17185763412263d0d2d5bb7b83807ae4ac2bf21227f3c775c72373cbe8a8b5"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.assert_document_migration(uuid)","bodySha256":"45269a5359a89ae4e36383cbf4dec7fea4017bc9677a90b96df0eaf0e011c39f","definitionSha256":"51f8516e6d82124fb440569ff7faae0c1eefff32c2d4b835b444eb190d2371eb"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.assert_retained_sku_reference(uuid)","bodySha256":"4c956a82b9531b1f385f9aecd9c6d20fa84ce6d434bb0a41d2a0c96ebb7fae5d","definitionSha256":"569288e1ba7ce3bdd12c2c981cee10a2370da890c080dc9b728701ec563e9b89"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.assert_standard_import_operation(uuid)","bodySha256":"94eb15996fa9090fb8b5cc2cc38e3574c45b3c67acedb1c1d47302687d20a21d","definitionSha256":"331cb648832769c2c3c48afe8dd73ef02a8263faea5d509964d1f2c78a34c320"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.assert_unified_current_actor(uuid,timestamp with time zone,text,uuid,text)","bodySha256":"0a7fd1974200a8145e0e57a351c4f46f85a02636541eccde436196fccadc4731","definitionSha256":"0d1475413a58da0c99b018d82aace6996bde4c9027f5464d507cae267385a5ce"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.assign_runtime_document_number()","bodySha256":"bca336abcd0ef4a57c22d2ee19564e7ea744257303fb8eec06c822efd551500e","definitionSha256":"58996ce23d8f0be25f4a2ad6d7e08eb44fc2ceb61ebadb0dfe811488db212893"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.check_hall_default_customer_enabled()","bodySha256":"6a89df4342530f3a3bdd185abbdd372b3372799b341a17ae9ad65be86ded91ee","definitionSha256":"ba08e3e7b6d275dea1ec540332eb40852bf0685c0c1b254aaa2e2001e5c50a3b"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.cutoff_import_lock()","bodySha256":"82a621b9cea39c9cc273d5cb790b364fad004875760644633280d2e24e64ccc7","definitionSha256":"acfed1107b87476233cda6ad873d3e44590225127bb4289a794a60587be7b62a"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.exact_historical_customer_source_matches(jsonb,jsonb)","bodySha256":"ac26aa52f4131d996d6abe0db810a0e0817a12ffa043cdfb2250c951bfd0f011","definitionSha256":"d4991697536980f870327494ff6d54f2dd9aecbaf5eba8a9fdff6f854b41ea15"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.freeze_cutoff_sales_detail()","bodySha256":"eb20d59095a3b407870735af5ad574ec7c1e8801311278392ef9547de1af719b","definitionSha256":"db6774caa299763fe6c2090eb0be134f012238395cc5a26a7e24e6f2d464bde4"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.freeze_imported_identity()","bodySha256":"0a17cf0a670ca8c9d34f2de1ec34de9b5197410fc01f82af4273a26e877a44e5","definitionSha256":"d9c778c91c12a115f8cfb6bc969fecd87a399061014cc75a3fa6ea390b933bad"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_balance_identity()","bodySha256":"02f2db383ff8c5826c7148f73bb780319c977bffa5798bc233159d83d89e58fc","definitionSha256":"88af4327a05f5d05b4043f4f32eb4b6565229dd15dd4dc80ffbb304ae9b6b47a"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_contributor_link()","bodySha256":"2937ecd3e974e2ad78e0bfce4790b96d97953d4bf113406a838063b366895983","definitionSha256":"3592206b4fad8876eb93d090c476a375228a0b3c10cf9984f46a376c66bb5712"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_cutoff_ledger()","bodySha256":"6b1119b4feaf986c15ffd302e3b832fa1bc9df103d34c5257cb7a16792013fc4","definitionSha256":"404337fa0971ba3adcae0a0eca2ac8e21090905a2463a95f6a918c3d2227678c"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_exact_historical_customer_current_usage()","bodySha256":"78e895d72d6f806089d2bc7cb877293e1263d26ba8265dd7f3b5e2203e956245","definitionSha256":"961d891f7c1c247006beb6a11bf2b2614da8a4c8263ffe3e9403ead66bede9ea"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_header_native_reference_publication()","bodySha256":"63c0f37c67c61b00681b1ee1146750f28e359309795ae266c62140edecf5ee0c","definitionSha256":"6a30edb645529461728e0889e5861d3f398e1f2822debe3960e42dd3de8382f4"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_history_numeric_ledger()","bodySha256":"32d766968972c01675d0aad91d554d7f726086f88a3fcee7d168e2d6ab09bb8e","definitionSha256":"049b0259a50bb575090038f1e8e80805f2a01bd7d79ecb88a8d4471c09d42f6e"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_history_publication()","bodySha256":"9df5c2973589aac649c7bab9be331fb02ea21c0ef851ef30857ae652e8646fc6","definitionSha256":"f82a0a8c82018259447ee20f6bf881e7197c57f3477692608f1547e042a1f754"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_history_typed_publication()","bodySha256":"79eccd51ec346950c9a93cd14314b6eab8c8ae576f7d17a2430131db4ea98648","definitionSha256":"89ebc7b8c9196975f9eb5065a43750394946c59334ea358714896992283f843c"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_import_accounting_publication()","bodySha256":"9df5c2973589aac649c7bab9be331fb02ea21c0ef851ef30857ae652e8646fc6","definitionSha256":"ff29a40ba4351cc90833f04b2a0f13754604a46bbd5ed8667858b889534c6943"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_import_batch()","bodySha256":"b22fb07f37a04ef8ae7c03df0780c0025588947ce85693bd49a3c53f34c4d702","definitionSha256":"ca79bf25ee27cd7956137365acde543e5b34b6f4ac7f53629896d5cf91ed3f03"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_import_record()","bodySha256":"da69cd96c48c1caf1c6afffca1ed267da2a2943b2e06d4d68a650a5a53b413e4","definitionSha256":"144b795f9e06a9d55c9651e52e78cf793e192680e3be4e079e788b035a45aeb9"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_maintenance_account_event()","bodySha256":"965d9d3433b929ccd151b9a147eeef713770d7b7311e49c80cfaa3d17b118549","definitionSha256":"056aeb6dabe60dd5a37d2ebc412453b618a340b6ea01c33bae0116b1b24d11e1"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_maintenance_audit_actor()","bodySha256":"1635b883d65abb3938b277287ff7b0b1bf28cdae367b54b282b3e81810486e89","definitionSha256":"2c36c4e0a6409e47375edec798b97985790250cb96d70635f1d86a2a7d654f93"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_maintenance_before_root()","bodySha256":"76d30c01785877cfab4bb2bf167e1cdcd583677d204b7d7efa0c2cc2c79fa05c","definitionSha256":"b0180f6eb1276704bfa73dcf68d89b973a65416e8a78914915382535ef97353a"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_maintenance_child_write()","bodySha256":"ceef464210d22280de7bc92ed900eebd3156ec65089ecdd8c55bbaca9c975d95","definitionSha256":"1f18ce1667a4ac6fa5de827cc03a52653eeb98cb85b5bf688e6c74b981a95638"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_native_catalogue_publication()","bodySha256":"63c0f37c67c61b00681b1ee1146750f28e359309795ae266c62140edecf5ee0c","definitionSha256":"a75e4100d568e2eb08791f1171cb82f2d9236d5d94496c691566d8aee3633862"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_native_creation_identity()","bodySha256":"765f060da0e51a0a18309502a412cc2196dcde633c3e9db0cbe4a2b6383d5111","definitionSha256":"b9f96235cd42f3ae41c887bfd42b8f90a43f1fb000f5766f17917b51497f7e58"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_native_payment_publication()","bodySha256":"63c0f37c67c61b00681b1ee1146750f28e359309795ae266c62140edecf5ee0c","definitionSha256":"0997832631767c076dc40e5dc6a5a592eaf5fd1e983f8d9265aa60e862c6d9bb"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_product_image_color()","bodySha256":"a49cc6bc4c49931eb50c81dd95e08a760b2ea6de73e19a0496611fe63fe22b18","definitionSha256":"0d22b1669e5cb047baf135f76e8f4dc1ed903c2cb403be1f2e1f48e9f6bc3c0f"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_product_season_selection()","bodySha256":"13b4d3e38dd2ebac9a2f5fa567538850e55651ef1c89190ecd4fd4e8f706cf67","definitionSha256":"3b1a6bdf8d3906d51bbb71d9d8a9743ae8336b5b6e112ecc6d999e6918ab3e65"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_recorded_live_balance_pair()","bodySha256":"5c27c87037c8333d7c4ff7a57eb08896b4230653b6d0c58f11e6e875333c7b0e","definitionSha256":"843c8de6b42ba3f3d2d8b39c64f2188cd998c1a1e596522b4ba6d9ee72715b80"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_referenced_season_identity()","bodySha256":"8eb0b3435f063f4a653c31f632fe6751fecc3864a375a72753bcf4090bb18f2c","definitionSha256":"84acf2f88a392b36b76267ed6ef5edc7d5983f9eaf73f29eb2222afafa7ee514"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_retained_catalogue_delete()","bodySha256":"dec785b8b1f818b2daa3af4d3872139710cae32178516839e669f59aa6609758","definitionSha256":"ff0d2456e1a92c2de7e15022e98babdc7002050c5c3fbce9e71231b60eb9fb06"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_retained_catalogue_reference()","bodySha256":"91cc169d60ca6db2700ed97e49632504cfba9d957ea467a4777137f946c6923c","definitionSha256":"afb27ec49d16bed1b578f8bb06f6177e03d863e49d90da82bcc763f8eb131172"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_retained_settlement_identity()","bodySha256":"73bde63d2dd84da3c5ad491f2b073344c2c6639e667f443f622c5b8d5ed006f6","definitionSha256":"befbc1503368eb77a3779146702ccccd4215e22765443e3b399d232c40cd8a45"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_runtime_document_number()","bodySha256":"52d92723d9ecb5f16eb57c5ae50e0f8cf322b4b5f3848ab88712f41aeb0887bd","definitionSha256":"e7036841a78af7d3ccd8d6a7e1c479cbdb1e47bd075ed21fa4516283af5e1ace"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_successor_publication26()","bodySha256":"1e734c202880c5f72cf54f60846334dd7d61a81f48512b6808d54dd789ea1f6f","definitionSha256":"e78f95935316138e5dac7a37d086aff105969aa622d6d09b804fe717ad81f893"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_unified_document()","bodySha256":"ff462d6a8a30eadea0d98991818cf15c9fd907db0d00956b3be51193846d3e83","definitionSha256":"7b36532a420abb426faf88323f7abe73e6d68b170f349c3456c81564549042a4"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.guard_unified_sales_customer_reference()","bodySha256":"d8b2cfcba9d8ea3d1169074958afb43a425b234efae6dc4574606899970a59e3","definitionSha256":"9b6058b8053c21e5b5a3fc47f22447b69038f80e95244dcce35cfab288d32e70"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_closure_count_map(jsonb,text[])","bodySha256":"ef82c0a7124d288103df38503a849b96aa936289b2ee29166b4f0a6529f476d6","definitionSha256":"2b7a03e1b6e376b38d76982bb54d734f80b20a5ca2c00d567bca727ea36087d4"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_closure_encode(jsonb,integer)","bodySha256":"b4ad51b2b17c9248c80de0ead3ae5f50bf5fe887e36597b081ce250a94623a5c","definitionSha256":"85e6630cddf1cc7f8b95731539b303c2098d5ef9b0cbdc8cf5e375054b2f51e2"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_closure_finish(text,bigint,bytea)","bodySha256":"94b84af2d05d8a9f34c0135a8c0d70f5b633a9b43e6ec6d2bca8de554e8abac8","definitionSha256":"18676e9757bb08c80f8984f0d27867bdcdc24f714cdd90f165a98e4ed63405d0"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_closure_fold(bytea,text)","bodySha256":"31ed823c127e85537196de072b76077749d939f3241fa53b9f1c76f8fdba9062","definitionSha256":"675a58a5bbb094bcb5a1a1f5ffc38fa0ef566cb38461d2a5ddc07bbfc9ce0ddd"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_closure_projection(text,jsonb)","bodySha256":"0af6d70c56a463c351be1dd732d345bbb533ae98b0b07e36f6ef08a4efd72011","definitionSha256":"586a02648d7f5dfa760def405b7b113e4abe23a770daf84ce7e97830d5d35c05"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_closure_projection_columns(text)","bodySha256":"a8a3d4d43341d86dfad188d191c3076203e06ea8f1a6919c4d0efddee76286a6","definitionSha256":"490be4b72b381095a318f0c04dfe2cd290c077497688cc971e53092e5dbcda27"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_closure_projection_key(text,jsonb)","bodySha256":"6e2584dac9f079fe2061570c15b13549a3abac512a2a809835046e6fe2c50222","definitionSha256":"42d8ad2630778708fbd87787d5c8b0aca7daef93827baa0275f6cdb58257f80f"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_closure_row_hash(text,text,jsonb)","bodySha256":"c7ef0fdc273f23ab5ec1ae6c870746146dab90a6ecef8ecf319de0704df697bb","definitionSha256":"9ad3bd6273dcefaec0b37b0386cf9d9c88894f84433a2d6ba1e6349af27f44c6"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_closure_seed(text)","bodySha256":"532918606a4dd24ebae46a55dfe7d2f0803602798c63742bcd975b7e1179f2c7","definitionSha256":"f796d7757c12b8337e57adb5d4fce522cc17b50994f8e5f8d1a39af6cf0036ad"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_numeric_ledger_set_guard()","bodySha256":"661cd72f1df3a14d2fafa67ce1b1912657942ce9d670d0f8b1ea55f46200cd87","definitionSha256":"06ef2855ba8a943dc1d3301b38247e0b99af90098bfba4f1cea1ac3cd5f2bc11"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.history_numeric_money(jsonb,boolean)","bodySha256":"8c588f3b6145cb1609898dd46e3abfb7b1bd37b3b9318f1863dcfac530ee200b","definitionSha256":"9c148e18932d5679b42c33b826d16fe97761f2b0af9dac8779640305e72f86d7"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.import_source_key_lock(text,text,text)","bodySha256":"07404b25633a5c48ae1a530a48cdebed11107e187d660c99a7e781bb4957fa24","definitionSha256":"563985bbfe4c59594b767d3591cd5860468d5431cf4464573c80efb23233c275"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.inventory_key_admission(uuid,uuid)","bodySha256":"1b065e414d835954bdc9d28239b33612e806665880dc2434a2309fbc539b7b43","definitionSha256":"f629ed1c2d2388ddcd3838ccd7358c2bd7461f0b210d8ca5954cd89eed34e1a6"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.inventory_key_lock(uuid,uuid)","bodySha256":"c6f444fbbfc527fec7f4031fd0ea7f07eb0a98202b11340e8f7da398fa117079","definitionSha256":"17c21e8982e4668b4d6a3cd08de1d769c0189e76745490163ec22af6e4b77f98"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.inventory_runtime_key_admitted(uuid,uuid)","bodySha256":"945a2cc1e250ed1cedd3ca2083b80120174d06d015455bd4288d186e0c27f377","definitionSha256":"4d52e9aa232fe55fcf0834730defa932849452b80f5b45b860824e3b6c43db46"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.is_exact_historical_customer_only(uuid)","bodySha256":"8b3985b2e5e7f1db46b2a4a8c632acef1d10ec230bcca9e11ff538dae3965e7f","definitionSha256":"c5ac2c159ef291f80c16af6a06f85476c1755041ef70c645c471ee0424adce2a"},{"acl":["=X/erp35_owner_20261110_r3","erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.is_native_party_import_insert(text,jsonb)","bodySha256":"dfd1e1ca585e405b6314051578f4cc6218344e9dcdd599f188368165e41a4ffa","definitionSha256":"c46f68dfab23f61a7992b9be8c9b126d176dab3c245daf1c030a2735df46ee56"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.keep_barcode_binding_identity()","bodySha256":"14f6d02bca58955681e8d03236fb236cbfe3d041d35ecdb326cd3fa7e38d2733","definitionSha256":"adcedaddf94944b2408ecb9233e258d7d0ae95fcb23788539ef489b0777a6c6a"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.keep_party_native_identity()","bodySha256":"44c3a7110bf40ef38e73972b493f36279b28124097b31a9a6f25e5adc13ad4b9","definitionSha256":"56337106d8922056edc525f6460ae8912a025aa9802bcead1ea59442ba6beb0c"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.keep_sales_line_owner()","bodySha256":"95f3dc678bbdc8ac47a2f1c76fe13f872bed088e7484aebc46a523fc13cfd241","definitionSha256":"6ad66c9604b87a44584af533d7cbb1309c5c549db372e652de70dff0e5cf46ab"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.keep_transfer_header_provenance()","bodySha256":"68d1af54e61704be47e9fe4097592e812d3f7a910dc2d7190351c2b427267bf6","definitionSha256":"5f30518687ed0f26f22a25cae1f807668cff8ff3b1df8fd57634433e3db67c87"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.keep_transfer_line_owner()","bodySha256":"763d52e081f96f872adb50658403f5f2f7f83f7c914d002b0e771ebe9c055335","definitionSha256":"d0beaa0f1dd4220fe2be52a4f6d23eb311dcbebd253fdf12c350350a6596bd3c"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.lock_category_tree_statement()","bodySha256":"fe2f9bd7ed49d52697cb8a5aab6100bc61f2246c0f8ad02f945a7dbbd4a54834","definitionSha256":"52d6517ea163cd3218df0afb11a138712082df024b85c381d046ef99cba33eb0"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_account_credential_action(naijue_erp.audit_change,uuid)","bodySha256":"f17617bc8f02fd0731d0a97eaca90553441235e032de1dbf9086e84c987fbe7a","definitionSha256":"c0f1279988596da886a5a5521176dac0713d105c3716b777467486d7ab2dd3c3"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_action_allowed(text,text)","bodySha256":"50b2fa0fbf733d7c98b40aa612107a20262cb063852cb3f2cabbefc750742c4a","definitionSha256":"330ab20403dc85ce05996723bcf2b4d9adab0dcf67032dbd20a334a6e4b2f0e2"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_administrator_mutex()","bodySha256":"d6809b2abf7b3f211cd7422b517e867d0c1378f9e7fe9b98eacde2521c6d1ea8","definitionSha256":"91502ad2b6a16e92a30a10de1affe2b664161eb62c9441da82eda84b176bbc4b"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_audit_is_current(uuid)","bodySha256":"4537d6df2b73e17e386b100845049da08d3fab3584c87ef8d7095660198bf699","definitionSha256":"b0f899e6016c5abf4d2d37cd331ca1d49f83e6bf725702cababd9f76276494c3"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_check_account_credential(naijue_erp.audit_change,jsonb,jsonb)","bodySha256":"577bf0a5de72c8dc6d080c1b4f18a669398d5738c16b75d11ecc1c89d0156ab7","definitionSha256":"1f496cabd064a550b8e3408688561708101328813dd0288f12b66b201ee2cf1d"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_check_category_order(naijue_erp.audit_change)","bodySha256":"77c86d2788e88f2922a66c662a91b95c0f76d6ea00587148c36421feabde281e","definitionSha256":"55ae51ceb89b48f1bcfec1132cc70904683967a4da4735dff799b2f34c172414"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_check_product_children(naijue_erp.audit_change,boolean)","bodySha256":"c7edab87301fc05b7f33db2eb9df30b2da0d28ed9154dfa8d11cbba9fdbe6dad","definitionSha256":"f50388ccc03afbf91d084ed762f404d33b0db25d052674fee5a055a0174f5657"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_check_staff_accounts(naijue_erp.audit_change,jsonb,jsonb,boolean)","bodySha256":"ea4e151ccb89d97ed40edc6e3164594bccda0fc28f2879f614f230830fdc0c22","definitionSha256":"ea03918d24a74dc36ed815c2ea2b1b6a896c981beceade83c9d5ccb1d1a27f94"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_complete_row_matches(jsonb,jsonb)","bodySha256":"34c25d78bc34ed57b1acbbdbfbca9b0adfd78dc8dcb6cc8c42cf5673f5da5d21","definitionSha256":"c3222e301339286298c02a3a3be4a87c4542773b2d43ac7483bfa301e3d5d502"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_evidence_matches(jsonb,jsonb)","bodySha256":"cb201d859235d7af9ef52616c64b705e5586b11894d57fbc50b2b0a7615abaf3","definitionSha256":"e57b18261ba8ea8bad14f459e4f67ecab3136983fe0ae2e27d3262200bd5d5d2"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_exact_rows_match(jsonb,jsonb,text)","bodySha256":"8b21824423a27f20074768c09998fba819887c949b4f20b57e35db0815133161","definitionSha256":"1608f489850381897e8bbfccf8beaeeee411e071d55bb911e6ca4fbf449be970"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_payment_halls(uuid)","bodySha256":"d96c975c57af714d458275a383e0e2bdaeef9214d4bc64420207f36bcea55869","definitionSha256":"4194ad6410b9fefda6ba8509bd91b1e2098ecbeb2046a36f82598a2743188c14"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_product_child_row(text,uuid,uuid)","bodySha256":"69145227348d366932814f079f0b63d1bb6109cc36d8bb8c9f8ae53fafd1b9fa","definitionSha256":"21433b9057732eff1ccc83257a3c904fdcab4117010ed6a4fa44d1e859ba8380"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_root_table(text)","bodySha256":"7ed286cf1e5bb8629b02e7cab4412dc0df502d560661be9823d234c466565fe3","definitionSha256":"7f1cdfcedabdeaa91a47233853a1bf5ab9aeebc9898fcb6b49bf9a566e515216"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.maintenance_staff_accounts(uuid)","bodySha256":"a191dc7b42cec0f41f42c6d371a2e959c90019983f4f79cef86db99d2e8fa989","definitionSha256":"ca3e3dffcc0eed42614e0bb1936ee8cf0ca94b722d95c83c485d799b0dbd0c1d"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.native_creation_operation_valid(text,uuid,uuid)","bodySha256":"ba468f303b532cae64a55c5e11b3f8c1416c6d4b3e84d918a97accd103e86d80","definitionSha256":"6c9c7638c2554b8b203c18fc689494817cc019ce9cce9af862220d83542d6a98"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.party_key_values(text,text,boolean,integer)","bodySha256":"d23eb5601f984007df5d52661a101a422852e20c0bcd75f1cadd5a5bbbaef649","definitionSha256":"1c17f6d44c800c37fa686710a6d72ef97eaafe0030632a53318ce3ff09a42664"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.published_inventory_key(uuid,uuid)","bodySha256":"2e303f71e2149d2216a3dbea86aafb347d43f6a4dfd87d4374804a722da3e2e0","definitionSha256":"2aa3ccf44c60bd2c6e37d655d1b32bcc66086e73c766221afcceafabbcafdfc3"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.reject_document_runtime_reference_id_update_v1()","bodySha256":"c7eeff622fa4921991bae5b65c865402b3dbc3ee3fb310beafdf12b28dfddea6","definitionSha256":"a94b17b01d1f6b3a3d6f97a73f6585eaae4592472c2b8d153d37062818d1a136"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.reject_immutable_change()","bodySha256":"3daef49e525ad973be82350a1551e979198d21ff58f3f1bb92a4f7292e4d038c","definitionSha256":"7caa730f4d1fc3ec363d541308d230da0b812168e333841f9c3f5271d0fc5176"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.reject_unimplemented_cutoff_write()","bodySha256":"2e108a1bd9e9304f63cde9eb8b726c448ebcb2d2b371f8b3a8a41aebb6d21e0a","definitionSha256":"f6ab1ef7c3c1c63755a95f8e9c94e78f236a5da6f2f6b49db0d95149b8da283c"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.safe_maintenance_evidence(jsonb,integer)","bodySha256":"4a0d9d21eadf3e839d1d0c23f7efe8a0ef14123dd521a553eefcc7362ab3f927","definitionSha256":"db198e40404d5f7226dae8af472d9d87b25fd5ed991e333f653e4034072bfa2d"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_initializer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_admin_provision_only_v1(jsonb,text)","bodySha256":"246d52606496638e803430db93402f0fabb5ac4233ada0e42010c04a1ce94453","definitionSha256":"c7a98e1cba04d7e37e0fac81da2953a5e5585e311b1d74a572018574abb10bf6"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_admin_provision_proof_v1(uuid,text,jsonb,boolean)","bodySha256":"d2ca61c2a3051b2bf9d3f242836e594b13ad37486e73f14e4bcf78c514793dc3","definitionSha256":"2de72df0d88b84255387c36b2f0f088900afd1818012003dadcd902680371146"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_business_ready()","bodySha256":"4f6893cc5ef4bbee1bd74d08435763fb3bfabf7dc5888ee72f03cf3387e412db","definitionSha256":"e71cbabcc0946d2a6c32b588166caaa6efe6f5a80fea8e1bb5a7019eb5a6a75f"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_baseline_keys(jsonb,text)","bodySha256":"a845e4994144692495f51927edc6fed638102cd9712ea8cea89e540585a0a452","definitionSha256":"19ab95eef7cacd0b1001a9a6892dc72fa63738d56ba316e4864d0c06672ef041"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_command(jsonb,text,text)","bodySha256":"7874ce87039cdc09115916bfd31ee55e6f0c52f42b68f37744e2e37d0914c1e0","definitionSha256":"a6bc495d1e2c5723ec1344d1507b29ee2a9aced947e97abd2a4959cdbd87f429"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_document_chunk(jsonb,text)","bodySha256":"2998782c615aebe3bd93db1e93c44cf63c3a4a5887ea88455497f93b9b6b43f0","definitionSha256":"9ce4de073ebf6045aadaec2bc2d25b0e6d5bced47599ca16914b80d72e9c58a7"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_identity(text,text)","bodySha256":"beed603f4022389da9e3bd4dd9c6e3422549e0aa70f20301df3cd09376cff423","definitionSha256":"5181d6b5b4cac03807950b57f338cd570e8b34c5863c0109931278218ab97511"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_inspect_target(jsonb,text)","bodySha256":"72e0c3c175f0d14aed324d3d926b38b6ac05ab4ead5e77d354de6ac04128d780","definitionSha256":"0a351de3018bffc409dbbef8a4a763f48ada73372583356371563f74cc471c34"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_master_chunk(jsonb,text)","bodySha256":"882112434e9a177ffb653a6d9c871b9ed81089e05a05228dfdc535ec9aca7813","definitionSha256":"7a08f54c6d6b0f2b838be7a97879d95ab4da1a2715a9d110b5983b3468f5e2cd"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_record_proof(uuid)","bodySha256":"35d2bc55ad8c8f48d5e0d3bf41f20b0cb1c3a98537468a4ab3075e8662abdfc4","definitionSha256":"afcfe2ebaae186bb6e304118a7c4101fce46d01ebe1f4d289e0bc0a8fed67336"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_row_intent(text,jsonb)","bodySha256":"5933c1461819a212de6cfd9a4f6437506bce9d7eb4bf38243c0e3a8e12461baa","definitionSha256":"3e34ff7a47193dccd7ace35419ff4fdbcd0b79880a88bec22e573f653d6b3227"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_status(jsonb,text)","bodySha256":"9f675ee08ffe1c314e1ea2e8ad89ff26c80ed1219ab6dcac0d1c5c839639d013","definitionSha256":"9f0325fc4cb1ead377febe871fa6ba47ac74e043987bd84ba804f8498e33eb83"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_import_verify(jsonb,text)","bodySha256":"5ab152bdedb516e2994f1b4201c4803ce837f7b096848c3651ad88ac052c23af","definitionSha256":"1dec90885f4328bc21d167aa1d4c71246f179e64e4d68b1087fe460c20c176c0"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_initialize_current_admin(jsonb,text)","bodySha256":"3f8fe4ed7e9bcfc9e239581654845ec2cf1f629aaa9fa732b855f6dd621f96e1","definitionSha256":"43ca26ff3115df0bbf40c0e6df04b14ec44ed1ec02e030279aade25d2ac6e786"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_inventory_key_id(uuid,uuid)","bodySha256":"370852266a17d0c3797b1fb5d704c281c4418a99c3be0faf1bd7796ed7815720","definitionSha256":"d0ce596e3b20f7b8c4b43e3207b34a2b8de604c55b0aa74f6bd85fa074110164"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_inventory_key_proof(uuid,uuid)","bodySha256":"5ae5a016a2ca63d7fdb1c4fcdf7578bf39e6bfc509c5d80b8ca009ef7f64b677","definitionSha256":"0bdde56b6e9f2ff87d78a75c761c480868447dd256b2744c656f7e33d0e5f9d3"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_publish_import(jsonb,text)","bodySha256":"909b62e40c7e57db0a04f7f18a856c967c63cb3ed097f37179060888470a2ca7","definitionSha256":"bc3b34d0c9a39bdcb70f28d1ba2e199b085307b6cbf38c913367e6f3f427891a"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_closed_v2(uuid)","bodySha256":"68466068bb35b64ea72645fbce8086153bcd9c52c8c64ceb2ecc642b9106b9ea","definitionSha256":"f987f9482748644391e6576fd9182e6145daa2e1691b1a2b62548fd882a10678"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)","bodySha256":"691ffc7ed56d358d840fcbe3d07398985581445875e75e243b439bf4730919b3","definitionSha256":"96928fad2da0372b934cf3556dab3419cb3c37cd5684f6f4845c0829a1d3f1f6"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_context_v2(uuid)","bodySha256":"672efa05ef1a0665e2c0f429a86a102bc62f3eb7f61ef71a9f4532337fff86c6","definitionSha256":"d93ccfc8d73cfc6e1a614bc263c90f4f096b3cf530a9a8e6b71644d937804e30"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_importer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_finish_v2(uuid)","bodySha256":"c20f8bc1c90f38157eb51ef13f710e632e2aae14eb37473655c58151ca9214b9","definitionSha256":"481b1c7e32dc988db3acde44b086df2b0b6755edba10d7b2204dd094d77ed8f3"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_initializer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_inspect_v2(jsonb,text)","bodySha256":"9f6a685206405c0e5b3275d9a14621a88d6815c790dde422fa7803d889d93fd5","definitionSha256":"35d16b4c33c029b59db184868abe2a1facea7c8d3517638c06f7768719fb4708"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_initializer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_prepare_v2(jsonb,text)","bodySha256":"57d682fb7066de41287b6bf03d6c430cc89572c413a8aba02a7ac81a4e3c84a1","definitionSha256":"ef774fdfed8f5d0e0b0a9ca7a37192240ff65c725ae76bd9213f62fd707cfcd2"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_importer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_step_v2(uuid,integer,text,jsonb)","bodySha256":"3586857822aa74df1ce60cf1de0fd660263919b4944379f337e3352b6603069c","definitionSha256":"812ec38e92fe458475628a3cd3f5a41e01d8917cf913bacfb8a2ce9613bef865"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_validate_context_v2(uuid,boolean)","bodySha256":"1921cdcda04b78f6bb37a30565a2b0798c4f575594af5df145e55df3c7648003","definitionSha256":"1152bfe1caf3e6366406f80af2ada9f27f80fcf8a282d45210f0ad47a860d94d"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_initializer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_verify_v2(jsonb,text)","bodySha256":"005f47f4925a9d4118d7dcc461a42fe2568a4cddd21b2e73f28bae18ba5892ee","definitionSha256":"5433d23324c4f4d999d086f22759363232ae5484de5591f0969dd37ede2b858c"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_importer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_zero_amount_archive_trace(uuid)","bodySha256":"f45ff8ef2c47db7e049178c04e48379bed1e2975f88a084b335e6c26ac856782","definitionSha256":"cf893014b78bd902da0e6d438e4699a6947618a05db9c501346bcb70a625cc40"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.transfer_header_audit_values(naijue_erp.transfer_header)","bodySha256":"f3795ec8bb218f81d9f274f794796584d1dd86ee3a2c841dd1cab95b11db6852","definitionSha256":"e985ac45a3e06f38a82ee594a5cb9faa8b0b74914d8a05f9e777f3996aa2aeac"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.transfer_line_audit_values(naijue_erp.transfer_line)","bodySha256":"ce924832c6a9b4a762ff80e031279273f521e4e17139c7d89a4930004313f49e","definitionSha256":"82ef2ea7039ed9294355eceba248a9ee8b0ba4c41516bd3109e2b9f94db325ae"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.unified_document_snapshot(text,uuid)","bodySha256":"5b5b17b5b977321452ebe545825c2df19527a9e0072cb9ed0ab3ec102e02e7ed","definitionSha256":"b0401822d6d16c0f36e1837168d594dbe16619ada8f4534bc289ac62fc61e478"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.unified_sales_header_audit_values(naijue_erp.sales_header)","bodySha256":"cb5c332b2f8aaf99cca4a7c24234060fb74d8990a9d1cac252d13862cc23e91d","definitionSha256":"77869b04461ae450b28e4375f2f4d3d63ab640f39053c944713cc7b34a2e7ccc"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.unified_sales_line_audit_values(naijue_erp.sales_line)","bodySha256":"f3635675d41b2644a5cb002e84a4b4a6b4b979fbd4e6e22362db4181f59548ae","definitionSha256":"ffb2bd962351c4ef249c9c3654e65d4685bea819a032d3cfd0139e8f016dea38"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_runtime_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.unified_sales_settlement_audit_values(naijue_erp.sales_settlement)","bodySha256":"32b79f3e0708ef9839a278bf4e3b628ca072f922bbbf297ab23f7368ace4be54","definitionSha256":"4ea94c71bc4d61372f6909f4ac1e6540b44e83173adb67a9f13b7e3525cfdf17"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.valid_history_counts(jsonb)","bodySha256":"6c143e2bf81bcd53e2c9074aa2ab4e1781c746bc7a99bb0064f378f77de80280","definitionSha256":"75b66dfba94456f71ed1d06f97ec8c79fa188ba3b1240fb2b39a5c33e3549bdd"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.valid_product_season_ids(uuid[])","bodySha256":"b6b3932264857c59998025cece6241a4e819b80f9bc72e6bf0ed4e907890cc65","definitionSha256":"1f8215e042321e89e79c7da5ba52c40f003efac12ae4385cea28f7e1e56278cc"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_available_administrator_commit()","bodySha256":"3a9a1bea930614761185af90b8591a539b855647974b68b004869c80f5e5ba18","definitionSha256":"635a06e392231001a30980a543b928696900c5f1434eee73cbb7dface5b98855"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_baseline_source_commit()","bodySha256":"c5f0eb66c654852f8cb4dfa181e594304b65400f1538135f91701afabe14b1f4","definitionSha256":"77725aa3eed5c7c3cde674c3ec40fe131046ebce4945afe3944abc8b37f34fc1"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_category_final_component()","bodySha256":"f6eba82eceeaf19ad781500cebcfc5b515f38bf11ed428d41897e909b821a07d","definitionSha256":"d30bdb2c9c31fd6d0fa784d65b2cf97c9f027739035b95f20f273ab6a886bd5a"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_document_specification_commit()","bodySha256":"5c6dc02661516e469ebdada8469b4ac9626b77dbc26be026e11c06db759da047","definitionSha256":"408e537eaf1afe296c391424f94fd8a110f8440ee45e0172f5c79bd7b188a4d6"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_exact_native_reversal()","bodySha256":"4fc5952fe054d3c429c601c29b0d84d61cdae8ecf893eafb3d7e06e144b7dd86","definitionSha256":"0a04d47f40b01c796049d5104c54a85c245f95053b2c703d7e22b151a2490598"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_history_numeric_balance_commit()","bodySha256":"6766a0a3d31ceaecd363f01d13f1c749769303ff53eb8ff62d86aacc853e2d0a","definitionSha256":"41286367904c6c969d8d11025d1035cc295978bf1909f63ba513160cfd2f7c2a"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_history_numeric_receipt_commit()","bodySha256":"62ac483bf4cae3d87b5268574b3797533c27ef9e802bd7e1af7618a02e0963d1","definitionSha256":"530b72522c26cb05a9a2aa0f78f8fd6a4409b53061daa243a65a51a8c92fce79"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_import_accounting_baseline_commit()","bodySha256":"fa29bffe3a186de0f6d6fec85f23352afb57e9d8fe8ca6d92c948afff60025e1","definitionSha256":"ac9bed33cf5727d8733e9f999a4bca2fd517ffbd5c3aa5be1ee2a2b6d64be236"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_import_accounting_checkpoint_commit()","bodySha256":"b6e35be539a377241faedf36c616fe941e26b4b132baf822b9fa35e9d7ffbe3d","definitionSha256":"375f28bd5997233353725ee8c88d4a252b8fe0d126d35949f5ca0c5b81cb5f01"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_import_accounting_final_record_commit()","bodySha256":"2fc1ae00d5081ab5a28a0b02578aec6f77c104d26086e1157db96144d5b40d13","definitionSha256":"4bead0cad2e3cd4a22705935a8e173016a20fcfcc07d9e2b70af1c0589c2e278"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_import_batch_commit()","bodySha256":"b6e35be539a377241faedf36c616fe941e26b4b132baf822b9fa35e9d7ffbe3d","definitionSha256":"c8dc769373ce0013f3e0de1b7f1d6a68896ae2e7a3b06dba20b7073b079a2fc0"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_import_operation()","bodySha256":"4f5f0c85675b2505cf8f86c17d43a7082e4cf1e0be990c4840e452cdaa03fae6","definitionSha256":"3f35aeea7751ee2175ad3a20fb5709be51889a02e14fcabb6b260fd8aef8d958"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_import_publish(uuid,jsonb)","bodySha256":"873d1943b1ada13eeef43f6d28cb792755de48c461b1ebee7810e5278cd5d6e3","definitionSha256":"a9bf8fc095a06d34ff3bf821b2074d1c779a955e8794458715ae62daf94901d3"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_import_source_commit()","bodySha256":"428b38d454d4036634fd82e0a41e0c218a545ac5918dfa40a999d44e3b01f48b","definitionSha256":"2d67c951853aeba999034a4b6572e75949b03dd787e8087c284234347f40d15e"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_ledger_receipt_source()","bodySha256":"26f2f325172ef2878d4dffb4f1740d680e63458abd4b25e7a693e352664d15da","definitionSha256":"265eb0337a2a8ee90043cf5a5ed1bc6b662bb47c09edca198fde4282ca1ae7c0"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_maintenance_receipt_commit()","bodySha256":"77679e1e21858ae64ac1225660cf7a692f63b097d538254829def8164ea33ac5","definitionSha256":"c6b837b0611919173ae4caa9ca38d83d8c94812071c9490fa2675951499c45e1"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_maintenance_root_commit()","bodySha256":"bf853800c33c492dd0b8224e489c42dfb1c9a046231001a3d42be830a257f479","definitionSha256":"e61d45532c35fe568bf45745e43d401c69c3b5dce03601319556117ac8c8dcea"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_native_creation_commit()","bodySha256":"a505ceb68946cc14a69b181cd43d6cebbedca9e9ea453c9920c243892f537cd7","definitionSha256":"10ffffe6cd6db34f9a01fe3e6e1ec6aac8143487bc54ee9619270b5db90fff4f"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_party_native_commit()","bodySha256":"dba217f39c61d3f4741a72a565851a41caaa18e44fb57aa2f8e3473d20810762","definitionSha256":"920144e5b896809276e60c20dcaf9d5e2f6cd8a34aa1dbbcbb6769e1567da7ef"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_party_receipt_commit()","bodySha256":"fafc3389b3458b6d8ec4cad15f6f926dcc20bb059a819c496ed4db260d06b426","definitionSha256":"367d6f941c2f33959a4443e93ee0e018caecf4fdeee95ed184b67094444ed392"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_recorded_live_balance_commit()","bodySha256":"b32828510d3b85ae04c9d3849bcc494abe3cf337f0908996d72142fc171fb523","definitionSha256":"c179f472c1296d2f5c67daf27c7db9bd52bb83b87f1f102ea65d4fb0c8453be5"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_sales_commit()","bodySha256":"9fb5cba9244e3114b3734031673af9075ba491310431b75919cd476404626672","definitionSha256":"a950c449ec1ce9d42b7c9a78b5d2649ebaf89004df3fefead29cc2dc58825be4"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_sales_effect()","bodySha256":"6cfa34cd77905b50cc258b855109174f90a9d6d18c55e6dc884b2deca088bbca","definitionSha256":"55aa5c8a01806c6dc9ab155f7eb8de37fdefafedc86343251d60ef5b3537888c"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_sales_settlement()","bodySha256":"580340f008dcf9652fb18e041dde2b63ae2aa72abde3c5e8a772cb13cfb0990f","definitionSha256":"052f87f877666f0c9af3bbb9e8d2ffde39940d548c81f184840c4d73de8b8ee4"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_sparse_balance_commit()","bodySha256":"9f983ba16933b73d23fda0d957f4f93dc99cd6d4dc877cd826b11c48184a1d51","definitionSha256":"6beeec5de448b44062c0244a03f0b44c9f21d32ed0b9d1a3e8dd189e597e15d1"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_transfer_balance_commit()","bodySha256":"9bfaa1cdf1dea76ada35bae56dd40cb3e27c6acd28a93905ee2f06d17a8b2abb","definitionSha256":"76d77b6741db491376128c3e298833d7f1a765b17334b3afe6150f4031266192"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_transfer_commit()","bodySha256":"5d5bb1cea93e658a8d3d1fd0a7146e12e2748b089f942e5d3294e5d78626667b","definitionSha256":"7d7c0d30560fd51a396c1e3798dfa37285d676825390d19310ab7b3cc71a536e"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_transfer_effect()","bodySha256":"6c1f9a7133b8c896cd7f08a2227db891c48a28cbb6d9f783e6673ba05607ea36","definitionSha256":"dc0b3554f66f805402279634c5c8643e42aa1397f50da4746d98e1732e6694c7"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_transfer_header_commit()","bodySha256":"790e449c0931268c220711fa1d6b85a627ec476a337992dea68f2856664ab4f4","definitionSha256":"ca26353a21e3d863daa307e29282ea8dfcc4a99a7e0de19c7e7599dc1c290c65"},{"acl":null,"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_transfer_line_commit()","bodySha256":"55f8b1f1723c545fdb10e64321d03d5e80a10f63c8c90b374ef7f7426ef36239","definitionSha256":"264bd7807c879a155ce5241d0947bbab750b48b51a8a017ab09dfdd4bf9dc6e4"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_unified_baseline_reversal()","bodySha256":"e79f446269183dc9af235f7408344462e933f4ddd687231a671fc8b195923aed","definitionSha256":"a52438c6dcbb516779082485ffd193b2c1ff96bb2c70cb36047ba7f71bddceae"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_unified_ordinary_operation()","bodySha256":"4df5ec2f7c3a25d2461a56586f83f20d63773f01e6ca80b9c45429676a1969a4","definitionSha256":"46134f83af3893b783c77e9f8ba1d4c3c7706f229244b64c5ee817423a7b8508"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_unified_sales_header_commit()","bodySha256":"a8ce6dd5da8e1098f097ffed58304b2ab857b5b576e4e868804f76d5018a6339","definitionSha256":"2f1f2d060a85455368679f15ef682264f30c63ac689cd866b264ebcd07538f4f"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_unified_sales_line_commit()","bodySha256":"a31692ba5b18b9da6701ccd12d3101af1a5e85ba15b60e1e7150a6e4723d8ef5","definitionSha256":"f740ea70fbdab8ab0bcec730c2f9b9e722284e4064063345ba1c4609c467f484"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.validate_unified_sales_settlement_commit()","bodySha256":"d2da5c47e935406e114fc06a487f128fbbe7d370d9b204ac10df956cba7d9abd","definitionSha256":"2115b6c58d91cdd308ce53f2d1fdd024b1687d855e681364ec6d325727b04e9b"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_batched_import_inspect_kernel_v1(jsonb,jsonb,text)","bodySha256":"f72f28bbdf1b445fe51e2b82e201a07c066b63ae6c913c9cd6f595d646965908","definitionSha256":"206bb04cb10d126c89ce85de5cb61f5665b5e3add35a63700a78cf12568ad494"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_importer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_batched_import_inspect_v1(jsonb,jsonb)","bodySha256":"7d32f68a9ca8da595334cddbd18b09538163e6b2879bbd7f7bca8aa21fd2b0a8","definitionSha256":"4213c9ccea4932c6e16adca98d7d7eb08b5d1c87711d68d09303fcbc0be8a7b2"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_batched_import_assert_group_v1(uuid,jsonb)","bodySha256":"85cf4b9ceb0ea0f0615955336981a3fca3eac832d9cd0e5534824e6ee8d928be","definitionSha256":"198fafdd341534a24b4b06eaee0f97aeda8720b46780dd5e2f03850975a285c0"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_importer_2393dbc6db9581c2=X/erp35_owner_20261110_r3","erp_unified27_initializer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_batched_import_step_v1(jsonb,jsonb,integer,text,jsonb,text)","bodySha256":"4f0fdf5c6c9876bd294250d010dbfcacda1af2002f43b7997ed6f4f0555bae76","definitionSha256":"2ae9e852840a2590e9fb50c3399a35ef71aedbea940822748da7a03b5c42d15c"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3","erp_unified27_importer_2393dbc6db9581c2=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_batched_import_complete_v1(jsonb,jsonb)","bodySha256":"20b676b0da8b22335b62f3ec14fa744922fe87ebed8ab9e16f9fc2c66a3e3464","definitionSha256":"a85fee7929293a06b9def5c00af637831890394225c95fd95803bbb1437d1d38"},{"acl":["erp35_owner_20261110_r3=X/erp35_owner_20261110_r3"],"owner":"erp35_owner_20261110_r3","signature":"naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer,jsonb)","bodySha256":"ed028cc873d9d4dd556dd60b790fca8ef912550b463a949736f214acefd5dcbd","definitionSha256":"ed9e5daa0797e7ced0caa920f4c6d8ad465c7edcf01ed20b903d5f3f1d4ee869"}]$target_routines$::jsonb;
 before_metadata jsonb; after_metadata jsonb; expected jsonb; routine jsonb; actual jsonb;
BEGIN
 PERFORM pg_catalog.set_config('search_path','pg_catalog',true);
 PERFORM pg_catalog.set_config('quote_all_identifiers','off',true);
 IF current_user<>'erp35_owner_20261110_r3' OR current_setting('server_version_num')<>'170011' THEN
  RAISE EXCEPTION 'HALL165_REVERSE_OWNER_OR_VERSION_DIFFERS' USING ERRCODE='55000';
 END IF;
 -- Serialize with the existing inventory-cutoff / import transaction lock.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('naijue:inventory-cutoff',0));
 FOR phase IN 0..1 LOOP
  expected:=CASE WHEN phase=0 THEN source_model ELSE target_model END;
  IF (SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>jsonb_array_length(expected) THEN
   RAISE EXCEPTION 'HALL165_REVERSE_ROUTINE_COHORT_DIFFERS' USING ERRCODE='55000';
  END IF;
  FOR routine IN SELECT value FROM jsonb_array_elements(expected) LOOP
   SELECT jsonb_build_object('bodySha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
     'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
     'owner',pg_get_userbyid(p.proowner),'acl',CASE WHEN p.proacl IS NULL THEN NULL ELSE
        (SELECT jsonb_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(p.proacl) AS a) END)
    INTO actual FROM pg_catalog.pg_proc p
   WHERE p.oid=to_regprocedure(routine->>'signature') AND p.pronamespace='naijue_erp'::regnamespace;
   IF actual IS DISTINCT FROM routine-'signature' THEN
    RAISE EXCEPTION 'HALL165_REVERSE_ROUTINE_DIFFERS %',routine->>'signature' USING ERRCODE='55000';
   END IF;
  END LOOP;
  SELECT jsonb_object_agg(p.oid::text,to_jsonb(p)-'prosrc') INTO after_metadata
  FROM pg_catalog.pg_proc p WHERE p.pronamespace='naijue_erp'::regnamespace
   AND p.oid<>ALL(ARRAY[coalesce(to_regprocedure('naijue_erp.standard_history_hall_projection_relation_v1()')::oid,0),
                       coalesce(to_regprocedure('naijue_erp.standard_history_hall_projection_store_v1(jsonb,jsonb,jsonb,jsonb)')::oid,0),
                       coalesce(to_regprocedure('naijue_erp.assert_final_history_origin_v1(uuid,uuid,uuid,jsonb)')::oid,0),
                       coalesce(to_regprocedure('naijue_erp.assert_document_migration_checked_v1(uuid,uuid)')::oid,0)]);
  IF phase=0 THEN
   before_metadata:=after_metadata;
   EXECUTE $ddl_0$CREATE OR REPLACE FUNCTION naijue_erp.assert_document_migration(operation uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'naijue_erp', 'pg_temp'
AS $function$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; b naijue_erp.import_batch%ROWTYPE;
 s naijue_erp.import_record%ROWTYPE; baseline naijue_erp.import_batch%ROWTYPE; snap jsonb; evidence jsonb; h jsonb; expected_type text; retain_settlement_difference boolean:=false;
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
 IF r.target_type='SALES' AND h->>'status'='APPROVED' AND jsonb_array_length(snap->'settlements')>0
  AND (h->>'net_due')::numeric IS DISTINCT FROM (SELECT sum((st->>'amount')::numeric*CASE st->>'direction' WHEN 'RECEIVE' THEN 1 ELSE -1 END) FROM jsonb_array_elements(snap->'settlements') st) THEN
  DECLARE sr_header jsonb;sr_source_audit naijue_erp.audit_change%ROWTYPE;sr_init_receipt naijue_erp.operation_receipt%ROWTYPE;sr_init_audit naijue_erp.audit_change%ROWTYPE;
   sr_request jsonb;sr_wire jsonb;sr_approval jsonb;sr_doc jsonb;sr_row jsonb;sr_proof jsonb;sr_actual jsonb;sr_count bigint;
  BEGIN
   sr_header:=naijue_erp.standard_import_record_proof(s.id);
   SELECT * INTO STRICT sr_source_audit FROM naijue_erp.audit_change WHERE operation_id=(sr_header->>'operation_id')::uuid;
   SELECT * INTO STRICT sr_init_receipt FROM naijue_erp.operation_receipt WHERE id=(sr_source_audit.after_values->'whole_package_v2'->>'root_operation')::uuid;
   SELECT * INTO STRICT sr_init_audit FROM naijue_erp.audit_change WHERE operation_id=sr_init_receipt.id;
   sr_request:=sr_init_audit.after_values->'request';sr_wire:=sr_request->'payload'->'historical_settlement_retention_approval';
   IF sr_init_receipt.action IS DISTINCT FROM 'IMPORT_INITIALIZE_CURRENT_ADMIN' OR sr_init_receipt.status IS DISTINCT FROM 'COMMITTED'
    OR sr_init_receipt.target_type IS DISTINCT FROM 'IMPORT' OR sr_init_receipt.target_id IS DISTINCT FROM baseline.id
    OR sr_init_audit.object_type IS DISTINCT FROM 'IMPORT' OR sr_init_audit.object_id IS DISTINCT FROM baseline.id
    OR sr_init_audit.action IS DISTINCT FROM sr_init_receipt.action OR sr_init_audit.actor_account_id IS DISTINCT FROM sr_init_receipt.actor_account_id
    OR sr_init_audit.occurred_at IS DISTINCT FROM sr_init_receipt.completed_at OR sr_request->>'operation_id' IS DISTINCT FROM sr_init_receipt.id::text
    OR sr_request->>'batch_id' IS DISTINCT FROM baseline.id::text OR sr_request->>'namespace' IS DISTINCT FROM b.source_name
    OR sr_request->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash OR sr_request->'payload'->>'document_batch_id' IS DISTINCT FROM b.id::text
    OR sr_request->'payload'->>'alignment_sha256' IS DISTINCT FROM evidence->>'coverageDigest'
    OR jsonb_typeof(sr_wire) IS DISTINCT FROM 'object' OR encode(sha256(convert_to(sr_wire->>'utf8','UTF8')),'hex') IS DISTINCT FROM sr_wire->>'sha256' THEN
    RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_MIGRATION_ORIGIN_REQUIRED' USING ERRCODE='23514'; END IF;
   sr_approval:=(sr_wire->>'utf8')::jsonb;
   IF sr_approval->>'format_version' IS DISTINCT FROM 'HISTORICAL_SETTLEMENT_RETENTION_V1' OR sr_approval->>'source_namespace' IS DISTINCT FROM b.source_name OR (jsonb_array_length(sr_approval->'documents')<>25 AND NOT(jsonb_array_length(sr_approval->'documents')=24 AND (sr_wire->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' OR (sr_wire->>'sha256'='b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05' AND (sr_approval->>'source_namespace') IS NOT DISTINCT FROM 'naijue:tplus:20261102' AND (sr_request->>'package_manifest_sha256') IS NOT DISTINCT FROM '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679')))) THEN
    RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
   SELECT value INTO STRICT sr_doc FROM jsonb_array_elements(sr_approval->'documents') WHERE value->>'sales_id'=h->>'id';
   IF sr_doc->>'sales_source_key' IS DISTINCT FROM sr_header->>'source_key' OR sr_doc->>'business_type' IS DISTINCT FROM h->>'business_type'
    OR sr_doc->>'status' IS DISTINCT FROM h->>'status' OR (sr_doc->>'gross_amount')::numeric IS DISTINCT FROM (h->>'gross_amount')::numeric
    OR (sr_doc->>'order_discount')::numeric IS DISTINCT FROM (h->>'order_discount')::numeric OR (sr_doc->>'net_due')::numeric IS DISTINCT FROM (h->>'net_due')::numeric
    OR NOT((sr_doc->'source_refs') @> (sr_header->'source_refs') AND (sr_header->'source_refs') @> (sr_doc->'source_refs'))
    OR jsonb_array_length(sr_doc->'source_refs') IS DISTINCT FROM jsonb_array_length(sr_header->'source_refs')
    OR jsonb_array_length(sr_doc->'settlements') IS DISTINCT FROM jsonb_array_length(snap->'settlements') THEN
    RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_MIGRATION_SOURCE_DIFFERS' USING ERRCODE='23514'; END IF;
   FOR sr_row IN SELECT value FROM jsonb_array_elements(sr_doc->'settlements') LOOP
    SELECT naijue_erp.standard_import_record_proof(src.id) INTO STRICT sr_proof FROM naijue_erp.import_record src WHERE src.import_batch_id=b.id AND src.target_type='SALES_SETTLEMENT' AND src.source_entity_type='SALES_SETTLEMENT' AND src.target_id=(sr_row->'fields'->>'id')::uuid;
    SELECT value INTO STRICT sr_actual FROM jsonb_array_elements(snap->'settlements') WHERE value->>'id'=sr_row->'fields'->>'id';
    IF sr_row->>'source_key' IS DISTINCT FROM sr_proof->>'source_key' OR sr_row->'fields' IS DISTINCT FROM sr_proof->'fields'
     OR NOT((sr_row->'source_refs') @> (sr_proof->'source_refs') AND (sr_proof->'source_refs') @> (sr_row->'source_refs'))
     OR jsonb_array_length(sr_row->'source_refs') IS DISTINCT FROM jsonb_array_length(sr_proof->'source_refs')
     OR to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_settlement,sr_row->'fields')) IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_settlement,sr_actual)) THEN
     RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_MIGRATION_SOURCE_DIFFERS' USING ERRCODE='23514'; END IF;
   END LOOP;
   retain_settlement_difference:=true;
  END;
 END IF;
 IF r.target_type='SALES' THEN
  DECLARE amount_header jsonb; amount_proof jsonb; amount_evidence jsonb; amount_fact jsonb;
   amount_init jsonb; amount_init_receipt naijue_erp.operation_receipt%ROWTYPE; amount_init_audit naijue_erp.audit_change%ROWTYPE;
   amount_line jsonb; amount_source_audit naijue_erp.audit_change%ROWTYPE; amount_approved jsonb;
  BEGIN
   IF (h->>'gross_amount')::numeric IS DISTINCT FROM (SELECT coalesce(sum((ln->>'line_amount')::numeric),0) FROM jsonb_array_elements(snap->'lines') ln WHERE ln->'is_current'='true'::jsonb)
    OR (h->>'net_due')::numeric IS DISTINCT FROM (h->>'gross_amount')::numeric-(h->>'order_discount')::numeric
    OR (NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'lines') ln WHERE ln->'is_current'='true'::jsonb AND ln->'allocated_discount'='null'::jsonb)
     AND (SELECT coalesce(sum((ln->>'allocated_discount')::numeric),0) FROM jsonb_array_elements(snap->'lines') ln WHERE ln->'is_current'='true'::jsonb) IS DISTINCT FROM (h->>'order_discount')::numeric)
    OR (h->>'status'='APPROVED' AND NOT retain_settlement_difference AND jsonb_array_length(snap->'settlements')>0 AND (SELECT sum((st->>'amount')::numeric*CASE st->>'direction' WHEN 'RECEIVE' THEN 1 ELSE -1 END) FROM jsonb_array_elements(snap->'settlements') st) IS DISTINCT FROM (h->>'net_due')::numeric) THEN
    RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_KNOWN_TOTALS_DIFFER' USING ERRCODE='23514'; END IF;
   FOR amount_line IN SELECT value FROM jsonb_array_elements(snap->'lines')
    WHERE (value->>'line_amount')::numeric IS DISTINCT FROM (value->>'quantity')::numeric*(value->>'deal_price')::numeric LOOP
    amount_header:=naijue_erp.standard_import_record_proof(s.id);
    SELECT naijue_erp.standard_import_record_proof(src.id) INTO STRICT amount_proof FROM naijue_erp.import_record src
     WHERE src.import_batch_id=b.id AND src.target_type='SALES_LINE' AND src.source_entity_type='SALES_LINE' AND src.target_id=(amount_line->>'id')::uuid;
    SELECT * INTO STRICT amount_source_audit FROM naijue_erp.audit_change WHERE operation_id=(amount_proof->>'operation_id')::uuid;
    SELECT * INTO STRICT amount_init_receipt FROM naijue_erp.operation_receipt WHERE id=(amount_source_audit.after_values->'whole_package_v2'->>'root_operation')::uuid;
    SELECT * INTO STRICT amount_init_audit FROM naijue_erp.audit_change WHERE operation_id=amount_init_receipt.id;
    amount_init:=amount_init_audit.after_values->'request'->'payload';
    amount_evidence:=amount_proof->'historical_line_amount_evidence';amount_fact:=amount_evidence->'fact';
    IF amount_init_receipt.action IS DISTINCT FROM 'IMPORT_INITIALIZE_CURRENT_ADMIN' OR amount_init_receipt.status IS DISTINCT FROM 'COMMITTED'
     OR amount_init_receipt.target_id IS DISTINCT FROM baseline.id OR amount_init_receipt.target_type IS DISTINCT FROM 'IMPORT'
     OR amount_init_audit.object_type IS DISTINCT FROM 'IMPORT' OR amount_init_audit.object_id IS DISTINCT FROM baseline.id
     OR amount_init_audit.actor_account_id IS DISTINCT FROM amount_init_receipt.actor_account_id
     OR amount_init_audit.occurred_at IS DISTINCT FROM amount_init_receipt.completed_at
     OR amount_init_audit.action IS DISTINCT FROM amount_init_receipt.action
     OR amount_init_audit.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
     OR amount_init_audit.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
     OR amount_init->>'document_batch_id' IS DISTINCT FROM b.id::text
     OR coalesce(amount_init->>'schema_declarations_sha256','') NOT IN ('f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b')
     OR jsonb_typeof(amount_init->'historical_line_amount_approval') IS DISTINCT FROM 'object'
     OR amount_evidence->>'format_version' IS DISTINCT FROM 'HISTORICAL_LINE_AMOUNT_BOUND_V1'
     OR amount_evidence->>'attestation_sha256' IS DISTINCT FROM amount_init->'historical_line_amount_approval'->>'sha256'
     OR encode(sha256(convert_to(amount_init->'historical_line_amount_approval'->>'utf8','UTF8')),'hex') IS DISTINCT FROM amount_evidence->>'attestation_sha256' THEN
     RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_MIGRATION_ORIGIN_REQUIRED' USING ERRCODE='23514'; END IF;
    SELECT value INTO STRICT amount_approved FROM jsonb_array_elements(((amount_init->'historical_line_amount_approval'->>'utf8')::jsonb)->'lines') WHERE value->>'line_id'=amount_line->>'id';
    IF amount_fact IS DISTINCT FROM amount_approved
     OR amount_fact->>'sales_id' IS DISTINCT FROM h->>'id'
     OR amount_fact->>'sales_source_key' IS DISTINCT FROM amount_header->>'source_key'
     OR amount_fact->>'line_source_key' IS DISTINCT FROM amount_proof->>'source_key'
     OR amount_fact->'quantity' IS DISTINCT FROM amount_line->'quantity'
     OR amount_fact->'deal_price' IS DISTINCT FROM amount_line->'deal_price'
     OR amount_fact->'line_amount' IS DISTINCT FROM amount_line->'line_amount'
     OR to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_line,amount_proof->'fields')) IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_line,amount_line))
     OR NOT((amount_fact->'source_refs') @> (amount_proof->'source_refs') AND (amount_proof->'source_refs') @> (amount_fact->'source_refs'))
     OR jsonb_array_length(amount_fact->'source_refs') IS DISTINCT FROM jsonb_array_length(amount_proof->'source_refs')
     OR NOT((amount_fact->'sales_source_refs') @> (amount_header->'source_refs') AND (amount_header->'source_refs') @> (amount_fact->'sales_source_refs'))
     OR jsonb_array_length(amount_fact->'sales_source_refs') IS DISTINCT FROM jsonb_array_length(amount_header->'source_refs')
     OR encode(sha256(convert_to(jsonb_build_object('source_key',amount_proof->>'source_key','fields',amount_proof->'fields','source_refs',amount_proof->'source_refs','historical_line_amount_evidence',amount_evidence)::text,'UTF8')),'hex') IS DISTINCT FROM (SELECT src.source_record_hash FROM naijue_erp.import_record src WHERE src.id=(amount_proof->>'id')::uuid) THEN
     RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_MIGRATION_SOURCE_DIFFERS' USING ERRCODE='23514'; END IF;
   END LOOP;
  END;
 END IF;
 -- All actual detail identities are mapped once, including zero-quantity lines and
 -- every settlement occurrence; many-to-one SKU aliases remain legal separately.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'lines') item
           WHERE NOT coalesce(pg_input_is_valid(item->>'id','uuid'),false))
  OR (r.target_type='SALES' AND EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'settlements') item
           WHERE NOT coalesce(pg_input_is_valid(item->>'id','uuid'),false))) THEN
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'lines') item WHERE NOT EXISTS(SELECT 1 FROM naijue_erp.import_record m
   WHERE m.import_batch_id=b.id AND m.status='IMPORTED' AND m.target_type=CASE r.target_type WHEN 'SALES' THEN 'SALES_LINE' ELSE 'TRANSFER_LINE' END
     AND m.source_entity_type=m.target_type AND m.target_id=(item->>'id')::uuid))
  OR (r.target_type='SALES' AND EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'settlements') item WHERE NOT EXISTS(SELECT 1 FROM naijue_erp.import_record m
    WHERE m.import_batch_id=b.id AND m.status='IMPORTED' AND m.target_type='SALES_SETTLEMENT' AND m.source_entity_type=m.target_type AND m.target_id=(item->>'id')::uuid))) THEN
  RAISE EXCEPTION 'migration requires complete stable detail/settlement source mappings' USING ERRCODE='23514'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'lines') item WHERE NOT EXISTS(
     SELECT 1 FROM LATERAL (
      SELECT m.import_batch_id,m.status,m.source_entity_type,m.target_type FROM naijue_erp.import_record m
      WHERE m.target_type=CASE r.target_type WHEN 'SALES' THEN 'SALES_LINE' ELSE 'TRANSFER_LINE' END AND m.target_id=(item->>'id')::uuid OFFSET 0
     ) m WHERE m.import_batch_id=b.id AND m.status='IMPORTED' AND m.source_entity_type=m.target_type))
    OR (r.target_type='SALES' AND EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'settlements') item WHERE NOT EXISTS(
     SELECT 1 FROM LATERAL (
      SELECT m.import_batch_id,m.status,m.source_entity_type,m.target_type FROM naijue_erp.import_record m
      WHERE m.target_type='SALES_SETTLEMENT' AND m.target_id=(item->>'id')::uuid OFFSET 0
     ) m WHERE m.import_batch_id=b.id AND m.status='IMPORTED' AND m.source_entity_type=m.target_type))) THEN
   RAISE EXCEPTION 'migration requires complete stable detail/settlement source mappings' USING ERRCODE='23514'; END IF;
 END IF;
END $function$
$ddl_0$;
   EXECUTE $ddl_1$CREATE OR REPLACE FUNCTION naijue_erp.standard_import_record_proof(record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'naijue_erp', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE s naijue_erp.import_record%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; b naijue_erp.import_batch%ROWTYPE; pointer jsonb; item jsonb;
 captures jsonb;capture jsonb;target_snapshot jsonb;master_proof jsonb;approval jsonb;approved jsonb;
 master_s naijue_erp.import_record%ROWTYPE;master_a naijue_erp.audit_change%ROWTYPE;
 root_a naijue_erp.audit_change%ROWTYPE;root_r naijue_erp.operation_receipt%ROWTYPE;
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
 -- The row digest covers the original null intent, never the captured output.
 IF item ? 'historical_hall_evidence' THEN
  IF item->>'source_hash' IS DISTINCT FROM encode(sha256(convert_to((jsonb_build_object('source_key',item->'source_key','fields',item->'fields','source_refs',item->'source_refs')
   ||CASE WHEN item ? 'zero_amount_archive' THEN jsonb_build_object('zero_amount_archive',item->'zero_amount_archive') ELSE '{}'::jsonb END
   ||CASE WHEN item ? 'explicit_zero_evidence' THEN jsonb_build_object('explicit_zero_evidence',item->'explicit_zero_evidence') ELSE '{}'::jsonb END
   ||jsonb_build_object('historical_hall_evidence',item->'historical_hall_evidence'))::text,'UTF8')),'hex') THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_INPUT_HASH_INVALID' USING ERRCODE='23514'; END IF;
 END IF;
 captures:=a.after_values->'historical_hall_target_captures';
 IF captures IS NOT NULL THEN
  IF jsonb_typeof(captures) IS DISTINCT FROM 'object' OR captures='{}' OR a.after_values->>'phase' IS DISTINCT FROM 'DOCUMENTS'
   OR r.result_data->>'historicalHallTargetCapturesSha256' IS DISTINCT FROM encode(sha256(convert_to(captures::text,'UTF8')),'hex')
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(captures) k WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a.after_values->'records') x
    WHERE x->>'id'=k AND x->>'entity_type'='SALES_HEADER' AND x->'historical_hall_evidence'->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2'
     AND x->'historical_hall_evidence'->'target_snapshot'->'captured_at'='null'::jsonb))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(a.after_values->'records') x WHERE x->>'entity_type'='SALES_HEADER'
    AND x->'historical_hall_evidence'->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2'
    AND x->'historical_hall_evidence'->'target_snapshot'->'captured_at'='null'::jsonb AND NOT(captures ? (x->>'id'))) THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_MAP_INVALID' USING ERRCODE='23514'; END IF;
 ELSIF r.result_data ? 'historicalHallTargetCapturesSha256' THEN RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_MAP_REQUIRED' USING ERRCODE='23514'; END IF;
 IF item->'historical_hall_evidence'->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2'
  AND item->'historical_hall_evidence'->'target_snapshot'->'captured_at'='null'::jsonb THEN
  target_snapshot:=item->'historical_hall_evidence'->'target_snapshot';capture:=captures->(s.id::text);
  IF s.source_entity_type IS DISTINCT FROM 'SALES_HEADER' OR s.target_type IS DISTINCT FROM 'SALES_HEADER'
   OR jsonb_typeof(capture) IS DISTINCT FROM 'object'
   OR capture-ARRAY['warehouse_source_record_id','warehouse_operation_id','input_source_record_hash','warehouse_id','hall_id','version','captured_at']<>'{}'
   OR NOT(capture ?& ARRAY['warehouse_source_record_id','warehouse_operation_id','input_source_record_hash','warehouse_id','hall_id','version','captured_at'])
   OR capture->>'input_source_record_hash' IS DISTINCT FROM s.source_record_hash
   OR capture->'warehouse_id' IS DISTINCT FROM target_snapshot->'warehouse_id'
   OR capture->'hall_id' IS DISTINCT FROM target_snapshot->'hall_id' OR capture->'version' IS DISTINCT FROM target_snapshot->'version'
   OR item->'fields'->'warehouse_id' IS DISTINCT FROM capture->'warehouse_id' OR item->'fields'->'hall_id' IS DISTINCT FROM capture->'hall_id'
   OR jsonb_typeof(capture->'version') IS DISTINCT FROM 'number' OR (capture->>'version' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true
   OR (capture->>'version')::numeric>2147483647 OR jsonb_typeof(capture->'captured_at') IS DISTINCT FROM 'string'
   OR (capture->>'captured_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true
   OR NOT isfinite((capture->>'captured_at')::timestamptz) THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_TARGET_CAPTURE_INVALID' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT root_a FROM naijue_erp.audit_change WHERE operation_id=(a.after_values->'whole_package_v2'->>'root_operation')::uuid;
  SELECT * INTO STRICT root_r FROM naijue_erp.operation_receipt WHERE id=root_a.operation_id;
  SELECT * INTO STRICT master_s FROM naijue_erp.import_record WHERE id=(capture->>'warehouse_source_record_id')::uuid;
  master_proof:=naijue_erp.standard_import_record_proof(master_s.id);
  SELECT * INTO STRICT master_a FROM naijue_erp.audit_change WHERE operation_id=(capture->>'warehouse_operation_id')::uuid;
  approval:=(root_a.after_values->'request'->'payload'->'historical_hall_approval'->>'utf8')::jsonb;
  SELECT x INTO STRICT approved FROM jsonb_array_elements(approval->'records') x WHERE x->>'target_id'=s.target_id::text;
  IF root_r.status IS DISTINCT FROM 'COMMITTED' OR root_r.target_type IS DISTINCT FROM 'IMPORT' OR root_r.action IS DISTINCT FROM 'IMPORT_INITIALIZE_CURRENT_ADMIN'
   OR root_a.object_id IS DISTINCT FROM root_r.target_id OR root_a.object_type IS DISTINCT FROM 'IMPORT' OR root_a.action IS DISTINCT FROM root_r.action
   OR root_a.actor_account_id IS DISTINCT FROM root_r.actor_account_id OR root_a.occurred_at IS DISTINCT FROM root_r.completed_at
   OR root_r.actor_account_id IS DISTINCT FROM r.actor_account_id
   OR root_r.result_data->>'packageManifestSha256' IS DISTINCT FROM b.source_hash
   OR root_a.after_values->'whole_package_v2'->>'root_operation' IS DISTINCT FROM root_r.id::text
   OR root_a.after_values->'request'->>'batch_id' IS DISTINCT FROM root_r.target_id::text
   OR root_a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
   OR root_a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
   OR root_a.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM b.id::text
   OR root_a.after_values->'request'->'payload'->>'schema_declarations_sha256' IS DISTINCT FROM 'b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b'
   OR encode(sha256(convert_to(root_a.after_values->'request'->'payload'->'historical_hall_approval'->>'utf8','UTF8')),'hex') IS DISTINCT FROM root_a.after_values->'request'->'payload'->'historical_hall_approval'->>'sha256'
   OR approval->>'format_version' IS DISTINCT FROM 'HISTORICAL_SALES_HALL_APPROVAL_V2' OR approval->>'source_namespace' IS DISTINCT FROM b.source_name
   OR approved->'evidence' IS DISTINCT FROM item->'historical_hall_evidence' OR approved->>'source_key' IS DISTINCT FROM s.source_key
   OR NOT((approved->'source_refs') @> (item->'source_refs') AND (item->'source_refs') @> (approved->'source_refs'))
   OR jsonb_array_length(approved->'source_refs')<>jsonb_array_length(item->'source_refs')
   OR s.reviewed_at IS DISTINCT FROM r.completed_at OR master_s.reviewed_at IS DISTINCT FROM master_a.occurred_at
   OR master_s.import_batch_id IS DISTINCT FROM root_r.target_id OR master_s.source_system IS DISTINCT FROM b.source_name
   OR master_s.source_entity_type IS DISTINCT FROM 'WAREHOUSE' OR master_s.target_type IS DISTINCT FROM 'WAREHOUSE'
   OR master_s.target_id::text IS DISTINCT FROM capture->>'warehouse_id'
   OR master_s.source_key IS DISTINCT FROM approved->'target_initialization'->>'warehouse_source_key'
   OR master_proof->>'operation_id' IS DISTINCT FROM capture->>'warehouse_operation_id'
   OR master_proof->'fields'->'id' IS DISTINCT FROM capture->'warehouse_id'
   OR master_proof->'fields'->'hall_id' IS DISTINCT FROM capture->'hall_id' OR master_proof->'fields'->'version' IS DISTINCT FROM capture->'version'
   OR master_s.source_record_hash IS DISTINCT FROM encode(sha256(convert_to(jsonb_build_object('source_key',master_proof->'source_key','fields',master_proof->'fields','source_refs',master_proof->'source_refs')::text,'UTF8')),'hex')
   OR master_a.after_values->>'phase' IS DISTINCT FROM 'MASTER' OR master_a.object_id IS DISTINCT FROM root_r.target_id
   OR master_a.after_values->'whole_package_v2'->>'root_operation' IS DISTINCT FROM root_r.id::text
   OR (master_a.after_values->'whole_package_v2'->>'ordinal')::integer >= (a.after_values->'whole_package_v2'->>'ordinal')::integer
   -- Warehouse provenance can have committed in an earlier work batch.
   -- Root/actor/input/order are persistent identities; heap xmin is local.
   OR master_a.actor_account_id IS DISTINCT FROM root_r.actor_account_id
   OR master_a.after_values->'request'->>'plan_sha256' IS DISTINCT FROM root_a.after_values->'request'->>'plan_sha256'
   OR master_a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
   OR master_a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
   OR master_a.after_values->'request'->>'cutoff_at' IS DISTINCT FROM root_a.after_values->'request'->>'cutoff_at'
   OR a.after_values->'request'->>'plan_sha256' IS DISTINCT FROM root_a.after_values->'request'->>'plan_sha256'
   OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
   OR a.after_values->'request'->>'cutoff_at' IS DISTINCT FROM root_a.after_values->'request'->>'cutoff_at'
   OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM b.id::text
   OR root_a.id IS DISTINCT FROM root_r.id
   OR (capture->>'captured_at')::timestamptz<root_r.completed_at THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_MASTER_LINK_INVALID' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN item||CASE WHEN capture IS NOT NULL THEN jsonb_build_object('historical_hall_target_capture',capture) ELSE '{}'::jsonb END||jsonb_build_object('operation_id',r.id,'batch_id',b.id,'source_system',b.source_name,'source_hash',b.source_hash,'cutoff_at',b.cutoff_at,
  'current_operation',EXISTS(SELECT 1 FROM naijue_erp.operation_receipt rr
    JOIN naijue_erp.audit_change aa ON aa.operation_id=rr.id
    JOIN naijue_erp.import_record ss ON ss.id=s.id
    WHERE rr.id=r.id AND pg_current_xact_id_if_assigned() IS NOT NULL
      AND rr.xmin::text::bigint=mod(pg_current_xact_id_if_assigned()::text::numeric,4294967296)::bigint
      AND aa.xmin::text::bigint=rr.xmin::text::bigint
      AND ss.xmin::text::bigint=rr.xmin::text::bigint
      AND rr.completed_at=transaction_timestamp() AND aa.occurred_at=rr.completed_at
      AND ss.reviewed_at=rr.completed_at));
END $function$
$ddl_1$;
   EXECUTE $ddl_2$CREATE OR REPLACE FUNCTION naijue_erp.standard_whole_package_command_v2(request jsonb, private_parameter text, command_phase text, root_operation uuid, child_ordinal integer, work_batch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'naijue_erp', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE actor uuid; operation uuid; batch uuid; fingerprint text; prior naijue_erp.operation_receipt%ROWTYPE; prior_a naijue_erp.audit_change%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; baseline naijue_erp.import_batch%ROWTYPE; initial_request jsonb; payload jsonb; cp jsonb; old_cp jsonb; records jsonb:='[]';
 entry jsonb; fields jsonb; item jsonb; result jsonb; source_ids jsonb:='[]'; ledger_ids jsonb:='[]'; expected jsonb; actual jsonb; cfg jsonb; admin jsonb;
 table_name text; kind text; target uuid; record_id uuid; source_hash text; quantity bigint; counter text; action_name text; phase text; source_key text; file_ref text;
 n integer; source_count integer; total numeric; parsed jsonb; doc jsonb; doc_id uuid; child_op uuid; child_result jsonb; snap jsonb; anchor_baseline jsonb; key_proof jsonb; endpoints record;
 pk_exists boolean; registry_basis text; encoded text; parent_row record; any_rows boolean;
 visible_root_count bigint; foreign_import_found boolean;
 group_identity jsonb; group_descriptor jsonb; group_marker jsonb; group_read jsonb; first_r naijue_erp.operation_receipt%ROWTYPE;
 execution_contract jsonb; master_chunks_v2 boolean:=false; master_limit numeric:=500;
 max_master_chunk_rows integer:=500; expected_master_chunks integer;
 admin_provision_snapshot jsonb;
 whole_context jsonb; whole_marker jsonb; prior_rank integer; next_rank integer;
 hall_approval jsonb; hall_approved jsonb; hall_approvals jsonb; hall_evidence jsonb;
 hall_capture jsonb;hall_bridge jsonb;hall_resolution jsonb;hall_target jsonb;hall_member_count integer;
 hall_target_captures jsonb:='{}';hall_observation jsonb;hall_master_id uuid;hall_master_proof jsonb;hall_master_audit naijue_erp.audit_change%ROWTYPE;hall_actual jsonb;hall_decision jsonb; hall_decision_count integer:=0;
 hall_master_kind text; hall_master_key text; hall_master_target uuid;
 hall_master_record naijue_erp.import_record%ROWTYPE;
 amount_descriptor jsonb; amount_approval jsonb; amount_fact jsonb; amount_parent jsonb; amount_evidence jsonb; amount_facts_by_id jsonb;
 amount_ref_key text; amount_consumed bigint; amount_unique bigint;
 zero_descriptor jsonb;zero_evidence jsonb;zero_fact jsonb;zero_hash text;zero_sibling text;
 zero_index integer;zero_width integer;zero_consumed bigint;zero_unique bigint;
BEGIN
 group_identity:=work_batch->'identity';group_descriptor:=work_batch->'work_batch';
 IF group_identity->>'rootOperationId' IS DISTINCT FROM root_operation::text
  OR group_identity->>'namespace' IS DISTINCT FROM request->>'namespace'
  OR group_identity->>'packageSha256' IS DISTINCT FROM request->>'package_manifest_sha256'
  OR group_identity->>'planSha256' IS DISTINCT FROM request->>'plan_sha256'
  OR group_identity->>'cutoffAt' IS DISTINCT FROM request->>'cutoff_at'
  OR child_ordinal NOT BETWEEN (group_descriptor->>'first')::integer AND (group_descriptor->>'last')::integer
  OR child_ordinal IS NULL
  OR (command_phase='INITIALIZE' AND (request->>'batch_id' IS DISTINCT FROM group_identity->>'batchId'
      OR request->'payload'->>'document_batch_id' IS DISTINCT FROM group_identity->>'documentBatchId'))
  OR (CASE group_descriptor->>'phase'
    WHEN 'CORE' THEN command_phase='INITIALIZE'
    WHEN 'MASTER' THEN command_phase='MASTER'
    WHEN 'KEYS' THEN command_phase='KEYS'
    WHEN 'BASELINE_CLOSE' THEN command_phase='PUBLISH' AND request->'payload'->>'phase'='BASELINE'
    WHEN 'DOCUMENT_OPEN' THEN command_phase='DOCUMENTS' AND request->'payload'->>'mode'='STAGE'
    WHEN 'HISTORY' THEN command_phase='DOCUMENTS' AND request->'payload'->>'mode'='CHUNK'
    WHEN 'FINALIZE' THEN command_phase='PUBLISH' AND request->'payload'->>'phase'='DOCUMENTS'
    ELSE false END) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'BATCH_STEP_BINDING_INVALID' USING ERRCODE='23514'; END IF;
 PERFORM naijue_erp.cutoff_import_lock();
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:standard-work-batch:'||(group_descriptor->>'subBatchId'),0));
 IF child_ordinal=(group_descriptor->>'first')::integer THEN
  IF command_phase='INITIALIZE' THEN
   PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');
   group_read:=naijue_erp.standard_batched_import_inspect_kernel_v1(group_identity,group_descriptor,'INITIALIZER');
  ELSE
   group_read:=naijue_erp.standard_batched_import_inspect_v1(group_identity,group_descriptor);
  END IF;
  IF group_read->>'state' IS DISTINCT FROM 'ABSENT' THEN
   RAISE EXCEPTION 'BATCH_ALREADY_COMMITTED_REQUIRES_INSPECT' USING ERRCODE='23505'; END IF;
  IF group_descriptor->>'firstOperationId' IS DISTINCT FROM request->>'operation_id' THEN
   RAISE EXCEPTION 'BATCH_FIRST_OPERATION_INVALID' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO STRICT first_r FROM naijue_erp.operation_receipt
    WHERE id=(group_descriptor->>'firstOperationId')::uuid;
  IF first_r.result_data->'batched_import_v1'->'identity' IS DISTINCT FROM group_identity
   OR first_r.result_data->'batched_import_v1'->'descriptor' IS DISTINCT FROM group_descriptor
   OR first_r.result_data->'batched_import_v1'->>'full_xid' IS DISTINCT FROM pg_current_xact_id()::text
   OR first_r.result_data->'batched_import_v1'->>'controller' IS DISTINCT FROM session_user
   OR first_r.completed_at IS DISTINCT FROM transaction_timestamp()
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt q WHERE q.id=first_r.id
       AND q.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN
   RAISE EXCEPTION 'BATCH_CURRENT_FIRST_OPERATION_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 IF child_ordinal=(group_descriptor->>'last')::integer
  AND group_descriptor->>'lastOperationId' IS DISTINCT FROM request->>'operation_id' THEN
  RAISE EXCEPTION 'BATCH_LAST_OPERATION_INVALID' USING ERRCODE='23514'; END IF;
 group_marker:=jsonb_build_object('identity',group_identity,'descriptor',group_descriptor,
   'full_xid',pg_current_xact_id()::text,'controller',session_user);
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
  IF root_operation IS DISTINCT FROM operation OR child_ordinal IS DISTINCT FROM 0 OR NOT pg_has_role(session_user,'erp_unified27_importer_2393dbc6db9581c2','SET') THEN RAISE EXCEPTION 'WHOLE_TWO_CAPABILITIES_REQUIRED' USING ERRCODE='42501'; END IF;
  PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');actor:=(payload->'admin'->>'account_id')::uuid;
  fingerprint:=encode(sha256(convert_to(command_phase||':'||request::text||':'||coalesce(private_parameter,''),'UTF8')),'hex');
 ELSE
  whole_context:=naijue_erp.standard_whole_package_context_v2(root_operation);
  actor:=(whole_context->>'actor')::uuid;
  IF request->>'namespace' IS DISTINCT FROM whole_context->'request'->>'namespace'
   OR request->>'plan_sha256' IS DISTINCT FROM whole_context->'request'->>'plan_sha256'
   OR request->>'package_manifest_sha256' IS DISTINCT FROM whole_context->'request'->>'package_manifest_sha256'
   OR request->>'cutoff_at' IS DISTINCT FROM whole_context->'request'->>'cutoff_at'
   OR batch NOT IN ((whole_context->'request'->>'batch_id')::uuid,(whole_context->'request'->'payload'->>'document_batch_id')::uuid)
   OR private_parameter IS NOT NULL THEN RAISE EXCEPTION 'WHOLE_REQUEST_BINDING_INVALID' USING ERRCODE='23514'; END IF;
  IF child_ordinal IS NULL OR child_ordinal<1
  THEN RAISE EXCEPTION 'WHOLE_ORDINAL_INVALID' USING ERRCODE='23514'; END IF;
  EXECUTE $root_branches$
SELECT counted.root_count,foreign_rows.foreign_found
FROM (
SELECT 0::bigint AS root_count
) counted CROSS JOIN (
SELECT EXISTS(
 SELECT 1 FROM naijue_erp.audit_change
 WHERE object_type='IMPORT' AND (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END)<$1 AND xmin::text::bigint=$2
 UNION ALL
 SELECT 1 FROM naijue_erp.audit_change
 WHERE object_type='IMPORT' AND (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END)>$1 AND xmin::text::bigint=$2
 UNION ALL
 SELECT 1 FROM naijue_erp.audit_change
 WHERE object_type='IMPORT' AND (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NULL AND xmin::text::bigint=$2
) AS foreign_found
) foreign_rows
$root_branches$
INTO visible_root_count,foreign_import_found
USING root_operation,mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
IF foreign_import_found OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
 (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
 THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END)=root_operation AND (CASE WHEN (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
 (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
 THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NOT NULL THEN (CASE WHEN after_values->'whole_package_v2'->>'ordinal' ~ '^[0-9]{1,10}$' THEN
 CASE WHEN (after_values->'whole_package_v2'->>'ordinal')::bigint<=2147483647
 THEN (after_values->'whole_package_v2'->>'ordinal')::integer END END) END)=child_ordinal)
THEN RAISE EXCEPTION 'WHOLE_ORDINAL_INVALID' USING ERRCODE='23514'; END IF;
  next_rank:=CASE command_phase WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'PUBLISH' THEN CASE payload->>'phase' WHEN 'BASELINE' THEN 3 WHEN 'DOCUMENTS' THEN 6 END WHEN 'DOCUMENTS' THEN CASE payload->>'mode' WHEN 'STAGE' THEN 4 WHEN 'CHUNK' THEN 5 END END;
  IF EXISTS(SELECT 1 FROM naijue_erp.audit_change
     WHERE (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END)=root_operation AND after_values->'whole_package_v2'->>'root_operation'=root_operation::text AND (CASE WHEN (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NOT NULL THEN (CASE WHEN after_values->'whole_package_v2'->>'ordinal' ~ '^[0-9]{1,10}$' THEN
     CASE WHEN (after_values->'whole_package_v2'->>'ordinal')::bigint<=2147483647 THEN (after_values->'whole_package_v2'->>'ordinal')::integer END END) END) IS NULL) THEN
    SELECT CASE after_values->>'phase' WHEN 'INITIALIZE' THEN 0 WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'BASELINE_SEAL' THEN 3 WHEN 'DOCUMENT_STAGE' THEN 4 WHEN 'DOCUMENTS' THEN 5 WHEN 'DOCUMENT_PUBLISH' THEN 6 END INTO STRICT prior_rank
     FROM naijue_erp.audit_change WHERE after_values->'whole_package_v2'->>'root_operation'=root_operation::text AND (after_values->'whole_package_v2'->>'ordinal')::integer=child_ordinal-1;
  ELSE
    SELECT CASE after_values->>'phase' WHEN 'INITIALIZE' THEN 0 WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'BASELINE_SEAL' THEN 3 WHEN 'DOCUMENT_STAGE' THEN 4 WHEN 'DOCUMENTS' THEN 5 WHEN 'DOCUMENT_PUBLISH' THEN 6 END INTO STRICT prior_rank
     FROM naijue_erp.audit_change WHERE (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
    (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END)=root_operation AND after_values->'whole_package_v2'->>'root_operation'=root_operation::text AND (CASE WHEN (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
    (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NOT NULL THEN (CASE WHEN after_values->'whole_package_v2'->>'ordinal' ~ '^[0-9]{1,10}$' THEN
       CASE WHEN (after_values->'whole_package_v2'->>'ordinal')::bigint<=2147483647 THEN (after_values->'whole_package_v2'->>'ordinal')::integer END END) END)=child_ordinal-1;
  END IF;
  IF next_rank IS NULL OR prior_rank IS NULL OR next_rank<prior_rank OR prior_rank=6 THEN RAISE EXCEPTION 'WHOLE_PHASE_ORDER_INVALID' USING ERRCODE='23514'; END IF;
  fingerprint:=encode(sha256(convert_to(command_phase||':'||request::text,'UTF8')),'hex'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:standard-receipt:'||actor::text||':'||(request->>'request_key'),0));
 SELECT * INTO prior FROM naijue_erp.operation_receipt WHERE actor_account_id=actor AND request_key=request->>'request_key';
 IF FOUND THEN RAISE EXCEPTION 'WHOLE_EXISTING_OPERATION_REQUIRES_INSPECT' USING ERRCODE='23505'; END IF;
 IF command_phase='INITIALIZE' AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' AND r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN RAISE EXCEPTION 'STANDARD_ONE_MUTATION_PER_TRANSACTION' USING ERRCODE='25000'; END IF;
 IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=operation) THEN RAISE EXCEPTION 'STANDARD_OPERATION_ID_CONFLICT' USING ERRCODE='23505'; END IF;
 IF command_phase='INITIALIZE' THEN
  IF payload-ARRAY['mode','provision_operation_id','provision_request_sha256','manifest_ref','registry_sha256','alignment_sha256','document_batch_id','namespace_record_id','admin','expected','expected_master_counts','expected_documents','execution_contract','schema_declarations_sha256','historical_staff_hall_approval','explicit_zero_approval','historical_hall_approval','historical_line_amount_approval','historical_settlement_retention_approval']<>'{}'
   OR NOT(payload ?& ARRAY['mode','manifest_ref','registry_sha256','alignment_sha256','document_batch_id','namespace_record_id','admin','expected','expected_master_counts','expected_documents'])
   OR (payload->>'mode' NOT IN ('NEW_EMPTY','PROVISIONED_ADMIN_EMPTY_BUSINESS') OR payload->>'mode' IS NULL)
   OR (payload->>'mode'='NEW_EMPTY' AND payload ?| ARRAY['provision_operation_id','provision_request_sha256'])
   OR (payload->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS' AND (NOT(payload ?& ARRAY['provision_operation_id','provision_request_sha256']) OR (payload->>'provision_operation_id' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') IS DISTINCT FROM true OR (payload->>'provision_request_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true)) OR (payload->'admin') - ARRAY['staff_id','account_id','login_name','staff_name']<>'{}'
   OR private_parameter IS NULL OR private_parameter !~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$'
   OR coalesce(length(btrim(payload->>'manifest_ref')),0)=0 OR (payload->>'registry_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true OR (payload->>'alignment_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true
   OR coalesce(length(btrim(payload->'admin'->>'login_name')),0)=0 OR coalesce(length(btrim(payload->'admin'->>'staff_name')),0)=0 THEN
   RAISE EXCEPTION 'STANDARD_INITIALIZATION_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  IF payload ? 'schema_declarations_sha256' AND (jsonb_typeof(payload->'schema_declarations_sha256') IS DISTINCT FROM 'string' OR payload->>'schema_declarations_sha256' NOT IN ('e929e89fe7f026d10e6fd35af37d1eb48cd07db2f7da4eed76352e497b134cb9','7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274','9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e','f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b')) THEN
   RAISE EXCEPTION 'WHOLE_SCHEMA_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
  IF payload ? 'historical_staff_hall_approval' THEN
   expected:=payload->'historical_staff_hall_approval';
   IF jsonb_typeof(expected) IS DISTINCT FROM 'object' OR expected-ARRAY['utf8','sha256']<>'{}'
    OR NOT(expected ?& ARRAY['utf8','sha256']) OR jsonb_typeof(expected->'utf8') IS DISTINCT FROM 'string'
    OR octet_length(convert_to(expected->>'utf8','UTF8')) NOT BETWEEN 1 AND 1048576
    OR (expected->>'utf8' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true
    OR encode(sha256(convert_to(expected->>'utf8','UTF8')),'hex') IS DISTINCT FROM expected->>'sha256'
   THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_HASH' USING ERRCODE='23514'; END IF;
   expected:=(expected->>'utf8')::jsonb;
   IF jsonb_typeof(expected) IS DISTINCT FROM 'object'
    OR expected-ARRAY['format_version','source_namespace','evidence_sha256','staff']<>'{}'
    OR NOT(expected ?& ARRAY['format_version','source_namespace','evidence_sha256','staff'])
    OR expected->>'format_version' IS DISTINCT FROM 'HISTORICAL_STAFF_NULL_HALL_APPROVAL_V1'
    OR expected->>'source_namespace' IS DISTINCT FROM request->>'namespace'
    OR (expected->>'evidence_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR jsonb_typeof(expected->'staff') IS DISTINCT FROM 'array'
   THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_SHAPE' USING ERRCODE='23514'; END IF;
   IF jsonb_array_length(expected->'staff') NOT BETWEEN 1 AND 1000
    OR (SELECT count(DISTINCT value->>'source_key') FROM jsonb_array_elements(expected->'staff'))<>jsonb_array_length(expected->'staff')
    OR (SELECT count(DISTINCT value->>'target_id') FROM jsonb_array_elements(expected->'staff'))<>jsonb_array_length(expected->'staff')
   THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_DUPLICATE' USING ERRCODE='23514'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(expected->'staff') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item-ARRAY['source_key','target_id','source_refs']<>'{}'
     OR NOT(item ?& ARRAY['source_key','target_id','source_refs'])
     OR jsonb_typeof(item->'source_key') IS DISTINCT FROM 'string' OR length(item->>'source_key')=0 OR item->>'source_key' ~ '[[:cntrl:]]' OR item->>'source_key' IS DISTINCT FROM btrim(item->>'source_key',U&' \00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff')
     OR (item->>'target_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
     OR jsonb_typeof(item->'source_refs') IS DISTINCT FROM 'array'
    THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_RECORD' USING ERRCODE='23514'; END IF;
    IF jsonb_array_length(item->'source_refs')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(item->'source_refs') ref WHERE
     jsonb_typeof(ref) IS DISTINCT FROM 'object' OR ref-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(ref ?& ARRAY['file_sha256','sheet','row'])
     OR (ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR jsonb_typeof(ref->'sheet') NOT IN ('string','null')
     OR jsonb_typeof(ref->'row') IS DISTINCT FROM 'number' OR (ref->>'row' ~ '^[1-9][0-9]*$') IS DISTINCT FROM true OR (ref->>'row')::numeric>2147483647
     OR (ref->'sheet'<>'null'::jsonb AND (length(ref->>'sheet')=0 OR ref->>'sheet' ~ '[[:cntrl:]]' OR ref->>'sheet' IS DISTINCT FROM btrim(ref->>'sheet',U&' \00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff'))))
    THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
    IF (SELECT count(DISTINCT ref) FROM jsonb_array_elements(item->'source_refs') ref)<>jsonb_array_length(item->'source_refs') THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_DUPLICATE_REF' USING ERRCODE='23514'; END IF;
   END LOOP;
  END IF;
  -- The trusted host derives this descriptor only after independently pinned
  -- complete-file verification. SQL proves membership, not external authority.
  IF payload ? 'explicit_zero_approval' THEN
   zero_descriptor:=payload->'explicit_zero_approval';
   IF zero_descriptor->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' THEN
    IF zero_descriptor-ARRAY['format_version','sha256','source_namespace','inventory_file_sha256','cutoff_at','batch_key','input_manifest_sha256','registry_sha256','warehouses','skus','explicit_values','universe_count','nonzero_count','warehouse_totals']<>'{}'
     OR NOT(zero_descriptor ?& ARRAY['format_version','sha256','source_namespace','inventory_file_sha256','cutoff_at','batch_key','input_manifest_sha256','registry_sha256','warehouses','skus','explicit_values','universe_count','nonzero_count','warehouse_totals'])
     OR zero_descriptor->>'source_namespace' IS DISTINCT FROM request->>'namespace' OR zero_descriptor->>'cutoff_at' IS DISTINCT FROM request->>'cutoff_at'
     OR EXISTS(SELECT 1 FROM jsonb_each(zero_descriptor) v WHERE v.key IN ('sha256','inventory_file_sha256','input_manifest_sha256','registry_sha256') AND (jsonb_typeof(v.value) IS DISTINCT FROM 'string' OR (v.value#>>'{}' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true))
     OR zero_descriptor->>'registry_sha256' IS DISTINCT FROM payload->>'registry_sha256'
     OR zero_descriptor->>'sha256'=zero_descriptor->>'inventory_file_sha256'
     OR coalesce(length(btrim(zero_descriptor->>'batch_key')),0)=0
     OR jsonb_typeof(zero_descriptor->'warehouse_totals') IS DISTINCT FROM 'array'
     OR EXISTS(SELECT 1 FROM jsonb_each(zero_descriptor) v WHERE v.key IN ('universe_count','nonzero_count') AND (jsonb_typeof(v.value) IS DISTINCT FROM 'number' OR (v.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true))
    THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_DESCRIPTOR_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT zero_descriptor->k FROM unnest(ARRAY['warehouses','skus','explicit_values']) k LOOP
     IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item-ARRAY['sha256','records_sha256','count']<>'{}' OR NOT(item ?& ARRAY['sha256','records_sha256','count'])
      OR (item->>'sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (item->>'records_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
      OR jsonb_typeof(item->'count') IS DISTINCT FROM 'number' OR (item->>'count' ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true
     THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_PIN_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;
    IF (zero_descriptor->'warehouses'->>'count')::numeric<1 OR (zero_descriptor->'skus'->>'count')::numeric<1
     OR (zero_descriptor->>'universe_count')::numeric IS DISTINCT FROM (zero_descriptor->'warehouses'->>'count')::numeric*(zero_descriptor->'skus'->>'count')::numeric
     OR zero_descriptor->'explicit_values'->'count' IS DISTINCT FROM payload->'expected'->'INVENTORY_KEY'
     OR zero_descriptor->'nonzero_count' IS DISTINCT FROM payload->'expected'->'INVENTORY_EFFECT'
     OR jsonb_array_length(zero_descriptor->'warehouse_totals')::numeric IS DISTINCT FROM (zero_descriptor->'warehouses'->>'count')::numeric
    THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
   ELSE
   IF jsonb_typeof(zero_descriptor) IS DISTINCT FROM 'object'
    OR zero_descriptor-ARRAY['format_version','sha256','inventory_file_sha256','source_namespace','cutoff_at','record_count','merkle_root_sha256']<>'{}'
    OR NOT(zero_descriptor ?& ARRAY['format_version','sha256','inventory_file_sha256','source_namespace','cutoff_at','record_count','merkle_root_sha256'])
    OR zero_descriptor->>'format_version' IS DISTINCT FROM 'EXPLICIT_ZERO_APPROVAL_MERKLE_V1'
    OR zero_descriptor->>'source_namespace' IS DISTINCT FROM request->>'namespace'
    OR zero_descriptor->>'cutoff_at' IS DISTINCT FROM request->>'cutoff_at'
    OR EXISTS(SELECT 1 FROM jsonb_each(zero_descriptor) e WHERE e.key<>'record_count' AND jsonb_typeof(e.value) IS DISTINCT FROM 'string')
    OR (zero_descriptor->>'sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR (zero_descriptor->>'inventory_file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR zero_descriptor->>'sha256'=zero_descriptor->>'inventory_file_sha256'
    OR (zero_descriptor->>'merkle_root_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR jsonb_typeof(zero_descriptor->'record_count') IS DISTINCT FROM 'number'
    OR (zero_descriptor->>'record_count' ~ '^[1-9][0-9]*$') IS DISTINCT FROM true
   THEN RAISE EXCEPTION 'EXPLICIT_ZERO_DESCRIPTOR_INVALID' USING ERRCODE='23514'; END IF;
   IF (zero_descriptor->>'record_count')::numeric NOT BETWEEN 1 AND 250000
    OR (zero_descriptor->>'record_count')::numeric>(payload->'expected'->>'INVENTORY_KEY')::numeric
   THEN RAISE EXCEPTION 'EXPLICIT_ZERO_DESCRIPTOR_COUNT_INVALID' USING ERRCODE='23514'; END IF;
   END IF;
  END IF;
  IF payload->>'schema_declarations_sha256' IN ('f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b') AND NOT(payload ? 'historical_hall_approval') THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_REQUIRED_PROFILE_APPROVAL' USING ERRCODE='23514'; END IF;
  IF payload ? 'historical_hall_approval' THEN
   hall_approval:=payload->'historical_hall_approval';
   IF coalesce(payload->>'schema_declarations_sha256','') NOT IN ('f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b')
    OR jsonb_typeof(hall_approval) IS DISTINCT FROM 'object' OR hall_approval-ARRAY['utf8','sha256']<>'{}' OR NOT(hall_approval ?& ARRAY['utf8','sha256'])
    OR jsonb_typeof(hall_approval->'utf8') IS DISTINCT FROM 'string'
    OR octet_length(convert_to(hall_approval->>'utf8','UTF8')) NOT BETWEEN 1 AND 67108864
    OR (hall_approval->>'utf8' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true
    OR encode(sha256(convert_to(hall_approval->>'utf8','UTF8')),'hex') IS DISTINCT FROM hall_approval->>'sha256' THEN
    RAISE EXCEPTION 'HISTORICAL_HALL_APPROVAL_HASH' USING ERRCODE='23514'; END IF;
   hall_approval:=(hall_approval->>'utf8')::jsonb;
   IF jsonb_typeof(hall_approval) IS DISTINCT FROM 'object' OR hall_approval-(ARRAY['format_version','source_namespace','evidence_sha256','records']||CASE WHEN hall_approval->>'format_version'='HISTORICAL_SALES_HALL_APPROVAL_V2' THEN ARRAY['source_captures','identity_bridges','resolutions'] ELSE ARRAY[]::text[] END)<>'{}'
    OR NOT(hall_approval ?& (ARRAY['format_version','source_namespace','evidence_sha256','records']||CASE WHEN hall_approval->>'format_version'='HISTORICAL_SALES_HALL_APPROVAL_V2' THEN ARRAY['source_captures','identity_bridges','resolutions'] ELSE ARRAY[]::text[] END))
    OR hall_approval->>'format_version' IS DISTINCT FROM (CASE WHEN payload->>'schema_declarations_sha256'='b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b' THEN 'HISTORICAL_SALES_HALL_APPROVAL_V2' ELSE 'HISTORICAL_SALES_HALL_APPROVAL_V1' END)
    OR hall_approval->>'source_namespace' IS DISTINCT FROM request->>'namespace'
    OR (hall_approval->>'evidence_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR jsonb_typeof(hall_approval->'records') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'HISTORICAL_HALL_APPROVAL_SHAPE' USING ERRCODE='23514'; END IF;
   IF jsonb_array_length(hall_approval->'records') NOT BETWEEN 1 AND 250000
    OR jsonb_array_length(hall_approval->'records')::numeric IS DISTINCT FROM (payload->'expected_documents'->>'SALES_HEADER')::numeric
    OR (SELECT count(DISTINCT value->>'target_id') FROM jsonb_array_elements(hall_approval->'records'))<>jsonb_array_length(hall_approval->'records')
    OR (SELECT count(DISTINCT value->>'source_key') FROM jsonb_array_elements(hall_approval->'records'))<>jsonb_array_length(hall_approval->'records') THEN
    RAISE EXCEPTION 'HISTORICAL_HALL_APPROVAL_DUPLICATE' USING ERRCODE='23514'; END IF;
   IF hall_approval->>'format_version'='HISTORICAL_SALES_HALL_APPROVAL_V2' THEN
 IF jsonb_typeof(hall_approval->'source_captures') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_approval->'source_captures') NOT BETWEEN 0 AND 250000 THEN RAISE EXCEPTION 'HISTORICAL_HALL_MEMBERS_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_approval->'identity_bridges') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_approval->'identity_bridges') NOT BETWEEN 0 AND 250000 THEN RAISE EXCEPTION 'HISTORICAL_HALL_MEMBERS_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_approval->'resolutions') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_approval->'resolutions') NOT BETWEEN 0 AND 250000 THEN RAISE EXCEPTION 'HISTORICAL_HALL_MEMBERS_REQUIRED' USING ERRCODE='23514'; END IF;
   END IF;
   FOR hall_approved IN SELECT value FROM jsonb_array_elements(hall_approval->'records') LOOP
    IF jsonb_typeof(hall_approved) IS DISTINCT FROM 'object' OR hall_approved-(ARRAY['source_key','target_id','source_refs','evidence']||CASE WHEN hall_approved->'evidence'->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2' AND hall_approved->'evidence'->'target_snapshot'->'captured_at'='null'::jsonb THEN ARRAY['target_initialization'] ELSE ARRAY[]::text[] END)<>'{}'
     OR NOT(hall_approved ?& ARRAY['source_key','target_id','source_refs','evidence'])
     OR jsonb_typeof(hall_approved->'source_key') IS DISTINCT FROM 'string' OR length(btrim(hall_approved->>'source_key'))=0
     OR (hall_approved->>'target_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
     OR jsonb_typeof(hall_approved->'source_refs') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'HISTORICAL_HALL_APPROVAL_RECORD' USING ERRCODE='23514'; END IF;
    IF jsonb_array_length(hall_approved->'source_refs') NOT BETWEEN 1 AND 100
     OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(hall_approved->'source_refs') ref)<>jsonb_array_length(hall_approved->'source_refs')
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approved->'source_refs') ref WHERE jsonb_typeof(ref) IS DISTINCT FROM 'object'
      OR ref-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(ref ?& ARRAY['file_sha256','sheet','row'])
      OR (ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR jsonb_typeof(ref->'sheet') NOT IN ('string','null')
      OR jsonb_typeof(ref->'row') IS DISTINCT FROM 'number' OR (ref->>'row' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true OR (ref->>'row')::numeric>2147483647) THEN
     RAISE EXCEPTION 'HISTORICAL_HALL_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
    hall_evidence:=hall_approved->'evidence';
    IF hall_evidence->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2' AND hall_evidence->'target_snapshot'->'captured_at'='null'::jsonb THEN
     IF jsonb_typeof(hall_approved->'target_initialization') IS DISTINCT FROM 'object'
      OR (hall_approved->'target_initialization')-(ARRAY['warehouse_source_key']||CASE WHEN hall_evidence ? 'migration_decision' THEN ARRAY['hall_source_key'] ELSE ARRAY[]::text[] END)<>'{}'
      OR jsonb_typeof(hall_approved->'target_initialization'->'warehouse_source_key') IS DISTINCT FROM 'string'
      OR length(btrim(hall_approved->'target_initialization'->>'warehouse_source_key'))=0
      OR hall_approved->'target_initialization'->>'warehouse_source_key' ~ '[[:cntrl:]]'
      OR (hall_evidence ? 'migration_decision' AND (
       jsonb_typeof(hall_approved->'target_initialization'->'hall_source_key') IS DISTINCT FROM 'string'
       OR length(btrim(hall_approved->'target_initialization'->>'hall_source_key')) NOT BETWEEN 1 AND 65536
       OR hall_approved->'target_initialization'->>'hall_source_key' ~ '[[:cntrl:]]')) THEN
      RAISE EXCEPTION 'HISTORICAL_HALL_INITIALIZATION_MEMBER_REQUIRED' USING ERRCODE='23514'; END IF;
    ELSIF hall_approved ? 'target_initialization' THEN RAISE EXCEPTION 'HISTORICAL_HALL_INITIALIZATION_MEMBER_UNEXPECTED' USING ERRCODE='23514'; END IF;

 IF (hall_evidence->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2') IS DISTINCT FROM (hall_approval->>'format_version'='HISTORICAL_SALES_HALL_APPROVAL_V2') THEN RAISE EXCEPTION 'HISTORICAL_HALL_PROFILE_VERSION' USING ERRCODE='23514'; END IF;
 IF hall_evidence->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2' THEN
 IF jsonb_typeof(hall_evidence) IS DISTINCT FROM 'object' OR hall_evidence-(ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','target_snapshot','source_capture','identity_bridge','resolution','has_difference','review_required']||CASE WHEN hall_evidence ? 'migration_decision' THEN ARRAY['migration_decision'] ELSE ARRAY[]::text[] END)<>'{}' OR NOT(hall_evidence ?& ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','target_snapshot','source_capture','identity_bridge','resolution','has_difference','review_required']) OR hall_evidence->>'basis' IS DISTINCT FROM 'MIGRATION_DERIVED' OR hall_evidence->'original_hall_id' IS DISTINCT FROM 'null'::jsonb OR (jsonb_typeof(hall_evidence->'warehouse_id')='string' AND (hall_evidence->'warehouse_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_evidence->'selected_hall_id')='string' AND (hall_evidence->'selected_hall_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR jsonb_typeof(hall_evidence->'has_difference') IS DISTINCT FROM 'boolean' OR jsonb_typeof(hall_evidence->'review_required') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'HISTORICAL_HALL_V2_SHAPE' USING ERRCODE='23514'; END IF;
 hall_target:=hall_evidence->'target_snapshot';hall_capture:=hall_evidence->'source_capture';
 IF jsonb_typeof(hall_target) IS DISTINCT FROM 'object' OR hall_target-ARRAY['warehouse_id','hall_id','version','captured_at']<>'{}' OR NOT(hall_target ?& ARRAY['warehouse_id','hall_id','version','captured_at']) OR hall_target->'warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' OR hall_target->'hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' OR (CASE WHEN jsonb_typeof(hall_target->'version')='number' THEN (hall_target->'version'#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND (hall_target->'version'#>>'{}')::numeric=trunc((hall_target->'version'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true OR (hall_target->'captured_at'<>'null'::jsonb AND (jsonb_typeof(hall_target->'captured_at') IS DISTINCT FROM 'string' OR ((hall_target->'captured_at'#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true OR NOT isfinite((hall_target->'captured_at'#>>'{}')::timestamptz))) THEN RAISE EXCEPTION 'HISTORICAL_HALL_TARGET_SNAPSHOT_INVALID' USING ERRCODE='23514'; END IF;
 IF hall_evidence ? 'migration_decision' THEN
  hall_decision:=hall_evidence->'migration_decision';
  IF hall_target->'captured_at' IS DISTINCT FROM 'null'::jsonb
   OR hall_evidence->'source_capture' IS DISTINCT FROM 'null'::jsonb
   OR hall_evidence->'identity_bridge' IS DISTINCT FROM 'null'::jsonb
   OR hall_evidence->'resolution' IS DISTINCT FROM 'null'::jsonb
   OR hall_evidence->'review_required' IS DISTINCT FROM 'false'::jsonb
   OR hall_evidence->'has_difference' IS DISTINCT FROM 'false'::jsonb
   OR jsonb_typeof(hall_decision) IS DISTINCT FROM 'object'
   OR hall_decision-ARRAY['basis','decision_ref','evidence_sha256','source_refs']<>'{}'
   OR NOT(hall_decision ?& ARRAY['basis','decision_ref','evidence_sha256','source_refs'])
   OR hall_decision->>'basis' IS DISTINCT FROM 'USER_APPROVED_NEW_WAREHOUSE_HALL'
   OR jsonb_typeof(hall_decision->'decision_ref') IS DISTINCT FROM 'string'
   OR length(hall_decision->>'decision_ref') NOT BETWEEN 1 AND 4096
   OR hall_decision->>'decision_ref' ~ '[[:cntrl:]]'
   OR jsonb_typeof(hall_decision->'evidence_sha256') IS DISTINCT FROM 'string'
   OR (hall_decision->>'evidence_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true
   OR jsonb_typeof(hall_decision->'source_refs') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_MIGRATION_DECISION_INVALID' USING ERRCODE='23514'; END IF;
  IF jsonb_array_length(hall_decision->'source_refs') NOT BETWEEN 1 AND 100
   OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(hall_decision->'source_refs') ref)<>jsonb_array_length(hall_decision->'source_refs')
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_decision->'source_refs') ref
    WHERE jsonb_typeof(ref) IS DISTINCT FROM 'object' OR ref-ARRAY['file_sha256','sheet','row']<>'{}'
     OR NOT(ref ?& ARRAY['file_sha256','sheet','row'])
     OR ref->'file_sha256' IS DISTINCT FROM hall_decision->'evidence_sha256'
     OR jsonb_typeof(ref->'sheet') NOT IN ('string','null')
     OR (jsonb_typeof(ref->'sheet')='string' AND (length(ref->>'sheet') NOT BETWEEN 1 AND 4096 OR ref->>'sheet' ~ '[[:cntrl:]]'))
     OR CASE WHEN jsonb_typeof(ref->'row')='number' AND ref->>'row' ~ '^[1-9][0-9]{0,9}$'
        THEN (ref->>'row')::numeric>2147483647 ELSE true END) THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_MIGRATION_DECISION_INVALID' USING ERRCODE='23514'; END IF;
  IF command_phase='INITIALIZE' THEN
   hall_decision_count:=hall_decision_count+1;
   IF hall_decision_count>1 THEN RAISE EXCEPTION 'HISTORICAL_HALL_MIGRATION_DECISION_APPROVAL_REQUIRED' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
 IF jsonb_typeof(hall_capture) IS DISTINCT FROM 'object' OR hall_capture-ARRAY['capture_evidence_sha256','source_namespace','warehouse_source_key','runtime_warehouse_id','source_native_version','effective_version','runtime_hall_ids','captured_at','transaction_snapshot','relation_basis']<>'{}' OR NOT(hall_capture ?& ARRAY['capture_evidence_sha256','source_namespace','warehouse_source_key','runtime_warehouse_id','source_native_version','effective_version','runtime_hall_ids','captured_at','transaction_snapshot','relation_basis']) OR (jsonb_typeof(hall_capture->'capture_evidence_sha256')='string' AND (hall_capture->'capture_evidence_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'source_namespace')='string' AND length(hall_capture->'source_namespace'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'source_namespace'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'source_namespace'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'source_namespace'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'warehouse_source_key')='string' AND length(hall_capture->'warehouse_source_key'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'warehouse_source_key'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'warehouse_source_key'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'warehouse_source_key'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'transaction_snapshot')='string' AND length(hall_capture->'transaction_snapshot'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'transaction_snapshot'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'transaction_snapshot'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'transaction_snapshot'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'relation_basis')='string' AND length(hall_capture->'relation_basis'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'relation_basis'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'relation_basis'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'relation_basis'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'runtime_warehouse_id')='string' AND (hall_capture->'runtime_warehouse_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR (hall_capture->'source_native_version'<>'null'::jsonb AND ((CASE WHEN jsonb_typeof(hall_capture->'source_native_version')='number' THEN (hall_capture->'source_native_version'#>>'{}')::numeric BETWEEN 0 AND 2147483647 AND (hall_capture->'source_native_version'#>>'{}')::numeric=trunc((hall_capture->'source_native_version'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true)) OR (CASE WHEN jsonb_typeof(hall_capture->'effective_version')='number' THEN (hall_capture->'effective_version'#>>'{}')::numeric BETWEEN 0 AND 2147483647 AND (hall_capture->'effective_version'#>>'{}')::numeric=trunc((hall_capture->'effective_version'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true OR jsonb_typeof(hall_capture->'runtime_hall_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_capture->'runtime_hall_ids') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_capture->'runtime_hall_ids') r)<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_capture->'runtime_hall_ids') r WHERE (jsonb_typeof(r)='string' AND (r#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true) OR jsonb_typeof(hall_capture->'captured_at') IS DISTINCT FROM 'string' OR ((hall_capture->'captured_at'#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true OR NOT isfinite((hall_capture->'captured_at'#>>'{}')::timestamptz) THEN RAISE EXCEPTION 'HISTORICAL_HALL_SOURCE_CAPTURE_SHAPE' USING ERRCODE='23514'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(hall_approval->'source_captures') c WHERE c=hall_capture)<>1 THEN RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_MEMBER_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_evidence->'identity_bridge') IS DISTINCT FROM 'object' OR (hall_evidence->'identity_bridge')-ARRAY['evidence_sha256','record_key']<>'{}' OR NOT(hall_evidence->'identity_bridge' ?& ARRAY['evidence_sha256','record_key']) OR (jsonb_typeof(hall_evidence->'identity_bridge'->'evidence_sha256')='string' AND (hall_evidence->'identity_bridge'->'evidence_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_evidence->'identity_bridge'->'record_key')='string' AND length(hall_evidence->'identity_bridge'->'record_key'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_evidence->'identity_bridge'->'record_key'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_evidence->'identity_bridge'->'record_key'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_evidence->'identity_bridge'->'record_key'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true THEN RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_REFERENCE_INVALID' USING ERRCODE='23514'; END IF;
 SELECT count(*),min(hall_bridge_member::text)::jsonb INTO hall_member_count,hall_bridge FROM jsonb_array_elements(hall_approval->'identity_bridges') hall_bridge_member WHERE hall_bridge_member->'evidence_sha256'=hall_evidence->'identity_bridge'->'evidence_sha256' AND hall_bridge_member->'record_key'=hall_evidence->'identity_bridge'->'record_key';
 IF hall_member_count<>1 OR jsonb_typeof(hall_bridge) IS DISTINCT FROM 'object' OR hall_bridge-ARRAY['evidence_sha256','record_key','entity_type','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','hall_links','source_refs','scope']<>'{}' OR NOT(hall_bridge ?& ARRAY['evidence_sha256','record_key','entity_type','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','hall_links','source_refs','scope']) OR hall_bridge->>'entity_type' IS DISTINCT FROM 'WAREHOUSE' OR hall_bridge->'source_namespace' IS DISTINCT FROM hall_capture->'source_namespace' OR hall_bridge->'warehouse_source_key' IS DISTINCT FROM hall_capture->'warehouse_source_key' OR hall_bridge->'runtime_warehouse_id' IS DISTINCT FROM hall_capture->'runtime_warehouse_id' OR hall_bridge->'target_namespace' IS DISTINCT FROM hall_approval->'source_namespace' OR hall_bridge->'target_warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' OR hall_bridge->'source_capture_sha256' IS DISTINCT FROM hall_capture->'capture_evidence_sha256' OR hall_bridge->>'scope' IS DISTINCT FROM 'FIXED_CAPTURE_SCOPE_ONLY' OR (jsonb_typeof(hall_bridge->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_bridge->'source_refs') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_bridge->'source_refs') r)<>jsonb_array_length(hall_bridge->'source_refs') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_bridge->'source_refs') r WHERE jsonb_typeof(r) IS DISTINCT FROM 'object' OR r-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(r ?& ARRAY['file_sha256','sheet','row']) OR (jsonb_typeof(r->'file_sha256')='string' AND (r->'file_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (r->'sheet'<>'null'::jsonb AND ((jsonb_typeof(r->'sheet')='string' AND length(r->'sheet'#>>'{}') BETWEEN 1 AND 4096 AND length(r->'sheet'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(r->'sheet'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (r->'sheet'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true)) OR (CASE WHEN jsonb_typeof(r->'row')='number' THEN (r->'row'#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND (r->'row'#>>'{}')::numeric=trunc((r->'row'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true)) THEN RAISE EXCEPTION 'HISTORICAL_HALL_BRIDGE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_bridge->'hall_links') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_bridge->'hall_links')<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR (SELECT count(DISTINCT h->'runtime_hall_id') FROM jsonb_array_elements(hall_bridge->'hall_links') h)<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_bridge->'hall_links') h WHERE jsonb_typeof(h) IS DISTINCT FROM 'object' OR h-ARRAY['runtime_hall_id','target_hall_id']<>'{}' OR NOT(h ?& ARRAY['runtime_hall_id','target_hall_id']) OR (jsonb_typeof(h->'runtime_hall_id')='string' AND (h->'runtime_hall_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR (jsonb_typeof(h->'target_hall_id')='string' AND (h->'target_hall_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR NOT((hall_capture->'runtime_hall_ids') @> jsonb_build_array(h->'runtime_hall_id'))) THEN RAISE EXCEPTION 'HISTORICAL_HALL_BRIDGE_HALL_DIFFERS' USING ERRCODE='23514'; END IF;
 IF (hall_evidence->>'has_difference')::boolean IS DISTINCT FROM (jsonb_array_length(hall_capture->'runtime_hall_ids')>1) OR hall_evidence->'review_required' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'HISTORICAL_HALL_RESOLUTION_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(hall_capture->'runtime_hall_ids')=1 THEN
 IF hall_evidence->'resolution' IS DISTINCT FROM 'null'::jsonb OR hall_bridge->'hall_links'->0->'target_hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' THEN RAISE EXCEPTION 'HISTORICAL_HALL_BRIDGE_HALL_DIFFERS' USING ERRCODE='23514'; END IF;
 ELSE
 IF jsonb_typeof(hall_evidence->'resolution') IS DISTINCT FROM 'object' OR (hall_evidence->'resolution')-ARRAY['evidence_sha256','record_key']<>'{}' OR NOT(hall_evidence->'resolution' ?& ARRAY['evidence_sha256','record_key']) OR (jsonb_typeof(hall_evidence->'resolution'->'evidence_sha256')='string' AND (hall_evidence->'resolution'->'evidence_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_evidence->'resolution'->'record_key')='string' AND length(hall_evidence->'resolution'->'record_key'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_evidence->'resolution'->'record_key'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_evidence->'resolution'->'record_key'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_evidence->'resolution'->'record_key'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true THEN RAISE EXCEPTION 'HISTORICAL_HALL_RESOLUTION_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*),min(r::text)::jsonb INTO hall_member_count,hall_resolution FROM jsonb_array_elements(hall_approval->'resolutions') r WHERE r->'evidence_sha256'=hall_evidence->'resolution'->'evidence_sha256' AND r->'record_key'=hall_evidence->'resolution'->'record_key';
 IF hall_member_count<>1 OR jsonb_typeof(hall_resolution) IS DISTINCT FROM 'object' OR hall_resolution-ARRAY['evidence_sha256','record_key','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','selected_target_hall_id','runtime_hall_ids','source_refs','scope']<>'{}' OR NOT(hall_resolution ?& ARRAY['evidence_sha256','record_key','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','selected_target_hall_id','runtime_hall_ids','source_refs','scope']) OR hall_resolution->'source_namespace' IS DISTINCT FROM hall_capture->'source_namespace' OR hall_resolution->'warehouse_source_key' IS DISTINCT FROM hall_capture->'warehouse_source_key' OR hall_resolution->'runtime_warehouse_id' IS DISTINCT FROM hall_capture->'runtime_warehouse_id' OR hall_resolution->'target_namespace' IS DISTINCT FROM hall_approval->'source_namespace' OR hall_resolution->'target_warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' OR hall_resolution->'source_capture_sha256' IS DISTINCT FROM hall_capture->'capture_evidence_sha256' OR hall_resolution->>'scope' IS DISTINCT FROM 'FIXED_CAPTURE_SCOPE_ONLY' OR (jsonb_typeof(hall_resolution->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_resolution->'source_refs') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_resolution->'source_refs') r)<>jsonb_array_length(hall_resolution->'source_refs') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_resolution->'source_refs') r WHERE jsonb_typeof(r) IS DISTINCT FROM 'object' OR r-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(r ?& ARRAY['file_sha256','sheet','row']) OR (jsonb_typeof(r->'file_sha256')='string' AND (r->'file_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (r->'sheet'<>'null'::jsonb AND ((jsonb_typeof(r->'sheet')='string' AND length(r->'sheet'#>>'{}') BETWEEN 1 AND 4096 AND length(r->'sheet'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(r->'sheet'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (r->'sheet'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true)) OR (CASE WHEN jsonb_typeof(r->'row')='number' THEN (r->'row'#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND (r->'row'#>>'{}')::numeric=trunc((r->'row'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true)) OR hall_resolution->'selected_target_hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' OR jsonb_typeof(hall_resolution->'runtime_hall_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_resolution->'runtime_hall_ids') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_resolution->'runtime_hall_ids') r)<>jsonb_array_length(hall_resolution->'runtime_hall_ids') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_resolution->'runtime_hall_ids') r WHERE (jsonb_typeof(r)='string' AND (r#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true) OR NOT((hall_resolution->'runtime_hall_ids') @> (hall_capture->'runtime_hall_ids') AND (hall_capture->'runtime_hall_ids') @> (hall_resolution->'runtime_hall_ids')) OR jsonb_array_length(hall_resolution->'runtime_hall_ids')<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(hall_bridge->'hall_links') h WHERE h->'target_hall_id'=hall_evidence->'selected_hall_id') THEN RAISE EXCEPTION 'HISTORICAL_HALL_RESOLUTION_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 END IF;
 ELSE

 IF jsonb_typeof(hall_evidence) IS DISTINCT FROM 'object'
  OR hall_evidence-ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','warehouse_hall_id_at_capture','warehouse_version','captured_at','has_difference','review_required']<>'{}'
  OR NOT(hall_evidence ?& ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','warehouse_hall_id_at_capture','warehouse_version','captured_at','has_difference','review_required'])
  OR hall_evidence->>'format_version' IS DISTINCT FROM 'HISTORICAL_SALES_HALL_EVIDENCE_V1'
  OR coalesce(hall_evidence->>'basis','') NOT IN ('ORIGINAL','MIGRATION_DERIVED','PENDING_REVIEW')
  OR (hall_evidence->>'warehouse_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
  OR jsonb_typeof(hall_evidence->'has_difference') IS DISTINCT FROM 'boolean' OR jsonb_typeof(hall_evidence->'review_required') IS DISTINCT FROM 'boolean'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['original_hall_id','selected_hall_id','warehouse_hall_id_at_capture']) field
   WHERE hall_evidence->field IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(hall_evidence->field) IS DISTINCT FROM 'string'
    OR (hall_evidence->>field ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true)) THEN
  RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_SHAPE' USING ERRCODE='23514'; END IF;
 IF (hall_evidence->'warehouse_version'='null'::jsonb) IS DISTINCT FROM (hall_evidence->'captured_at'='null'::jsonb)
  OR (hall_evidence->'warehouse_hall_id_at_capture'<>'null'::jsonb AND hall_evidence->'warehouse_version'='null'::jsonb) THEN
  RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF hall_evidence->'warehouse_version'<>'null'::jsonb THEN
  IF jsonb_typeof(hall_evidence->'warehouse_version') IS DISTINCT FROM 'number'
   OR (hall_evidence->>'warehouse_version' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true
   OR (hall_evidence->>'warehouse_version')::numeric>2147483647
   OR jsonb_typeof(hall_evidence->'captured_at') IS DISTINCT FROM 'string'
   OR (hall_evidence->>'captured_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true
   OR NOT isfinite((hall_evidence->>'captured_at')::timestamptz) THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 IF (hall_evidence->>'basis'='ORIGINAL' AND (hall_evidence->'original_hall_id'='null'::jsonb
    OR hall_evidence->'selected_hall_id' IS DISTINCT FROM hall_evidence->'original_hall_id'
    OR (hall_evidence->>'has_difference')::boolean IS DISTINCT FROM (hall_evidence->'warehouse_hall_id_at_capture'<>'null'::jsonb AND hall_evidence->'warehouse_hall_id_at_capture'<>hall_evidence->'original_hall_id')
    OR (hall_evidence->>'review_required')::boolean IS DISTINCT FROM ((hall_evidence->>'has_difference')::boolean OR hall_evidence->'warehouse_hall_id_at_capture'='null'::jsonb)))
  OR (hall_evidence->>'basis'='MIGRATION_DERIVED' AND (hall_evidence->'original_hall_id'<>'null'::jsonb OR hall_evidence->'warehouse_hall_id_at_capture'='null'::jsonb
    OR hall_evidence->'selected_hall_id' IS DISTINCT FROM hall_evidence->'warehouse_hall_id_at_capture' OR hall_evidence->'has_difference'<>'false'::jsonb OR hall_evidence->'review_required'<>'false'::jsonb))
  OR (hall_evidence->>'basis'='PENDING_REVIEW' AND (hall_evidence->'original_hall_id'<>'null'::jsonb OR hall_evidence->'selected_hall_id'<>'null'::jsonb
    OR hall_evidence->'warehouse_hall_id_at_capture'<>'null'::jsonb OR hall_evidence->'has_difference'<>'false'::jsonb OR hall_evidence->'review_required'<>'true'::jsonb)) THEN
  RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_CONTRADICTION' USING ERRCODE='23514'; END IF;
 END IF;

   END LOOP;
   IF hall_approval->>'format_version'='HISTORICAL_SALES_HALL_APPROVAL_V2' AND (
    EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approval->'source_captures') c WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approval->'records') r WHERE r->'evidence'->'source_capture'=c))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approval->'identity_bridges') hall_registered_bridge_member WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approval->'records') r WHERE r->'evidence'->'identity_bridge'->'evidence_sha256'=hall_registered_bridge_member->'evidence_sha256' AND r->'evidence'->'identity_bridge'->'record_key'=hall_registered_bridge_member->'record_key'))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approval->'resolutions') hall_registered_resolution_member WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approval->'records') r WHERE r->'evidence'->'resolution'->'evidence_sha256'=hall_registered_resolution_member->'evidence_sha256' AND r->'evidence'->'resolution'->'record_key'=hall_registered_resolution_member->'record_key')))
   THEN RAISE EXCEPTION 'HISTORICAL_HALL_UNUSED_MEMBER' USING ERRCODE='23514'; END IF;
  END IF;
  -- Independent reviewed bytes are an attestation, not evidence of source truth
  -- by themselves. The trusted host supplies the separately approved SHA.
  IF payload ? 'historical_line_amount_approval' THEN
   amount_descriptor:=payload->'historical_line_amount_approval';
   IF coalesce(payload->>'schema_declarations_sha256','') NOT IN ('f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b')
    OR jsonb_typeof(amount_descriptor) IS DISTINCT FROM 'object'
    OR amount_descriptor-ARRAY['utf8','sha256']<>'{}' OR NOT(amount_descriptor ?& ARRAY['utf8','sha256'])
    OR jsonb_typeof(amount_descriptor->'utf8') IS DISTINCT FROM 'string'
    OR octet_length(convert_to(amount_descriptor->>'utf8','UTF8')) NOT BETWEEN 1 AND 4194304
    OR (amount_descriptor->>'utf8' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true
    OR (amount_descriptor->>'sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR encode(sha256(convert_to(amount_descriptor->>'utf8','UTF8')),'hex') IS DISTINCT FROM amount_descriptor->>'sha256' THEN
    RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_EVIDENCE_HASH' USING ERRCODE='23514'; END IF;
   amount_approval:=(amount_descriptor->>'utf8')::jsonb;
   IF amount_approval-ARRAY['format_version','source_namespace','evidence_sha256','lines']<>'{}'
    OR NOT(amount_approval ?& ARRAY['format_version','source_namespace','evidence_sha256','lines'])
    OR amount_approval->>'format_version' IS DISTINCT FROM 'HISTORICAL_LINE_AMOUNT_EVIDENCE_V1'
    OR amount_approval->>'source_namespace' IS DISTINCT FROM request->>'namespace'
    OR (amount_approval->>'evidence_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR jsonb_typeof(amount_approval->'lines') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_APPROVAL_SHAPE' USING ERRCODE='23514'; END IF;
   IF jsonb_array_length(amount_approval->'lines') NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_APPROVAL_COUNT' USING ERRCODE='23514'; END IF;
   FOR amount_fact IN SELECT value FROM jsonb_array_elements(amount_approval->'lines') LOOP
    IF jsonb_typeof(amount_fact) IS DISTINCT FROM 'object'
     OR amount_fact-ARRAY['sales_source_key','sales_id','sales_source_refs','line_source_key','line_id','source_refs','quantity','deal_price','line_amount']<>'{}'
     OR NOT(amount_fact ?& ARRAY['sales_source_key','sales_id','sales_source_refs','line_source_key','line_id','source_refs','quantity','deal_price','line_amount'])
     OR jsonb_typeof(amount_fact->'sales_source_key') IS DISTINCT FROM 'string'
     OR length(amount_fact->>'sales_source_key') NOT BETWEEN 1 AND 65536 OR amount_fact->>'sales_source_key' ~ '[[:cntrl:]]'
     OR jsonb_typeof(amount_fact->'line_source_key') IS DISTINCT FROM 'string'
     OR length(amount_fact->>'line_source_key') NOT BETWEEN 1 AND 65536 OR amount_fact->>'line_source_key' ~ '[[:cntrl:]]'
     OR (amount_fact->>'sales_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
     OR (amount_fact->>'line_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
     OR jsonb_typeof(amount_fact->'quantity') IS DISTINCT FROM 'string'
     OR (amount_fact->>'quantity' ~ '^-?[1-9][0-9]{0,18}$') IS DISTINCT FROM true
     OR jsonb_typeof(amount_fact->'deal_price') IS DISTINCT FROM 'string'
     OR (amount_fact->>'deal_price' ~ '^(0|[1-9][0-9]{0,15})[.][0-9]{2}$') IS DISTINCT FROM true
     OR jsonb_typeof(amount_fact->'line_amount') IS DISTINCT FROM 'string'
     OR (amount_fact->>'line_amount' ~ '^-?(0|[1-9][0-9]{0,15})[.][0-9]{2}$') IS DISTINCT FROM true
     OR jsonb_typeof(amount_fact->'source_refs') IS DISTINCT FROM 'array'
     OR jsonb_typeof(amount_fact->'sales_source_refs') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_APPROVAL_FACT' USING ERRCODE='23514'; END IF;
    IF (amount_fact->>'quantity')::bigint::text IS DISTINCT FROM amount_fact->>'quantity'
     OR (amount_fact->>'line_amount')::numeric(18,2)::text IS DISTINCT FROM amount_fact->>'line_amount'
     OR (amount_fact->>'line_amount')::numeric=(amount_fact->>'quantity')::numeric*(amount_fact->>'deal_price')::numeric THEN
     RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_DIFFERENCE_REQUIRED' USING ERRCODE='23514'; END IF;
    FOREACH amount_ref_key IN ARRAY ARRAY['source_refs','sales_source_refs'] LOOP
     IF jsonb_array_length(amount_fact->amount_ref_key) NOT BETWEEN 1 AND 100
      OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(amount_fact->amount_ref_key) ref)<>jsonb_array_length(amount_fact->amount_ref_key)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(amount_fact->amount_ref_key) ref
       WHERE jsonb_typeof(ref) IS DISTINCT FROM 'object' OR ref-ARRAY['file_sha256','sheet','row']<>'{}'
        OR NOT(ref ?& ARRAY['file_sha256','sheet','row'])
        OR (ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
        OR jsonb_typeof(ref->'sheet') NOT IN ('string','null')
        OR (jsonb_typeof(ref->'sheet')='string' AND (length(ref->>'sheet') NOT BETWEEN 1 AND 65536 OR ref->>'sheet' ~ '[[:cntrl:]]'))
        OR jsonb_typeof(ref->'row') IS DISTINCT FROM 'number'
        OR (CASE WHEN ref->>'row' ~ '^[1-9][0-9]{0,9}$' THEN (ref->>'row')::numeric>2147483647 ELSE true END)) THEN
      RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
    END LOOP;
   END LOOP;
   IF (SELECT count(DISTINCT fact->>'line_id') FROM jsonb_array_elements(amount_approval->'lines') fact)<>jsonb_array_length(amount_approval->'lines')
    OR (SELECT count(DISTINCT fact->>'line_source_key') FROM jsonb_array_elements(amount_approval->'lines') fact)<>jsonb_array_length(amount_approval->'lines')
    OR (SELECT count(DISTINCT (SELECT jsonb_agg(ref ORDER BY ref::text) FROM jsonb_array_elements(fact->'source_refs') ref)) FROM jsonb_array_elements(amount_approval->'lines') fact)<>jsonb_array_length(amount_approval->'lines') THEN
    RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_APPROVAL_DUPLICATE' USING ERRCODE='23514'; END IF;
  END IF;
  IF payload ? 'historical_settlement_retention_approval' THEN
   DECLARE sr_wire jsonb:=payload->'historical_settlement_retention_approval';sr_approval jsonb;sr_doc jsonb;sr_row jsonb;sr_ref jsonb;sr_refs jsonb;sr_seen uuid[]:='{}';sr_rows uuid[]:='{}';sr_keys text[]:='{}';sr_row_keys text[]:='{}';sr_total numeric;sr_last integer;sr_used boolean:=false;
   BEGIN
    IF jsonb_typeof(sr_wire) IS DISTINCT FROM 'object' OR sr_wire-ARRAY['utf8','sha256']<>'{}' OR NOT(sr_wire ?& ARRAY['utf8','sha256'])
     OR jsonb_typeof(sr_wire->'utf8') IS DISTINCT FROM 'string' OR octet_length(convert_to(sr_wire->>'utf8','UTF8')) NOT BETWEEN 1 AND 4194304
     OR (sr_wire->>'utf8' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true
     OR (sr_wire->>'sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
     OR encode(sha256(convert_to(sr_wire->>'utf8','UTF8')),'hex') IS DISTINCT FROM sr_wire->>'sha256' THEN
     RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_HASH' USING ERRCODE='23514'; END IF;
    sr_approval:=(sr_wire->>'utf8')::jsonb;
    IF jsonb_typeof(sr_approval) IS DISTINCT FROM 'object' OR sr_approval-ARRAY['format_version','source_namespace','evidence_sha256','documents']<>'{}'
     OR NOT(sr_approval ?& ARRAY['format_version','source_namespace','evidence_sha256','documents'])
     OR sr_approval->>'format_version' IS DISTINCT FROM 'HISTORICAL_SETTLEMENT_RETENTION_V1'
     OR sr_approval->>'source_namespace' IS DISTINCT FROM request->>'namespace'
     OR (sr_approval->>'evidence_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
     OR jsonb_typeof(sr_approval->'documents') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
    IF jsonb_array_length(sr_approval->'documents')<>25 AND NOT(jsonb_array_length(sr_approval->'documents')=24 AND (sr_wire->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' OR (sr_wire->>'sha256'='b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05' AND (sr_approval->>'source_namespace') IS NOT DISTINCT FROM 'naijue:tplus:20261102' AND (request->>'package_manifest_sha256') IS NOT DISTINCT FROM '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'))) THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_EXACT_SET_REQUIRED' USING ERRCODE='23514'; END IF;
    FOR sr_doc IN SELECT value FROM jsonb_array_elements(sr_approval->'documents') LOOP
     IF jsonb_typeof(sr_doc) IS DISTINCT FROM 'object' OR sr_doc-ARRAY['sales_source_key','sales_id','source_refs','business_type','status','gross_amount','order_discount','net_due','settlements']<>'{}'
      OR NOT(sr_doc ?& ARRAY['sales_source_key','sales_id','source_refs','business_type','status','gross_amount','order_discount','net_due','settlements'])
      OR jsonb_typeof(sr_doc->'sales_source_key') IS DISTINCT FROM 'string' OR length(sr_doc->>'sales_source_key') NOT BETWEEN 1 AND 65536 OR sr_doc->>'sales_source_key' ~ '[[:cntrl:]]'
      OR (sr_doc->>'sales_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
      OR coalesce(sr_doc->>'business_type','') NOT IN ('SALE','RETURN') OR sr_doc->>'status' IS DISTINCT FROM 'APPROVED'
      OR jsonb_typeof(sr_doc->'gross_amount') IS DISTINCT FROM 'string' OR (sr_doc->>'gross_amount' ~ '^-?(0|[1-9][0-9]{0,15})[.][0-9]{2}$') IS DISTINCT FROM true
      OR jsonb_typeof(sr_doc->'order_discount') IS DISTINCT FROM 'string' OR (sr_doc->>'order_discount' ~ '^-?(0|[1-9][0-9]{0,15})[.][0-9]{2}$') IS DISTINCT FROM true
      OR jsonb_typeof(sr_doc->'net_due') IS DISTINCT FROM 'string' OR (sr_doc->>'net_due' ~ '^-?(0|[1-9][0-9]{0,15})[.][0-9]{2}$') IS DISTINCT FROM true
      OR jsonb_typeof(sr_doc->'settlements') IS DISTINCT FROM 'array' OR (sr_doc->>'sales_id')::uuid=ANY(sr_seen) OR sr_doc->>'sales_source_key'=ANY(sr_keys) THEN
      RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_DOCUMENT' USING ERRCODE='23514'; END IF;
     sr_seen:=array_append(sr_seen,(sr_doc->>'sales_id')::uuid);sr_keys:=array_append(sr_keys,sr_doc->>'sales_source_key');sr_total:=0;sr_last:=0;
     IF jsonb_array_length(sr_doc->'settlements')<1 THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_ROW' USING ERRCODE='23514'; END IF;
     sr_refs:=jsonb_build_array(sr_doc->'source_refs');
     FOR sr_row IN SELECT value FROM jsonb_array_elements(sr_doc->'settlements') LOOP
      IF jsonb_typeof(sr_row) IS DISTINCT FROM 'object' OR sr_row-ARRAY['source_key','fields','source_refs']<>'{}' OR NOT(sr_row ?& ARRAY['source_key','fields','source_refs'])
       OR jsonb_typeof(sr_row->'source_key') IS DISTINCT FROM 'string' OR length(sr_row->>'source_key') NOT BETWEEN 1 AND 65536 OR sr_row->>'source_key' ~ '[[:cntrl:]]'
       OR jsonb_typeof(sr_row->'fields') IS DISTINCT FROM 'object'
       OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(sr_row->'fields') key) IS DISTINCT FROM (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute WHERE attrelid='naijue_erp.sales_settlement'::regclass AND attnum>0 AND NOT attisdropped)
       OR sr_row->'fields'->>'sales_id' IS DISTINCT FROM sr_doc->>'sales_id'
       OR (sr_row->'fields'->>'id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
       OR jsonb_typeof(sr_row->'fields'->'line_no') IS DISTINCT FROM 'number' OR (sr_row->'fields'->>'line_no')::integer<=sr_last
       OR coalesce(sr_row->'fields'->>'direction','') NOT IN ('RECEIVE','REFUND') OR jsonb_typeof(sr_row->'fields'->'amount') IS DISTINCT FROM 'string'
       OR (sr_row->'fields'->>'amount' ~ '^(0|[1-9][0-9]{0,15})[.][0-9]{2}$') IS DISTINCT FROM true
       OR (sr_row->'fields'->>'id')::uuid=ANY(sr_rows) OR sr_row->>'source_key'=ANY(sr_row_keys) THEN
       RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_ROW' USING ERRCODE='23514'; END IF;
      sr_last:=(sr_row->'fields'->>'line_no')::integer;sr_rows:=array_append(sr_rows,(sr_row->'fields'->>'id')::uuid);sr_row_keys:=array_append(sr_row_keys,sr_row->>'source_key');
      sr_total:=sr_total+(sr_row->'fields'->>'amount')::numeric*CASE sr_row->'fields'->>'direction' WHEN 'RECEIVE' THEN 1 ELSE -1 END;
      sr_refs:=sr_refs||jsonb_build_array(sr_row->'source_refs');
     END LOOP;
     IF sr_total=(sr_doc->>'net_due')::numeric THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_DIFFERENCE_REQUIRED' USING ERRCODE='23514'; END IF;
     FOR sr_row IN SELECT value FROM jsonb_array_elements(sr_refs) LOOP
      IF jsonb_typeof(sr_row) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
      IF jsonb_array_length(sr_row) NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(sr_row) ref)<>jsonb_array_length(sr_row) THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
      FOR sr_ref IN SELECT value FROM jsonb_array_elements(sr_row) LOOP
       IF jsonb_typeof(sr_ref) IS DISTINCT FROM 'object' OR sr_ref-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(sr_ref ?& ARRAY['file_sha256','sheet','row'])
        OR (sr_ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR jsonb_typeof(sr_ref->'sheet') NOT IN ('string','null')
        OR jsonb_typeof(sr_ref->'row') IS DISTINCT FROM 'number' OR (sr_ref->>'row' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true OR (sr_ref->>'row')::numeric>2147483647 THEN
        RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
       sr_used:=sr_used OR sr_ref->>'file_sha256'=sr_approval->>'evidence_sha256';
      END LOOP;
     END LOOP;
    END LOOP;
    IF cardinality(sr_rows)<>(CASE jsonb_array_length(sr_approval->'documents') WHEN 24 THEN 26 ELSE 27 END) OR NOT sr_used THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_EXACT_SET_REQUIRED' USING ERRCODE='23514'; END IF;
   END;
  END IF;
  -- SQL49: the frozen eight-key planning contract is an explicit V2 opt-in.
  -- Its JS typed digests are opaque bindings in the immutable INIT request;
  -- they are never misrepresented as PostgreSQL jsonb::text hashes.
  IF payload ? 'execution_contract' THEN
   execution_contract:=payload->'execution_contract';master_chunks_v2:=true;
   IF jsonb_typeof(execution_contract) IS DISTINCT FROM 'object'
    OR execution_contract-ARRAY['format_version','compiler_version','scheduler_version','max_master_chunk_rows','master_chunks','master_schedule_layout_sha256','master_chunk_plan_sha256','initialization_identity_sha256']<>'{}'
    OR NOT(execution_contract ?& ARRAY['format_version','compiler_version','scheduler_version','max_master_chunk_rows','master_chunks','master_schedule_layout_sha256','master_chunk_plan_sha256','initialization_identity_sha256'])
    OR execution_contract->>'format_version' IS DISTINCT FROM 'UNIFIED_STANDARD_EXECUTION_PLAN_V2'
    OR execution_contract->>'compiler_version' IS DISTINCT FROM 'DEPENDENCY_ORDERED_STANDARD_PROGRAM_V2'
    OR execution_contract->>'scheduler_version' IS DISTINCT FROM 'UNIFIED_STANDARD_MASTER_CHUNK_PLAN_V2'
    OR EXISTS(SELECT 1 FROM jsonb_each(execution_contract) contract_field WHERE contract_field.key IN ('max_master_chunk_rows','master_chunks') AND (jsonb_typeof(contract_field.value) IS DISTINCT FROM 'number' OR (contract_field.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true))
    OR (execution_contract->>'max_master_chunk_rows')::numeric NOT BETWEEN 1 AND 500
    OR (execution_contract->>'master_chunks')::numeric NOT BETWEEN 0 AND 2147483646
    OR EXISTS(SELECT 1 FROM jsonb_each(execution_contract) contract_field WHERE contract_field.key IN ('master_schedule_layout_sha256','master_chunk_plan_sha256','initialization_identity_sha256') AND (jsonb_typeof(contract_field.value) IS DISTINCT FROM 'string' OR ((contract_field.value#>>'{}') ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true)) THEN
    RAISE EXCEPTION 'STANDARD49_V2_EXECUTION_CONTRACT_INVALID' USING ERRCODE='23514'; END IF;
   master_limit:=2147483647;max_master_chunk_rows:=(execution_contract->>'max_master_chunk_rows')::integer;expected_master_chunks:=(execution_contract->>'master_chunks')::integer;
   IF EXISTS(SELECT 1 FROM jsonb_each(payload->'admin') admin_field WHERE jsonb_typeof(admin_field.value) IS DISTINCT FROM 'string') OR octet_length(payload->'admin'->>'login_name')>256 THEN RAISE EXCEPTION 'STANDARD49_V2_ADMIN_IDENTITY_INVALID' USING ERRCODE='23514'; END IF;
  END IF;
  IF jsonb_typeof(payload->'expected') IS DISTINCT FROM 'object' OR jsonb_typeof(payload->'expected_master_counts') IS DISTINCT FROM 'object' OR jsonb_typeof(payload->'expected_documents') IS DISTINCT FROM 'object'
   OR (SELECT array_agg(count_key ORDER BY count_key) FROM jsonb_object_keys(payload->'expected') count_key) IS DISTINCT FROM ARRAY['IMPORT_BATCH','INVENTORY_EFFECT','INVENTORY_KEY','MASTER','NAMESPACE']
   OR EXISTS(SELECT 1 FROM jsonb_each(payload->'expected') count_field WHERE jsonb_typeof(count_field.value) IS DISTINCT FROM 'number' OR (count_field.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR count_field.value::text::numeric>2147483647) THEN RAISE EXCEPTION 'STANDARD49_INITIAL_COUNTER_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(payload->'admin') IS DISTINCT FROM 'object' OR NOT(payload->'admin' ?& ARRAY['staff_id','account_id','login_name','staff_name'])
   OR (payload->'admin'->>'staff_id')::uuid IS NULL OR actor IS NULL OR (payload->>'document_batch_id')::uuid IS NULL OR (payload->>'namespace_record_id')::uuid IS NULL
   OR payload->>'document_batch_id'=batch::text
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(payload->'expected_master_counts') k) IS DISTINCT FROM ARRAY['BARCODE_SCHEME','COLOR','CUSTOMER','FIT','HALL','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','PAYMENT_METHOD','PRODUCT','PRODUCT_CATEGORY','PRODUCT_IMAGE','SEASON','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SKU','SKU_BARCODE','STAFF','SUPPLIER','WAREHOUSE']
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(payload->'expected_documents') k) IS DISTINCT FROM ARRAY['IMPORT_BATCH','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE']
   OR EXISTS(SELECT 1 FROM jsonb_each(payload->'expected_master_counts') e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'number' OR (e.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR e.value::text::numeric>master_limit)
   OR EXISTS(SELECT 1 FROM jsonb_each(payload->'expected_documents') e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'number' OR (e.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR e.value::text::numeric>2147483646)
   OR (SELECT sum(value::text::numeric) FROM jsonb_each(payload->'expected_master_counts')) IS DISTINCT FROM (payload->'expected'->>'MASTER')::numeric
   OR (payload->'expected'->>'MASTER')::numeric>master_limit OR payload->'expected'->>'NAMESPACE' IS DISTINCT FROM '1' OR payload->'expected'->>'IMPORT_BATCH' IS DISTINCT FROM '1' OR payload->'expected_documents'->>'IMPORT_BATCH' IS DISTINCT FROM '1'
   THEN RAISE EXCEPTION 'STANDARD_INITIALIZATION_CLOSED_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
  IF (payload->'expected'->>'INVENTORY_EFFECT')::numeric>(payload->'expected'->>'INVENTORY_KEY')::numeric
   OR (SELECT sum(value::text::numeric) FROM jsonb_each(payload->'expected'))>2147483647
   OR (SELECT sum(value::text::numeric) FROM jsonb_each(payload->'expected_documents'))>2147483647
   OR (payload->'expected_documents'->>'SALES_HEADER')::numeric+(payload->'expected_documents'->>'TRANSFER_HEADER')::numeric+1>2147483646 THEN RAISE EXCEPTION 'STANDARD49_INITIAL_PROGRESS_COUNTER_OVERFLOW' USING ERRCODE='23514'; END IF;
  IF master_chunks_v2 AND (((expected_master_chunks=0) IS DISTINCT FROM ((payload->'expected'->>'MASTER')::numeric=0))
   OR expected_master_chunks>(payload->'expected'->>'MASTER')::numeric
   OR expected_master_chunks::numeric*max_master_chunk_rows<(payload->'expected'->>'MASTER')::numeric
   OR expected_master_chunks::numeric+ceil((payload->'expected'->>'INVENTORY_KEY')::numeric/100)+1>2147483646) THEN RAISE EXCEPTION 'STANDARD49_V2_MASTER_LAYOUT_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
  admin:=payload->'admin';
  IF payload->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS' THEN
   PERFORM naijue_erp.maintenance_administrator_mutex();
   IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt x WHERE x.id=(payload->>'provision_operation_id')::uuid AND x.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN
    RAISE EXCEPTION 'ADMIN_PROVISION_COMMITTED_RECEIPT_REQUIRED' USING ERRCODE='25000'; END IF;
   admin_provision_snapshot:=naijue_erp.standard_admin_provision_proof_v1((payload->>'provision_operation_id')::uuid,payload->>'provision_request_sha256',admin,true);
  ELSE
  -- No existing baseline/account/master/history adoption is silently enabled.
  FOR parent_row IN SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='naijue_erp' AND c.relkind IN ('r','p') AND c.relname<>'schema_migration' LOOP
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I)',parent_row.relname) INTO any_rows;
   IF any_rows THEN RAISE EXCEPTION 'STANDARD_NEW_EMPTY_ONLY: populated target requires separately reviewed adoption' USING ERRCODE='23514'; END IF;
  END LOOP;
  INSERT INTO naijue_erp.staff(id,name,hall_id,role,contact,employment_status,version)
   VALUES((admin->>'staff_id')::uuid,admin->>'staff_name',NULL,'ADMIN',NULL,'在职',1);
  INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)
   VALUES(actor,(admin->>'staff_id')::uuid,admin->>'login_name',private_parameter,true,1,1,transaction_timestamp(),transaction_timestamp());
  END IF;
  -- Validate the original bootstrap pair before publishing the first baseline.
  SET CONSTRAINTS naijue_erp.staff_maintenance_final_consistency,naijue_erp.user_account_maintenance_final_consistency IMMEDIATE;
  SET CONSTRAINTS naijue_erp.staff_maintenance_final_consistency,naijue_erp.user_account_maintenance_final_consistency DEFERRED;
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
  cfg:=initial_request->'payload';old_cp:=b.checkpoint;
  IF cfg ? 'historical_line_amount_approval' THEN
   amount_descriptor:=cfg->'historical_line_amount_approval';amount_approval:=(amount_descriptor->>'utf8')::jsonb;
   SELECT jsonb_object_agg(fact->>'line_id',fact) INTO amount_facts_by_id FROM jsonb_array_elements(amount_approval->'lines') fact;
  END IF;
  IF command_phase='DOCUMENTS' AND cfg ? 'historical_hall_approval' THEN
   hall_approval:=(cfg->'historical_hall_approval'->>'utf8')::jsonb;
   SELECT jsonb_object_agg(value->>'target_id',value) INTO hall_approvals FROM jsonb_array_elements(((cfg->'historical_hall_approval'->>'utf8')::jsonb)->'records');
  END IF;
  -- Mode and bounds come only from the original immutable INIT, never a chunk.
  master_chunks_v2:=cfg ? 'execution_contract';
  IF master_chunks_v2 THEN execution_contract:=cfg->'execution_contract';max_master_chunk_rows:=(execution_contract->>'max_master_chunk_rows')::integer;expected_master_chunks:=(execution_contract->>'master_chunks')::integer;
   IF jsonb_typeof(payload->'expected_sequence') IS DISTINCT FROM 'number' OR (payload->>'expected_sequence' ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR (payload->>'expected_sequence')::numeric>2147483646 THEN RAISE EXCEPTION 'STANDARD49_EXPECTED_SEQUENCE_INVALID' USING ERRCODE='23514'; END IF;
  END IF;
  IF jsonb_typeof(old_cp->'sequence') IS DISTINCT FROM 'number' OR (old_cp->>'sequence' ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR (old_cp->>'sequence')::numeric>=2147483646 THEN RAISE EXCEPTION 'STANDARD49_AUDIT_SEQUENCE_OVERFLOW' USING ERRCODE='23514'; END IF;
  cp:=jsonb_set(old_cp,'{sequence}',to_jsonb((old_cp->>'sequence')::integer+1));
  IF command_phase IN ('MASTER','KEYS') THEN
   IF b.inventory_mode<>'CUTOFF_STOCK_BASELINE' OR b.mapping_version<>'STANDARD_INITIAL_EXPLICIT_KEYS_V1' OR payload-ARRAY['expected_sequence','rows']<>'{}'
    OR jsonb_typeof(payload->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'rows') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'STANDARD_CHUNK_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
   IF master_chunks_v2 AND command_phase='MASTER' AND (jsonb_array_length(payload->'rows')>max_master_chunk_rows
    OR (old_cp->>'sequence')::numeric>=expected_master_chunks
    OR ((old_cp->>'sequence')::numeric=expected_master_chunks-1 AND (old_cp->'counts'->>'MASTER')::numeric+jsonb_array_length(payload->'rows')<>(old_cp->'expected'->>'MASTER')::numeric)
    OR ((old_cp->>'sequence')::numeric<expected_master_chunks-1 AND (old_cp->'counts'->>'MASTER')::numeric+jsonb_array_length(payload->'rows')>=(old_cp->'expected'->>'MASTER')::numeric)) THEN RAISE EXCEPTION 'STANDARD49_V2_MASTER_CHUNK_PROGRESS_INVALID' USING ERRCODE='23514'; END IF;
   IF master_chunks_v2 AND command_phase='KEYS' AND ((old_cp->>'sequence')::numeric<expected_master_chunks OR old_cp->'counts'->'MASTER' IS DISTINCT FROM old_cp->'expected'->'MASTER') THEN RAISE EXCEPTION 'STANDARD49_V2_MASTER_PHASE_INCOMPLETE' USING ERRCODE='23514'; END IF;
  ELSIF command_phase='DOCUMENTS' THEN
   IF b.inventory_mode<>'DOCUMENT_CONVERSION' OR payload->>'mode' IS DISTINCT FROM 'CHUNK' OR payload-ARRAY['mode','baseline_batch_id','expected_sequence','expected','rows','documents']<>'{}'
    OR payload->'expected' IS DISTINCT FROM b.checkpoint->'expected' OR jsonb_typeof(payload->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'rows') NOT BETWEEN 1 AND 500
    OR jsonb_typeof(payload->'documents') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'STANDARD_DOCUMENT_CHUNK_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
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
    hall_observation:=NULL;
    fields:=entry->'fields';source_key:=entry->>'source_key';file_ref:=entry->>'file_ref';record_id:=(entry->>'record_id')::uuid;
    IF jsonb_typeof(fields) IS DISTINCT FROM 'object' OR jsonb_typeof(entry->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(entry->'source_refs')<1
     OR coalesce(length(source_key),0)=0 OR coalesce(length(btrim(file_ref)),0)=0 THEN RAISE EXCEPTION 'STANDARD_SOURCE_ROW_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
    IF command_phase='KEYS' THEN
     IF entry-ARRAY['record_id','source_key','file_ref','source_refs','fields','ledger_entry_id','explicit_zero_evidence']<>'{}' OR fields-ARRAY['warehouse_id','sku_id','quantity']<>'{}'
      OR jsonb_typeof(fields->'quantity') IS DISTINCT FROM 'string' OR (fields->>'quantity' ~ '^(0|[1-9][0-9]*|-[1-9][0-9]*)$') IS DISTINCT FROM true THEN RAISE EXCEPTION 'STANDARD_EXPLICIT_KEY_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     quantity:=(fields->>'quantity')::bigint;kind:='INVENTORY_KEY';target:=naijue_erp.standard_inventory_key_id((fields->>'warehouse_id')::uuid,(fields->>'sku_id')::uuid);
     IF (quantity=0) IS DISTINCT FROM (entry->>'ledger_entry_id' IS NULL) THEN RAISE EXCEPTION 'STANDARD_ZERO_LEDGER_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     IF cfg->'explicit_zero_approval'->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' AND entry ? 'explicit_zero_evidence' THEN RAISE EXCEPTION 'INVENTORY_SCOPE_REQUIRES_REAL_EXPLICIT_ROWS' USING ERRCODE='23514'; END IF;
     IF entry ? 'explicit_zero_evidence' THEN
      IF NOT(cfg ? 'explicit_zero_approval') THEN RAISE EXCEPTION 'EXPLICIT_ZERO_DESCRIPTOR_REQUIRED' USING ERRCODE='23514'; END IF;
      zero_descriptor:=cfg->'explicit_zero_approval';zero_evidence:=entry->'explicit_zero_evidence';
      IF jsonb_typeof(zero_evidence) IS DISTINCT FROM 'object'
       OR zero_evidence-ARRAY['format_version','inventory_file_sha256','cutoff_at','approval_sha256','approval_row','approval_line','merkle_proof']<>'{}'
       OR NOT(zero_evidence ?& ARRAY['format_version','inventory_file_sha256','cutoff_at','approval_sha256','approval_row','approval_line','merkle_proof'])
       OR zero_evidence->>'format_version' IS DISTINCT FROM 'EXPLICIT_ZERO_ABSENCE_V1'
       OR fields->>'quantity' IS DISTINCT FROM '0'
       OR zero_evidence->>'inventory_file_sha256' IS DISTINCT FROM zero_descriptor->>'inventory_file_sha256'
       OR zero_evidence->>'cutoff_at' IS DISTINCT FROM zero_descriptor->>'cutoff_at'
       OR zero_evidence->>'approval_sha256' IS DISTINCT FROM zero_descriptor->>'sha256'
       OR jsonb_typeof(zero_evidence->'approval_row') IS DISTINCT FROM 'number'
       OR (zero_evidence->>'approval_row' ~ '^[1-9][0-9]*$') IS DISTINCT FROM true
       OR jsonb_typeof(zero_evidence->'approval_line') IS DISTINCT FROM 'string'
       OR octet_length(convert_to(zero_evidence->>'approval_line','UTF8')) NOT BETWEEN 1 AND 65536
       OR strpos(zero_evidence->>'approval_line',chr(10))>0 OR strpos(zero_evidence->>'approval_line',chr(13))>0
       OR left(zero_evidence->>'approval_line',1)=chr(65279)
       OR (zero_evidence->>'approval_line' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true
       OR jsonb_typeof(zero_evidence->'merkle_proof') IS DISTINCT FROM 'array'
      THEN RAISE EXCEPTION 'EXPLICIT_ZERO_EVIDENCE_INVALID' USING ERRCODE='23514'; END IF;
      IF (zero_evidence->>'approval_row')::numeric>(zero_descriptor->>'record_count')::numeric
       OR jsonb_array_length(zero_evidence->'merkle_proof')>18
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(zero_evidence->'merkle_proof') s WHERE jsonb_typeof(s) IS DISTINCT FROM 'string' OR (s#>>'{}' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true)
       OR entry->'source_refs' IS DISTINCT FROM jsonb_build_array(jsonb_build_object('file_sha256',zero_descriptor->>'sha256','sheet',NULL,'row',(zero_evidence->>'approval_row')::integer))
      THEN RAISE EXCEPTION 'EXPLICIT_ZERO_PROOF_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
      zero_fact:=(zero_evidence->>'approval_line')::jsonb;
      IF zero_fact IS DISTINCT FROM jsonb_build_object('format_version','EXPLICIT_ZERO_APPROVAL_V1','source_namespace',request->>'namespace',
       'inventory_file_sha256',zero_descriptor->>'inventory_file_sha256','cutoff_at',request->>'cutoff_at','source_key',source_key,
       'warehouse_id',fields->>'warehouse_id','sku_id',fields->>'sku_id','quantity','0','decision','CONFIRMED_ABSENT_IS_ZERO')
      THEN RAISE EXCEPTION 'EXPLICIT_ZERO_APPROVED_FACT_DIFFERS' USING ERRCODE='23514'; END IF;
      zero_index:=(zero_evidence->>'approval_row')::integer-1;zero_width:=(zero_descriptor->>'record_count')::integer;
      zero_hash:=encode(sha256(convert_to('EXPLICIT_ZERO_LEAF_V1'||chr(10)||(zero_index+1)::text||chr(10)||(zero_evidence->>'approval_line'),'UTF8')),'hex');
      FOR zero_sibling IN SELECT value FROM jsonb_array_elements_text(zero_evidence->'merkle_proof') LOOP
       IF zero_width<=1 THEN RAISE EXCEPTION 'EXPLICIT_ZERO_PROOF_DEPTH_INVALID' USING ERRCODE='23514'; END IF;
       IF mod(zero_index,2)=0 THEN
        IF zero_index+1>=zero_width AND zero_sibling IS DISTINCT FROM zero_hash THEN RAISE EXCEPTION 'EXPLICIT_ZERO_ODD_SIBLING' USING ERRCODE='23514'; END IF;
        zero_hash:=encode(sha256(convert_to('EXPLICIT_ZERO_NODE_V1'||chr(10)||zero_hash||chr(10)||zero_sibling,'UTF8')),'hex');
       ELSE zero_hash:=encode(sha256(convert_to('EXPLICIT_ZERO_NODE_V1'||chr(10)||zero_sibling||chr(10)||zero_hash,'UTF8')),'hex'); END IF;
       zero_index:=zero_index/2;zero_width:=(zero_width+1)/2;
      END LOOP;
      IF zero_width<>1 OR zero_hash IS DISTINCT FROM zero_descriptor->>'merkle_root_sha256' THEN RAISE EXCEPTION 'EXPLICIT_ZERO_MEMBERSHIP_INVALID' USING ERRCODE='23514'; END IF;
     END IF;
    ELSE
     IF entry-ARRAY['record_id','entity_type','source_key','target_id','identity_basis','file_ref','source_refs','fields','zero_amount_archive','historical_hall_evidence']<>'{}' OR NOT(entry ?& ARRAY['record_id','entity_type','source_key','target_id','identity_basis','file_ref','source_refs','fields']) THEN RAISE EXCEPTION 'STANDARD_TYPED_ROW_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     kind:=entry->>'entity_type';target:=(entry->>'target_id')::uuid;registry_basis:=entry->>'identity_basis';
     IF command_phase='DOCUMENTS' AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt sealed
       WHERE sealed.action='MIGRATE_DOCUMENT' AND sealed.target_type=CASE WHEN kind IN ('SALES_HEADER','SALES_LINE','SALES_SETTLEMENT') THEN 'SALES' ELSE 'TRANSFER' END
        AND sealed.target_id=CASE WHEN kind IN ('SALES_HEADER','TRANSFER_HEADER') THEN target WHEN kind IN ('SALES_LINE','SALES_SETTLEMENT') THEN (fields->>'sales_id')::uuid ELSE (fields->>'transfer_id')::uuid END)
     THEN RAISE EXCEPTION 'WHOLE_DOCUMENT_ALREADY_SEALED' USING ERRCODE='23514'; END IF;
     IF (command_phase='MASTER' AND kind NOT IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL'))
      OR (command_phase='DOCUMENTS' AND kind NOT IN ('SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE')) THEN RAISE EXCEPTION 'STANDARD_FINITE_TARGET_REQUIRED' USING ERRCODE='23514'; END IF;
     IF kind='STAFF' AND fields->>'role'='SALESPERSON' AND fields->'hall_id'='null'::jsonb THEN
      IF fields->>'employment_status' IS DISTINCT FROM '离职'
       OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(((cfg->'historical_staff_hall_approval'->>'utf8')::jsonb)->'staff','[]'::jsonb)) approved
        WHERE approved->>'source_key'=entry->>'source_key' AND approved->>'target_id'=entry->>'target_id'
         AND (approved->'source_refs') @> (entry->'source_refs') AND (entry->'source_refs') @> (approved->'source_refs'))
       OR EXISTS(SELECT 1 FROM naijue_erp.user_account WHERE staff_id=(entry->>'target_id')::uuid)
      THEN RAISE EXCEPTION 'STAFF_HALL_REQUIRED' USING ERRCODE='23514'; END IF;
     END IF;
     -- WHOLE_FIT_PROFILE_GUARD_BEGIN
     -- An installed numeric table constraint does not widen a legacy package.
     -- Select only the original immutable INIT profile; never infer or rewrite codes.
     IF kind='FIT' AND (jsonb_typeof(fields->'code') IS DISTINCT FROM 'string'
      OR (fields->>'code' COLLATE "C" ~ CASE WHEN cfg->>'schema_declarations_sha256' IN
       ('7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274','9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e','f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b')
       THEN '^[A-Z356789]$' ELSE '^[A-Z]$' END) IS DISTINCT FROM true) THEN
      RAISE EXCEPTION 'WHOLE_FIT_SCHEMA_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
     -- WHOLE_FIT_PROFILE_GUARD_END
     IF (master_chunks_v2 OR cfg->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS') AND command_phase='MASTER' AND kind='STAFF' AND target=(cfg->'admin'->>'staff_id')::uuid THEN RAISE EXCEPTION 'STANDARD_V2_INITIALIZATION_STAFF_SOURCE_COLLISION' USING ERRCODE='23514'; END IF;
     IF kind IN ('SIZE_GROUP_MEMBER','PAYMENT_ACCOUNT_HALL') THEN
      encoded:='[s"naijue-cutoff-v1",s"standard-composite-target-v1",s'||to_json(request->>'namespace')::text||',s'||to_json(kind)::text||',s'||to_json(source_key)::text||']';
      IF registry_basis IS DISTINCT FROM 'DERIVED_COMPOSITE' OR substring(encode(sha256(convert_to(encoded,'UTF8')),'hex') FROM 1 FOR 32)::uuid<>target THEN RAISE EXCEPTION 'STANDARD_COMPOSITE_PROOF_ID_INVALID' USING ERRCODE='23514'; END IF;
     ELSIF fields->>'id' IS DISTINCT FROM target::text OR registry_basis IS NULL OR registry_basis NOT IN ('EXISTING_VERIFIED','STABLE_IMPORT_ID_V1') THEN RAISE EXCEPTION 'STANDARD_REGISTRY_TARGET_INVALID' USING ERRCODE='23514'; END IF;
     IF kind IN ('SALES_HEADER','TRANSFER_HEADER','PRODUCT_IMAGE') AND (fields->>'created_by_account_id' IS NOT NULL OR fields->>'approved_by_account_id' IS NOT NULL) THEN RAISE EXCEPTION 'STANDARD_ORIGINAL_ACCOUNT_MAPPING_UNPROVEN_NEW_TARGET' USING ERRCODE='23514'; END IF;
     IF kind IN ('WAREHOUSE','SKU') AND fields->>'created_operation_id' IS NOT NULL THEN RAISE EXCEPTION 'STANDARD_SOURCE_IDENTITY_IS_NOT_POSTCUTOFF_CREATION' USING ERRCODE='23514'; END IF;
     -- Exact canonical string inputs precede PostgreSQL's typmod coercion. A
     -- decimal(18,2) must never silently round an original three-decimal amount.
     FOR parent_row IN SELECT attname,atttypid FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||lower(kind COLLATE "C")) AND attnum>0 AND NOT attisdropped AND atttypid IN (20,1700) LOOP
      IF fields->parent_row.attname IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(fields->parent_row.attname) IS DISTINCT FROM 'string'
        OR (parent_row.atttypid=20 AND (fields->>parent_row.attname ~ '^(0|[1-9][0-9]*|-[1-9][0-9]*)$') IS DISTINCT FROM true)
        OR (parent_row.atttypid=1700 AND (fields->>parent_row.attname ~ '^-?(0|[1-9][0-9]*)[.][0-9]{2}$') IS DISTINCT FROM true)) THEN
       RAISE EXCEPTION 'STANDARD_EXACT_NUMERIC_STRING_REQUIRED: %',parent_row.attname USING ERRCODE='23514'; END IF;
     END LOOP;
    END IF;
    IF kind='SALES_HEADER' AND cfg ? 'historical_hall_approval' AND NOT(entry ? 'historical_hall_evidence') THEN
     RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
    IF entry ? 'historical_hall_evidence' THEN
     IF command_phase<>'DOCUMENTS' OR kind<>'SALES_HEADER' OR fields->>'stock_basis' IS DISTINCT FROM 'CUTOFF_HISTORY'
      OR fields->>'import_batch_id' IS DISTINCT FROM batch::text THEN
      RAISE EXCEPTION 'HISTORICAL_HALL_SOURCE_SCOPE' USING ERRCODE='23514'; END IF;
     hall_evidence:=entry->'historical_hall_evidence';hall_approved:=hall_approvals->(entry->>'target_id');

 IF (hall_evidence->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2') IS DISTINCT FROM (hall_approval->>'format_version'='HISTORICAL_SALES_HALL_APPROVAL_V2') THEN RAISE EXCEPTION 'HISTORICAL_HALL_PROFILE_VERSION' USING ERRCODE='23514'; END IF;
 IF hall_evidence->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2' THEN
 IF jsonb_typeof(hall_evidence) IS DISTINCT FROM 'object' OR hall_evidence-(ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','target_snapshot','source_capture','identity_bridge','resolution','has_difference','review_required']||CASE WHEN hall_evidence ? 'migration_decision' THEN ARRAY['migration_decision'] ELSE ARRAY[]::text[] END)<>'{}' OR NOT(hall_evidence ?& ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','target_snapshot','source_capture','identity_bridge','resolution','has_difference','review_required']) OR hall_evidence->>'basis' IS DISTINCT FROM 'MIGRATION_DERIVED' OR hall_evidence->'original_hall_id' IS DISTINCT FROM 'null'::jsonb OR (jsonb_typeof(hall_evidence->'warehouse_id')='string' AND (hall_evidence->'warehouse_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_evidence->'selected_hall_id')='string' AND (hall_evidence->'selected_hall_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR jsonb_typeof(hall_evidence->'has_difference') IS DISTINCT FROM 'boolean' OR jsonb_typeof(hall_evidence->'review_required') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'HISTORICAL_HALL_V2_SHAPE' USING ERRCODE='23514'; END IF;
 hall_target:=hall_evidence->'target_snapshot';hall_capture:=hall_evidence->'source_capture';
 IF jsonb_typeof(hall_target) IS DISTINCT FROM 'object' OR hall_target-ARRAY['warehouse_id','hall_id','version','captured_at']<>'{}' OR NOT(hall_target ?& ARRAY['warehouse_id','hall_id','version','captured_at']) OR hall_target->'warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' OR hall_target->'hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' OR (CASE WHEN jsonb_typeof(hall_target->'version')='number' THEN (hall_target->'version'#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND (hall_target->'version'#>>'{}')::numeric=trunc((hall_target->'version'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true OR (hall_target->'captured_at'<>'null'::jsonb AND (jsonb_typeof(hall_target->'captured_at') IS DISTINCT FROM 'string' OR ((hall_target->'captured_at'#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true OR NOT isfinite((hall_target->'captured_at'#>>'{}')::timestamptz))) THEN RAISE EXCEPTION 'HISTORICAL_HALL_TARGET_SNAPSHOT_INVALID' USING ERRCODE='23514'; END IF;
 IF hall_evidence ? 'migration_decision' THEN
  hall_decision:=hall_evidence->'migration_decision';
  IF hall_target->'captured_at' IS DISTINCT FROM 'null'::jsonb
   OR hall_evidence->'source_capture' IS DISTINCT FROM 'null'::jsonb
   OR hall_evidence->'identity_bridge' IS DISTINCT FROM 'null'::jsonb
   OR hall_evidence->'resolution' IS DISTINCT FROM 'null'::jsonb
   OR hall_evidence->'review_required' IS DISTINCT FROM 'false'::jsonb
   OR hall_evidence->'has_difference' IS DISTINCT FROM 'false'::jsonb
   OR jsonb_typeof(hall_decision) IS DISTINCT FROM 'object'
   OR hall_decision-ARRAY['basis','decision_ref','evidence_sha256','source_refs']<>'{}'
   OR NOT(hall_decision ?& ARRAY['basis','decision_ref','evidence_sha256','source_refs'])
   OR hall_decision->>'basis' IS DISTINCT FROM 'USER_APPROVED_NEW_WAREHOUSE_HALL'
   OR jsonb_typeof(hall_decision->'decision_ref') IS DISTINCT FROM 'string'
   OR length(hall_decision->>'decision_ref') NOT BETWEEN 1 AND 4096
   OR hall_decision->>'decision_ref' ~ '[[:cntrl:]]'
   OR jsonb_typeof(hall_decision->'evidence_sha256') IS DISTINCT FROM 'string'
   OR (hall_decision->>'evidence_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true
   OR jsonb_typeof(hall_decision->'source_refs') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_MIGRATION_DECISION_INVALID' USING ERRCODE='23514'; END IF;
  IF jsonb_array_length(hall_decision->'source_refs') NOT BETWEEN 1 AND 100
   OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(hall_decision->'source_refs') ref)<>jsonb_array_length(hall_decision->'source_refs')
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_decision->'source_refs') ref
    WHERE jsonb_typeof(ref) IS DISTINCT FROM 'object' OR ref-ARRAY['file_sha256','sheet','row']<>'{}'
     OR NOT(ref ?& ARRAY['file_sha256','sheet','row'])
     OR ref->'file_sha256' IS DISTINCT FROM hall_decision->'evidence_sha256'
     OR jsonb_typeof(ref->'sheet') NOT IN ('string','null')
     OR (jsonb_typeof(ref->'sheet')='string' AND (length(ref->>'sheet') NOT BETWEEN 1 AND 4096 OR ref->>'sheet' ~ '[[:cntrl:]]'))
     OR CASE WHEN jsonb_typeof(ref->'row')='number' AND ref->>'row' ~ '^[1-9][0-9]{0,9}$'
        THEN (ref->>'row')::numeric>2147483647 ELSE true END) THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_MIGRATION_DECISION_INVALID' USING ERRCODE='23514'; END IF;
  IF command_phase='INITIALIZE' THEN
   hall_decision_count:=hall_decision_count+1;
   IF hall_decision_count>1 THEN RAISE EXCEPTION 'HISTORICAL_HALL_MIGRATION_DECISION_APPROVAL_REQUIRED' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
 IF jsonb_typeof(hall_capture) IS DISTINCT FROM 'object' OR hall_capture-ARRAY['capture_evidence_sha256','source_namespace','warehouse_source_key','runtime_warehouse_id','source_native_version','effective_version','runtime_hall_ids','captured_at','transaction_snapshot','relation_basis']<>'{}' OR NOT(hall_capture ?& ARRAY['capture_evidence_sha256','source_namespace','warehouse_source_key','runtime_warehouse_id','source_native_version','effective_version','runtime_hall_ids','captured_at','transaction_snapshot','relation_basis']) OR (jsonb_typeof(hall_capture->'capture_evidence_sha256')='string' AND (hall_capture->'capture_evidence_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'source_namespace')='string' AND length(hall_capture->'source_namespace'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'source_namespace'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'source_namespace'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'source_namespace'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'warehouse_source_key')='string' AND length(hall_capture->'warehouse_source_key'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'warehouse_source_key'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'warehouse_source_key'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'warehouse_source_key'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'transaction_snapshot')='string' AND length(hall_capture->'transaction_snapshot'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'transaction_snapshot'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'transaction_snapshot'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'transaction_snapshot'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'relation_basis')='string' AND length(hall_capture->'relation_basis'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'relation_basis'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'relation_basis'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'relation_basis'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'runtime_warehouse_id')='string' AND (hall_capture->'runtime_warehouse_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR (hall_capture->'source_native_version'<>'null'::jsonb AND ((CASE WHEN jsonb_typeof(hall_capture->'source_native_version')='number' THEN (hall_capture->'source_native_version'#>>'{}')::numeric BETWEEN 0 AND 2147483647 AND (hall_capture->'source_native_version'#>>'{}')::numeric=trunc((hall_capture->'source_native_version'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true)) OR (CASE WHEN jsonb_typeof(hall_capture->'effective_version')='number' THEN (hall_capture->'effective_version'#>>'{}')::numeric BETWEEN 0 AND 2147483647 AND (hall_capture->'effective_version'#>>'{}')::numeric=trunc((hall_capture->'effective_version'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true OR jsonb_typeof(hall_capture->'runtime_hall_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_capture->'runtime_hall_ids') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_capture->'runtime_hall_ids') r)<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_capture->'runtime_hall_ids') r WHERE (jsonb_typeof(r)='string' AND (r#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true) OR jsonb_typeof(hall_capture->'captured_at') IS DISTINCT FROM 'string' OR ((hall_capture->'captured_at'#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true OR NOT isfinite((hall_capture->'captured_at'#>>'{}')::timestamptz) THEN RAISE EXCEPTION 'HISTORICAL_HALL_SOURCE_CAPTURE_SHAPE' USING ERRCODE='23514'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(hall_approval->'source_captures') c WHERE c=hall_capture)<>1 THEN RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_MEMBER_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_evidence->'identity_bridge') IS DISTINCT FROM 'object' OR (hall_evidence->'identity_bridge')-ARRAY['evidence_sha256','record_key']<>'{}' OR NOT(hall_evidence->'identity_bridge' ?& ARRAY['evidence_sha256','record_key']) OR (jsonb_typeof(hall_evidence->'identity_bridge'->'evidence_sha256')='string' AND (hall_evidence->'identity_bridge'->'evidence_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_evidence->'identity_bridge'->'record_key')='string' AND length(hall_evidence->'identity_bridge'->'record_key'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_evidence->'identity_bridge'->'record_key'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_evidence->'identity_bridge'->'record_key'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_evidence->'identity_bridge'->'record_key'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true THEN RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_REFERENCE_INVALID' USING ERRCODE='23514'; END IF;
 SELECT count(*),min(hall_step_bridge_member::text)::jsonb INTO hall_member_count,hall_bridge FROM jsonb_array_elements(hall_approval->'identity_bridges') hall_step_bridge_member WHERE hall_step_bridge_member->'evidence_sha256'=hall_evidence->'identity_bridge'->'evidence_sha256' AND hall_step_bridge_member->'record_key'=hall_evidence->'identity_bridge'->'record_key';
 IF hall_member_count<>1 OR jsonb_typeof(hall_bridge) IS DISTINCT FROM 'object' OR hall_bridge-ARRAY['evidence_sha256','record_key','entity_type','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','hall_links','source_refs','scope']<>'{}' OR NOT(hall_bridge ?& ARRAY['evidence_sha256','record_key','entity_type','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','hall_links','source_refs','scope']) OR hall_bridge->>'entity_type' IS DISTINCT FROM 'WAREHOUSE' OR hall_bridge->'source_namespace' IS DISTINCT FROM hall_capture->'source_namespace' OR hall_bridge->'warehouse_source_key' IS DISTINCT FROM hall_capture->'warehouse_source_key' OR hall_bridge->'runtime_warehouse_id' IS DISTINCT FROM hall_capture->'runtime_warehouse_id' OR hall_bridge->'target_namespace' IS DISTINCT FROM hall_approval->'source_namespace' OR hall_bridge->'target_warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' OR hall_bridge->'source_capture_sha256' IS DISTINCT FROM hall_capture->'capture_evidence_sha256' OR hall_bridge->>'scope' IS DISTINCT FROM 'FIXED_CAPTURE_SCOPE_ONLY' OR (jsonb_typeof(hall_bridge->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_bridge->'source_refs') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_bridge->'source_refs') r)<>jsonb_array_length(hall_bridge->'source_refs') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_bridge->'source_refs') r WHERE jsonb_typeof(r) IS DISTINCT FROM 'object' OR r-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(r ?& ARRAY['file_sha256','sheet','row']) OR (jsonb_typeof(r->'file_sha256')='string' AND (r->'file_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (r->'sheet'<>'null'::jsonb AND ((jsonb_typeof(r->'sheet')='string' AND length(r->'sheet'#>>'{}') BETWEEN 1 AND 4096 AND length(r->'sheet'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(r->'sheet'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (r->'sheet'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true)) OR (CASE WHEN jsonb_typeof(r->'row')='number' THEN (r->'row'#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND (r->'row'#>>'{}')::numeric=trunc((r->'row'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true)) THEN RAISE EXCEPTION 'HISTORICAL_HALL_BRIDGE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_bridge->'hall_links') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_bridge->'hall_links')<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR (SELECT count(DISTINCT h->'runtime_hall_id') FROM jsonb_array_elements(hall_bridge->'hall_links') h)<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_bridge->'hall_links') h WHERE jsonb_typeof(h) IS DISTINCT FROM 'object' OR h-ARRAY['runtime_hall_id','target_hall_id']<>'{}' OR NOT(h ?& ARRAY['runtime_hall_id','target_hall_id']) OR (jsonb_typeof(h->'runtime_hall_id')='string' AND (h->'runtime_hall_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR (jsonb_typeof(h->'target_hall_id')='string' AND (h->'target_hall_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR NOT((hall_capture->'runtime_hall_ids') @> jsonb_build_array(h->'runtime_hall_id'))) THEN RAISE EXCEPTION 'HISTORICAL_HALL_BRIDGE_HALL_DIFFERS' USING ERRCODE='23514'; END IF;
 IF (hall_evidence->>'has_difference')::boolean IS DISTINCT FROM (jsonb_array_length(hall_capture->'runtime_hall_ids')>1) OR hall_evidence->'review_required' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'HISTORICAL_HALL_RESOLUTION_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(hall_capture->'runtime_hall_ids')=1 THEN
 IF hall_evidence->'resolution' IS DISTINCT FROM 'null'::jsonb OR hall_bridge->'hall_links'->0->'target_hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' THEN RAISE EXCEPTION 'HISTORICAL_HALL_BRIDGE_HALL_DIFFERS' USING ERRCODE='23514'; END IF;
 ELSE
 IF jsonb_typeof(hall_evidence->'resolution') IS DISTINCT FROM 'object' OR (hall_evidence->'resolution')-ARRAY['evidence_sha256','record_key']<>'{}' OR NOT(hall_evidence->'resolution' ?& ARRAY['evidence_sha256','record_key']) OR (jsonb_typeof(hall_evidence->'resolution'->'evidence_sha256')='string' AND (hall_evidence->'resolution'->'evidence_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_evidence->'resolution'->'record_key')='string' AND length(hall_evidence->'resolution'->'record_key'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_evidence->'resolution'->'record_key'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_evidence->'resolution'->'record_key'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_evidence->'resolution'->'record_key'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true THEN RAISE EXCEPTION 'HISTORICAL_HALL_RESOLUTION_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*),min(r::text)::jsonb INTO hall_member_count,hall_resolution FROM jsonb_array_elements(hall_approval->'resolutions') r WHERE r->'evidence_sha256'=hall_evidence->'resolution'->'evidence_sha256' AND r->'record_key'=hall_evidence->'resolution'->'record_key';
 IF hall_member_count<>1 OR jsonb_typeof(hall_resolution) IS DISTINCT FROM 'object' OR hall_resolution-ARRAY['evidence_sha256','record_key','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','selected_target_hall_id','runtime_hall_ids','source_refs','scope']<>'{}' OR NOT(hall_resolution ?& ARRAY['evidence_sha256','record_key','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','selected_target_hall_id','runtime_hall_ids','source_refs','scope']) OR hall_resolution->'source_namespace' IS DISTINCT FROM hall_capture->'source_namespace' OR hall_resolution->'warehouse_source_key' IS DISTINCT FROM hall_capture->'warehouse_source_key' OR hall_resolution->'runtime_warehouse_id' IS DISTINCT FROM hall_capture->'runtime_warehouse_id' OR hall_resolution->'target_namespace' IS DISTINCT FROM hall_approval->'source_namespace' OR hall_resolution->'target_warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' OR hall_resolution->'source_capture_sha256' IS DISTINCT FROM hall_capture->'capture_evidence_sha256' OR hall_resolution->>'scope' IS DISTINCT FROM 'FIXED_CAPTURE_SCOPE_ONLY' OR (jsonb_typeof(hall_resolution->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_resolution->'source_refs') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_resolution->'source_refs') r)<>jsonb_array_length(hall_resolution->'source_refs') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_resolution->'source_refs') r WHERE jsonb_typeof(r) IS DISTINCT FROM 'object' OR r-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(r ?& ARRAY['file_sha256','sheet','row']) OR (jsonb_typeof(r->'file_sha256')='string' AND (r->'file_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (r->'sheet'<>'null'::jsonb AND ((jsonb_typeof(r->'sheet')='string' AND length(r->'sheet'#>>'{}') BETWEEN 1 AND 4096 AND length(r->'sheet'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(r->'sheet'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (r->'sheet'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true)) OR (CASE WHEN jsonb_typeof(r->'row')='number' THEN (r->'row'#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND (r->'row'#>>'{}')::numeric=trunc((r->'row'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true)) OR hall_resolution->'selected_target_hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' OR jsonb_typeof(hall_resolution->'runtime_hall_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_resolution->'runtime_hall_ids') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_resolution->'runtime_hall_ids') r)<>jsonb_array_length(hall_resolution->'runtime_hall_ids') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_resolution->'runtime_hall_ids') r WHERE (jsonb_typeof(r)='string' AND (r#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true) OR NOT((hall_resolution->'runtime_hall_ids') @> (hall_capture->'runtime_hall_ids') AND (hall_capture->'runtime_hall_ids') @> (hall_resolution->'runtime_hall_ids')) OR jsonb_array_length(hall_resolution->'runtime_hall_ids')<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(hall_bridge->'hall_links') h WHERE h->'target_hall_id'=hall_evidence->'selected_hall_id') THEN RAISE EXCEPTION 'HISTORICAL_HALL_RESOLUTION_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 END IF;
 ELSE

 IF jsonb_typeof(hall_evidence) IS DISTINCT FROM 'object'
  OR hall_evidence-ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','warehouse_hall_id_at_capture','warehouse_version','captured_at','has_difference','review_required']<>'{}'
  OR NOT(hall_evidence ?& ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','warehouse_hall_id_at_capture','warehouse_version','captured_at','has_difference','review_required'])
  OR hall_evidence->>'format_version' IS DISTINCT FROM 'HISTORICAL_SALES_HALL_EVIDENCE_V1'
  OR coalesce(hall_evidence->>'basis','') NOT IN ('ORIGINAL','MIGRATION_DERIVED','PENDING_REVIEW')
  OR (hall_evidence->>'warehouse_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
  OR jsonb_typeof(hall_evidence->'has_difference') IS DISTINCT FROM 'boolean' OR jsonb_typeof(hall_evidence->'review_required') IS DISTINCT FROM 'boolean'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['original_hall_id','selected_hall_id','warehouse_hall_id_at_capture']) field
   WHERE hall_evidence->field IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(hall_evidence->field) IS DISTINCT FROM 'string'
    OR (hall_evidence->>field ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true)) THEN
  RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_SHAPE' USING ERRCODE='23514'; END IF;
 IF (hall_evidence->'warehouse_version'='null'::jsonb) IS DISTINCT FROM (hall_evidence->'captured_at'='null'::jsonb)
  OR (hall_evidence->'warehouse_hall_id_at_capture'<>'null'::jsonb AND hall_evidence->'warehouse_version'='null'::jsonb) THEN
  RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF hall_evidence->'warehouse_version'<>'null'::jsonb THEN
  IF jsonb_typeof(hall_evidence->'warehouse_version') IS DISTINCT FROM 'number'
   OR (hall_evidence->>'warehouse_version' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true
   OR (hall_evidence->>'warehouse_version')::numeric>2147483647
   OR jsonb_typeof(hall_evidence->'captured_at') IS DISTINCT FROM 'string'
   OR (hall_evidence->>'captured_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true
   OR NOT isfinite((hall_evidence->>'captured_at')::timestamptz) THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 IF (hall_evidence->>'basis'='ORIGINAL' AND (hall_evidence->'original_hall_id'='null'::jsonb
    OR hall_evidence->'selected_hall_id' IS DISTINCT FROM hall_evidence->'original_hall_id'
    OR (hall_evidence->>'has_difference')::boolean IS DISTINCT FROM (hall_evidence->'warehouse_hall_id_at_capture'<>'null'::jsonb AND hall_evidence->'warehouse_hall_id_at_capture'<>hall_evidence->'original_hall_id')
    OR (hall_evidence->>'review_required')::boolean IS DISTINCT FROM ((hall_evidence->>'has_difference')::boolean OR hall_evidence->'warehouse_hall_id_at_capture'='null'::jsonb)))
  OR (hall_evidence->>'basis'='MIGRATION_DERIVED' AND (hall_evidence->'original_hall_id'<>'null'::jsonb OR hall_evidence->'warehouse_hall_id_at_capture'='null'::jsonb
    OR hall_evidence->'selected_hall_id' IS DISTINCT FROM hall_evidence->'warehouse_hall_id_at_capture' OR hall_evidence->'has_difference'<>'false'::jsonb OR hall_evidence->'review_required'<>'false'::jsonb))
  OR (hall_evidence->>'basis'='PENDING_REVIEW' AND (hall_evidence->'original_hall_id'<>'null'::jsonb OR hall_evidence->'selected_hall_id'<>'null'::jsonb
    OR hall_evidence->'warehouse_hall_id_at_capture'<>'null'::jsonb OR hall_evidence->'has_difference'<>'false'::jsonb OR hall_evidence->'review_required'<>'true'::jsonb)) THEN
  RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_CONTRADICTION' USING ERRCODE='23514'; END IF;
 END IF;

     IF hall_approved IS NULL OR hall_approved->>'source_key' IS DISTINCT FROM source_key
      OR NOT((hall_approved->'source_refs') @> (entry->'source_refs') AND (entry->'source_refs') @> (hall_approved->'source_refs'))
      OR jsonb_array_length(hall_approved->'source_refs')<>jsonb_array_length(entry->'source_refs')
      OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(entry->'source_refs') ref)<>jsonb_array_length(entry->'source_refs')
      OR hall_approved->'evidence' IS DISTINCT FROM hall_evidence
      OR fields->'hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' OR fields->'warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' THEN
      RAISE EXCEPTION 'HISTORICAL_HALL_APPROVAL_MEMBERSHIP' USING ERRCODE='23514'; END IF;
     IF hall_evidence->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2' THEN
      -- Capture the locked warehouse now. Its authorization and its committed
      -- import evidence come from the existing INIT and MASTER records.
      SELECT to_jsonb(w) INTO hall_actual FROM naijue_erp.warehouse w WHERE w.id=(hall_target->>'warehouse_id')::uuid
       AND w.hall_id=(hall_target->>'hall_id')::uuid AND w.version=(hall_target->>'version')::integer
       AND w.version>0 FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_CHANGED' USING ERRCODE='23514'; END IF;
      IF hall_target->'captured_at'='null'::jsonb THEN
       FOR hall_master_kind,hall_master_key,hall_master_target IN
        SELECT 'WAREHOUSE',hall_approved->'target_initialization'->>'warehouse_source_key',(hall_target->>'warehouse_id')::uuid
        UNION ALL SELECT 'HALL',hall_approved->'target_initialization'->>'hall_source_key',(hall_target->>'hall_id')::uuid
         WHERE hall_evidence ? 'migration_decision'
       LOOP
        SELECT s.* INTO STRICT hall_master_record FROM naijue_erp.import_record s
         WHERE s.import_batch_id=baseline.id AND s.source_system=request->>'namespace'
          AND s.source_entity_type=hall_master_kind AND s.target_type=hall_master_kind AND s.target_id=hall_master_target
          AND s.source_key=hall_master_key AND s.status='IMPORTED';
        hall_master_id:=hall_master_record.id;
        hall_master_proof:=naijue_erp.standard_import_record_proof(hall_master_id);
        SELECT * INTO STRICT hall_master_audit FROM naijue_erp.audit_change WHERE operation_id=(hall_master_proof->>'operation_id')::uuid;
        IF hall_master_proof->'current_operation' IS DISTINCT FROM 'false'::jsonb
         OR hall_master_proof->>'batch_id' IS DISTINCT FROM baseline.id::text
         OR hall_master_proof->>'source_system' IS DISTINCT FROM request->>'namespace'
         OR hall_master_proof->>'source_hash' IS DISTINCT FROM request->>'package_manifest_sha256'
         OR (hall_master_proof->>'cutoff_at')::timestamptz IS DISTINCT FROM baseline.cutoff_at
         OR hall_master_record.reviewed_at IS DISTINCT FROM hall_master_audit.occurred_at
         OR hall_master_record.source_record_hash IS DISTINCT FROM encode(sha256(convert_to(jsonb_build_object(
          'source_key',hall_master_proof->'source_key','fields',hall_master_proof->'fields','source_refs',hall_master_proof->'source_refs')::text,'UTF8')),'hex')
         OR hall_master_audit.after_values->>'phase' IS DISTINCT FROM 'MASTER'
         OR hall_master_audit.object_id IS DISTINCT FROM baseline.id OR hall_master_audit.actor_account_id IS DISTINCT FROM actor
         OR hall_master_audit.after_values->'whole_package_v2'->>'root_operation' IS DISTINCT FROM root_operation::text
         OR ((hall_master_audit.after_values->'whole_package_v2'->>'ordinal')::integer < child_ordinal) IS DISTINCT FROM true
         OR hall_master_audit.after_values->'batched_import_v1'->'identity' IS DISTINCT FROM group_identity
         OR hall_master_audit.after_values->'batched_import_v1'->'descriptor'->>'phase' IS DISTINCT FROM 'MASTER'
         OR hall_master_audit.after_values->'batched_import_v1'->>'controller' IS DISTINCT FROM session_user
         OR hall_master_audit.after_values->'request'->>'plan_sha256' IS DISTINCT FROM request->>'plan_sha256'
         OR hall_master_audit.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM request->>'package_manifest_sha256'
         OR hall_master_audit.after_values->'request'->>'namespace' IS DISTINCT FROM request->>'namespace'
         OR hall_master_audit.after_values->'request'->>'cutoff_at' IS DISTINCT FROM request->>'cutoff_at'
         OR hall_master_proof->'fields'->>'id' IS DISTINCT FROM hall_master_target::text
         OR (hall_evidence ? 'migration_decision' AND
          (hall_master_proof->'source_refs' @> (hall_evidence->'migration_decision'->'source_refs')) IS DISTINCT FROM true)
         OR (hall_master_kind='WAREHOUSE' AND (hall_master_proof->'fields'->'hall_id' IS DISTINCT FROM hall_actual->'hall_id'
          OR hall_master_proof->'fields'->'version' IS DISTINCT FROM hall_actual->'version')) THEN
         RAISE EXCEPTION 'HISTORICAL_HALL_INITIALIZATION_MASTER_REQUIRED' USING ERRCODE='23514'; END IF;
        IF hall_master_kind='WAREHOUSE' THEN
         hall_observation:=jsonb_build_object('warehouse_source_record_id',hall_master_id,'warehouse_operation_id',hall_master_proof->'operation_id',
          'warehouse_id',hall_actual->'id','hall_id',hall_actual->'hall_id','version',hall_actual->'version',
          'captured_at',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
        END IF;
       END LOOP;
      END IF;
     ELSE
     IF hall_evidence->'warehouse_version'<>'null'::jsonb AND NOT EXISTS(SELECT 1 FROM naijue_erp.warehouse w
      WHERE w.id=(hall_evidence->>'warehouse_id')::uuid AND w.version=(hall_evidence->>'warehouse_version')::integer
       AND to_jsonb(w.hall_id) IS NOT DISTINCT FROM hall_evidence->'warehouse_hall_id_at_capture') THEN
      RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_CHANGED' USING ERRCODE='23514'; END IF;
     END IF;
    END IF;
    IF entry ? 'zero_amount_archive' THEN
     IF kind IS DISTINCT FROM 'SALES_HEADER' OR fields->>'business_type' IS DISTINCT FROM 'SALE'
      OR fields->>'stock_basis' IS DISTINCT FROM 'CUTOFF_HISTORY'
      OR jsonb_typeof(entry->'zero_amount_archive') IS DISTINCT FROM 'object'
      OR (entry->'zero_amount_archive')-ARRAY['profile','records']<>'{}'
      OR entry->'zero_amount_archive'->>'profile' IS DISTINCT FROM 'ZERO_AMOUNT_SOURCE_ARCHIVE_V1'
      OR jsonb_typeof(entry->'zero_amount_archive'->'records') IS DISTINCT FROM 'array'
     THEN RAISE EXCEPTION 'ZERO_ARCHIVE_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     IF jsonb_array_length(entry->'zero_amount_archive'->'records') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'ZERO_ARCHIVE_COUNT_INVALID' USING ERRCODE='23514'; END IF;
     FOR parent_row IN SELECT value AS archived FROM jsonb_array_elements(entry->'zero_amount_archive'->'records') LOOP
      IF jsonb_typeof(parent_row.archived) IS DISTINCT FROM 'object'
       OR parent_row.archived-ARRAY['source_key','amount','source_refs','original_values']<>'{}'
       OR NOT(parent_row.archived ?& ARRAY['source_key','amount','source_refs','original_values'])
       OR jsonb_typeof(parent_row.archived->'source_key') IS DISTINCT FROM 'string'
       OR (length(parent_row.archived->>'source_key')+(SELECT count(*) FROM regexp_split_to_table(parent_row.archived->>'source_key','') AS cp(ch) WHERE ascii(ch)>65535)) NOT BETWEEN 1 AND 4096
       OR parent_row.archived->>'source_key' ~ '[[:cntrl:]]'
       OR parent_row.archived->'amount' IS DISTINCT FROM '"0.00"'::jsonb
       OR jsonb_typeof(parent_row.archived->'source_refs') IS DISTINCT FROM 'array'
       OR jsonb_typeof(parent_row.archived->'original_values') IS DISTINCT FROM 'object'
      THEN RAISE EXCEPTION 'ZERO_ARCHIVE_RECORD_INVALID' USING ERRCODE='23514'; END IF;
      IF jsonb_array_length(parent_row.archived->'source_refs') NOT BETWEEN 1 AND 100
       OR (SELECT count(*) FROM jsonb_each(parent_row.archived->'original_values')) NOT BETWEEN 1 AND 100
       OR EXISTS(SELECT 1 FROM jsonb_each(parent_row.archived->'original_values') v WHERE (length(v.key)+(SELECT count(*) FROM regexp_split_to_table(v.key,'') AS cp(ch) WHERE ascii(ch)>65535)) NOT BETWEEN 1 AND 4096 OR v.key ~ '[[:cntrl:]]' OR v.key ~* '(password|passwd|secret|token|credential|authorization|private.?key|密码|口令|令牌)' OR v.key IN ('__proto__','constructor','prototype') OR jsonb_typeof(v.value) NOT IN ('string','null') OR (length(v.value#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(v.value#>>'{}','') AS cp(ch) WHERE ascii(ch)>65535))>16384)
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(parent_row.archived->'source_refs') ref WHERE jsonb_typeof(ref) IS DISTINCT FROM 'object' OR ref-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(ref ?& ARRAY['file_sha256','sheet','row']) OR (ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR jsonb_typeof(ref->'sheet') NOT IN ('string','null') OR (jsonb_typeof(ref->'sheet')='string' AND ((length(ref->>'sheet')+(SELECT count(*) FROM regexp_split_to_table(ref->>'sheet','') AS cp(ch) WHERE ascii(ch)>65535)) NOT BETWEEN 1 AND 4096 OR ref->>'sheet' ~ '[[:cntrl:]]')) OR (CASE WHEN ref->>'row' ~ '^[1-9][0-9]{0,9}$' THEN (ref->>'row')::numeric>2147483647 ELSE false END) OR jsonb_typeof(ref->'row') IS DISTINCT FROM 'number' OR (ref->>'row' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true)
      THEN RAISE EXCEPTION 'ZERO_ARCHIVE_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
     END LOOP;
     IF EXISTS(SELECT 1 FROM jsonb_array_elements(entry->'zero_amount_archive'->'records') x GROUP BY x->>'source_key' HAVING count(*)>1) THEN RAISE EXCEPTION 'ZERO_ARCHIVE_DUPLICATE_SOURCE_KEY' USING ERRCODE='23514'; END IF;
    END IF;
    amount_evidence:=NULL;
    IF kind='SALES_LINE' AND (fields->>'line_amount')::numeric IS DISTINCT FROM (fields->>'quantity')::numeric*(fields->>'deal_price')::numeric THEN
     IF command_phase IS DISTINCT FROM 'DOCUMENTS'
      OR coalesce(cfg->>'schema_declarations_sha256','') NOT IN ('f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b')
      OR NOT(cfg ? 'historical_line_amount_approval') THEN
      RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
     amount_fact:=amount_facts_by_id->target::text;
     IF amount_fact IS NULL THEN RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
     IF amount_fact->>'line_source_key' IS DISTINCT FROM source_key
      OR amount_fact->>'sales_id' IS DISTINCT FROM fields->>'sales_id'
      OR amount_fact->'quantity' IS DISTINCT FROM fields->'quantity'
      OR amount_fact->'deal_price' IS DISTINCT FROM fields->'deal_price'
      OR amount_fact->'line_amount' IS DISTINCT FROM fields->'line_amount'
      OR NOT((amount_fact->'source_refs') @> (entry->'source_refs') AND (entry->'source_refs') @> (amount_fact->'source_refs'))
      OR jsonb_array_length(amount_fact->'source_refs')<>jsonb_array_length(entry->'source_refs')
      OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(entry->'source_refs') ref)<>jsonb_array_length(entry->'source_refs') THEN
      RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_SOURCE_DIFFERS' USING ERRCODE='23514'; END IF;
     SELECT parent INTO STRICT amount_parent FROM (
      SELECT parent FROM jsonb_array_elements(payload->'rows') parent WHERE parent->>'entity_type'='SALES_HEADER' AND parent->>'target_id'=amount_fact->>'sales_id'
      UNION ALL SELECT naijue_erp.standard_import_record_proof(s.id) FROM naijue_erp.import_record s
       WHERE s.import_batch_id=batch AND s.target_type='SALES_HEADER' AND s.target_id=(amount_fact->>'sales_id')::uuid) parents;
     IF amount_parent->>'source_key' IS DISTINCT FROM amount_fact->>'sales_source_key'
      OR amount_parent->'fields'->>'id' IS DISTINCT FROM amount_fact->>'sales_id'
      OR amount_parent->'fields'->>'import_batch_id' IS DISTINCT FROM batch::text
      OR amount_parent->'fields'->>'stock_basis' IS DISTINCT FROM 'CUTOFF_HISTORY'
      OR jsonb_typeof(amount_parent->'source_refs') IS DISTINCT FROM 'array'
      OR NOT((amount_parent->'source_refs') @> (amount_fact->'sales_source_refs') AND (amount_fact->'sales_source_refs') @> (amount_parent->'source_refs'))
      OR jsonb_array_length(amount_parent->'source_refs')<>jsonb_array_length(amount_fact->'sales_source_refs')
      OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(amount_parent->'source_refs') ref)<>jsonb_array_length(amount_parent->'source_refs') THEN
      RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_PARENT_DIFFERS' USING ERRCODE='23514'; END IF;
     amount_evidence:=jsonb_build_object('format_version','HISTORICAL_LINE_AMOUNT_BOUND_V1',
      'attestation_sha256',amount_descriptor->>'sha256','evidence_sha256',amount_approval->>'evidence_sha256','fact',amount_fact);
    END IF;
    parsed:=jsonb_build_object('source_key',source_key,'fields',fields,'source_refs',entry->'source_refs');
    IF amount_evidence IS NOT NULL THEN parsed:=parsed||jsonb_build_object('historical_line_amount_evidence',amount_evidence); END IF;
    IF entry ? 'explicit_zero_evidence' THEN parsed:=parsed||jsonb_build_object('explicit_zero_evidence',entry->'explicit_zero_evidence'); END IF;
    IF entry ? 'zero_amount_archive' THEN parsed:=parsed||jsonb_build_object('zero_amount_archive',entry->'zero_amount_archive'); END IF;
    IF entry ? 'historical_hall_evidence' THEN parsed:=parsed||jsonb_build_object('historical_hall_evidence',entry->'historical_hall_evidence'); END IF;
    source_hash:=encode(sha256(convert_to(parsed::text,'UTF8')),'hex');
    IF hall_observation IS NOT NULL THEN
     hall_target_captures:=hall_target_captures||jsonb_build_object(record_id::text,hall_observation||jsonb_build_object('input_source_record_hash',source_hash));
    END IF;
    item:=jsonb_build_object('id',record_id,'entity_type',CASE WHEN command_phase='KEYS' THEN 'INVENTORY_BASELINE' ELSE kind END,'source_key',source_key,'target_type',kind,'target_id',target,'file_ref',file_ref,
      'fields',fields,'source_refs',entry->'source_refs','identity_basis',entry->'identity_basis','source_hash',source_hash);
    IF entry ? 'historical_hall_evidence' THEN item:=item||jsonb_build_object('historical_hall_evidence',entry->'historical_hall_evidence'); END IF;
    IF entry ? 'zero_amount_archive' THEN item:=item||jsonb_build_object('zero_amount_archive',entry->'zero_amount_archive'); END IF;
    IF command_phase='KEYS' THEN item:=item||jsonb_build_object('ledger_entry_id',entry->>'ledger_entry_id'); END IF;
    IF entry ? 'explicit_zero_evidence' THEN item:=item||jsonb_build_object('explicit_zero_evidence',entry->'explicit_zero_evidence'); END IF;
    IF amount_evidence IS NOT NULL THEN item:=item||jsonb_build_object('historical_line_amount_evidence',amount_evidence); END IF;
    records:=records||jsonb_build_array(item);
   END LOOP;
  ELSE
   fields:=jsonb_build_object('baseline_batch_id',baseline.id,'manifest_sha256',b.source_hash,'cutoff_at',b.cutoff_at,'alignment_sha256',cfg->>'alignment_sha256');
   IF phase='BASELINE_SEAL' AND cfg->'explicit_zero_approval'->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' THEN fields:=fields||jsonb_build_object('inventory_baseline_scope',cfg->'explicit_zero_approval'); END IF;
   records:=records||jsonb_build_array(jsonb_build_object('id',payload->>'approval_record_id','entity_type',CASE phase WHEN 'BASELINE_SEAL' THEN 'STANDARD_BASELINE_APPROVAL' ELSE 'DOCUMENT_CONVERSION_APPROVAL' END,
    'source_key',CASE phase WHEN 'BASELINE_SEAL' THEN CASE WHEN cfg->'explicit_zero_approval'->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' THEN 'FINAL_BASELINE_SCOPE_V1' ELSE 'FINAL_EXPLICIT_KEYS' END ELSE 'FINAL_DOCUMENT_CONVERSION' END,'target_type','IMPORT_BATCH','target_id',batch,'file_ref',b.source_manifest_ref,'fields',fields,
    'source_hash',CASE phase WHEN 'DOCUMENT_PUBLISH' THEN b.source_hash ELSE encode(sha256(convert_to(fields::text,'UTF8')),'hex') END));
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(records) LOOP
   kind:=item->>'target_type';counter:=CASE WHEN item->>'entity_type'='BATCH_NAMESPACE_BINDING' THEN 'NAMESPACE' WHEN kind IN ('IMPORT_BATCH','INVENTORY_KEY','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') THEN kind ELSE 'MASTER' END;
   cp:=jsonb_set(cp,ARRAY['counts',counter],to_jsonb((cp->'counts'->>counter)::numeric+1));
   IF kind='INVENTORY_KEY' AND (item->'fields'->>'quantity')::bigint<>0 THEN cp:=jsonb_set(cp,'{counts,INVENTORY_EFFECT}',to_jsonb((cp->'counts'->>'INVENTORY_EFFECT')::numeric+1));ledger_ids:=ledger_ids||jsonb_build_array(item->>'ledger_entry_id'); END IF;
   source_ids:=source_ids||jsonb_build_array(item->>'id');
  END LOOP;
  SELECT sum(value::numeric) INTO total FROM jsonb_each_text(cp->'counts');
  IF total<0 OR total>2147483647 THEN RAISE EXCEPTION 'STANDARD49_PROGRESS_COUNTER_OVERFLOW' USING ERRCODE='23514'; END IF;
  cp:=jsonb_set(cp,'{cursor}',to_jsonb(total));
 END IF;
 IF (cp->>'sequence')::numeric>2147483646 OR (cp->>'cursor')::numeric>2147483647 THEN RAISE EXCEPTION 'STANDARD49_PROGRESS_COUNTER_OVERFLOW' USING ERRCODE='23514'; END IF;
 -- The public request, typed intents and exact result are prepared before native
 -- mutations. All final-state validators run deferred; no guard is disabled.
 result:=jsonb_build_object('profile','STANDARD_IMPORT_SQL_V1','operationId',operation,'batchId',batch,'sequence',cp->'sequence','cursor',cp->'cursor',
  'status',CASE WHEN command_phase='PUBLISH' THEN 'IMPORTED' WHEN command_phase='INITIALIZE' OR phase='DOCUMENT_STAGE' THEN 'STAGED' ELSE 'VALIDATING' END,
  'ledgerEntryIds',ledger_ids,'sourceRecordIds',source_ids,'phase',phase,'planSha256',request->>'plan_sha256','packageManifestSha256',request->>'package_manifest_sha256',
  'baselineBatchId',CASE WHEN command_phase='INITIALIZE' THEN batch ELSE baseline.id END,'documentBatchId',CASE WHEN command_phase='INITIALIZE' THEN payload->>'document_batch_id' ELSE initial_request->'payload'->>'document_batch_id' END);
 result:=result||jsonb_build_object('batched_import_v1',group_marker);
 IF hall_target_captures<>'{}' THEN result:=result||jsonb_build_object('historicalHallTargetCapturesSha256',encode(sha256(convert_to(hall_target_captures::text,'UTF8')),'hex')); END IF;
 INSERT INTO naijue_erp.operation_receipt(id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,completed_at)
  VALUES(operation,actor,request->>'request_key',fingerprint,action_name,'IMPORT',batch,'COMMITTED',result,transaction_timestamp());
 INSERT INTO naijue_erp.audit_change(id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,occurred_at)
  VALUES(operation,operation,actor,'IMPORT',batch,action_name,CASE WHEN old_cp IS NULL THEN NULL ELSE (old_cp->>'sequence')::integer+1 END,(cp->>'sequence')::integer+1,old_cp,
   jsonb_build_object('profile','STANDARD_IMPORT_SQL_V1','phase',phase,'request',request,'checkpoint',cp,'records',records,'origin',CASE WHEN command_phase='INITIALIZE' THEN 'CURRENT_PROVISIONING' ELSE 'STANDARD_SOURCE' END,
    'current_admin',CASE WHEN command_phase='INITIALIZE' THEN CASE WHEN payload->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS' THEN payload->'admin'||jsonb_build_object('provisioned_snapshot',admin_provision_snapshot) ELSE payload->'admin' END ELSE NULL END,
    'batched_import_v1',group_marker,'whole_package_v2',CASE WHEN command_phase='INITIALIZE' THEN jsonb_build_object('root_operation',root_operation,'ordinal',0,'full_xid',pg_current_xact_id()::text,'backend_pid',pg_backend_pid(),'controller',session_user) ELSE jsonb_build_object('root_operation',root_operation,'ordinal',child_ordinal) END)||CASE WHEN hall_target_captures<>'{}' THEN jsonb_build_object('historical_hall_target_captures',hall_target_captures) ELSE '{}'::jsonb END,transaction_timestamp());
 FOR item IN SELECT value FROM jsonb_array_elements(records) LOOP
  INSERT INTO naijue_erp.import_record(id,import_batch_id,source_system,source_entity_type,source_key,source_record_hash,source_file_ref,target_type,target_id,status,decision_reason,reviewed_at)
   VALUES((item->>'id')::uuid,batch,request->>'namespace',item->>'entity_type',item->>'source_key',item->>'source_hash',item->>'file_ref',item->>'target_type',(item->>'target_id')::uuid,'IMPORTED',
    jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',operation)::text,transaction_timestamp());
 END LOOP;
 IF command_phase IN ('MASTER','DOCUMENTS') AND phase<>'DOCUMENT_STAGE' THEN
  FOR item IN SELECT value FROM jsonb_array_elements(records) WHERE value->>'target_type'<>'IMPORT_BATCH' ORDER BY
   array_position(ARRAY['BARCODE_SCHEME','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','CUSTOMER','SUPPLIER','HALL','WAREHOUSE','STAFF','PRODUCT','SKU','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','TRANSFER_HEADER','SALES_LINE','TRANSFER_LINE','SALES_SETTLEMENT'],value->>'target_type'),
   CASE WHEN value->>'target_type'='PRODUCT_CATEGORY' THEN value->'fields'->>'parent_id' IS NOT NULL ELSE false END, value->>'target_id' LOOP
   kind:=item->>'target_type';table_name:=lower(kind COLLATE "C");fields:=item->'fields';
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',table_name) INTO expected USING fields;
   IF kind='SIZE_GROUP_MEMBER' THEN SELECT to_jsonb(t) INTO actual FROM naijue_erp.size_group_member t WHERE size_group_id=(fields->>'size_group_id')::uuid AND size_id=(fields->>'size_id')::uuid;
   ELSIF kind='PAYMENT_ACCOUNT_HALL' THEN SELECT to_jsonb(t) INTO actual FROM naijue_erp.payment_account_hall t WHERE payment_account_id=(fields->>'payment_account_id')::uuid AND hall_id=(fields->>'hall_id')::uuid;
   ELSE EXECUTE format('SELECT to_jsonb(t) FROM naijue_erp.%I t WHERE id=$1',table_name) INTO actual USING (item->>'target_id')::uuid; END IF;
   IF kind='STAFF' THEN
    IF cfg->>'schema_declarations_sha256' IN ('9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e','f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b') THEN
     IF NOT(fields ? 'departure_date') OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='naijue_erp.staff'::regclass AND attname='departure_date' AND atttypid='date'::regtype AND NOT attnotnull AND NOT attisdropped AND attgenerated='') THEN RAISE EXCEPTION 'WHOLE_STAFF_SCHEMA_NOT_INSTALLED' USING ERRCODE='23514'; END IF;
     IF fields->'departure_date' IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(fields->'departure_date') IS DISTINCT FROM 'string' OR (fields->>'departure_date' COLLATE "C" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') IS DISTINCT FROM true OR to_char((fields->>'departure_date')::date,'YYYY-MM-DD') IS DISTINCT FROM fields->>'departure_date') THEN RAISE EXCEPTION 'WHOLE_STAFF_DATE_INVALID' USING ERRCODE='23514'; END IF;
    ELSIF fields ? 'departure_date' THEN RAISE EXCEPTION 'WHOLE_SCHEMA_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
   END IF;
   IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(fields) key) IS DISTINCT FROM
      (SELECT array_agg(attname::text ORDER BY attname) FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||table_name) AND attnum>0 AND NOT attisdropped AND attgenerated='' AND NOT(kind='STAFF' AND attname='departure_date' AND atttypid='date'::regtype AND NOT attnotnull AND coalesce(cfg->>'schema_declarations_sha256','') NOT IN ('9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e','f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b'))) THEN
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
   END IF;
   -- A source-explicit zero is a real current balance, but has no ledger effect.
   -- Only records present in the validated package reach this loop; missing keys remain absent.
   INSERT INTO naijue_erp.inventory_balance(warehouse_id,sku_id,quantity,version,last_operation_id,updated_at)
    VALUES((fields->>'warehouse_id')::uuid,(fields->>'sku_id')::uuid,quantity,1,operation,transaction_timestamp());
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
   IF cfg->'explicit_zero_approval'->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' THEN
    zero_descriptor:=cfg->'explicit_zero_approval';
    FOR kind IN SELECT unnest(ARRAY['WAREHOUSE','SKU']) LOOP
     SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(format('{"id":"%s"}',src.target_id)||chr(10),'' ORDER BY src.target_id),''),'UTF8')),'hex') INTO n,zero_hash
      FROM naijue_erp.import_record src WHERE src.import_batch_id=batch AND src.status='IMPORTED' AND src.target_type=kind;
     item:=zero_descriptor->CASE kind WHEN 'WAREHOUSE' THEN 'warehouses' ELSE 'skus' END;
     IF n IS DISTINCT FROM (item->>'count')::numeric OR zero_hash IS DISTINCT FROM item->>'records_sha256' THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_MEMBERS_DIFFERS' USING ERRCODE='23514'; END IF;
    END LOOP;
    WITH actual AS MATERIALIZED (
     SELECT approved->'fields' AS f FROM naijue_erp.audit_change prior_audit
      CROSS JOIN LATERAL jsonb_array_elements(prior_audit.after_values->'records') approved
      JOIN naijue_erp.import_record src ON src.id=(approved->>'id')::uuid AND src.import_batch_id=batch AND src.status='IMPORTED' AND src.target_type='INVENTORY_KEY'
      WHERE prior_audit.object_type='IMPORT' AND prior_audit.object_id=batch AND prior_audit.after_values->>'phase'='KEYS'
       AND prior_audit.after_values->'whole_package_v2'->>'root_operation'=root_operation::text
    ), totals AS (
     SELECT w.target_id, count(f)::integer explicit_count,count(f) FILTER(WHERE f->>'quantity'<>'0')::integer nonzero_count,coalesce(sum((f->>'quantity')::numeric),0)::text quantity
      FROM naijue_erp.import_record w LEFT JOIN actual ON (f->>'warehouse_id')::uuid=w.target_id
      WHERE w.import_batch_id=batch AND w.status='IMPORTED' AND w.target_type='WAREHOUSE' GROUP BY w.target_id
    )
    SELECT (SELECT count(*) FROM actual),(SELECT count(*) FROM actual WHERE f->>'quantity'<>'0'),
     (SELECT encode(sha256(convert_to(coalesce(string_agg(format('{"warehouse_id":"%s","sku_id":"%s","quantity":"%s"}',f->>'warehouse_id',f->>'sku_id',f->>'quantity')||chr(10),'' ORDER BY f->>'warehouse_id' COLLATE "C",f->>'sku_id' COLLATE "C"),''),'UTF8')),'hex') FROM actual),
     (SELECT jsonb_agg(jsonb_build_object('warehouse_id',t.target_id,'explicit_count',t.explicit_count,'nonzero_count',t.nonzero_count,'quantity',t.quantity) ORDER BY t.target_id) FROM totals AS t)
     INTO zero_consumed,zero_unique,zero_hash,actual;
    IF zero_consumed IS DISTINCT FROM (zero_descriptor->'explicit_values'->>'count')::bigint OR zero_unique IS DISTINCT FROM (zero_descriptor->>'nonzero_count')::bigint
     OR zero_hash IS DISTINCT FROM zero_descriptor->'explicit_values'->>'records_sha256' OR actual IS DISTINCT FROM zero_descriptor->'warehouse_totals'
    THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_VALUES_OR_WAREHOUSE_TOTAL_DIFFERS' USING ERRCODE='23514'; END IF;
   ELSIF cfg ? 'explicit_zero_approval' THEN
    SELECT count(*),count(DISTINCT (approved->'explicit_zero_evidence'->>'approval_row')::integer) INTO zero_consumed,zero_unique
     FROM naijue_erp.audit_change prior_audit CROSS JOIN LATERAL jsonb_array_elements(prior_audit.after_values->'records') approved
     WHERE prior_audit.object_type='IMPORT' AND prior_audit.object_id=batch
      AND prior_audit.after_values->'whole_package_v2'->>'root_operation'=root_operation::text
      AND prior_audit.after_values->>'phase'='KEYS' AND approved->>'target_type'='INVENTORY_KEY' AND approved ? 'explicit_zero_evidence';
    IF zero_consumed<>(cfg->'explicit_zero_approval'->>'record_count')::bigint OR zero_unique<>zero_consumed
    THEN RAISE EXCEPTION 'EXPLICIT_ZERO_APPROVAL_NOT_EXACTLY_CONSUMED' USING ERRCODE='23514'; END IF;
   END IF;
   FOR kind IN SELECT jsonb_object_keys(cfg->'expected_master_counts') LOOP
    SELECT count(*) INTO n FROM naijue_erp.import_record WHERE import_batch_id=batch AND target_type=kind AND status='IMPORTED';
    IF n<>(cfg->'expected_master_counts'->>kind)::integer THEN RAISE EXCEPTION 'STANDARD_MASTER_CLOSURE_INCOMPLETE: %',kind USING ERRCODE='23514'; END IF;
   END LOOP;
  ELSE
   IF cfg ? 'historical_settlement_retention_approval' THEN
    DECLARE sr_doc jsonb;sr_count bigint;sr_rows bigint;sr_operation uuid;
    BEGIN
     SELECT count(*),coalesce(sum((SELECT count(*) FROM naijue_erp.sales_settlement st WHERE st.sales_id=hh.id)),0) INTO sr_count,sr_rows
      FROM naijue_erp.sales_header hh WHERE hh.import_batch_id=batch AND hh.status='APPROVED' AND hh.stock_basis='CUTOFF_HISTORY'
       AND EXISTS(SELECT 1 FROM naijue_erp.sales_settlement st WHERE st.sales_id=hh.id)
       AND hh.net_due IS DISTINCT FROM (SELECT sum(st.amount*CASE st.direction WHEN 'RECEIVE' THEN 1 ELSE -1 END) FROM naijue_erp.sales_settlement st WHERE st.sales_id=hh.id);
     IF sr_count<>(CASE WHEN (cfg->'historical_settlement_retention_approval'->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' OR (cfg->'historical_settlement_retention_approval'->>'sha256'='b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05' AND (initial_request->>'namespace') IS NOT DISTINCT FROM 'naijue:tplus:20261102' AND (initial_request->>'package_manifest_sha256') IS NOT DISTINCT FROM '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679')) THEN 24 ELSE 25 END) OR sr_rows<>(CASE WHEN (cfg->'historical_settlement_retention_approval'->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' OR (cfg->'historical_settlement_retention_approval'->>'sha256'='b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05' AND (initial_request->>'namespace') IS NOT DISTINCT FROM 'naijue:tplus:20261102' AND (initial_request->>'package_manifest_sha256') IS NOT DISTINCT FROM '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679')) THEN 26 ELSE 27 END) THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_EXACT_SET_REQUIRED' USING ERRCODE='23514'; END IF;
     FOR sr_doc IN SELECT value FROM jsonb_array_elements(((cfg->'historical_settlement_retention_approval'->>'utf8')::jsonb)->'documents') LOOP
      SELECT rr.id INTO STRICT sr_operation FROM naijue_erp.operation_receipt rr WHERE rr.target_type='SALES' AND rr.target_id=(sr_doc->>'sales_id')::uuid AND rr.action='MIGRATE_DOCUMENT' AND rr.status='COMMITTED';
      PERFORM naijue_erp.assert_document_migration(sr_operation);
     END LOOP;
    END;
   END IF;
   IF cfg ? 'historical_line_amount_approval' THEN
    amount_approval:=(cfg->'historical_line_amount_approval'->>'utf8')::jsonb;
    SELECT count(*),count(DISTINCT s.target_id) INTO amount_consumed,amount_unique FROM naijue_erp.import_record s
     CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) proof
     WHERE s.import_batch_id=batch AND s.target_type='SALES_LINE' AND proof ? 'historical_line_amount_evidence';
    IF amount_consumed<>jsonb_array_length(amount_approval->'lines') OR amount_unique<>amount_consumed
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(amount_approval->'lines') fact WHERE NOT EXISTS(
      SELECT 1 FROM naijue_erp.import_record s CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) proof
       WHERE s.import_batch_id=batch AND s.target_type='SALES_LINE' AND s.target_id=(fact->>'line_id')::uuid
        AND proof->'historical_line_amount_evidence'->'fact'=fact
        AND proof->'historical_line_amount_evidence'->>'attestation_sha256'=cfg->'historical_line_amount_approval'->>'sha256')) THEN
     RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_EXACT_SET_REQUIRED' USING ERRCODE='23514'; END IF;
   END IF;
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch sealed_baseline WHERE sealed_baseline.id=baseline.id AND sealed_baseline.status='IMPORTED' AND sealed_baseline.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
     AND sealed_baseline.source_hash=b.source_hash AND sealed_baseline.source_name=b.source_name AND sealed_baseline.cutoff_at=b.cutoff_at) THEN RAISE EXCEPTION 'STANDARD_ACTIVATION_BASELINE_MISMATCH' USING ERRCODE='23514'; END IF;
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
 -- Whole package: deferred constraints fire only after both final publications.
 RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','operation_id',operation,'batch_id',batch,'request_sha256',fingerprint,'state','PENDING_TRANSACTION','sequence',cp->'sequence','cursor',cp->'cursor','receipt',result);
END $function$
$ddl_2$;
   EXECUTE $ddl_3$DROP FUNCTION naijue_erp.assert_document_migration_checked_v1(uuid,uuid) RESTRICT$ddl_3$;
   EXECUTE $ddl_4$DROP FUNCTION naijue_erp.assert_final_history_origin_v1(uuid,uuid,uuid,jsonb) RESTRICT$ddl_4$;
   EXECUTE $ddl_5$DROP FUNCTION naijue_erp.standard_history_hall_projection_store_v1(jsonb,jsonb,jsonb,jsonb) RESTRICT$ddl_5$;
   EXECUTE $ddl_6$DROP FUNCTION naijue_erp.standard_history_hall_projection_relation_v1() RESTRICT$ddl_6$;
  ELSIF after_metadata IS DISTINCT FROM before_metadata THEN
   RAISE EXCEPTION 'HALL165_REVERSE_EXISTING_METADATA_DIFFERS' USING ERRCODE='55000';
  END IF;
 END LOOP;
END
$hall165$;
COMMIT;
