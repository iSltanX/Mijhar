// واجهة الوحدة (ز) في تبويب «ملاحظاتي وأكمل لاحقًا» من اللوحة الأصلية والدرج: مساحة العمل نفسها على الصفحة المفتوحة.
// الدرج يرى DOM الصفحة (مصدر المستند)، واللوحة الأصلية ترى رابط التبويب النشط وحده (مصدر التبويبات).
import { useMemo } from 'preact/hooks';
import { NativeOnlyNotice } from '../../../shared/ui/NativeOnlyNotice';
import type { PanelView, PanelViewProps } from '../../../sidepanel/views';
import { documentPageSource, extensionTabs, pageInfoFromUrl, repoSlug, tabsPageSource, useActivePage } from '../../../shared/page';
import type { PageSource } from '../../../shared/page';
import { useNotesContext } from './context';
import { NotesWorkspace, useNotes } from './ui/NotesWorkspace';
import type { NotesRepository } from './repository';

export interface NotesViewOptions {
  /** مصدر الصفحة. الافتراضي: المستند في الدرج، والتبويب النشط في اللوحة الأصلية. */
  readonly source?: (surface: PanelViewProps['surface']) => PageSource | null;
}

const defaultSource = (surface: PanelViewProps['surface']): PageSource | null => (surface === 'drawer' ? documentPageSource(document) : tabsPageSource(extensionTabs()));

function Loaded({ repository, surface, source }: { repository: NotesRepository; surface: PanelViewProps['surface']; source: PageSource | null }) {
  const { page, ready } = useActivePage(source);
  const notes = useNotes(repository);
  if (!ready) {
    return (
      <p class="muted" role="status" data-notes-state="loading">
        جارٍ قراءة الصفحة المفتوحة…
      </p>
    );
  }
  const current = page ?? pageInfoFromUrl('about:blank');
  const slug = repoSlug(current);
  return (
    <div data-notes-view={surface}>
      <p class="muted small" data-notes-page="">
        {slug ? (
          <>
            الصفحة المفتوحة: <span class="ltr-inline mono">{slug}</span>
          </>
        ) : (
          <>لديك {notes.length} ملاحظة محفوظة في هذا المتصفح.</>
        )}
      </p>
      <NotesWorkspace repository={repository} page={current} mode="panel" />
      <p class="muted small" data-notes-privacy="">
        ملاحظاتك محفوظة محليًا في هذا المتصفح ولا تُنشر ولا تُرسل إلى أي جهة.
      </p>
    </div>
  );
}

export function createNotesView(options: NotesViewOptions = {}) {
  return function NotesView({ surface }: PanelViewProps) {
    const state = useNotesContext();
    const source = useMemo(() => (options.source ?? defaultSource)(surface), [surface]);
    if (state.status === 'loading') {
      return (
        <p class="muted" role="status" data-notes-state="loading">
          جارٍ فتح الملاحظات…
        </p>
      );
    }
    if (state.status === 'error') {
      return (
        <p class="notice" data-tone="danger" role="alert">
          تعذّر فتح الملاحظات: {state.message}
        </p>
      );
    }
    return <Loaded repository={state.context.repository} surface={surface} source={source} />;
  };
}

export const NotesView = createNotesView();

// الدرج المحقون لا يعرض حقول كتابة: التحرير في اللوحة الأصلية، وفي الدرج رسالة تدل عليه (والبطاقة في الصفحة نفسها تبقى).
export const NOTES_PANEL_VIEW: PanelView = { id: 'g-notes', tab: 'notes', unit: 'g', title: 'ملاحظاتي', surfaces: ['native'], component: NotesView };

function NotesDrawerNotice() {
  return <NativeOnlyNotice feature="ملاحظاتي" extra="ملاحظاتك على الصفحة المفتوحة تظهر وتُحرَّر أيضًا في بطاقة «ملاحظاتي» أعلى الصفحة نفسها." />;
}

export const NOTES_DRAWER_VIEW: PanelView = { id: 'g-notes-drawer', tab: 'notes', unit: 'g', title: 'ملاحظاتي', surfaces: ['drawer'], component: NotesDrawerNotice };
