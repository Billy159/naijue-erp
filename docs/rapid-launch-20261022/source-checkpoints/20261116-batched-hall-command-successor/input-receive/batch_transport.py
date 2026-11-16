"""Bounded OpenSSH child I/O. Only validated remote durability renews upload time."""
import json
import os
import selectors
import subprocess
import time


class Incomplete(RuntimeError):
    pass


def stream(args,data,*,total,stall,progress,deadline=None):
    now=time.monotonic()
    hard=min(now+total,deadline) if deadline is not None else now+total
    if hard<=now:
        raise Incomplete("BATCH_UPLOAD_DEADLINE_BEFORE_SSH")
    idle=time.monotonic()+stall
    offset=0
    buf=bytearray()
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
                        raise Incomplete("TOTAL_OR_DURABLE_PROGRESS_TIMEOUT")
                    for key,_ in events:
                        if key.data=="write":
                            if time.monotonic()>=min(hard,idle):
                                raise Incomplete("TOTAL_OR_DURABLE_PROGRESS_TIMEOUT")
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
                                    idle=time.monotonic()+stall
                remaining=min(hard,idle)-time.monotonic()
                if remaining<=0:
                    raise Incomplete("TOTAL_OR_DURABLE_PROGRESS_TIMEOUT")
                if offset!=len(data) or buf or child.wait(timeout=remaining):
                    raise Incomplete("INCOMPLETE_SSH_CHILD_NO_REPLAY")
        except (OSError,ValueError,subprocess.TimeoutExpired,Incomplete) as error:
            if child.poll() is None:child.kill()
            child.wait()
            raise Incomplete(str(error)) from error
