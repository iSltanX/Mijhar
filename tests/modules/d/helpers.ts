// أدوات اختبار الوحدة (د): تحميل عينة HTML في المستند العام (بيئة jsdom؛ Preact يرسم في document العام)، وتركيب وحدة عبر
// الكاشف ومدير دورة الحياة كما تفعل الإضافة، ومحدّدات الوحدة في سجل محدد جديد.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SELECTORS, LifecycleManager, ModuleRegistry, PageDetector, SelectorsRegistry } from '../../../src/core';
import type { ExtensionModule, SelectorEntry } from '../../../src/core';

// لا tests/setup/paths: في بيئة jsdom يكون URL العام من jsdom فلا يقبله fileURLToPath.
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const D_FIXTURES = path.join(ROOT, 'tests/modules/d/fixtures');

export const readFixture = (file: string): string => fs.readFileSync(path.isAbsolute(file) ? file : path.join(D_FIXTURES, file), 'utf8');

/** يحمّل عينة في المستند العام. */
export function loadHtml(file: string): void {
  const parsed = new DOMParser().parseFromString(readFixture(file), 'text/html');
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

/** نسخة من عينة كنص (لتعديلها قبل التحميل). */
export function loadHtmlText(html: string): void {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

export const selectorsWith = (entries: readonly SelectorEntry[]): SelectorsRegistry => new SelectorsRegistry([...DEFAULT_SELECTORS, ...entries]);

export const flush = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface Mounted {
  readonly manager: LifecycleManager;
  readonly errors: unknown[];
}

/** يركّب الوحدات على الصفحة الحالية (document العام) ويعيد المدير. */
export async function mountModules(modules: readonly ExtensionModule[]): Promise<Mounted> {
  const errors: unknown[] = [];
  const manager = new LifecycleManager({
    registry: new ModuleRegistry(modules),
    detector: new PageDetector({ document, settleMs: 5 }),
    isEnabled: () => true,
    document,
    onError: (event) => errors.push(event),
  });
  manager.start();
  await flush(20);
  return { manager, errors };
}

/** مضيفو الوحدة المحقونة بمعرّفها. */
export const hostsOf = (id: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(`mijhar-host[data-mijhar-host="${id}"]`)];

export const shadowText = (host: Element | null | undefined): string => (host?.shadowRoot?.textContent ?? '').replace(/\s+/g, ' ').trim();
