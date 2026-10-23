// أنماط واجهات الوحدة (ح) فوق BASE_CSS (الرموز من shared/ui/tokens).
export const COMMUNITY_STYLE_ID = 'mijhar-h-community';

export const COMMUNITY_CSS = `
.community { display: flex; flex-direction: column; gap: var(--mijhar-space-12); }
.community h3 { margin-top: var(--mijhar-space-4); }
.community .block { display: flex; flex-direction: column; gap: var(--mijhar-space-8); padding: var(--mijhar-space-12); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); background: var(--mijhar-bg-surface); }
.community .block-declared { background: var(--mijhar-bg-accent-subtle); }
.community .field { display: flex; flex-direction: column; gap: var(--mijhar-space-4); }
.community .field > label, .community .field-title { font-weight: 700; }
.community .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--mijhar-space-8); }
.community input[type="text"], .community input[type="number"], .community input[type="url"], .community select, .community textarea {
  display: block; width: 100%; margin: 0; min-height: 32px; padding: var(--mijhar-space-4) var(--mijhar-space-8); font: inherit;
  color: var(--mijhar-text-primary); background: var(--mijhar-bg-surface); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6);
}
.community textarea { min-height: 64px; resize: vertical; }
.community input:focus-visible, .community select:focus-visible, .community textarea:focus-visible { outline: none; border-color: var(--mijhar-border-focus); box-shadow: var(--mijhar-focus-ring); }
.community input[dir="ltr"], .community textarea[dir="ltr"] { text-align: left; font-family: var(--mijhar-font-mono); font-size: 12px; }
.community .issues { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--mijhar-space-4); }
.community .issues li[data-severity="error"] { color: var(--mijhar-text-danger); }
.community .issues li[data-severity="warning"] { color: var(--mijhar-text-warning); }
.community .btn[aria-disabled="true"] { color: var(--mijhar-text-disabled); background: var(--mijhar-bg-muted); cursor: not-allowed; pointer-events: none; }
.community a.btn { text-decoration: none; }
.community .list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--mijhar-space-8); }
.community .item { display: flex; flex-direction: column; gap: var(--mijhar-space-4); padding: var(--mijhar-space-8) var(--mijhar-space-12); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-subtle); }
.community .item-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mijhar-space-8); flex-wrap: wrap; }
.community .tag { display: inline-flex; align-items: center; padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); font-size: 12px; line-height: 20px; font-weight: 700; background: var(--mijhar-bg-muted); color: var(--mijhar-text-secondary); }
.community .tag[data-tone="ok"] { background: var(--mijhar-bg-success-subtle); color: var(--mijhar-text-success); }
.community .tag[data-tone="warn"] { background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); }
.community .tag[data-tone="info"] { background: var(--mijhar-bg-info-subtle); color: var(--mijhar-text-info); }
.community .steps { margin: 0; padding-inline-start: var(--mijhar-space-24); display: flex; flex-direction: column; gap: var(--mijhar-space-6); }
.community .quote { margin: 0; padding: var(--mijhar-space-4) var(--mijhar-space-8); border-inline-start: 3px solid var(--mijhar-border-default); color: var(--mijhar-text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; }
.community details > summary { cursor: pointer; font-weight: 700; padding: var(--mijhar-space-4) 0; }
.community .checks { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: var(--mijhar-space-4) var(--mijhar-space-8); }
.community .checks label { display: flex; align-items: center; gap: var(--mijhar-space-6); cursor: pointer; }

.readme-banner { display: flex; flex-direction: column; gap: var(--mijhar-space-8); margin: var(--mijhar-space-8) 0; padding: var(--mijhar-space-8) var(--mijhar-space-12); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); background: var(--mijhar-bg-subtle); }
.readme-banner[data-state="found"] { background: var(--mijhar-bg-success-subtle); border-color: var(--mijhar-text-success); }
.readme-banner .row { gap: var(--mijhar-space-8); }
.profile-card { display: flex; flex-direction: column; gap: var(--mijhar-space-8); margin: var(--mijhar-space-8) 0; }
.profile-card dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: var(--mijhar-space-4) var(--mijhar-space-12); }
.profile-card dt { font-weight: 700; color: var(--mijhar-text-secondary); }
.profile-card dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
`;
