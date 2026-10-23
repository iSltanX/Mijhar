// تفسير موانع الدمج بالأدلة المرصودة وحدها (T-5.2، F-D3، AC-D3). كل مانع يُبنى بـblocker() التي ترفض مانعًا بلا دليل؛ والدليل نصٌّ
// منقول من صندوق الدمج أو الترويسة أو صف فحص، أو حقل من API بقيمته ومساره. ولا عبارة تجزم بإمكان الدمج: غياب المانع في الأدلة يُقال
// كما هو، ومعه دائمًا التنبيه المنهجي METHOD_NOTICE.
//  - «يمنع» (blocks): الدليل نفسه يقول إن الدمج ممنوع أو مشروط (تعارض يجب حله، مراجعة مطلوبة، فحص إلزامي لم ينجح، مسودة،
//    mergeable_state = dirty أو blocked أو draft).
//  - «قد يمنع» (may-block): الدليل لا يحسم (تأخر الفرع، طلب تغييرات، فحوص فاشلة لا يُعرف أهي إلزامية، mergeable_state = behind).
// قيم mergeable_state في REST لا تسردها وثيقة REST؛ وتقابلها قيم MergeStateStatus الموثقة في GraphQL (BEHIND وBLOCKED وCLEAN وDIRTY
// وDRAFT وHAS_HOOKS وUNKNOWN وUNSTABLE)، ورصدت T-0.3 منها clean وunstable وdirty وunknown. ما سواها يُعرض بقيمته ولا يُفسَّر.
import type { SelectorsRegistry } from '../../../core';
import { CATEGORY_LABELS } from '../pr-status/categories';
import type { CheckItem, PrSummary } from '../pr-status/summary';
import { squash } from '../pr-status/value';
import type { ApiPrData } from './api-read';

export const METHOD_NOTICE = 'نجاح الفحوص الآلية يقتصر على ما تغطيه اختبارات CI، ولا يعني جاهزية المشروع أو الإصدار دون مراجعة بشرية.';

export type Certainty = 'blocks' | 'may-block';

export interface Evidence {
  readonly source: 'dom' | 'api';
  /** أين قُرئ: «صندوق الدمج» أو «ترويسة الطلب» أو مسار API. */
  readonly where: string;
  /** النص المنقول كما هو، أو «الحقل = القيمة». */
  readonly text: string;
}

export interface Blocker {
  readonly id: string;
  readonly title: string;
  readonly certainty: Certainty;
  readonly evidence: readonly Evidence[];
}

export interface BlockersReport {
  /** explained: قُرئت أدلة؛ closed: الطلب مدموج أو مغلق؛ unavailable: لا صندوق دمج ولا API ولا دليل آخر. */
  readonly state: 'explained' | 'closed' | 'unavailable';
  readonly blockers: readonly Blocker[];
  readonly attention: readonly Blocker[];
  readonly notes: readonly string[];
  readonly sources: readonly ('dom' | 'api')[];
}

/** يبني مانعًا، أو null إن لم يكن معه دليل: لا يُعرض سبب بلا دليل. */
export function blocker(id: string, title: string, certainty: Certainty, evidence: readonly Evidence[]): Blocker | null {
  const real = evidence.filter((e) => e.text.trim().length > 0);
  return real.length ? { id, title, certainty, evidence: real } : null;
}

const MERGEBOX = 'صندوق الدمج';
const HEADER = 'ترويسة الطلب';

interface Phrase {
  readonly id: string;
  readonly title: string;
  readonly certainty: Certainty;
  readonly re: RegExp;
}

// عبارات صندوق الدمج: رصدت T-0.3 «This branch has conflicts that must be resolved» و«Review required»؛ والبقية عبارات واجهة GitHub
// الشائعة غير المُحقَّقة على صفحة حية (fixture-pr-complex.html)، فتُطابق حرفيًا ولا يُستنتج غيرها.
const MERGEBOX_PHRASES: readonly Phrase[] = [
  { id: 'conflicts', title: 'تعارض مع فرع الهدف يجب حله', certainty: 'blocks', re: /This branch has conflicts that must be resolved/i },
  { id: 'merging-blocked', title: 'يعلن GitHub أن الدمج ممنوع', certainty: 'blocks', re: /Merging is blocked[^.]*/i },
  { id: 'review-required', title: 'مراجعة معتمِدة مطلوبة قبل الدمج', certainty: 'blocks', re: /At least \d+ approving reviews? (?:is|are) required[^.]*|Review required/i },
  { id: 'changes-requested', title: 'طلب مراجعٌ تغييرات', certainty: 'may-block', re: /Changes requested/i },
  { id: 'behind', title: 'فرع المصدر متأخر عن الهدف', certainty: 'may-block', re: /This branch is out-of-date with the base branch|out-of-date with the base branch/i },
];

export interface DomEvidence {
  readonly mergebox: Element | null;
  /** شارة الحالة: data-status ونصها. */
  readonly stateLabel: { readonly status: string | null; readonly text: string } | null;
}

export function readDomEvidence(doc: Document, selectors: SelectorsRegistry): DomEvidence {
  const label = selectors.resolve(doc, 'd.pr.state')?.element ?? null;
  return {
    mergebox: selectors.resolve(doc, 'd.pr.mergebox')?.element ?? null,
    stateLabel: label ? { status: label.getAttribute('data-status'), text: squash(label.textContent) } : null,
  };
}

/** النص المنقول لعبارة في صندوق الدمج: أصغر عنصر يحملها (عنوان أو فقرة)، لا الصندوق كله. */
function quote(box: Element, re: RegExp): string | null {
  const candidates = [...box.querySelectorAll('h2, h3, h4, h5, p, span, div, li')].filter((el) => re.test(squash(el.textContent)));
  const smallest = candidates.sort((a, b) => squash(a.textContent).length - squash(b.textContent).length)[0];
  const text = squash(smallest?.textContent ?? (re.test(squash(box.textContent)) ? re.exec(squash(box.textContent))?.[0] : ''));
  return text ? (text.length > 240 ? `${text.slice(0, 240)}…` : text) : null;
}

const rowText = (item: CheckItem): string => `${item.name}${item.detail ? ` — ${item.detail}` : ''}${item.required ? ' (Required)' : ''}`;

const whereOf = (item: CheckItem, api: ApiPrData | null): string => {
  if (item.source === 'api') return api?.requests[1] ?? 'GitHub API';
  return item.source === 'mergebox' ? MERGEBOX : 'جزء status-details لالتزام الرأس';
};

export function explainBlockers(summary: PrSummary, dom: DomEvidence, api: ApiPrData | null): BlockersReport {
  const found = new Map<string, { title: string; certainty: Certainty; evidence: Evidence[] }>();
  const notes: string[] = [];
  const add = (b: Blocker | null): void => {
    if (!b) return;
    const prev = found.get(b.id);
    if (prev) {
      for (const e of b.evidence) if (!prev.evidence.some((p) => p.source === e.source && p.text === e.text)) prev.evidence.push(e);
      if (b.certainty === 'blocks') prev.certainty = 'blocks';
    } else found.set(b.id, { title: b.title, certainty: b.certainty, evidence: [...b.evidence] });
  };
  const sources = new Set<'dom' | 'api'>(['dom']);
  const pull = api?.pull.available ? api.pull.value : null;
  if (pull) sources.add('api');

  // الطلب المدموج أو المغلق لا يُفسَّر منع دمجه.
  const state = summary.state.available ? summary.state.value : null;
  if (state === 'merged' || state === 'closed' || pull?.merged || pull?.state === 'closed') {
    return { state: 'closed', blockers: [], attention: [], notes: [state === 'merged' || pull?.merged ? 'الطلب مدموج؛ لا موانع دمج تُفسَّر.' : 'الطلب مغلق؛ لا موانع دمج تُفسَّر.'], sources: [...sources] };
  }

  // المسودة: الترويسة أو API.
  if (dom.stateLabel && (dom.stateLabel.status === 'pullDraft' || /^draft\b/i.test(dom.stateLabel.text))) {
    add(blocker('draft', 'الطلب مسودة، ولا تُدمج المسودة قبل إعلانها جاهزة للمراجعة', 'blocks', [{ source: 'dom', where: HEADER, text: `شارة الحالة: ${dom.stateLabel.text || dom.stateLabel.status}` }]));
  }
  const pullPath = api?.requests[0] ?? 'GitHub API';
  if (pull?.draft) add(blocker('draft', 'الطلب مسودة، ولا تُدمج المسودة قبل إعلانها جاهزة للمراجعة', 'blocks', [{ source: 'api', where: pullPath, text: 'draft = true' }]));

  // صندوق الدمج (للمسجَّل).
  if (dom.mergebox) {
    for (const phrase of MERGEBOX_PHRASES) {
      const text = quote(dom.mergebox, phrase.re);
      if (text) add(blocker(phrase.id, phrase.title, phrase.certainty, [{ source: 'dom', where: MERGEBOX, text }]));
    }
  }

  // طلب التغييرات من قائمة المراجعين في الشريط الجانبي (تظهر لكل زائر)، حين لا يذكره صندوق الدمج.
  if (summary.reviews.available && summary.reviews.value.state === 'changes-requested' && summary.reviews.value.source === 'sidebar') {
    add(blocker('changes-requested', 'طلب مراجعٌ تغييرات', 'may-block', [{ source: 'dom', where: 'قائمة المراجعين في الشريط الجانبي', text: summary.reviews.value.evidence }]));
  }

  // mergeable_state من API بقيمتها.
  if (pull) {
    const field = `mergeable_state = ${pull.mergeableState ?? 'null'}`;
    const ev: Evidence[] = [{ source: 'api', where: pullPath, text: field }];
    switch (pull.mergeableState) {
      case 'dirty':
        add(blocker('conflicts', 'تعارض مع فرع الهدف يجب حله', 'blocks', ev));
        break;
      case 'blocked':
        add(blocker('protection', 'تمنعه قواعد حماية الفرع (مراجعة أو فحص إلزامي أو قاعدة أخرى؛ لا يحدد الحقل أيها)', 'blocks', ev));
        break;
      case 'draft':
        add(blocker('draft', 'الطلب مسودة، ولا تُدمج المسودة قبل إعلانها جاهزة للمراجعة', 'blocks', ev));
        break;
      case 'behind':
        add(blocker('behind', 'فرع المصدر متأخر عن الهدف', 'may-block', ev));
        break;
      case 'unstable':
        notes.push(`فحوص غير إلزامية لم تنجح بحسب API (${field})؛ لا تمنع الدمج وحدها.`);
        break;
      case 'clean':
      case 'has_hooks':
        notes.push(`لا تعلن API مانعًا (${field}).`);
        break;
      case 'unknown':
      case null:
        notes.push(`لم يحسب GitHub قابلية الدمج بعد (${field})؛ أعد القراءة بعد قليل.`);
        break;
      default:
        notes.push(`قيمة غير مفسَّرة في API (${field})؛ تُعرض كما هي.`);
    }
  }

  // الفحوص: الإلزامي غير الناجح يمنع؛ والفاشل بلا معرفة الإلزام «قد يمنع»؛ والفاشل غير الإلزامي ملاحظة.
  const items = summary.checks.items;
  const requiredBad = items.filter((i) => i.required === true && (i.classification.category === 'failure' || i.classification.category === 'cancelled'));
  const requiredPending = items.filter((i) => i.required === true && (i.classification.category === 'running' || i.classification.category === 'not-run'));
  const requiredUnknown = items.filter((i) => i.required === true && i.classification.category === 'unknown');
  const evidenceOf = (list: readonly CheckItem[]): Evidence[] => list.map((i) => ({ source: i.source === 'api' ? 'api' : 'dom', where: whereOf(i, api), text: `${rowText(i)} — ${CATEGORY_LABELS[i.classification.category]}` }));
  add(blocker('required-failed', 'فحص إلزامي لم ينجح', 'blocks', evidenceOf(requiredBad)));
  add(blocker('required-pending', 'فحص إلزامي لم يكتمل بعد', 'blocks', evidenceOf(requiredPending)));
  add(blocker('required-unknown', 'فحص إلزامي حالته غير معروفة', 'may-block', evidenceOf(requiredUnknown)));
  const requiredKnown = summary.checks.requiredKnown || Boolean(api?.required.available && api.required.value.length);
  const failing = items.filter((i) => i.required !== true && (i.classification.category === 'failure' || i.classification.category === 'cancelled'));
  if (failing.length) {
    if (requiredKnown) notes.push(`فحوص لم تنجح وليست إلزامية بحسب ${summary.checks.requiredKnown ? 'صندوق الدمج' : 'حماية الفرع في API'}: ${failing.map((i) => i.name).join('، ')}.`);
    else add(blocker('failing-unknown-required', 'فحوص لم تنجح، ولا تعرض الأدلة أيها إلزامي', 'may-block', evidenceOf(failing)));
  }

  const all = [...found.entries()].map(([id, b]) => ({ id, ...b }));
  const blockers = all.filter((b) => b.certainty === 'blocks');
  const attention = all.filter((b) => b.certainty === 'may-block');
  const hasEvidenceSource = Boolean(dom.mergebox) || Boolean(pull);
  if (!hasEvidenceSource) {
    notes.push('صندوق الدمج لا يعرضه GitHub لغير المسجَّل، وبيانات API العامة لم تُقرأ؛ فموانع المراجعة والتعارض والحماية غير متاحة من الأدلة الحالية.');
  }
  return {
    state: hasEvidenceSource || blockers.length || attention.length ? 'explained' : 'unavailable',
    blockers,
    attention,
    notes,
    sources: [...sources],
  };
}
