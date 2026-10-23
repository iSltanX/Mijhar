// أنماط واجهات الملاحظات فوق BASE_CSS (الرموز من shared/ui/tokens). كل المقاسات بالبكسل، والألوان من الرموز فقط.
export const NOTES_STYLE_ID = 'mijhar-g-notes';

export const NOTES_CSS = `
.notes { display: flex; flex-direction: column; gap: var(--mijhar-space-12); }
.notes .chips { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-6); }
.notes .chip {
  appearance: none; margin: 0; min-height: 28px; padding: 0 var(--mijhar-space-8); font: inherit; font-size: 12px; line-height: 20px;
  color: var(--mijhar-text-secondary); background: var(--mijhar-bg-surface); border: 1px solid var(--mijhar-border-default);
  border-radius: var(--mijhar-radius-full); cursor: pointer;
}
.notes .chip:hover { color: var(--mijhar-text-primary); border-color: var(--mijhar-border-strong); }
.notes .chip[aria-pressed="true"] { color: var(--mijhar-text-brand); background: var(--mijhar-bg-selected); border-color: var(--mijhar-border-brand); font-weight: 700; }
.notes .chip:focus-visible { outline: none; box-shadow: var(--mijhar-focus-ring); }
.notes .composer { display: flex; flex-direction: column; gap: var(--mijhar-space-8); }
.notes label.field { font-weight: 700; }
.notes textarea {
  display: block; width: 100%; min-height: 72px; margin: 0; padding: var(--mijhar-space-8); font: inherit; resize: vertical;
  color: var(--mijhar-text-primary); background: var(--mijhar-bg-surface); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6);
}
.notes textarea:focus-visible { outline: none; border-color: var(--mijhar-border-focus); box-shadow: var(--mijhar-focus-ring); }
.notes .note-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mijhar-space-8); }
.notes .note {
  display: flex; flex-direction: column; gap: var(--mijhar-space-6); padding: var(--mijhar-space-8) var(--mijhar-space-12);
  background: var(--mijhar-bg-subtle); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12);
}
.notes .note[data-flash] { border-color: var(--mijhar-border-brand); box-shadow: var(--mijhar-focus-ring); }
.notes .note-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.notes .note-meta { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-4) var(--mijhar-space-12); color: var(--mijhar-text-secondary); font-size: 12px; line-height: 16px; }
.notes .note-actions { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-6); }
.notes .btn-small { min-height: 28px; padding: 0 var(--mijhar-space-8); font-size: 12px; }
.notes a.btn { text-decoration: none; }
.notes .anchor { display: inline-flex; align-items: center; padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); font-weight: 700; background: var(--mijhar-bg-muted); color: var(--mijhar-text-secondary); }
.notes .anchor[data-status="unanchored"] { background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); }
.notes .anchor[data-status="unverified"] { background: var(--mijhar-bg-info-subtle); color: var(--mijhar-text-info); }
.notes .group-title { margin-top: var(--mijhar-space-4); }
.notes .hint { color: var(--mijhar-text-secondary); }

.notes-card { margin: var(--mijhar-space-8) 0; border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); background: var(--mijhar-bg-surface); }
.notes-card > .card-bar {
  appearance: none; display: flex; align-items: center; justify-content: space-between; gap: var(--mijhar-space-8); width: 100%; margin: 0;
  padding: var(--mijhar-space-8) var(--mijhar-space-12); font: inherit; font-weight: 700; color: var(--mijhar-text-secondary);
  background: transparent; border: 0; border-radius: var(--mijhar-radius-12); cursor: pointer; text-align: start;
}
.notes-card > .card-bar:hover { color: var(--mijhar-text-primary); }
.notes-card > .card-bar:focus-visible { outline: none; box-shadow: var(--mijhar-focus-ring); }
.notes-card .count { min-width: 20px; padding: 0 var(--mijhar-space-6); text-align: center; border-radius: var(--mijhar-radius-full); background: var(--mijhar-bg-muted); color: var(--mijhar-text-primary); }
.notes-card .count[data-has] { background: var(--mijhar-bg-brand); color: var(--mijhar-text-on-brand); }
.notes-card .card-body { padding: 0 var(--mijhar-space-12) var(--mijhar-space-12); }

.line-marker {
  appearance: none; display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; margin: 0; padding: 0;
  font: inherit; font-size: 11px; line-height: 1; color: var(--mijhar-text-brand); background: var(--mijhar-bg-brand-subtle);
  border: 1px solid var(--mijhar-border-brand); border-radius: var(--mijhar-radius-full); cursor: pointer; opacity: 0.85;
}
.line-marker:hover, .line-marker:focus-visible { opacity: 1; outline: none; box-shadow: var(--mijhar-focus-ring); }
`;
