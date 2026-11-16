
import os,sys,json,stat,hashlib,time,re
from pathlib import Path
context=CONTEXT_LITERAL

R3_R2_PRIVATE_MANIFEST = '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'
R3_R2_PRIVATE_FINAL = ('t45-r3-r2-data-full-20261116-01', 80853258, '8bb909c7986a35128b207496fa8a0c1451f1c097954754c3ddc9629e18696c4c')
FINAL33_FIXED_ARCHIVES = (('standard', 85525644, ('7c9ebc3bf73242edd8e710ac4237c3dd04d1fb9f187c158f2f285a53b90f0228', 'ab8a9456eae851c8aa8a79b60490871ff115ae0c05250be42c3f53a5c374ee3c', '014e9889c64ed1eca2dde93fd6d1079278c836517e17649ebaf6e661a13c2543', '25a8964fae8f1485bead8c1f3747e871438f27271066c889bffe8bccb45e485f', 'bc0a02f502999735df3a78faf36bcaf57a6f95745ca7f7e497a4537489891afa', 'edd7e33afe032dfc787606f8d33510a3205fa14db7002c188e9e54d12f1f7dbc', 'be1140f9d9da90df9aee0530d2cf3acd3d48d177444696c4e602835ba9c76db3', 'f139abf77a3e4279613e44c5a80a43b158d6590a45a4f7e89c8a957a2af2167d', '8661b270f4ac1da7c8b3f94e4a48faf3b4bd35a1c180e38e2de929e327fe24c6', '798c4f342677dd36c2a1a12e2f6693d6087492e29bac06edc4e57deeab8cdb2f', '929b04cd5f43b6c5f3de31899451992d7d4b27b6acfdb5a564fdadade7c9ea6f', 'ee33ebe60dbfbeb31648d5c9724afedf9190321076d1c8712a4084191510b9a5', 'e1c0ee49ff7e5ab8e761d937a6377e331a7bc88b54664f7363c93a3da25cf53c', 'e7d2d206a51314772984b560c2866b409d451069af61945bd3e991ac36c1fb4b', '1d7414174ad6fec97f145809f89eb7420b10c8711b50fb471776d99b8d4ea9c3', 'ba9a3d498215f8dde21b3388a4765ff5acb17c9f11258c188abceda88aed9293', '5df1f4a5c48a9baed6ee2cd640253725fa7b1dfd7d4792848cbd8a15116d0564', '1f0f13fba6c7ae5283937a13705194eb6580002e5b35b27468da03f5fe2b17f4', '15ce02f4250e1e8311ef6eed29ce8e3571b0db2af2af095b3792d466022fa57a', 'e6ff31159999548c67aa34171651a57ec5d53da4ffb02eef906d856d06df68dc', '09315443bea97d16f71fa8e4831702a2e5947f6d69cceff02c51b808f3bc8979', 'fea9906a7bb3e6db8c9bef3cb221aef3adc1af35c272f8ffe65d8d9e497a437c', '0b20336f6e5136540daeabd42d6d8041a52a07cf248384c948b2493fa65d2cc6', '8d5e78df7d2c986c754c1a9ad2af4a5af0ec48c45f078b3a14e232163bfaede1', '916c408d9079aa420ca99ec2e9d631cc482520cc51f66b4966770a3a0125eb6d', '04edf3f67cc1061a514c845c55eb87cf53fca010924c9dfc38fc102646777ebe', 'f2017c3c0b268821948b3a9f648c0778728feecc979dae925b7ed94b512408f8', 'e6b5b6163eb5afbb99e63d687a7fd5e59718ee50e899e92b0a10c4e734b1c753', 'ca921595a196192d6b7ee0dec55b3e12d1da4a19682f9850e1913ff9ce9c7018', '64a2cae8aa5b00f8a50e4daa862a36af4c9a62b9f1ecfb5f95bdc79a051d19ac', 'e50d2e5f1cad7995dd5dc11cffe43c8798d269e8ac3d0a1b6ae805bea7839146', '0fba290e956aa1c474e759914eaf3de56ad241355b1f3474176c35cd0195f0bb', 'b979b7f2673f74fe5eea5d91f3f41a00ab82d533ff5716afa35a83ca7cc3813d', '5a42f641db579e7e0fbfdf2dba384e7d74840a49494f350555ff79929afec9fd', '6f5c4247ac3dc07eed8260897556e8429e6fe493816b9e804adda1728a825057', '96f3454870caf1f40eb39ecaabeff7cf73da8528da9758711a7769ac1947965d', 'f40939a966f212d5efb96c7e9f919d8ad6e803c382479497c104c0101b58de7b', '04c7b974f5e7cf25235cab8aecb64b24b211e06152042eb0f4a0ca62113c789b', '46b7ac4d7fa528a761329f4490c49b44abe11f65761ea975448c4de8ad4c2f89', '6dd92c8657ecd8d8d3709ac220e7d7ba9d7dbec100e60fddd0ecc95b9dbf1102', 'eadac971317a0542d242cf5eb8c1d07b695608851231a6b6934d53dadaf79f28')), ('evidence', 355417223, ('59a5dd93ed9266dae8344fbade5b82487b3791b3249abab5f4ddb44a46a8490e', '373405de0d47614c2803a459ec5e00c52c09e023763caea2ca2ad00897995838', '914dc21f43dd456aed02c7045cbd4d0b17a5fc2c08a7cef19c350b2f25f68eb3', '6efa22028f2af73274dd63890d605e09b1c8d8e2a245f325d6151553a92fffe4', 'b0c7855d35743946f8202bf68a51e8cdf8d557b62df1ba4e5b3610f60c3c738e', '60b324e161221c15ae58606d9a210c7ece424f0324628e7e09ff2d3752950651', '1f859546b667614148f9949201aecaf1a366e418d3718f53a1c930630f658bf2', '3ff75522772511685cd4c44fdf7700e3a6bee0db97d1c62a4388a807cb134f21', '59de80a494a5941c2ce357a4fc0c92644673a9c6175313bb4e0874af1a20dd54', '011d77f501402a38939d4da3ffa0d3ac7691fad921d06a1ab5fa6bb35f26ed51', '0033262074a51c571472ed8fae3d25e91113af9e91e5a44f9b6051b5b8b3555b', '30fd482705933db35117e2915ed100bc1cd6f4739471c4355d415d75ace11096', 'b75cb6c0ca46f7ac6fb9290e9f6c1ca6696b678dfe3d9e0ffb56e73f1d55bcbd', '9e81e9ca76f24cf8ac680737b568e0481f2958607578c95fee7d6b407eff43f4', '5470a372cc3a54da5288cbf0d9264d5d1052f4ad0839bc30ddfd92baa354ac93', '9aad166781ce378dc1163a5ec7145f45a5014f1db79b574313c7d6013d50868f', '2aa1d4e1036e492f92047428ba14430887621e170ad899bb79a2c03651e801a0', '5cc772c0758b646f00ebd4235359f0a5a57a256298b32f1ed4037a497cb29508', '8d3d5d453df8dd2ec2c358eb3a2ccc05e364b586d55fa33980788d075e994271', '711c37b3b5d618c9fb34a43d571cb1b5f1bb2959f571af5e378d400f4b072223', '5e3759034060edc7a32ea3cb19f726ad5600112a6c796efb034ee3059ea67ab5', '78dd3045965c213c4048ff5f9d59371e9e8f4c287cc9cc21dc39b0a17319399c', '8b54137461d41396771a58d709f94fd8b329213c29a397e22ea913b339183bd3', '651e316d4caf65a139b8760883659794e2f1ce5e494452d86bb7fce21910f92f', '050fbf1fac460f0105854cb4bee30f6397051ae119cbfd19bd3e5a7afc1c67d6', '562d8a44486aeb7da286cd9662b8e1e93fdeaa844ace6aa4107b37fdc5e5c01b', 'fcf5e854b89e5bcc9287374f88831d5a34a8264cd25ff8a81f754a73a47215c8', 'fd6d7873b40aa3c9338819e9987650dc15589e7f1f4fa9a9f1cbdb1f20155f2d', 'af600cb767ad96ba5ca85ffe958b4cd5545f17688fe5ca991e9fa65b69943f89', 'c046bf83cc8e8ba8d30092550fec1b36c628dd79c608c2279159f393ba06f21f', '3f73f6f810fab0a660b94d4ae4f2a721903f8b5832ef5a56675dd880881f1f53', '9c95c5d0b0ae24c77c9e447ae58cf1510c74394cc23d0f015ad3e73a0d5e6c5d', '96517d07e5146002e2cd07320c4552ae3703c8ad228a4fda7d644732d742b4f8', '1b3c969e3d02b91908e75b38b7c341cdfd7482014cb236e2a9f9c5c61900adf7', '87d8a8fb2588be31ae94c949e669a75220b6d3298290df58a64f5e911f933a3f', '90899b298ef4bc75fd98bd9d18ed0c3e65738a85a675b4b7ebe01108284687f4', 'cad40995f688f72e8e3dccb6f2197903a64e74e7bfa88616ca17998a59c6631e', '505743d2e67ea6739811653e0007e5ce5c58aee68c831f3d3d2999e7b2858eb1', '856443f690b72a0cd64eadf61194040d6cb6f6340a8434626557e01065dca4dc', '9bcae29e7ff9b20083409967641646e4521aa715b49909d1f5f561bab6f80268', 'fd4809c0e3f53ac3987356f7a18eb83763c99169d1a9f7e23b8f0308a7ce9b1a', 'd8f5e8a8753e86ede4bbe0e9207b5938abc3b25652349985f43127a36a546d87', '05d59472edaab8b2a7b759e806b2847e38cfea0943d932ee920b73e29ee8461b', '7b3a72695b3a24e87b9aeda59ce2bf66db6c08fa0bef6fc4d6126c00aa286d5c', '3ffc7e5be218b95a9040e76376a9f6779fe338aa89b8735b6e8effe80bf68bc0', '7c4e8c7447b51dd9ba87fea0cb7cf658bdafe0260a77cdabbd89ec98cd7f8543', '86f0b45f6e3958d8780d46d0334fc93240f4998a046c4377a90785d3be1830ee', '640073561880a5afa1916dc33e465e8104daa92331a4b9082f4279474c8f6a74', '2bbdede8ca75d97f3a707425ab3454352425b2d9f250e90e7193d8ebc6e51e3e', '469713d003c87ae89cfbb99903de4891b5e12dba8361a3c8762f1d245d37fa71', 'a66d47fc971711ba1169fe1a36a6fff1c3c981c891216af983ca0d60785e30ca', 'a2b05fa509a5d8ecb42c25fc77352dfc9b891ee28dd6924e00e7bd5710e94498', '1e3c7f005b553fffb7cebc2743330d82714f2e1db6679a4d7ed6f25d367356d2', '08ba3b2a4ef2b9ac0c3a42abaf06206a0232cbaa0b6a5e4cedae7c3c85519cfd', '0d6a7c22a0a314bbadc9b3ee2ac4916c894abe15b635e9835580ec5414208998', '3e3b0b65c3b7daf199fb1f5fa090d32ad645db6da788dd89c01222b081917ff5', '7c6516b701b5583f749ca25ff3bfd4353a85095fac639ca7f631f94fd202f061', '491a7f51d95414ead8f3cc73df44697d74f03bff392447fe5730b3c75cee9862', 'dcdb7cac217985d01e2b5b838db9d70e5d08a3b131bcbcfac9a8c467c15d69e0', '1b0c00fb39e681a946c4e8b79682ef80e998fd8f4fc45cb508ba79007fed8cae', '4b256a6512037b31d0e9737ff7a7c908b36eb8e18a8dae6316e6e95509695d73', 'd158c8ab231c3eb0db6d4791159a63f311d82e6175db1921117fc8404681f363', 'ea91775107e1b020961602f7bc0fe39c0aa1f1adca780efa6fec29082af0d39c', '23a35d6ee32b9a4099686facb5f039232e8497d1d659d8375b92a2f66835f868', 'eda487a88eb8cf8c7217e8c2a758b0f1fbb75127bbbdbb971840616482af02ad', '55554d5ca392d1fadbc96d08f6ed71e1adf2a9f7d4e00c9e78ba0ae42678641e', '2c675a87f5c8f18e92134e9e75a7adf645ac951bae80990014a6abd73168c0c8', '23356e65822f9c8c3159ebc76c1507516d1b390e8e0bde3ddab698b226e50566', '116c40fd8b5e3c744fafafacc18f7522c132a5e49d45a1bd2b6dc2bec66e8727', '5e59ee583a249d8f58c7f9802fd52f1ce4cbd7cddbfc36f148b4ce6ad6a24b58', 'a28a4a11c5a5eecc0d1b17d3d370edd8a0e68a7a309e5a60464b6d0cccd1d95f', '7c4207ad748410c271e9dc3f620d264e5cc76f4915657883d95cff13fe2ec87a', '4dda3a83e2898773117522df23680869c7e276023c436970f4b416aa880b623f', '103214b757d2ae236b4e5a1e15dd12458bf69299cf3f915694bb30804f812a54', '0b7babd08e0f40cde8f8e152db1a75e00ad743cfbeec99a689b1d958b61d0c5b', 'a594c9b7163cc1cddb63c27ca64a1b05351500085d3bdbfffae8761dfcac203b', 'a33bba9c2f0cecfccd3bdceb5fdbde30be8f0902ad7a8be90e71e3b633c9c198', '9d7c11ae71e1f0b37174c8a7f2b9d79abfc17a147f6eca28a92e9933b0943dce', 'c091ac727f05f9a80599d1dd6dcc64ab97893151dabfcc7028d43000aa8eef30', 'c0347cd9458677b66c65cfddc3713658d43d789078ef2f8741332eea6a1a8cb7', 'fcb7daae997626822be908c6c22c8ecf32401feb8f8c2cc4c0f74f89c42a262f', 'b013cfd5fe741fd9ebaa6645d42117039b887991ea7ea1593758b3247728a06a', '39c6d9113cf57c7c35a3f30ad3f0e956ac9d3d9f7bd61ab17a3e142d7c3304ec', 'a2f7faca36eeb56a23d55060d6605ab2c0ffbf7b89a96271965484745aa54227', '7c3ac026c9ee3cbf97b0e927479c3e41799cdfe36917a9ef8ad23f7944f8998c', '637f92add9769ccfb1cc6ed2323a40b59f18be0e461253022cf732d33172622f', '2274ca9dc27582abb2c6437fb4596504c7e168e8616564d8c7db4dd8dc4249c3', 'd774f37445cc8ff0431a5da93f7a00d8d522d686aabfc4d56096d63c8acaa3ad', '233fad1b641bff72ba5d625e32c889abaf258232beff09d9b1b0cc5333912ad4', '6b73f502a3879718c2bd006ce803556116767e7c2bb06da9500f179f979f2e3e', '69ad92532435f4ec8856eee7c8b27a6cdb5cca1e3c10d9941a6a17b7409e900e', 'd84957950f90cbedc549c95741e4921d7df3b9f3835d3c5165ca1b8049e46f56', '697a852ee784902634bd3db7824b92e6a067a6ff74935562262195595245d2ff', 'abda5f0e623d4ee710d46766b8ee21578e1ee6afebce9855714da13c9125f083', '57f8ca1feea6c49483d44bc166d239d49bb3002af3e108c3681a97480b747137', 'a2ea99a718e9fc0ba961e8b2e703ed8900ad134bf280600787729fa088d0a3f4', '05053dd4dd552a6345f0cc37126b8ab9b99a1c124642a7121f1da6f2b1bd10ad', '35e27ffb09387930d58a8be0d3311411b2d0ed7c64d6b119811b16c156c48c22', 'd437c9a54837e6e1b2b9c04ff457989ab7854545f5c98b74705b66f108617d1d', 'c52bdfb80e9e0327be661340cb96669d049b9a6f6570a02b7370d881d3ec214b', 'a2f4a1df72a3e94a6d55d93c7b21c0dc078d111cf51688480798440989a452b0', 'c923231e5c99ed873f5b576de6d818dbb68e3937d2f206ff669b9c7ed005590e', '336c31079c7dfa438818ca88515440df23f19b02e656a8420c96499cb3bad5f6', '5b6939dcce2fe32276467370b7e4a4482aaa81a1f0b8618383a9fe482974784a', '612b4dce5b679cb0a480d716954ce831ac1ca69a00871368234e7ac80649bbea', '558be88478681c71148ef7847846575e9e085e1270b5ae52f14884c2317052b6', '1cdfa8a02d258383c15e125aae9b91c8e95d841ffec9e5c08ae2477a3595958b', '9145ab28c6f7a5bc961a5809adaa45138fae0ad8c8fea8122b6af5e23fadd6a5', 'a8a8f954293ed8fc35f40778cc33c3202cc42e7dc28bcc4afe1456bcc58fe564', 'e6bb7a31210661885cb02448fcc7ff3039ffb7ecec6e86e1743761b7d0a3b917', 'af3b8be0c5b0c8421e1aea4c83763c459d2d207471e83afc26252e3c49688ecc', '758baa481270bd17e1d1c20e3fc37c73210c3fcc8c26d389749b3f4c7ea49026', '6c56b44d3ca4886006a5dde2de2928c3d6f5693a92fd04e7f5677e5c500fc607', '37d137de7bce610899a57c41d52796b67dce2da94f26ba03372aad72304f0c19', '96b8cea0a15547e21a5ad640196655d1382d50e6d672a3c550f3ea45ec04fc23', 'b4f4c5c4bd4e03fb3e735aaaa93c416dd07af9f67f1216f0ceb77e7344a39ba0', 'fed162248ee1fa293687631029536da78cb4abc611fa50866495116c236c247e', '244c25440fdb49428cb9bc8e261de1d651e7bf0023cda334a0d8b69f4ac87772', '4d0960131f2dc97a8e16680d93338d57670f28132c3f143eea883ad904348359', 'cc563b7dd98936aa5d7047d165ac7a8d3e7395f90718944a80cefb7ac8109c2d', '6bcf15873f17af1dcd50d3501cf4365b48d51f3ddd80370205d41069c5115e89', 'f4cd3ee9052d0e2ffc790a99b115ccf8f2658bbed9375e9f98f5d7ad7debdc78', '30875d20007301b47c4c55e78be755af069cdb3bae32265ebd3dc179b3fb583e', '731b4fa0733d2809f50354773b158ffa802bb591087802e5922f2301a08e18ab', '25830e25e369e080199e4f4bdd79d4b2e8156ec49ed5829d149d6696c50ad703', '9e7f675418fb342cea85a56314a8224b39f109c7715388cd4497186265c82c2b', '79be579ed610232f3d9703f4fce3657dc3854b0c16f77aad88c6243c0c15d11e', '6dc6b384cf91fb00dccecd90ede82cb1bc49ce4ad9373297d42b8c26c3d084be', '71628d3a7c96d3bce96e17b983068d6030871ef0bbeab23445e49d7095ea5745', 'f133186c07352fb2e480a2d6f63b995e69b5429cba2700e1d6ba4c76461e32f9', '7f57fed5a94d7299950b39e2e7872e4d9a5a8ea812d6a055e3fac2fe36e6ee64', 'd2c91e482d4c375f940590fb3b740eb3619b0253974f0afdab41f4acb425d169', '6625a24c1a21356ba4c999fca00ecc58e91b83d3fb8752f79e8663b900ee1efd', '162e9dcfad5fbc68769f6cd87bb88fc2003a662984fbe3c368223a979eff5835', '343c3bd52f7052b169dcc39008bd3c533a4669d512627d3d2b11759f0c5c78b7', '884f782071bc3916286fde6ae8d86dacb3913a6ebbb9019ab2c04dfa84ffb33d', '5713872dce8e464bb6edc5e08814c1f7409546d886a882cb45b143b975365ca8', 'ce03ac2d89b4a078d53ce302ade45f4c1d4aff8c4d26d66580e51e66ef4d9716', 'fd9cf90a39a8a39888f340af9daac8fd25c9813b36cc1d4e6174a1a997246c2a', 'e163ddb06ecaa7ed63c614f2bdfd26cd6352846d91088b76ef7a6bba38370b95', '23bfbc6e0cb3a3bb1e62bd9f0cb532feae51ddb1966a702732ccd5593b3854e1', 'c1d4746f26d4bc0fedf583af7a635835dead67a44b5510ef3df8f8f4140b8f1a', 'fa29b66f8a0e006bcd7e00edad2ea5ecb7440b4504ccdecb5c26a20ce48f18c2', 'f16b8e33b8b14098a02eab10c92f721504b8b0191bb518a098a91ad6306937b7', 'a301ae28f655d4938851e2afbf62f198909e37a55ef3594ad46d3761e1a75857', 'd3230da42c2f63e773ecf399bf41e84c874e1b3ca87f5e8375961f71f77283d9', 'cd1825d1ae3da127fc00d19ce485330f208b9d03b132b805cfa5c8540a39465f', '20902212678fb86eb5c327616f419fa0844a0d125a4badf8bf4b7c48a7cebb7e', 'cc3cc7e7addde4ca1c8d619dd045f236c31eca3adda4fc724f79c692bfd317ed', '29dcf09bf74533ae81bf90c97b472fe75a3e7dac755acb46b569496700fdbe63', 'ce4497860ad87018eba66f67c456f07974f188269b155dfbf7e5f1da49f4bfce', 'bca899379dc3830581b9b5ad6b1376080c26bfd30ae17698026063457dbd2e8e', 'fbf063276247dee157856599873c7a9ce71dab064c75863dbcc32359db50cb5c', '468527ebfec614d900f96371d892a4a6fd52baa80446a98a7b05cad6b7cb43a0', 'b6c8810b7b7f66734e428d8ea025ca9f4f76d0bd7b9a08cd7724bd1112180b15', '4bc122617337424282727464f8b99f20dbb5bc9e2f5afe6759d83e1bf3d176b3', '83ba15e3a8f5faf826e9a5d6d8148c72dde37a44d52ba701c846cdb5b4a220d6', 'd45645d6efbf3b3aa8f91d927e50876dff4d9a78072299028e487f964f803f84', '4ccbecb244b29ce75394f2685cefecb03428f22dfec5029aa9095bf6fa8b587f', '54ed9776e091f2b3c32fe752f5c5c69be8417a073482fea79fdeab182f38c6c5', '8f7a07a69f0575f1819021185ea7ded345031f231ddc1de33694b8f4ab508438', 'f0c818a28af2919c81c483b929b27269db4ddb38ff37bc94fe7aa8862b1d01f2', '02561908cb3114f6536d656856c81cb3b4fc5f1ce9a52d13a9304102d8054c1d', '0fe53e3f7224655fbeec81bc9df03ef062f426c557634c9a78e32d5c33efe74f', '05faa51cef34bd790774ddcb7a52538ca1ec8e42bb82d1a0c31870a725cd9807', '7b151086d5f31776257e9d36fdd643b17af6020bf234aa15167c81df48d2a718', 'f240eb6dfd92ee3aedb2a636ad7b3041922f9009b17e8ec34d837b03bd58e647', '2f8ef8b4c50fea83b0f2e80392d50ccf83077ba09ba445baf3cd2f28f95f4fc4', '41216564986ec3413a1a06f1fdac7c62dc6e9cdeba015200df68697c414e4ba0', '0b5ec0f916bcd5f4afd936253fc4df452baa198587514c2450667d993f3fd625')))
R3_R2_PRIVATE_PARTS = {f"t45-r3-final33-{name}-p{i+1:03}-20261116-01": (i+1, i*2097152, min(2097152, size-i*2097152), pin) for name,size,pins in FINAL33_FIXED_ARCHIVES for i,pin in enumerate(pins)}

def r3_r2_private_authority(a, control, grant):
    keys={'format','decision','taskId','grantId','artifactKey','manifestSha256','archiveSha256',
           'archiveBytes','targetDirectory','startsAt','expiresAt','decisionReference','kind'}
    fragment=a.get('kind')=='PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT'
    if fragment:keys|={'fragmentIndex','fragmentOffset'}
    key=a.get('artifactKey')
    if (set(a)!=keys or type(key) is not str or
        a['format']!='T45_PRIVATE_STANDARD_IMPORT_DATA_STAGING_V1' or
        a['decision']!='AUTHORIZE_EXACT_PRIVATE_STANDARD_IMPORT_DATA_STAGING' or
        a['taskId']!='T45' or a['grantId']!=grant or grant!='b16447fbc81f4d64' or
        control!='/home/naijue/erp-release-20261006-01-control/grant-'+grant or
        a['manifestSha256']!=R3_R2_PRIVATE_MANIFEST or
        a['targetDirectory']!=control+'/private-standard-import-data/'+key or
        type(a['archiveBytes']) is not int or type(a['startsAt']) is not int or
        type(a['expiresAt']) is not int or not 0<a['expiresAt']-a['startsAt']<=600000 or
        type(a['decisionReference']) is not str or not 0<len(a['decisionReference'])<=512):
        raise ValueError('R3_R2_EXACT_PRIVATE_SCOPE_REQUIRED')
    if fragment:
        if (type(a['fragmentIndex']) is not int or type(a['fragmentOffset']) is not int or
            R3_R2_PRIVATE_PARTS.get(key)!=(a['fragmentIndex'],a['fragmentOffset'],a['archiveBytes'],a['archiveSha256'])):
            raise ValueError('R3_R2_EXACT_PRIVATE_FRAGMENT_REQUIRED')
    elif a['kind']!='PRIVATE_STANDARD_IMPORT_DATA' or (key,a['archiveBytes'],a['archiveSha256'])!=R3_R2_PRIVATE_FINAL:
        raise ValueError('R3_R2_EXACT_PRIVATE_FINAL_REQUIRED')

def need(v,k):
 if not v:raise ValueError(k)
def canonical(p):
 need(p.is_absolute() and str(p)==os.path.normpath(str(p)),'ARTIFACT_CANONICAL_PATH_REQUIRED')
 for q in [*reversed(p.parents),p]:
  s=q.lstat();need(not stat.S_ISLNK(s.st_mode),'ARTIFACT_SYMLINK_REFUSED')
 return p
def read_regular(p,limit,root=False):
 canonical(p);fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<=limit,'ARTIFACT_REGULAR_INPUT_REQUIRED')
  if root:need(s.st_uid==0 and s.st_mode&0o022==0,'ARTIFACT_ROOT_AUTHORITY_REQUIRED')
  b=os.read(fd,limit+1);z=os.fstat(fd)
  need(len(b)==s.st_size and (s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)==(z.st_ino,z.st_size,z.st_mtime_ns,z.st_ctime_ns),'ARTIFACT_INPUT_CHANGED')
  return b
 finally:os.close(fd)
def authority():
 g=context['grantId'];need(re.fullmatch('[a-f0-9]{16}',g),'ARTIFACT_GRANT_REFUSED')
 control='/home/naijue/erp-release-20261006-01-control/grant-'+g
 need(context['control']==control,'ARTIFACT_CONTROL_REFUSED')
 p=Path('/usr/local/lib/naijue-erp-night/grant-'+g+'/artifact-staging-authorization.json')
 for q in [*reversed(p.parents),p]:
  s=q.lstat();need(s.st_uid==0 and s.st_mode&0o022==0 and not stat.S_ISLNK(s.st_mode),'ARTIFACT_ROOT_AUTHORITY_REQUIRED')
 raw=read_regular(p,65536,True);need(hashlib.sha256(raw).hexdigest()==context['authoritySha256'],'ARTIFACT_EXTERNAL_AUTHORITY_DIFFERS')
 a=json.loads(raw);need(a==context['authority'],'ARTIFACT_AUTHORITY_BINDING_DIFFERS')
 chunk_authority(a,control,g)
 return a

def syncdir(p):
 fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def own_directory(p):
 canonical(p);s=p.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_uid==os.getuid() and s.st_mode&0o022==0,'ARTIFACT_OWNED_DIRECTORY_REQUIRED')
def identity(s):return [s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def new_file(p,b):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 try:
  with os.fdopen(fd,'wb',closefd=False) as f:f.write(b);f.flush();os.fsync(fd)
 finally:os.close(fd)

RECOVERY_MARKER = 'RECEIVE_FIXED_D3_ORIGINAL_CHUNKS'
CHUNK_DECISION = 'AUTHORIZE_EXACT_PRIVATE_STANDARD_IMPORT_DATA_CHUNKS'
ORIGINAL_CONTROL = '/home/naijue/erp-release-20261006-01-control'
ORIGINAL_GRANT = 'b16447fbc81f4d64'
PREVIOUS_GRANT = '5cc58239751e4e2a'
FRAGMENT_FIELDS = ('artifactKey','archiveBytes','archiveSha256','manifestSha256','fragmentIndex','fragmentOffset')
SNAPSHOT_FIELDS = ('artifactKey','originalBindingSha256','fileIdentity','prefixSha256','layout','ready')
WINDOW_LAYOUTS = (
 ('archive.part','binding.json'),
 ('archive.bin','archive.part','binding.json'),
 ('archive.bin','binding.json'),
 ('archive.bin','binding.json','ready.tmp'),
 ('archive.bin','binding.json','ready.json','ready.tmp'),
 ('archive.bin','binding.json','ready.json'),
)


def file_identity(value):
 return type(value) is list and len(value)==5 and all(type(n) is int and n>=0 for n in value)


def digest(value):
 return type(value) is str and re.fullmatch('[a-f0-9]{64}',value)


def plan_sha(segments):
 return hashlib.sha256(json.dumps(segments,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def unique_fields(entries):
 out={}
 for key,value in entries:
  need(key not in out,'D3_CHUNK_RECOVERY_DUPLICATE_KEY')
  out[key]=value
 return out


def chunk_authority(a,control,grant):
 need(type(a) is dict and a.get('decision')==CHUNK_DECISION,'D3_CHUNK_EXACT_CHUNK_DECISION_REQUIRED')
 # The current stock whole-file receiver rejects the chunk decision itself.
 # Reuse its fixed target and fragment checks for this narrower receiver.
 r3_r2_private_authority({**a,'decision':'AUTHORIZE_EXACT_PRIVATE_STANDARD_IMPORT_DATA_STAGING'},control,grant)
 need(a['kind']=='PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT' and a['fragmentIndex']>=1,
      'D3_CHUNK_FRESH_FIXED_ORIGINAL_FRAGMENT_REQUIRED')


def recovery_window(a,raw):
 match=re.fullmatch(RECOVERY_MARKER+r' D3_CHUNK_WINDOW_SHA256=([a-f0-9]{64}) \S[^\r\n]*',a['decisionReference'])
 need(match and 0<len(raw)<=4096 and hashlib.sha256(raw).hexdigest()==match[1],
      'D3_CHUNK_RECOVERY_EXACT_APPROVED_WINDOW_REQUIRED')
 w=json.loads(raw,object_pairs_hook=unique_fields)
 need(type(w) is dict and set(w)=={'format','artifactKey','segments','boundary'} and
      w['format']=='T45_D3_FIXED_CHUNK_WINDOW_V1' and w['artifactKey']==a['artifactKey'],
      'D3_CHUNK_RECOVERY_WINDOW_SHAPE_REFUSED')
 chunk_authority(a,ORIGINAL_CONTROL+'/grant-'+ORIGINAL_GRANT,ORIGINAL_GRANT)
 rows=w['segments']; ends={}
 need(type(rows) is list and len(rows)==(a['archiveBytes']+262143)//262144,'D3_CHUNK_PLAN_LENGTH_REFUSED')
 for n,row in enumerate(rows,1):
  start=(n-1)*262144; size=min(262144,a['archiveBytes']-start)
  need(type(row) is dict and set(row)=={'segment','offset','bytes','sha256','prefixAfterSha256'} and
       all(type(row[k]) is int for k in ('segment','offset','bytes')) and
       (row['segment'],row['offset'],row['bytes'])==(n,start,size) and
       digest(row['sha256']) and digest(row['prefixAfterSha256']), 'D3_CHUNK_EXACT_SEGMENT_PLAN_REQUIRED')
  ends[start+size]=row['prefixAfterSha256']
 need(rows[0]['sha256']==rows[0]['prefixAfterSha256'] and ends[a['archiveBytes']]==a['archiveSha256'],
      'D3_CHUNK_PLAN_ORIGINAL_DIGEST_REQUIRED')
 b=w['boundary']
 if b is None:return w
 need(type(b) is dict and set(b)==set(SNAPSHOT_FIELDS),'D3_CHUNK_RECOVERY_BOUNDARY_SHAPE_REFUSED')
 leaf=b['ready'];layout=b['layout'];file=b['fileIdentity']
 need(b['artifactKey']==a['artifactKey'] and digest(b['originalBindingSha256']) and
      file_identity(file) and ends.get(file[2])==b['prefixSha256']
      and digest(b['prefixSha256']) and type(layout) is list and tuple(layout) in WINDOW_LAYOUTS
      and (file[2]==a['archiveBytes'] or tuple(layout)==WINDOW_LAYOUTS[0])
      and (leaf is not None)==('ready.tmp' in layout or 'ready.json' in layout),
      'D3_CHUNK_RECOVERY_WINDOW_ORIGINAL_BOUNDARY_REFUSED')
 if leaf is not None:
  need(type(leaf) is dict and set(leaf)=={'sha256','authoritySha256','fileIdentity'} and
       digest(leaf['sha256']) and digest(leaf['authoritySha256']) and file_identity(leaf['fileIdentity']),
       'D3_CHUNK_RECOVERY_WINDOW_READY_PROOF_REFUSED')
 return w


def recovery_window_raw():
 import base64
 return base64.b64decode(context['recoveryWindowRawBase64'],validate=True)


def recovery_snapshot(out):
 return {k:out[k] for k in SNAPSHOT_FIELDS}


def existing_leaf(path):
 try:path.lstat()
 except FileNotFoundError:return False
 return True


def private_directory(path,uid,gid):
 st=canonical(path).lstat()
 need(stat.S_ISDIR(st.st_mode) and (st.st_uid,st.st_gid)==(uid,gid) and stat.S_IMODE(st.st_mode)==0o700,
      'D3_CHUNK_RECOVERY_PRIVATE_DIRECTORY_REQUIRED')


def original_target(a,root_inspect=False):
 target=Path(a['targetDirectory'])
 uid,gid=(1000,1000) if root_inspect else (os.getuid(),os.getgid())
 private_directory(target.parent,uid,gid)
 old=Path(ORIGINAL_CONTROL)/('grant-'+PREVIOUS_GRANT)/'private-standard-import-data'/a['artifactKey']
 need(not existing_leaf(old),'D3_CHUNK_OLD_NAMESPACE_OCCUPIED')
 return target


def absent_snapshot(a,root_inspect=False):
 target=original_target(a,root_inspect)
 need(recovery_window(a,recovery_window_raw())['boundary'] is None and not existing_leaf(target),
      'D3_CHUNK_ORIGINAL_ABSENCE_REQUIRED_NO_REPLAY')
 consumers=recovery_no_other_writers(target,uid=1000 if root_inspect else None)
 return {'status':'ABSENT','artifactKey':a['artifactKey'],'nextSegment':1,'originalBindingSha256':None,
         'fileIdentity':None,'prefixSha256':None,'layout':[],'ready':None,
         'consumerCheck':consumers,'recoveryAuthoritySha256':context['authoritySha256']}


def recovery_no_other_writers(target,proc=Path('/proc'),uid=None):
 # Old receivers hold an archive FD, new receivers may still be buffering stdin.
 # Check their exact receiver argv as well as FDs, without exporting argv contents.
 if uid is None:uid=os.getuid()
 root_view=os.geteuid()==0
 facts={'scope':'ROOT_ALL_UID_ARGV_AND_FD' if root_view else 'ORDINARY_TARGET_RECEIVERS_WITH_EXCLUSIVE_INODE',
        'noncandidateFDState':'SCANNED_WHEN_PRESENT' if root_view else 'NOT_INSPECTED','noncandidateProcesses':0}
 own=os.getpid();ancestors={own};current=own
 while True:
  try:parent=int((proc/str(current)/'stat').read_text().rsplit(')',1)[1].split()[1])
  except (OSError,ValueError,IndexError):break
  if parent<=1 or parent in ancestors:break
  ancestors.add(parent);current=parent
 for process in proc.iterdir():
  if not process.name.isdecimal() or int(process.name) in ancestors:continue
  try:
   if process.stat().st_uid!=uid:continue
   fd=os.open(process/'cmdline',os.O_RDONLY|os.O_NOFOLLOW)
   try:argv=os.read(fd,262145)
   finally:os.close(fd)
   need(len(argv)<=262144,'D3_CHUNK_RECOVERY_CONSUMER_ARGV_UNBOUNDED')
   exact=str(target).encode() in argv and (b'ARTIFACT_SHORT_STREAM' in argv or b'D3_CHUNK_RECOVERY_' in argv)
   if not exact:
    facts['noncandidateProcesses']+=1
    # Root policy gates still inspect every UID1000 fd tree. Ordinary readers
    # may only classify a noncandidate after its complete argv was readable.
    if not root_view:continue
   opened=False
   for f in (process/'fd').iterdir():
    try:opened=opened or os.readlink(f).startswith(str(target)+'/')
    except (FileNotFoundError,ProcessLookupError):continue
   need(not exact and not opened,'D3_CHUNK_RECOVERY_OTHER_CONSUMER_PRESENT')
  except FileNotFoundError:continue
  except ProcessLookupError:continue
  except PermissionError:raise ValueError('D3_CHUNK_RECOVERY_CONSUMER_STATE_UNREADABLE')
 return facts


def recovery_ready_bytes(path,mate,uid,gid,durable=False):
 canonical(path);fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  z=os.fstat(fd);paired=os.path.lexists(mate)
  need(stat.S_ISREG(z.st_mode) and z.st_uid==uid and z.st_gid==gid and stat.S_IMODE(z.st_mode)==0o600
       and z.st_size<=65536 and z.st_nlink==(2 if paired else 1), 'D3_CHUNK_RECOVERY_RECEIPT_METADATA_CHANGED')
  if paired:
   canonical(mate);need(identity(mate.lstat())==identity(z),'D3_CHUNK_RECOVERY_RECEIPT_LINK_CHANGED')
  raw=os.read(fd,65537)
  need(len(raw)==z.st_size and identity(os.fstat(fd))==identity(path.lstat())==identity(z),
       'D3_CHUNK_RECOVERY_RECEIPT_CHANGED')
  if durable:os.fsync(fd)
  return raw,identity(z)
 finally:os.close(fd)


def recovery_time(a):
 need(authority()==a and a['startsAt']<=int(time.time()*1000)<a['expiresAt'],
      'D3_CHUNK_RECOVERY_CURRENT_AUTHORITY_REQUIRED')


def recovery_open(a,exclusive=False,root_inspect=False):
 import fcntl
 r,target=recovery_scope(a,root_inspect)
 window=recovery_window(a,recovery_window_raw())['boundary'] or {'ready':None}
 uid,gid=(1000,1000) if root_inspect else (os.getuid(),os.getgid())
 names=tuple(sorted(p.name for p in target.iterdir()))
 need(names in WINDOW_LAYOUTS,'D3_CHUNK_RECOVERY_UNEXPECTED_TARGET_LAYOUT')
 part=target/'archive.part';final=target/'archive.bin'
 path=part if os.path.lexists(part) else final
 fd=os.open(path,(os.O_RDWR if context['action']=='recovery-append' and path==part and not root_inspect else os.O_RDONLY)|os.O_NOFOLLOW)
 try:
  fcntl.flock(fd,(fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)|fcntl.LOCK_NB)
  s=os.fstat(fd)
  need(stat.S_ISREG(s.st_mode) and s.st_uid==uid and s.st_gid==gid and stat.S_IMODE(s.st_mode)==0o600
       and [s.st_dev,s.st_ino]==r['initialFileIdentity'][:2],
       'D3_CHUNK_RECOVERY_ORIGINAL_INODE_REQUIRED')
  exists=[q for q in (part,final) if os.path.lexists(q)]
  need(s.st_nlink==len(exists) and len(exists) in (1,2)
       and all(identity(q.lstat())==identity(s) and not q.is_symlink() for q in exists),
       'D3_CHUNK_RECOVERY_PROMOTION_INODE_CHANGED')
  boundaries={r['initialFileIdentity'][2]:r['initialPrefixSha256']}
  boundaries.update({x['offset']+x['bytes']:x['prefixAfterSha256'] for x in r['segments']})
  need(s.st_size in boundaries,'D3_CHUNK_RECOVERY_UNALIGNED_PARTIAL_STOP')
  if os.path.lexists(final):need(s.st_size==r['archiveBytes'],'D3_CHUNK_RECOVERY_PARTIAL_FINAL_REFUSED')
  if s.st_size==r['initialFileIdentity'][2]:
   # Promoting a single-segment fragment changes ctime through link/unlink.
   # A still-unpublished archive.part must retain its full initial identity.
   pinned_fields=4 if 'archive.bin' in names else 5
   need(identity(s)[:pinned_fields]==r['initialFileIdentity'][:pinned_fields],
        'D3_CHUNK_RECOVERY_INITIAL_FILE_IDENTITY_CHANGED')
  temp=target/'ready.tmp';ready=target/'ready.json'
  record=None;proof=None
  if 'ready.tmp' in names or 'ready.json' in names:
   record,proof=recovery_ready_record(r,s,temp,ready,uid,gid,window)
  h=hashlib.sha256();os.lseek(fd,0,os.SEEK_SET)
  while True:
   block=os.read(fd,262144)
   if not block:break
   h.update(block)
  need(identity(s)==identity(os.fstat(fd)) and all(identity(q.lstat())==identity(s) for q in exists)
       and tuple(sorted(p.name for p in target.iterdir()))==names and h.hexdigest()==boundaries[s.st_size],
       'D3_CHUNK_RECOVERY_EXACT_PREFIX_REQUIRED')
  next_segment=next((x['segment'] for x in r['segments'] if x['offset']==s.st_size),None)
  out={'status':'EXACT_PREFIX_READBACK_ONLY','artifactKey':r['artifactKey'],
       'bytes':s.st_size,'prefixSha256':h.hexdigest(),'nextSegment':next_segment,
       'fileIdentity':identity(s),'originalAuthoritySha256':r['originalStageAuthoritySha256'],
       'recoveryAuthoritySha256':context['authoritySha256'],
       'originalBindingSha256':r['originalBindingSha256'],'layout':list(names),'ready':proof}
  if 'ready.json' in names:
   out['status']='READY_PENDING_TEMP_CLEANUP' if 'ready.tmp' in names else 'READY'
   out['receipt']=json.loads(record)
  elif next_segment is None:out['status']='FULL_FRAGMENT_AWAITING_FINALIZE'
  return fd,r,target,out
 except BaseException:
  os.close(fd);raise


def recovery_action(a):
 action=context['action']
 if action=='recovery-status':
  if not existing_leaf(original_target(a)):return absent_snapshot(a)
  fd,r,target,out=recovery_open(a,True,root_inspect=False)
  try:
   out['consumerCheck']=recovery_no_other_writers(target)
   return out
  finally:os.close(fd)
 if action=='recovery-append':
  if not existing_leaf(original_target(a)):return start_first_segment(a)
  r,target=recovery_scope(a);segment=context['segment']
  need(type(segment) is int and 1<=segment<=len(r['segments']),'D3_CHUNK_RECOVERY_FIXED_SEGMENT_REQUIRED')
  row=r['segments'][segment-1]
  # The existing part inode is exclusively locked before buffering stdin.
  # This makes a receiver visible while it is waiting for its finite segment.
  fd,r,target,out=recovery_open(a,True)
  try:
   need(out['status']=='EXACT_PREFIX_READBACK_ONLY' and out['bytes']==row['offset']
        and out['nextSegment']==segment,'D3_CHUNK_RECOVERY_READ_ORIGINAL_STATE_NO_REPLAY')
   need(recovery_snapshot(out)==context['before'],'D3_CHUNK_RECOVERY_PRE_APPEND_STATE_CHANGED')
   before_buffer=recovery_no_other_writers(target);recovery_time(a)
   before=identity(os.fstat(fd))
   raw=sys.stdin.buffer.read(row['bytes']+1)
   if len(raw)<row['bytes']:
    need(identity(os.fstat(fd))==before==identity((target/'archive.part').lstat()),
         'D3_CHUNK_RECOVERY_PREFIX_CHANGED_WHILE_BUFFERING')
    return {'status':'D3_CHUNK_RECOVERY_SHORT_READ_NO_WRITE','segment':segment,
            'receivedBytes':len(raw),'before':recovery_snapshot(out),
            'recoveryAuthoritySha256':context['authoritySha256'],
            'consumerCheck':recovery_no_other_writers(target)}
   need(len(raw)==row['bytes'] and hashlib.sha256(raw).hexdigest()==row['sha256'],
        'D3_CHUNK_RECOVERY_COMPLETE_SEGMENT_REQUIRED')
   need(identity(os.fstat(fd))==before==identity((target/'archive.part').lstat()),
        'D3_CHUNK_RECOVERY_PREFIX_CHANGED_WHILE_BUFFERING')
   before_write=recovery_no_other_writers(target);recovery_time(a)
   os.lseek(fd,0,os.SEEK_END);left=memoryview(raw)
   while left:
    written=os.write(fd,left);need(written>0,'D3_CHUNK_RECOVERY_APPEND_OUTCOME_UNKNOWN');left=left[written:]
   os.fsync(fd)
   need(os.fstat(fd).st_size==row['offset']+row['bytes'],'D3_CHUNK_RECOVERY_APPEND_OUTCOME_UNKNOWN')
   os.lseek(fd,0,os.SEEK_SET);h=hashlib.sha256()
   while True:
    block=os.read(fd,262144)
    if not block:break
    h.update(block)
   need(h.hexdigest()==row['prefixAfterSha256'],'D3_CHUNK_RECOVERY_APPEND_OUTCOME_UNKNOWN')
   return {'status':'EXACT_SEGMENT_DURABLE','segment':segment,'bytes':os.fstat(fd).st_size,
           'prefixSha256':h.hexdigest(),'originalAuthoritySha256':r['originalStageAuthoritySha256'],
           'recoveryAuthoritySha256':context['authoritySha256'],
           'beforeBufferConsumerCheck':before_buffer,'beforeWriteConsumerCheck':before_write}
  finally:os.close(fd)
 need(action=='recovery-finalize','D3_CHUNK_RECOVERY_ACTION_REFUSED')
 fd,r,target,out=recovery_open(a,True)
 try:
  if out['status']=='READY':return out
  need(recovery_snapshot(out)==context['before'],'D3_CHUNK_RECOVERY_PRE_FINALIZE_STATE_CHANGED')
  need(out['bytes']==r['archiveBytes'] and out['prefixSha256']==r['archiveSha256'],
       'D3_CHUNK_RECOVERY_FULL_ARCHIVE_REQUIRED')
  consumer_check=recovery_no_other_writers(target)
  checked={'fragmentIndex':r['fragmentIndex'],'fragmentOffset':r['fragmentOffset'],
           'archiveBytes':out['bytes'],'archiveSha256':out['prefixSha256']}
  part=target/'archive.part';final=target/'archive.bin'
  recovery_time(a)
  if not os.path.lexists(final):os.link(part,final,follow_symlinks=False);syncdir(target)
  if os.path.lexists(part):
   need(identity(part.lstat())==identity(final.lstat()) and part.lstat().st_nlink==2,
        'D3_CHUNK_RECOVERY_PROMOTION_INODE_CHANGED')
   recovery_time(a);os.unlink(part);syncdir(target)
  s=final.lstat();need(s.st_nlink==1 and [s.st_dev,s.st_ino]==r['initialFileIdentity'][:2],
                       'D3_CHUNK_RECOVERY_FINAL_INODE_CHANGED')
  temp=target/'ready.tmp';ready=target/'ready.json'
  if out['ready'] is not None:
   window=recovery_window(a,recovery_window_raw())['boundary'] or {'ready':None}
   raw,proof=recovery_ready_record(r,s,temp,ready,os.getuid(),os.getgid(),window)
   need(proof==out['ready'],'D3_CHUNK_RECOVERY_READY_BEFORE_PUBLICATION_CHANGED')
   receipt=json.loads(raw)
  else:
   need(not os.path.lexists(temp) and not os.path.lexists(ready),'D3_CHUNK_RECOVERY_UNEXPECTED_READY_LEAF')
   receipt=recovery_receipt(r,s,context['authoritySha256'])
   raw=json.dumps(receipt,sort_keys=True).encode()
  recovery_time(a)
  if os.path.lexists(ready):
   need(recovery_ready_bytes(ready,temp,os.getuid(),os.getgid(),durable=True)[0]==raw and os.path.lexists(temp),
        'D3_CHUNK_RECOVERY_READY_CHANGED')
   syncdir(target);recovery_time(a)
   os.unlink(temp);syncdir(target)
   return {'status':'READY','receipt':receipt,'wholeFragmentReadback':checked,'consumerCheck':consumer_check}
  if os.path.lexists(temp):need(recovery_ready_bytes(temp,ready,os.getuid(),os.getgid(),durable=True)[0]==raw,
                              'D3_CHUNK_RECOVERY_READY_TEMP_CHANGED')
  else:new_file(temp,raw)
  recovery_time(a)
  os.link(temp,ready,follow_symlinks=False);syncdir(target)
  recovery_time(a);os.unlink(temp);syncdir(target)
  return {'status':'READY','receipt':receipt,'wholeFragmentReadback':checked,'consumerCheck':consumer_check}
 finally:os.close(fd)


def recovery_scope(a,root_inspect=False):
 window=recovery_window(a,recovery_window_raw())
 target=original_target(a,root_inspect)
 uid,gid=(1000,1000) if root_inspect else (os.getuid(),os.getgid())
 private_directory(target,uid,gid)
 p=target/'binding.json'
 st=p.lstat()
 binding=read_regular(p,65536)
 need(stat.S_ISREG(st.st_mode) and (st.st_uid,st.st_gid)==(uid,gid) and stat.S_IMODE(st.st_mode)==0o600
      and identity(p.lstat())==identity(st),'D3_CHUNK_RECOVERY_ORIGINAL_BINDING_METADATA_CHANGED')
 b=json.loads(binding)
 need(type(b) is dict and set(b)=={'authoritySha256','authority','planSha256','firstFileIdentity'} and
      digest(b['authoritySha256']) and b['planSha256']==plan_sha(window['segments']) and
      all(b['authority'][k]==a[k] for k in (*FRAGMENT_FIELDS,'targetDirectory')) and
      file_identity(b['firstFileIdentity']) and b['firstFileIdentity'][2]==window['segments'][0]['bytes'],
      'D3_CHUNK_RECOVERY_ORIGINAL_FRAGMENT_CHANGED')
 chunk_authority(b['authority'],ORIGINAL_CONTROL+'/grant-'+ORIGINAL_GRANT,ORIGINAL_GRANT)
 h=hashlib.sha256(binding).hexdigest(); baseline=window['boundary']
 if baseline is None:
  need(b['authoritySha256']==context['authoritySha256'] and b['authority']==a,
       'D3_CHUNK_FIRST_WINDOW_ORIGINAL_BINDING_DIFFERS')
 else:
  need(baseline['originalBindingSha256']==h and baseline['fileIdentity'][:2]==b['firstFileIdentity'][:2] and
       b['authoritySha256']!=context['authoritySha256'],'D3_CHUNK_RECOVERY_ORIGINAL_BINDING_CHANGED')
 r={k:a[k] for k in FRAGMENT_FIELDS}
 r.update(originalStageAuthoritySha256=b['authoritySha256'],originalBindingSha256=h,
          initialFileIdentity=b['firstFileIdentity'],initialPrefixSha256=window['segments'][0]['prefixAfterSha256'],
          segments=window['segments'])
 return r,target


def start_first_segment(a):
 target=original_target(a)
 start=absent_snapshot(a)
 need(type(context['segment']) is int and context['segment']==1 and recovery_snapshot(start)==context['before'],
      'D3_CHUNK_EXACT_FIRST_SEGMENT_REQUIRED')
 window=recovery_window(a,recovery_window_raw()); row=window['segments'][0]
 recovery_time(a)
 raw=sys.stdin.buffer.read(row['bytes']+1)
 if len(raw)<row['bytes']:
  final=absent_snapshot(a)
  return {'status':'D3_CHUNK_RECOVERY_SHORT_READ_NO_WRITE','segment':1,'receivedBytes':len(raw),
          'before':recovery_snapshot(final),'recoveryAuthoritySha256':context['authoritySha256'],
          'consumerCheck':final['consumerCheck']}
 need(len(raw)==row['bytes'] and hashlib.sha256(raw).hexdigest()==row['sha256'],
      'D3_CHUNK_RECOVERY_COMPLETE_SEGMENT_REQUIRED')
 final=absent_snapshot(a);recovery_time(a)
 target.mkdir(mode=0o700)
 syncdir(target.parent)
 recovery_time(a)
 part=target/'archive.part';new_file(part,raw)
 first=identity(part.lstat())
 need(first[2]==row['bytes'] and hashlib.sha256(read_regular(part,row['bytes'])).hexdigest()==row['sha256'],
      'D3_CHUNK_FIRST_SEGMENT_OUTCOME_UNKNOWN')
 recovery_time(a)
 binding={'authoritySha256':context['authoritySha256'],'authority':a,
          'planSha256':plan_sha(window['segments']),'firstFileIdentity':first}
 new_file(target/'binding.json',json.dumps(binding,sort_keys=True,separators=(',',':')).encode())
 syncdir(target)
 return {'status':'EXACT_SEGMENT_DURABLE','segment':1,'bytes':first[2],
         'prefixSha256':row['prefixAfterSha256'],'fileIdentity':first,
         'originalAuthoritySha256':context['authoritySha256'],
         'recoveryAuthoritySha256':context['authoritySha256'],
         'beforeWriteConsumerCheck':final['consumerCheck']}


def recovery_ready_record(r,s,temp,ready,uid,gid,window):
 path,mate=(temp,ready) if os.path.lexists(temp) else (ready,temp)
 raw,leaf=recovery_ready_bytes(path,mate,uid,gid)
 row=json.loads(raw)
 need(type(row) is dict and type(row.get('authoritySha256')) is str,'D3_CHUNK_RECOVERY_READY_SHAPE_REFUSED')
 digest=row['authoritySha256']
 proof={'sha256':hashlib.sha256(raw).hexdigest(),'authoritySha256':digest,'fileIdentity':leaf}
 prior=window['ready']
 old_bound=(type(prior) is dict and prior.get('sha256')==proof['sha256'] and
            prior.get('authoritySha256')==digest and prior.get('fileIdentity',[])[:2]==leaf[:2])
 need((digest==context['authoritySha256'] or old_bound) and row==recovery_receipt(r,s,digest),
      'D3_CHUNK_RECOVERY_READY_AUTHORITY_OR_IDENTITY_CHANGED')
 return raw,proof


def recovery_receipt(r,s,digest):
 # Preserve the current private assembler's READY schema. The original and
 # recovery authority digests are also returned separately by recovery_open.
 return {'status':'READY','artifactKey':r['artifactKey'],'archiveSha256':r['archiveSha256'],
         'archiveBytes':r['archiveBytes'],'manifestSha256':r['manifestSha256'],
         'authoritySha256':digest,'fileIdentity':identity(s),
         'fragmentIndex':r['fragmentIndex'],'fragmentOffset':r['fragmentOffset']}


def recovery_readonly_authority():
 p=Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/artifact-staging-authorization.json')
 try:p.lstat()
 except FileNotFoundError:pass
 else:
  return authority(),'CURRENT_RECOVERY_ROOT_POLICY'
 import base64
 original=base64.b64decode(context['recoveryAuthorityRawBase64'],validate=True)
 a=json.loads(original)
 need(len(original)<=65536 and hashlib.sha256(original).hexdigest()==context['authoritySha256']
      and a==context['authority'],'D3_CHUNK_RECOVERY_STATUS_EXACT_EXTERNAL_BYTES_REQUIRED')
 chunk_authority(a,context['control'],context['grantId'])
 return a,'EXACT_WITHDRAWN_POLICY_READONLY'


def main():
 need(sys.platform=='linux' and os.getuid()==os.geteuid()==1000,'D3_CHUNK_RECOVERY_EXACT_RECEIVER_UID_REQUIRED')
 if context['action']=='recovery-status':
  a,basis=recovery_readonly_authority()
  result=recovery_action(a)
  result['statusAuthorityBasis']=basis
  return result
 need(context['action'] in ('recovery-append','recovery-finalize'),'D3_CHUNK_RECOVERY_ACTION_REFUSED')
 return recovery_action(authority())


if __name__=='__main__':
 try:print(json.dumps(main()))
 except (OSError,ValueError,KeyError,TypeError) as error:
  print(json.dumps({'status':'STOP_OR_UNKNOWN_NO_REPLAY',
                    'errorCode':str(error) if isinstance(error,ValueError) else type(error).__name__}))
  sys.exit(2)
