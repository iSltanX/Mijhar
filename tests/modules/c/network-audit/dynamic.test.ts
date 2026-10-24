// الفحص الديناميكي لسجل الشبكة (T-4.5، AC-C6، TEST-PRIV-01 شطر السجل): تصنيف طلبات تشغيل الترجمة وكشف تسرّب نص الصفحة، على سجلات مصطنعة تحاكي ما يسجّله CDP.
// هذا اختبار الأداة؛ والسجل الحقيقي في المتصفحات من scripts/network-audit.mjs (evidence/T-4.5).
import { describe, expect, it } from 'vitest';
import { auditWindow, classifyRequests, findLeaks, hostOf, isNetworkRequest, normalizeForSearch } from '../../../../src/modules/c/network-audit/index.mjs';

const req = (url: string, extra: Record<string, unknown> = {}) => ({ url, method: 'GET', type: 'Fetch', ...extra });
const CANARIES = ['This extension helps Arabic readers understand repositories', 'The side panel opens from the toolbar'];

describe('classifyRequests', () => {
  it('نافذة بلا طلبات تجتاز', () => {
    expect(classifyRequests([])).toMatchObject({ total: 0, network: 0, violations: [] });
  });

  it('موارد الإضافة وdata: وblob: وabout: ليست اتصالًا', () => {
    const r = classifyRequests([req('chrome-extension://abc/content.js'), req('moz-extension://abc/x.css'), req('data:text/plain,hi'), req('blob:https://github.com/1'), req('about:blank')]);
    expect(r).toMatchObject({ total: 5, ignored: 5, network: 0, violations: [] });
  });

  it('أي طلب شبكة تحت ج-2 مخالفة: لا مضيف مسموح حتى github.com (مسار الترجمة لا يتصل بشيء)', () => {
    const r = classifyRequests([req('https://github.com/favicon.ico')]);
    expect(r.violations).toEqual([expect.objectContaining({ host: 'github.com', rule: 'host-not-allowed' })]);
  });

  it('مضيف ترجمة سحابي مخالفة مسماة', () => {
    const r = classifyRequests([req('https://translate.googleapis.com/translate_a/single?q=x'), req('https://eu.api.deepl.com/v2/translate', { method: 'POST' })]);
    expect(r.violations.map((v: { rule: string }) => v.rule)).toEqual(['cloud-translation-host', 'cloud-translation-host']);
  });

  it('مضيف النموذج المعلن مسموح (بعد موافقة) وما سواه مخالفة: القاعدة نفسها لو كان الخيار ج-1', () => {
    const r = classifyRequests([req('https://models.example.org/opus-mt-en-ar/model.onnx'), req('https://other.example.org/x')], { allowedHosts: ['models.example.org'] });
    expect(r.allowed).toHaveLength(1);
    expect(r.violations).toEqual([expect.objectContaining({ host: 'other.example.org', rule: 'host-not-allowed' })]);
  });

  it('WebSocket (webSocketCreated) يُحسب اتصالًا', () => {
    expect(classifyRequests([{ url: 'wss://tracker.example.org/s', method: 'WEBSOCKET' }]).violations).toHaveLength(1);
  });

  it('isNetworkRequest وhostOf', () => {
    expect(isNetworkRequest(req('https://a.example/x'))).toBe(true);
    expect(isNetworkRequest(req('chrome-extension://a/b'))).toBe(false);
    expect(hostOf('https://Api.GitHub.com:443/x?y=1')).toBe('api.github.com');
    expect(hostOf('not a url')).toBe('');
  });
});

describe('findLeaks (نص الصفحة في الطلب)', () => {
  it('عبارة من النص في عنوان الطلب مرمَّزة بـURL أو بـ+ تُكشف', () => {
    const a = findLeaks([req(`https://x.example/?q=${encodeURIComponent(CANARIES[0]!)}`)], CANARIES);
    expect(a).toEqual([expect.objectContaining({ where: 'url', canary: CANARIES[0], host: 'x.example' })]);
    const b = findLeaks([req(`https://x.example/?q=${CANARIES[1]!.replace(/ /g, '+')}`)], CANARIES);
    expect(b).toHaveLength(1);
  });

  it('في الجسم وفي الترويسات، بلا حساسية لحالة الأحرف ولا للمسافات', () => {
    const body = findLeaks([req('https://x.example/log', { method: 'POST', postData: `data=${CANARIES[1]!.toUpperCase().replace(/ /g, '  ')}` })], CANARIES);
    expect(body).toEqual([expect.objectContaining({ where: 'body' })]);
    const header = findLeaks([req('https://x.example/', { headers: { 'x-text': CANARIES[0]! } })], CANARIES);
    expect(header).toEqual([expect.objectContaining({ where: 'headers' })]);
  });

  it('طلب بلا أثر من النص لا يُعدّ تسربًا، والعبارة القصيرة جدًا تُتجاهل', () => {
    expect(findLeaks([req('https://x.example/?q=hello')], CANARIES)).toEqual([]);
    expect(findLeaks([req('https://x.example/?q=the')], ['the'])).toEqual([]);
  });

  it('طلب إلى مورد إضافة لا يُفحص (ليس شبكة)', () => {
    expect(findLeaks([req(`chrome-extension://a/?q=${CANARIES[0]}`)], CANARIES)).toEqual([]);
  });

  it('normalizeForSearch يفك الترميز مرتين ويوحّد المسافات', () => {
    expect(normalizeForSearch('A%2520B+C')).toBe('a b c');
  });
});

describe('auditWindow (الحكم)', () => {
  it('نافذة نظيفة تجتاز', () => {
    expect(auditWindow([req('chrome-extension://a/b')], CANARIES)).toMatchObject({ pass: true, leaks: [], violations: [] });
  });

  it('الضابط الإيجابي: طلب سحابي بنص الصفحة في العنوان وإشارة بجسم النص ← لا تجتاز، ومخالفتان وتسربان', () => {
    const control = [
      req(`https://translate.googleapis.com/translate_a/single?client=gtx&q=${encodeURIComponent(CANARIES[0]!)}`),
      req('https://collector.invalid/log', { method: 'POST', type: 'Ping', postData: CANARIES[1] }),
    ];
    const r = auditWindow(control, CANARIES);
    expect(r.pass).toBe(false);
    expect(r.violations.map((v: { rule: string }) => v.rule)).toEqual(['cloud-translation-host', 'host-not-allowed']);
    expect(r.leaks.map((l: { where: string }) => l.where).sort()).toEqual(['body', 'url']);
  });
});
