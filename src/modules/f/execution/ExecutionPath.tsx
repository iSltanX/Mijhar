// «تجهيز تعديل» (T-11.8، F-F6، الإطارات P-50 وP-51 وP-52): خمس خطوات لا تُطوى ولا تُدمج، في اللوحة الأصلية وحدها (صفحة إضافة لا تبلغها
// سكربتات الصفحة؛ والدرج يدل عليها ولا يعرضها):
//   ١ يقترح مِجهَر تعديل ملف نصي واحد (DEC-11 ط-1)، ويُقرأ الملف وأساسه عبر طبقة القراءة وحدها.
//   ٢ يُعرض الفرق كاملًا قبل أي اتصال كتابة، ويُعدَّل أو يُنسخ أو يُلغى. لا صلاحية كتابة ولا طلب كتابة.
//   ٣ موافقة على النطاق في خطوة مستقلة (المستودع والفرع والملف والطلب وما لن يحدث)، بنقرة مستخدم موثوقة (AD-27)؛ ولا تُحفظ لما بعد هذا التعديل.
//   ٤ «نفّذ» بنقرة موثوقة: تُسأل الخلفية عن صلاحية الكتابة الآن فقط، وبغيابها يتوقف المسار عند المعاينة ويبقى «نسخ الفرق» (BLK-WRITE-SCOPE) ولا
//     تُطلب ثانية تلقائيًا؛ وبوجودها تُرسل الخطة التي وافق عليها المستخدم نفسها، فتكتب الخلفية ثلاث عمليات لا غير.
//   ٥ ما حدث فعلًا بروابطه، أو ما تعذّر وما حدث قبله. لا دمج ولا إغلاق ولا إعادة محاولة تلقائية.
// تعديل أي شيء بعد الموافقة يعيد إلى الخطوة ٢ ويُسقط الموافقة: الموافقة تخص ما رآه المستخدم.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PublicApiPort } from '../../../core/api/port';
import { checkPlan, isNewBranchName, textProblem, titleProblem } from '../../../core/guardrails';
import type { WritePlan } from '../../../core/guardrails';
import { HEALTH_LABEL } from '../../../core/connections/health';
import { Ltr } from '../../../shared/ui';
import { isTrustedActivation } from '../../../shared/ui/user-activation';
import { useStyles } from '../../../shared/ui/useStyles';
import { DiffBlock } from './DiffBlock';
import { fileDiff, unifiedDiff } from './diff';
import type { ExecutionPort, RunOutcome, WriteStatus } from './port';
import { branchFor, proposalFor, planOf, titleFor } from './proposal';
import type { Proposal } from './proposal';
import { prepare } from './read';
import type { Prepared } from './read';
import { EXECUTION_CSS, EXECUTION_STYLE_ID } from './styles';

export interface ExecutionDeps {
  /** طبقة القراءة (عميل الخلفية الوحيد). */
  readonly api: PublicApiPort;
  readonly exec: ExecutionPort;
  /** النسخ إلى الحافظة؛ false عند التعذّر. */
  readonly copy: (text: string) => Promise<boolean>;
  /** يفتح صفحة الإعدادات (بطاقة صلاحية الكتابة فيها). */
  readonly openSettings: () => void;
  readonly now?: () => number;
}

export interface PathPage {
  readonly owner: string;
  readonly repo: string;
  readonly type: Parameters<typeof proposalFor>[0]['type'];
  readonly path: string | null;
  readonly ref: string | null;
  readonly refKind: Parameters<typeof proposalFor>[0]['refKind'];
  readonly number: number | null;
}

type Draft = { readonly prepared: Prepared; readonly edited: string; readonly branch: string; readonly title: string };

type Stage =
  | { readonly step: 'propose'; readonly reading: boolean; readonly error: string | null }
  | ({ readonly step: 'preview'; readonly editing: boolean } & Draft)
  | ({ readonly step: 'scope'; readonly approved: boolean; readonly plan: WritePlan } & Draft)
  | ({ readonly step: 'blocked'; readonly plan: WritePlan; readonly write: WriteStatus } & Draft)
  | ({ readonly step: 'running'; readonly plan: WritePlan } & Draft)
  | ({ readonly step: 'done'; readonly plan: WritePlan; readonly outcome: RunOutcome } & Draft);

type StepState = 'done' | 'current' | 'locked' | 'failed';

const STEPS: readonly { readonly title: string; readonly hint: string }[] = [
  { title: 'يقترح مِجهَر التعديل', hint: 'ملف واحد نصي في نطاق محدود.' },
  { title: 'معاينة الفرق كاملًا', hint: 'قبل أي اتصال كتابة؛ عدّله أو ألغِه.' },
  { title: 'الموافقة على النطاق', hint: 'المستودع والفرع والملف، في خطوة مستقلة.' },
  { title: 'التنفيذ', hint: 'إنشاء الفرع وفتح الطلب بصلاحية كتابة لهذه الخطوة وحدها.' },
  { title: 'ما حدث فعلًا', hint: 'روابط الفرع والالتزام والطلب.' },
];

function stepStates(stage: Stage): StepState[] {
  const at = { propose: 0, preview: 1, scope: 2, blocked: 3, running: 3, done: 4 }[stage.step];
  return STEPS.map((_, i) => {
    if (stage.step === 'done' && !stage.outcome.ok && i === 3) return 'failed';
    return i < at ? 'done' : i === at ? 'current' : 'locked';
  });
}

function Stepper({ stage }: { stage: Stage }) {
  const states = stepStates(stage);
  return (
    <ol class="exec-steps" aria-label="خطوات تجهيز التعديل">
      {STEPS.map((s, i) => (
        <li key={i} class="exec-step" data-step={i + 1} data-state={states[i]} aria-current={states[i] === 'current' ? 'step' : undefined}>
          <span class="mark" aria-hidden="true">
            {states[i] === 'done' ? '✓' : states[i] === 'failed' ? '!' : i + 1}
          </span>
          <strong>{s.title}</strong>
          <small>{s.hint}</small>
        </li>
      ))}
    </ol>
  );
}

const short = (sha: string | null): string => (sha ? sha.slice(0, 7) : '—');

export function ExecutionPath({ page, deps, onActive }: { page: PathPage; deps: ExecutionDeps; onActive?: (active: boolean) => void }) {
  const root = useRef<HTMLDivElement>(null);
  useStyles(root, EXECUTION_STYLE_ID, EXECUTION_CSS);
  const now = deps.now ?? (() => Date.now());
  const initial: Proposal = useMemo(() => proposalFor(page), [page.owner, page.repo, page.type, page.path, page.ref, page.number]);
  const [path, setPath] = useState(initial.path);
  const [base, setBase] = useState(initial.base);
  const [stage, setStage] = useState<Stage>({ step: 'propose', reading: false, error: null });
  const [copied, setCopied] = useState<string | null>(null);
  const slug = `${page.owner}/${page.repo}`;
  const active = stage.step !== 'propose';
  useEffect(() => onActive?.(active), [active]);

  const draftOf = (s: Stage): Draft | null => (s.step === 'propose' ? null : { prepared: s.prepared, edited: s.edited, branch: s.branch, title: s.title });
  const draft = draftOf(stage);
  const diffText = draft ? unifiedDiff(draft.prepared.path, draft.prepared.file.text, draft.edited, draft.prepared.file.sha === null) : '';

  // ١ ← ٢: قراءة المستودع والأساس والملف (لا كتابة).
  const read = () => {
    if (stage.step !== 'propose' || stage.reading) return;
    setStage({ step: 'propose', reading: true, error: null });
    void prepare(deps.api, page.owner, page.repo, path.trim(), base.trim() || null, now).then((result) => {
      if (!result.ok) {
        setStage({ step: 'propose', reading: false, error: result.message });
        return;
      }
      const prepared = result.value;
      setStage({ step: 'preview', editing: true, prepared, edited: prepared.file.text, branch: branchFor(prepared.path, now()), title: titleFor(prepared.path) });
    });
  };

  const toPreview = (d: Draft, editing = false) => setStage({ step: 'preview', editing, ...d });
  const cancel = () => {
    setCopied(null);
    setStage({ step: 'propose', reading: false, error: null });
  };

  const copyDiff = () => {
    if (!diffText) return;
    void deps.copy(diffText).then((ok) => setCopied(ok ? 'نُسخ الفرق إلى الحافظة. لم يُرسل شيء ولم يُكتب شيء.' : 'تعذّر النسخ إلى الحافظة؛ حدّد الفرق من المحرر وانسخه بنفسك.'));
  };

  // ٣: الموافقة على النطاق بنقرة موثوقة وحدها؛ والنقر البرمجي لا يغيّرها.
  const approve = (event: Event) => {
    if (!isTrustedActivation(event)) {
      event.preventDefault();
      return;
    }
    if (stage.step === 'scope') setStage({ ...stage, approved: (event.currentTarget as HTMLInputElement).checked });
  };

  // ٤: «نفّذ» بنقرة موثوقة بعد الموافقة وحدها.
  const execute = (event: Event) => {
    if (!isTrustedActivation(event) || stage.step !== 'scope' || !stage.approved) return;
    const { plan } = stage;
    const d = draftOf(stage) as Draft;
    if (!checkPlan(plan).ok) return;
    setStage({ step: 'running', plan, ...d });
    void deps.exec.status().then((write) => {
      if (!write.linked || !write.permission) {
        setStage({ step: 'blocked', plan, write, ...d });
        return;
      }
      void deps.exec.run(plan).then((outcome) => setStage({ step: 'done', plan, outcome, ...d }));
    });
  };

  // BLK-WRITE-SCOPE: طلب صلاحية الكتابة بنقرة موثوقة يفتح بطاقتها في الإعدادات؛ ولا شيء تلقائي بعدها.
  const requestWrite = (event: Event) => {
    if (!isTrustedActivation(event)) return;
    deps.openSettings();
  };

  // بعد إضافة الصلاحية: عودة إلى النطاق نفسه بلا موافقة؛ فيوافق المستخدم وينفّذ من جديد بنقرتيه.
  const backToScope = () => {
    if (stage.step === 'blocked') setStage({ step: 'scope', approved: false, plan: stage.plan, ...(draftOf(stage) as Draft) });
  };

  return (
    <div ref={root} class="exec" data-exec-step={stage.step} data-repo={slug}>
      <h3>تجهيز تعديل</h3>
      <Stepper stage={stage} />

      {stage.step === 'propose' && (
        <div class="exec-propose" data-step-view="propose">
          <p>
            يقترح مِجهَر تعديل <strong>ملف نصي واحد</strong> في <Ltr className="mono">{slug}</Ltr> على فرع جديد وطلب دمج واحد: تعاين الفرق كاملًا وتوافق على
            النطاق قبل أي كتابة، ولا يُدمج شيء.
            {initial.issue !== null && ` ويُربط الطلب بالمشكلة #${initial.issue}.`}
          </p>
          <label class="field">
            <strong>الملف</strong>
            <input data-field="path" value={path} onInput={(e) => setPath((e.currentTarget as HTMLInputElement).value)} />
            <span class="hint">توثيق أو README أو إعداد نصي ظاهر؛ لا شيفرة ولا ملفات تشغيل.</span>
          </label>
          <label class="field">
            <strong>الفرع الأساس</strong>
            <input data-field="base" value={base} placeholder="الفرع الافتراضي" onInput={(e) => setBase((e.currentTarget as HTMLInputElement).value)} />
          </label>
          {stage.error && (
            <p class="notice" data-tone="danger" role="alert" data-read-error="">
              {stage.error}
            </p>
          )}
          <button type="button" class="btn btn-primary btn-block" data-action="exec-prepare" disabled={stage.reading || !path.trim()} onClick={read}>
            {stage.reading ? 'جارٍ قراءة الملف…' : 'جهّز التعديل'}
          </button>
          <p class="muted small">تُقرأ الملف وفرعه بطبقة القراءة وحدها (برمز القراءة إن ربطته)؛ ولا تُطلب صلاحية كتابة ولا يُرسل إلى GitHub شيء يغيّر.</p>
        </div>
      )}

      {stage.step === 'preview' && <Preview stage={stage} slug={slug} diffText={diffText} copied={copied} onCopy={copyDiff} onCancel={cancel} onChange={(d, editing) => toPreview(d, editing)} onNext={(plan) => setStage({ step: 'scope', approved: false, plan, ...(draftOf(stage) as Draft) })} issue={initial.issue} />}

      {stage.step === 'scope' && (
        <div class="exec-scope" data-step-view="scope">
          <h4>النطاق الذي توافق عليه</h4>
          <ScopeFacts plan={stage.plan} prepared={stage.prepared} issue={initial.issue} />
          <label class="approve">
            <input type="checkbox" data-consent="exec-scope" checked={stage.approved} onClick={(event) => approve(event)} />
            <span>
              راجعتُ الفرق وأوافق على هذا النطاق وحده
              <small>موافقتك لهذا التعديل فقط، ولا تُحفظ لما بعده.</small>
            </span>
          </label>
          <p class="notice" data-write-when="">
            تُطلب صلاحية الكتابة المنفصلة (<Ltr>Contents</Ltr> و<Ltr>Pull requests</Ltr>: <Ltr>Read and write</Ltr> لهذا المستودع) عند «نفّذ» وحده، ولا تُستعمل في أي
            قراءة أو تحليل.
          </p>
          <button type="button" class="btn btn-primary btn-block" data-consent="exec-run" disabled={!stage.approved} onClick={(event) => execute(event)}>
            نفّذ: أنشئ الفرع وافتح الطلب
          </button>
          <div class="row">
            <button type="button" class="btn" data-action="exec-back" onClick={() => toPreview(draftOf(stage) as Draft)}>
              رجوع إلى الفرق
            </button>
            <button type="button" class="btn" data-action="exec-copy" onClick={copyDiff}>
              نسخ الفرق بدلًا من ذلك
            </button>
          </div>
          {copied && <p class="muted small" role="status">{copied}</p>}
          <p class="muted small">لا يُنفَّذ أي أمر اقترحه نموذج: هذا الفرق وحده ما سيُكتب، ومحتوى الصفحات والردود بيانات لا تعليمات.</p>
        </div>
      )}

      {stage.step === 'running' && (
        <p class="notice" role="status" data-step-view="running">
          جارٍ التنفيذ: إنشاء الفرع ثم كتابة الملف ثم فتح الطلب. لا تُعاد أي محاولة تلقائيًا.
        </p>
      )}

      {stage.step === 'blocked' && (
        <div class="exec-blocked" data-step-view="blocked" data-block="BLK-WRITE-SCOPE">
          <p class="notice" data-tone="warning" role="alert">
            <strong>توقف المسار عند المعاينة: </strong>
            {!stage.write.permission
              ? 'صلاحية api.github.com الاختيارية غير ممنوحة.'
              : stage.write.health === 'none'
                ? 'لا صلاحية كتابة مربوطة.'
                : `صلاحية الكتابة: ${HEALTH_LABEL[stage.write.health]}.`}{' '}
            لم يُكتب شيء ولم يُرسل شيء، ولن تُطلب الصلاحية مرة أخرى تلقائيًا. «نسخ الفرق» متاح بلا أي صلاحية.
          </p>
          <button type="button" class="btn btn-primary btn-block" data-consent="exec-request-write" onClick={(event) => requestWrite(event)}>
            اطلب صلاحية الكتابة من الإعدادات
          </button>
          <div class="row">
            <button type="button" class="btn" data-action="exec-back-to-scope" onClick={backToScope}>
              أضفتُها: عُد إلى النطاق
            </button>
            <button type="button" class="btn" data-action="exec-copy" onClick={copyDiff}>
              نسخ الفرق
            </button>
            <button type="button" class="btn" data-action="exec-cancel" onClick={cancel}>
              ألغِ التعديل
            </button>
          </div>
          {copied && <p class="muted small" role="status">{copied}</p>}
        </div>
      )}

      {stage.step === 'done' && <Result outcome={stage.outcome} plan={stage.plan} copied={copied} onCopy={copyDiff} onRestart={cancel} />}
    </div>
  );
}

function Preview({
  stage,
  slug,
  diffText,
  copied,
  issue,
  onCopy,
  onCancel,
  onChange,
  onNext,
}: {
  stage: Extract<Stage, { step: 'preview' }>;
  slug: string;
  diffText: string;
  copied: string | null;
  issue: number | null;
  onCopy: () => void;
  onCancel: () => void;
  onChange: (d: Draft, editing: boolean) => void;
  onNext: (plan: WritePlan) => void;
}) {
  const { prepared, edited, branch, title, editing } = stage;
  const d: Draft = { prepared, edited, branch, title };
  const changed = fileDiff(prepared.file.text, edited).hunks.length > 0;
  const branchIssue = isNewBranchName(branch.trim()) ? (branch.trim() === prepared.base.branch ? 'الفرع الجديد هو الأساس نفسه.' : null) : 'حروف لاتينية وأرقام و. _ - / بلا «..» ولا مسافات.';
  const titleIssue = titleProblem(title);
  const textIssue = textProblem(edited);
  const plan = planOf(prepared, edited, branch, title, issue);
  const valid = changed && !branchIssue && !titleIssue && !textIssue && checkPlan(plan).ok;
  return (
    <div class="exec-preview" data-step-view="preview">
      <p class="notice" data-no-write-yet="">
        لم تُطلب أي صلاحية كتابة ولم يُرسل شيء إلى GitHub بعد.
      </p>
      <h4>التعديل المقترح</h4>
      <p>
        تعديل <Ltr className="mono">{prepared.path}</Ltr> في <Ltr className="mono">{slug}</Ltr> على فرع جديد من <Ltr className="mono">{prepared.base.branch}</Ltr> (التزام{' '}
        <Ltr className="mono">{short(prepared.base.sha)}</Ltr> كما قُرئ الآن).{' '}
        {prepared.file.sha === null ? 'الملف غير موجود في الأساس: سيُنشأ.' : 'وما لا يثبت في المعاينة لا يُقترح تنفيذه.'}
      </p>
      <DiffBlock path={prepared.path} before={prepared.file.text} after={edited} isNew={prepared.file.sha === null} />
      {editing && (
        <label class="field">
          <strong>المحتوى الجديد للملف</strong>
          <textarea data-field="content" dir="auto" spellcheck={false} value={edited} onInput={(e) => onChange({ ...d, edited: (e.currentTarget as HTMLTextAreaElement).value }, true)} />
          {textIssue && <span class="error">{textIssue}</span>}
        </label>
      )}
      <div class="row">
        <button type="button" class="btn" data-action="exec-edit" aria-pressed={editing} onClick={() => onChange(d, !editing)}>
          {editing ? 'أخفِ المحرر' : 'عدّل الفرق'}
        </button>
        <button type="button" class="btn" data-action="exec-copy" disabled={!changed} onClick={onCopy}>
          نسخ الفرق
        </button>
        <button type="button" class="btn" data-action="exec-cancel" onClick={onCancel}>
          ألغِ التعديل
        </button>
      </div>
      {copied && <p class="muted small" role="status">{copied}</p>}
      <label class="field">
        <strong>الفرع الجديد</strong>
        <input data-field="branch" value={branch} onInput={(e) => onChange({ ...d, branch: (e.currentTarget as HTMLInputElement).value }, editing)} />
        {branchIssue && <span class="error">{branchIssue}</span>}
      </label>
      <label class="field">
        <strong>عنوان الطلب ورسالة الالتزام</strong>
        <input data-field="title" value={title} onInput={(e) => onChange({ ...d, title: (e.currentTarget as HTMLInputElement).value }, editing)} />
        {titleIssue && <span class="error">{titleIssue}</span>}
      </label>
      <button type="button" class="btn btn-primary btn-block" data-action="exec-next" disabled={!valid} onClick={() => valid && onNext(plan)}>
        التالي: راجع النطاق
      </button>
      <p class="muted small">«نسخ الفرق» بديل كامل لمن لا يريد أي كتابة: تلصقه بنفسك حيث تشاء.</p>
      {/* النص الكامل للفرق كما يُنسخ: لقارئ الشاشة ولمن تعذّر عليه النسخ. */}
      <details>
        <summary class="small">الفرق نصًّا (unified)</summary>
        <pre class="mono small" dir="ltr" data-diff-text="">
          {diffText}
        </pre>
      </details>
    </div>
  );
}

function ScopeFacts({ plan, prepared, issue }: { plan: WritePlan; prepared: Prepared; issue: number | null }) {
  const diff = fileDiff(prepared.file.text, plan.content.replace(/\r\n/g, '\n'));
  return (
    <dl class="facts" data-scope="">
      <dt>المستودع</dt>
      <dd data-scope-repo="">
        <Ltr className="mono">{`${plan.owner}/${plan.repo}`}</Ltr>
      </dd>
      <dt>الفرع الجديد</dt>
      <dd data-scope-branch="">
        <Ltr className="mono">{plan.branch}</Ltr> من <Ltr className="mono">{plan.base}</Ltr> (<Ltr className="mono">{short(plan.baseSha)}</Ltr>)
      </dd>
      <dt>الملف</dt>
      <dd data-scope-file="">
        <Ltr className="mono">{plan.path}</Ltr> · {plan.fileSha === null ? 'ملف جديد' : 'ملف واحد'} <Ltr>{`(−${diff.deletions} +${diff.additions})`}</Ltr>
      </dd>
      <dt>طلب الدمج</dt>
      <dd data-scope-pull="">
        يُفتح {plan.draft ? 'مسودةً' : 'طلبًا عاديًا (المسودة لا تُتاح في كل المستودعات الخاصة)'} بعنوان «<Ltr>{plan.title}</Ltr>»{issue !== null ? ` ويُربط بالمشكلة #${issue}` : ''}
      </dd>
      <dt>لن يحدث</dt>
      <dd data-scope-never="">لا دمج ولا إغلاق ولا أي كتابة أخرى.</dd>
    </dl>
  );
}

function Result({ outcome, plan, copied, onCopy, onRestart }: { outcome: RunOutcome; plan: WritePlan; copied: string | null; onCopy: () => void; onRestart: () => void }) {
  const repo = `${plan.owner}/${plan.repo}`;
  return (
    <div class="exec-result" data-step-view="done" data-outcome={outcome.ok ? 'ok' : 'failed'}>
      {outcome.ok ? (
        <p class="notice" data-tone="success" role="status">
          <strong>
            فُتح طلب الدمج{outcome.pull.number !== null ? ` #${outcome.pull.number}` : ''}
            {outcome.pull.draft ? ' مسودةً' : ''}.
          </strong>{' '}
          أُنشئ الفرع وكُتب <Ltr className="mono">{plan.path}</Ltr> وفُتح الطلب. لم يُدمج شيء ولم يُغلق شيء.
        </p>
      ) : (
        <p class="notice" data-tone="danger" role="alert" data-failure-step={outcome.failure?.step}>
          <strong>تعذّر التنفيذ. </strong>
          {outcome.failure?.message} لم يُكتب غير ما في الجدول أدناه، ولم تُعَد أي محاولة تلقائيًا.
        </p>
      )}
      <h4>ما حدث فعلًا</h4>
      <dl class="facts" data-happened="">
        <dt>الفرع</dt>
        <dd data-happened-branch={outcome.branch.created ? 'created' : 'none'}>
          {outcome.branch.created && outcome.branch.url ? (
            <a href={outcome.branch.url} target="_blank" rel="noopener noreferrer">
              <Ltr className="mono">{outcome.branch.name}</Ltr>
            </a>
          ) : (
            'لم يُنشأ.'
          )}
        </dd>
        <dt>الالتزام</dt>
        <dd data-happened-commit={outcome.file.written ? 'written' : 'none'}>
          {outcome.file.written ? (
            outcome.file.url ? (
              <a href={outcome.file.url} target="_blank" rel="noopener noreferrer">
                <Ltr className="mono">{`${short(outcome.file.commit)} · ${plan.title}`}</Ltr>
              </a>
            ) : (
              <Ltr className="mono">{plan.title}</Ltr>
            )
          ) : (
            'لم يُكتب الملف.'
          )}
        </dd>
        <dt>الطلب</dt>
        <dd data-happened-pull={outcome.pull.opened ? 'opened' : 'none'}>
          {outcome.pull.opened ? (
            <>
              <Ltr className="mono">{`${repo}#${outcome.pull.number ?? '?'}`}</Ltr>
              {outcome.pull.draft ? ' (مسودة)' : ''}
            </>
          ) : (
            'لم يُفتح.'
          )}
        </dd>
        <dt>الصلاحية</dt>
        <dd>استُعملت لهذه الخطوة وحدها؛ يمكنك حذفها من «الإعدادات والخصوصية».</dd>
      </dl>
      {outcome.pull.opened && outcome.pull.url && (
        <a class="btn btn-primary btn-block" data-action="exec-open-pull" href={outcome.pull.url} target="_blank" rel="noopener noreferrer">
          افتح الطلب في GitHub
        </a>
      )}
      <div class="row">
        {!outcome.ok && (
          <button type="button" class="btn" data-action="exec-copy" onClick={onCopy}>
            نسخ الفرق
          </button>
        )}
        <button type="button" class="btn" data-action="exec-restart" onClick={onRestart}>
          {outcome.ok ? 'جهّز تعديلًا آخر' : 'ابدأ من جديد'}
        </button>
      </div>
      {copied && <p class="muted small" role="status">{copied}</p>}
    </div>
  );
}
