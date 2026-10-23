// التعامل الآمن مع حقول التحرير في صفحات GitHub (T-2.4، F-A4): يُستخرج هنا لتعيد استعماله الوحدة (و) دون أن تستورد وحدةً أخرى.
//  - لا يُكتب value مباشرة ولا تُعترض أحداث الحقل (input وkeydown وغيرها): لا مستمع على الحقل أصلًا.
//  - تغيير dir يحفظ التحديد واتجاهه والتمرير ويعيدها في الإطار نفسه، ولا يستدعي setSelectionRange إلا إن تغيّرت فعلًا.
//  - الإدراج بأمر التحرير insertText: يمر بسجل التراجع ويطلق input كما لو كتب المستخدم، فيراه GitHub (React أو التقليدي)
//    ويُكمل الإكمال التلقائي ولا يُفقد التراجع. وإن رُفض الأمر فـsetRangeText ثم حدث input واحد.

export type FieldDirection = 'rtl' | 'ltr' | 'auto';
export type TextField = HTMLTextAreaElement | HTMLInputElement;

export const FIELD_DIRECTIONS: readonly FieldDirection[] = ['rtl', 'ltr', 'auto'];

export interface FieldSnapshot {
  readonly start: number | null;
  readonly end: number | null;
  readonly direction: 'forward' | 'backward' | 'none' | null;
  readonly scrollTop: number;
  readonly scrollLeft: number;
}

export function snapshotField(field: TextField): FieldSnapshot {
  return {
    start: field.selectionStart,
    end: field.selectionEnd,
    direction: field.selectionDirection,
    scrollTop: field.scrollTop,
    scrollLeft: field.scrollLeft,
  };
}

/** يعيد التحديد والتمرير إن اختلفا عن اللقطة. */
export function restoreField(field: TextField, snap: FieldSnapshot): void {
  if (snap.start !== null && snap.end !== null) {
    const direction = snap.direction ?? 'none';
    if (field.selectionStart !== snap.start || field.selectionEnd !== snap.end || (field.selectionDirection ?? 'none') !== direction) {
      field.setSelectionRange(snap.start, snap.end, direction);
    }
  }
  if (field.scrollTop !== snap.scrollTop) field.scrollTop = snap.scrollTop;
  if (field.scrollLeft !== snap.scrollLeft) field.scrollLeft = snap.scrollLeft;
}

/** اتجاه الحقل المعلن بسمة dir، أو null إن غابت (يرث اتجاه الصفحة). */
export function fieldDirection(field: Element): FieldDirection | null {
  const dir = field.getAttribute('dir')?.toLowerCase();
  return dir === 'rtl' || dir === 'ltr' || dir === 'auto' ? dir : null;
}

/** الاتجاه التالي في الدورة rtl ← ltr ← auto ← rtl؛ ومن غير المعلن يبدأ بـrtl. */
export function nextDirection(current: FieldDirection | null): FieldDirection {
  const index = current ? FIELD_DIRECTIONS.indexOf(current) : -1;
  return FIELD_DIRECTIONS[(index + 1) % FIELD_DIRECTIONS.length] as FieldDirection;
}

/**
 * يضبط dir بالكاتب المعطى (سجل التعديلات في الوحدات، ليُعكس عند الإيقاف) ويحفظ التحديد والتمرير. لا يمس value ولا التركيز.
 */
export function setFieldDirection(field: TextField, dir: FieldDirection, write: (field: TextField, value: FieldDirection) => void = (f, v) => f.setAttribute('dir', v)): void {
  const snap = snapshotField(field);
  write(field, dir);
  restoreField(field, snap);
}

export interface InsertResult {
  readonly method: 'execCommand' | 'setRangeText';
  readonly value: string;
}

/**
 * يدرج نصًا مكان التحديد في الحقل كما يفعل المستخدم: يركّزه، ثم insertText (سجل التراجع وحدث input أصليان). إن رفض المتصفح
 * الأمر ولم تتغير القيمة فـsetRangeText وحدث input واحد بنوع insertText. وإن تغيّرت بالأمر فهو المعتمد ولو عدّلها معالج GitHub
 * بعده (إكمال تلقائي مثلًا)، فلا يُدرج النص مرتين. يعيد الطريقة المستعملة والقيمة بعده.
 */
export function insertIntoField(field: TextField, text: string): InsertResult {
  const doc = field.ownerDocument;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  const before = field.value;
  if (doc.activeElement !== field) field.focus({ preventScroll: true });
  let ok = false;
  try {
    ok = typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, text);
  } catch {
    ok = false;
  }
  if (ok && field.value !== before) return { method: 'execCommand', value: field.value };
  field.setRangeText(text, start, end, 'end');
  const View = doc.defaultView;
  const InputEventCtor = View?.InputEvent ?? View?.Event ?? Event;
  field.dispatchEvent(new InputEventCtor('input', { bubbles: true, inputType: 'insertText', data: text } as InputEventInit));
  return { method: 'setRangeText', value: field.value };
}
