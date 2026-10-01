"""Render two review reports from the frozen A2 controls; never import data."""
from collections import Counter
from decimal import Decimal
import json
from pathlib import Path
import os

ROOT = Path(os.environ['TPLUS_OUT_DIR']).resolve() if os.environ.get('TPLUS_OUT_DIR') else Path(__file__).resolve().parents[1]


def read(name):
    return json.loads((ROOT / "controls" / f"{name}.json").read_text())


def number(value):
    if isinstance(value, int):
        return f"{value:,}"
    return format(Decimal(str(value)), ",f")


def table(headers, rows):
    return "\n".join([
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
        *["| " + " | ".join(str(c) for c in row) + " |" for row in rows],
    ])


masters, sales, movements, inventory = (read(n) for n in ("masters", "sales", "movements", "inventory"))
validation = read("validation")
assert validation["all_pass"]
move = movements["controls"]
sale = {e["entity"]: e for e in sales["entities"]}
inv = {e["entity"]: e for e in inventory["entities"]}
fields = ["source_count", "converted_count", "rejected_count", "quarantined_count", "duplicate_count", "missing_fk_count"]
headers = ["实体 / 统计粒度", "源数", "转换数", "拒绝数", "隔离数", "重复数", "缺引用数"]
labels = {
    "categories": "分类节点", "colors": "颜色", "sizes": "尺码", "fits": "版型", "departments": "部门",
    "employees": "员工", "parties": "往来主体", "customers": "客户角色投影", "suppliers": "供应商角色投影",
    "warehouses": "仓库", "halls": "营业厅派生", "payment_methods": "T+ 历史结算方式",
    "payment_methods_derived": "现有配置派生方式", "fund_accounts": "资金账户", "products": "商品",
    "size_groups": "不同明确尺码组标签", "product_barcodes": "商品条码来源记录", "units": "单位",
    "purchase_documents": "进货单", "purchase_lines": "进货原明细行", "sales_documents": "销货单",
    "sales_lines": "销货原明细行", "sales_funds": "销货现结原行",
    "transfer_source_documents": "调拨单侧源单", "transfer_source_lines": "调拨单侧源行",
    "independent_receipt_documents": "独立收款单（隔离）", "independent_receipt_lines": "独立收款原行（隔离）",
    "unmatched_transfer_documents": "未配调拨源单（隔离子集）", "unmatched_transfer_lines": "未配调拨源行（隔离子集）",
    "skus": "实际观测到的商品×颜色×尺码身份", "reconstructed_stock": "可信交易涉及的仓库×SKU 键",
    "rebuild_events": "有符号仓库影响事件", "inventory_snapshot_diagnostic": "库存快照非空数量格（仅诊断）",
}


def six_table(entities):
    return table(headers, [[labels[e["entity"]], *[number(e[f]) for f in fields]] for e in entities])


all_entities = masters["entities"] + sales["entities"] + list(move.values()) + inventory["entities"]
for entity in all_entities:
    assert entity["source_count"] == sum(entity[k] for k in ("converted_count", "rejected_count", "quarantined_count")), entity
assert move["transfer_source_documents"]["converted_count"] == 2 * move["transfer_source_documents"]["derived_count"]
assert move["transfer_source_lines"]["converted_count"] == 2 * move["transfer_source_lines"]["derived_count"]
assert masters["verification"]["allChecksPassed"] and sales["verification"]["result"] == "PASS"
assert all(movements["source_row_conservation"].values()) and inventory["all_pass"]
assert Decimal(move["purchase_lines"]["quantity_sum"]) - Decimal(sales["totals"]["sales_quantity"]) == Decimal(inventory["totals"]["rebuilt_quantity_control_total"])
assert sum(map(Decimal, inventory["totals"]["unit_totals"].values())) == Decimal(inventory["totals"]["rebuilt_quantity_control_total"])
assert inv["reconstructed_stock"]["source_count"] == sum(inv["reconstructed_stock"][k] for k in ("positive_count", "negative_count", "zero_count"))
assert inv["rebuild_events"]["source_count"] == move["purchase_lines"]["converted_count"] + sale["sales_lines"]["converted_count"] + 2 * move["transfer_source_lines"]["derived_count"]

optional_master = Counter((r["entity"], r["field"]) for r in masters["missingOptionalSourceFields"])
optional_rows = [[f"主档 {entity}.{field}", number(count), "源可空字段缺值；不计主档错误外键"] for (entity, field), count in sorted(optional_master.items())]
optional_rows += [[f"进货/调拨 {field}", number(count), "源可空字段缺值；不计 movements.missing_fk_count"] for field, count in movements["optional_absent_source_fk"].items()]
for e in sales["entities"]:
    for field, count in e["source_missing_fk_by_field"].items():
        optional_rows.append([f"{labels[e['entity']]}.{field}", number(count), "源可空字段缺值；已计该 sales 实体 missing_fk_count"])

prices = []
for name, control in masters["moneyControls"].items():
    prices.append([name, number(control["source_sum"]), number(control.get("converted_sum", control.get("converted_source_evidence_sum"))), "仅来源余额证据，业务余额未初始化" if name.startswith("fund_") else "参考价格控制量，不是交易额"])

history_entities = [move["purchase_documents"], move["purchase_lines"], sale["sales_documents"], sale["sales_lines"], sale["sales_funds"], move["transfer_source_documents"], move["transfer_source_lines"], sale["independent_receipt_documents"], sale["independent_receipt_lines"]]
control_report = f"""# ③A-2 控制总量与守恒

本文件汇总本隔离转换包的 [主档](controls/masters.json)、[销售及收款](controls/sales.json)、[进货及调拨](controls/movements.json)、[库存](controls/inventory.json) 专项控制结果。**专项检查及 [最终全包预检](controls/validation.json) 均通过（all_pass=true），未执行正式导入，executed=false。**通过范围是隔离数据包预检，不表示已有可直接执行的正式 importer。源文件身份以本包 [BASELINE.json](BASELINE.json) 和逐记录 lineage 为准。

## 六计数口径

- 源数 / 转换数 / 拒绝数 / 隔离数分别对应 `source_count / converted_count / rejected_count / quarantined_count`。同一行、同一粒度满足：源数 = 转换数 + 拒绝数 + 隔离数。
- 重复数 `duplicate_count` 是保留的完全相同原始行的额外出现次数，属于源数的子集，不从转换数减去，也不是唯一键冲突数。
- 缺引用数 `missing_fk_count` 保持各专项原口径；销售同时包含可空源字段缺值和非空未解析引用，其他专项将可空源缺值另列。null 还可能表示不适用或无依据绑定，不一律等于源缺失。下文拆开说明，不能横向相加当作孤儿总数。
- 转换数不是一律等于 JSONL 输出条数：调拨以单侧源记录计转换，再两侧合一；客户/供应商是同一主体的角色投影；库存控制的源数是标明粒度的派生输入，不是又一批原始交易。
- 所有实体拒绝数为 0。隔离仍完整输出可追溯 JSONL，隔离数不等于丢弃数；详见 [QUARANTINE.md](QUARANTINE.md)。不提供跨表“记录总数”，避免把主明细、双侧来源、角色投影和诊断重复加总。

## 主档六计数

{six_table(masters['entities'])}

485 个往来主体包含 450 个双角色主体、34 个仅客户、1 个仅供应商，因此客户 484 和供应商 451 不能相加当作主体数。47 营业厅由 58 部门派生；15 尺码组来自 2,941 个商品的明确组标签。49 分类节点为既有树，2,941 商品均已分类、待确认 0，143 商品按裁决直接挂既有父级。派生方式 `mall-counter` 的 1 条来源于已有配置，不是第 12 条 T+ 历史结算方式。

账户 80 条中 24 条适用全部 47 厅、56 条适用单厅；21 条本次确认主要方式 991，59 条保留原主要方式。历史现结仍用每笔来源方式。轮用仓 96110 保持一仓两厅，不编造轮换日期。商品 101 个源列和重复表头分别保留；账户仅选 A:K、X 业务列，不提取 L:W 凭证列。

## 历史业务六计数

{six_table(history_entities)}

调拨两侧转换的最终输出为 **13,946 单、254,519 行**，分别满足：

- 28,023 单侧源单 = 27,892 可转换单侧源单 + 131 隔离源单；27,892 ÷ 2 = 13,946 调拨单。
- 597,838 单侧源行 = 509,038 可转换单侧源行 + 88,800 隔离源行；509,038 ÷ 2 = 254,519 调拨明细。
- `controls/movements.json` 中 `unmatched_transfer_documents/lines` 的 131 / 88,800 是上述隔离列的子集，不再加一次。

现结 25,416 笔通过真实销货号关联 24,932 张销售单；470 单有多笔现结，2,971 单无来源现结。每笔 id、settlementId 独立；没有按单号合并或把独立收款近似匹配到销售。

## 数量与金额控制

金额取原金额字段；保留原符号、零值和小数，不用数量×显示单价改写原成交额。主表金额与明细合计是同一业务的两个视图，不能相加。数量为混合来源主单位控制和，不能统一称“件”。

{table(['项目', '源控制量', '包内控制量', '处理口径'], [
['进货原有符号数量',number(move['purchase_lines']['quantity_sum']),number(move['purchase_lines']['quantity_sum']),'重建库存 +原数量；含 5,131 负数量行'],
['进货原含税金额',number(move['purchase_lines']['amount_sum']),number(move['purchase_lines']['amount_sum']),'保留原金额'],
['销售原有符号数量',number(sales['totals']['sales_quantity']),number(sales['totals']['sales_quantity']),'重建库存 −原数量；退货不二次翻号'],
['销售原成交金额',number(sales['totals']['sales_amount']),number(sales['totals']['sales_amount']),'单据/明细读回一致'],
['销售抹零',number(sales['totals']['sales_rounding']),number(sales['totals']['sales_rounding']),'每单一次；不按重复行表头累加、不分摊回历史行'],
['销售现结原金额',number(sales['totals']['funds_amount']),number(sales['totals']['funds_amount']),'25,416 原笔保留；未写运行资金账'],
['配对调拨单侧数量',number(move['transfer_source_lines']['quantity_sum_one_side']),number(move['transfer_source_lines']['quantity_sum_one_side']),'出库减一次、入库加一次，全仓净影响 0'],
['配对调拨单侧原金额',number(move['transfer_source_lines']['amount_sum_one_side']),number(move['transfer_source_lines']['amount_sum_one_side']),'同一调拨只计一侧金额；不当收支'],
['独立收款原金额',number(sales['totals']['receipt_amount']),number(sales['totals']['receipt_amount']),'全量隔离；库存/资金效果均为 0'],
])}

销售分单位数量：{'; '.join(f'{unit} {number(value)}' for unit, value in sales['salesQuantityByUnit'].items())}。赠品来源数量另在 sales 控制保留，不加到已包含全部原明细的销售数量中。

主档参考价格及余额证据逐值保留，以下合计仅用于复核：

{table(['控制字段', '源合计', '输出合计', '含义'], prices)}

九类商品价格共逐值核对 26,469 个位置，变化值 0，原空值仍为 null。80 账户的 43 个负来源余额原样保留，余额合计不是业务资金期初或当前可用余额。

## 缺源可空引用与真实未解析引用

全部专项及最终全包当前非空引用未解析为 **0**；主档必需引用孤儿为 0。下列是各专项单列的来源引用缺值次数，保留 null 并附来源解释。主档共 {number(len(masters['missingOptionalSourceFields']))} 次，不能理解为 {number(len(masters['missingOptionalSourceFields']))} 条坏记录；销售不同文档/明细粒度也不可合并成独立记录数。这张表不是所有输出 null 的全集。

{table(['实体与字段', '缺源次数', '六计数处理'], optional_rows)}

销售缺引用诊断共 911 项 = 文档 9 + 行 15 + 独立收款文档 438 + 独立收款行 449；现结为 0。这是分实体字段出现次数，不是 911 个外键孤儿。2,975 项职能部门诊断的 departmentId 有效、hallId=null，不计缺引用；5,663 项员工现档部门与历史单据不同只记录差异，不用现档覆盖历史部门。

最终验证另在 `nullable_fk_absences_by_field` 记录全部可空引用状态：例如非营业部门的 hallId 不适用，2,943 商品级条码没有依据绑定 SKU，47 厅默认仓没有明确裁决，2,934 商品及 14,767 SKU 的版型未知。这些 null 分别表示不适用或没有可靠依据，不能全部改称“源缺字段”，也不应凭名称、位置或默认值补绑定。完整分字段次数见 [validation.json](controls/validation.json)。

## 重复、身份与来源保留

{table(['来源', '完全重复额外源行', '处理'], [
['进货','56','全保留；同 SKU/仓库额外 670 行是另一口径'],
['销货','140','全保留，按来源 SHA/Sheet/行号形成不同明细身份'],
['销货现结','1','全保留，各自独立 id / settlementId'],
['独立收款','1','全保留在隔离文件'],
['配对调拨两侧','1,234','每侧 617；输出保留 617 个重复额外明细，不删除'],
])}

调拨同 SKU 额外 630 行与完全重复不同。1,188 个派生明细存在可交换的同签名对应行，按固定批次第 n 次出现配第 n 次出现，仅保证可复现，不宣称源系统存在逐行外键。销售表头冲突 0、SKU 身份冲突 0；最终全包验证输出身份冲突 `duplicate_identity_count=0`，保留重复原行不等于输出主键冲突。

## 零期初库存与诊断快照

{six_table(inventory['entities'])}

库存按用户确认口径：**0 + 151,786 − 70,992 + 283,423 − 283,423 = 80,794**。零期初是本次业务决策，不是已证明原系统期初为零。库存快照、131 张未配调拨和全部独立收款均不参与这一计算；没有调用当前审核命令回放历史。

637,673 事件 = 49,127 进货行 + 79,508 销货行 + 254,519 × 2 调拨仓库影响。137,940 库存键中正数 34,201、负数 1,231、零数 102,508；负值不修平，零行仅来自真实交易触达后净额为零，不做仓库×SKU 笛卡尔展开。51 仓库中 49 仓有纳入重建的交易。

{table(['主单位', '重建数量'], [[unit, number(value)] for unit, value in inventory['totals']['unit_totals'].items()])}

14,864 SKU 是实际观测组合；其中 14,851 在纳入计算交易中出现，13 只见于不参与计算的来源证据。504,384 次观测 = 49,127 进货 + 79,508 销货 + 254,519 双侧合并调拨 + 88,800 隔离调拨 + 32,430 快照非空格；489,520 次再次观测不是原行重复或 SKU 身份冲突。

2026-09-10 库存快照的 8,602 矩阵行中，32,430 个非空数量格控制和为 80,776，819,168 个空格保持未知，不转零。快照控制和减重建全局控制和为 −18；**只诊断，不调整库存，也不能据此推断业务差异原因**。覆盖范围分别为双方都有键 32,134、仅重建键 105,806、仅快照键 296。32,430 个快照观测格中比较相同 30,139、不同 2,291；观测格范围的差额合计 2,501 与全局控制和差 −18 口径不同，不能互换。逐仓/逐键证据见 [warehouse_reconciliation.jsonl](diagnostics/warehouse_reconciliation.jsonl)、[inventory_reconciliation.jsonl](diagnostics/inventory_reconciliation.jsonl)。

## 专项核验范围

主档 18 文件读回与商品原值核对通过；销售直接重读 Excel，并独立从原 OOXML 复算三个 Sheet 的行数与量额，读回、真实销售外键及身份检查通过；进货/调拨重新读取三份原件并验证完整配对表头和明细多重集，来源行守恒通过；库存 controls 的全部 11 项检查通过。历史对象只读、审核及创建元数据未知为 null，原业务人员不冒充创建人。

最终全包 validator 已通过四专项门禁、来源身份、全部 637,673 个事件对应可信来源及完整库存单位/身份/组件核验；未解析外键、身份冲突、来源身份错误、事件错误、库存身份错误均为 0。335 份受保护文件变化 0，运行存储未写入，源及最终裁决未改动。机器证据以 [validation.json](controls/validation.json) 为准。

本报告脚本只读以上控制文件并检查同粒度守恒、调拨二合一、库存事件及单位合计，输出本文件与 QUARANTINE.md；整包记录验证由独立 validator 完成。解释详见 [MASTERS.md](notes/MASTERS.md)、[MOVEMENTS.md](notes/MOVEMENTS.md)、[SALES.md](notes/SALES.md)、[SCHEMA_CONTRACT.md](SCHEMA_CONTRACT.md)。
"""

side = move["unmatched_transfer_lines"]["by_side"]
quarantine_report = f"""# ③A-2 隔离清单与计算边界

本包完整保留两类隔离历史：无法可靠配对的调拨来源，以及没有可靠销售/核销关系的独立收款。**全部只读、未执行导入，stockEffect=false、fundsEffect=false**。没有丢弃记录，没有按相似日期或金额强行关联。专项转换守恒和 [最终全包预检](controls/validation.json) 均通过（all_pass=true）；本文件不表示已有正式 importer，也不表示可以调用当前审核流程导入历史。

## 全量隔离文件

{table(['隔离文件', '源数', '转换数', '拒绝数', '隔离数', '输出数', '原因'], [
['[unmatched_transfer_documents.jsonl](quarantine/unmatched_transfer_documents.jsonl)','131','0','0','131','131','无已验证对侧来源单据'],
['[unmatched_transfer_lines.jsonl](quarantine/unmatched_transfer_lines.jsonl)','88,800','0','0','88,800','88,800','所属源单未形成可靠配对'],
['[independent_receipt_documents.jsonl](quarantine/independent_receipt_documents.jsonl)','25,155','0','0','25,155','25,155','没有可靠销售/核销关系'],
['[independent_receipt_lines.jsonl](quarantine/independent_receipt_lines.jsonl)','25,622','0','0','25,622','25,622','随独立收款主单整体隔离'],
])}

单据与明细是同一批业务的不同粒度，不能相加作为隔离单据数。调拨 131 / 88,800 也是 movements 总来源中的隔离子集，不能与 transfer_source_* 控制块的隔离列再次相加。所有隔离行保留来源文件、SHA、Sheet、原行号及原字段；主单保留所属原明细行引用。

## 未配调拨 131 单 / 88,800 行

{table(['源侧', '单据数', '明细行数', '有符号数量控制和', '原金额控制和', '计入库存'], [[label,number(side[key]['documents']),number(side[key]['lines']),number(side[key]['quantity_sum']),number(side[key]['amount_sum']),'否'] for key,label in [('out','其他出库'),('in','其他入库')]])}

52 + 79 = 131 单；44,402 + 44,398 = 88,800 行。出入两侧的数量和金额只是各自来源控制量，不是已配调拨的净差，也不生成任何补录、调平或库存事件。

可靠子集已经转换 13,946 对、254,519 条双来源明细；全量调拨来源守恒为 28,023 单侧源单 = 27,892 已转换单侧源单 + 131 隔离，597,838 单侧源行 = 509,038 已转换单侧源行 + 88,800 隔离。源标异价而完整配对通过的 1 单仍在可靠子集，保留原标签并按已确认历史同价目标承载，不列入本隔离清单。

隔离调拨允许作为“这个商品/颜色/尺码确实在来源出现”的 SKU 观测证据；这不赋予其库存效力。库存事件只来自进货、销货和可靠调拨，不能把本文件数量加入零期初累计。

## 独立收款 25,155 单 / 25,622 行

原金额 **{number(sales['totals']['receipt_amount'])}** 全部保留，主表金额合计与明细金额合计相等，只计一次；1 条完全重复额外来源行也保留。所有记录 `salesDocumentId=null`、库存及资金效果为 false；不将其当作 25,416 笔销售现结的增量，避免无证据关联及重复累计资金。

独立收款原缺业务员/部门按 null 保留：单据粒度业务员 224、部门 214，明细粒度业务员 230、部门 219；非空未解析引用 0。源缺值没有导致隔离，隔离原因是无法证明销售/核销关系。单据 438 与明细 449 是字段缺值次数，不能相加为独立坏单数。

这些历史均 sourceAuditStatusKnown=false、runtimeAuditReplayAllowed=false，审核状态/人/时间及创建人/时间为 null；来源业务员只是业务角色。独立收款完整来源得以保留，不伪造已审核状态，也不生成补充资金流水。

## 仅诊断、不增加隔离范围

{table(['情况', '数量 / 粒度', '保留方式与证据'], [
['销售显示单价×数量与原成交额不同','5 行','保留原成交额；[明细差异](diagnostics/sales_line_amount_difference.jsonl)'],
['现结与成交额减抹零不同','21 单','保留原现结与每单原抹零；[结算差异](diagnostics/sales_settlement_difference.jsonl)'],
['销货备注含库存调整用途','70 单','保留来源销货及 purpose，不改写为调整单，不擅算销售业绩；[用途](diagnostics/sales_source_purpose.jsonl)'],
['完全重复源行','进货 56；销售 140；现结 1；收款 1；调拨两侧 1,234','全部保留，来源行身份不同；不是输出主键冲突'],
['职能部门没有营业厅映射','2,975 项诊断','departmentId 有效、hallId=null；[职能部门](diagnostics/sales_functional_department.jsonl)'],
['业务员现档部门与历史单据不同','5,663 项诊断','保留原交易部门；[部门差异](diagnostics/sales_employee_current_department_difference.jsonl)'],
['允许为空的引用','各实体字段次数，见控制总量','原样 null；区分源缺值、不适用、无依据绑定及非空未解析引用'],
['库存负数/净零键','1,231 / 102,508 库存键','重建原值保留，不补正、清零或删行'],
['库存快照与重建差异','仅快照非空格比较及全局诊断','快照不参与期初；缺格不是零；[逐键对账](diagnostics/inventory_reconciliation.jsonl)'],
['账户来源最新余额及商品参考价格','仅主档来源证据','不初始化业务余额、不代替历史成交额'],
])}

当前 sales 输出主键冲突 0；全部专项非空未解析引用 0。不可把上述原业务差异、保留的重复来源行或空可选字段列为“已拒绝”，也不可将它们悄悄修正以取得平账结果。后续如取得可靠对侧或核销证据，应基于新的来源与显式映射重新产出可追溯转换版本；本包保持此次隔离边界。

完整六计数、金额数量及观测口径见 [CONTROL_TOTALS.md](CONTROL_TOTALS.md)；机器证据见 [movements.json](controls/movements.json)、[sales.json](controls/sales.json)、[inventory.json](controls/inventory.json)。
"""

for name, content in [("CONTROL_TOTALS.md", control_report), ("QUARANTINE.md", quarantine_report)]:
    (ROOT / name).write_text(content, encoding="utf-8")
print("Generated CONTROL_TOTALS.md and QUARANTINE.md; report-level conservation assertions passed.")
