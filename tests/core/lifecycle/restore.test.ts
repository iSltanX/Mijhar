// TEST-CORE-02 (AC-1.2 بند 1 و4): بعد تركيب كل وحدة وإزالتها يتطابق DOM مع لقطة ما قبل التركيب باستثناء ما يسرده
// «استثناءات الاستعادة»؛ وقياس تمهيدي لـPB-01 وPB-06 على وحدات وهمية (يُسجَّل ولا يُعدّ قبولًا: القبول في T-10.1).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESTORE_EXCEPTIONS, RESTORE_EXCEPTION_IDS } from '../../../src/core';
import type { ExtensionModule, RestoreExceptionId } from '../../../src/core';
import { ROOT } from '../../setup/paths';
import { loadPage } from '../helpers/dom';
import { MARKER_TARGET, injectedCount, markerModule } from '../helpers/modules';
import { createHarness, snapshot } from '../helpers/runtime';
import { recordMeasurement, round, summarize } from '../helpers/stats';

const PAGES = [
  ['repo', 'https://github.com/octo/demo'],
  ['pr', 'https://github.com/octo/demo/pull/42'],
  ['issue', 'https://github.com/octo/demo/issues/7'],
  ['blob', 'https://github.com/octo/demo/blob/main/README.md'],
] as const;

const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const eight = (): ExtensionModule[] => ids.map((id) => markerModule({ id, pages: '*' }).module);

describe('تطابق DOM بعد التركيب والإيقاف', () => {
  it.each(PAGES)('عينة %s: لقطة ما بعد الإيقاف = لقطة ما قبل التركيب حرفيًا بثماني وحدات', (fixture, url) => {
    const dom = loadPage(fixture, url);
    const h = createHarness(dom, eight());
    // تسخين لا يغيّر شيئًا في الشجرة لكنه يمنع أن تدخل آثار jsdom الداخلية في المقارنة.
    const before = snapshot(dom);
    h.manager.start();
    expect(injectedCount(dom.window.document)).toBe(8);
    expect(snapshot(dom)).not.toBe(before);
    h.manager.stop();
    expect(snapshot(dom)).toBe(before);
    expect(h.reports).toHaveLength(8);
    for (const report of h.reports) expect(report).toMatchObject({ skipped: [], alreadyGone: 0 });
    expect(h.reports.every((r) => r.restored > 0)).toBe(true);
  });

  it('تركيب وإيقاف متكرران خمس مرات لا يتراكم فيهما شيء', () => {
    const dom = loadPage('pr', PAGES[1][1]);
    const h = createHarness(dom, eight());
    const before = snapshot(dom);
    for (let i = 0; i < 5; i += 1) {
      h.manager.start();
      h.manager.stop();
      expect(snapshot(dom)).toBe(before);
    }
  });
});

describe('ما يغيّره طرف آخر أثناء تشغيل الوحدة', () => {
  it('يبقى كما كتبه GitHub ويُسرد برقم من القائمة الموثقة، وما سواه يعود حرفيًا', () => {
    const dom = loadPage('pr', PAGES[1][1]);
    const doc = dom.window.document;
    const before = snapshot(dom);
    const h = createHarness(dom, eight());
    h.manager.start();

    // GitHub يعيد كتابة dir وstyle على العنصر الذي عدّلته الوحدات، ويزيل شارة إحداها المحقونة قبل الإيقاف.
    const comment = doc.querySelector(MARKER_TARGET) as HTMLElement;
    comment.setAttribute('dir', 'ltr');
    comment.style.setProperty('direction', 'ltr');
    (doc.querySelector('[data-mijhar-injected="c"]') as Element).remove();
    h.manager.stop();

    const skipped = h.reports.flatMap((r) => r.skipped.map((s) => s.exception));
    expect(new Set(skipped)).toEqual(new Set<RestoreExceptionId>(['external-attribute-change', 'external-style-change']));
    expect(comment.getAttribute('dir')).toBe('ltr');
    expect(comment.style.direction).toBe('ltr');
    expect(h.reports.find((r) => r.moduleId === 'c')?.alreadyGone).toBe(1);

    // ما عدا هذين الموضعين يطابق اللقطة الأصلية حرفيًا.
    comment.removeAttribute('dir');
    comment.removeAttribute('style');
    expect(snapshot(dom)).toBe(before);
  });
});

describe('قائمة «استثناءات الاستعادة» (AC-1.2 بند 4)', () => {
  it('معرّفات فريدة وكل مدخلة مكتملة الحقول', () => {
    expect(new Set(RESTORE_EXCEPTION_IDS).size).toBe(RESTORE_EXCEPTIONS.length);
    for (const e of RESTORE_EXCEPTIONS) {
      expect(e.title.length).toBeGreaterThan(3);
      expect(e.description.length).toBeGreaterThan(10);
      expect(e.behavior.length).toBeGreaterThan(10);
    }
  });

  it('كل ما يظهر وقت التشغيل في RestoreReport.skipped مُعلَّم reported في القائمة، والعكس', () => {
    const dom = loadPage('pr', PAGES[1][1]);
    const doc = dom.window.document;
    const seen = new Set<string>();
    const mod: ExtensionModule = {
      id: 'x',
      title: 'x',
      pages: '*',
      mount(ctx) {
        const { mutations } = ctx;
        const body = doc.body;
        const comment = doc.querySelector('.comment-body') as HTMLElement;
        mutations.setAttribute(body, 'data-x', '1');
        mutations.setStyle(comment, 'color', 'red');
        const target = doc.querySelector('#new_comment_field') as HTMLElement;
        const replacement = doc.createElement('textarea');
        mutations.replace(target, replacement);
        mutations.custom('فشل متعمد', () => {
          throw new Error('x');
        });
        const second = doc.createElement('p');
        mutations.insert(body, second);
        ctx.onTeardown(() => {
          body.setAttribute('data-x', 'غيّره الغير');
          comment.style.setProperty('color', 'blue');
          replacement.remove();
        });
      },
    };
    const h = createHarness(dom, [mod]);
    h.manager.start();
    h.manager.stop();
    for (const report of h.reports) for (const skip of report.skipped) seen.add(skip.exception);
    const reported = new Set(RESTORE_EXCEPTIONS.filter((e) => e.reported).map((e) => e.id as string));
    for (const id of seen) expect(reported.has(id), id).toBe(true);
    expect(seen).toEqual(new Set(['external-attribute-change', 'external-style-change', 'replaced-node-lost', 'custom-undo-failed']));
  });

  it('evidence/T-1.2/restore-exceptions.md يذكر كل معرّف في القائمة الموثقة', () => {
    const doc = fs.readFileSync(path.join(ROOT, 'evidence/T-1.2/restore-exceptions.md'), 'utf8');
    for (const id of RESTORE_EXCEPTION_IDS) expect(doc, id).toContain(`\`${id}\``);
  });
});

describe('قياس تمهيدي PB-01 وPB-06 على وحدات وهمية (لا يُعدّ قبولًا)', () => {
  const WARMUP = 3;
  const SAMPLES = 30;

  it('PB-06: بدء التشغيل حتى اكتمال الاكتشاف وتركيب الوحدات، ثماني معطلة وثماني مفعلة', () => {
    const result: Record<string, unknown> = {};
    for (const [fixture, url] of PAGES.filter(([f]) => f !== 'blob')) {
      for (const state of ['معطلة', 'مفعلة'] as const) {
        const samples: number[] = [];
        for (let i = 0; i < WARMUP + SAMPLES; i += 1) {
          const dom = loadPage(fixture, url);
          const h = createHarness(dom, eight(), state === 'مفعلة' ? ids : []);
          const t0 = performance.now();
          h.manager.start();
          const dt = performance.now() - t0;
          h.manager.stop();
          if (i >= WARMUP) samples.push(dt);
        }
        const summary = summarize(samples);
        expect(Number.isFinite(summary.median)).toBe(true);
        result[`${fixture}/${state}`] = { ...summary, median: round(summary.median), p95: round(summary.p95), min: round(summary.min), max: round(summary.max) };
      }
    }
    recordMeasurement('T-1.2', 'PB-06', { note: 'jsdom على Node، وحدات وهمية؛ تمهيدي لا قبول', warmup: WARMUP, samples: SAMPLES, results: result });
  });

  it('PB-01: من استدعاء الإيقاف حتى اكتمال استعادة DOM بثماني وحدات مفعلة', () => {
    const result: Record<string, unknown> = {};
    for (const [fixture, url] of PAGES) {
      const samples: number[] = [];
      for (let i = 0; i < WARMUP + SAMPLES; i += 1) {
        const dom = loadPage(fixture, url);
        const h = createHarness(dom, eight());
        h.manager.start();
        const t0 = performance.now();
        h.manager.stop();
        const dt = performance.now() - t0;
        if (i >= WARMUP) samples.push(dt);
      }
      const summary = summarize(samples);
      expect(Number.isFinite(summary.median)).toBe(true);
      result[fixture] = { ...summary, median: round(summary.median), p95: round(summary.p95), min: round(summary.min), max: round(summary.max) };
    }
    recordMeasurement('T-1.2', 'PB-01', { note: 'jsdom على Node، وحدات وهمية؛ تمهيدي لا قبول', warmup: WARMUP, samples: SAMPLES, results: result });
  });
});
