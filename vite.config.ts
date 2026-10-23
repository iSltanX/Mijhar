import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// يحجب مسار dangerouslySetInnerHTML في Preact: الإسناد الوحيد إلى innerHTML بقيمة متغيرة في الحزمة (وهو ما يحذّر منه
// web-ext lint). لا تستعمله واجهات مِجهَر، فيصير استعماله خطأً صريحًا بدل منفذ لحقن HTML. إن تغيّر نمطه في إصدار
// آخر من Preact فشل البناء هنا بدل أن يمرّ صامتًا.
const PREACT_HTML_SINK = /\(([A-Za-z_$][\w$]*)\.innerHTML=([A-Za-z_$][\w$]*)\.__html\)/g;
function blockHtmlSink(): Plugin {
  return {
    name: 'mijhar-block-html-sink',
    transform(code, id) {
      if (!/[\\/]node_modules[\\/]preact[\\/]dist[\\/]/.test(id)) return null;
      const out = code.replace(PREACT_HTML_SINK, '(()=>{throw new Error("dangerouslySetInnerHTML غير مسموح في مِجهَر")})()');
      if (out === code && /\.innerHTML=(?!"")/.test(code)) this.error(`نمط innerHTML في ${id} تغيّر: حدّث PREACT_HTML_SINK`);
      return out === code ? null : { code: out, map: null };
    },
  };
}

// الإعداد المشترك للبناء والاختبار. scripts/build.mjs يبني كل هدف بـmode = chromium | firefox
// ويمرّر لكل مدخل مجلد الإخراج وإعداد المكتبة؛ وهنا ما يشترك فيه الهدفان.
// JSX بـPreact (DEC-01 أ). والمكوّنات المنقولة من المشروع السابق (React) تمر عبر preact/compat: الملف الذي يعلن
// @jsxImportSource react يُترجم إلى react/jsx-runtime، فيُحوَّل إلى preact/compat/jsx-runtime (src/shared/ui/compat/).
export default defineConfig(({ mode }) => ({
  plugins: [blockHtmlSink()],
  define: {
    __TARGET__: JSON.stringify(mode === 'firefox' ? 'firefox' : 'chromium'),
  },
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  resolve: {
    alias: [
      { find: /^react$/, replacement: 'preact/compat' },
      { find: /^react-dom$/, replacement: 'preact/compat' },
      { find: /^react\/jsx-runtime$/, replacement: 'preact/compat/jsx-runtime' },
      { find: /^react\/jsx-dev-runtime$/, replacement: 'preact/compat/jsx-dev-runtime' },
    ],
  },
  build: {
    target: 'es2022',
    // مقروءة لا مصغَّرة: تسهّل مراجعة الحزمة، والتصغير قرار مرحلة التغليف.
    minify: false,
    sourcemap: false,
    emptyOutDir: false,
    copyPublicDir: false,
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
}));
