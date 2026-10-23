// واجهات الوحدات في تبويبات اللوحة (الأصلية والدرج). ملف مشترك بين المراحل (Docs/MJ/README.md «الملكية ومناطق
// التعارض»): تضيف كل مرحلة واجهة وحدتها سطرًا واحدًا في PANEL_VIEWS، فتُضم الأسطر بترتيب الدمج.
import type { FunctionComponent } from 'preact';
import type { SettingsStore } from '../core/settings';
import type { UnitId } from '../core/ui-host/units';
import { ExplainToggleView } from '../modules/b/card/panel-view';
import { NOTES_DRAWER_VIEW, NOTES_PANEL_VIEW } from '../modules/g/notes/view';
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
  NOTES_PANEL_VIEW, // MJ9 (T-8.1): ملاحظاتي (اللوحة الأصلية)
  NOTES_DRAWER_VIEW, // MJ9 (T-8.1): رسالة بديلة في الدرج (بلا حقول كتابة)
  ...COMMUNITY_PANEL_VIEWS, // MJ9 (T-9.1، T-9.3، T-9.4، T-9.5): المجتمع وأول مساهمة
];
