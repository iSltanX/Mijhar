# عينات الوحدة (د) في `MJ8`

| الملف | المصدر | الاستعمال |
| :--- | :--- | :--- |
| `gh-compare-branches.html` · `gh-compare-tags.html` · `gh-compare-commits.html` | **صفحات مقارنة عامة حقيقية** حُفظت بإذن المالك في 2026-10-23 بـ`scripts/spikes/t54-capture-compare.mjs` (الدالة نفسها التي حفظت بها `MJ4` عيناتها: DOM المعروض بلا `<script>` ولا JSON مضمّن ولا رموز جلسة، وبلا تسجيل دخول). المصادر وأحجامها وأوقات الحفظ في `gh-compare-samples.json`. تخطيطها Rails: «Showing N changed files with A additions and D deletions.» و`.file-header[data-path]` | `TEST-DIFF-01` (`AC-D6`) |
| `fixture-compare-react-branches.html` · `…-commits.html` · `…-tags.html` | مكتوبة لـ`T-5.4`: مسارات وأسطر **27 ملفًا حقيقية** من صفحة التزام عام محفوظة (`fixtures/spikes/gh-commit-bms-1.html`) بتخطيط React لعرض الفروقات (منطقة `role="region"` لكل ملف وعنوان `h3`) الذي تستعمله صفحة الالتزام اليوم وقد تنتقل إليه المقارنة؛ والترويسة مكتوبة | التخطيط البديل في `TEST-DIFF-01` |
| `fixture-pr-complex.html` | مكتوبة لـ`T-5.1`: الترويسة نسخة مختصرة من صفحة PR حقيقية محفوظة (`fixtures/spikes/gh-pr-watad-80.html`)، وصندوق الدمج والصفوف على بنية رصدتها `evidence/T-0.3` في جلسة مسجَّلة | `TEST-PR-01` (`AC-D1`) |
| `fixture-status-details.html` | جزء `status-details` بالبنية التي قرأها `scripts/spikes/t03-status.mjs` | `TEST-PR-01` و`TEST-PR-02` |
| `fixture-check-runs.json` | **بيانات API حقيقية** من `evidence/T-0.3/raw/status.json` (12 PR) وأعداد متوقعة تُحسب بجدول T-0.3 مستقلًا عن الشيفرة | `TEST-PR-02` (`AC-D2`) |

النصوص في عينات `gh-*` ملك أصحابها على GitHub، وحُفظت مرجعًا للقياس على مستودعات عامة كما تنص الخطة (القسم 7.1).
