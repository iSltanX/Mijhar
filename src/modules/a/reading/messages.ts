// رسائل وضع القراءة بين السياقات الثلاثة:
//  - سكربت المحتوى ← الخلفية: OPEN (افتح العارض لهذا التبويب). الخلفية تعرف التبويب من المرسِل لا من الرسالة.
//  - العارض ← سكربت المحتوى في التبويب المصدر (tabs.sendMessage): SNAPSHOT، والرد لقطة أو سبب التعذر.
// لا تحمل أي رسالة سرًّا ولا عنوانًا يُفتح: العارض صفحة الإضافة نفسها ورقم التبويب من المتصفح.
import type { ReadingSnapshot } from './snapshot';

export const READING_OPEN_MESSAGE = 'mijhar:a.reading:open';
export const READING_SNAPSHOT_MESSAGE = 'mijhar:a.reading:snapshot';
export const READER_PAGE = 'reader.html';

export type SnapshotResponse = { readonly ok: true; readonly snapshot: ReadingSnapshot } | { readonly ok: false; readonly reason: 'no-content' | 'disabled' };

const typed = (message: unknown, type: string): boolean => typeof message === 'object' && message !== null && (message as { type?: unknown }).type === type;

export const isReadingOpen = (message: unknown): boolean => typed(message, READING_OPEN_MESSAGE);
export const isSnapshotRequest = (message: unknown): boolean => typed(message, READING_SNAPSHOT_MESSAGE);

/** عنوان العارض لتبويب مصدر. */
export const readerUrl = (getURL: (path: string) => string, tabId: number): string => getURL(`${READER_PAGE}?tab=${tabId}`);

/** رقم التبويب المصدر من عنوان العارض، أو null. */
export function sourceTabFrom(search: string): number | null {
  const value = new URLSearchParams(search).get('tab');
  return value && /^\d{1,10}$/.test(value) ? Number(value) : null;
}
