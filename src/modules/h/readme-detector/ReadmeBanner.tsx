// شريط README العربي في صفحة المستودع (T-9.1)، وزر «فحص مجلد docs/ عند الطلب» الذي يُستعمل أيضًا في لوحة المجتمع.
// النصوص كلها صياغة نطاق لا جزم: «لم يُعثر ضمن النطاق» لا «لا يوجد». والفحص لا يبدأ إلا بنقر الزر.
import { useRef, useState } from 'preact/hooks';
import { useStyles } from '../../../shared/ui/useStyles';
import { UNAVAILABLE_ACCESS } from '../api-access';
import type { GithubApiAccess } from '../api-access';
import { COMMUNITY_CSS, COMMUNITY_STYLE_ID } from '../styles';
import type { ArabicReadmeMatch, ReadmeDetection } from './detect';
import { scanDocsFolder } from './docs-scan';
import type { DocsScanResult } from './docs-scan';

export const SCOPE_STATEMENT =
  'لم يُعثر على ملف README عربي ضمن نطاق الفحص الحالي (شجرة الجذر الظاهرة والروابط المباشرة داخل README الأساسي). تنبيه: قد تكون قائمة الملفات في الصفحة ناقصة أو مقطوعة أو قد يوجد التوثيق العربي داخل مجلد فرعي غير مفتوح مثل docs/ أو i18n/.';

export const UNREADABLE_STATEMENT = 'تعذّرت قراءة قائمة الملفات في هذه الصفحة (قد يكون تخطيط GitHub تغيّر أو لم يكتمل عرض الصفحة)، فلم يُفحص شيء ولا حكم على وجود README عربي.';

// في اللوحة تُفتح الروابط في تبويب جديد كبقية روابط اللوحة (VR-18)؛ وفي شريط الصفحة كما هي.
function MatchLinks({ matches, newTab = false }: { matches: readonly ArabicReadmeMatch[]; newTab?: boolean }) {
  return (
    <>
      {matches.map((match) => (
        <a key={match.href} class="btn" href={match.href} data-readme-match={match.name} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          فتح <span class="ltr-inline mono">{match.name}</span>
        </a>
      ))}
    </>
  );
}

export interface DocsScanControlProps {
  readonly owner: string;
  readonly repo: string;
  readonly access?: GithubApiAccess;
  /** روابط النتيجة في تبويب جديد (اللوحة). */
  readonly newTab?: boolean;
}

/** زر الفحص ونتيجته. لا طلب قبل النقر، وأول ما في معالج النقر طلب الصلاحية (بلا await قبله). */
export function DocsScanControl({ owner, repo, access = UNAVAILABLE_ACCESS, newTab = false }: DocsScanControlProps) {
  const [state, setState] = useState<{ status: 'idle' } | { status: 'scanning' } | { status: 'done'; result: DocsScanResult }>({ status: 'idle' });
  const run = (): void => {
    setState({ status: 'scanning' });
    scanDocsFolder(access, owner, repo).then(
      (result) => setState({ status: 'done', result }),
      () => setState({ status: 'done', result: { state: 'incomplete', reason: 'network', requests: 0, message: 'تعذّر إتمام الفحص؛ الفحص لم يكتمل.' } }),
    );
  };
  return (
    <div class="field" data-docs-scan="">
      <div class="row">
        <button type="button" class="btn" data-action="scan-docs" disabled={state.status === 'scanning'} onClick={run}>
          فحص مجلد <span class="ltr-inline mono">docs/</span> عند الطلب
        </button>
        {!access.available && <span class="muted small">يتطلب صلاحية GitHub API الاختيارية ويعمل من لوحة مِجهَر الجانبية.</span>}
      </div>
      {state.status === 'scanning' && (
        <p class="muted" role="status" data-scan-state="scanning">
          جارٍ فحص docs/…
        </p>
      )}
      {state.status === 'done' && (
        <div role="status" data-scan-state={state.result.state}>
          {state.result.state === 'found' ? (
            <>
              <p>عُثر في docs/ على:</p>
              <div class="row">
                <MatchLinks matches={state.result.matches} newTab={newTab} />
              </div>
              {state.result.partial && <p class="notice" data-scan-partial="">{state.result.partial}</p>}
            </>
          ) : (
            <p class={state.result.state === 'incomplete' ? 'notice' : 'muted'}>{state.result.message}</p>
          )}
        </div>
      )}
    </div>
  );
}

export interface ReadmeBannerProps {
  readonly detection: ReadmeDetection;
  readonly owner: string;
  readonly repo: string;
  readonly access?: GithubApiAccess;
}

export function ReadmeBanner({ detection, owner, repo, access }: ReadmeBannerProps) {
  const root = useRef<HTMLDivElement>(null);
  useStyles(root, COMMUNITY_STYLE_ID, COMMUNITY_CSS);
  const { state, matches, truncation, unopenedFolders, scope } = detection;
  return (
    <div ref={root}>
      <section class="readme-banner" data-state={state === 'found' ? 'found' : 'scope'} aria-label="README العربي">
        {state === 'found' ? (
          <>
            <p data-readme-state="found">{matches.length > 1 ? 'تتوفر ملفات تعريف باللغة العربية لهذا المستودع:' : 'يتوفر ملف تعريف باللغة العربية لهذا المستودع:'}</p>
            <div class="row">
              <MatchLinks matches={matches} />
            </div>
          </>
        ) : (
          <>
            <p data-readme-state={state === 'unreadable' ? 'unreadable' : 'not-found-in-scope'}>{state === 'unreadable' ? UNREADABLE_STATEMENT : SCOPE_STATEMENT}</p>
            {state === 'not-found-in-scope' && (
              <p class="muted small" data-readme-scope="">
                ما فُحص: {scope.treeEntries} عنصرًا من شجرة الجذر، {scope.readmeShown ? `و${scope.readmeLinks} رابطًا في README الأساسي` : 'ولم يظهر README أساسي في الصفحة'}.
                {unopenedFolders.length > 0 && <> مجلدات لم تُفتح: <span class="ltr-inline mono">{unopenedFolders.join(' ، ')}</span>.</>}
              </p>
            )}
          </>
        )}
        {truncation && (
          <p class="notice" data-tone="danger" data-readme-truncated="">
            قائمة الملفات في الصفحة مقتطعة: ظهر {truncation.shown}
            {truncation.total !== null ? ` من أصل ${truncation.total}` : ''}؛ فلا يُحكم بغياب أي ملف من هذه القائمة.
          </p>
        )}
        {state !== 'found' && <DocsScanControl owner={owner} repo={repo} {...(access ? { access } : {})} />}
      </section>
    </div>
  );
}
