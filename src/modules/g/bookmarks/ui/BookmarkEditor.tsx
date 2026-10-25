// محرر رابط محفوظ: وسم الحالة (أربعة)، والوسوم المخصصة، والملاحظة السريعة. يُستعمل في شريط الصفحة وفي المركز.
import { useState } from 'preact/hooks';
import type { BookmarksRepository } from '../repository';
import { BOOKMARK_STATUSES, MAX_QUICK_NOTE_LENGTH, MAX_TAGS, STATUS_LABELS, parseTags } from '../types';
import type { Bookmark, BookmarkPatch, BookmarkStatus } from '../types';

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export interface BookmarkEditorProps {
  readonly bookmark: Bookmark;
  readonly repository: BookmarksRepository;
  /** معرّف فريد لحقول هذا المحرر (أكثر من محرر في الصفحة الواحدة). */
  readonly idPrefix: string;
  readonly onDone?: () => void;
}

export function BookmarkEditor({ bookmark, repository, idPrefix, onDone }: BookmarkEditorProps) {
  // ما كان عليه الرابط حين فُتح المحرر: يُرسل ما غيّره المستخدم وحده (MJ-TA-03)، فلا يمحو حفظٌ هنا ما عدّلته نافذة أخرى في حقل لم يُلمس هنا.
  const [opened] = useState(() => ({ status: bookmark.status, tags: [...bookmark.tags], note: bookmark.note }));
  const [status, setStatus] = useState<BookmarkStatus>(bookmark.status);
  const [tags, setTags] = useState(bookmark.tags.join('، '));
  const [note, setNote] = useState(bookmark.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = (event: Event): void => {
    event.preventDefault();
    if (busy) return;
    const parsed = parseTags(tags);
    const patch: BookmarkPatch = {
      ...(status === opened.status ? {} : { status }),
      ...(parsed.join('\n') === opened.tags.join('\n') ? {} : { tags: parsed }),
      ...(note.trim() === opened.note.trim() ? {} : { note }),
    };
    if (Object.keys(patch).length === 0) {
      onDone?.();
      return;
    }
    setBusy(true);
    setError(null);
    repository.update(bookmark.id, patch).then(
      () => {
        setBusy(false);
        onDone?.();
      },
      (e: unknown) => {
        setBusy(false);
        setError(describeError(e));
      },
    );
  };

  return (
    <form class="later-editor" data-bookmark-editor={bookmark.id} onSubmit={save}>
      <div class="field">
        <span class="field-title" id={`${idPrefix}-status`}>
          وسم الحالة
        </span>
        <div class="chips" role="radiogroup" aria-labelledby={`${idPrefix}-status`}>
          {BOOKMARK_STATUSES.map((s) => (
            <button type="button" key={s} class="chip" role="radio" data-status={s} aria-pressed={s === status ? 'true' : 'false'} aria-checked={s === status ? 'true' : 'false'} onClick={() => setStatus(s)}>
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
      <div class="field">
        <label for={`${idPrefix}-tags`}>الوسوم</label>
        <input id={`${idPrefix}-tags`} type="text" dir="auto" value={tags} placeholder="مثل: مراجعة، أداء" onInput={(e) => setTags((e.currentTarget as HTMLInputElement).value)} />
        <span class="muted small">افصل بفاصلة؛ حتى {MAX_TAGS} وسمًا.</span>
      </div>
      <div class="field">
        <label for={`${idPrefix}-note`}>ملاحظة سريعة</label>
        <textarea id={`${idPrefix}-note`} dir="auto" maxLength={MAX_QUICK_NOTE_LENGTH} value={note} onInput={(e) => setNote((e.currentTarget as HTMLTextAreaElement).value)} />
      </div>
      {error && (
        <p class="notice" data-tone="danger" role="alert">
          {error}
        </p>
      )}
      <div class="actions">
        <button type="submit" class="btn btn-small btn-primary" data-action="save-bookmark" disabled={busy}>
          احفظ
        </button>
        {onDone && (
          <button type="button" class="btn btn-small" data-action="cancel-bookmark" disabled={busy} onClick={onDone}>
            إلغاء
          </button>
        )}
      </div>
    </form>
  );
}
