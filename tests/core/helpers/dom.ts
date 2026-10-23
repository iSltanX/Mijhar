// أدوات اختبار طبقات النواة على jsdom: تحميل عينات fixtures/pages، ومحاكي تنقل Turbo، ودفتر مستمعات.
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { ROOT } from '../../setup/paths';

export const fixtureHtml = (name: string): string => fs.readFileSync(path.join(ROOT, 'fixtures/pages', `${name}.html`), 'utf8');

export function loadPage(fixture: string, url: string): JSDOM {
  return new JSDOM(fixtureHtml(fixture), { url, pretendToBeVisual: true });
}

/**
 * يحاكي تنقل Turbo: يدفع المسار إلى التاريخ، ويستبدل عنصر body ومحتوى head بما في العينة الجديدة،
 * ثم يطلق turbo:before-render وturbo:render وturbo:load على document بهذا الترتيب كما يفعل Turbo.
 */
export function turboNavigate(dom: JSDOM, fixture: string, url: string): void {
  const { window } = dom;
  const doc = window.document;
  const next = new window.DOMParser().parseFromString(fixtureHtml(fixture), 'text/html');
  window.history.pushState({}, '', url);
  doc.dispatchEvent(new window.CustomEvent('turbo:before-render'));
  doc.title = next.title;
  doc.documentElement.replaceChild(doc.adoptNode(next.body), doc.body);
  doc.dispatchEvent(new window.CustomEvent('turbo:render'));
  doc.dispatchEvent(new window.CustomEvent('turbo:load'));
}

/** دفتر مستمعات الأحداث الصافي على نافذة jsdom: كل add يقابله remove وإلا تراكم. */
export class ListenerLedger {
  private readonly live = new Map<EventTarget, Map<string, Set<unknown>>>();

  constructor(window: JSDOM['window']) {
    const proto = window.EventTarget.prototype;
    const originalAdd = proto.addEventListener;
    const originalRemove = proto.removeEventListener;
    const ledger = this;
    proto.addEventListener = function patched(this: EventTarget, type: string, listener: any, options?: any) {
      ledger.add(this, type, listener, options);
      return originalAdd.call(this, type, listener, options);
    };
    proto.removeEventListener = function patched(this: EventTarget, type: string, listener: any, options?: any) {
      ledger.remove(this, type, listener, options);
      return originalRemove.call(this, type, listener, options);
    };
  }

  private key(type: string, options?: any): string {
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
    return `${type}|${capture}`;
  }

  private add(target: EventTarget, type: string, listener: unknown, options?: any): void {
    if (!listener) return;
    const byType = this.live.get(target) ?? new Map<string, Set<unknown>>();
    const key = this.key(type, options);
    const set = byType.get(key) ?? new Set<unknown>();
    set.add(listener);
    byType.set(key, set);
    this.live.set(target, byType);
  }

  private remove(target: EventTarget, type: string, listener: unknown, options?: any): void {
    this.live.get(target)?.get(this.key(type, options))?.delete(listener);
  }

  /** عدد المستمعات الحية الآن على الأهداف التي ما زالت مرتبطة بالمستند أو هي المستند/النافذة نفسها. */
  net(): number {
    let total = 0;
    for (const [target, byType] of this.live) {
      const node = target as Partial<Node>;
      const connected = node.nodeType === undefined || node.isConnected !== false;
      if (!connected) continue;
      for (const set of byType.values()) total += set.size;
    }
    return total;
  }
}
