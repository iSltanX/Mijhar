// أنماط تجربة الموافقة (الإطار P-44، مكوّن Consent sheet) في جذر ظل القسم: صفوف قرار بعنوانها وقيمتها، وروابط نصية، وملاحظة بلونها ونصّها
// معًا، وزرّا الإلغاء والإرسال. بالرموز المشتركة وحدها فتتبع الوضعين.

export const CONSENT_CSS = `
.mj-consent { display: flex; flex-direction: column; gap: var(--mijhar-space-8); padding: var(--mijhar-space-12); border: 1px solid var(--mijhar-border-strong); border-radius: var(--mijhar-radius-12); background: var(--mijhar-bg-surface); font-size: 13px; line-height: 20px; color: var(--mijhar-text-primary); }
.mj-consent-head { display: flex; align-items: center; gap: var(--mijhar-space-6); color: var(--mijhar-text-brand); }
.mj-consent-head h4 { margin: 0; font-family: var(--mijhar-font-display); font-size: 14px; line-height: 20px; color: var(--mijhar-text-primary); }
.mj-consent-head h4:focus-visible { outline: 2px solid var(--mijhar-border-focus); outline-offset: 2px; border-radius: var(--mijhar-radius-6); }
.mj-consent-head h4:focus:not(:focus-visible) { outline: none; }
.mj-consent-lead { margin: 0; }
.mj-consent-rows { margin: 0; display: flex; flex-direction: column; }
.mj-consent-rows > div { display: grid; grid-template-columns: 5.5em 1fr; gap: var(--mijhar-space-8); padding: var(--mijhar-space-6) 0; border-bottom: 1px solid var(--mijhar-border-default); }
.mj-consent-rows dt { font-weight: 700; color: var(--mijhar-text-secondary); }
.mj-consent-rows dd { margin: 0; overflow-wrap: anywhere; }
.mj-consent-rows details { margin-top: var(--mijhar-space-4); }
.mj-consent-rows summary { cursor: pointer; color: var(--mijhar-text-brand); }
.mj-consent-rows ul { margin: var(--mijhar-space-4) 0 0; padding-inline-start: var(--mijhar-space-16); font-size: 12px; color: var(--mijhar-text-secondary); }
.mj-consent-links { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-12); }
.mj-consent-preview { display: flex; flex-direction: column; gap: var(--mijhar-space-4); }
.mj-consent-preview pre { margin: 0; max-height: 18rem; overflow: auto; padding: var(--mijhar-space-8); white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--mijhar-font-mono); font-size: 12px; line-height: 18px; background: var(--mijhar-bg-muted); border-radius: var(--mijhar-radius-6); unicode-bidi: plaintext; }
.mj-consent-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: var(--mijhar-space-8); }
.mj-muted { margin: 0; color: var(--mijhar-text-secondary); font-size: 12px; }
.mj-note { margin: 0; padding: var(--mijhar-space-8) var(--mijhar-space-12); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-info-subtle); color: var(--mijhar-text-info); font-size: 12px; line-height: 18px; }
.mj-note[data-tone="warning"] { background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); }
.mj-note[data-tone="danger"] { background: var(--mijhar-bg-danger-subtle); color: var(--mijhar-text-danger); }
.mj-btn { font: inherit; font-size: 13px; font-weight: 700; padding: var(--mijhar-space-4) var(--mijhar-space-12); border-radius: var(--mijhar-radius-6); border: 1px solid var(--mijhar-border-default); background: var(--mijhar-bg-surface); color: var(--mijhar-text-primary); cursor: pointer; }
.mj-btn:hover { background: var(--mijhar-bg-subtle); }
.mj-btn:focus-visible, .mj-link:focus-visible { outline: 2px solid var(--mijhar-border-focus); outline-offset: 2px; }
.mj-btn[disabled] { opacity: 0.6; cursor: not-allowed; }
.mj-btn-primary { background: var(--mijhar-bg-brand); border-color: var(--mijhar-bg-brand); color: var(--mijhar-text-on-brand); }
.mj-btn-primary:hover { background: var(--mijhar-bg-brand); filter: brightness(1.08); }
.mj-link { font: inherit; font-size: 12px; font-weight: 700; padding: 0; border: 0; background: none; color: var(--mijhar-text-brand); cursor: pointer; }
.mj-link:hover { text-decoration: underline; }
.mj-consent .mono { font-family: var(--mijhar-font-mono); }
`;
