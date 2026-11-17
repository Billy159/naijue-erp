from pathlib import Path
import ast,hashlib,json,re,subprocess
R=Path.cwd();V=R/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
P=V/'NORMAL38-SOURCE-SUCCESSOR-03';A=V/'NORMAL38-SOURCE-SUCCESSOR-02';OLD=V/'NORMAL37-SOURCE-SUCCESSOR-01'
J=V/'NORMAL38-JOINT-WIRING-SOURCE-02';J0=V/'NORMAL38-JOINT-WIRING-SOURCE-01'
O=R/'outputs/QB/20261117-r3-normal38-joint-review-01';sha=lambda b:hashlib.sha256(b).hexdigest();checks={}
def ck(k,v):
    checks[k]=bool(v)
    if not v:raise AssertionError(k)
def load(p):return json.loads(p.read_bytes())
def assigns(p):
    vals={}
    for n in ast.parse(p.read_bytes()).body:
        if isinstance(n,ast.Assign):
            try:v=ast.literal_eval(n.value)
            except(ValueError,TypeError):continue
            for t in n.targets:
                if isinstance(t,ast.Name):vals[t.id]=v
    return vals
source=load(P/'SOURCE-PINS.json');rules=load(P/'PHASES38.UNISSUED.json');interface=load(P/'INTERFACE.UNISSUED.json')
ck('FinalConsumerSourceExact',sha((P/'SOURCE-PINS.json').read_bytes())=='fb8f2e938e62902db3165ed792656eb5ebd3cd13c1dec093dde308e4d1a62aec')
ck('All55FrozenLocalMembers',len(source['files'])==55 and all(sha((P/k).read_bytes())==v['sha256']and len((P/k).read_bytes())==v['bytes']for k,v in source['files'].items()))
ck('ExactInterfaceAndRules',sha((P/'INTERFACE.UNISSUED.json').read_bytes())==source['interfaceSha256']=='30fe85689b72d4148f930877a455a108e4b924fa82a31992e4571eb6af0fcffe'and sha((P/'PHASES38.UNISSUED.json').read_bytes())==source['rulesSha256']=='f775c7870086b55e62851dd6b5bb558662ad9474f688c1ed13b8e528844d1ed6')
runtime=[str(p.relative_to(P))for p in P.glob('*/bundle/*')if p.is_file()]
ck('Exactly46RuntimeMembersNoDynamicAuthority',len(runtime)==46 and all(k in source['files']for k in runtime))
for phase,row in rules['jobs'].items():
    folder=P/phase/'bundle'
    ck(phase+'ActualDirectoryAndAllPins',row['jobId']==interface['jobs'][phase]and row['timeoutSeconds']=={'apply':300,'start':300,'prepare':780,'writer':3000,'stop':120,'restore':300}[phase]and row['sourceDirectory']==interface['phaseDirectories'][phase]==str(folder)and set(row['bundlePins'])=={p.name for p in folder.iterdir()}and all(sha((folder/k).read_bytes())==pin for k,pin in row['bundlePins'].items()))
    ck(phase+'UnissuedPlaceholdersRemainUnissued',row['authoritySha256']is None)
ck('UnchangedOriginalCLIWithCurrentBlueprint',(P/'phase_cli.py').read_bytes()==(A/'phase_cli.py').read_bytes()and(P/'phase_cli.py').read_text()==(OLD/'phase_cli.py').read_text().replace('PHASES37.UNISSUED.json','PHASES38.UNISSUED.json'))
changed=[k for k in runtime if(P/k).read_bytes()!=(A/k).read_bytes()]
mapping={}
for k in runtime:
    x,y=sha((A/k).read_bytes()),sha((P/k).read_bytes())
    if x!=y:
        if x in mapping:assert mapping[x]==y
        mapping[x]=y
def unpin(text):
    for old,new in mapping.items():text=text.replace(new,old)
    return text
stages=('WRITER_SCOPE','WRITER_CALL','WRITER_READBACK')
for phase in ('prepare','start','writer'):
    name=phase+'/bundle/final33-run.mjs';text=(P/name).read_text();normalized=text
    normalized=normalized.replace(",'WRITER_SCOPE','WRITER_CALL','WRITER_READBACK'",'')
    normalized=normalized.replace("failureStage='WRITER_SCOPE';","failureStage='UNKNOWN';").replace("   failureStage='WRITER_CALL';\n",'').replace("    failureStage='WRITER_READBACK';\n",'')
    ck(phase+'RunnerOnlyExactThreeStageEdits',normalized==(A/name).read_text())
    ck(phase+'StageAssignmentsPrecedeExactOriginalCalls',text.index("failureStage='WRITER_SCOPE'")<text.index('options.explicitZeroApproval=await persistedScope')<text.index("failureStage='WRITER_CALL'")<text.index('result=await api.runFinalR3Writer03')<text.index("failureStage='WRITER_READBACK'")<text.index('const verified=await api.runFinalR3Readback03'))
ck('ThreeRunnerCopiesIdentical',len({sha((P/p/'bundle/final33-run.mjs').read_bytes())for p in ('prepare','start','writer')})==1)
for k in changed:
    if k.endswith('final33-run.mjs'):continue
    txt=unpin((P/k).read_text())
    if k.endswith('final33_host.py'):txt=txt.replace(", 'WRITER_SCOPE', 'WRITER_CALL', 'WRITER_READBACK'",'')
    ck('StageOrNecessaryPinOnly_'+k,txt==(A/k).read_text())
ck('12Changed34RuntimeMembersReused',len(changed)==12 and len(runtime)-len(changed)==34)
reader=assigns(P/'read_pending38.py')['program'];old_reader=assigns(A/'read_pending38.py')['program']
ck('ReadonlyCollectorOnlyStageAllowlistExpanded',reader.replace(", 'WRITER_SCOPE', 'WRITER_CALL', 'WRITER_READBACK'",'')==old_reader)
embedded=ast.parse(reader);enum=next(ast.literal_eval(n.value)for n in embedded.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='DIAGNOSTIC_ENUMS'for t in n.targets))
for phase in ('prepare','writer'):
    host=assigns(P/phase/'bundle/final33_host.py')
    ck(phase+'SixFieldsAndCollectorEnumsExact',host['DIAGNOSTIC_ENUMS']==enum and set(enum)=={'format','stage','errorType','systemCode','guardCode','sqlstate'}and all(s in enum['stage']for s in stages))
    ck(phase+'Outer04Native01Plan04Unchanged',host['PREPARATION_IDENTITY_MAPPING']==interface['preparationIdentityMapping']and host['PREPARE']=='t45-r3-final33-plan-prepare-20261116-04'and host['LOGICAL_PREPARE']=='t45-r3-final33-plan-prepare-20261116-01')

# The 42 previously reviewed load edges keep their exact syntax/wiring. Bind
# their named constants to the current final bytes, not copied02 evidence pins.
deps=load(A/'LITERAL-LOAD-DEPENDENCIES.json');edge_rows=[]
for e in deps['edges']:
    vals=assigns(P/e['source']);label=e['constant'];binding=label
    if label.startswith('PINS:')and 'PINS'not in vals and 'STATIC_PINS'in vals:binding='STATIC_'+label
    actual=vals[binding]if ':'not in binding else vals[binding.split(':',1)[0]][binding.split(':',1)[1]]
    ck('CurrentPin_'+e['source']+'_'+label,actual==sha((P/e['target']).read_bytes()))
    edge_rows.append({**e,'actualASTBinding':binding,'sha256':actual})
ck('Same42EdgeShapesReused',len(edge_rows)==42)
inventory=load(J0/'ALL-FINAL-MEMBER-LOAD-SITES.json');inline=[]
for row in inventory['inlinePinEdges']:
    path=P/row['source'];tree=ast.parse(path.read_bytes());pairs=[tuple(n.value for n in x.elts)for x in ast.walk(tree)if isinstance(x,ast.Tuple)and len(x.elts)==2 and all(isinstance(n,ast.Constant)and isinstance(n.value,str)for n in x.elts)]
    pin=sha((path.parent/row['target']).read_bytes());ck('CurrentInline_'+row['target'],(row['target'],pin)in pairs);inline.append({**row,'sha256':pin})
ck('SameSevenInlineStageMembersRebound',len(inline)==7)
for row in inventory['localImportEdges']:
    ck('CurrentLocalImport_'+row['source']+'_'+row['module'],sha((P/row['target']).read_bytes())==assigns(P/row['source']).get('PINS',{}).get(Path(row['target']).name,sha((P/row['target']).read_bytes())))

# Runtime Python logic differs from accepted37 only by approved current and
# predecessor literals. The native/business implementations are reused.
class NoString(ast.NodeTransformer):
    def visit_Constant(self,n):return ast.copy_location(ast.Constant(value='STR'),n)if isinstance(n.value,str)else n
for k in runtime:
    prev=k.replace('prior_preserved37.py','prior_preserved36.py')
    if k.endswith('.py'):ck('SamePythonOperationAST_'+k,ast.dump(NoString().visit(ast.parse((A/k).read_bytes())))==ast.dump(NoString().visit(ast.parse((OLD/prev).read_bytes()))))
ck('CurrentPrepareStopBatch04',assigns(P/'stop/bundle/normal05_preserve_stop.py')['CURRENT_BATCH_OPERATIONS']==('t45-r3-batched-install-20261116-02','t45-r3-batched161-command-successor-20261116-01','t45-r3-final33-plan-prepare-20261116-04','t45-r3-batched-real-execute-20261115-01'))
ck('HistoricalCatalog35AndWriterUnchanged',interface['historicalCatalogUpdate']==load(OLD/'INTERFACE.UNISSUED.json')['historicalCatalogUpdate']and interface['jobs']['writer']=='t45-r3-batched-real-execute-20261115-01')
for k in runtime:
    if k.endswith('.py'):compile((P/k).read_bytes(),str(P/k),'exec')
compile((J/'invoke_once.py').read_bytes(),str(J/'invoke_once.py'),'exec');ast.parse(reader)
node=R.parent/'work/local-takeover-runtime-20261022/node-v24.21.0-darwin-arm64/bin/node'
for k in [k for k in runtime if k.endswith('.mjs')]:
    q=subprocess.run([str(node),'--check',str(P/k)],capture_output=True,text=True,timeout=20)
    ck('SyntaxOnly_'+k,q.returncode==0)
ck('CurrentWrapperOnlyActualDirectoryAndSourcePinChanged',(J/'invoke_once.py').read_text()==(J0/'invoke_once.py').read_text().replace("CONSUMER = HERE.parent / 'NORMAL38-SOURCE-SUCCESSOR-02'","CONSUMER = HERE.parent / 'NORMAL38-SOURCE-SUCCESSOR-03'").replace("SOURCE_SHA = '7e3a6ebe38b74a7f60a990c15ad9f5ea915977133a9134aff8935ee1e58ae5e0'","SOURCE_SHA = 'fb8f2e938e62902db3165ed792656eb5ebd3cd13c1dec093dde308e4d1a62aec'"))
ck('CurrentWrapperPin',sha((J/'invoke_once.py').read_bytes())=='2ca2d032580f51a5101118098ce454b2bac4a3c94a78ad90dba1032b519ace6e')
payload=dict(state='STATIC_FINAL_CONSUMER03_INCREMENT_CHECKED_NOT_RUNTIME',checks=checks,sourcePinsSha256=sha((P/'SOURCE-PINS.json').read_bytes()),interfaceSha256=source['interfaceSha256'],rulesSha256=source['rulesSha256'],runtimeChangedFrom02=changed,unchangedRuntimeMembers=34,current42PinEdges=edge_rows,currentSevenInlinePins=inline,stages=list(stages),copied02Evidence='Retained as predecessor evidence only; current03 pin rows independently rebound here',actions={'serverActions':0,'PGConnections':0,'clockCalls':0,'clientIssuerReaderCASNativeOrJobInvoked':False,'syntaxOnlyNodeCheck':True,'futureBindingAuthorityTargetOrPositiveReportFixtureCreated':False})
raw=(json.dumps(payload,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode()
with(O/'CONSUMER-INCREMENT-EVIDENCE.json').open('xb')as f:f.write(raw)
print(json.dumps({'checks':len(checks),'evidenceSha256':sha(raw),'changed':len(changed)},sort_keys=True))
