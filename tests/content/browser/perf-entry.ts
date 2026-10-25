// نقطة دخول سكربت المحتوى لقياس TEST-PERF-01 (MJ26، T-10.1): startContent الحقيقي نفسه بالوحدات المشحونة كلها، ومعه تسجيل حدّي القياس
// المعرّفين في الشيفرة (القسم 6.14): PB-06 من أول تنفيذ هذا الملف حتى اكتمال أول مطابقة (اكتشاف الصفحة وتركيب الوحدات المفعّلة)، وPB-07 من حدث
// انتهاء التنقل حتى اكتمال المطابقة (durationMs في ReconcileResult). تُبنى في حزمة قياس مؤقتة بدل content.js، ولا تدخل الحزمة المشحونة.
// لا تكتب شيئًا في الصفحة أثناء القياس: النتائج تُكتب في سمة data-mijhar-perf مرة واحدة حين تطلبها أداة القياس بحدث mijhar-perf-dump.
import { startContent } from '../../../src/content/main';

const startedAt = performance.now();
const reconciles: { reason: string; ms: number; endAt: number; mounted: number; unmounted: number; active: number; path: string }[] = [];
let readyAt: number | null = null;
let failed: string | null = null;

const handle = startContent({
  lifecycle: {
    onReconcile: (result) => {
      reconciles.push({ reason: result.reason, ms: result.durationMs, endAt: performance.now(), mounted: result.mounted.length, unmounted: result.unmounted.length, active: 0, path: location.pathname });
    },
  },
});
handle.ready.then(
  ({ manager }) => {
    readyAt = performance.now();
    const first = reconciles[0];
    if (first) first.active = manager.mountedIds().length;
  },
  (error: unknown) => {
    failed = String(error);
  },
);

document.addEventListener('mijhar-perf-dump', () => {
  document.documentElement.setAttribute('data-mijhar-perf', JSON.stringify({ startedAt, readyAt, failed, reconciles }));
});
