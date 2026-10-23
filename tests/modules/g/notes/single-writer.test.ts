// حراسة «الخلفية الكاتب الوحيد للملاحظات والمراسي» (AD-25، VR-01): كل إنشاء وتعديل وحذف واستيراد واستعادة لسجلات notes.* وanchors.* ينفَّذ في
// الخلفية وحدها (NotesBroker في طابور واحد)، وأي سياق آخر (سكربت المحتوى واللوحة والإعدادات) يرسل رسالة mijhar/notes-write. هذا فحص ساكن على
// src/ يمنع عودة مسار الكتابة المباشر من سياقين بمخزنين: فمخزنان بلا وسيط يضيّعان إحدى الكتابتين المتزامنتين ويعيدان ملاحظة محذوفة
// (tests/modules/g/notes/broker.test.ts تثبت ذلك). ومرحلة التصدير والاستيراد (T-8.4) تضيف عمليات إلى الوسيط ولا تفتح مسارًا مباشرًا.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SRC = path.join(ROOT, 'src');

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const rel = (file: string): string => path.relative(ROOT, file).split(path.sep).join('/');
const files = sources(SRC).map((file) => ({ file: rel(file), text: fs.readFileSync(file, 'utf8') }));

/** الملفات المسموح لها بكتابة مباشرة: الطبقة المنطقية التي تعمل في الخلفية، ووسيطها، والمخزن نفسه، ونقطة دخول الخلفية. */
const DIRECT_WRITERS = new Set(['src/modules/g/notes/repository.ts', 'src/modules/g/anchor/store.ts', 'src/modules/g/notes/broker.ts', 'src/core/storage/store.ts', 'src/background/main.ts']);

/** نص الوسائط لاستدعاء يبدأ عند الفهرس (الأقواس المتوازنة)، أو null. */
function callArguments(text: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')' && --depth === 0) return text.slice(open + 1, i);
  }
  return null;
}

describe('الخلفية كاتب وحيد للملاحظات والمراسي (AD-25)', () => {
  it('فتح NotesRepository وAnchorStore خارج الوسيط يمرّر writer (runtimeNotesWriter)', () => {
    const found: string[] = [];
    for (const { file, text } of files) {
      if (file === 'src/modules/g/notes/broker.ts') continue;
      for (const m of text.matchAll(/\b(NotesRepository|AnchorStore)\.open\(/g)) {
        const args = callArguments(text, m.index + m[0].length - 1);
        found.push(`${file}: ${m[1]}.open`);
        expect(args, `${file}: ${m[1]}.open(…) بلا writer — الكتابة المباشرة للخلفية وحدها`).toMatch(/\bwriter\b/);
      }
    }
    // الحراسة نفسها لا تفرغ: سياقات الوحدة (ز) الثلاثة تفتحهما.
    expect(found.length).toBeGreaterThanOrEqual(3);
  });

  it('لا ملف خارج الكتّاب المباشرين يكتب سجلات الملاحظات أو المراسي بأسمائها (write وupdate وremove وremoveMany)', () => {
    const names = /\b(noteRecordName|anchorRecordName|NOTE_PREFIX|ANCHOR_PREFIX)\b/;
    const writes = /\.(write|update|remove|removeMany)\s*(<[^>(]*>)?\s*\(/;
    const offenders = files.filter(({ file, text }) => !DIRECT_WRITERS.has(file) && !file.endsWith('/types.ts') && names.test(text) && writes.test(text)).map(({ file }) => file);
    expect(offenders, 'كتابة مباشرة لسجل ملاحظة أو مرساة خارج الخلفية: أضف عملية إلى NotesBroker (writer.ts وbroker.ts)').toEqual([]);
  });

  it('الاستيراد والاستعادة من نسخة احتياطية (importData وrestoreBackup) لا يُستدعيان خارج المخزن والخلفية', () => {
    const offenders = files
      .filter(({ file, text }) => !file.startsWith('src/core/storage/') && !DIRECT_WRITERS.has(file) && /\.(importData|restoreBackup)\s*\(/.test(text))
      .map(({ file }) => file);
    expect(offenders, 'استيراد أو استعادة يكتبان الملاحظات والمراسي مباشرة: نفّذهما عملية في NotesBroker داخل الخلفية').toEqual([]);
  });

  it('الخلفية تستقبل رسائل الكتابة وتُجيب بها، وهي وحدها التي تبني الوسيط', () => {
    const main = files.find((f) => f.file === 'src/background/main.ts')?.text ?? '';
    expect(main).toMatch(/new NotesBroker\(/);
    expect(main).toMatch(/isNotesWriteRequest\(message\)/);
    const builders = files.filter(({ file, text }) => /new NotesBroker\(|NotesBroker\.forStore\(/.test(text) && file !== 'src/modules/g/notes/broker.ts').map(({ file }) => file);
    expect(builders).toEqual(['src/background/main.ts']);
  });
});
