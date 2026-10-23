// الوحدة b.search: الطرف الذي يعيش في الصفحة من «أبرز الموضع» (T-3.4). تنتظر طلبًا (رسالة من اللوحة أو نداء الدرج) فتحدد عنصر المدخل
// بمطابقة بطاقة الشرح نفسها وتبرزه، وتبقى بلا أي أثر في الصفحة قبله: لا مراقب ولا مستمع ولا مضيف حتى يُطلب شيء.
import type { ExtensionModule, ModuleContext } from '../../../core';
import { extensionApi } from '../../../core/ui-host/browser-api';
import type { ExtensionApi } from '../../../core/ui-host/browser-api';
import type { GlossaryEntry } from '../../../data/glossary/types';
import { GLOSSARY_ENTRIES } from '../card/entries';
import { ACTIVE_LOCATOR, isLocateMessage } from './bridge';
import type { Locator } from './bridge';
import { Highlighter } from './highlight';
import type { HighlightOptions } from './highlight';
import { SEARCH_MODULE_ID } from './ids';
import { findEntry, locateEntry } from './locate';
import type { LocateResult } from './locate';

export { SEARCH_MODULE_ID };

export interface SearchModuleOptions {
  readonly entries?: readonly GlossaryEntry[];
  /** واجهات الإضافة لرسائل اللوحة. null: لا رسائل (اختبارات). الافتراضي سياق الإضافة الحالي إن وُجد. */
  readonly api?: ExtensionApi | null;
  readonly holdMs?: number;
  readonly rectOf?: HighlightOptions['rectOf'];
}

function tryApi(): ExtensionApi | null {
  try {
    return extensionApi();
  } catch {
    return null;
  }
}

export function createSearchModule(options: SearchModuleOptions = {}): ExtensionModule {
  return {
    id: SEARCH_MODULE_ID,
    title: 'البحث في القاموس وإبراز الموضع',
    pages: '*',
    mount(ctx) {
      new SearchController(ctx, options).start();
    },
  };
}

class SearchController implements Locator {
  private readonly highlighter: Highlighter;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly options: SearchModuleOptions,
  ) {
    this.highlighter = new Highlighter(ctx);
  }

  start(): void {
    const { ctx } = this;
    ACTIVE_LOCATOR.current = this;
    ctx.onTeardown(() => {
      if (ACTIVE_LOCATOR.current === this) ACTIVE_LOCATOR.current = null;
    });
    const api = this.options.api === undefined ? tryApi() : this.options.api;
    if (!api) return;
    const onMessage = (message: unknown, _sender: unknown, sendResponse: (response?: unknown) => void): undefined => {
      if (!isLocateMessage(message)) return undefined;
      if (message.action === 'clear') {
        this.clear();
        sendResponse({ status: 'cleared' });
      } else sendResponse(this.locate(message.entryId ?? ''));
      return undefined;
    };
    api.runtime.onMessage.addListener(onMessage);
    ctx.onTeardown(() => api.runtime.onMessage.removeListener(onMessage));
  }

  locate(entryId: string): LocateResult {
    const { ctx } = this;
    const entries = this.options.entries ?? GLOSSARY_ENTRIES;
    const entry = findEntry(entries, entryId);
    const { result, elements } = locateEntry(entry, ctx.document, ctx.page);
    if (result.status === 'found' && entry) {
      this.highlighter.show(elements, {
        label: `${entry.ar} (${entry.en})`,
        ...(this.options.holdMs !== undefined ? { holdMs: this.options.holdMs } : {}),
        ...(this.options.rectOf ? { rectOf: this.options.rectOf } : {}),
      });
    } else this.highlighter.clear();
    return result;
  }

  clear(): void {
    this.highlighter.clear();
  }
}

export const SEARCH_MODULE: ExtensionModule = createSearchModule();
