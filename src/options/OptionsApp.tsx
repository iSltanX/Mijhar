// غلاف صفحة الإعدادات (AD-29): يختار بين الإعدادات ودليل رمز GitHub من جزء العنوان (#guide/github-token)، فيعمل الرجوع في المتصفح
// ويُفتح الدليل مباشرة من اللوحة والدرج في تبويب جديد. #token يعرض الإعدادات ويركّز مدخل الدليل في قسم الرمز. لا يحمل العنوان أي بيانات.
import type { ComponentChild } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { OptionsTarget } from '../core/ui-host/commands';
import { TokenGuide } from './guide/TokenGuide';

export const GUIDE_HASH = 'guide/github-token';
export const TOKEN_HASH = 'token';

const PAGE_TITLE = 'مِجهَر — الإعدادات والخصوصية';
const GUIDE_TITLE = 'دليل رمز GitHub — مِجهَر';

export interface OptionsAppProps {
  /** محتوى الإعدادات، ويستقبل فاتح المواضع داخل هذه الصفحة. */
  readonly settings: (openOptionsAt: (target: OptionsTarget) => void) => ComponentChild;
  readonly win?: Window;
}

const readHash = (win: Window): string => decodeURIComponent(win.location.hash.replace(/^#/, ''));

/** يمرّر قسم الرمز إلى العرض ويركّز مدخل الدليل فيه، أو عنوان القسم إن غاب المدخل. */
function focusTokenSection(doc: Document): void {
  const section = doc.querySelector<HTMLElement>('[data-section="token"]');
  if (!section) return;
  section.scrollIntoView?.({ block: 'start' });
  const target = section.querySelector<HTMLElement>('[data-action="token-guide"]') ?? section.querySelector<HTMLElement>('h2');
  if (target && target.tagName === 'H2' && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target?.focus();
}

export function OptionsApp({ settings, win = window }: OptionsAppProps) {
  const [hash, setHash] = useState(() => readHash(win));
  useEffect(() => {
    const onHash = () => setHash(readHash(win));
    win.addEventListener('hashchange', onHash);
    return () => win.removeEventListener('hashchange', onHash);
  }, [win]);
  const guide = hash === GUIDE_HASH;
  const wasGuide = useRef(guide);
  useEffect(() => {
    win.document.title = guide ? GUIDE_TITLE : PAGE_TITLE;
    if (hash === TOKEN_HASH) focusTokenSection(win.document);
    else if (guide !== wasGuide.current) win.scrollTo(0, 0);
    wasGuide.current = guide;
  }, [hash, guide, win]);
  const go = (target: OptionsTarget) => {
    win.location.hash = target;
  };

  return (
    <main class="options-page">
      <header class="options-header">{guide ? <p class="brand-line">{PAGE_TITLE}</p> : <h1>{PAGE_TITLE}</h1>}</header>
      {guide ? <TokenGuide onBack={() => go(TOKEN_HASH)} /> : settings(go)}
    </main>
  );
}
