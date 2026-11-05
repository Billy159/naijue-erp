/** Node's Unix socket stdin cannot always be reopened as /dev/stdin.
 * Convert memory-only stdin to an anonymous OS pipe, then exec the pinned tool.
 * No password goes in argv/environment/files. Python isolated/no-site mode. */
import{need}from'./lifecycle.mjs';
export const PIPE_PYTHON='/usr/bin/python3';
export const PIPE_CODE=`import os,sys
payload=sys.stdin.buffer.read(4097)
if not payload or len(payload)>4096: raise SystemExit('bounded stdin payload required')
r,w=os.pipe()
try:
 if os.write(w,payload)!=len(payload): raise SystemExit('short anonymous-pipe write')
finally: os.close(w)
os.dup2(r,0)
if r!=0: os.close(r)
os.execve(sys.argv[1],sys.argv[1:],os.environ)
`;
export function pipeCommand(executable,args){need(typeof executable==='string'&&executable.startsWith('/')&&!executable.includes('\0')&&Array.isArray(args)&&args.every(x=>typeof x==='string'&&!x.includes('\0')),'CLOSED_PIPE_EXEC_ARGUMENTS_REQUIRED');return Object.freeze({executable:PIPE_PYTHON,args:Object.freeze(['-I','-S','-c',PIPE_CODE,executable,...args])});}
