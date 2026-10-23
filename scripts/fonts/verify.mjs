#!/usr/bin/env node
// التحقق من الخطوط المضمّنة وتراخيصها قبل التضمين (T-2.3، AC-A3). مستقل عن fontTools: يقرأ WOFF2 بنفسه.
//  - لكل ملف woff2: لا بيانات وصفية WOFF ولا بيانات خاصة، ولا تحويل لأي جدول (glyf وloca بالتحويل الفارغ)، فبيانات الخط بعد فك
//    brotli هي الجداول نفسها (شرط OFL-FAQ 2.2.1 كي لا تُعد النسخة معدّلة ويبقى الاسم المحجوز Plex).
//  - مع --source: كل جدول يطابق جدول ملف TTF الأصلي بايتًا ببايت، عدا حقلين في head يفرضهما ترميز WOFF2: checkSumAdjustment
//    والبت 11 من flags (علامة الضغط في مواصفة OpenType).
//  - نوع الرخصة من الخط نفسه (nameID 13 و14) ومن ملف الترخيص المرافق، وصاحب الحقوق في الاثنين، والاسم المحجوز إن وُجد.
// الاستعمال: node scripts/fonts/verify.mjs [--source <مجلد TTF>] [--out <ملف json>]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FONTS_DIR = path.join(ROOT, 'assets/fonts');

// الخطوط كما في src/modules/a/fonts/fonts.ts (EMBEDDED_FONTS)، ومصدر كل ملف TTF.
export const FONT_FILES = [
  { font: 'plex', file: 'IBMPlexSansArabic-Regular.woff2', source: 'IBMPlexSansArabic-Regular.ttf', license: 'OFL-IBMPlexSansArabic.txt' },
  { font: 'plex', file: 'IBMPlexSansArabic-Bold.woff2', source: 'IBMPlexSansArabic-Bold.ttf', license: 'OFL-IBMPlexSansArabic.txt' },
  { font: 'cairo', file: 'Cairo-Regular.woff2', source: 'Cairo-Regular.ttf', license: 'OFL-Cairo.txt' },
  { font: 'cairo', file: 'Cairo-Bold.woff2', source: 'Cairo-Bold.ttf', license: 'OFL-Cairo.txt' },
  { font: 'noto', file: 'NotoSansArabic-Variable.woff2', source: 'NotoSansArabic-VariableFont_wdth,wght.ttf', license: 'OFL-NotoSansArabic.txt' },
];

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
  'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function base128(buffer, state) {
  let value = 0;
  for (let i = 0; i < 5; i += 1) {
    const byte = buffer[state.offset++];
    if (i === 0 && byte === 0x80) throw new Error('UIntBase128 يبدأ بصفر');
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return value;
  }
  throw new Error('UIntBase128 أطول من 5 بايتات');
}

/** يقرأ WOFF2 ويعيد رأسه وجداوله (بعد فك brotli) ونوع التحويل لكل جدول. */
export function readWoff2(buffer) {
  if (buffer.toString('latin1', 0, 4) !== 'wOF2') throw new Error('ليس WOFF2');
  const header = {
    flavor: buffer.toString('latin1', 4, 8),
    numTables: buffer.readUInt16BE(12),
    totalSfntSize: buffer.readUInt32BE(16),
    totalCompressedSize: buffer.readUInt32BE(20),
    metaOffset: buffer.readUInt32BE(28),
    metaLength: buffer.readUInt32BE(32),
    privOffset: buffer.readUInt32BE(40),
    privLength: buffer.readUInt32BE(44),
  };
  const state = { offset: 48 };
  const entries = [];
  for (let i = 0; i < header.numTables; i += 1) {
    const flags = buffer[state.offset++];
    const index = flags & 0x3f;
    const tag = index === 63 ? buffer.toString('latin1', state.offset, (state.offset += 4)) : KNOWN_TAGS[index];
    const version = flags >> 6;
    const origLength = base128(buffer, state);
    const glyfOrLoca = tag === 'glyf' || tag === 'loca';
    const transformed = glyfOrLoca ? version !== 3 : version !== 0;
    const transformLength = transformed ? base128(buffer, state) : origLength;
    entries.push({ tag, version, transformed, origLength, length: transformLength });
  }
  const data = zlib.brotliDecompressSync(buffer.subarray(state.offset, state.offset + header.totalCompressedSize));
  const tables = new Map();
  let at = 0;
  for (const entry of entries) {
    tables.set(entry.tag, data.subarray(at, at + entry.length));
    at += entry.length;
  }
  return { header, entries, tables, decompressed: data.length, consumed: at };
}

export function readSfnt(buffer) {
  const numTables = buffer.readUInt16BE(4);
  const tables = new Map();
  for (let i = 0; i < numTables; i += 1) {
    const record = 12 + i * 16;
    const tag = buffer.toString('latin1', record, record + 4);
    const offset = buffer.readUInt32BE(record + 8);
    const length = buffer.readUInt32BE(record + 12);
    tables.set(tag, buffer.subarray(offset, offset + length));
  }
  return tables;
}

/** سجلات name: Windows (3، UTF-16BE، إنجليزي) أولًا ثم Mac (1). */
export function readNames(name) {
  const count = name.readUInt16BE(2);
  const stringOffset = name.readUInt16BE(4);
  const out = {};
  for (let i = 0; i < count; i += 1) {
    const r = 6 + i * 12;
    const [platform, , language, id, length, offset] = [0, 2, 4, 6, 8, 10].map((d) => name.readUInt16BE(r + d));
    const raw = name.subarray(stringOffset + offset, stringOffset + offset + length);
    let text;
    if (platform === 3 && language === 0x409) text = Buffer.from(raw).swap16().toString('utf16le');
    else if (platform === 1 && language === 0) text = raw.toString('latin1');
    else continue;
    if (platform === 3 || out[id] === undefined) out[id] = text;
  }
  return out;
}

const OFL_IN_FONT = /SIL Open Font License, Version 1\.1/;
const OFL_IN_FILE = /SIL OPEN FONT LICENSE Version 1\.1/;

export function verifyFont(entry, { fontsDir = FONTS_DIR, sourceDir = null } = {}) {
  const problems = [];
  const buffer = fs.readFileSync(path.join(fontsDir, entry.file));
  const woff = readWoff2(buffer);
  if (woff.header.metaLength || woff.header.metaOffset) problems.push('فيه بيانات وصفية WOFF');
  if (woff.header.privLength || woff.header.privOffset) problems.push('فيه بيانات خاصة WOFF');
  const transformed = woff.entries.filter((e) => e.transformed).map((e) => e.tag);
  if (transformed.length) problems.push(`جداول محوّلة: ${transformed.join(' ')}`);
  if (woff.consumed !== woff.decompressed) problems.push(`طول البيانات المفكوكة ${woff.decompressed} لا يساوي مجموع الجداول ${woff.consumed}`);
  const names = readNames(woff.tables.get('name'));
  const license = fs.readFileSync(path.join(fontsDir, entry.license));
  const licenseText = license.toString('utf8');
  if (!OFL_IN_FONT.test(names[13] ?? '')) problems.push(`nameID 13 لا يعلن OFL 1.1: ${names[13]}`);
  if (!OFL_IN_FILE.test(licenseText)) problems.push('ملف الترخيص ليس نص SIL OFL 1.1');
  const fileCopyright = licenseText.split(/\r?\n/, 1)[0];
  const holder = (text) => text.replace(/^Copyright\s*(©|\(c\))?\s*\d{4}(-\d{4})?\s*/i, '').replace(/\s*(All rights reserved\.?|with Reserved Font Name.*)$/i, '').trim();
  if (holder(names[0] ?? '') !== holder(fileCopyright)) problems.push(`صاحب الحقوق يختلف: الخط «${names[0]}» والملف «${fileCopyright}»`);
  const reserved = /Reserved Font Name\s+"([^"]+)"/i.exec(licenseText)?.[1] ?? null;
  let source = null;
  if (sourceDir) {
    const original = fs.readFileSync(path.join(sourceDir, entry.source));
    const tables = readSfnt(original);
    const differing = [];
    let headFlagBit11 = false;
    for (const [tag, bytes] of tables) {
      const decoded = woff.tables.get(tag);
      if (!decoded) differing.push(`${tag} (غائب)`);
      else if (tag === 'head') {
        // يُستثنى ما يفرضه ترميز WOFF2 نفسه وحده: checkSumAdjustment (البايتات 8–11)، والبت 11 من head.flags (البايت 16، 0x08):
        // «Font data is lossless… compression mechanisms such as WOFF 2.0» في مواصفة OpenType، ويوجب WOFF2 ضبطه.
        const a = Buffer.from(bytes);
        const b = Buffer.from(decoded);
        a.fill(0, 8, 12);
        b.fill(0, 8, 12);
        if ((b[16] & 0x08) === 0x08) headFlagBit11 = true;
        a[16] &= ~0x08;
        b[16] &= ~0x08;
        if (!a.equals(b)) differing.push(tag);
      } else if (!Buffer.from(bytes).equals(Buffer.from(decoded))) differing.push(tag);
    }
    if (woff.tables.size !== tables.size) differing.push(`عدد الجداول ${woff.tables.size} مقابل ${tables.size}`);
    if (differing.length) problems.push(`جداول تختلف عن الأصل: ${differing.join(' ')}`);
    source = { file: entry.source, bytes: original.length, sha256: sha256(original), tables: tables.size, identicalTables: tables.size - differing.length, headDiffersOnlyByWoff2Fields: !differing.includes('head'), headFlagBit11 };
  }
  return {
    file: `fonts/${entry.file}`,
    font: entry.font,
    bytes: buffer.length,
    sha256: sha256(buffer),
    family: names[1],
    version: names[5],
    fontCopyright: names[0],
    fontLicense: names[13],
    fontLicenseUrl: names[14],
    licenseFile: `fonts/${entry.license}`,
    licenseSha256: sha256(license),
    licenseCopyright: fileCopyright,
    reservedFontName: reserved,
    spdx: problems.some((p) => /OFL/.test(p)) ? null : 'OFL-1.1',
    tables: woff.entries.length,
    transformedTables: transformed,
    woffMetadata: woff.header.metaLength > 0,
    source,
    problems,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const option = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? null : path.resolve(args[i + 1].replace(/^~(?=\/)/, process.env.HOME ?? '~'));
  };
  const sourceDir = option('--source');
  const out = option('--out');
  const results = FONT_FILES.map((entry) => verifyFont(entry, { sourceDir }));
  for (const r of results) {
    console.log(`${r.file}: ${r.bytes} بايت · ${r.family} ${r.version} · ${r.spdx ?? 'رخصة غير متحقق منها'} · محجوز: ${r.reservedFontName ?? '—'}${r.source ? ` · جداول مطابقة ${r.source.identicalTables}/${r.source.tables}` : ''}${r.problems.length ? ` · مشكلات: ${r.problems.join('؛ ')}` : ''}`);
  }
  if (out) fs.writeFileSync(out, `${JSON.stringify({ checkedAt: new Date().toISOString(), sourceDir, results }, null, 2)}\n`);
  if (results.some((r) => r.problems.length)) process.exit(1);
}
