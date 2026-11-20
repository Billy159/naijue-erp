/** Snapshot plain read parameters, never a draft, credential or response payload. */
export function snapshotQueryParameters<T>(parameters: T): Readonly<T> {
  const ancestors = new Set<object>();
  const copy = (value: unknown): unknown => {
    if (value === null || value === undefined || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object' || value === null) throw new TypeError('Read parameters must contain only plain finite values.');
    if (ancestors.has(value)) throw new TypeError('Read parameters cannot be cyclic.');
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new TypeError('Convert dates and other objects to explicit plain read parameters.');
    }
    ancestors.add(value);
    let result: unknown;
    if (Array.isArray(value)) {
      result = value.map(copy);
    } else {
      const target: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== 'string') throw new TypeError('Read parameter keys must be strings.');
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!('value' in descriptor)) throw new TypeError('Read parameters cannot contain accessors.');
        target[key] = copy(descriptor.value);
      }
      result = target;
    }
    ancestors.delete(value);
    return Object.freeze(result);
  };
  return copy(parameters) as Readonly<T>;
}
