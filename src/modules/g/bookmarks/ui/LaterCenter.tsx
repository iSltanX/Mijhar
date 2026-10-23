// مركز «ملاحظاتي وأكمل لاحقًا»: بحث فوري في الملاحظات والروابط المحفوظة معًا، وتصفية بالنوع والمستودع والمستوى والوسم والحالة
// والتاريخ، وفرز. الفهرس يُبنى عند تغيّر البيانات وحدها، والاستعلام مرور واحد عليه (search.ts). تحرير الملاحظات في مساحة عملها؛
// وهنا يُحرَّر الرابط المحفوظ ويُزال، وتُفتح صفحة العنصر في تبويب جديد بنقر المستخدم.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStyles } from '../../../../shared/ui/useStyles';
import { useNotes } from '../../notes/ui/NotesWorkspace';
import type { NotesRepository } from '../../notes/repository';
import { describeTarget } from '../../notes/types';
import { useBookmarks } from '../context';
import type { BookmarksRepository } from '../repository';
import { CENTER_SORTS, DATE_PRESETS, DATE_PRESET_LABELS, SORT_LABELS, buildIndex, centerFacets, presetFrom, queryCenter } from '../search';
import type { CenterEntry, CenterKind, CenterSort, DatePreset } from '../search';
import { BOOKMARK_LEVELS, BOOKMARK_LEVEL_LABELS, BOOKMARK_STATUSES, STATUS_LABELS, describePosition } from '../types';
import type { BookmarkLevel, BookmarkStatus } from '../types';
import { BookmarkEditor } from './BookmarkEditor';
import { LATER_CSS, LATER_STYLE_ID } from './styles';

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** تُرسم النتائج دفعات: زمن «ظهور النتائج» (PB-04) لا يكبر بحجم المجموعة. */
export const CENTER_PAGE_SIZE = 50;

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  } catch {
    return date.toISOString();
  }
}

const isGithubUrl = (url: string): boolean => url.startsWith('https://github.com/');

function BookmarkResult({ entry, repository }: { entry: CenterEntry; repository: BookmarksRepository }) {
  const bookmark = entry.bookmark;
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!bookmark) return null;
  const position = describePosition(bookmark.position);
  return (
    <li class="entry" data-entry-kind="bookmark" data-entry-id={bookmark.id}>
      <div class="entry-head">
        <a class="entry-title" href={bookmark.url} target="_blank" rel="noreferrer" dir="auto" data-action="open-entry">
          {entry.title}
        </a>
        <span class="tag status-tag" data-status={bookmark.status}>
          {STATUS_LABELS[bookmark.status]}
        </span>
      </div>
      <div class="meta">
        <span class="kind" data-kind="bookmark">
          رابط
        </span>
        {entry.repo && <span class="ltr-inline mono">{entry.repo}</span>}
        {bookmark.branch && (
          <span>
            {bookmark.refKind === 'sha' ? 'التزام' : 'الفرع'}: <span class="ltr-inline mono">{bookmark.refKind === 'sha' ? bookmark.branch.slice(0, 7) : bookmark.branch}</span>
          </span>
        )}
        <span>{BOOKMARK_LEVEL_LABELS[bookmark.level]}</span>
        {position && <span>{position}</span>}
        <span>حُفظ {formatDate(bookmark.savedAt)}</span>
      </div>
      {bookmark.tags.length > 0 && (
        <div class="chips" aria-label="الوسوم">
          {bookmark.tags.map((t) => (
            <span key={t} class="tag" dir="auto">
              {t}
            </span>
          ))}
        </div>
      )}
      {bookmark.note && !editing && (
        <p class="entry-text" dir="auto">
          {bookmark.note}
        </p>
      )}
      {editing ? (
        <BookmarkEditor bookmark={bookmark} repository={repository} idPrefix={`mj-center-${bookmark.id}`} onDone={() => setEditing(false)} />
      ) : (
        <div class="actions">
          <button type="button" class="btn btn-small" data-action="edit-bookmark" onClick={() => setEditing(true)}>
            عدّل
          </button>
          {confirming ? (
            <>
              <button
                type="button"
                class="btn btn-small btn-danger"
                data-action="confirm-remove"
                onClick={() => repository.remove(bookmark.id).then(() => setConfirming(false), (e: unknown) => setError(describeError(e)))}
              >
                تأكيد الإزالة
              </button>
              <button type="button" class="btn btn-small" data-action="cancel-remove" onClick={() => setConfirming(false)}>
                إلغاء
              </button>
            </>
          ) : (
            <button type="button" class="btn btn-small btn-danger" data-action="remove-bookmark" onClick={() => setConfirming(true)}>
              أزل
            </button>
          )}
        </div>
      )}
      {error && (
        <p class="notice" data-tone="danger" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function NoteResult({ entry }: { entry: CenterEntry }) {
  const note = entry.note;
  if (!note) return null;
  return (
    <li class="entry" data-entry-kind="note" data-entry-id={note.id}>
      <p class="entry-text" dir="auto">
        {note.text}
      </p>
      <div class="meta">
        <span class="kind" data-kind="note">
          ملاحظة
        </span>
        <span class="ltr-inline">{describeTarget(note.target)}</span>
        <span>أُنشئت {formatDate(note.createdAt)}</span>
      </div>
      {isGithubUrl(note.url) && (
        <div class="actions">
          <a class="btn btn-small" href={note.url} target="_blank" rel="noreferrer" data-action="open-entry">
            افتح الصفحة
          </a>
        </div>
      )}
    </li>
  );
}

export interface LaterCenterProps {
  readonly notes: NotesRepository;
  readonly bookmarks: BookmarksRepository;
  /** الساعة (للاختبارات). */
  readonly now?: () => Date;
}

export function LaterCenter({ notes: notesRepository, bookmarks: bookmarksRepository, now = () => new Date() }: LaterCenterProps) {
  const root = useRef<HTMLDivElement>(null);
  useStyles(root, LATER_STYLE_ID, LATER_CSS);
  const notes = useNotes(notesRepository);
  const bookmarks = useBookmarks(bookmarksRepository);
  const index = useMemo(() => buildIndex(notes, bookmarks), [notes, bookmarks]);
  const facets = useMemo(() => centerFacets(index), [index]);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<CenterKind | 'all'>('all');
  const [repo, setRepo] = useState('');
  const [level, setLevel] = useState<BookmarkLevel | 'all'>('all');
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState<BookmarkStatus | 'all'>('all');
  const [preset, setPreset] = useState<DatePreset>('all');
  const [sort, setSort] = useState<CenterSort>('newest');
  const [limit, setLimit] = useState(CENTER_PAGE_SIZE);
  const results = useMemo(
    () => queryCenter(index, { text, kind, repo: repo || null, level, tag: tag || null, status, from: presetFrom(preset, now()), sort }),
    [index, text, kind, repo, level, tag, status, preset, sort],
  );
  // أي تغيير في المعايير يعيد العرض إلى الدفعة الأولى.
  useEffect(() => setLimit(CENTER_PAGE_SIZE), [text, kind, repo, level, tag, status, preset, sort]);
  const shown = results.length > limit ? results.slice(0, limit) : results;

  return (
    <div class="later" ref={root} data-later-center="">
      <div class="field">
        <label for="mj-later-search">ابحث في ملاحظاتك وروابطك المحفوظة</label>
        <input id="mj-later-search" type="search" dir="auto" value={text} placeholder="كلمة من النص أو العنوان أو الوسم أو المستودع" onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)} />
      </div>
      <div class="filters" role="group" aria-label="التصفية والفرز">
        <div class="field">
          <label for="mj-later-kind">النوع</label>
          <select id="mj-later-kind" value={kind} onChange={(e) => setKind((e.currentTarget as HTMLSelectElement).value as CenterKind | 'all')}>
            <option value="all">الكل</option>
            <option value="note">الملاحظات</option>
            <option value="bookmark">الروابط المحفوظة</option>
          </select>
        </div>
        <div class="field">
          <label for="mj-later-repo">المستودع</label>
          <select id="mj-later-repo" value={repo} onChange={(e) => setRepo((e.currentTarget as HTMLSelectElement).value)}>
            <option value="">كل المستودعات</option>
            {facets.repos.map((r) => (
              <option key={r.repo} value={r.repo}>
                {r.repo} ({r.count})
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="mj-later-level">المستوى</label>
          <select id="mj-later-level" value={level} onChange={(e) => setLevel((e.currentTarget as HTMLSelectElement).value as BookmarkLevel | 'all')}>
            <option value="all">كل المستويات</option>
            {BOOKMARK_LEVELS.map((l) => (
              <option key={l} value={l}>
                {BOOKMARK_LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="mj-later-tag">الوسم</label>
          <select id="mj-later-tag" value={tag} onChange={(e) => setTag((e.currentTarget as HTMLSelectElement).value)}>
            <option value="">كل الوسوم</option>
            {facets.tags.map((t) => (
              <option key={t.tag} value={t.tag}>
                {t.tag} ({t.count})
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="mj-later-status">الحالة</label>
          <select id="mj-later-status" value={status} onChange={(e) => setStatus((e.currentTarget as HTMLSelectElement).value as BookmarkStatus | 'all')}>
            <option value="all">كل الحالات</option>
            {BOOKMARK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="mj-later-date">التاريخ</label>
          <select id="mj-later-date" value={preset} onChange={(e) => setPreset((e.currentTarget as HTMLSelectElement).value as DatePreset)}>
            {DATE_PRESETS.map((p) => (
              <option key={p} value={p}>
                {DATE_PRESET_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="mj-later-sort">الفرز</label>
          <select id="mj-later-sort" value={sort} onChange={(e) => setSort((e.currentTarget as HTMLSelectElement).value as CenterSort)}>
            {CENTER_SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p class="count-line" role="status" data-result-count={results.length}>
        {index.length === 0 ? 'لا ملاحظات ولا روابط محفوظة بعد.' : `${results.length} من ${index.length}`}
      </p>
      {shown.length > 0 && (
        <ul class="results" aria-label="النتائج">
          {shown.map((entry) =>
            entry.kind === 'bookmark' ? <BookmarkResult key={`b-${entry.id}`} entry={entry} repository={bookmarksRepository} /> : <NoteResult key={`n-${entry.id}`} entry={entry} />,
          )}
        </ul>
      )}
      {results.length > shown.length && (
        <button type="button" class="btn btn-small" data-action="show-more" onClick={() => setLimit(limit + CENTER_PAGE_SIZE)}>
          اعرض {Math.min(CENTER_PAGE_SIZE, results.length - shown.length)} أخرى ({shown.length} من {results.length} معروضة)
        </button>
      )}
    </div>
  );
}
