// أنماط لافتة البيانات الخاصة والمرصودات (T-6.3) فوق BASE_CSS. التظليل بلون وخط تحتي معًا فلا يعتمد على اللون وحده.
export const PRIVACY_CSS = `
.e-privacy { display: flex; flex-direction: column; gap: var(--mijhar-space-6); padding: var(--mijhar-space-8) var(--mijhar-space-12); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-warning-subtle); border: 1px solid var(--mijhar-border-default); color: var(--mijhar-text-primary); }
.e-privacy h4 { margin: 0; color: var(--mijhar-text-warning); }
.e-privacy p { margin: 0; }
.e-privacy summary { cursor: pointer; }
.e-privacy ul { margin: 0; padding-inline-start: var(--mijhar-space-16); display: flex; flex-direction: column; gap: var(--mijhar-space-4); }
.e-findings { display: flex; flex-direction: column; gap: var(--mijhar-space-4); }
.e-findings code { font-family: var(--mijhar-font-mono); font-size: 12px; overflow-wrap: anywhere; unicode-bidi: plaintext; }
.e-findings mark { background: var(--mijhar-bg-danger-subtle); color: var(--mijhar-text-danger); font-weight: 700; text-decoration: underline wavy; text-underline-offset: 3px; padding: 0 2px; border-radius: 2px; }
`;
