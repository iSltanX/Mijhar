// من حالة الصفحة (PageState) إلى «أنواع الصفحات» التي تعتمدها توقيعات القاموس (PAGE_KINDS في schema.mjs). الصفحة تحمل
// 'any' دائمًا (عناصر مشتركة)، ونوعًا أو أكثر بحسب مسارها. نوع غير معروف لا يُضاف: فتبقى العناصر الخاصة بصفحات أخرى غير مطابقة.
import type { PageState } from '../../../core';
import type { PageKind } from '../../../data/glossary/types';

type PageLike = Pick<PageState, 'type' | 'href'>;

const pathOf = (href: string): string => {
  try {
    return new URL(href).pathname;
  } catch {
    return '';
  }
};

export function pageKindsOf(page: PageLike): PageKind[] {
  const kinds = new Set<PageKind>(['any']);
  switch (page.type) {
    case 'home':
      kinds.add('dashboard');
      break;
    case 'profile':
      kinds.add('profile');
      break;
    case 'repo':
      kinds.add('repo-home');
      break;
    case 'tree':
    case 'blob':
      kinds.add('repo-files');
      break;
    case 'issue-list':
      kinds.add('issues');
      break;
    case 'issue':
    case 'issue-new':
      kinds.add('issue');
      break;
    case 'pr-list':
      kinds.add('pull-requests');
      break;
    case 'pr':
    case 'pr-files':
    case 'pr-commits':
    case 'pr-checks':
    case 'compare':
      kinds.add('pull-request');
      break;
    case 'actions':
    case 'actions-run':
      kinds.add('actions');
      break;
    case 'releases':
      kinds.add('releases');
      break;
    case 'search':
      kinds.add('search');
      break;
    case 'settings':
      kinds.add('settings-account');
      break;
    case 'other': {
      // ما لا يصنّفه الكاشف بنوع يُقرأ من المسار نفسه (إعدادات المستودع والأمان والرؤى والإشعارات وإنشاء مستودع).
      const path = pathOf(page.href);
      if (/^\/[^/]+\/[^/]+\/settings(\/|$)/.test(path)) kinds.add('settings-repo');
      else if (/^\/[^/]+\/[^/]+\/security(\/|$)/.test(path)) kinds.add('security');
      else if (/^\/[^/]+\/[^/]+\/(pulse|graphs|network)(\/|$)/.test(path)) kinds.add('insights');
      else if (path === '/new' || path.startsWith('/new/')) kinds.add('new-repo');
      else if (path.startsWith('/notifications')) kinds.add('notifications');
      break;
    }
    default:
      break;
  }
  return [...kinds];
}
