// ميزة «عزل الكود والمسارات والإشارات والروابط» (T-2.2، F-A2) داخل الوحدة (أ): تعمل فوق ميزة الاتجاه ولا تحتاجها، فتعزل في الكتل
// التي قلبتها وفي ما يعرضه GitHub rtl أصلًا. تراقب ما يضيفه GitHub والكتل التي تُقلب بعد التركيب (سمة data-mijhar-dir)، وكل أثرها
// (كتلة الأنماط والسمات وعناصر التغليف) يُزال بإيقافها عبر سجلها الخاص فتعود العقد النصية الأصلية نفسها.
import type { ModuleAFeature } from '../scope/feature';
import { DIR_ATTR } from '../direction/processor';
import { DIRECTION_SELECTORS } from '../direction/selectors';
import { ISOLATION_CSS, IsolationProcessor } from './processor';

export const ISOLATION_FEATURE_ID = 'isolation';

export const ISOLATION_FEATURE: ModuleAFeature = {
  id: ISOLATION_FEATURE_ID,
  title: 'عزل الكود والمسارات والإشارات والروابط',
  defaults: { enabled: true, scope: 'all', repos: [] },
  selectors: DIRECTION_SELECTORS,
  mount(ctx) {
    const processor = new IsolationProcessor(ctx);
    ctx.styles.set(ISOLATION_CSS);
    processor.scan(ctx.document);
    const body = ctx.document.body;
    if (body) {
      ctx.observe(body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: [DIR_ATTR] }, (records) => processor.update(records));
    }
  },
};
