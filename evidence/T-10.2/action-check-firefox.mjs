#!/usr/bin/env node
// MJ26، T-10.2: زر مِجهَر في شريط أدوات Firefox يفتح اللوحة (الشريط الجانبي) ويغلقها، بنقرة على عنصر الزر نفسه في واجهة المتصفح من سياق chrome
// (Marionette)، لا باستدعاء معالج الإضافة. ويُقرأ بعدها حال الشريط الجانبي من SidebarController. وفي عائلة Chromium لا تبلغ الأتمتة شريط الأدوات
// (ولا مسرّعات المتصفح في macOS، evidence/wave-E/ui-host/browser-report.md)، فيُجرى هناك بنقرة فعلية.
// الاستعمال: npm run build && node evidence/T-10.2/action-check-firefox.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, firefoxSession, sleep } from '../../tests/modules/d/token/browser/drivers.mjs';

const session = await firefoxSession({ extDir: path.join(ROOT, 'dist/firefox'), githubReply: () => ({ status: 404, type: 'text/plain', body: 'not found' }), apiReply: () => ({ message: 'Not Found' }) });
const out = { browser: 'Firefox', version: session.browserVersion, steps: [] };
const state = () =>
  session.chrome(`const w = Services.wm.getMostRecentWindow('navigator:browser'); const sc = w.SidebarController; return { open: Boolean(sc?.isOpen), current: sc?.currentID ?? null, title: w.document.getElementById('sidebar-title')?.value ?? w.document.getElementById('sidebar-title')?.textContent ?? null };`);
try {
  const button = await session.chrome(`
    const w = Services.wm.getMostRecentWindow('navigator:browser');
    const widgetId = 'mijhar_bysltan_com-browser-action';
    // إجراء الإضافة في Firefox الحديث داخل لوحة الإضافات الموحّدة ما لم يُثبَّت؛ يُثبَّت في الشريط كما يفعل المستخدم ليصير زرًّا ظاهرًا.
    try { w.CustomizableUI.addWidgetToArea(widgetId, w.CustomizableUI.AREA_NAVBAR); } catch (e) {}
    const node = w.document.getElementById(widgetId);
    return { widgetId, found: Boolean(node), tag: node?.localName ?? null, label: node?.getAttribute('label') ?? node?.querySelector('[label]')?.getAttribute('label') ?? null, area: w.CustomizableUI.getPlacementOfWidget(widgetId)?.area ?? null, children: [...(node?.children ?? [])].map((c) => c.localName + '.' + [...c.classList].join('.')) };`);
  out.button = button;
  console.log(JSON.stringify(button));
  out.steps.push({ step: 'قبل النقر', ...(await state()) });
  // نقرة WebDriver على عنصر الزر في واجهة المتصفح (Marionette في سياق chrome): تمرّ بمعالج النقر الذي يمرّ به نقر المستخدم.
  const click = async () => {
    const found = await session.chromeCommand('WebDriver:FindElement', { using: 'css selector', value: '#mijhar_bysltan_com-browser-action toolbarbutton, #mijhar_bysltan_com-browser-action button' });
    const element = found.value ?? found;
    const ref = element[Object.keys(element)[0]];
    await session.chromeCommand('WebDriver:ElementClick', { id: ref });
    return { clicked: true };
  };
  out.click1 = await click();
  await sleep(1500);
  out.steps.push({ step: 'بعد النقرة الأولى', ...(await state()) });
  out.click2 = await click();
  await sleep(1200);
  out.steps.push({ step: 'بعد النقرة الثانية', ...(await state()) });
} finally {
  await session.close();
}
const [before, first, second] = out.steps;
out.ok = Boolean(out.button?.found) && !before.open && first.open && /mijhar/i.test(first.current ?? '') && !second.open;
fs.writeFileSync(path.join(ROOT, 'evidence/T-10.2/action-firefox-result.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
