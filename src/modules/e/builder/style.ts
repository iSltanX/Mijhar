// أنماط منشئ حزمة السياق فوق BASE_CSS (الرموز من shared/ui/tokens). الواجهة داخل جذر Shadow DOM فلا تخرج أنماطها إلى الصفحة.
export const BUILDER_CSS = `
.mj-root { display: block; margin: var(--mijhar-space-8) 0; padding: var(--mijhar-space-8) var(--mijhar-space-12); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6); }
.e-bar { display: flex; align-items: center; gap: var(--mijhar-space-8); flex-wrap: wrap; }
.e-window { display: flex; flex-direction: column; gap: var(--mijhar-space-12); margin-top: var(--mijhar-space-12); }
.e-grid { display: grid; grid-template-columns: minmax(14rem, 1fr) minmax(0, 2fr); gap: var(--mijhar-space-16); align-items: start; }
@media (max-width: 720px) { .e-grid { grid-template-columns: 1fr; } }
.e-choices { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mijhar-space-4); min-width: 0; }
.e-choices legend { font-weight: 700; padding: 0; margin-bottom: var(--mijhar-space-4); }
.e-group { font-weight: 700; margin-top: var(--mijhar-space-8); display: flex; align-items: center; gap: var(--mijhar-space-8); flex-wrap: wrap; }
.e-choice { display: flex; align-items: flex-start; gap: var(--mijhar-space-6); cursor: pointer; min-width: 0; }
.e-choice input { margin: 3px 0 0; accent-color: var(--mijhar-bg-brand); flex-shrink: 0; }
.e-choice[data-disabled="true"] { color: var(--mijhar-text-disabled); cursor: default; }
.e-choice span { overflow-wrap: anywhere; }
.e-link { appearance: none; border: 0; background: none; padding: 0; font: inherit; font-size: 12px; color: var(--mijhar-text-link); text-decoration: underline; cursor: pointer; }
.e-link:focus-visible { outline: none; box-shadow: var(--mijhar-focus-ring); border-radius: var(--mijhar-radius-6); }
.e-preview { display: flex; flex-direction: column; gap: var(--mijhar-space-8); min-width: 0; }
.e-preview textarea {
  width: 100%; min-height: 18rem; resize: vertical; padding: var(--mijhar-space-8); font-family: var(--mijhar-font-mono); font-size: 12px; line-height: 18px;
  color: var(--mijhar-text-primary); background: var(--mijhar-bg-subtle); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6); unicode-bidi: plaintext;
}
.e-preview textarea:focus-visible { outline: none; border-color: var(--mijhar-border-focus); box-shadow: var(--mijhar-focus-ring); }
.e-gaps { display: flex; flex-direction: column; gap: var(--mijhar-space-4); padding: var(--mijhar-space-8) var(--mijhar-space-12); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-warning-subtle); border: 1px solid var(--mijhar-border-default); }
.e-gaps ul { margin: 0; padding-inline-start: var(--mijhar-space-16); display: flex; flex-direction: column; gap: var(--mijhar-space-4); }
.e-tag { display: inline-block; padding: 0 var(--mijhar-space-6); border-radius: var(--mijhar-radius-full); font-size: 11px; line-height: 18px; font-weight: 700; border: 1px solid currentColor; color: var(--mijhar-text-secondary); }
.e-snippet { display: flex; align-items: flex-start; gap: var(--mijhar-space-6); }
`;
