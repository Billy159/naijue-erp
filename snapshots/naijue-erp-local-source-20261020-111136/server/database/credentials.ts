import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import type {DatabaseConfig} from './config.js';
import {DataAccessError} from './access-errors.js';

/** Exact configured file only; never PG* defaults, process-global mutation, logging or caching. */
export function passwordProvider(config: DatabaseConfig): () => Promise<string> {
  return async () => {
    if (!config.passfile) throw new DataAccessError('EXPLICIT_PASSFILE_REQUIRED_FOR_PASSWORD_AUTH');
    try {
      const file = await open(config.passfile, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await file.stat();
        if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > 65536 || (process.getuid && stat.uid !== process.getuid())) throw new DataAccessError('PASSFILE_MUST_BE_PRIVATE');
        const contents = await file.readFile('utf8');
        for (const line of contents.split(/\r?\n/)) {
          if (!line || line.startsWith('#')) continue;
          const fields: string[] = []; let field = ''; let escaped = false;
          for (const char of line) {
            if (escaped) {field += char; escaped = false;}
            else if (char === '\\') escaped = true;
            else if (char === ':') {fields.push(field); field = '';}
            else field += char;
          }
          fields.push(field);
          if (escaped || fields.length !== 5) continue;
          const target = [config.host, String(config.port), config.database, config.user];
          if (target.every((value, index) => fields[index] === value || fields[index] === '*')) {
            const password = fields[4];
            if (!password) throw new DataAccessError('PASSFILE_MATCH_REQUIRED');
            return password;
          }
        }
        throw new DataAccessError('PASSFILE_MATCH_REQUIRED');
      } finally {await file.close();}
    } catch (error) {
      if (error instanceof DataAccessError) throw error;
      throw new DataAccessError('PASSFILE_UNAVAILABLE');
    }
  };
}
