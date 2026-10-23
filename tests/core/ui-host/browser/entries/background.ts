// خلفية الإضافة الاختبارية: الخلفية الحقيقية (startBackground) مع خطافات اختبار عبر الرسائل:
//  - test:fetch-api: طلب عبر fetchApiGithub (البوابة الوحيدة إلى api.github.com) ليُقاس أنه لا يخرج قبل المنح.
//  - test:command: معالج الأمر نفسه دون فعل مستخدم (الأمر الحقيقي يحتاج ضغطة مفاتيح فعلية).
//  - test:outcomes: نتائج كل أمر (الأصلية أو الدرج أو تعذّر).
import { startBackground } from '../../../../../src/background/main';
import { extensionApi, fetchApiGithub, openPanel, readSurfaceMirror } from '../../../../../src/core';
import type { PanelOutcome, TabLike } from '../../../../../src/core';

const outcomes: Array<{ outcome: PanelOutcome; detail?: string; at: number }> = [];
const record = (outcome: PanelOutcome, detail?: string): void => void outcomes.push({ outcome, ...(detail ? { detail } : {}), at: Date.now() });
startBackground({ onOutcome: record });

const api = extensionApi();
// يُستدعى من المشغّل داخل الخلفية مباشرة (بلا رسالة من صفحة فيها فعل مستخدم): مسار «بلا فعل مستخدم».
(globalThis as { __mjTest?: unknown }).__mjTest = {
  command: (tab: TabLike) => openPanel({ api, target: __TARGET__, surface: () => readSurfaceMirror(), onOutcome: record }, tab),
  outcomes: () => outcomes.slice(),
};
api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const m = message as { type?: string; path?: string; tab?: TabLike };
  if (m?.type === 'test:fetch-api') {
    fetchApiGithub(m.path ?? '/zen', undefined, { permissions: api.permissions! }).then(
      async (response) => sendResponse({ sent: true, status: response.status, body: await response.text() }),
      (error: Error) => sendResponse({ sent: false, error: `${error.name}: ${error.message}` }),
    );
    return true;
  }
  if (m?.type === 'test:command') {
    openPanel({ api, target: __TARGET__, surface: () => readSurfaceMirror(), onOutcome: record }, m.tab);
    sendResponse(true);
    return undefined;
  }
  if (m?.type === 'test:outcomes') {
    sendResponse(outcomes.slice());
    return undefined;
  }
  return undefined;
});
