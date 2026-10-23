// أنماط مساعد الكتابة: زر الشريط، واللوحة العائمة (حوار غير مشروط) بقسمها الأساسي المحلي.
export const BUTTON_CSS = `
.trigger { min-width: 32px; height: 28px; padding: 0 var(--mijhar-space-8); font-size: 13px; font-weight: 700; line-height: 1; }
.trigger[aria-expanded="true"] { background: var(--mijhar-bg-brand); color: var(--mijhar-text-on-brand); border-color: var(--mijhar-bg-brand); }
`;

export const BAR_HOST_CSS = `
:host { all: initial !important; display: block !important; width: fit-content !important; max-width: 100% !important; margin: 0 0 4px !important; }
`;

export const PANEL_HOST_CSS = `
:host {
  all: initial !important; position: fixed !important; right: 16px !important; bottom: 16px !important; z-index: 2147482990 !important; display: block !important;
  width: min(460px, calc(100vw - 24px)) !important; max-height: calc(100vh - 32px) !important; overflow: visible !important;
  visibility: visible !important; opacity: 1 !important; transform: none !important; filter: none !important;
}
`;

export const PANEL_CSS = `
.mj-root.panel-root { background: transparent; }
.panel {
  display: flex; flex-direction: column; gap: var(--mijhar-space-8); max-height: calc(100vh - 32px); overflow: hidden; padding: var(--mijhar-space-12);
  background: var(--mijhar-bg-surface-raised); color: var(--mijhar-text-primary); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); box-shadow: var(--mijhar-shadow-raised);
}
.panel:focus-visible { outline: none; box-shadow: var(--mijhar-shadow-raised), var(--mijhar-focus-ring); }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mijhar-space-8); }
.panel-head h2 { font-size: 15px; line-height: 22px; }
/* الحقول تتمرر وحدها، والمعاينة وأزرار الإدراج والتراجع وحالتها في تذييل ثابت: ما سيُدرج أمام المستخدم دائمًا، والأزرار في متناوله. */
.static-section { display: flex; flex-direction: column; gap: var(--mijhar-space-8); flex: 1 1 auto; min-height: 0; }
.panel-scroll { display: flex; flex-direction: column; gap: var(--mijhar-space-8); flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; padding-block-end: var(--mijhar-space-4); }
.panel-foot { display: flex; flex-direction: column; gap: var(--mijhar-space-6); flex: 0 0 auto; padding-top: var(--mijhar-space-8); border-top: 1px solid var(--mijhar-border-muted); }
.kinds { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-8); border: 0; margin: 0; padding: 0; }
.kinds legend { padding: 0; font-weight: 700; margin-bottom: var(--mijhar-space-4); }
.field { display: flex; flex-direction: column; gap: 2px; }
.field label { font-weight: 700; }
.field .hint { font-size: 12px; color: var(--mijhar-text-secondary); }
.panel textarea, .panel select {
  display: block; width: 100%; margin: 0; padding: var(--mijhar-space-4) var(--mijhar-space-8); font: inherit; color: var(--mijhar-text-primary);
  background: var(--mijhar-bg-surface); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6);
}
.panel textarea { min-height: 52px; resize: vertical; }
.panel textarea:focus-visible, .panel select:focus-visible { outline: none; border-color: var(--mijhar-border-focus); box-shadow: var(--mijhar-focus-ring); }
.preview-box { display: flex; flex-direction: column; gap: var(--mijhar-space-4); }
.preview-box h3 { font-size: 13px; }
.preview { margin: 0; padding: var(--mijhar-space-8); max-height: 112px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; direction: ltr; text-align: start; unicode-bidi: plaintext;
  font: 12px/18px var(--mijhar-font-mono); background: var(--mijhar-bg-subtle); border: 1px solid var(--mijhar-border-muted); border-radius: var(--mijhar-radius-6); }
.preview[data-empty="true"] { color: var(--mijhar-text-tertiary); font-family: var(--mijhar-font-text); direction: rtl; }
.actions { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-8); }
.status { display: block; padding: var(--mijhar-space-6) var(--mijhar-space-8); border-radius: var(--mijhar-radius-6); border-radius: var(--mijhar-radius-6); font-weight: 400; }
.status[data-tone="ok"] { background: var(--mijhar-bg-success-subtle); color: var(--mijhar-text-success); }
.status[data-tone="warn"] { background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); }
.panel .note { font-size: 12px; color: var(--mijhar-text-secondary); }
@media (pointer: coarse), (hover: none) { .panel .btn { min-height: 44px; } }
`;
