// بطاقة «ملاحظاتي» في الصفحة: شريط هادئ مطوي افتراضيًا يعرض عدد ملاحظات الصفحة، ويُفتح إلى مساحة العمل (NotesWorkspace).
import type { ComponentChildren } from 'preact';
import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import type { SettingsStore } from '../../../../core/settings';
import type { PageInfo } from '../../../../shared/page';
import { useSetting } from '../../../../shared/ui/useSetting';
import { useStyles } from '../../../../shared/ui/useStyles';
import type { NotesRepository } from '../repository';
import { NOTES_PAGE_CARD_KEY } from '../settings';
import { notesForPage, targetOptions } from '../targets';
import type { LineTarget, Note } from '../types';
import { NotesWorkspace, useNotes } from './NotesWorkspace';
import { NOTES_CSS, NOTES_STYLE_ID } from './styles';

export interface PageCardProps {
  readonly repository: NotesRepository;
  readonly settings: SettingsStore;
  readonly page: PageInfo;
  readonly locate: (target: LineTarget) => boolean;
  /** ملاحظة تُبرز وتُفتح البطاقة عليها (من نقر علامة سطر). */
  readonly highlightId: string | null;
  /** يزداد عند كل طلب فتح، فيُفتح حتى لو لم تتغير الملاحظة المبرزة. */
  readonly openRequest: number;
  /** مرساة السطر (T-8.3): حفظها بعد الإنشاء، وعرض نتيجة إعادة التثبيت. */
  readonly onCreated?: (note: Note) => void;
  readonly renderAnchor?: (note: Note) => ComponentChildren;
}

export function PageCard({ repository, settings, page, locate, highlightId, openRequest, onCreated, renderAnchor }: PageCardProps) {
  const root = useRef<HTMLDivElement>(null);
  useStyles(root, NOTES_STYLE_ID, NOTES_CSS);
  const enabled = useSetting<boolean>(settings, NOTES_PAGE_CARD_KEY);
  const notes = useNotes(repository);
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const total = useMemo(() => notesForPage(notes, page).total, [notes, page]);
  const hasTargets = useMemo(() => targetOptions(page).length > 0, [page]);

  useEffect(() => {
    if (openRequest > 0) setExpanded(true);
  }, [openRequest]);

  // الغلاف حاضر دائمًا ليثبت الجذر الأنماط قبل أول ظهور للبطاقة.
  return (
    <div ref={root} data-notes-slot="">
      {enabled && hasTargets && (
        <section class="notes-card" aria-label="ملاحظاتي الخاصة" data-expanded={expanded ? 'true' : 'false'}>
          <button type="button" class="card-bar" aria-expanded={expanded ? 'true' : 'false'} aria-controls={bodyId} onClick={() => setExpanded(!expanded)}>
            <span>ملاحظاتي على هذه الصفحة</span>
            <span class="count" {...(total > 0 ? { 'data-has': '' } : {})} aria-label={`${total} ملاحظة`}>
              {total}
            </span>
          </button>
          {expanded && (
            <div class="card-body" id={bodyId}>
              <NotesWorkspace
                repository={repository}
                page={page}
                mode="card"
                locate={locate}
                highlightId={highlightId}
                {...(onCreated ? { onCreated } : {})}
                {...(renderAnchor ? { renderAnchor } : {})}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
