// ربط كل نتيجة API بالمستودع والفرع والالتزام الذي قُرئت له ووقت قراءتها (T-11.5، AC-D8). تُقارن بما تعرضه الصفحة الآن في كل رسم:
// تغيّر أيٍّ منها يُسقط النتيجة القديمة من الملخص والموانع ويُعلن أنها لالتزام آخر (امتداد VR-03 من الالتزام وحده إلى الثلاثة).
//  - الالتزام: متطابقان ولو اختُصر أحدهما بسبعة أحرف فأكثر (قاعدة sameSha). ورأس مجهول في الصفحة ليس تطابقًا: لا يُعرض ما لا يُعرف لأي
//    التزام هو.
//  - الفرع: فرع الرأس باسمه؛ ويُقارن حين تعرضه الصفحة وتعيده API معًا.
//  - المستودع: owner/repo الذي طُلب منه، بلا اعتبار لحالة الأحرف (GitHub لا يميّزها في الأسماء).

export interface ReadBinding {
  readonly repo: string | null;
  readonly branch: string | null;
  readonly commit: string | null;
  /** وقت القراءة (ms)؛ لا وقت لما تعرضه الصفحة الآن. */
  readonly readAt: number | null;
}

export type BindingField = 'repo' | 'branch' | 'commit';

export type BindingMatch = { readonly same: true } | { readonly same: false; readonly changed: readonly BindingField[] };

export const FIELD_TEXT: Readonly<Record<BindingField, string>> = { repo: 'المستودع', branch: 'الفرع', commit: 'الالتزام' };

function sameCommit(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return Math.min(x.length, y.length) >= 7 && (x.startsWith(y) || y.startsWith(x));
}

/** هل النتيجة المقروءة لما تعرضه الصفحة الآن، وإلا ما الذي تغيّر (أو جُهل). */
export function compareBinding(read: ReadBinding, page: ReadBinding): BindingMatch {
  const changed: BindingField[] = [];
  if (!read.repo || !page.repo || read.repo.toLowerCase() !== page.repo.toLowerCase()) changed.push('repo');
  if (read.branch && page.branch && read.branch !== page.branch) changed.push('branch');
  if (!read.commit || !page.commit || !sameCommit(read.commit, page.commit)) changed.push('commit');
  return changed.length ? { same: false, changed } : { same: true };
}

export const shortSha = (sha: string | null): string | null => (sha ? sha.slice(0, 7) : null);
