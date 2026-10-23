// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// تسجيل واجهات الوحدتين (ز) و(ح) في اللوحة: الأصلية تعرض الواجهات كلها، والدرج المحقون لا يعرض حقول كتابة (DEC-04) فتحل محلها رسائل.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { moduleEnabledKey } from '../../../src/core';
import { PanelApp } from '../../../src/sidepanel/PanelApp';
import { PANEL_VIEWS } from '../../../src/sidepanel/views';
import { connectCommunity } from '../../../src/modules/h';
import { connectNotes } from '../../../src/modules/g/notes';
import { memorySettings } from '../../core/ui-host/helpers';
import { memoryNotes } from '../g/notes/helpers';
import { flush } from './helpers';

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  container.className = 'mj-root';
  container.setAttribute('dir', 'rtl');
  document.body.append(container);
});
afterEach(() => {
  render(null, container);
  container.remove();
  connectNotes(null);
  connectCommunity(null);
});

const settle = async () => {
  for (let i = 0; i < 3; i += 1) await act(async () => void (await flush(12)));
};
const textFields = (root: ParentNode): Element[] =>
  [...root.querySelectorAll('input, textarea, select, [contenteditable]')].filter((el) => !(el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type)));
const select = async (id: string) => {
  const tab = container.querySelector<HTMLButtonElement>(`[role="tab"][id$="-tab-${id}"]`);
  if (!tab) throw new Error(`لا تبويب ${id}`);
  await act(async () => tab.click());
  await settle();
};

async function mountPanel(surface: 'native' | 'drawer') {
  const notes = await memoryNotes();
  connectNotes(async () => notes);
  connectCommunity(async () => ({ settings: notes.settings, store: notes.store }));
  const { settings } = await memorySettings(notes.area);
  await act(async () => render(<PanelApp surface={surface} settings={settings} />, container));
  await settle();
  return { settings };
}

describe('السجل', () => {
  it('الواجهات المسجَّلة بمعرّفات فريدة وتبويبات صحيحة', () => {
    const ids = PANEL_VIEWS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['g-notes', 'g-notes-drawer', 'h-readme', 'h-guide', 'h-discovery', 'h-discovery-drawer', 'h-resources', 'h-resources-drawer']));
    // السجل مشترك بين المراحل: يُقاس واجهات (ز) و(ح) وحدها، لا واجهات الوحدات الأخرى المدمجة معهما.
    for (const view of PANEL_VIEWS.filter((v) => v.unit === 'g' || v.unit === 'h')) {
      expect(view.tab).toBe(view.unit === 'g' ? 'notes' : 'community');
    }
  });

  it('كل واجهة فيها حقول كتابة مقصورة على اللوحة الأصلية، ولها بديل في الدرج', () => {
    const native = PANEL_VIEWS.filter((v) => v.surfaces?.length === 1 && v.surfaces[0] === 'native').map((v) => v.id);
    // السجل مشترك: تُقاس واجهات (ب) و(ز) و(ح) المعروفة هنا، والقاعدة (بديل في الدرج) على كل واجهة مقصورة على اللوحة الأصلية.
    // 'b-glossary-search' أضافته MJ10 (T-3.4): خانة بحث القاموس للوحة الأصلية وحدها، وبديلها في الدرج بيان.
    expect(native).toEqual(expect.arrayContaining(['b-glossary-search', 'g-notes', 'h-discovery', 'h-resources']));
    for (const id of native) expect(PANEL_VIEWS.some((v) => v.id.startsWith(id) && v.surfaces?.[0] === 'drawer')).toBe(true);
  });
});

describe('اللوحة الأصلية', () => {
  it('تبويب «ملاحظاتي» يعرض مساحة الملاحظات (بلا واجهة تبويبات في الاختبار: إرشاد فتح مستودع)', async () => {
    await mountPanel('native');
    await select('notes');
    expect(container.querySelector('[data-notes-view]')).not.toBeNull();
    expect(container.querySelector('[data-notes-empty="no-repo"]')).not.toBeNull();
    expect(container.querySelector('[data-native-only]')).toBeNull();
  });

  it('تبويب «المجتمع» يعرض الواجهات الأربع بترتيبها', async () => {
    await mountPanel('native');
    await select('community');
    expect([...container.querySelectorAll('[data-view]')].map((el) => el.getAttribute('data-view'))).toEqual(['readme', 'guide', 'discovery', 'resources']);
  });

  it('إيقاف الوحدة (ح) يحجب تبويبها برسالة، والوحدة (ز) كذلك لتبويبها', async () => {
    const { settings } = await mountPanel('native');
    await act(async () => {
      await settings.set(moduleEnabledKey('h'), false);
      await settings.set(moduleEnabledKey('g'), false);
      await flush(6);
    });
    await select('community');
    expect(container.textContent).toContain('الوحدة (ح) موقوفة');
    expect(container.querySelector('[data-view]')).toBeNull();
    await select('notes');
    expect(container.textContent).toContain('الوحدة (ز) موقوفة');
  });
});

describe('الدرج المحقون', () => {
  it('لا حقول كتابة في تبويبي الملاحظات والمجتمع، وبدلها رسائل تدل على اللوحة الأصلية', async () => {
    await mountPanel('drawer');
    await select('notes');
    expect(textFields(container)).toEqual([]);
    expect(container.querySelector('[data-native-only="ملاحظاتي"]')).not.toBeNull();
    await select('community');
    expect(textFields(container)).toEqual([]);
    expect(container.querySelector('[data-native-only="اكتشاف المحتوى العربي"]')).not.toBeNull();
    expect(container.querySelector('[data-native-only="موارد تعلّم عربية"]')).not.toBeNull();
    // ما لا حقول فيه يبقى: README العربي والمرشد.
    expect([...container.querySelectorAll('[data-view]')].map((el) => el.getAttribute('data-view'))).toEqual(['readme', 'guide']);
  });
});
