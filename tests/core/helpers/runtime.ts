// تركيب سريع للكاشف ومدير دورة الحياة على عينة، مع جمع الأخطاء وتقارير الاستعادة.
import type { JSDOM } from 'jsdom';
import { LifecycleManager, ModuleRegistry, PageDetector } from '../../../src/core';
import type { ExtensionModule, LifecycleError, ReconcileResult, RestoreReport } from '../../../src/core';

export interface Harness {
  detector: PageDetector;
  registry: ModuleRegistry;
  manager: LifecycleManager;
  enabled: Set<string>;
  errors: LifecycleError[];
  reports: RestoreReport[];
  reconciles: ReconcileResult[];
}

export function createHarness(dom: JSDOM, modules: readonly ExtensionModule[], enabled: Iterable<string> = modules.map((m) => m.id)): Harness {
  const enabledSet = new Set(enabled);
  const errors: LifecycleError[] = [];
  const reports: RestoreReport[] = [];
  const reconciles: ReconcileResult[] = [];
  const registry = new ModuleRegistry(modules);
  const detector = new PageDetector({ document: dom.window.document, settleMs: 5 });
  const manager = new LifecycleManager({
    registry,
    detector,
    document: dom.window.document,
    isEnabled: (id) => enabledSet.has(id),
    onError: (event) => errors.push(event),
    onRestore: (report) => reports.push(report),
    onReconcile: (result) => reconciles.push(result),
  });
  return { detector, registry, manager, enabled: enabledSet, errors, reports, reconciles };
}

export const snapshot = (dom: JSDOM): string => dom.window.document.documentElement.outerHTML;
