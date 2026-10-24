// «دليل رمز GitHub» في صفحة الإعدادات (AD-29؛ الإطاران O-17 وO-21): فائدة الرمز الفعلية، والفرق بينه وبين مفتاح مزوّد التحليل، وسبع خطوات
// بنص كامل ورسوم توضيحية. ما يقوله الدليل عن الرمز مأخوذ من الشيفرة وأدلتها لا من وعد عام: الصلاحيات من READ_PERMISSIONS، وحدود الرمز من
// TOKEN_LIMITS (evidence/T-0.5)، والحدان 60 و5000 من توثيق GitHub وقياس T-0.5. لا طلب شبكة من الصفحة: روابط GitHub تُفتح بنقر في تبويب جديد.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { READ_ACCESS_LEVEL, READ_PERMISSIONS, TOKEN_LIMITS } from '../../modules/d/token/format';
import { Ltr } from '../../shared/ui';
import { Icon } from '../../shared/ui/icons';
import { useStyles } from '../../shared/ui/useStyles';
import { ILLUSTRATION_CSS, StepIllustration } from './illustrations';
import { GUIDE_SOURCES, TOKEN_LIST_URL, tokenTemplateUrl } from './template-url';

export interface TokenGuideProps {
  /** يعود إلى قسم الرمز في الإعدادات. */
  readonly onBack: () => void;
}

const GUIDE_CSS = `
.mj-root .guide { display: flex; flex-direction: column; gap: var(--mijhar-space-24); }
/* العنوان يتلقى التركيز برمجيًا عند فتح الدليل (ليس عنصرًا تفاعليًا)، فلا إطار تركيز عليه. */
.mj-root .guide h1[tabindex]:focus, .mj-root .guide h1[tabindex]:focus-visible { outline: none; box-shadow: none; }
.mj-root .guide .crumbs { display: flex; align-items: center; gap: var(--mijhar-space-8); color: var(--mijhar-text-tertiary); font-size: 12px; }
.mj-root .guide .crumbs .btn { min-height: 28px; }
.mj-root .guide .lead { color: var(--mijhar-text-secondary); font-size: 16px; line-height: 28px; }
.mj-root .guide .card { display: flex; flex-direction: column; gap: var(--mijhar-space-16); padding: var(--mijhar-space-24); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); background: var(--mijhar-bg-surface); }
.mj-root .guide .cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mijhar-space-16); }
.mj-root .guide .col { display: flex; flex-direction: column; gap: var(--mijhar-space-8); padding: var(--mijhar-space-16); border-radius: 8px; background: var(--mijhar-bg-subtle); }
.mj-root .guide .col[data-with] { background: var(--mijhar-bg-brand-subtle); }
.mj-root .guide .col h3 { color: var(--mijhar-text-primary); }
.mj-root .guide .col[data-with] h3 { color: var(--mijhar-text-brand); }
.mj-root .guide .ticks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mijhar-space-8); }
.mj-root .guide .ticks li { display: flex; align-items: flex-start; gap: var(--mijhar-space-8); font-size: 12px; line-height: 20px; }
.mj-root .guide .ticks .icon { margin-top: 2px; color: var(--mijhar-text-success); }
.mj-root .guide .col[data-with] .ticks .icon { color: var(--mijhar-text-brand); }
.mj-root .guide .inline-note { display: flex; align-items: flex-start; gap: var(--mijhar-space-8); padding: var(--mijhar-space-8) var(--mijhar-space-12); border-radius: 8px; font-size: 12px; line-height: 20px; background: var(--mijhar-bg-subtle); color: var(--mijhar-text-secondary); }
.mj-root .guide .inline-note .icon { margin-top: 2px; }
.mj-root .guide .inline-note[data-tone="warning"] { background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); }
.mj-root .guide .inline-note[data-tone="info"] { background: var(--mijhar-bg-info-subtle); color: var(--mijhar-text-info); }
.mj-root .guide table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 12px; line-height: 20px; border: 1px solid var(--mijhar-border-default); border-radius: 8px; }
.mj-root .guide caption { text-align: start; padding-bottom: var(--mijhar-space-8); color: var(--mijhar-text-secondary); }
.mj-root .guide th, .mj-root .guide td { text-align: start; vertical-align: top; padding: var(--mijhar-space-8) var(--mijhar-space-12); border-bottom: 1px solid var(--mijhar-border-muted); overflow-wrap: anywhere; }
.mj-root .guide thead th { background: var(--mijhar-bg-subtle); }
.mj-root .guide tbody th { width: 9rem; font-weight: 700; }
.mj-root .guide td { color: var(--mijhar-text-secondary); }
.mj-root .guide .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mijhar-space-16); counter-reset: step; }
.mj-root .guide .step { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 320px); gap: var(--mijhar-space-24); align-items: start; padding: var(--mijhar-space-24); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); background: var(--mijhar-bg-surface); }
.mj-root .guide .step-text { display: flex; flex-direction: column; gap: var(--mijhar-space-8); color: var(--mijhar-text-secondary); }
.mj-root .guide .step-text h3 { display: flex; align-items: center; gap: var(--mijhar-space-8); font-size: 16px; line-height: 28px; }
.mj-root .guide .step-num { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--mijhar-radius-full); background: var(--mijhar-bg-brand); color: var(--mijhar-text-on-brand); font-size: 12px; line-height: 1; }
.mj-root .guide .path { direction: ltr; text-align: left; padding: var(--mijhar-space-6) var(--mijhar-space-12); border-radius: var(--mijhar-radius-6); border: 1px solid var(--mijhar-border-muted); background: var(--mijhar-bg-subtle); font-family: var(--mijhar-font-mono); font-size: 12px; line-height: 20px; color: var(--mijhar-text-code); overflow-wrap: anywhere; }
.mj-root .guide .perms { list-style: none; margin: 0; padding: var(--mijhar-space-12); border-radius: 8px; background: var(--mijhar-bg-subtle); display: flex; flex-direction: column; gap: var(--mijhar-space-4); font-size: 12px; line-height: 20px; }
.mj-root .guide .perms li { display: flex; flex-wrap: wrap; gap: 0 var(--mijhar-space-8); }
.mj-root .guide .guide-figure { margin: 0; display: flex; flex-direction: column; gap: var(--mijhar-space-8); align-items: flex-start; }
.mj-root .guide .figure-tag { padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); background: var(--mijhar-bg-muted); color: var(--mijhar-text-secondary); font-size: 12px; line-height: 20px; font-weight: 700; }
.mj-root .guide .sources { display: flex; flex-direction: column; gap: var(--mijhar-space-8); padding: var(--mijhar-space-16) var(--mijhar-space-24); border-radius: var(--mijhar-radius-12); background: var(--mijhar-bg-subtle); font-size: 12px; line-height: 20px; }
.mj-root .guide .sources ul { margin: 0; padding-inline-start: var(--mijhar-space-16); display: flex; flex-direction: column; gap: var(--mijhar-space-4); }
.mj-root .guide a.btn-primary { color: var(--mijhar-text-on-brand); }
.mj-root .guide .actions { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-8); }
@media (max-width: 640px) {
  .mj-root .guide .cols { grid-template-columns: minmax(0, 1fr); }
  .mj-root .guide .step { grid-template-columns: minmax(0, 1fr); padding: var(--mijhar-space-16); }
  .mj-root .guide .card { padding: var(--mijhar-space-16); }
  .mj-root .guide tbody th, .mj-root .guide thead th:first-child { width: 5.5rem; }
  .mj-root .guide th, .mj-root .guide td { padding: var(--mijhar-space-6) var(--mijhar-space-8); }
}
`;

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

function Note({ tone, icon, children }: { tone?: 'warning' | 'info'; icon: 'warning' | 'info' | 'shield'; children: ComponentChildren }) {
  return (
    <p class="inline-note" {...(tone ? { 'data-tone': tone } : {})}>
      <Icon name={icon} />
      <span>{children}</span>
    </p>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ComponentChildren }) {
  return (
    <li class="step" data-step={n}>
      <div class="step-text">
        <h3>
          <span class="step-num" aria-hidden="true">
            {n.toLocaleString('ar-SA')}
          </span>
          <span>
            <span class="visually-hidden">الخطوة {n.toLocaleString('ar-SA')}: </span>
            {title}
          </span>
        </h3>
        {children}
      </div>
      <StepIllustration index={n - 1} />
    </li>
  );
}

export function TokenGuide({ onBack }: TokenGuideProps) {
  const ref = useRef<HTMLElement>(null);
  useStyles(ref, 'token-guide', GUIDE_CSS + ILLUSTRATION_CSS);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  const template = tokenTemplateUrl();

  return (
    <article ref={ref} class="guide" data-guide="github-token" aria-labelledby="mj-guide-title">
      <nav class="crumbs" aria-label="مسار الصفحة">
        <button type="button" class="btn btn-ghost" data-action="guide-back" onClick={onBack}>
          <Icon name="arrow-right" />
          الاتصالات والصلاحيات
        </button>
        <span aria-hidden="true">/</span>
        <span aria-current="page">دليل رمز GitHub</span>
      </nav>
      <header>
        <h1 id="mj-guide-title" ref={title} tabIndex={-1}>
          رمز GitHub للقراءة: فائدته وطريقة إنشائه
        </h1>
        <p class="lead">رمز اختياري تنشئه من حسابك في GitHub ليقرأ مِجهَر بيانات لا تعرضها الصفحة. لا تحتاجه أي ميزة أساسية، ولا يكتب شيئًا في مستودعاتك، وتحذفه متى شئت.</p>
      </header>

      <section class="card" aria-labelledby="mj-guide-unlocks">
        <h2 id="mj-guide-unlocks">ما الذي يفتحه الرمز فعلًا</h2>
        <div class="cols">
          <div class="col" data-without="">
            <h3>دون رمز (يعمل الآن)</h3>
            <ul class="ticks">
              <li>
                <Icon name="check" />
                <span>كل ما تعرضه صفحة GitHub: القراءة والشرح والترجمة والملاحظات وحزمة السياق.</span>
              </li>
              <li>
                <Icon name="check" />
                <span>
                  حالة طلبات الدمج وفحوصها في المستودعات العامة، من الصفحة ومن API العامة بعد منح صلاحية <Ltr className="mono">api.github.com</Ltr>.
                </span>
              </li>
              <li>
                <Icon name="check" />
                <span>60 طلبًا في الساعة لعنوانك، يتشاركها كل ما يقرأ API.</span>
              </li>
            </ul>
          </div>
          <div class="col" data-with="">
            <h3>مع الرمز (مستودعاتك التي تختارها)</h3>
            <ul class="ticks">
              <li>
                <Icon name="check" />
                <span>حالة طلبات الدمج وقابليتها للدمج في مستودعاتك الخاصة.</span>
              </li>
              <li>
                <Icon name="check" />
                <span>مهام Actions وخطواتها وأول خطوة فشلت في تلك المستودعات.</span>
              </li>
              <li>
                <Icon name="check" />
                <span>5000 طلب في الساعة لحسابك بدل 60، وتنبيه قبل انتهاء الرمز بأسبوع.</span>
              </li>
            </ul>
          </div>
        </div>
        <Note tone="warning" icon="warning">
          الرمز لا يجعل النتائج أدق؛ يتيح قراءة بيانات إضافية فقط. وما لا يتيحه مهما كانت صلاحياته:
        </Note>
        <ul class="ticks muted" data-token-limits="">
          {TOKEN_LIMITS.map((line) => (
            <li key={line}>
              <Icon name="info" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section class="card" aria-labelledby="mj-guide-diff">
        <h2 id="mj-guide-diff">الرمز ليس مفتاح مزوّد التحليل</h2>
        <table>
          <caption>مقارنة بين الاتصالين الاختياريين</caption>
          <thead>
            <tr>
              <th scope="col">
                <span class="visually-hidden">البند</span>
              </th>
              <th scope="col">رمز GitHub</th>
              <th scope="col">مفتاح مزوّد التحليل</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">الغرض</th>
              <td>قراءة بيانات GitHub نيابةً عنك</td>
              <td>تحليل نصّي يقترحه نموذج لغوي</td>
            </tr>
            <tr>
              <th scope="row">يُرسل إلى</th>
              <td>
                <Ltr className="mono">api.github.com</Ltr> وحده
              </td>
              <td>
                <Ltr className="mono">api.anthropic.com</Ltr> وحده
              </td>
            </tr>
            <tr>
              <th scope="row">ما يحمله الطلب</th>
              <td>طلب قراءة لا يحمل محتوى من الصفحة</td>
              <td>ما توافق عليه من سياق الصفحة</td>
            </tr>
            <tr>
              <th scope="row">التكلفة</th>
              <td>مجاني</td>
              <td>بحسب الاستخدام على حسابك لدى المزوّد</td>
            </tr>
            <tr>
              <th scope="row">هل يلزم؟</th>
              <td>لا</td>
              <td>لا</td>
            </tr>
          </tbody>
        </table>
        <Note icon="info">مفتاح المزوّد يصل مع طبقة التحليل في تحديث لاحق؛ لا يوجد في هذه النسخة حقل له ولا أي إرسال إلى مزوّد.</Note>
      </section>

      <section aria-labelledby="mj-guide-steps" class="guide">
        <div>
          <h2 id="mj-guide-steps">الخطوات</h2>
          <p class="muted">سبع خطوات قصيرة. الرسوم توضيحية مبسّطة تحاكي واجهة GitHub وقت كتابة الدليل، وليست لقطات منها؛ قد تختلف التسميات قليلًا، والنص يكفي وحده.</p>
        </div>
        <Note tone="info" icon="info">
          قبل البدء: امنح صلاحية <Ltr className="mono">api.github.com</Ltr> من «الوصول إلى GitHub API» في الإعدادات؛ لا يُستعمل الرمز قبلها.
        </Note>
        <ol class="steps">
          <Step n={1} title="افتح صفحة إنشاء الرمز بإعدادات مِجهَر">
            <p>
              يفتح الزر صفحة GitHub في تبويب جديد وقد مُلئ فيها اسم الرمز ومدته (90 يومًا) وصلاحيات القراءة الست. لا يُنشأ شيء قبل أن تضغط أنت زر{' '}
              <Ltr>Generate token</Ltr>.
            </p>
            <div class="actions">
              <a class="btn btn-primary" href={template} {...external} data-action="token-template">
                <Icon name="external-link" />
                افتح صفحة الإنشاء في GitHub
              </a>
            </div>
            <p class="small">أو يدويًا من صورة حسابك:</p>
            <p class="path">Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token</p>
          </Step>
          <Step n={2} title="راجع الاسم ومدة الانتهاء">
            <p>
              الاسم (<Ltr>Token name</Ltr>): اسم تعرفه به لاحقًا، مثل <Ltr className="mono">Mijhar read-only</Ltr>.
            </p>
            <p>
              الانتهاء (<Ltr>Expiration</Ltr>): ‏90 يومًا أو أقل. تجنّب الرمز بلا انتهاء؛ ويذكّرك مِجهَر قبل انتهائه بأسبوع لتجديده.
            </p>
          </Step>
          <Step n={3} title="اختر المستودعات التي تريدها وحدها">
            <p>
              المالك (<Ltr>Resource owner</Ltr>): حسابك، أو المنظمة المالكة للمستودع.
            </p>
            <p>
              المستودعات (<Ltr>Repository access</Ltr>): اختر <Ltr>Only select repositories</Ltr> ثم المستودعات الخاصة التي تريد أن يقرأها مِجهَر. المستودعات العامة
              مقروءة دون رمز أصلًا.
            </p>
            <Note icon="info">
              إن اشترطت المنظمة موافقة مسؤولها يبقى الرمز معلّقًا (<Ltr>Pending</Ltr>) ولا يقرأ إلا العام حتى يوافق.
            </Note>
          </Step>
          <Step n={4} title="تأكد أن الصلاحيات للقراءة فقط">
            <p>
              يملأ الرابط ست صلاحيات بمستوى <Ltr className="mono">{READ_ACCESS_LEVEL}</Ltr> تطابق ما تقرؤه الشيفرة فعلًا. لا تضف غيرها: لا صلاحية كتابة ولا{' '}
              <Ltr>Administration</Ltr> ولا <Ltr>Secrets</Ltr>؛ مِجهَر لا يحتاجها.
            </p>
            <ul class="perms" data-guide-permissions="">
              {READ_PERMISSIONS.map((p) => (
                <li key={p.name} data-permission={p.name}>
                  <Ltr className="mono">
                    {p.name}: {READ_ACCESS_LEVEL}
                  </Ltr>
                  <span class="muted">{p.why}</span>
                </li>
              ))}
            </ul>
          </Step>
          <Step n={5} title="أنشئ الرمز وانسخه الآن">
            <p>
              اضغط <Ltr>Generate token</Ltr> في أسفل الصفحة. يبدأ الرمز بـ<Ltr className="mono">github_pat_</Ltr> ولا يعرضه GitHub كاملًا بعد مغادرة الصفحة، فانسخه فورًا.
            </p>
            <p>لا تلصقه في محادثة ولا في ملف ولا في بلاغ؛ مكانه حقل الرمز في مِجهَر وحده.</p>
          </Step>
          <Step n={6} title="ألصقه في مِجهَر واحفظه">
            <p>في «رمز GitHub للقراءة»: اختر مكان الحفظ (ذاكرة الجلسة افتراضيًا، أو القرص في هذا المتصفح باختيارك)، وألصق الرمز، ثم «احفظ الرمز».</p>
            <p>
              يتحقق مِجهَر بطلب واحد إلى <Ltr className="mono">api.github.com</Ltr> يعرض حد الطلبات وموعد الانتهاء، ولا يُظهر الرمز بعد حفظه.
            </p>
            <Note tone="warning" icon="shield">
              الحفظ على القرص غير مشفَّر، ويقرؤه من يصل إلى ملف تعريف المتصفح؛ لا تختره على جهاز مشترك. وفي Firefox ذاكرة الجلسة وحدها.
            </Note>
            <div class="actions">
              <button type="button" class="btn" data-action="guide-to-token" onClick={onBack}>
                <Icon name="arrow-right" />
                إلى حقل الرمز
              </button>
            </div>
          </Step>
          <Step n={7} title="احذفه أو أبطله متى شئت">
            <p>في مِجهَر: «امسح الرمز» يمحوه من ذاكرة الجلسة والقرص فورًا، فتعود الميزات إلى القراءة دون رمز.</p>
            <p>
              وفي GitHub: <Ltr>Fine-grained tokens</Ltr> ثم <Ltr>Delete</Ltr> بجانب الرمز. مسحه من مِجهَر وحده لا يبطله في GitHub. ويبطله GitHub تلقائيًا إن نُشر في مستودع عام
              أو لم يُستعمل سنة.
            </p>
            <div class="actions">
              <a class="btn" href={TOKEN_LIST_URL} {...external} data-action="token-list">
                <Icon name="external-link" />
                افتح قائمة رموزك في GitHub
              </a>
            </div>
          </Step>
        </ol>
      </section>

      <footer class="sources" aria-labelledby="mj-guide-sources">
        <h2 id="mj-guide-sources" class="small">المصادر (قُرئت في 2026-10-24)</h2>
        <ul>
          {GUIDE_SOURCES.map((s) => (
            <li key={s.href}>
              <a href={s.href} {...external} lang="en" dir="ltr">
                docs.github.com — {s.label}
              </a>
            </li>
          ))}
          <li>
            <Ltr className="mono">evidence/T-0.5</Ltr>: أقل الصلاحيات المقيسة لكل نقطة يقرؤها مِجهَر.
          </li>
        </ul>
      </footer>
    </article>
  );
}
