// مدخل حزمة اختبار (لا تُشحن) لـe2e مساعد الكتابة (T-7.1) في المتصفحات: يركّب وحدة f.composer كما تُشحن على عينة المحررات، ويقيس بالتخطيط الحقيقي ومع أحداث input
// الموثوقة (isTrusted) التي يولّدها أمر التحرير الحقيقي. الكتابة والنقر والتراجع الأصلي (⌘Z) يرسلها run.mjs من خارج الصفحة.
import { createComposerModule } from '../../../../../src/modules/f/composer';
import { mountInPage } from '../../../browser-context';
import type { MountedModule } from '../../../browser-context';

let mounted: MountedModule | null = null;
let pristine = '';
const log: Array<{ target: string; type: string; inputType: string | null; trusted: boolean; length: number }> = [];
const publishing: string[] = [];
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

/** يسجّل أحداث input على الحقول (الموثوقة منها دليل أمر التحرير الحقيقي) وكل ما قد يكون نشرًا: submit والنقر على أزرار الإرسال. */
function instrument(): boolean {
  if (instrumented) return true;
  instrumented = true;
  for (const el of document.querySelectorAll('textarea')) {
    for (const type of ['input', 'beforeinput', 'change']) {
      el.addEventListener(type, (event) => log.push({ target: el.id, type, inputType: (event as InputEvent).inputType ?? null, trusted: event.isTrusted, length: el.value.length }), true);
    }
  }
  document.addEventListener('submit', (event) => void publishing.push(`submit:${(event.target as Element).id}`), true);
  document.addEventListener('click', (event) => {
    const t = event.target as Element;
    if (t.closest?.('button[type="submit"], input[type="submit"]')) publishing.push(`click:${t.id}`);
  }, true);
  return true;
}

function takeLog(): typeof log {
  return log.splice(0);
}

function takePublishing(): string[] {
  return publishing.splice(0);
}

function buttons(): unknown {
  const ids = ['issue-body', 'pull_request_body', 'new_comment_field', 'fallback-field'];
  return {
    all: ids.map((id) => {
      const b = triggerFor(id);
      return { id, present: Boolean(b), rect: b ? rect(b) : null, expanded: b?.getAttribute('aria-expanded'), label: b?.getAttribute('aria-label') };
    }),
    cmButtons: document.querySelectorAll('.cm-editor mijhar-host').length,
    total: hostsOf('f.composer.button').length,
  };
}

function trigger(id: string): { x: number; y: number } | null {
  const b = triggerFor(id);
  if (!b) return null;
  b.scrollIntoView({ block: 'center', behavior: 'instant' });
  return center(b);
}

const panelRoot = (): ShadowRoot | null => hostsOf('f.composer.panel')[0]?.shadowRoot ?? null;

function panel(): unknown {
  const host = hostsOf('f.composer.panel')[0];
  const root = host?.shadowRoot;
  if (!root) return { open: false };
  const panelEl = root.querySelector('.panel') as HTMLElement;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const r = panelEl.getBoundingClientRect();
  return {
    open: true,
    hostIsLast: document.body.lastElementChild === host,
    rect: rect(panelEl),
    inViewport: r.left >= 0 && r.top >= 0 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5,
    scrollable: panelEl.scrollHeight > panelEl.clientHeight,
    focus: root.activeElement?.id ?? root.activeElement?.getAttribute('data-action') ?? null,
    kind: (root.querySelector('input[name="mj-composer-kind"]:checked') as HTMLInputElement | null)?.value,
    preview: root.querySelector('[data-preview]')?.textContent ?? null,
    previewEmpty: root.querySelector('[data-preview]')?.getAttribute('data-empty') === 'true',
    status: root.querySelector('.status')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    statusVisible: !(root.querySelector('.status') as HTMLElement | null)?.hidden,
    buttons: Object.fromEntries([...root.querySelectorAll<HTMLButtonElement>('[data-action]')].map((b) => [b.getAttribute('data-action'), { disabled: b.disabled, ...center(b) }])),
    fields: Object.fromEntries([...root.querySelectorAll<HTMLTextAreaElement>('.field textarea')].map((t) => [t.id.replace('mj-composer-', ''), t.value])),
    pageFocus: document.activeElement?.localName === 'mijhar-host' ? (document.activeElement.getAttribute('data-mijhar-host') ?? 'host') : (document.activeElement?.id ?? document.activeElement?.localName ?? null),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
}

/** مركز زر في اللوحة بعد تمريره إلى النافذة (كما يفعل مستخدم)، لنقرة فعلية. */
function panelButton(action: string): { x: number; y: number; disabled: boolean } | null {
  const b = panelRoot()?.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  if (!b) return null;
  b.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  return { ...center(b), disabled: b.disabled };
}

/** يركّز حقلًا في اللوحة (للكتابة الفعلية بعده). */
function focusPanelField(name: string): { focused: string | null } {
  const el = panelRoot()?.getElementById(`mj-composer-${name}`) as HTMLTextAreaElement | null;
  el?.focus();
  return { focused: panelRoot()?.activeElement?.id ?? null };
}

function fieldState(id: string): { value: string; start: number; end: number; direction: string; focused: boolean } {
  const f = field(id);
  return { value: f.value, start: f.selectionStart, end: f.selectionEnd, direction: f.selectionDirection, focused: document.activeElement === f };
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

function fieldRect(id: string): { x: number; y: number } {
  const f = field(id);
  f.scrollIntoView({ block: 'center', behavior: 'instant' });
  return center(f);
}

function sameAsPristine(): { same: boolean; at?: number; before?: string; after?: string } {
  const now = document.documentElement.outerHTML;
  if (now === pristine) return { same: true };
  let at = 0;
  while (at < now.length && now[at] === pristine[at]) at += 1;
  return { same: false, at, before: pristine.slice(Math.max(0, at - 80), at + 120), after: now.slice(Math.max(0, at - 80), at + 120) };
}

function resources(): string[] {
  return performance.getEntriesByType('resource').map((e) => e.name);
}

function stop(): unknown {
  const report = mounted?.stop();
  mounted = null;
  const now = document.documentElement.outerHTML;
  return { hosts: document.querySelectorAll('mijhar-host').length, identical: now === pristine, skipped: report?.skipped.length ?? 0 };
}

const api: Record<string, (arg?: never) => unknown> = { mount, instrument, panelButton, takeLog, takePublishing, buttons, trigger, panel, focusPanelField, fieldState, setSelection, focusField, fieldRect, sameAsPristine, resources, stop } as never;

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
