// واجهات الوحدات في تبويبات اللوحة (الأصلية والدرج). ملف مشترك بين المراحل (Docs/MJ/README.md «الملكية ومناطق
// التعارض»): تضيف كل مرحلة واجهة وحدتها سطرًا واحدًا في PANEL_VIEWS، فتُضم الأسطر بترتيب الدمج.
import type { FunctionComponent } from 'preact';
import type { SettingsStore } from '../core/settings';
import type { UnitId } from '../core/ui-host/units';
import { ExplainToggleView } from '../modules/b/card/panel-view';
import { GlossarySearchDrawerNotice, GlossarySearchView } from '../modules/b/search/view';
import { LATER_PANEL_VIEWS } from '../modules/g/bookmarks/view';
import { EXPORT_DRAWER_VIEW, EXPORT_PANEL_VIEW } from '../modules/g/export/view';
import { NOTES_DRAWER_VIEW, NOTES_PANEL_VIEW } from '../modules/g/notes/view';
import { README_WIZARD_VIEWS } from '../modules/h/readme-wizard/view';
import { COMMUNITY_PANEL_VIEWS } from '../modules/h/views';

/** التبويبات الأربعة الأولى من المستوى 3 (EXECUTION_PLAN.md ‏5)؛ الخامس «الإعدادات والخصوصية» يملكه المضيف. */
export type PanelTabId = 'context' | 'glossary' | 'notes' | 'community';
export type PanelSurface = 'native' | 'drawer';

export interface PanelViewProps {
  readonly settings: SettingsStore;
  readonly surface: PanelSurface;
}

export interface PanelView {
  readonly id: string;
  readonly tab: PanelTabId;
  readonly unit: UnitId;
  readonly title: string;
  /** أين تظهر. الافتراضي الاثنان. */
  readonly surfaces?: readonly PanelSurface[];
  readonly component: FunctionComponent<PanelViewProps>;
}

// سطر واحد لكل واجهة، تضيفه مرحلتها.
export const PANEL_VIEWS: readonly PanelView[] = [
  { id: 'b-explain-mode', tab: 'glossary', unit: 'b', title: 'وضع الشرح', component: ExplainToggleView }, // MJ8 (T-3.2)
  { id: 'b-glossary-search', tab: 'glossary', unit: 'b', title: 'البحث في القاموس', surfaces: ['native'], component: GlossarySearchView }, // MJ10 (T-3.4): اللوحة الأصلية (فيها حقل بحث)
  { id: 'b-glossary-search-drawer', tab: 'glossary', unit: 'b', title: 'البحث في القاموس', surfaces: ['drawer'], component: GlossarySearchDrawerNotice }, // MJ10 (T-3.4): الدرج بلا حقول إدخال (DEC-04)
  NOTES_PANEL_VIEW, // MJ9 (T-8.1): ملاحظاتي (اللوحة الأصلية)
  NOTES_DRAWER_VIEW, // MJ9 (T-8.1): رسالة بديلة في الدرج (بلا حقول كتابة)
  ...COMMUNITY_PANEL_VIEWS, // MJ9 (T-9.1، T-9.3، T-9.4، T-9.5): المجتمع وأول مساهمة
  ...LATER_PANEL_VIEWS, // MJ12 (T-8.2): ملاحظاتي وأكمل لاحقًا (البحث والتصفية والفرز)
  EXPORT_PANEL_VIEW, // MJ13 (T-8.4): التصدير والاستيراد والاستعادة والحذف (اللوحة الأصلية)
  EXPORT_DRAWER_VIEW, // MJ13 (T-8.4): تنبيه الجهاز المشترك في الدرج (بلا حقول إدخال)
  ...README_WIZARD_VIEWS, // MJ12 (T-9.2): معالج اقتراح README عربي
];
