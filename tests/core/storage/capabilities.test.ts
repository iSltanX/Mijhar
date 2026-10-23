// يربط ثوابت capabilities.ts (نتيجة HYP-06) بدليلها الخام في evidence/T-1.3/browser-results.json، وبالمانيفست المولَّد:
// فلا تتباعد الشيفرة عن التجربة، ولا تُعلَن الصلاحية اختيارية وهي غير قابلة للطلب (يتجاهلها Chromium صامتًا ويحذّر منها Firefox).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { UNLIMITED_STORAGE_FINDINGS, UNLIMITED_STORAGE_REQUESTABLE_AT_RUNTIME } from '../../../src/core';
import { generateManifest } from '../../../src/manifest/generate.mjs';
import { ROOT } from '../../setup/paths';

type Results = Record<string, any>;
const results: Results = JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence/T-1.3/browser-results.json'), 'utf8'));

describe('نتيجة HYP-06 في الشيفرة مطابقة للتجربة الفعلية', () => {
  it('لا تُطلب وقت التشغيل في أي متصفح مقيس', () => {
    expect(UNLIMITED_STORAGE_REQUESTABLE_AT_RUNTIME).toBe(false);
    for (const finding of UNLIMITED_STORAGE_FINDINGS) {
      const run = results[finding.browser];
      expect(run, finding.browser).toBeDefined();
      expect(run.browserVersion).toBe(finding.version);
      const request = run.variants.optional.request;
      expect(request.granted, `${finding.browser}: طلب unlimitedStorage`).toBeUndefined();
      expect(typeof request.error, finding.browser).toBe('string');
      expect(request.activation, `${finding.browser}: فعل المستخدم وصل`).toBe(true);
    }
  });

  it('سقف الحصة الافتراضي المسجَّل هو ما قيس، وإعلانها أساسية يرفعه', () => {
    for (const finding of UNLIMITED_STORAGE_FINDINGS) {
      const run = results[finding.browser];
      expect(run.variants.baseline.probe.quotaBytes ?? null, finding.browser).toBe(finding.defaultQuotaBytes);
      const capped = typeof run.variants.baseline.quota.batchOverQuota === 'object';
      expect(capped, finding.browser).toBe(finding.handling === 'declare-required-in-manifest');
      expect(run.variants.declared.quota.batchOverQuota, `${finding.browser}: declared`).toBe('نجحت');
    }
  });

  it('شاهد الطلب (alarms) مُنح في عائلة Chromium عبر المسار نفسه فرفض unlimitedStorage بسبب المانيفست لا غياب النقر', () => {
    for (const browser of ['chrome', 'edge', 'brave']) {
      const control = results[browser].variants.optional.requestControl;
      expect(control, browser).toMatchObject({ permission: 'alarms', activation: true, granted: true });
    }
  });
});

describe('المانيفست المولَّد والتخزين', () => {
  it.each(['chromium', 'firefox'])('%s: يعلن storage ولا يعلن unlimitedStorage اختيارية', (target) => {
    const manifest = generateManifest(target, { version: '0.0.1' }) as Record<string, any>;
    expect(manifest.permissions).toContain('storage');
    expect(manifest.optional_permissions ?? []).not.toContain('unlimitedStorage');
  });
});
