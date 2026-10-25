// قسم البحث في القاموس في «الإعدادات والخصوصية»: الاختصار الافتراضي المؤقت لأمر فتح القاموس وكيف يُعاد ربطه من إعدادات المتصفح.
// لا مفتاح تشغيل خاص: وحدة البحث تتبع مفتاح الوحدة (ب).
import { useEffect, useState } from 'preact/hooks';
import { extensionApi } from '../../../core/ui-host/browser-api';
import type { SettingsSection, SettingsSectionProps } from '../../../options/sections';
import { shortcutLabel } from '../../../core/ui-host/commands';
import { GLOSSARY_COMMAND, GLOSSARY_SHORTCUT, GLOSSARY_SHORTCUT_MAC } from './ids';

/** اختصار الأمر الفعلي كما عيّنه المتصفح (قد يكون أعاد المستخدم ربطه أو لم يُعيَّن)، أو undefined إن تعذّر القراءة. */
export function useCommandShortcut(name: string): string | null | undefined {
  const [shortcut, setShortcut] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    try {
      const commands = extensionApi().commands;
      if (!commands) return undefined;
      commands.getAll().then(
        (all) => alive && setShortcut(all.find((c) => c.name === name)?.shortcut || null),
        () => alive && setShortcut(undefined),
      );
    } catch {
      // خارج سياق إضافة.
    }
    return () => {
      alive = false;
    };
  }, [name]);
  return shortcut;
}

function SearchSection(_props: SettingsSectionProps) {
  const shortcut = useCommandShortcut(GLOSSARY_COMMAND);
  return (
    <>
      <p data-shortcut={shortcut ?? ''}>
        <strong>البحث في القاموس</strong>
        <span class="muted small"> — يفتح اللوحة على تبويب القاموس والتركيز في خانة البحث. </span>
        {shortcut === undefined ? (
          <span>
            الاختصار الافتراضي <kbd>{shortcutLabel(GLOSSARY_SHORTCUT, GLOSSARY_SHORTCUT_MAC)}</kbd>.
          </span>
        ) : shortcut ? (
          <span>
            الاختصار الحالي <kbd>{shortcut}</kbd>.
          </span>
        ) : (
          <span>لا اختصار معيَّن للأمر الآن؛ عيّنه من إعدادات المتصفح.</span>
        )}
      </p>
      <p class="muted small">
        يمكن إعادة ربط الاختصار من صفحة اختصارات الإضافات في المتصفح (في Chrome وEdge وBrave: <kbd>chrome://extensions/shortcuts</kbd> أو ما يقابلها، وفي Firefox:
        «إدارة اختصارات الإضافة» من إعدادات الإضافات). يعمل البحث محليًا بلا شبكة.
      </p>
    </>
  );
}

export const SEARCH_SECTION: SettingsSection = {
  id: 'b-search',
  unit: 'b',
  title: 'البحث في القاموس (الوحدة ب)',
  component: SearchSection,
};
