// أدوات اختبار المحرك والحارس على jsdom بـMutationObserver حقيقي (تنفيذ jsdom للمواصفة): عينة fixture-diacritics-live من T-0.1،
// ومحاكي كتابات GitHub في العقد النصية (تحديث، استبدال، فصل، نقل) كما في كائن GH داخل العينة، وتحويلان للاختبار.
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { TextTransformRegistry } from '../../../../src/modules/a/guard';
import type { TextTransform } from '../../../../src/modules/a/guard';
import { ROOT } from '../../../setup/paths';

export const DIACRITICS_FIXTURE = path.join(ROOT, 'fixtures/spikes/fixture-diacritics-live.html');

const DIACRITICS = /[ً-ٰٟ]/g;

/** إخفاء التشكيل كما في T-0.1 (تحويل اختبار؛ التنفيذ الفعلي في T-2.5 بعد DEC-02). */
export const stripDiacritics: TextTransform = { id: 'strip-diacritics', apply: (text) => text.replace(DIACRITICS, '') };

/** أرقام مشرقية (تحويل اختبار؛ التنفيذ الفعلي في T-2.6). */
export const easternDigits: TextTransform = { id: 'eastern-digits', apply: (text) => text.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)] as string) };

export const strip = (text: string): string => text.replace(DIACRITICS, '');

/** تسليم سجلات MutationObserver المعلّقة (تُسلَّم في مهمة صغرى بعد المهمة الجارية). */
export const deliver = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export function loadDiacritics(): JSDOM {
  return new JSDOM(fs.readFileSync(DIACRITICS_FIXTURE, 'utf8'), { url: 'https://github.com/octo/demo/issues/1' });
}

export interface GuardHarness {
  readonly dom: JSDOM;
  readonly doc: Document;
  readonly engine: TextTransformRegistry;
  /** العقدة النصية الأولى في فقرة التعليق id. */
  node(id: string): Text;
  /** نص فقرة التعليق id. */
  text(id: string): string;
  /** كل العقد النصية المشكولة داخل .markdown-body خارج الكود. */
  diacriticNodes(): Text[];
  readonly gh: {
    update(id: string, text: string): void;
    replace(id: string, text: string): Text;
    detach(id: string): void;
  };
}

export function guardHarness(transforms: readonly TextTransform[] = [stripDiacritics]): GuardHarness {
  const dom = loadDiacritics();
  const doc = dom.window.document;
  const engine = new TextTransformRegistry({ root: doc.body });
  for (const transform of transforms) engine.register(transform);
  const paragraph = (id: string): HTMLElement => doc.querySelector(`#${id} p`) as HTMLElement;
  const { NodeFilter } = dom.window;
  return {
    dom,
    doc,
    engine,
    node: (id) => paragraph(id).firstChild as Text,
    text: (id) => paragraph(id).textContent ?? '',
    diacriticNodes() {
      const nodes: Text[] = [];
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement?.closest('.markdown-body') && !n.parentElement.closest('code, pre, textarea, script, style') && /[ً-ٰٟ]/.test(n.nodeValue ?? '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
      });
      for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
      return nodes;
    },
    gh: {
      update(id, text) {
        (paragraph(id).firstChild as Text).nodeValue = text;
      },
      replace(id, text) {
        const fresh = doc.createTextNode(text);
        paragraph(id).replaceChildren(fresh);
        return fresh;
      },
      detach(id) {
        doc.getElementById(id)?.remove();
      },
    },
  };
}
