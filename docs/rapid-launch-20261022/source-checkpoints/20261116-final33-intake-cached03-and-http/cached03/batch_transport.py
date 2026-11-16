"""Bounded OpenSSH child I/O. Only validated remote durability renews upload time."""
import json
import os
import selectors
import subprocess
import time
import re


class Incomplete(RuntimeError):
    def __init__(self,code,details=None):
        super().__init__(code);self.details=details or {}


def stream(args,data,*,total,stall,progress,deadline=None):
    now=time.monotonic()
    hard=min(now+total,deadline) if deadline is not None else now+total
    if hard<=now:
        raise Incomplete("BATCH_UPLOAD_DEADLINE_BEFORE_SSH")
    idle=time.monotonic()+stall
    started=now;last_ack=now;phase='SSH_IO'
    offset=0
    buf=bytearray()
    def timeout():
        at=time.monotonic()
        code='TOTAL_UPLOAD_DEADLINE_EXHAUSTED' if at>=hard else 'IDLE_DURABLE_PROGRESS_TIMEOUT'
        return Incomplete(code,{'phase':phase,'elapsedSeconds':round(at-started,3),
            'lastAckAgeSeconds':round(at-last_ack,3),'idleLimitSeconds':stall,'sentBytes':offset})
    with subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL) as child:
        try:
            with selectors.DefaultSelector() as s:
                os.set_blocking(child.stdout.fileno(),False)
                s.register(child.stdout,selectors.EVENT_READ,"read")
                if data:
                    os.set_blocking(child.stdin.fileno(),False)
                    s.register(child.stdin,selectors.EVENT_WRITE,"write")
                else:child.stdin.close()
                while s.get_map():
                    left=min(hard,idle)-time.monotonic()
                    if left<=0 or not (events:=s.select(left)):
                        raise timeout()
                    for key,_ in events:
                        if key.data=="write":
                            if time.monotonic()>=min(hard,idle):
                                raise timeout()
                            try:n=os.write(child.stdin.fileno(),memoryview(data)[offset:offset+65536])
                            except BlockingIOError:continue
                            offset+=n
                            if offset==len(data):
                                s.unregister(child.stdin);child.stdin.close()
                        else:
                            try:b=os.read(child.stdout.fileno(),8192)
                            except BlockingIOError:continue
                            if not b:
                                s.unregister(child.stdout)
                                continue
                            buf.extend(b)
                            if len(buf)>65536:raise Incomplete("BOUNDED_RECEIPT_REQUIRED")
                            while b"\n" in buf:
                                line,_,tail=buf.partition(b"\n");buf=bytearray(tail)
                                if progress(json.loads(line)):
                                    last_ack=time.monotonic();idle=last_ack+stall
                phase='SSH_EXIT'
                remaining=min(hard,idle)-time.monotonic()
                if remaining<=0:
                    raise timeout()
                if offset!=len(data) or buf or child.wait(timeout=remaining):
                    raise Incomplete("INCOMPLETE_SSH_CHILD_NO_REPLAY")
        except (OSError,ValueError,subprocess.TimeoutExpired,Incomplete) as error:
            if child.poll() is None:child.kill()
            child.wait()
            if isinstance(error,Incomplete):raise
            if isinstance(error,subprocess.TimeoutExpired):raise timeout() from None
            code=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z][A-Z0-9_]{0,159}',str(error)) else 'SSH_IO_'+type(error).__name__.upper()
            raise Incomplete(code,{'phase':phase,'elapsedSeconds':round(time.monotonic()-started,3),
                'lastAckAgeSeconds':round(time.monotonic()-last_ack,3),'sentBytes':offset}) from None
