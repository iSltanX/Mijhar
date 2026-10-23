// مساحة عمل الملاحظات: اختيار المستوى، وكتابة ملاحظة جديدة، وقائمة ملاحظات الصفحة بالتعديل والحذف. تُرسم بالمكوّن نفسه في بطاقة
// الصفحة وفي اللوحة الجانبية والدرج (mode)، فسلوك الإنشاء والتحرير واحد في الثلاثة.
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PageInfo } from '../../../../shared/page';
import { useStyles } from '../../../../shared/ui/useStyles';
import { checkNoteText } from '../repository';
import type { NotesRepository } from '../repository';
import { defaultLevel, notesForPage, notesForRepo, targetOptions } from '../targets';
import type { Relation } from '../targets';
import { ANCHOR_LABELS, LEVEL_LABELS, NOTE_LEVELS, describeTarget } from '../types';
import type { LineTarget, Note, NoteLevel } from '../types';
import { NOTES_CSS, NOTES_STYLE_ID } from './styles';

export type WorkspaceMode = 'card' | 'panel';

export interface NotesWorkspaceProps {
  readonly repository: NotesRepository;
  readonly page: PageInfo;
  readonly mode: WorkspaceMode;
  /** هل السطر المحدد ظاهر في الصفحة الآن؛ يعرفه الدرج وبطاقة الصفحة وحدهما (اللوحة الجانبية لا ترى DOM). */
  readonly locate?: (target: LineTarget) => boolean;
  /** ملاحظة تُبرز وتُمرَّر إلى مجال الرؤية (من نقر علامة سطر). */
  readonly highlightId?: string | null;
  /** بعد إنشاء ملاحظة من هذه المساحة (بطاقة الصفحة تحفظ مرساة السطر، T-8.3). */
  readonly onCreated?: (note: Note) => void;
  /** عرض حالة مرساة ملاحظة سطر بدل الوسم البسيط (بطاقة الصفحة وحدها ترى أسطر الملف، T-8.3). */
  readonly renderAnchor?: (note: Note) => ComponentChildren;
}

/** ملاحظات المستودع كلها وتحديثها الحي من أي سياق. */
export function useNotes(repository: NotesRepository): Note[] {
  const [notes, setNotes] = useState<Note[]>(() => repository.list());
  useEffect(() => {
    setNotes(repository.list());
    return repository.subscribe(() => setNotes(repository.list()));
  }, [repository]);
  return notes;
}

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  } catch {
    return date.toISOString();
  }
}

/** هوية الصفحة بلا الهاش: تغيّر تحديد الأسطر لا يعيد ضبط المستوى الذي اختاره المستخدم. */
const pageIdentity = (page: PageInfo): string => [page.owner, page.repo, page.type, page.number, page.sha, page.blobRest, page.diffPath].join('|');

interface NoteItemProps {
  readonly note: Note;
  readonly relation: Relation | null;
  readonly repository: NotesRepository;
  readonly showTarget: boolean;
  /** رابط لفتح صفحة الملاحظة في تبويب جديد (اللوحة الجانبية، فلا تتنقل اللوحة نفسها). */
  readonly showOpen: boolean;
  readonly flash: boolean;
  readonly onError: (message: string | null) => void;
  readonly renderAnchor?: ((note: Note) => ComponentChildren) | undefined;
}

const isGithubUrl = (url: string): boolean => url.startsWith('https://github.com/');

function NoteItem({ note, relation, repository, showTarget, showOpen, flash, onError, renderAnchor }: NoteItemProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (flash) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [flash]);

  const run = (task: () => Promise<unknown>, done: () => void): void => {
    setBusy(true);
    onError(null);
    task().then(
      () => {
        setBusy(false);
        done();
      },
      (error: unknown) => {
        setBusy(false);
        onError(describeError(error));
      },
    );
  };

  const save = (): void => {
    if (editing === null) return;
    try {
      checkNoteText(editing);
    } catch (error) {
      onError(describeError(error));
      return;
    }
    run(() => repository.update(note.id, { text: editing }), () => setEditing(null));
  };

  const target = note.target;
  return (
    <li class="note" ref={ref} data-note-id={note.id} data-level={target.level} {...(flash ? { 'data-flash': '' } : {})}>
      {editing === null ? (
        <p class="note-text" dir="auto">
          {note.text}
        </p>
      ) : (
        <textarea
          aria-label="تعديل نص الملاحظة"
          dir="auto"
          value={editing}
          onInput={(event) => setEditing((event.currentTarget as HTMLTextAreaElement).value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') save();
          }}
        />
      )}
      <div class="note-meta">
        <span>{formatDate(note.updatedAt)}</span>
        {showTarget && (
          <span dir="auto">
            {LEVEL_LABELS[target.level]}: <span class="ltr-inline">{describeTarget(target)}</span>
          </span>
        )}
        {(target.level === 'file' || (target.level === 'line' && !(renderAnchor && relation === 'exact'))) && (
          <span class="anchor" data-status={note.anchorStatus} data-anchor-status={note.anchorStatus}>
            {ANCHOR_LABELS[note.anchorStatus]}
          </span>
        )}
        {relation === 'other-ref' && (target.level === 'file' || (target.level === 'line' && target.view === 'blob')) && (
          <span data-other-ref="">
            محفوظة على المرجع <span class="ltr-inline mono">{target.ref}</span>، وهو غير المعروض الآن
          </span>
        )}
      </div>
      {renderAnchor && relation === 'exact' && target.level === 'line' && renderAnchor(note)}
      <div class="note-actions">
        {editing === null ? (
          <>
            <button type="button" class="btn btn-small" data-action="edit" disabled={busy} onClick={() => setEditing(note.text)}>
              عدّل
            </button>
            {confirming ? (
              <>
                <button type="button" class="btn btn-small btn-danger" data-action="confirm-delete" disabled={busy} onClick={() => run(() => repository.remove(note.id), () => setConfirming(false))}>
                  تأكيد الحذف
                </button>
                <button type="button" class="btn btn-small" data-action="cancel-delete" disabled={busy} onClick={() => setConfirming(false)}>
                  إلغاء
                </button>
              </>
            ) : (
              <button type="button" class="btn btn-small btn-danger" data-action="delete" disabled={busy} onClick={() => setConfirming(true)}>
                احذف
              </button>
            )}
            {showOpen && isGithubUrl(note.url) && (
              <a class="btn btn-small" href={note.url} data-action="open" target="_blank" rel="noreferrer">
                افتح الصفحة
              </a>
            )}
          </>
        ) : (
          <>
            <button type="button" class="btn btn-small btn-primary" data-action="save-edit" disabled={busy} onClick={save}>
              احفظ التعديل
            </button>
            <button type="button" class="btn btn-small" data-action="cancel-edit" disabled={busy} onClick={() => setEditing(null)}>
              إلغاء
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export function NotesWorkspace({ repository, page, mode, locate, highlightId, onCreated, renderAnchor }: NotesWorkspaceProps) {
  const root = useRef<HTMLDivElement>(null);
  useStyles(root, NOTES_STYLE_ID, NOTES_CSS);
  const notes = useNotes(repository);
  const options = useMemo(() => targetOptions(page), [page]);
  const grouped = useMemo(() => notesForPage(notes, page), [notes, page]);
  const identity = pageIdentity(page);
  const [picked, setPicked] = useState<{ identity: string; level: NoteLevel } | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // نقر علامة سطر يفتح مستوى الملاحظة المبرزة (وإلا لبقيت في مستوى لا تظهر فيه).
  useEffect(() => {
    const flashed = highlightId ? notes.find((n) => n.id === highlightId) : undefined;
    if (flashed) setPicked({ identity, level: flashed.target.level });
  }, [highlightId, identity, notes.length]);

  const level: NoteLevel = picked && picked.identity === identity && options.some((o) => o.level === picked.level) ? picked.level : defaultLevel(options);
  const option = options.find((o) => o.level === level);
  const target = option?.target ?? null;
  const shown = grouped.byLevel[level];
  const elsewhere = useMemo(() => (mode === 'panel' ? notesForRepo(notes, page).filter((n) => !grouped.relations.has(n.id)) : []), [mode, notes, page, grouped]);

  if (!options.length) {
    return (
      <div class="notes" ref={root} data-mode={mode}>
        <p class="empty" data-notes-empty="no-repo">
          افتح صفحة مستودع على GitHub لتدوين ملاحظاتك عليه أو على طلب دمج أو التزام أو ملف أو سطر فيه.
        </p>
      </div>
    );
  }

  const submit = (event: Event): void => {
    event.preventDefault();
    if (!target || busy) return;
    let text: string;
    try {
      text = checkNoteText(draft);
    } catch (e) {
      setError(describeError(e));
      return;
    }
    setBusy(true);
    setError(null);
    const anchorStatus = target.level === 'line' ? (locate ? (locate(target) ? 'unverified' : 'unanchored') : 'unverified') : 'not-applicable';
    repository.create({ target, text, url: page.href, title: page.title, anchorStatus }).then(
      (note) => {
        setBusy(false);
        setDraft('');
        onCreated?.(note);
      },
      (e: unknown) => {
        setBusy(false);
        setError(describeError(e));
      },
    );
  };

  return (
    <div class="notes" ref={root} data-mode={mode}>
      <div class="chips" role="group" aria-label="مستوى الملاحظة">
        {NOTE_LEVELS.filter((l) => options.some((o) => o.level === l)).map((l) => (
          <button
            type="button"
            class="chip"
            key={l}
            data-level={l}
            aria-pressed={l === level ? 'true' : 'false'}
            onClick={() => setPicked({ identity, level: l })}
          >
            {LEVEL_LABELS[l]} ({grouped.byLevel[l].length})
          </button>
        ))}
      </div>

      <form class="composer" onSubmit={submit}>
        <label class="field" for={`mj-note-draft-${mode}`}>
          ملاحظة جديدة{target ? <> على <span class="ltr-inline mono">{describeTarget(target)}</span></> : ''}
        </label>
        <textarea
          id={`mj-note-draft-${mode}`}
          dir="auto"
          value={draft}
          disabled={!target || busy}
          placeholder={target ? 'اكتب ملاحظتك الخاصة؛ تبقى على جهازك ولا تُنشر.' : (option?.reason ?? '')}
          onInput={(e) => setDraft((e.currentTarget as HTMLTextAreaElement).value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit(e);
          }}
        />
        {!target && option?.reason && (
          <p class="hint small" data-reason="">
            {option.reason}
          </p>
        )}
        <div class="row">
          <button type="submit" class="btn btn-primary" data-action="create" disabled={!target || busy || !draft.trim()}>
            احفظ الملاحظة
          </button>
        </div>
      </form>

      {error && (
        <p class="notice" data-tone="danger" role="alert">
          {error}
        </p>
      )}

      {shown.length ? (
        <ul class="note-list" aria-label={`ملاحظات مستوى ${LEVEL_LABELS[level]}`}>
          {shown.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              relation={grouped.relations.get(note.id) ?? null}
              repository={repository}
              showTarget={note.target.level === 'line' || note.target.level === 'file'}
              showOpen={mode === 'panel'}
              flash={highlightId === note.id}
              onError={setError}
              renderAnchor={renderAnchor}
            />
          ))}
        </ul>
      ) : (
        <p class="hint" data-notes-empty="level">
          لا ملاحظات على هذا المستوى بعد.
        </p>
      )}

      {elsewhere.length > 0 && (
        <section aria-label="ملاحظات أخرى في هذا المستودع">
          <h3 class="group-title">ملاحظات أخرى في هذا المستودع ({elsewhere.length})</h3>
          <ul class="note-list">
            {elsewhere.map((note) => (
              <NoteItem key={note.id} note={note} relation={null} repository={repository} showTarget showOpen flash={highlightId === note.id} onError={setError} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
