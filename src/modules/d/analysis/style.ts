// أنماط التحليل داخل الأقسام (P-43 إلى P-49): كتلة بحد متقطع كطبقة الاحتمالات في شرح السجل (فلا تلتبس بطبقة الحقائق)، وشارة «مثبت من المصدر»
// للاقتباس الذي ورد فيما أُرسل، والوسم نصٌّ دائمًا. فوقها أنماط الموافقة وبوابة الربط.
import { GATE_CSS } from '../../../core/connections/ui/styles';
import { CONSENT_CSS } from '../../e/provider';

export const ANALYSIS_CSS = `${GATE_CSS}
${CONSENT_CSS}
.an-card { display: flex; flex-direction: column; gap: var(--mijhar-space-4); margin: var(--mijhar-space-8) 0; padding: var(--mijhar-space-12) var(--mijhar-space-16); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); background: var(--mijhar-bg-surface); font-family: var(--mijhar-font-text); }
.an-card-title { margin: 0; font-family: var(--mijhar-font-display); font-size: 14px; line-height: 20px; color: var(--mijhar-text-primary); }
.an-block { display: flex; flex-direction: column; gap: var(--mijhar-space-8); margin-top: var(--mijhar-space-8); font-size: 13px; line-height: 20px; color: var(--mijhar-text-primary); }
.an-option { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mijhar-space-4); }
.an-result, .an-loading, .an-failed { display: flex; flex-direction: column; gap: var(--mijhar-space-8); padding: var(--mijhar-space-8) var(--mijhar-space-12); border: 1px dashed var(--mijhar-text-warning); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-surface); }
.an-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mijhar-space-8); flex-wrap: wrap; }
.an-block .d-tag { display: inline-block; padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); font-size: 11px; line-height: 20px; font-weight: 700; border: 1px solid currentColor; color: var(--mijhar-text-warning); background: var(--mijhar-bg-warning-subtle); }
.an-head h4 { margin: 0; font-family: var(--mijhar-font-display); font-size: 14px; line-height: 20px; }
.an-result h5 { margin: 0 0 var(--mijhar-space-4); font-size: 13px; line-height: 20px; color: var(--mijhar-text-secondary); }
.an-result ul, .an-result ol { margin: 0; padding-inline-start: var(--mijhar-space-16); display: flex; flex-direction: column; gap: var(--mijhar-space-4); }
.an-evidence { margin-top: var(--mijhar-space-4) !important; font-size: 12px; color: var(--mijhar-text-secondary); }
.an-evidence li[data-evidence="not-found"] { color: var(--mijhar-text-warning); }
.an-result code { font-family: var(--mijhar-font-mono); font-size: 12px; unicode-bidi: isolate; overflow-wrap: anywhere; }
.an-sourced { display: flex; flex-direction: column; gap: var(--mijhar-space-4); padding: var(--mijhar-space-8); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-success-subtle); }
.an-badge { align-self: flex-start; padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); border: 1px solid currentColor; font-size: 11px; line-height: 20px; font-weight: 700; color: var(--mijhar-text-success); }
.an-raw { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.an-meta { margin: 0; font-size: 12px; color: var(--mijhar-text-secondary); }
.an-meta time { font-variant-numeric: tabular-nums; unicode-bidi: isolate; }
.an-actions { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-12); }
.an-muted { color: var(--mijhar-text-secondary); font-size: 12px; }
.an-block details summary { cursor: pointer; color: var(--mijhar-text-brand); font-size: 12px; }
`;
