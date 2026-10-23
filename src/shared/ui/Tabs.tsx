// تبويبات بنمط WAI-ARIA (tablist/tab/tabpanel): الأسهم تنقل بين التبويبات وتفعّلها، وHome وEnd إلى الطرفين،
// والتركيز داخل القائمة على التبويب المحدد وحده (roving tabindex). الأسهم تتبع الاتجاه: في RTL السهم الأيسر هو «التالي».
import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';

export interface TabItem {
  readonly id: string;
  readonly title: string;
}

export interface TabsProps {
  readonly idPrefix: string;
  readonly label: string;
  readonly tabs: readonly TabItem[];
  readonly selected: string;
  readonly onSelect: (id: string) => void;
  readonly children: ComponentChildren;
}

export function Tabs({ idPrefix, label, tabs, selected, onSelect, children }: TabsProps) {
  const list = useRef<HTMLDivElement>(null);

  const move = (event: KeyboardEvent) => {
    const index = tabs.findIndex((t) => t.id === selected);
    const rtl = list.current ? getComputedStyle(list.current).direction !== 'ltr' : true;
    const step: Record<string, number> = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1 };
    let next = -1;
    if (event.key in step) next = (index + (step[event.key] ?? 0) + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next === -1) return;
    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onSelect(target.id);
    list.current?.querySelector<HTMLElement>(`#${idPrefix}-tab-${target.id}`)?.focus();
  };

  return (
    <>
      <div class="tablist" role="tablist" aria-label={label} ref={list} onKeyDown={move}>
        {tabs.map((tab) => (
          <button
            type="button"
            class="tab"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={tab.id === selected ? 'true' : 'false'}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={tab.id === selected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <div class="tabpanel" role="tabpanel" id={`${idPrefix}-panel-${selected}`} aria-labelledby={`${idPrefix}-tab-${selected}`} tabIndex={0}>
        {children}
      </div>
    </>
  );
}
