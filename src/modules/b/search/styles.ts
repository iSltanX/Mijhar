// أنماط واجهة البحث فوق BASE_CSS وCARD_CSS (بطاقة الشرح المضمَّنة في النتيجة المفتوحة).
export const SEARCH_STYLE_ID = 'mijhar-b-search';

export const SEARCH_CSS = `
.gsearch { display: flex; flex-direction: column; gap: var(--mijhar-space-12); }
.gsearch .sr-only { position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.gsearch .search-box { position: relative; display: flex; align-items: center; gap: var(--mijhar-space-4); }
.gsearch input[type="search"] {
  flex: 1 1 auto; min-inline-size: 0; min-height: 36px; margin: 0; padding: var(--mijhar-space-4) var(--mijhar-space-12); font: inherit; font-size: 14px;
  color: var(--mijhar-text-primary); background: var(--mijhar-bg-surface); border: 1px solid var(--mijhar-border-strong); border-radius: var(--mijhar-radius-6);
  appearance: none; -webkit-appearance: none;
}
.gsearch input[type="search"]::-webkit-search-cancel-button, .gsearch input[type="search"]::-webkit-search-decoration { -webkit-appearance: none; }
.gsearch input[type="search"]:focus-visible { outline: none; border-color: var(--mijhar-border-focus); box-shadow: var(--mijhar-focus-ring); }
.gsearch .chips { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-6); }
.gsearch .chip-btn {
  appearance: none; display: inline-flex; align-items: center; gap: var(--mijhar-space-6); min-height: 28px; margin: 0; padding: 0 var(--mijhar-space-8);
  font: inherit; font-size: 12px; font-weight: 700; color: var(--mijhar-text-secondary); background: var(--mijhar-bg-surface);
  border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-full); cursor: pointer;
}
.gsearch .chip-btn[aria-pressed="true"] { color: var(--mijhar-text-on-brand); background: var(--mijhar-bg-brand); border-color: var(--mijhar-bg-brand); }
.gsearch .chip-btn[data-empty="true"]:not([aria-pressed="true"]) { color: var(--mijhar-text-disabled); }
.gsearch .count { font-size: 12px; color: var(--mijhar-text-secondary); }
.gsearch .results { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--mijhar-space-8); }
.gsearch .result { display: flex; flex-direction: column; gap: var(--mijhar-space-6); padding: var(--mijhar-space-8) var(--mijhar-space-12); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); background: var(--mijhar-bg-subtle); }
.gsearch .result[data-open="true"] { background: var(--mijhar-bg-surface); border-color: var(--mijhar-border-brand); }
.gsearch .result-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mijhar-space-8); }
.gsearch .result-title { margin: 0; font-family: var(--mijhar-font-display); font-size: 14px; line-height: 22px; font-weight: 700; }
.gsearch .result-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--mijhar-space-6); }
.gsearch .tag { display: inline-flex; align-items: center; padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); font-size: 12px; line-height: 20px; font-weight: 700; background: var(--mijhar-bg-muted); color: var(--mijhar-text-secondary); }
.gsearch .tag[data-safety="آمن"] { background: var(--mijhar-bg-success-subtle); color: var(--mijhar-text-success); }
.gsearch .tag[data-safety="حساس"] { background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); }
.gsearch .tag[data-safety="خطر"] { background: var(--mijhar-bg-danger-subtle); color: var(--mijhar-text-danger); }
.gsearch .result-brief { margin: 0; color: var(--mijhar-text-secondary); }
.gsearch .via { font-size: 12px; color: var(--mijhar-text-tertiary); }
.gsearch .actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--mijhar-space-8); }
.gsearch .actions .btn { min-height: 30px; font-size: 13px; }
.gsearch a.btn { text-decoration: none; }
.gsearch .locate-note { margin: 0; padding: var(--mijhar-space-8) var(--mijhar-space-12); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-info-subtle); color: var(--mijhar-text-info); }
.gsearch .locate-note[data-status="found"] { background: var(--mijhar-bg-success-subtle); color: var(--mijhar-text-success); }
.gsearch .locate-note ul { margin: var(--mijhar-space-4) 0 0; padding-inline-start: var(--mijhar-space-16); }
.gsearch .more { align-self: center; }
.gsearch .card-slot { margin-top: var(--mijhar-space-4); }
.gsearch .card { box-shadow: none; }
.gsearch .empty p + p { margin-top: var(--mijhar-space-4); }
`;
