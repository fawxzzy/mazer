import { createHash } from 'node:crypto';

export const md5Hex = (value) => createHash('md5').update(value, 'utf8').digest('hex');
export const sha256Hex = (value) => createHash('sha256').update(value).digest('hex');

/** The same three md5s the preimage pack returns for a live function body (md5 of prosrc as stored). */
export function bodyMd5Variants(body) {
  const lf = body.replace(/\r/g, '');
  const crlf = lf.replace(/\n/g, '\r\n');
  return {
    chars: body.length,
    crCount: (body.match(/\r/g) ?? []).length,
    md5Stored: md5Hex(body),
    md5Lf: md5Hex(lf),
    md5Crlf: md5Hex(crlf)
  };
}
