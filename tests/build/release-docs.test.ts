// T-10.2 (MJ26): الملفات المولَّدة في جذر المستودع تطابق مولّداتها، فلا تنشأ نسختان متعارضتان (AD-35).
//   PRIVACY.md من Docs/Site/privacy.md (scripts/privacy.mjs)، وTHIRD_PARTY_NOTICES.txt من الحزم المشحونة (scripts/notices.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTICES_FILE, generate as notices } from '../../scripts/notices.mjs';
import { generate as privacy } from '../../scripts/privacy.mjs';
import { ROOT } from '../setup/paths';

const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('الملفات المولَّدة للإصدار', () => {
  it('PRIVACY.md يطابق ما يولّده scripts/privacy.mjs من Docs/Site/privacy.md، بلا علامة غير محسومة', () => {
    const text = privacy();
    expect(read('PRIVACY.md')).toBe(text);
    expect(text).not.toMatch(/⟨|\[بعد [A-Z]\]|\[قرار\]|\/Mjhr/);
  });

  it('PRIVACY.md يذكر الإصدار من package.json والوجهات الخمس', () => {
    const text = read('PRIVACY.md');
    expect(text).toContain(`شيفرة الإصدار ${JSON.parse(read('package.json')).version}`);
    for (const host of ['api.github.com', 'api.anthropic.com', 'api.openai.com', 'generativelanguage.googleapis.com', 'app-reports.isultantf.workers.dev']) expect(text).toContain(host);
  });

  it('مولّد الخصوصية يرفض مصدرًا بقيت فيه علامة', () => {
    expect(() => privacy('## الخلاصة — `#summary`\n\n- قيمة `⟨لاحقًا⟩` **[بعد M]**\n')).toThrow(/علامات غير محسومة/);
  });

  it('THIRD_PARTY_NOTICES.txt يطابق ما يولّده scripts/notices.mjs', () => {
    expect(read(NOTICES_FILE)).toBe(notices());
  });
});
