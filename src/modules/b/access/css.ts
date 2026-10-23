// أنماط الوصول المضافة فوق CARD_CSS: استجابة اللمس بلا انتظار نقرة ثانية، وأهداف أكبر للمؤشر الخشن، ووضع الألوان القسرية.
// لا قاعدة هنا تكشف شرحًا بـ:hover (يتحقق منه tests/modules/b/access/no-hover.test.ts).
export const ACCESS_CSS = `
.badge { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
@media (pointer: coarse), (hover: none) {
  .mj-root .card .btn, .mj-root .card .tab, .mj-root .mode-bar .btn { min-height: 44px; }
  .mj-root .card .icon-btn { min-width: 44px; }
  .mj-root .card .tab { padding-inline: var(--mijhar-space-12); }
}
@media (forced-colors: active) {
  .badge { forced-color-adjust: none; background: ButtonFace; color: ButtonText; border-color: ButtonText; }
  .badge[aria-expanded="true"], .badge:focus-visible { outline: 3px solid Highlight; outline-offset: 2px; }
}
`;
