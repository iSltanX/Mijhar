// الوحدة d.pr-status: بطاقة ملخص حالة طلب الدمج في صفحة محادثة PR (T-5.1)، ومعها تفسير موانع الدمج بالأدلة وشارة المصدر والتقادم
// وقراءة API العامة (T-5.2). تُدرج بعد ترويسة الطلب في جذر Shadow DOM عبر ctx.mutations فتُزال بإيقاف الوحدة، وتتجدد حين تتغير الصفحة.
//  - الشبكة: طلب واحد لكل التزام إلى github.com نفسه (جزء status-details الذي تطلبه الصفحة بنفسها) حين لا يعرض DOM صفوف الفحوص.
//    وapi.github.com لا يُطلب إلا بنقر صريح على «أكمل من GitHub API العامة» وبعد منح الصلاحية الاختيارية من الإعدادات، ومن الخلفية
//    وحدها (core/api)؛ وفشل أيٍّ منهما يُعلَن «غير متاح» بسببه ولا يُعرض نجاحًا.
//  - وقت آخر قراءة يتجدد بأول قراءة، وبتحديث حي (تغيّرت قيمة مقروءة بعد تعديل أجرته الصفحة)، وبإعادة القراءة الصريحة؛ ولا يتجدد بتعديلات
//    لا تغيّر شيئًا، فيظهر التقادم (PP-01) حين تسكت الصفحة.
//  - MJ18 (T-11.5): كل قراءة API مربوطة بالمستودع وفرع الرأس والتزامه ووقتها، ولا تُعرض على غير ما قُرئت له؛ ولكل جزء حالة وصوله بنصها،
//    وما لم يُقرأ «غير معروف». وفشل قراءة أحدث (حد أو رمز) لا يمحو آخر قراءة ناجحة لنفس الالتزام: تبقى بوقتها ويُعلن الفشل.
//  - MJ18 (T-11.1): قراءة المستودع الخاص خيار يحتاج ربطًا يظهر في لوحة API معلَّلًا (بوابة)، ويفتح موضع الرمز في الإعدادات ثم تعيد الخلفية
//    إلى هذا التبويب وتبلغه، فتُقرأ حالة الاتصال من جديد ويُركَّز زر القراءة دون إرسال طلب.
//  - MJ21 (T-11.7): «راجع تغييرات الطلب» في ذيل البطاقة: بلا مفتاح بوابة معلَّلة ولا نص تحليل؛ وبمفتاح موافقة ثم مراجعة مقترحة بأدلتها. السياق من
//    الطبقة المشتركة، وقراءة API تدخله بربطها بالمستودع والفرع والالتزام الظاهرة وحدها (AD-30)؛ ولا يُرسل شيء قبل «إرسال للتحليل».
import { mountSurface } from '../../../core/ui-host/surface';
import { extensionApi } from '../../../core/ui-host/browser-api';
import type { ExtEvent } from '../../../core/ui-host/browser-api';
import { OPEN_OPTIONS_MESSAGE } from '../../../core/ui-host/commands';
import type { OpenOptionsMessage } from '../../../core/ui-host/commands';
import { isConnectionsChanged, runtimeConnectionsPort } from '../../../core/connections/port';
import type { ConnectionsPort } from '../../../core/connections/port';
import type { Health } from '../../../core/connections/health';
import { GATE_CSS } from '../../../core/connections/ui/styles';
import { compareBinding } from '../status/binding';
import type { ReadBinding } from '../status/binding';
import { STATUS_CSS } from '../status/view';
import { createSettingsRegistry } from '../../../core/ui-host/units';
import { openSettings } from '../../../core/ui-host/settings-runtime';
import { runtimePort } from '../../../core/api/port';
import type { PublicApiPort, PublicApiStatus } from '../../../core/api/port';
import type { ExtensionModule, ModuleContext } from '../../../core';
import { readPrApi } from '../blockers/api-read';
import type { ApiPrData } from '../blockers/api-read';
import { explainBlockers, readDomEvidence } from '../blockers/explain';
import { collapsedInfo, freshnessAlerts, isLiveChange, readFacts } from '../blockers/freshness';
import { mergeApi } from '../blockers/merge';
import { BLOCKERS_CSS } from '../blockers/style';
import { ApiPanel, BlockersView, FreshnessBadge } from '../blockers/view';
import { PR_STATUS_MODULE_ID } from './ids';
import { PR_STATUS_SELECTORS, parseStatusDetails, readPrSummary } from './extract';
import type { FetchedChecks } from './extract';
import { STALE_MINUTES_DEFAULT, STALE_MINUTES_KEY, defineDStatusSettings, isStaleMinutes } from './settings';
import { D_CARD_CSS } from './style';
import { prepareContext } from '../../e/context';
import { SectionAnalysis, defaultAnalysisDeps } from '../analysis/controller';
import type { SectionAnalysisDeps } from '../analysis/controller';
import { ANALYSIS_CSS } from '../analysis/style';
import type { PrSummary } from './summary';
import { PrStatusCard } from './view';

export { PR_STATUS_MODULE_ID };

export type FetchDetails = (url: string, signal: AbortSignal) => Promise<string>;

export interface PrStatusOptions {
  /** يجلب HTML جزء status-details. الافتراضي fetch بنفس الأصل. */
  readonly fetchDetails?: FetchDetails;
  /** مهلة تجميع التعديلات قبل إعادة القراءة. الافتراضي 300ms. */
  readonly debounceMs?: number;
  /** عمر نتيجة جلب التزام قبل أن تُجلب من جديد عند إعادة تركيب الوحدة (تنقل أو إعادة رسم الصفحة). الافتراضي 30 ثانية. */
  readonly cacheMs?: number;
  readonly now?: () => number;
  /** منفذ طبقة API العامة. الافتراضي رسائل إلى الخلفية؛ وnull يخفي لوحة API. */
  readonly api?: PublicApiPort | null;
  /** عتبة التقادم بالمللي ثانية وقت كل رسم. الافتراضي من الإعدادات (PP-01، 5 دقائق). */
  readonly staleMs?: () => number;
  /** فاصل إعادة الرسم ليظهر تنبيه التقادم في وقته. الافتراضي 15 ثانية. */
  readonly tickMs?: number;
  /** يفتح صفحة الإعدادات (منح الصلاحية هناك لا في الصفحة). */
  readonly openSettings?: () => void;
  /** MJ18: سجل الاتصالات (حالة الرمز). الافتراضي رسائل إلى الخلفية؛ وnull بلا بوابة. */
  readonly connections?: ConnectionsPort | null;
  /** MJ18: يفتح موضع ربط الرمز في الإعدادات للعودة إلى هذه الميزة. */
  readonly openConnect?: () => void;
  /** MJ18: رسائل الخلفية إلى التبويب (إشعار العودة بعد الربط). الافتراضي runtime.onMessage. */
  readonly runtimeMessages?: ExtEvent<(message: unknown) => unknown> | null;
  /** MJ21: منافذ التحليل (للاختبار). الافتراضي رسائل الخلفية؛ وخارج الإضافة لا تحليل. */
  readonly analysis?: SectionAnalysisDeps;
}

/** نتيجة جلب لالتزام (مفتاحها رابط الجزء الحامل لـsha) تبقى صالحة عبر إعادات التركيب فلا يتكرر الطلب. */
type FetchCache = Map<string, { readonly at: number; readonly result: FetchedChecks & { readonly url: string } }>;

const GITHUB_ORIGIN = 'https://github.com';

/** fetch بنفس أصل الصفحة وحده: لا يخرج الطلب عن github.com ولا يحمل رمزًا. */
export const sameOriginFetch: FetchDetails = async (url, signal) => {
  const target = new URL(url, GITHUB_ORIGIN);
  if (target.origin !== GITHUB_ORIGIN) throw new Error('رابط خارج github.com');
  const response = await fetch(target.href, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'text/html' }, signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
};

function defaultPort(): PublicApiPort | null {
  try {
    return runtimePort(extensionApi().runtime);
  } catch {
    return null;
  }
}

function defaultOpenSettings(): void {
  try {
    void extensionApi().runtime.sendMessage({ type: OPEN_OPTIONS_MESSAGE });
  } catch {
    // خارج الإضافة (اختبار): لا شيء.
  }
}

function defaultConnections(): ConnectionsPort | null {
  try {
    return runtimeConnectionsPort(extensionApi().runtime);
  } catch {
    return null;
  }
}

/** موضع الرمز في الإعدادات مع معرّف الميزة من القائمة المغلقة، لا عنوان. */
function defaultOpenConnect(): void {
  try {
    void extensionApi().runtime.sendMessage({ type: OPEN_OPTIONS_MESSAGE, target: 'token', feature: 'd.pr-status.private' } satisfies OpenOptionsMessage);
  } catch {
    // خارج الإضافة (اختبار): لا شيء.
  }
}

function defaultRuntimeMessages(): ExtEvent<(message: unknown) => unknown> | null {
  try {
    return extensionApi().runtime.onMessage as unknown as ExtEvent<(message: unknown) => unknown>;
  } catch {
    return null;
  }
}

/** عتبة PP-01 من الإعدادات، تُقرأ كسولًا عند أول تركيب وتتبع تغيّرها؛ وحتى تُقرأ (أو إن تعذّر) فالقيمة الافتراضية. */
function settingsStaleMs(): () => number {
  let minutes = STALE_MINUTES_DEFAULT;
  let started = false;
  return () => {
    if (!started) {
      started = true;
      try {
        openSettings({ migrate: false, registry: createSettingsRegistry(defineDStatusSettings) }).then(
          ({ settings }) => {
            const read = (value: unknown): void => {
              if (isStaleMinutes(value)) minutes = value;
            };
            read(settings.get(STALE_MINUTES_KEY));
            settings.subscribe((change) => {
              if (change.key === STALE_MINUTES_KEY) read(change.value);
            });
          },
          () => {},
        );
      } catch {
        // لا تخزين للإضافة هنا: تبقى القيمة الافتراضية.
      }
    }
    return minutes * 60_000;
  };
}

export function createPrStatusModule(options: PrStatusOptions = {}): ExtensionModule {
  const fetchDetails = options.fetchDetails ?? sameOriginFetch;
  const debounceMs = options.debounceMs ?? 300;
  const cache: FetchCache = new Map();
  const cacheMs = options.cacheMs ?? 30_000;
  const now = options.now ?? (() => Date.now());
  const staleMs = options.staleMs ?? settingsStaleMs();
  let port: PublicApiPort | null | undefined = options.api;
  let connections: ConnectionsPort | null | undefined = options.connections;
  let messages: ExtEvent<(message: unknown) => unknown> | null | undefined = options.runtimeMessages;
  return {
    id: PR_STATUS_MODULE_ID,
    title: 'ملخص حالة طلب الدمج',
    pages: ['pr'],
    selectors: PR_STATUS_SELECTORS,
    mount(ctx) {
      if (port === undefined) port = defaultPort();
      if (connections === undefined) connections = defaultConnections();
      if (messages === undefined) messages = defaultRuntimeMessages();
      new PrStatusController(ctx, {
        fetchDetails,
        debounceMs,
        cache,
        cacheMs,
        now,
        staleMs,
        tickMs: options.tickMs ?? 15_000,
        api: port,
        openSettings: options.openSettings ?? defaultOpenSettings,
        connections,
        openConnect: options.openConnect ?? defaultOpenConnect,
        messages,
        analysis: options.analysis ?? defaultAnalysisDeps(),
      }).start();
    },
  };
}

interface ControllerDeps {
  readonly fetchDetails: FetchDetails;
  readonly debounceMs: number;
  readonly cache: FetchCache;
  readonly cacheMs: number;
  readonly now: () => number;
  readonly staleMs: () => number;
  readonly tickMs: number;
  readonly api: PublicApiPort | null;
  readonly openSettings: () => void;
  readonly connections: ConnectionsPort | null;
  readonly openConnect: () => void;
  readonly messages: ExtEvent<(message: unknown) => unknown> | null;
  readonly analysis: SectionAnalysisDeps;
}

type ReadReason = 'initial' | 'mutation' | 'fetched' | 'explicit' | 'tick' | 'api';

class PrStatusController {
  private surface: ReturnType<typeof mountSurface> | null = null;
  private fetched: (FetchedChecks & { readonly url: string }) | null = null;
  private pendingUrl: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private anchor: { parent: Node; before: Node | null } | null = null;
  private facts: Map<string, string> | null = null;
  private domReadAt: number;
  private liveUpdateAt: number | null = null;
  /** القراءة المعروضة: الأحدث، أو آخر قراءة ناجحة إن فشلت الأحدث. */
  private apiData: ApiPrData | null = null;
  /** القراءة الأحدث حين فشلت بعد قراءة ناجحة (تُعلن ولا تمحوها). */
  private apiAttempt: ApiPrData | null = null;
  private apiStatus: PublicApiStatus | null = null;
  private apiLoading = false;
  private tokenHealth: Health | null = null;
  private readonly analysisPart: SectionAnalysis;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly deps: ControllerDeps,
  ) {
    this.domReadAt = deps.now();
    // AD-30: القراءة الممرَّرة تُربط في الجامع بما تعرضه الصفحة وقت التحليل؛ ولغير الظاهر لا تدخل ويُعلن ذلك.
    this.analysisPart = new SectionAnalysis(ctx, 'pr', deps.analysis, () => prepareContext(ctx.document, ctx.selectors, ctx.page, { extras: { api: this.apiData } }), () => this.refresh('tick'));
  }

  start(): void {
    const { ctx } = this;
    this.analysisPart.start();
    this.refresh('initial');
    const root = ctx.page.contentRoot ?? ctx.document.body;
    ctx.observe(root, { childList: true, subtree: true, characterData: true }, (records) => {
      // تعديلات مضيفنا وحده لا تستدعي إعادة قراءة (وإلا دارت الدورة)؛ وتغيّر نص أو عقد غيره يستدعيها.
      const own = this.surface?.host;
      const foreign = records.some((r) => r.type === 'characterData' || [...r.addedNodes, ...r.removedNodes].some((n) => n !== own));
      if (foreign) this.schedule();
    });
    this.ticker = setInterval(() => this.refresh('tick'), this.deps.tickMs);
    ctx.onTeardown(() => {
      if (this.timer) clearTimeout(this.timer);
      if (this.ticker) clearInterval(this.ticker);
      this.timer = null;
      this.ticker = null;
    });
    if (this.deps.api) {
      this.deps.api.status().then(
        (status) => {
          if (ctx.signal.aborted) return;
          this.apiStatus = status;
          this.refresh('tick');
        },
        () => {},
      );
    }
    this.readConnections();
    // العودة بعد الربط (AC-11.1 ‏(٣)): تقرأ حالة الاتصال من جديد وتركّز زر القراءة؛ ولا طلب إلى API قبل نقر المستخدم.
    const messages = this.deps.messages;
    if (messages) {
      const listener = (message: unknown): undefined => {
        if (!isConnectionsChanged(message) || ctx.signal.aborted) return undefined;
        void this.reconnected();
        return undefined;
      };
      messages.addListener(listener);
      ctx.onTeardown(() => messages.removeListener(listener));
    }
  }

  private readConnections(): Promise<void> {
    const { connections } = this.deps;
    if (!connections) return Promise.resolve();
    return connections.status().then(
      (list) => {
        if (this.ctx.signal.aborted) return;
        this.tokenHealth = list.find((s) => s.id === 'github-token')?.health ?? null;
        this.refresh('tick');
      },
      () => {},
    );
  }

  private async reconnected(): Promise<void> {
    const status = await this.deps.api?.status().catch(() => null);
    if (this.ctx.signal.aborted) return;
    if (status) this.apiStatus = status;
    await this.readConnections();
    this.refresh('tick');
    this.surface?.shadow.querySelector<HTMLElement>('[data-action="api-read"], [data-action="open-settings"]')?.focus();
  }

  private schedule(): void {
    if (this.timer || this.ctx.signal.aborted) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.refresh('mutation');
    }, this.deps.debounceMs);
  }

  private place(): { parent: Node; before: Node | null } {
    const { ctx } = this;
    const header = ctx.selectors.resolve(ctx.document, 'd.pr.header')?.element;
    if (header?.parentNode) return { parent: header.parentNode, before: header.nextSibling };
    const parent = ctx.page.contentRoot ?? ctx.document.body;
    return { parent, before: parent.firstChild };
  }

  private refresh(reason: ReadReason): void {
    const { ctx } = this;
    if (ctx.signal.aborted) return;
    const read = (fetched: FetchedChecks | null) => readPrSummary(ctx.document, ctx.selectors, { fetched, pageNumber: ctx.page.number });
    const base = read(null);
    const url = base.checks.detailsUrl;
    // نتيجة التزام آخر لا تُعرض على الجديد: الرابط يحمل sha الالتزام.
    const fetched = url && this.fetched?.url === url ? this.fetched : null;
    const summary = fetched ? read(fetched) : base;
    this.track(reason, summary);
    this.draw(summary, Boolean(url && !fetched));
    if (url && !fetched && this.pendingUrl !== url) this.load(url);
  }

  /** يجدد وقت القراءة بحسب سببها، ويرصد التحديث الحي: قيمة مقروءة تغيّرت بعد تعديل أجرته الصفحة. */
  private track(reason: ReadReason, summary: PrSummary): void {
    const facts = readFacts(summary);
    const now = this.deps.now();
    if (reason === 'initial' || reason === 'explicit' || reason === 'fetched') {
      this.domReadAt = now;
      if (reason === 'explicit') this.liveUpdateAt = null;
    } else if (reason === 'mutation' && this.facts && isLiveChange(this.facts, facts)) {
      this.domReadAt = now;
      this.liveUpdateAt = now;
    }
    if (reason !== 'tick') this.facts = facts;
  }

  private draw(summary: PrSummary, loading: boolean): void {
    const { ctx, deps } = this;
    if (!this.surface) {
      const spot = (this.anchor = this.place());
      this.surface = mountSurface(ctx, { parent: spot.parent, before: spot.before, styles: D_CARD_CSS + BLOCKERS_CSS + STATUS_CSS + GATE_CSS + ANALYSIS_CSS, label: 'ملخص حالة طلب الدمج' });
    } else if (!this.surface.host.isConnected && this.anchor) {
      // أعادت الصفحة رسم حاويتها فأزالت المضيف: يُعاد إدراجه في موضعه الجديد.
      const spot = (this.anchor = this.place());
      ctx.mutations.insert(spot.parent, this.surface.host, spot.before);
    }
    // هوية القراءة في كل رسم (VR-03، T-11.5): قراءة API لمستودع أو فرع أو التزام غير الظاهر (ومنها رد متأخر بعد دفع التزام) لا تدخل الملخص
    // ولا الموانع، ويُعلن أنها لالتزام آخر.
    const page: ReadBinding = {
      repo: ctx.page.owner && ctx.page.repo ? `${ctx.page.owner}/${ctx.page.repo}` : null,
      branch: summary.head.available ? summary.head.value.branch : null,
      commit: summary.headSha,
      readAt: null,
    };
    const binding = this.apiData?.pull.available ? { read: this.apiData.binding, page, match: compareBinding(this.apiData.binding, page) } : null;
    const matched = Boolean(binding?.match.same);
    const api = matched ? this.apiData : null;
    const merged = mergeApi(summary, api);
    const report = explainBlockers(merged, readDomEvidence(ctx.document, ctx.selectors), api);
    const apiRead = Boolean(api?.pull.available);
    const alerts = freshnessAlerts(
      { now: deps.now(), domReadAt: this.domReadAt, apiReadAt: apiRead ? (api?.readAt ?? null) : null, liveUpdateAt: this.liveUpdateAt, staleMs: deps.staleMs() },
      collapsedInfo(merged, apiRead ? api : null),
    );
    const canApi = Boolean(deps.api && ctx.page.owner && ctx.page.repo && ctx.page.number !== null);
    this.surface.render(
      <PrStatusCard
        summary={merged}
        loading={loading}
        top={
          <FreshnessBadge
            sources={apiRead ? ['dom', 'api'] : ['dom']}
            authenticated={Boolean(apiRead && api?.authenticated)}
            domReadAt={this.domReadAt}
            apiReadAt={apiRead ? (api?.readAt ?? null) : null}
            alerts={alerts}
            onRefresh={() => this.explicitRefresh()}
            onApiRefresh={canApi && this.apiStatus?.granted ? () => this.readApi() : null}
          />
        }
        blockers={<BlockersView report={report} />}
        footer={
          <>
            {canApi ? (
              <ApiPanel
                status={this.apiStatus}
                loading={this.apiLoading}
                data={this.apiData}
                attempt={this.apiAttempt}
                binding={binding}
                tokenHealth={this.tokenHealth}
                onRead={() => this.readApi()}
                onOpenSettings={deps.openSettings}
                onConnect={deps.connections ? deps.openConnect : null}
              />
            ) : null}
            {this.analysisPart.view()}
          </>
        }
      />,
    );
  }

  /** إعادة قراءة صريحة: تُعاد قراءة الصفحة ويُجلب جزء status-details من جديد متجاوزًا الذاكرة. */
  private explicitRefresh(): void {
    if (this.fetched) this.deps.cache.delete(this.fetched.url);
    this.fetched = null;
    this.pendingUrl = null;
    this.refresh('explicit');
  }

  private readApi(): void {
    const { ctx, deps } = this;
    const { owner, repo, number } = ctx.page;
    if (!deps.api || !owner || !repo || number === null || this.apiLoading) return;
    const port = deps.api;
    this.apiLoading = true;
    this.refresh('tick');
    readPrApi(port, owner, repo, number, deps.now).then(
      async (data) => {
        if (ctx.signal.aborted) return;
        // BLK-RATELIMIT-AUTH: فشل أحدث لا يمحو آخر قراءة ناجحة؛ تبقى بوقتها ويُعلن الفشل. ولا تُعرض على التزام آخر (الربط في كل رسم).
        if (data.pull.available || !this.apiData?.pull.available) {
          this.apiData = data;
          this.apiAttempt = null;
        } else this.apiAttempt = data;
        this.apiLoading = false;
        this.apiStatus = await port.status().catch(() => this.apiStatus);
        await this.readConnections();
        this.refresh('api');
      },
      () => {
        if (ctx.signal.aborted) return;
        this.apiLoading = false;
        this.refresh('api');
      },
    );
  }

  private load(url: string): void {
    const { ctx, deps } = this;
    const hit = deps.cache.get(url);
    if (hit && deps.now() - hit.at < deps.cacheMs) {
      this.fetched = hit.result;
      this.refresh('fetched');
      return;
    }
    this.pendingUrl = url;
    const done = (result: FetchedChecks): void => {
      if (ctx.signal.aborted) return;
      this.fetched = { url, ...result };
      // الفشل لا يُحفظ: إعادة التركيب تعيد المحاولة، والنجاح يُحفظ فلا يتكرر الطلب.
      if (!result.error) deps.cache.set(url, { at: deps.now(), result: this.fetched });
      this.pendingUrl = null;
      this.refresh('fetched');
    };
    deps.fetchDetails(url, ctx.signal).then(
      (html) => done({ items: parseStatusDetails(new DOMParser().parseFromString(html, 'text/html')), error: null }),
      (error: unknown) => done({ items: [], error: error instanceof Error ? error.message : String(error) }),
    );
  }
}

export const PR_STATUS_MODULE: ExtensionModule = createPrStatusModule();
