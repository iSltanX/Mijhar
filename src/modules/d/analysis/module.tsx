// الوحدة d.analysis: التحليل في صفحة المشكلة (T-11.7، الإطار P-49): بطاقة «فهم المشكلة» بعد ترويسة المشكلة، فيها خيار التحليل أو بوابة ربطه، ولا
// شيء غيره. والتحليل في شرح سجل الفحص وبطاقة طلب الدمج داخل قسميهما (الوحدة d.log وd.pr-status) بالمتحكم نفسه. لا طلب شبكة هنا: السياق من
// الطبقة المشتركة محليًا، والطلب عبر الخلفية بعد الموافقة وحدها.
import type { ExtensionModule, ModuleContext } from '../../../core';
import { mountSurface } from '../../../core/ui-host/surface';
import { COLLECTOR_SELECTORS, prepareContext } from '../../e/context';
import { SectionAnalysis, defaultAnalysisDeps } from './controller';
import type { SectionAnalysisDeps } from './controller';
import { ANALYSIS_CSS } from './style';

export const ANALYSIS_MODULE_ID = 'd.analysis';

const ANCHOR = {
  key: 'd.analysis.anchor',
  description: 'ترويسة صفحة المشكلة؛ تُدرج بطاقة «فهم المشكلة» بعدها',
  candidates: ['[data-testid="issue-header"]', '[data-component="PageHeader"]', '#partial-discussion-header', '.gh-header'],
};

export function createAnalysisModule(deps?: SectionAnalysisDeps): ExtensionModule {
  return {
    id: ANALYSIS_MODULE_ID,
    title: 'التحليل في صفحة المشكلة',
    pages: ['issue'],
    selectors: [...COLLECTOR_SELECTORS, ANCHOR],
    mount(ctx) {
      new IssueAnalysis(ctx, deps ?? defaultAnalysisDeps()).start();
    },
  };
}

class IssueAnalysis {
  private surface: ReturnType<typeof mountSurface> | null = null;
  private readonly analysis: SectionAnalysis;

  constructor(
    private readonly ctx: ModuleContext,
    deps: SectionAnalysisDeps,
  ) {
    this.analysis = new SectionAnalysis(ctx, 'issue', deps, ({ limits }) => prepareContext(ctx.document, ctx.selectors, ctx.page, { limits }), () => this.draw());
  }

  start(): void {
    this.analysis.start();
    this.draw();
  }

  private draw(): void {
    const { ctx } = this;
    const view = this.analysis.view();
    if (view === null) return;
    if (!this.surface) {
      const header = ctx.selectors.resolve(ctx.document, 'd.analysis.anchor')?.element;
      const parent = header?.parentNode ?? ctx.page.contentRoot ?? ctx.document.body;
      this.surface = mountSurface(ctx, { parent, before: header ? header.nextSibling : parent.firstChild, styles: ANALYSIS_CSS, label: 'فهم المشكلة' });
    }
    this.surface.render(
      <section class="an-card" data-card="issue-analysis" aria-labelledby="mj-issue-analysis-title">
        <h3 id="mj-issue-analysis-title" class="an-card-title">
          فهم المشكلة
        </h3>
        {view}
      </section>,
    );
  }
}

export const ANALYSIS_MODULE: ExtensionModule = createAnalysisModule();
