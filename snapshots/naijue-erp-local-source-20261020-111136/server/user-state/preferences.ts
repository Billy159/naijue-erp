import {createHash} from 'node:crypto';
import type {AuthorizedContext} from '../security/service.js';
import {object, invalid, SecurityError} from '../security/errors.js';

export const columnDefaults = Object.freeze({category: true, supplierId: false, fitId: false, groupId: false,
  season: false, subtotal: false, total: true, sizeDescription: false});
export function preferenceView(value: unknown): 'inventory.columns' {
  if (value !== 'inventory.columns') return invalid();
  return value;
}
export async function getPreference({actor, session, repo}: AuthorizedContext, view: unknown): Promise<Record<string, unknown>> {
  const viewId = preferenceView(view);
  const saved = (await session.query<{settings: unknown; version: number}>(
    `SELECT settings,version FROM ${repo.auth}.user_preference WHERE actor_id=$1 AND view_id=$2`, [actor.id, viewId])).rows[0];
  return {viewId, settings: saved?.settings ?? columnDefaults, version: saved?.version ?? 0};
}
export async function savePreference(context: AuthorizedContext, input: unknown): Promise<Record<string, unknown>> {
  const {actor, session, repo} = context, body = object(input), viewId = preferenceView(body['viewId']), settings = object(body['settings']);
  // Reject arbitrary data, selected business objects, credentials and spoofed ownership.
  if (Object.keys(body).some(key => !['viewId','settings','expectedVersion','requestKey'].includes(key)) ||
    Object.keys(settings).length !== Object.keys(columnDefaults).length ||
    Object.keys(settings).some(key => !Object.hasOwn(columnDefaults, key) || typeof settings[key] !== 'boolean')) return invalid();
  const version = body['expectedVersion'], requestKey = body['requestKey'];
  if (!Number.isSafeInteger(version) || Number(version) < 0 || typeof requestKey !== 'string' ||
    !/^[a-zA-Z0-9_:-]{1,200}$/.test(requestKey)) return invalid();
  const normal = Object.fromEntries(Object.keys(columnDefaults).map(key => [key, settings[key]]));
  const hash = createHash('sha256').update(JSON.stringify([viewId, version, normal])).digest('hex');
  const prior = (await session.query<{payload_hash: string; response: Record<string, unknown>}>(
    `SELECT payload_hash,response FROM ${repo.auth}.preference_request WHERE actor_id=$1 AND request_key=$2`, [actor.id, requestKey])).rows[0];
  if (prior) {
    if (prior.payload_hash !== hash) throw new SecurityError('IDEMPOTENCY_CONFLICT', 409, '原请求内容不同，请先核对原结果');
    return prior.response;
  }
  const latest = await getPreference(context, viewId);
  if (latest['version'] !== version) throw new SecurityError('VERSION_CONFLICT', 409, '列偏好已在其他设备更新，请重新读取后选择', latest);
  const response = {viewId, settings: normal, version: Number(version) + 1};
  await session.query(`INSERT INTO ${repo.auth}.user_preference(actor_id,view_id,settings,version) VALUES($1,$2,$3::jsonb,$4)
    ON CONFLICT(actor_id,view_id) DO UPDATE SET settings=EXCLUDED.settings,version=EXCLUDED.version,updated_at=now()`,
    [actor.id, viewId, JSON.stringify(normal), response.version]);
  await session.query(`INSERT INTO ${repo.auth}.preference_request(actor_id,request_key,payload_hash,response) VALUES($1,$2,$3,$4::jsonb)`,
    [actor.id, requestKey, hash, JSON.stringify(response)]);
  return response;
}
