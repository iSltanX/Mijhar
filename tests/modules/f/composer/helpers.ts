// أدوات اختبار مساعد الكتابة (T-7.1): تحميل عينة المحررات، وتركيب الوحدة، وقراءة اللوحة والأزرار في مضيفات Shadow DOM.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'preact/test-utils';
import { LifecycleManager, ModuleRegistry, PageDetector } from '../../../../src/core';
import { createComposerModule } from '../../../../src/modules/f/composer';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const FIXTURE = path.join(ROOT, 'tests/modules/f/composer/fixtures/fixture-editors.html');

export function loadHtml(file: string = FIXTURE): void {
  const html = fs.readFileSync(file, 'utf8');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

export const flush = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface Live {
  readonly manager: LifecycleManager;
  readonly errors: unknown[];
}

export async function mountComposer(): Promise<Live> {
  const errors: unknown[] = [];
  const manager = new LifecycleManager({
    registry: new ModuleRegistry([createComposerModule({ debounceMs: 5 })]),
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
export const buttonHosts = (): HTMLElement[] => hosts('f.composer.button');
export const panelHost = (): HTMLElement | null => hosts('f.composer.panel')[0] ?? null;
export const panelRoot = (): ShadowRoot => panelHost()!.shadowRoot!;

export const field = (id: string): HTMLTextAreaElement => document.getElementById(id) as HTMLTextAreaElement;

/** زر المساعد الذي يخدم حقلًا: المضيف في شريط أدواته أو قبله مباشرة. */
export function triggerFor(id: string): HTMLButtonElement {
  const f = field(id);
  const toolbar = [...document.querySelectorAll('markdown-toolbar')].find((t) => t.getAttribute('for') === id);
  const host = (toolbar ? [...toolbar.children] : [f.previousElementSibling]).find((el) => el?.getAttribute('data-mijhar-host') === 'f.composer.button') as HTMLElement;
  return host.shadowRoot!.querySelector('button') as HTMLButtonElement;
}

export async function click(el: HTMLElement, wait = 5): Promise<void> {
  await act(async () => {
    el.click();
    await flush(wait);
  });
}

export async function openFor(id: string): Promise<void> {
  await click(triggerFor(id));
}

export const panelButton = (action: string): HTMLButtonElement => panelRoot().querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
export const panelField = (name: string): HTMLTextAreaElement => panelRoot().getElementById(`mj-composer-${name}`) as HTMLTextAreaElement;
export const preview = (): HTMLElement => panelRoot().querySelector<HTMLElement>('[data-preview]')!;
export const status = (): string => panelRoot().querySelector('.status')!.textContent!.replace(/\s+/g, ' ').trim();

export async function typeInto(el: HTMLTextAreaElement, value: string): Promise<void> {
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(5);
  });
}

export async function fill(values: Partial<Record<'expected' | 'actual' | 'steps' | 'environment' | 'evidence', string>>): Promise<void> {
  for (const [name, value] of Object.entries(values)) await typeInto(panelField(name), value);
}

export const pageHtml = (): string => document.documentElement.outerHTML;
