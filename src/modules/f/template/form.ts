// نماذج Issue Forms (F-F2 / AC-F2): تعرّف على هيكل النموذج من DOM الصفحة دون تخمين. الأنواع هي ما قاسه T-0.4 (evidence/T-0.4/report.md «AC-S4.2»): حقل نصي
// (input) ومنطقة نص (textarea) وقائمة منسدلة (dropdown) ومربعات اختيار (checkboxes)؛ بتسميات وإلزامي ومواضع نائبة. القاعدة:
//  - «نموذج»: النموذج الحاوي للحقل فيه حقلان على الأقل بتسميات حقيقية غير التسمية العامة (غير العنوان)، وللحقل المفتوح منها تسمية حقيقية؛
//  - «غير معروف»: حقول أخرى بتسميات لكن الحقل المفتوح بلا تسمية يُعتمد عليها (أو حقول بلا تسمية)، فلا يُمس شيء من الصفحة؛
//  - «لا نموذج»: حقل الوصف العادي (العنوان وحقل وصف واحد).
// قراءة فقط: لا تعدّل شيئًا ولا تركّز ولا تنقر.
export type FormControlType = 'input' | 'textarea' | 'dropdown' | 'checkboxes';

export interface FormFieldInfo {
  readonly label: string;
  readonly type: FormControlType;
  readonly required: boolean;
  readonly placeholder: string;
  readonly hint: string;
  /** هو الحقل الذي فتح المستخدم المساعد منه. */
  readonly current: boolean;
}

export type FormAnalysis =
  | { readonly status: 'none' }
  | { readonly status: 'form'; readonly fields: readonly FormFieldInfo[]; readonly current: FormFieldInfo }
  | { readonly status: 'unknown'; readonly reason: string };

/** تسميات عامة يحملها حقل الوصف العادي في GitHub: لا تدل على حقل نموذج. */
const GENERIC_LABEL = /^(markdown value|comment|comment body|leave a comment|add a (description|comment)|add your comment here\.*|write|description|body|add a body|type your description here\.*)$/i;
const TITLE_NAME = /(^|\[)(title)(\]|$)/i;
const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file', 'search', 'password']);
/** قوائم الشريط الجانبي ونوافذ الاختيار (التسميات والمسؤولون…): فيها مربعات اختيار بتسميات لكنها ليست حقول نموذج. */
const MENU_ANCESTOR = 'details-menu, [role="menu"], [role="listbox"], [role="dialog"], [popover], .SelectMenu, .select-menu-modal, .js-discussion-sidebar-menu';

const clean = (text: string | null | undefined): string => (text ?? '').replace(/[​-‏‪-‮⁠⁦-⁩﻿]/g, '').replace(/\s+/g, ' ').trim();

function textOfIds(doc: Document, ids: string | null): string {
  return clean(
    (ids?.split(/\s+/).filter(Boolean) ?? [])
      .map((id) => doc.getElementById(id)?.textContent ?? '')
      .join(' '),
  );
}

function labelOf(control: Element, doc: Document): string {
  const aria = clean(control.getAttribute('aria-label'));
  if (aria) return aria;
  const by = textOfIds(doc, control.getAttribute('aria-labelledby'));
  if (by) return by;
  const labels = (control as HTMLInputElement).labels;
  if (labels && labels.length) return clean([...labels].map((label) => label.textContent).join(' '));
  const wrap = control.closest('label');
  return wrap ? clean(wrap.textContent) : '';
}

const stripMarks = (label: string): string => clean(label.replace(/\*+|\((required|إلزامي)\)|\(optional\)|required/gi, ' '));

function isTitle(control: Element): boolean {
  const name = control.getAttribute('name') ?? '';
  return TITLE_NAME.test(name) || /^title$/i.test(clean(control.getAttribute('aria-label'))) || control.getAttribute('data-testid') === 'issue-title';
}

interface Collected {
  readonly element: Element;
  readonly info: Omit<FormFieldInfo, 'current'>;
}

function describe(control: Element, doc: Document, type: FormControlType, label: string): Collected {
  const required =
    control.hasAttribute('required') || control.getAttribute('aria-required') === 'true' || /\*|\(required\)|\(إلزامي\)/i.test(label) || control.closest('[data-required="true"]') !== null;
  return {
    element: control,
    info: {
      label: stripMarks(label),
      type,
      required,
      placeholder: clean(control.getAttribute('placeholder')),
      hint: textOfIds(doc, control.getAttribute('aria-describedby')),
    },
  };
}

/** يحلل النموذج الحاوي لـfield. */
export function analyzeForm(field: HTMLTextAreaElement): FormAnalysis {
  const form = field.closest('form');
  if (!form) return { status: 'none' };
  const doc = field.ownerDocument;
  const collected: Collected[] = [];
  const seenGroups = new Set<string>();
  for (const control of form.querySelectorAll('input, textarea, select')) {
    if (control.closest(`mijhar-host, ${MENU_ANCESTOR}`)) continue;
    const tag = control.localName;
    const kind = (control.getAttribute('type') ?? 'text').toLowerCase();
    if (tag === 'input' && SKIP_TYPES.has(kind)) continue;
    if (control.getAttribute('aria-hidden') === 'true' || (control as HTMLElement).hidden) continue;
    if (tag === 'input' && (kind === 'checkbox' || kind === 'radio')) {
      // مربعات الاختيار المتجاورة مجموعة واحدة بتسمية fieldset/legend أو المجموعة المسمّاة.
      const group = control.closest('fieldset, [role="group"], [role="radiogroup"]');
      const key = group ? (group.id || `group-${collected.length}`) : `single-${collected.length}`;
      if (group && seenGroups.has(key)) continue;
      if (group) seenGroups.add(key);
      const legend = group ? clean(group.querySelector('legend')?.textContent) || clean(group.getAttribute('aria-label')) || textOfIds(doc, group.getAttribute('aria-labelledby')) : '';
      collected.push(describe(control, doc, 'checkboxes', legend || labelOf(control, doc)));
      continue;
    }
    if (isTitle(control)) continue;
    if (tag === 'select') collected.push(describe(control, doc, 'dropdown', labelOf(control, doc)));
    else if (tag === 'textarea') collected.push(describe(control, doc, 'textarea', labelOf(control, doc)));
    else collected.push(describe(control, doc, 'input', labelOf(control, doc)));
  }
  const real = (c: Collected): boolean => c.info.label !== '' && !GENERIC_LABEL.test(c.info.label);
  const others = collected.filter((c) => c.element !== field);
  const labeledOthers = others.filter(real);
  if (others.length === 0) return { status: 'none' };
  const self = collected.find((c) => c.element === field);
  if (!self || !real(self)) {
    // حقول أخرى في النموذج ولا تسمية يُعتمد عليها للحقل المفتوح: هيكل غير معروف.
    return labeledOthers.length || others.length >= 2 ? { status: 'unknown', reason: 'الحقل المفتوح بلا تسمية تدل عليه بين حقول نموذج آخر' } : { status: 'none' };
  }
  if (labeledOthers.length < 1) return others.length >= 2 ? { status: 'unknown', reason: 'حقول النموذج الأخرى بلا تسميات يُعتمد عليها' } : { status: 'none' };
  const fields: FormFieldInfo[] = collected.filter(real).map((c) => ({ ...c.info, current: c.element === field }));
  const current = fields.find((f) => f.current);
  if (!current) return { status: 'unknown', reason: 'تعذّر تحديد الحقل المفتوح في النموذج' };
  return { status: 'form', fields, current };
}
