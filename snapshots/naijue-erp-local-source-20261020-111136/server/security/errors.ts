export class SecurityError extends Error {
  constructor(readonly code: string, readonly statusCode = 403, message = '无权执行此操作', readonly latest?: Record<string, unknown>) {super(message); this.name = 'SecurityError';}
}
export const invalid = (): never => {throw new SecurityError('VALIDATION', 400, '请求参数无效');};
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
export function identifier(value: unknown, uuid = false): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value) || uuid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return invalid();
  return value;
}
