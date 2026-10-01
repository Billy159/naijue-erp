import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORK = Path(__file__).resolve().parent
RULES = ROOT / 'data-cleaning/size-mapping'
analysis = json.loads((WORK / 'analysis.json').read_text())
audit = json.loads((RULES / 'user-size-audit.json').read_text())
original = {r['sku']: r for r in audit['matches']}
accepted = analysis['problems'] + analysis['groupReview']
assert len(accepted) == 402 and len({r['sku'] for r in accepted}) == 402
assert not (RULES / 'accepted-size-decisions.json').exists(), 'Preserve an existing decision revision'
decisions = []
for record in accepted:
    row = original[record['sku']]
    target = record['expected']
    assert target is not None
    for key in ['product', 'sourceCode', 'sourceSize', 'sourceGroup', 'color']:
        assert row[key] == record[key], ('Historical identity changed', key, row['sku'])
    assert any(g['id'] == target['groupId'] and any(s['name'] == target['name'] for s in g['sizes']) for g in analysis['groups'])
    decisions.append({
        'sku': row['sku'],
        'source': {key: row[key] for key in ['product', 'sourceCode', 'sourceSize', 'sourceGroup', 'color']},
        'targetGroup': target['groupId'],
        'target': [target['group'], row['target'][1], target['code'] or row['sourceCode'], target['name']],
        'scope': record['status'],
        'basis': record['basis'],
        'workbookRows': record['workbookRows'],
    })
policy = {
    'revision': 'TPLUS-SIZE-DECISIONS-20261001',
    'approvedDate': '2026-10-01',
    'authorization': '修正映射错误，同步C2中裤、旧西裤、119TX5272201、分类后尺码，配饰归到配饰均码组。',
    'accessoryInterpretation': '按审核表建议归入配饰均码组；历史910·无尺码名称及扫码含义保留，新组同时保有均码成员。',
    'sourceWorkbook': {'path': 'inputs/TPLUS-SIZE-RULE-AUDIT-20261001/新老尺码对照表2.0(2).xlsx', 'sha256': analysis['sources'][0]['sha256']},
    'auditWorkbook': {'path': 'inputs/TPLUS-SIZE-RULE-AUDIT-20261001/现存尺码映射与2.0差异对照-20261001.xlsx', 'sha256': 'd25884b1c59caf4d9c46f4112c041ed5f6b49cff0d96ef5e81d3dfb8e3f83faa'},
    'decisions': decisions,
}
(RULES / 'accepted-size-decisions.json').write_text(json.dumps(policy, ensure_ascii=False, indent=2) + '\n')
active_rules = {
    'source': policy['sourceWorkbook']['path'],
    'sha256': policy['sourceWorkbook']['sha256'],
    'revision': policy['revision'],
    'priority': ['历史原SKU身份和历史字段保留', '已裁定商品/SKU映射（user-size-audit.json及accepted-size-decisions.json）', '历史910·无尺码优先于原表910→40', '2.0(2)原表定义'],
    'acceptedDecisions': 'accepted-size-decisions.json',
    'rules': analysis['latestRules'],
}
(WORK / 'proposed-user-size-rules.json').write_text(json.dumps(active_rules, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'acceptedSkus': len(decisions), 'products': len({r['source']['product'] for r in decisions}), 'sourceRules': len(active_rules['rules']), 'decisionSha256': hashlib.sha256((RULES / 'accepted-size-decisions.json').read_bytes()).hexdigest()}, ensure_ascii=False))
