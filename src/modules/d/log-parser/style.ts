// أنماط شرح السجل فوق D_CARD_CSS: ثلاث طبقات بحدود وخلفيات مختلفة (الحقيقة صلبة، والسبب المثبت مؤكَّد، والاحتمال متقطع)،
// فلا تلتبس طبقة بأخرى بصريًا؛ والوسم نصٌّ دائمًا لا لون وحده.
import { D_CARD_CSS } from '../pr-status/style';

export const LOG_CSS = `${D_CARD_CSS}
.d-source { font-size: 12px; color: var(--mijhar-text-secondary); }
.d-alert { padding: var(--mijhar-space-8) var(--mijhar-space-12); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-primary); border: 1px solid var(--mijhar-border-default); font-size: 13px; line-height: 20px; }
.d-layer { display: flex; flex-direction: column; gap: var(--mijhar-space-6); padding: var(--mijhar-space-8) var(--mijhar-space-12); border-radius: var(--mijhar-radius-6); }
.d-layer h3 { display: flex; align-items: center; gap: var(--mijhar-space-6); flex-wrap: wrap; color: var(--mijhar-text-primary); }
.d-layer[data-layer="literal"] { border: 1px solid var(--mijhar-border-strong); background: var(--mijhar-bg-subtle); }
.d-layer[data-layer="root-cause"] { border: 2px solid var(--mijhar-border-default); background: var(--mijhar-bg-surface); }
.d-layer[data-layer="possibility"] { border: 1px dashed var(--mijhar-border-strong); background: var(--mijhar-bg-accent-subtle); }
.d-step { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: var(--mijhar-radius-full); background: var(--mijhar-bg-muted); font-size: 12px; }
.d-tag { display: inline-block; padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); font-size: 11px; line-height: 20px; font-weight: 700; border: 1px solid currentColor; }
.d-tag[data-tag="fact"] { color: var(--mijhar-text-secondary); }
.d-tag[data-tag="pattern"] { color: var(--mijhar-text-success); }
.d-tag[data-tag="possibility"] { color: var(--mijhar-text-warning); background: var(--mijhar-bg-warning-subtle); }
.d-messages, .d-causes, .d-possible { margin: 0; padding-inline-start: var(--mijhar-space-16); display: flex; flex-direction: column; gap: var(--mijhar-space-8); }
.d-loc { font-size: 12px; color: var(--mijhar-text-secondary); }
.d-log { margin: var(--mijhar-space-4) 0 0; padding: var(--mijhar-space-6) var(--mijhar-space-8); overflow-x: auto; direction: ltr; text-align: left; unicode-bidi: isolate; font-family: var(--mijhar-font-mono); font-size: 12px; line-height: 18px; background: var(--mijhar-bg-muted); border-radius: var(--mijhar-radius-6); white-space: pre; }
.d-log-line[data-focus="true"] { font-weight: 700; color: var(--mijhar-text-danger); }
.d-ln { display: inline-block; min-width: 4ch; margin-inline-end: 1ch; color: var(--mijhar-text-tertiary); text-align: right; user-select: none; }
.d-evidence { font-size: 12px; color: var(--mijhar-text-secondary); overflow-wrap: anywhere; }
.d-evidence code { direction: ltr; unicode-bidi: isolate; font-family: var(--mijhar-font-mono); }
.d-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--mijhar-space-8); }
.d-button { font: inherit; font-size: 13px; padding: var(--mijhar-space-4) var(--mijhar-space-12); border-radius: var(--mijhar-radius-6); border: 1px solid var(--mijhar-border-default); background: var(--mijhar-bg-muted); color: var(--mijhar-text-primary); cursor: pointer; }
.d-button:hover { background: var(--mijhar-bg-subtle); }
.d-button:focus-visible { outline: 2px solid var(--mijhar-border-focus); outline-offset: 2px; }
.d-button[disabled] { opacity: 0.6; cursor: default; }
`;
