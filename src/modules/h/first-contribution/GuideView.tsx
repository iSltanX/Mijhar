// مرشد أول مساهمة في تبويب المجتمع (T-9.3، F-H3): ملخص ما ورد في ملفات المشروع كما ورد، وروابط وسوم المبتدئين بأعدادها المتاحة
// فعلًا، وخارطة الطريق بشرح المصطلحات من القاموس. لا ينفذ إجراء نيابة عن المستخدم: روابط وقراءة نصوص فقط، وقراءة الملفات بنقر زرها.
import { useMemo, useRef, useState } from 'preact/hooks';
import type { PanelViewProps } from '../../../sidepanel/views';
import { documentPageSource, extensionTabs, repoSlug, tabsPageSource, useActivePage } from '../../../shared/page';
import type { PageSource } from '../../../shared/page';
import { useStyles } from '../../../shared/ui/useStyles';
import { githubApiAccess } from '../api-access';
import type { GithubApiAccess } from '../api-access';
import { COMMUNITY_CSS, COMMUNITY_STYLE_ID } from '../styles';
import { BEGINNER_LABELS, fetchLabelCounts, labelIssuesUrl } from './counts';
import type { LabelCount } from './counts';
import { firstHeading, summarizeContributing, summarizeReadme, summarizeTemplate } from './parse';
import type { ContributingSummary } from './parse';
import { FILE_LABELS, defaultFetchText, pathHintsFromDocument, readProjectFiles } from './sources';
import type { FetchText, FileKind, ProjectFile, ProjectRead } from './sources';
import TERMS from './terms.json';

export const ROADMAP: ReadonlyArray<{ readonly text: string; readonly term: (typeof TERMS)[number]['id'] }> = [
  { text: 'اقرأ شروط المساهمة وتأكد أن المشكلة غير مسندة لغيرك', term: 'issue' },
  { text: 'أنشئ Fork: نسخة من المستودع في حسابك', term: 'fork' },
  { text: 'أنشئ فرعًا جديدًا للتعديل', term: 'branch' },
  { text: 'طبّق التعديل واختبره ثم احفظه في التزام', term: 'commit' },
  { text: 'افتح Pull Request واربطه بالمشكلة', term: 'pull_request' },
];

const termOf = (id: string) => TERMS.find((t) => t.id === id);

export interface GuideViewOptions {
  readonly source?: (surface: PanelViewProps['surface']) => PageSource | null;
  readonly fetchText?: FetchText;
  readonly access?: () => GithubApiAccess;
}

const defaultSource = (surface: PanelViewProps['surface']): PageSource | null => (surface === 'drawer' ? documentPageSource(document) : tabsPageSource(extensionTabs()));

const blobUrl = (owner: string, repo: string, path: string): string => `https://github.com/${owner}/${repo}/blob/HEAD/${path.split('/').map(encodeURIComponent).join('/')}`;

function Summary({ summary }: { summary: ContributingSummary }) {
  return (
    <>
      {summary.groups.map((group) => (
        <div key={group.heading} data-group={group.heading}>
          <p class="field-title" dir="auto">
            {group.heading}
          </p>
          <ol class="steps">
            {group.steps.map((step) => (
              <li key={step} dir="auto">
                {step}
              </li>
            ))}
          </ol>
        </div>
      ))}
      {summary.intro && (
        <p class="quote" dir="auto" data-intro="">
          {summary.intro}
        </p>
      )}
      {summary.notes.length > 0 && (
        <ul class="list" data-notes="">
          {summary.notes.map((note) => (
            <li class="item" key={note.id} data-note-id={note.id}>
              <span class="tag" data-tone="info">
                {note.label}
              </span>
              <p class="quote" dir="auto">
                {note.quote}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function FileBlock({ owner, repo, file }: { owner: string; repo: string; file: ProjectFile }) {
  const link = (
    <a href={blobUrl(owner, repo, file.path)} target="_blank" rel="noopener noreferrer" class="small">
      افتح <span class="ltr-inline mono">{file.path}</span>
    </a>
  );
  if (file.kind === 'pr-template') {
    const template = summarizeTemplate(file.text);
    return (
      <div class="item" data-file={file.kind}>
        <div class="item-head">
          <strong>{FILE_LABELS[file.kind]}</strong>
          {link}
        </div>
        {template.checklist.length > 0 ? (
          <ol class="steps" data-checklist="">
            {template.checklist.map((item) => (
              <li key={item} dir="auto">
                {item}
              </li>
            ))}
          </ol>
        ) : (
          <p class="muted small">لا قائمة تحقق مرقّمة في القالب؛ العناوين: {template.headings.join(' ، ') || 'لا عناوين'}.</p>
        )}
      </div>
    );
  }
  if (file.kind === 'conduct') {
    return (
      <div class="item" data-file={file.kind}>
        <div class="item-head">
          <strong>{FILE_LABELS[file.kind]}</strong>
          {link}
        </div>
        <p class="muted small" dir="auto">
          {firstHeading(file.text) ?? 'ملف قواعد السلوك'}
        </p>
      </div>
    );
  }
  const summary = file.kind === 'contributing' ? summarizeContributing(file.text) : summarizeReadme(file.text);
  return (
    <div class="item" data-file={file.kind}>
      <div class="item-head">
        <strong>{file.kind === 'readme' ? 'قسم المساهمة في README' : FILE_LABELS[file.kind]}</strong>
        {link}
      </div>
      {summary.empty ? (
        <p class="muted small" data-empty="">
          {file.kind === 'readme' ? 'لم يُعثر في README على قسم للمساهمة بخطوات.' : 'لم تُستخرج خطوات من هذا الملف؛ افتحه لقراءته كاملًا.'}
        </p>
      ) : (
        <Summary summary={summary} />
      )}
    </div>
  );
}

const FAILURE_WORDS: Readonly<Record<string, string>> = { http: 'ردّ الخادم بخطأ', network: 'تعذّر الاتصال', 'too-large': 'الملف أكبر من الحد' };

function Missing({ read }: { read: ProjectRead }) {
  if (!read.missing.length && !read.failed.length) return null;
  return (
    <div class="item" data-missing="">
      <strong>ما لم يُعثر عليه أو تعذّرت قراءته</strong>
      <ul class="list">
        {read.missing.map((m) => (
          <li key={m.kind} data-missing-kind={m.kind}>
            لم يُعثر على {FILE_LABELS[m.kind]} في المواضع التي جُرِّبت: <span class="ltr-inline mono">{m.tried.join(' ، ')}</span>.
          </li>
        ))}
        {read.failed.map((f) => (
          <li key={f.kind} data-failed-kind={f.kind}>
            تعذّرت قراءة {FILE_LABELS[f.kind]} ({FAILURE_WORDS[f.reason] ?? f.reason})؛ لا حكم على وجوده.
          </li>
        ))}
      </ul>
    </div>
  );
}

const COUNT_FAILURE: Readonly<Record<string, string>> = {
  unavailable: 'العدد يُجلب من لوحة مِجهَر الجانبية بعد منح صلاحية GitHub API الاختيارية',
  declined: 'رُفضت الصلاحية فلم يُجلب العدد',
  permission: 'لم تُمنح الصلاحية فلم يُجلب العدد',
  'rate-limit': 'بلغ GitHub حد الطلبات فلم يُجلب العدد',
  'not-found': 'تعذّر الوصول (404) فلم يُجلب العدد',
  http: 'ردّ GitHub بخطأ فلم يُجلب العدد',
  network: 'تعذّر الاتصال فلم يُجلب العدد',
};

function BeginnerLinks({ owner, repo, access }: { owner: string; repo: string; access: GithubApiAccess }) {
  // الأعداد مفتاحها المستودع: تغيّر المستودع يخفيها دون تأثير جانبي متأخر (التأثيرات تعمل بعد الرسم فتسبقها نقرة سريعة).
  const key = `${owner}/${repo}`;
  const [loaded, setLoaded] = useState<{ key: string; counts: Readonly<Record<string, LabelCount>> } | null>(null);
  const [busy, setBusy] = useState(false);
  const counts = loaded?.key === key ? loaded.counts : null;
  const load = (): void => {
    setBusy(true);
    fetchLabelCounts(access, owner, repo).then(
      (list) => {
        setLoaded({ key, counts: Object.fromEntries(list.map((c) => [c.label, c])) });
        setBusy(false);
      },
      () => setBusy(false),
    );
  };
  return (
    <div class="block" data-section="beginner-labels">
      <h3>مشكلات مناسبة للمبتدئين</h3>
      <ul class="list">
        {BEGINNER_LABELS.map(({ label, title }) => {
          const count = counts?.[label];
          return (
            <li class="item" key={label} data-label={label}>
              <div class="item-head">
                <a href={labelIssuesUrl(owner, repo, label)} target="_blank" rel="noopener noreferrer">
                  {title} (<span class="ltr-inline mono">{label}</span>)
                </a>
                {count && count.count !== null && (
                  <span class="tag" data-tone="ok" data-count={count.count}>
                    {count.count} مفتوحة
                  </span>
                )}
              </div>
              {count && count.count === null && (
                <p class="muted small" data-count-unavailable="">
                  {COUNT_FAILURE[count.reason] ?? 'العدد غير متاح'}.
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <div class="row">
        <button type="button" class="btn" data-action="load-counts" disabled={busy} onClick={load}>
          اعرض عدد كل وسم
        </button>
        <span class="muted small">طلب بحث واحد لكل وسم إلى api.github.com بصلاحيتها الاختيارية، عند نقرك فقط.</span>
      </div>
    </div>
  );
}

export function createGuideView(options: GuideViewOptions = {}) {
  const fetchText = options.fetchText ?? defaultFetchText;
  return function GuideView({ surface }: PanelViewProps) {
    const root = useRef<HTMLDivElement>(null);
    useStyles(root, COMMUNITY_STYLE_ID, COMMUNITY_CSS);
    const source = useMemo(() => (options.source ?? defaultSource)(surface), [surface]);
    const access = useMemo(() => (options.access ?? (() => githubApiAccess()))(), []);
    const { page, ready } = useActivePage(source);
    const slug = page ? repoSlug(page) : null;
    const [held, setState] = useState<{ slug: string; status: 'reading' | 'done'; read?: ProjectRead } | null>(null);
    // نتيجة مستودع آخر لا تُعرض: المقارنة بالمفتاح لا بتأثير يعيد الضبط بعد الرسم.
    const state = held?.slug === slug ? held : null;

    const read = (): void => {
      if (!page?.owner || !page.repo || !slug) return;
      setState({ slug, status: 'reading' });
      const hints = surface === 'drawer' ? pathHintsFromDocument(document, page.owner, page.repo) : {};
      readProjectFiles(page.owner, page.repo, fetchText, hints).then(
        (result) => setState((current) => (current?.slug === slug ? { slug, status: 'done', read: result } : current)),
        () => setState((current) => (current?.slug === slug ? { slug, status: 'done', read: { files: [], missing: [], failed: [], requests: 0 } } : current)),
      );
    };

    const order: FileKind[] = ['contributing', 'readme', 'pr-template', 'conduct'];
    return (
      <div class="community" ref={root} data-view="guide">
        <h3>مرشد أول مساهمة</h3>
        {!ready ? (
          <p class="muted" role="status">
            جارٍ قراءة الصفحة المفتوحة…
          </p>
        ) : !page?.owner || !page.repo ? (
          <p class="empty" data-guide-empty="no-repo">
            افتح صفحة مستودع على GitHub ليعرض المرشد تعليمات مساهمته.
          </p>
        ) : (
          <>
            <p class="muted small" data-guide-repo="">
              المستودع: <span class="ltr-inline mono">{slug}</span>. يقرأ المرشد نصوص الملفات فقط ولا ينفذ شيئًا نيابة عنك.
            </p>
            <div class="block" data-section="project-files">
              <h3>تعليمات المشروع</h3>
              <div class="row">
                <button type="button" class="btn btn-primary" data-action="read-project" disabled={state?.status === 'reading'} onClick={read}>
                  اقرأ تعليمات هذا المشروع
                </button>
                <span class="muted small">طلبات GET إلى github.com لنصوص الملفات عند نقرك فقط.</span>
              </div>
              {state?.status === 'reading' && (
                <p class="muted" role="status" data-guide-state="reading">
                  جارٍ قراءة الملفات…
                </p>
              )}
              {state?.status === 'done' && state.read && (
                <div class="list" data-guide-state="done" data-requests={state.read.requests}>
                  {order.flatMap((kind) => state.read?.files.filter((f) => f.kind === kind) ?? []).map((file) => (
                    <FileBlock key={file.kind} owner={page.owner as string} repo={page.repo as string} file={file} />
                  ))}
                  <Missing read={state.read} />
                </div>
              )}
            </div>
            <BeginnerLinks key={slug} owner={page.owner} repo={page.repo} access={access} />
          </>
        )}
        <div class="block" data-section="roadmap">
          <h3>خارطة الطريق خطوة بخطوة</h3>
          <ol class="steps">
            {ROADMAP.map((step) => {
              const term = termOf(step.term);
              return (
                <li key={step.text} data-term={step.term}>
                  {step.text}
                  {term && (
                    <p class="muted small">
                      <strong dir="auto">{term.ar}</strong> (<span class="ltr-inline">{term.en}</span>): {term.brief}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    );
  };
}

export const GuideView = createGuideView();
