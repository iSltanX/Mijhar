// نافذة «تجهيز حزمة السياق» (T-6.1): قائمة اختيار تحكم ما يدخل الحزمة، ومعاينة تتجدد عند كل تبديل (PB-05)، وقسم إلزامي لما تعذّر
// جمعه أو اقتُطع لطوله يظهر هنا وفي الحزمة نفسها، والنسخ يدوي بنقر المستخدم (AD-06): لا إرسال إلى أي جهة.
import { useMemo, useState } from 'preact/hooks';
import type { ContextSource, Gap } from './collect';
import { GAPS_HEADING, ITEM, availableItems, buildBundle } from './build';
import type { Limits, Snippet } from './build';

export type CopyResult = 'copied' | 'failed';

export interface BuilderPanelProps {
  readonly source: ContextSource;
  readonly snippets: readonly Snippet[];
  /** هل في الصفحة نص محدد يمكن إضافته مقتطفًا. */
  readonly canAddSelection: boolean;
  readonly onAddSelection: () => void;
  readonly onRemoveSnippet: (id: string) => void;
  readonly onRecollect: () => void;
  /** ينسخ النص في معالج النقر نفسه (فعل المستخدم). */
  readonly copy: (text: string) => Promise<CopyResult>;
  readonly limits?: Limits;
  readonly collectedAt?: number;
}

const firstLine = (text: string, max = 70): string => {
  const line = text.split('\n').find((l) => l.trim()) ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

const KIND_LABEL: Readonly<Record<Gap['kind'], string>> = { collapsed: 'مطوي', 'not-loaded': 'غير محمّل', unavailable: 'غير متاح', truncated: 'اقتُطع' };

function Choice({ id, label, checked, disabled = false, onToggle }: { id: string; label: string; checked: boolean; disabled?: boolean; onToggle: (id: string) => void }) {
  return (
    <label class="e-choice" data-disabled={disabled ? 'true' : undefined}>
      <input type="checkbox" data-item={id} checked={checked && !disabled} disabled={disabled} onChange={() => onToggle(id)} />
      <span>{label}</span>
    </label>
  );
}

export function BuilderPanel(props: BuilderPanelProps) {
  const { source, snippets } = props;
  const all = useMemo(() => availableItems(source, snippets), [source, snippets]);
  // الافتراضي: كل المتاح مختار؛ والمقتطف الجديد يدخل مختارًا.
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const selected = useMemo(() => new Set(all.filter((id) => !excluded.has(id))), [all, excluded]);
  const bundle = useMemo(() => buildBundle(source, snippets, selected, props.limits, props.collectedAt), [source, snippets, selected, props.limits, props.collectedAt]);
  const [copyState, setCopyState] = useState<CopyResult | null>(null);

  const toggle = (id: string) => {
    setCopyState(null);
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const setComments = (on: boolean) => {
    setCopyState(null);
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const c of source.comments) {
        if (on) next.delete(ITEM.comment(c.id));
        else next.add(ITEM.comment(c.id));
      }
      return next;
    });
  };
  const copy = () => {
    props.copy(bundle.text).then(setCopyState, () => setCopyState('failed'));
  };

  const is = (id: string) => selected.has(id);
  const branchLabel = source.branch ? `الفرع والالتزام (${source.branch.head ?? 'غير متاح'} ← ${source.branch.base ?? 'غير متاح'}${source.branch.headSha ? ` · ${source.branch.headSha.slice(0, 7)}` : ''})` : 'الفرع والالتزام';

  return (
    <div class="e-window" role="region" aria-labelledby="mj-e-builder-title" data-builder-window="">
      <h3 id="mj-e-builder-title">تجهيز حزمة السياق</h3>
      <div class="e-grid">
        <fieldset class="e-choices" data-choices="">
          <legend>ما يدخل الحزمة</legend>
          <Choice id={ITEM.repo} label={`المستودع والرابط${source.repo ? ` (${source.repo})` : ''}`} checked={is(ITEM.repo)} disabled={!source.repo} onToggle={toggle} />
          {source.kind === 'pr' && <Choice id={ITEM.branch} label={branchLabel} checked={is(ITEM.branch)} disabled={!source.branch} onToggle={toggle} />}
          <Choice id={ITEM.title} label="العنوان" checked={is(ITEM.title)} disabled={!source.title} onToggle={toggle} />
          {source.kind !== 'job' && <Choice id={ITEM.description} label="الوصف" checked={is(ITEM.description)} disabled={!source.description} onToggle={toggle} />}

          {source.kind !== 'job' && (
            <>
              <div class="e-group" data-group="comments">
                <span>التعليقات ({source.comments.length})</span>
                {source.comments.length > 0 && (
                  <>
                    <button type="button" class="e-link" data-action="comments-all" onClick={() => setComments(true)}>
                      الكل
                    </button>
                    <button type="button" class="e-link" data-action="comments-none" onClick={() => setComments(false)}>
                      لا شيء
                    </button>
                  </>
                )}
              </div>
              {source.comments.length === 0 && <span class="muted small">لا تعليقات ظاهرة في الصفحة.</span>}
              {source.comments.map((c) => (
                <Choice key={c.id} id={ITEM.comment(c.id)} label={`${c.author ?? 'بلا اسم'}: ${firstLine(c.text)}`} checked={is(ITEM.comment(c.id))} onToggle={toggle} />
              ))}
            </>
          )}

          {source.kind !== 'issue' && (
            <>
              <div class="e-group">الفحوص</div>
              <Choice id={ITEM.checks} label={source.kind === 'job' ? 'خطوات المهمة ونتائجها' : 'نتائج الفحوص'} checked={is(ITEM.checks)} disabled={!source.checks} onToggle={toggle} />
              <Choice id={ITEM.error} label="مقتطف الخطأ" checked={is(ITEM.error)} disabled={!source.errorExcerpt.length} onToggle={toggle} />
            </>
          )}

          <div class="e-group" data-group="snippets">مقتطفات الأدلة ({snippets.length})</div>
          {snippets.map((s, i) => (
            <div class="e-snippet" key={s.id}>
              <Choice id={ITEM.snippet(s.id)} label={`${i + 1}. من ${s.where}: ${firstLine(s.text, 50)}`} checked={is(ITEM.snippet(s.id))} onToggle={toggle} />
              <button type="button" class="e-link" data-action="snippet-remove" aria-label={`احذف المقتطف ${i + 1}`} onClick={() => props.onRemoveSnippet(s.id)}>
                احذف
              </button>
            </div>
          ))}
          <div class="row">
            <button type="button" class="btn" data-action="snippet-add" disabled={!props.canAddSelection} onClick={props.onAddSelection}>
              أضف النص المحدد في الصفحة
            </button>
          </div>
          {!props.canAddSelection && <span class="muted small">حدّد نصًا في الصفحة (سطر سجل أو جزءًا من تعليق) ليُضاف مقتطفًا.</span>}
        </fieldset>

        <div class="e-preview">
          <label for="mj-e-preview">المعاينة (تُنسخ كما هي)</label>
          <textarea id="mj-e-preview" readOnly dir="auto" data-preview="" value={bundle.text} />
          <div class="row">
            <button type="button" class="btn btn-primary" data-action="builder-copy" onClick={copy}>
              انسخ الحزمة
            </button>
            <button type="button" class="btn" data-action="builder-recollect" onClick={props.onRecollect}>
              أعد الجمع من الصفحة
            </button>
          </div>
          {copyState && (
            <p class="notice" data-tone={copyState === 'failed' ? 'danger' : undefined} role="status" data-copy-state={copyState}>
              {copyState === 'copied' ? 'نُسخت الحزمة إلى الحافظة. لم تُرسل إلى أي جهة.' : 'تعذّر النسخ تلقائيًا: حدّد نص المعاينة وانسخه يدويًا.'}
            </p>
          )}
        </div>
      </div>

      <section class="e-gaps" aria-labelledby="mj-e-gaps-title" data-gaps="">
        <h4 id="mj-e-gaps-title">{GAPS_HEADING}</h4>
        {bundle.gaps.length ? (
          <ul>
            {bundle.gaps.map((gap, i) => (
              <li key={`${gap.part}-${i}`} data-gap-kind={gap.kind}>
                <strong>{gap.part}</strong> <span class="e-tag">{KIND_LABEL[gap.kind]}</span> {gap.reason}
                {gap.cut ? ` — حُذف ${gap.cut.lines} سطرًا من ${gap.cut.of}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p data-gaps-none="">لا شيء: جُمع كل ما اختير كاملًا من الصفحة.</p>
        )}
      </section>
    </div>
  );
}
