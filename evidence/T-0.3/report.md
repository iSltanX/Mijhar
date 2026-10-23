# تقرير `T-0.3`: حالة الفحوص وسجلات الأخطاء من DOM مقابل API (`TEST-SPIKE-03`)

> تجربة جدوى تنتج معرفة لا التزامًا. كل رقم أدناه مقيس في 2026-10-23 بين 05:15 و06:00 (UTC)، ومصدره الخام في `raw/`.
> ما لم يُقَس يُكتب «لم يُجرَ» أو «غير مُحقَّق على عينة» بسببه.

## ظروف القياس

| البند | القيمة |
| :--- | :--- |
| الجهاز | Apple M4، ‏8 أنوية، ‏16 GB، ‏macOS 27.0.1 |
| DOM بلا تسجيل دخول | Chrome 156.0.8078.47 بلا واجهة (`headless`) بملف تعريف مؤقت جديد عبر `playwright-core` (`scripts/spikes/lib.mjs`) |
| DOM بتسجيل دخول | جلسة المالك في متصفح Claude المدمج (Chromium)، قراءة فقط، بلا رمز وصول ولا نقر يغيّر حالة |
| API | REST ‏`api.github.com` بلا مصادقة، `X-GitHub-Api-Version: 2022-11-28`؛ صُرف الحد كاملًا (60) في هذه التجربة و`T-0.4` |
| `DEC-04` | حسمه المالك قبل التجربة بعدم إتاحة رمز (د-4)، فالشق الموثَّق من `AC-S3.2` و`AC-S3.3` كله «لا ينطبق»، ولم يُطلب رمز |
| السكربتات | `scripts/spikes/t03-status.mjs`، `t03-logs.mjs`، `t03-ratelimit.mjs` |

## المجموعة المرجعية (12 PR على مستودعات عامة)

| PR | الحالة في DOM | مسودة (API) | `mergeable_state` (API) | check-runs (API) | commit status (API) | عناصر تبويب Checks في DOM | رمز الحالة المجمَّع في DOM | ملخص جزء `status-details` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `nodejs/node#66911` | Open | لا | `unstable` | 35: نجاح 31، تجاوز 4 | `failure`/27: نجاح 24، فشل 3 | 35 (35 مطابقة) | `55 / 62 checks OK` | Some checks were not successful |
| `nodejs/node#66942` | Open | لا | `clean` | 42: نجاح 34، تجاوز 8 | `pending`/**0** | 42 (42) | `34 / 38 checks OK` | All checks have passed |
| `nodejs/node#66900` | Merged | لا | `unknown` | 43: نجاح 31، تجاوز 12 | `success`/29 | 43 (43) | `60 / 64 checks OK` | All checks have passed |
| `vercel/next.js#100630` | Draft | نعم | `unstable` | 10: نجاح 9، قيد التشغيل 1 | `pending`/**0** | 10 (10) | `9 / 10 checks OK` (أصفر) | Some checks haven’t completed yet |
| `kubernetes/kubernetes#141306` | Open (تعارض) | لا | `dirty` | 0 | `failure`/21: نجاح 19، فشل 1، `error` 1 | 0 | `19 / 21 checks OK` | 1 errored, 1 failing, 19 successful |
| `kubernetes/kubernetes#139507` | Draft (تعارض) | نعم | `dirty` | 0 | `failure`/2: نجاح 1، `error` 1 | 0 | `1 / 2 checks OK` | 1 errored and 1 successful |
| `microsoft/vscode#343677` | Closed | لا | `unknown` | 115 (قُرئت صفحة واحدة: 100) | `pending`/**0** | 114 (100 مطابقة: الباقي في الصفحة الثانية) | `48 / 59 checks OK` (أصفر) | Some checks haven’t completed yet |
| `nodejs/node#40075` | Open (قديم) | لا | `clean` | 30: نجاح 30 | `pending`/**0** | 30 (30) | `30 / 30 checks OK` | All checks have passed |
| `jlevy/the-art-of-command-line#959` | Open (بلا CI) | لا | `clean` | **0** | `pending`/**0** | 0 | لا رمز | Some checks haven’t completed yet (بلا أي صف) |
| `vercel/next.js#100335` | Open | لا | `unstable` | 103 (صفحتان): نجاح 93، تجاوز 8، فشل 1، إلغاء 1 | `pending`/**0** | 102 (102) | `93 / 102 checks OK` | 93 successful, 8 skipped, 1 cancelled |
| `vercel/next.js#100592` | Open | لا | `unstable` | 120 (صفحتان): نجاح 110، تجاوز 7، فشل 3 | `pending`/**0** | 120 (120) | `110 / 120 checks OK` | 110 successful, 7 skipped, 3 failing |
| `microsoft/vscode#343703` | Draft | نعم | `unstable` | 44: نجاح 22، تجاوز 9، فشل 6، قيد التشغيل 6، `neutral` 1 | `pending`/**0** | 44 (44) | `22 / 44 checks OK` | 6 in progress, 23 successful, 6 failing, 9 skipped |

الخام: `raw/status.json`. التطابق بين DOM وAPI بمعرّف المهمة في رابط `/job/<id>` = معرّف check run: من 540 عنصرًا طوبق 526، و14 لم تُطابَق كلها في `vscode#343677` لأنه قُرئ قبل إضافة تصفّح الصفحات.

## `AC-S3.1`: جدول ربط الحالات بالتصنيفات السبعة

التصنيفات تصنيف الواجهة في الخطة: ناجح، فاشل، قيد التشغيل، متجاوز، ملغى، لم يُشغَّل، غير معروف.

| المصدر | القيمة الرسمية | ما يظهر في DOM (بلا تسجيل دخول) | التصنيف | التحقق |
| :--- | :--- | :--- | :--- | :--- |
| check run `conclusion` | `success` | `svg.octicon-check.color-fg-success` و`aria-label="This job succeeded"` (Actions) أو `"This check passed"` (تطبيقات) | ناجح | مُحقَّق: 440 عنصرًا |
| check run `conclusion` | `neutral` | **الرمز نفسه للنجاح**: `octicon-check` و`"This check passed"`؛ ويعدّه ملخص `status-details` بين الناجحة | ناجح (ووسم «محايد» حين يأتي من API) | مُحقَّق: 1 (`vscode#343703`)؛ DOM لا يميّزه |
| check run `conclusion` | `failure` | `octicon-x.color-fg-danger` و`"This job failed"`؛ وفي `status-details`: «Failing after …» | فاشل | مُحقَّق: 9 |
| check run `conclusion` | `skipped` | `octicon-skip.color-fg-muted` و`"This job was skipped"` | متجاوز | مُحقَّق: 65 |
| check run `conclusion` | `cancelled` | `octicon-stop.neutral-check` و`"This job was cancelled"`؛ و«Cancelled after …» | ملغى | مُحقَّق: 1 (`next.js#100335`) |
| check run `status` | `in_progress` | `anim-rotate` و`"In progress"`؛ و«In progress — This check has started...» أو «Awaiting approvals» | قيد التشغيل | مُحقَّق: 8 |
| check run `status` | `queued` · `requested` · `waiting` · `pending` | — | قيد التشغيل | **غير مُحقَّق على عينة**: لم يُرصد في المجموعة |
| check run `conclusion` | `timed_out` · `startup_failure` | — | فاشل | **غير مُحقَّق على عينة** |
| check run `conclusion` | `action_required` | — | لم يُشغَّل (يحتاج إجراءً بشريًا) | **غير مُحقَّق على عينة** |
| check run `conclusion` | `stale` | — | غير معروف (لم تُعرف نتيجته) | **غير مُحقَّق على عينة** |
| commit status `state` | `success` | `octicon-check color-fg-success` في `status-details` | ناجح | مُحقَّق: 73 |
| commit status `state` | `failure` | `octicon-x color-fg-danger` («failing») | فاشل | مُحقَّق: 4 |
| commit status `state` | `error` | `octicon-x color-fg-danger` («errored»)؛ ومثاله `tide — Not mergeable. PR has a merge conflict.` | فاشل | مُحقَّق: 2 |
| commit status `state` | `pending` | — | قيد التشغيل | **غير مُحقَّق على عينة** |
| combined status | `pending` مع `total_count: 0` | جزء `status-details` يقول «Some checks haven’t completed yet» **بلا أي صف** | **ليس حالة**: «لا فحوص مُبلَّغ عنها» | مُحقَّق: 8 PR؛ لا يُعرض «قيد التشغيل» أبدًا |
| DOM مسجَّل فقط | «Expected — Waiting for status to be reported» (`octicon-dot-fill`، شارة Required) | لا يظهر لغير المسجَّل؛ ولا تعيده check-runs | لم يُشغَّل | مُحقَّق: 15 صفًا في `vscode#343703` |
| أي قيمة | مجهولة أو ناقصة أو `completed` بلا `conclusion` | — | غير معروف | قاعدة (لا تُهمل القيمة) |

رمز الحالة المجمَّع لكل التزام في صفحة المحادثة (`details.commit-build-statuses > summary`): الفئة `color-fg-success` أو `color-fg-danger` أو `hx_dot-fill-pending-icon`، و`aria-label` بصيغة «N / M checks OK».

## مواصفة محلل الحالة المدمج (DOM + API) كما تثبتها القياسات

**ما يقدّمه DOM بلا تسجيل دخول** (بلا أي طلب API):

1. بيانات PR من `script[data-target="react-app.embeddedData"]` → `payload.pullRequestsLayoutRoute.pullRequest`: `number` و`state` (OPEN/MERGED/CLOSED) و`headBranch` و`headRepositoryOwnerLogin` و`headSha` و`baseBranch` و`baseSha` و`mergeCommitSha`. الحالة مسودة/مدموج تظهر نصًا في رأس الصفحة.
2. تبويب `/pull/<n>/checks`: كل مهمة بمعرّفها (`a[href*="/job/<id>"]` أو `check_run_id=`) ورمزها و`aria-label`. يغطي check runs فقط، ولا يغطي commit status القديم.
3. جزء `/<owner>/<repo>/commit/<headSha>/status-details?popover=true` يُجلب بنفس الأصل (`X-Requested-With`): صفوف `.merge-status-item` للنوعين (check runs وcommit status) بوصف نصي («Successful in 2m»، «Failing after 4m»، «Skipped»، «— tests failed»)، وجملة الملخص.
4. رمز الحالة المجمَّع لكل التزام في المحادثة (عبر `POST /commits/checks-statuses-rollups`، يطلبه GitHub بنفسه).

**ما لا يقدّمه DOM لغير المسجّل:** صندوق الدمج كله. لا تعارضات، ولا حالة مراجعة، ولا فصل الإلزامي عن الاختياري، ولا الفحوص المنتظرة «Expected». وكذلك التمييز بين `neutral` و`success`، والتشغيلات المخفية: `copilot-pull-request-reviewer` (فاشل) ظهر في API ولم يظهر في تبويب Checks في `next.js#100335`.

**ما يضيفه DOM المسجَّل:** `[data-testid="mergebox-partial"]` بعناوين المجموعات (failing / pending / in progress / skipped / successful checks)، وشارة «Required» لكل صف، و«This branch has conflicts that must be resolved»، و«Review required». وفيه `neutral` غير مميز أيضًا (رمز النجاح).

**ما تقدّمه API بلا مصادقة** (كلفة كل PR ثلاثة طلبات على الأقل، أي نحو 15 PR في الساعة بحد 60):

- `GET /repos/{o}/{r}/pulls/{n}`: `draft`، و`mergeable`، و`mergeable_state` (`clean`، `unstable`، `dirty` = تعارض، `unknown` للمغلق والمدموج).
- `GET …/commits/{sha}/check-runs?per_page=100`: يلزم **تصفّح الصفحات**، فقد بلغ `total_count` في المجموعة 103 و115 و120.
- `GET …/commits/{sha}/status`: `pending` مع صفر حالات يعني «لا حالات».
- `GET …/branches/{base}`: يعرض `protection.required_status_checks.contexts` بلا مصادقة (مُحقَّق على `vscode` → 29 سياقًا). وقائمة `rules/branches/{base}` لم تتضمن قاعدة فحوص إلزامية في المثال نفسه، فلا تُعدّ مصدرًا وحيدًا.

**قواعد الدمج المقترحة لـ`T-5.1`/`T-5.2`:**

1. الهوية: check run بمعرّفه، وcommit status بسياقه (`context`). لا يُجمع عدد DOM مع عدد API: عدّ الرمز المجمَّع (مثل 60/64) يختلف عن مجموع API (43 + 29 = 72)، والفرق في التشغيلات المتجاوزة المكررة.
2. الأولوية: قيمة API إن توفرت، لأنها تميّز `neutral` وتشمل المخفي، ثم DOM. ولكل عنصر شارة مصدره.
3. التعارض: من صندوق الدمج إن كان المستخدم مسجّلًا، وإلا من `mergeable_state: dirty`، وإلا «غير متاح». ولا يُستنتج من غياب العبارة.
4. الإلزامي والاختياري: شارة «Required» في DOM المسجّل، أو `branches/{base}` من API، وإلا «غير متاح».
5. «لا فحوص»: `check-runs.total_count = 0` و`status.total_count = 0` معًا، ولا يُعرض «قيد التشغيل».
6. التقادم: وقت آخر قراءة لكل مصدر (`PP-01`).

## `AC-S3.2`: الوصول إلى سجلات Actions

| المسار | بلا تسجيل دخول ولا مصادقة | النتيجة |
| :--- | :--- | :--- |
| تبويب Checks في الواجهة | «Sign in for the full log view» | السجل محجوب |
| صفحة المهمة `/actions/runs/<run>/job/<job>` | «Sign in to view logs»؛ الخطوات ظاهرة بأسمائها ونتائجها في `check-step[data-name][data-number][data-conclusion][data-log-url]`، وAnnotations ظاهرة في `annotation-message` | الخطوات والتنبيهات متاحة، والنص محجوب |
| رابط سجل الخطوة `data-log-url` (`/commit/<sha>/checks/<job>/logs/<n>`) | **404** | محجوب |
| رابط السجل الخام `/commit/<sha>/checks/<job>/logs` و`/actions/runs/<run>/job/<job>/logs` | **404** و**404** | محجوب |
| `GET /repos/{o}/{r}/actions/jobs/{job}/logs` | **403** `Must have admin rights to Repository.` على `microsoft/vscode` و`nodejs/node`، **بلا أي توجيه** | محجوب، خلافًا لنص التوثيق |
| `GET /repos/{o}/{r}/actions/runs/{run}/logs` | **403** بالرسالة نفسها | محجوب |
| `GET /repos/{o}/{r}/actions/jobs/{job}` | 200: الخطوات بأسمائها ونتائجها (`Compile & Hygiene` = `failure`) | متاح |
| `GET /repos/{o}/{r}/check-runs/{job}/annotations` | 200: `Process completed with exit code 1.` (`failure`) | متاح |

**مهلة الرابط المؤقت:** لم تُقَس عبر API بلا مصادقة، لأن النقطة لا توجّه أصلًا. وقيست في جلسة المالك المسجّلة، وهو مسار جلسة بلا رمز: `fetch` بنفس الأصل لرابط السجل الخام يتبع توجيهًا (`opaqueredirect` عند `redirect: 'manual'`) إلى `productionresultssa0.blob.core.windows.net` برابط SAS. قيمتا `st` و`se` بينهما عشر دقائق وخمس ثوانٍ، والمحتوى مقروء بـCORS. الرابط أعاد 200 بعد 0 و65 و561 ثانية (قبل `se` بـ28 ثانية)، و**403 `AuthenticationFailed`** بعد 609 ثوانٍ (بعد `se` بـ20 ثانية). وسجل الخطوة بنفس الأصل أعاد 200 `text/plain` بحجم 313,447 بايتًا. الخام: `raw/logs.json` و`raw/logs-session.json`.

**الشق الموثَّق (برمز):** لا ينطبق، فقد اعتُمد د-4 في `DEC-04` قبل التجربة.

**الحكم على `HYP-08`:** نصفه الأول صحيح: الواجهة تحجب السجل الخام عن غير المسجّل. ونصفه الثاني **خاطئ**: API العامة لا تفتح السجل بلا مصادقة (403). يتحقق المانع `BLK-GH-AUTH-LOGS` لغير المسجّل، فيُفعَّل البديل: Annotations من DOM، ونتائج الخطوات من `check-step`، وAnnotations من API. ويُضاف للمسجّل في GitHub مسار بلا رمز: سجل الخطوة بنفس الأصل من `data-log-url`، بنقر صريح.

**محددات استخراج السجل الفاشل (تثبتها هذه التجربة):**

- الخطوة الفاشلة: `check-step[data-conclusion="failure"]` ← `data-name` و`data-number` و`data-log-url`. ومثالها `Compile & Hygiene`، رقمها 14، ورابطها `/…/checks/120256773911/logs/14`.
- التنبيهات: `annotation-message` ← `div.annotation--contracted` (نص الرسالة)، داخل جدول Annotations في صفحة المهمة أو تبويب Checks.
- نص الخطوة (للمسجّل فقط): `GET <data-log-url>` بنفس الأصل → `text/plain` بطوابع زمنية لكل سطر وعلامات `##[group]`/`##[error]`.

## `AC-S3.3`: أقل صلاحيات PAT

**لا ينطبق.** حسم المالك `DEC-04` بعدم إتاحة رمز (د-4) قبل التجربة في 2026-10-23، فتسقط `HYP-09` ولا يُطلب رمز تجريبي.

## `AC-S3.4`: نفاد حد الطلبات وغياب البيانات

| الخطوة | الحالة | `x-ratelimit-remaining` | ملاحظة |
| :--- | :--- | :--- | :--- |
| طلب عادي | 200 | 7 | الترويسات الخمس موجودة في كل استجابة، ومكشوفة لـCORS (`access-control-expose-headers` يضم `X-RateLimit-*`) |
| طلب شرطي `If-None-Match` بالـETag نفسه | **304** | **6** | **يُحتسب** الطلب الشرطي غير الموثَّق، موافقًا لـ`VER-12` |
| PR غير موجود | 404 | 5 | يُحتسب |
| مستودع غير موجود | 404 | 4 | يُحتسب |
| بعد النفاد | **403** | 0 | `API rate limit exceeded for <IP>…`؛ **لا ترويسة `retry-after`**، والعودة بـ`x-ratelimit-reset` |
| طلب شرطي بعد النفاد | 403 | 0 | لا إعفاء |
| DOM (`github.com/…/checks`) بعد النفاد | **200** | — | مسار DOM لا يمر بحد `api.github.com` |

**غياب البيانات (مقيس):** `status` المجمَّع `pending` بلا أي حالة، وجزء `status-details` يقول «Some checks haven’t completed yet» بلا صفوف على مستودع بلا CI. `mergeable: null` و`mergeable_state: unknown` للمغلق والمدموج. وcheck-runs تزيد على 100 فتلزم صفحات، وتشغيل يظهر في API ويغيب عن DOM.

**سلوك الإضافة المستنتج:** تُقرأ `x-ratelimit-remaining` و`x-ratelimit-reset` من كل استجابة. عند الصفر تتوقف طلبات API حتى `reset`، وتعرض البطاقة DOM وحده بشارة «المصدر: الصفحة فقط — بلغ حد الطلبات العامة حتى <الوقت>». ولا تُحسب الطلبات الشرطية توفيرًا للحد. ولا يُعرض «قيد التشغيل» عند غياب كل الفحوص. الخام: `raw/ratelimit.json` (عنوان IP محجوب).

## ما لم يُجرَ

- قيم `queued` و`requested` و`waiting` و`pending` (check run)، و`timed_out` و`startup_failure` و`action_required` و`stale`، و`pending` (commit status): لم تظهر في المجموعة المرجعية. ربطها في الجدول من التوثيق ويحتاج تحققًا عند ظهورها.
- مهلة الرابط المؤقت عبر API: النقطة لا توجّه بلا مصادقة (403)، والمسار الموثَّق لا ينطبق.
- Firefox وEdge وBrave: لم تُكرر قراءة DOM فيها. الجداول بيانات GitHub نفسها، والاختلاف المتوقع في المحرك لا في المحتوى. يُعاد التحقق في `T-10.1`.
