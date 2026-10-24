// حقل «النموذج» في بطاقة «مزوّد التحليل» (DEC-13 ن-5؛ المكوّن Model field والإطارات O-23 وO-24 وO-25 وO-27 وO-28). في صفحة الإعدادات وحدها.
//  - الحقل النصي هو الأساس: معرّف النموذج يُكتب يدويًا ويُحفظ لمزوّده كما هو بعد فحص صيغته محليًا (isModelId) بلا أي طلب، وإن لم يكن في القائمة؛ فيعمل
//    نموذج جديد بلا تحديث للإضافة ما دام بواجهة الطلب التي يستعملها المحوّل. والفارغ لا تحليل معه ولا يُخمَّن نموذج.
//  - زر + بجانبه يفتح قائمة نماذج المزوّد المختار للمساعدة فقط: المقروءة في الجلسة بوقت قراءتها، وإلا يُرسل طلب التحقق المعلن نفسه. الاختيار يملأ الحقل
//    ويغلق القائمة ويعيد التركيز إلى الحقل، وكذلك Esc والنقر خارجها؛ وتعذّر الجلب لا يعطّل الحقل. وبلا مفتاح: الزر معطّل بسببه والحقل يعمل.
//  - «اختبر النموذج» إجراء اختياري واحد للنموذج المكتوب حيث يدعمه المحوّل (probeRequest)، لا زر لكل نموذج ولا فحص تلقائي، وليس شرطًا للحفظ ولا
//    للتحليل. نتيجته من الخلفية مقرونة بالنموذج والمفتاح، وتُعرض للنموذج المكتوب وحده؛ وفشل الشبكة أو المصادقة أو حد الطلبات «لم يُحسم» لا رفض.
//  - زر + و«حدّث القائمة» و«أعد المحاولة» و«اختبر النموذج» ترسل طلبًا، فتقبل نقرة المستخدم الموثوقة وحدها (AD-27).
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { Icon } from '../../../shared/ui/icons';
import { Ltr } from '../../../shared/ui';
import { isTrustedActivation } from '../../../shared/ui/user-activation';
import { isModelId, listedModels } from './models';
import type { ModelTest, ModelsList, ProviderDescriptor } from './types';

/** نتيجة جلب القائمة أو الاختبار كما تراها البطاقة: فشل بسببه المنقّح، أو نجاح (والقائمة أو النتيجة تصلان مع حالة المزوّد). */
export type FieldOutcome = { readonly ok: true } | { readonly ok: false; readonly message: string };

export interface ModelFieldProps {
  readonly descriptor: Pick<ProviderDescriptor, 'id' | 'title' | 'probeRequest'>;
  /** مفتاح الإعداد الذي يُحفظ فيه معرّف النموذج لهذا المزوّد. */
  readonly settingKey: string;
  /** المعرّف المحفوظ الآن. */
  readonly value: string;
  readonly onCommit: (value: string) => void;
  /** للمزوّد مفتاح محفوظ (فتُجلب قائمته ويُختبر نموذجه). */
  readonly hasKey: boolean;
  /** قائمة نماذجه المقروءة في الجلسة، أو null. */
  readonly list: ModelsList | null;
  /** نتيجة آخر اختبار للنموذج المحفوظ بالمفتاح الحالي (من الخلفية)، أو null. */
  readonly test: ModelTest | null;
  readonly busy: boolean;
  /** يُستدعى متزامنًا من النقرة (فيطلب صلاحية المضيف قبل أي await)، ويرسل طلب القائمة المعلن. */
  readonly fetchList: () => Promise<FieldOutcome>;
  /** يُستدعى متزامنًا من النقرة، ويرسل طلب الاختبار المعلن للنموذج المكتوب. */
  readonly runTest: (model: string) => Promise<FieldOutcome>;
}

const FIELD_CSS = `
.mj-root .model-field { display: flex; flex-direction: column; gap: var(--mijhar-space-6); }
.mj-root .model-field .mf-row { display: flex; align-items: center; gap: var(--mijhar-space-8); max-width: 36rem; }
.mj-root .model-field .mf-input {
  flex: 1 1 auto; min-width: 0; min-height: 32px; padding: 0 var(--mijhar-space-8); font-family: var(--mijhar-font-mono); font-size: 12px;
  color: var(--mijhar-text-primary); background: var(--mijhar-bg-surface); border: 1px solid var(--mijhar-border-strong); border-radius: var(--mijhar-radius-6);
  direction: ltr; text-align: left;
}
.mj-root .model-field .mf-input::placeholder { color: var(--mijhar-text-disabled); }
.mj-root .model-field .mf-input:focus-visible, .mj-root .model-field .mf-input[aria-expanded="true"] { outline: none; border-color: var(--mijhar-border-focus); box-shadow: var(--mijhar-focus-ring); }
.mj-root .model-field .mf-input[aria-invalid="true"] { border-color: var(--mijhar-text-danger); }
.mj-root .model-field .mf-add { flex: 0 0 auto; width: 32px; min-width: 32px; padding: 0; }
.mj-root .model-field .mf-add[aria-expanded="true"] { background: var(--mijhar-bg-muted); }
.mj-root .model-field .mf-add[aria-disabled="true"] { color: var(--mijhar-text-disabled); background: var(--mijhar-bg-muted); cursor: not-allowed; }
.mj-root .model-field .mf-pop {
  max-width: 36rem; display: flex; flex-direction: column; gap: var(--mijhar-space-4); padding: var(--mijhar-space-8);
  background: var(--mijhar-bg-surface-raised); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6); box-shadow: var(--mijhar-shadow-raised);
}
.mj-root .model-field .mf-pop-head, .mj-root .model-field .mf-pop-state { display: flex; align-items: center; justify-content: space-between; gap: var(--mijhar-space-8); padding: var(--mijhar-space-4) var(--mijhar-space-8); }
.mj-root .model-field .mf-pop-state { justify-content: flex-start; padding-block: var(--mijhar-space-8); }
.mj-root .model-field .mf-pop-state .mf-link { margin-inline-start: auto; }
.mj-root .model-field .mf-link { appearance: none; padding: 0; border: 0; background: none; font: inherit; font-size: 12px; font-weight: 700; color: var(--mijhar-text-brand); cursor: pointer; }
.mj-root .model-field .mf-link:hover { text-decoration: underline; }
.mj-root .model-field .mf-link:disabled { color: var(--mijhar-text-disabled); cursor: not-allowed; text-decoration: none; }
.mj-root .model-field [role="listbox"] { margin: 0; padding: 0; list-style: none; max-height: 16rem; overflow-y: auto; }
.mj-root .model-field [role="option"] {
  padding: var(--mijhar-space-6) var(--mijhar-space-8); border-radius: var(--mijhar-radius-6); cursor: pointer; direction: ltr; text-align: left;
  font-family: var(--mijhar-font-mono); font-size: 12px; line-height: 20px; color: var(--mijhar-text-primary);
}
.mj-root .model-field [role="option"] .mf-name { font-family: var(--mijhar-font-text); color: var(--mijhar-text-secondary); margin-inline-start: var(--mijhar-space-8); }
.mj-root .model-field [role="option"][data-active="true"], .mj-root .model-field [role="option"]:hover { background: var(--mijhar-bg-muted); }
.mj-root .model-field [role="option"][aria-selected="true"] { font-weight: 700; }
.mj-root .model-field .mf-invalid { color: var(--mijhar-text-danger); }
.mj-root .model-field .mf-foot { padding: var(--mijhar-space-4) var(--mijhar-space-8) 0; }
.mj-root .model-field .mf-test { display: flex; align-items: center; gap: var(--mijhar-space-8); flex-wrap: wrap; }
.mj-root .model-field .mf-test .btn { min-height: 28px; padding: 0 var(--mijhar-space-8); font-size: 12px; }
.mj-root .model-field .mf-result { display: inline-flex; align-items: center; gap: var(--mijhar-space-6); flex: 1 1 16rem; padding: var(--mijhar-space-4) var(--mijhar-space-8); font-size: 12px; line-height: 18px; }
.mj-root .model-field .mf-spin { animation: mj-mf-spin 900ms linear infinite; transform-origin: 50% 50%; }
@keyframes mj-mf-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .mj-root .model-field .mf-spin { animation: none; } }
`;

export { FIELD_CSS as MODEL_FIELD_CSS };

type Local = 'plus' | 'spinner' | 'x-circle' | 'check-circle';
const D: Readonly<Record<Local, readonly string[]>> = {
  plus: ['M8 3V13M3 8H13'],
  spinner: ['M8 2.25A5.75 5.75 0 1 1 2.25 8'],
  'x-circle': ['M8 13.75C11.1756 13.75 13.75 11.1756 13.75 8C13.75 4.82436 11.1756 2.25 8 2.25C4.82436 2.25 2.25 4.82436 2.25 8C2.25 11.1756 4.82436 13.75 8 13.75Z', 'M6 6L10 10M10 6L6 10'],
  'check-circle': ['M8 13.75C11.1756 13.75 13.75 11.1756 13.75 8C13.75 4.82436 11.1756 2.25 8 2.25C4.82436 2.25 2.25 4.82436 2.25 8C2.25 11.1756 4.82436 13.75 8 13.75Z', 'M5.5 8.25L7.25 10L10.5 6.5'],
};

/** أيقونات الحقل (16×16، خط بلون النص) التي ليست في shared/ui/icons؛ زخرفية دائمًا والمعنى في النص المجاور. */
function FieldIcon({ name, className }: { name: Local; className?: string }) {
  return (
    <svg class={className ? `icon ${className}` : 'icon'} width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false" data-icon={name}>
      {D[name].map((d) => (
        <path key={d} d={d} stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      ))}
    </svg>
  );
}

const clock = (ms: number): string => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
/** سبب المزوّد في جملة: بلا نقطة ختامية تتكرر قبل ما يليه. */
const reason = (message: string): string => message.trim().replace(/[.。؛;:،]+$/u, '');

type ListPhase = { readonly kind: 'idle' } | { readonly kind: 'loading' } | { readonly kind: 'failed'; readonly message: string };
type Running = { readonly model: string } | null;

export function ModelField({ descriptor, settingKey, value, onCommit, hasKey, list, test, busy, fetchList, runTest }: ModelFieldProps) {
  const uid = useId();
  const ids = { input: `mj-model-${uid}`, list: `mj-model-list-${uid}`, help: `mj-model-help-${uid}`, live: `mj-model-live-${uid}` };
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<ListPhase>({ kind: 'idle' });
  const [active, setActive] = useState(-1);
  const [running, setRunning] = useState<Running>(null);
  /** فشل لم يُرسل فيه طلب الاختبار (لا يُحفظ في الخلفية): يُعرض للنموذج الذي طُلب له وحده. */
  const [unsent, setUnsent] = useState<{ readonly model: string; readonly message: string } | null>(null);

  // المعرّف المحفوظ تغيّر من خارج الحقل (اقتراح بعد التحقق، أو تغيير من صفحة أخرى): يعرضه الحقل. وما حفظه الحقل نفسه لا يمس ما يُكتب الآن.
  const mine = useRef(value);
  useEffect(() => {
    if (value === mine.current) return;
    mine.current = value;
    setDraft(value);
    setInvalid(false);
  }, [value]);

  const models = listedModels(list);
  const typed = draft.trim();

  // النقر خارج الحقل وقائمته يغلقها.
  useEffect(() => {
    if (!open) return;
    const away = (event: Event) => {
      if (root.current && !event.composedPath().includes(root.current)) setOpen(false);
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);

  const commit = (raw: string) => {
    const next = raw.trim();
    if (next && !isModelId(next)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (next !== mine.current) {
      mine.current = next;
      onCommit(next);
    }
  };

  const close = (focus = true) => {
    setOpen(false);
    setActive(-1);
    if (focus) input.current?.focus();
  };

  const load = () => {
    setPhase({ kind: 'loading' });
    fetchList().then(
      (outcome) => setPhase(outcome.ok ? { kind: 'idle' } : { kind: 'failed', message: outcome.message }),
      () => setPhase({ kind: 'failed', message: 'تعذّر الوصول إلى خلفية الإضافة' }),
    );
  };

  const toggle = (event: MouseEvent) => {
    if (!isTrustedActivation(event) || !hasKey || busy) return;
    if (open) {
      close();
      return;
    }
    setOpen(true);
    setActive(-1);
    input.current?.focus();
    if (!list) load();
  };

  const reload = (event: MouseEvent) => {
    if (!isTrustedActivation(event) || !hasKey || busy) return;
    load();
  };

  const choose = (id: string) => {
    setDraft(id);
    commit(id);
    close();
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open || phase.kind !== 'idle' || !models.length) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i < 0 ? (step > 0 ? 0 : models.length - 1) : (i + step + models.length) % models.length));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const picked = open && active >= 0 ? models[active] : undefined;
      if (picked) choose(picked.id);
      else commit((event.currentTarget as HTMLInputElement).value);
    }
  };

  const test1 = (event: MouseEvent) => {
    if (!isTrustedActivation(event) || !descriptor.probeRequest || running || busy || !hasKey || !isModelId(typed)) return;
    commit(typed);
    const model = typed;
    setUnsent(null);
    setRunning({ model });
    runTest(model)
      .then(
        (outcome) => setUnsent(outcome.ok ? null : { model, message: outcome.message }),
        () => setUnsent({ model, message: 'تعذّر الوصول إلى خلفية الإضافة' }),
      )
      .finally(() => setRunning(null));
  };

  const shownTest = test && test.model === typed ? test : null;
  const shownUnsent = unsent && unsent.model === typed ? unsent : null;
  const canTest = hasKey && isModelId(typed) && !busy && !running;
  const help = hasKey
    ? 'اكتب المعرّف كما يسمّيه المزوّد. زر + يعرض نماذجه للمساعدة فقط.'
    : `يمكنك كتابة المعرّف الآن؛ وتظهر قائمة ${descriptor.title} بعد إضافة مفتاحه والتحقق منه.`;
  const activeId = open && active >= 0 && models[active] ? `${ids.list}-${active}` : undefined;

  return (
    <div ref={root} class="field model-field" data-model-field={descriptor.id}>
      <label class="label" for={ids.input}>
        <strong>النموذج</strong>
      </label>
      <div class="mf-row">
        <input
          ref={input}
          id={ids.input}
          class="mf-input"
          type="text"
          dir="ltr"
          spellcheck={false}
          autocomplete="off"
          placeholder="model-id"
          role="combobox"
          aria-autocomplete="none"
          aria-expanded={open ? 'true' : 'false'}
          aria-controls={open ? ids.list : undefined}
          aria-activedescendant={activeId}
          aria-describedby={ids.help}
          aria-invalid={invalid ? 'true' : undefined}
          data-setting={settingKey}
          data-model-input=""
          value={draft}
          onInput={(event) => {
            setDraft((event.currentTarget as HTMLInputElement).value);
            setInvalid(false);
          }}
          // الحفظ عند مغادرة الحقل وEnter، لا مع كل حرف (onChange في الحقول النصية يصير حدث الكتابة حيث يُحمَّل preact/compat).
          onBlur={(event) => commit((event.currentTarget as HTMLInputElement).value)}
          onKeyDown={onKey}
        />
        <button
          type="button"
          class="btn mf-add"
          data-action="model-list"
          aria-label={`اعرض نماذج ${descriptor.title} للاختيار`}
          aria-haspopup="listbox"
          aria-expanded={open ? 'true' : 'false'}
          aria-controls={open ? ids.list : undefined}
          aria-disabled={hasKey && !busy ? undefined : 'true'}
          aria-describedby={hasKey ? undefined : ids.help}
          onClick={toggle}
        >
          <FieldIcon name="plus" />
        </button>
      </div>

      {open && (
        <div class="mf-pop" data-model-list={phase.kind === 'loading' ? 'loading' : phase.kind === 'failed' ? 'failed' : models.length ? 'list' : 'empty'}>
          <div aria-live="polite" class="mf-live">
            {phase.kind === 'loading' ? (
              <p class="mf-pop-state muted small" data-list-state="loading">
                <FieldIcon name="spinner" className="mf-spin" />
                يجلب قائمة النماذج من {descriptor.title}…
              </p>
            ) : phase.kind === 'failed' ? (
              <p class="mf-pop-state small" data-list-state="failed">
                <span>تعذّر جلب القائمة ({reason(phase.message)}). الحقل يعمل كما هو.</span>
                <button type="button" class="mf-link" data-action="model-list-retry" disabled={busy} onClick={reload}>
                  أعد المحاولة
                </button>
              </p>
            ) : !models.length ? (
              <p class="mf-pop-state small" data-list-state="empty">
                لم يُعِد {descriptor.title} نماذج لمفتاحك. اكتب المعرّف بنفسك.
              </p>
            ) : null}
          </div>
          {phase.kind === 'idle' && list && models.length > 0 && (
            <>
              <div class="mf-pop-head">
                <span class="muted small" data-list-source="">
                  من قائمة {descriptor.title} · قُرئت <Ltr>{clock(list.readAt)}</Ltr>
                  {list.partial ? ' · أعلن المزوّد نماذج أخرى لم تُقرأ' : ''}
                </span>
                <button type="button" class="mf-link" data-action="model-list-refresh" disabled={busy} onClick={reload}>
                  حدّث القائمة
                </button>
              </div>
              <ul id={ids.list} role="listbox" aria-label={`نماذج ${descriptor.title}`}>
                {models.map((m, i) => (
                  <li
                    key={m.id}
                    id={`${ids.list}-${i}`}
                    role="option"
                    aria-selected={m.id === typed ? 'true' : 'false'}
                    data-active={i === active ? 'true' : undefined}
                    data-model={m.id}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => choose(m.id)}
                  >
                    {m.id}
                    {m.displayName !== m.id && <span class="mf-name">{m.displayName}</span>}
                  </li>
                ))}
              </ul>
              <p class="mf-foot muted small">للمساعدة فقط: اختيار نموذج يملأ الحقل ويغلق القائمة، ويقبل أي معرّف تكتبه.</p>
            </>
          )}
        </div>
      )}

      <p id={ids.help} class={invalid ? 'small mf-invalid' : 'muted small'} data-model-help={invalid ? 'invalid' : hasKey ? 'key' : 'no-key'}>
        {invalid ? 'معرّف غير صالح: حروف لاتينية وأرقام و. _ : @ - فقط، يبدأ بحرف أو رقم، حتى 128 حرفًا. لم يُحفظ.' : help}
      </p>

      {descriptor.probeRequest && (
        <div class="mf-test">
          <button
            type="button"
            class="btn"
            data-action="model-test"
            title={descriptor.probeRequest}
            disabled={!canTest}
            aria-busy={running ? 'true' : undefined}
            onClick={test1}
          >
            {running ? (
              <>
                <FieldIcon name="spinner" className="mf-spin" />
                جارٍ…
              </>
            ) : (
              'اختبر النموذج'
            )}
          </button>
          <span aria-live="polite" class="mf-test-live">
            {running ? (
              <span class="muted small" data-model-test="running">
                يُرسل طلبًا واحدًا بنص «ping» وحده…
              </span>
            ) : shownTest ? (
              <span
                class="notice mf-result"
                data-tone={shownTest.verdict === 'accepted' ? 'success' : shownTest.verdict === 'rejected' ? 'danger' : 'warning'}
                data-model-test={shownTest.verdict}
              >
                {shownTest.verdict === 'accepted' ? (
                  <>
                    <FieldIcon name="check-circle" />
                    قبِل {descriptor.title} النموذج في الاختبار (<Ltr>{clock(shownTest.at)}</Ltr>).
                  </>
                ) : shownTest.verdict === 'rejected' ? (
                  <>
                    <FieldIcon name="x-circle" />
                    رفض {descriptor.title} النموذج: {reason(shownTest.message)}. لا يمنع ذلك الحفظ ولا التحليل.
                  </>
                ) : (
                  <>
                    <Icon name="warning" />
                    لم يُحسم الاختبار: {reason(shownTest.message)}. ليس حكمًا على النموذج، ولا يمنع الحفظ ولا التحليل.
                  </>
                )}
              </span>
            ) : shownUnsent ? (
              <span class="notice mf-result" data-tone="warning" data-model-test="unsent">
                <Icon name="warning" />
                لم يُرسل الاختبار: {shownUnsent.message}
              </span>
            ) : null}
          </span>
        </div>
      )}
    </div>
  );
}
