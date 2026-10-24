// عقد «ميزة تحتاج ربطًا» (T-11.1، AC-11.1 ‏(٣) و(٤) و(٥)): الأقسام تعرض الخيار داخلها معلَّلًا بما يحتاجه، ولا يُقفل قسم بكامله. قائمة
// مغلقة من المعرّفات تقبلها الخلفية في رسالة فتح الإعدادات للعودة إلى الميزة (لا عنوان تركّبه رسالة). تضيف كل مرحلة ميزتها سطرًا هنا.
import { CONNECTIONS } from './definitions';
import type { ConnectionDefinition, ConnectionId } from './definitions';
import { isLinked } from './health';
import type { Health } from './health';

export interface ConnectedFeature {
  readonly id: string;
  /** اسم الخيار كما يظهر في قسمه، ويُعرض في صفحة الإعدادات «طلبت: …». */
  readonly title: string;
  /** القسم الذي يظهر فيه. */
  readonly section: string;
  readonly requires: readonly ConnectionId[];
  /** ما يضيفه الخيار حين يُربط. */
  readonly benefit: string;
}

export const CONNECTED_FEATURES = [
  {
    id: 'd.pr-status.private',
    title: 'قراءة طلب الدمج وفحوص Actions في مستودع خاص',
    section: 'ملخص حالة طلب الدمج',
    requires: ['github-token'],
    benefit: 'تقرأ الخلفية الطلب وحماية الفرع وحالة الالتزام ومهام Actions برمزك للقراءة فقط، ويبقى ما تعرضه الصفحة كما هو.',
  },
] as const satisfies readonly ConnectedFeature[];

export type FeatureId = (typeof CONNECTED_FEATURES)[number]['id'];

export const isFeatureId = (value: unknown): value is FeatureId => typeof value === 'string' && CONNECTED_FEATURES.some((f) => f.id === value);

export function featureById(id: FeatureId): ConnectedFeature {
  return CONNECTED_FEATURES.find((f) => f.id === id) as ConnectedFeature;
}

/** الميزات التي تعتمد على الاتصال: وحدها تتعطل بحذف سرّه أو انتهائه (AC-11.1 ‏(٥)). */
export const dependentsOf = (id: ConnectionId, features: readonly ConnectedFeature[] = CONNECTED_FEATURES): ConnectedFeature[] => features.filter((f) => f.requires.includes(id));

export type Gate = { readonly open: true } | { readonly open: false; readonly missing: readonly { readonly connection: ConnectionDefinition; readonly health: Health }[] };

/** هل الخيار متاح بحسب صحة اتصالاته الآن. ما لا يعرفه المستدعي من الاتصالات يُعدّ «غير مربوط». */
export function gate(feature: ConnectedFeature, health: Partial<Record<ConnectionId, Health>>): Gate {
  const missing = feature.requires
    .map((id) => ({ connection: CONNECTIONS.find((c) => c.id === id) as ConnectionDefinition, health: health[id] ?? 'none' }))
    .filter((m) => !isLinked(m.health));
  return missing.length ? { open: false, missing } : { open: true };
}
