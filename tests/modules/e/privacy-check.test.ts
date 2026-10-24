// TEST-PRIV-02 (AC-E5) على مستوى الوحدة: الفاحص التحذيري المحلي على سجل الاختبار fixture-action-logs-with-secrets.txt (500 سطر برمز ghp_ مختلَق)
// ومعه رموز وهمية تضيفها هذه الاختبارات (Bearer وAKIA وgithub_pat_…): تُرصد مواضعها بدقة (السطر والعمود والإزاحة) لتُظلَّل، ولا يُرصد غيرها
// في السجل، ولا يتغير النص ولا يُحذف منه شيء، وتقبل القائمة أنماطًا إضافية. الواجهة (اللافتة وإخلاء المسؤولية والتظليل) في preview-edit.test.tsx.
// كل الرموز الوهمية هنا تُركَّب وقت التشغيل من أجزاء، فلا يظهر رمز بصيغته الكاملة في المستودع خارج العينة المرجعية نفسها.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SECRET_PATTERNS, findingView, scanText } from '../../../src/modules/e/privacy-check';
import type { SecretPattern } from '../../../src/modules/e/privacy-check';
import { ROOT } from './helpers';

const FIXTURE = fs.readFileSync(path.join(ROOT, 'fixtures/logs/fixture-action-logs-with-secrets.txt'), 'utf8');

const fake = {
  ghp: ['ghp', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('_'),
  gho: ['gho', 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2'].join('_'),
  pat: ['github', 'pat', '11AAAAAA0abcdefghijklmn_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRS'].join('_'),
  bearer: `Bearer ${['eyJhbGciOiJIUzI1NiJ9', 'fakepayload', 'signature123'].join('.')}`,
  aws: ['AKIA', 'IOSFODNN7EXAMPLE'].join(''),
  key: ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' '),
  slack: ['xoxb', '1234567890', 'abcdefghij'].join('-'),
};

describe('TEST-PRIV-02: على سجل الاختبار المرجعي', () => {
  it('يرصد رمز ghp_ المختلَق في سطره وحده، بموضعه الدقيق، ولا يرصد غيره في السجل كله (500 سطر)', () => {
    const findings = scanText(FIXTURE);
    expect(FIXTURE.split('\n').length - 1).toBe(500);
    expect(findings).toHaveLength(1);
    const [f] = findings;
    expect(f?.patternId).toBe('github-token');
    expect(f?.line).toBe(457);
    expect(FIXTURE.slice(f?.start, f?.end)).toMatch(/^ghp_[A-Za-z0-9]{36}$/);
    const line = FIXTURE.split('\n')[(f?.line ?? 1) - 1] ?? '';
    expect(line).toContain('GH_TOKEN=');
    expect(line.slice((f?.column ?? 1) - 1)).toBe(FIXTURE.slice(f?.start, f?.end));
  });

  it('لا يغيّر النص ولا يحذف منه شيئًا: النص نفسه بعد الفحص، والرمز باقٍ فيه', () => {
    const before = FIXTURE;
    const findings = scanText(FIXTURE);
    expect(FIXTURE).toBe(before);
    expect(FIXTURE.slice(findings[0]?.start, findings[0]?.end)).toMatch(/^ghp_/);
    expect(FIXTURE).toContain(FIXTURE.slice(findings[0]?.start, findings[0]?.end));
  });

  it('وتُرصد معه الأنماط المضافة للاختبار (Bearer وAKIA وgithub_pat_ وgho_ ومفتاح خاص وSlack) بأسطرها بعد السطر 500', () => {
    const added = [`Authorization: ${fake.bearer}`, `aws_access_key_id = ${fake.aws}`, `token=${fake.pat}`, `OAUTH=${fake.gho}`, fake.key, `SLACK_TOKEN=${fake.slack}`];
    const text = `${FIXTURE}${added.join('\n')}\n`;
    const findings = scanText(text);
    const byId = (id: string) => findings.filter((f) => f.patternId === id);
    expect(findings.map((f) => f.patternId)).toEqual(
      expect.arrayContaining(['github-token', 'bearer', 'aws-access-key', 'github-fine-grained', 'private-key', 'slack-token']),
    );
    expect(byId('github-token')).toHaveLength(2); // ghp_ المرجعي وgho_
    expect(byId('bearer')).toHaveLength(1);
    expect(byId('bearer')[0]?.line).toBe(501);
    expect(text.slice(byId('bearer')[0]?.start, byId('bearer')[0]?.end)).toBe(fake.bearer);
    expect(byId('aws-access-key')[0]?.line).toBe(502);
    expect(text.slice(byId('aws-access-key')[0]?.start, byId('aws-access-key')[0]?.end)).toBe(fake.aws);
    expect(byId('github-fine-grained')[0]?.line).toBe(503);
    expect(text.slice(byId('github-fine-grained')[0]?.start, byId('github-fine-grained')[0]?.end)).toBe(fake.pat);
    expect(byId('github-token').map((f) => f.line)).toEqual([457, 504]);
    expect(byId('private-key')[0]?.line).toBe(505);
    expect(byId('slack-token')[0]?.line).toBe(506);
    // مرتبة بالبداية، والأعمدة تبدأ من 1.
    expect(findings.map((f) => f.start)).toEqual([...findings.map((f) => f.start)].sort((a, b) => a - b));
    expect(byId('aws-access-key')[0]?.column).toBe('aws_access_key_id = '.length + 1);
  });

  it('الفحص خالٍ من الحالة: تكراره يعطي النتيجة نفسها (لا تتسرب lastIndex بين الاستدعاءات)', () => {
    const text = `a ${fake.ghp} b\nc ${fake.aws}\n`;
    const first = scanText(text);
    expect(scanText(text)).toEqual(first);
    expect(scanText(text)).toEqual(first);
    for (const p of SECRET_PATTERNS) expect(p.regex.lastIndex).toBe(0);
  });
});

describe('الحدود: تنبيه حيث يلزم وصمت حيث لا يلزم', () => {
  it.each([
    ['قناع GitHub في الخطوة', '  token: ***'],
    ['Bearer مقنّع', 'Authorization: Bearer ***'],
    ['كلمة bearer في نثر', 'the bearer of bad news arrived late'],
    ['Bearer بكلمة عادية قصيرة', 'Bearer token'],
    ['بادئة ghp_ بلا ما يكفي بعدها', 'ghp_short'],
    ['AKIA داخل كلمة أطول', `XYZ${['AKIA', 'IOSFODNN7EXAMPLE'].join('')}`],
    ['AKIA بحروف صغيرة', `${['akia', 'iosfodnn7example'].join('')}`],
    ['AKIA أقصر من 20', 'AKIA1234'],
    ['sha التزام عادي', 'HEAD is now at 22c15d5f509f0a7076b74b3f0f48a740802103b4'],
    ['رابط مستودع', 'https://github.com/octo/demo/pull/4242'],
  ])('%s: لا يُرصد', (_name, line) => {
    expect(scanText(line)).toEqual([]);
  });

  it('الرمز بعد «_» أو «=» أو «:» أو بداية السطر يُرصد؛ ولا يُرصد داخل كلمة أطول', () => {
    expect(scanText(`GH_TOKEN=${fake.ghp}`)).toHaveLength(1);
    expect(scanText(`MY_${fake.ghp}`)).toHaveLength(1);
    expect(scanText(`token:${fake.ghp}`)).toHaveLength(1);
    expect(scanText(fake.ghp)).toHaveLength(1);
    expect(scanText(`x${fake.ghp}`)).toEqual([]);
  });

  it('رمز يتبعه Bearer: يُرصدان معًا (تراكب مسموح) بموضعين مختلفين', () => {
    const text = `Authorization: Bearer ${fake.pat}`;
    const ids = scanText(text).map((f) => f.patternId);
    expect(ids).toEqual(expect.arrayContaining(['bearer', 'github-fine-grained']));
  });

  it('القائمة قابلة للتوسعة: نمط إضافي يُرصد معها، ونمط بلا علم g يُقبل أيضًا', () => {
    const extra: SecretPattern = { id: 'internal', label: 'رمز داخلي', regex: /corp-[0-9]{6}/ };
    const found = scanText('ticket corp-123456 and ghp_notenoughchars', [extra]);
    expect(found.map((f) => f.patternId)).toEqual(['internal']);
    expect(found[0]).toMatchObject({ line: 1, column: 8, start: 7, end: 18 });
  });

  it('نص فارغ أو بلا مواضع: لا شيء', () => {
    expect(scanText('')).toEqual([]);
    expect(scanText('نص عربي عادي\nسطر ثانٍ')).toEqual([]);
  });

  it('أرقام الأسطر مع \\n والعربية: السطر الثالث والعمود 1 لرمز يبدأ سطرًا', () => {
    const text = `أول\nثانٍ\n${fake.aws} آخر\n`;
    expect(scanText(text)[0]).toMatchObject({ patternId: 'aws-access-key', line: 3, column: 1 });
  });
});

describe('مقتطف التظليل (findingView)', () => {
  it('يعرض السطر الذي فيه الموضع فقط: ما قبله وما بعده مقصوصان بنقاط، والموضع نفسه كاملًا إن قصر', () => {
    const long = 'x'.repeat(200);
    const text = `سطر سابق\n${long} ${fake.aws} ${long}\nسطر لاحق`;
    const [f] = scanText(text);
    const v = findingView(text, f as NonNullable<typeof f>);
    expect(v.match).toBe(fake.aws);
    expect(v.before.startsWith('…')).toBe(true);
    expect(v.before.length).toBe(61 + 0); // نقطة + 60 حرفًا (آخرها المسافة)
    expect(v.after.endsWith('…')).toBe(true);
    expect(`${v.before}${v.match}${v.after}`).not.toContain('سطر سابق');
    expect(`${v.before}${v.match}${v.after}`).not.toContain('سطر لاحق');
  });

  it('الموضع الطويل جدًا يُقصّ للعرض بنقطة، والنص الأصلي لا يُمسّ', () => {
    const body = 'A'.repeat(500);
    const text = `Bearer ${body}`;
    const [f] = scanText(text);
    const v = findingView(text, f as NonNullable<typeof f>);
    expect(v.match.endsWith('…')).toBe(true);
    expect(v.match.length).toBe(121);
    expect(text).toBe(`Bearer ${body}`);
  });
});
