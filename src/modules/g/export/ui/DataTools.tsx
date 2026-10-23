// أدوات بيانات الوحدة (ز): التصدير (JSON كامل وMarkdown) والاستيراد (فحص ومعاينة ثم دمج أو استبدال) والاستعادة والحذف (T-8.4، F-G4).
//  - القراءة (التصدير والمعاينة) من المخزن المشترك في هذا السياق، وهي مسموحة في أي سياق؛ والكتابة كلها (استيراد واستعادة وحذف) رسائل إلى الخلفية
//    عبر writer ولا تُكتب هنا ولا محليًا حين تتعذر الخلفية: تفشل العملية ظاهرة في الواجهة (AD-25).
//  - الحذف والاستبدال والاستعادة لا تُنفَّذ بنقرة واحدة: كل منها يعرض ما سيحدث بالأعداد ويطلب تأكيدًا صريحًا.
//  - لا شبكة ولا حساب (F-G5): الملف يُقرأ من جهاز المستخدم ويُحفظ إلى جهازه.
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Store } from '../../../../core/storage';
import { useStyles } from '../../../../shared/ui/useStyles';
import type { NotesWriter } from '../../notes/writer';
import { EXPORT_PRIVACY_POINTS } from '../notice';
import { MAX_IMPORT_CHARS, buildBundle, countsOf, exportFileName, parseBundle, serializeJson, toMarkdown } from '../format';
import type { ExportBundle, ExportScope } from '../format';
import { planDelete, planImport } from '../plan';
import type { DataSnapshot, DeleteScope, ImportMode, ImportSummary, KindSummary } from '../plan';
import { readBackup, readSnapshot, reposOf, sourceOf } from '../snapshot';
import type { ImportBackup } from '../snapshot';
import { DATA_CSS, DATA_STYLE_ID } from './styles';

export interface SavedFile {
  readonly name: string;
  readonly type: string;
  readonly text: string;
}

export interface DataToolsDeps {
  readonly store: Pick<Store, 'read' | 'readPrefix'>;
  /** الكتابة كلها عبر الخلفية (runtimeNotesWriter). */
  readonly writer: Pick<NotesWriter, 'importBundle' | 'deleteData' | 'restoreImportBackup'>;
  /** تغيّر الملاحظات أو الروابط من أي سياق: يعيد القراءة. يعيد دالة إلغاء الاشتراك. */
  readonly subscribe: (listener: () => void) => () => void;
  readonly now?: () => Date;
  /** يحفظ الملف المصدَّر في جهاز المستخدم. الافتراضي تنزيل بـBlob ورابط محلي. */
  readonly save?: (file: SavedFile) => void;
  readonly readFile?: (file: File) => Promise<string>;
}

export function downloadFile(file: SavedFile, doc: Document = document): void {
  const view = doc.defaultView;
  if (!view) throw new Error('لا نافذة لحفظ الملف');
  const url = view.URL.createObjectURL(new view.Blob([file.text], { type: `${file.type};charset=utf-8` }));
  const link = doc.createElement('a');
  link.href = url;
  link.download = file.name;
  link.rel = 'noreferrer';
  doc.body.append(link);
  link.click();
  link.remove();
  view.setTimeout(() => view.URL.revokeObjectURL(url), 1000);
}

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const readText = (file: File): Promise<string> => file.text();

const PARTS: ReadonlyArray<readonly [keyof Omit<KindSummary, never>, string]> = [
  ['added', 'أُضيف'],
  ['updated', 'حُدّث'],
  ['unchanged', 'لم يتغير'],
  ['keptNewer', 'بقي المحلي الأحدث'],
  ['removed', 'حُذف'],
];

function kindLine(label: string, kind: KindSummary): string {
  const parts = PARTS.filter(([key]) => kind[key] > 0).map(([key, word]) => `${word} ${kind[key]}`);
  return `${label}: ${parts.length ? parts.join('، ') : 'لا شيء'}`;
}

const SALT_TEXT: Record<ImportSummary['salt'], string | null> = {
  unchanged: null,
  adopted: 'الملح المحلي للبصمات: اعتُمد ملح الملف (لم يكن لديك ملح).',
  replaced: 'الملح المحلي للبصمات: استُبدل بملح الملف.',
  removed: 'الملح المحلي للبصمات: أُزيل لأن النسخة الاحتياطية لا تحمل ملحًا.',
  'conflict-kept-local': 'الملح في الملف يخالف ملحك المحلي فبقي المحلي؛ مراسي الأسطر الخاصة القادمة من الملف ستظهر «ملح آخر» ولا يُتحقق منها.',
};

/** سطور ملخص الاستيراد/الاستعادة بالعربية: غير الصفرية وحدها. */
export function summaryLines(summary: ImportSummary): string[] {
  const lines = [kindLine('الملاحظات', summary.notes), kindLine('مراسي الأسطر', summary.anchors), kindLine('الروابط المحفوظة', summary.bookmarks)];
  const salt = SALT_TEXT[summary.salt];
  return salt ? [...lines, salt] : lines;
}

type Notice = { readonly tone: 'ok' | 'error'; readonly text: string; readonly lines?: readonly string[] };

function useData(deps: DataToolsDeps): { snapshot: DataSnapshot | null; backup: ImportBackup | null; error: string | null; reload: () => void } {
  const [state, setState] = useState<{ snapshot: DataSnapshot | null; backup: ImportBackup | null; error: string | null }>({ snapshot: null, backup: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    Promise.all([readSnapshot(deps.store), readBackup(deps.store)]).then(
      ([snapshot, backup]) => alive && setState({ snapshot, backup, error: null }),
      (error: unknown) => alive && setState((s) => ({ ...s, error: describeError(error) })),
    );
    return () => {
      alive = false;
    };
  }, [deps.store, tick]);
  useEffect(() => deps.subscribe(() => setTick((n) => n + 1)), [deps]);
  return { ...state, reload: useCallback(() => setTick((n) => n + 1), []) };
}

interface PendingFile {
  readonly name: string;
  readonly text: string;
  readonly bundle: ExportBundle;
}

export function DataTools({ deps }: { deps: DataToolsDeps }) {
  const root = useRef<HTMLDivElement>(null);
  useStyles(root, DATA_STYLE_ID, DATA_CSS);
  const { snapshot, backup, error: loadError, reload } = useData(deps);
  const now = deps.now ?? ((): Date => new Date());

  const [exportScope, setExportScope] = useState<'all' | 'repo'>('all');
  const [exportRepo, setExportRepo] = useState('');
  const [includeSalt, setIncludeSalt] = useState(false);
  const [exported, setExported] = useState<Notice | null>(null);

  const [pending, setPending] = useState<PendingFile | null>(null);
  const [rejected, setRejected] = useState<readonly string[] | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [imported, setImported] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const [deleteKind, setDeleteKind] = useState<'repo' | 'all'>('repo');
  const [deleteRepo, setDeleteRepo] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [deleted, setDeleted] = useState<Notice | null>(null);

  const repos = useMemo(() => (snapshot ? reposOf(snapshot) : []), [snapshot]);
  const repoValue = exportRepo && repos.includes(exportRepo) ? exportRepo : (repos[0] ?? '');
  const deleteRepoValue = deleteRepo && repos.includes(deleteRepo) ? deleteRepo : (repos[0] ?? '');

  const scopeOf = (value: string): { owner: string; repo: string } => {
    const [owner = '', repo = ''] = value.split('/');
    return { owner, repo };
  };

  const exportScopeValue: ExportScope = exportScope === 'all' || !repoValue ? { kind: 'all' } : { kind: 'repo', ...scopeOf(repoValue) };
  const exportPreview = snapshot ? countsOf(buildBundle(sourceOf(snapshot), { scope: exportScopeValue })) : null;
  const nothingToExport = !exportPreview || (exportPreview.notes === 0 && exportPreview.bookmarks === 0);

  const doExport = async (format: 'json' | 'md'): Promise<void> => {
    setExported(null);
    try {
      const fresh = await readSnapshot(deps.store);
      const bundle = buildBundle(sourceOf(fresh), { scope: exportScopeValue, includeSalt: format === 'json' && includeSalt, now });
      const file: SavedFile =
        format === 'json'
          ? { name: exportFileName(bundle, 'json'), type: 'application/json', text: serializeJson(bundle) }
          : { name: exportFileName(bundle, 'md'), type: 'text/markdown', text: toMarkdown(bundle) };
      (deps.save ?? ((f: SavedFile) => downloadFile(f)))(file);
      const counts = countsOf(bundle);
      setExported({ tone: 'ok', text: `جُهّز الملف ${file.name}: ${counts.notes} ملاحظة و${counts.bookmarks} رابطًا محفوظًا${bundle.salt ? '، مع الملح المحلي' : ''}.` });
    } catch (error) {
      setExported({ tone: 'error', text: `تعذّر التصدير: ${describeError(error)}` });
    }
  };

  const onFile = async (file: File | undefined): Promise<void> => {
    setImported(null);
    setConfirmReplace(false);
    setPending(null);
    setRejected(null);
    if (!file) return;
    if (file.size > MAX_IMPORT_CHARS) {
      setRejected(['الملف أكبر من الحد المسموح للاستيراد']);
      return;
    }
    let text: string;
    try {
      text = await (deps.readFile ?? readText)(file);
    } catch (error) {
      setRejected([`تعذّرت قراءة الملف: ${describeError(error)}`]);
      return;
    }
    const parsed = parseBundle(text);
    if (parsed.ok) setPending({ name: file.name, text, bundle: parsed.bundle });
    else setRejected(parsed.errors);
  };

  const preview = useMemo(() => (pending && snapshot ? planImport(snapshot, pending.bundle, mode).summary : null), [pending, snapshot, mode]);

  const doImport = async (): Promise<void> => {
    if (!pending) return;
    setBusy(true);
    setImported(null);
    try {
      const summary = await deps.writer.importBundle(pending.text, mode);
      setImported({ tone: 'ok', text: mode === 'replace' ? 'اكتمل الاستبدال. أُخذت نسخة احتياطية تلقائية قبله يمكن استعادتها.' : 'اكتمل الدمج. أُخذت نسخة احتياطية تلقائية قبله يمكن استعادتها.', lines: summaryLines(summary) });
      setPending(null);
      setConfirmReplace(false);
      reload();
    } catch (error) {
      setImported({ tone: 'error', text: describeError(error) });
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async (): Promise<void> => {
    setBusy(true);
    setImported(null);
    try {
      const summary = await deps.writer.restoreImportBackup();
      setImported({ tone: 'ok', text: 'أُعيدت ملاحظاتك وروابطك إلى حالتها قبل آخر استيراد.', lines: summaryLines(summary) });
      setConfirmRestore(false);
      reload();
    } catch (error) {
      setImported({ tone: 'error', text: describeError(error) });
    } finally {
      setBusy(false);
    }
  };

  const deleteScope: DeleteScope = deleteKind === 'all' || !deleteRepoValue ? { kind: 'all' } : { kind: 'repo', ...scopeOf(deleteRepoValue) };
  const deleteCounts = snapshot ? planDelete(snapshot, deleteScope).counts : null;

  const doDelete = async (): Promise<void> => {
    setBusy(true);
    setDeleted(null);
    try {
      const counts = await deps.writer.deleteData(deleteScope);
      setDeleted({ tone: 'ok', text: `حُذف ${counts.notes} ملاحظة و${counts.anchors} مرساة سطر و${counts.bookmarks} رابطًا محفوظًا${deleteScope.kind === 'all' ? '، ومعها النسخة الاحتياطية للاستيراد' : ''}.` });
      setDeleting(false);
      setConfirmAll(false);
      reload();
    } catch (error) {
      setDeleted({ tone: 'error', text: `تعذّر الحذف: ${describeError(error)}` });
    } finally {
      setBusy(false);
    }
  };

  if (!snapshot) {
    return (
      <div ref={root} class="data-tools" data-data-tools="loading">
        {loadError ? (
          <p class="notice" data-tone="danger" role="alert">
            تعذّرت قراءة بياناتك: {loadError}
          </p>
        ) : (
          <p class="muted" role="status">
            جارٍ قراءة بياناتك…
          </p>
        )}
      </div>
    );
  }

  const total = snapshot.notes.size + snapshot.bookmarks.size;
  const removed = preview ? preview.notes.removed + preview.anchors.removed + preview.bookmarks.removed : 0;

  return (
    <div ref={root} class="data-tools" data-data-tools="ready">
      {loadError && (
        <p class="notice" data-tone="danger" role="alert">
          {loadError}
        </p>
      )}

      <section class="block" data-block="export" aria-labelledby="mj-data-export">
        <h4 id="mj-data-export">التصدير</h4>
        <p class="muted small">
          لديك {snapshot.notes.size} ملاحظة و{snapshot.bookmarks.size} رابطًا محفوظًا. يُحفظ الملف في جهازك ولا يُرسل إلى أي مكان.
        </p>
        <div class="field">
          <label class="choice">
            <input type="radio" name="mj-export-scope" checked={exportScope === 'all'} onChange={() => setExportScope('all')} />
            <span>كل المستودعات</span>
          </label>
          <label class="choice">
            <input type="radio" name="mj-export-scope" checked={exportScope === 'repo'} disabled={!repos.length} onChange={() => setExportScope('repo')} />
            <span>مستودع محدد</span>
          </label>
          {exportScope === 'repo' && repos.length > 0 && (
            <select aria-label="المستودع المراد تصديره" value={repoValue} onChange={(event) => setExportRepo(event.currentTarget.value)}>
              {repos.map((repo) => (
                <option key={repo} value={repo}>
                  {repo}
                </option>
              ))}
            </select>
          )}
        </div>
        <label class="choice">
          <input type="checkbox" checked={includeSalt} disabled={!snapshot.salt} onChange={(event) => setIncludeSalt(event.currentTarget.checked)} data-option="include-salt" />
          <span>
            ضمّن الملح المحلي للبصمات في ملف JSON
            <span class="muted small"> {snapshot.salt ? '(اختياري؛ يلزم لتتحقق من بصمات الأسطر الخاصة بعد الاستيراد في متصفح آخر)' : '(لا ملح عندك: لم تحفظ سطرًا في مستودع خاص)'}</span>
          </span>
        </label>
        {exportPreview && (
          <p class="muted small" data-export-count="">
            سيُصدَّر: {exportPreview.notes} ملاحظة و{exportPreview.bookmarks} رابطًا محفوظًا.
          </p>
        )}
        <div class="actions">
          <button type="button" class="btn btn-primary" data-action="export-json" disabled={nothingToExport} onClick={() => void doExport('json')}>
            تصدير JSON كامل
          </button>
          <button type="button" class="btn" data-action="export-md" disabled={nothingToExport} onClick={() => void doExport('md')}>
            تصدير Markdown للقراءة
          </button>
        </div>
        <ul class="points muted small" data-export-privacy="">
          {EXPORT_PRIVACY_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        {exported && (
          <p class="notice" data-tone={exported.tone === 'error' ? 'danger' : undefined} role={exported.tone === 'error' ? 'alert' : 'status'} data-result="export">
            {exported.text}
          </p>
        )}
      </section>

      <section class="block" data-block="import" aria-labelledby="mj-data-import">
        <h4 id="mj-data-import">الاستيراد</h4>
        <div class="field">
          <label for="mj-data-file">ملف JSON مصدَّر من مِجهَر</label>
          <input id="mj-data-file" type="file" accept="application/json,.json" data-input="import-file" onChange={(event) => void onFile(event.currentTarget.files?.[0])} />
        </div>
        {rejected && (
          <div class="notice" data-tone="danger" role="alert" data-result="rejected">
            <strong>رُفض الملف ولم تُمس بياناتك الحالية.</strong>
            <ul class="summary">
              {rejected.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        )}
        {pending && preview && (
          <div class="field" data-import-preview="">
            <p>
              <strong>{pending.name}</strong> صالح: {pending.bundle.notes.length} ملاحظة و{pending.bundle.bookmarks.length} رابطًا محفوظًا{pending.bundle.salt ? ' ومعها الملح المحلي' : ''}.
            </p>
            <label class="choice">
              <input type="radio" name="mj-import-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} data-mode="merge" />
              <span>
                دمج ذكي مع الحالي دون مسح شيء
                <span class="muted small"> (الأحدث تعديلًا يغلب، وما ليس في الملف يبقى)</span>
              </span>
            </label>
            <label class="choice">
              <input type="radio" name="mj-import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} data-mode="replace" />
              <span>
                استبدال الكل
                <span class="muted small"> (ما ليس في الملف يُحذف؛ تُؤخذ نسخة احتياطية تلقائيًا قبله)</span>
              </span>
            </label>
            <p class="muted small">المعاينة بحسب حالتك الآن:</p>
            <ul class="summary" data-preview-lines="">
              {summaryLines(preview).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {mode === 'replace' && (
              <label class="choice">
                <input type="checkbox" checked={confirmReplace} onChange={(event) => setConfirmReplace(event.currentTarget.checked)} data-option="confirm-replace" />
                <span>أفهم أن الاستبدال يحذف {removed} سجلًا ليست في الملف، وأن لي استعادتها من النسخة الاحتياطية التلقائية.</span>
              </label>
            )}
            <div class="actions">
              <button type="button" class="btn btn-primary" data-action="import" disabled={busy || (mode === 'replace' && !confirmReplace)} onClick={() => void doImport()}>
                {mode === 'replace' ? 'استبدل بيانات هذا المتصفح بالملف' : 'ادمج الملف مع بياناتي'}
              </button>
            </div>
          </div>
        )}
        {imported && (
          <div class="notice" data-tone={imported.tone === 'error' ? 'danger' : undefined} role={imported.tone === 'error' ? 'alert' : 'status'} data-result="import">
            <p>{imported.text}</p>
            {imported.lines && (
              <ul class="summary">
                {imported.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section class="block" data-block="backup" aria-labelledby="mj-data-backup">
        <h4 id="mj-data-backup">النسخة الاحتياطية التلقائية</h4>
        {backup ? (
          <>
            <p class="small" data-backup-info="">
              أُخذت قبل آخر {backup.mode === 'replace' ? 'استبدال' : 'دمج'} ({backup.createdAt}) وتحوي {backup.bundle.notes.length} ملاحظة و{backup.bundle.bookmarks.length} رابطًا محفوظًا. تبقى في هذا المتصفح حتى استيراد آخر أو حذف.
            </p>
            {confirmRestore ? (
              <div class="confirm" data-confirm="restore">
                <p>ستعود الملاحظات والروابط إلى حالتها قبل الاستيراد، وتُفقد أي تغييرات جرت بعده.</p>
                <div class="actions">
                  <button type="button" class="btn btn-danger" data-action="restore-confirm" disabled={busy} onClick={() => void doRestore()}>
                    أؤكد الاستعادة
                  </button>
                  <button type="button" class="btn" data-action="restore-cancel" onClick={() => setConfirmRestore(false)}>
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              <div class="actions">
                <button type="button" class="btn" data-action="restore" disabled={busy} onClick={() => setConfirmRestore(true)}>
                  استعد ما قبل آخر استيراد
                </button>
              </div>
            )}
          </>
        ) : (
          <p class="muted small" data-backup-info="none">
            لا نسخة احتياطية الآن: تُؤخذ تلقائيًا قبل كل دمج أو استبدال.
          </p>
        )}
      </section>

      <section class="block" data-block="delete" data-tone="danger" aria-labelledby="mj-data-delete">
        <h4 id="mj-data-delete">الحذف</h4>
        <p class="muted small">لحذف عنصر واحد استعمل «حذف» في قائمة الملاحظات أو الروابط. هنا حذف مستودع كامل أو مسح كل شيء. الحذف نهائي، فصدّر نسخة قبله إن أردت الاحتفاظ بشيء.</p>
        <div class="field">
          <label class="choice">
            <input type="radio" name="mj-delete-scope" checked={deleteKind === 'repo'} disabled={!repos.length} onChange={() => (setDeleteKind('repo'), setDeleting(false))} />
            <span>كل ما يخص مستودعًا محددًا</span>
          </label>
          <label class="choice">
            <input type="radio" name="mj-delete-scope" checked={deleteKind === 'all'} onChange={() => (setDeleteKind('all'), setDeleting(false))} />
            <span>مسح كل الملاحظات والروابط من هذا المتصفح</span>
          </label>
          {deleteKind === 'repo' && repos.length > 0 && (
            <select aria-label="المستودع المراد حذف بياناته" value={deleteRepoValue} onChange={(event) => (setDeleteRepo(event.currentTarget.value), setDeleting(false))}>
              {repos.map((repo) => (
                <option key={repo} value={repo}>
                  {repo}
                </option>
              ))}
            </select>
          )}
        </div>
        {deleteCounts && (
          <p class="muted small" data-delete-count="">
            سيُحذف: {deleteCounts.notes} ملاحظة و{deleteCounts.anchors} مرساة سطر و{deleteCounts.bookmarks} رابطًا محفوظًا.
          </p>
        )}
        {deleting ? (
          <div class="confirm" data-confirm="delete" role="alert">
            <p>
              تأكيد نهائي: سيُحذف {deleteCounts?.notes ?? 0} ملاحظة و{deleteCounts?.bookmarks ?? 0} رابطًا محفوظًا{deleteScope.kind === 'all' ? ' من هذا المتصفح كله، ومعها النسخة الاحتياطية للاستيراد' : ` من ${deleteRepoValue}`}، ولا رجعة فيه.
            </p>
            {deleteScope.kind === 'all' && (
              <label class="choice">
                <input type="checkbox" checked={confirmAll} onChange={(event) => setConfirmAll(event.currentTarget.checked)} data-option="confirm-all" />
                <span>أؤكد مسح كل ملاحظاتي وروابطي.</span>
              </label>
            )}
            <div class="actions">
              <button type="button" class="btn btn-danger" data-action="delete-confirm" disabled={busy || (deleteScope.kind === 'all' && !confirmAll)} onClick={() => void doDelete()}>
                احذف نهائيًا
              </button>
              <button type="button" class="btn" data-action="delete-cancel" onClick={() => (setDeleting(false), setConfirmAll(false))}>
                إلغاء
              </button>
            </div>
          </div>
        ) : (
          <div class="actions">
            <button type="button" class="btn btn-danger" data-action="delete" disabled={busy || total === 0 || !deleteCounts || (deleteCounts.notes === 0 && deleteCounts.bookmarks === 0)} onClick={() => setDeleting(true)}>
              احذف…
            </button>
          </div>
        )}
        {deleted && (
          <p class="notice" data-tone={deleted.tone === 'error' ? 'danger' : undefined} role={deleted.tone === 'error' ? 'alert' : 'status'} data-result="delete">
            {deleted.text}
          </p>
        )}
      </section>
    </div>
  );
}
