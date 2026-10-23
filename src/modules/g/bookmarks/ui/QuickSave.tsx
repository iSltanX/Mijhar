// زر الحفظ السريع «أكمل لاحقًا»: نقرة واحدة تحفظ الصفحة بحقولها، ثم يظهر محرر الحالة والوسوم والملاحظة. الصفحة المحفوظة تُعرض
// بحالتها مع «حدّث الموضع» و«أزل»، و«انتقل إلى موضعي» حين يُعرف موضع التمرير ويوجد من ينفّذه (الصفحة نفسها لا اللوحة).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PageInfo } from '../../../../shared/page';
import { useStyles } from '../../../../shared/ui/useStyles';
import { useBookmarks } from '../context';
import type { BookmarksRepository } from '../repository';
import { STATUS_LABELS, describePosition, pageKey } from '../types';
import type { Bookmark, BookmarkDraft } from '../types';
import { BookmarkEditor } from './BookmarkEditor';
import { LATER_CSS, LATER_STYLE_ID } from './styles';

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export interface QuickSaveProps {
  readonly repository: BookmarksRepository;
  readonly page: PageInfo;
  /** مسودة الحفظ من الصفحة الآن (بموضع التمرير في الصفحة نفسها)، أو null لصفحة لا تُحفظ. */
  readonly capture: () => BookmarkDraft | null;
  /** ينقل إلى موضع التمرير المحفوظ؛ يمرَّر في الصفحة نفسها وحدها. */
  readonly onJump?: (bookmark: Bookmark) => void;
  readonly mode: 'page' | 'panel';
}

export function QuickSave({ repository, page, capture, onJump, mode }: QuickSaveProps) {
  const root = useRef<HTMLDivElement>(null);
  useStyles(root, LATER_STYLE_ID, LATER_CSS);
  const all = useBookmarks(repository);
  const saved = useMemo(() => repository.findByPage(page.href), [all, page.href]);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedKey = saved?.id ?? null;

  useEffect(() => {
    setConfirming(false);
    if (!savedKey) setEditing(false);
  }, [savedKey, pageKey(page.href)]);

  const run = (task: () => Promise<unknown>, done?: () => void): void => {
    setBusy(true);
    setError(null);
    task().then(
      () => {
        setBusy(false);
        done?.();
      },
      (e: unknown) => {
        setBusy(false);
        setError(describeError(e));
      },
    );
  };

  const save = (): void => {
    const draft = capture();
    if (!draft) {
      setError('لا تُحفظ إلا صفحات github.com.');
      return;
    }
    run(() => repository.create(draft), () => setEditing(true));
  };

  const refresh = (bookmark: Bookmark): void => {
    const draft = capture();
    if (!draft) return;
    run(() => repository.update(bookmark.id, { position: draft.position, title: draft.title, branch: draft.branch }));
  };

  const position = saved ? describePosition(saved.position) : null;
  return (
    <div ref={root} class="later" data-quick-save={mode}>
      <section class="later-bar" aria-label="أكمل لاحقًا">
        {!saved ? (
          <div class="bar-row">
            <span class="muted small">احفظ هذه الصفحة وموضعك فيها لتعود إليها من «ملاحظاتي وأكمل لاحقًا».</span>
            <button type="button" class="btn btn-small btn-primary" data-action="quick-save" disabled={busy} onClick={save}>
              أكمل لاحقًا
            </button>
          </div>
        ) : (
          <>
            <div class="bar-row">
              <span class="saved" data-saved={saved.id}>
                في «أكمل لاحقًا»:{' '}
                <span class="tag status-tag" data-status={saved.status}>
                  {STATUS_LABELS[saved.status]}
                </span>
                {position && <> · {position}</>}
              </span>
              <span class="actions">
                <button type="button" class="btn btn-small" data-action="edit-bookmark" aria-expanded={editing ? 'true' : 'false'} disabled={busy} onClick={() => setEditing(!editing)}>
                  عدّل
                </button>
                <button type="button" class="btn btn-small" data-action="refresh-position" disabled={busy} onClick={() => refresh(saved)}>
                  حدّث الموضع
                </button>
                {onJump && saved.position?.kind === 'scroll' && (
                  <button type="button" class="btn btn-small" data-action="jump" onClick={() => onJump(saved)}>
                    انتقل إلى موضعي
                  </button>
                )}
                {confirming ? (
                  <>
                    <button type="button" class="btn btn-small btn-danger" data-action="confirm-remove" disabled={busy} onClick={() => run(() => repository.remove(saved.id), () => setConfirming(false))}>
                      تأكيد الإزالة
                    </button>
                    <button type="button" class="btn btn-small" data-action="cancel-remove" disabled={busy} onClick={() => setConfirming(false)}>
                      إلغاء
                    </button>
                  </>
                ) : (
                  <button type="button" class="btn btn-small btn-danger" data-action="remove-bookmark" disabled={busy} onClick={() => setConfirming(true)}>
                    أزل
                  </button>
                )}
              </span>
            </div>
            {editing && <BookmarkEditor key={saved.id} bookmark={saved} repository={repository} idPrefix={`mj-later-${mode}`} onDone={() => setEditing(false)} />}
          </>
        )}
        {error && (
          <p class="notice" data-tone="danger" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
