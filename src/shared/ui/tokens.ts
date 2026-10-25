// رموز هوية مِجهَر وأنماط المكوّنات الأساسية، نصًّا يُحقن داخل كل جذر Shadow DOM وفي صفحات الإضافة.
// القيم من ملف التصميم المعتمد (AD-13): الصفحة «01 — الهوية · Mj2»، القسم 08 (الألوان بوضعيها) و09 (الخطوط) و10.
// تُعرَّف الرموز على .mj-root لا على :host: لا تصل أنماط الصفحة إلى عنصر داخل الجذر، فلا يغلب متغيرٌ تعرّفه الصفحة
// بالاسم نفسه ما نعرّفه هنا (المتغيرات تُورَّث عبر حدود الظل، والتعريف على العنصر الأقرب يغلب). ولا rem: حجم خط
// الصفحة الجذري يغيّرها؛ كل المقاسات بالبكسل.
// خطّا الهوية أولًا بعائلتيهما المضمّنتين (fonts.ts، تسجّلهما نقطتا التركيب)، ثم الاسم المثبت على الجهاز، ثم خطوط النظام.
import { UI_FONT_DISPLAY, UI_FONT_TEXT } from './fonts';

const LIGHT = `
  --mijhar-bg-canvas: #f4f6f8;
  --mijhar-bg-surface: #ffffff;
  --mijhar-bg-surface-raised: #ffffff;
  --mijhar-bg-subtle: #fafbfc;
  --mijhar-bg-muted: #eaeef2;
  --mijhar-bg-selected: #edfaf9;
  --mijhar-bg-brand: #0c7a7a;
  --mijhar-bg-brand-subtle: #edfaf9;
  --mijhar-bg-accent-subtle: #fff8eb;
  --mijhar-bg-success-subtle: #edfaf1;
  --mijhar-bg-danger-subtle: #fff0ee;
  --mijhar-bg-warning-subtle: #fff8e5;
  --mijhar-bg-info-subtle: #eef5ff;
  --mijhar-bg-danger: #c42f25;
  --mijhar-text-primary: #171c22;
  --mijhar-text-secondary: #56616d;
  --mijhar-text-tertiary: #66717d;
  --mijhar-text-disabled: #97a2ae;
  --mijhar-text-brand: #0a6465;
  --mijhar-text-link: #0a6465;
  --mijhar-text-success: #1a7034;
  --mijhar-text-danger: #a2231c;
  --mijhar-text-warning: #7f5408;
  --mijhar-text-info: #1a509c;
  --mijhar-text-code: #2b333c;
  --mijhar-text-on-brand: #ffffff;
  --mijhar-border-default: #d9dfe6;
  --mijhar-border-muted: #eaeef2;
  --mijhar-border-strong: #66717d;
  --mijhar-border-focus: #0c7a7a;
  --mijhar-border-brand: #0c7a7a;
  --mijhar-shadow-raised: 0 8px 24px rgba(14, 18, 22, 0.16), 0 1px 2px rgba(14, 18, 22, 0.08);
  color-scheme: light;
`;

const DARK = `
  --mijhar-bg-canvas: #0e1216;
  --mijhar-bg-surface: #171c22;
  --mijhar-bg-surface-raised: #20272f;
  --mijhar-bg-subtle: #20272f;
  --mijhar-bg-muted: #2b333c;
  --mijhar-bg-selected: #04292b;
  --mijhar-bg-brand: #3bb4b1;
  --mijhar-bg-brand-subtle: #04292b;
  --mijhar-bg-accent-subtle: #2b1a07;
  --mijhar-bg-success-subtle: #0e2416;
  --mijhar-bg-danger-subtle: #2d1210;
  --mijhar-bg-warning-subtle: #2a1f06;
  --mijhar-bg-info-subtle: #0e1e36;
  --mijhar-bg-danger: #f2685a;
  --mijhar-text-primary: #f4f6f8;
  --mijhar-text-secondary: #c2cad3;
  --mijhar-text-tertiary: #97a2ae;
  --mijhar-text-disabled: #56616d;
  --mijhar-text-brand: #6fcfcb;
  --mijhar-text-link: #6fcfcb;
  --mijhar-text-success: #4ac26b;
  --mijhar-text-danger: #f2685a;
  --mijhar-text-warning: #e5aa1f;
  --mijhar-text-info: #5a9bf5;
  --mijhar-text-code: #eaeef2;
  --mijhar-text-on-brand: #04292b;
  --mijhar-border-default: #3f4954;
  --mijhar-border-muted: #2b333c;
  --mijhar-border-strong: #66717d;
  --mijhar-border-focus: #3bb4b1;
  --mijhar-border-brand: #3bb4b1;
  --mijhar-shadow-raised: 0 8px 24px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.4);
  color-scheme: dark;
`;

const SHARED = `
  --mijhar-font-display: "${UI_FONT_DISPLAY}", Cairo, "Noto Kufi Arabic", "Segoe UI", Tahoma, system-ui, sans-serif;
  --mijhar-font-text: "${UI_FONT_TEXT}", Almarai, "Noto Sans Arabic", "Segoe UI", Tahoma, system-ui, sans-serif;
  --mijhar-font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --mijhar-space-4: 4px;
  --mijhar-space-6: 6px;
  --mijhar-space-8: 8px;
  --mijhar-space-12: 12px;
  --mijhar-space-16: 16px;
  --mijhar-space-24: 24px;
  --mijhar-radius-6: 6px;
  --mijhar-radius-12: 12px;
  --mijhar-radius-full: 999px;
  --mijhar-focus-ring: 0 0 0 2px var(--mijhar-bg-surface), 0 0 0 4px var(--mijhar-border-focus);
`;

/** الرموز والطباعة الأساسية على الجذر. data-theme يفرض وضعًا؛ وبدونه يتبع تفضيل النظام. */
export const TOKENS_CSS = `
.mj-root {
  ${SHARED}
  ${LIGHT}
  direction: rtl;
  text-align: start;
  font-family: var(--mijhar-font-text);
  font-size: 14px;
  line-height: 20px;
  font-weight: 400;
  color: var(--mijhar-text-primary);
  background: var(--mijhar-bg-surface);
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .mj-root:not([data-theme="light"]) { ${DARK} }
}
.mj-root[data-theme="dark"] { ${DARK} }
.mj-root *, .mj-root *::before, .mj-root *::after { box-sizing: inherit; }
`;

/** أنماط المكوّنات المشتركة (الأزرار والتبويبات والمفاتيح والأقسام). */
export const COMPONENTS_CSS = `
.mj-root h1, .mj-root h2, .mj-root h3 { font-family: var(--mijhar-font-display); font-weight: 700; margin: 0; color: var(--mijhar-text-primary); }
.mj-root h1 { font-size: 20px; line-height: 32px; }
.mj-root h2 { font-size: 16px; line-height: 24px; }
.mj-root h3 { font-size: 14px; line-height: 20px; }
.mj-root p { margin: 0; }
.mj-root a { color: var(--mijhar-text-link); text-decoration: underline; text-underline-offset: 2px; }
.mj-root a:focus-visible, .mj-root button:focus-visible, .mj-root select:focus-visible, .mj-root [tabindex]:focus-visible {
  outline: none; box-shadow: var(--mijhar-focus-ring); border-radius: var(--mijhar-radius-6);
}
.mj-root .muted { color: var(--mijhar-text-secondary); }
.mj-root .small { font-size: 12px; line-height: 16px; }
.mj-root .ltr-inline { direction: ltr; unicode-bidi: isolate; display: inline-block; }
.mj-root .mono, .mj-root code, .mj-root kbd { font-family: var(--mijhar-font-mono); font-size: 12px; line-height: 20px; }
.mj-root kbd {
  direction: ltr; unicode-bidi: isolate; display: inline-block; padding: 0 var(--mijhar-space-6);
  border: 1px solid var(--mijhar-border-default); border-bottom-width: 2px; border-radius: var(--mijhar-radius-6);
  background: var(--mijhar-bg-subtle); color: var(--mijhar-text-code);
}

.mj-root .btn {
  appearance: none; display: inline-flex; align-items: center; justify-content: center; gap: var(--mijhar-space-6);
  min-height: 32px; padding: 0 var(--mijhar-space-12); margin: 0;
  font: inherit; font-weight: 700; color: var(--mijhar-text-primary);
  background: var(--mijhar-bg-surface); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6);
  cursor: pointer; white-space: nowrap;
}
.mj-root .btn:hover { background: var(--mijhar-bg-subtle); border-color: var(--mijhar-border-strong); }
.mj-root .btn:disabled { color: var(--mijhar-text-disabled); cursor: not-allowed; background: var(--mijhar-bg-muted); border-color: var(--mijhar-border-default); }
.mj-root .btn-primary { background: var(--mijhar-bg-brand); color: var(--mijhar-text-on-brand); border-color: var(--mijhar-bg-brand); }
.mj-root .btn-primary:hover { background: var(--mijhar-bg-brand); filter: brightness(1.08); border-color: var(--mijhar-bg-brand); }
.mj-root .btn-danger { color: var(--mijhar-text-danger); }
.mj-root .btn-ghost { background: transparent; border-color: transparent; color: var(--mijhar-text-brand); }
.mj-root .btn-ghost:hover { background: var(--mijhar-bg-subtle); border-color: transparent; }
.mj-root .visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.mj-root .icon-btn { min-width: 32px; padding: 0; font-size: 18px; line-height: 1; }

.mj-root .tablist { display: flex; gap: var(--mijhar-space-4); padding: 0 var(--mijhar-space-12); border-bottom: 1px solid var(--mijhar-border-default); overflow-x: auto; scrollbar-width: thin; }
.mj-root .tab {
  appearance: none; flex: 0 0 auto; margin: 0; padding: var(--mijhar-space-8) var(--mijhar-space-8); background: transparent;
  border: 0; border-bottom: 2px solid transparent; font: inherit; font-weight: 700; color: var(--mijhar-text-secondary); cursor: pointer;
}
.mj-root .tab[aria-selected="true"] { color: var(--mijhar-text-brand); border-bottom-color: var(--mijhar-border-brand); }
.mj-root .tab:hover { color: var(--mijhar-text-primary); }
.mj-root .tabpanel { padding: var(--mijhar-space-16); }
.mj-root .panel-title { margin-bottom: var(--mijhar-space-12); }
.mj-root .tabpanel:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--mijhar-border-focus); }

.mj-root .section { display: flex; flex-direction: column; gap: var(--mijhar-space-8); padding: var(--mijhar-space-16) 0; border-bottom: 1px solid var(--mijhar-border-muted); }
.mj-root .section:first-child { padding-top: 0; }
.mj-root .section:last-child { border-bottom: 0; }
.mj-root .empty { padding: var(--mijhar-space-16); border: 1px dashed var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); color: var(--mijhar-text-secondary); background: var(--mijhar-bg-subtle); }
.mj-root .status { display: inline-flex; align-items: center; gap: var(--mijhar-space-6); padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); font-size: 12px; line-height: 20px; font-weight: 700; }
.mj-root .status[data-state="granted"] { background: var(--mijhar-bg-success-subtle); color: var(--mijhar-text-success); }
.mj-root .status[data-state="denied"] { background: var(--mijhar-bg-muted); color: var(--mijhar-text-secondary); }
.mj-root .status[data-state="pending"] { background: var(--mijhar-bg-info-subtle); color: var(--mijhar-text-info); }
.mj-root .notice { padding: var(--mijhar-space-8) var(--mijhar-space-12); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-info-subtle); color: var(--mijhar-text-info); }
.mj-root .notice[data-tone="danger"] { background: var(--mijhar-bg-danger-subtle); color: var(--mijhar-text-danger); }
.mj-root .row { display: flex; align-items: center; gap: var(--mijhar-space-8); flex-wrap: wrap; }
.mj-root .icon { flex: 0 0 auto; vertical-align: middle; }
.mj-root a.btn { text-decoration: none; }
.mj-root .help-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mijhar-space-12); padding: var(--mijhar-space-8) 0; border-bottom: 1px solid var(--mijhar-border-muted); }
.mj-root .help-row:last-child { border-bottom: none; }
.mj-root .help-row .label { display: flex; flex-direction: column; gap: 2px; }

.mj-root .toggle-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mijhar-space-12); padding: var(--mijhar-space-8) 0; border-bottom: 1px solid var(--mijhar-border-muted); }
.mj-root .toggle-row:last-child { border-bottom: none; }
.mj-root .toggle-row .label { display: flex; flex-direction: column; gap: 2px; cursor: pointer; }
.mj-root .toggle-row .label strong { font-weight: 700; }
/* قائمة في صف إعداد تنكمش مع الصف ولا تدفع الصفحة إلى تمرير أفقي في العرض الضيق (MJ26، 360 بكسل)؛ والخيار الطويل يُقصّ داخلها. */
.mj-root .toggle-row select { flex: 0 1 auto; min-width: 0; max-width: 55%; }
.mj-root .choice { display: flex; align-items: flex-start; gap: var(--mijhar-space-8); padding: var(--mijhar-space-6) 0; cursor: pointer; }
.mj-root .choice input { margin: 3px 0 0; accent-color: var(--mijhar-bg-brand); }

/* مفتاح التشغيل المنقول من المشروع السابق (Toggle.tsx)؛ أضيف إليه إطار التركيز ولون الهوية. */
.mj-root .toggle-switch { position: relative; display: inline-block; width: 40px; height: 22px; flex-shrink: 0; vertical-align: middle; }
.mj-root .toggle-switch input { opacity: 0; width: 100%; height: 100%; margin: 0; position: absolute; inset: 0; cursor: pointer; z-index: 1; }
.mj-root .toggle-slider { position: absolute; inset: 0; background: var(--mijhar-border-strong); border-radius: var(--mijhar-radius-full); transition: background 120ms ease; }
.mj-root .toggle-slider::before {
  content: ''; position: absolute; width: 16px; height: 16px; border-radius: 50%; background: #fff; top: 3px; inset-inline-start: 3px;
  transition: transform 120ms ease; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}
.mj-root .toggle-switch input:checked + .toggle-slider { background: var(--mijhar-bg-brand); }
.mj-root .toggle-switch input:checked + .toggle-slider::before { transform: translateX(-18px); }
.mj-root[dir="ltr"] .toggle-switch input:checked + .toggle-slider::before { transform: translateX(18px); }
.mj-root .toggle-switch input:focus-visible + .toggle-slider { box-shadow: var(--mijhar-focus-ring); }
.mj-root .toggle-switch input:disabled + .toggle-slider { opacity: 0.5; }
@media (prefers-reduced-motion: reduce) { .mj-root .toggle-slider, .mj-root .toggle-slider::before { transition: none; } }
`;

export const BASE_CSS = TOKENS_CSS + COMPONENTS_CSS;
