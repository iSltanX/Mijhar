// نافذة «تجهيز حزمة السياق» (T-6.1): قائمة اختيار تحكم ما يدخل الحزمة، ومعاينة تتجدد عند كل تبديل (PB-05)، وقسم إلزامي لما تعذّر
// جمعه أو اقتُطع لطوله يظهر هنا وفي الحزمة نفسها، والنسخ يدوي بنقر المستخدم (AD-06): لا إرسال إلى أي جهة.
// T-6.2: محدّد القوالب الأربعة، والمعاينة قابلة للتعديل اليدوي وما تحمله هو ما يُنسخ أو يُنزَّل `.md` (تعديلاتها لا يستبدلها تغيير الاختيار).
// T-6.3: لافتة البيانات الخاصة والفاحص التحذيري على نص المعاينة الحالي (بتعديلاتها)، ولا يغيّر الفاحص شيئًا منه.
// MJ22 (AD-33، I-1): زر التنزيل يقبل نقرة المستخدم الموثوقة وحدها (AD-27)؛ والنقر البرمجي من سكربت الصفحة لا ينزّل شيئًا.
import { useMemo, useRef, useState } from 'preact/hooks';
import { isTrustedActivation } from '../../../shared/ui/user-activation';
import { GAPS_HEADING, ITEM } from '../context';
import type { ContextSource, Gap, Snippet } from '../context';
import { PrivacyCheck, scanText } from '../privacy-check';
import type { Finding } from '../privacy-check';
import { TEMPLATES, bundleFileName, renderTemplate } from '../templates';
import type { TemplateId } from '../templates';
import { availableItems, buildBundle } from './build';
import type { Limits } from './build';

export type CopyResult = 'copied' | 'failed';
/** «downloaded» يعني أن التنزيل طُلب من المتصفح، لا أن الملف وصل مجلد التنزيلات (لا يُعرف ذلك من الصفحة). */
export type DownloadResult = 'downloaded' | 'failed';

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
  /** ينزّل النص ملف `.md` باسمه، محليًا بلا شبكة. غيابه يعطّل الزر. */
  readonly download?: (text: string, fileName: string) => Promise<DownloadResult>;
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
  const [template, setTemplate] = useState<TemplateId | 'none'>('none');
  // المولَّد دالة نقية من الاختيار والقالب؛ والمعدَّل يدويًا (إن وُجد) يحجبه إلى أن يُطلب استبداله.
  const generated = useMemo(
    () => (template === 'none' ? buildBundle(source, snippets, selected, props.limits, props.collectedAt) : renderTemplate(template, source, snippets, selected, props.limits, props.collectedAt)),
    [template, source, snippets, selected, props.limits, props.collectedAt],
  );
  const [edited, setEdited] = useState<string | null>(null);
  const text = edited ?? generated.text;
  const findings = useMemo(() => scanText(text), [text]);
  const previewRef = useRef<HTMLTextAreaElement>(null);
  const [copyState, setCopyState] = useState<CopyResult | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadResult | null>(null);
  const resetNotices = () => {
    setCopyState(null);
    setDownloadState(null);
  };

  const toggle = (id: string) => {
    resetNotices();
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const setComments = (on: boolean) => {
    resetNotices();
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
    setDownloadState(null);
    props.copy(text).then(setCopyState, () => setCopyState('failed'));
  };
  const download = () => {
    setCopyState(null);
    props.download?.(text, bundleFileName(source, template === 'none' ? null : template)).then(setDownloadState, () => setDownloadState('failed'));
  };
  const onInput = (event: Event) => {
    const value = (event.currentTarget as HTMLTextAreaElement).value;
    resetNotices();
    setEdited(value === generated.text ? null : value);
  };
  const pickTemplate = (id: TemplateId | 'none') => {
    resetNotices();
    setTemplate(id);
  };
  /** يحدد الموضع المرصود في حقل المعاينة ليحذفه المستخدم أو يعدّله بيده. */
  const selectFinding = (finding: Finding) => {
    const area = previewRef.current;
    if (!area) return;
    area.focus();
    area.setSelectionRange(finding.start, finding.end);
    area.scrollTop = Math.max(0, (finding.start / Math.max(1, area.value.length)) * area.scrollHeight - area.clientHeight / 2);
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
          <fieldset class="e-templates" data-templates="">
            <legend>القالب</legend>
            <label class="e-choice">
              <input type="radio" name="mj-e-template" data-template="none" checked={template === 'none'} onChange={() => pickTemplate('none')} />
              <span>حزمة عامة (بلا قالب)</span>
            </label>
            {TEMPLATES.map((t) => (
              <label class="e-choice" key={t.id}>
                <input type="radio" name="mj-e-template" data-template={t.id} checked={template === t.id} onChange={() => pickTemplate(t.id)} />
                <span>{t.label}</span>
              </label>
            ))}
          </fieldset>
          <label for="mj-e-preview">المعاينة (قابلة للتعديل؛ تُنسخ أو تُنزَّل كما هي)</label>
          <textarea id="mj-e-preview" ref={previewRef} dir="auto" spellcheck={false} data-preview="" value={text} onInput={onInput} />
          {edited !== null && (
            <p class="notice" role="status" data-edited="">
              المعاينة معدَّلة يدويًا: تغيير القالب أو الاختيار لا يبدّل نصها.{' '}
              <button
                type="button"
                class="e-link"
                data-action="builder-regenerate"
                onClick={() => {
                  resetNotices();
                  setEdited(null);
                }}
              >
                استبدلها بالنص المولَّد وتجاهل تعديلاتي
              </button>
            </p>
          )}
          <PrivacyCheck text={text} findings={findings} onSelect={selectFinding} />
          <div class="row">
            <button type="button" class="btn btn-primary" data-action="builder-copy" onClick={copy}>
              انسخ الحزمة
            </button>
            <button type="button" class="btn" data-action="builder-download" disabled={!props.download} onClick={(event) => isTrustedActivation(event) && download()}>
              نزّل كملف .md
            </button>
            <button type="button" class="btn" data-action="builder-recollect" onClick={props.onRecollect}>
              أعد الجمع من الصفحة
            </button>
          </div>
          {copyState && (
            <p class="notice" data-tone={copyState === 'failed' ? 'danger' : undefined} role="status" data-copy-state={copyState}>
              {copyState === 'copied'
                ? `نُسخت الحزمة إلى الحافظة. لم تُرسل إلى أي جهة.${findings.length ? ` وفيها ${findings.length} من الأنماط المشبوهة لم يُحذف منها شيء: راجعها قبل اللصق.` : ''}`
                : 'تعذّر النسخ تلقائيًا: حدّد نص المعاينة وانسخه يدويًا.'}
            </p>
          )}
          {downloadState && (
            <p class="notice" data-tone={downloadState === 'failed' ? 'danger' : undefined} role="status" data-download-state={downloadState}>
              {downloadState === 'downloaded'
                ? `طُلب من المتصفح تنزيل الملف ${bundleFileName(source, template === 'none' ? null : template)}. لم تُرسل الحزمة إلى أي جهة.${findings.length ? ` وفيها ${findings.length} من الأنماط المشبوهة لم يُحذف منها شيء: راجعها قبل مشاركة الملف.` : ''}`
                : 'تعذّر التنزيل: انسخ نص المعاينة يدويًا.'}
            </p>
          )}
        </div>
      </div>

      <section class="e-gaps" aria-labelledby="mj-e-gaps-title" data-gaps="">
        <h4 id="mj-e-gaps-title">{GAPS_HEADING}</h4>
        {generated.gaps.length ? (
          <ul>
            {generated.gaps.map((gap, i) => (
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
