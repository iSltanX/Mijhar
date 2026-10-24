// رابط قالب إنشاء رمز GitHub دقيق الحبيبات (AD-29): يملأ في صفحة GitHub الاسم والوصف والمدة وصلاحيات القراءة الست التي تقرؤها الشيفرة
// (READ_PERMISSIONS، من evidence/T-0.5)، ولا يملأ غيرها. المعاملات من docs.github.com («Pre-filling fine-grained token details using URL
// parameters»، قُرئت 2026-10-24). الرابط يُفتح بنقر المستخدم في تبويب جديد ولا يُنشئ شيئًا: الإنشاء بضغطه «Generate token» بنفسه.
import { READ_PERMISSIONS } from '../../modules/d/token/format';

export const TOKEN_NEW_URL = 'https://github.com/settings/personal-access-tokens/new';
export const TOKEN_LIST_URL = 'https://github.com/settings/personal-access-tokens';

/** القيم المقترحة. الاسم 40 حرفًا على الأكثر والوصف 1024، والمدة من 1 إلى 366 يومًا. */
export const TOKEN_TEMPLATE = {
  name: 'Mijhar read-only',
  description: 'Mijhar browser extension: read-only access to pull request status and Actions checks in the repositories you select.',
  expiresInDays: 90,
} as const;

export function tokenTemplateUrl(): string {
  const url = new URL(TOKEN_NEW_URL);
  url.searchParams.set('name', TOKEN_TEMPLATE.name);
  url.searchParams.set('description', TOKEN_TEMPLATE.description);
  url.searchParams.set('expires_in', String(TOKEN_TEMPLATE.expiresInDays));
  for (const permission of READ_PERMISSIONS) url.searchParams.set(permission.param, 'read');
  return url.toString();
}

/** مراجع الدليل الرسمية. */
export const GUIDE_SOURCES: ReadonlyArray<{ readonly label: string; readonly href: string }> = [
  { label: 'Managing your personal access tokens', href: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens' },
  { label: 'Permissions required for fine-grained personal access tokens', href: 'https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens' },
  { label: 'Rate limits for the REST API', href: 'https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api' },
  { label: 'Token expiration and revocation', href: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation' },
];
