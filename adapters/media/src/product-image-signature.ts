import type { ProductImageMime } from '../../../packages/application/src/product-query-ports.ts';
/** Bounded signature guard only; upload acceptance still requires the full Sharp decode. */
export function productImageSignatureMatches(bytes: Buffer, mime: ProductImageMime): boolean {
  if (mime === 'image/png') return bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === 'image/jpeg') return bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return bytes.length >= 12 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' && bytes.readUInt32LE(4)+8 === bytes.length;
}
