// فحص صياغة استعلام البحث قبل اعتماده (AC-H4): عوامل OR وAND وNOT والأقواس والاقتباس والمؤهِّلات وحدود GitHub.
// الحدود من توثيق GitHub REST للبحث (2026-10-23): ٢٥٦ حرفًا لا تُحسب منها المعاملات والمؤهِّلات، وخمسة معاملات AND/OR/NOT
// كحد أقصى. تُطبَّق هنا احتياطًا على استعلامات الواجهة أيضًا؛ ولم يُقَس سلوك واجهة الويب نفسها.
export type SearchType = 'repositories' | 'users' | 'issues';

export const MAX_OPERATORS = 5;
export const MAX_TEXT_LENGTH = 256;

export type IssueCode =
  | 'empty'
  | 'too-long'
  | 'too-many-operators'
  | 'unbalanced-quote'
  | 'unbalanced-parenthesis'
  | 'empty-parentheses'
  | 'dangling-operator'
  | 'adjacent-operators'
  | 'empty-qualifier'
  | 'lowercase-operator'
  | 'unknown-qualifier';

export interface QueryIssue {
  readonly code: IssueCode;
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

export interface QueryCheck {
  /** لا أخطاء (التحذيرات لا تمنع). */
  readonly ok: boolean;
  readonly issues: readonly QueryIssue[];
  readonly operators: number;
}

const COMMON = ['in', 'is', 'user', 'org', 'created', 'language', 'sort', 'type'];
const QUALIFIERS: Readonly<Record<SearchType, ReadonlySet<string>>> = {
  repositories: new Set([...COMMON, 'topic', 'topics', 'stars', 'forks', 'pushed', 'repo', 'license', 'size', 'followers', 'fork', 'archived', 'mirror', 'template', 'has', 'good-first-issues', 'help-wanted-issues', 'name', 'description', 'readme']),
  users: new Set([...COMMON, 'location', 'repos', 'followers', 'fullname', 'sponsorable']),
  issues: new Set([...COMMON, 'repo', 'label', 'state', 'author', 'assignee', 'mentions', 'comments', 'updated', 'closed', 'draft', 'no', 'milestone', 'project', 'head', 'base', 'reason']),
};

type Token = { kind: 'word'; text: string } | { kind: 'open' } | { kind: 'close' } | { kind: 'operator'; text: 'AND' | 'OR' | 'NOT' };

interface Tokenized {
  readonly tokens: Token[];
  readonly unbalancedQuote: boolean;
}

function tokenize(query: string): Tokenized {
  const tokens: Token[] = [];
  let word = '';
  let quoted = false;
  const flush = (): void => {
    if (!word) return;
    tokens.push(word === 'AND' || word === 'OR' || word === 'NOT' ? { kind: 'operator', text: word } : { kind: 'word', text: word });
    word = '';
  };
  for (const char of query) {
    if (char === '"') {
      quoted = !quoted;
      word += char;
    } else if (quoted) word += char;
    else if (/\s/.test(char)) flush();
    else if (char === '(') {
      flush();
      tokens.push({ kind: 'open' });
    } else if (char === ')') {
      flush();
      tokens.push({ kind: 'close' });
    } else word += char;
  }
  flush();
  return { tokens, unbalancedQuote: quoted };
}

const error = (code: IssueCode, message: string): QueryIssue => ({ code, severity: 'error', message });
const warning = (code: IssueCode, message: string): QueryIssue => ({ code, severity: 'warning', message });

/** طول النص الحر: بلا المعاملات والمؤهِّلات (key:value) كما يحسبه GitHub. */
function freeTextLength(tokens: readonly Token[]): number {
  return tokens.filter((t): t is Extract<Token, { kind: 'word' }> => t.kind === 'word' && !/^[\w.-]+:/.test(t.text)).reduce((sum, t) => sum + t.text.length, 0);
}

export function validateQuery(query: string, type: SearchType): QueryCheck {
  const issues: QueryIssue[] = [];
  const { tokens, unbalancedQuote } = tokenize(query);
  const operators = tokens.filter((t) => t.kind === 'operator').length;

  if (!query.trim()) issues.push(error('empty', 'الاستعلام فارغ.'));
  if (unbalancedQuote) issues.push(error('unbalanced-quote', 'علامة اقتباس مفتوحة لم تُغلق.'));
  if (operators > MAX_OPERATORS) issues.push(error('too-many-operators', `يتجاوز الاستعلام ${MAX_OPERATORS} معاملات (AND/OR/NOT)؛ يرفضه GitHub. قسّمه إلى استعلامين.`));
  if (freeTextLength(tokens) > MAX_TEXT_LENGTH) issues.push(error('too-long', `النص الحر أطول من ${MAX_TEXT_LENGTH} حرفًا.`));

  let depth = 0;
  let balanced = true;
  for (const token of tokens) {
    if (token.kind === 'open') depth += 1;
    else if (token.kind === 'close') {
      depth -= 1;
      if (depth < 0) balanced = false;
    }
  }
  if (depth !== 0 || !balanced) issues.push(error('unbalanced-parenthesis', 'أقواس غير متوازنة.'));

  tokens.forEach((token, i) => {
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    if (token.kind === 'open' && next?.kind === 'close') issues.push(error('empty-parentheses', 'أقواس فارغة.'));
    if (token.kind !== 'operator') return;
    const binary = token.text !== 'NOT';
    const startsOperand = (t: Token | undefined): boolean => t?.kind === 'word' || t?.kind === 'open' || (t?.kind === 'operator' && t.text === 'NOT');
    if (binary && (!prev || prev.kind === 'open' || prev.kind === 'operator')) {
      issues.push(error(prev?.kind === 'operator' ? 'adjacent-operators' : 'dangling-operator', `المعامل ${token.text} بلا طرف قبله.`));
    }
    if (!startsOperand(next)) {
      issues.push(error(next?.kind === 'operator' ? 'adjacent-operators' : 'dangling-operator', `المعامل ${token.text} بلا طرف بعده.`));
    }
  });

  const known = QUALIFIERS[type];
  for (const token of tokens) {
    if (token.kind !== 'word') continue;
    const match = /^(-?)([A-Za-z][\w-]*):(.*)$/.exec(token.text);
    if (match && match[3] === '') issues.push(error('empty-qualifier', `المؤهِّل ${match[2]}: بلا قيمة.`));
    else if (match && !known.has((match[2] as string).toLowerCase())) issues.push(warning('unknown-qualifier', `مؤهِّل غير معروف لبحث ${type}: ${match[2]}.`));
    if (/^(and|or|not)$/.test(token.text)) issues.push(warning('lowercase-operator', `«${token.text}» بأحرف صغيرة تُعامَل كلمة بحث لا معاملًا؛ اكتبها ${token.text.toUpperCase()}.`));
  }
  return { ok: !issues.some((i) => i.severity === 'error'), issues, operators };
}
