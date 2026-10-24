// ترميز النص بين واجهة GitHub (base64 لبايتات UTF-8) ونص يُعاين (T-11.8). فك صارم: ما ليس UTF-8 صالحًا ليس ملفًا نصيًا فلا يُقترح تعديله.

/** base64 لبايتات UTF-8 للنص. */
export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** النص من base64 (بأسطره كما يعيدها GitHub)، أو null إن لم يكن UTF-8 صالحًا. */
export function base64ToUtf8(encoded: string): string | null {
  try {
    const binary = atob(encoded.replace(/\s+/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export type LineEnding = 'lf' | 'crlf';

/**
 * نهايات أسطر النص: lf أو crlf إن كانت كلها CRLF، أو null لنص بنهايات مختلطة أو \r منفردة (لا يُعاين فرقه بأمانة في حقل نص يوحّدها).
 */
export function lineEnding(text: string): LineEnding | null {
  const cr = (text.match(/\r/g) ?? []).length;
  if (cr === 0) return 'lf';
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length;
  return cr === crlf && crlf === lf ? 'crlf' : null;
}

export const toLf = (text: string): string => text.replace(/\r\n/g, '\n');
export const withEnding = (text: string, ending: LineEnding): string => (ending === 'crlf' ? toLf(text).replace(/\n/g, '\r\n') : toLf(text));
