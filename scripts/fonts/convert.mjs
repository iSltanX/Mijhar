#!/usr/bin/env node
// تحويل خط TTF إلى WOFF2 بـNode وحده (brotli المدمج في zlib)، بالقيود نفسها في convert.py لمن لا تتوفر عنده fontTools (أداة صيانة
// تُشغَّل مرة، لا جزء من البناء). شرط OFL-FAQ 2.2.1 كي لا تُعد النسخة «Modified Version»: بيانات الخط كما هي عدا ضغط WOFF2.
//  - لا تجزئة ولا تحويل لأي جدول: glyf وloca بالتحويل الفارغ (الإصدار 3)، وغيرهما بالإصدار 0؛ فالجداول تُضغط بـbrotli كما هي.
//  - ولا بيانات وصفية WOFF ولا بيانات خاصة.
//  - وما يفرضه ترميز WOFF2 وحده في head، كما يكتبه fontTools: البت 11 من flags، وcheckSumAdjustment للخط المعاد بناؤه (الجداول
//    مرتبة بوسومها ومحاذاة 4 بايتات). ويتحقق scripts/fonts/verify.mjs --source من تطابق كل جدول بايتًا ببايت مع الأصل عدا هذين.
// الاستعمال: node scripts/fonts/convert.mjs <مصدر.ttf> <مخرج.woff2> [<مصدر.ttf> <مخرج.woff2> …]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { KNOWN_TAGS, readSfnt } from './verify.mjs';

const pad4 = (n) => (n + 3) & ~3;

function uintBase128(value) {
  const bytes = [];
  let rest = value;
  do {
    bytes.unshift(rest & 0x7f);
    rest = Math.floor(rest / 128);
  } while (rest > 0);
  for (let i = 0; i < bytes.length - 1; i += 1) bytes[i] |= 0x80;
  if (bytes.length > 5) throw new Error('UIntBase128 أطول من 5 بايتات');
  return Buffer.from(bytes);
}

function checksum(data) {
  const padded = Buffer.alloc(pad4(data.length));
  data.copy(padded);
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

/** يرمّز خط sfnt (TrueType أو CFF) WOFF2 بلا تحويل جداول ولا بيانات وصفية. */
export function encodeWoff2(sfnt) {
  const tables = readSfnt(sfnt);
  const tags = [...tables.keys()].sort();
  const n = tags.length;
  const head = Buffer.from(tables.get('head'));
  head.writeUInt16BE(head.readUInt16BE(16) | 0x0800, 16);
  head.writeUInt32BE(0, 8);
  const dataOf = (tag) => (tag === 'head' ? head : tables.get(tag));

  // checkSumAdjustment للخط المعاد بناؤه: رأس sfnt ودليله والجداول مرتبة بوسومها بمحاذاة 4 بايتات.
  const entrySelector = Math.floor(Math.log2(n));
  const searchRange = 2 ** entrySelector * 16;
  const directory = Buffer.alloc(12 + 16 * n);
  directory.writeUInt32BE(sfnt.readUInt32BE(0), 0);
  directory.writeUInt16BE(n, 4);
  directory.writeUInt16BE(searchRange, 6);
  directory.writeUInt16BE(entrySelector, 8);
  directory.writeUInt16BE(n * 16 - searchRange, 10);
  let offset = 12 + 16 * n;
  let total = 0;
  tags.forEach((tag, i) => {
    const data = dataOf(tag);
    const sum = checksum(data);
    const record = 12 + i * 16;
    directory.write(tag, record, 4, 'latin1');
    directory.writeUInt32BE(sum, record + 4);
    directory.writeUInt32BE(offset, record + 8);
    directory.writeUInt32BE(data.length, record + 12);
    offset += pad4(data.length);
    total = (total + sum) >>> 0;
  });
  total = (total + checksum(directory)) >>> 0;
  head.writeUInt32BE((0xb1b0afba - total) >>> 0, 8);
  const totalSfntSize = offset;

  const entries = tags.map((tag) => {
    const index = KNOWN_TAGS.indexOf(tag);
    const version = tag === 'glyf' || tag === 'loca' ? 3 : 0;
    const flags = Buffer.from([(index === -1 ? 63 : index) | (version << 6)]);
    return Buffer.concat([flags, index === -1 ? Buffer.from(tag, 'latin1') : Buffer.alloc(0), uintBase128(dataOf(tag).length)]);
  });
  const stream = Buffer.concat(tags.map(dataOf));
  const compressed = zlib.brotliCompressSync(stream, {
    params: {
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_FONT,
      [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: stream.length,
    },
  });

  const body = Buffer.concat([Buffer.alloc(48), ...entries, compressed]);
  const out = Buffer.alloc(pad4(body.length));
  body.copy(out);
  out.write('wOF2', 0, 4, 'latin1');
  out.writeUInt32BE(sfnt.readUInt32BE(0), 4);
  out.writeUInt32BE(out.length, 8);
  out.writeUInt16BE(n, 12);
  out.writeUInt16BE(0, 14);
  out.writeUInt32BE(totalSfntSize, 16);
  out.writeUInt32BE(compressed.length, 20);
  // إصدار ملف WOFF من head.fontRevision كما يكتبه fontTools؛ وصفر للبيانات الوصفية والخاصة.
  out.writeUInt16BE(head.readUInt16BE(4), 24);
  out.writeUInt16BE(head.readUInt16BE(6), 26);
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (!args.length || args.length % 2) {
    console.error('الاستعمال: node scripts/fonts/convert.mjs <مصدر.ttf> <مخرج.woff2> [...]');
    process.exit(2);
  }
  for (let i = 0; i < args.length; i += 2) {
    const source = fs.readFileSync(args[i]);
    const woff2 = encodeWoff2(source);
    fs.writeFileSync(args[i + 1], woff2);
    console.log(`${args[i]} (${source.length} بايت) ← ${args[i + 1]} (${woff2.length} بايت)`);
  }
}
