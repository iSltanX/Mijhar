// أدوات اختبارات سلامة التنقيح (MJ-TA-01): مفاتيح خاصة اصطناعية تُولَّد وقت التشغيل بـ node:crypto (أو أجسام base64 عشوائية للصيغ التي لا يولّدها node)،
// فلا يُكتب في المستودع أي مفتاح ولا جسم مفتاح. ولا يطبع أي مساعد هنا جسم مفتاح: التحقق يعيد أعدادًا وقيمًا منطقية فقط.
import { generateKeyPairSync, randomBytes } from 'node:crypto';

export interface SyntheticBlock {
  /** اسم الصيغة في عنوان الاختبار. */
  readonly name: string;
  /** سطر البداية كاملًا بشرطاته (BEGIN ثم الوسم مثل RSA PRIVATE KEY)؛ لا يُكتب هنا حرفيًا كي لا تلتقطه فاحصات الأسرار. */
  readonly header: string;
  /** سطر النهاية كاملًا. */
  readonly footer: string;
  /** أسطر الجسم (base64) كما تكتبها الصيغة. */
  readonly lines: readonly string[];
  /** الجسم بلا فواصل أسطر. */
  readonly body: string;
}

const wrap = (b64: string, width: number): string[] => b64.match(new RegExp(`.{1,${width}}`, 'g')) ?? [];

function block(name: string, label: string, lines: readonly string[]): SyntheticBlock {
  return { name, header: `-----BEGIN ${label}-----`, footer: `-----END ${label}-----`, lines, body: lines.join('') };
}

function fromPem(name: string, pem: string): SyntheticBlock {
  const rows = pem.trim().split('\n');
  const header = rows[0] ?? '';
  const footer = rows[rows.length - 1] ?? '';
  return { name, header, footer, lines: rows.slice(1, -1), body: rows.slice(1, -1).join('') };
}

/** كتلة PEM كاملة بفاصل الأسطر المطلوب. */
export const pem = (key: SyntheticBlock, eol = '\n'): string => [key.header, ...key.lines, key.footer].join(eol);

/** الجسم نفسه بعرض أسطر آخر (أو سطر واحد طويل بعرض 0). */
export const rewrapped = (key: SyntheticBlock, width: number): SyntheticBlock => ({ ...key, lines: width > 0 ? wrap(key.body, width) : [key.body] });

let cache: SyntheticBlock[] | null = null;

/** الصيغ الخمس المطلوبة للمفتاح الخاص (والسادسة Ed25519 بجسم من سطر واحد). */
export function privateKeys(): readonly SyntheticBlock[] {
  if (cache) return cache;
  const rsa = (type: 'pkcs1' | 'pkcs8'): string => generateKeyPairSync('rsa', { modulusLength: 1024, privateKeyEncoding: { format: 'pem', type }, publicKeyEncoding: { format: 'pem', type: 'spki' } }).privateKey;
  const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { format: 'pem', type: 'sec1' }, publicKeyEncoding: { format: 'pem', type: 'spki' } }).privateKey;
  const ed = generateKeyPairSync('ed25519', { privateKeyEncoding: { format: 'pem', type: 'pkcs8' }, publicKeyEncoding: { format: 'pem', type: 'spki' } }).privateKey;
  // OPENSSH وENCRYPTED: كتلة اصطناعية بجسم عشوائي (مفتاح OpenSSH يولَّد بأداة ssh-keygen لا بـnode، والمشفَّر يلزمه رمز مرور).
  const openssh = block('OPENSSH PRIVATE KEY (synthetic)', 'OPENSSH PRIVATE KEY', wrap(Buffer.concat([Buffer.from('openssh-key-v1\0'), randomBytes(420)]).toString('base64'), 70));
  const encrypted = block('ENCRYPTED PRIVATE KEY (synthetic)', 'ENCRYPTED PRIVATE KEY', wrap(randomBytes(700).toString('base64'), 64));
  cache = [fromPem('PKCS8 (BEGIN PRIVATE KEY)', rsa('pkcs8')), fromPem('PKCS1 RSA (BEGIN RSA PRIVATE KEY)', rsa('pkcs1')), fromPem('SEC1 EC (BEGIN EC PRIVATE KEY)', ec), fromPem('Ed25519 PKCS8, one body line', ed), openssh, encrypted];
  return cache;
}

/** مفتاح RSA طويل الجسم (أكثر من 10 أسطر) للاختبارات التي تقطع الكتلة في منتصفها. */
export const longKey = (): SyntheticBlock => privateKeys()[0] as SyntheticBlock;
/** مفتاح بجسم من سطر واحد (Ed25519). */
export const shortKey = (): SyntheticBlock => privateKeys()[3] as SyntheticBlock;

/** كتل غير سرية: مفتاح عام وشهادة (الجسم عشوائي للشهادة). */
export function publicBlocks(): { readonly publicKey: SyntheticBlock; readonly certificate: SyntheticBlock } {
  const spki = generateKeyPairSync('rsa', { modulusLength: 1024, publicKeyEncoding: { format: 'pem', type: 'spki' }, privateKeyEncoding: { format: 'pem', type: 'pkcs8' } }).publicKey;
  return { publicKey: fromPem('PUBLIC KEY', spki), certificate: block('CERTIFICATE (synthetic)', 'CERTIFICATE', wrap(randomBytes(500).toString('base64'), 64)) };
}

/** كتلة PGP المدرَّعة (اصطناعية): ترويسة Version وسطر فارغ وجسم وسطر CRC. */
export function pgpBlock(): { readonly header: string; readonly footer: string; readonly preamble: readonly string[]; readonly lines: readonly string[]; readonly body: string } {
  const lines = wrap(randomBytes(600).toString('base64'), 64);
  return { header: '-----BEGIN PGP PRIVATE KEY BLOCK-----', footer: '-----END PGP PRIVATE KEY BLOCK-----', preamble: ['Version: Synthetic 1.0', ''], lines: [...lines, `=${randomBytes(3).toString('base64')}`], body: lines.join('') };
}

const NOT_BASE64 = /[^A-Za-z0-9+/=]/g;

/**
 * عدد نوافذ الجسم (16 حرفًا من base64، بخطوة 4) الباقية في النص بعد إسقاط كل ما ليس من أبجدية base64 منه (فاصل الأسطر وبادئة الاقتباس «> »
 * وبادئة الفروق «+» وأرقام أسطر السجل…). صفر = لم يبقَ من الجسم مقطع متصل من 16 حرفًا فأكثر. تبدأ النوافذ بعد البادئة البنيوية الثابتة للصيغة
 * (معرّف الخوارزمية في DER: أول 64 حرفًا في الأجسام الطويلة، وأول 24 في القصيرة) فلا يطابق نافذةً مفتاحٌ عامّ أو غيره يشاركها البادئة نفسها.
 * يعيد عددًا لا نصًّا: لا يُطبع جسم مفتاح.
 */
export function leakedWindows(text: string, key: SyntheticBlock, size = 16): number {
  const hay = text.replace(NOT_BASE64, '');
  const from = key.body.length > 128 ? 64 : 24;
  let n = 0;
  for (let i = from; i + size <= key.body.length; i += 4) if (hay.includes(key.body.slice(i, i + size))) n += 1;
  return n;
}

/** عدد أسطر «END … PRIVATE KEY» الباقية (أي صيغة). */
export const endLines = (text: string): number => (text.match(/-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----/g) ?? []).length;

/**
 * ملخص التسرب للنص: أعداد فقط. للمقارنة بـ`toEqual(CLEAN)`. ترويسة BEGIN لا تُعدّ تسربًا (يحلّ محلها علامة الحجب أو تبقى)؛ التسرب هو الجسم
 * (أي مقطع متصل من 16 حرفًا فأكثر) وسطر END.
 */
export function leak(text: string, keys: readonly SyntheticBlock[]): { windows: number; endLines: number } {
  return { windows: keys.reduce((n, k) => n + leakedWindows(text, k), 0), endLines: endLines(text) };
}
export const CLEAN = { windows: 0, endLines: 0 } as const;

/** منطقي بلا طباعة النص عند الفشل. */
export const has = (text: string, needle: string): boolean => text.includes(needle);

export const BEFORE = 'SENTINEL-BEFORE-7f3a';
export const AFTER = 'SENTINEL-AFTER-9c1d';
export const BETWEEN = 'SENTINEL-BETWEEN-4b8e';

export { baseSource } from './fixtures';
