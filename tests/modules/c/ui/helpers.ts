// أدوات اختبار واجهة الترجمة (T-4.1): تحميل العينة الإنجليزية، وتركيب وحدة الترجمة بمحرك وهمي، ومساعدات قراءة ما يُعرض داخل مضيفات Shadow DOM.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'preact/test-utils';
import { LifecycleManager, ModuleRegistry, PageDetector } from '../../../../src/core';
import { createTranslateModule } from '../../../../src/modules/c/ui';
import type { TranslateModuleOptions } from '../../../../src/modules/c/ui';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const FIXTURE = path.join(ROOT, 'tests/modules/c/ui/fixtures/fixture-translate-en.html');

export function loadHtml(file: string): void {
  const html = fs.readFileSync(file, 'utf8');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

export const flush = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface Live {
  readonly manager: LifecycleManager;
  readonly errors: unknown[];
}

export async function mountTranslate(options: TranslateModuleOptions = {}): Promise<Live> {
  const errors: unknown[] = [];
  const manager = new LifecycleManager({
    registry: new ModuleRegistry([createTranslateModule({ debounceMs: 5, selection: { debounceMs: 5, rectOf: () => ({ left: 40, top: 40, width: 80, height: 20 }) }, ...options })]),
    detector: new PageDetector({ document, settleMs: 5 }),
    isEnabled: () => true,
    document,
    onError: (event) => errors.push(event),
  });
  manager.start();
  await flush(30);
  return { manager, errors };
}

export const hosts = (name: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(`mijhar-host[data-mijhar-host="${name}"]`)];
export const bars = (): HTMLElement[] => hosts('c.ui.bar');
export const translations = (): HTMLElement[] => hosts('c.ui.translation');

/** شريط الترجمة الذي يسبق العنصر مباشرة. */
export const barBefore = (selector: string): HTMLElement => {
  const body = document.querySelector(selector) as Element;
  return body.previousElementSibling as HTMLElement;
};

export const barButton = (bar: HTMLElement, action: string): HTMLButtonElement | null => bar.shadowRoot!.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
export const modeButton = (bar: HTMLElement, mode: string): HTMLButtonElement => bar.shadowRoot!.querySelector<HTMLButtonElement>(`[data-mode="${mode}"]`)!;
export const barNote = (bar: HTMLElement): string => bar.shadowRoot!.querySelector('[data-note]')!.textContent!.replace(/\s+/g, ' ').trim();
export const phase = (bar: HTMLElement): string | null => bar.shadowRoot!.querySelector('.bar')!.getAttribute('data-phase');

export async function press(bar: HTMLElement, action: string, wait = 40): Promise<void> {
  await act(async () => {
    barButton(bar, action)!.click();
    await flush(wait);
  });
}

export async function pressMode(bar: HTMLElement, mode: string): Promise<void> {
  await act(async () => {
    modeButton(bar, mode).click();
    await flush(5);
  });
}

/** نص مضيف الترجمة (بلا التسمية) وعناصره المحمية. */
export const bodyOf = (host: HTMLElement): HTMLElement => host.shadowRoot!.querySelector('.tr-body') as HTMLElement;
export const protectedIn = (host: HTMLElement): Array<{ tag: string; type: string | null; text: string; href: string | null; dir: string | null }> =>
  [...bodyOf(host).querySelectorAll<HTMLElement>('.prot')].map((el) => ({ tag: el.localName, type: el.getAttribute('data-type'), text: el.textContent ?? '', href: el.getAttribute('href'), dir: el.getAttribute('dir') }));

/** مضيف الترجمة التالي للعنصر الأصلي مباشرة (الفقرة) أو داخله (li وtd…). */
export function translationFor(selector: string): HTMLElement | null {
  const el = document.querySelector(selector) as Element;
  const inside = [...el.children].find((c) => c.localName === 'mijhar-host' && c.getAttribute('data-mijhar-host') === 'c.ui.translation');
  if (inside) return inside as HTMLElement;
  const wrapper = /^h[1-6]$/.test(el.localName) && el.parentElement?.matches('.markdown-heading') ? el.parentElement : el;
  const next = wrapper.nextElementSibling;
  return next?.localName === 'mijhar-host' && next.getAttribute('data-mijhar-host') === 'c.ui.translation' ? (next as HTMLElement) : null;
}

export const displayOf = (el: Element): string => (el as HTMLElement).style.getPropertyValue('display');
export const hiddenImportant = (el: Element): boolean => (el as HTMLElement).style.getPropertyValue('display') === 'none' && (el as HTMLElement).style.getPropertyPriority('display') === 'important';

/** نص الصفحة بلا محتوى مضيفات مِجهَر الداخلي (الظل لا يُسلسَل أصلًا): للمقارنة الحرفية بين حالتين. */
export const pageHtml = (): string => document.documentElement.outerHTML;
