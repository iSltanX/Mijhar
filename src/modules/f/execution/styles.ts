// أنماط «تجهيز تعديل» (الإطارات P-50 وP-51 وP-52): الخطوات الخمس، وكتلة الفرق، وجدول النطاق وما حدث. رموز الهوية وحدها.
export const EXECUTION_STYLE_ID = 'mijhar-f-execution';

export const EXECUTION_CSS = `
.exec { display: flex; flex-direction: column; gap: var(--mijhar-space-12); }
.exec h3 { margin: 0; font-size: 15px; }
.exec h4 { margin: 0; font-size: 14px; }
.exec .exec-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mijhar-space-8); }
.exec .exec-step { display: grid; grid-template-columns: 24px 1fr; column-gap: var(--mijhar-space-8); align-items: start; }
.exec .exec-step .mark { width: 22px; height: 22px; border-radius: var(--mijhar-radius-full); border: 1px solid var(--mijhar-border-strong); display: inline-flex; align-items: center; justify-content: center; font-size: 12px; color: var(--mijhar-text-secondary); }
.exec .exec-step[data-state="done"] .mark { background: var(--mijhar-bg-brand); border-color: var(--mijhar-bg-brand); color: var(--mijhar-text-on-brand); }
.exec .exec-step[data-state="current"] .mark { border: 2px solid var(--mijhar-border-brand); color: var(--mijhar-text-brand); font-weight: 700; }
.exec .exec-step[data-state="failed"] .mark { border-color: var(--mijhar-text-danger); color: var(--mijhar-text-danger); }
.exec .exec-step[data-state="locked"] { color: var(--mijhar-text-tertiary); }
.exec .exec-step strong { font-size: 13px; }
.exec .exec-step[data-state="current"] strong { color: var(--mijhar-text-primary); }
.exec .exec-step small { grid-column: 2; color: var(--mijhar-text-secondary); font-size: 12px; }
.exec .field { display: flex; flex-direction: column; gap: var(--mijhar-space-4); }
.exec .field input, .exec textarea {
  width: 100%; box-sizing: border-box; min-height: 30px; padding: var(--mijhar-space-4) var(--mijhar-space-8); font-family: var(--mijhar-font-mono); font-size: 12px;
  color: var(--mijhar-text-primary); background: var(--mijhar-bg-surface); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6);
}
.exec .field input { direction: ltr; text-align: left; }
.exec textarea { min-height: 220px; line-height: 18px; resize: vertical; white-space: pre; }
.exec .field input:focus-visible, .exec textarea:focus-visible { outline: none; border-color: var(--mijhar-border-focus); box-shadow: var(--mijhar-focus-ring); }
.exec .field .hint { font-size: 12px; color: var(--mijhar-text-secondary); }
.exec .field .error { font-size: 12px; color: var(--mijhar-text-danger); }
.exec .diff { border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6); overflow: hidden; background: var(--mijhar-bg-surface); }
.exec .diff-head { display: flex; justify-content: space-between; align-items: center; gap: var(--mijhar-space-8); padding: var(--mijhar-space-6) var(--mijhar-space-8); background: var(--mijhar-bg-subtle); border-bottom: 1px solid var(--mijhar-border-default); font-size: 12px; }
.exec .diff-head .del-count { color: var(--mijhar-text-danger); }
.exec .diff-head .add-count { color: var(--mijhar-text-success); }
.exec .diff-body { direction: ltr; text-align: left; font-family: var(--mijhar-font-mono); font-size: 12px; line-height: 18px; overflow-x: auto; max-height: 360px; overflow-y: auto; }
.exec .diff-row { display: grid; grid-template-columns: 40px 16px 1fr; white-space: pre; }
.exec .diff-row .no { color: var(--mijhar-text-tertiary); text-align: right; padding-right: var(--mijhar-space-6); user-select: none; }
.exec .diff-row .sign { user-select: none; }
.exec .diff-row[data-kind="del"] { background: var(--mijhar-bg-danger-subtle); color: var(--mijhar-text-danger); }
.exec .diff-row[data-kind="add"] { background: var(--mijhar-bg-success-subtle); color: var(--mijhar-text-success); }
.exec .diff-gap { padding: 0 var(--mijhar-space-8); color: var(--mijhar-text-tertiary); background: var(--mijhar-bg-subtle); }
.exec .facts { margin: 0; display: grid; grid-template-columns: max-content 1fr; border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6); padding: var(--mijhar-space-4) var(--mijhar-space-12); }
.exec .facts dt { color: var(--mijhar-text-secondary); padding: var(--mijhar-space-6) 0; padding-inline-end: var(--mijhar-space-12); border-bottom: 1px solid var(--mijhar-border-muted); font-size: 12px; }
.exec .facts dd { margin: 0; padding: var(--mijhar-space-6) 0; border-bottom: 1px solid var(--mijhar-border-muted); font-size: 12px; overflow-wrap: anywhere; }
.exec .facts dt:last-of-type, .exec .facts dd:last-of-type { border-bottom: 0; }
.exec .approve { display: flex; gap: var(--mijhar-space-8); align-items: flex-start; cursor: pointer; }
.exec .approve small { display: block; color: var(--mijhar-text-secondary); }
.exec .btn-block { width: 100%; justify-content: center; }
.exec .notice[data-tone="success"] { background: var(--mijhar-bg-success-subtle); color: var(--mijhar-text-success); }
`;
