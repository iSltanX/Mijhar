// أنماط بطاقة الاستئذان؛ تُضم إلى BAR_CSS وFLOAT_CSS في c/ui/styles.ts (مضيفا الظل اللذان تُعرض فيهما).
export const CONSENT_CSS = `
.consent { flex-basis: 100%; display: flex; flex-direction: column; gap: var(--mijhar-space-6); padding: var(--mijhar-space-8); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-surface-raised); border: 1px solid var(--mijhar-border-default); }
.consent-title { margin: 0; font-size: 13px; font-weight: 600; line-height: 20px; }
.consent-lines { margin: 0; padding-inline-start: var(--mijhar-space-16); font-size: 12px; line-height: 20px; color: var(--mijhar-text-secondary); }
.consent-actions { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-8); }
`;
