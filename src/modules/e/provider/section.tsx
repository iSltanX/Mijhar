// قسم «إعدادات التحليل» في صفحة الإعدادات (T-11.6، AC-E9 (٣)، الإطار O-10): المودل من قائمة المزوّد كما قُرئت وقت التشغيل بمصدرها ووقتها (لا
// قائمة ولا معرّف مودل في الشيفرة)، وبيان الموافقة وما يُرسل ووجهته. لا أسعار ولا تكلفة ولا حد إنفاق (AD-31). القائمة تُقرأ بطلب التحقق المعلن في
// بطاقة المفتاح وحده؛ وهذا القسم لا يطلب شيئًا من الشبكة.
import { useEffect, useState } from 'preact/hooks';
import { extensionApi } from '../../../core/ui-host/browser-api';
import { utcText } from '../../../core/connections/text';
import type { SettingsSection, SettingsSectionProps } from '../../../options/sections';
import { Ltr } from '../../../shared/ui';
import { useSetting } from '../../../shared/ui/useSetting';
import { runtimeProviderPort } from './port';
import type { ProviderPort, ProviderStatus } from './port';
import { PROVIDER_MODEL_KEY, defineProviderSettings } from './settings';

function defaultPort(): ProviderPort | null {
  try {
    return runtimeProviderPort(extensionApi().runtime);
  } catch {
    return null;
  }
}

export function ProviderSettings({ settings, port = defaultPort() }: SettingsSectionProps & { readonly port?: ProviderPort | null }) {
  const choice = useSetting<string>(settings, PROVIDER_MODEL_KEY);
  const [status, setStatus] = useState<ProviderStatus | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!port) {
      setStatus(null);
      return undefined;
    }
    port.status().then((value) => alive && setStatus(value));
    return () => {
      alive = false;
    };
  }, [port, choice]);

  const models = status?.models ?? null;
  const known = models?.models ?? [];
  const current = status?.model ?? null;
  // المودل المختار قد لا يكون في القائمة المقروءة الآن (لم تُقرأ في هذه الجلسة): يبقى خيارًا باسمه.
  const options = current && !known.some((m) => m.id === current.id) ? [{ id: current.id, displayName: current.displayName }, ...known] : known;

  return (
    <div class="provider-settings" data-provider-settings="">
      <p class="muted">تنطبق على كل تحليل تطلبه؛ والموافقة قبل الإرسال لا تُلغى.</p>
      <label class="label" for="mj-provider-model">
        <strong>المودل</strong>
      </label>
      <select
        id="mj-provider-model"
        data-setting={PROVIDER_MODEL_KEY}
        disabled={!options.length}
        value={choice || current?.id || ''}
        onChange={(event) => {
          setError(null);
          settings.set(PROVIDER_MODEL_KEY, (event.currentTarget as HTMLSelectElement).value).catch((e: unknown) => setError(`تعذّر الحفظ: ${e instanceof Error ? e.message : String(e)}`));
        }}
      >
        {!options.length && <option value="">لم تُقرأ قائمة المودلات بعد</option>}
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName === m.id ? m.id : `${m.displayName} (${m.id})`}
          </option>
        ))}
      </select>
      <p class="muted small" data-models-source={models ? 'read' : 'none'}>
        {models ? (
          <>
            من قائمة {status?.provider.title ?? 'المزوّد'} (<Ltr className="mono">{models.source}</Ltr>) كما قُرئت <Ltr>{utcText(models.readAt)}</Ltr>؛ تُحدَّث عند كل
            تحقق من المفتاح{models.partial ? '، وأعلن المزوّد مودلات أخرى لم تُقرأ' : ''}.
          </>
        ) : status === undefined ? (
          'جارٍ القراءة…'
        ) : (
          'لم تُقرأ قائمة المودلات في هذه الجلسة: تحقق من المفتاح في بطاقته لتُقرأ من المزوّد. ولا قائمة مودلات في مِجهَر نفسه.'
        )}
      </p>
      <dl class="conn-meta provider-rules">
        <dt>الموافقة</dt>
        <dd>قبل كل تحليل، دائمًا، بزر «إرسال للتحليل» في القسم نفسه. لا خيار لإيقافها.</dd>
        <dt>ما يُرسل</dt>
        <dd>ما تراه في الموافقة بعد التنقيح. لا يُرفق رمز GitHub، ويُنقَّح المحتوى لاكتشاف الأسرار قبل الإرسال؛ راجع ما سيُرسل للتأكد.</dd>
        <dt>الوجهة</dt>
        <dd>
          <Ltr className="mono">{status?.provider.host ?? 'api.anthropic.com'}</Ltr> وحده، من خلفية الإضافة بلا وسيط.
        </dd>
      </dl>
      <p class="row">
        <a href="#guide/provider-key" data-action="provider-guide">
          لماذا المفتاح؟
        </a>
      </p>
      {error && (
        <p class="notice" data-tone="danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const PROVIDER_SETTINGS_SECTION: SettingsSection = {
  id: 'e-provider',
  unit: 'e',
  title: 'إعدادات التحليل',
  // صفحة الإعدادات وحدها: بجوار بطاقة المفتاح، وروابطها إلى «لماذا المفتاح؟» داخل الصفحة نفسها.
  surfaces: ['options'],
  define: defineProviderSettings,
  component: ProviderSettings,
};
