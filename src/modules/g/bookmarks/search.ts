// مركز «ملاحظاتي وأكمل لاحقًا»: فهرس واحد للملاحظات والروابط المحفوظة، وبحث فوري وتصفية بالنوع والمستودع والمستوى والوسم والحالة
// والتاريخ، وفرز. دوال نقية بلا تخزين ولا شبكة. الفهرس يُبنى مرة عند تغيّر البيانات (نص مطبَّع لكل عنصر)، فيبقى البحث مرورًا
// خطيًا واحدًا ضمن ميزانية PB-04 (‏< 15ms على 500 عنصر، يقيسه TEST-NOTE-02).
import { describeTarget } from '../notes/types';
import type { Note } from '../notes/types';
import { BOOKMARK_STATUSES, describePosition } from './types';
import type { Bookmark, BookmarkLevel, BookmarkStatus } from './types';

export type CenterKind = 'note' | 'bookmark';

export interface CenterEntry {
  readonly kind: CenterKind;
  readonly id: string;
  /** «owner/repo» بحالة أحرفه، وrepoKey بأحرف صغيرة للمطابقة. */
  readonly repo: string | null;
  readonly repoKey: string | null;
  readonly level: BookmarkLevel;
  readonly tags: readonly string[];
  readonly tagKeys: readonly string[];
  readonly status: BookmarkStatus | null;
  /** تاريخ الحفظ (إنشاء الملاحظة أو حفظ الرابط)، ISO. */
  readonly date: string;
  readonly updatedAt: string;
  readonly title: string;
  readonly url: string;
  /** النص المطبَّع الذي يُبحث فيه. */
  readonly haystack: string;
  readonly note?: Note;
  readonly bookmark?: Bookmark;
}

/** تطبيع للبحث: أحرف صغيرة، وحذف التشكيل والتطويل، وتوحيد صور الألف والياء والتاء المربوطة والهمزات على الواو والياء. */
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

const slugOf = (owner: string | null, repo: string | null): string | null => (owner && repo ? `${owner}/${repo}` : null);

export function noteEntry(note: Note): CenterEntry {
  const repo = slugOf(note.target.owner, note.target.repo);
  const title = note.title ?? describeTarget(note.target);
  return {
    kind: 'note',
    id: note.id,
    repo,
    repoKey: repo?.toLowerCase() ?? null,
    level: note.target.level,
    tags: [],
    tagKeys: [],
    status: null,
    date: note.createdAt,
    updatedAt: note.updatedAt,
    title,
    url: note.url,
    haystack: normalizeForSearch([note.text, title, describeTarget(note.target)].join(' \n ')),
    note,
  };
}

export function bookmarkEntry(bookmark: Bookmark): CenterEntry {
  const repo = slugOf(bookmark.owner, bookmark.repo);
  const title = bookmark.title ?? bookmark.url;
  return {
    kind: 'bookmark',
    id: bookmark.id,
    repo,
    repoKey: repo?.toLowerCase() ?? null,
    level: bookmark.level,
    tags: bookmark.tags,
    tagKeys: bookmark.tags.map((t) => normalizeForSearch(t)),
    status: bookmark.status,
    date: bookmark.savedAt,
    updatedAt: bookmark.updatedAt,
    title,
    url: bookmark.url,
    haystack: normalizeForSearch([title, bookmark.note, bookmark.tags.join(' '), repo ?? '', bookmark.branch ?? '', describePosition(bookmark.position) ?? '', bookmark.url].join(' \n ')),
    bookmark,
  };
}

export function buildIndex(notes: readonly Note[], bookmarks: readonly Bookmark[]): CenterEntry[] {
  return [...notes.map(noteEntry), ...bookmarks.map(bookmarkEntry)];
}

export const CENTER_SORTS = ['newest', 'oldest', 'updated', 'repo', 'status'] as const;
export type CenterSort = (typeof CENTER_SORTS)[number];

export const SORT_LABELS: Readonly<Record<CenterSort, string>> = {
  newest: 'الأحدث حفظًا',
  oldest: 'الأقدم حفظًا',
  updated: 'آخر تعديل',
  repo: 'المستودع (أ–ي)',
  status: 'وسم الحالة',
};

export interface CenterQuery {
  readonly text?: string;
  readonly kind?: CenterKind | 'all';
  /** «owner/repo» بأي حالة أحرف، أو null للكل. */
  readonly repo?: string | null;
  readonly level?: BookmarkLevel | 'all';
  readonly tag?: string | null;
  readonly status?: BookmarkStatus | 'all';
  /** حدّا تاريخ الحفظ شاملان (ISO أو yyyy-mm-dd). */
  readonly from?: string | null;
  readonly to?: string | null;
  readonly sort?: CenterSort;
}

/** بداية اليوم ونهايته لتاريخ yyyy-mm-dd (UTC)، أو القيمة كما هي إن كانت ISO كاملة. */
const lowerBound = (value: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);
const upperBound = (value: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value);

const STATUS_RANK: Readonly<Record<BookmarkStatus, number>> = Object.fromEntries(BOOKMARK_STATUSES.map((s, i) => [s, i])) as Record<BookmarkStatus, number>;

function compare(sort: CenterSort): (a: CenterEntry, b: CenterEntry) => number {
  const tie = (a: CenterEntry, b: CenterEntry): number => b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
  switch (sort) {
    case 'newest':
      return tie;
    case 'oldest':
      return (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
    case 'updated':
      return (a, b) => b.updatedAt.localeCompare(a.updatedAt) || tie(a, b);
    case 'repo':
      // بلا مستودع آخرًا. لا محرف حارس مثل U+FFFF: يُكتب حرفيًا في الحزمة فيرفض Chromium سكربت المحتوى «ليس UTF-8».
      return (a, b) => (a.repoKey === b.repoKey ? 0 : a.repoKey === null ? 1 : b.repoKey === null ? -1 : a.repoKey.localeCompare(b.repoKey)) || tie(a, b);
    case 'status':
      return (a, b) => (a.status === null ? 9 : STATUS_RANK[a.status]) - (b.status === null ? 9 : STATUS_RANK[b.status]) || tie(a, b);
  }
}

/** العناصر المطابقة لكل المعايير معًا، مرتبة. كلمات البحث كلها يجب أن ترد (بأي ترتيب). */
export function queryCenter(index: readonly CenterEntry[], query: CenterQuery = {}): CenterEntry[] {
  const words = normalizeForSearch(query.text ?? '')
    .split(' ')
    .filter(Boolean);
  const kind = query.kind ?? 'all';
  const repo = query.repo ? query.repo.toLowerCase() : null;
  const level = query.level ?? 'all';
  const tag = query.tag ? normalizeForSearch(query.tag) : null;
  const status = query.status ?? 'all';
  const from = query.from ? lowerBound(query.from) : null;
  const to = query.to ? upperBound(query.to) : null;
  const out: CenterEntry[] = [];
  for (const entry of index) {
    if (kind !== 'all' && entry.kind !== kind) continue;
    if (repo !== null && entry.repoKey !== repo) continue;
    if (level !== 'all' && entry.level !== level) continue;
    if (tag !== null && !entry.tagKeys.includes(tag)) continue;
    if (status !== 'all' && entry.status !== status) continue;
    if (from !== null && entry.date < from) continue;
    if (to !== null && entry.date > to) continue;
    if (words.length && !words.every((w) => entry.haystack.includes(w))) continue;
    out.push(entry);
  }
  return out.sort(compare(query.sort ?? 'newest'));
}

export interface CenterFacets {
  readonly repos: ReadonlyArray<{ readonly repo: string; readonly count: number }>;
  readonly tags: ReadonlyArray<{ readonly tag: string; readonly count: number }>;
}

/** قيم التصفية المتاحة من الفهرس كله، بعددها. */
export function centerFacets(index: readonly CenterEntry[]): CenterFacets {
  const repos = new Map<string, { repo: string; count: number }>();
  const tags = new Map<string, { tag: string; count: number }>();
  for (const entry of index) {
    if (entry.repo && entry.repoKey) {
      const current = repos.get(entry.repoKey) ?? { repo: entry.repo, count: 0 };
      current.count += 1;
      repos.set(entry.repoKey, current);
    }
    entry.tags.forEach((t, i) => {
      const key = entry.tagKeys[i] as string;
      const current = tags.get(key) ?? { tag: t, count: 0 };
      current.count += 1;
      tags.set(key, current);
    });
  }
  const byName = <T extends { count: number }>(name: (x: T) => string) => (a: T, b: T) => b.count - a.count || name(a).localeCompare(name(b));
  return {
    repos: [...repos.values()].sort(byName((x) => x.repo)),
    tags: [...tags.values()].sort(byName((x) => x.tag)),
  };
}

export const DATE_PRESETS = ['all', 'day', 'week', 'month', 'year'] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const DATE_PRESET_LABELS: Readonly<Record<DatePreset, string>> = {
  all: 'كل التواريخ',
  day: 'آخر يوم',
  week: 'آخر 7 أيام',
  month: 'آخر 30 يومًا',
  year: 'آخر سنة',
};

const PRESET_DAYS: Readonly<Record<Exclude<DatePreset, 'all'>, number>> = { day: 1, week: 7, month: 30, year: 365 };

/** بداية فترة تاريخية من الآن (ISO)، أو null لكل التواريخ. */
export function presetFrom(preset: DatePreset, now: Date = new Date()): string | null {
  return preset === 'all' ? null : new Date(now.getTime() - PRESET_DAYS[preset] * 86_400_000).toISOString();
}
