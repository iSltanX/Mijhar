// قسم إعدادات «أكمل لاحقًا» وخصوصية مرساة الأسطر في الوحدة (ز): مفتاح زر الصفحة، وبيان ما يُحفظ من السطر بحسب DEC-05 (ز-1).
// بلا preact/compat (الخلفية تحمل ما يستورده القسم، انظر قسم الملاحظات).
import { useState } from 'preact/hooks';
import type { SettingsSection, SettingsSectionProps } from '../../../options/sections';
import { useSetting } from '../../../shared/ui/useSetting';
import { ANCHOR_PRIVACY_POINTS } from '../anchor/privacy';
import { BOOKMARKS_PAGE_BUTTON_KEY, defineBookmarksSettings } from './settings';

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function LaterSettings({ settings, unitEnabled }: SettingsSectionProps) {
  const enabled = useSetting<boolean>(settings, BOOKMARKS_PAGE_BUTTON_KEY);
  const [error, setError] = useState<string | null>(null);
  const id = 'mj-bookmarks-pageButton';
  return (
    <>
      {!unitEnabled && <p class="muted">الوحدة (ز) موقوفة؛ تُطبَّق هذه الإعدادات حين تشغّلها.</p>}
      {error && (
        <p class="notice" data-tone="danger" role="alert">
          {error}
        </p>
      )}
      <div class="toggle-row" data-setting={BOOKMARKS_PAGE_BUTTON_KEY}>
        <label class="label" for={id}>
          <strong>زر «أكمل لاحقًا» في الصفحات</strong>
          <span class="muted small">شريط مدمج أعلى صفحات المستودع يحفظ الصفحة وموضعك فيها بنقرة، ويعرض حالتها إن كانت محفوظة.</span>
        </label>
        <span class="toggle-switch">
          <input
            id={id}
            type="checkbox"
            role="switch"
            checked={enabled}
            aria-checked={enabled}
            aria-label="زر «أكمل لاحقًا» في الصفحات"
            onChange={(event) => {
              setError(null);
              settings.set(BOOKMARKS_PAGE_BUTTON_KEY, event.currentTarget.checked).catch((e: unknown) => setError(`تعذّر الحفظ: ${describeError(e)}`));
            }}
          />
          <span class="toggle-slider" aria-hidden="true" />
        </span>
      </div>
      <div data-anchor-privacy="">
        <p>
          <strong>ما يُحفظ من السطر في ملاحظات الأسطر</strong>
        </p>
        <ul class="small">
          {ANCHOR_PRIVACY_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

export const LATER_SETTINGS_SECTION: SettingsSection = { id: 'g-later', unit: 'g', title: 'أكمل لاحقًا وخصوصية الأسطر', define: defineBookmarksSettings, component: LaterSettings };
