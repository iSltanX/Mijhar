// محددات الاتجاه في SelectorsRegistry (BLK-DOM-SELECTOR): الحاويات والكتل المستقلة التي ثبتت في مصفوفة T-0.1
// (evidence/T-0.1/report.md، AC-S1.1، 2026-10-23، متطابقة في المتصفحات الأربعة). من محددات الخطة الستة لم يصلح إلا
// .markdown-body و[data-testid="issue-title"]؛ والباقي استُبدل بمرشحات T-0.1. ما يعتمد بادئة فئة CSS Modules موسوم «هش».
// إن تغيّر GitHub يُعدَّل المفتاح هنا (أو بـSelectorsRegistry.define) دون مسّ بقية الوحدة؛ والمفتاح الغائب يعيد [] فلا يعطّل شيئًا.
import type { SelectorEntry } from '../../../core';

export const DIRECTION_SELECTOR_KEYS = {
  container: 'a.direction.container',
  titles: 'a.direction.titles',
  commitRows: 'a.direction.commit-rows',
  commitMessage: 'a.direction.commit-message',
  latestCommit: 'a.direction.latest-commit',
  repoDescription: 'a.direction.repo-description',
} as const;

export const DIRECTION_SELECTORS: readonly SelectorEntry[] = [
  {
    key: DIRECTION_SELECTOR_KEYS.container,
    description: 'حاويات Markdown: README والتعليقات في Issues (React) وPR (التقليدية) والويكي والنقاشات. T-0.1: ‏6 من 6',
    candidates: ['.markdown-body'],
  },
  {
    key: DIRECTION_SELECTOR_KEYS.titles,
    description: 'عناوين Issue (bdi.markdown-title) وPR وعناوين الالتزامات في سجل PR. T-0.1: ‏3 من 3؛ وdata-testid بديل لعنوان Issue',
    candidates: ['.markdown-title', '[data-testid="issue-title"]'],
  },
  {
    key: DIRECTION_SELECTOR_KEYS.commitRows,
    description: 'السطر الظاهر لكل التزام في قائمة الالتزامات (React). T-0.1: ‏1 من 1؛ جسم الرسالة في title ويُعرض بزر',
    candidates: ['[data-testid="commit-row-item"] h4'],
  },
  {
    key: DIRECTION_SELECTOR_KEYS.commitMessage,
    description: 'عنوان الالتزام وجسمه في صفحة الالتزام. هش: يعتمد بادئة فئة CSS Modules',
    candidates: ['[class*="commitMessageContainer"] > span'],
  },
  {
    key: DIRECTION_SELECTOR_KEYS.latestCommit,
    description: 'رسالة آخر التزام في صفحة المستودع. T-0.1: ‏3 من 3',
    candidates: ['[data-testid="latest-commit-html"]'],
  },
  {
    key: DIRECTION_SELECTOR_KEYS.repoDescription,
    description: 'وصف المستودع («About»). هش: يعتمد بادئة فئة CSS Modules؛ و.f4.my-3 في الخطة لا يطابق شيئًا',
    candidates: ['p[class*="description__"]'],
  },
];

/** الكتل داخل الحاوية: عناصر HTML لا محددات GitHub، فلا تدخل الجدول. */
export const CONTAINER_BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, td, th';
export const LISTS = 'ul, ol';

/** مفاتيح الكتل المستقلة (خارج الحاويات) بالترتيب. */
export const STANDALONE_KEYS = [
  DIRECTION_SELECTOR_KEYS.titles,
  DIRECTION_SELECTOR_KEYS.commitRows,
  DIRECTION_SELECTOR_KEYS.commitMessage,
  DIRECTION_SELECTOR_KEYS.latestCommit,
  DIRECTION_SELECTOR_KEYS.repoDescription,
] as const;

/** مناطق لا تُلمس كتلها أبدًا: الكود والمحررات. */
export const NEVER_INSIDE = 'pre, code, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
