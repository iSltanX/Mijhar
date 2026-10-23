// غلاف اختبار لزر وضع الشرح: يحقن الجسر المباشر (الدرج) أو جسر الرسائل (اللوحة الأصلية) بدل اختيار السياق التلقائي.
import type { ExtensionApi, SettingsStore } from '../../../../src/core';
import { ExplainMode, ExplainToggleView, EXPLAIN_MESSAGE, directBridge, messageBridge } from '../../../../src/modules/b/card';

export { EXPLAIN_MESSAGE, ExplainMode };

export function ExplainToggleViewForTest({ settings, mode, api }: { settings: SettingsStore; mode?: ExplainMode; api?: ExtensionApi }) {
  const bridge = api ? messageBridge(api) : directBridge(mode ?? new ExplainMode());
  return <ExplainToggleView settings={settings} surface="drawer" bridge={bridge} />;
}
