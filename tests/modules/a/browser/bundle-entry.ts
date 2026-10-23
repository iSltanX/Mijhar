// مدخل حزمة اختبار (لا تُشحن) لقياس ميزات MJ7 الفعلية في المتصفحات الأربعة، بظروف خط أساس T-0.1 (القسم 6.13): يحقن
// window.MijharA7 بدوال يستدعيها bundle-run.mjs. الشيفرة نفسها التي تُشحن (createModuleA وميزات الوحدة (أ) والعارض)، لا نموذج.
// العينات تُخدم من 127.0.0.1، فيُركَّب الموديول بسياق ModuleContext أدنى يطابق ترتيب إيقاف النواة، والإعدادات في الذاكرة.
import { MutationRecorder, SelectorsRegistry } from '../../../../src/core';
import type { ExtensionModule, JsonValue, ModuleContext } from '../../../../src/core';
import { DIGITS_FEATURE } from '../../../../src/modules/a/digits';
import { DIRECTION_FEATURE, DIR_ATTR } from '../../../../src/modules/a/direction';
import { EDITOR_FEATURE, EDITOR_HOST_NAME } from '../../../../src/modules/a/editor';
import { createFontsFeature, DEFAULT_TYPOGRAPHY } from '../../../../src/modules/a/fonts';
import { HIJRI_FEATURE, HIJRI_HOST_NAME, HIJRI_OPTIONS_KEY, availableCalendar, calendarSupported } from '../../../../src/modules/a/hijri';
import { INJECTED_ATTR, ISOLATE_CLASS, ISOLATION_FEATURE, LINK_ATTR } from '../../../../src/modules/a/isolation';
import { snapshotContainers, takeSnapshot } from '../../../../src/modules/a/reading';
import { readerCss } from '../../../../src/modules/a/reading/reader/styles';
import { DiacriticsView, bindClipboard, renderSnapshot, stripWithOffsets } from '../../../../src/modules/a/reading/reader/view';
import { READING_STYLES_ID, createModuleA, featureSettingKey } from '../../../../src/modules/a/scope';
import type { FeatureStopReport, ModuleAFeature, SettingsReader } from '../../../../src/modules/a/scope';
import { insertIntoField } from '../../../../src/shared/fields';

const FEATURES: Record<string, ModuleAFeature> = {
  direction: DIRECTION_FEATURE,
  isolation: ISOLATION_FEATURE,
  fonts: createFontsFeature({ urlFor: () => null }),
  digits: DIGITS_FEATURE,
  hijri: HIJRI_FEATURE,
  'editor-toggle': EDITOR_FEATURE,
};
const LEFTOVERS = `[${DIR_ATTR}], [data-mijhar-orig-dir], [${INJECTED_ATTR}], [${LINK_ATTR}], #${READING_STYLES_ID}, mijhar-host`;
const BIDI_CONTROLS = /[؜‎‏‪-‮⁦-⁩]/g;

// قارئ إعدادات في الذاكرة (يطابق SettingsStore في get وsubscribe).
const values = new Map<string, JsonValue>();
const listeners = new Set<(change: { readonly key: string }) => void>();
const settings: SettingsReader = {
  get(key) {
    if (!values.has(key)) throw new Error(`غير معرَّف: ${key}`);
    return values.get(key) as JsonValue;
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
function setSetting(key: string, value: JsonValue): void {
  values.set(key, value);
  for (const listener of [...listeners]) listener({ key });
}

let teardown: (() => void) | null = null;
let pristine = '';
let pristineText = '';
let reports: FeatureStopReport[] = [];

function moduleContext(module: ExtensionModule): { ctx: ModuleContext; teardown: () => void } {
  const mutations = new MutationRecorder(module.id);
  const controller = new AbortController();
  const disposers: Array<() => void> = [];
  const ctx: ModuleContext = {
    moduleId: module.id,
    document,
    page: { href: 'https://github.com/octo/demo', type: 'repo', owner: 'octo', repo: 'demo', number: null, confidence: 'high', contentRoot: document.body },
    selectors: new SelectorsRegistry(module.selectors ?? []),
    mutations,
    signal: controller.signal,
    listen(target, type, listener, options) {
      target.addEventListener(type, listener, options);
      disposers.push(() => target.removeEventListener(type, listener, options));
    },
    observe(target, init, callback) {
      const observer = new MutationObserver(callback);
      observer.observe(target, init);
      disposers.push(() => observer.disconnect());
      return observer;
    },
    onTeardown(cleanup) {
      disposers.push(cleanup);
    },
  };
  return {
    ctx,
    teardown() {
      controller.abort();
      for (const dispose of disposers.splice(0).reverse()) dispose();
      mutations.restore();
    },
  };
}

/** يركّب الوحدة (أ) بالميزات المعطاة كلها مفعَّلة (الأرقام المشرقية منها). */
function mount(ids: readonly string[], hijri: JsonValue = { offset: 0, numerals: 'latn' }): { features: string[]; injected: number } {
  pristine = document.documentElement.outerHTML;
  pristineText = document.body.textContent ?? '';
  values.clear();
  reports = [];
  const features = ids.map((id) => FEATURES[id] as ModuleAFeature);
  for (const feature of features) {
    values.set(featureSettingKey(feature.id), { enabled: true, scope: 'all', repos: [] });
    for (const definition of feature.settings ?? []) values.set(definition.key, definition.default);
  }
  if (ids.includes('hijri')) values.set(HIJRI_OPTIONS_KEY, hijri);
  const module = createModuleA({ settings: () => settings, features, onReport: (r) => reports.push(r) });
  const mounted = moduleContext(module);
  module.mount(mounted.ctx);
  teardown = mounted.teardown;
  return { features: [...ids], injected: document.querySelectorAll(`[${INJECTED_ATTR}]`).length };
}

interface DisableResult {
  ms: number;
  leftovers: number;
  identical: boolean;
  restoredText: number;
  skipped: number;
}

const result = (ms: number): DisableResult => ({
  ms,
  leftovers: document.querySelectorAll(LEFTOVERS).length,
  identical: document.documentElement.outerHTML === pristine,
  restoredText: reports.reduce((n, r) => n + (r.text?.restored ?? 0), 0),
  skipped: reports.reduce((n, r) => n + r.restore.skipped.length + (r.text?.skipped.length ?? 0), 0),
});

/** PB-01 للوحدة كلها: من استدعاء إيقافها حتى اكتمال إزالة الأثر. */
function timeDisable(): DisableResult {
  reports = [];
  const t0 = performance.now();
  teardown?.();
  const t1 = performance.now();
  teardown = null;
  return result(t1 - t0);
}

/** PB-01 لإيقاف خيار واحد وهو مركَّب (AC-A6: «إيقاف الخيار يعيد النص»)، ثم إيقاف الوحدة. */
function timeSettingOff(id: string): DisableResult & { afterModuleOff: DisableResult } {
  reports = [];
  const t0 = performance.now();
  setSetting(featureSettingKey(id), { enabled: false, scope: 'all', repos: [] });
  const t1 = performance.now();
  const restoredText = reports.reduce((n, r) => n + (r.text?.restored ?? 0), 0);
  const skipped = reports.reduce((n, r) => n + r.restore.skipped.length + (r.text?.skipped.length ?? 0), 0);
  const easternLeft = (document.body.textContent?.match(/[٠-٩]/g) ?? []).length - (pristineText.match(/[٠-٩]/g) ?? []).length;
  const off = { ms: t1 - t0, leftovers: easternLeft, identical: false, restoredText, skipped };
  return { ...off, afterModuleOff: timeDisable() };
}

/** TEST-RTL-02: العرض الفعلي لما يُعزل، وثبات النص، وغياب محارف التوجيه المضافة. */
function isolation(): unknown {
  const spans = [...document.querySelectorAll(`.${ISOLATE_CLASS}`)].map((el) => {
    const style = getComputedStyle(el);
    return { text: el.textContent, direction: style.direction, unicodeBidi: style.unicodeBidi };
  });
  const existing = [...document.querySelectorAll(`[${DIR_ATTR}="rtl"] :is(code, a.user-mention, a.issue-link), .markdown-body p[dir="auto"] :is(code, a.user-mention, a.issue-link)`)]
    .filter((el) => getComputedStyle(el.closest('p, li, h1, h2, td, th') as Element).direction === 'rtl')
    .map((el) => ({ text: el.textContent, direction: getComputedStyle(el).direction, unicodeBidi: getComputedStyle(el).unicodeBidi }));
  const text = document.body.textContent ?? '';
  return {
    spans,
    existing,
    textSame: text === pristineText,
    bidiControlsAdded: (text.match(BIDI_CONTROLS) ?? []).length - (pristineText.match(BIDI_CONTROLS) ?? []).length,
    injectedWithDir: document.querySelectorAll(`[${INJECTED_ATTR}][dir]`).length,
  };
}

/** يحدد محتوى عنصر كاملًا ويعيد تسلسل المتصفح له. */
function selectContents(selector: string): string {
  const el = document.querySelector(selector) as Element;
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = getSelection() as Selection;
  selection.removeAllRanges();
  selection.addRange(range);
  return selection.toString();
}

function digits(ids: readonly string[]): Record<string, string> {
  return Object.fromEntries(ids.map((id) => [id, document.querySelector(`[data-digits="${id}"]`)?.textContent ?? '']));
}

/** نص التلميح الهجري لكل <relative-time data-ref> بعد المرور عليه (mouseover كما يطلقه المتصفح). */
function hijriTooltips(): Array<{ datetime: string; text: string | null; timeIntact: boolean }> {
  const host = (): HTMLElement | null => document.querySelector(`[data-mijhar-host="${HIJRI_HOST_NAME}"]`);
  return [...document.querySelectorAll('relative-time[data-ref]')].map((time) => {
    const before = time.outerHTML;
    time.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const text = host()?.shadowRoot?.querySelector('.date')?.textContent ?? null;
    time.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    return { datetime: time.getAttribute('datetime') as string, text, timeIntact: time.outerHTML === before };
  });
}

function calendars(): unknown {
  let supported: string[] = [];
  try {
    supported = (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf('calendar').filter((c) => c.startsWith('islamic'));
  } catch {
    supported = [];
  }
  return { umalqura: calendarSupported('islamic-umalqura'), civil: calendarSupported('islamic-civil'), chosen: availableCalendar(), supportedValuesOf: supported, icu: (Intl.DateTimeFormat().resolvedOptions() as { calendar: string }).calendar };
}

/** TEST-RTL-04 على textarea: كتابة بأمر التحرير، ثم عشرون تبديلًا بالزر، ثم تراجع وإعادة. */
function editor(): unknown {
  const field = document.getElementById('mj7-editor') as HTMLTextAreaElement;
  const button = document.querySelector(`[data-mijhar-host="${EDITOR_HOST_NAME}"]`)?.shadowRoot?.querySelector('button') as HTMLButtonElement | null;
  if (!button) return { error: 'لا زر' };
  const lines = Array.from({ length: 40 }, (_, i) => (i % 2 ? `السطر ${i} بالعربية مع كلمة English` : `Line ${i} with عربي inside`)).join('\n');
  field.focus();
  field.value = '';
  const inserted = insertIntoField(field, lines);
  const typed = field.value;
  field.setSelectionRange(120, 160, 'backward');
  field.scrollTop = 80;
  const snap = { value: field.value, start: field.selectionStart, end: field.selectionEnd, direction: field.selectionDirection, scrollTop: field.scrollTop };
  const failures: string[] = [];
  const dirs: Array<string | null> = [];
  for (let i = 0; i < 20; i += 1) {
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button.click();
    dirs.push(field.getAttribute('dir'));
    const now = { value: field.value, start: field.selectionStart, end: field.selectionEnd, direction: field.selectionDirection, scrollTop: field.scrollTop };
    if (JSON.stringify(now) !== JSON.stringify(snap)) failures.push(`${i}: ${JSON.stringify({ ...now, value: now.value === snap.value })}`);
  }
  field.focus();
  // التراجع بأمر التحرير في عائلة Chromium؛ وFirefox لا ينفّذه من سكربت الصفحة، فيُجرى فيه بالاختصار من bundle-run (editorValue).
  const undo = document.execCommand('undo');
  const afterUndo = field.value;
  const redo = undo ? document.execCommand('redo') : false;
  const afterRedo = field.value;
  return {
    insertMethod: inserted.method,
    typedOk: typed === lines,
    snapshot: { start: snap.start, end: snap.end, direction: snap.direction, scrollTop: snap.scrollTop },
    failures,
    dirs: dirs.slice(0, 6),
    focusKept: document.activeElement === field,
    undo: { ran: undo, emptied: afterUndo === '' },
    redo: { ran: redo, restored: afterRedo === lines },
  };
}

// ---------- العارض (05A إلى 05C و05E) ----------

let view: DiacriticsView | null = null;
const counters = { copy: 0, drag: 0 };

/** يأخذ لقطة من الصفحة (عينة GitHub) ثم يستبدل بها محتوى الصفحة عارضًا كما في reader.html. */
/** قيمة الحقل الآن مقارنةً بالفراغ وبما كُتب (بعد تراجع أو إعادة بالاختصار في Firefox). */
function editorValue(): { empty: boolean; full: boolean; focused: boolean } {
  const field = document.getElementById('mj7-editor') as HTMLTextAreaElement;
  return { empty: field.value === '', full: field.value.split('\n').length === 40, focused: document.activeElement === field };
}

function focusEditor(): boolean {
  const field = document.getElementById('mj7-editor') as HTMLTextAreaElement;
  field.focus();
  return document.activeElement === field;
}

function readerSetup(): { sections: number; hidden: number } {
  const snapshot = takeSnapshot(document, snapshotContainers(document, '.markdown-body'));
  const style = document.createElement('style');
  style.textContent = readerCss({ ...DEFAULT_TYPOGRAPHY, family: 'system' });
  document.head.append(style);
  const article = document.createElement('article');
  article.className = 'reader-article';
  article.dir = 'ltr';
  document.body.replaceChildren(article);
  renderSnapshot(article, snapshot);
  view = new DiacriticsView(article);
  bindClipboard(document, () => view, counters);
  return { sections: snapshot.sections.length, hidden: view.hide() };
}

const SELECTIONS: Record<string, { section: number; start: [string, number]; end: [string, number] | null; word?: string }> = {
  '05A': { section: 1, start: ['p', -1], end: null, word: 'المطور' },
  '05B': { section: 2, start: ['p', 2], end: ['p:last-of-type', 5] },
};

/** يحدد مدى الحالة: في النص المعروض إن hidden، وإلا في الأصل بالإزاحات المقابلة. يعيد تسلسل المتصفح للتحديد. */
function readerSelect(id: string, hidden: boolean): string {
  if (!view) throw new Error('readerSetup أولًا');
  if (hidden) view.hide();
  else view.show();
  const spec = SELECTIONS[id] as (typeof SELECTIONS)[string];
  const section = document.querySelectorAll('.reader-article .markdown-body')[spec.section] as Element;
  const nodeOf = (selector: string): Text => section.querySelector(selector)?.firstChild as Text;
  const map = (node: Text, offset: number): number => (hidden ? offset : (stripWithOffsets(node.data).offsets[offset] as number));
  const strippedOf = (node: Text): string => (hidden ? node.data : stripWithOffsets(node.data).stripped);
  const startNode = nodeOf(spec.start[0]);
  const range = document.createRange();
  if (spec.word) {
    const at = strippedOf(startNode).indexOf(spec.word);
    range.setStart(startNode, map(startNode, at));
    range.setEnd(startNode, map(startNode, at + spec.word.length));
  } else {
    const endNode = nodeOf((spec.end as [string, number])[0]);
    range.setStart(startNode, map(startNode, spec.start[1]));
    range.setEnd(endNode, map(endNode, (spec.end as [string, number])[1]));
  }
  const selection = getSelection() as Selection;
  selection.removeAllRanges();
  selection.addRange(range);
  return selection.toString();
}

/** السحب: حدث dragstart مصطنع بـDataTransfer حقيقي (السحب الأصلي لا يبدأ بأحداث مصطنعة، T-0.1). */
function readerDrag(): { plain: string; html: string } {
  const dt = new DataTransfer();
  const target = (getSelection() as Selection).getRangeAt(0).startContainer.parentElement as Element;
  target.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  return { plain: dt.getData('text/plain'), html: dt.getData('text/html') };
}

function readerState(): { hidden: boolean; copy: number; drag: number } {
  return { hidden: view?.hidden ?? false, ...counters };
}

(window as unknown as { MijharA7: unknown }).MijharA7 = {
  mount,
  setSetting,
  timeDisable,
  timeSettingOff,
  isolation,
  selectContents,
  digits,
  hijriTooltips,
  calendars,
  editor,
  editorValue,
  focusEditor,
  readerSetup,
  readerSelect,
  readerDrag,
  readerState,
};
