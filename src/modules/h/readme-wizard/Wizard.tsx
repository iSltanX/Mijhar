// معالج الاقتراح المسؤول لإضافة README عربي (T-9.2، AC-H2): ثلاث خطوات مفروضة بالترتيب. (1) فحص التكرار: الاستعلام الكامل ظاهر
// وقابل للتعديل ومفحوص آليًا، والرابط لا يُفتح إلا بنقر المستخدم، ثم يجيب عمّا وجده. (2) سياسة المساهمة: تُقرأ بنقر ويُراجعها المستخدم
// ويقرّ بمراجعتها. (3) مسودة استئذان تُعاين وتُعدَّل وتُنسخ يدويًا. لا يُنشر شيء ولا تُفتح صفحة ولا يُرسل بلاغ تلقائيًا.
// تعديل خطوة سابقة يُسقط ما بعدها: الإقرار يخص ما رآه المستخدم.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStyles } from '../../../shared/ui/useStyles';
import type { FetchText } from '../first-contribution/sources';
import { COMMUNITY_CSS, COMMUNITY_STYLE_ID } from '../styles';
import { DRAFT_LANGUAGES, buildDraft, newIssueUrl } from './draft';
import type { DraftLanguage } from './draft';
import { analyzePolicy, blobUrl, readPolicy } from './policy';
import type { PolicyFindings, PolicyRead } from './policy';
import { checkDuplicateQuery, duplicateQuery } from './query';

export const WIZARD_CSS = `
.wizard .step { display: flex; flex-direction: column; gap: var(--mijhar-space-8); padding: var(--mijhar-space-12); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); background: var(--mijhar-bg-surface); }
.wizard .step[data-locked] { background: var(--mijhar-bg-subtle); color: var(--mijhar-text-secondary); }
.wizard .step[data-done] { border-color: var(--mijhar-text-success); }
.wizard .step h4 { margin: 0; font-size: 14px; }
.wizard .choices { display: flex; flex-direction: column; gap: var(--mijhar-space-6); }
.wizard .choices label { display: flex; align-items: flex-start; gap: var(--mijhar-space-6); cursor: pointer; }
.wizard .choices input[disabled] + span { color: var(--mijhar-text-disabled); }
.wizard .draft-preview { margin: 0; padding: var(--mijhar-space-8); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 18px; background: var(--mijhar-bg-subtle); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6); }
`;
const WIZARD_STYLE_ID = 'mijhar-h-readme-wizard';

export interface WizardProps {
  readonly owner: string;
  readonly repo: string;
  /** قراءة الملفات (الافتراضي fetch من السياق؛ للاختبارات محاكاة). */
  readonly fetchText?: FetchText;
  /** مسارات ظاهرة في الصفحة تسبق التخمين (حين يُرى DOM). */
  readonly hints?: Parameters<typeof readPolicy>[3];
}

type Answer = 'none' | 'found' | null;
type PolicyState = { status: 'idle' } | { status: 'reading' } | { status: 'done'; read: PolicyRead; findings: PolicyFindings };

function useStyle(root: { current: HTMLElement | null }): void {
  useStyles(root, COMMUNITY_STYLE_ID, COMMUNITY_CSS);
  useStyles(root, WIZARD_STYLE_ID, WIZARD_CSS);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ReadmeWizard({ owner, repo, fetchText, hints }: WizardProps) {
  const root = useRef<HTMLDivElement>(null);
  useStyle(root);
  const slug = `${owner}/${repo}`;
  const [query, setQuery] = useState(() => duplicateQuery(owner, repo));
  const [opened, setOpened] = useState(false);
  const [answer, setAnswer] = useState<Answer>(null);
  const [policy, setPolicy] = useState<PolicyState>({ status: 'idle' });
  const [reviewed, setReviewed] = useState(false);
  const [language, setLanguage] = useState<DraftLanguage>('en');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [copied, setCopied] = useState<'title' | 'body' | 'failed' | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // مستودع آخر: يبدأ المعالج من أوله.
  useEffect(() => {
    setQuery(duplicateQuery(owner, repo));
    setOpened(false);
    setAnswer(null);
    setPolicy({ status: 'idle' });
    setReviewed(false);
  }, [slug]);

  const check = useMemo(() => checkDuplicateQuery(query, owner, repo), [query, owner, repo]);
  const step1Done = opened && answer === 'none' && check.ok;
  const step2Done = step1Done && reviewed;
  const findings = policy.status === 'done' ? policy.findings : null;
  const contributingFound = policy.status === 'done' && policy.read.files.some((f) => f.kind === 'contributing');

  // المسودة تُبنى عند فتح الخطوة الثالثة وعند تغيير لغتها؛ وتعديل المستخدم بعدها يبقى ما لم يغيّر اللغة.
  useEffect(() => {
    if (!step2Done || !check.url) return;
    const draft = buildDraft({ owner, repo, searchUrl: check.url, findings, contributingFound }, language);
    setTitle(draft.title);
    setBody(draft.body);
    setCopied(null);
  }, [step2Done, language]);

  const editQuery = (value: string): void => {
    setQuery(value);
    setOpened(false);
    setAnswer(null);
    setReviewed(false);
  };

  const read = (): void => {
    setPolicy({ status: 'reading' });
    setReviewed(false);
    readPolicy(owner, repo, fetchText, hints).then(
      (result) => setPolicy({ status: 'done', read: result, findings: analyzePolicy(result.files) }),
      () => setPolicy({ status: 'done', read: { files: [], missing: [], failed: [{ kind: 'contributing', path: '', reason: 'network' }], requests: 0 }, findings: analyzePolicy([]) }),
    );
  };

  const copy = (which: 'title' | 'body'): void => {
    copyText(which === 'title' ? title : body).then((ok) => {
      setCopied(ok ? which : 'failed');
      if (!ok && which === 'body') bodyRef.current?.select();
    });
  };

  return (
    <div class="community wizard" ref={root} data-view="readme-wizard" data-repo={slug}>
      <h3>اقتراح README عربي بمسؤولية</h3>
      <p class="muted small">
        للمستودع <span class="ltr-inline mono">{slug}</span>. ثلاث خطوات بالترتيب قبل أي طلب: فحص التكرار، ثم سياسة المساهمة، ثم مسودة استئذان تنسخها بنفسك. لا يُنشر شيء ولا يُفتح بلاغ نيابة عنك.
      </p>

      <section class="step" data-step="1" {...(step1Done ? { 'data-done': '' } : {})} aria-labelledby="mj-wz-1">
        <h4 id="mj-wz-1">١. ابحث عن طلب سابق</h4>
        <div class="field" data-query-editor="duplicate">
          <label for="mj-wz-query">الاستعلام الكامل (يمكنك تعديله)</label>
          <textarea id="mj-wz-query" dir="ltr" rows={2} spellcheck={false} value={query} aria-describedby="mj-wz-issues" onInput={(e) => editQuery((e.currentTarget as HTMLTextAreaElement).value)} />
          <ul class="issues" id="mj-wz-issues" aria-live="polite">
            {check.issues.map((issue) => (
              <li key={issue.code + issue.message} data-severity={issue.severity} data-code={issue.code}>
                {issue.message}
              </li>
            ))}
          </ul>
          <div class="row">
            <a
              class="btn btn-primary"
              data-action="open-duplicate-search"
              {...(check.url ? { href: check.url, target: '_blank', rel: 'noopener noreferrer', onClick: () => setOpened(true) } : { 'aria-disabled': 'true', role: 'link' })}
            >
              افتح البحث في المشكلات وطلبات الدمج
            </a>
            <span class="muted small">مفتوحة ومغلقة · {check.operators} من 5 معاملات</span>
          </div>
        </div>
        <div class="choices" role="radiogroup" aria-label="ما وجدته في نتائج البحث">
          <label>
            <input type="radio" name="mj-wz-answer" value="none" data-answer="none" disabled={!opened || !check.ok} checked={answer === 'none'} onChange={() => setAnswer('none')} />
            <span>راجعت النتائج ولم أجد طلبًا مماثلًا</span>
          </label>
          <label>
            <input type="radio" name="mj-wz-answer" value="found" data-answer="found" disabled={!opened || !check.ok} checked={answer === 'found'} onChange={() => setAnswer('found')} />
            <span>وجدت طلبًا مماثلًا</span>
          </label>
        </div>
        {!opened && <p class="muted small">افتح البحث وراجع نتائجه أولًا؛ لا يُفتح شيء تلقائيًا.</p>}
        {answer === 'found' && (
          <p class="notice" data-duplicate-found="">
            شارك في النقاش القائم بدل فتح طلب جديد: أضف ردًا أو تفاعلًا يبيّن اهتمامك واستعدادك للترجمة. لا حاجة إلى مسودة هنا.
          </p>
        )}
      </section>

      <section class="step" data-step="2" {...(step1Done ? {} : { 'data-locked': '' })} {...(step2Done ? { 'data-done': '' } : {})} aria-labelledby="mj-wz-2">
        <h4 id="mj-wz-2">٢. راجع سياسة المساهمة</h4>
        {!step1Done ? (
          <p class="muted small" data-locked-reason="">
            أكمل فحص التكرار أولًا.
          </p>
        ) : (
          <>
            <div class="row">
              <button type="button" class="btn" data-action="read-policy" disabled={policy.status === 'reading'} onClick={read}>
                اقرأ CONTRIBUTING وREADME
              </button>
              <span class="muted small">يُقرآن من github.com بنقرك وحده، ويُحلَّلان على جهازك.</span>
            </div>
            {policy.status === 'reading' && (
              <p class="muted" role="status">
                جارٍ القراءة…
              </p>
            )}
            {policy.status === 'done' && <PolicyView owner={owner} repo={repo} read={policy.read} findings={policy.findings} />}
            <div class="choices">
              <label>
                <input type="checkbox" data-action="policy-reviewed" disabled={policy.status !== 'done'} checked={reviewed} onChange={(e) => setReviewed((e.currentTarget as HTMLInputElement).checked)} />
                <span>{findings?.declines.length ? 'قرأت ما تقوله السياسة عن الترجمات، وما زلت أريد السؤال' : 'راجعت سياسة المساهمة'}</span>
              </label>
            </div>
          </>
        )}
      </section>

      <section class="step" data-step="3" {...(step2Done ? {} : { 'data-locked': '' })} aria-labelledby="mj-wz-3">
        <h4 id="mj-wz-3">٣. مسودة الاستئذان</h4>
        {!step2Done ? (
          <p class="muted small" data-locked-reason="">
            تظهر المسودة بعد فحص التكرار ومراجعة السياسة.
          </p>
        ) : (
          <>
            <div class="row" role="group" aria-label="لغة المسودة">
              {(Object.keys(DRAFT_LANGUAGES) as DraftLanguage[]).map((l) => (
                <button key={l} type="button" class="btn btn-small" data-language={l} aria-pressed={l === language ? 'true' : 'false'} onClick={() => setLanguage(l)}>
                  {DRAFT_LANGUAGES[l]}
                </button>
              ))}
            </div>
            <div class="field">
              <label for="mj-wz-title">العنوان</label>
              <input id="mj-wz-title" type="text" dir="auto" value={title} onInput={(e) => setTitle((e.currentTarget as HTMLInputElement).value)} />
            </div>
            <div class="field">
              <label for="mj-wz-body">النص (عدّله كما تشاء)</label>
              <textarea id="mj-wz-body" ref={bodyRef} dir="auto" rows={10} value={body} onInput={(e) => setBody((e.currentTarget as HTMLTextAreaElement).value)} />
            </div>
            <details>
              <summary>معاينة</summary>
              <p class="draft-preview" dir="auto" data-draft-preview="title">
                {title}
              </p>
              <p class="draft-preview" dir="auto" data-draft-preview="body">
                {body}
              </p>
            </details>
            <div class="row">
              <button type="button" class="btn" data-action="copy-title" onClick={() => copy('title')}>
                انسخ العنوان
              </button>
              <button type="button" class="btn btn-primary" data-action="copy-body" onClick={() => copy('body')}>
                انسخ النص
              </button>
              <a class="btn" href={newIssueUrl(owner, repo)} target="_blank" rel="noopener noreferrer" data-action="open-new-issue">
                افتح صفحة مشكلة جديدة
              </a>
            </div>
            {copied && (
              <p class="muted small" role="status" data-copied={copied}>
                {copied === 'failed' ? 'تعذّر النسخ تلقائيًا؛ حُدِّد النص فانسخه يدويًا (Ctrl+C أو ⌘C).' : copied === 'title' ? 'نُسخ العنوان.' : 'نُسخ النص.'}
              </p>
            )}
            <p class="muted small">لن يُنشر شيء تلقائيًا: افتح صفحة المشكلة بنفسك والصق المسودة وراجعها قبل الإرسال.</p>
          </>
        )}
      </section>
    </div>
  );
}

function PolicyView({ owner, repo, read, findings }: { owner: string; repo: string; read: PolicyRead; findings: PolicyFindings }) {
  return (
    <div class="block" data-policy="">
      {read.files.length > 0 && (
        <p class="small">
          قُرئ:{' '}
          {read.files.map((f, i) => (
            <span key={f.path}>
              {i > 0 && '، '}
              <a href={blobUrl(owner, repo, f.path)} target="_blank" rel="noreferrer" class="ltr-inline mono" data-policy-file={f.kind}>
                {f.path}
              </a>
            </span>
          ))}
        </p>
      )}
      {read.missing.map((m) => (
        <p key={m.kind} class="muted small" data-policy-missing={m.kind}>
          لم يُعثر على {m.kind === 'contributing' ? 'CONTRIBUTING' : 'README'} في المواضع المجرَّبة ({m.tried.join('، ')})؛ قد يكون في موضع آخر أو في مستودع .github للمنظمة، فراجعه في صفحة المستودع.
        </p>
      ))}
      {read.failed.length > 0 && (
        <p class="notice" data-policy-failed="">
          تعذّرت قراءة بعض الملفات (شبكة أو خادم)؛ لا يعني ذلك غيابها. راجع صفحة المستودع يدويًا.
        </p>
      )}
      {findings.externalSystems.length > 0 && (
        <p class="notice" data-external-systems={findings.externalSystems.map((s) => s.name).join(',')}>
          تُدار الترجمات عبر نظام خارجي:{' '}
          {findings.externalSystems.map((s, i) => (
            <span key={s.name}>
              {i > 0 && '، '}
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.name}
              </a>
            </span>
          ))}
          . اسأل عنه في المسودة بدل اقتراح ملف في المستودع.
        </p>
      )}
      {findings.declines.length > 0 && (
        <div class="notice" data-tone="danger" data-declines="">
          <p>تذكر السياسة ما يقيّد قبول الترجمات؛ الأرجح ألا تقترح README عربيًا هنا:</p>
          {findings.declines.map((l) => (
            <p key={`${l.file}:${l.line}`} class="quote" dir="ltr">
              {l.text}
            </p>
          ))}
        </div>
      )}
      {findings.issueFirst.length > 0 && <p class="small" data-issue-first="">تطلب السياسة فتح issue أو نقاش قبل العمل، وهذا ما تفعله المسودة.</p>}
      {findings.translationLines.length > 0 && (
        <details>
          <summary>أسطر تذكر الترجمة ({findings.translationLines.length})</summary>
          {findings.translationLines.map((l) => (
            <p key={`${l.file}:${l.line}`} class="quote" dir="auto" data-translation-line={l.line}>
              <span class="muted small ltr-inline mono">
                {l.file}:{l.line}
              </span>{' '}
              {l.text}
            </p>
          ))}
        </details>
      )}
      {findings.readmeSection && (
        <details>
          <summary>قسم المساهمة في README</summary>
          <p class="quote" dir="auto" data-readme-section="">
            {findings.readmeSection}
          </p>
        </details>
      )}
      {read.files.length > 0 && !findings.externalSystems.length && !findings.declines.length && !findings.translationLines.length && (
        <p class="muted small" data-policy-silent="">
          لم تذكر الملفات المقروءة الترجمة؛ هذا لا يعني الموافقة، فالمسودة تسأل المشرفين أولًا.
        </p>
      )}
    </div>
  );
}
