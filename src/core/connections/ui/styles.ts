// أنماط سجل الاتصالات (الإطار O-16) وبوابة «ميزة تحتاج ربطًا» (مكوّن Feature gate). الحالة نصٌّ دائمًا ومعها لونها، لا لون وحده.

export const HEALTH_BADGE_CSS = `
.mj-root .conn-badge, .conn-badge { display: inline-flex; align-items: center; gap: var(--mijhar-space-4); padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); font-size: 12px; line-height: 20px; font-weight: 700; white-space: nowrap; }
.conn-badge[data-tone="success"] { background: var(--mijhar-bg-success-subtle); color: var(--mijhar-text-success); }
.conn-badge[data-tone="danger"] { background: var(--mijhar-bg-danger-subtle); color: var(--mijhar-text-danger); }
.conn-badge[data-tone="warning"] { background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); }
.conn-badge[data-tone="info"] { background: var(--mijhar-bg-info-subtle); color: var(--mijhar-text-info); }
.conn-badge[data-tone="muted"] { background: var(--mijhar-bg-muted); color: var(--mijhar-text-secondary); }
`;

export const CONNECTIONS_CSS = `${HEALTH_BADGE_CSS}
.mj-root .conn-list { display: flex; flex-direction: column; gap: var(--mijhar-space-12); }
.mj-root .conn-card { display: flex; flex-direction: column; gap: var(--mijhar-space-8); padding: var(--mijhar-space-16); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); background: var(--mijhar-bg-surface); }
.mj-root .conn-card[data-tone="danger"] { border-color: var(--mijhar-text-danger); }
.mj-root .conn-card[data-tone="warning"] { border-color: var(--mijhar-text-warning); }
.mj-root .conn-card > .section { padding: 0; border-bottom: 0; }
.mj-root .conn-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mijhar-space-12); flex-wrap: wrap; }
.mj-root .conn-meta { display: grid; grid-template-columns: max-content 1fr; gap: var(--mijhar-space-4) var(--mijhar-space-12); margin: 0; font-size: 13px; line-height: 20px; }
.mj-root .conn-meta dt { font-weight: 700; color: var(--mijhar-text-secondary); }
.mj-root .conn-meta dd { margin: 0; }
.mj-root .notice[data-tone="warning"] { background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); }
.mj-root .notice[data-tone="success"] { background: var(--mijhar-bg-success-subtle); color: var(--mijhar-text-success); }
.mj-root .conn-return { display: flex; flex-direction: column; gap: var(--mijhar-space-6); border: 1px solid currentColor; }
.mj-root .conn-storage { display: flex; flex-direction: column; gap: var(--mijhar-space-8); padding: var(--mijhar-space-16); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); }
.mj-root .conn-storage ul { margin: 0; padding-inline-start: var(--mijhar-space-24); display: flex; flex-direction: column; gap: var(--mijhar-space-4); }
.mj-root .conn-confirm { display: flex; flex-direction: column; gap: var(--mijhar-space-6); padding: var(--mijhar-space-12); border: 1px solid var(--mijhar-text-danger); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-danger-subtle); }
.mj-root .conn-confirm ul { margin: 0; padding-inline-start: var(--mijhar-space-24); }
`;

/** بوابة الخيار داخل قسمه (جذر ظل البطاقات في صفحة GitHub). */
export const GATE_CSS = `${HEALTH_BADGE_CSS}
.mj-gate { display: flex; flex-direction: column; gap: var(--mijhar-space-6); padding: var(--mijhar-space-8) var(--mijhar-space-12); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-subtle); font-size: 13px; line-height: 20px; }
.mj-gate-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mijhar-space-8); flex-wrap: wrap; }
.mj-gate-head strong { font-weight: 700; }
.mj-gate .mj-gate-needs { color: var(--mijhar-text-secondary); font-size: 12px; }
.mj-gate button { align-self: flex-start; font: inherit; font-size: 12px; font-weight: 700; padding: 2px var(--mijhar-space-8); border-radius: var(--mijhar-radius-6); border: 1px solid var(--mijhar-border-default); background: var(--mijhar-bg-surface); color: var(--mijhar-text-primary); cursor: pointer; }
.mj-gate button:hover { background: var(--mijhar-bg-muted); }
.mj-gate button:focus-visible { outline: 2px solid var(--mijhar-border-focus); outline-offset: 2px; }
`;
