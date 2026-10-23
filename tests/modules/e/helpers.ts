// أدوات اختبار الوحدة (هـ): تحميل عينة في المستند العام (jsdom) وقراءة سياقها كما يقرؤه سكربت المحتوى.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SELECTORS, SelectorsRegistry, classifyPath } from '../../../src/core';
import type { PageState } from '../../../src/core';
import { JOB_PAGE_SELECTORS } from '../../../src/modules/d/log-parser/job-page';
import { PR_STATUS_SELECTORS } from '../../../src/modules/d/pr-status/extract';
import { BUILDER_SELECTORS } from '../../../src/modules/e/builder';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const E_FIXTURE = path.join(ROOT, 'tests/modules/e/fixtures/fixture-pr-context.html');

export function loadFile(file: string): void {
  const parsed = new DOMParser().parseFromString(fs.readFileSync(file, 'utf8'), 'text/html');
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

export const builderSelectors = (): SelectorsRegistry => new SelectorsRegistry([...DEFAULT_SELECTORS, ...PR_STATUS_SELECTORS, ...JOB_PAGE_SELECTORS, ...BUILDER_SELECTORS]);

/** حالة الصفحة لعنوان معيّن بمصنّف المسارات نفسه الذي يستعمله الكاشف. */
export function pageAt(href: string): PageState {
  const route = classifyPath(new URL(href).pathname);
  return { href, ...route, confidence: 'high', contentRoot: document.querySelector('main') };
}
