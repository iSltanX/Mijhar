// «تجهيز تعديل» في تبويب «السياق والفحوص» من اللوحة الأصلية، للمستودع المفتوح في التبويب النشط (T-11.8). فيه حقول ومعاينة وموافقات، فهو للوحة
// الأصلية وحدها (صفحة إضافة لا تبلغها سكربتات صفحة GitHub)، وفي الدرج المحقون رسالة تدل عليه ولا تعرض شيئًا منه (DEC-04، AD-27).
import { useMemo, useState } from 'preact/hooks';
import { runtimePort } from '../../../core/api/port';
import { extensionApi } from '../../../core/ui-host/browser-api';
import { OPEN_OPTIONS_MESSAGE } from '../../../core/ui-host/commands';
import type { OpenOptionsMessage } from '../../../core/ui-host/commands';
import type { PanelView, PanelViewProps } from '../../../sidepanel/views';
import { extensionTabs, tabsPageSource, useActivePage } from '../../../shared/page';
import type { PageSource } from '../../../shared/page';
import { NativeOnlyNotice } from '../../../shared/ui/NativeOnlyNotice';
import { ExecutionPath } from './ExecutionPath';
import type { ExecutionDeps, PathPage } from './ExecutionPath';
import { runtimeExecutionPort } from './port';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** منافذ الإضافة الافتراضية؛ خارجها null فلا يظهر المسار. */
export function defaultExecutionDeps(): ExecutionDeps | null {
  try {
    const { runtime } = extensionApi();
    return {
      api: runtimePort(runtime),
      exec: runtimeExecutionPort(runtime),
      copy: copyText,
      openSettings: () => {
        void runtime.sendMessage({ type: OPEN_OPTIONS_MESSAGE, feature: 'f.execution.write' } satisfies OpenOptionsMessage).catch(() => undefined);
      },
    };
  } catch {
    return null;
  }
}

export interface ExecutionViewOptions {
  readonly source?: () => PageSource | null;
  readonly deps?: () => ExecutionDeps | null;
}

export function createExecutionView(options: ExecutionViewOptions = {}) {
  return function ExecutionView(_props: PanelViewProps) {
    const source = useMemo(() => (options.source ?? (() => tabsPageSource(extensionTabs())))(), []);
    const deps = useMemo(() => (options.deps ?? defaultExecutionDeps)(), []);
    const { page, ready } = useActivePage(source);
    // تعديل بدأ يبقى على مستودعه وصفحته وإن تغيّر التبويب النشط (فتح الإعدادات لإضافة الصلاحية مثلًا)، حتى يُلغى أو يُبدأ غيره.
    const [held, setHeld] = useState<PathPage | null>(null);
    if (!deps) return null;
    const current: PathPage | null =
      page?.owner && page.repo && page.type !== 'external' ? { owner: page.owner, repo: page.repo, type: page.type, path: page.path, ref: page.ref, refKind: page.refKind, number: page.number } : null;
    const shown = held ?? current;
    if (shown) {
      const key = `${shown.owner}/${shown.repo}/${shown.type}/${shown.path ?? ''}/${shown.number ?? ''}`;
      return (
        <>
          {held && (!current || current.owner !== held.owner || current.repo !== held.repo) && (
            <p class="muted small" data-exec-held="">
              تعديل جارٍ على {held.owner}/{held.repo}؛ التبويب النشط صفحة أخرى.
            </p>
          )}
          <ExecutionPath key={key} page={shown} deps={deps} onActive={(active) => setHeld(active ? shown : null)} />
        </>
      );
    }
    if (!ready) {
      return (
        <p class="muted" role="status">
          جارٍ قراءة الصفحة المفتوحة…
        </p>
      );
    }
    return (
      <p class="empty" data-exec-empty="no-repo">
        افتح صفحة مستودع على GitHub (ملفًا أو مشكلة أو المستودع نفسه) لتجهّز تعديل ملف نصي واحد فيه.
      </p>
    );
  };
}

export const ExecutionView = createExecutionView();

const ExecutionDrawerNotice = () => <NativeOnlyNotice feature="تجهيز تعديل" extra="ومعاينة الفرق والموافقة على النطاق وصلاحية الكتابة كلها في اللوحة الأصلية وحدها، لا في الصفحة." />;

export const EXECUTION_PANEL_VIEWS: readonly PanelView[] = [
  { id: 'f-execution', tab: 'context', unit: 'f', title: 'تجهيز تعديل', surfaces: ['native'], component: ExecutionView },
  { id: 'f-execution-drawer', tab: 'context', unit: 'f', title: 'تجهيز تعديل', surfaces: ['drawer'], component: ExecutionDrawerNotice },
];
