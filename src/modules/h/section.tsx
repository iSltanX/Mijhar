// قسم إعدادات الوحدة (ح): مفتاحان لما يظهر في صفحات GitHub. بلا preact/compat (الخلفية تحمل ما يستورده القسم، انظر قسم الوحدة ز).
import { useState } from 'preact/hooks';
import type { SettingsStore } from '../../core/settings';
import type { SettingsSection, SettingsSectionProps } from '../../options/sections';
import { useSetting } from '../../shared/ui/useSetting';
import { SETTINGS_NO_INFERENCE } from './discovery/notices';
import { COMMUNITY_PROFILE_CARD_KEY, COMMUNITY_README_BANNER_KEY, defineCommunitySettings } from './settings';

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const ROWS: ReadonlyArray<{ key: string; title: string; note: string }> = [
  { key: COMMUNITY_README_BANNER_KEY, title: 'شريط README العربي', note: 'في صفحة المستودع: رابط README العربي إن وُجد، وإلا بيان نطاق الفحص دون جزم بالغياب.' },
  { key: COMMUNITY_PROFILE_CARD_KEY, title: 'بطاقة الملف الشخصي', note: 'في صفحة الحساب: «محتوى عربي» (وصف المشاريع المثبتة) منفصلًا عن «بيانات يعلنها صاحب الحساب» التي تُعرض حرفيًا.' },
];

function Row({ settings, row, onError }: { settings: SettingsStore; row: (typeof ROWS)[number]; onError: (message: string | null) => void }) {
  const enabled = useSetting<boolean>(settings, row.key);
  const id = `mj-${row.key.replace(/\./g, '-')}`;
  return (
    <div class="toggle-row" data-setting={row.key}>
      <label class="label" for={id}>
        <strong>{row.title}</strong>
        <span class="muted small">{row.note}</span>
      </label>
      <span class="toggle-switch">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={enabled}
          aria-checked={enabled}
          aria-label={row.title}
          onChange={(event) => {
            onError(null);
            settings.set(row.key, event.currentTarget.checked).catch((error: unknown) => onError(`تعذّر الحفظ: ${describeError(error)}`));
          }}
        />
        <span class="toggle-slider" aria-hidden="true" />
      </span>
    </div>
  );
}

function CommunitySettings({ settings, unitEnabled }: SettingsSectionProps) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {!unitEnabled && <p class="muted">الوحدة (ح) موقوفة؛ تُطبَّق هذه الإعدادات حين تشغّلها.</p>}
      <p class="muted">
        {SETTINGS_NO_INFERENCE} وفحص مجلد docs/ وأعداد وسوم المبتدئين وروابط الموارد لا تصدر إلا بنقر منك وبصلاحية GitHub API الاختيارية.
      </p>
      {error && (
        <p class="notice" data-tone="danger" role="alert">
          {error}
        </p>
      )}
      <div>
        {ROWS.map((row) => (
          <Row key={row.key} settings={settings} row={row} onError={setError} />
        ))}
      </div>
    </>
  );
}

export const COMMUNITY_SETTINGS_SECTION: SettingsSection = { id: 'h-community', unit: 'h', title: 'المجتمع وأول مساهمة', define: defineCommunitySettings, component: CommunitySettings };
