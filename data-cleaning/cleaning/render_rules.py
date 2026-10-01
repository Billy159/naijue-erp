"""Render the human rulebook directly from the executable frozen manifest."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root / "TPLUS_CLEANING_MANIFEST.json").read_text())
out = [
    "# T+ 数据清洗规则书",
    "",
    f"规则集：`{manifest['version']}`；输入结构：`{manifest['inputStructureVersion']}`。",
    "",
    "本规则集只自动修复能证明不改变业务含义的来源单元格。原始 T+ 文件保持只读；清洗输出保留目录、文件、Sheet、字段和列顺序。所有自动值变化记录到 `cleaning_changes.jsonl`。当前业务分类、尺码展示、生成条码和库存重建由既有冻结转换与运行逻辑承担，不通过本规则集改写来源身份。",
    "",
    "## 分级与执行门槛",
    "",
    "- `AUTO_SAFE`：执行后逐单元格核对，并记录 Rule ID 与旧新值。",
    "- `AUTO_WITH_ASSERTION`：执行已确认的投影；断言不满足时进入人工队列并停止该转换。",
    "- `MANUAL_REVIEW`：记录候选，保持原值。",
    "- `QUARANTINE_ONLY`：保持原隔离状态，不制造业务关系。",
    "- `NEVER_TOUCH`：保留原始事实与身份。",
    "",
]
for rule in manifest["rules"]:
    out.extend([
        f"## {rule['ruleId']} · {rule['name']}", "",
        f"- Rule ID：`{rule['ruleId']}`；版本：`{rule['version']}`；级别：`{rule['severity']}`；风险：`{rule['risk']}`。",
        f"- 适用文件：`{', '.join(rule['applicableFilePatterns'])}`；Sheet：`{rule['sheet']}`；字段：`{rule['field']}`。",
        f"- 触发条件：{rule['trigger']}。",
        f"- 清洗动作：`{json.dumps(rule['transform'], ensure_ascii=False)}`；改变业务值：{'是' if rule['changesBusinessValue'] else '否'}。",
        f"- before：`{rule['beforeExample']}`；after：`{rule['afterExample']}`。",
        f"- 断言：{'；'.join(rule['assertions'])}。",
        f"- 来源依据：{rule['sourceAuthority']}。",
        f"- 首次引入批次：`{rule['introducedBatch']}`；最后修改批次：`{rule['lastModifiedBatch']}`。",
        "",
    ])
(root / "TPLUS_CLEANING_RULES.md").write_text("\n".join(out).rstrip() + "\n")
print(f"Rendered {len(manifest['rules'])} rules")
