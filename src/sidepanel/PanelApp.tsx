// تطبيق اللوحة: التبويبات الخمسة من المستوى 3 (EXECUTION_PLAN.md ‏5). يُرسم كما هو في اللوحة الجانبية الأصلية وفي
// الدرج داخل الصفحة؛ ويستقبل واجهات الوحدات من PANEL_VIEWS ولا يعرف أيًّا منها بعينه.
// الترحيب (AD-29): ما دامت حالته 'pending' يُرسم مكان محتوى التبويب والتبويبات ظاهرة؛ واختيار أي تبويب أو طلب تبويب من خارج اللوحة
// (Alt+K) ينهيه كما ينهيه «ابدأ» و«تخطَّ»، فلا يحجب الترحيب أي قسم.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { SettingsStore } from '../core/settings';
import { moduleEnabledKey } from '../core/settings';
import { PANEL_REQUEST_KEY, UNITS, WELCOME_KEY, isFreshPanelRequest } from '../core/ui-host/units';
import type { PanelRequest, UnitId, WelcomeState } from '../core/ui-host/units';
import { Welcome } from '../shared/onboarding/Welcome';
import { Tabs } from '../shared/ui';
import type { TabItem } from '../shared/ui';
import { useSetting } from '../shared/ui/useSetting';
import { SettingsTab } from '../options/SettingsTab';
import type { SettingsTabProps } from '../options/SettingsTab';
import { PANEL_VIEWS } from './views';
import type { PanelSurface, PanelTabId, PanelView } from './views';

interface ContentTab extends TabItem {
  readonly id: PanelTabId;
  readonly units: readonly UnitId[];
  /** ما يظهر هنا حين تُبنى وحداته. */
  readonly empty: string;
}

export const CONTENT_TABS: readonly ContentTab[] = [
  { id: 'context', title: 'السياق والفحوص', short: 'السياق', units: ['d', 'e'], empty: 'حالة طلب الدمج والفحوص وحزمة السياق للصفحة المفتوحة.' },
  { id: 'glossary', title: 'القاموس والتعلّم', short: 'القاموس', units: ['b'], empty: 'شرح مصطلحات GitHub وأزراره، والجولات الإرشادية.' },
  { id: 'notes', title: 'ملاحظاتي وأكمل لاحقًا', short: 'ملاحظاتي', units: ['g'], empty: 'ملاحظاتك الخاصة على المستودعات وقائمة «أكمل لاحقًا».' },
  { id: 'community', title: 'المجتمع وأول مساهمة', short: 'المجتمع', units: ['h'], empty: 'README العربي ومرشد أول مساهمة والمحتوى العربي.' },
];
export const SETTINGS_TAB: TabItem = { id: 'settings', title: 'الإعدادات والخصوصية', short: 'الإعدادات' };

export interface PanelAppProps extends Omit<SettingsTabProps, 'surface'> {
  readonly surface: PanelSurface;
  readonly views?: readonly PanelView[];
  readonly initialTab?: PanelTabId | 'settings';
}

const letterOf = (unit: UnitId): string => UNITS.find((u) => u.id === unit)?.letter ?? unit;

function UnitGate({ settings, unit, children }: { settings: SettingsStore; unit: UnitId; children: ComponentChildren }) {
  const enabled = useSetting<boolean>(settings, moduleEnabledKey(unit));
  if (!enabled) return <p class="empty">الوحدة ({letterOf(unit)}) موقوفة. شغّلها من «الإعدادات والخصوصية».</p>;
  return <>{children}</>;
}

function ContentPanel({ tab, views, settings, surface }: { tab: ContentTab; views: readonly PanelView[]; settings: SettingsStore; surface: PanelSurface }) {
  const own = views.filter((v) => v.tab === tab.id && (v.surfaces ?? ['native', 'drawer']).includes(surface));
  if (!own.length) {
    return (
      <div class="empty" data-empty-tab={tab.id}>
        <p>
          <strong>لا شيء هنا بعد.</strong>
        </p>
        <p class="small">يظهر هنا: {tab.empty}</p>
      </div>
    );
  }
  return (
    <>
      {own.map((view) => {
        const View = view.component;
        return (
          <UnitGate key={view.id} settings={settings} unit={view.unit}>
            <View settings={settings} surface={surface} />
          </UnitGate>
        );
      })}
    </>
  );
}

export function PanelApp(props: PanelAppProps) {
  const { surface, settings, views = PANEL_VIEWS, initialTab = 'context', ...settingsProps } = props;
  const [selected, setSelected] = useState<string>(initialTab);
  const welcome = useSetting<WelcomeState>(settings, WELCOME_KEY) === 'pending';
  const finishWelcome = () => {
    settings.set(WELCOME_KEY, 'done').catch((error: unknown) => console.error('[mijhar] تعذّر حفظ حالة الترحيب', error));
  };
  const select = (id: string) => {
    if (welcome) finishWelcome();
    setSelected(id);
  };
  // طلب تبويب من خارج اللوحة (أمر فتح القاموس Alt+K): يُطبَّق مرة لكل طلب، سواء فُتحت اللوحة به أو كانت مفتوحة.
  const request = useSetting<PanelRequest | null>(settings, PANEL_REQUEST_KEY);
  const applied = useRef(0);
  useEffect(() => {
    if (!isFreshPanelRequest(request) || applied.current === request.at) return;
    applied.current = request.at;
    if (request.tab === SETTINGS_TAB.id || CONTENT_TABS.some((t) => t.id === request.tab)) select(request.tab);
  }, [request]);
  const tabs: TabItem[] = [...CONTENT_TABS, SETTINGS_TAB];
  const current = CONTENT_TABS.find((t) => t.id === selected);
  const heading = tabs.find((t) => t.id === selected)?.title;
  return (
    <div class="panel-app" data-surface={surface} {...(welcome ? { 'data-welcome': '' } : {})}>
      <Tabs idPrefix={`mj-${surface}`} label="أقسام مِجهَر" tabs={tabs} selected={selected} onSelect={select}>
        {welcome ? (
          <Welcome onDone={finishWelcome} {...(settingsProps.openOptionsAt ? { openOptions: settingsProps.openOptionsAt } : {})} />
        ) : (
          <>
            <h2 class="panel-title">{heading}</h2>
            {current ? (
              <ContentPanel tab={current} views={views} settings={settings} surface={surface} />
            ) : (
              <SettingsTab settings={settings} surface={surface} level={3} {...settingsProps} />
            )}
          </>
        )}
      </Tabs>
    </div>
  );
}
