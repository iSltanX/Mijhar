// أنماط أدوات البيانات فوق BASE_CSS (الرموز من shared/ui/tokens). المقاسات بالبكسل والألوان من الرموز وحدها.
export const DATA_STYLE_ID = 'mijhar-g-data';

export const DATA_CSS = `
.data-tools { display: flex; flex-direction: column; gap: var(--mijhar-space-12); }
.data-tools .block { display: flex; flex-direction: column; gap: var(--mijhar-space-8); padding: var(--mijhar-space-12); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); background: var(--mijhar-bg-surface); }
.data-tools .block h4 { margin: 0; font-size: 14px; line-height: 20px; }
.data-tools .block[data-tone="danger"] { border-color: var(--mijhar-border-danger); }
.data-tools .choice { display: flex; align-items: flex-start; gap: var(--mijhar-space-8); }
.data-tools .choice input { margin-block-start: 4px; }
.data-tools .field { display: flex; flex-direction: column; gap: var(--mijhar-space-4); }
.data-tools .field > label { font-weight: 700; }
.data-tools select, .data-tools input[type="file"] {
  display: block; width: 100%; margin: 0; min-height: 32px; padding: var(--mijhar-space-4) var(--mijhar-space-8); font: inherit;
  color: var(--mijhar-text-primary); background: var(--mijhar-bg-surface); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6);
}
.data-tools select:focus-visible, .data-tools input:focus-visible { outline: none; border-color: var(--mijhar-border-focus); box-shadow: var(--mijhar-focus-ring); }
.data-tools .summary { margin: 0; padding-inline-start: var(--mijhar-space-16); }
.data-tools .summary li { margin: 0; }
.data-tools .actions { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-6); }
.data-tools .confirm { display: flex; flex-direction: column; gap: var(--mijhar-space-8); padding: var(--mijhar-space-8) var(--mijhar-space-12); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-danger-subtle); color: var(--mijhar-text-danger); }
.data-tools .points { margin: 0; padding-inline-start: var(--mijhar-space-16); }
.shared-notice { display: flex; flex-direction: column; gap: var(--mijhar-space-4); padding: var(--mijhar-space-8) var(--mijhar-space-12); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); }
.shared-notice strong { font-weight: 700; }
.shared-notice p { margin: 0; }
`;
