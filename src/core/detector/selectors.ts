// SelectorsRegistry: الجدول الوحيد الذي تُعزل فيه محددات DOM الخاصة بـGitHub (BLK-DOM-SELECTOR).
// كل مفتاح منطقي يحمل قائمة مرشَّحات مرتبة؛ الأول هو الأساسي والبقية بدائل. إن تغيّر GitHub مسارًا أو سمة
// تُعدَّل قيمة المفتاح هنا فقط (define)، ولا تُعطَّل بقية الوحدات: المفتاح المفقود يعيد null ويُسجَّل في health().

export type SelectorKey = string;

export interface SelectorEntry {
  readonly key: SelectorKey;
  readonly description: string;
  /** مرشَّحات مرتبة: الأول أساسي، وما بعده بدائل تُستعمل إن غاب ما قبلها. */
  readonly candidates: readonly string[];
}

export interface SelectorMatch<E extends Element = Element> {
  readonly element: E;
  readonly candidate: string;
  /** 0 = الأساسي؛ ما فوقه يعني أن المحدد الأساسي لم يعد يطابق (تدهور). */
  readonly index: number;
}

export type SelectorStatus = 'primary' | 'fallback' | 'missing';

export interface SelectorHealth {
  readonly status: SelectorStatus;
  readonly index: number;
  /** رقم تسلسلي لآخر استدعاء، يسمح بمعرفة حداثة الحالة. */
  readonly checkedAt: number;
}

export class UnknownSelectorError extends Error {
  constructor(readonly key: SelectorKey) {
    super(`مفتاح محدد غير معرَّف في SelectorsRegistry: ${key}`);
    this.name = 'UnknownSelectorError';
  }
}

export class SelectorsRegistry {
  private readonly entries = new Map<SelectorKey, SelectorEntry>();
  private readonly healthByKey = new Map<SelectorKey, SelectorHealth>();
  private tick = 0;

  constructor(entries: readonly SelectorEntry[] = []) {
    for (const entry of entries) this.define(entry);
  }

  /** يضيف مفتاحًا أو يستبدل مرشَّحاته (نقطة الترقيع الوحيدة عند تغيّر GitHub). */
  define(entry: SelectorEntry): void {
    if (!entry.key) throw new Error('مفتاح المحدد فارغ');
    if (!entry.candidates.length) throw new Error(`المفتاح ${entry.key} بلا مرشَّحات`);
    this.entries.set(entry.key, { ...entry, candidates: [...entry.candidates] });
    this.healthByKey.delete(entry.key);
  }

  has(key: SelectorKey): boolean {
    return this.entries.has(key);
  }

  entry(key: SelectorKey): SelectorEntry {
    const entry = this.entries.get(key);
    if (!entry) throw new UnknownSelectorError(key);
    return entry;
  }

  keys(): SelectorKey[] {
    return [...this.entries.keys()];
  }

  /** أول مرشَّح يطابق عنصرًا تحت root، أو null. غياب المفتاح من الجدول خطأ برمجي لا غياب في الصفحة. */
  resolve<E extends Element = Element>(root: ParentNode, key: SelectorKey): SelectorMatch<E> | null {
    const { candidates } = this.entry(key);
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index] as string;
      const element = this.safeQuery(root, candidate);
      if (element) {
        this.record(key, index === 0 ? 'primary' : 'fallback', index);
        return { element: element as E, candidate, index };
      }
    }
    this.record(key, 'missing', -1);
    return null;
  }

  /** كل العناصر المطابقة لأول مرشَّح له نتائج. */
  resolveAll<E extends Element = Element>(root: ParentNode, key: SelectorKey): E[] {
    const { candidates } = this.entry(key);
    for (let index = 0; index < candidates.length; index += 1) {
      const found = this.safeQueryAll(root, candidates[index] as string);
      if (found.length) {
        this.record(key, index === 0 ? 'primary' : 'fallback', index);
        return found as E[];
      }
    }
    this.record(key, 'missing', -1);
    return [];
  }

  /** آخر حالة معروفة لكل مفتاح سبق حلّه؛ تكشف المحددات المتدهورة دون تعطيل أحد. */
  health(): Record<SelectorKey, SelectorHealth> {
    return Object.fromEntries(this.healthByKey);
  }

  degraded(): SelectorKey[] {
    return [...this.healthByKey].filter(([, h]) => h.status !== 'primary').map(([key]) => key);
  }

  private record(key: SelectorKey, status: SelectorStatus, index: number): void {
    this.tick += 1;
    this.healthByKey.set(key, { status, index, checkedAt: this.tick });
  }

  // محدد معطوب في الجدول (خطأ صياغة) يُعامَل كغياب لا استثناء يكسر الوحدة.
  private safeQuery(root: ParentNode, selector: string): Element | null {
    try {
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }

  private safeQueryAll(root: ParentNode, selector: string): Element[] {
    try {
      return [...root.querySelectorAll(selector)];
    } catch {
      return [];
    }
  }
}

// قيم البذرة، مراجَعة على صفحات github.com الحية في 2026-10-23 (قراءة فقط لصفحات مستودع عام؛ evidence/T-1.2/live-selector-check.md): ما طابق منها
// هناك رُتّب أولًا. صفحات GitHub تتغير بين تخطيط Rails القديم وتخطيط React الجديد وبأسماء فئات مجزّأة (CSS modules) لا يُعتمد عليها،
// فالمعتمَد معرّفات data-testid وid الثابتة. لم تُقَس على صفحات حية: confirm.actions-run وconfirm.discussion (وتبقى بذرة)،
// وصفحة تتطلب صلاحية خاصة (لوحة المستخدم والمستودعات الخاصة). تُراجع بنتائج T-0.1 وT-0.4، وأي تعديل يتم هنا وحده. المفاتيح confirm.<نوع الصفحة> يستعملها
// PageDetector لرفع الثقة من low إلى high.
export const DEFAULT_SELECTORS: readonly SelectorEntry[] = [
  {
    key: 'content-root',
    description: 'حاوية المحتوى الرئيسية (تتغير هويتها عند استبدال المحتوى؛ في صفحات React تبقى ويتغير ما بداخلها)',
    candidates: ['#js-repo-pjax-container', '#repo-content-turbo-frame', '#repo-content-pjax-container', 'main', '[role="main"]'],
  },
  {
    key: 'confirm.repo',
    description: 'ما يؤكد أن الصفحة صفحة مستودع (ترويسته)',
    candidates: ['#repo-title-component', '#repository-container-header'],
  },
  {
    key: 'confirm.tree',
    description: 'ما يؤكد صفحة شجرة ملفات',
    candidates: ['[aria-labelledby="folders-and-files"]', 'table[aria-labelledby="folders-and-files"]', '#repository-container-header'],
  },
  {
    key: 'confirm.blob',
    description: 'ما يؤكد صفحة عرض ملف',
    candidates: ['#repos-sticky-header', '[data-testid="code-view"]', '#read-only-cursor-text-area', '.blob-wrapper', '#readme'],
  },
  {
    key: 'confirm.issue',
    description: 'ما يؤكد صفحة مشكلة',
    candidates: [
      '[data-testid="issue-viewer-issue-container"]',
      '[data-testid="issue-header"]',
      '[data-testid="issue-title"]',
      '#partial-discussion-header',
      '.js-discussion',
    ],
  },
  {
    key: 'confirm.pr',
    description: 'ما يؤكد صفحة طلب دمج',
    candidates: ['.pull-discussion-timeline', '#discussion_bucket', '.js-discussion', '#partial-discussion-header'],
  },
  {
    key: 'confirm.pr-files',
    description: 'ما يؤكد صفحة الملفات المتغيرة في طلب دمج',
    candidates: ['#diff-comparison-viewer-container', '#files', '.js-diff-progressive-container', '[data-testid="diff-view"]'],
  },
  {
    key: 'confirm.pr-commits',
    description: 'ما يؤكد صفحة التزامات طلب دمج',
    candidates: ['.pull-discussion-timeline', '#commits_bucket', '.js-navigation-container', '#js-repo-pjax-container'],
  },
  {
    key: 'confirm.issue-list',
    description: 'ما يؤكد صفحة قائمة المشكلات',
    candidates: ['[data-testid="issues-list-surface"]', '[data-testid="issue-listitem-title-link"]', '#js-issues-toolbar', '.js-navigation-container'],
  },
  {
    key: 'confirm.pr-list',
    description: 'ما يؤكد صفحة قائمة طلبات الدمج',
    candidates: ['[data-testid="listitem-title-link"]', '#repo-pulls-dashboard-filter', '#js-issues-toolbar', '.js-navigation-container'],
  },
  {
    key: 'confirm.commit',
    description: 'ما يؤكد صفحة التزام',
    candidates: ['#diff-content-parent', '#diff_file_tree', '.diff-line-row', '.commit'],
  },
  {
    key: 'confirm.actions-run',
    description: 'ما يؤكد صفحة تشغيل Actions (بذرة لم تُقَس حيًّا)',
    candidates: ['#workflow-run-summary', '.workflow-run-header', '[data-test-selector="workflow-run-header"]'],
  },
  {
    key: 'confirm.discussion',
    description: 'ما يؤكد صفحة نقاش (بذرة لم تُقَس حيًّا)',
    candidates: ['.discussion-timeline', '#discussion_bucket', '.js-discussion'],
  },
  {
    key: 'confirm.profile',
    description: 'ما يؤكد صفحة ملف شخصي أو منظمة',
    candidates: ['.h-card', '.vcard-names', '.orghead', '[itemtype="http://schema.org/Person"]'],
  },
  {
    key: 'confirm.home',
    description: 'ما يؤكد لوحة المستخدم الرئيسية (بذرة لم تُقَس حيًّا: تتطلب تسجيل دخول)',
    candidates: ['#dashboard', '.feed-content', '[data-target="feed-container.content"]', 'main'],
  },
];
