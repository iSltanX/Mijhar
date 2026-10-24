#!/bin/zsh
# محاكاة بدء MJ18 وMJ19 كما تفعل مهارة /mj، في نسخة مستنسخة معزولة: لا فرع ولا worktree ولا وسم يُنشأ في المستودع الحقيقي، ولا اتصال بالشبكة.
# الاستعمال: simulate-start.sh <مسار المستودع> [<مراجعة يوضع عليها الوسم في النسخة>]
#   بلا المعامل الثاني يُستعمل الوسم mj-H/base كما هو في المستودع؛ ومعه يُفترض الوسم على تلك المراجعة (لمحاكاة النقل قبل إجرائه).
# ما يحاكيه (دور «جلسة مرحلة» في Docs/MJ/README.md ومهارة /mj):
#  1) التطبيق يفتح worktree على فرع claude/* تلقائي عند origin/main (وهو ما تُظهره فروع claude/mjN-* القائمة)؛
#  2) الفرع نظيف بلا التزامات فوق main ← git switch -C <فرع المرحلة> main؛
#  3) فحوص التحقق: الوسم من أسلاف الرأس، وdepends كلها done في main، وترويسة المرحلة (wave وbranch وbase).
# ثم يقيس أن الفرع الناشئ يحوي الإصلاح 91640ab وملفاته، وأن فرق المرحلة main...HEAD فارغ (فلا يُنسب الإصلاح إليها).
SRC="$1"; TAG_AT="${2:-}"
FIX=91640ab        # إصلاح G-1
FIX2=34c70ef       # إصلاح G-2 وقرار G-4 (AD-27 وAD-28)
work=$(mktemp -d "${TMPDIR:-/tmp}/mj-h-sim.XXXXXX")
trap 'rm -rf "$work"' EXIT
git clone -q --no-hardlinks "$SRC" "$work/sim" || exit 2
cd "$work/sim" || exit 2
git config user.email sim@example.invalid; git config user.name sim
REMOTE_MAIN=$(git -C "$SRC" rev-parse origin/main)       # ما يعتمده التطبيق للفروع التلقائية في هذا المستودع
if [ -n "$TAG_AT" ]; then git tag -f mj-H/base "$(git rev-parse "$TAG_AT")" >/dev/null; fi
echo "main=$(git rev-parse --short main) · mj-H/base=$(git rev-parse --short mj-H/base) · origin/main(التطبيق)=$(git rev-parse --short "$REMOTE_MAIN") · الإصلاحان $FIX و$FIX2"
fail=0
ok() { if eval "$2"; then echo "  ✓ $1"; else echo "  ✗ $1"; fail=1; fi; }

for ID in MJ18 MJ19; do
  hdr=$(git show main:Docs/MJ/stages/$ID.md | sed -n '1,/^---$/p')
  BRANCH=$(echo "$hdr" | sed -n 's/^branch: //p'); WAVE=$(echo "$hdr" | sed -n 's/^wave: //p'); BASE=$(echo "$hdr" | sed -n 's/^base: //p')
  DEPENDS=$(echo "$hdr" | sed -n 's/^depends: \[\(.*\)\]/\1/p' | tr -d ',')
  echo "== $ID · الفرع $BRANCH · الموجة $WAVE · الأساس $BASE · depends: $DEPENDS"
  wt="$work/wt-$ID"
  git worktree add -q -b "claude/$(echo $ID | tr 'A-Z' 'a-z')-sim" "$wt" "$REMOTE_MAIN" || exit 2
  ( cd "$wt" || exit 2
    ok "worktree: git-dir يختلف عن git-common-dir" '[ "$(git rev-parse --git-dir)" != "$(git rev-parse --git-common-dir)" ]'
    echo "  · الفرع التلقائي عند $(git rev-parse --short HEAD): التزامات فوق main=$(git rev-list --count main..HEAD)، غير ملتزم=$(git status --porcelain --untracked-files=no | wc -l | tr -d ' ')"
    ok "الفرع التلقائي نظيف بلا التزامات فوق main (شرط إنشاء فرع المرحلة من main)" '[ "$(git rev-list --count main..HEAD)" = 0 ] && [ -z "$(git status --porcelain --untracked-files=no)" ]'
    echo "  · قبل الإنشاء: الإصلاح في الرأس؟ $(git merge-base --is-ancestor $FIX HEAD && echo نعم || echo لا) · الوسم من أسلاف الرأس؟ $(git merge-base --is-ancestor mj-H/base HEAD && echo نعم || echo لا) (الفرع التلقائي القديم يسقط في هذا الفحص فيُنشأ الفرع من main)"
    git switch -q -C "$BRANCH" main
    ok "الفرع الناشئ هو $BRANCH عند main" '[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] && [ "$(git rev-parse HEAD)" = "$(git rev-parse main)" ]'
    ok "الوسم $BASE موجود ومن أسلاف الرأس" 'git merge-base --is-ancestor mj-H/base HEAD'
    ok "ترويسة المرحلة: wave=H وbranch وbase=mj-H/base" '[ "$WAVE" = H ] && [ "$BASE" = mj-H/base ]'
    ok "الإصلاح $FIX من أسلاف رأس الفرع" 'git merge-base --is-ancestor $FIX HEAD'
    ok "translate-draft.tsx في الفرع يعامل حالة consent (شرط availability.state يظهر مرتين على الأقل)" '[ "$(git show HEAD:src/modules/f/phrasebank/translate-draft.tsx | grep -c "availability.state === '\''consent'\''")" -ge 2 ]'
    ok "اختبارات الإصلاح consent.test.tsx في الفرع" 'git cat-file -e HEAD:tests/modules/f/phrasebank/consent.test.tsx'
    ok "إصلاح G-2 ($FIX2) من أسلاف رأس الفرع" 'git merge-base --is-ancestor $FIX2 HEAD'
    ok "زرّا «موافق» في الفرع يمران بـisTrustedActivation (consent-panel.tsx وtranslate-draft.tsx)" 'git show HEAD:src/modules/c/model-manager/consent-panel.tsx | grep -q "isTrustedActivation(event) && onConfirm()" && git show HEAD:src/modules/f/phrasebank/translate-draft.tsx | grep -q "isTrustedActivation(event) && confirm(view.service)"'
    ok "AD-27 وAD-28 في data/plan.json الفرع، وAD-28 في تعليمات MJ19 وAD-27 في معايير MJ21 وMJ22" 'git show HEAD:data/plan.json | grep -q "\"AD-28\"" && git show HEAD:Docs/MJ/stages/MJ19.md | grep -q "AD-28" && git show HEAD:Docs/MJ/stages/MJ21.md | grep -q "AD-27" && git show HEAD:Docs/MJ/stages/MJ22.md | grep -q "AD-27"'
    ok "وسم الموجة السابقة mj-G/base من أسلاف الرأس" 'git merge-base --is-ancestor mj-G/base HEAD'
    ok "فرق المرحلة main...HEAD فارغ (الإصلاح لا يُنسب إلى المرحلة)" '[ -z "$(git diff --name-only main...HEAD)" ]'
    for dep in ${=DEPENDS}; do
      ok "depends: $dep حالتها done في main" '[ "$(git show main:Docs/MJ/stages/$dep.md | sed -n "1,/^---\$/p" | sed -n "s/^status: //p")" = done ]'
    done
    exit $fail
  ) || fail=1
done

# ضابط سلبي: رأس قديم (قبل الإصلاح) كان يمر بفحص الوسم القديم 28c4067 ولا يمر بالجديد.
echo "== ضابط سلبي: رأس عند 9aad649 (قبل الإصلاح)"
OLD_TAG=28c4067
ok "الوسم القديم $OLD_TAG كان يقبله (من أسلافه)" 'git merge-base --is-ancestor $OLD_TAG 9aad649'
ok "الوسم الحالي يرفضه (ليس من أسلافه) فتتوقف المهارة قبل أي عمل" '! git merge-base --is-ancestor mj-H/base 9aad649'
ok "والإصلاح غائب عنه فعلًا" '! git merge-base --is-ancestor $FIX 9aad649'
echo "== ضابط سلبي ثانٍ: رأس عند 67816ae (الأساس بعد G-1 وقبل G-2)"
ok "الأساس الحالي يرفضه (ليس من أسلافه)" '! git merge-base --is-ancestor mj-H/base 67816ae'
ok "وإصلاح G-2 غائب عنه فعلًا" '! git merge-base --is-ancestor $FIX2 67816ae'
echo "== النتيجة: $([ $fail = 0 ] && echo 'كل الفحوص اجتازت' || echo 'سقط فحص')"
exit $fail
