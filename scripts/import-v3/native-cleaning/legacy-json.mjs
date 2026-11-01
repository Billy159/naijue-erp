// Decode private PostgreSQL jsonb::text without rounding numeric tokens in JS.
// The original raw text remains the source artifact; this is not a JSON writer.
class ExactJsonNumber {
  #text;
  constructor(text) { this.#text = text; Object.freeze(this); }
  text() { return this.#text; }
  toJSON() { throw new Error('LEGACY_NUMBER_REQUIRES_EXPLICIT_CONVERSION'); }
}

export function parseLegacyJsonText(text) {
  if (typeof text !== 'string') throw new Error('LEGACY_JSON_TEXT_REQUIRED');
  try {
    return JSON.parse(text, (_key, value, context) => {
      if (typeof value !== 'number') return value;
      if (typeof context?.source !== 'string') throw new Error('LEGACY_JSON_SOURCE_CONTEXT_REQUIRED');
      return new ExactJsonNumber(context.source);
    });
  } catch (error) {
    // Native syntax messages may contain business text. Never propagate excerpts.
    if (error instanceof SyntaxError) throw new Error('INVALID_LEGACY_JSON_TEXT');
    throw error;
  }
}

// A selected decimal source may be JSON number, decimal text or explicit NULL.
// Booleans, missing values and previously parsed JS numbers are not decimals.
export function legacyDecimalText(value) {
  if (value === null || typeof value === 'string') return value;
  if (value instanceof ExactJsonNumber) return value.text();
  throw new Error('EXACT_LEGACY_DECIMAL_SOURCE_REQUIRED');
}
