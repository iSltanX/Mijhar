---
name: mj
description: يبدأ مرحلة من نظام MJ في مجهر أو يستأنفها في جلستها المستقلة داخل worktree. يُستدعى يدويًا فقط بـ`/mj MJn`.
argument-hint: <MJn>
disable-model-invocation: true
allowed-tools: Bash(pwd) Bash(true) Bash(git diff *) Bash(git log *) Bash(git rev-parse *) Bash(git worktree list) Bash(git status *) Bash(git tag -l *) Bash(git branch --list *) Bash(git show *) Bash(git merge-base *) Bash(git rev-list *) Bash(sed -n *) Bash(grep -n *) Bash(test *)
---

# /mj $0

المرحلة المطلوبة: **$0** (بالصيغة `MJ3` لا `3`). الحاكم `CLAUDE.md` في الجذر، ثم `Docs/MJ/README.md`، ثم ملف المرحلة
`Docs/MJ/stages/$0.md`. و«ماذا ولماذا» في `EXECUTION_PLAN.md` وملفات `phases/`. كل التواصل مع المالك بالعربية.

## الحالة كما قيست الآن

- المجلد: !`pwd`
- مجلد git ومجلده المشترك (يختلفان في worktree): !`git rev-parse --git-dir --git-common-dir || true`
- الـworktrees: !`git worktree list || true`
- الفرع الحالي: !`git rev-parse --abbrev-ref HEAD || true`
- الرأس: !`git rev-parse --short HEAD || true`
- `main`: !`git rev-parse --short main || true`
- التزامات فوق `main`: !`git rev-list --count main..HEAD || true`
- تغييرات غير ملتزمة: !`git status --porcelain --untracked-files=no || true`
- وسوم أساس الموجات: !`git tag -l 'mj-*/base' --format='%(refname:short) %(objectname:short)' || true`
- فروع المراحل الموجودة: !`git branch --list 'mj/*' --format='%(refname:short) %(objectname:short)' || true`
- ترويسة المرحلة في هذا المجلد: !`sed -n '1,/^---$/p' Docs/MJ/stages/$0.md || true`

## ما تفعله

1. **اقرأ** `CLAUDE.md` (محمَّل)، ثم `Docs/MJ/README.md` كاملًا (القواعد والملكية و«دور: جلسة مرحلة» وصيغة تقرير التسليم)،
   ثم `Docs/MJ/stages/$0.md` كاملًا، ثم ملفات `phases/` التي يحيل إليها. إن لم تُطبع ترويسة أعلاه فالمعرّف خاطئ:
   توقف واطلب معرّفًا بصيغة `MJn`.
2. **الجلسة يجب أن تكون في worktree** (المجلدان أعلاه مختلفان). وإلا توقف واطلب من المالك جلسة جديدة بخيار worktree؛
   لا تنفّذ مرحلة في النسخة الرئيسية ولا على `main`.
3. **نفّذ «دور: جلسة مرحلة» في `Docs/MJ/README.md` حرفيًا.** كل شرط في خطوة التحقق يُقاس بأمر تشغّله أنت؛ ما طُبع
   أعلاه سياق لا دليل. وسقوط شرط واحد يوقف الجلسة بطباعة ما سقط: الفرع `‹BRANCH›` من الترويسة (استئناف إن كنت عليه؛
   وإنشاؤه من `main` إن كان الفرع الحالي تلقائيًا نظيفًا بلا التزامات فوق `main`)، والوسم `‹BASE›` من أسلاف الرأس،
   وكل مرحلة في `depends` حالتها `done` في نسخة `main` من ملفها. وفرع المرحلة يُنشأ من `main` الحالي (وفيه إصلاحات ما بعد الإغلاق إن وُجدت، وهي مذكورة في سجل الموجات)؛ ولا تُحرّك وسمًا ولا تُحدّث فرعًا بيدك، وفرق المرحلة في تقرير التسليم `git diff --stat main...HEAD` لا `‹BASE›...HEAD`.
4. **القيم:** `‹ID›` هو $0، و`‹WAVE›` و`‹BRANCH›` و`‹BASE›` و`‹MODEL›` من الترويسة. إن كان مودل الجلسة غير المحدد
   فاذكر ذلك سطرًا للمالك وتابع فقط إن وافق؛ وإلا سجّل المرحلة `blocked` بالسبب.
5. **القرار المفوَّض** إن ذكرته «المخاطر» أو `resume`: احسمه أولًا من تقرير تجربة الجدوى وسجّله في `data/plan.json` بسببه.
6. **التنفيذ والفحص في هذه الجلسة** بلا وكلاء تنفيذ داخليين؛ وكيل صغير واحد لمهمة معزولة فقط إن لزم. حدّث ترويسة
   ملف المرحلة وجدول «حالة المهام» و`resume` عند كل انتقال ثم `node tools/build.mjs --sync` (إن فشل `node` بـ`_load_nvm`:
   `unfunction node npm npx corepack 2>/dev/null; hash -r`). لا تشغّل `node tools/build.mjs` بلا `--sync` هنا.
7. **عند التسليم:** الترويسة `delivery: branch` و`commit` و`updated`، وتقرير التسليم بصيغته تحت سجل التنفيذ،
   ثم `--sync`، ثم الالتزام الأخير `‹ID›: <النتيجة> — جاهزة للدمج في الموجة ‹WAVE›`. اطبع التقرير وتوقف. لا تدمج في
   `main` ولا تبدأ مرحلة أخرى ولا ترفع شيئًا.
8. **لا مراجعة مستقلة هنا ولا برومبت مراجعة** (`AD-26`): اكتب في تقرير التسليم «نطاق المراجعة» (ما تمسّه المرحلة من
   التخزين أو الصلاحيات أو الشبكة أو الخصوصية أو الأسرار أو التصدير والاستيراد، وملفاته ونقاط فحصه)، ويراجع منسّق
   الدمج الفروع بنفسه قبل الدمج. ولا تطلب من المالك فتح جلسة مراجعة. وإن استُؤنفت الجلسة لإصلاح خلل وثّقته مراجعة
   الدمج فاقرأه من `git show main:evidence/wave-‹WAVE›/review.md` وأصلحه داخل النطاق ثم سلّم من جديد.
