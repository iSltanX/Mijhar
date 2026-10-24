// أنماط واجهة الترجمة: مضيفات الفقرات المترجَمة (ترث خط الصفحة ولونها فتبدو جزءًا منها)، وشريط التحكم فوق كل نص، وزر التحديد وبطاقته،
// وبطاقة الاستئذان قبل تنزيل المتصفح حزمة اللغة (T-4.4، أنماطها في model-manager/consent-style.ts).
import { CONSENT_CSS } from '../model-manager/consent-style';

export const TRANSLATION_HOST_CSS = `
:host {
  display: block !important; position: static !important; float: none !important; width: auto !important; max-width: 100% !important;
  margin: 4px 0 8px !important; padding: 0 !important; border: 0 !important; background: none !important;
  visibility: visible !important; opacity: 1 !important; transform: none !important; filter: none !important;
}
:host([data-hidden]) { display: none !important; }
`;

export const TRANSLATION_CSS = `
.mj-root.tr-root {
  font: inherit; color: inherit; background: transparent; line-height: inherit;
  padding-block: 2px; padding-inline-start: 10px; border-inline-start: 3px solid var(--mijhar-border-brand);
  overflow-wrap: anywhere;
}
/* التسمية لقارئ الشاشة وحده: الشريط الجانبي يميّز الترجمة بصريًا، وتكرارها فوق كل فقرة في نص طويل ضجيج. */
.tr-label { position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.tr-body { white-space: normal; }
.prot { direction: ltr; unicode-bidi: isolate; display: inline; }
code.prot, kbd.prot, samp.prot, tt.prot, .prot[data-type="CODE"], .prot[data-type="PATH"], .prot[data-type="CMD"] {
  font-family: var(--mijhar-font-mono); font-size: 0.9em; padding: 0 0.3em; border-radius: var(--mijhar-radius-6);
  background: var(--mijhar-bg-muted); color: var(--mijhar-text-code);
}
a.prot { color: var(--mijhar-text-link); text-decoration: underline; text-underline-offset: 2px; }
.tr-warning { margin: 0; padding: 6px 10px; border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); font-size: 13px; line-height: 20px; }
`;

export const BAR_HOST_CSS = `
:host {
  all: initial !important; display: block !important; margin: 0 0 8px !important; max-width: 100% !important;
  visibility: visible !important; opacity: 1 !important; transform: none !important; filter: none !important;
}
`;

export const BAR_CSS = `
.mj-root.bar-root { background: transparent; }
.bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--mijhar-space-8); padding: var(--mijhar-space-6) var(--mijhar-space-8);
  border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-subtle);
}
.bar .btn { min-height: 28px; font-size: 13px; }
.bar .modes { display: inline-flex; gap: 0; }
.bar .modes .btn { border-radius: 0; margin-inline-start: -1px; }
.bar .modes .btn:first-child { border-start-start-radius: var(--mijhar-radius-6); border-end-start-radius: var(--mijhar-radius-6); margin-inline-start: 0; }
.bar .modes .btn:last-child { border-start-end-radius: var(--mijhar-radius-6); border-end-end-radius: var(--mijhar-radius-6); }
.bar .btn[aria-pressed="true"] { background: var(--mijhar-bg-brand); color: var(--mijhar-text-on-brand); border-color: var(--mijhar-bg-brand); }
.bar .note { font-size: 12px; color: var(--mijhar-text-secondary); }
.bar .note[data-tone="danger"] { color: var(--mijhar-text-danger); }
.bar progress { inline-size: 120px; block-size: 8px; accent-color: var(--mijhar-bg-brand); }
@media (pointer: coarse), (hover: none) { .bar .btn, .bar .consent .btn { min-height: 44px; } }
${CONSENT_CSS}`;

export const FLOAT_HOST_CSS = `
:host {
  all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483000 !important; display: block !important;
  pointer-events: none !important; overflow: visible !important; visibility: visible !important; opacity: 1 !important; transform: none !important; filter: none !important;
}
`;

export const FLOAT_CSS = `
.mj-root.float-root { position: absolute; inset: 0; background: transparent; pointer-events: none; overflow: visible; }
.sel-btn {
  position: absolute; pointer-events: auto; min-height: 30px; padding: 0 var(--mijhar-space-12); border-radius: var(--mijhar-radius-full);
  box-shadow: var(--mijhar-shadow-raised);
}
.sel-card {
  position: absolute; pointer-events: auto; inline-size: min(380px, calc(100vw - 16px)); max-block-size: min(60vh, 420px); overflow: auto; overscroll-behavior: contain;
  display: flex; flex-direction: column; gap: var(--mijhar-space-8); padding: var(--mijhar-space-12);
  background: var(--mijhar-bg-surface-raised); color: var(--mijhar-text-primary); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); box-shadow: var(--mijhar-shadow-raised);
}
.sel-card:focus-visible { outline: none; box-shadow: var(--mijhar-shadow-raised), var(--mijhar-focus-ring); }
.sel-card header { display: flex; align-items: center; justify-content: space-between; gap: var(--mijhar-space-8); }
.sel-card h2 { font-size: 14px; line-height: 22px; }
.sel-original { margin: 0; padding: var(--mijhar-space-6) var(--mijhar-space-8); border-inline-start: 3px solid var(--mijhar-border-default); color: var(--mijhar-text-secondary); direction: ltr; text-align: left; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; }
.sel-result { margin: 0; overflow-wrap: anywhere; }
.sel-card .tr-warning { margin: 0; padding: 6px 10px; border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); }
.sel-card .prot { direction: ltr; unicode-bidi: isolate; }
@media (pointer: coarse), (hover: none) { .sel-btn, .sel-card .btn { min-height: 44px; } }
${CONSENT_CSS}`;
