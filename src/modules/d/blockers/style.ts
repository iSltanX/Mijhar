// أنماط الموانع والشارة ولوحة API فوق D_CARD_CSS (بطاقة حالة الطلب). «يمنع» بحدّ صلب و«قد يمنع» بحدّ متقطع، والوسم نصٌّ دائمًا.

export const BLOCKERS_CSS = `
.d-freshness { display: flex; flex-direction: column; gap: var(--mijhar-space-6); }
.d-badge { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-4) var(--mijhar-space-12); font-size: 12px; line-height: 18px; color: var(--mijhar-text-secondary); }
.d-badge > span { padding: 0 var(--mijhar-space-8); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-full); background: var(--mijhar-bg-muted); }
.d-badge time { font-variant-numeric: tabular-nums; unicode-bidi: isolate; }
.d-alerts { margin: 0; padding: var(--mijhar-space-6) var(--mijhar-space-12); list-style: none; display: flex; flex-direction: column; gap: var(--mijhar-space-4); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-warning-subtle); border: 1px solid var(--mijhar-border-default); font-size: 13px; line-height: 20px; }
.d-blocker-list { margin: 0; padding-inline-start: var(--mijhar-space-16); display: flex; flex-direction: column; gap: var(--mijhar-space-8); }
.d-blocker-list > li { padding: var(--mijhar-space-6) var(--mijhar-space-8); border-radius: var(--mijhar-radius-6); border: 1px solid var(--mijhar-border-default); background: var(--mijhar-bg-surface); }
.d-blocker-list[data-certainty="blocks"] > li { border-inline-start: 3px solid var(--mijhar-text-danger); }
.d-blocker-list[data-certainty="may-block"] > li { border-style: dashed; border-inline-start: 3px dashed var(--mijhar-text-warning); }
.d-blockers h4 { font-size: 13px; color: var(--mijhar-text-secondary); margin-top: var(--mijhar-space-6); }
.d-evidence-list { margin: var(--mijhar-space-4) 0 0; padding-inline-start: var(--mijhar-space-16); font-size: 12px; color: var(--mijhar-text-secondary); overflow-wrap: anywhere; }
.d-evidence-list q { color: var(--mijhar-text-primary); unicode-bidi: isolate; }
.d-src { display: inline-block; padding: 0 var(--mijhar-space-6); border-radius: var(--mijhar-radius-full); background: var(--mijhar-bg-muted); font-weight: 700; }
.d-method { padding: var(--mijhar-space-6) var(--mijhar-space-8); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-info-subtle); color: var(--mijhar-text-primary); font-size: 12px; line-height: 18px; }
.d-api .d-note { display: flex; flex-wrap: wrap; align-items: center; gap: var(--mijhar-space-6); }
.d-button { font: inherit; font-size: 12px; padding: 2px var(--mijhar-space-8); border-radius: var(--mijhar-radius-6); border: 1px solid var(--mijhar-border-default); background: var(--mijhar-bg-surface); color: var(--mijhar-text-primary); cursor: pointer; }
.d-button:hover { background: var(--mijhar-bg-subtle); }
.d-button:focus-visible { outline: 2px solid var(--mijhar-border-focus); outline-offset: 2px; }
.d-button[disabled] { opacity: 0.6; cursor: default; }
`;
