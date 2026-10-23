// أنماط واجهات «أكمل لاحقًا» فوق BASE_CSS (الرموز من shared/ui/tokens). كل المقاسات بالبكسل، والألوان من الرموز فقط.
export const LATER_STYLE_ID = 'mijhar-g-later';

export const LATER_CSS = `
.later { display: flex; flex-direction: column; gap: var(--mijhar-space-12); }
.later .field { display: flex; flex-direction: column; gap: var(--mijhar-space-4); }
.later .field > label, .later .field-title { font-weight: 700; }
.later input[type="search"], .later input[type="text"], .later input[type="date"], .later select, .later textarea {
  display: block; width: 100%; margin: 0; min-height: 32px; padding: var(--mijhar-space-4) var(--mijhar-space-8); font: inherit;
  color: var(--mijhar-text-primary); background: var(--mijhar-bg-surface); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6);
}
.later textarea { min-height: 56px; resize: vertical; }
.later input:focus-visible, .later select:focus-visible, .later textarea:focus-visible { outline: none; border-color: var(--mijhar-border-focus); box-shadow: var(--mijhar-focus-ring); }
.later .filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--mijhar-space-8); }
.later .filters label { font-size: 12px; color: var(--mijhar-text-secondary); }
.later .chips { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-6); }
.later .chip {
  appearance: none; margin: 0; min-height: 28px; padding: 0 var(--mijhar-space-8); font: inherit; font-size: 12px; line-height: 20px;
  color: var(--mijhar-text-secondary); background: var(--mijhar-bg-surface); border: 1px solid var(--mijhar-border-default);
  border-radius: var(--mijhar-radius-full); cursor: pointer;
}
.later .chip:hover { color: var(--mijhar-text-primary); border-color: var(--mijhar-border-strong); }
.later .chip[aria-pressed="true"] { color: var(--mijhar-text-brand); background: var(--mijhar-bg-selected); border-color: var(--mijhar-border-brand); font-weight: 700; }
.later .chip:focus-visible { outline: none; box-shadow: var(--mijhar-focus-ring); }
.later .results { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mijhar-space-8); }
.later .entry {
  display: flex; flex-direction: column; gap: var(--mijhar-space-6); padding: var(--mijhar-space-8) var(--mijhar-space-12);
  background: var(--mijhar-bg-subtle); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12);
}
.later .entry-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mijhar-space-8); flex-wrap: wrap; }
.later .entry-title { font-weight: 700; overflow-wrap: anywhere; }
.later .entry-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.later .meta { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-4) var(--mijhar-space-12); color: var(--mijhar-text-secondary); font-size: 12px; line-height: 16px; }
.later .actions { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-6); }
.later .btn-small { min-height: 28px; padding: 0 var(--mijhar-space-8); font-size: 12px; }
.later a.btn { text-decoration: none; }
.later .tag { display: inline-flex; align-items: center; padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); font-size: 12px; line-height: 20px; background: var(--mijhar-bg-muted); color: var(--mijhar-text-secondary); }
.later .kind { display: inline-flex; align-items: center; padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); font-size: 12px; line-height: 20px; font-weight: 700; background: var(--mijhar-bg-info-subtle); color: var(--mijhar-text-info); }
.later .kind[data-kind="bookmark"] { background: var(--mijhar-bg-brand-subtle); color: var(--mijhar-text-brand); }
.later .status-tag { font-weight: 700; }
.later .status-tag[data-status="done"] { background: var(--mijhar-bg-success-subtle); color: var(--mijhar-text-success); }
.later .status-tag[data-status="awaiting"] { background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); }
.later .count-line { color: var(--mijhar-text-secondary); font-size: 12px; }

.later-bar { display: flex; flex-direction: column; gap: var(--mijhar-space-8); margin: var(--mijhar-space-8) 0; padding: var(--mijhar-space-8) var(--mijhar-space-12); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); background: var(--mijhar-bg-surface); }
.later-bar .bar-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mijhar-space-8); flex-wrap: wrap; }
.later-bar .saved { color: var(--mijhar-text-secondary); }
`;
