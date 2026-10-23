// أنماط العارض: تخطيط القراءة، وMarkdown بأسلوب قريب من GitHub، والاتجاه والعزل نفسهما، والطباعة من إعدادات الوحدة (أ) بخطوطها
// المضمّنة (عناوين نسبية داخل صفحة الإضافة).
import { DIRECTION_CSS } from '../../direction/feature';
import { EMBEDDED_FONTS, familyStack, fontFaceCss } from '../../fonts/fonts';
import type { Typography } from '../../fonts/fonts';
import { ISOLATION_CSS } from '../../isolation/processor';

const SYSTEM_SANS = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif';

const LAYOUT = `
.reader { max-width: 820px; margin: 0 auto; padding: var(--mijhar-space-24) var(--mijhar-space-16) 64px; }
.reader-header { display: flex; flex-direction: column; gap: var(--mijhar-space-12); padding-bottom: var(--mijhar-space-16); margin-bottom: var(--mijhar-space-16); border-bottom: 1px solid var(--mijhar-border-default); }
.reader-title { display: flex; flex-direction: column; gap: var(--mijhar-space-4); min-width: 0; }
.reader-source { color: var(--mijhar-text-secondary); overflow-wrap: anywhere; display: inline; }
.reader-controls { justify-content: space-between; }
.reader-controls label { cursor: pointer; }
.reader-section + .reader-section { margin-top: var(--mijhar-space-24); padding-top: var(--mijhar-space-16); border-top: 1px dashed var(--mijhar-border-default); }
.reader-section-label { font-size: 12px; line-height: 16px; color: var(--mijhar-text-tertiary); margin-bottom: var(--mijhar-space-8); direction: rtl; text-align: right; }
`;

const MARKDOWN = `
.reader-article { color: var(--mijhar-text-primary); overflow-wrap: break-word; }
.reader-article .markdown-body > :first-child { margin-top: 0; }
.reader-article p, .reader-article ul, .reader-article ol, .reader-article blockquote, .reader-article pre, .reader-article table, .reader-article dl, .reader-article details { margin: 0 0 16px; }
.reader-article h1, .reader-article h2, .reader-article h3, .reader-article h4, .reader-article h5, .reader-article h6 { margin: 24px 0 16px; font-weight: 700; line-height: 1.4; font-family: inherit; }
.reader-article h1 { font-size: 2em; padding-bottom: .3em; border-bottom: 1px solid var(--mijhar-border-muted); }
.reader-article h2 { font-size: 1.5em; padding-bottom: .3em; border-bottom: 1px solid var(--mijhar-border-muted); }
.reader-article h3 { font-size: 1.25em; }
.reader-article h4 { font-size: 1em; }
.reader-article ul, .reader-article ol { padding-inline-start: 2em; }
.reader-article blockquote { padding: 0 1em; color: var(--mijhar-text-secondary); border-inline-start: .25em solid var(--mijhar-border-default); }
.reader-article code, .reader-article kbd, .reader-article samp { font-family: var(--mijhar-font-mono); font-size: 85%; }
.reader-article :not(pre) > code { padding: .2em .4em; border-radius: 6px; background: var(--mijhar-bg-muted); }
.reader-article pre { direction: ltr; text-align: left; padding: 16px; overflow: auto; border-radius: 6px; background: var(--mijhar-bg-subtle); border: 1px solid var(--mijhar-border-muted); line-height: 1.45; }
.reader-article pre code { padding: 0; background: transparent; font-size: 85%; }
.reader-article table { border-collapse: collapse; display: block; max-width: 100%; overflow: auto; }
.reader-article th, .reader-article td { padding: 6px 13px; border: 1px solid var(--mijhar-border-default); }
.reader-article hr { height: .25em; border: 0; background: var(--mijhar-border-default); margin: 24px 0; }
.reader-article .img-alt { display: inline-block; padding: 0 .4em; border: 1px dashed var(--mijhar-border-default); border-radius: 4px; color: var(--mijhar-text-secondary); font-size: .9em; }
.reader-article .img-alt::before { content: "صورة: "; }
.reader-article a { color: var(--mijhar-text-link); }
`;

/** CSS العارض كله لطباعة معطاة. */
export function readerCss(typography: Typography): string {
  const faces = typography.family === 'system' ? '' : fontFaceCss(EMBEDDED_FONTS[typography.family], (file) => file);
  const body = `.reader-article{font-family:${familyStack(typography.family, SYSTEM_SANS)};font-size:${(16 * typography.scale) / 100}px;line-height:${typography.lineHeight}}
.reader-article p{margin-bottom:${16 * typography.spacing}px}
.reader-article :is(p, li, td, th, h1, h2, h3, h4, h5, h6){letter-spacing:0}`;
  return [faces, LAYOUT, MARKDOWN, DIRECTION_CSS, ISOLATION_CSS, body].filter(Boolean).join('\n');
}
