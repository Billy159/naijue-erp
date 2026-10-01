import csv,json,hashlib
from pathlib import Path
from collections import Counter,defaultdict
prior=Path('work/TPLUS-DECISIONS-20260922/categories')
audit=Path('work/TPLUS-AUDIT-20260922/products')
out=Path('work/TPLUS-DECISION-RESULTS-20260922/categories')
input_paths=[prior/x for x in ['groups.json','batches.json','members.csv','auto_resolved.json','source_detail_901.json']]+[audit/x for x in ['taxonomy.json','category_reliable.csv','category_ambiguous.csv','category_unidentified.csv']]+[Path('T+数据/基础档案/存货.xlsx')]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
before={str(p):sha(p) for p in input_paths}
groups=json.loads((prior/'groups.json').read_text()); group_by_id={g['id']:g for g in groups}
batches=json.loads((prior/'batches.json').read_text());batch_by_group={gid:b for b in batches for gid in b['group_ids']}
members=list(csv.DictReader((prior/'members.csv').open(encoding='utf-8-sig')))
autos=json.loads((prior/'auto_resolved.json').read_text());auto_by_code={r['code']:r for r in autos}
raw={r['code']:r for r in json.loads((prior/'source_detail_901.json').read_text())}
reliable=list(csv.DictReader((audit/'category_reliable.csv').open(encoding='utf-8-sig')))
tree=json.loads((audit/'taxonomy.json').read_text());by_id={r['id']:r for r in tree}
leaves={r['name']:r for r in tree if r['leaf']}
allowed_parents={r['name']:r for r in tree if not r['leaf'] and r['name'] in ['西服','皮革服装','长裤','毛皮服装']}
allowed=leaves|allowed_parents
# Scope is exclusively the 22 products in original P13. No global name rewrite is performed.
p13_name_decisions={
 '659JK5386182':'夹克','709JK5386183':'夹克','732JK5386186':'夹克','709JK5376183':'夹克','709JK8386183':'夹克','659JK8386182':'夹克',
 '633JK8376182':'风衣','633JK5376182':'风衣','633JK6366136':'夹克','709JK5396181':'风衣',
 '000YR0000008':'棉服','000JK0000006':'夹克',
 '501XF5365887':'套西','655YR5588311':'羽绒服','703JK5176131':'夹克','368MS5373275':'毛衫','620FY8366172':'风衣','633FY6366173':'风衣'
}
questions={
 'Q-CAT-01':{'batch':'P01','codes':['D1230153','D5312302-黑色','D5312302-灰色'],'reason':'P01原表另含3款打底衫，原拟长袖T恤；本轮“针织衫统一毛衫”未明确覆盖打底衫，不擅自扩大。','proposed_category':'长袖T恤','candidates':['长袖T恤','毛衫','卫衣'],'question':'这3款打底衫是否沿用原提案归长袖T恤？确认＝长袖T恤；修改＝指定类别。'},
 'Q-CAT-02':{'batch':'P13','codes':['000KZ0000009'],'reason':'名称“样品裤子（长裤、中裤）”主品类只有裤子，长裤与中裤并列；名称优先仍无法唯一。','proposed_category':None,'candidates':['长裤','中裤'],'question':'样品裤子归父级长裤，还是中裤？'},
 'Q-CAT-03':{'batch':'P13','codes':['0002'],'reason':'名称“样衣（棉衣  羽绒服）”没有括号外的主体品类，棉衣与羽绒服并列。','proposed_category':None,'candidates':['棉服','羽绒服'],'question':'这款混合样衣归棉服，还是羽绒服？'},
 'Q-CAT-04':{'batch':'P13','codes':['710MP5538851'],'reason':'主名称毛皮服装是当前父级；本轮允许直挂父级仅西服、皮革服装、长裤，不包括毛皮服装。','proposed_category':None,'candidates':['吊面毛皮服装','尼克服'],'question':'毛皮服装归吊面毛皮服装，还是尼克服？不自动新增父级直挂授权。'},
 'Q-CAT-05':{'batch':'P13','codes':['753MJ5386312'],'reason':'主名马夹没有材质/用途类别；P10全6款归羽绒服有明确原组边界，不能自动扩到此款。','proposed_category':None,'candidates':['毛衫','夹克','其他辅料'],'question':'此款马夹归毛衫、夹克还是其他辅料？'}
}
q_by_code={code:(qid,q) for qid,q in questions.items() for code in q['codes']}
final_clarifications={
 'D1230153':'毛衫','D5312302-黑色':'毛衫','D5312302-灰色':'毛衫',
 '000KZ0000009':'长裤','0002':'羽绒服','753MJ5386312':'羽绒服','710MP5538851':'毛皮服装'
}
rule_text={
 'P01':'针织类统一毛衫；用户随后明确3款打底衫也归毛衫，因此本项187款全部毛衫。',
 'P02':'原有毛呢/羊毛证据36款归毛呢夹克，其余196款（含原6款未知）归夹克。',
 'P03':'80款毛呢大衣，59款大衣。',
 'P04':'原6套西、7单西保留；原121款未知直挂父级西服。',
 'P05':'旧资料明确28款按原提案；其余43款中T恤默认短袖、衬衫/衬衣默认长袖。',
 'P06':'37款风衣。',
 'P07':'5款毛呢派克、9款派克。',
 'P08':'1款PU服装；其余11款直挂父级皮革服装。',
 'P09':'9款未知裤装直挂父级长裤。',
 'P10':'原P10全部6款归羽绒服，包括327MS5353633羊毛马夹；这是本轮业务分类裁决，不改品名、不反推真实材质。',
 'P11':'原P11全部27款归其他辅料。',
 'P12':'运费、补差价、发票3款归其他辅料；只裁定商品分类，不扩展其库存或资金规则。',
 'P13':'限原P13范围，按商品主名称优先；501XF5365887按本轮尺码组冲突专项裁决归套西，不推广到全库西裤；用户随后明确样品裤子归父级长裤、混合样衣与泛马夹归羽绒服、毛皮服装直挂同名父级，并授权第4个父级直挂。'
}

def source_path(s):return s if s.startswith('T+数据/') else 'T+数据/'+s

def result_row(r):
 code=r['code'];gid=r['group_id'];g=group_by_id.get(gid);b=batch_by_group.get(gid);bid=b['id'] if b else 'AUTO';target=None;proposed=None;qid=None
 status='本轮人工裁决';source=f'用户本轮{bid}裁决';basis=rule_text.get(bid,'')
 if gid=='AUTO':
  a=auto_by_code[code];target=a['category'];status='此前8款直接证据保留';source='前轮直接证据消解，未重新裁定';basis=a['reason']
 elif code in final_clarifications:
  target=final_clarifications[code];status='本轮用户补充裁决';source=f'用户对{q_by_code[code][0]}的明确收口';basis=f'用户已明确接受该款归「{target}」；以本轮最新指令覆盖此前未定状态和提案。'
  if target=='毛皮服装':basis+=' 用户明确接受毛皮服装作为第4个可直挂既有父级；不新增分类节点。'
 elif bid=='P01':target='毛衫'
 elif bid=='P02':target='毛呢夹克' if g['proposal']=='毛呢夹克' else '夹克'
 elif bid=='P03':target='毛呢大衣' if g['proposal']=='毛呢大衣' else '大衣'
 elif bid=='P04':target=g['proposal'] if g['proposal'] in ['套西','单西'] else '西服'
 elif bid=='P05':
  if g['proposal']:target=g['proposal']
  elif '长袖T恤' in g['candidates']:target='短袖T恤'
  elif '长袖衬衫' in g['candidates']:target='长袖衬衫'
  else:raise AssertionError((code,g))
 elif bid=='P06':target='风衣'
 elif bid=='P07':target=g['proposal']
 elif bid=='P08':target='PU服装' if g['proposal']=='PU服装' else '皮革服装'
 elif bid=='P09':target='长裤'
 elif bid=='P10':target='羽绒服'
 elif bid in ['P11','P12']:target='其他辅料'
 elif bid=='P13':target=p13_name_decisions[code]
 else:raise AssertionError((code,bid))
 cat=allowed.get(target)
 assert target is None or cat is not None,(code,target)
 candidates=q_by_code[code][1]['candidates'] if code in q_by_code else ([target] if target else [])
 return {
  'code':code,'name':r['name'],'batch_id':bid,'batch_name':b['name'] if b else '前轮直接证据8款','group_id':gid,
  'decision_status':status,'target_id':cat['id'] if cat else None,'target_name':target,
  'target_level':('父级直挂' if not cat['leaf'] else '叶子') if cat else '未定',
  'target_parent_name':cat['parent'] if cat else None,
  'decision_source':source,'decision_basis':basis,'question_id':qid,'resolved_question_id':q_by_code[code][0] if code in final_clarifications else None,
  'unconfirmed_proposal':proposed,'unresolved_candidates':candidates if target is None else [],
  'prior_proposal':r['proposed_category'] or None,'prior_candidates':json.loads(r['decision_candidates']),
  'source_file':source_path(r['source_file']),'source_sheet':r['sheet'],'source_row':int(r['row']),
  'old_category_for_review_only':r['old_category_for_review_only'],
  'original_description':r['description'],'original_size_group':r['size_group'],
  'original_invoice_name':raw[code]['invoice_name'],
  'source_record_preserved':True,'applied_to_runtime':False
 }
result=sorted([result_row(r) for r in members],key=lambda r:r['source_row'])
result_by_code={r['code']:r for r in result}
full=list(result)
for r in reliable:
 cat=by_id[r['target_id']]
 assert cat['name']==r['target_name'] and cat['leaf']
 full.append({'code':r['code'],'name':r['name'],'batch_id':'UNCHANGED-2040','batch_name':'原可靠映射2040款原样保留','group_id':None,
  'decision_status':'原可靠映射未涉及','target_id':r['target_id'],'target_name':r['target_name'],'target_level':'叶子','target_parent_name':cat['parent'],
  'decision_source':'原审计category_reliable.csv，未受本轮人工裁决影响','decision_basis':r['evidence'],'question_id':None,'resolved_question_id':None,'unconfirmed_proposal':None,'unresolved_candidates':[],
  'prior_proposal':r['target_name'],'prior_candidates':json.loads(r['candidates']),
  'source_file':source_path(r['source_file']),'source_sheet':r['sheet'],'source_row':int(r['row']),
  'old_category_for_review_only':r['old_category_for_review_only'],'original_description':r['description'],'original_size_group':r['size_group'],'original_invoice_name':None,
  'source_record_preserved':True,'applied_to_runtime':False})
full.sort(key=lambda r:r['source_row'])

def write_pair(name,data,empty_fields=None):
 (out/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 if data or empty_fields:
  fields=list(data[0]) if data else empty_fields
  with (out/(name+'.csv')).open('w',encoding='utf-8-sig',newline='') as f:
   w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
   for r in data:w.writerow({k:json.dumps(v,ensure_ascii=False) if isinstance(v,(list,dict)) else ('' if v is None else v) for k,v in r.items()})
write_pair('decisions_901',result)
write_pair('full_mapping_2941',full)
summary=[]
for b in batches:
 rr=[r for r in result if r['batch_id']==b['id']]
 counts=Counter(r['target_name'] or '待补充裁决' for r in rr)
 summary.append({'batch_id':b['id'],'batch_name':b['name'],'count':len(rr),'resolved':sum(r['target_name'] is not None for r in rr),'unresolved':sum(r['target_name'] is None for r in rr),'target_counts':dict(counts),'decision_rule':rule_text[b['id']]})
write_pair('batch_summary',summary)
clarifications=[]
for qid,q in questions.items():
 rr=[result_by_code[c] for c in q['codes']]
 clarifications.append({'resolved_question_id':qid,'batch_id':q['batch'],'count':len(rr),'codes':q['codes'],'names':[r['name'] for r in rr],'source_rows':[r['source_row'] for r in rr],'previous_reason':q['reason'],'previous_proposal':q['proposed_category'],'final_target':final_clarifications[q['codes'][0]],'status':'用户已明确接受，已收口','decision_source':'用户本轮最后7款补充裁决'})
write_pair('clarification_resolution',clarifications)
unresolved=[]
write_pair('unresolved',unresolved,['question_id','batch_id','count','codes','names','source_rows','reason','unconfirmed_proposal','candidates','question'])
md=['# 商品分类裁决结果（资料，未执行导入）','',
'[COMPUTED|HIGH] 893款人工范围已全部按用户裁决落类，另保留前轮8款直接证据，原901款全部闭合、0款待定。原2040款可靠映射未受影响。全量2941款均已有目标类别。','',
'本轮只生成映射资料，不修改商品原名、原描述、原始分类树、源工作簿或运行代码，不导入数据。用户明确允许直挂既有西服、皮革服装、长裤、毛皮服装4个父级；其余使用现有叶子。','',
'| 项目 | 商品数 | 本轮目标分类 | 未定 |','|---|---:|---|---:|']
for s in summary:
 md.append(f"| {s['batch_id']} {s['batch_name']} | {s['count']} | {'；'.join(f'{k} {v}款' for k,v in s['target_counts'].items())} | {s['unresolved']} |")
md+=['','## 适用边界','',
'- P01原有3款打底衫经用户最后明确裁定归毛衫；原长袖T恤仅保留在历史提案字段，不作为当前目标。',
'- P10羊毛马夹327MS5353633按用户本轮业务裁决归羽绒服；保留原品名/描述，这不证明其实际填充物是羽绒。',
'- P13中501XF5365887归套西仅针对原P13冲突商品；原可靠清单22款西裤保持西裤。',
'- P13样品棉服000YR0000008与样品薄茄克000JK0000006按主体品名分别归棉服、夹克；不删除括号中的原说明。',
'- 运费、补差价、发票仅完成类别归其他辅料，不据此产生或改变库存、资金、审核等业务规则。',
'- P13样品裤子000KZ0000009归父级长裤；0002混合样衣及753MJ5386312马夹归羽绒服；710MP5538851归父级毛皮服装，均有用户明确补充裁决。',
'- 父级直挂143款：西服121、皮革服装11、长裤10、毛皮服装1；没有新增任何分类节点。','',
'## 文件','',
'- [原901款逐款裁决](decisions_901.csv) / [JSON](decisions_901.json)',
'- [全2941款映射资料](full_mapping_2941.csv) / [JSON](full_mapping_2941.json)',
'- [最后7款的明确收口记录](CLARIFICATIONS.md)',
'- [验证结果](VALIDATION.json)',
'- 前轮组号与成员保留；本轮结果输出到新目录，不覆盖旧清单。']
(out/'SUMMARY.md').write_text('\n'.join(md)+'\n')
qm=['# 商品分类：最后7款已收口','',
'用户已明确接受以下5项收口，涉及7款；不存在待补充分类问题。未执行导入。','',
'| 原问题编号 | 原款号／原名称 | 数量 | 最终类别 | 依据 |','|---|---|---:|---|---|']
for q in clarifications:
 reps='；'.join(c+' · '+result_by_code[c]['name'] for c in q['codes'])
 qm.append(f"| {q['resolved_question_id']} | {reps} | {q['count']} | {q['final_target']} | {q['decision_source']} |")
(out/'CLARIFICATIONS.md').write_text('\n'.join(qm)+'\n')
(out/'UNRESOLVED.md').write_text('# 商品分类未定事项\n\n0项。原最后7款已由用户明确裁决，详见 [收口记录](CLARIFICATIONS.md)。未执行导入。\n')
full_by_code={r['code']:r for r in full};input_members={r['code']:r for r in members}
expected_unresolved=set()
parents=Counter(r['target_name'] for r in result if r['target_level']=='父级直挂')
saved_json=json.loads((out/'full_mapping_2941.json').read_text())
saved_csv=list(csv.DictReader((out/'full_mapping_2941.csv').open(encoding='utf-8-sig')))
checks={
 '901_original_members_exact':len(result)==901 and len(result_by_code)==901 and set(result_by_code)==set(input_members),
 '2941_full_unique':len(full)==2941 and len(full_by_code)==2941,
 'zero_unresolved':{r['code'] for r in result if r['target_name'] is None}==expected_unresolved and len(unresolved)==0,
 '5_questions_7_products_closed':len(clarifications)==5 and sum(r['count'] for r in clarifications)==7,
 '893_manual_all_resolved':sum(s['count'] for s in summary)==893 and sum(s['resolved'] for s in summary)==893,
 '901_all_resolved':sum(r['target_name'] is not None for r in result)==901,
 '2941_all_resolved':sum(r['target_name'] is not None for r in full)==2941,
 '8_auto_unchanged':len(autos)==8 and all(result_by_code[a['code']]['target_id']==a['target_id'] for a in autos),
 '2040_reliable_unchanged':len(reliable)==2040 and all(full_by_code[r['code']]['target_id']==r['target_id'] and full_by_code[r['code']]['name']==r['name'] for r in reliable),
 'original_names_unchanged':all(r['name']==input_members[r['code']]['name'] for r in result),
 'original_descriptions_unchanged':all(r['original_description']==input_members[r['code']]['description'] for r in result),
 'only_existing_categories':all(r['target_id'] is None or r['target_id'] in by_id for r in full),
 'parents_limited_to_four':set(parents)=={'西服','皮革服装','长裤','毛皮服装'} and dict(parents)=={'西服':121,'皮革服装':11,'长裤':10,'毛皮服装':1},
 'P02_36_and_196':next(s['target_counts'] for s in summary if s['batch_id']=='P02')=={'夹克':196,'毛呢夹克':36},
 'P03_80_and_59':next(s['target_counts'] for s in summary if s['batch_id']=='P03')=={'大衣':59,'毛呢大衣':80},
 'P10_6_down_including_wool_vest':all(r['target_name']=='羽绒服' for r in result if r['batch_id']=='P10') and result_by_code['327MS5353633']['target_name']=='羽绒服',
 'P13_special_suit_scoped':result_by_code['501XF5365887']['batch_id']=='P13' and result_by_code['501XF5365887']['target_name']=='套西' and all(full_by_code[r['code']]['target_name']=='西裤' for r in reliable if r['target_name']=='西裤'),
 'P13_main_name_two_specific':result_by_code['000YR0000008']['target_name']=='棉服' and result_by_code['000JK0000006']['target_name']=='夹克',
 'P01_base_layers_final_sweaters':all(result_by_code[c]['target_name']=='毛衫' and result_by_code[c]['prior_proposal']=='长袖T恤' and result_by_code[c]['unconfirmed_proposal'] is None for c in questions['Q-CAT-01']['codes']),
 'final_7_targets_exact':len(final_clarifications)==7 and all(result_by_code[c]['target_name']==t for c,t in final_clarifications.items()),
 'no_runtime_application':all(not r['applied_to_runtime'] for r in full),
 'saved_csv_json_identity_and_targets_match':len(saved_json)==len(saved_csv)==2941 and all((a['code'],a['name'],a['target_id'],a['target_name'])==(b['code'],b['name'],b['target_id'],b['target_name']) for a,b in zip(saved_json,saved_csv)),
 'saved_unresolved_csv_empty':not list(csv.DictReader((out/'unresolved.csv').open(encoding='utf-8-sig'))),
 'all_input_hashes_unchanged':before=={str(p):sha(p) for p in input_paths},
}
validation={'all_pass':all(checks.values()),'counts':{'source_products':2941,'original_reliable_preserved':2040,'direct_evidence_preserved':8,'manual_scope':893,'manual_resolved':893,'manual_unresolved':0,'original_901_resolved':901,'full_resolved':2941,'minimal_questions':0,'closed_clarification_products':7,'parent_assignments':dict(parents)},'checks':checks,'input_sha256':before,'batch_summary':summary,'source_rules':'本轮用户正式裁决及最后7款明确收口，由主代理传达；不含导入/运行代码修改授权。'}
(out/'VALIDATION.json').write_text(json.dumps(validation,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'counts':validation['counts'],'checks':checks},ensure_ascii=False,indent=2))
assert validation['all_pass'],checks
