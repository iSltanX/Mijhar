// أنماط بطاقات الوحدة (د) داخل جذر Shadow DOM فوق BASE_CSS (رموز الهوية في src/shared/ui/tokens.ts). مشتركة بين بطاقة حالة
// طلب الدمج وملخص المقارنة. الحالة تُقال بالنص دائمًا، واللون تعزيز لا حامل وحيد للمعنى.

export const D_CARD_CSS = `
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.d-card {
  display: flex; flex-direction: column; gap: var(--mijhar-space-12);
  margin: var(--mijhar-space-12) 0; padding: var(--mijhar-space-16);
  background: var(--mijhar-bg-surface); color: var(--mijhar-text-primary);
  border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12);
}
.d-card > header { display: flex; align-items: center; justify-content: space-between; gap: var(--mijhar-space-8); flex-wrap: wrap; }
.d-card h2 { font-size: 16px; line-height: 24px; }
.d-card h3 { font-size: 14px; line-height: 20px; color: var(--mijhar-text-secondary); }
.d-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--mijhar-space-8) var(--mijhar-space-16); margin: 0; }
.d-grid > div { display: flex; flex-direction: column; gap: 2px; padding: var(--mijhar-space-6) 0; border-bottom: 1px solid var(--mijhar-border-muted); }
.d-grid dt { font-size: 12px; line-height: 16px; color: var(--mijhar-text-secondary); }
.d-grid dd { margin: 0; font-weight: 700; overflow-wrap: anywhere; }
.d-na { font-weight: 400; color: var(--mijhar-text-tertiary); border-bottom: 1px dotted var(--mijhar-border-strong); cursor: help; }
.d-branch { direction: ltr; unicode-bidi: isolate; display: inline-block; font-family: var(--mijhar-font-mono); font-size: 12px; padding: 0 var(--mijhar-space-6); background: var(--mijhar-bg-muted); border-radius: var(--mijhar-radius-6); }
.d-arrow { color: var(--mijhar-text-secondary); padding: 0 var(--mijhar-space-4); }
.d-to { white-space: nowrap; }
.d-add { color: var(--mijhar-text-success); direction: ltr; unicode-bidi: isolate; display: inline-block; }
.d-del { color: var(--mijhar-text-danger); direction: ltr; unicode-bidi: isolate; display: inline-block; }
.d-chips { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-6); margin: 0; padding: 0; list-style: none; }
.d-chip {
  display: inline-flex; align-items: center; gap: var(--mijhar-space-6); padding: 0 var(--mijhar-space-8);
  border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-full); font-size: 12px; line-height: 22px; font-weight: 700;
  background: var(--mijhar-bg-muted); color: var(--mijhar-text-secondary);
}
.d-chip[data-zero="true"] { opacity: 0.55; font-weight: 400; }
.d-chip[data-category="success"] { background: var(--mijhar-bg-success-subtle); color: var(--mijhar-text-success); }
.d-chip[data-category="failure"] { background: var(--mijhar-bg-danger-subtle); color: var(--mijhar-text-danger); }
.d-chip[data-category="running"] { background: var(--mijhar-bg-info-subtle); color: var(--mijhar-text-info); }
.d-chip[data-category="not-run"] { background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); }
.d-chip[data-category="unknown"] { border-style: dashed; }
.d-chip[data-category="cancelled"][data-zero="false"] { text-decoration: line-through; text-decoration-thickness: 1px; }
.d-chip .n { font-variant-numeric: tabular-nums; }
.d-group { display: flex; flex-direction: column; gap: var(--mijhar-space-6); padding: var(--mijhar-space-8) var(--mijhar-space-12); border: 1px solid var(--mijhar-border-muted); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-subtle); }
.d-list { margin: 0; padding-inline-start: var(--mijhar-space-16); }
.d-list li { padding: 2px 0; overflow-wrap: anywhere; }
.d-list .name { direction: ltr; unicode-bidi: isolate; display: inline-block; font-family: var(--mijhar-font-mono); font-size: 12px; }
.d-note { color: var(--mijhar-text-secondary); font-size: 12px; line-height: 18px; }
.d-state { padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); font-size: 12px; line-height: 22px; font-weight: 700; background: var(--mijhar-bg-info-subtle); color: var(--mijhar-text-info); }
.d-state[data-state="merged"] { background: var(--mijhar-bg-brand-subtle); color: var(--mijhar-text-brand); }
.d-state[data-state="closed"] { background: var(--mijhar-bg-danger-subtle); color: var(--mijhar-text-danger); }
.d-state[data-state="draft"] { background: var(--mijhar-bg-muted); color: var(--mijhar-text-secondary); }
.d-impact { border-style: dashed; border-color: var(--mijhar-border-strong); background: var(--mijhar-bg-accent-subtle); }
.d-impact .d-tag { align-self: flex-start; padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); font-size: 12px; line-height: 22px; font-weight: 700; background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); border: 1px solid currentColor; }
.d-table { width: 100%; border-collapse: collapse; }
.d-table th, .d-table td { padding: var(--mijhar-space-4) var(--mijhar-space-8); text-align: start; border-bottom: 1px solid var(--mijhar-border-muted); }
.d-table th { font-size: 12px; color: var(--mijhar-text-secondary); font-weight: 700; }
.d-table td.num { font-variant-numeric: tabular-nums; direction: ltr; text-align: end; }
.d-ok { color: var(--mijhar-text-success); font-weight: 700; }
.d-warn { color: var(--mijhar-text-warning); font-weight: 700; }
`;
