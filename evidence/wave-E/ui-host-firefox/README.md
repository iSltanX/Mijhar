# تحقيق: سقوط جولة Firefox في فحص المضيف الرباعي

- التاريخ: 2026-10-23 · الفحص: `node tests/core/ui-host/browser/run.mjs chrome edge brave firefox` (`TEST-CORE-05` و`06`)
- **الحكم:** عيب في **أداة الفحص** لا في المنتج. وكيل CONNECT المحلي في `tests/core/ui-host/browser/firefox.mjs` قد يترك نفقًا نصف مغلق متوقف القراءة، فلا يُستدعى ردّ `proxy.close()` أبدًا، وتفرغ حلقة أحداث Node والوعد معلّق فتخرج برمز 13 بتحذير «unsettled top-level await» وتضيع نتيجة الجولة. يحدث في نحو 10% من جولات Firefox (3 من 31 أُجريت أثناء التحقيق).
- **الإصلاح** جُرّب في نسخة معزولة ثم **طُبِّق على `main` في التزام واحد** (`d98ca5d`، `firefox.mjs` وحده): [`proxy-fix.patch`](proxy-fix.patch). وبعده اجتاز الفحص الرباعي أربع مرات متتالية (مرتان قبل الالتزام ومرتان بعده)؛ [`after-fix/`](after-fix/).

## العَرَض

في السلسلة المتسلسلة للبوابة سقط الفحص مرتين (بعد دمج `MJ12` وبعد إصلاح التكامل): أنهت Chrome وEdge وBrave جولاتها ثم خرجت العملية برمز 13 بلا سطر لـFirefox ([`../ui-host-first-run-failed.txt`](../ui-host-first-run-failed.txt) و[`../ui-host-second-run-failed-after-load-check.txt`](../ui-host-second-run-failed-after-load-check.txt)). لا بند سقط؛ ولا خطأ مطبوع.

## ما استُبعد

| الفرضية | الفحص | النتيجة |
| :--- | :--- | :--- |
| وعد `vite.build` لا ينحسم قبل بدء الخادمين | 300 بناء متتال لكل هدف (`firefox` و`chromium`) في عملية واحدة | 600 بناء بلا توقف |
| التجاور مع `load-check` أو مع بناء جديد | بناء ثم `ui-host` الرباعي مباشرةً؛ `load-check` ثم Firefox منفردًا؛ 12 تكرارًا للبادئة كلها (بناء ← lint ← load-check ← فحص رباعي) | اجتازت كلها |
| Firefox يتعطل أو يموت وسط الجولة | الملفان الشخصيان المتبقيان من السقوطين: آخر كتابة بعد **17 ثانية** من إنشائهما مع إعادة كتابة `prefs.js` وملفات التخزين، أي إغلاق طبيعي بعد انتهاء البنود | جولة Firefox أتمّت بنودها وأُغلق المتصفح طبيعيًا |

وقرينة التوقيت: التشغيل الرباعي السليم يدوم نحو 50 ثانية (24 للجولات الكرومية و16.4 لـFirefox و10 لمؤقّت `sleep(10000)` الذي لا يُلغى)؛ والسقوط دام 52 ثانية. أي أن الفحص بلغ نهايته الطبيعية ثم لم يُرجع الوعد. وبقاء مجلد `mijhar-ui-host-ff-*` المؤقت (يُحذف في `finally` بعد `servers.close()`) في كل سقوط (ثلاثة مجلدات لثلاث وقائع) يثبت أن العالق هو `await servers.close()` أو ما قبله مباشرة.

## الالتقاط

أداة التتبع [`trace.mjs`](trace.mjs) (تُحمَّل بـ`node --import` ولا تعدّل المستودع) تسجّل المقابس وأوامر Marionette وحالة الخادمين، وتفرّغ المقابس غير المغلقة عند `beforeExit`. أُعيد السقوط في التكرار السابع من جولات Firefox منفردة ([`failing-run-trace.log`](failing-run-trace.log) و[`failing-run-output.txt`](failing-run-output.txt)):

```
[+16.766s] child firefox خرج code=null signal=SIGTERM
[+16.767s] https server close() استُدعي (_connections=0)
[+16.767s] http server close() استُدعي (_connections=1)
[+16.767s] https server أُغلق فعلًا
[+16.767s] beforeExit: الموارد النشطة = ["PipeWrap","TCPSocketWrap"]
[+16.768s]   http server: listening=false _connections=1
[+16.768s]     #8 http-conn فُتح +3.43s destroyed=false readyState=readOnly paused=true flowing=false
                readableEnded=false writableEnded=true handle=نعم bytesR=3889 bytesW=3741
[+16.768s] exit code=13
```

المقبس `#8` نفق مخدوم (`CONNECT github.com` عند +3.426s بعد `WebDriver:Refresh`) بقي 13 ثانية: جانب الكتابة أُنهي (`writableEnded`) والقراءة متوقفة (`paused`) ولم تنتهِ (`readableEnded=false`).

## الآلية

في الوكيل يُربط النفق بـ`pipe` في الاتجاهين ولا معالج لـ`close` سوى `error`:

1. ينهي الخادم المحلي جهة `upstream` (مثلًا بمهلة keep-alive؛ هذا السبب الأرجح لا المثبت)، فيُنهي `upstream.pipe(client)` جانب كتابة `client`.
2. `upstream` يُغلق فيُفكّ ربط `client.pipe(upstream)` فيتوقف `client` مؤقتًا (`unpipe` ← `pause()`).
3. تصل من Firefox بايتات بعد ذلك (تنبيه أو بداية طلب)، فتبقى في مخزن قراءة `client` غير المقروء، ثم يصل FIN. حدث `end` لا يُطلق قبل تفريغ المخزن، فلا يُدمَّر المقبس، ويبقى `proxy._connections=1`.
4. عند الإغلاق يغلق `proxy.close(cb)` مقبض الاستماع (فيخرج من الحلقة)، ولا يُستدعى `cb` لأن العدّاد لا يبلغ صفرًا. والمقبس المتوقف القراءة لا يُبقي مقبضًا نشطًا، فتفرغ الحلقة والوعد معلّق: Node تخرج برمز 13 قبل `fs.rmSync` وقبل `return result`.

عُزلت الآلية في [`tunnel-isolation.mjs`](tunnel-isolation.mjs) بلا Firefox ([`isolation-run.txt`](isolation-run.txt)): بلا إصلاح `proxy._connections=1` والخروج 13 بالتحذير نفسه؛ ومع معالجَي `close` المتقابلين `_connections=0` والخروج 0. (محاكاتان أوليتان لم تُنتجا التسرّب لأن مقبس «المتصفح» يغلق تلقائيًا؛ التسرّب يشترط إبقاء جانبه مفتوحًا `allowHalfOpen` وإرسال بايتات متأخرة.)

## الإصلاح والتحقق

[`proxy-fix.patch`](proxy-fix.patch) (22 سطرًا في `firefox.mjs`، فُحص `git apply --check` على `main`): معالجا `close` متقابلان بين النفق وجهته، و`client.resume()` للاتصال المرفوض، وإتلاف كل نفق متبقٍّ في `close()`. جُرّب في worktree مؤقت أُزيل بعد ذلك:

| | بلا إصلاح | بإصلاح |
| :--- | :--- | :--- |
| جولات Firefox المتتبَّعة | سقط واحد من 7 | 60 من 60 اجتازت |
| `_connections` عند `close()` | 1 في السقوط | 0 في 120 استدعاء (60 جولة × خادمان) |
| المقابس غير المغلقة عند الخروج | 1 | 0 في كل التكرارات |
| التشغيل الرباعي الكامل | سقط مرتين من 20 | اجتاز مرتين |
| معدل السقوط على كل ما أُجري أثناء التحقيق | 3 من 31 (نحو 10%) | 0 من 62 |

احتمال أن تنجح 60 جولة متتبَّعة صدفةً بمعدل 10% نحو 0.2%. [`loops-summary.txt`](loops-summary.txt).

## النطاق والمخاطر

- **طُبِّق الإصلاح** على `firefox.mjs` وحده بقرار المالك (`d98ca5d`)، وبقيت السكربتات السبعة الأخرى دون تعديل. ولا أثر للعيب على المنتج: الوكيل ملف اختبار، وأُنهيت كل البنود قبل العالق، و`TEST-CORE-05` و`06` اجتازا في 17 تشغيلًا رباعيًا على الشجرة نفسها (بعد إصلاح التكامل).
- **السطر `close` نفسه (ونمط النفق) مكرَّر في سبعة سكربتات أخرى**: `tests/modules/g/browser/mj12-check.mjs` و`tests/modules/a/browser/extension-run.mjs` و`tests/modules/browser/integration.mjs` و`tests/modules/browser/mj10-integration.mjs` و`tests/modules/d/browser/mj11-integration.mjs` و`evidence/wave-C/integration-check.mjs` و`evidence/MJ9/integration-check.mjs`. لم تسقط أيٌّ منها في هذه الجلسة، لكنها تحمل العيب الكامن نفسه (إن وقع فيها خرجت بالرمز 13 قبل كتابة نتائجها). لم أفحصها ولم أعدّلها.
- تفصيل جانبي غير مسبِّب: مؤقّت `sleep(10000)` في `finally` لا يُلغى فيطيل كل تشغيل 10 ثوانٍ.

## بعد التطبيق على `main`

الأمر: `node tests/core/ui-host/browser/run.mjs chrome edge brave firefox --out <مجلد>`، على رأس `d98ca5d` (الشجرة مطابقة للالتزام) في التشغيلين الأخيرين، وعلى الشجرة نفسها قبل الالتزام في الأولين.

| التشغيل | الخروج | المدة | المتصفحات الأربعة بلا خطأ | أعمدة الحكم «اجتاز» (من 24) | مجلدات `mijhar-ui-host-ff-*` المتبقية |
| :--- | :---: | :---: | :---: | :---: | :---: |
| قبل الالتزام #1 | 0 | 51s | نعم | 24 | 0 |
| قبل الالتزام #2 | 0 | 52s | نعم | 24 | 0 |
| بعد الالتزام #1 | 0 | 51s | نعم | 24 | 0 |
| بعد الالتزام #2 | 0 | 52s | نعم | 24 | 0 |

التقريران والنتائج الخام للتشغيلين الأخيرين في [`after-fix/run-1/`](after-fix/run-1/) و[`after-fix/run-2/`](after-fix/run-2/) (بلا لقطات). وطلبات `api.github.com` قبل المنح = 0 في الأربعة. تذكير: اجتاز الفحص 62 مرة متتالية بالإصلاح في التحقيق (60 جولة Firefox منفردة وتشغيلان رباعيان في نسخة معزولة) ثم 4 على `main`.
