// Fixed CORE0 diagnostic projection. Never copy a PostgreSQL error object.
export function corePgErrorFields(error, context, privateTokens = []) {
  let message = typeof error?.message === 'string' ? error.message : null;
  let messageRedacted = false;
  if (message !== null) {
    for (const token of privateTokens) if (typeof token === 'string' && token.length >= 3 && message.includes(token)) {
      message = message.split(token).join('[redacted]'); messageRedacted = true;
    }
    const quoted = message.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"/g, '[redacted]');
    messageRedacted ||= quoted !== message; message = quoted;
    if (/[\r\n]|\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|VALUES|PASSWORD)\b|\$\d|scrypt\$/i.test(message)) {
      message = null; messageRedacted = true;
    } else message = Buffer.from(message).subarray(0, 1024).toString('utf8').replace(/\uFFFD$/, '');
  }
  const metadata = key => typeof error?.[key] === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(error[key]) ? error[key] : null;
  const frames = [];
  if (typeof error?.where === 'string') for (const line of error.where.split(/\r?\n/)) {
    if (/^PL\/pgSQL function [A-Za-z0-9_.]+\([A-Za-z0-9_.,[\] ]*\) line [0-9]+ at [A-Za-z ]+$/.test(line)) frames.push(line.slice(0, 180));
    if (frames.length === 3) break;
  }
  return {phase: context.phase, ordinal: context.ordinal, queryKind: context.queryKind,
    sqlState: typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : null,
    message, messageRedacted, constraint: metadata('constraint'), table: metadata('table'), column: metadata('column'), contextFrames: frames};
}
