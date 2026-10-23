// إحصاءات القياس التمهيدي (وسيط ومئين 95 وتوزيع) وكتابة النتائج إلى evidence/ عند طلبها بـMJ2_EVIDENCE=1.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../setup/paths';

export interface Summary {
  n: number;
  median: number;
  p95: number;
  min: number;
  max: number;
}

export function summarize(samples: readonly number[]): Summary {
  const sorted = [...samples].sort((x, y) => x - y);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] as number;
  return { n: sorted.length, median: at(0.5), p95: at(0.95), min: sorted[0] as number, max: sorted[sorted.length - 1] as number };
}

/** ميل الانحدار الخطي لقيم y على الفهرس 0..n-1 (وحدة y لكل خطوة). */
export function slope(values: readonly number[]): number {
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - meanX) * (y - meanY);
    den += (x - meanX) ** 2;
  });
  return den === 0 ? 0 : num / den;
}

export const round = (value: number, digits = 3): number => Number(value.toFixed(digits));

/** يدمج مقطعًا في ملف قياسات JSON لمهمة، ولا يكتب شيئًا ما لم يُطلب صراحة (فلا يتلوث evidence بكل تشغيل). */
export function recordMeasurement(taskId: string, section: string, data: unknown): void {
  if (process.env.MJ2_EVIDENCE !== '1') return;
  const file = path.join(ROOT, 'evidence', taskId, 'measurements.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  existing[section] = data;
  fs.writeFileSync(file, `${JSON.stringify(existing, null, 2)}\n`);
}
