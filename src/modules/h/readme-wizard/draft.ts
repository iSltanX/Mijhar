// الخطوة الثالثة في المعالج (T-9.2): مسودة استئذان المشرفين قبل أي ترجمة، تُعاين وتُعدَّل وتُنسخ يدويًا ولا تُنشر. تذكر ما فعله المستخدم
// قبلها (رابط بحث التكرار ومراجعة السياسة)، وتسأل ولا تفترض: اسم الملف وموضعه وطريقة الترجمة يقررها المشرفون. وإن ذكرت السياسة نظام
// ترجمة خارجيًا سألت عنه بدل اقتراح ملف في المستودع. دالة نقية.
import type { PolicyFindings } from './policy';

export type DraftLanguage = 'en' | 'ar';

export const DRAFT_LANGUAGES: Readonly<Record<DraftLanguage, string>> = { en: 'الإنجليزية', ar: 'العربية' };

export interface DraftInput {
  readonly owner: string;
  readonly repo: string;
  /** رابط بحث التكرار الذي فتحه المستخدم في الخطوة الأولى. */
  readonly searchUrl: string;
  /** null: لم تُقرأ السياسة آليًا (راجعها المستخدم يدويًا). */
  readonly findings: PolicyFindings | null;
  /** هل عُثر على CONTRIBUTING. */
  readonly contributingFound: boolean;
}

export interface Draft {
  readonly title: string;
  readonly body: string;
}

function englishPolicyLine(input: DraftInput): string {
  const system = input.findings?.externalSystems[0];
  if (system) return `- read the contribution guidelines; I noticed translations are handled through ${system.name} (${system.url}), so I wanted to ask before doing anything here`;
  if (input.contributingFound) return '- read the contribution guidelines (CONTRIBUTING)';
  return "- looked for contribution guidelines (I couldn't find a CONTRIBUTING file, so I'm asking here first)";
}

function arabicPolicyLine(input: DraftInput): string {
  const system = input.findings?.externalSystems[0];
  if (system) return `- قرأت إرشادات المساهمة، ولاحظت أن الترجمات تُدار عبر ${system.name} (${system.url})، فأردت السؤال قبل أي عمل هنا`;
  if (input.contributingFound) return '- قرأت إرشادات المساهمة (CONTRIBUTING)';
  return '- بحثت عن إرشادات المساهمة ولم أجد ملف CONTRIBUTING، فأسأل هنا أولًا';
}

export function buildDraft(input: DraftInput, language: DraftLanguage): Draft {
  const slug = `${input.owner}/${input.repo}`;
  const external = input.findings?.externalSystems[0] ?? null;
  if (language === 'en') {
    const proposal = external
      ? [`Should an Arabic translation of the README go through ${external.name} as well, or would a \`README.ar.md\` in the repository be acceptable?`]
      : [
          'Proposal:',
          '- add `README.ar.md` translated from the current README;',
          '- link it from the top of `README.md` (for example, a short language line);',
          "- I'm happy to keep it in sync, and it's fine to remove it if it falls out of date.",
        ];
    return {
      title: 'Would you welcome an Arabic translation of the README?',
      body: [
        'Hi maintainers,',
        '',
        `I'd like to offer an Arabic translation of the README for ${slug} to help Arabic-speaking developers get started.`,
        '',
        'Before opening this I:',
        `- searched existing issues and pull requests (open and closed) for an earlier request: ${input.searchUrl}`,
        englishPolicyLine(input),
        '',
        ...proposal,
        '',
        "Would this be welcome? If you prefer a different file name, location, or translation workflow, please let me know and I'll follow it. I won't open a pull request unless you agree.",
      ].join('\n'),
    };
  }
  const proposal = external
    ? [`هل تمر ترجمة README العربية عبر ${external.name} أيضًا، أم يُقبل ملف \`README.ar.md\` في المستودع؟`]
    : [
        'المقترح:',
        '- إضافة `README.ar.md` مترجمًا من README الحالي؛',
        '- وربطه من أعلى `README.md` (سطر لغات قصير مثلًا)؛',
        '- وأتولى مزامنته، ولا بأس بإزالته إن تأخر عن الأصل.',
      ];
  return {
    title: 'هل ترحبون بترجمة README إلى العربية؟',
    body: [
      'مرحبًا بالمشرفين،',
      '',
      `أود تقديم ترجمة عربية لملف README في ${slug} لتسهيل البدء على المطورين الناطقين بالعربية.`,
      '',
      'قبل فتح هذا الطلب:',
      `- بحثت في المشكلات وطلبات الدمج (المفتوحة والمغلقة) عن طلب سابق: ${input.searchUrl}`,
      arabicPolicyLine(input),
      '',
      ...proposal,
      '',
      'هل هذا مرحَّب به؟ إن فضّلتم اسمًا أو موضعًا أو طريقة ترجمة أخرى فأخبروني وألتزم بها. لن أفتح طلب دمج قبل موافقتكم.',
    ].join('\n'),
  };
}

/** صفحة مشكلة جديدة في المستودع بلا تعبئة: يفتحها المستخدم بنقره ويلصق المسودة بنفسه. */
export const newIssueUrl = (owner: string, repo: string): string => `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/new`;
