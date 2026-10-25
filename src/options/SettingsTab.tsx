// تبويب «الإعدادات والخصوصية»: يظهر في صفحة الإعدادات وفي اللوحة الجانبية الأصلية وفي الدرج.
// صفحات الإضافة (options وnative) تملك تدفق صلاحية api.github.com والاختصار؛ والدرج المحقون في صفحة GitHub لا
// يستطيع طلب صلاحية ولا يعرض حقل سرّ، فيعرض المفاتيح وزرًّا يفتح صفحة الإعدادات.
// وأقسام الأسرار (رمز الوصول، T-5.5) تمرّرها صفحة الإعدادات وحدها في secretSections، فلا تصل شيفرتها إلى الدرج ولا اللوحة.
import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { SettingsStore } from '../core/settings';
import { moduleEnabledKey } from '../core/settings';
import type { CommandInfo } from '../core/ui-host/browser-api';
import { PANEL_COMMAND } from '../core/ui-host/commands';
import type { OptionsTarget } from '../core/ui-host/commands';
import type { ApiGithubPermission } from '../core/ui-host/permissions';
import { SURFACE_KEY, UNITS, WELCOME_KEY } from '../core/ui-host/units';
import type { Surface, UnitInfo } from '../core/ui-host/units';
import { Ltr, Toggle } from '../shared/ui';
import { Icon } from '../shared/ui/icons';
import { useSetting } from '../shared/ui/useSetting';
import { sectionsFor } from './sections';
import type { SettingsSection, SettingsSurface } from './sections';

export interface ShortcutsCapability {
  getAll(): Promise<CommandInfo[]>;
  /** يفتح صفحة الاختصارات في المتصفح. */
  openSettings(): void;
}

export interface SettingsTabProps {
  readonly settings: SettingsStore;
  readonly surface: SettingsSurface;
  /** صفحات الإضافة وحدها. */
  readonly permission?: ApiGithubPermission;
  readonly shortcuts?: ShortcutsCapability;
  /** الدرج: يفتح صفحة الإعدادات. */
  readonly openOptions?: () => void;
  readonly sections?: readonly SettingsSection[];
  /** مستوى عناوين الأقسام: 2 في صفحة الإعدادات (تحت عنوانها)، و3 في اللوحة (تحت عنوان التبويب). */
  readonly level?: 2 | 3;
  /** أقسام فيها حقل سرّ: صفحة الإعدادات وحدها تمرّرها (MJ15، T-5.5). */
  readonly secretSections?: ComponentChildren;
  /** يفتح صفحة الإعدادات على موضع (قسم الرمز أو دليله، AD-29): تبويب جديد من اللوحة والدرج، وتغيير العنوان في صفحة الإعدادات. */
  readonly openOptionsAt?: (target: OptionsTarget) => void;
}

const LevelContext = createContext<2 | 3>(2);

function Heading({ id, children }: { id?: string; children: ComponentChildren }) {
  const level = useContext(LevelContext);
  return level === 2 ? <h2 id={id}>{children}</h2> : <h3 id={id}>{children}</h3>;
}

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function UnitToggle({ settings, unit, onError }: { settings: SettingsStore; unit: UnitInfo; onError: (message: string | null) => void }) {
  const key = moduleEnabledKey(unit.id);
  const enabled = useSetting<boolean>(settings, key);
  const [, force] = useState(0);
  const id = `mj-unit-${unit.id}`;
  return (
    <div class="toggle-row" data-unit={unit.id}>
      <label class="label" for={id}>
        <strong>
          ({unit.letter}) {unit.title}
        </strong>
        <span class="muted small">{unit.summary}</span>
      </label>
      <Toggle
        id={id}
        checked={enabled}
        label={`الوحدة (${unit.letter}): ${unit.title}`}
        onChange={(value) => {
          onError(null);
          settings.set(key, value).catch((error: unknown) => {
            onError(`تعذّر حفظ مفتاح الوحدة (${unit.letter}): ${describeError(error)}`);
            force((n) => n + 1);
          });
        }}
      />
    </div>
  );
}

function UnitsSection({ settings }: { settings: SettingsStore }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <section class="section" aria-labelledby="mj-units-title" data-section="units">
      <Heading id="mj-units-title">الوحدات</Heading>
      <p class="muted">أوقف أي وحدة فتُزال آثارها من الصفحات المفتوحة فورًا، وشغّلها فتعود. يُحفظ اختيارك في هذا المتصفح.</p>
      {error && (
        <p class="notice" data-tone="danger" role="alert">
          {error}
        </p>
      )}
      <div>
        {UNITS.map((unit) => (
          <UnitToggle key={unit.id} settings={settings} unit={unit} onError={setError} />
        ))}
      </div>
    </section>
  );
}

const SURFACE_CHOICES: ReadonlyArray<{ value: Surface; title: string; note: string }> = [
  { value: 'native', title: 'اللوحة الجانبية للمتصفح', note: 'تُفتح بجانب الصفحة. وإن لم يدعمها المتصفح فُتح الدرج بدلًا منها.' },
  { value: 'drawer', title: 'درج داخل صفحة GitHub', note: 'يُفتح فوق الصفحة من جهة اليمين، ويعمل في كل المتصفحات.' },
];

function SurfaceSection({ settings }: { settings: SettingsStore }) {
  const surface = useSetting<Surface>(settings, SURFACE_KEY);
  const [error, setError] = useState<string | null>(null);
  return (
    <section class="section" aria-labelledby="mj-surface-title" data-section="surface">
      <Heading id="mj-surface-title">مكان اللوحة</Heading>
      <div role="radiogroup" aria-labelledby="mj-surface-title">
        {SURFACE_CHOICES.map((choice) => (
          <label class="choice" key={choice.value}>
            <input
              type="radio"
              name="mj-surface"
              value={choice.value}
              checked={surface === choice.value}
              onChange={() => {
                setError(null);
                settings.set(SURFACE_KEY, choice.value).catch((e: unknown) => setError(`تعذّر الحفظ: ${describeError(e)}`));
              }}
            />
            <span class="label">
              <strong>{choice.title}</strong>
              <br />
              <span class="muted small">{choice.note}</span>
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p class="notice" data-tone="danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

type PermissionState = 'checking' | 'granted' | 'denied';

function PermissionSection({ permission, openOptions }: { permission?: ApiGithubPermission; openOptions?: () => void }) {
  const [state, setState] = useState<PermissionState>('checking');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!permission) return undefined;
    let alive = true;
    permission.has().then(
      (granted) => alive && setState(granted ? 'granted' : 'denied'),
      () => alive && setState('denied'),
    );
    const unsubscribe = permission.subscribe((granted) => setState(granted ? 'granted' : 'denied'));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [permission]);

  const intro = (
    <p class="muted">
      تحتاج بعض الميزات بيانات من <Ltr className="mono">api.github.com</Ltr> لا تعرضها الصفحة. لا يصدر أي طلب إليه قبل أن تمنح هذه الصلاحية
      بنفسك، وتعمل بقية مِجهَر دونها، ويمكنك سحبها في أي وقت.
    </p>
  );

  if (!permission) {
    return (
      <section class="section" aria-labelledby="mj-permission-title" data-section="permission">
        <Heading id="mj-permission-title">الوصول إلى GitHub API (اختياري)</Heading>
        {intro}
        <p class="muted">تُمنح هذه الصلاحية وتُسحب من صفحة الإعدادات.</p>
        {openOptions && (
          <div class="row">
            <button type="button" class="btn" data-action="open-options" onClick={() => openOptions()}>
              افتح صفحة الإعدادات
            </button>
          </div>
        )}
      </section>
    );
  }

  // لا await قبل request(): المتصفح لا يقبلها إلا داخل فعل المستخدم نفسه (VER-05).
  const grant = () => {
    const pending = permission.request();
    setBusy(true);
    setMessage(null);
    pending.then(
      (granted) => {
        setState(granted ? 'granted' : 'denied');
        if (!granted) setMessage('لم تُمنح الصلاحية.');
      },
      (error: unknown) => setMessage(`تعذّر طلب الصلاحية: ${describeError(error)}`),
    ).finally(() => setBusy(false));
  };
  const revoke = () => {
    setBusy(true);
    setMessage(null);
    permission
      .revoke()
      .then(
        async () => setState((await permission.has()) ? 'granted' : 'denied'),
        (error: unknown) => setMessage(`تعذّر سحب الصلاحية: ${describeError(error)}`),
      )
      .finally(() => setBusy(false));
  };

  const label = { checking: 'جارٍ التحقق…', granted: 'ممنوحة', denied: 'غير ممنوحة' }[state];
  return (
    <section class="section" aria-labelledby="mj-permission-title" data-section="permission">
      <Heading id="mj-permission-title">الوصول إلى GitHub API (اختياري)</Heading>
      {intro}
      <div class="row">
        <span class="status" data-state={state === 'checking' ? 'pending' : state} data-permission-state={state} role="status">
          {label}
        </span>
        {state === 'granted' ? (
          <button type="button" class="btn btn-danger" data-action="revoke" disabled={busy} onClick={revoke}>
            اسحب الصلاحية
          </button>
        ) : (
          <button type="button" class="btn btn-primary" data-action="grant" disabled={busy || state === 'checking'} onClick={grant}>
            امنح الصلاحية
          </button>
        )}
      </div>
      {message && (
        <p class="notice" role="alert">
          {message}
        </p>
      )}
    </section>
  );
}

function ShortcutSection({ shortcuts }: { shortcuts: ShortcutsCapability }) {
  const [shortcut, setShortcut] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const read = () =>
      shortcuts.getAll().then(
        (all) => setShortcut(all.find((c) => c.name === PANEL_COMMAND)?.shortcut || null),
        () => setShortcut(null),
      );
    void read();
    // يعود المستخدم من صفحة الاختصارات بعد تغييره: تُقرأ القيمة من جديد.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [shortcuts]);
  return (
    <section class="section" aria-labelledby="mj-shortcut-title" data-section="shortcut">
      <Heading id="mj-shortcut-title">اختصار لوحة المفاتيح</Heading>
      <p data-shortcut={shortcut ?? ''}>
        {shortcut === undefined ? (
          'جارٍ القراءة…'
        ) : shortcut ? (
          <>
            يفتح اللوحة أو الدرج: <kbd>{shortcut}</kbd>
          </>
        ) : (
          'لا اختصار مضبوط الآن لفتح اللوحة.'
        )}
      </p>
      <p class="muted small">اختصار افتراضي مؤقت. يمكنك تغييره أو إلغاؤه من إعدادات اختصارات الإضافات في المتصفح.</p>
      <div class="row">
        <button type="button" class="btn" data-action="shortcuts" onClick={() => shortcuts.openSettings()}>
          غيّر الاختصار
        </button>
      </div>
    </section>
  );
}

// البداية والمساعدة (AD-29، الإطار P-58): إعادة الترحيب ودليل رمز GitHub. «جولة الترحيب» تكتب 'pending' فتعرضها اللوحة فورًا، أو عند
// فتحها التالي إن كانت هذه صفحة الإعدادات. وفي الدرج زر يفتح الدليل في تبويب جديد، لا حقل فيه (DEC-04).
function HelpSection({ settings, surface, openOptionsAt }: { settings: SettingsStore; surface: SettingsSurface; openOptionsAt?: (target: OptionsTarget) => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const replay = () => {
    setMessage(null);
    settings.set(WELCOME_KEY, 'pending').then(
      () => surface === 'options' && setMessage('تظهر جولة الترحيب في اللوحة عند فتحها التالي.'),
      (error: unknown) => setMessage(`تعذّر الحفظ: ${describeError(error)}`),
    );
  };
  return (
    <section class="section" aria-labelledby="mj-help-title" data-section="help">
      <Heading id="mj-help-title">البداية والمساعدة</Heading>
      <div class="help-rows">
        <div class="help-row">
          <span class="label">
            <strong>جولة الترحيب</strong>
            <span class="muted small">التعريف بمِجهَر وما يعمل بلا إعداد، والإضافات الاختيارية.</span>
          </span>
          <button type="button" class="btn" data-action="welcome-replay" onClick={replay}>
            <Icon name="play" />
            اعرضها
          </button>
        </div>
        {(surface === 'options' || openOptionsAt) && (
          <div class="help-row">
            <span class="label">
              <strong>دليل رمز GitHub</strong>
              <span class="muted small">فائدته، وطريقة إنشائه بأقل الصلاحيات، وحذفه.</span>
            </span>
            {surface === 'options' ? (
              <a class="btn" href="#guide/github-token" data-action="token-guide-help">
                افتح الدليل
                <Icon name="chevron-left" />
              </a>
            ) : (
              <button type="button" class="btn" data-action="token-guide-help" onClick={() => openOptionsAt?.('guide/github-token')}>
                <Icon name="external-link" />
                افتح الدليل
              </button>
            )}
          </div>
        )}
      </div>
      {message && (
        <p class="notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

function PrivacySection() {
  return (
    <section class="section" aria-labelledby="mj-privacy-title" data-section="privacy">
      <Heading id="mj-privacy-title">الخصوصية</Heading>
      <p class="muted">
        يعمل مِجهَر على صفحات <Ltr className="mono">github.com</Ltr> وحدها، ويعالج ما تعرضه داخل متصفحك، ويقرأ من GitHub نفسه ما يحتاجه. إعداداتك
        وملاحظاتك محفوظة في هذا المتصفح، ولا تُرسل إلى أي خدمة.
      </p>
      <p class="muted" data-privacy-optional="">
        وليس كل شيء محليًا: لا يتصل بـ <Ltr className="mono">api.github.com</Ltr> إلا بطلبك بعد أن تمنح صلاحيته الاختيارية بنفسك، ولا يرسل محتوى من
        الصفحة إلى مزوّد التحليل الذي تختاره إلا بطلبك وموافقتك على كل طلب.
      </p>
      <p class="muted" data-privacy-secrets="">
        رمز GitHub ومفاتيح المزوّدين اختيارية: تُحفظ في ذاكرة الجلسة افتراضًا، ولا يُرسل أيٌّ منها إلا إلى خدمته، وتمسحها من «الاتصالات والمفاتيح» في صفحة
        الإعدادات. والمسح من مِجهَر لا يُبطلها عند GitHub أو المزوّد.
      </p>
    </section>
  );
}

function ModuleSections({ settings, surface, sections }: { settings: SettingsStore; surface: SettingsSurface; sections: readonly SettingsSection[] }) {
  return (
    <>
      {sectionsFor(surface, sections).map((section) => {
        const Component = section.component;
        return (
          <section class="section" key={section.id} data-section={`module-${section.id}`} aria-label={section.title}>
            <Heading>{section.title}</Heading>
            <Component settings={settings} surface={surface} unitEnabled={settings.isModuleEnabled(section.unit)} />
          </section>
        );
      })}
    </>
  );
}

export function SettingsTab(props: SettingsTabProps) {
  const { settings, surface } = props;
  return (
    <LevelContext.Provider value={props.level ?? 2}>
      <div class="settings" data-surface={surface}>
        <UnitsSection settings={settings} />
        <SurfaceSection settings={settings} />
        {props.sections && <ModuleSections settings={settings} surface={surface} sections={props.sections} />}
        <PermissionSection {...(props.permission ? { permission: props.permission } : {})} {...(props.openOptions ? { openOptions: props.openOptions } : {})} />
        {surface === 'options' && props.secretSections}
        {props.shortcuts && <ShortcutSection shortcuts={props.shortcuts} />}
        <HelpSection settings={settings} surface={surface} {...(props.openOptionsAt ? { openOptionsAt: props.openOptionsAt } : {})} />
        <PrivacySection />
      </div>
    </LevelContext.Provider>
  );
}
