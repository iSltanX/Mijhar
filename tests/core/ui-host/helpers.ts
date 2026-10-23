// أدوات اختبار مضيف الواجهات: إعدادات على منطقة ذاكرية (سياقان يتشاركانها)، وبديل وهمي لواجهة الصلاحيات
// وواجهات الإضافة، وتحميل عينة في مستند jsdom العام (Preact يرسم في document العام).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import { MemoryStorageArea, SettingsStore, Store, createSettingsRegistry } from '../../../src/core';
import type { ExtensionApi, PermissionsApi, PermissionsSet, TabLike } from '../../../src/core';

// لا tests/setup/paths: في بيئة jsdom يكون URL العام من jsdom فلا يقبله fileURLToPath.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export const flush = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function memorySettings(area = new MemoryStorageArea()): Promise<{ area: MemoryStorageArea; settings: SettingsStore; reopen: () => Promise<SettingsStore> }> {
  const open = async (): Promise<SettingsStore> => SettingsStore.open(await Store.open({ area, changes: area, locks: null }), createSettingsRegistry());
  return { area, settings: await open(), reopen: open };
}

/** يحمّل عينة fixtures/<dir>/<name>.html في المستند العام (بيئة jsdom). */
export function loadIntoDocument(file: string): void {
  const html = fs.readFileSync(path.join(ROOT, 'fixtures', file), 'utf8');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

type Listener = (set: PermissionsSet) => void;

export interface FakePermissions extends PermissionsApi {
  granted: Set<string>;
  request: ReturnType<typeof vi.fn<(set: PermissionsSet) => Promise<boolean>>>;
  remove: ReturnType<typeof vi.fn<(set: PermissionsSet) => Promise<boolean>>>;
  /** ما يجيب به المستخدم في نافذة الطلب. */
  answer: boolean;
  /** يحاكي منح الصلاحية أو سحبها من خارج الصفحة (إعدادات المتصفح). */
  external(kind: 'added' | 'removed', set: PermissionsSet): void;
}

export function fakePermissions(initial: string[] = []): FakePermissions {
  const added = new Set<Listener>();
  const removed = new Set<Listener>();
  const fake: FakePermissions = {
    granted: new Set(initial),
    answer: true,
    contains: vi.fn(async (set: PermissionsSet) => (set.origins ?? []).every((o) => fake.granted.has(o))),
    request: vi.fn(async (set: PermissionsSet) => {
      if (!fake.answer) return false;
      for (const o of set.origins ?? []) fake.granted.add(o);
      for (const l of added) l(set);
      return true;
    }),
    remove: vi.fn(async (set: PermissionsSet) => {
      for (const o of set.origins ?? []) fake.granted.delete(o);
      for (const l of removed) l(set);
      return true;
    }),
    onAdded: { addListener: (l: Listener) => void added.add(l), removeListener: (l: Listener) => void added.delete(l) },
    onRemoved: { addListener: (l: Listener) => void removed.add(l), removeListener: (l: Listener) => void removed.delete(l) },
    external(kind, set) {
      for (const o of set.origins ?? []) (kind === 'added' ? fake.granted.add(o) : fake.granted.delete(o));
      for (const l of kind === 'added' ? added : removed) l(set);
    },
  };
  return fake;
}

/** واجهة إضافة وهمية بما تستعمله الخلفية وأمر اللوحة. */
export function fakeExtensionApi(overrides: Partial<ExtensionApi> = {}) {
  const messageListeners = new Set<(message: unknown, sender: { tab?: TabLike }, reply: (r?: unknown) => void) => unknown>();
  const commandListeners = new Set<(command: string, tab?: TabLike) => void>();
  const sent: Array<{ tabId: number; message: unknown }> = [];
  const api = {
    runtime: {
      getURL: (p: string) => `chrome-extension://test/${p}`,
      openOptionsPage: vi.fn(async () => {}),
      sendMessage: vi.fn(async () => undefined),
      onMessage: { addListener: (l: any) => void messageListeners.add(l), removeListener: (l: any) => void messageListeners.delete(l) },
    },
    tabs: {
      sendMessage: vi.fn(async (tabId: number, message: unknown) => {
        sent.push({ tabId, message });
        return undefined;
      }),
      query: vi.fn(async () => [{ id: 7, windowId: 1 }] as TabLike[]),
      create: vi.fn(async (p: { url: string }) => ({ id: 9, url: p.url })),
    },
    commands: {
      getAll: vi.fn(async () => [{ name: 'toggle-panel', shortcut: '⌥G' }]),
      onCommand: { addListener: (l: any) => void commandListeners.add(l), removeListener: (l: any) => void commandListeners.delete(l) },
    },
    ...overrides,
  } satisfies ExtensionApi;
  return {
    api: api as ExtensionApi & typeof api,
    sent,
    command: (name: string, tab?: TabLike) => {
      for (const l of commandListeners) l(name, tab);
    },
    message: (message: unknown) => {
      for (const l of messageListeners) l(message, {}, () => {});
    },
    listenerCounts: () => ({ messages: messageListeners.size, commands: commandListeners.size }),
  };
}
