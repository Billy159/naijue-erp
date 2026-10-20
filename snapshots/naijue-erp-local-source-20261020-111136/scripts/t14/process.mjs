import {spawn} from 'node:child_process';
import {createWriteStream, mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {cleanEnvironment} from './safety.mjs';

export async function runProcess(binary, args, {cwd, env = cleanEnvironment(), log, input, timeout = 300000} = {}) {
  mkdirSync(dirname(log), {recursive: true});
  const stream = createWriteStream(log, {flags: 'wx', mode: 0o600});
  return await new Promise((yes, no) => {
    const child = spawn(binary, args, {cwd, env, stdio: ['pipe', 'pipe', 'pipe']});
    let stdout = ''; let stderr = ''; let timedOut = false; let startError;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeout);
    const force = setTimeout(() => child.kill('SIGKILL'), timeout + 5000);
    child.stdout.on('data', b => { stdout += b; stream.write(b); });
    child.stderr.on('data', b => { stderr += b; stream.write(b); });
    child.on('error', e => { startError = e; }); child.stdin.on('error', () => {});
    child.on('close', code => {
      clearTimeout(timer); clearTimeout(force);
      stream.end(() => {
        if (startError || timedOut || code !== 0) {
          const e = Error(timedOut ? 'T14_COMMAND_TIMEOUT' : 'T14_COMMAND_FAILED');
          e.exitCode = code; e.log = log; e.diagnostic = stderr; no(e);
        } else yes({stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code, log});
      });
    });
    child.stdin.end(input);
  });
}
