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

/** Large-row census decoder. Exact numeric tokens are temporarily represented
 * as NUL-prefixed strings and then restored without a native reviver/context for
 * every unused source field. An original escaped NUL takes the original decoder
 * path, so source strings can never be mistaken for numeric tokens. */
export function parseLegacyJsonTextIterative(text) {
  if(typeof text!=='string')throw new Error('LEGACY_JSON_TEXT_REQUIRED');
  if(text.includes('\\u0000'))return parseLegacyJsonText(text);
  try {
    const replaced=text.replace(/"(?:[^"\\]|\\.)*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|["\\]/g,
      (token,offset)=>{
        if(token==='"'||token==='\\')throw new SyntaxError('UNTERMINATED_JSON_STRING');
        if(token[0]==='"')return token;
        let next=offset+token.length;
        while(next<text.length&&' \t\r\n'.includes(text[next]))next++;
        // Quoting a numeric object key must not repair invalid source JSON.
        if(text[next]===':')throw new SyntaxError('INVALID_NUMERIC_JSON_KEY');
        return '\"\\u0000'+token+'\"';
      });
    const holder={value:JSON.parse(replaced)},stack=[holder];
    while(stack.length){
      const parent=stack.pop();
      for(const key of Object.keys(parent)){
        const value=parent[key];
        if(typeof value==='string'&&value.startsWith('\u0000'))parent[key]=new ExactJsonNumber(value.slice(1));
        else if(value!==null&&typeof value==='object')stack.push(value);
      }
    }
    return holder.value;
  }catch(error){
    if(error instanceof SyntaxError)throw new Error('INVALID_LEGACY_JSON_TEXT');
    throw error;
  }
}
