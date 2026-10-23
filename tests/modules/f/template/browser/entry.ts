// مدخل حزمة اختبار (لا تُشحن) لـe2e حارس القالب وبنك العبارات وقسم «ترجمة مسودتي» (T-7.2/T-7.3) في المتصفحات: يركّب وحدة f.composer كما تُشحن على عينات fixtures/templates،
// ويقيس بالتخطيط الحقيقي ومع أحداث input الموثوقة (isTrusted) التي يولّدها أمر التحرير الحقيقي. الكتابة والنقر والتراجع الأصلي يرسلها run.mjs من خارج الصفحة.
import { FakeTranslationEngine, setTranslationService } from '../../../../../src/modules/c/ui';
import type { FakeMode } from '../../../../../src/modules/c/ui';
import { createComposerModule } from '../../../../../src/modules/f/composer';
import { mountInPage } from '../../../browser-context';
import type { MountedModule } from '../../../browser-context';

let mounted: MountedModule | null = null;
let pristine = '';
let engine: FakeTranslationEngine | null = null;
const log: Array<{ target: string; type: string; inputType: string | null; trusted: boolean }> = [];
const publishing: string[] = [];
const copied: string[] = [];
let instrumented = false;

const settle = (ms = 80): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const hostsOf = (name: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(`mijhar-host[data-mijhar-host="${name}"]`)];
const field = (id: string): HTMLTextAreaElement => document.getElementById(id) as HTMLTextAreaElement;
const rect = (el: Element): { x: number; y: number; w: number; h: number } => {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
};
const center = (el: Element): { x: number; y: number } => {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
};
const panelRoot = (): ShadowRoot | null => hostsOf('f.composer.panel')[0]?.shadowRoot ?? null;

function triggerFor(id: string): HTMLButtonElement | null {
  const f = field(id);
  const toolbar = [...document.querySelectorAll('markdown-toolbar')].find((t) => t.getAttribute('for') === id);
  const host = (toolbar ? [...toolbar.children] : [f.previousElementSibling]).find((el) => el?.getAttribute('data-mijhar-host') === 'f.composer.button') as HTMLElement | undefined;
  return host?.shadowRoot?.querySelector('button') ?? null;
}

async function mount(href: string): Promise<{ buttons: number }> {
  pristine = document.documentElement.outerHTML;
  mounted = mountInPage(createComposerModule({ debounceMs: 20 }), href);
  await settle(150);
  return { buttons: hostsOf('f.composer.button').length };
}

function instrument(): boolean {
  if (instrumented) return true;
  instrumented = true;
  for (const el of document.querySelectorAll('textarea, input, select')) {
    for (const type of ['input', 'beforeinput', 'change']) {
      el.addEventListener(type, (event) => log.push({ target: (el as HTMLElement).id || (el as HTMLInputElement).name, type, inputType: (event as InputEvent).inputType ?? null, trusted: event.isTrusted }), true);
    }
  }
  document.addEventListener('submit', (event) => void publishing.push(`submit:${(event.target as Element).id}`), true);
  document.addEventListener('click', (event) => {
    const t = event.target as Element;
    if (t.closest?.('button[type="submit"], input[type="submit"]')) publishing.push(`click:${t.id}`);
  }, true);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => void copied.push(text) }, configurable: true });
  return true;
}

const takeLog = (): typeof log => log.splice(0);
const takePublishing = (): string[] => publishing.splice(0);
const takeCopied = (): string[] => copied.splice(0);

/** يضع قيمة حقل كما يفعل GitHub حين يملأ القالب (بلا حدث). */
function setValue(arg: { id: string; value: string }): boolean {
  field(arg.id).value = arg.value;
  pristine = document.documentElement.outerHTML;
  return true;
}

/** كل قيم حقول الصفحة (للمقارنة قبل العملية وبعدها). */
function snapshot(): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const el of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('textarea, input, select')) {
    const key = el.id || el.name;
    out[key] = el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
  }
  return out;
}

function trigger(id: string): { x: number; y: number } | null {
  const b = triggerFor(id);
  if (!b) return null;
  b.scrollIntoView({ block: 'center', behavior: 'instant' });
  return center(b);
}

function panel(): unknown {
  const host = hostsOf('f.composer.panel')[0];
  const root = host?.shadowRoot;
  if (!root) return { open: false };
  const panelEl = root.querySelector('.panel') as HTMLElement;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const r = panelEl.getBoundingClientRect();
  const staticEl = root.querySelector('[data-section="static"]');
  const translate = root.querySelector<HTMLElement>('[data-section="translate-draft"]');
  return {
    open: true,
    inViewport: r.left >= 0 && r.top >= 0 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5,
    template: (panelEl as HTMLElement).dataset.template,
    currentLabel: root.querySelector<HTMLElement>('.template-block[data-template="issue-form"]')?.dataset.currentLabel ?? null,
    formFields: [...root.querySelectorAll('[data-form-field]')].map((li) => li.textContent),
    notice: root.querySelector('[data-template-notice]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    mapping: Object.fromEntries([...root.querySelectorAll<HTMLElement>('[data-map-field]')].map((li) => [li.dataset.mapField, li.textContent])),
    preview: root.querySelector('[data-preview]')?.textContent ?? null,
    output: root.querySelector<HTMLElement>('[data-preview]')?.dataset.output ?? null,
    previewEmpty: root.querySelector('[data-preview]')?.getAttribute('data-empty') === 'true',
    status: root.querySelector('.status')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    buttons: Object.fromEntries([...root.querySelectorAll<HTMLButtonElement>('[data-action]')].map((b) => [b.getAttribute('data-action'), { disabled: b.disabled, ...center(b) }])),
    sections: [...panelEl.children].map((el) => (el as HTMLElement).dataset.section).filter(Boolean),
    translateState: translate?.dataset.service ?? null,
    translateStatus: root.querySelector('[data-translate-status]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    translateResult: root.querySelector<HTMLElement>('[data-translate-result]')?.dataset.translateResult ?? null,
    staticHtml: staticEl?.innerHTML ?? null,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
}

/** مركز عنصر في اللوحة بعد تمريره إلى النافذة. selector داخل جذر الظل. */
function panelEl(selector: string): { x: number; y: number; disabled: boolean } | null {
  const el = panelRoot()?.querySelector<HTMLElement>(selector);
  if (!el) return null;
  el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  return { ...center(el), disabled: (el as HTMLButtonElement).disabled === true };
}

function focusPanel(selector: string): { focused: string | null } {
  const el = panelRoot()?.querySelector<HTMLElement>(selector);
  el?.focus();
  const active = panelRoot()?.activeElement as HTMLElement | null;
  return { focused: active?.id ?? null };
}

function fieldState(id: string): { value: string; start: number; end: number; focused: boolean } {
  const f = field(id);
  return { value: f.value, start: f.selectionStart, end: f.selectionEnd, focused: document.activeElement === f };
}

function setSelection(arg: { id: string; start: number; end: number; focus?: boolean }): boolean {
  const f = field(arg.id);
  if (arg.focus) f.focus();
  f.setSelectionRange(arg.start, arg.end);
  return true;
}

function focusField(id: string): boolean {
  field(id).focus();
  return document.activeElement === field(id);
}

function setEngine(mode: FakeMode | 'none' | 'unavailable'): boolean {
  if (mode === 'none') {
    engine = null;
    setTranslationService(null);
  } else if (mode === 'unavailable') {
    engine = new FakeTranslationEngine({ availability: { state: 'unavailable', reason: 'النموذج لم يُنزَّل' } });
    setTranslationService(engine);
  } else {
    engine = new FakeTranslationEngine({ mode });
    setTranslationService(engine);
  }
  return true;
}

const engineInfo = (): unknown => ({ present: engine !== null, calls: engine?.calls ?? 0, received: engine?.received ?? [] });

function resources(): string[] {
  return performance.getEntriesByType('resource').map((e) => e.name);
}

function stop(): unknown {
  const report = mounted?.stop();
  mounted = null;
  setTranslationService(null);
  engine = null;
  const now = document.documentElement.outerHTML;
  let at = 0;
  while (at < now.length && now[at] === pristine[at]) at += 1;
  return {
    hosts: document.querySelectorAll('mijhar-host').length,
    identical: now === pristine,
    skipped: report?.skipped.length ?? 0,
    ...(now === pristine ? {} : { at, before: pristine.slice(Math.max(0, at - 80), at + 120), after: now.slice(Math.max(0, at - 80), at + 120) }),
  };
}

const api: Record<string, (arg?: never) => unknown> = {
  mount, instrument, takeLog, takePublishing, takeCopied, setValue, snapshot, trigger, panel, panelEl, focusPanel, fieldState, setSelection, focusField, setEngine, engineInfo, resources, stop,
} as never;

function call(name: string, argJson: string): boolean {
  const w = window as unknown as { __mjDone: boolean; __mjResult: string | null };
  w.__mjDone = false;
  w.__mjResult = null;
  const arg = argJson ? JSON.parse(argJson) : undefined;
  Promise.resolve()
    .then(() => (api[name] as (a?: unknown) => unknown)(arg))
    .then(
      (value) => void ((w.__mjResult = JSON.stringify(value ?? null)), (w.__mjDone = true)),
      (error) => void ((w.__mjResult = JSON.stringify({ error: String(error?.stack ?? error) })), (w.__mjDone = true)),
    );
  return true;
}

Object.assign(window, { MijharE2E: { call } });
