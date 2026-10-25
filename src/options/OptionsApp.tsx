// غلاف صفحة الإعدادات (AD-29): يختار بين الإعدادات ودليل رمز GitHub (#guide/github-token) و«لماذا المفتاح؟» (#guide/provider-key، MJ21) من جزء
// العنوان، فيعمل الرجوع في المتصفح وتُفتح الصفحتان مباشرة من اللوحة والدرج في تبويب جديد. و«الإبلاغ عن مشكلة» (#report، MJ26) صفحة ثالثة مثلهما،
// و#about يمرّر شاشة «حول مِجهَر» إلى العرض. #token و#provider-key تعرضان الإعدادات وتركّزان مدخل
// الشرح في بطاقة السرّ. لا يحمل العنوان أي بيانات.
import type { ComponentChild } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { OptionsTarget } from '../core/ui-host/commands';
import { ProviderKeyGuide } from './guide/ProviderKeyGuide';
import { TokenGuide } from './guide/TokenGuide';

export const GUIDE_HASH = 'guide/github-token';
export const TOKEN_HASH = 'token';
export const PROVIDER_GUIDE_HASH = 'guide/provider-key';
export const PROVIDER_HASH = 'provider-key';
export const REPORT_HASH = 'report';
export const ABOUT_HASH = 'about';

const PAGE_TITLE = 'مِجهَر — الإعدادات والخصوصية';
const GUIDE_TITLE = 'دليل رمز GitHub — مِجهَر';
const PROVIDER_GUIDE_TITLE = 'لماذا مفتاح مزوّد التحليل؟ — مِجهَر';
const REPORT_TITLE = 'الإبلاغ عن مشكلة — مِجهَر';

export interface OptionsAppProps {
  /** محتوى الإعدادات، ويستقبل فاتح المواضع داخل هذه الصفحة. */
  readonly settings: (openOptionsAt: (target: OptionsTarget) => void) => ComponentChild;
  /** صفحة «الإبلاغ عن مشكلة» (MJ26)، ويستقبل الرجوع إلى «حول مِجهَر». */
  readonly report?: (back: () => void) => ComponentChild;
  readonly win?: Window;
}

const readHash = (win: Window): string => decodeURIComponent(win.location.hash.replace(/^#/, ''));

/** يمرّر بطاقة السرّ إلى العرض ويركّز مدخل الشرح فيها، أو عنوانها إن غاب المدخل. */
function focusSecretSection(doc: Document, name: 'token' | 'provider-key' | 'about'): void {
  const section = doc.querySelector<HTMLElement>(`[data-section="${name}"]`);
  if (!section) return;
  section.scrollIntoView?.({ block: 'start' });
  const target = section.querySelector<HTMLElement>(`[data-action="${name}-guide"]`) ?? section.querySelector<HTMLElement>('h2');
  if (target && target.tagName === 'H2' && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target?.focus();
}

export function OptionsApp({ settings, report, win = window }: OptionsAppProps) {
  const [hash, setHash] = useState(() => readHash(win));
  useEffect(() => {
    const onHash = () => setHash(readHash(win));
    win.addEventListener('hashchange', onHash);
    return () => win.removeEventListener('hashchange', onHash);
  }, [win]);
  const guide = hash === GUIDE_HASH || hash === PROVIDER_GUIDE_HASH || (hash === REPORT_HASH && Boolean(report));
  const wasGuide = useRef(guide);
  useEffect(() => {
    win.document.title = hash === GUIDE_HASH ? GUIDE_TITLE : hash === PROVIDER_GUIDE_HASH ? PROVIDER_GUIDE_TITLE : hash === REPORT_HASH && report ? REPORT_TITLE : PAGE_TITLE;
    if (hash === TOKEN_HASH) focusSecretSection(win.document, 'token');
    else if (hash === PROVIDER_HASH) focusSecretSection(win.document, 'provider-key');
    else if (hash === ABOUT_HASH) focusSecretSection(win.document, 'about');
    else if (guide !== wasGuide.current) win.scrollTo(0, 0);
    wasGuide.current = guide;
  }, [hash, guide, win]);
  const go = (target: OptionsTarget) => {
    win.location.hash = target;
  };

  return (
    <main class="options-page">
      <header class="options-header">{guide ? <p class="brand-line">{PAGE_TITLE}</p> : <h1>{PAGE_TITLE}</h1>}</header>
      {hash === GUIDE_HASH ? (
        <TokenGuide onBack={() => go(TOKEN_HASH)} />
      ) : hash === PROVIDER_GUIDE_HASH ? (
        <ProviderKeyGuide onBack={() => go(PROVIDER_HASH)} onAdd={() => go(PROVIDER_HASH)} />
      ) : hash === REPORT_HASH && report ? (
        report(() => go('about'))
      ) : (
        settings(go)
      )}
    </main>
  );
}
