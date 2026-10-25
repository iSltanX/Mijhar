// بطاقة «مزوّد التحليل» الموحّدة في سجل الاتصالات (T-11.10، AC-E10 (٢) و(٣) و(٤) و(٦)، الإطارات O-23 وO-24 وO-25 وO-27؛ DEC-10 ح-4). تحل محل بطاقة
// «مفتاح مزوّد التحليل» وقسم «إعدادات التحليل» المنفصلين (MJ21): قائمة المزوّد بحالة مفتاح كلٍّ منهم، ومفتاح المختار وحالته وموضع حفظه وأزراره
// وصلاحية مضيفه، وحقل «النموذج» (ModelField.tsx، O-28)، وقواعد الموافقة والوجهة. لا صفحة ولا بطاقة لكل مزوّد؛ وتغيير المزوّد يعرض مفتاحه ومودلاته وحالته هو، ولا يمسح مفتاح
// غيره ولا يقرؤه. في صفحة الإعدادات وحدها: تمرّرها صفحة الإعدادات إلى سجل الاتصالات، فلا تصل شيفرتها سكربت المحتوى ولا اللوحة.
//  - القائمة من السجل الوصفي (لا تعرض إلا مزوّدًا دُمج محوّله)، والصيغة تُفحص محليًا من وصف المزوّد قبل أي طلب.
//  - الحقل غير متحكَّم به: المفتاح لا يدخل حالة المكوّن، ويُقرأ من الحقل عند الحفظ ثم يُفرَّغ، ولا يُعرض بعد الحفظ ولا جزء منه.
//  - الحفظ يكتب في مخزن المزوّد المختار وحده (مفتاحاه المستقلان)، والخلفية تقرؤه لطلباته؛ فلا يعبر المفتاح أي رسالة. وإضافة المفتاح لا تبدأ أي تحليل:
//    الطلب الوحيد بعدها طلب التحقق المعلن لذلك المزوّد (قائمة مودلاته، بلا محتوى).
//  - صلاحية مضيف المزوّد الاختيارية تُطلب في نقرة الحفظ نفسها قبل أي await (VER-05)، وإن رُفضت حُفظ المفتاح «غير متحقق منه» ولم يُرسل شيء. وفي Firefox
//    تُطلب معها في الطلب نفسه موافقة مشاركة محتوى المواقع (websiteContent، AD-15) الواحدة لكل المزوّدين؛ وسحب المضيف يخص مزوّده، وسحب الموافقة يخصهم كلهم.
//  - النموذج (DEC-13 ن-5): معرّف يكتبه المستخدم لكل مزوّد ويُرسل إليه التحليل كما هو، وزر + يعرض قائمة المزوّد للمساعدة فقط، و«اختبر النموذج» اختياري
//    حيث يدعمه المحوّل؛ والحقل الفارغ وحده يُبقي المزوّد بلا تحليل معلَّلًا (BLK-MODEL-COMPAT)، ولا يُخمَّن نموذج.
//  - لا سعر ولا تكلفة ولا حد إنفاق ولا رابط أسعار (AD-31).
import type { ComponentChild } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { dependentsOf } from '../../../core/connections/features';
import { HEALTH_LABEL, HEALTH_TONE } from '../../../core/connections/health';
import type { ConnectionStatus, HealthTone } from '../../../core/connections/health';
import { healthText, utcText } from '../../../core/connections/text';
import { HealthBadge } from '../../../core/connections/ui/HealthBadge';
import { CONNECTIONS_CSS } from '../../../core/connections/ui/styles';
import type { SecretInfo, SecretPlace, SecretStore } from '../../../core/connections/secrets';
import type { SettingsStore } from '../../../core/settings';
import type { PermissionsApi } from '../../../core/ui-host/browser-api';
import { Ltr } from '../../../shared/ui';
import { useSetting } from '../../../shared/ui/useSetting';
import { useStyles } from '../../../shared/ui/useStyles';
import { PROVIDER_DESCRIPTORS, checkKey } from './catalog';
import { ProviderHostPermission, isGranted } from './gate';
import type { HostPermissionState } from './gate';
import { MODEL_FIELD_CSS, ModelField } from './ModelField';
import type { FieldOutcome } from './ModelField';
import type { ProviderPort, ProviderStatus } from './port';
import { PROVIDER_ID_KEY, isWorkspaceChoice, modelSettingKey, workspaceSettingKey } from './settings';
import type { ProviderDescriptor } from './types';

export type ProviderKeyArea = Pick<SecretStore, 'info' | 'save' | 'clear' | 'sessionAvailable' | 'diskAvailable'>;

export interface ProviderCardProps {
  readonly settings: SettingsStore;
  readonly port: ProviderPort;
  /** مخزن مفتاح كل مزوّد (صفحة الإعدادات)؛ لا يُكتب مفتاح مزوّد في مخزن غيره. */
  readonly stores: (provider: string) => ProviderKeyArea;
  readonly permissions: PermissionsApi;
  readonly target: 'chromium' | 'firefox';
  /** حالة «مفتاح مزوّد التحليل» من سجل الاتصالات (للمزوّد المختار). */
  readonly status?: ConnectionStatus | null;
  readonly onChange?: () => void;
  readonly now?: () => number;
  /** السجل الوصفي (للاختبار بمزوّدين وهميين). */
  readonly descriptors?: readonly ProviderDescriptor[];
}

const CARD_CSS = `
.mj-root .provider-card { display: flex; flex-direction: column; gap: var(--mijhar-space-12); }
.mj-root .provider-card h3 { margin: 0; }
.mj-root .provider-card .field { display: flex; flex-direction: column; gap: var(--mijhar-space-4); }
.mj-root .provider-card select { width: 100%; max-width: 36rem; min-height: 32px; font: inherit; }
.mj-root .provider-key-card { display: flex; flex-direction: column; gap: var(--mijhar-space-8); padding: var(--mijhar-space-12); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6); }
.mj-root .provider-key-card h4 { margin: 0; font-size: 14px; }
.mj-root .key-form { display: flex; flex-direction: column; gap: var(--mijhar-space-8); }
.mj-root .key-form fieldset { border: 0; margin: 0; padding: 0; }
.mj-root .key-form legend { font-weight: 700; padding: 0; margin-bottom: var(--mijhar-space-4); }
.mj-root .key-input {
  width: 100%; max-width: 36rem; min-height: 32px; padding: 0 var(--mijhar-space-8); font-family: var(--mijhar-font-mono); font-size: 12px;
  color: var(--mijhar-text-primary); background: var(--mijhar-bg-surface); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6);
  direction: ltr; text-align: left;
}
.mj-root .key-input:focus-visible { outline: none; border-color: var(--mijhar-border-focus); box-shadow: var(--mijhar-focus-ring); }
.mj-root .choice input:disabled + .label { color: var(--mijhar-text-disabled); }
.mj-root .provider-card .ws-invalid { color: var(--mijhar-text-danger); }
`;

const PLACE_TEXT: Readonly<Record<SecretPlace, string>> = { session: 'ذاكرة الجلسة', disk: 'القرص في هذا المتصفح' };
const TONE_ATTR: Readonly<Record<HealthTone, string | undefined>> = { danger: 'danger', warning: 'warning', success: 'success', info: undefined, muted: undefined };

/**
 * رسالة البطاقة لمزوّدها وحده. وما يصف مفتاحًا بعينه (قُبل، لم يُتحقق منه، حُفظ، مُسح) يحمل هويته (savedAt، أو null لـ«لا مفتاح»)، فيختفي إن
 * استُبدل المفتاح أو مُسح من صفحة أخرى بعده (F-05)؛ وما لا يحمل هوية (فشل، صلاحية) يبقى حتى العملية التالية أو تغيير المزوّد.
 */
type Message = { readonly tone: 'danger' | 'warning' | 'info' | 'success'; readonly text: string; readonly provider: string; readonly key?: number | null };

/** حالة مفتاح مزوّد كما تذكرها قائمة المزوّد («المفتاح: سليم»). */
const keyLabel = (health: ProviderStatus['providers'][number]['health'] | undefined): string =>
  health === undefined || health === null ? 'غير معروف' : health === 'none' ? 'لم يُضف' : HEALTH_LABEL[health];

/**
 * AD-38: معرّف مساحة العمل الاختياري لمزوّد له ترويستها (Anthropic): يلزم المفتاح الشخصي أو مفتاح حساب الخدمة غير المقيّد بمساحة عمل. يكتبه المستخدم ولا
 * يُخمَّن، ويُفحص شكله محليًا (wrkspc_…)؛ والحكم عليه (موجود، يصله المفتاح) للمزوّد. ليس سرًّا فيُحفظ في الإعدادات. الحفظ عند المغادرة أو Enter (compat).
 */
function WorkspaceField({ descriptor, settings, onSaved }: { descriptor: ProviderDescriptor; settings: SettingsStore; onSaved: (value: string) => void }) {
  const key = workspaceSettingKey(descriptor.id);
  const stored = useSetting<string>(settings, key) ?? '';
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const next = draft.trim();
    if (next === stored) {
      setDraft(null);
      setError(null);
      return;
    }
    if (!isWorkspaceChoice(next)) {
      setError('لا يشبه معرّف مساحة عمل: يبدأ بـwrkspc_ ثم حروف وأرقام، كما في عمود ID في صفحة Workspaces. لم يُحفظ.');
      return;
    }
    settings.set(key, next).then(
      () => {
        setDraft(null);
        setError(null);
        onSaved(next);
      },
      (e: unknown) => setError(`لم يُحفظ: ${e instanceof Error ? e.message : 'خطأ غير معروف'}`),
    );
  };
  return (
    <div class="field" data-workspace-field="">
      <label for="mj-workspace-input">معرّف مساحة العمل (اختياري)</label>
      <input
        id="mj-workspace-input"
        type="text"
        dir="ltr"
        class="key-input"
        spellcheck={false}
        autocomplete="off"
        placeholder="wrkspc_…"
        value={draft ?? stored}
        aria-describedby="mj-workspace-help"
        aria-invalid={error ? 'true' : undefined}
        data-workspace-input=""
        onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          commit();
        }}
      />
      <p id="mj-workspace-help" class="muted small">
        يلزم المفتاح الشخصي أو مفتاح حساب الخدمة إن لم يكن مقيّدًا بمساحة عمل واحدة؛ تجده في عمود ID في صفحة Workspaces في Claude Console. يُرسل في ترويسة{' '}
        <Ltr className="mono">{descriptor.workspaceHeader ?? ''}</Ltr> مع كل طلب إلى <Ltr className="mono">{descriptor.host}</Ltr>، ولا يُخمَّن. اتركه فارغًا لمفتاح مقيّد بمساحة عمل.
      </p>
      {error && (
        <p class="small ws-invalid" role="alert" data-workspace-error="">
          {error}
        </p>
      )}
    </div>
  );
}

export function ProviderCard({ settings, port, stores, permissions, target, status, onChange, now = () => Date.now(), descriptors = PROVIDER_DESCRIPTORS }: ProviderCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  useStyles(ref, 'core-connections', CONNECTIONS_CSS);
  useStyles(ref, 'e-provider-card', CARD_CSS);
  useStyles(ref, 'e-provider-model-field', MODEL_FIELD_CSS);
  const chosen = useSetting<string>(settings, PROVIDER_ID_KEY);
  const descriptor = descriptors.find((d) => d.id === chosen) ?? descriptors[0];
  if (!descriptor) throw new Error('سجل المزوّدين فارغ');
  const id = descriptor.id;
  const store = useMemo(() => stores(id), [stores, id]);
  const permission = useMemo(() => new ProviderHostPermission(permissions, descriptor.origin, target === 'firefox' ? ['websiteContent'] : []), [permissions, descriptor.origin, target]);
  const modelKey = modelSettingKey(id);
  // useSetting يتبع التغيّر ويعيد الرسم؛ والقيمة تُقرأ من المخزن مباشرة فلا يُرسم إطار بحقل المزوّد السابق بعد التبديل.
  const subscribed = useSetting<string>(settings, modelKey);
  const choice = settings.get<string>(modelKey) ?? subscribed ?? '';

  const input = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<SecretInfo | null | undefined>(undefined);
  const [place, setPlace] = useState<SecretPlace>('session');
  const [busy, setBusy] = useState(false);
  const [granted, setGranted] = useState<HostPermissionState | null>(null);
  const [providerState, setProvider] = useState<ProviderStatus | null | undefined>(undefined);
  // حالة قُرئت لمزوّد آخر قبل التبديل لا تُعرض لهذا المزوّد (مفتاحه ونتيجة اختباره وقائمته له وحده).
  const provider = providerState && providerState.provider.id !== id ? undefined : providerState;
  const [message, setMessage] = useState<Message | null>(null);
  const [confirming, setConfirming] = useState(false);
  // قراءة بدأت لمزوّد سابق (عملية لم تنته قبل التبديل) أو سبقتها قراءة أحدث لا تكتب فوق المعروض الآن (F-05).
  const reads = useRef({ id, info: 0, status: 0 });
  reads.current.id = id;
  // هوية المفتاح المعروض: undefined قبل قراءته، وnull بلا مفتاح.
  const keyId = info === undefined ? undefined : (info?.savedAt ?? null);
  const say = (tone: Message['tone'], text: string, key?: number | null): Message => ({ tone, text, provider: id, key });
  const note = message && message.provider === id && (message.key === undefined || message.key === keyId) ? message : null;

  // عملية البطاقة (حفظ، تحقق، مسح، سحب) تخص المزوّد الذي بدأت له وجيلها: تغيير المزوّد يبدأ جيلًا جديدًا ويُفرج عن الأزرار، فلا تكتب العملية
  // السابقة حين تنتهي رسالتها ولا مفتاحها ولا تفرّغ الحقل في بطاقة مزوّد آخر، ولا يُنهي ختامها انشغال عملية أحدث (F-05). والطلب نفسه يمضي إلى
  // مزوّده، والخلفية تربط نتيجته بالمفتاح الذي أُرسل به.
  const ops = useRef(0);
  const begin = (fresh = true) => {
    const n = (ops.current += 1);
    setBusy(true);
    if (fresh) setMessage(null);
    return { live: () => ops.current === n && reads.current.id === id, end: () => ops.current === n && setBusy(false) };
  };

  const readPermission = useCallback(
    () =>
      permission.state().then(
        (value) => reads.current.id === id && setGranted(value),
        () => reads.current.id === id && setGranted({ host: false, content: permission.dataCollection.length ? false : null }),
      ),
    [permission, id],
  );
  const readStatus = useCallback((): Promise<void> => {
    if (reads.current.id !== id) return Promise.resolve();
    const n = (reads.current.status += 1);
    return port.status(id).then((value) => {
      if (reads.current.id === id && reads.current.status === n) setProvider(value);
    });
  }, [port, id]);
  const putInfo = useCallback((value: SecretInfo | null) => {
    reads.current.info += 1;
    setInfo(value);
  }, []);
  const readInfo = useCallback((): Promise<void> => {
    if (reads.current.id !== id) return Promise.resolve();
    const n = (reads.current.info += 1);
    const put = (value: SecretInfo | null) => {
      if (reads.current.id === id && reads.current.info === n) setInfo(value);
    };
    return store.info().then(put, () => put(null));
  }, [store, id]);

  // تغيير المزوّد: كل ما يُعرض يُقرأ من جديد لمزوّده هو، والحقل يُفرَّغ فلا يُحفظ مفتاح في مخزن غير الذي لُصق له.
  useEffect(() => {
    let alive = true;
    ops.current += 1;
    setBusy(false);
    setInfo(undefined);
    setGranted(null);
    setProvider(undefined);
    setMessage(null);
    setConfirming(false);
    if (input.current) input.current.value = '';
    void readInfo();
    void permission.state().then(
      (value) => alive && setGranted(value),
      () => alive && setGranted({ host: false, content: permission.dataCollection.length ? false : null }),
    );
    void readStatus();
    const unsubscribe = permission.subscribe(() => void readPermission());
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [store, permission, port, id, readPermission, readInfo, readStatus]);

  useEffect(() => {
    void readStatus();
  }, [choice, readStatus]);

  // المفتاح يُمسح أو يُستبدل من صفحة إعدادات أخرى، ولا حدث تغيّر للأسرار: يُقرأ هو وحالته من جديد حين تصل حالة السجل الأحدث من الأب،
  // وحين تعود هذه الصفحة إلى الواجهة؛ فلا تبقى حالة مفتاح ممسوح ولا نتيجة اختبار مفتاح سابق (F-05).
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    void readInfo();
    void readStatus();
  }, [status]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void readInfo();
      void readStatus();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [readInfo, readStatus]);

  // تأكيد المسح كان لمفتاح بعينه: يُغلق إن مُسح أو استُبدل من صفحة أخرى.
  useEffect(() => setConfirming(false), [keyId]);

  /** طلب التحقق المعلن للمفتاح key؛ ونتيجته تُعرض له وحده، ثم يُقرأ المفتاح وحالته من جديد فتختفي إن استُبدل في أثناء الطلب. */
  const verify = async (key: number | null, live: () => boolean): Promise<void> => {
    const result = await port.verify(id);
    await Promise.all([readStatus(), readInfo()]);
    if (!live()) return;
    if (result.ok) {
      setMessage(
        say(
          'success',
          `قبِل ${descriptor.title} المفتاح وقُرئت قائمة نماذجه (${result.data.models.length})؛ تعرضها بزر + بجانب حقل النموذج للمساعدة. لم يبدأ أي تحليل ولم يُرسل شيء من صفحاتك.`,
          key,
        ),
      );
    } else if (result.failure === 'workspace') {
      // AD-38: المفتاح لم يُرفض؛ يلزمه معرّف مساحة عمل (أو المعرّف المكتوب غير صالح أو لا يصله المفتاح).
      setMessage(say('warning', `لم يُتحقق من المفتاح بعد: يلزمه معرّف مساحة عمل صالح يصله، فأدخله في «معرّف مساحة العمل» ثم «تحقق من المفتاح». ردّ ${descriptor.title}: ${result.message}`, key));
    } else setMessage(say('danger', `لم يُتحقق من المفتاح: ${result.message}`, key));
    onChange?.();
  };

  const content = permission.dataCollection.length > 0;
  const grantName = content ? `صلاحية ${descriptor.host} وموافقة مشاركة محتوى المواقع` : `صلاحية ${descriptor.host}`;

  /** المضيف (ومعه الموافقة) يُطلب في النقرة نفسها قبل أي await؛ ويُعاد true حين يكون ممنوحًا أصلًا. */
  const askPermission = (): Promise<boolean> => (granted && isGranted(granted) ? Promise.resolve(true) : permission.request().catch(() => false));

  const save = (event: Event) => {
    event.preventDefault();
    const field = input.current;
    if (!field || busy) return;
    const parsed = checkKey(descriptor, field.value);
    if (!parsed.ok) {
      setMessage(say('danger', parsed.reason));
      return;
    }
    const asked = askPermission();
    const op = begin();
    asked
      .then(async (ok) => {
        await readPermission();
        const saved = await store.save(parsed.key, place);
        if (!op.live()) return;
        field.value = '';
        putInfo(saved);
        if (!ok) {
          setMessage(say('info', `حُفظ مفتاح ${descriptor.title} في ${PLACE_TEXT[saved.place]} ولم يُتحقق منه: لم تُمنح ${grantName}، فلم يُرسل شيء.`, saved.savedAt));
          await readStatus();
          onChange?.();
          return;
        }
        await verify(saved.savedAt, op.live);
      })
      .catch((error: unknown) => op.live() && setMessage(say('danger', `لم يُحفظ المفتاح: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`)))
      .finally(op.end);
  };

  /** التحقق (قائمة النماذج) لا يحمل محتوى من الصفحات: صلاحية المضيف وحدها، بلا موافقة محتوى المواقع (BLK-AUD-02، privacy.md#sent). */
  const recheck = () => {
    const asked = granted?.host ? Promise.resolve(true) : permission.requestHost().catch(() => false);
    const key = keyId ?? null;
    const op = begin();
    asked
      .then(async (ok) => {
        await readPermission();
        if (!op.live()) return;
        if (!ok) {
          setMessage(say('info', `لم تُمنح صلاحية ${descriptor.host}؛ لم يُرسل شيء.`));
          return;
        }
        await verify(key, op.live);
      })
      .catch(() => op.live() && setMessage(say('danger', 'تعذّر الوصول إلى خلفية الإضافة')))
      .finally(op.end);
  };

  const clear = () => {
    setConfirming(false);
    const op = begin();
    if (input.current) input.current.value = '';
    store
      .clear()
      .then(() => {
        if (!op.live()) return;
        putInfo(null);
        setMessage(say('info', `مُسح مفتاح ${descriptor.title} من ذاكرة الجلسة ومن القرص. وتبقى مفاتيح المزوّدين الآخرين والأقسام و«نسخ البرومبت» ورمز GitHub كما هي.`, null));
      })
      .catch((error: unknown) => op.live() && setMessage(say('danger', `تعذّر مسح المفتاح كاملًا: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`)))
      .finally(() => {
        op.end();
        void readStatus();
        onChange?.();
      });
  };

  const revoke = (what: 'host' | 'content') => {
    const op = begin(false);
    (what === 'host' ? permission.revoke() : permission.revokeContent())
      .then(
        () => readPermission(),
        () => op.live() && setMessage(say('danger', 'تعذّر سحب الصلاحية')),
      )
      .finally(() => {
        op.end();
        void readStatus();
      });
  };

  /**
   * يطلب صلاحية المضيف وحدها في النقرة نفسها قبل أي await (VER-05)، ثم يرسل الطلب المعلن؛ ورفضها لا يرسل شيئًا. لا تُطلب موافقة محتوى المواقع (Firefox)
   * لطلب لا يحمل محتوى؛ والتحليل يبقى مشروطًا بها.
   */
  const withPermission = (send: () => Promise<FieldOutcome>): Promise<FieldOutcome> =>
    (granted?.host ? Promise.resolve(true) : permission.requestHost().catch(() => false)).then(
      async (ok) => {
        await readPermission();
        if (!ok) return { ok: false, message: `لم تُمنح صلاحية ${descriptor.host}، فلم يُرسل شيء` };
        const outcome = await send();
        await readStatus();
        onChange?.();
        return outcome;
      },
      () => ({ ok: false, message: 'تعذّر طلب الصلاحية' }),
    );

  /** زر + و«حدّث القائمة» و«أعد المحاولة»: طلب التحقق المعلن نفسه (قائمة النماذج) بلا اقتراح في الحقل. */
  const fetchList = (): Promise<FieldOutcome> => withPermission(async () => {
    const result = await port.verify(id, { suggest: false });
    return result.ok ? { ok: true } : { ok: false, message: result.message };
  });

  /** «اختبر النموذج» للنموذج المكتوب؛ والنتيجة (قبول أو رفض أو لم يُحسم) تصل مع حالة المزوّد مقرونة بالنموذج والمفتاح. */
  const runTest = (model: string): Promise<FieldOutcome> => withPermission(async () => {
    const result = await port.probe(id, model);
    return result.ok ? { ok: true } : { ok: false, message: result.message };
  });

  const pick = (value: string) => {
    setMessage(null);
    settings.set(modelKey, value).catch((e: unknown) => setMessage(say('danger', `تعذّر الحفظ: ${e instanceof Error ? e.message : String(e)}`)));
  };

  const switchTo = (value: string) => {
    settings.set(PROVIDER_ID_KEY, value).then(
      () => onChange?.(),
      (e: unknown) => setMessage(say('danger', `تعذّر الحفظ: ${e instanceof Error ? e.message : String(e)}`)),
    );
  };

  const diskNote = store.diskAvailable
    ? 'يبقى بعد إغلاق المتصفح. يُحفظ على قرص هذا الجهاز غير مشفَّر، ويستطيع قراءته من يصل إلى ملف تعريف المتصفح؛ لا تختره على جهاز مشترك.'
    : target === 'firefox'
      ? 'غير متاح في Firefox: لا يتيح ضبط مستوى وصول التخزين للسياقات الموثوقة (setAccessLevel)، فيبقى المفتاح في ذاكرة الجلسة وحدها.'
      : 'غير متاح في هذا المتصفح.';
  const stateLabel = info === undefined ? 'جارٍ القراءة…' : info ? `محفوظ في ${PLACE_TEXT[info.place]} منذ ${utcText(info.savedAt)}` : `لا مفتاح محفوظ لـ${descriptor.title}`;
  // حالة المفتاح لهذا المزوّد من الخلفية؛ وحالة السجل العامة (المختار) احتياطًا حتى تُقرأ.
  const key = provider?.key ?? (status?.provider === id ? status : null);
  const shown = key && key.health !== 'none' ? key : null;
  const badge = info === undefined || provider === undefined ? 'checking' : (key?.health ?? (info ? 'unverified' : 'none'));
  const dependents = dependentsOf('provider-key');
  const permissionState = granted === null ? 'checking' : isGranted(granted) ? 'granted' : 'denied';
  const blocked = provider !== undefined && !choice;
  const health = new Map((provider?.providers ?? []).map((p) => [p.id, p.health]));
  const others = (provider?.providers ?? []).filter((p) => p.id !== id);

  const permissionText = (): ComponentChild => {
    if (granted === null) return 'جارٍ التحقق…';
    if (!content) return granted.host ? 'ممنوحة' : 'غير ممنوحة';
    if (granted.host === Boolean(granted.content)) return granted.host ? 'ممنوحتان' : 'غير ممنوحتين';
    return granted.host ? 'المضيف ممنوح، وموافقة محتوى المواقع غير ممنوحة' : 'المضيف غير ممنوح، وموافقة محتوى المواقع ممنوحة';
  };

  return (
    <div ref={ref} class="section provider-card" data-section="provider-key" data-provider-card={id}>
      <div class="conn-head">
        <h3 id="mj-conn-provider-key-title">مزوّد التحليل</h3>
      </div>
      <p class="muted">اختياري. لكل مزوّد مفتاحه وإعداداته المستقلة: تغيير المزوّد يعرض مفتاحه ومودلاته وحالته، ولا يمسح مفتاح غيره ولا يرسله إليه.</p>
      <p class="row">
        <a href="#guide/provider-key" data-action="provider-key-guide">
          لماذا المفتاح؟
        </a>
        <span class="muted small">ما يضيفه، وأين يظهر، وما يُرسل ولمن، وما يبقى دونه.</span>
      </p>

      <div class="field">
        <label class="label" for="mj-provider-select">
          <strong>المزوّد</strong>
        </label>
        <select id="mj-provider-select" data-setting={PROVIDER_ID_KEY} data-provider-select="" value={id} disabled={busy} onChange={(event) => switchTo((event.currentTarget as HTMLSelectElement).value)}>
          {descriptors.map((d) => (
            <option key={d.id} value={d.id} data-key-health={health.get(d.id) ?? undefined}>
              {provider ? `${d.title} — المفتاح: ${keyLabel(health.get(d.id))}` : d.title}
            </option>
          ))}
        </select>
        <span class="muted small">
          لكل مزوّد مفتاحه وصلاحية مضيفه{content ? '، وموافقة «مشاركة محتوى المواقع» في Firefox واحدة لكل المزوّدين' : ''}.
        </span>
      </div>

      <div class="provider-key-card" data-provider-key={id} data-health={badge}>
        <div class="conn-head">
          <h4>مفتاح {descriptor.title}</h4>
          <HealthBadge state={badge} />
        </div>
        <p class="muted small" data-provider-meta="">
          {descriptor.title} · يُرسل إلى <Ltr className="mono">{descriptor.host}</Ltr> وحده · سياسته في البيانات:{' '}
          <a href={descriptor.policy.url} target="_blank" rel="noopener noreferrer" data-provider-policy="">
            {descriptor.policy.label}
          </a>
          {descriptor.policy.also && (
            <>
              {' و'}
              <a href={descriptor.policy.also.url} target="_blank" rel="noopener noreferrer" data-provider-policy="">
                {descriptor.policy.also.label}
              </a>
            </>
          )}
        </p>
        <p>
          <span class="status" data-state={info ? 'granted' : info === null ? 'denied' : 'pending'} data-key-state={info ? info.place : info === null ? 'none' : 'checking'} role="status">
            {stateLabel}
          </span>{' '}
          <span class="status" data-state={permissionState === 'checking' ? 'pending' : permissionState} data-provider-permission={permissionState}>
            صلاحية <Ltr className="mono">{descriptor.host}</Ltr>
            {content && ' وموافقة مشاركة محتوى المواقع'}: {permissionText()}
          </span>
        </p>
        <p class="notice" data-verify-request="">
          عند الحفظ والتحقق يُرسَل إلى {descriptor.title} {descriptor.verifyRequest} وإضافة المفتاح لا تبدأ أي تحليل: لا يُرسل شيء من صفحاتك إلا بعد موافقتك على كل طلب في
          قسمه.
        </p>
        {content && (
          <p class="notice" data-content-consent="">
            في Firefox تُطلب في نقرة الحفظ نفسها، مع صلاحية <Ltr className="mono">{descriptor.host}</Ltr>، موافقة «مشاركة محتوى المواقع» (
            <Ltr className="mono">websiteContent</Ltr>) الاختيارية، وهي واحدة لكل المزوّدين؛ فلا يُرسل تحليل دونها. تسمّيها نافذة Firefox «جمع: محتوى الموقع» وتنسبها
            إلى «المطوِّر»، وتسمّيها إدارة الإضافات «شارك محتوى الموقع الإلكتروني مع مطوِّر الامتداد»؛ ومِجهَر لا يرسل شيئًا إلى مطوّره: يُرسل المحتوى المنقّح، بعد
            موافقتك على كل طلب، إلى المزوّد الذي تختاره وحده. وسحب صلاحية المضيف يوقف التحليل عند هذا المزوّد وحده، وسحب الموافقة يوقفه عند كل المزوّدين.
          </p>
        )}

        <form class="key-form" onSubmit={save} data-key-form="">
          <fieldset>
            <legend>أين يُحفظ</legend>
            <label class="choice">
              <input type="radio" name="mj-key-place" value="session" checked={place === 'session'} disabled={!store.sessionAvailable} onChange={() => setPlace('session')} />
              <span class="label">
                <strong>ذاكرة الجلسة (الافتراضي)</strong>
                <br />
                <span class="muted small">يُمحى عند إغلاق المتصفح، ولا يُكتب على القرص.</span>
              </span>
            </label>
            <label class="choice">
              <input type="radio" name="mj-key-place" value="disk" checked={place === 'disk'} disabled={!store.diskAvailable} onChange={() => setPlace('disk')} />
              <span class="label">
                <strong>القرص في هذا المتصفح</strong>
                <br />
                <span class="muted small" data-disk-note={store.diskAvailable ? 'available' : 'blocked'}>
                  {diskNote}
                </span>
              </span>
            </label>
          </fieldset>
          <label for="mj-key-input">
            المفتاح ({descriptor.keyName}، يبدأ بـ<Ltr className="mono">{descriptor.keyPrefix}</Ltr>)
          </label>
          <input ref={input} id="mj-key-input" class="key-input" type="password" autocomplete="off" spellcheck={false} dir="ltr" />
          <div class="row">
            <button type="submit" class="btn btn-primary" data-action="key-save" disabled={busy || !store.sessionAvailable}>
              احفظ وتحقق
            </button>
            <button type="button" class="btn" data-action="key-check" disabled={busy || !info} onClick={recheck}>
              تحقق من المفتاح
            </button>
            <button type="button" class="btn btn-danger" data-action="key-clear" disabled={busy || !info} aria-expanded={confirming} onClick={() => setConfirming(true)}>
              امسح المفتاح
            </button>
            {granted?.host && (
              <button type="button" class="btn" data-action="key-revoke" disabled={busy} onClick={() => revoke('host')}>
                اسحب صلاحية {descriptor.host}
              </button>
            )}
            {content && granted?.content && (
              <button type="button" class="btn" data-action="content-revoke" disabled={busy} onClick={() => revoke('content')}>
                اسحب موافقة محتوى المواقع (لكل المزوّدين)
              </button>
            )}
          </div>
        </form>

        {confirming && (
          <div class="conn-confirm" role="alertdialog" aria-labelledby="mj-key-confirm-title" data-key-confirm="">
            <strong id="mj-key-confirm-title">امسح مفتاح {descriptor.title}؟</strong>
            <span>يُمسح من ذاكرة الجلسة ومن القرص فورًا ولا يُستعاد؛ تلصقه من جديد إن احتجته.</span>
            <span>يتعطل وحده، ما دام {descriptor.title} المزوّد المختار:</span>
            <ul data-disables="">
              {dependents.map((f) => (
                <li key={f.id}>{f.title}</li>
              ))}
            </ul>
            <span data-keeps="">يبقى كما هو: مفاتيح المزوّدين الآخرين، وكل الأقسام وأدلتها، و«نسخ البرومبت»، ورمز GitHub.</span>
            <div class="row">
              <button type="button" class="btn btn-danger" data-action="key-clear-confirm" disabled={busy} onClick={clear}>
                امسح المفتاح
              </button>
              <button type="button" class="btn" data-action="key-clear-cancel" onClick={() => setConfirming(false)}>
                إلغاء
              </button>
            </div>
          </div>
        )}

        {note && (
          <p class="notice" data-tone={note.tone === 'info' ? undefined : note.tone} role="alert" data-key-message="">
            {note.text}
          </p>
        )}
        {shown && (
          <p class="notice" data-tone={TONE_ATTR[HEALTH_TONE[shown.health]]} role="status" data-key-check={shown.health === 'healthy' ? 'ok' : 'fail'} data-health={shown.health}>
            {healthText('provider-key', shown, { now: now(), service: descriptor.title })}
          </p>
        )}
      </div>

      {descriptor.workspaceHeader && (
        <WorkspaceField
          key={`ws-${id}`}
          descriptor={descriptor}
          settings={settings}
          onSaved={(value) =>
            setMessage(
              say('info', value ? `حُفظ معرّف مساحة العمل؛ يُرسل في ترويسة ${descriptor.workspaceHeader} مع كل طلب إلى ${descriptor.host}. اضغط «تحقق من المفتاح» ليُتحقق به.` : 'مُسح معرّف مساحة العمل؛ لا ترويسة بعد الآن.'),
            )
          }
        />
      )}

      <ModelField
        key={id}
        descriptor={descriptor}
        settingKey={modelKey}
        value={choice}
        onCommit={pick}
        hasKey={Boolean(info)}
        keyId={keyId}
        list={provider?.models ?? null}
        test={provider?.test ?? null}
        busy={busy}
        fetchList={fetchList}
        runTest={runTest}
      />
      {blocked && (
        <p class="notice" data-tone="warning" data-model-blocked="">
          حقل النموذج فارغ: لا تحليل عند {descriptor.title} حتى تكتب معرّف نموذج أو تختاره بزر +؛ ولا يُخمَّن نموذج.
        </p>
      )}

      <dl class="conn-meta provider-rules" data-provider-rules="">
        <dt>الموافقة</dt>
        <dd>قبل كل تحليل، دائمًا، بزر «إرسال للتحليل» في القسم نفسه. لا خيار لإيقافها.</dd>
        <dt>ما يُرسل</dt>
        <dd>ما تراه في الموافقة بعد التنقيح. لا يُرفق رمز GitHub ولا مفتاح أي مزوّد آخر، ويُنقَّح المحتوى لاكتشاف الأسرار قبل الإرسال؛ راجع ما سيُرسل للتأكد.</dd>
        <dt>الوجهة</dt>
        <dd data-provider-destination="">
          <Ltr className="mono">{descriptor.host}</Ltr> وحده، من خلفية الإضافة بلا وسيط. ولا يُحوَّل طلب إلى مزوّد آخر عند الفشل، ولا يُعاد تلقائيًا.
        </dd>
      </dl>
      {others.length > 0 && (
        <p class="notice" data-other-providers="">
          {others.length === 1 ? 'المزوّد الآخر في القائمة: ' : 'المزوّدون الآخرون في القائمة: '}
          {others.map((p, i) => (
            <span key={p.id} data-other-provider={p.id}>
              {i > 0 ? ' · ' : ''}
              {p.title} — {p.health === null ? 'غير معروف' : p.health === 'none' ? 'لا مفتاح' : `مفتاح ${HEALTH_LABEL[p.health]}`}
            </span>
          ))}
          . لكل مفتاح موضعا تخزين مستقلان، وحذفه أو سحب صلاحية مضيفه يخص مزوّده وحده.
        </p>
      )}
    </div>
  );
}
