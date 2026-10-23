// بطاقة الملف الشخصي (T-9.4، F-H6): عرضان منفصلان بعنوانين وتنبيهين: «محتوى عربي» (وصف المشاريع المثبتة بحروفه) و«بيانات يعلنها
// صاحب الحساب» (حرفيًا). لا تُنتج هذه البطاقة وسم هوية لأي حساب، وكل نص يُرسم نصًّا لا HTML.
import { useRef } from 'preact/hooks';
import { useStyles } from '../../../shared/ui/useStyles';
import { COMMUNITY_CSS, COMMUNITY_STYLE_ID } from '../styles';
import type { AccountView } from './declared';

export function ProfileCard({ view }: { view: AccountView }) {
  const root = useRef<HTMLDivElement>(null);
  useStyles(root, COMMUNITY_STYLE_ID, COMMUNITY_CSS);
  const { content, declared } = view;
  return (
    <div ref={root}>
      <div class="profile-card" data-profile-card="">
        <section class="block" aria-labelledby="mj-profile-content" data-block="arabic-content">
          <h3 id="mj-profile-content">{content.title}</h3>
          {content.findings.length ? (
            <ul class="list">
              {content.findings.map((finding) => (
                <li key={finding.repo} data-repo={finding.repo}>
                  <span class="ltr-inline mono">{finding.repo}</span> <span class="tag" data-tone="ok">وصفه بالعربية</span>
                </li>
              ))}
            </ul>
          ) : (
            <p class="muted" data-content-empty="">
              لم يظهر وصف عربي بين المشاريع المثبتة الظاهرة في هذه الصفحة.
            </p>
          )}
          <p class="muted small">{content.notice}</p>
        </section>
        <section class="block block-declared" aria-labelledby="mj-profile-declared" data-block="declared">
          <h3 id="mj-profile-declared">{declared.title}</h3>
          {declared.entries.length ? (
            <dl>
              {declared.entries.flatMap((entry) => [
                <dt key={`${entry.field}-t`}>{entry.label}</dt>,
                <dd key={`${entry.field}-d`} dir="auto" data-field={entry.field}>
                  {entry.text}
                </dd>,
              ])}
            </dl>
          ) : (
            <p class="muted" data-declared-empty="">
              لم يظهر في هذه الصفحة اسم معروض ولا موقع ولا نبذة.
            </p>
          )}
          <p class="small" data-declared-notice="">
            {declared.notice}
          </p>
        </section>
      </div>
    </div>
  );
}
