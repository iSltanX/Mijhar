// أنماط «نسخ البرومبت» فوق BASE_CSS (الرموز من shared/ui/tokens)، بمقاسات مكوّني Copy prompt button وPrompt template menu وInline note في الصفحة «02 — المكوّنات»
// من ملف التصميم المعتمد: زر مقسوم ارتفاعه 28px وركنه 6px، حالاته الخمس (افتراضي/تحميل/نجاح/فشل/تعطيل)، وقائمة قوالب بعرض 312px، وملاحظة سطرية بخمس نبرات.
// الواجهة داخل جذر Shadow DOM فلا تخرج أنماطها إلى الصفحة. لا إطار حول الجذر ولا خلفية: صف رفيع بجوار القسم لا بطاقة جديدة.
export const COPY_PROMPT_CSS = `
.mj-root { display: block; margin: var(--mijhar-space-4) 0; background: transparent; }
.cp-row { display: flex; align-items: center; gap: var(--mijhar-space-8); flex-wrap: wrap; position: relative; }
.cp { position: relative; display: inline-flex; flex-direction: row; align-items: stretch; height: 28px; border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-surface); color: var(--mijhar-text-primary); }
.cp button {
  appearance: none; margin: 0; border: 0; background: transparent; font: inherit; font-size: 12px; line-height: 16px; font-weight: 700; color: inherit; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: var(--mijhar-space-6); padding: 0 var(--mijhar-space-8); white-space: nowrap;
}
.cp-main { border-start-start-radius: 5px; border-end-start-radius: 5px; min-width: 110px; }
.cp-more { border-inline-start: 1px solid var(--mijhar-border-default) !important; border-start-end-radius: 5px; border-end-end-radius: 5px; padding: 0 var(--mijhar-space-6) !important; }
.cp button:hover { background: var(--mijhar-bg-subtle); }
.cp[data-state="loading"] .cp-main { cursor: progress; color: var(--mijhar-text-secondary); }
.cp[data-state="loading"] .cp-main:hover { background: transparent; }
.cp[data-state="success"] { background: var(--mijhar-bg-success-subtle); border-color: var(--mijhar-text-success); color: var(--mijhar-text-success); }
.cp[data-state="success"] .cp-more { border-inline-start-color: var(--mijhar-text-success) !important; }
.cp[data-state="failed"] { background: var(--mijhar-bg-danger-subtle); border-color: var(--mijhar-text-danger); color: var(--mijhar-text-danger); }
.cp[data-state="failed"] .cp-more { border-inline-start-color: var(--mijhar-text-danger) !important; }
.cp button:disabled { color: var(--mijhar-text-disabled); background: var(--mijhar-bg-muted); cursor: not-allowed; }
.cp-spin { animation: mj-cp-spin 900ms linear infinite; transform-origin: 50% 50%; }
@keyframes mj-cp-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .cp-spin { animation: none; } }

.cp-menu {
  position: absolute; inset-block-start: calc(100% + var(--mijhar-space-4)); inset-inline-start: 0; z-index: 20; width: 312px; max-width: min(312px, 90vw); padding: var(--mijhar-space-8);
  display: flex; flex-direction: column; gap: var(--mijhar-space-4); background: var(--mijhar-bg-surface-raised); color: var(--mijhar-text-primary);
  border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); box-shadow: var(--mijhar-shadow-raised);
}
.cp-menu-title { font-size: 12px; line-height: 16px; color: var(--mijhar-text-secondary); padding: var(--mijhar-space-4) var(--mijhar-space-8); }
.cp-item {
  appearance: none; margin: 0; width: 100%; display: flex; align-items: flex-start; gap: var(--mijhar-space-8); text-align: start; padding: var(--mijhar-space-6) var(--mijhar-space-8);
  font: inherit; color: inherit; background: transparent; border: 0; border-radius: var(--mijhar-radius-6); cursor: pointer;
}
.cp-item:hover { background: var(--mijhar-bg-subtle); }
.cp-item[aria-checked="true"] { background: var(--mijhar-bg-selected); color: var(--mijhar-text-brand); }
.cp-item-check { flex: 0 0 16px; width: 16px; height: 20px; display: inline-flex; align-items: center; }
.cp-item-text { display: flex; flex-direction: column; min-width: 0; }
.cp-item-label { font-weight: 700; font-size: 13px; line-height: 20px; }
.cp-item-blurb { font-size: 12px; line-height: 16px; color: var(--mijhar-text-secondary); }
.cp-menu-foot { margin-top: var(--mijhar-space-4); padding: var(--mijhar-space-8) var(--mijhar-space-8) var(--mijhar-space-4); border-top: 1px solid var(--mijhar-border-muted); font-size: 12px; line-height: 16px; color: var(--mijhar-text-secondary); }

.cp-note { display: flex; align-items: flex-start; gap: var(--mijhar-space-8); margin-top: var(--mijhar-space-6); padding: var(--mijhar-space-6) var(--mijhar-space-12); border-radius: var(--mijhar-radius-6); font-size: 12px; line-height: 16px; }
.cp-note .icon { margin-top: 1px; }
.cp-note[data-tone="warning"] { background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); }
.cp-note[data-tone="danger"] { background: var(--mijhar-bg-danger-subtle); color: var(--mijhar-text-danger); }
.cp-note[data-tone="success"] { background: var(--mijhar-bg-success-subtle); color: var(--mijhar-text-success); }
.cp-note-body { display: flex; flex-direction: column; gap: var(--mijhar-space-4); min-width: 0; overflow-wrap: anywhere; }
.cp-link { appearance: none; border: 0; background: none; padding: 0; font: inherit; font-weight: 700; color: inherit; text-decoration: underline; cursor: pointer; text-align: start; }
.cp-link:focus-visible { outline: none; box-shadow: var(--mijhar-focus-ring); border-radius: var(--mijhar-radius-6); }
`;
