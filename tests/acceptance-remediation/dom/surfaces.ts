// الأسطح التي تُدرج مضيفًا في صفحة GitHub قرب مرساة (ترويسة أو نص مرسوم): كلٌّ بعينتها ومساره ووحداتها ومرساتها.
// يُستعمل في اختبارات «استبدال الحاوية بعد التركيب» (host-detachment.test.ts) دون أي افتراض عن طريقة الإصلاح.
import { vi } from 'vitest';
import type { ExtensionModule } from '../../../src/core';
import type { ExtensionApi } from '../../../src/core';
import type { ConnectionStatus } from '../../../src/core/connections/health';
import type { ConnectionsPort } from '../../../src/core/connections/port';
import { createCompareModule } from '../../../src/modules/d/compare';
import { createAnalysisModule } from '../../../src/modules/d/analysis';
import type { SectionAnalysisDeps } from '../../../src/modules/d/analysis';
import { createPrStatusModule } from '../../../src/modules/d/pr-status';
import { createContextBuilderModule } from '../../../src/modules/e/builder';
import { createCopyPromptModule } from '../../../src/modules/e/copy-prompt';
import type { CopyPromptSettings } from '../../../src/modules/e/copy-prompt';
import type { ProviderPort, ProviderStatus } from '../../../src/modules/e/provider';
import { providerInfo } from '../../../src/modules/e/provider';
import { ANTHROPIC } from '../../../src/modules/e/provider/descriptors/anthropic';
import { createReadingFeature } from '../../../src/modules/a/reading';
import { createModuleA } from '../../../src/modules/a/scope';
import { createTranslateModule } from '../../../src/modules/c/ui';
import type { TranslationService } from '../../../src/modules/c/ui/service';
import { ROOT, loadHtml, loadHtmlText } from '../../modules/d/helpers';
import { E_FIXTURE } from '../../modules/e/helpers';
import type { HostSpec } from './rig';

export const NOW = Date.UTC(2026, 9, 25, 9, 30);

const PR_PATH = '/octo/demo/pull/4242';
const ISSUE_PATH = '/salktbi902/etos/issues/1';
const COMPARE_PATH = '/octocat/Hello-World/compare/master...octocat-patch-1';
const PR_COMPLEX = `${ROOT}/tests/modules/d/fixtures/fixture-pr-complex.html`;
const ISSUE_REAL = `${ROOT}/fixtures/spikes/gh-issue-etos-1.html`;
const COMPARE_REAL = `${ROOT}/tests/modules/d/fixtures/gh-compare-branches.html`;

export const HEADER = '[data-component="PageHeader"]';
/** كل مرساة يبحث عنها أي مضيف ترويسة (للحالة التي تغيب فيها كلها مؤقتًا). */
export const HEADER_ANCHORS = ['[data-component="PageHeader"]', '[data-testid="issue-header"]', '#partial-discussion-header', '.gh-header'] as const;

/** ما يلزم لتحليل في صفحة المشكلة: منافذ وهمية لا شبكة فيها ولا إضافة. */
export function analysisDeps(options: { health?: ConnectionStatus['health']; status?: Partial<ProviderStatus> } = {}) {
  let health: ConnectionStatus['health'] = options.health ?? 'healthy';
  let current: Partial<ProviderStatus> = options.status ?? {};
  const listeners = new Set<(message: unknown) => unknown>();
  const base: ProviderStatus = {
    provider: providerInfo(ANTHROPIC),
    selected: true,
    permission: true,
    hostPermission: true,
    contentPermission: null,
    key: null,
    model: { id: 'mock-sonnet-2', displayName: 'Mock Sonnet 2' },
    choice: 'mock-sonnet-2',
    models: null,
    test: null,
    retryAt: null,
    providers: [],
  };
  const keyOf = (): ConnectionStatus => ({ id: 'provider-key', place: 'session', savedAt: 1, health, checkedAt: 1, detail: {} });
  const connections = {
    status: vi.fn(async () => [keyOf()] as ConnectionStatus[]),
    pending: vi.fn(async () => null),
    returnToFeature: vi.fn(async () => false),
    dismiss: vi.fn(async () => undefined),
  } satisfies ConnectionsPort;
  const provider = {
    status: vi.fn(async () => ({ ...base, key: keyOf(), ...current }) as ProviderStatus),
    verify: vi.fn(),
    probe: vi.fn(),
    analyze: vi.fn(),
    cancel: vi.fn(async () => undefined),
  } satisfies ProviderPort;
  const deps: SectionAnalysisDeps = {
    provider,
    connections,
    openSettings: vi.fn(),
    messages: { addListener: (l) => void listeners.add(l), removeListener: (l) => void listeners.delete(l) },
    newId: () => 'req-1',
    lineLimit: () => 400,
  };
  return {
    deps,
    provider,
    connections,
    /** يغيّر ما تعيده الخلفية من الآن (كأن المستخدم غيّر شيئًا في صفحة الإعدادات) دون إبلاغ أي تبويب. */
    backend: {
      setHealth: (next: ConnectionStatus['health']) => {
        health = next;
      },
      setStatus: (next: Partial<ProviderStatus>) => {
        current = { ...current, ...next };
      },
    },
    /** يوصل رسالة الخلفية المعتمدة اليوم (connections-changed) إلى التبويب. */
    deliver: (message: unknown) => {
      for (const listener of listeners) listener(message);
    },
    listenerCount: () => listeners.size,
  };
}

const copySettings: CopyPromptSettings = { template: () => 'auto', lineLimit: () => 400 };
const copyOk = async () => ({ ok: true as const, via: 'clipboard' as const });

/** واجهات الإضافة الوهمية لميزة وضع القراءة. */
export function fakeExtensionApi(): ExtensionApi {
  return {
    runtime: {
      getURL: (p: string) => `chrome-extension://mijhar/${p}`,
      sendMessage: async () => undefined,
      onMessage: { addListener: () => undefined, removeListener: () => undefined },
    },
    tabs: { create: async () => ({ id: 1 }), sendMessage: async () => undefined, query: async () => [] },
  } as unknown as ExtensionApi;
}

export const stubTranslation: TranslationService = {
  id: 'stub',
  label: 'محرك وهمي',
  availability: async () => ({ state: 'ready' }),
  translate: async (text) => text,
};

/** صفحة مكتوبة: ترويسة ونصّان مرسومان داخل task-lists كما في تعليقات GitHub. */
export const MARKDOWN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>
<div id="js-repo-pjax-container"><main id="repo-content-pjax-container">
  <div data-component="PageHeader"><h1>عنوان</h1></div>
  <task-lists><div class="markdown-body" id="c1"><p dir="auto">نصٌّ عربي قابل للقراءة والترجمة</p></div></task-lists>
  <task-lists><div class="markdown-body" id="c2"><p dir="auto">نصٌّ ثانٍ في تعليق آخر</p></div></task-lists>
</main></div></body></html>`;

export interface Surface {
  readonly id: string;
  /** الوحدة التي يسجَّل باسمها المضيف (isEnabled). */
  readonly moduleIds: readonly string[];
  readonly spec: HostSpec;
  readonly path: string;
  readonly load: () => void;
  readonly modules: () => ExtensionModule[];
}

const prStatus = () => createPrStatusModule({ debounceMs: 5, api: null, connections: null, runtimeMessages: null, fetchDetails: async () => '<div class="merge-status-list"></div>', now: () => NOW });

export const SURFACES: Readonly<Record<string, Surface>> = {
  'd.pr-status': {
    id: 'd.pr-status',
    moduleIds: ['d.pr-status'],
    spec: { name: 'd.pr-status', anchorSelector: HEADER, side: 'after' },
    path: PR_PATH,
    load: () => loadHtml(PR_COMPLEX),
    modules: () => [prStatus()],
  },
  'e.copy-prompt (PR)': {
    id: 'e.copy-prompt (PR)',
    moduleIds: ['e.copy-prompt'],
    spec: { name: 'e.copy-prompt', anchorSelector: HEADER, side: 'after' },
    path: PR_PATH,
    load: () => loadHtml(E_FIXTURE),
    modules: () => [createCopyPromptModule({ copy: copyOk, settings: copySettings, now: () => NOW })],
  },
  'e.copy-prompt (issue)': {
    id: 'e.copy-prompt (issue)',
    moduleIds: ['e.copy-prompt'],
    spec: { name: 'e.copy-prompt', anchorSelector: HEADER, side: 'after' },
    path: ISSUE_PATH,
    load: () => loadHtml(ISSUE_REAL),
    modules: () => [createCopyPromptModule({ copy: copyOk, settings: copySettings, now: () => NOW })],
  },
  'e.builder (PR)': {
    id: 'e.builder (PR)',
    moduleIds: ['e.builder'],
    spec: { name: 'e.builder', anchorSelector: HEADER, side: 'after' },
    path: PR_PATH,
    load: () => loadHtml(E_FIXTURE),
    modules: () => [createContextBuilderModule({ now: () => NOW })],
  },
  'e.builder (issue)': {
    id: 'e.builder (issue)',
    moduleIds: ['e.builder'],
    spec: { name: 'e.builder', anchorSelector: HEADER, side: 'after' },
    path: ISSUE_PATH,
    load: () => loadHtml(ISSUE_REAL),
    modules: () => [createContextBuilderModule({ now: () => NOW })],
  },
  'd.analysis (issue)': {
    id: 'd.analysis (issue)',
    moduleIds: ['d.analysis'],
    spec: { name: 'd.analysis', anchorSelector: '[data-testid="issue-header"]', side: 'after' },
    path: ISSUE_PATH,
    load: () => loadHtml(ISSUE_REAL),
    modules: () => [createAnalysisModule(analysisDeps().deps)],
  },
  'a.reading (issue)': {
    id: 'a.reading (issue)',
    moduleIds: ['a'],
    spec: { name: 'a.reading', anchorSelector: '.markdown-body', side: 'before' },
    path: ISSUE_PATH,
    load: () => loadHtml(ISSUE_REAL),
    modules: () => [createModuleA({ features: [createReadingFeature({ api: () => fakeExtensionApi() })] })],
  },
  'd.compare': {
    id: 'd.compare',
    moduleIds: ['d.compare'],
    spec: { name: 'd.compare', count: 2, anchorSelector: '#files_bucket', side: 'before' },
    path: COMPARE_PATH,
    load: () => loadHtml(COMPARE_REAL),
    modules: () => [createCompareModule({ debounceMs: 5 })],
  },
};

/** أسطح الترويسة التي يتفق عليها «الحمل الكامل» لصفحة PR (الوحدات الأربع معًا كما تركّبها الإضافة). */
export function prPageWithAllModules() {
  return {
    path: PR_PATH,
    load: () => {
      loadHtml(PR_COMPLEX);
      document.querySelector('main')?.insertAdjacentHTML('beforeend', '<task-lists><div class="markdown-body"><p dir="auto">وصف الطلب بالعربية</p></div></task-lists>');
    },
    modules: (): ExtensionModule[] => [
      prStatus(),
      createContextBuilderModule({ now: () => NOW }),
      createCopyPromptModule({ copy: copyOk, settings: copySettings, now: () => NOW }),
      createModuleA({ features: [createReadingFeature({ api: () => fakeExtensionApi() })] }),
    ],
    names: ['d.pr-status', 'e.builder', 'e.copy-prompt', 'a.reading'] as const,
  };
}

export const markdownPage = (): void => loadHtmlText(MARKDOWN_PAGE);
export const translateModule = () => createTranslateModule({ service: stubTranslation, debounceMs: 5, selection: false });
