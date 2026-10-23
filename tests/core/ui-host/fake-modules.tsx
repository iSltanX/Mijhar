// ثماني وحدات وهمية (أ–ح) تركّب كلٌّ منها سطح Shadow DOM عبر mountSurface: تُستعمل في vitest وفي الإضافة الاختبارية
// لتجارب المتصفحات (TEST-CORE-05 وTEST-CORE-06). لا تُشحن.
import { useEffect } from 'preact/hooks';
import { UNITS, mountSurface } from '../../../src/core';
import type { ExtensionModule, UnitInfo } from '../../../src/core';

export const FAKE_ATTR = 'data-fake-unit';

/** عدّاد يرصد فك مكوّنات Preact عند إيقاف الوحدة (render(null) قبل إزالة المضيف). */
export const fakeLifecycle = { mounted: new Map<string, number>(), cleaned: new Map<string, number>() };

const FAKE_CSS = `
.fake { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--mijhar-border-default); border-radius: 6px; background: var(--mijhar-bg-subtle); }
.fake p { color: var(--mijhar-text-secondary); }
`;

function FakeBadge({ unit }: { unit: UnitInfo }) {
  useEffect(() => {
    fakeLifecycle.mounted.set(unit.id, (fakeLifecycle.mounted.get(unit.id) ?? 0) + 1);
    return () => void fakeLifecycle.cleaned.set(unit.id, (fakeLifecycle.cleaned.get(unit.id) ?? 0) + 1);
  }, [unit.id]);
  return (
    <div class="fake" {...{ [FAKE_ATTR]: unit.id }}>
      <button type="button" class="btn btn-primary">
        الوحدة ({unit.letter})
      </button>
      <p class="small">{unit.title}</p>
    </div>
  );
}

export function fakeUnitModules(): ExtensionModule[] {
  return UNITS.map((unit) => ({
    id: unit.id,
    title: `وحدة وهمية (${unit.letter})`,
    pages: '*',
    mount(ctx) {
      const parent = ctx.document.querySelector('main') ?? ctx.document.body;
      const surface = mountSurface(ctx, { parent, before: parent.firstChild, styles: FAKE_CSS, label: `الوحدة الوهمية (${unit.letter})` });
      surface.render(<FakeBadge unit={unit} />);
    },
  }));
}

/** معرّفات الوحدات المركَّبة كما تظهر في DOM الصفحة. */
export const mountedFakeUnits = (doc: Document): string[] =>
  [...doc.querySelectorAll('mijhar-host')]
    .map((host) => host.shadowRoot?.querySelector(`[${FAKE_ATTR}]`)?.getAttribute(FAKE_ATTR))
    .filter((id): id is string => Boolean(id))
    .sort();
