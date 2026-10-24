// زر «نسخ البرومبت» (T-11.3، F-E7): زر مقسوم صغير بلا صندوق نص ولا نافذة معاينة. الجزء الرئيسي ينسخ، والسهم يفتح قائمة القوالب الخمسة (Prompt template menu).
// الحالات الأربع ظاهرة في الزر نفسه: افتراضي ← تحميل أثناء الجمع والتجهيز ← نجاح («تم النسخ» لا يظهر إلا بعد نجاح الكتابة فعليًا) أو فشل بسببه.
// وتحته عند الحاجة ملاحظة سطرية مختصرة: الفشل مع البديل اليدوي (تنزيل ملف .md محلي)، والمحتوى الخاص المحجوب. لا يُعرض البرومبت في أي موضع.
import { useLayoutEffect, useRef } from 'preact/hooks';
import { Icon } from '../../../shared/ui/icons';
import { PROMPTS } from '../prompt-templates';
import type { PromptId } from '../prompt-templates';
import { LocalIcon } from './icons';

export type CopyState = 'idle' | 'loading' | 'success' | 'failed';
export type DownloadState = 'idle' | 'downloaded' | 'failed';

export const STATE_LABEL: Readonly<Record<CopyState, string>> = { idle: 'نسخ البرومبت', loading: 'يجهّز البرومبت…', success: 'تم النسخ', failed: 'تعذّر النسخ' };
export const MENU_TITLE = 'اختر قالب البرومبت';
export const MENU_FOOT = 'في كل برومبت قسم «المعلومات الناقصة». يُنسخ محليًا بلا مفتاح ولا إرسال.';

/** وصف كل قالب في القائمة (من مكوّن Prompt template menu في التصميم المعتمد). */
export const TEMPLATE_BLURB: Readonly<Record<PromptId, string>> = {
  understand: 'الوصف والتعليقات والروابط المرتبطة',
  diagnose: 'الفحوص الفاشلة ومقتطف السجل والتغييرات',
  review: 'الفرق والملفات والفحوص ونقاط المراجعة',
  'next-step': 'ما أُنجز وما يمنع وما ينقص',
  handoff: 'المستودع والفرع والالتزام وخطوات التكرار',
};

/** ما حُجب من الأسرار المحتملة في النسخة: العدد الكلي وبند لكل نمط («2× رمز GitHub»). */
export interface PrivateNote {
  readonly total: number;
  readonly items: readonly string[];
}

export interface CopyPromptViewProps {
  readonly state: CopyState;
  readonly template: PromptId;
  readonly menuOpen: boolean;
  /** سبب الفشل (state = failed). */
  readonly reason: string | null;
  readonly privateNote: PrivateNote | null;
  readonly download: DownloadState;
  /** هل في الذاكرة برومبت مجهّز يُنزَّل بديلًا يدويًا (فشلت الكتابة بعد التجهيز لا قبله). */
  readonly canDownload: boolean;
  readonly fileName: string;
  readonly onCopy: () => void;
  readonly onToggleMenu: () => void;
  readonly onCloseMenu: () => void;
  readonly onPick: (id: PromptId) => void;
  readonly onDownload: () => void;
}

const live = (state: CopyState, reason: string | null): string => (state === 'idle' ? '' : state === 'failed' ? `تعذّر النسخ: ${reason ?? 'سبب غير معروف'}` : STATE_LABEL[state]);

export function CopyPromptView(props: CopyPromptViewProps) {
  const { state, template, menuOpen, reason, privateNote } = props;
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const more = useRef<HTMLButtonElement>(null);
  const current = PROMPTS.find((p) => p.id === template) ?? PROMPTS[0];
  const label = current?.label ?? '';
  const busy = state === 'loading';

  // عند فتح القائمة يذهب التركيز إلى القالب الحالي.
  useLayoutEffect(() => {
    if (!menuOpen) return;
    items.current[Math.max(0, PROMPTS.findIndex((p) => p.id === template))]?.focus();
  }, [menuOpen]);

  const onMenuKey = (event: KeyboardEvent) => {
    const at = items.current.findIndex((el) => el === (event.target as Node));
    const move = (to: number) => {
      event.preventDefault();
      items.current[(to + PROMPTS.length) % PROMPTS.length]?.focus();
    };
    if (event.key === 'ArrowDown') move(at + 1);
    else if (event.key === 'ArrowUp') move(at - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(PROMPTS.length - 1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      props.onCloseMenu();
      more.current?.focus();
    } else if (event.key === 'Tab') props.onCloseMenu();
  };

  return (
    <section class="cp-section" data-section="copy-prompt" data-state={state} data-template={template}>
      <div class="cp-row">
        <div class="cp" role="group" aria-label="نسخ البرومبت" data-copy-prompt="" data-state={state}>
          <button
            type="button"
            class="cp-main"
            data-action="copy-prompt"
            aria-busy={busy ? 'true' : undefined}
            aria-disabled={busy ? 'true' : undefined}
            title={`يجمع سياق هذه الصفحة محليًا ويكتب برومبت «${label}» إلى الحافظة بلا إرسال إلى أي جهة`}
            onClick={() => {
              if (!busy) props.onCopy();
            }}
          >
            {state === 'loading' ? <LocalIcon name="spinner" className="cp-spin" /> : state === 'success' ? <Icon name="check" /> : state === 'failed' ? <LocalIcon name="x-circle" /> : <LocalIcon name="copy" />}
            <span data-label="">{STATE_LABEL[state]}</span>
          </button>
          <button
            type="button"
            class="cp-more"
            ref={more}
            data-action="template-menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen ? 'true' : 'false'}
            aria-label={`${MENU_TITLE} (الحالي: ${label})`}
            title={MENU_TITLE}
            disabled={busy}
            onClick={props.onToggleMenu}
          >
            <LocalIcon name="chevron-down" />
          </button>
        </div>
        {menuOpen && (
          <div class="cp-menu" role="menu" aria-label={MENU_TITLE} data-template-menu="" onKeyDown={onMenuKey}>
            <div class="cp-menu-title">{MENU_TITLE}</div>
            {PROMPTS.map((p, i) => (
              <button
                key={p.id}
                type="button"
                class="cp-item"
                role="menuitemradio"
                aria-checked={p.id === template ? 'true' : 'false'}
                data-template-id={p.id}
                tabIndex={p.id === template ? 0 : -1}
                ref={(el) => {
                  items.current[i] = el;
                }}
                onClick={() => props.onPick(p.id)}
              >
                <span class="cp-item-check">{p.id === template && <Icon name="check" />}</span>
                <span class="cp-item-text">
                  <span class="cp-item-label">{p.label}</span>
                  <span class="cp-item-blurb">{TEMPLATE_BLURB[p.id]}</span>
                </span>
              </button>
            ))}
            <div class="cp-menu-foot">{MENU_FOOT}</div>
          </div>
        )}
        <span class="visually-hidden" role="status" aria-live="polite" data-live="">
          {live(state, reason)}
        </span>
      </div>
      {state === 'failed' && (
        <p class="cp-note" data-tone="danger" data-note="failed" role="alert">
          <LocalIcon name="x-circle" />
          <span class="cp-note-body">
            <span data-reason="">تعذّر النسخ: {reason}</span>
            {props.canDownload && props.download === 'idle' && (
              <span>
                بديل يدوي بلا حافظة:{' '}
                <button type="button" class="cp-link" data-action="download-prompt" onClick={props.onDownload}>
                  نزّل البرومبت ملفًا {props.fileName}
                </button>
              </span>
            )}
            {props.download === 'downloaded' && <span data-download="downloaded">طُلب من المتصفح تنزيل الملف {props.fileName}. لم يُرسل البرومبت إلى أي جهة.</span>}
            {props.download === 'failed' && <span data-download="failed">تعذّر التنزيل أيضًا: أعد المحاولة بنقرة مباشرة على الزر.</span>}
          </span>
        </p>
      )}
      {privateNote && (
        <p class="cp-note" data-tone="warning" data-note="private" role="status">
          <Icon name="shield" />
          <span class="cp-note-body">
            <span>
              حُجب {privateNote.total} من الأنماط السرّية المحتملة في البرومبت (
              {privateNote.items.map((item, i) => (
                // كل بند معزول اتجاهًا: اسم النمط يحوي كلمات لاتينية (GitHub وAWS) تشوّش ترتيب العدد بجوارها في سطر عربي.
                <span key={item}>
                  {i > 0 && '، '}
                  <bdi data-private-item="">{item}</bdi>
                </span>
              ))}
              ). الحجب بقائمة أنماط معروفة لا يزيل كل سرّ: راجع ما تلصقه.
            </span>
          </span>
        </p>
      )}
    </section>
  );
}
