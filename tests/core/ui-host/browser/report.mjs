// يولّد browser-report.md من browser-results.json: جدول لكل بند ولكل متصفح، وحكم كل بند مشتق من القياس لا مكتوب بيد.

const ORDER = ['chrome', 'edge', 'brave', 'firefox'];
const yes = (v) => (v ? 'نعم' : 'لا');
const cell = (v) => (v === undefined || v === null ? '—' : String(v).replace(/\|/g, '\\|').replace(/\n/g, ' '));
const verdict = (ok) => (ok ? '**اجتاز**' : '**فشل**');
const isFirefox = (key) => key === 'firefox';

export function judge(key, r) {
  const s = r.steps ?? {};
  const iso = s.isolation;
  const d = s.drawer;
  const tg = s.toggles;
  const p = s.permission;
  const n = s.native;
  const c = s.command;
  const out = {};
  out.isolation = Boolean(
    iso && iso.control.opened && iso.hostile.opened && iso.uiDiffs.length === 0 && !iso.control.pageDiffs.length && !iso.hostile.pageDiffs.length && iso.control.hit === 'drawer' && iso.hostile.hit === 'drawer' && iso.hostile.cspBlockedInlineStyle && tg && !tg.leakAllOffVsMounted.length && tg.documentSheetsAllOff.styleElements === 0 && tg.documentSheetsDrawerOpen.styleElements === 0 && tg.documentSheetsDrawerOpen.adopted === 0,
  );
  out.drawer = Boolean(d && d.focusOnOpen.inside === 'h1#mj-drawer-title' && d.escapeClosed && d.toggleOpens && d.toggleCloses && d.closeButton && d.toggleFromDrawerOff && d.toggleFromDrawerOn && d.settingsTabInDrawer.toggles === 8 && d.settingsTabInDrawer.textFields === 0 && !d.settingsTabInDrawer.grantButton && d.settingsTabInDrawer.openOptions);
  out.native = Boolean(n && n.openResult?.opened && (isFirefox(key) ? n.sidebarView?.[0]?.ready === 'true' && n.sidebarView[0].tabs.length === 5 : n.contexts?.some((x) => x.url?.endsWith('/sidepanel.html')) && n.panelPageTabs?.length === 5));
  out.toggles = Boolean(tg && tg.perUnit.length === 8 && tg.perUnit.every((u) => u.off && u.on && u.checked === false) && tg.allOffMounted.length === 0 && tg.afterReloadMounted.length === 0 && tg.afterReloadChecked.every((v) => v === false) && tg.allOnMounted.length === 8);
  const before = p && p.initialState === 'denied' && p.containsInitially === false && p.fetchWithout?.sent === false && p.requestsBeforeAnything === 0 && p.requestsWhileNotGranted === 0;
  out.permission = Boolean(
    before &&
      (isFirefox(key)
        ? p.requestWithoutClick?.rejected && p.stateAfterClick === 'granted' && p.containsAfterGrant && p.fetchWith?.sent && p.requestsAfterGrant === 1 && p.stateAfterRevoke === 'denied' && p.fetchAfterRevoke?.sent === false && p.requestsAfterRevoke === 1 && p.stateAfterBrowserRevoke === 'denied' && p.requestsTotal === 1
        : p.clickStartsRequest?.buttonDisabledWhilePending && p.clickStartsRequest.contains === false && p.requestsTotal === 0),
  );
  out.command = Boolean(
    c &&
      (isFirefox(key)
        ? c.registered?.shortcut === 'Alt+G' && c.nativeToggleCloses && c.nativeToggleOpens && c.drawerPref?.drawer === 'open' && c.drawerPref.sidebarUnchanged && c.drawerPrefClosesOnSecond && c.wakeDrawerPref?.drawer === 'open' && !c.wakeDrawerPref.sidebarOpened && c.afterRebind?.shortcut === 'Alt+Shift+M' && c.optionsAfterRebind === 'Alt+Shift+M' && c.shortcutsPageOpened?.length > 0
        : c.registered?.shortcut && c.nativePrefWithActivation?.outcome?.outcome === 'native' && c.nativePrefNoGesture?.drawer === 'open' && c.secondCommandCloses && c.nativeWhenDrawerPreferred?.opened === false && c.drawerPref?.drawer === 'open' && c.drawerPrefAfterWorkerRestart?.workerRestarted && c.drawerPrefAfterWorkerRestart.drawer === 'open' && c.nativeRestored?.opened && c.afterRebind?.shortcut !== c.registered.shortcut && c.optionsAfterRebind === c.afterRebind?.shortcut && c.shortcutsPageUrl?.includes('extensions/shortcuts')),
  );
  return out;
}

export function renderReport(all) {
  const keys = ORDER.filter((k) => all[k]);
  const lines = [
    '# تجارب المتصفحات الفعلية لـT-1.4 (`tests/core/ui-host/browser/run.mjs`)',
    '',
    `- التاريخ: ${all.date}. المتصفحات تباعًا بملف تعريف مؤقت جديد لكل منها يُحذف بعد التشغيل، بلا شبكة خارجية: في عائلة Chromium تُخدَم \`github.com\` و\`api.github.com\` بـPlaywright route، وفي Firefox من خادم HTTPS محلي خلف وكيل \`CONNECT\` يرفض كل مضيف آخر (بجهة إصدار اختبارية موثوقة في ملف التعريف المؤقت وحده).`,
    '- الإضافة الاختبارية (`tests/core/ui-host/browser/build.mjs`، لا تُشحن): الحزمة الحقيقية (المانيفست واللوحة والإعدادات وسكربت المحتوى والخلفية) مع ثماني وحدات وهمية أ–ح تركّب كلٌّ منها سطح Shadow DOM عبر `mountSurface`، وصفحة `test.html` وخطافات خلفية للاختبار.',
    '- النتائج الخام: [`browser-results.json`](browser-results.json). لقطات الدرج على صفحتي الضبط والمعادية: [`screens/`](screens/).',
    '',
    '## الحكم',
    '',
    '| المتصفح | الإصدار | TEST-CORE-05: العزل | الدرج | اللوحة الأصلية | TEST-CORE-06: المفاتيح الثمانية | الصلاحية والشبكة | الأمر والاختصار |',
    '| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |',
  ];
  for (const key of keys) {
    const r = all[key];
    if (r.skipped || r.error) {
      lines.push(`| ${r.label} | ${cell(r.browserVersion)} | ${r.skipped ? `لم يُجرَ: ${cell(r.skipped)}` : `خطأ: ${cell(r.error.split('\n')[0])}`} | — | — | — | — | — |`);
      continue;
    }
    const j = judge(key, r);
    lines.push(`| ${r.label} | ${cell(r.browserVersion)} | ${verdict(j.isolation)} | ${verdict(j.drawer)} | ${verdict(j.native)} | ${verdict(j.toggles)} | ${verdict(j.permission)} | ${verdict(j.command)}${isFirefox(key) ? '' : ' (عدا الضغطة الفعلية: لم تُجرَ آليًا)'} |`);
  }
  const ran = keys.filter((k) => all[k].steps);

  lines.push(
    '',
    '## TEST-CORE-05 — عزل الأنماط في الاتجاهين',
    '',
    'تُفتح صفحتا طلب دمج بالبنية نفسها: **الضبط** (`fixtures/adversarial/control-pr.html`) و**المعادية** (`hostile-pr.html` بـ`hostile.css` وترويسة `Content-Security-Policy: style-src \'self\'`). في كلٍّ منهما تُركَّب الوحدات الوهمية الثماني ويُفتح الدرج، ثم تُقاس الأنماط المحسوبة لثلاثة عشر عنصرًا داخل الواجهات (مضيف الدرج وموضعه وإطاره وعنوانه وتبويباته وزر الإغلاق والحالة الفارغة وما يعلو مركزه، ومضيف سطح الوحدة (أ) وإطاره وزره ونصه) في 37 خاصية. **الداخل:** يجب أن تتطابق القياسات بين الصفحتين. **الخارج:** أنماط عناصر الصفحة التي تحمل أسماء أصناف الواجهة نفسها (`.mj-root` و`.tab` و`.toggle-switch` و`.drawer` و`.btn.btn-primary` لـGitHub) لا تتغير بفتح الدرج ولا بإزالة الواجهات، ولا تُضاف ورقة أنماط إلى المستند.',
    '',
    '| المتصفح | الطبقة العليا (popover) | طريقة الأنماط (الدرج / الوحدة) | اختلافات داخل الواجهة بين الضبط والمعادية | ما يعلو مركز الدرج (ضبط / معادية) | CSP منعت أنماط الصفحة المضمّنة | تغيّر أنماط الصفحة بفتح الدرج | تغيّرها بإزالة الواجهات | `<style>` وأوراق متبنّاة في المستند | عينة: خط الدرج وخلفيته |',
    '| :--- | :---: | :--- | :---: | :--- | :---: | :---: | :---: | :---: | :--- |',
  );
  for (const key of ran) {
    const { isolation: i, toggles: t } = all[key].steps;
    lines.push(
      `| ${all[key].label} | ${yes(i.control.meta?.popoverOpen && i.hostile.meta?.popoverOpen)} | ${cell(i.control.meta?.styleMode)} / ${cell(i.control.fakeMeta?.styleMode)} | ${i.uiDiffs.length} من ${i.probes}×${i.props} | ${cell(i.control.hit)} / ${cell(i.hostile.hit)} | ${yes(i.hostile.cspBlockedInlineStyle)} | ${i.control.pageDiffs.length + i.hostile.pageDiffs.length} | ${t.leakAllOffVsMounted.length} | ${t.documentSheetsDrawerOpen.styleElements} و${cell(t.documentSheetsDrawerOpen.adopted)} | \`${cell(i.sample.drawerFont?.split(',')[0])}\` · ${cell(i.sample.drawerBg)} |`,
    );
  }
  const diffs = ran.flatMap((k) => all[k].steps.isolation.uiDiffs.map((d) => `${all[k].label}: \`${d.key}.${d.prop}\` ${cell(JSON.stringify(d.a))} ← ${cell(JSON.stringify(d.b))}`));
  lines.push('', diffs.length ? `الاختلافات: ${diffs.join('؛ ')}` : 'لا اختلاف في أي خاصية مقيسة داخل الواجهة بين الصفحتين في أي متصفح.', '');
  lines.push('موضع الدرج يُقاس نسبةً إلى الكتلة الحاوية الأولى (عرض المستند دون شريط التمرير): في Firefox يأخذ شريط التمرير الكلاسيكي 15 بكسل حيث يظهر، والصفحة المعادية تخفيه، فالموضع المطلق يختلف دون تسرب نمط. وأبعاد عناصر الصفحة تتغير بإدراج الوحدات الوهمية في `main` (محتوى جديد)، فتُقارن خصائص النمط وحدها في بند «إزالة الواجهات».', '');

  lines.push('## الدرج داخل الصفحة', '', '| المتصفح | التركيز عند الفتح | Escape يغلقه | الفتح والإغلاق بالرسالة | زر الإغلاق | تبويب الإعدادات في الدرج: مفاتيح / حقول نص / زر طلب صلاحية / زر صفحة الإعدادات | مفتاح (ح) من الدرج: يزيل / يعيد |', '| :--- | :--- | :---: | :---: | :---: | :--- | :---: |');
  for (const key of ran) {
    const d = all[key].steps.drawer;
    const st = d.settingsTabInDrawer;
    lines.push(`| ${all[key].label} | \`${cell(d.focusOnOpen.inside)}\` | ${yes(d.escapeClosed)} | ${yes(d.toggleOpens && d.toggleCloses)} | ${yes(d.closeButton)} | ${st.toggles} / ${st.textFields} / ${yes(st.grantButton)} / ${yes(st.openOptions)} | ${yes(d.toggleFromDrawerOff)} / ${yes(d.toggleFromDrawerOn)} |`);
  }

  lines.push('', '## اللوحة الجانبية الأصلية (`HYP-14`)', '', 'تُفتح بنقر فعلي في صفحة إضافة (`sidePanel.open` في عائلة Chromium، و`sidebarAction.open` في Firefox).', '', '| المتصفح | الفتح بالنقر | وثيقة اللوحة المفتوحة | التبويبات المرسومة |', '| :--- | :--- | :--- | :--- |');
  for (const key of ran) {
    const n = all[key].steps.native;
    const doc = isFirefox(key) ? (n.sidebarView?.[0] ? `\`sidebar\`: ${n.sidebarView[0].url.split('/').pop()} (ready=${n.sidebarView[0].ready})` : 'لا') : n.contexts?.length ? `\`SIDE_PANEL\`: ${n.contexts.map((x) => x.url.split('/').pop()).join('، ')}` : 'لا';
    const tabs = isFirefox(key) ? n.sidebarView?.[0]?.tabs : n.panelPageTabs;
    lines.push(`| ${all[key].label} | ${n.openResult?.opened ? 'نجح' : `فشل: ${cell(n.openResult?.error)}`} | ${doc} | ${tabs ? `${tabs.length}: ${tabs.join('، ')}` : '—'}${isFirefox(key) ? '' : ' (في الصفحة نفسها مفتوحةً تبويبًا)'} |`);
  }
  lines.push('', '**الحكم على `HYP-14`:** ' + (ran.filter((k) => !isFirefox(k)).every((k) => judge(k, all[k]).native) ? 'ثبتت في Edge وBrave كما في Chrome في الإصدارات المقيسة: يُفتح `sidePanel.open` بنقر وتُحمَّل وثيقة اللوحة في سياق `SIDE_PANEL`. والعرض المرئي للوحة في نافذة المتصفح لا يظهر في وضع بلا نافذة، فيُتحقق منه في الجولة الفعلية.' : 'لم تثبت في كل متصفح مقيس: انظر الجدول.'), '');

  lines.push('## TEST-CORE-06 — مفاتيح الوحدات الثماني', '', 'تُبدَّل المفاتيح الثمانية واحدًا واحدًا من صفحة الإعدادات (تبويب مستقل) وتُرصد الوحدة الوهمية في تبويب GitHub المفتوح، ثم يُعاد تحميل التبويبين، ثم تُشغَّل كلها من جديد.', '', '| المتصفح | أُزيلت كل وحدة بإيقاف مفتاحها | بعد إعادة التحميل: وحدات مركّبة / مفاتيح مفعَّلة | عادت كل وحدة بتشغيل مفتاحها | النتيجة |', '| :--- | :--- | :--- | :--- | :---: |');
  for (const key of ran) {
    const t = all[key].steps.toggles;
    lines.push(`| ${all[key].label} | ${t.perUnit.filter((u) => u.off).length} من 8 | ${t.afterReloadMounted.length} / ${t.afterReloadChecked.filter(Boolean).length} | ${t.perUnit.filter((u) => u.on).length} من 8 (${t.allOnMounted.join('، ')}) | ${verdict(judge(key, all[key]).toggles)} |`);
  }

  lines.push('', '## صلاحية `api.github.com` الاختيارية وتدقيق الشبكة', '', 'يُعدّ كل طلب إلى `api.github.com` من كل السياقات (الصفحات وservice worker في Chromium، وكل ما يصل إلى الخادم المحلي في Firefox). `fetchApiGithub` هي البوابة الوحيدة إليه.', '', '| المتصفح | الحالة الأولى | طلب قبل المنح | طلب الصلاحية بلا نقر | طلبات قبل المنح | النقر على «امنح» | بعد المنح: الحالة / الطلب | «اسحب» | بعد السحب: الطلب | السحب من إعدادات المتصفح | مجموع طلبات api.github.com | مضيفات أخرى |', '| :--- | :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- | :--- | :---: | :--- |');
  for (const key of ran) {
    const p = all[key].steps.permission;
    const net = all[key].network ?? {};
    const refused = isFirefox(key) ? `لا شيء خرج؛ رُفض في الوكيل: ${(net.refusedHosts ?? []).length} مضيفًا لخدمات المتصفح` : (net.other ?? []).length ? cell(net.other.join('، ')) : 'لا شيء';
    if (isFirefox(key)) {
      lines.push(`| ${all[key].label} | ${cell(p.initialState)} | ${p.fetchWithout?.sent ? 'أُرسل' : 'رُفض بلا إرسال'} | ${p.requestWithoutClick?.rejected ? `رفضه المتصفح: «${cell(p.requestWithoutClick.rejected)}»` : cell(JSON.stringify(p.requestWithoutClick))} | ${p.requestsWhileNotGranted} | مُنحت (بلا نافذة: \`extensions.webextOptionalPermissionPrompts=false\`) | ${cell(p.stateAfterClick)} / ${p.fetchWith?.sent ? `أُرسل (${p.fetchWith.status})` : 'لم يُرسل'} | ${cell(p.stateAfterRevoke)} | ${p.fetchAfterRevoke?.sent ? 'أُرسل' : 'رُفض بلا إرسال'} | ${cell(p.stateAfterBrowserRevoke)} | ${p.requestsTotal} | ${refused} |`);
    } else {
      lines.push(`| ${all[key].label} | ${cell(p.initialState)} | ${p.fetchWithout?.sent ? 'أُرسل' : 'رُفض بلا إرسال'} | — (Playwright يضع إشارة فعل مستخدم مع كل تقييم) | ${p.requestsWhileNotGranted} | فتح نافذة المتصفح (الزر معطَّل ريثما تُحسم، والحالة ${cell(p.clickStartsRequest?.state)}) | لم يُجرَ آليًا: النافذة لا تُقبل آليًا | لم يُجرَ آليًا | — | — | ${p.requestsTotal} | ${refused} |`);
    }
  }
  lines.push('', 'في عائلة Chromium لا تبلغ CDP نافذة طلب الصلاحية، و`chrome.developerPrivate.addHostPermission` لا يمنح الصلاحيات الاختيارية (قيس: يقبل الاستدعاء ولا تتغير `contains`)؛ فالمنح والسحب الفعليان قيسا آليًا في Firefox، ويُجرَيان في Chromium بنقرة فعلية.', '');

  lines.push('## الأمر `toggle-panel` واختصاره المؤقت', '', '| المتصفح | الاختصار المسجّل | الأصلية عبر المعالج | بلا فعل مستخدم ← الدرج | تفضيل «الدرج» | بعد نوم الخلفية وإيقاظها | إعادة الربط من إعدادات المتصفح | صفحة الإعدادات تعرض الجديد | زر «غيّر الاختصار» | الضغطة الفعلية |', '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
  for (const key of ran) {
    const c = all[key].steps.command;
    if (isFirefox(key)) {
      lines.push(`| ${all[key].label} | \`${cell(c.registered?.shortcut)}\` (<key> ${cell(c.keyElement?.modifiers)}+${cell(c.keyElement?.key)}) | يبدّل الشريط الجانبي: إغلاق ${yes(c.nativeToggleCloses)}، فتح ${yes(c.nativeToggleOpens)} | — (الاختصار يحمل إشارة فعل المستخدم) | الدرج فُتح ${yes(c.drawerPref?.drawer === 'open')} والشريط لم يُمس ${yes(c.drawerPref?.sidebarUnchanged)} | ${cell(c.suspendedBeforeWake)} (${cell(c.suspendMethod)}) ثم الاختصار: الدرج ${yes(c.wakeDrawerPref?.drawer === 'open')}، الشريط ${yes(c.wakeDrawerPref?.sidebarOpened)} | \`${cell(c.afterRebind?.shortcut)}\` عبر ${cell(c.reboundVia)} | \`${cell(c.optionsAfterRebind)}\` | ${c.shortcutsPageOpened?.length ? 'فتح about:addons' : 'لا'} | مسار الضغطة نفسه: \`doCommand\` على عنصر <key> الذي يسجّله Firefox للاختصار |`);
    } else {
      const r = c.drawerPrefAfterWorkerRestart;
      lines.push(`| ${all[key].label} | \`${cell(c.registered?.shortcut)}\` | ${cell(c.nativePrefWithActivation?.outcome?.outcome)} | الدرج ${yes(c.nativePrefNoGesture?.drawer === 'open')} («${cell(c.nativePrefNoGesture?.outcome?.detail)}»)، والثاني يغلقه ${yes(c.secondCommandCloses)} | الأصلية تُرفض («${cell(c.nativeWhenDrawerPreferred?.error)}») والدرج ${yes(c.drawerPref?.drawer === 'open')} | service worker أُعيد تشغيله ${yes(r?.workerRestarted)} والدرج ${yes(r?.drawer === 'open')} | \`${cell(c.afterRebind?.shortcut)}\` عبر ${cell(c.reboundVia)} | \`${cell(c.optionsAfterRebind)}\` | فتح \`${cell(c.shortcutsPageUrl)}\` | ${cell(c.keystroke)} |`);
    }
  }
  lines.push('', 'قيد قِيس في تجربة مستكشفة قبل البناء ويحكم التصميم (`src/core/ui-host/commands.ts`): فتح اللوحة الأصلية لا يُقبل إلا داخل فعل المستخدم، وFirefox يرفضه بعد أي `await` داخل `onCommand` («sidebarAction.toggle may only be called from a user input handler»). لذا يفتح المعالج اللوحة متزامنًا قبل أي انتظار، ويُطبَّق تفضيل «الدرج» مسبقًا حيث يُقرأ متزامنًا: `sidePanel.setOptions({ enabled: false })` يحفظه المتصفح في عائلة Chromium (فيرفض `open` ويُفتح الدرج)، وانعكاس في `localStorage` صفحة الخلفية في Firefox.', '');
  return lines.join('\n');
}
