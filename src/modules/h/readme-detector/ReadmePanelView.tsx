// «README العربي» في لوحة المجتمع: فحص docs/ عند الطلب للمستودع المفتوح. الفحص السطحي (شجرة الجذر وروابط README) يعمل في صفحة
// المستودع نفسها فيظهر شريطه هناك؛ واللوحة الأصلية لا ترى DOM الصفحة، فتتولى فحص docs/ الذي يحتاج صلاحية api.github.com الاختيارية.
import { useMemo, useRef } from 'preact/hooks';
import type { PanelViewProps } from '../../../sidepanel/views';
import { documentPageSource, extensionTabs, repoSlug, tabsPageSource, useActivePage } from '../../../shared/page';
import type { PageSource } from '../../../shared/page';
import { useStyles } from '../../../shared/ui/useStyles';
import { githubApiAccess } from '../api-access';
import type { GithubApiAccess } from '../api-access';
import { COMMUNITY_CSS, COMMUNITY_STYLE_ID } from '../styles';
import { DocsScanControl, SCOPE_STATEMENT } from './ReadmeBanner';

export interface ReadmePanelOptions {
  readonly source?: (surface: PanelViewProps['surface']) => PageSource | null;
  readonly access?: () => GithubApiAccess;
}

const defaultSource = (surface: PanelViewProps['surface']): PageSource | null => (surface === 'drawer' ? documentPageSource(document) : tabsPageSource(extensionTabs()));

export function createReadmePanelView(options: ReadmePanelOptions = {}) {
  return function ReadmePanelView({ surface }: PanelViewProps) {
    const root = useRef<HTMLDivElement>(null);
    useStyles(root, COMMUNITY_STYLE_ID, COMMUNITY_CSS);
    const source = useMemo(() => (options.source ?? defaultSource)(surface), [surface]);
    const access = useMemo(() => (options.access ?? (() => githubApiAccess()))(), []);
    const { page, ready } = useActivePage(source);
    const slug = page ? repoSlug(page) : null;
    return (
      <div class="community" ref={root} data-view="readme">
        <h3>README العربي</h3>
        <p class="muted small">{SCOPE_STATEMENT}</p>
        {!ready ? (
          <p class="muted" role="status">
            جارٍ قراءة الصفحة المفتوحة…
          </p>
        ) : page?.owner && page.repo ? (
          <div class="block" data-section="docs-scan">
            <p class="muted small">
              المستودع: <span class="ltr-inline mono">{slug}</span>. يظهر شريط الفحص السطحي في صفحة المستودع نفسها؛ وهنا فحص <span class="ltr-inline mono">docs/</span> عند طلبك.
            </p>
            <DocsScanControl owner={page.owner} repo={page.repo} access={access} />
          </div>
        ) : (
          <p class="empty" data-readme-empty="no-repo">
            افتح صفحة مستودع على GitHub لفحص مجلد docs/ فيه.
          </p>
        )}
      </div>
    );
  };
}

export const ReadmePanelView = createReadmePanelView();
