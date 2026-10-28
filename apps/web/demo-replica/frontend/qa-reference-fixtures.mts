/** Local QA display data only. Public dictionary labels/order: frozen Demo
 * frontend/product-catalog.js, product-size-groups.mjs, barcode-2026.js,
 * legacy-adapter.mjs and model.js. Colors(182)/categories(50) use only
 * name/code/parent/order/enabled from credential-free GET
 * 127.0.0.1:8878/reference/{colors,categories} on 2026-10-27. Native IDs
 * remapped to QA UUIDs; category codes/status remain QA metadata because the
 * current category UI DTO has neither. No database/browser storage read.
 * People/accounts and all IDs/barcodes/quantities/prices below are isolated QA
 * examples, not migrated business facts. No authentication material. */
export const QA_REFERENCE_PROFILE='demo-reference-v1' as const;
export type QaReferenceProfile=typeof QA_REFERENCE_PROFILE;
export const qaId=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const base={version:1,createdAt:null,updatedAt:null};
const groupDefs=[
 ['UPPER','男装上衣尺码',['160/XS','165/S','170/M','175/L','180/XL','185/2XL','190/3XL','195/4XL','200/5XL','205/6XL','无尺码']],
 ['PANTS','男装裤子尺码',['29','30','31','32','33','34','35','36','38','40','无尺码']],
 ['WOMEN','女装尺码组',['150/XS','155/S','160/M','165/L','170/XL','175/2XL','180/3XL','185/4XL','190/5XL','195/6XL','无尺码']],
 ['SHOES','鞋码',['38','39','40','41','42','43','44']],['KIDS','童装尺码',['90','100','110','120','130','140']],['FREE','配饰均码',['无尺码','均码']],
] as const;
export const qaGroups=groupDefs.map(([key,name,names],g)=>({id:qaId(100+g),key,name,sizes:names.map((name,i)=>({id:qaId(1000+g*100+i),name,displayOrder:i,code:g<3?name==='无尺码'?'900':String([201,901,251][g]!+i):''}))}));
export const qaColors=[
 {
  "id": "00000000-0000-4000-8000-000000020000",
  "code": "001",
  "name": "A",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020001",
  "code": "002",
  "name": "B",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020002",
  "code": "003",
  "name": "C",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020003",
  "code": "004",
  "name": "D",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020004",
  "code": "515",
  "name": "上青色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020005",
  "code": "0",
  "name": "不分色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020006",
  "code": "259",
  "name": "中咖色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020007",
  "code": "811",
  "name": "中灰色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020008",
  "code": "530",
  "name": "中灰蓝",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020009",
  "code": "510",
  "name": "中蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020010",
  "code": "707",
  "name": "乌墨色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020011",
  "code": "706",
  "name": "乌色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020012",
  "code": "508",
  "name": "乌蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020013",
  "code": "703",
  "name": "乌黑色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020014",
  "code": "519",
  "name": "云彩蓝",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020015",
  "code": "305",
  "name": "军绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020016",
  "code": "623",
  "name": "卡其绿",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020017",
  "code": "621",
  "name": "卡其色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020018",
  "code": "251",
  "name": "咖啡色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020019",
  "code": "823",
  "name": "咖绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020020",
  "code": "262",
  "name": "咖色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020021",
  "code": "256",
  "name": "咖驼色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020022",
  "code": "309",
  "name": "咸菜绿",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020023",
  "code": "514",
  "name": "哈青色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020024",
  "code": "202",
  "name": "土黄色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020025",
  "code": "321",
  "name": "墨玉绿",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020026",
  "code": "304",
  "name": "墨绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020027",
  "code": "526",
  "name": "墨蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020028",
  "code": "529",
  "name": "夜蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020029",
  "code": "112",
  "name": "大红色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020030",
  "code": "505",
  "name": "天蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020031",
  "code": "905",
  "name": "太空灰",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020032",
  "code": "317",
  "name": "太空绿",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020033",
  "code": "528",
  "name": "好运蓝",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020034",
  "code": "204",
  "name": "姜黄色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020035",
  "code": "837",
  "name": "宝石绿",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020036",
  "code": "502",
  "name": "宝蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020037",
  "code": "535",
  "name": "彩蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020038",
  "code": "838",
  "name": "抹茶绿",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020039",
  "code": "224",
  "name": "暖黄色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020040",
  "code": "134",
  "name": "暗粉色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020041",
  "code": "318",
  "name": "暗绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020042",
  "code": "509",
  "name": "暗蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020043",
  "code": "722",
  "name": "本白色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020044",
  "code": "805",
  "name": "杏灰色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020045",
  "code": "111",
  "name": "杏红色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020046",
  "code": "161",
  "name": "杏色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020047",
  "code": "522",
  "name": "松木蓝",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020048",
  "code": "313",
  "name": "松绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020049",
  "code": "531",
  "name": "松花蓝",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020050",
  "code": "307",
  "name": "果绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020051",
  "code": "117",
  "name": "枣红色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020052",
  "code": "106",
  "name": "桔红色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020053",
  "code": "220",
  "name": "桔黄色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020054",
  "code": "273",
  "name": "棕红色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020055",
  "code": "271",
  "name": "棕绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020056",
  "code": "270",
  "name": "棕色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020057",
  "code": "272",
  "name": "棕黑色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020058",
  "code": "323",
  "name": "橄榄绿",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020059",
  "code": "110",
  "name": "橙红色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020060",
  "code": "221",
  "name": "橙色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020061",
  "code": "115",
  "name": "橡皮红",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020062",
  "code": "208",
  "name": "泥黄色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020063",
  "code": "624",
  "name": "浅卡其",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020064",
  "code": "252",
  "name": "浅咖色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020065",
  "code": "225",
  "name": "浅棕黄",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020066",
  "code": "222",
  "name": "浅橙色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020067",
  "code": "802",
  "name": "浅灰色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020068",
  "code": "132",
  "name": "浅粉色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020069",
  "code": "402",
  "name": "浅紫色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020070",
  "code": "103",
  "name": "浅红色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020071",
  "code": "302",
  "name": "浅绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020072",
  "code": "503",
  "name": "浅蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020073",
  "code": "205",
  "name": "浅黄色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020074",
  "code": "536",
  "name": "海蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020075",
  "code": "819",
  "name": "深卡其",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020076",
  "code": "253",
  "name": "深咖色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020077",
  "code": "223",
  "name": "深橙色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020078",
  "code": "319",
  "name": "深灰绿",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020079",
  "code": "803",
  "name": "深灰色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020080",
  "code": "517",
  "name": "深灰蓝",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020081",
  "code": "820",
  "name": "深烟灰",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020082",
  "code": "133",
  "name": "深粉色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020083",
  "code": "403",
  "name": "深紫色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020084",
  "code": "118",
  "name": "深红色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020085",
  "code": "322",
  "name": "深绿灰",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020086",
  "code": "303",
  "name": "深绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020087",
  "code": "504",
  "name": "深蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020088",
  "code": "520",
  "name": "深藏青",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020089",
  "code": "206",
  "name": "深黄色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020090",
  "code": "704",
  "name": "深黑色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020091",
  "code": "314",
  "name": "湖绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020092",
  "code": "513",
  "name": "湖蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020093",
  "code": "705",
  "name": "漆黑色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020094",
  "code": "622",
  "name": "灰卡其",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020095",
  "code": "260",
  "name": "灰咖色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020096",
  "code": "274",
  "name": "灰棕色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020097",
  "code": "901",
  "name": "灰紫色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020098",
  "code": "308",
  "name": "灰绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020099",
  "code": "801",
  "name": "灰色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020100",
  "code": "812",
  "name": "灰蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020101",
  "code": "119",
  "name": "灼红色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020102",
  "code": "261",
  "name": "烟咖色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020103",
  "code": "825",
  "name": "烟灰色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020104",
  "code": "258",
  "name": "焦糖色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020105",
  "code": "533",
  "name": "牛仔蓝",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020106",
  "code": "107",
  "name": "玫红色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020107",
  "code": "721",
  "name": "白色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020108",
  "code": "120",
  "name": "砖红色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020109",
  "code": "807",
  "name": "碳灰色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020110",
  "code": "809",
  "name": "米灰色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020111",
  "code": "724",
  "name": "米白色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020112",
  "code": "210",
  "name": "米红色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020113",
  "code": "725",
  "name": "米色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020114",
  "code": "203",
  "name": "米黄色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020115",
  "code": "254",
  "name": "粉咖色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020116",
  "code": "404",
  "name": "粉紫色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020117",
  "code": "102",
  "name": "粉红色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020118",
  "code": "131",
  "name": "粉色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020119",
  "code": "104",
  "name": "紫红色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020120",
  "code": "401",
  "name": "紫色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020121",
  "code": "521",
  "name": "紫蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020122",
  "code": "702",
  "name": "紫黑色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020123",
  "code": "255",
  "name": "红咖色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020124",
  "code": "101",
  "name": "红色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020125",
  "code": "810",
  "name": "纯灰色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020126",
  "code": "000",
  "name": "统色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020127",
  "code": "816",
  "name": "绿灰色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020128",
  "code": "301",
  "name": "绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020129",
  "code": "407",
  "name": "翠绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020130",
  "code": "207",
  "name": "芥黄色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020131",
  "code": "808",
  "name": "花灰色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020132",
  "code": "518",
  "name": "花篮色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020133",
  "code": "316",
  "name": "花绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020134",
  "code": "257",
  "name": "花驼色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020135",
  "code": "324",
  "name": "苔绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020136",
  "code": "320",
  "name": "茶油绿",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020137",
  "code": "906",
  "name": "茶绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020138",
  "code": "311",
  "name": "草绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020139",
  "code": "511",
  "name": "蓝灰色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020140",
  "code": "306",
  "name": "蓝绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020141",
  "code": "501",
  "name": "蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020142",
  "code": "813",
  "name": "蓝铁灰",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020143",
  "code": "507",
  "name": "藏蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020144",
  "code": "506",
  "name": "藏青色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020145",
  "code": "525",
  "name": "蟹青色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020146",
  "code": "109",
  "name": "西瓜红",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020147",
  "code": "113",
  "name": "豆沙红",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020148",
  "code": "818",
  "name": "豆沙色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020149",
  "code": "312",
  "name": "豆绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020150",
  "code": "822",
  "name": "迷彩色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020151",
  "code": "116",
  "name": "酒红色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020152",
  "code": "263",
  "name": "酱咖色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020153",
  "code": "405",
  "name": "酱紫色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020154",
  "code": "209",
  "name": "金色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020155",
  "code": "537",
  "name": "铁灰色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020156",
  "code": "108",
  "name": "铁锈红",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020157",
  "code": "806",
  "name": "银灰色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020158",
  "code": "723",
  "name": "银色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020159",
  "code": "512",
  "name": "雾霾蓝",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020160",
  "code": "524",
  "name": "青夹蓝",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020161",
  "code": "325",
  "name": "青灰绿",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020162",
  "code": "814",
  "name": "青灰色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020163",
  "code": "315",
  "name": "青绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020164",
  "code": "532",
  "name": "青花蓝",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020165",
  "code": "406",
  "name": "青莲色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020166",
  "code": "516",
  "name": "青蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020167",
  "code": "114",
  "name": "靓红色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020168",
  "code": "534",
  "name": "靛蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020169",
  "code": "601",
  "name": "驼色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020170",
  "code": "527",
  "name": "麦蓝色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020171",
  "code": "815",
  "name": "麻灰色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020172",
  "code": "275",
  "name": "黄咖色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020173",
  "code": "310",
  "name": "黄绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020174",
  "code": "201",
  "name": "黄色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020175",
  "code": "264",
  "name": "黑咖色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020176",
  "code": "709",
  "name": "黑湖蓝",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020177",
  "code": "804",
  "name": "黑灰色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020178",
  "code": "105",
  "name": "黑红色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020179",
  "code": "821",
  "name": "黑绿色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020180",
  "code": "701",
  "name": "黑色",
  "enabled": true,
  "version": 1
 },
 {
  "id": "00000000-0000-4000-8000-000000020181",
  "code": "708",
  "name": "黑蓝色",
  "enabled": true,
  "version": 1
 }
];
export const qaFits=[['Y','修身'],['A','标准'],['B','宽松'],['C','加肥'],['D','加肥加大'],['E','特体']].map(([code,name],i)=>({id:qaId(2100+i),code:code!,name:`${code}版（${name}）`,enabled:true,version:1}));
export const qaSeasons=['春季','夏季','秋季','冬季','春夏','秋冬'].map((name,i)=>({id:qaId(2200+i),name}));
export const qaCategories=[
 {
  "id": "00000000-0000-4000-8000-000000002300",
  "parentId": "00000000-0000-4000-8000-000000002329",
  "name": "PU服装",
  "displayOrder": 0,
  "referenceCode": "cat-10-1",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002301",
  "parentId": null,
  "name": "T恤",
  "displayOrder": 1,
  "referenceCode": "cat-0",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002302",
  "parentId": null,
  "name": "中裤",
  "displayOrder": 2,
  "referenceCode": "cat-14",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002303",
  "parentId": "00000000-0000-4000-8000-000000002345",
  "name": "休闲裤",
  "displayOrder": 3,
  "referenceCode": "cat-12-0",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002304",
  "parentId": null,
  "name": "保暖服装",
  "displayOrder": 4,
  "referenceCode": "cat-9",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002305",
  "parentId": null,
  "name": "内着",
  "displayOrder": 5,
  "referenceCode": "cat-15",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002306",
  "parentId": "00000000-0000-4000-8000-000000002305",
  "name": "内衣",
  "displayOrder": 6,
  "referenceCode": "cat-15-0",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002307",
  "parentId": "00000000-0000-4000-8000-000000002305",
  "name": "内裤",
  "displayOrder": 7,
  "referenceCode": "cat-15-1",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002308",
  "parentId": "00000000-0000-4000-8000-000000002339",
  "name": "单西",
  "displayOrder": 8,
  "referenceCode": "cat-8-1",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002309",
  "parentId": null,
  "name": "卫衣",
  "displayOrder": 9,
  "referenceCode": "cat-2",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002310",
  "parentId": "00000000-0000-4000-8000-000000002324",
  "name": "吊面毛皮服装",
  "displayOrder": 10,
  "referenceCode": "cat-11-0",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002311",
  "parentId": "00000000-0000-4000-8000-000000002342",
  "name": "围巾",
  "displayOrder": 11,
  "referenceCode": "cat-16-1",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002312",
  "parentId": "00000000-0000-4000-8000-000000002345",
  "name": "大版裤",
  "displayOrder": 12,
  "referenceCode": "cat-12-2",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002313",
  "parentId": null,
  "name": "大衣",
  "displayOrder": 13,
  "referenceCode": "cat-7",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002314",
  "parentId": "00000000-0000-4000-8000-000000002313",
  "name": "大衣",
  "displayOrder": 14,
  "referenceCode": "cat-7-0",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002315",
  "parentId": "00000000-0000-4000-8000-000000002316",
  "name": "夹克",
  "displayOrder": 15,
  "referenceCode": "cat-4-0",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002316",
  "parentId": null,
  "name": "夹克",
  "displayOrder": 16,
  "referenceCode": "cat-4",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002317",
  "parentId": "00000000-0000-4000-8000-000000002339",
  "name": "套西",
  "displayOrder": 17,
  "referenceCode": "cat-8-0",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002318",
  "parentId": "00000000-0000-4000-8000-000000002324",
  "name": "尼克服",
  "displayOrder": 18,
  "referenceCode": "cat-11-1",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002319",
  "parentId": "00000000-0000-4000-8000-000000002345",
  "name": "松紧裤",
  "displayOrder": 19,
  "referenceCode": "cat-12-3",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002320",
  "parentId": "00000000-0000-4000-8000-000000002304",
  "name": "棉服",
  "displayOrder": 20,
  "referenceCode": "cat-9-0",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002321",
  "parentId": "00000000-0000-4000-8000-000000002313",
  "name": "毛呢大衣",
  "displayOrder": 21,
  "referenceCode": "cat-7-1",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002322",
  "parentId": "00000000-0000-4000-8000-000000002316",
  "name": "毛呢夹克",
  "displayOrder": 22,
  "referenceCode": "cat-4-1",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002323",
  "parentId": "00000000-0000-4000-8000-000000002326",
  "name": "毛呢派克",
  "displayOrder": 23,
  "referenceCode": "cat-6-1",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002324",
  "parentId": null,
  "name": "毛皮服装",
  "displayOrder": 24,
  "referenceCode": "cat-11",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002325",
  "parentId": null,
  "name": "毛衫",
  "displayOrder": 25,
  "referenceCode": "cat-3",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002326",
  "parentId": null,
  "name": "派克",
  "displayOrder": 26,
  "referenceCode": "cat-6",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002327",
  "parentId": "00000000-0000-4000-8000-000000002326",
  "name": "派克",
  "displayOrder": 27,
  "referenceCode": "cat-6-0",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002328",
  "parentId": "00000000-0000-4000-8000-000000002345",
  "name": "牛仔裤",
  "displayOrder": 28,
  "referenceCode": "cat-12-1",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002329",
  "parentId": null,
  "name": "皮革服装",
  "displayOrder": 29,
  "referenceCode": "cat-10",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002330",
  "parentId": "00000000-0000-4000-8000-000000002329",
  "name": "真皮皮衣",
  "displayOrder": 30,
  "referenceCode": "cat-10-0",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002331",
  "parentId": "00000000-0000-4000-8000-000000002301",
  "name": "短袖T恤",
  "displayOrder": 31,
  "referenceCode": "cat-0-1",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002332",
  "parentId": "00000000-0000-4000-8000-000000002337",
  "name": "短袖衬衫",
  "displayOrder": 32,
  "referenceCode": "cat-1-1",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002333",
  "parentId": null,
  "name": "短裤",
  "displayOrder": 33,
  "referenceCode": "cat-13",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002334",
  "parentId": "00000000-0000-4000-8000-000000002349",
  "name": "羊毛风衣",
  "displayOrder": 34,
  "referenceCode": "cat-5-1",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002335",
  "parentId": "00000000-0000-4000-8000-000000002304",
  "name": "羽绒服",
  "displayOrder": 35,
  "referenceCode": "cat-9-1",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002336",
  "parentId": null,
  "name": "背心",
  "displayOrder": 36,
  "referenceCode": "cat-22",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002337",
  "parentId": null,
  "name": "衬衫",
  "displayOrder": 37,
  "referenceCode": "cat-1",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002338",
  "parentId": "00000000-0000-4000-8000-000000002305",
  "name": "袜子",
  "displayOrder": 38,
  "referenceCode": "cat-15-2",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002339",
  "parentId": null,
  "name": "西服",
  "displayOrder": 39,
  "referenceCode": "cat-8",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002340",
  "parentId": "00000000-0000-4000-8000-000000002339",
  "name": "西裤",
  "displayOrder": 40,
  "referenceCode": "cat-8-2",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002341",
  "parentId": null,
  "name": "辅料及其他",
  "displayOrder": 41,
  "referenceCode": "cat-17",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002342",
  "parentId": null,
  "name": "配饰",
  "displayOrder": 42,
  "referenceCode": "cat-16",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002343",
  "parentId": "00000000-0000-4000-8000-000000002301",
  "name": "长袖T恤",
  "displayOrder": 43,
  "referenceCode": "cat-0-0",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002344",
  "parentId": "00000000-0000-4000-8000-000000002337",
  "name": "长袖衬衫",
  "displayOrder": 44,
  "referenceCode": "cat-1-0",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002345",
  "parentId": null,
  "name": "长裤",
  "displayOrder": 45,
  "referenceCode": "cat-12",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002346",
  "parentId": "00000000-0000-4000-8000-000000002304",
  "name": "防寒服",
  "displayOrder": 46,
  "referenceCode": "cat-9-2",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002347",
  "parentId": "00000000-0000-4000-8000-000000002342",
  "name": "领带",
  "displayOrder": 47,
  "referenceCode": "cat-16-0",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002348",
  "parentId": "00000000-0000-4000-8000-000000002349",
  "name": "风衣",
  "displayOrder": 48,
  "referenceCode": "cat-5-0",
  "enabled": true
 },
 {
  "id": "00000000-0000-4000-8000-000000002349",
  "parentId": null,
  "name": "风衣",
  "displayOrder": 49,
  "referenceCode": "cat-5",
  "enabled": true
 }
];
export const qaSchemes=[['2020','2020年新方案',14,'0 + 货号7位 + 颜色3位 + 尺码3位'],['2018','2018年货品',9,'8 + 自定义5位 + 颜色1位 + 尺码2位'],['2021','2021年条码方案',13,'6 + 货号7位 + 颜色3位 + 尺码2位'],['2021fit','2021年版型条码方案',14,'2 + 货号7位 + 版型1位 + 颜色3位 + 尺码2位'],['2023','2023年条码方案',14,'9 + 货号7位 + 颜色3位 + 尺码3位'],['2026','2026 条码方案',15,'5 + 版型1位 + 货号7位 + 颜色3位 + 尺码3位']].map(([key,name,codeLength,ruleDescription],i)=>({id:qaId(2400+i),key:String(key),name:String(name),barcodeType:'CODE128',ruleDescription:String(ruleDescription),codeLength:Number(codeLength),ruleVersion:String(key),status:'CURRENT' as const,applicability:null}));
export const qaCustomers=[{...base,id:qaId(3000),code:'DEMO-C01',name:'零售客户',enabled:true},{...base,id:qaId(3001),code:'DEMO-C02',name:'具名客户（演示）',enabled:true}];
export const qaSuppliers=['示例供应商 · 华成服饰','示例供应商 · 瑞丰制衣','示例供应商 · 远山贸易'].map((name,i)=>({...base,id:qaId(3100+i),code:'DEMO-GYS0'+(i+1),name,enabled:true}));
export const qaHalls=[{...base,id:qaId(3200),name:'网点营业厅',enabled:true,kind:'HALL' as const,defaultCustomer:{id:qaCustomers[0]!.id,name:qaCustomers[0]!.name,enabled:true},defaultSalesWarehouse:{id:qaId(3301),name:'网点仓',enabled:true,hallId:qaId(3200)}}];
export const qaWarehouses=['总仓','网点仓','温州仓','备货仓'].map((name,i)=>({...base,id:qaId(3300+i),name,enabled:true,kind:'WAREHOUSE' as const,hall:{id:qaHalls[0]!.id,name:qaHalls[0]!.name,enabled:true}}));
export const qaMethods=['现金','银行转账','微信','支付宝','其它'].map((name,i)=>({...base,id:qaId(3400+i),code:'DEMO-P0'+(i+1),name,enabled:true,kind:'PAYMENT_METHOD' as const}));
export const qaPaymentAccounts=qaMethods.map((m,i)=>({...base,id:qaId(3500+i),name:m.name+'测试账户',enabled:true,kind:'PAYMENT_ACCOUNT' as const,paymentMethod:{id:m.id,name:m.name,enabled:true},halls:[{id:qaHalls[0]!.id,name:qaHalls[0]!.name,enabled:true}]}));
export const qaStaff=['测试管理员','测试仓库员','测试营业员甲','测试营业员乙'].map((name,i)=>({...base,id:qaId(3600+i),name,role:(['ADMIN','WAREHOUSE','SALESPERSON','SALESPERSON'] as const)[i]!,kind:'STAFF' as const,hall:i>=2?{id:qaHalls[0]!.id,name:qaHalls[0]!.name,enabled:true}:null,contact:null,employmentStatus:'在职' as const,account:{id:qaId(3700+i),loginName:'qa-demo-'+(i+1),loginEnabled:true,authVersion:1,version:1}}));
/** Declared QA account-creation event only; never an original employee timestamp. */
export const qaAccounts=qaStaff.map(s=>({...s.account,kind:'ACCOUNT' as const,createdAt:'2000-01-01T00:00:00Z',updatedAt:'2000-01-01T00:00:00Z',staff:{id:s.id,name:s.name,role:s.role,employmentStatus:s.employmentStatus,hallId:s.hall?.id??null}}));
export const qaPrincipal={accountId:qaAccounts[0]!.id,staffId:qaStaff[0]!.id,loginName:qaAccounts[0]!.loginName,role:'ADMIN' as const,hallId:null,authVersion:1};
const productDefs=[['M26001','商务免烫衬衫',0,3,'239.00'],['M26004','多色商务休闲裤',1,6,'299.00'],['QA-W01','女装尺码测试',2,3,'219.00'],['QA-S01','鞋码测试',3,6,'269.00'],['QA-K01','童装尺码测试',4,3,'199.00'],['QA-F01','配饰均码测试',5,3,'59.00']] as const;
export const qaProducts=productDefs.map(([code,name,g,c,retailPrice],i)=>({id:qaId(4000+i),code,name,retailPrice,minimumPriceAvailability:'UNAVAILABLE' as const,sizeGroupId:qaGroups[g]!.id,categoryId:qaCategories.find(c=>c.name===(g===1?'长裤':g===3?'辅料及其他':g===5?'配饰':'衬衫'))!.id,categoryLabel:qaCategories.find(c=>c.name===(g===1?'长裤':g===3?'辅料及其他':g===5?'配饰':'衬衫'))!.name,year:2026,seasonId:qaSeasons[i%6]!.id,seasonLabel:qaSeasons[i%6]!.name,supplierId:qaSuppliers[i%3]!.id,supplierLabel:qaSuppliers[i%3]!.name,thickness:null,shapeCode:null,systemCode:'QA-DEMO-'+(i+1),fits:qaFits.slice(0,2).map(x=>({id:x.id,label:x.name})),totalStock:String(4*qaGroups[g]!.sizes.reduce((sum,_,si)=>sum+[0,1,2,3].reduce((v,wi)=>v+(wi+si)%5,0),0))}));
export const qaSkus=qaProducts.flatMap((p,pi)=>qaColors.filter(c=>['藏青色','白色'].includes(c.name)).flatMap((color,ci)=>qaFits.slice(0,2).flatMap((fit,fi)=>qaGroups[pi]!.sizes.map((size,si)=>({id:qaId(10000+pi*1000+ci*300+fi*100+si),skuCode:p.code+'-'+(ci+1)+'-'+fit.code+'-'+(si+1),productId:p.id,productCode:p.code,productName:p.name,colorId:color.id,colorName:color.name,fitId:fit.id,fitName:fit.name,sizeId:size.id,sizeName:size.name,sizeGroupId:p.sizeGroupId,barcodeAvailability:'UNAVAILABLE' as const,barcode:'5'+(fi===0?'3':'5')+String(pi+1).padStart(7,'0')+color.code.padStart(3,'0')+(size.code||String(si+1).padStart(3,'0'))})))));
const reference=(r:{id:string;name:string},extra={})=>({id:r.id,name:r.name,code:null,hallId:null,hallName:null,paymentMethodId:null,paymentMethodName:null,...extra});
export const qaSalesReferences={hall:qaHalls.map(r=>reference(r,{hallId:r.id,hallName:r.name})),customer:qaCustomers.map(r=>reference(r,{code:r.code})),salesperson:qaStaff.map(r=>reference(r)),warehouse:qaWarehouses.map(r=>reference(r,{hallId:r.hall.id,hallName:r.hall.name})),paymentMethod:qaMethods.map(r=>reference(r)),paymentAccount:qaPaymentAccounts.map(r=>reference(r,{paymentMethodId:r.paymentMethod.id,paymentMethodName:r.paymentMethod.name}))};
export const qaTransferWarehouses=qaWarehouses.map(r=>({id:r.id,name:r.name,hallId:r.hall.id,hallName:r.hall.name,enabled:r.enabled,hallEnabled:true,hasNonzeroInventory:true}));
export const qaOrganization={HALL:qaHalls,WAREHOUSE:qaWarehouses,STAFF:qaStaff,ACCOUNT:qaAccounts,PAYMENT_METHOD:qaMethods,PAYMENT_ACCOUNT:qaPaymentAccounts};
export function qaPage<T>(rows:readonly T[],q:{page:number;pageSize:number},key='total'){return {page:q.page,pageSize:q.pageSize,[key]:rows.length,items:rows.slice((q.page-1)*q.pageSize,q.page*q.pageSize)};}
export const qaDictionaryGroups=()=>qaGroups.map(({id,name,sizes})=>({id,name,sizes:sizes.map(({id,name,displayOrder})=>({id,name,displayOrder}))}));
export const qaCurrentProducts=()=>qaProducts.map(({id,code,name,retailPrice,minimumPriceAvailability,sizeGroupId})=>({id,code,name,retailPrice,minimumPriceAvailability,sizeGroupId}));
export const qaCurrentSkus=()=>qaSkus.map(({barcode,...sku})=>sku);
export function qaPrices(productId:string){const p=qaProducts.find(p=>p.id===productId);return p?{productId,version:1,prices:{purchase_price:null,retail_price:p.retailPrice,wholesale5_price:null,wholesale6_price:null,wholesale7_price:null,wholesale8_price:null,wholesale9_price:null,wholesale10_price:null,minimum_price:null}}:null;}
export function qaSpecifications(productId:string){const p=qaProducts.find(p=>p.id===productId);if(!p)return null;const g=qaGroups.find(g=>g.id===p.sizeGroupId)!;return {productId,sizeGroup:{id:g.id,label:g.name},colors:qaColors.filter(c=>['藏青色','白色'].includes(c.name)).map(c=>({id:c.id,label:c.name})),fits:p.fits,sizes:g.sizes.map(s=>({id:s.id,label:s.name})),skus:qaSkus.filter(s=>s.productId===productId).map(s=>({id:s.id,colorId:s.colorId,fitId:s.fitId,sizeId:s.sizeId}))};}
const total=(quantity:bigint)=>({knownQuantity:quantity.toString(),completeness:'complete' as const,unknownCells:0 as const});
export function qaInventory(filter:{products?:readonly {id:string}[];categories?:readonly {id:string}[];warehouses?:readonly {id:string}[];suppliers?:readonly {id:string}[];fits?:readonly {id:string}[];seasons?:readonly {id:string}[]}){
 const has=(list:readonly {id:string}[]|undefined,id:string)=>!list?.length||list.some(x=>x.id===id);
 return qaProducts.filter(p=>has(filter.products,p.id)&&has(filter.categories,p.categoryId)&&has(filter.suppliers,p.supplierId)&&has(filter.seasons,p.seasonId)&&(!filter.fits?.length||p.fits.some(f=>has(filter.fits,f.id)))).map(p=>{
  const specs=qaSpecifications(p.id)!,warehouses=qaWarehouses.filter(w=>has(filter.warehouses,w.id)),fits=qaFits.slice(0,2).filter(f=>has(filter.fits,f.id));
  const colorFits=specs.colors.flatMap(color=>fits.map(f=>{
   const rows=warehouses.map(w=>{const wi=qaWarehouses.indexOf(w);return {warehouse:{id:w.id,label:w.name},cells:Object.fromEntries(specs.sizes.map((size,si)=>{const sku=qaSkus.find(s=>s.productId===p.id&&s.colorId===color.id&&s.fitId===f.id&&s.sizeId===size.id)!;return [size.id,{state:'known' as const,skuId:sku.id,quantity:String((wi+si)%5)}];})),total:total(specs.sizes.reduce((sum,_,si)=>sum+BigInt((wi+si)%5),0n))};});
   return {color,fit:{id:f.id,label:f.name},rows,sizeTotals:Object.fromEntries(specs.sizes.map(s=>[s.id,total(rows.reduce((sum,r)=>sum+BigInt(r.cells[s.id]!.quantity),0n))])),total:total(rows.reduce((sum,r)=>sum+BigInt(r.total.knownQuantity),0n))};
  }));
  return {id:p.id,code:p.code,name:p.name,categoryLabel:p.categoryLabel,supplierLabel:p.supplierLabel,seasonLabel:p.seasonLabel,sizeGroup:specs.sizeGroup,sizes:specs.sizes,colorFits,sizeTotals:Object.fromEntries(specs.sizes.map(s=>[s.id,total(colorFits.reduce((sum,c)=>sum+BigInt(c.sizeTotals[s.id]!.knownQuantity),0n))])),total:total(colorFits.reduce((sum,c)=>sum+BigInt(c.total.knownQuantity),0n))};
 });
}
export const qaJson=(value:unknown)=>Response.json(value,{headers:{'cache-control':'no-store','x-data-source':'DEMO-REFERENCE-QA-V1-NOT-PRODUCTION'}});
/** Finite read projection shared by the existing preview adapters only. */
export function qaReferenceRead(path:string,q:Record<string,any>,empty=false):Response|undefined{
 const search=String(q.search??'').toLowerCase(),matched=<T extends {name?:string;code?:string|null;label?:string}>(rows:readonly T[])=>empty?[]:rows.filter(r=>[r.name,r.code,r.label].join(' ').toLowerCase().includes(search));
 const page=(rows:readonly unknown[],key='total')=>qaJson(qaPage(rows,q as {page:number;pageSize:number},key));
 if(path.startsWith('/store-settings-read/')){
  const stores=qaHalls.map(h=>({kind:'stores',id:h.id,name:h.name,enabled:h.enabled,version:h.version,createdAt:null,updatedAt:null,defaultCustomer:{id:h.defaultCustomer.id,name:h.defaultCustomer.name},defaultWarehouse:{id:h.defaultSalesWarehouse.id,name:h.defaultSalesWarehouse.name}}));
  const warehouses=qaWarehouses.map(w=>({kind:'warehouses',id:w.id,name:w.name,enabled:w.enabled,version:w.version,createdAt:null,updatedAt:null,hall:{id:w.hall.id,name:w.hall.name},stockFacts:null}));
  const rows:readonly (typeof stores[number]|typeof warehouses[number])[]=path.includes('/warehouses/')?warehouses:stores;
  if(path.includes('/detail/'))return qaJson({item:empty?null:rows.find(r=>r.id===q.id)??null});
  return page(matched(rows).filter(r=>(q.status==='all'||r.enabled===(q.status==='normal'))&&(!q.hallId||'hall' in r&&r.hall.id===q.hallId)));
 }
 if(path==='/dictionary-read/size-groups/query')return page(matched(qaDictionaryGroups()));
 if(path==='/dictionary-read/seasons/query')return page(matched(qaSeasons));
 if(path==='/dictionary-read/barcode-schemes/query')return page(matched(qaSchemes.map(({key,...s})=>s)));
 if(path==='/dictionary-read/barcode-scheme/query')return qaJson(qaSchemes.map(({key,...s})=>s).find(s=>s.id===q.schemeId)??null);
 if(path==='/catalogue-settings-read/categories/query')return qaJson({total:empty?0:qaCategories.length,items:empty?[]:qaCategories.map(r=>({id:r.id,parentId:r.parentId,name:r.name,displayOrder:r.displayOrder,version:1,code:null,productCount:null,childCount:qaCategories.filter(x=>x.parentId===r.id).length}))});
 if(path==='/catalogue-settings-read/colors/query'||path==='/catalogue-settings-read/fits/query')return page(matched(path.includes('/colors/')?qaColors:qaFits));
 const candidates=(kind:string)=>kind==='product'?qaProducts.map(p=>({id:p.id,label:p.code+' '+p.name,code:p.code,name:p.name})):kind==='category'?qaCategories.map(c=>({id:c.id,label:c.name,parentId:c.parentId,depth:c.parentId===null?0:1,...(c.parentId?{parentLabel:qaCategories.find(p=>p.id===c.parentId)!.name}:{})})):kind==='warehouse'?qaWarehouses.map(x=>({id:x.id,label:x.name})):kind==='supplier'?qaSuppliers.map(x=>({id:x.id,label:x.name})):kind==='season'?qaSeasons.map(x=>({id:x.id,label:x.name})):kind==='fit'?qaFits.map(x=>({id:x.id,label:x.name})):kind==='year'?[{id:'2026',label:'2026年'}]:[];
 if(path==='/product-management/candidates/query')return page(matched(candidates(q.kind)),'exactTotal');
 if(path==='/inventory/candidates/query'){const rows=matched(candidates(q.kind));return qaJson({page:q.page,exactTotal:rows.length,items:rows.slice((q.page-1)*q.pageSize,q.page*q.pageSize)});}
 if(path==='/product-management/query'){
  const f=q.filter,has=(list:readonly string[],id:string)=>!list.length||list.includes(id);
  const rows=empty?[]:qaProducts.filter(p=>has(f.productIds,p.id)&&has(f.categoryIds,p.categoryId)&&has(f.years,'2026')&&has(f.seasonIds,p.seasonId)&&has(f.supplierIds,p.supplierId)&&(!f.fitIds.length||p.fits.some(x=>f.fitIds.includes(x.id))));
  return page(rows.map(({categoryId,seasonId,supplierId,shapeCode,systemCode,sizeGroupId,minimumPriceAvailability,...p})=>p),'exactTotal');
 }
 if(path==='/inventory/query'){
  const products=empty?[]:qaInventory(q.filter),labels=qaWarehouses.filter(w=>!q.filter.warehouses.length||q.filter.warehouses.some((x:{id:string})=>x.id===w.id)).map(w=>w.name);
  return qaJson({page:q.page,pageSize:q.pageSize,exactTotalProducts:products.length,products:products.slice((q.page-1)*q.pageSize,q.page*q.pageSize),warehouseLabels:labels,allMatchesTotal:total(products.reduce((s,p)=>s+BigInt(p.total.knownQuantity),0n)),readReference:'DEMO-REFERENCE-QA-V1'});
 }
 if(path==='/current-form/products/query'){const rows=matched(qaCurrentProducts());return qaJson({...qaPage(rows,q as {page:number;pageSize:number},'exactTotal'),exactTotal:String(rows.length)});}
 if(path==='/current-form/product-skus/query'){const rows=empty?[]:qaCurrentSkus().filter(s=>s.productId===q.productId);return qaJson({...qaPage(rows,q as {page:number;pageSize:number},'exactTotal'),exactTotal:String(rows.length)});}
 if(path==='/current-form/sku-batch/query')return qaJson(q.skuIds.map((id:string)=>qaCurrentSkus().find(s=>s.id===id)));
 if(path==='/current-form/barcode/query'){
  const old=String(q.barcode).startsWith('OLD-'),found=qaSkus.find(s=>(old?'OLD-':'')+s.barcode===q.barcode),sku=found&&qaCurrentSkus().find(s=>s.id===found.id);
  return qaJson(sku?{state:'FOUND',barcode:q.barcode,binding:{id:qaId((old?600000:500000)+qaSkus.indexOf(found!)),kind:old?'CONFIRMED_OLD':'MAIN'},sku}:{state:'NOT_FOUND',barcode:q.barcode,binding:null,sku:null});
 }
 if(path==='/current-form/sales-references/query'){
  const rows=(qaSalesReferences[q.kind as keyof typeof qaSalesReferences]??[]).filter(r=>(!q.hallId||r.hallId===null||r.hallId===q.hallId)&&(!q.paymentMethodId||r.paymentMethodId===q.paymentMethodId));
  return qaJson({...qaPage(matched(rows),q as {page:number;pageSize:number},'exactTotal'),exactTotal:String(matched(rows).length),...(q.kind==='paymentAccount'?{recommendationAvailability:'UNAVAILABLE'}:{})});
 }
 if(path==='/current-form/transfer-warehouses/query'||path==='/transfers/warehouses/query'){const rows=matched(qaTransferWarehouses);return qaJson({...qaPage(rows,q as {page:number;pageSize:number},'exactTotal'),exactTotal:String(rows.length)});}
 if(path==='/products/basics/query'){const p=qaProducts.find(p=>p.id===q.productId);return qaJson(!p||empty?null:{productId:p.id,code:p.code,name:p.name,categoryLabel:p.categoryLabel,yearLabel:'2026',seasonLabel:p.seasonLabel,supplierLabel:p.supplierLabel,systemCode:p.systemCode,retailPrice:p.retailPrice});}
 if(path==='/products/specifications/query')return qaJson(empty?null:qaSpecifications(q.productId));
 if(path==='/products/images/query')return qaJson({productId:q.productId,images:[]});
 if(path==='/products/prices/query')return qaJson(qaPrices(q.productId));
 return undefined;
}
export function qaBarcodeSnapshot(productId:string){
 const skus=qaSkus.filter(s=>s.productId===productId),schemeId=qaSchemes.at(-1)!.id;
 const bindings=skus.flatMap(s=>{const i=qaSkus.indexOf(s);return [
  {id:qaId(500000+i),barcode:s.barcode,skuId:s.id,skuCode:s.skuCode,colorId:s.colorId,fitId:s.fitId,sizeId:s.sizeId,kind:'MAIN' as const,schemeId,enabled:true},
  {id:qaId(600000+i),barcode:'OLD-'+s.barcode,skuId:s.id,skuCode:s.skuCode,colorId:s.colorId,fitId:s.fitId,sizeId:s.sizeId,kind:'CONFIRMED_OLD' as const,schemeId:null,enabled:true},
 ];});
 return {productId,version:1,defaultScheme:{state:'AVAILABLE' as const,schemeId},bindings,skus:skus.map(s=>{
  const records=bindings.filter(b=>b.skuId===s.id),summary=(r:typeof records[number])=>({id:r.id,barcode:r.barcode,kind:r.kind,schemeId:r.schemeId,enabled:r.enabled});
  return {skuId:s.id,skuCode:s.skuCode,skuEnabled:true,colorId:s.colorId,colorLabel:s.colorName,fitId:s.fitId,fitLabel:s.fitName,sizeId:s.sizeId,sizeLabel:s.sizeName,bindingCount:2,main:summary(records[0]!),disabledMainCount:0,confirmedOldCount:1,firstConfirmedOld:summary(records[1]!)};
 })};
}

/** Predeclared QA read specimens. Statuses/history are sample facts only, never
 * the outcome of a simulated approve/revise command or an actual import. */
const qaStamp=(i:number)=>`2026-10-${String(1+i%24).padStart(2,'0')}T09:30:00.000000Z`;
const qaMinor=(s:string)=>{const [w,f='']=s.split('.');return BigInt(w!)*100n+BigInt(f.padEnd(2,'0'));};
const qaYuan=(s:string)=>{const v=BigInt(s),a=v<0n?-v:v;return `${v<0n?'-':''}${a/100n}.${String(a%100n).padStart(2,'0')}`;};
const qaDocumentCatalog={skus:qaSkus.map(s=>({skuId:s.id,productId:s.productId,productCode:s.productCode,productName:s.productName,colorId:s.colorId,colorName:s.colorName,fitId:s.fitId,fitName:s.fitName,sizeId:s.sizeId,sizeGroupId:s.sizeGroupId})),sizeGroups:qaGroups.map(g=>({sizeGroupId:g.id,code:g.key,name:g.name,members:g.sizes.map(s=>({sizeId:s.id,code:s.code||null,name:s.name,displayOrder:s.displayOrder}))}))};
export function qaTransferCatalog(lines:readonly {skuId:string}[]){
 const tuples=new Set(lines.map(l=>{const sku=qaSkus.find(s=>s.id===l.skuId)!;return [sku.productId,sku.colorId,sku.fitId].join('|');}));
 const skus=qaDocumentCatalog.skus.filter(s=>tuples.has([s.productId,s.colorId,s.fitId].join('|'))),groups=new Set(skus.map(s=>s.sizeGroupId));
 return {skus,sizeGroups:qaDocumentCatalog.sizeGroups.filter(g=>groups.has(g.sizeGroupId))};
}
export const qaSalesDocuments=Array.from({length:24},(_,i)=>{
 const id=qaId(700000+i),status=(['DRAFT','APPROVED','VOID'] as const)[i%3]!,businessType=(['SALE','RETURN','EXCHANGE'] as const)[Math.floor(i/3)%3]!,stamp=qaStamp(i);
 const lines=[0,1,2].map((p,n)=>{
  const skus=qaSkus.filter(s=>s.productId===qaProducts[p]!.id),sku=skus[(i*3+n)%skus.length]!,reference=qaMinor(qaProducts[p]!.retailPrice),discount=n===1,price=discount?(reference*80n+50n)/100n:reference;
  const qty=BigInt(n+1)*(businessType==='RETURN'||businessType==='EXCHANGE'&&n===0?-1n:1n);
  return {id:qaId(710000+i*10+n),salesId:id,lineNo:n+1,skuId:sku.id,quantity:String(qty),referencePrice:String(reference),dealPrice:String(price),pricingRule:discount?'DISCOUNT':'UNIT_PRICE',discountTenths:discount?80:null,zeroConfirmed:false,isGift:false,lineAmount:String(qty*price),allocatedDiscount:'0',isCurrent:true,snapshot:{productCode:sku.productCode,productName:sku.productName,colorName:sku.colorName,fitName:sku.fitName,sizeName:sku.sizeName,barcode:sku.barcode}};
 });
 const gross=lines.reduce((sum,l)=>sum+BigInt(l.lineAmount),0n),absolute=gross<0n?-gross:gross;
 const settlements=absolute===0n?[]:[absolute/2n,absolute-absolute/2n].filter(v=>v!==0n).map((value,n)=>{const account=qaPaymentAccounts[(i+n)%qaPaymentAccounts.length]!;return {id:qaId(720000+i*10+n),salesId:id,lineNo:n+1,paymentAccountId:account.id,paymentMethodId:account.paymentMethod.id,direction:gross<0n?'REFUND':'RECEIVE',amount:String(value)};});
 const header={id,number:'QA-XS-'+String(i+1).padStart(4,'0'),businessType,businessDate:stamp.slice(0,10),hallId:qaHalls[0]!.id,customerId:qaCustomers[i%2]!.id,salespersonId:qaStaff[2+i%2]!.id,warehouseId:qaWarehouses[i%4]!.id,status,version:i%3+1,grossAmount:String(gross),orderDiscount:'0',netDue:String(gross),responsibleStaffId:qaStaff[1]!.id,note:'隔离QA预置样例；非真实单据，未执行保存、审核或迁移。',createdByAccountId:qaPrincipal.accountId,createdHallId:qaHalls[0]!.id,createdAt:stamp,updatedAt:stamp,approvedByAccountId:status==='APPROVED'?qaPrincipal.accountId:null,approvedAt:status==='APPROVED'?stamp:null};
 return {stockBasis:'RUNTIME_LEDGER',document:{header,lines,settlements},referenceNames:{hallName:qaHalls[0]!.name,customerName:qaCustomers[i%2]!.name,warehouseName:qaWarehouses[i%4]!.name,salespersonName:qaStaff[2+i%2]!.name,responsibleName:qaStaff[1]!.name,createdByName:qaStaff[0]!.name},settlementNames:settlements.map(s=>({settlementId:s.id,paymentAccountId:s.paymentAccountId,accountNameSnapshot:qaPaymentAccounts.find(a=>a.id===s.paymentAccountId)!.name,methodNameSnapshot:qaMethods.find(m=>m.id===s.paymentMethodId)!.name,currentAccountName:qaPaymentAccounts.find(a=>a.id===s.paymentAccountId)!.name,currentMethodName:qaMethods.find(m=>m.id===s.paymentMethodId)!.name}))};
});
export const qaTransferDocuments=Array.from({length:24},(_,i)=>{
 const id=qaId(730000+i),status=(['DRAFT','APPROVED','VOID'] as const)[i%3]!,stamp=qaStamp(i),from=qaWarehouses[i%4]!,to=qaWarehouses[(i+1)%4]!;
 const lines=[0,1,2].map((p,n)=>{const skus=qaSkus.filter(s=>s.productId===qaProducts[p]!.id),sku=skus[(i+n*10)%skus.length]!;return {id:qaId(740000+i*10+n),transferId:id,lineNo:n+1,skuId:sku.id,quantity:String(n+1+i%3),isCurrent:true,snapshot:{productCode:sku.productCode,productName:sku.productName,colorName:sku.colorName,fitName:sku.fitName,sizeName:sku.sizeName,barcode:sku.barcode}};});
 return {stockBasis:'RUNTIME_LEDGER',document:{header:{id,number:'QA-DB-'+String(i+1).padStart(4,'0'),businessDate:stamp.slice(0,10),fromWarehouseId:from.id,toWarehouseId:to.id,status,version:i%3+1,responsibleStaffId:qaStaff[1]!.id,note:'隔离QA预置调拨；非真实单据，未执行库存移动或审核。',createdByAccountId:qaPrincipal.accountId,createdHallId:qaHalls[0]!.id,createdRole:'ADMIN',createdAt:stamp,updatedAt:stamp,approvedByAccountId:status==='APPROVED'?qaPrincipal.accountId:null,approvedAt:status==='APPROVED'?stamp:null},lines},references:{fromWarehouseName:from.name,toWarehouseName:to.name,fromHallName:from.hall.name,toHallName:to.hall.name,createdByName:qaStaff[0]!.name,approvedByName:status==='APPROVED'?qaStaff[0]!.name:null,responsibleName:qaStaff[1]!.name},catalog:qaTransferCatalog(lines)};
});
export const qaHistoryDocuments=(['sales','transfers'] as const).flatMap(kind=>Array.from({length:6},(_,i)=>{
 const origin=kind==='sales'?qaSalesDocuments[i]!:qaTransferDocuments[i]!,h=origin.document.header,id=qaId((kind==='sales'?750000:760000)+i),batchId=qaId(770000);
 const lines=origin.document.lines.map((l,n)=>({id:qaId((kind==='sales'?780000:790000)+i*10+n),lineNo:l.lineNo,skuId:l.skuId,quantity:l.quantity,productCodeSnapshot:l.snapshot.productCode,productNameSnapshot:l.snapshot.productName,colorNameSnapshot:l.snapshot.colorName,fitNameSnapshot:l.snapshot.fitName,sizeNameSnapshot:l.snapshot.sizeName,barcodeSnapshot:'OLD-'+l.snapshot.barcode,...(kind==='sales'&&'dealPrice'in l?{referencePrice:qaYuan(l.referencePrice),dealPrice:qaYuan(l.dealPrice),lineAmount:qaYuan(l.lineAmount),allocatedDiscount:'0.00',isGift:l.isGift,pricingMethodSource:l.pricingRule,discountTenths:l.discountTenths,ordinaryZeroConfirmed:false}:{})}));
 const settlements=kind==='sales'?qaSalesDocuments[i]!.document.settlements.map((s,n)=>({id:qaId(800000+i*10+n),lineNo:s.lineNo,paymentAccountId:s.paymentAccountId,direction:s.direction,amount:qaYuan(s.amount),accountNameSnapshot:qaPaymentAccounts.find(a=>a.id===s.paymentAccountId)!.name,methodNameSnapshot:qaMethods.find(m=>m.id===s.paymentMethodId)!.name,paymentMethodIdSnapshot:s.paymentMethodId})):[];
 const document={dataset:'HISTORY',kind,batchId,documentId:id,version:1,number:(kind==='sales'?'QA-HXS-':'QA-HDB-')+String(i+1).padStart(4,'0'),businessDate:h.businessDate,sourceStatus:h.status,note:'隔离QA模拟历史记录；非真实来源、导入或迁移验收。',createdBy:{state:'UNKNOWN',staffId:null},approvedBy:{state:'UNKNOWN',staffId:null},responsibleStaffId:null,responsibleName:null,createdHallId:null,createdHallProvenance:'UNKNOWN',createdLocalAt:h.createdAt.slice(0,-1),updatedLocalAt:h.updatedAt.slice(0,-1),approvedLocalAt:h.approvedAt?.slice(0,-1)??null,createdInstant:null,updatedInstant:null,approvedInstant:null,...(kind==='sales'?{businessType:qaSalesDocuments[i]!.document.header.businessType,hallId:qaHalls[0]!.id,customerId:qaCustomers[i%2]!.id,warehouseId:qaWarehouses[i%4]!.id,salespersonId:null,grossAmount:qaYuan(qaSalesDocuments[i]!.document.header.grossAmount),orderDiscount:'0.00',netDue:qaYuan(qaSalesDocuments[i]!.document.header.netDue)}:{fromWarehouseId:qaTransferDocuments[i]!.document.header.fromWarehouseId,toWarehouseId:qaTransferDocuments[i]!.document.header.toWarehouseId})};
 return {kind,document,lines,settlements,origin};
}));
export function qaHistoryRead(kind:'sales'|'transfers',q:{documentId:string;linePage:number;linePageSize:number;settlementPage:number;settlementPageSize:number}){
 const entry=qaHistoryDocuments.find(d=>d.kind===kind&&d.document.documentId===q.documentId);
 const paged=(rows:readonly unknown[],page:number,pageSize:number)=>({...qaPage(rows,{page,pageSize},'total'),total:String(rows.length)});
 return {dataset:'HISTORY',kind,document:entry?.document??null,lines:paged(entry?.lines??[],q.linePage,q.linePageSize),settlements:paged(entry?.settlements??[],q.settlementPage,q.settlementPageSize)};
}
export function qaHistorySummary(kind:'sales'|'transfers'){
 return qaHistoryDocuments.filter(d=>d.kind===kind).map(e=>{
  const d=e.document,h=e.origin.document.header,products=Array.from(new Map(e.origin.document.lines.map(l=>{const sku=qaSkus.find(s=>s.id===l.skuId)!;return [sku.productId,{productId:sku.productId,productCodeSnapshot:sku.productCode,productNameSnapshot:sku.productName}] as const;})).values());
  const base={id:d.documentId,documentId:d.documentId,number:d.number,businessDate:d.businessDate,status:d.sourceStatus,version:1,dataset:'HISTORY',batchId:d.batchId,effectiveVersion:1,responsibleStaffId:null,responsibleName:null,createdByName:null,createdLocalAt:d.createdLocalAt,updatedLocalAt:d.updatedLocalAt,updatedAt:null,productSummary:{productCount:String(products.length),items:products.slice(0,3),hasMore:products.length>3}};
  if(kind==='sales'){
   const source=qaSalesDocuments.find(x=>x.document.header.id===h.id)!,sum=source.document.lines.reduce((v,l)=>v+BigInt(l.quantity),0n),incoming=source.document.lines.reduce((v,l)=>v+(BigInt(l.quantity)<0n?-BigInt(l.quantity):0n),0n),outgoing=source.document.lines.reduce((v,l)=>v+(BigInt(l.quantity)>0n?BigInt(l.quantity):0n),0n);
   return {...base,businessType:source.document.header.businessType,hallId:qaHalls[0]!.id,customerId:source.document.header.customerId,warehouseId:source.document.header.warehouseId,salespersonId:null,grossAmount:source.document.header.grossAmount,orderDiscount:'0',netDue:source.document.header.netDue,hallName:qaHalls[0]!.name,customerName:source.referenceNames.customerName,warehouseName:source.referenceNames.warehouseName,salespersonName:null,quantity:String(sum),incomingQuantity:String(incoming),outgoingQuantity:String(outgoing)};
  }
  const source=qaTransferDocuments.find(x=>x.document.header.id===h.id)!;
  return {...base,fromWarehouseId:source.document.header.fromWarehouseId,toWarehouseId:source.document.header.toWarehouseId,createdByAccountId:null,createdAt:null,...source.references,createdByName:null,responsibleName:null,approvedByName:null,totalQuantity:String(source.document.lines.reduce((v,l)=>v+BigInt(l.quantity),0n))};
 });
}
