// مزوّد ثانٍ وهمي لبناء المحاكاة وحده (sim-check.mjs): يُحقن في السجلين الوصفي والمحوّلات وقت البناء في مجلد مؤقت، ولا يدخل dist المشحون ولا المصدر.
// مضيفه api.mock-b.test لا يوجد، ويخدمه مشغّل الاختبار محليًا. محاكاة لا اتصال بمزوّد حقيقي (AD-32 (٨)).
import { mockAdapter } from '../fixture-provider-mock';

export const SIM_B = mockAdapter('mock-b', 'Mock B');
