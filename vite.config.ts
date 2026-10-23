import { defineConfig } from 'vitest/config';

// الإعداد المشترك للبناء والاختبار. scripts/build.mjs يبني كل هدف بـmode = chromium | firefox
// ويمرّر لكل مدخل مجلد الإخراج وإعداد المكتبة؛ وهنا ما يشترك فيه الهدفان.
export default defineConfig(({ mode }) => ({
  define: {
    __TARGET__: JSON.stringify(mode === 'firefox' ? 'firefox' : 'chromium'),
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
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
