// أدوات اختبار الاتجاه على jsdom: عينة fixture-mixed-rtl-readme المكتوبة لـT-2.1 (بمرجع data-expect لكل كتلة)، وعينات T-0.1
// الحقيقية في fixtures/spikes، وتشغيل المعالج بسجل تعديلات وجدول محددات كما تفعل الميزة.
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { MutationRecorder, SelectorsRegistry } from '../../../../src/core';
import { DIRECTION_SELECTORS, DirectionProcessor } from '../../../../src/modules/a/direction';
import type { DirectionOptions, DirectionStats } from '../../../../src/modules/a/direction';
import { ROOT } from '../../../setup/paths';

export const FIXTURE = path.join(ROOT, 'tests/modules/a/direction/fixtures/fixture-mixed-rtl-readme.html');
export const SPIKES = path.join(ROOT, 'fixtures/spikes');

/** عينات T-0.1 الحقيقية (صفحات GitHub عامة محفوظة) بأسمائها في samples.json. */
export const SPIKE_PAGES = [
  ['readme-shakkala', 'gh-readme-shakkala.html', 'https://github.com/Barqawiz/Shakkala'],
  ['readme-js-algorithms-ar', 'gh-readme-js-algorithms-ar.html', 'https://github.com/trekhleb/javascript-algorithms/blob/master/README.ar-AR.md'],
  ['repo-arabic-stop-words', 'gh-repo-arabic-stop-words.html', 'https://github.com/mohataher/arabic-stop-words'],
  ['issue-etos-1', 'gh-issue-etos-1.html', 'https://github.com/salktbi902/ETOS-LLM-Studio/issues/1'],
  ['issue-winscreen-1', 'gh-issue-winscreen-1.html', 'https://github.com/M-Tech54/WinScreen-Lite-By-python/issues/1'],
  ['pr-watad-80', 'gh-pr-watad-80.html', 'https://github.com/octo/watad/pull/80'],
  ['commits-bms', 'gh-commits-bms.html', 'https://github.com/octo/business_management_system/commits/main'],
  ['commit-bms-1', 'gh-commit-bms-1.html', 'https://github.com/octo/business_management_system/commit/1535'],
] as const;

export function loadFixture(url = 'https://github.com/octo/mijhar-demo'): JSDOM {
  return new JSDOM(fs.readFileSync(FIXTURE, 'utf8'), { url, pretendToBeVisual: true });
}

export function loadSpike(file: string, url = 'https://github.com/octo/demo'): JSDOM {
  return new JSDOM(fs.readFileSync(path.join(SPIKES, file), 'utf8'), { url, pretendToBeVisual: true });
}

export interface Run {
  readonly stats: DirectionStats;
  readonly recorder: MutationRecorder;
  readonly processor: DirectionProcessor;
  readonly selectors: SelectorsRegistry;
}

export function runProcessor(doc: Document, options?: DirectionOptions, selectors = new SelectorsRegistry(DIRECTION_SELECTORS)): Run {
  const recorder = new MutationRecorder('a.direction');
  const processor = new DirectionProcessor({ document: doc, selectors, mutations: recorder }, options);
  return { stats: processor.scan(doc), recorder, processor, selectors };
}

/** كل سمات dir في المستند بترتيبه (للتحقق من أن المعالج لا يمس dir نفسها). */
export const dirAttributes = (doc: Document): string[] => [...doc.querySelectorAll('[dir]')].map((el) => `${el.localName}:${el.getAttribute('dir')}`);
