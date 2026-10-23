// بطاقة الشرح (F-B1 إلى F-B4): اسم المصطلح بصيغة «العربي (English)» والإنجليزي معزول dir="ltr" ولا خيار لإخفائه، ومستويات الشرح
// الثلاثة قابلة للتبديل، والمثال العملي، وبطاقة بيانات القرار بحقولها الخمسة، ورابط الوثيقة الرسمية وتنبيه ما لم يُطابَق عليها.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Tabs } from '../../../shared/ui';
import type { GlossaryEntry } from '../../../data/glossary/types';
import { DEFAULT_LEVEL, LEVELS, LEVEL_LABELS, decisionFields, docsLink, isUnverified } from './display';
import type { Level } from './display';

/** الإنجليزي معزول بـ<bdi dir="ltr" lang="en"> حيثما ظهر، فلا ينعكس ترتيب حروفه ولا علامات الترقيم حوله. */
export function En({ children }: { children: ComponentChildren }) {
  return (
    <bdi class="term-en" dir="ltr" lang="en">
      {children}
    </bdi>
  );
}

/** «العربي (English)». */
export function TermTitle({ entry }: { entry: Pick<GlossaryEntry, 'ar' | 'en'> }) {
  return (
    <span class="term" data-term={entry.en}>
      <span class="term-ar">{entry.ar}</span> (<En>{entry.en}</En>)
    </span>
  );
}

const PAREN_ENGLISH = /(\([A-Za-z][^()؀-ۿ]*\))/;

/** نص عربي يتضمن مصطلحات إنجليزية بين قوسين: كل «(English)» يُعزل dir="ltr". */
export function MixedText({ text }: { text: string }) {
  return (
    <>
      {text.split(PAREN_ENGLISH).map((part, i) =>
        PAREN_ENGLISH.test(part) ? (
          <En key={i}>{part}</En>
        ) : (
          part
        ),
      )}
    </>
  );
}

export interface ExplainCardProps {
  readonly entry: GlossaryEntry;
  readonly initialLevel?: Level;
  readonly onClose?: () => void;
  readonly idPrefix?: string;
}

export function ExplainCard({ entry, initialLevel = DEFAULT_LEVEL, onClose, idPrefix = 'mj-card' }: ExplainCardProps) {
  const [level, setLevel] = useState<Level>(initialLevel);
  const fields = decisionFields(entry);
  const docs = docsLink(entry);
  const unverified = isUnverified(entry);
  const titleId = `${idPrefix}-title`;
  return (
    <section class="card" role="dialog" aria-modal="false" aria-labelledby={titleId} data-entry={entry.id} data-safety={entry.safety} data-level={level} tabIndex={-1}>
      <header class="card-head">
        <h2 id={titleId}>
          <TermTitle entry={entry} />
        </h2>
        <span class="chip" data-safety={entry.safety}>
          {entry.safety}
        </span>
        {onClose && (
          <button type="button" class="btn icon-btn" data-action="close" aria-label="إغلاق الشرح" title="إغلاق (Esc)" onClick={() => onClose()}>
            ×
          </button>
        )}
      </header>
      <Tabs idPrefix={idPrefix} label="مستوى الشرح" tabs={LEVELS.map((id) => ({ id, title: LEVEL_LABELS[id] }))} selected={level} onSelect={(id) => setLevel(id as Level)}>
        <p class="level-text" data-level-text={level}>
          <MixedText text={entry[level]} />
        </p>
      </Tabs>
      {entry.example && (
        <div class="example" data-section="example">
          <h3>مثال عملي</h3>
          <p>
            <MixedText text={entry.example} />
          </p>
        </div>
      )}
      <dl class="decision" data-section="decision" aria-label="بيانات القرار">
        {fields.map((field) => (
          <div key={field.id} data-field={field.id} data-specified={field.specified ? 'true' : 'false'}>
            <dt>{field.label}</dt>
            <dd>
              <span class="value" data-value={field.id === 'safety' ? entry.safety : undefined}>
                <MixedText text={field.value} />
              </span>
              {field.detail && (
                <span class="muted small detail">
                  <MixedText text={field.detail} />
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {unverified && (
        <p class="notice" data-notice="unverified">
          لم تُطابَق الصلاحية وحدود التراجع في هذا الشرح على نص وثائق GitHub الرسمية بعد؛ تحقق منها في الوثيقة قبل الاعتماد عليها.
        </p>
      )}
      {docs && (
        <p class="docs">
          <a href={docs} target="_blank" rel="noopener noreferrer" data-action="docs">
            الوثيقة الرسمية على <En>docs.github.com</En>
          </a>
        </p>
      )}
    </section>
  );
}
