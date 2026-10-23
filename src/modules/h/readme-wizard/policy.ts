// الخطوة الثانية في المعالج (T-9.2): مراجعة سياسة المساهمة قبل أي مسودة. تُقرأ CONTRIBUTING وREADME بالمسار الذي أثبته T-0.4
// (github.com/<owner>/<repo>/raw/HEAD/<path> بنقر المستخدم، كما في مرشد أول مساهمة)، ثم يُستخرج منها محليًا: أنظمة الترجمة الخارجية
// (Crowdin وTransifex وWeblate…)، والأسطر التي تذكر الترجمة، وعبارات رفض الترجمات أو قصرها على نظام خارجي، وطلب فتح issue أولًا،
// وقسم المساهمة في README. لا يُستنتج إذن أو منع من غياب شيء: ما لم يُقرأ يُعلن ويُراجع يدويًا.
import { CANDIDATE_PATHS, defaultFetchText, rawUrl } from '../first-contribution/sources';
import type { FetchText } from '../first-contribution/sources';

export type PolicyFileKind = 'contributing' | 'readme';

export interface PolicyFile {
  readonly kind: PolicyFileKind;
  readonly path: string;
  readonly url: string;
  readonly text: string;
}

export interface PolicyRead {
  readonly files: readonly PolicyFile[];
  /** أنواع لم يُعثر عليها في أي موضع جُرِّب (404 كلها)، بما جُرِّب. */
  readonly missing: ReadonlyArray<{ readonly kind: PolicyFileKind; readonly tried: readonly string[] }>;
  /** فشل غير 404 (شبكة أو خادم أو حجم): لا يُعدّ غيابًا. */
  readonly failed: ReadonlyArray<{ readonly kind: PolicyFileKind; readonly path: string; readonly reason: string }>;
  readonly requests: number;
}

const KINDS: readonly PolicyFileKind[] = ['contributing', 'readme'];

/** يقرأ ملفي السياسة؛ hints مسارات ظاهرة في الصفحة تسبق التخمين (الدرج وحده يرى DOM). يُستدعى من نقر المستخدم. */
export async function readPolicy(owner: string, repo: string, fetchText: FetchText = defaultFetchText, hints: Partial<Record<PolicyFileKind, readonly string[]>> = {}): Promise<PolicyRead> {
  const files: PolicyFile[] = [];
  const missing: Array<{ kind: PolicyFileKind; tried: string[] }> = [];
  const failed: Array<{ kind: PolicyFileKind; path: string; reason: string }> = [];
  let requests = 0;
  for (const kind of KINDS) {
    const tried: string[] = [];
    let settled = false;
    for (const path of [...new Set([...(hints[kind] ?? []), ...CANDIDATE_PATHS[kind]])]) {
      requests += 1;
      const url = rawUrl(owner, repo, path);
      const result = await fetchText(url);
      if (result.ok) {
        files.push({ kind, path, url, text: result.text });
        settled = true;
        break;
      }
      if (result.reason === 'not-found') {
        tried.push(path);
        continue;
      }
      failed.push({ kind, path, reason: result.reason });
      settled = true;
      break;
    }
    if (!settled) missing.push({ kind, tried });
  }
  return { files, missing, failed, requests };
}

export interface ExternalSystem {
  readonly name: string;
  readonly url: string;
}

const SYSTEMS: ReadonlyArray<{ readonly name: string; readonly pattern: RegExp }> = [
  { name: 'Crowdin', pattern: /https?:\/\/(?:[\w-]+\.)?crowdin\.(?:com|net)\/[^\s)>\]"']*/i },
  { name: 'Transifex', pattern: /https?:\/\/(?:[\w-]+\.)?transifex\.com\/[^\s)>\]"']*/i },
  { name: 'Weblate', pattern: /https?:\/\/(?:hosted\.weblate\.org|[\w.-]*weblate[\w.-]*)\/[^\s)>\]"']*/i },
  { name: 'POEditor', pattern: /https?:\/\/(?:[\w-]+\.)?poeditor\.com\/[^\s)>\]"']*/i },
  { name: 'Lokalise', pattern: /https?:\/\/(?:[\w-]+\.)?lokalise\.(?:com|co)\/[^\s)>\]"']*/i },
  { name: 'Pontoon', pattern: /https?:\/\/pontoon\.mozilla\.org\/[^\s)>\]"']*/i },
  { name: 'Localazy', pattern: /https?:\/\/(?:[\w-]+\.)?localazy\.com\/[^\s)>\]"']*/i },
  { name: 'Tolgee', pattern: /https?:\/\/(?:[\w-]+\.)?tolgee\.io\/[^\s)>\]"']*/i },
];

const TRANSLATION_LINE = /translat|i18n|l10n|locali[sz]|ترجم|تعريب/i;
const DECLINE = [
  /(?:do not|don't|won't|will not|no longer|cannot|can't)\s+(?:accept|merge|take)[^.\n]{0,60}translat/i,
  /translations?[^.\n]{0,40}(?:are|is)\s+(?:not accepted|no longer accepted|not being accepted)/i,
  /translations?[^.\n]{0,60}(?:only|exclusively)\s+(?:via|through|on|in)\b/i,
  /(?:all|any)\s+translations?\s+(?:must|should)\s+(?:go|be (?:done|submitted|made))\s+(?:via|through|on|in)\b/i,
];
const ISSUE_FIRST = /(?:open|create|file|start)\s+(?:an?\s+)?(?:issue|discussion)\s+(?:first|before)|discuss[^.\n]{0,60}before\s+(?:opening|submitting|sending|working)/i;
const CONTRIBUTING_HEADING = /^#{1,6}\s*(?:contribut\w*|المساهمة|كيف تساهم)\b.*$/im;

export interface PolicyLine {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

export interface PolicyFindings {
  readonly externalSystems: readonly ExternalSystem[];
  readonly translationLines: readonly PolicyLine[];
  readonly declines: readonly PolicyLine[];
  readonly issueFirst: readonly PolicyLine[];
  /** قسم «المساهمة» في README (حتى العنوان التالي)، مقتطعًا. */
  readonly readmeSection: string | null;
}

export const MAX_EXCERPTS = 8;
const MAX_LINE = 240;
const clip = (text: string): string => (text.length > MAX_LINE ? `${text.slice(0, MAX_LINE - 1)}…` : text);

function scan(file: PolicyFile, pattern: RegExp, limit: number): PolicyLine[] {
  const out: PolicyLine[] = [];
  file.text.split('\n').forEach((raw, i) => {
    const text = raw.trim();
    if (out.length < limit && text && pattern.test(text)) out.push({ file: file.path, line: i + 1, text: clip(text) });
  });
  return out;
}

function section(text: string): string | null {
  const match = CONTRIBUTING_HEADING.exec(text);
  if (!match) return null;
  const level = /^#+/.exec(match[0])?.[0].length ?? 2;
  const rest = text.slice(match.index + match[0].length);
  const next = new RegExp(`^#{1,${level}}\\s`, 'm').exec(rest);
  const body = (next ? rest.slice(0, next.index) : rest).trim();
  return body ? clip(body.replace(/\n{3,}/g, '\n\n')).slice(0, 1200) : null;
}

/** يحلل ما قُرئ محليًا. لا يحكم بالإذن: يعرض ما وُجد ليقرأه المستخدم. */
export function analyzePolicy(files: readonly PolicyFile[]): PolicyFindings {
  const systems = new Map<string, ExternalSystem>();
  const translationLines: PolicyLine[] = [];
  const declines: PolicyLine[] = [];
  const issueFirst: PolicyLine[] = [];
  let readmeSection: string | null = null;
  for (const file of files) {
    for (const { name, pattern } of SYSTEMS) {
      const found = new RegExp(pattern.source, 'gi').exec(file.text);
      if (found && !systems.has(name)) systems.set(name, { name, url: found[0].replace(/[.,;:]+$/, '') });
    }
    translationLines.push(...scan(file, TRANSLATION_LINE, MAX_EXCERPTS - translationLines.length));
    for (const pattern of DECLINE) declines.push(...scan(file, pattern, MAX_EXCERPTS).filter((l) => !declines.some((d) => d.file === l.file && d.line === l.line)));
    issueFirst.push(...scan(file, ISSUE_FIRST, 3));
    if (file.kind === 'readme' && readmeSection === null) readmeSection = section(file.text);
  }
  return { externalSystems: [...systems.values()], translationLines, declines: declines.slice(0, MAX_EXCERPTS), issueFirst: issueFirst.slice(0, 3), readmeSection };
}

/** رابط الملف على GitHub للمراجعة اليدوية. */
export const blobUrl = (owner: string, repo: string, path: string): string =>
  `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/HEAD/${path.split('/').map(encodeURIComponent).join('/')}`;
