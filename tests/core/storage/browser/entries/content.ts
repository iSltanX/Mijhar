// سكربت محتوى اختباري على صفحة github.com المعترَضة (عينة من fixtures/pages): يشغّل PageDetector وLifecycleManager
// وSettingsStore الحقيقية في سياق سكربت محتوى فعلي، بوحدة وهمية تحقن عنصرًا مرئيًا في DOM، ليلاحظه Playwright.
import {
  LifecycleManager,
  ModuleRegistry,
  PageDetector,
  SettingsRegistry,
  SettingsStore,
  Store,
  bindModuleToggles,
  extensionStorage,
} from '../../../../../src/core';
import type { ExtensionModule } from '../../../../../src/core';

const marker: ExtensionModule = {
  id: 'a',
  title: 'وحدة اختبارية',
  pages: '*',
  mount(ctx) {
    const badge = ctx.document.createElement('div');
    badge.setAttribute('data-mijhar-injected', 'a');
    badge.textContent = 'حقن الوحدة a';
    ctx.mutations.insert(ctx.document.body, badge);
    ctx.mutations.setAttribute(ctx.document.body, 'data-mijhar-a', 'on');
  },
};

async function main(): Promise<void> {
  const toggles = new SettingsRegistry();
  toggles.defineModuleToggle('a', true);
  toggles.defineModuleToggle('b', false);
  const { area, changes } = extensionStorage();
  // سياق المحتوى لا يرحّل: يتولى الترحيل سياق الإضافة (الخلفية أو صفحة الإضافة).
  const store = await Store.open({ area, changes, migrate: false });
  const settings = await SettingsStore.open(store, toggles);
  const manager = new LifecycleManager({
    registry: new ModuleRegistry([marker]),
    detector: new PageDetector({ document }),
    isEnabled: (id) => settings.isModuleEnabled(id),
    onError: (event) => document.documentElement.setAttribute('data-mj-error', `${event.moduleId}:${event.phase}`),
    // ما يراه سكربت المحتوى يُنشر في DOM ليقرأه Playwright (العالم المعزول لا يُرى من الصفحة).
    onReconcile: (result) => {
      document.documentElement.setAttribute('data-mj-page', `${result.page.type}:${result.page.confidence}`);
      const count = Number(document.documentElement.getAttribute('data-mj-reconciles') ?? '0') + 1;
      document.documentElement.setAttribute('data-mj-reconciles', String(count));
    },
  });
  manager.start();
  bindModuleToggles(settings, manager);
  document.documentElement.setAttribute('data-mj-content', 'ready');
}

void main();
