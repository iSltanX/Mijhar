# أدلة التدقيق المستقل لـMijhar

هذه الملفات ناتجة من التدقيق المستقل الحالي عند `6e333faa7a063042e0d541caca810dd48fef748e`. لا تتضمن إصلاحات. راجع التقرير المصاحب لتفسير الشدة وحدود الأدلة؛ فشل الاختبارات المستقلة مقصود لأنه يكشف مخالفة السلوك المتوقع.

## محتويات المجلد

- `independent-reproductions.test.tsx`: تسعة سيناريوهات؛ `R1/R2` للسبب نفسه، و`R8` قلق لم تثبت صلته بتحديث حي على GitHub.
- `independent-browser.mjs`: تشغيل حزمة إنتاج مبنية حديثًا في Chrome مع صفحات معترضة محليًا، ورفض طلبات HTTPS الأخرى في السياق. لا يعتمد على حساب GitHub. مسار Chrome مضبوط لبيئة macOS التي أُجريت عليها التجربة.
- `logs/`: مخرجات الأوامر والمحاولات التمهيدية والنتائج النهائية ولقطات الصفحات الاصطناعية.
- `baseline-sha256.json`: بصمات الملفات المسجلة عند بدء التدقيق؛ لا يشمل جميع الملفات المهملة.
- `verify-baseline.py`: مقارنة للقراءة فقط. يقبل `--root` و`--copy` و`--baseline`؛ لا تكتب مخرجاته داخل المشروع.
- `SHA256SUMS`: بصمات الأدلة المسلّمة؛ لا يشمل الملف نفسه.

## إعادة التشغيل في نسخة جديدة خارج المشروع

تُنفذ هذه الأوامر فقط في نسخة مؤقتة، ولا يُضاف الاختبار المستقل إلى المشروع الأصلي. استبدل `/Volumes/iSltanXx/Projects/Brave/Mijhar-Audits/codex-independent-audit-20261023-2218-evidence` بالمسار المطلق لهذا المجلد. ينسخ مثال الاعتماديات نسخة `node_modules` الموجودة وقت إعادة التشغيل؛ لاستنساخ بيئة الاعتماديات بدقة يلزم مطابقة `package-lock.json` ونسخ الحزم المذكورة فيه. بيئة التدقيق استخدمت Node `v24.18.1` وnpm `11.16.0` وVitest `5.0.5`.

```sh
audit_copy=$(mktemp -d /private/tmp/mijhar-audit-replay.XXXXXX)
mkdir "$audit_copy/source" "$audit_copy/logs"
git -C /Volumes/iSltanXx/Projects/Brave/Mijhar archive 6e333faa7a063042e0d541caca810dd48fef748e | tar -x -C "$audit_copy/source"
cp -R /Volumes/iSltanXx/Projects/Brave/Mijhar/node_modules "$audit_copy/source/node_modules"
cd "$audit_copy/source"
npm run typecheck
npm run build
npm test
npm run lint:firefox
node scripts/load-check.mjs chrome edge brave firefox --dist dist --report ../logs/fresh-package-load.md
cp /Volumes/iSltanXx/Projects/Brave/Mijhar-Audits/codex-independent-audit-20261023-2218-evidence/independent-reproductions.test.tsx tests/independent-reproductions.test.tsx
npx vitest run tests/independent-reproductions.test.tsx
cp /Volumes/iSltanXx/Projects/Brave/Mijhar-Audits/codex-independent-audit-20261023-2218-evidence/independent-browser.mjs independent-browser.mjs
node independent-browser.mjs
```

النتيجة المتوقعة عند الالتزام المذكور: الطقم الأصلي `1661 passed / 2 skipped`، والاختبار المستقل `9 failed`. برنامج المتصفح يخرج `0` عند اكتمال التنفيذ ويسجل النتائج؛ يُقرأ `oldTextLost` وعدد المضيفات لتحديد العيب، فلا يُعدّ `exit 0` نجاحًا وظيفيًا. تشغيل المتصفحات يحتاج أن تسمح البيئة بإطلاق browser بملف تعريف مؤقت. لا تتضمن الأوامر إصلاحًا أو نشرًا أو كتابة على GitHub.

السجلات الأولية `typecheck.log/build.log/tests.log/tests-complete.log` تعكس نقصًا مؤقتًا في نسخة التشخيص قبل استكمال الملفات، و`load-check.log` يعكس قيود إطلاق المتصفح. النتائج النهائية المعتمدة تحمل `*-complete` للبناء والأنواع، و`tests-final-baseline.log`، و`load-check-unrestricted.log`، و`reproductions-final.log`. كل التفاصيل موضحة في التقرير.
