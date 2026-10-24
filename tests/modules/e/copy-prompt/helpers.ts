// أدوات اختبار «نسخ البرومبت» (T-11.3): تركيب الوحدة على عينة كما تركّبها الإضافة (الكاشف ومدير دورة الحياة)، وقراءة مضيفها وحالتها.
import { DEFAULT_SELECTORS, SelectorsRegistry } from '../../../../src/core';
import type { ExtensionModule } from '../../../../src/core';
import { COLLECTOR_SELECTORS, prepareContext } from '../../../../src/modules/e/context';
import type { ContextStructure } from '../../../../src/modules/e/context';
import { flush, hostsOf, mountModules } from '../../d/helpers';
import { loadFile, pageAt } from '../helpers';
import { SAMPLES } from '../context/samples';
import type { Sample } from '../context/samples';

export const COPY_HOST = 'e.copy-prompt';
export const NOW = Date.UTC(2026, 9, 24, 9, 30);

/** يحمّل العينة ويضع الموضع على مسارها (الأصل واحد) ثم يركّب الوحدات. */
export async function mountOn(sample: Sample, modules: readonly ExtensionModule[], prepare?: () => void) {
  loadFile(sample.file);
  prepare?.();
  window.history.replaceState(null, '', new URL(sample.href).pathname);
  return mountModules(modules);
}

export function view() {
  const host = () => hostsOf(COPY_HOST)[0] as HTMLElement | undefined;
  const root = () => host()?.shadowRoot as ShadowRoot;
  const q = <E extends Element = HTMLElement>(sel: string) => root()?.querySelector(sel) as E | null;
  const state = () => q('[data-copy-prompt]')?.getAttribute('data-state') ?? null;
  const label = () => (q('[data-label]')?.textContent ?? '').trim();
  const click = async (sel: string) => {
    const el = q<HTMLElement>(sel);
    if (!el) throw new Error(`لا عنصر: ${sel}`);
    el.click();
    await flush();
  };
  return { host, root, q, state, label, click };
}

/** البنية والبرومبت المتوقعان من الطبقة مباشرة على الصفحة الحالية (للمقارنة بما نُسخ). */
export function expectedContext(sample: Sample): ContextStructure | null {
  const selectors = new SelectorsRegistry([...DEFAULT_SELECTORS, ...COLLECTOR_SELECTORS]);
  return prepareContext(document, selectors, pageAt(sample.href), { secrets: 'mask', collectedAt: NOW });
}

export { SAMPLES, flush, hostsOf };
