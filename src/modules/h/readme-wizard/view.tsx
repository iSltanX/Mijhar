// معالج README العربي في تبويب «المجتمع وأول مساهمة» من اللوحة الأصلية، للمستودع المفتوح في التبويب النشط. فيه حقول كتابة
// (الاستعلام والمسودة)، فهو للوحة الأصلية وحدها، وفي الدرج رسالة تدل عليه (DEC-04).
import { useMemo } from 'preact/hooks';
import type { PanelView, PanelViewProps } from '../../../sidepanel/views';
import { NativeOnlyNotice } from '../../../shared/ui/NativeOnlyNotice';
import { extensionTabs, tabsPageSource, useActivePage } from '../../../shared/page';
import type { PageSource } from '../../../shared/page';
import type { FetchText } from '../first-contribution/sources';
import { ReadmeWizard } from './Wizard';

export interface WizardViewOptions {
  readonly source?: () => PageSource | null;
  readonly fetchText?: FetchText;
}

export function createWizardView(options: WizardViewOptions = {}) {
  return function ReadmeWizardView(_props: PanelViewProps) {
    const source = useMemo(() => (options.source ?? (() => tabsPageSource(extensionTabs())))(), []);
    const { page, ready } = useActivePage(source);
    if (!ready) {
      return (
        <p class="muted" role="status">
          جارٍ قراءة الصفحة المفتوحة…
        </p>
      );
    }
    if (!page?.owner || !page.repo || page.type === 'external') {
      return (
        <p class="empty" data-wizard-empty="no-repo">
          افتح صفحة مستودع على GitHub لتقترح عليه README عربيًا بمسؤولية.
        </p>
      );
    }
    return <ReadmeWizard key={`${page.owner}/${page.repo}`} owner={page.owner} repo={page.repo} {...(options.fetchText ? { fetchText: options.fetchText } : {})} />;
  };
}

export const ReadmeWizardView = createWizardView();

const WizardDrawerNotice = () => <NativeOnlyNotice feature="اقتراح README عربي" />;

export const README_WIZARD_VIEWS: readonly PanelView[] = [
  { id: 'h-readme-wizard', tab: 'community', unit: 'h', title: 'اقتراح README عربي', surfaces: ['native'], component: ReadmeWizardView },
  { id: 'h-readme-wizard-drawer', tab: 'community', unit: 'h', title: 'اقتراح README عربي', surfaces: ['drawer'], component: WizardDrawerNotice },
];
