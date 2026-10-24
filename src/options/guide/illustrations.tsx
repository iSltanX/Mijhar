// رسوم توضيحية مبسّطة لخطوات دليل رمز GitHub (AD-29؛ الإطار O-17). تحاكي واجهة GitHub وقت كتابة الدليل ولا تنقل لقطة منها: لا بيانات
// حساب ولا رمز حقيقي (الأسماء نائبة والرمز مقنَّع)، والتسميات الإنجليزية من خطوات توثيق GitHub، وما لم يُنقل نصّه يُرسم شريطًا رماديًا.
// ألوان GitHub من مجموعة «GitHub context (محاكاة المضيف)» في ملف التصميم، وألوان مِجهَر من رموزه؛ فتتبع الوضعين. كل رسم role="img" باسم
// يصفه، والخطوة نصًّا تكفي دونه.
import type { ComponentChildren } from 'preact';

export const ILLUSTRATION_CSS = `
.mj-root .guide-figure svg { display: block; width: 100%; height: auto; max-width: 320px; border-radius: 6px;
  --gh-canvas: #ffffff; --gh-subtle: #f6f8fa; --gh-border: #d0d7de; --gh-border-muted: #d8dee4; --gh-fg: #1f2328; --gh-fg-muted: #59636e;
  --gh-accent: #0969da; --gh-btn: #f6f8fa; --gh-primary: #1f883d; --gh-danger: #d1242f; --gh-success: #1a7f37; --gh-code: #eff2f5; }
@media (prefers-color-scheme: dark) {
  .mj-root:not([data-theme="light"]) .guide-figure svg { --gh-canvas: #0d1117; --gh-subtle: #161b22; --gh-border: #30363d; --gh-border-muted: #21262d; --gh-fg: #e6edf3;
    --gh-fg-muted: #9198a1; --gh-accent: #4493f8; --gh-btn: #21262d; --gh-primary: #238636; --gh-danger: #f85149; --gh-success: #3fb950; --gh-code: #262c36; }
}
.mj-root[data-theme="dark"] .guide-figure svg { --gh-canvas: #0d1117; --gh-subtle: #161b22; --gh-border: #30363d; --gh-border-muted: #21262d; --gh-fg: #e6edf3;
  --gh-fg-muted: #9198a1; --gh-accent: #4493f8; --gh-btn: #21262d; --gh-primary: #238636; --gh-danger: #f85149; --gh-success: #3fb950; --gh-code: #262c36; }
.mj-root .guide-figure text { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
.mj-root .guide-figure .g-canvas { fill: var(--gh-canvas); } .mj-root .guide-figure .g-subtle { fill: var(--gh-subtle); }
.mj-root .guide-figure .g-btn { fill: var(--gh-btn); } .mj-root .guide-figure .g-primary { fill: var(--gh-primary); }
.mj-root .guide-figure .g-accent { fill: var(--gh-accent); } .mj-root .guide-figure .g-code { fill: var(--gh-code); }
.mj-root .guide-figure .g-bar { fill: var(--gh-border-muted); } .mj-root .guide-figure .g-success { fill: var(--gh-success); }
.mj-root .guide-figure .s-border { stroke: var(--gh-border); stroke-width: 1; } .mj-root .guide-figure .s-muted { stroke: var(--gh-border-muted); stroke-width: 1; }
.mj-root .guide-figure .t-fg { fill: var(--gh-fg); } .mj-root .guide-figure .t-muted { fill: var(--gh-fg-muted); }
.mj-root .guide-figure .t-accent { fill: var(--gh-accent); } .mj-root .guide-figure .t-danger { fill: var(--gh-danger); } .mj-root .guide-figure .t-on { fill: #ffffff; }
.mj-root .guide-figure .m-surface { fill: var(--mijhar-bg-surface); } .mj-root .guide-figure .m-border { stroke: var(--mijhar-border-default); stroke-width: 1; }
.mj-root .guide-figure .m-brand { fill: var(--mijhar-bg-brand); } .mj-root .guide-figure .m-fg { fill: var(--mijhar-text-primary); }
.mj-root .guide-figure .m-muted { fill: var(--mijhar-text-secondary); } .mj-root .guide-figure .m-on { fill: var(--mijhar-text-on-brand); }
.mj-root .guide-figure .m-ring { stroke: var(--mijhar-border-strong); stroke-width: 1.2; fill: var(--mijhar-bg-surface); }
.mj-root .guide-figure .hl { fill: none; stroke: var(--mijhar-border-focus); stroke-width: 2; }
.mj-root .guide-figure .hl-glow { fill: none; stroke: var(--mijhar-border-focus); stroke-width: 6; stroke-opacity: 0.22; }
.mj-root .guide-figure .mk { fill: var(--mijhar-bg-brand); stroke: var(--mijhar-bg-surface); stroke-width: 2; }
.mj-root .guide-figure .mk-t { fill: var(--mijhar-text-on-brand); font-weight: 700; }
`;

type Cls = string;
const R = (x: number, y: number, w: number, h: number, cls: Cls, r = 0) => <rect x={x} y={y} width={w} height={h} rx={r} class={cls} />;
const X = (x: number, y: number, text: string, cls: Cls, size = 10, weight: 400 | 600 = 400) => (
  <text x={x} y={y + size} font-size={size} font-weight={weight} class={cls}>
    {text}
  </text>
);
const bar = (x: number, y: number, w: number) => R(x, y, w, 6, 'g-bar', 2);
/** حلقة تبرز موضع الضغط، ورقمه. */
const HL = (x: number, y: number, w: number, h: number) => (
  <>
    <rect x={x} y={y} width={w} height={h} rx={6} class="hl-glow" />
    <rect x={x} y={y} width={w} height={h} rx={6} class="hl" />
  </>
);
const MK = (cx: number, cy: number, n: number) => (
  <>
    <circle cx={cx} cy={cy} r={11} class="mk" />
    <text x={cx} y={cy + 4} font-size={11} text-anchor="middle" class="mk-t">
      {n}
    </text>
  </>
);

function Frame({ label, children, mijhar }: { label: string; children: ComponentChildren; mijhar?: boolean }) {
  return (
    <svg viewBox="0 0 320 200" role="img" aria-label={label} direction="ltr">
      <rect x={0.5} y={0.5} width={319} height={199} rx={6} class={mijhar ? 'm-surface m-border' : 'g-canvas s-border'} />
      {children}
    </svg>
  );
}

const DROP = '▾';

export const STEP_ILLUSTRATIONS: ReadonlyArray<{ readonly label: string; readonly mijhar?: boolean; readonly draw: () => ComponentChildren }> = [
  {
    label: 'رسم توضيحي: قائمة إعدادات GitHub وفيها Fine-grained tokens محددًا، وزر Generate new token مبرزًا.',
    draw: () => (
      <>
        {R(1, 1, 318, 28, 'g-subtle', 5)}
        {X(12, 9, 'Settings', 't-fg', 11, 600)}
        {X(12, 40, 'Developer settings', 't-muted', 10, 600)}
        {X(12, 60, 'GitHub Apps', 't-muted')}
        {X(12, 78, 'OAuth Apps', 't-muted')}
        {X(12, 96, 'Personal access tokens', 't-fg', 9, 600)}
        {R(16, 112, 124, 18, 'g-subtle', 4)}
        {R(16, 112, 2, 18, 'g-accent')}
        {X(24, 115, 'Fine-grained tokens', 't-fg', 9, 600)}
        {X(24, 136, 'Tokens (classic)', 't-muted', 9)}
        {R(150, 36, 1, 160, 'g-bar')}
        {X(162, 42, 'Fine-grained personal', 't-fg', 10, 600)}
        {X(162, 55, 'access tokens', 't-fg', 10, 600)}
        {bar(162, 78, 140)}
        {bar(162, 90, 110)}
        {R(176, 104, 132, 24, 'g-primary', 6)}
        <text x={242} y={120} font-size={10} font-weight={600} text-anchor="middle" class="t-on">
          Generate new token
        </text>
        {HL(14, 110, 128, 22)}
        {MK(142, 110, 1)}
        {HL(174, 102, 136, 28)}
        {MK(306, 102, 2)}
      </>
    ),
  },
  {
    label: 'رسم توضيحي: حقل Token name وفيه Mijhar read-only، وقائمة Expiration على 90 days.',
    draw: () => (
      <>
        {X(16, 16, 'Token name *', 't-fg', 10, 600)}
        {R(16, 34, 288, 26, 'g-canvas s-border', 6)}
        {X(24, 41, 'Mijhar read-only', 't-fg')}
        {X(16, 76, 'Expiration *', 't-fg', 10, 600)}
        {R(16, 94, 120, 26, 'g-btn s-border', 6)}
        {X(24, 101, '90 days', 't-fg', 10, 600)}
        {X(120, 100, DROP, 't-muted')}
        {bar(146, 104, 120)}
        {X(16, 136, 'Description', 't-muted', 10, 600)}
        {R(16, 154, 288, 30, 'g-canvas s-border', 6)}
        {bar(24, 166, 160)}
        {HL(14, 32, 292, 30)}
        {MK(300, 32, 1)}
        {HL(14, 92, 124, 30)}
        {MK(134, 92, 2)}
      </>
    ),
  },
  {
    label: 'رسم توضيحي: Resource owner على حسابك، وRepository access على Only select repositories، ومستودعان نائبان مختاران.',
    draw: () => (
      <>
        {X(16, 12, 'Resource owner', 't-fg', 10, 600)}
        {R(16, 28, 140, 24, 'g-btn s-border', 6)}
        {X(24, 34, 'your-account', 't-fg')}
        {X(140, 33, DROP, 't-muted')}
        {X(16, 64, 'Repository access', 't-fg', 10, 600)}
        <circle cx={21} cy={87} r={5} class="g-canvas s-border" />
        {bar(32, 84, 110)}
        <circle cx={21} cy={105} r={5} class="g-canvas s-border" />
        {bar(32, 102, 90)}
        <circle cx={21} cy={123} r={5} class="g-accent" />
        <circle cx={21} cy={123} r={2} class="g-canvas" />
        {X(32, 116, 'Only select repositories', 't-fg', 10, 600)}
        {R(32, 136, 200, 54, 'g-canvas s-border', 6)}
        {R(40, 144, 10, 10, 'g-accent', 2)}
        {X(56, 142, 'your-account/your-repo', 't-fg', 9)}
        {R(40, 164, 10, 10, 'g-accent', 2)}
        {X(56, 162, 'your-account/another-repo', 't-fg', 9)}
        {HL(14, 26, 144, 28)}
        {MK(156, 26, 1)}
        {HL(14, 114, 160, 18)}
        {MK(174, 114, 2)}
        {HL(30, 134, 204, 58)}
        {MK(234, 134, 3)}
      </>
    ),
  },
  {
    label: 'رسم توضيحي: قائمة Permissions بالصلاحيات الست وكل منها Read-only.',
    draw: () => (
      <>
        {X(16, 12, 'Permissions', 't-fg', 11, 600)}
        {['Actions', 'Commit statuses', 'Contents', 'Issues', 'Metadata', 'Pull requests'].map((name, k) => {
          const y = 34 + k * 26;
          return (
            <g key={name}>
              {R(16, y - 4, 288, 1, 'g-bar')}
              {X(16, y + 3, name, 't-fg')}
              {R(204, y, 92, 20, 'g-btn s-border', 6)}
              {X(212, y + 4, 'Read-only', 't-fg', 9, 600)}
              {X(284, y + 3, DROP, 't-muted', 9)}
            </g>
          );
        })}
        {HL(202, 32, 96, 152)}
        {MK(298, 32, 1)}
      </>
    ),
  },
  {
    label: 'رسم توضيحي: الرمز الجديد مقنَّعًا يبدأ بـgithub_pat_ وزر النسخ بجانبه مبرزًا.',
    draw: () => (
      <>
        {X(16, 14, 'Fine-grained personal access tokens', 't-fg', 10, 600)}
        {R(16, 36, 288, 30, 'g-subtle s-border', 6)}
        {R(28, 48, 200, 6, 'g-success', 3)}
        {R(16, 80, 288, 52, 'g-canvas s-border', 6)}
        {X(28, 88, 'Mijhar read-only', 't-fg', 10, 600)}
        {R(28, 106, 236, 18, 'g-code', 4)}
        {X(34, 109, 'github_pat_••••••••••••••••••', 't-fg', 9)}
        {R(272, 104, 22, 22, 'g-btn s-border', 6)}
        {R(279, 110, 8, 9, 'g-canvas s-border', 1)}
        {R(282, 113, 8, 9, 'g-canvas s-border', 1)}
        {bar(16, 150, 220)}
        {bar(16, 164, 160)}
        {HL(270, 102, 26, 26)}
        {MK(296, 102, 1)}
      </>
    ),
  },
  {
    label: 'رسم توضيحي من واجهة مِجهَر: اختيار ذاكرة الجلسة، وحقل الرمز مقنَّعًا، وزر احفظ الرمز مبرزًا.',
    mijhar: true,
    draw: () => (
      <>
        <text x={304} y={26} font-size={13} font-weight={700} text-anchor="start" direction="rtl" class="m-fg">
          رمز GitHub للقراءة (اختياري)
        </text>
        <text x={304} y={50} font-size={10} text-anchor="start" direction="rtl" class="m-muted">
          أين يُحفظ
        </text>
        <circle cx={298} cy={66} r={5} class="m-brand" />
        <text x={288} y={70} font-size={11} font-weight={700} text-anchor="start" direction="rtl" class="m-fg">
          ذاكرة الجلسة (الافتراضي)
        </text>
        <circle cx={298} cy={88} r={5} class="m-ring" />
        <text x={288} y={92} font-size={11} text-anchor="start" direction="rtl" class="m-muted">
          القرص في هذا المتصفح
        </text>
        {R(16, 108, 288, 28, 'm-surface m-border', 6)}
        <text x={24} y={126} font-size={11} class="m-fg" font-family="ui-monospace, Menlo, monospace">
          github_pat_••••••••••••
        </text>
        {R(216, 150, 88, 28, 'm-brand', 6)}
        <text x={260} y={168} font-size={11} font-weight={700} text-anchor="middle" class="m-on">
          احفظ الرمز
        </text>
        {R(116, 150, 92, 28, 'm-surface m-border', 6)}
        <text x={162} y={168} font-size={10} font-weight={700} text-anchor="middle" class="m-fg">
          تحقق من الرمز
        </text>
        {HL(14, 106, 292, 32)}
        {MK(16, 106, 1)}
        {HL(214, 148, 92, 32)}
        {MK(306, 148, 2)}
      </>
    ),
  },
  {
    label: 'رسم توضيحي: قائمة الرموز في GitHub، وزر Delete بجانب رمز Mijhar read-only مبرزًا.',
    draw: () => (
      <>
        {X(16, 14, 'Fine-grained personal access tokens', 't-fg', 10, 600)}
        {[0, 1].map((k) => {
          const y = 40 + k * 56;
          return (
            <g key={k}>
              {R(16, y, 288, 48, 'g-canvas s-border', 6)}
              {k === 0 ? X(28, y + 8, 'Mijhar read-only', 't-accent', 10, 600) : bar(28, y + 12, 100)}
              {bar(28, y + 28, 140)}
              {R(248, y + 12, 46, 22, 'g-btn s-border', 6)}
              {X(256, y + 16, 'Delete', 't-danger', 9, 600)}
            </g>
          );
        })}
        {HL(246, 50, 50, 26)}
        {MK(296, 50, 1)}
      </>
    ),
  },
];

export function StepIllustration({ index }: { index: number }) {
  const item = STEP_ILLUSTRATIONS[index];
  if (!item) return null;
  return (
    <figure class="guide-figure" data-illustration={index + 1}>
      <figcaption class="figure-tag">{item.mijhar ? 'من واجهة مِجهَر' : 'رسم توضيحي، ليس لقطة من GitHub'}</figcaption>
      <Frame label={item.label} {...(item.mijhar ? { mijhar: true } : {})}>
        {item.draw()}
      </Frame>
    </figure>
  );
}
