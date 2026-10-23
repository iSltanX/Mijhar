// قراءة صفحة الملف الشخصي: الحقول المعلنة والمشاريع المثبتة ووصفها. المحددات مقيسة على صفحتي ملف عامتين في 2026-10-23
// (قراءة فقط): h-card وp-name وp-nickname وli[itemprop="homeLocation"] .p-label وp-note، وli.pinned-item-list-item
// بروابط a[href] ووصف p.pinned-item-desc. أي تغيّر يُعدَّل في الجدول وحده (SelectorsRegistry).
import type { SelectorEntry, SelectorsRegistry } from '../../../core/detector';
import type { AccountFields, ProjectText } from './declared';

export const PROFILE_SELECTORS: readonly SelectorEntry[] = [
  { key: 'h.profile.name', description: 'الاسم المعروض في الملف الشخصي', candidates: ['.vcard-fullname', '.p-name', '[itemprop="name"]'] },
  { key: 'h.profile.login', description: 'اسم المستخدم', candidates: ['.vcard-username', '.p-nickname', '[itemprop="additionalName"]'] },
  { key: 'h.profile.location', description: 'حقل الموقع المعلن', candidates: ['li[itemprop="homeLocation"] .p-label', 'li[itemprop="homeLocation"]'] },
  { key: 'h.profile.bio', description: 'النبذة المعلنة', candidates: ['.user-profile-bio', '.p-note'] },
  { key: 'h.profile.card-parent', description: 'حاوية يُدرج فيها عرض الحساب (الشريط الجانبي للملف الشخصي)', candidates: ['.h-card', '.vcard-names-container', '.js-profile-editable-area'] },
  { key: 'h.profile.pinned', description: 'عناصر المشاريع المثبتة', candidates: ['li.pinned-item-list-item', '.js-pinned-item-list-item'] },
];

const text = (el: Element | null): string | null => {
  const value = el?.textContent?.replace(/\s+/g, ' ').trim();
  return value ? value : null;
};

export function readAccount(doc: Document, selectors: SelectorsRegistry, loginFromUrl: string): AccountFields {
  const find = (key: string): Element | null => selectors.resolve(doc, key)?.element ?? null;
  const location = find('h.profile.location');
  return {
    login: text(find('h.profile.login')) ?? loginFromUrl,
    name: text(find('h.profile.name')),
    // aria-label «Home location: …» نص الواجهة لا نص صاحب الحساب؛ يُقرأ النص الظاهر وحده.
    location: text(location),
    bio: text(find('h.profile.bio')),
  };
}

export function readPinnedProjects(doc: Document, selectors: SelectorsRegistry): ProjectText[] {
  const projects: ProjectText[] = [];
  for (const item of selectors.resolveAll(doc, 'h.profile.pinned')) {
    const href = item.querySelector('a[href^="/"]')?.getAttribute('href');
    const repo = href?.split('/').filter(Boolean).slice(0, 2).join('/');
    const description = text(item.querySelector('.pinned-item-desc'));
    if (repo && repo.includes('/') && description) projects.push({ repo, description });
  }
  return projects;
}
