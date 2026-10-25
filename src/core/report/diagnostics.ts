// تشخيص البلاغ: إصدار مِجهَر والمتصفح والنظام وحزمة البناء، من الإضافة والمتصفح وحدهما (صفحة الإعدادات)، ومكان اللوحة والوحدات الموقوفة من الإعدادات.
// لا شيء من الصفحات ولا من الملاحظات ولا من الأسرار. وكل مصدر يتدهور إلى «unknown» صريحة لا إلى غياب الحقل، لأن العقد يشترط الحقول.
import type { Diagnostics } from './payload';

/** runtime.PlatformOs ← قيم العقد. */
const OS: Readonly<Record<string, string>> = { mac: 'macos', win: 'windows', linux: 'linux', cros: 'chromeos', android: 'android', openbsd: 'openbsd', fuchsia: 'fuchsia' };
/** runtime.PlatformArch ← قيم العقد (Firefox يسمّي ARM64 aarch64). */
const ARCH: Readonly<Record<string, string>> = { arm: 'arm', arm64: 'arm64', aarch64: 'arm64', 'x86-32': 'x86', 'x86-64': 'x86_64', mips: 'mips', mips64: 'mips64' };

interface Brand {
  readonly brand: string;
  readonly version: string;
}
interface UaData {
  readonly brands?: readonly Brand[];
  getHighEntropyValues?(hints: string[]): Promise<{ platformVersion?: string; fullVersionList?: readonly Brand[] }>;
}

export interface DiagnosticsSources {
  readonly manifestVersion: () => string;
  readonly platformInfo: () => Promise<{ os: string; arch: string }>;
  readonly uaData: () => UaData | undefined;
  readonly userAgent: () => string;
  /** Firefox وحده: runtime.getBrowserInfo. */
  readonly browserInfo: () => Promise<{ name: string; version: string } | null>;
  readonly isBrave: () => Promise<boolean>;
  /** تثبيت مطوّر (management.getSelf().installType === 'development'): نسخة غير منشورة. */
  readonly development: () => Promise<boolean>;
  readonly target: () => 'chromium' | 'firefox';
}

type Api = {
  runtime: { getManifest(): { version: string }; getPlatformInfo(): Promise<{ os: string; arch: string }>; getBrowserInfo?(): Promise<{ name: string; version: string }> };
  management?: { getSelf(): Promise<{ installType?: string }> };
};
const api = (): Api => ((globalThis as { browser?: Api }).browser ?? (globalThis as unknown as { chrome: Api }).chrome);

export const liveSources = (): DiagnosticsSources => ({
  manifestVersion: () => api().runtime.getManifest().version,
  platformInfo: () => api().runtime.getPlatformInfo(),
  uaData: () => (navigator as Navigator & { userAgentData?: UaData }).userAgentData,
  userAgent: () => navigator.userAgent,
  browserInfo: async () => (api().runtime.getBrowserInfo ? api().runtime.getBrowserInfo!() : null),
  isBrave: async () => Boolean(await (navigator as Navigator & { brave?: { isBrave(): Promise<boolean> } }).brave?.isBrave().catch(() => false)),
  development: async () => (await api().management?.getSelf().catch(() => null))?.installType === 'development',
  target: () => __TARGET__,
});

const PREFERRED = ['Microsoft Edge', 'Google Chrome', 'Brave', 'Opera', 'Vivaldi', 'Chromium'];

async function browserOf(s: DiagnosticsSources): Promise<{ browser: string; version: string; osVersion: string }> {
  const info = await s.browserInfo().catch(() => null);
  if (info) return { browser: info.name, version: info.version, osVersion: 'unknown' };
  const ua = s.uaData();
  const high = await (ua?.getHighEntropyValues?.(['platformVersion', 'fullVersionList']) ?? Promise.resolve({ platformVersion: undefined, fullVersionList: undefined })).catch(() => ({ platformVersion: undefined, fullVersionList: undefined }));
  const brands = high.fullVersionList ?? ua?.brands ?? [];
  if (await s.isBrave()) {
    const chromium = brands.find((b) => b.brand === 'Chromium');
    return { browser: 'Brave', version: chromium?.version ?? 'unknown', osVersion: high.platformVersion ?? 'unknown' };
  }
  const known = PREFERRED.map((name) => brands.find((b) => b.brand === name)).find(Boolean);
  if (known) return { browser: known.brand, version: known.version, osVersion: high.platformVersion ?? 'unknown' };
  const m = /Firefox\/([\d.]+)/.exec(s.userAgent());
  return m ? { browser: 'Firefox', version: m[1]!, osVersion: 'unknown' } : { browser: 'unknown', version: 'unknown', osVersion: 'unknown' };
}

export async function collectDiagnostics(settings: { surface: string; disabledUnits: readonly string[] }, s: DiagnosticsSources = liveSources()): Promise<Diagnostics> {
  const platform = await s.platformInfo().catch(() => ({ os: 'unknown', arch: 'unknown' }));
  const b = await browserOf(s);
  return {
    appVersion: s.manifestVersion(),
    os: OS[platform.os] ?? 'unknown',
    osVersion: b.osVersion,
    arch: ARCH[platform.arch] ?? 'unknown',
    browser: b.browser,
    browserVersion: b.version,
    buildTarget: s.target(),
    surface: settings.surface,
    disabledUnits: settings.disabledUnits,
    test: await s.development().catch(() => false),
  };
}
