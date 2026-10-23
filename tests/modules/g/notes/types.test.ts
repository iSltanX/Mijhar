// نموذج الملاحظة: مدققات الأهداف والسجلات، وحالة المرساة حقل مستقل، ووصف الهدف.
import { describe, expect, it } from 'vitest';
import { ANCHOR_STATUSES, MAX_NOTE_LENGTH, NOTE_LEVELS, NOTE_SCHEMA_VERSION, describeTarget, isNote, isNoteTarget, noteRecordName } from '../../../../src/modules/g/notes';
import type { Note } from '../../../../src/modules/g/notes';
import { SHA, TARGETS } from './helpers';

const note = (overrides: Record<string, unknown> = {}): unknown => ({
  id: 'n1',
  version: NOTE_SCHEMA_VERSION,
  target: TARGETS.repo,
  text: 'نص',
  anchorStatus: 'not-applicable',
  createdAt: '2026-10-23T08:00:00.000Z',
  updatedAt: '2026-10-23T08:00:00.000Z',
  url: 'https://github.com/octo/demo',
  title: null,
  ...overrides,
});

describe('isNoteTarget', () => {
  it('يقبل المستويات الخمسة بنوعي السطر', () => {
    for (const target of Object.values(TARGETS)) expect(isNoteTarget(target), JSON.stringify(target)).toBe(true);
    expect(new Set(Object.values(TARGETS).map((t) => t.level))).toEqual(new Set(NOTE_LEVELS));
  });

  it.each([
    ['مستودع بلا اسم', { level: 'repo', owner: 'octo' }],
    ['مستوى مجهول', { level: 'branch', owner: 'o', repo: 'r' }],
    ['رقم غير صحيح', { ...TARGETS.pr, number: 0 }],
    ['نوع موضوع مجهول', { ...TARGETS.pr, kind: 'discussion' }],
    ['التزام بلا معرّف', { level: 'commit', owner: 'o', repo: 'r' }],
    ['ملف بلا مسار', { ...TARGETS.file, path: '' }],
    ['نوع مرجع مجهول', { ...TARGETS.file, refKind: 'tag' }],
    ['نطاق معكوس', { ...TARGETS.blobLine, start: 9, end: 2 }],
    ['سطر صفر', { ...TARGETS.blobLine, start: 0, end: 1 }],
    ['جهة فروق مجهولة', { ...TARGETS.diffLine, side: 'X' }],
    ['سياق فروق بلا رقم', { ...TARGETS.diffLine, context: { kind: 'pr' } }],
    ['عرض سطر مجهول', { ...TARGETS.blobLine, view: 'blame' }],
    ['ليس كائنًا', 'repo'],
  ])('يرفض %s', (_name, target) => expect(isNoteTarget(target)).toBe(false));
});

describe('isNote', () => {
  it('سجل سليم', () => expect(isNote(note())).toBe(true));

  it('كل حالات المرساة المحجوزة مقبولة (T-8.3 لا يحتاج ترحيل مخطط)', () => {
    for (const status of ANCHOR_STATUSES) expect(isNote(note({ anchorStatus: status }))).toBe(true);
    expect(ANCHOR_STATUSES).toEqual(expect.arrayContaining(['matched', 'shifted', 'ambiguous', 'changed', 'resource-unavailable', 'access-lost']));
  });

  it.each([
    ['حالة مرساة مجهولة', { anchorStatus: 'lost' }],
    ['إصدار مخطط مختلف', { version: 2 }],
    ['نص ليس نصًا', { text: 7 }],
    ['نص فوق السقف', { text: 'x'.repeat(MAX_NOTE_LENGTH + 1) }],
    ['بلا معرّف', { id: '' }],
    ['هدف تالف', { target: { level: 'repo' } }],
    ['عنوان غير نص', { title: 5 }],
  ])('يرفض %s', (_name, patch) => expect(isNote(note(patch))).toBe(false));

  it('يقبل نصًا فارغًا في السجل المخزَّن (الإنشاء وحده يمنعه)', () => expect(isNote(note({ text: '' }))).toBe(true));
});

describe('الوصف والتسمية', () => {
  it('اسم السجل بالبادئة', () => expect(noteRecordName('abc')).toBe('notes.abc'));

  it('وصف الهدف لكل مستوى', () => {
    expect(describeTarget(TARGETS.repo!)).toBe('octo/demo');
    expect(describeTarget(TARGETS.pr!)).toBe('octo/demo#42');
    expect(describeTarget(TARGETS.commit!)).toBe(`octo/demo@${SHA.slice(0, 7)}`);
    expect(describeTarget(TARGETS.file!)).toBe('octo/demo: lib/response.js');
    expect(describeTarget(TARGETS.blobLine!)).toBe('octo/demo: lib/response.js (3–5)');
    expect(describeTarget(TARGETS.diffLine!)).toBe('octo/demo: src/app.js (الجديد 5)');
  });
});

describe('حقل المرساة مستقل عن النص', () => {
  it('النوع يفصل الحقلين: لا تعتمد إحداهما على الأخرى في المخطط', () => {
    const sample = note({ anchorStatus: 'unanchored', text: 'سطر لم يُثبَّت' }) as Note;
    expect(isNote(sample)).toBe(true);
    expect(sample.anchorStatus).toBe('unanchored');
    expect(sample.text).toBe('سطر لم يُثبَّت');
  });
});
