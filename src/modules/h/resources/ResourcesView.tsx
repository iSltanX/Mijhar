// دليل موارد التعلّم العربية في تبويب المجتمع (T-9.5، F-H5): يعمل دون اتصال من القائمة المضمّنة وما يحفظه المستخدم محليًا، بإضافة
// وتعديل وحذف وتصدير واستيراد، وتاريخ آخر تحقق وحالة لكل مورد. الفحص الآلي بنقر صريح لروابط github.com وحدها؛ والخارجية بمراجعة بشرية.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PanelViewProps } from '../../../sidepanel/views';
import { useStyles } from '../../../shared/ui/useStyles';
import { FAILURE_TEXT, githubApiAccess } from '../api-access';
import type { GithubApiAccess } from '../api-access';
import { builtinResources, resourcesRepository, useLoaded } from '../context';
import { COMMUNITY_CSS, COMMUNITY_STYLE_ID } from '../styles';
import { DEFAULT_MAX_CHECKS, checkResources } from './check';
import { RESOURCE_STATUSES, STATUS_LABELS, draftProblems, githubRepoOf, parseResourceFile } from './model';
import type { ParsedFile, Resource, ResourceStatus } from './model';
import type { ImportMode, ImportPreview, ResourcesRepository } from './repository';

export interface ResourcesViewOptions {
  readonly repository?: () => Promise<ResourcesRepository>;
  readonly access?: () => GithubApiAccess;
  readonly now?: () => Date;
  readonly readFile?: (file: File) => Promise<string>;
}

const defaultReadFile = (file: File): Promise<string> =>
  typeof file.text === 'function'
    ? file.text()
    : new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error ?? new Error('تعذّرت قراءة الملف'));
        reader.readAsText(file);
      });

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const isoToday = (now: Date): string => now.toISOString().slice(0, 10);

function useResources(repository: ResourcesRepository): Resource[] {
  const [list, setList] = useState<Resource[]>(() => repository.list());
  useEffect(() => {
    setList(repository.list());
    return repository.subscribe(() => setList(repository.list()));
  }, [repository]);
  return list;
}

const TONE: Readonly<Record<ResourceStatus, string>> = { active: 'ok', archived: 'warn', unverified: 'info', unreachable: 'warn' };

interface ItemProps {
  readonly resource: Resource;
  readonly categoryTitle: string;
  readonly repository: ResourcesRepository;
  readonly categories: ReadonlyArray<{ id: string; title: string }>;
  readonly onCheck: (resource: Resource) => void;
  readonly busy: boolean;
  readonly onError: (message: string | null) => void;
}

function ResourceItem({ resource, categoryTitle, repository, categories, onCheck, busy, onError }: ItemProps) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [form, setForm] = useState({ title: resource.title, url: resource.url, category: resource.category, description: resource.description });
  const [review, setReview] = useState<ResourceStatus>('active');
  const isGithub = githubRepoOf(resource.url) !== null;
  const run = (task: () => Promise<unknown>, done?: () => void): void => {
    onError(null);
    task().then(
      () => done?.(),
      (error: unknown) => onError(describeError(error)),
    );
  };
  const save = (): void => {
    const urlChanged = form.url.trim() !== resource.url;
    run(
      () =>
        repository.update(resource.id, {
          title: form.title.trim(),
          url: form.url.trim(),
          category: form.category,
          description: form.description.trim(),
          ...(urlChanged ? { status: 'unverified' as const, lastVerified: null, lastPush: null, license: null, movedTo: null, source: 'عدّله المستخدم' } : {}),
        }),
      () => setEditing(false),
    );
  };
  return (
    <li class="item" data-resource-id={resource.id} data-status={resource.status} data-category={resource.category}>
      {editing ? (
        <div class="field">
          <label for={`mj-res-title-${resource.id}`}>العنوان</label>
          <input id={`mj-res-title-${resource.id}`} type="text" dir="auto" value={form.title} onInput={(e) => setForm({ ...form, title: (e.currentTarget as HTMLInputElement).value })} />
          <label for={`mj-res-url-${resource.id}`}>الرابط</label>
          <input id={`mj-res-url-${resource.id}`} type="url" dir="ltr" value={form.url} onInput={(e) => setForm({ ...form, url: (e.currentTarget as HTMLInputElement).value })} />
          <label for={`mj-res-cat-${resource.id}`}>التصنيف</label>
          <select id={`mj-res-cat-${resource.id}`} value={form.category} onChange={(e) => setForm({ ...form, category: (e.currentTarget as HTMLSelectElement).value })}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <label for={`mj-res-desc-${resource.id}`}>الوصف</label>
          <textarea id={`mj-res-desc-${resource.id}`} dir="auto" rows={3} value={form.description} onInput={(e) => setForm({ ...form, description: (e.currentTarget as HTMLTextAreaElement).value })} />
          <div class="row">
            <button type="button" class="btn btn-primary" data-action="save-resource" onClick={save}>
              احفظ التعديل
            </button>
            <button type="button" class="btn" data-action="cancel-edit" onClick={() => setEditing(false)}>
              إلغاء
            </button>
          </div>
        </div>
      ) : (
        <>
          <div class="item-head">
            <a href={resource.url} target="_blank" rel="noopener noreferrer" dir="auto">
              <strong>{resource.title}</strong>
            </a>
            <span class="tag" data-tone={TONE[resource.status]} data-status-label="">
              {STATUS_LABELS[resource.status]}
            </span>
          </div>
          {resource.description && (
            <p class="muted" dir="auto">
              {resource.description}
            </p>
          )}
          <p class="muted small" data-verified="">
            <span class="tag">{categoryTitle}</span>{' '}
            {resource.lastVerified ? <>آخر تحقق: <span class="ltr-inline">{resource.lastVerified}</span></> : 'لم يُتحقق منه بعد'}
            {resource.lastPush ? <> · آخر دفع: <span class="ltr-inline">{resource.lastPush}</span></> : ''}
            {resource.license ? <> · الترخيص: <span class="ltr-inline">{resource.license}</span></> : ''}
          </p>
          <p class="muted small" data-source="" dir="auto">
            المصدر: {resource.source}
          </p>
          {resource.note && (
            <p class="small" data-note="" dir="auto">
              {resource.note}
            </p>
          )}
          {resource.movedTo && (
            <div class="row" data-moved="">
              <span class="small">اقترح الفحص رابطًا جديدًا:</span>
              <a class="small" href={resource.movedTo} target="_blank" rel="noopener noreferrer">
                <span class="ltr-inline mono">{resource.movedTo}</span>
              </a>
              <button type="button" class="btn btn-small" data-action="apply-moved" onClick={() => run(() => repository.update(resource.id, { url: resource.movedTo as string, movedTo: null, note: null }))}>
                حدّث الرابط
              </button>
            </div>
          )}
          <div class="row">
            {isGithub && (
              <button type="button" class="btn" data-action="check-one" disabled={busy} onClick={() => onCheck(resource)}>
                تحقق الآن
              </button>
            )}
            <button
              type="button"
              class="btn"
              data-action="edit-resource"
              onClick={() => {
                // النموذج من المورد كما هو الآن (GEMINI-014): بعد «اعتمد العنوان الجديد» لا يعيد الحفظ الرابط القديم.
                setForm({ title: resource.title, url: resource.url, category: resource.category, description: resource.description });
                setEditing(true);
              }}
            >
              عدّل
            </button>
            {confirming ? (
              <>
                <button type="button" class="btn btn-danger" data-action="confirm-remove" onClick={() => run(() => repository.remove(resource.id), () => setConfirming(false))}>
                  تأكيد الحذف
                </button>
                <button type="button" class="btn" data-action="cancel-remove" onClick={() => setConfirming(false)}>
                  إلغاء
                </button>
              </>
            ) : (
              <button type="button" class="btn btn-danger" data-action="remove-resource" onClick={() => setConfirming(true)}>
                احذف
              </button>
            )}
          </div>
          <details>
            <summary>{isGithub ? 'مراجعة يدوية' : 'رابط خارجي: يُراجع يدويًا (لا يُفحص آليًا)'}</summary>
            <div class="row">
              <label class="small" for={`mj-res-review-${resource.id}`}>
                الحالة بعد مراجعتك
              </label>
              <select id={`mj-res-review-${resource.id}`} value={review} onChange={(e) => setReview((e.currentTarget as HTMLSelectElement).value as ResourceStatus)}>
                {RESOURCE_STATUSES.filter((s) => s !== 'unverified').map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <button type="button" class="btn" data-action="mark-reviewed" onClick={() => run(() => repository.review(resource.id, review))}>
                سجّل المراجعة
              </button>
            </div>
          </details>
        </>
      )}
    </li>
  );
}

interface ImportState {
  readonly parsed: Extract<ParsedFile, { ok: true }>;
  readonly mode: ImportMode;
  readonly fileName: string;
}

function Loaded({ repository, access, now, readFile }: { repository: ResourcesRepository; access: GithubApiAccess; now: () => Date; readFile: (file: File) => Promise<string> }) {
  const list = useResources(repository);
  const builtin = useMemo(() => builtinResources(), []);
  const categories = useMemo(() => {
    const known = [...repository.categories];
    for (const r of list) if (!known.some((c) => c.id === r.category)) known.push({ id: r.category, title: r.category });
    if (!known.some((c) => c.id === 'uncategorized')) known.push({ id: 'uncategorized', title: 'غير مصنّف' });
    return known;
  }, [repository, list]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ title: '', url: '', category: categories[0]?.id ?? 'uncategorized', description: '' });
  const [exported, setExported] = useState<string | null>(null);
  const [importing, setImporting] = useState<ImportState | null>(null);
  const [importIssue, setImportIssue] = useState<string | null>(null);

  const shown = list.filter((r) => {
    if (category && r.category !== category) return false;
    const q = query.trim().toLowerCase();
    return !q || `${r.title} ${r.description} ${r.url} ${r.note ?? ''}`.toLowerCase().includes(q);
  });
  const titleOf = (id: string): string => categories.find((c) => c.id === id)?.title ?? id;

  const applyReport = (targets: readonly Resource[]): void => {
    setBusy(true);
    setError(null);
    setMessage(null);
    // الاستدعاء متزامن من معالج النقر: طلب الصلاحية أول ما في checkResources.
    checkResources(access, targets, { max: DEFAULT_MAX_CHECKS, today: isoToday(now()) }).then(
      async (report) => {
        let verified = 0;
        let unreachable = 0;
        let external = 0;
        let failed = 0;
        for (const [id, outcome] of report.outcomes) {
          try {
            if (outcome.kind === 'verified') {
              verified += 1;
              await repository.update(id, outcome.patch);
            } else if (outcome.kind === 'unreachable') {
              unreachable += 1;
              await repository.update(id, outcome.patch);
            } else if (outcome.kind === 'skipped') external += 1;
            else failed += 1;
          } catch (e) {
            setError(describeError(e));
          }
        }
        const parts = [`تُحقق من ${verified}`, ...(unreachable ? [`تعذّر الوصول إلى ${unreachable}`] : []), ...(failed ? [`فشل ${failed}`] : []), ...(external ? [`${external} رابطًا خارجيًا يُراجع يدويًا ولم يصدر له طلب`] : [])];
        const stopped = report.stoppedBy;
        const stop =
          stopped === null
            ? ''
            : stopped === 'declined'
              ? ' رفضتَ الصلاحية؛ الفحص لم يكتمل ولم يصدر أي طلب.'
              : stopped === 'limit'
                ? ` بلغ الفحص حد ${DEFAULT_MAX_CHECKS} طلبًا؛ تبقّى ${report.remaining}. الفحص لم يكتمل.`
                : ` ${FAILURE_TEXT[stopped]}`;
        setMessage(`${parts.join('، ')}.${stop}`);
        setBusy(false);
      },
      () => {
        setError('تعذّر إتمام الفحص؛ الفحص لم يكتمل.');
        setBusy(false);
      },
    );
  };

  const add = (event: Event): void => {
    event.preventDefault();
    const problems = draftProblems(draft);
    if (problems.length) {
      setError(problems.join(' '));
      return;
    }
    setError(null);
    repository.add(draft).then(
      () => setDraft({ ...draft, title: '', url: '', description: '' }),
      (e: unknown) => setError(describeError(e)),
    );
  };

  const exportNow = (): void => {
    const json = repository.exportJson();
    setExported(json);
    const view = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL : null;
    if (!view) return;
    const a = document.createElement('a');
    a.href = view.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `mijhar-resources-${isoToday(now())}.json`;
    a.click();
    setTimeout(() => view.revokeObjectURL(a.href), 1000);
  };

  const onFile = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    setImportIssue(null);
    setImporting(null);
    if (!file) return;
    readFile(file).then(
      (text) => {
        const parsed = parseResourceFile(text);
        if (!parsed.ok) setImportIssue(`رُفض الملف ولم يتغير شيء: ${parsed.error}`);
        else setImporting({ parsed, mode: 'merge', fileName: file.name });
      },
      (e: unknown) => setImportIssue(`تعذّرت قراءة الملف: ${describeError(e)}`),
    );
    input.value = '';
  };

  const preview: ImportPreview | null = importing ? repository.previewImport(importing.parsed, importing.mode) : null;

  return (
    <div data-resources-ready="">
      <p class="muted small" data-offline="">
        الدليل يعمل دون إنترنت من قائمة مضمّنة وما تضيفه أنت، ومحفوظ في هذا المتصفح. لا تُسحب قوائم خارجية تلقائيًا، ولا يصدر طلب إلا حين تنقر زر فحص.
      </p>
      {builtin.resources.length > 0 && (
        <p class="muted small" data-review-note="">
          القائمة الأولى اقتراح أولي دُقِّق آليًا بتاريخ <span class="ltr-inline">2026-10-23</span> (انظر «المصدر» تحت كل مورد) وتنتظر مراجعة بشرية لاعتماد الاختيار.
        </p>
      )}
      <div class="grid">
        <div class="field">
          <label for="mj-res-search">بحث</label>
          <input id="mj-res-search" type="text" dir="auto" value={query} onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)} />
        </div>
        <div class="field">
          <label for="mj-res-filter">التصنيف</label>
          <select id="mj-res-filter" value={category} onChange={(e) => setCategory((e.currentTarget as HTMLSelectElement).value)}>
            <option value="">الكل</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div class="row">
        <button type="button" class="btn" data-action="check-all" disabled={busy} onClick={() => applyReport(shown)}>
          تحقق من روابط GitHub المعروضة (حتى {DEFAULT_MAX_CHECKS})
        </button>
        <button type="button" class="btn" data-action="export" onClick={exportNow}>
          صدّر JSON
        </button>
      </div>
      <div class="field">
        <label for="mj-res-import">استورد ملف JSON (دمج أو استبدال بعد معاينة)</label>
        <input id="mj-res-import" type="file" accept="application/json,.json" data-action="import-file" onChange={onFile} />
      </div>
      {!access.available && <p class="muted small">الفحص الآلي يتطلب صلاحية GitHub API الاختيارية ويعمل من لوحة مِجهَر الجانبية.</p>}
      {message && (
        <p class="notice" role="status" data-check-summary="">
          {message}
        </p>
      )}
      {error && (
        <p class="notice" data-tone="danger" role="alert">
          {error}
        </p>
      )}

      {exported !== null && (
        <div class="field" data-export="">
          <label for="mj-res-export">ملف التصدير (انسخه أو احفظه)</label>
          <textarea id="mj-res-export" readOnly dir="ltr" rows={4} value={exported} />
        </div>
      )}
      {importIssue && (
        <p class="notice" data-tone="danger" role="alert" data-import-error="">
          {importIssue}
        </p>
      )}
      {importing && preview && (
        <div class="block" data-import-preview="">
          <p>
            الملف <span class="ltr-inline mono">{importing.fileName}</span>: {preview.added} جديدًا، {preview.updated} معدّلًا، {preview.unchanged} دون تغيير
            {preview.invalid.length ? `، ${preview.invalid.length} غير صالح (يُعزل ولا يدخل)` : ''}.
          </p>
          {preview.invalid.length > 0 && (
            <ul class="issues">
              {preview.invalid.slice(0, 5).map((i) => (
                <li key={i.index} data-severity="warning">
                  العنصر {i.index + 1}{i.id ? ` (${i.id})` : ''}: {i.problems.join(' ')}
                </li>
              ))}
            </ul>
          )}
          <div role="radiogroup" aria-label="طريقة الاستيراد">
            <label class="choice">
              <input type="radio" name="mj-res-mode" checked={importing.mode === 'merge'} onChange={() => setImporting({ ...importing, mode: 'merge' })} />
              <span class="label">دمج مع ما عندي (لا يُحذف شيء)</span>
            </label>
            <label class="choice">
              <input type="radio" name="mj-res-mode" checked={importing.mode === 'replace'} onChange={() => setImporting({ ...importing, mode: 'replace' })} />
              <span class="label">استبدال القائمة بما في الملف{preview.removed ? ` (يُحذف ${preview.removed} حاليًا)` : ''}</span>
            </label>
          </div>
          <div class="row">
            <button
              type="button"
              class="btn btn-primary"
              data-action="apply-import"
              onClick={() => {
                setError(null);
                repository.applyImport(importing.parsed, importing.mode).then(
                  (done) => {
                    setMessage(`تم الاستيراد: ${done.added} جديدًا و${done.updated} معدّلًا.`);
                    setImporting(null);
                  },
                  (e: unknown) => setError(describeError(e)),
                );
              }}
            >
              طبّق الاستيراد
            </button>
            <button type="button" class="btn" data-action="cancel-import" onClick={() => setImporting(null)}>
              ألغِ
            </button>
          </div>
        </div>
      )}

      <p class="muted small" data-count="">
        {shown.length} من {list.length} مورد
      </p>
      {shown.length === 0 ? (
        <p class="empty" data-empty="">
          لا موارد مطابقة.
        </p>
      ) : (
        <ul class="list" aria-label="موارد التعلّم">
          {shown.map((resource) => (
            <ResourceItem
              key={resource.id}
              resource={resource}
              categoryTitle={titleOf(resource.category)}
              repository={repository}
              categories={categories}
              busy={busy}
              onCheck={(r) => applyReport([r])}
              onError={setError}
            />
          ))}
        </ul>
      )}

      <details>
        <summary>أضف مواردك</summary>
        <form class="field" onSubmit={add} data-form="add-resource">
          <label for="mj-add-title">العنوان</label>
          <input id="mj-add-title" type="text" dir="auto" value={draft.title} onInput={(e) => setDraft({ ...draft, title: (e.currentTarget as HTMLInputElement).value })} />
          <label for="mj-add-url">الرابط (https)</label>
          <input id="mj-add-url" type="url" dir="ltr" value={draft.url} onInput={(e) => setDraft({ ...draft, url: (e.currentTarget as HTMLInputElement).value })} />
          <label for="mj-add-category">التصنيف</label>
          <select id="mj-add-category" value={draft.category} onChange={(e) => setDraft({ ...draft, category: (e.currentTarget as HTMLSelectElement).value })}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <label for="mj-add-description">الوصف (اختياري)</label>
          <textarea id="mj-add-description" dir="auto" rows={2} value={draft.description} onInput={(e) => setDraft({ ...draft, description: (e.currentTarget as HTMLTextAreaElement).value })} />
          <div class="row">
            <button type="submit" class="btn btn-primary" data-action="add-resource">
              أضف المورد
            </button>
          </div>
        </form>
      </details>
      {repository.hiddenBuiltins().length > 0 && (
        <details>
          <summary>موارد مضمّنة حذفتَها ({repository.hiddenBuiltins().length})</summary>
          <ul class="list">
            {repository.hiddenBuiltins().map((r) => (
              <li class="item" key={r.id}>
                <span dir="auto">{r.title}</span>
                <button type="button" class="btn" data-action="restore-builtin" onClick={() => repository.restoreBuiltin(r.id).catch((e: unknown) => setError(describeError(e)))}>
                  استعدها
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function createResourcesView(options: ResourcesViewOptions = {}) {
  const load = options.repository ?? resourcesRepository;
  const now = options.now ?? (() => new Date());
  const readFile = options.readFile ?? defaultReadFile;
  return function ResourcesView(_props: PanelViewProps) {
    const root = useRef<HTMLDivElement>(null);
    useStyles(root, COMMUNITY_STYLE_ID, COMMUNITY_CSS);
    const state = useLoaded(load);
    const access = useMemo(() => (options.access ?? (() => githubApiAccess()))(), []);
    return (
      <div class="community" ref={root} data-view="resources">
        <h3>موارد تعلّم عربية</h3>
        {state.status === 'loading' && (
          <p class="muted" role="status">
            جارٍ فتح الدليل…
          </p>
        )}
        {state.status === 'error' && (
          <p class="notice" data-tone="danger" role="alert">
            تعذّر فتح الدليل: {state.message}
          </p>
        )}
        {state.status === 'ready' && <Loaded repository={state.value} access={access} now={now} readFile={readFile} />}
      </div>
    );
  };
}

export const ResourcesView = createResourcesView();
