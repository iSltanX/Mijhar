// أمر فتح اللوحة أو الدرج (commands)، والرسائل بين الخلفية وسكربت المحتوى.
//
// قيد قِيس في المتصفحات الأربعة (evidence/T-1.4): فتح اللوحة الأصلية لا يقبله المتصفح إلا داخل فعل المستخدم، وFirefox
// يرفضه بعد أي await داخل onCommand ("may only be called from a user input handler"). لذا openPanel متزامنة حتى
// أول استدعاء، ولا تقرأ تخزينًا غير متزامن قبله:
//  - عائلة Chromium: sidePanel.open أولًا؛ وتفضيل «الدرج» يُطبَّق مسبقًا بـsidePanel.setOptions({ enabled: false })
//    فيحفظه المتصفح نفسه ويرفض open، فيُفتح الدرج في رفضه. وكذلك إن غابت الواجهة أو فشلت.
//  - Firefox: صفحة الخلفية وثيقة لها localStorage متزامن، فيُقرأ منه انعكاس التفضيل (المصدر SettingsStore).
//    sidebarAction.toggle، وإن فشل فالدرج.
import type { ExtensionApi, TabLike } from './browser-api';
import { isSurface } from './units';
import type { Surface } from './units';

export const PANEL_COMMAND = 'toggle-panel';
/** اختصار افتراضي مؤقت؛ تحسم قيمته النهائية DEC-08 في T-10.2. يُكتب في المانيفست ويُختبر تطابقه. */
export const PANEL_SHORTCUT = 'Alt+G';

export const DRAWER_MESSAGE = 'mijhar:drawer';
export const OPEN_OPTIONS_MESSAGE = 'mijhar:open-options';
export const SURFACE_MIRROR_KEY = 'mijhar.ui.surface';

/**
 * مواضع في صفحة الإعدادات يفتحها الترحيب والإعدادات في اللوحة (AD-29): قسم الرمز، ودليله. قائمة مغلقة: الخلفية لا تفتح عنوانًا
 * تركّبه رسالة من سكربت المحتوى، بل أحد هذه المواضع أو صفحة الإعدادات نفسها.
 */
export const OPTIONS_TARGETS = ['token', 'guide/github-token'] as const;
export type OptionsTarget = (typeof OPTIONS_TARGETS)[number];

export interface OpenOptionsMessage {
  readonly type: typeof OPEN_OPTIONS_MESSAGE;
  readonly target?: OptionsTarget;
  /**
   * MJ18 (T-11.1): الميزة التي طلبت الربط، معرّفًا من القائمة المغلقة CONNECTED_FEATURES (src/core/connections/features.ts) لا عنوانًا؛
   * تحفظه الخلفية مع تبويب المرسل لتعيد إليه بعد الربط. وما ليس في القائمة يُهمل.
   */
  readonly feature?: string;
}

export const isOpenOptionsMessage = (message: unknown): message is OpenOptionsMessage =>
  typeof message === 'object' && message !== null && (message as OpenOptionsMessage).type === OPEN_OPTIONS_MESSAGE;

/** عنوان صفحة الإعدادات على الموضع، أو null لموضع خارج القائمة. */
export function optionsPageUrl(getURL: (path: string) => string, target: unknown): string | null {
  return typeof target === 'string' && (OPTIONS_TARGETS as readonly string[]).includes(target) ? getURL(`options.html#${target}`) : null;
}

export type DrawerAction = 'toggle' | 'open' | 'close';
export interface DrawerMessage {
  readonly type: typeof DRAWER_MESSAGE;
  readonly action: DrawerAction;
}

export const isDrawerMessage = (message: unknown): message is DrawerMessage =>
  typeof message === 'object' && message !== null && (message as DrawerMessage).type === DRAWER_MESSAGE && ['toggle', 'open', 'close'].includes((message as DrawerMessage).action);

export type PanelOutcome = 'native' | 'drawer' | 'unavailable';

export interface PanelCommandDeps {
  readonly api: ExtensionApi;
  readonly target: 'chromium' | 'firefox';
  /** تفضيل المكان مقروءًا متزامنًا (Firefox). undefined: غير معروف بعد، فيُعامل «الأصلية». */
  readonly surface?: () => Surface | undefined;
  /** يُستدعى بنتيجة كل أمر (للاختبار والتشخيص). */
  readonly onOutcome?: (outcome: PanelOutcome, detail?: string) => void;
}

/** يبدّل الدرج في التبويب. تبويب بلا سكربت محتوى (ليس صفحة GitHub) يعيد 'unavailable'. */
export async function toggleDrawer(api: ExtensionApi, tab: TabLike | undefined, action: DrawerAction = 'toggle'): Promise<PanelOutcome> {
  if (!api.tabs) return 'unavailable';
  let tabId = tab?.id;
  if (tabId === undefined) tabId = (await api.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
  if (tabId === undefined) return 'unavailable';
  try {
    await api.tabs.sendMessage(tabId, { type: DRAWER_MESSAGE, action } satisfies DrawerMessage);
    return 'drawer';
  } catch {
    return 'unavailable';
  }
}

/**
 * معالج الأمر. متزامن حتى أول استدعاء لواجهة المتصفح؛ لا تُضف await قبله. action: 'toggle' (أمر اللوحة) يبدّل الفتح والإغلاق، و'open' (أوامر الوحدات
 * مثل فتح القاموس) يفتح ولا يغلق ما هو مفتوح.
 */
export function openPanel(deps: PanelCommandDeps, tab: TabLike | undefined, action: Exclude<DrawerAction, 'close'> = 'toggle'): void {
  const { api, onOutcome = () => {} } = deps;
  const fallback = (reason: unknown): void => {
    void toggleDrawer(api, tab, action).then((outcome) => onOutcome(outcome, reason instanceof Error ? reason.message : String(reason ?? '')));
  };

  let opening: Promise<void> | undefined;
  try {
    if (deps.target === 'chromium') {
      if (api.sidePanel && tab?.windowId !== undefined) opening = api.sidePanel.open({ windowId: tab.windowId });
    } else if (deps.surface?.() !== 'drawer' && api.sidebarAction) {
      opening = action === 'toggle' && api.sidebarAction.toggle ? api.sidebarAction.toggle() : api.sidebarAction.open();
    }
  } catch (error) {
    fallback(error);
    return;
  }
  if (!opening) {
    fallback('drawer');
    return;
  }
  opening.then(() => onOutcome('native'), fallback);
}

/** يطبّق التفضيل حيث يُقرأ متزامنًا وقت الأمر. */
export async function applySurface(deps: Pick<PanelCommandDeps, 'api' | 'target'>, surface: Surface, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): Promise<void> {
  if (deps.target === 'chromium') {
    await deps.api.sidePanel?.setOptions({ enabled: surface === 'native' });
    return;
  }
  storage?.setItem(SURFACE_MIRROR_KEY, surface);
}

/** يقرأ انعكاس التفضيل في Firefox. */
export function readSurfaceMirror(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Surface | undefined {
  try {
    const value = storage?.getItem(SURFACE_MIRROR_KEY);
    return isSurface(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
