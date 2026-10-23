// حارس ترميز: Chromium يرفض سكربت محتوى فيه محرف «غير حرفي» (U+FDD0–U+FDEF وU+xFFFE/U+xFFFF) أو نصف بديل منفرد، بـ«ليس UTF-8»
// (base::IsStringUTF8)، والحزمة تكتب هروب \uFFFF حرفيًا. فلا يرد شيء منها في شيفرة هذه المرحلة، لا حرفيًا ولا بهروب.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const DIRS = ['src/modules/g/bookmarks', 'src/modules/g/anchor', 'src/modules/h/readme-wizard'];

function files(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));
}

const NONCHAR_ESCAPE = /\\u(?:fdd[0-9a-f]|fde[0-9a-f]|fff[ef]|d[89a-f][0-9a-f]{2})|\\u\{(?:[0-9a-f]*fff[ef]|fdd[0-9a-f]|fde[0-9a-f])\}/i;
const isNonchar = (c: number): boolean => (c >= 0xfdd0 && c <= 0xfdef) || (c & 0xfffe) === 0xfffe || (c >= 0xd800 && c <= 0xdfff);

describe('لا محارف يرفضها Chromium في سكربت المحتوى', () => {
  it.each(DIRS.flatMap(files))('%s', (file) => {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(NONCHAR_ESCAPE.test(text)).toBe(false);
    expect([...text].some((ch) => isNonchar(ch.codePointAt(0) as number))).toBe(false);
  });
});
