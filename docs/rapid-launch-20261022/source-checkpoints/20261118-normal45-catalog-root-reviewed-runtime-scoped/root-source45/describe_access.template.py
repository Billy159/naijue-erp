def ordinary_describe_access():
 """Actual kernel access under fixed61035 at real bind roots, no body reads.

 Called only by the future locked fresh reader. It never starts a container,
 evaluates Node, connects PostgreSQL, changes permissions or reads a plan.
 """
 import subprocess,stat
 spec=DESCRIBE_ACCESS_PATHS;fds=[];root_stats=[];root_errors=[]
 def identity(s):return[s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
 for i,mapping in enumerate(spec['maps']):
  path=Path(mapping['hostRoot'])
  try:
   assert path.resolve()==path
   fd=os.open(path,os.O_PATH|os.O_DIRECTORY|os.O_NOFOLLOW);fds.append(fd);root_stats.append(identity(os.fstat(fd)))
  except(OSError,AssertionError)as error:
   root_errors.append(dict(map=i,errno=getattr(error,'errno',None),safeCode='MAPPED_ROOT_UNAVAILABLE'))
   break
 base=dict(mappingBasis='EXACT_EXISTING_BINDS_WITH_HISTORICAL44_RECORD_PROOF',maps=spec['maps'],sourceRowsSha256=spec['sourceRowsSha256'],sourceFilesChecked=spec['sourceFilesChecked'],excludedPrivateSourceLeaf=spec['excludedPrivateSourceLeaf'],newProjection45CheckedStaticallyOnly=True,liveNamespaceProven=False,dependencyImportResolutionVerified=False,virtualImageAncestors='NOT_RECHECKED_NO_LIVE_NAMESPACE',PGConnections=0,NodeExecutions=0,bodyReads=False,permissionChanges=0)
 try:
  if root_errors:return dict(base,state='NEED_FIX_MAPPED_ORDINARY_ACCESS',actorVerified=False,rootErrors=root_errors,rows=[])
  selected=[dict(row)for row in spec['rows']]
  for row in selected:
   try:row['parentStat']=identity(os.stat(row['relative'],dir_fd=fds[row['map']],follow_symlinks=False))
   except OSError as error:row.update(parentStat=None,parentErrno=error.errno)
  child=r'''
import json,os,stat,sys
def ident(s):return[s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
actor=dict(uid=os.getuid(),euid=os.geteuid(),gid=os.getgid(),egid=os.getegid(),groups=os.getgroups())
assert actor==dict(uid=61035,euid=61035,gid=61035,egid=61035,groups=[])
p=json.load(sys.stdin);fds=p['fds'];out=[]
for row in p['rows']:
 item=dict(row);fd=fds[row['map']];name=row['relative'];item.update(access=False,openedWithoutReading=False)
 try:
  s=os.stat(name,dir_fd=fd,follow_symlinks=False);item['stat']=ident(s)
  directory=row['kind']=='directory'
  regular=stat.S_ISDIR(s.st_mode)if directory else stat.S_ISREG(s.st_mode)
  mode=(os.X_OK|(os.R_OK if row['listDirectory']else 0))if directory else(os.R_OK|(os.X_OK if row['execute']else 0))
  item['access']=bool(regular and os.access(name,mode,dir_fd=fd,effective_ids=True)and item['stat']==row['parentStat'])
  if item['access']and not directory:
   opened=os.open(name,os.O_RDONLY|os.O_NONBLOCK|os.O_NOFOLLOW,dir_fd=fd)
   try:item['access']=ident(os.fstat(opened))==item['stat'];item['openedWithoutReading']=True
   finally:os.close(opened)
 except OSError as error:item.update(errno=error.errno,safeCode='REQUIRED_PATH_NOT_ACCESSIBLE')
 out.append(item)
print(json.dumps(dict(actor=actor,rows=out),sort_keys=True))
'''
  try:
   q=subprocess.run(['/usr/bin/python3','-I','-S','-c',child],input=json.dumps(dict(fds=fds,rows=selected)).encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,pass_fds=tuple(fds),user=61035,group=61035,extra_groups=[],env={'PATH':'/usr/bin:/bin','HOME':'/','LC_ALL':'C','TZ':'UTC'},timeout=30)
  except subprocess.TimeoutExpired:return dict(base,state='NEED_FIX_MAPPED_ORDINARY_ACCESS',actorVerified=False,safeCode='ACCESS_CHILD_TIMEOUT',rows=[])
  if q.returncode!=0 or q.stderr:return dict(base,state='NEED_FIX_MAPPED_ORDINARY_ACCESS',actorVerified=False,safeCode='ACCESS_CHILD_UNCONFIRMED',rows=[])
  try:value=json.loads(q.stdout)
  except ValueError:return dict(base,state='NEED_FIX_MAPPED_ORDINARY_ACCESS',actorVerified=False,safeCode='ACCESS_CHILD_REPLY_UNCONFIRMED',rows=[])
  actor=value['actor'];observed=value['rows'];same_roots=all(identity(os.fstat(fd))==old for fd,old in zip(fds,root_stats))
  same_rows=len(observed)==len(selected)and all({k:row[k]for k in original}==original for row,original in zip(observed,selected))
  verified=actor==dict(uid=61035,euid=61035,gid=61035,egid=61035,groups=[])
  ok=verified and same_roots and same_rows and all(row['access']is True for row in observed)
  return dict(base,state='PASS_MAPPED_EXISTING_INPUT_ACCESS_ONLY_NAMESPACE_UNVERIFIED'if ok else'NEED_FIX_MAPPED_ORDINARY_ACCESS',actorVerified=verified,actor=actor,bindRootsStat9=root_stats,bindRootsUnchanged=same_roots,pathSetMatches=same_rows,rows=observed,failures=[dict(map=row['map'],relative=row['relative'],errno=row.get('errno',row.get('parentErrno')),safeCode=row.get('safeCode','ACCESS_OR_METADATA_REFUSED'))for row in observed if row['access']is not True])
 finally:
  for fd in fds:os.close(fd)
