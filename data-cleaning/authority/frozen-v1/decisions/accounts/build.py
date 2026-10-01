import csv
import hashlib
import json
from pathlib import Path

ROOT = Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统')
OUT = ROOT / 'work/TPLUS-DECISION-RESULTS-20260922/accounts'
OLD = ROOT / 'work/TPLUS-DECISIONS-20260922/accounts/account-decisions.json'
FOUND = ROOT / 'work/TPLUS-AUDIT-20260922/foundations.json'
FUNDS = ROOT / 'outputs/ERP-V2-Demo-V1/ui-structure-prototype/sales-funds-data.js'
old = json.loads(OLD.read_text())
found = json.loads(FOUND.read_text())
text = FUNDS.read_text()
catalog = json.JSONDecoder().raw_decode(text[text.index('=') + 1:].lstrip())[0]
methods = {m['结算方式编码']: m['结算方式名称'] for m in catalog['methods']}
methods['mall-counter'] = '商场收银台'
assert methods['991'] == '其它'
halls = sorted(({'code':d['code'], 'name':d['name']} for d in found['departments']['hierarchy'] if d['parent']=='009'),key=lambda d:d['code'])
hall_codes = [d['code'] for d in halls]
assert len(hall_codes) == len(set(hall_codes)) == 47

pending_groups = []
rows = []
for r in old['records']:
    code = r['code']
    row = {k:r[k] for k in ['code','name','source_row','department_code','department_name','source_reference','name_difference_note']}
    if r['scope_status']=='decision':
        row.update(scope_status='user_confirmed',scope_decision_id='F01',allowed_hall_source_codes=list(hall_codes),scope_count=47,
                   scope_basis='本次用户明确：原24个范围不明账户全部开放给门店以后收款使用。范围按当前已识别47个营业厅展开，不包括11个职能部门。')
    else:
        row.update(scope_status='adopted_source_mapping',scope_decision_id=None,allowed_hall_source_codes=list(r['scope_candidate_codes']),scope_count=1,
                   scope_basis='沿用先前已明确使用部门编码对应的单一营业厅；本次不扩大这56个账户的范围。')
    if code in ['20203','91120']:
        row.update(primary_method_status='user_confirmed',primary_method_id='991',primary_method_name='其它',method_decision_id='F02' if code=='20203' else 'F03',pending_question_id=None,
                   method_basis='用户本次选“其他”，规范关联已有源方式991“其它”；不新增同义方式，也不改历史每笔方式。')
    elif r['method_status']=='auto_proposed':
        row.update(primary_method_status='adopted_source_mapping',primary_method_id=r['method_candidate'],primary_method_name=r['method_candidate_name'],method_decision_id=None,pending_question_id=None,
                   method_basis='沿用上一份清单59个明确方式映射；'+r['method_evidence'])
    else:
        row.update(primary_method_status='user_confirmed',primary_method_id='991',primary_method_name='其它',method_decision_id='F-SUPPLEMENT',pending_question_id=None,
                   method_basis='用户后续明确：普通银行15个、兴业收款码1个、备用金2个均归其它；零售抵现也归其它。采用991，仅用于当前主要方式，不改写源档及每笔历史方式。')
    rows.append(row)

summary = {
    'account_count':len(rows),
    'scope_all_47_halls_user_confirmed':sum(r['scope_decision_id']=='F01' for r in rows),
    'scope_prior_single_hall_unchanged':sum(r['scope_status']=='adopted_source_mapping' for r in rows),
    'scope_unresolved':0,
    'primary_method_prior_adopted':sum(r['primary_method_status']=='adopted_source_mapping' for r in rows),
    'primary_method_new_user_confirmed_other_991':sum(r['primary_method_status']=='user_confirmed' for r in rows),
    'primary_method_determined_total':sum(r['primary_method_status']!='pending' for r in rows),
    'primary_method_pending':sum(r['primary_method_status']=='pending' for r in rows),
    'pending_question_count':len(pending_groups),
    'applied_to_business_system':False,
    'import_executed':False,
    'rules_changed':False,
}
assert (summary['account_count'],summary['scope_all_47_halls_user_confirmed'],summary['scope_prior_single_hall_unchanged'],summary['primary_method_determined_total'],summary['primary_method_pending']) == (80,24,56,80,0)
assert summary['primary_method_prior_adopted']==59 and summary['primary_method_new_user_confirmed_other_991']==21
assert len({r['code'] for r in rows})==80
assert all(r['primary_method_id'] is not None and r['pending_question_id'] is None for r in rows)
assert all(set(r['allowed_hall_source_codes'])==set(hall_codes) for r in rows if r['scope_decision_id']=='F01')
assert all(r['allowed_hall_source_codes']==[r['department_code']] for r in rows if r['scope_status']=='adopted_source_mapping')
assert all(r['primary_method_id'] in methods for r in rows if r['primary_method_status']!='pending')
assert set(r['code'] for r in rows if r['primary_method_status']=='user_confirmed')==set(r['code'] for r in old['records'] if r['method_status']=='decision')
assert all(r['primary_method_id']=='991' for r in rows if r['primary_method_status']=='user_confirmed')
assert sum(r['method_decision_id']=='F-SUPPLEMENT' for r in rows)==19

sources=[{'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [OLD,FOUND,FUNDS]]
result = {'summary':summary,'decision_semantics':'仅记录用户裁决及后续映射；没有写入运行系统。F01批准24账户全部47厅；F02/F03和随后补充裁决共同将原21个主方式待定账户定为991其它。原59个明确主方式不变，原56个单厅范围不变，0待定。门店范围按当前47个营业厅逐条展开。','halls':halls,'records':rows,'pending_questions':pending_groups,'sources':sources}
(OUT/'account-decision-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
(OUT/'pending-method-questions.json').write_text(json.dumps(pending_groups,ensure_ascii=False,indent=2))
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
fields=['code','name','scope_status','scope_decision_id','scope_count','allowed_hall_source_codes','primary_method_status','primary_method_id','primary_method_name','method_decision_id','pending_question_id','source_reference']
with (OUT/'account-decision-results.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
    for r in rows:w.writerow({k:'、'.join(r[k]) if isinstance(r[k],list) else r[k] for k in fields})

doc='''# 资金账户裁决结果（仅记录，不导入）

已按本次答复记录：

- **F01：原24个范围不明账户全部开放给现有47个营业厅。** 其余56个账户继续采用各自原明确单厅范围。本次全部80个账户的厅范围均已有安排，不再询问启用或厅范围。
- **F02／F03：20203普陀天地农行刷卡机、91120义乌银泰ST收银台，主要方式都采用既有“其它”，编码991。** 用户表述“其他”与源方式“其它”归为同一项，不新增同义方式。
- **补充裁决：普通银行15个、兴业收款码1个、备用金2个、零售抵现1个，全部采用“其它”（991）。** 此决定来自用户后续明确答复，不从F01范围批准推断，也不采用先前转账或储值方式建议。
- 主要方式已定 **80个＝原59个＋本次先确认2个＋补充确认19个**，待定0个。

范围和方式均只记录在裁决文件。运行系统、storeIds、原业务规则和源档没有修改，未执行导入；历史每笔原方式仍保留，不再要求补历史资料或选择主方式。

## 本次确认“其它”的21个账户

| 编码 | 账户名称 | 当前主要方式 |
|---|---|---|
'''
doc+='\n'.join('| '+r['code']+' | '+r['name']+' | 其它（991） |' for r in rows if r['primary_method_status']=='user_confirmed')
doc+='''

## 证据与守恒

- “其它”991：`T+数据/基础档案/结算方式.xlsx`，结算方式A4:B4；已有静态资料的源字段镜像逐行核对相等，见上轮审计foundations.json。
- 厅集合：`T+数据/基础档案/部门.xlsx`，上级部门009直营销售中心的47个部门；结构化结果内逐条列出编码及名称。
- 80个账户逐条结果：`account-decision-results.json` / `account-decision-results.csv`。本次新裁决与原采用关系分列来源，所有账户均有唯一主方式和明确营业厅范围。
- 待问清单`pending-method-questions.json`现为空数组；此前19个条件问题已由用户补充裁决关闭。
- 守恒：24＋56＝80；59＋2＋19＝80；15＋1＋2＋1＝19。80账户编码唯一，21个新裁决方式均精确为991，原59个方式与56个单厅范围不变，0待定；所有期望值均已检查。
'''
(OUT/'DECISIONS.md').write_text(doc)
print(json.dumps(summary,ensure_ascii=False,indent=2))
