# تواريخ ملفات لمرساة السطر (`T-8.3`)

- `extract.mjs` يستخرج تواريخ الملفات التسعة التي قاسها `T-0.4` (`AC-S4.4`) من نسخ `git clone --bare` محلية لمستودعات
  `expressjs/express` و`psf/requests` و`pallets/flask` و`axios/axios`، بدءًا من «رأس الملف» المسجَّل في
  `evidence/T-0.4/raw/reanchor-*.json`، فيتكرر التاريخ نفسه.
- `flask-readme.json`: تاريخ `pallets/flask` ‏`README.md` (10 مراجعات، من `85cc710464`)، مضمَّن ليجري اختبار التوزيع دون شبكة.
  نصه من مشروع Flask بترخيص BSD-3-Clause (حقوق Pallets).
- التواريخ الثمانية الأخرى (نحو 2 MB) لا تُضمَّن: يولّدها `extract.mjs` في مجلد مؤقت، ثم يقيسها
  `MIJHAR_HISTORIES=<الملف> npx vitest run tests/modules/g/anchor/histories.test.ts`، والنتيجة في `evidence/T-8.3/`.
