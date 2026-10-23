# تقرير الدليل — T-5.1 (بطاقة حالة طلب الدمج والتصنيفات السبعة)

- المرحلة: `MJ8` · الفرع: `mj/8-glossary-card-pr-status` · الأساس: `mj-D/base`
- التاريخ: 2026-10-23 · البيئة: Node v24.18.1 · Vitest 5.0.5 · Chrome 156.0.8078.47 وEdge 155.0.4283.60 وBrave 156.0.8078.48 وFirefox 158.0.1
- الموضع: `src/modules/d/pr-status/` (الوحدة `d.pr-status`) و`tests/modules/d/` (العينات في `tests/modules/d/fixtures/`).

## النتيجة بإيجاز

| الفحص | الأمر | النتيجة | الملف |
| :--- | :--- | :--- | :--- |
| اختبارات `TEST-PR-01` و`TEST-PR-02` | `npx vitest run tests/modules/d/categories.test.ts tests/modules/d/pr-status.test.tsx` | 42 من 42 | [`vitest.txt`](vitest.txt) |
| e2e على الشيفرة المحقونة (تخطيط حقيقي، `fetch` حقيقي) | `node tests/modules/d/browser/run.mjs …` | 23/23 في كل من الأربعة (92/92) | [`browser-run.txt`](browser-run.txt) · [`browser-results.json`](browser-results.json) |
| تكامل الحزمة المشحونة (PR معقدة وحقيقية، مفاتيح الإعدادات، تدقيق الشبكة) | `node tests/modules/browser/integration.mjs …` | 103/103 | [`../T-3.2/integration-run.txt`](../T-3.2/integration-run.txt) · [`../T-3.2/integration.json`](../T-3.2/integration.json) |
| الأنواع والبناء والطقم الكامل و`web-ext lint` | — | اجتازت | [`../T-3.2/typecheck-and-tests.txt`](../T-3.2/typecheck-and-tests.txt) · [`../T-3.2/build.txt`](../T-3.2/build.txt) · [`../T-3.2/web-ext-lint.txt`](../T-3.2/web-ext-lint.txt) |

اللقطات: [`screens/`](screens) (e2e) و[`../T-3.2/integration-screens/`](../T-3.2/integration-screens) (الحزمة المشحونة).

## العينات

| العينة | المصدر |
| :--- | :--- |
| `fixtures/spikes/gh-pr-watad-80.html` | **صفحة PR حقيقية محفوظة** (Watad-Project/Watad#80، لغير مسجَّل، من `MJ4`): الترويسة والفرعان والتبويبات والأسطر والرموز المجمَّعة وقائمة المراجعين |
| `fixture-pr-complex.html` | مكتوبة لهذه المرحلة: الترويسة نسخة مختصرة من الصفحة الحقيقية، وصندوق الدمج والصفوف على بنية رصدها `evidence/T-0.3` في جلسة مسجَّلة (`mergebox-session.json`) |
| `fixture-status-details.html` | جزء `status-details` بالبنية التي قرأها `scripts/spikes/t03-status.mjs` (صفوف `.merge-status-item`) |
| `fixture-check-runs.json` | **بيانات API حقيقية** من `evidence/T-0.3/raw/status.json` (12 PR على مستودعات عامة: 527 check run مقروءًا و79 `commit status`؛ وفي واحد منها (`vscode#343677`) قُرئت 100 من 115 لأن التصفح لم يكن مضافًا وقتها) مع أعداد متوقعة تُحسب بجدول T-0.3 مستقلًا عن شيفرة التصنيف |

## معايير القبول جزءًا جزءًا

### `AC-D1` (`TEST-PR-01`)

| القيمة | صفحة PR حقيقية (لغير مسجَّل) | العينة المعقدة |
| :--- | :--- | :--- |
| الفرع المصدر والهدف | `feature/contractor-work-tabs` ← `main` | `feature/ui-refresh` ← `main` (والمستودع من التلميح) |
| التأخر عن الهدف | غير متاح | «متأخر عن فرع الهدف» (صندوق الدمج) |
| الالتزامات / الملفات / الأسطر | 8 / 56 / +5,381 −1 | 3 / 12 / +1,204 −87 |
| المراجعات | **طُلبت تغييرات** (من قائمة المراجعين في الشريط الجانبي: «Om4rMu requested changes») | مطلوب مراجعة (صندوق الدمج) |
| التعارضات | غير متاح | يوجد تعارض يجب حله |
| الفحوص | 6 صفوف من `status-details` بلا فصل إلزامي («الإلزامية: غير متاح») | 9 صفوف: **الإلزامية 4 والاختيارية 5**، وبالتصنيفات السبعة كلها |

كل قيمة ناقصة تُعرض «غير متاح» بسببها (تلميح العنصر)، ولا يُستنتج التحديث أو عدم التعارض من غياب عبارة. والبطاقة لا تقول «جاهز للدمج» (مُختبَر)، وتذكر أنها ملخص لما تعرضه الصفحة.

### `AC-D2` (`TEST-PR-02`)

كل `status` وكل `conclusion` الموثقة (6 + 9) وكل `commit status` القديمة (4) تُعيَّن إلى أحد التصنيفات السبعة وفق جدول T-0.3 (`src/modules/d/pr-status/categories.ts`)؛ القيم الناقصة أو غير المعروفة أو من نوع آخر «غير معروف» ولا تُهمل (مُختبَر بسبع حالات). وعلى المجموعة المرجعية: أعداد كل تصنيف في كل من الـ12 PR تطابق المحسوب مستقلًا (مثال: `nodejs/node#66911` نجاح 31 وتجاوز 4؛ `vscode#343703` فاشل 6 وقيد التشغيل 6 ومتجاوز 9). و`neutral` ناجح بوسم «محايد»، و`pending` مع صفر حالات «لا فحوص مُبلَّغ عنها» لا «قيد التشغيل». الجدول يحمل لكل قيمة `verified`: **غير مُحقَّقة على عينة** (من التوثيق فقط): `queued` و`requested` و`waiting` و`pending` و`timed_out` و`startup_failure` و`action_required` و`stale` و`pending` (commit status).

## الشبكة

- طلب واحد لكل التزام إلى `github.com` نفسه (جزء `status-details` الذي تطلبه الصفحة بنفسها) حين لا يعرض DOM صفوف الفحوص؛ بلا رمز ولا ترويسة تعريفية، ويُحفظ ناجحه 30 ثانية فلا يتكرر مع إعادة التركيب، وفشله يُعلَن «غير متاح» بسببه ولا يُعرض نجاحًا. مُختبَر: خارج `github.com` يُرفض، ولا طلب إلى `api.github.com` (0 في الأربعة، `integration.json`).
- **لم يُجرَ على GitHub حي**: الاختبارات تخدم الجزء محليًا بالمسار نفسه؛ لا شبكة خارجية.

## حدود معلنة

1. **صندوق الدمج المسجَّل** (التعارضات والتأخر وشارة Required وصفوفه): بنيته من رصد T-0.3 للعناوين وفئات الرموز، أما عبارات «Changes requested» و«out-of-date with the base branch» و«no conflicts with the base branch» فمن واجهة GitHub المعروفة ولم تُثبَّت على صفحة حية؛ تحقق منها بجلسة مسجَّلة قبل الاعتماد (`T-10.1`).
2. **قائمة المراجعين**: «requested changes» و«left review comments» رُصدتا حرفيًا في الصفحة الحقيقية؛ أما «approved» و«awaiting/review requested» فلم تُرصدا.
3. **صفوف `status-details`** تُقرأ بالمحددات التي استعملها T-0.3 على صفحات حية، ولم يُحفظ HTML الجزء نفسه (حُفظت حقوله)؛ العينة كُتبت بالبنية المرصودة.
4. **مصدر الفحص عند غياب الصفوف**: الرمز المجمَّع لآخر التزام ظاهر في المحادثة (لا بمطابقة `sha` حين لا تضمّن الصفحة بياناتها المنظّمة).
5. **خارج النطاق**: موانع الدمج بأدلتها والتقادم وشارة المصدر وطبقة `API` (`T-5.2`، `MJ11`)؛ وهي ليست هنا.

## كيف يُعاد

```bash
npm run build
npx vitest run tests/modules/d/categories.test.ts tests/modules/d/pr-status.test.tsx
node tests/modules/d/browser/run.mjs chrome edge brave firefox --out-dir evidence
```
