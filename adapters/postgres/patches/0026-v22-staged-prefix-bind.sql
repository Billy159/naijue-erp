-- Approved WRITE-CONTRACT v22. T45 only after exact current64c4/QB review.
-- No source data DML, new routine, table/column, role/ACL or migration registry change.
BEGIN;
DO $parent$
DECLARE expected jsonb:=$routines$[{"signature":"naijue_erp.assert_barcode_scheme_initialization_v19(uuid,uuid)","body":"8d4f7d457403d6c4737e5a9b38d6d4f48c0ef3c5e94dd2e8ff408d3b57a198ca","definition":"6bb8508f96c6913a1e12df36d83b4bca798083b3f6dd7c8904ad4fb3dcf864c4"},{"signature":"naijue_erp.assert_core_initialization_v14(uuid,uuid,boolean)","body":"5ca42bcac20e7ad3affb3ac09829fd27c481752a303b1090133f23ecee3ad99d","definition":"c73515250ed33d91e7131ac79f544d0bbec7448480f5ad9167fafe8c3cea4004"},{"signature":"naijue_erp.assert_history_typed_closure(uuid,jsonb,jsonb)","body":"8556e917e6a251dd1eb97974fbb6f793d3e46a1ef10f6ef7fd77fb7ad539d00f","definition":"6a9c5ddbea225389b9ad65ea593103342f1cdc0a610a18abbffe6ca6100477be"},{"signature":"naijue_erp.assert_native_bootstrap_accounts(uuid)","body":"171c59ba962a287dd02bb9eac993512e114783a470063108a07ba5e206cbabca","definition":"aa6369eb9802d34a04a667a30feb8497a8cc97e92cb89006473eeef0a1f21a87"},{"signature":"naijue_erp.assert_native_product_season_source(naijue_erp.import_source_row)","body":"3a753b412fa4a648e26c4a2e398a4b52cc694c04dc1352a98513cb2220d4d661","definition":"ef5a944703a00740afb22638fa74581868a879e29707c2b8824053fab8355c60"},{"signature":"naijue_erp.assert_retained_sku_reference(uuid)","body":"4c956a82b9531b1f385f9aecd9c6d20fa84ce6d434bb0a41d2a0c96ebb7fae5d","definition":"3d589e7426a70312377ded12dc4ada401ffee97604586443d86c6c297dba1fb8"},{"signature":"naijue_erp.assign_runtime_document_number()","body":"bca336abcd0ef4a57c22d2ee19564e7ea744257303fb8eec06c822efd551500e","definition":"8c095ff5bb6f589f614edc030704a625fd688270452c0266864f0daaefa3af7d"},{"signature":"naijue_erp.check_hall_default_customer_enabled()","body":"6a89df4342530f3a3bdd185abbdd372b3372799b341a17ae9ad65be86ded91ee","definition":"aa095c37d064bc986ff3e3bdc2821bbdc810574cd10a7cc41d56c63171a70b74"},{"signature":"naijue_erp.cutoff_import_lock()","body":"82a621b9cea39c9cc273d5cb790b364fad004875760644633280d2e24e64ccc7","definition":"0be8b3337b3ee64acb0a5c02deb31de893634f066e97119df64b6879a5f0a411"},{"signature":"naijue_erp.exact_historical_customer_source_matches(jsonb,jsonb)","body":"ac26aa52f4131d996d6abe0db810a0e0817a12ffa043cdfb2250c951bfd0f011","definition":"b52b05513ef2b3610dcaf18012b9f5c1b323e52c09fae2a597aa30ab1f1efb16"},{"signature":"naijue_erp.freeze_cutoff_sales_detail()","body":"dcfa1a3abb87368cf2f18663880f9a2ea9377a3599e985e13c7241220fd85a12","definition":"334a90388c04f49f3a56665f898e8b401928560fee8c7b59568180df3fec2585"},{"signature":"naijue_erp.freeze_imported_identity()","body":"0a17cf0a670ca8c9d34f2de1ec34de9b5197410fc01f82af4273a26e877a44e5","definition":"d4952bbdec60adcf840bbfad571ab6ef61912c24a30591aa9607b168b8f5e765"},{"signature":"naijue_erp.guard_balance_identity()","body":"02f2db383ff8c5826c7148f73bb780319c977bffa5798bc233159d83d89e58fc","definition":"44fd60986e86e23615f78466dd935c715d3e0c68b20b97d3d5244667cc4646e6"},{"signature":"naijue_erp.guard_contributor_link()","body":"2937ecd3e974e2ad78e0bfce4790b96d97953d4bf113406a838063b366895983","definition":"dd045cfdc192e976d1468de4461d3702ffa03285e597ee980b3d6294ba146464"},{"signature":"naijue_erp.guard_cutoff_ledger()","body":"71ecb569279de61709578ffe2f29d85140993ed155fce07e7beb797307c491b5","definition":"7bfcd2352467e6873de8a1cdc15c0bbd56d74d715ade6cb2102dff5d49f17c06"},{"signature":"naijue_erp.guard_exact_historical_customer_current_usage()","body":"78e895d72d6f806089d2bc7cb877293e1263d26ba8265dd7f3b5e2203e956245","definition":"b7a43467b1f9031abb74c224d5df5a15bb1852ab9fe0e750fde52310ff217b51"},{"signature":"naijue_erp.guard_header_native_reference()","body":"1584d2600c763f0d38cd3dd4fa7dd14ea90465ef9376d7165a58d71bce0dec3c","definition":"9057c8c6840cf56424065e491309a1119810aca7508c57fdb1372ab34a10afe8"},{"signature":"naijue_erp.guard_header_native_reference_publication()","body":"3419f73d296fcb84f77eff79edaa5034cb90f33a6363d0687d316ee697f785c0","definition":"f4405d92eeab0962543f5a657170a94c7674b89e7361d3bd423f9557e8a24b98"},{"signature":"naijue_erp.guard_history_closure_stage()","body":"d05947c6d7ef430d043c10038cce1d72f7e44e4efb2a2112c499ea8d107d47e0","definition":"eafd3936fe222d20c4a3796d06c4c87ea761e7eaa606ff0e632f3a757dcbe84e"},{"signature":"naijue_erp.guard_history_insert()","body":"98fcf82074f4aaf0712b2af3aca5a12a7e4975933712caffd577e652eca7e12f","definition":"c7ef2183770a042c43d996b068d2e950969b363a49bc0b984b00bc33fe0d6cbe"},{"signature":"naijue_erp.guard_history_numeric_ledger()","body":"b32ccd2af06876d91fe4b33a4e2309a3f79af7d012ddf301ce84b773118e5794","definition":"b9cfb359decbfdec2be42c341da47e1b7166aea9016e2731b457d73f3e26010b"},{"signature":"naijue_erp.guard_history_publication()","body":"6ad32797b7fe81e6427b3abec90aca378778be9af30b014b55966fbed0bff77e","definition":"1c8923a0d9764a5a9d72ae0a2f8a5407b3c3c495fb3a47acab059d95381ca1de"},{"signature":"naijue_erp.guard_history_typed_publication()","body":"fc386026e40ca43d36bdb5e7422001878a7f91c95c2e36bce28272b4d792e506","definition":"ff1d1ffd5952c99c40d4949880ef41d29b2c803867bb7c21b4f750a4cb8b52d6"},{"signature":"naijue_erp.guard_import_accounting_claim()","body":"298996ca170c969aa06df8dfa44219b86a9db0ae4dc1c07f726167a518f62acf","definition":"597b83547f3d8178780fc4c7b9d74f312beb30981616b73d96353bba1b9dcd49"},{"signature":"naijue_erp.guard_import_accounting_publication()","body":"b41ad04a99fb7af999c22b13cdc7ad9b747e4df67e3f11bd44e7632d15a747a6","definition":"0a203f60d31d01261792b29944bd7a802e7bc2d0bde8d6a3adbfd6e1f3779568"},{"signature":"naijue_erp.guard_import_batch()","body":"f0e35d2d5978c92d26c1eab6525a87d2ae3450a525daa14131b479b03856d29a","definition":"3c8e8a404a2c951f53c4bc1dd6fa31d6767fceceb226cd015c63af246a3da035"},{"signature":"naijue_erp.guard_import_record()","body":"8a79dbc011cdaf0582e2bd1eefc7ea94fce15d24f6aa1ac0fa25c43afb4e7e16","definition":"5cbb7ecc246c55f739b387a5f8d4875718f1c27b8f4d28251f7b286041085dfb"},{"signature":"naijue_erp.guard_maintenance_account_event()","body":"965d9d3433b929ccd151b9a147eeef713770d7b7311e49c80cfaa3d17b118549","definition":"c6870332ccb661b63abcd8edcf5f2424c5644355d26e32cf74db18851b375a1f"},{"signature":"naijue_erp.guard_maintenance_audit_actor()","body":"ac0ce9c91f34b9d8d34eb5e7d26f595319bfa6ad3dfe3ae33a4f2f5edf1eb217","definition":"76002f78e2e597d08f4c0cc11ec633d4b157ff1801b337d20137ffb4a4e87347"},{"signature":"naijue_erp.guard_maintenance_before_root()","body":"574add1ad436482c7593725ac4b1b58cabe6b982b538cf0e1f22c1783723712f","definition":"b39211914b2f0aecae632ab03a78c8dedf64b5192df2a7f2be8fe7cccebd5f4b"},{"signature":"naijue_erp.guard_maintenance_child_write()","body":"a19def51718e008e541482dd1e6f2d2ab9257842ce7e66ad6e62aedcfa216d8a","definition":"5e2b9881c7bc3498b9ac4b47c4e693c8367104d0758f46db4415319e09de0580"},{"signature":"naijue_erp.guard_native_catalogue_binding()","body":"7418579c0d1c3a1951696a12ad165a421d26b87f0e449d9d7d250497dc2ddc21","definition":"3d69c1f6e6e3bd024b8b9deed768d5dd5c17d939bf80a5aa265721a6ed486f5e"},{"signature":"naijue_erp.guard_native_catalogue_publication()","body":"d2eaa009760d63f245d562570ca4c8fce038633da5233a8c7ab7142190a30ceb","definition":"f90063737a689f1967137bad7f3212b3b786929b1c14902e5dcebc36d3ba602a"},{"signature":"naijue_erp.guard_native_creation_identity()","body":"4827b76ff4df9beae18411033d2e6e13a04eea2d648aa58bb67d179145d107dc","definition":"d887ae6f4a5ec1d04e78558a8abffc54d54b0292a7375c9c76f7c7ca0a3a87aa"},{"signature":"naijue_erp.guard_native_party_import_intent()","body":"262e74a37ba12883a4978c4d99b6ecca000d245186b585a9e5b35ad31ccf8d7f","definition":"26e93b5f1a1e0c35476432d51313eba1c86acb5992052853a81586ce7b5a851a"},{"signature":"naijue_erp.guard_native_payment_binding()","body":"774cc9b1604a8d0948f73c7298fa67a10233962af218b89fe0b9675107148d35","definition":"cb92181c759be458851c94fa28852b1c663bf168fb03496ce89f4da9217f0fe7"},{"signature":"naijue_erp.guard_native_payment_publication()","body":"993b114dfbec87428a42a9f6aa7d0a6ecbeef67fd85bc00754fa4eb80c7e6797","definition":"155b319f09c8a338f75ff085de2a408f8a9be558bf4f3224bce8885f628ac2dd"},{"signature":"naijue_erp.guard_product_image_color()","body":"a49cc6bc4c49931eb50c81dd95e08a760b2ea6de73e19a0496611fe63fe22b18","definition":"3a7b816565b12dba7211c6ae9ed729f1901d8652cef13e556d61886e7ed3c793"},{"signature":"naijue_erp.guard_product_season_selection()","body":"bd97ac1bc0a8c9a3221c12b794f5976bf0e092a2907aa2dd9e6378b718d29560","definition":"fa438438a399f21a74effcd95fe66217ff6089e157888e04713766907d26d153"},{"signature":"naijue_erp.guard_referenced_season_identity()","body":"8eb0b3435f063f4a653c31f632fe6751fecc3864a375a72753bcf4090bb18f2c","definition":"b88b4c4abea0a04271d52c3432c5d6d46ccb1716efd405471ba534cdb5c5e58a"},{"signature":"naijue_erp.guard_retained_catalogue_delete()","body":"dec785b8b1f818b2daa3af4d3872139710cae32178516839e669f59aa6609758","definition":"1e45a9fa1ca4b412d5c382496d85d7e07efcd9fb6d5e1011a73e10207ae15dcc"},{"signature":"naijue_erp.guard_retained_catalogue_reference()","body":"91cc169d60ca6db2700ed97e49632504cfba9d957ea467a4777137f946c6923c","definition":"0a178796128864c4378961663c56c0b8922bbf8a0dc530c8b9a37dce67509ec2"},{"signature":"naijue_erp.guard_runtime_document_number()","body":"52d92723d9ecb5f16eb57c5ae50e0f8cf322b4b5f3848ab88712f41aeb0887bd","definition":"1c87bfb1a88f0d53898174fb59461e724ce6f023c88e7f829899609d20f61022"},{"signature":"naijue_erp.guard_successor_publication26()","body":"a055abd422ff4d81d0cf87e11cf659dcc221eda1a18b774cd62034c2c3f74c14","definition":"5b267c870119f2e1dcb334a8b4ceeca38661dc668bbafb6cffb095906bab4fed"},{"signature":"naijue_erp.guard_successor_source26()","body":"cdf91a3949d6aefbb16c67f7d82dcf99b60730f9a6884468c064102c9887b710","definition":"f55953ba0f3838d91d0d17b487869132d8582b93328bf99fbe74b0e3ce52e21c"},{"signature":"naijue_erp.history_closure_count_map(jsonb,text[])","body":"ef82c0a7124d288103df38503a849b96aa936289b2ee29166b4f0a6529f476d6","definition":"2b7a03e1b6e376b38d76982bb54d734f80b20a5ca2c00d567bca727ea36087d4"},{"signature":"naijue_erp.history_closure_digest(uuid,text,text,text,uuid,jsonb)","body":"749101b8670e32814b875adaaf753da6c50ddcd0860d5ca3ebb000f996f1b63b","definition":"110513d567da227aea90515fa2ce81f7dd9b15bf2130f2465775e5c3f44138e3"},{"signature":"naijue_erp.history_closure_document_rows(uuid,text,uuid,boolean)","body":"f8401b06df7815f63f9a83e781961f55725f82246c87d86b7a99a9c19c482ce1","definition":"8c135dca77bbc50df3a255e4ff437b994ef63be9f7882e3008503fc238bb034a"},{"signature":"naijue_erp.history_closure_encode(jsonb,integer)","body":"b4ad51b2b17c9248c80de0ead3ae5f50bf5fe887e36597b081ce250a94623a5c","definition":"d2987650265c5225593b74108ccc4493ae719040e5ddb79efc9116dba96c26cc"},{"signature":"naijue_erp.history_closure_finish(text,bigint,bytea)","body":"94b84af2d05d8a9f34c0135a8c0d70f5b633a9b43e6ec6d2bca8de554e8abac8","definition":"d162d7b993ef2f615a2bf50ad8a51c067f515aa96aa0b9e3dd99317bbf602fa4"},{"signature":"naijue_erp.history_closure_fold(bytea,text)","body":"31ed823c127e85537196de072b76077749d939f3241fa53b9f1c76f8fdba9062","definition":"ed0186f1b9d483f3aedb9485a643def4c6727ad06f8b803cf21db5b7e82b8874"},{"signature":"naijue_erp.history_closure_projection(text,jsonb)","body":"0af6d70c56a463c351be1dd732d345bbb533ae98b0b07e36f6ef08a4efd72011","definition":"8083d03e61ad1782177e9c126f16f481fd4b9c4ccb20b9c23d9c5c13c43ac668"},{"signature":"naijue_erp.history_closure_projection_columns(text)","body":"a8a3d4d43341d86dfad188d191c3076203e06ea8f1a6919c4d0efddee76286a6","definition":"1f5bc42e2a4588a1b7e50c26f71de168b914fda6be48b382812838d224a43a42"},{"signature":"naijue_erp.history_closure_projection_key(text,jsonb)","body":"6e2584dac9f079fe2061570c15b13549a3abac512a2a809835046e6fe2c50222","definition":"8a74e0b1ce4dcef448edd0f5a093d7d91caae6d763317fc4fcfe1bc46ea11648"},{"signature":"naijue_erp.history_closure_row_hash(text,text,jsonb)","body":"c7ef0fdc273f23ab5ec1ae6c870746146dab90a6ecef8ecf319de0704df697bb","definition":"634af05198856a2480b06fe46bd14ac899c527bc4825f6a11bd2ee7b833d9d1f"},{"signature":"naijue_erp.history_closure_rows(uuid)","body":"098ba7215c7c893903e2b72762e2036e94bc23b763f3842e378b3d55b3d3f639","definition":"bc04ac9b463650ee50ef54b4b5c6a4209f76f6ad28d3d74c44bd3e5906ecf95d"},{"signature":"naijue_erp.history_closure_seed(text)","body":"532918606a4dd24ebae46a55dfe7d2f0803602798c63742bcd975b7e1179f2c7","definition":"08a5e12056289265a9d1b4d06ba10f33f04fef59dbf96b102398029d309b6f7e"},{"signature":"naijue_erp.history_effective_writes_closed()","body":"c06027597f11a9cf7f2ae06bf5e47e5c21349b54851fb21df6895ef22a2855b7","definition":"c1eba6b3a3a9912d91af32de5d569644040deb6c2f7e8bedf742b2f9c7d1c4cc"},{"signature":"naijue_erp.history_numeric_current_facts(text,uuid)","body":"dadecb6cce657834ce3719eb339f56f95dbbf27d6e0a92216940ed91697cadc8","definition":"174fdad530129abc18ebe64a6c6767ece9ab815a7b457a2b46a6374c4762896b"},{"signature":"naijue_erp.history_numeric_money(jsonb,boolean)","body":"8c588f3b6145cb1609898dd46e3abfb7b1bd37b3b9318f1863dcfac530ee200b","definition":"0a3745112d5c9d65657ad84d49bb5f72903da2fe1e2acfe5a9f6ccb7b1f34001"},{"signature":"naijue_erp.history_revision_not_enabled()","body":"1e69497d7023ab61fdac15e358707c9b9b73b7f3b281a01c306c2fd25d3c985c","definition":"35d28368ab9a64c601c79b95a68be7afa2c96c1141cdfb31c37f9a52848bff4a"},{"signature":"naijue_erp.import_source_key_lock(text,text,text)","body":"07404b25633a5c48ae1a530a48cdebed11107e187d660c99a7e781bb4957fa24","definition":"ed3d3eb027f637a7479faab3e691ad39138bf2e0156dcda3e0452100917828b6"},{"signature":"naijue_erp.inventory_key_admission(uuid,uuid)","body":"a9d7a2519941605e997e5ab59cff7cf847192ed910ef4107ba09aadc64e0fc7a","definition":"fe606835588c0eb093d56355a6526e8bd0b2be9e7c7ca874cc6b54f0c9f91a15"},{"signature":"naijue_erp.inventory_key_lock(uuid,uuid)","body":"c6f444fbbfc527fec7f4031fd0ea7f07eb0a98202b11340e8f7da398fa117079","definition":"acebb091419d738bbdf8c13fcc4c7f373314b4b5b1e4699c6c4c4448feb4678e"},{"signature":"naijue_erp.inventory_runtime_key_admitted(uuid,uuid)","body":"945a2cc1e250ed1cedd3ca2083b80120174d06d015455bd4288d186e0c27f377","definition":"657a27072884506697050d1c3d06b218479513b223dadc18f4db9b88a4c1e90e"},{"signature":"naijue_erp.is_exact_historical_customer_only(uuid)","body":"1f35799a742f402d86cde6a979511dc83ae74d62cd5c106ffcef162a68510403","definition":"059ffa781c40ad60542e8d5984b4e1a079589e5338e432b924586af7fc0dab72"},{"signature":"naijue_erp.is_native_party_import_insert(text,jsonb)","body":"a3c8dfac77e8a4f060932aded92f53da97b68bdcf48d2ede19781c3e54c86412","definition":"7ea4ad58346e44d7fdc0cf1e5fefb158a0e80afc483d702a1e86f450574dc5d0"},{"signature":"naijue_erp.keep_barcode_binding_identity()","body":"14f6d02bca58955681e8d03236fb236cbfe3d041d35ecdb326cd3fa7e38d2733","definition":"ce2bbc7a23a95499fd74d07de578ca628d9d1c1f964c7a443191a2386d7b5223"},{"signature":"naijue_erp.keep_party_native_identity()","body":"44c3a7110bf40ef38e73972b493f36279b28124097b31a9a6f25e5adc13ad4b9","definition":"ea1931c810cf22d37e581c389c25fb0b16ed333f7fe6b1965a4fc1a780b673c7"},{"signature":"naijue_erp.keep_sales_line_owner()","body":"95f3dc678bbdc8ac47a2f1c76fe13f872bed088e7484aebc46a523fc13cfd241","definition":"034cfd5728ce973258527fd1348972919f455ee9186f1e0483f6ddf664e11490"},{"signature":"naijue_erp.keep_transfer_header_provenance()","body":"68d1af54e61704be47e9fe4097592e812d3f7a910dc2d7190351c2b427267bf6","definition":"ae4d7931ac918cb8faac787a0da5b6321e7e672a69d12e9a9caf562e214e48de"},{"signature":"naijue_erp.keep_transfer_line_owner()","body":"763d52e081f96f872adb50658403f5f2f7f83f7c914d002b0e771ebe9c055335","definition":"ce59d1b37d708d8d34be8b7e4b7d839f05baa8cfe74c40cfdcd67c2e2a9f3014"},{"signature":"naijue_erp.maintenance_account_credential_action(naijue_erp.audit_change,uuid)","body":"f17617bc8f02fd0731d0a97eaca90553441235e032de1dbf9086e84c987fbe7a","definition":"e2099bb09219a9126f9db76a1a90ebe82723ff9a8f83d75affcc6cb2be3feca6"},{"signature":"naijue_erp.maintenance_action_allowed(text,text)","body":"50b2fa0fbf733d7c98b40aa612107a20262cb063852cb3f2cabbefc750742c4a","definition":"0e4a1e3a7e8ff34732a2cb72c6466bcd3b1a43f629eb649f9c9c90f863b19f56"},{"signature":"naijue_erp.maintenance_administrator_mutex()","body":"d6809b2abf7b3f211cd7422b517e867d0c1378f9e7fe9b98eacde2521c6d1ea8","definition":"5c7ccef0a2b8ab9db8465cb25de3ad561b99da44e2c6b5408a0a6b53bcdf4f48"},{"signature":"naijue_erp.maintenance_audit_is_current(uuid)","body":"4537d6df2b73e17e386b100845049da08d3fab3584c87ef8d7095660198bf699","definition":"eedf455059f6add216ac99a503eb80c1b3f0be96cce3f4830a35df65e9d8e511"},{"signature":"naijue_erp.maintenance_check_account_credential(naijue_erp.audit_change,jsonb,jsonb)","body":"577bf0a5de72c8dc6d080c1b4f18a669398d5738c16b75d11ecc1c89d0156ab7","definition":"365e4e372459dfe6014d8715586566f60b470af7282db22b098c5d83b4f1f5fe"},{"signature":"naijue_erp.maintenance_check_category_order(naijue_erp.audit_change)","body":"77c86d2788e88f2922a66c662a91b95c0f76d6ea00587148c36421feabde281e","definition":"e564cf0afc2c357dbb994eed8fa47746886f012e81c82b4f6a37c4367b7d08e6"},{"signature":"naijue_erp.maintenance_check_product_children(naijue_erp.audit_change,boolean)","body":"c7edab87301fc05b7f33db2eb9df30b2da0d28ed9154dfa8d11cbba9fdbe6dad","definition":"50b2a9e948d37e21547b4705ff8a58bf17e4d5e76e793061f58bc95b2e6c1fc9"},{"signature":"naijue_erp.maintenance_check_staff_accounts(naijue_erp.audit_change,jsonb,jsonb,boolean)","body":"ea4e151ccb89d97ed40edc6e3164594bccda0fc28f2879f614f230830fdc0c22","definition":"5c53a6f14a9f2b0af1cf3190643ee96ee00e17ddc7d78014569ea59f89054ed6"},{"signature":"naijue_erp.maintenance_complete_row_matches(jsonb,jsonb)","body":"34c25d78bc34ed57b1acbbdbfbca9b0adfd78dc8dcb6cc8c42cf5673f5da5d21","definition":"891c939a916c739fd85a092a8b2b8136219a789c349cf374e676f37b82edaca6"},{"signature":"naijue_erp.maintenance_evidence_matches(jsonb,jsonb)","body":"cb201d859235d7af9ef52616c64b705e5586b11894d57fbc50b2b0a7615abaf3","definition":"0e4a2a4acad900cd5a254348ab6bac4b84b73ca57cae2db464ec7e92fbc910b5"},{"signature":"naijue_erp.maintenance_exact_rows_match(jsonb,jsonb,text)","body":"8b21824423a27f20074768c09998fba819887c949b4f20b57e35db0815133161","definition":"8c69928cfdb6e979fef6270f5836188d7894e22e5ad9e888284dac4f2af7e9a0"},{"signature":"naijue_erp.maintenance_payment_halls(uuid)","body":"d96c975c57af714d458275a383e0e2bdaeef9214d4bc64420207f36bcea55869","definition":"713a7128e57bd39f58b19e9eddb94d7c56d0f94bb85dffb8ae43b4865da5cc4b"},{"signature":"naijue_erp.maintenance_product_child_row(text,uuid,uuid)","body":"69145227348d366932814f079f0b63d1bb6109cc36d8bb8c9f8ae53fafd1b9fa","definition":"0fd50f5c6f447120155a7acd0554ab724799967bb89614b412737dbfdd67e1cd"},{"signature":"naijue_erp.maintenance_root_table(text)","body":"7ed286cf1e5bb8629b02e7cab4412dc0df502d560661be9823d234c466565fe3","definition":"4fbd20ef54283a21c7e4865426845115853d834f44f20df81cf8638189261c23"},{"signature":"naijue_erp.maintenance_staff_accounts(uuid)","body":"a191dc7b42cec0f41f42c6d371a2e959c90019983f4f79cef86db99d2e8fa989","definition":"112e237686ce9c9de7e0a5646b9c06508ffb8ac34d1ac6b5191da90f97a8bd61"},{"signature":"naijue_erp.native_creation_operation_valid(text,uuid,uuid)","body":"118bbe55c39e00948ab087f808812522b565344b924e64916f6cfa91645a3f7a","definition":"61e04a9273692f6fa08b91d414f7ce5b586df4bf85a7a75f4136e537db79a0af"},{"signature":"naijue_erp.party_key_values(text,text,boolean,integer)","body":"d23eb5601f984007df5d52661a101a422852e20c0bcd75f1cadd5a5bbbaef649","definition":"ea211992b970ee8e67541ac04345ff8ee3ed0d33a49adc1db5283ec17315bb8f"},{"signature":"naijue_erp.published_inventory_key(uuid,uuid)","body":"fa8234711ad74b3afd250b2143840baa863f05f1e23c92b85574b48b4208adc6","definition":"42a73a9452c955a39cb93edfb54b76503954c4de4d98a11d101c313038d69868"},{"signature":"naijue_erp.reject_immutable_change()","body":"3daef49e525ad973be82350a1551e979198d21ff58f3f1bb92a4f7292e4d038c","definition":"f652bba8e293bce19d5ab596c2739dfe3c011d2c98a9d23f16ef81968ec47e51"},{"signature":"naijue_erp.reject_unimplemented_cutoff_write()","body":"2e108a1bd9e9304f63cde9eb8b726c448ebcb2d2b371f8b3a8a41aebb6d21e0a","definition":"6c8101a587638a58714f058e92663715d1cc117a134681387ee5f2d5e3d5844d"},{"signature":"naijue_erp.safe_maintenance_evidence(jsonb,integer)","body":"4a0d9d21eadf3e839d1d0c23f7efe8a0ef14123dd521a553eefcc7362ab3f927","definition":"08203e1b4770655449fdb898bf0f238144f032feba54cd71882caa17f04cdb8d"},{"signature":"naijue_erp.transfer_header_audit_values(naijue_erp.transfer_header)","body":"0c92b020490243f55132a5acb15ecee8caca92fb88db5f75e877e2f2430ec8ad","definition":"5c14ca67badffc0c87ed88f861884f3ea80bdd8c6629ffb46acb6f424bdcc4d7"},{"signature":"naijue_erp.transfer_line_audit_values(naijue_erp.transfer_line)","body":"ce924832c6a9b4a762ff80e031279273f521e4e17139c7d89a4930004313f49e","definition":"4cc67ed8c35a6ffd5b58627e329c8db138a3fd2d8e2fca7e7831f67cc84ffb68"},{"signature":"naijue_erp.valid_history_counts(jsonb)","body":"6c143e2bf81bcd53e2c9074aa2ab4e1781c746bc7a99bb0064f378f77de80280","definition":"ad145faaafe3c7b231a13c7d42c859b127d5ea96f27bf4d25130a6b9b529dbec"},{"signature":"naijue_erp.valid_product_season_ids(uuid[])","body":"b6b3932264857c59998025cece6241a4e819b80f9bc72e6bf0ed4e907890cc65","definition":"aafaca96243c68229c6597e310e3262266c682f7ab742cead025719fb3618ee3"},{"signature":"naijue_erp.validate_available_administrator_commit()","body":"3a9a1bea930614761185af90b8591a539b855647974b68b004869c80f5e5ba18","definition":"b7517b522fa7d5f8243a2ed8777f83655f219b69f386a209b770ad5f8b25dfea"},{"signature":"naijue_erp.validate_baseline_source_commit()","body":"ec5e9a331d0f8148ec21e28d5e8a4ddb82ac66d923ea2490abee3f3000ed75c9","definition":"42f302b6c6096844959d65d227882585df1f98dd1f3a041792d3d4b96857fa11"},{"signature":"naijue_erp.validate_document_specification_commit()","body":"b02bff6115bcf2c87758f8313a57a1a693733ba3ea192fcb1657bd176c587c06","definition":"7c3ac19eeee010b8a3a5975ce4fdfbdceecae99fae26c6cd3ca0ed44885f984e"},{"signature":"naijue_erp.validate_exact_historical_customer_intent(naijue_erp.native_party_import_evidence,naijue_erp.import_batch)","body":"b9968150e138d455658dd7d437c8026b7bfdce466146b961d64fd2934f099c98","definition":"50ceb4812b3837a14ec7d6436394592e1eced712041406215b7aabbde5993a8d"},{"signature":"naijue_erp.validate_exact_native_reversal()","body":"3ef72272c6cb9b7ccbfffc393a31fdd85babdb3efb333baae839482d571f362e","definition":"99f3a4c888a184c819bca4af51b764e081222e9c6fa6b101e690d89533aa52f1"},{"signature":"naijue_erp.validate_history_closure_commit()","body":"e61d2c5dd34792f5ca277cada1dc12a6904b1be95031c0a6c4810080b24dd03b","definition":"14e2a85259052622973733a91f2b09cf9207f3fdb2744e02e0d08f8d5bdbbceb"},{"signature":"naijue_erp.validate_history_numeric_balance_commit()","body":"fab0bf7a3f1681d6034b09dbb5c7ad8efa606c6fa82f24fc101bc5b70636a837","definition":"858bc89bcd021e3d4d6a148bcde6cf80b32d71bf18ce5e47c15507d3963da2ba"},{"signature":"naijue_erp.validate_history_numeric_receipt_commit()","body":"e69f92651dc7a8313e354d47bd4f1ffc1c97fb30aa5c56dcfc49f69511a1d7d6","definition":"0258e5e8921ca9a5b5fdd557a30e5c06682aa0d2c11227d55c2cfefc82646021"},{"signature":"naijue_erp.validate_history_numeric_revision_commit()","body":"6cc941ed8ea63927fea7f372da6477c5def8e809a8dde1c348d07331ff9be0b6","definition":"90c62728514acb95f180e1b7c22b08da5c0c4fb2a357ac9b4028315d2edf2d08"},{"signature":"naijue_erp.validate_history_product_proofs(uuid)","body":"dab49bb495de85d5e66350affd348f85e0595411ea7ab7378104a3963db2a38e","definition":"6efe3b92080650bafa97b5b6fa4a81ad3da082f97f8432d15312ed02e3b18f8e"},{"signature":"naijue_erp.validate_import_accounting_baseline_commit()","body":"678cc0b409e43e420365733b21ce8e8ce0aa88b8d3b9b48f9a842edd41120c51","definition":"c582b5058f1ac6cf69e9ea123ad8b5a14e092b0f0e44ec9a8135cef49d8cf8a3"},{"signature":"naijue_erp.validate_import_accounting_checkpoint_commit()","body":"06ac9742cb16adb281f7610d299ef9dedb61c125038f12be55275760d4a4c0c9","definition":"7b3ecfc1792dd88a3d3ce22e3bfd92974b2f5d074fb805c273491335b4793c3e"},{"signature":"naijue_erp.validate_import_accounting_claim_commit()","body":"ad8e19c3f36b85ebbda107a2ca8e3c00ad10ca3005a232bd033bbab7613be756","definition":"b7661bccce5e3339c70972f3b91fb7497d964da8209fa9f6a150768795d46fd3"},{"signature":"naijue_erp.validate_import_accounting_final_record_commit()","body":"f1fca00daa56873221062706d2009293b6180156e69bfe6f5fc1ca64087ea312","definition":"146e84b462b4ebe7b1dc23dfdb860e1e6ad5993c389d1df261497338e1f47b61"},{"signature":"naijue_erp.validate_import_batch_commit()","body":"7ce01945fcd6fd68817724cc27d8f135da82ef2f4e3929a8ad5e4cf232310b3b","definition":"3d1afcf753e37ba8bfdba5bcbbf921dc5988b26ed90bad3843bfba6e6cf4bc98"},{"signature":"naijue_erp.validate_import_operation()","body":"73d13792e2a9dde79b239cb2c059a89c5552823503a002ce1b7bdad75aa1b3ff","definition":"6f85a6a40ea5653a8f294be01d3a671d83f75d5390904ab0b42eee705814354e"},{"signature":"naijue_erp.validate_import_publish(uuid,jsonb)","body":"873d1943b1ada13eeef43f6d28cb792755de48c461b1ebee7810e5278cd5d6e3","definition":"caa7d1bfe49c78d7569305559ff6e457d77c1802f297734edd5ae4b2705cb0be"},{"signature":"naijue_erp.validate_import_source_commit()","body":"524ec70d51970cfc79f4ec5e9a93f21bf20733781a2202121a4e91d1d6b66f3a","definition":"c0937d27cba152ede91c058c73aa0a15cef71886c98bb1ad560fd4d1ca9c57c3"},{"signature":"naijue_erp.validate_ledger_receipt_source()","body":"26f2f325172ef2878d4dffb4f1740d680e63458abd4b25e7a693e352664d15da","definition":"291f526c4cbdaaa2111ff329f29838e93480218a3d26af9853039cef318498b9"},{"signature":"naijue_erp.validate_maintenance_receipt_commit()","body":"77679e1e21858ae64ac1225660cf7a692f63b097d538254829def8164ea33ac5","definition":"0ed56695059af6159e6199e15d64f4373f2a56d9e0adbdc3e43c0a34bbfa7645"},{"signature":"naijue_erp.validate_maintenance_root_commit()","body":"002818dfd8d764e99221bb0548da1141054871ae674aba6bb9f6ce59c9d92d1c","definition":"d5d4c10ca919011acce558622565de22d1fee2aa4462d923dc803d2816128d82"},{"signature":"naijue_erp.validate_native_creation_commit()","body":"a505ceb68946cc14a69b181cd43d6cebbedca9e9ea453c9920c243892f537cd7","definition":"6c1fbe9641c1d6a9e7b608eadef11301bc048ff8f619581e4a6bdef2ee6bb460"},{"signature":"naijue_erp.validate_native_party_import_commit()","body":"5383c9941e06c7748af6603eee56559b102b09305c11771a813c6cf859ad37e3","definition":"936c3283be09b8aa5b217acdbe9d794ed88f3650ff5ff64c3fe4452406f53403"},{"signature":"naijue_erp.validate_party_native_commit()","body":"dba217f39c61d3f4741a72a565851a41caaa18e44fb57aa2f8e3473d20810762","definition":"c631ab634d7f90efb43234ef6784b3167f6a84a55d497c6f3b7bbdb3504726e9"},{"signature":"naijue_erp.validate_party_receipt_commit()","body":"fafc3389b3458b6d8ec4cad15f6f926dcc20bb059a819c496ed4db260d06b426","definition":"d61fd07bce072114dc79bd3a0073f971be49c5c851afe5c6354575cacc31c210"},{"signature":"naijue_erp.validate_sales_commit()","body":"f00b31849f4f72d62103fc08cb4e157b4401717a1f2c7c05fc699663715f07a2","definition":"cb3f120febedfde6c52f3d0079ea0d38965df7dc8d3cd2bcfcdd2319dc168129"},{"signature":"naijue_erp.validate_sales_effect()","body":"e6b2bbec00a6389ed92f9026af20f06c52168d37fe5a59d3ccfc0c29fb7cb1db","definition":"a80c55cca67b9fcdb0c8976ac81c936ea1b675323ec16ab486e85d75427514ea"},{"signature":"naijue_erp.validate_sales_settlement()","body":"c0ab9b6a91951a809e5fbfb6c34ed52fb164b76119d58d469d411c0b58e734a3","definition":"5b69ac6d10cc4e5888652e5b84bc73cd720eb334758eb6c106523f6ae7c594f6"},{"signature":"naijue_erp.validate_sparse_balance_commit()","body":"937b31d7ab0f1e5d8fb7febc26c051690b2df9dc79d451088eff73d75046399d","definition":"423d7bafcd5364b15e9aca1384b62dc98eafc916750656fcaaaae59d6c88827f"},{"signature":"naijue_erp.validate_transfer_balance_commit()","body":"9bfaa1cdf1dea76ada35bae56dd40cb3e27c6acd28a93905ee2f06d17a8b2abb","definition":"b423286017cf20f63c4ad8c5443127b821c6e14b43ea18c1fa2fcbe746d79ee3"},{"signature":"naijue_erp.validate_transfer_commit()","body":"e6ceac3fddef4e61f649b8ef2d71db56042dc14c7622ca0a5c321de2ab7b3f38","definition":"cc1032d753f1e2e6d8a1ee757d3b184891228892edcc0258cd9609888b81d161"},{"signature":"naijue_erp.validate_transfer_effect()","body":"d901f8e428c9ef2440d9fb48aca3f638eef141bd62f116e88698c6f726ad0c73","definition":"d1ea79521bd5f71fd68679e0e4ef3a3828845e3db18c0e9cb108f3b3a56c09ae"},{"signature":"naijue_erp.validate_transfer_header_commit()","body":"6d50fa80e2b445bc45645ff0f5592f2ed4e00836077224c1fe3510b4e563fa0c","definition":"5789cb6768ce7ed27c233ff398494c8253ec006db34831766331d9cadfbfcb9a"},{"signature":"naijue_erp.validate_transfer_line_commit()","body":"1443f443a884f0073209294476daf9a7ff0f45d6d32832e5d14557d513cfc4fb","definition":"fc80eb5d43db33bb0ae08252bb9c40782b46d9ecf535ee6d1e1b1cb4a2e59444"}]$routines$; f jsonb;
BEGIN
 IF current_database()<>'erp_rewrite_20261022_r1' OR (SELECT oid::text FROM pg_database WHERE datname=current_database())<>'1027659'
  OR current_user<>'erp_rewrite_owner_20261022' OR inet_server_addr() IS NOT NULL OR inet_server_port() IS NOT NULL
  OR pg_postmaster_start_time()<>'2026-10-04 08:16:07.895273+00'::timestamptz
  OR (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration)<>ARRAY(SELECT generate_series(1,26))
  OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='naijue_erp' AND p.prokind IN('f','p'))<>131
  OR NOT has_column_privilege('erp_rewrite_runtime_20261022','naijue_erp.import_batch','history_expected_counts','UPDATE')
  OR NOT has_column_privilege('erp_rewrite_runtime_20261022','naijue_erp.import_batch','history_payload_hash','UPDATE') THEN
  RAISE EXCEPTION 'Exact registered R1 v20 parent and two-column repair required' USING ERRCODE='23514'; END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(expected) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(f->>'signature')
    AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=f->>'body'
    AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=f->>'definition') THEN
   RAISE EXCEPTION 'Exact complete v20 routine source parent required' USING ERRCODE='23514'; END IF;
 END LOOP;
END;
$parent$;
CREATE OR REPLACE FUNCTION naijue_erp.assert_core_initialization_v14(selected_batch uuid, selected_operation uuid, creation boolean)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $v22$
#variable_conflict use_column
DECLARE b naijue_erp.import_batch%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE;
 cr naijue_erp.operation_receipt%ROWTYPE; ca naijue_erp.audit_change%ROWTYPE; e naijue_erp.native_party_import_evidence%ROWTYPE;
 birth jsonb; members jsonb; item jsonb; cp jsonb; full_binding jsonb; member jsonb; step jsonb; state jsonb; actual jsonb; field record;
 ma naijue_erp.audit_change%ROWTYPE; mr naijue_erp.operation_receipt%ROWTYPE; before_root jsonb; after_root jsonb; table_name text; n bigint;
 batch_heap_xmin bigint; receipt_heap_xmin bigint;
 prefix22 jsonb; group22 jsonb; stats22 jsonb; group_name22 text; segment22 text; scope22 text;
 tables22 text[]; entities22 text[]; query22 text; part22 text; projection22 text; key22 text; state22 bytea; previous22 bytea; identity22 bytea; row22 record;

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
 IF creation THEN
  SELECT actual_batch.xmin::text::bigint INTO STRICT batch_heap_xmin FROM naijue_erp.import_batch actual_batch WHERE actual_batch.id=selected_batch;
  IF r.id<>cr.id OR b.status<>'STAGED' OR b.checkpoint<>core_cp OR b.history_payload_hash IS NOT NULL OR b.history_expected_counts IS NOT NULL
   OR b.history_actual_counts IS NOT NULL OR b.history_validation_passed OR b.completed_at IS NOT NULL
   OR batch_heap_xmin<>mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
   OR (SELECT count(*) FROM naijue_erp.import_batch)<>1
   OR (SELECT count(*) FROM naijue_erp.native_party_import_evidence WHERE batch_id=b.id)<>115
   OR (SELECT count(*) FROM naijue_erp.import_source_row WHERE batch_id=b.id)<>115
   OR (SELECT count(*) FROM naijue_erp.import_header_native_reference WHERE batch_id=b.id)<>93
   OR (SELECT count(*) FROM naijue_erp.import_record WHERE import_batch_id=b.id)<>22 THEN
   RAISE EXCEPTION 'First CORE must commit its exact fresh11549 and22 record scope only' USING ERRCODE='23514'; END IF;
  PERFORM naijue_erp.assert_native_bootstrap_accounts(b.id);
  RETURN;
 END IF;
 -- Binding/current typed closure verifies historical birth without rerunning fresh/no-session bootstrap.
 IF r.target_type<>'IMPORT' OR r.target_id<>b.id OR r.action<>'IMPORT_BIND_FULL_SOURCE' OR r.status<>'COMMITTED'
  OR a.action<>r.action OR a.object_type<>'IMPORT' OR a.object_id<>b.id OR a.actor_account_id<>r.actor_account_id
  OR a.occurred_at<>r.completed_at OR a.new_version<>a.old_version+1
  OR a.after_values->>'phase'<>'FULL_SOURCE_BOUND_V1' OR a.after_values->'fullFrozen'<>'true'::jsonb
  OR a.after_values->>'coreReceiptId'<>cr.id::text OR a.after_values->>'coreSourceDigest'<>birth->>'coreSourceDigest'
  OR (SELECT count(*) FROM naijue_erp.operation_receipt WHERE target_type='IMPORT' AND target_id=b.id AND action='IMPORT_BIND_FULL_SOURCE')<>1 THEN
  RAISE EXCEPTION 'Exactly one original full binding operation required' USING ERRCODE='23514'; END IF;
 full_binding:=a.after_values->'fullBinding'; cp:=a.after_values->'checkpoint';
 IF (a.after_values ?& ARRAY['schemaVersion','phase','coreSourceDigest','coreReceiptId','checkpoint','fullBinding','fullFrozen']
  AND a.after_values-ARRAY['schemaVersion','phase','coreSourceDigest','coreReceiptId','checkpoint','fullBinding','fullFrozen','stagedPrefixProof']='{}'::jsonb
  AND a.after_values->'schemaVersion'='1'::jsonb AND a.after_values->>'phase'='FULL_SOURCE_BOUND_V1' AND a.after_values->'fullFrozen'='true'::jsonb
  AND full_binding ?& ARRAY['authorizedPayloadHash','historyExpectedCounts','inventoryExpectedCounts','sourceClosurePins','coreReceiptId','coreSourceDigest','coreMaintenanceBinding']
  AND full_binding-ARRAY['authorizedPayloadHash','historyExpectedCounts','inventoryExpectedCounts','sourceClosurePins','coreReceiptId','coreSourceDigest','coreMaintenanceBinding']='{}'::jsonb
  AND full_binding->>'coreReceiptId'=cr.id::text AND full_binding->>'coreSourceDigest'=birth->>'coreSourceDigest'
  AND full_binding->>'authorizedPayloadHash'=b.history_payload_hash AND full_binding->'historyExpectedCounts'=b.history_expected_counts
  AND full_binding->'inventoryExpectedCounts'=b.checkpoint->'expected' AND cp->'expected'=b.checkpoint->'expected'
  AND cp->>'sequence'=a.old_version::text AND a.new_version=(cp->>'sequence')::integer+1
  AND a.before_values=jsonb_build_object('checkpoint',jsonb_set(cp,'{sequence}',to_jsonb((cp->>'sequence')::integer-1))||jsonb_build_object('expected','{}'::jsonb),
   'fullBinding',NULL,'fullFrozen',false,'coreReceiptId',cr.id,'coreSourceDigest',birth->'coreSourceDigest')
  AND r.result_data=jsonb_build_object('operationId',r.id,'batchId',b.id,'sequence',cp->'sequence','cursor',cp->'cursor','status','STAGED','ledgerEntryIds','[]'::jsonb,
   'phase','FULL_SOURCE_BOUND_V1','coreSourceDigest',birth->'coreSourceDigest','coreCounts',birth->'coreCounts')
  AND jsonb_typeof(full_binding->'sourceClosurePins')='array' AND jsonb_array_length(full_binding->'sourceClosurePins')=11
  AND (SELECT count(DISTINCT x->>'group') FROM jsonb_array_elements(full_binding->'sourceClosurePins') x)=11
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(full_binding->'sourceClosurePins') x WHERE
   (x ?& ARRAY['group','sha256'] AND x-ARRAY['group','sha256']='{}'::jsonb AND length(x->>'group')>0 AND x->>'sha256'~'^[a-f0-9]{64}$') IS DISTINCT FROM TRUE)
  AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE operation_id=r.id)) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Full binding must preserve progress and freeze genuine complete metadata once' USING ERRCODE='23514'; END IF;


 prefix22:=a.after_values->'stagedPrefixProof';
 IF a.after_values ? 'stagedPrefixProof' THEN
  IF (jsonb_typeof(prefix22)='object' AND prefix22 ?& ARRAY['version','binding','preparation','schemeInitialization','groups','skuRecords']
   AND prefix22-ARRAY['version','binding','preparation','schemeInitialization','groups','skuRecords']='{}'::jsonb
   AND prefix22->>'version'='CORE_STAGED_PREFIX_BIND_V22'
   AND prefix22->'binding' ?& ARRAY['batchId','actorAccountId','fixedSourceNamespace','cutoffAt','selectionSha256','commandHash']
   AND (prefix22->'binding')-ARRAY['batchId','actorAccountId','fixedSourceNamespace','cutoffAt','selectionSha256','commandHash']='{}'::jsonb
   AND prefix22->'binding'->>'batchId'=b.id::text AND prefix22->'binding'->>'actorAccountId'=r.actor_account_id::text
   AND prefix22->'binding'->>'fixedSourceNamespace'=b.source_name AND prefix22->'binding'->>'selectionSha256'=b.source_hash
   AND prefix22->'binding'->>'commandHash'=r.request_hash
   AND naijue_erp.maintenance_evidence_matches(prefix22->'binding'->'cutoffAt',to_jsonb(b.cutoff_at))
   AND prefix22->'preparation' ?& ARRAY['inputDigest','manifestSha256'] AND (prefix22->'preparation')-ARRAY['inputDigest','manifestSha256']='{}'::jsonb
   AND prefix22->'preparation'->>'inputDigest'~'^[a-f0-9]{64}$' AND prefix22->'preparation'->>'manifestSha256'~'^[a-f0-9]{64}$'
   AND prefix22->'schemeInitialization' ?& ARRAY['operationId','requestKey','requestHash','approvalPins']
   AND (prefix22->'schemeInitialization')-ARRAY['operationId','requestKey','requestHash','approvalPins']='{}'::jsonb
   AND prefix22->'schemeInitialization'->>'operationId'~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
   AND length(prefix22->'schemeInitialization'->>'requestKey')>0 AND prefix22->'schemeInitialization'->>'requestHash'~'^[a-f0-9]{64}$'
   AND prefix22->'schemeInitialization'->'approvalPins' ?& ARRAY['proposalSha256','approvalSha256','writeContractReplySha256']
   AND (prefix22->'schemeInitialization'->'approvalPins')-ARRAY['proposalSha256','approvalSha256','writeContractReplySha256']='{}'::jsonb
   AND NOT EXISTS(SELECT 1 FROM jsonb_each_text(prefix22->'schemeInitialization'->'approvalPins') x WHERE x.value!~'^[a-f0-9]{64}$')
   AND jsonb_typeof(prefix22->'groups')='array' AND jsonb_array_length(prefix22->'groups')=6
   AND (SELECT jsonb_agg(x.value->'name' ORDER BY x.ordinality) FROM jsonb_array_elements(prefix22->'groups') WITH ORDINALITY x(value,ordinality))
    ='["HEADERS","TRANSFER_LINES","PRODUCTS","SKUS","STOCK_CONTRIBUTORS","SCHEMES"]'::jsonb) IS DISTINCT FROM TRUE THEN
   RAISE EXCEPTION 'Exact original source-authorized staged prefix evidence required' USING ERRCODE='23514'; END IF;
  FOR group22 IN SELECT value FROM jsonb_array_elements(prefix22->'groups') LOOP
   IF (group22 ?& ARRAY['name','source','typed'] AND group22-ARRAY['name','source','typed']='{}'::jsonb) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Exact prefix group evidence required' USING ERRCODE='23514'; END IF;
   FOREACH segment22 IN ARRAY ARRAY['source','typed'] LOOP
    stats22:=group22->segment22;
    IF (stats22 ?& ARRAY['rows','sha256'] AND stats22-ARRAY['rows','sha256']='{}'::jsonb AND jsonb_typeof(stats22->'rows')='number'
     AND stats22->>'rows'~'^[0-9]+$' AND (stats22->>'rows')::numeric<=10000000 AND stats22->>'sha256'~'^[a-f0-9]{64}$'
     AND ((group22->>'name'='SCHEMES' AND segment22='source' AND stats22->'rows'='0'::jsonb) OR ((group22->>'name'<>'SCHEMES' OR segment22<>'source') AND (stats22->>'rows')::numeric>0))) IS DISTINCT FROM TRUE THEN
     RAISE EXCEPTION 'Complete bounded prefix roots and member counts required' USING ERRCODE='23514'; END IF;
   END LOOP;
  END LOOP;
  stats22:=prefix22->'skuRecords';
  IF (stats22 ?& ARRAY['rows','sha256'] AND stats22-ARRAY['rows','sha256']='{}'::jsonb AND jsonb_typeof(stats22->'rows')='number'
   AND stats22->>'rows'~'^[1-9][0-9]*$' AND (stats22->>'rows')::numeric<=10000000 AND stats22->>'sha256'~'^[a-f0-9]{64}$') IS DISTINCT FROM TRUE THEN
   RAISE EXCEPTION 'Exact original SKU source record proof required' USING ERRCODE='23514'; END IF;
 END IF;

 SELECT actual_receipt.xmin::text::bigint INTO STRICT receipt_heap_xmin FROM naijue_erp.operation_receipt actual_receipt WHERE actual_receipt.id=selected_operation;
 IF receipt_heap_xmin=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint THEN
  IF b.status<>'STAGED' OR b.completed_at IS NOT NULL OR b.history_validation_passed OR b.history_actual_counts IS NOT NULL
   OR b.checkpoint IS DISTINCT FROM cp
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id
     WHERE u.id=r.actor_account_id AND u.login_enabled AND s.employment_status='在职' AND s.role='ADMIN' AND (s.hall_id IS NULL OR h.enabled)) THEN
   RAISE EXCEPTION 'Binding requires current real ADMIN and exact unbound unpublished state' USING ERRCODE='23514'; END IF;
  IF prefix22 IS NULL THEN
  FOREACH table_name IN ARRAY ARRAY['history_sales_header','history_sales_line','history_sales_settlement','history_transfer_header','history_transfer_line',
    'sales_header','sales_line','sales_settlement','transfer_header','transfer_line','product','sku','sku_barcode','barcode_scheme','product_image',
    'import_sku_alias','import_stock_contributor','inventory_ledger','inventory_balance','import_history_closure_manifest','import_history_document_manifest',
    'payment_method','payment_account','payment_account_hall','history_revision'] LOOP
   EXECUTE format('SELECT count(*) FROM naijue_erp.%I',table_name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Full binding refuses preexisting out-of-scope business effect in %',table_name USING ERRCODE='23514'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=b.id AND target_type<>'WAREHOUSE')
    OR EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE import_batch_id=b.id AND target_type<>'WAREHOUSE') THEN
   RAISE EXCEPTION 'Only separately granted exact warehouse accounting may precede binding' USING ERRCODE='23514'; END IF;
  ELSE

  -- Same exact v19 snapshots/pins and nonrecursive initialization conditions.
  -- Never call its full helper here: that helper calls this CORE assertion.
  DECLARE sr naijue_erp.operation_receipt%ROWTYPE; sa naijue_erp.audit_change%ROWTYPE;
 init jsonb; before_cp jsonb; after_cp jsonb; scheme_rows jsonb; birth_binding uuid; fresh boolean;
 approved jsonb:=$approved$[{"sourceSchemeKey":"2018","native":{"id":"c0b009e7-6f61-447a-b87e-ceea62711ec9","name":"18年货品","barcode_type":"Code128","rule_description":"原方案描述快照；保留每条原条码和已确认SKU绑定，不依据本说明重新生成、补位、截断或改码。声明总长仅保留方案说明，不代替每条历史原码。","code_length":9,"rule_version":"NATIVE_SOURCE_RETAINED_V1","status":"HISTORICAL"}},{"sourceSchemeKey":"2020","native":{"id":"82656465-2758-4be8-a965-412a971e9c4b","name":"2020年新方案","barcode_type":"Code128","rule_description":"原方案描述快照；保留每条原条码和已确认SKU绑定，不依据本说明重新生成、补位、截断或改码。2020颜色1位、尺码2位的最后补充优先于原表旧备注。声明总长仅保留方案说明，不代替每条历史原码。","code_length":14,"rule_version":"NATIVE_SOURCE_RETAINED_V1","status":"HISTORICAL"}},{"sourceSchemeKey":"2021","native":{"id":"bc7ff32c-1025-4c30-8950-0b33a492c538","name":"2021年条码方案","barcode_type":"Code128","rule_description":"原方案描述快照；保留每条原条码和已确认SKU绑定，不依据本说明重新生成、补位、截断或改码。声明总长仅保留方案说明，不代替每条历史原码。","code_length":13,"rule_version":"NATIVE_SOURCE_RETAINED_V1","status":"HISTORICAL"}},{"sourceSchemeKey":"2021fit","native":{"id":"48c4fe44-7521-44c1-a0e3-c547a1691028","name":"2021年版型条码方案","barcode_type":"Code128","rule_description":"原方案描述快照；保留每条原条码和已确认SKU绑定，不依据本说明重新生成、补位、截断或改码。声明总长仅保留方案说明，不代替每条历史原码。","code_length":14,"rule_version":"NATIVE_SOURCE_RETAINED_V1","status":"HISTORICAL"}},{"sourceSchemeKey":"2023","native":{"id":"9c584ada-9d42-4159-9e51-208577657021","name":"2023年条码方案","barcode_type":"Code128","rule_description":"原方案描述快照；保留每条原条码和已确认SKU绑定，不依据本说明重新生成、补位、截断或改码。声明总长仅保留方案说明，不代替每条历史原码。","code_length":14,"rule_version":"NATIVE_SOURCE_RETAINED_V1","status":"HISTORICAL"}},{"sourceSchemeKey":"2026","native":{"id":"0e70e45e-1a51-4d44-afe8-0002cf3fb7ef","name":"2026年条码方案","barcode_type":"Code128","rule_description":"原方案描述快照；保留每条原条码和已确认SKU绑定，不依据本说明重新生成、补位、截断或改码。声明总长仅保留方案说明，不代替每条历史原码。","code_length":15,"rule_version":"NATIVE_SOURCE_RETAINED_V1","status":"CURRENT"}}]$approved$;
 pins jsonb:=$pins${"proposalSha256":"826e63b33e8e2f52a521d5ba3e930899d61092dfb22f65b11db4f799f7efef00","approvalSha256":"f9da50c270c14321b17af06255a5f0649daf8b55a725b6a29fe483f342517533","writeContractReplySha256":"9ec37b0219f227fa39e754364ea04f1962866664283812f8d9b383ba19b2acfc"}$pins$;
  BEGIN
   SELECT * INTO STRICT sr FROM naijue_erp.operation_receipt WHERE id=(prefix22->'schemeInitialization'->>'operationId')::uuid;
   SELECT * INTO STRICT sa FROM naijue_erp.audit_change WHERE operation_id=sr.id;
 init:=sa.after_values->'schemeInitialization'; before_cp:=sa.before_values->'checkpoint'; after_cp:=sa.after_values->'checkpoint';
 fresh:=(SELECT q.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint FROM naijue_erp.operation_receipt q WHERE q.id=sr.id);
 IF (sr.target_type='IMPORT' AND sr.target_id=b.id AND sr.action='IMPORT_INITIALIZE_BARCODE_SCHEMES' AND sr.status='COMMITTED'
  AND sr.actor_account_id=cr.actor_account_id AND length(btrim(sr.request_key))>0 AND sr.request_hash~'^[a-f0-9]{64}$'
  AND sa.object_type='IMPORT' AND sa.object_id=b.id AND sa.action=sr.action AND sa.actor_account_id=sr.actor_account_id
  AND sa.occurred_at=sr.completed_at AND sr.created_at=sr.completed_at AND sa.new_version=sa.old_version+1
  AND sa.before_values ?& ARRAY['checkpoint','schemes'] AND sa.before_values-ARRAY['checkpoint','schemes']='{}'::jsonb
  AND sa.before_values->'schemes'='[]'::jsonb
  AND sa.after_values ?& ARRAY['checkpoint','schemeInitialization','commandHash'] AND sa.after_values-ARRAY['checkpoint','schemeInitialization','commandHash']='{}'::jsonb
  AND sa.after_values->>'commandHash'=sr.request_hash
  AND before_cp ?& ARRAY['sequence','cursor','counts','expected'] AND before_cp-ARRAY['sequence','cursor','counts','expected']='{}'::jsonb
  AND jsonb_typeof(before_cp->'sequence')='number' AND before_cp->>'sequence'~'^[1-9][0-9]*$'
  AND jsonb_typeof(before_cp->'cursor')='number' AND before_cp->>'cursor'~'^[0-9]+$'
  AND (before_cp->>'sequence')::bigint+1=(after_cp->>'sequence')::bigint
  AND sa.old_version=(before_cp->>'sequence')::integer+1 AND sa.new_version=(after_cp->>'sequence')::integer+1
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
  AND (SELECT count(*) FROM naijue_erp.operation_receipt WHERE target_type='IMPORT' AND target_id=b.id AND action=sr.action)=1
  AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE operation_id=sr.id)
  AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE operation_id=sr.id)
  AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_balance WHERE last_operation_id=sr.id)
  AND EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff st ON st.id=u.staff_id LEFT JOIN naijue_erp.hall h ON h.id=st.hall_id
   WHERE u.id=sr.actor_account_id AND u.login_enabled AND st.employment_status='在职' AND st.role='ADMIN' AND (st.hall_id IS NULL OR h.enabled))) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Exact original source-bound six-scheme operation/birth/actor/checkpoint audit and receipt required' USING ERRCODE='23514'; END IF;
 IF (sr.result_data=jsonb_build_object('operationId',sr.id,'batchId',b.id,'sequence',after_cp->'sequence','cursor',after_cp->'cursor','status',sr.result_data->'status','ledgerEntryIds','[]'::jsonb)
  AND sr.result_data->>'status' IN('STAGED','VALIDATING')) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Original six-field zero-effect initialization receipt required' USING ERRCODE='23514'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id),'[]'::jsonb) INTO scheme_rows FROM naijue_erp.barcode_scheme q;
 IF scheme_rows IS DISTINCT FROM (SELECT jsonb_agg(x->'native' ORDER BY x->'native'->>'id') FROM jsonb_array_elements(approved) x) THEN
  RAISE EXCEPTION 'Whole scheme table must retain all exact six approved snapshots on creation and replay' USING ERRCODE='23514'; END IF;
 IF fresh AND (b.checkpoint IS DISTINCT FROM after_cp OR sr.result_data->>'status' IS DISTINCT FROM b.status
  OR EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE batch_id=b.id AND entity_type='BARCODE')
  OR EXISTS(SELECT 1 FROM naijue_erp.sku_barcode)) THEN
  RAISE EXCEPTION 'First scheme initialization precedes all barcode effects and advances only sequence' USING ERRCODE='23514'; END IF;
 IF (b.checkpoint->>'sequence')::bigint<(after_cp->>'sequence')::bigint THEN
  RAISE EXCEPTION 'Committed scheme checkpoint cannot disappear on replay' USING ERRCODE='23514'; END IF;
   IF fresh OR sr.request_key IS DISTINCT FROM prefix22->'schemeInitialization'->>'requestKey'
    OR sr.request_hash IS DISTINCT FROM prefix22->'schemeInitialization'->>'requestHash'
    OR init->'approvalPins' IS DISTINCT FROM prefix22->'schemeInitialization'->'approvalPins'
    OR (cp->>'sequence')::bigint<>(after_cp->>'sequence')::bigint+1 THEN
    RAISE EXCEPTION 'Only original committed exact scheme initialization may precede binding' USING ERRCODE='23514'; END IF;
  END;

  -- Recompute complete actual source/native member roots under the original
  -- cutoff+batch lock. App already compared every expected full projection.
  FOR group22 IN SELECT value FROM jsonb_array_elements(prefix22->'groups')
    UNION ALL SELECT jsonb_build_object('name','SKU_RECORDS','typed',prefix22->'skuRecords') LOOP
   group_name22:=group22->>'name';
   CASE group_name22
    WHEN 'HEADERS' THEN entities22:=ARRAY['SALES_HEADER','TRANSFER_HEADER']; tables22:=ARRAY['history_sales_header','history_transfer_header'];
    WHEN 'TRANSFER_LINES' THEN entities22:=ARRAY['TRANSFER_LINE']; tables22:=ARRAY['history_transfer_line'];
    WHEN 'PRODUCTS' THEN entities22:=ARRAY['PRODUCT']; tables22:=ARRAY['product'];
    WHEN 'SKUS' THEN entities22:=ARRAY['SKU']; tables22:=ARRAY['import_sku_alias','sku'];
    WHEN 'STOCK_CONTRIBUTORS' THEN entities22:=ARRAY['INVENTORY_BASELINE']; tables22:=ARRAY['import_stock_contributor'];
    WHEN 'SCHEMES' THEN entities22:=ARRAY['BARCODE']; tables22:=ARRAY['barcode_scheme'];
    WHEN 'SKU_RECORDS' THEN entities22:=ARRAY[]::text[]; tables22:=ARRAY['import_record'];
    ELSE RAISE EXCEPTION 'Unknown prefix evidence group' USING ERRCODE='23514';
   END CASE;
   FOREACH segment22 IN ARRAY ARRAY['source','typed'] LOOP
    IF group_name22='SKU_RECORDS' AND segment22='source' THEN CONTINUE; END IF;
    query22:='';
    IF segment22='source' THEN
     query22:=$sourcequery$SELECT 'import_source_row'::text relation_name,t.id::text row_key,jsonb_build_object('id',to_jsonb(t)->'id','batch_id',to_jsonb(t)->'batch_id','entity_type',to_jsonb(t)->'entity_type','source_key',to_jsonb(t)->'source_key','file_ref',to_jsonb(t)->'file_ref','sheet',to_jsonb(t)->'sheet','row_no',to_jsonb((to_jsonb(t)->>'row_no')::bigint::text),'source_file_sha256',to_jsonb(t)->'source_file_sha256','row_sha256',to_jsonb(t)->'row_sha256','raw_fields',to_jsonb(t)->'raw_fields','normalized_fields',to_jsonb(t)->'normalized_fields','field_provenance',to_jsonb(t)->'field_provenance') projection FROM naijue_erp.import_source_row t WHERE t.entity_type=ANY($1)$sourcequery$;
    ELSE
     FOREACH table_name IN ARRAY tables22 LOOP
      projection22:=CASE table_name
       WHEN 'import_source_row' THEN $projection$jsonb_build_object('id',to_jsonb(t)->'id','batch_id',to_jsonb(t)->'batch_id','entity_type',to_jsonb(t)->'entity_type','source_key',to_jsonb(t)->'source_key','file_ref',to_jsonb(t)->'file_ref','sheet',to_jsonb(t)->'sheet','row_no',to_jsonb((to_jsonb(t)->>'row_no')::bigint::text),'source_file_sha256',to_jsonb(t)->'source_file_sha256','row_sha256',to_jsonb(t)->'row_sha256','raw_fields',to_jsonb(t)->'raw_fields','normalized_fields',to_jsonb(t)->'normalized_fields','field_provenance',to_jsonb(t)->'field_provenance')$projection$
       WHEN 'history_sales_header' THEN $projection$jsonb_build_object('id',to_jsonb(t)->'id','source_row_id',to_jsonb(t)->'source_row_id','batch_id',to_jsonb(t)->'batch_id','version',to_jsonb(t)->'version','number',to_jsonb(t)->'number','business_date',to_jsonb(to_char((to_jsonb(t)->>'business_date')::date,'YYYY-MM-DD')),'source_status',to_jsonb(t)->'source_status','note',to_jsonb(t)->'note','created_by_source_key',to_jsonb(t)->'created_by_source_key','approved_by_source_key',to_jsonb(t)->'approved_by_source_key','created_hall_id',to_jsonb(t)->'created_hall_id','created_hall_provenance',to_jsonb(t)->'created_hall_provenance','created_hall_reason',to_jsonb(t)->'created_hall_reason','created_local_at',to_jsonb(to_char((to_jsonb(t)->>'created_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'updated_local_at',to_jsonb(to_char((to_jsonb(t)->>'updated_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'approved_local_at',to_jsonb(to_char((to_jsonb(t)->>'approved_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'created_instant',to_jsonb(to_char((to_jsonb(t)->>'created_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'updated_instant',to_jsonb(to_char((to_jsonb(t)->>'updated_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'approved_instant',to_jsonb(to_char((to_jsonb(t)->>'approved_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'business_type',to_jsonb(t)->'business_type','hall_id',to_jsonb(t)->'hall_id','customer_id',to_jsonb(t)->'customer_id','warehouse_id',to_jsonb(t)->'warehouse_id','salesperson_id',to_jsonb(t)->'salesperson_id','gross_amount',to_jsonb((to_jsonb(t)->>'gross_amount')::numeric(18,2)::text),'order_discount',to_jsonb((to_jsonb(t)->>'order_discount')::numeric(18,2)::text),'net_due',to_jsonb((to_jsonb(t)->>'net_due')::numeric(18,2)::text))$projection$
       WHEN 'history_transfer_header' THEN $projection$jsonb_build_object('id',to_jsonb(t)->'id','source_row_id',to_jsonb(t)->'source_row_id','batch_id',to_jsonb(t)->'batch_id','version',to_jsonb(t)->'version','number',to_jsonb(t)->'number','business_date',to_jsonb(to_char((to_jsonb(t)->>'business_date')::date,'YYYY-MM-DD')),'source_status',to_jsonb(t)->'source_status','note',to_jsonb(t)->'note','created_by_source_key',to_jsonb(t)->'created_by_source_key','approved_by_source_key',to_jsonb(t)->'approved_by_source_key','created_hall_id',to_jsonb(t)->'created_hall_id','created_hall_provenance',to_jsonb(t)->'created_hall_provenance','created_hall_reason',to_jsonb(t)->'created_hall_reason','created_local_at',to_jsonb(to_char((to_jsonb(t)->>'created_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'updated_local_at',to_jsonb(to_char((to_jsonb(t)->>'updated_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'approved_local_at',to_jsonb(to_char((to_jsonb(t)->>'approved_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'created_instant',to_jsonb(to_char((to_jsonb(t)->>'created_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'updated_instant',to_jsonb(to_char((to_jsonb(t)->>'updated_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'approved_instant',to_jsonb(to_char((to_jsonb(t)->>'approved_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'from_warehouse_id',to_jsonb(t)->'from_warehouse_id','to_warehouse_id',to_jsonb(t)->'to_warehouse_id','created_role_source',to_jsonb(t)->'created_role_source')$projection$
       WHEN 'history_transfer_line' THEN $projection$jsonb_build_object('id',to_jsonb(t)->'id','source_row_id',to_jsonb(t)->'source_row_id','batch_id',to_jsonb(t)->'batch_id','header_id',to_jsonb(t)->'header_id','line_no',to_jsonb(t)->'line_no','sku_id',to_jsonb(t)->'sku_id','quantity',to_jsonb((to_jsonb(t)->>'quantity')::bigint::text),'product_code_snapshot',to_jsonb(t)->'product_code_snapshot','product_name_snapshot',to_jsonb(t)->'product_name_snapshot','color_name_snapshot',to_jsonb(t)->'color_name_snapshot','fit_name_snapshot',to_jsonb(t)->'fit_name_snapshot','size_name_snapshot',to_jsonb(t)->'size_name_snapshot','barcode_snapshot',to_jsonb(t)->'barcode_snapshot')$projection$
       WHEN 'product' THEN $projection$jsonb_build_object('id',to_jsonb(t)->'id','product_code',to_jsonb(t)->'product_code','name',to_jsonb(t)->'name','category_id',to_jsonb(t)->'category_id','supplier_id',to_jsonb(t)->'supplier_id','season_id',to_jsonb(t)->'season_id','size_group_id',to_jsonb(t)->'size_group_id','retail_price',to_jsonb((to_jsonb(t)->>'retail_price')::numeric(18,2)::text),'enabled',to_jsonb(t)->'enabled','version',to_jsonb(t)->'version','year',to_jsonb(t)->'year','system_item_code',to_jsonb(t)->'system_item_code','thickness',to_jsonb(t)->'thickness','collar_pants_type',to_jsonb(t)->'collar_pants_type','purchase_price',to_jsonb((to_jsonb(t)->>'purchase_price')::numeric(18,2)::text),'wholesale5_price',to_jsonb((to_jsonb(t)->>'wholesale5_price')::numeric(18,2)::text),'wholesale6_price',to_jsonb((to_jsonb(t)->>'wholesale6_price')::numeric(18,2)::text),'wholesale7_price',to_jsonb((to_jsonb(t)->>'wholesale7_price')::numeric(18,2)::text),'wholesale8_price',to_jsonb((to_jsonb(t)->>'wholesale8_price')::numeric(18,2)::text),'wholesale9_price',to_jsonb((to_jsonb(t)->>'wholesale9_price')::numeric(18,2)::text),'wholesale10_price',to_jsonb((to_jsonb(t)->>'wholesale10_price')::numeric(18,2)::text),'minimum_price',to_jsonb((to_jsonb(t)->>'minimum_price')::numeric(18,2)::text),'season_ids',to_jsonb(t)->'season_ids','deleted_at',to_jsonb(to_char((to_jsonb(t)->>'deleted_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'default_barcode_scheme_id',to_jsonb(t)->'default_barcode_scheme_id')$projection$
       WHEN 'sku' THEN $projection$jsonb_build_object('id',to_jsonb(t)->'id','product_id',to_jsonb(t)->'product_id','color_id',to_jsonb(t)->'color_id','fit_id',to_jsonb(t)->'fit_id','size_id',to_jsonb(t)->'size_id','sku_code',to_jsonb(t)->'sku_code','enabled',to_jsonb(t)->'enabled','version',to_jsonb(t)->'version','created_operation_id',to_jsonb(t)->'created_operation_id')$projection$
       WHEN 'import_sku_alias' THEN $projection$jsonb_build_object('batch_id',to_jsonb(t)->'batch_id','old_source_sku_id',to_jsonb(t)->'old_source_sku_id','canonical_sku_id',to_jsonb(t)->'canonical_sku_id','source_row_id',to_jsonb(t)->'source_row_id','canonical_source_key',to_jsonb(t)->'canonical_source_key','mapping_basis',to_jsonb(t)->'mapping_basis')$projection$
       WHEN 'import_stock_contributor' THEN $projection$jsonb_build_object('batch_id',to_jsonb(t)->'batch_id','source_row_id',to_jsonb(t)->'source_row_id','warehouse_id',to_jsonb(t)->'warehouse_id','canonical_sku_id',to_jsonb(t)->'canonical_sku_id','old_source_sku_id',to_jsonb(t)->'old_source_sku_id','canonical_stock_source_key',to_jsonb(t)->'canonical_stock_source_key','source_unit',to_jsonb(t)->'source_unit','signed_quantity',to_jsonb((to_jsonb(t)->>'signed_quantity')::bigint::text),'baseline_ledger_id',to_jsonb(t)->'baseline_ledger_id')$projection$
       WHEN 'barcode_scheme' THEN $projection$jsonb_build_object('id',to_jsonb(t)->'id','name',to_jsonb(t)->'name','barcode_type',to_jsonb(t)->'barcode_type','rule_description',to_jsonb(t)->'rule_description','code_length',to_jsonb(t)->'code_length','rule_version',to_jsonb(t)->'rule_version','status',to_jsonb(t)->'status')$projection$
       WHEN 'import_record' THEN $projection$to_jsonb(t) || jsonb_build_object('reviewed_at',to_char(t.reviewed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))$projection$
       ELSE NULL END;
      IF projection22 IS NULL THEN RAISE EXCEPTION 'Unknown prefix projection' USING ERRCODE='23514'; END IF;
      IF table_name='import_record' THEN
       part22:=format('SELECT %L::text relation_name,t.id::text row_key,%s projection FROM naijue_erp.%I t WHERE t.target_type=''SKU''',table_name,projection22,table_name);
      ELSE
       key22:=CASE table_name
        WHEN 'import_sku_alias' THEN $key$encode(naijue_erp.history_closure_encode(jsonb_build_array(t.batch_id,t.old_source_sku_id)),'hex')$key$
        WHEN 'import_stock_contributor' THEN $key$encode(naijue_erp.history_closure_encode(jsonb_build_array(t.batch_id,t.source_row_id)),'hex')$key$
        ELSE 't.id::text' END;
       part22:=format('SELECT %L::text relation_name,%s row_key,%s projection FROM naijue_erp.%I t',table_name,key22,projection22,table_name);
      END IF;
      query22:=query22||CASE WHEN query22='' THEN '' ELSE ' UNION ALL ' END||part22;
     END LOOP;
    END IF;
    scope22:='CORE_STAGED_PREFIX_BIND_V22:'||group_name22||':'||segment22;
    state22:=sha256(naijue_erp.history_closure_encode(jsonb_build_array('HISTORY_CLOSURE_STREAM_V1',scope22)));previous22:=NULL;n:=0;
    FOR row22 IN EXECUTE 'SELECT * FROM ('||query22||') prefix_rows ORDER BY convert_to(relation_name,''UTF8''),convert_to(row_key,''UTF8'')' USING entities22 LOOP
     identity22:=convert_to(row22.relation_name,'UTF8')||decode('00','hex')||convert_to(row22.row_key,'UTF8');
     IF previous22 IS NOT NULL AND identity22<=previous22 THEN RAISE EXCEPTION 'Duplicate or unordered actual prefix member' USING ERRCODE='23514'; END IF;
     state22:=sha256(decode('01','hex')||state22||decode(naijue_erp.history_closure_row_hash(row22.relation_name,row22.row_key,row22.projection),'hex'));
     previous22:=identity22;n:=n+1;
    END LOOP;
    stats22:=group22->segment22;
    IF n<>(stats22->>'rows')::bigint OR encode(sha256(naijue_erp.history_closure_encode(jsonb_build_array('HISTORY_CLOSURE_STREAM_FINAL_V1',scope22,n,encode(state22,'hex')))),'hex') IS DISTINCT FROM stats22->>'sha256' THEN
     RAISE EXCEPTION 'Actual complete prefix members differ from independently authorized expected source' USING ERRCODE='23514'; END IF;
   END LOOP;
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['history_sales_line','history_sales_settlement','sales_header','sales_line','sales_settlement','transfer_header','transfer_line',
   'sku_barcode','product_image','inventory_ledger','inventory_balance','import_history_closure_manifest','import_history_document_manifest','payment_method','payment_account','payment_account_hall','history_revision'] LOOP
   EXECUTE format('SELECT count(*) FROM naijue_erp.%I',table_name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Prebinding prefix must not contain posted or out-of-scope effects in %',table_name USING ERRCODE='23514'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM naijue_erp.history_sales_header h LEFT JOIN naijue_erp.import_source_row s ON s.id=h.source_row_id
    WHERE h.batch_id<>b.id OR s.batch_id IS DISTINCT FROM b.id OR s.entity_type IS DISTINCT FROM 'SALES_HEADER')
   OR EXISTS(SELECT 1 FROM naijue_erp.history_transfer_header h LEFT JOIN naijue_erp.import_source_row s ON s.id=h.source_row_id
    WHERE h.batch_id<>b.id OR s.batch_id IS DISTINCT FROM b.id OR s.entity_type IS DISTINCT FROM 'TRANSFER_HEADER')
   OR EXISTS(SELECT 1 FROM naijue_erp.history_transfer_line l LEFT JOIN naijue_erp.import_source_row s ON s.id=l.source_row_id
    LEFT JOIN naijue_erp.history_transfer_header h ON h.id=l.header_id AND h.batch_id=l.batch_id
    WHERE l.batch_id<>b.id OR s.batch_id IS DISTINCT FROM b.id OR s.entity_type IS DISTINCT FROM 'TRANSFER_LINE' OR h.id IS NULL)
   OR EXISTS(SELECT 1 FROM naijue_erp.import_sku_alias x LEFT JOIN naijue_erp.import_source_row s ON s.id=x.source_row_id
    LEFT JOIN naijue_erp.sku k ON k.id=x.canonical_sku_id WHERE x.batch_id<>b.id OR s.batch_id IS DISTINCT FROM b.id
    OR s.entity_type IS DISTINCT FROM 'SKU' OR s.source_key IS DISTINCT FROM x.old_source_sku_id OR k.id IS NULL
    OR s.field_provenance->'native_sku_import'->>'native_sku_id' IS DISTINCT FROM k.id::text
    OR s.field_provenance->'native_sku_import'->>'canonical_source_key' IS DISTINCT FROM x.canonical_source_key)
   OR EXISTS(SELECT 1 FROM naijue_erp.import_stock_contributor x LEFT JOIN naijue_erp.import_source_row s ON s.id=x.source_row_id
    LEFT JOIN naijue_erp.sku k ON k.id=x.canonical_sku_id LEFT JOIN naijue_erp.warehouse w ON w.id=x.warehouse_id
    WHERE x.batch_id<>b.id OR s.batch_id IS DISTINCT FROM b.id OR s.entity_type IS DISTINCT FROM 'INVENTORY_BASELINE'
    OR k.id IS NULL OR w.id IS NULL OR x.baseline_ledger_id IS NOT NULL)
   OR EXISTS(SELECT 1 FROM naijue_erp.sku k WHERE NOT EXISTS(SELECT 1 FROM naijue_erp.import_record rec
     JOIN naijue_erp.import_source_row s ON s.batch_id=rec.import_batch_id AND s.entity_type='SKU' AND s.source_key=rec.source_key
     WHERE rec.import_batch_id=b.id AND rec.target_type='SKU' AND rec.target_id=k.id AND rec.source_entity_type='SKU' AND rec.status='IMPORTED'
      AND rec.source_record_hash=s.row_sha256 AND rec.source_file_ref=s.file_ref
      AND s.field_provenance->'native_sku_import'->>'native_sku_id'=k.id::text
      AND s.field_provenance->'native_sku_import'->>'canonical_source_key'=rec.source_key))
   OR EXISTS(SELECT 1 FROM naijue_erp.product p WHERE NOT EXISTS(SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=b.id AND s.entity_type='PRODUCT' AND s.field_provenance->>'native_product_id'=p.id::text))
   OR EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=b.id AND target_type NOT IN('WAREHOUSE','SKU'))
   OR EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE import_batch_id=b.id AND target_type<>'WAREHOUSE') THEN
   RAISE EXCEPTION 'Only complete original source-bound native prefix and zero posted effect may precede binding' USING ERRCODE='23514'; END IF;

  END IF;
 END IF;
 -- Exact current master versions: reconstruct each sparse authorized audit link from immutable source birth.
 IF (full_binding->'coreMaintenanceBinding' ?& ARRAY['version','members']
  AND (full_binding->'coreMaintenanceBinding')-ARRAY['version','members']='{}'::jsonb
  AND full_binding->'coreMaintenanceBinding'->>'version'='CORE_MAINTENANCE_BINDING_V1'
  AND jsonb_typeof(full_binding->'coreMaintenanceBinding'->'members')='array'
  AND jsonb_array_length(full_binding->'coreMaintenanceBinding'->'members')=115
  AND (SELECT count(DISTINCT x->>'sourceRowId') FROM jsonb_array_elements(full_binding->'coreMaintenanceBinding'->'members') x)=115) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Exact115 current core maintenance projections required' USING ERRCODE='23514'; END IF;
 FOR member IN SELECT value FROM jsonb_array_elements(full_binding->'coreMaintenanceBinding'->'members') LOOP
  IF (member ?& ARRAY['sourceRowId','entity','sourceKey','nativeId','version','nativeSnapshot','operations']
   AND member-ARRAY['sourceRowId','entity','sourceKey','nativeId','version','nativeSnapshot','operations']='{}'::jsonb
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(members->'parties') x WHERE x=member-ARRAY['version','nativeSnapshot','operations'])
   AND jsonb_typeof(member->'operations')='array') IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Maintenance member not original CORE identity' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT e FROM naijue_erp.native_party_import_evidence WHERE batch_id=b.id AND source_row_id=(member->>'sourceRowId')::uuid;
  state:=e.native_snapshot;
  FOR step IN SELECT value FROM jsonb_array_elements(member->'operations') LOOP
   SELECT * INTO STRICT ma FROM naijue_erp.audit_change WHERE operation_id=(step->>'operationId')::uuid;
   SELECT * INTO STRICT mr FROM naijue_erp.operation_receipt WHERE id=ma.operation_id;
   IF (step ?& ARRAY['operationId','fromVersion','toVersion'] AND step-ARRAY['operationId','fromVersion','toVersion']='{}'::jsonb
    AND ma.object_type=e.entity_type AND ma.object_id=e.native_id AND mr.target_type=ma.object_type AND mr.target_id=ma.object_id
    AND mr.action=ma.action AND mr.actor_account_id=ma.actor_account_id AND mr.status='COMMITTED' AND mr.completed_at=ma.occurred_at
    AND ma.old_version=(state->>'version')::integer AND ma.new_version=ma.old_version+1
    AND step->>'fromVersion'=ma.old_version::text AND step->>'toVersion'=ma.new_version::text
    AND mr.result_data->>'operationId'=ma.operation_id::text
    AND coalesce(mr.result_data->>'targetId',mr.result_data->>'customerId')=ma.object_id::text
    AND mr.result_data->>'version'=ma.new_version::text
    AND ma.occurred_at>=cr.completed_at AND ma.occurred_at<=r.completed_at) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Exact authorized master maintenance version chain required' USING ERRCODE='23514'; END IF;
   before_root:=ma.before_values-ARRAY['accounts','account_credentials']; after_root:=ma.after_values-ARRAY['accounts','account_credentials'];
   FOR field IN SELECT * FROM jsonb_each(before_root) LOOP
    IF NOT state ? field.key OR NOT naijue_erp.maintenance_evidence_matches(field.value,state->field.key) THEN
     RAISE EXCEPTION 'Maintenance before chain differs from original source birth/current link' USING ERRCODE='23514'; END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(after_root) x(k) WHERE NOT state ? k) THEN RAISE EXCEPTION 'Invented master fields forbidden' USING ERRCODE='23514'; END IF;
   IF NOT (before_root ? 'version') OR NOT (after_root ? 'version') THEN RAISE EXCEPTION 'Maintenance versions must be explicitly evidenced' USING ERRCODE='23514'; END IF;
   state:=state||after_root;
   IF state->>'version'<>ma.new_version::text THEN RAISE EXCEPTION 'Maintenance version link missing' USING ERRCODE='23514'; END IF;
  END LOOP;
  table_name:=CASE e.entity_type WHEN 'HALL' THEN 'hall' WHEN 'WAREHOUSE' THEN 'warehouse' WHEN 'STAFF' THEN 'staff' WHEN 'CUSTOMER' THEN 'customer' END;
  EXECUTE format('SELECT to_jsonb(n) FROM naijue_erp.%I n WHERE id=$1 FOR SHARE',table_name) INTO STRICT actual USING e.native_id;
  IF NOT naijue_erp.maintenance_complete_row_matches(state,actual) OR NOT naijue_erp.maintenance_complete_row_matches(member->'nativeSnapshot',actual)
   OR member->>'version'<>actual->>'version' THEN RAISE EXCEPTION 'Current typed CORE projection changed outside frozen maintenance chain' USING ERRCODE='23514'; END IF;
 END LOOP;
END $v22$;
COMMIT;
