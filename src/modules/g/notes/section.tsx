// قسم إعدادات الوحدة (ز) في «الإعدادات والخصوصية»: مفتاحان لما يظهر في صفحات GitHub. الملاحظات نفسها وتحريرها في اللوحة.
// مفتاح التشغيل بأصناف .toggle-switch المشتركة دون preact/compat: الخلفية تستورد SETTINGS_SECTIONS لتعريف الإعدادات فتحمل ما يستورده القسم.
import { useState } from 'preact/hooks';
import type { SettingsStore } from '../../../core/settings';
import type { SettingsSection, SettingsSectionProps } from '../../../options/sections';
import { useSetting } from '../../../shared/ui/useSetting';
import { NOTES_LINE_MARKERS_KEY, NOTES_PAGE_CARD_KEY, defineNotesSettings } from './settings';

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

interface Row {
  readonly key: string;
  readonly title: string;
  readonly note: string;
}

const ROWS: readonly Row[] = [
  { key: NOTES_PAGE_CARD_KEY, title: 'بطاقة «ملاحظاتي» في الصفحات', note: 'شريط هادئ مطوي في أعلى صفحات المستودع وطلبات الدمج والمشكلات والالتزامات والملفات.' },
  { key: NOTES_LINE_MARKERS_KEY, title: 'علامات الأسطر', note: 'علامة صغيرة بجوار رقم كل سطر عليه ملاحظة لك في صفحة الملف أو الفروق.' },
];

function SettingRow({ settings, row, onError }: { settings: SettingsStore; row: Row; onError: (message: string | null) => void }) {
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

function NotesSettings({ settings, unitEnabled }: SettingsSectionProps) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {!unitEnabled && <p class="muted">الوحدة (ز) موقوفة؛ تُطبَّق هذه الإعدادات حين تشغّلها.</p>}
      <p class="muted">تُحفظ ملاحظاتك محليًا في هذا المتصفح، وتُحرَّر من تبويب «ملاحظاتي» في اللوحة.</p>
      {error && (
        <p class="notice" data-tone="danger" role="alert">
          {error}
        </p>
      )}
      <div>
        {ROWS.map((row) => (
          <SettingRow key={row.key} settings={settings} row={row} onError={setError} />
        ))}
      </div>
    </>
  );
}

export const NOTES_SETTINGS_SECTION: SettingsSection = { id: 'g-notes', unit: 'g', title: 'الملاحظات الخاصة', define: defineNotesSettings, component: NotesSettings };
