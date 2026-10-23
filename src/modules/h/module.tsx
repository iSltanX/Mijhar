// الوحدة (ح) في الصفحة: شريط README العربي في صفحة المستودع، وبطاقة «محتوى عربي / بيانات يعلنها صاحب الحساب» في صفحة الملف
// الشخصي. كلاهما يقرأ ما تعرضه الصفحة محليًا ولا يصدر طلبًا؛ وصفحة تُرسم متأخرة تُعاد قراءتها بمراقبة التعديلات حتى تستقر.
import type { ComponentChildren } from 'preact';
import type { ExtensionModule, ModuleContext } from '../../core/registry';
import { mountSurface } from '../../core/ui-host/surface';
import type { UiSurface } from '../../core/ui-host/surface';
import { useSetting } from '../../shared/ui/useSetting';
import { githubApiAccess } from './api-access';
import type { GithubApiAccess } from './api-access';
import { communityContext } from './context';
import type { CommunityContext } from './context';
import { PROFILE_SELECTORS, buildAccountView, readAccount, readPinnedProjects } from './discovery';
import { ProfileCard } from './discovery/ProfileCard';
import { README_SELECTORS, ReadmeBanner, detectArabicReadme, extractReadmeScan } from './readme-detector';
import type { ReadmeDetection } from './readme-detector';
import { COMMUNITY_PROFILE_CARD_KEY, COMMUNITY_README_BANNER_KEY } from './settings';

export const MODULE_H_ID = 'h';
export const COMMUNITY_PAGES = ['repo', 'profile'] as const;

export interface ModuleHOptions {
  readonly context?: () => Promise<CommunityContext>;
  readonly access?: () => GithubApiAccess;
  /** مهلة الانتظار قبل عرض «تعذّرت القراءة» لصفحة لم تكتمل. الافتراضي 4000. */
  readonly settleMs?: number;
  readonly onError?: (error: unknown) => void;
}

const OBSERVE_DEBOUNCE_MS = 150;

abstract class PageRuntime<T> {
  protected surface: UiSurface | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private giveUp = false;
  private last = '';
  protected context: CommunityContext | null = null;

  constructor(
    protected readonly ctx: ModuleContext,
    protected readonly options: ModuleHOptions,
  ) {}

  /** يقرأ الصفحة؛ null: لم تكتمل بعد (يُعاد لاحقًا). */
  protected abstract read(): T | null;
  protected abstract place(): void;
  protected abstract render(value: T): void;

  start(): void {
    (this.options.context ?? communityContext)().then(
      (context) => {
        if (this.ctx.signal.aborted) return;
        this.context = context;
        this.begin();
      },
      (error: unknown) => this.fail(error),
    );
  }

  private begin(): void {
    const { ctx } = this;
    const deadline = setTimeout(() => {
      this.giveUp = true;
      this.scan();
    }, this.options.settleMs ?? 4000);
    ctx.observe(ctx.document.body, { childList: true, subtree: true }, () => this.schedule());
    ctx.onTeardown(() => {
      clearTimeout(deadline);
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
    });
    this.scan();
  }

  private schedule(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.scan();
    }, OBSERVE_DEBOUNCE_MS);
  }

  protected abstract settled(value: T | null): value is T;

  private scan(): void {
    if (this.ctx.signal.aborted) return;
    try {
      const value = this.read();
      if (!this.surface) {
        if (!this.settled(value) && !this.giveUp) return;
        this.place();
      }
      if (value === null) return;
      const signature = JSON.stringify(value);
      if (signature === this.last) return;
      this.last = signature;
      this.render(value);
    } catch (error) {
      this.fail(error);
    }
  }

  protected fail(error: unknown): void {
    if (this.ctx.signal.aborted) return;
    (this.options.onError ?? ((e: unknown) => console.error('[mijhar] الوحدة (ح)', e)))(error);
  }
}

function Gate({ settingKey, children, context }: { settingKey: string; children: ComponentChildren; context: CommunityContext }) {
  const enabled = useSetting<boolean>(context.settings, settingKey);
  return enabled ? <>{children}</> : null;
}

class ReadmeRuntime extends PageRuntime<ReadmeDetection> {
  protected read(): ReadmeDetection | null {
    const { page, document: doc, selectors } = this.ctx;
    if (!page.owner || !page.repo) return null;
    return detectArabicReadme(extractReadmeScan(doc, selectors), { owner: page.owner, repo: page.repo, base: page.href });
  }

  protected settled(value: ReadmeDetection | null): value is ReadmeDetection {
    return value !== null && value.state !== 'unreadable';
  }

  protected place(): void {
    const { ctx } = this;
    const readme = ctx.selectors.resolve(ctx.document, 'h.readme.container')?.element ?? null;
    const parent = readme?.parentElement ?? ctx.page.contentRoot ?? ctx.document.body;
    this.surface = mountSurface(ctx, { parent, before: readme ?? parent.firstChild, label: 'README العربي' });
  }

  protected render(detection: ReadmeDetection): void {
    const { page } = this.ctx;
    const context = this.context;
    if (!this.surface || !context || !page.owner || !page.repo) return;
    this.surface.render(
      <Gate settingKey={COMMUNITY_README_BANNER_KEY} context={context}>
        <ReadmeBanner detection={detection} owner={page.owner} repo={page.repo} access={(this.options.access ?? (() => githubApiAccess()))()} />
      </Gate>,
    );
  }
}

class ProfileRuntime extends PageRuntime<ReturnType<typeof buildAccountView>> {
  protected read(): ReturnType<typeof buildAccountView> | null {
    const { page, document: doc, selectors } = this.ctx;
    if (!page.owner) return null;
    if (!selectors.resolve(doc, 'h.profile.card-parent')) return null;
    return buildAccountView(readAccount(doc, selectors, page.owner), readPinnedProjects(doc, selectors));
  }

  protected settled(value: ReturnType<typeof buildAccountView> | null): value is ReturnType<typeof buildAccountView> {
    return value !== null;
  }

  protected place(): void {
    const { ctx } = this;
    const anchor = ctx.selectors.resolve(ctx.document, 'h.profile.card-parent')?.element ?? null;
    // بعد بطاقة الملف الشخصي مباشرة؛ ولا بطاقة إن لم تُعرف حاويتها (لا يُحقن في موضع مخمَّن).
    if (!anchor?.parentElement) return;
    this.surface = mountSurface(ctx, { parent: anchor.parentElement, before: anchor.nextSibling, label: 'محتوى عربي وبيانات معلنة' });
  }

  protected render(view: ReturnType<typeof buildAccountView>): void {
    const context = this.context;
    if (!this.surface || !context) return;
    this.surface.render(
      <Gate settingKey={COMMUNITY_PROFILE_CARD_KEY} context={context}>
        <ProfileCard view={view} />
      </Gate>,
    );
  }
}

export function createModuleH(options: ModuleHOptions = {}): ExtensionModule {
  return {
    id: MODULE_H_ID,
    title: 'المجتمع وأول مساهمة',
    pages: COMMUNITY_PAGES,
    minConfidence: 'high',
    selectors: [...README_SELECTORS, ...PROFILE_SELECTORS],
    mount(ctx) {
      if (ctx.page.type === 'repo') new ReadmeRuntime(ctx, options).start();
      else if (ctx.page.type === 'profile') new ProfileRuntime(ctx, options).start();
    },
  };
}

export const MODULE_H: ExtensionModule = createModuleH();
