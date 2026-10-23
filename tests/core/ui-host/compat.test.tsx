// @vitest-environment jsdom
// DEC-01 أ: مكوّن منقول من ghsim-source (React) يعمل عبر طبقة توافق Preact في أول بناء. إن فشل هنا يُعاد القرار إلى (ب).
import { render } from 'preact';
import type { ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ltr, Toggle } from '../../../src/shared/ui';

let container: HTMLElement;
afterEach(() => {
  render(null, container);
  container.remove();
});
const mount = (vnode: ComponentChild): HTMLElement => {
  container = document.createElement('div');
  document.body.append(container);
  act(() => render(vnode, container));
  return container;
};

describe('Toggle المنقول عبر preact/compat', () => {
  it('يُرسم بالبنية الأصلية وسماتها', () => {
    const el = mount(<Toggle checked={false} onChange={() => {}} label="الوحدة (أ)" id="t1" />);
    const input = el.querySelector('input')!;
    expect(el.querySelector('span.toggle-switch > input[type="checkbox"][role="switch"]')).toBe(input);
    expect(el.querySelector('span.toggle-slider[aria-hidden="true"]')).not.toBeNull();
    expect(input.id).toBe('t1');
    expect(input.getAttribute('aria-label')).toBe('الوحدة (أ)');
    expect(input.getAttribute('aria-checked')).toBe('false');
    expect(input.checked).toBe(false);
  });

  it('onChange بسلوك React: النقر يمرّر القيمة الجديدة، والقيمة المتحكَّم بها تعود إن لم يتغير الأصل', () => {
    const onChange = vi.fn();
    const el = mount(<Toggle checked={false} onChange={onChange} />);
    const input = el.querySelector('input')!;
    act(() => input.click());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
    act(() => render(<Toggle checked={true} onChange={onChange} />, container));
    expect(input.checked).toBe(true);
    expect(input.getAttribute('aria-checked')).toBe('true');
  });

  it('disabled يمنع التغيير', () => {
    const onChange = vi.fn();
    const el = mount(<Toggle checked={false} onChange={onChange} disabled />);
    act(() => el.querySelector('input')!.click());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Ltr المنقول يعزل الاتجاه بصنفه وينقل style بالأرقام كما في React', () => {
    const el = mount(
      <Ltr mono style={{ fontWeight: 600, marginInlineStart: 4 }}>
        main
      </Ltr>,
    );
    const span = el.querySelector('span')!;
    expect(span.className.split(/\s+/)).toEqual(expect.arrayContaining(['ltr-inline', 'mono']));
    expect(span.textContent).toBe('main');
    expect(span.style.fontWeight).toBe('600');
    expect(span.style.marginInlineStart).toBe('4px');
  });
});
