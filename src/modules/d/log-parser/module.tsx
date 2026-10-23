// الوحدة d.log: شرح سجل الفحص بثلاث طبقات في صفحة مهمة Actions (T-5.3). تُدرج البطاقة قبل حاوية السجلات حين تعرض الصفحة خطوة
// فاشلة أو تنبيه فشل، وتبدأ بالتنبيهات الظاهرة وحدها (متاحة لكل زائر).
//  - الشبكة: لا طلب إلا بنقر صريح على «اقرأ سجل الخطوة الفاشلة»: طلب واحد بنفس الأصل لرابط data-log-url الذي تعرضه الصفحة نفسها،
//    بلا رمز ولا اتصال بـapi.github.com. لغير المسجَّل يحجبه GitHub (404، evidence/T-0.3) فلا يُعرض الزر ويُعلَن الحجب (BLK-GH-AUTH-LOGS).
//  - السجل الأكبر من الحد يُقتطع من أوله ويُعلَن ذلك.
import { mountSurface } from '../../../core/ui-host/surface';
import type { ExtensionModule, ModuleContext } from '../../../core';
import { LOG_MODULE_ID } from './ids';
import { JOB_PAGE_SELECTORS, isJobPath, readJobPage } from './job-page';
import type { JobPage, JobStep } from './job-page';
import { analyzeLog } from './parse';
import type { LogAnalysis } from './parse';
import { LOG_CSS } from './style';
import { LogAnalysisView } from './view';

export { LOG_MODULE_ID };

export interface FetchedLog {
  readonly text: string;
  /** سبب اقتطاع وقع في الجلب نفسه، أو null. */
  readonly truncated: string | null;
}

export type FetchLog = (url: string, signal: AbortSignal) => Promise<FetchedLog>;

export class LogHttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = 'LogHttpError';
  }
}

const GITHUB_ORIGIN = 'https://github.com';
const MAX_CHARS = 4_000_000;

/** يجلب سجل الخطوة بنفس الأصل وحده، ويقتطع ما زاد على الحد من أوله. */
export const fetchStepLog: FetchLog = async (url, signal) => {
  const target = new URL(url, GITHUB_ORIGIN);
  if (target.origin !== GITHUB_ORIGIN) throw new Error('رابط خارج github.com');
  const response = await fetch(target.href, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'text/plain' }, signal });
  if (!response.ok) throw new LogHttpError(response.status);
  const text = await response.text();
  if (text.length <= MAX_CHARS) return { text, truncated: null };
  const tail = text.slice(text.length - MAX_CHARS);
  return { text: tail.slice(tail.indexOf('\n') + 1), truncated: `السجل أكبر من ${(MAX_CHARS / 1_000_000).toFixed(0)} مليون حرف، فقُرئ آخره وحده` };
};

export interface LogModuleOptions {
  readonly fetchLog?: FetchLog;
  readonly debounceMs?: number;
}

export function createLogModule(options: LogModuleOptions = {}): ExtensionModule {
  const fetchLog = options.fetchLog ?? fetchStepLog;
  const debounceMs = options.debounceMs ?? 300;
  return {
    id: LOG_MODULE_ID,
    title: 'شرح سجل الفحص',
    pages: ['actions-run'],
    shouldMount: (page) => isJobPath(page.href),
    selectors: JOB_PAGE_SELECTORS,
    mount(ctx) {
      new LogController(ctx, fetchLog, debounceMs).start();
    },
  };
}

type Loaded = { readonly step: number; readonly ok: true; readonly log: FetchedLog } | { readonly step: number; readonly ok: false; readonly status: number | null; readonly message: string };

class LogController {
  private surface: ReturnType<typeof mountSurface> | null = null;
  private loaded: Loaded | null = null;
  private loading = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly fetchLog: FetchLog,
    private readonly debounceMs: number,
  ) {}

  start(): void {
    const { ctx } = this;
    this.refresh();
    ctx.observe(ctx.page.contentRoot ?? ctx.document.body, { childList: true, subtree: true }, (records) => {
      const own = this.surface?.host;
      if (records.some((r) => [...r.addedNodes, ...r.removedNodes].some((n) => n !== own && !own?.contains(n)))) this.schedule();
    });
    ctx.onTeardown(() => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
    });
  }

  private schedule(): void {
    if (this.timer || this.ctx.signal.aborted) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.refresh();
    }, this.debounceMs);
  }

  private refresh(): void {
    const { ctx } = this;
    if (ctx.signal.aborted) return;
    const page = readJobPage(ctx.document, ctx.selectors);
    const failed = page.failedSteps[0] ?? null;
    const failing = page.annotations.some((a) => a.level === 'failure');
    if (!failed && !failing) {
      // لا فشل تعرضه الصفحة: لا بطاقة (وإن وُجدت من قبل فتبقى معلنة ذلك بدل عرض تحليل قديم).
      if (this.surface) this.surface.render(<p class="d-note">لا خطوة فاشلة ولا تنبيه فشل في هذه الصفحة الآن.</p>);
      return;
    }
    if (!this.surface) {
      const logs = ctx.selectors.resolve(ctx.document, 'd.job.logs')?.element;
      const parent = logs?.parentNode ?? ctx.page.contentRoot ?? ctx.document.body;
      this.surface = mountSurface(ctx, { parent, before: logs ?? parent.firstChild, styles: LOG_CSS, label: 'شرح سجل الفحص' });
    }
    this.surface.render(this.view(page, failed));
  }

  private analysis(page: JobPage, failed: JobStep | null): LogAnalysis {
    const loaded = this.loaded && failed && this.loaded.step === failed.number ? this.loaded : null;
    if (loaded?.ok) return analyzeLog({ text: loaded.log.text, source: 'step-log', step: failed, annotations: page.annotations, truncatedBySource: loaded.log.truncated });
    return analyzeLog({ text: null, unavailableReason: this.unavailableReason(page, failed, loaded), source: 'annotations', step: failed, annotations: page.annotations });
  }

  private unavailableReason(page: JobPage, failed: JobStep | null, loaded: Loaded | null): string {
    if (loaded && !loaded.ok) {
      const blocked = loaded.status === 404 || loaded.status === 403;
      return blocked ? `حجبه GitHub (${loaded.message})؛ يتطلب تسجيل الدخول وصلاحية قراءة Actions` : `تعذّر جلبه (${loaded.message})`;
    }
    if (page.signInForLogs) return 'يحجبه GitHub عن غير المسجَّل («Sign in to view logs»)';
    if (!failed) return 'لا تعرض الصفحة خطوة فاشلة يُقرأ سجلها';
    if (!failed.logUrl) return 'لا تعرض الصفحة رابط سجل للخطوة الفاشلة';
    return 'لم يُقرأ بعد؛ اقرأه بالزر أدناه';
  }

  private view(page: JobPage, failed: JobStep | null) {
    const analysis = this.analysis(page, failed);
    const canRead = Boolean(failed?.logUrl) && !page.signInForLogs && !(this.loaded?.ok && this.loaded.step === failed?.number);
    const others = page.failedSteps.length - 1;
    return (
      <LogAnalysisView analysis={analysis}>
        <div class="d-actions">
          {canRead && (
            <button type="button" class="d-button" data-action="read-step-log" disabled={this.loading} onClick={() => this.load(failed)}>
              {this.loading ? 'جارٍ قراءة السجل…' : 'اقرأ سجل الخطوة الفاشلة من github.com'}
            </button>
          )}
          {others > 0 && <span class="d-note">وفي المهمة {others} خطوة فاشلة أخرى؛ يُشرح أولها.</span>}
        </div>
        <p class="d-note">الطبقة الثانية لا تُملأ إلا بنمط نصي حتمي، والثالثة اقتراحات للتحقق لا أحكام؛ ولا يقرأ مِجهَر السجل إلا بنقرك، بطلب واحد إلى github.com نفسه.</p>
      </LogAnalysisView>
    );
  }

  private load(step: JobStep | null): void {
    const { ctx } = this;
    if (!step?.logUrl || this.loading) return;
    this.loading = true;
    this.refresh();
    const done = (loaded: Loaded): void => {
      if (ctx.signal.aborted) return;
      this.loading = false;
      this.loaded = loaded;
      this.refresh();
    };
    this.fetchLog(step.logUrl, ctx.signal).then(
      (log) => done({ step: step.number, ok: true, log }),
      (error: unknown) => done({ step: step.number, ok: false, status: error instanceof LogHttpError ? error.status : null, message: error instanceof Error ? error.message : String(error) }),
    );
  }
}

export const LOG_MODULE: ExtensionModule = createLogModule();
