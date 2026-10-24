// @vitest-environment jsdom
// المساعد trustedClick (AD-27): يجب أن يصل إلى المعالج حدثٌ isTrusted=true، بينما click() وdispatchEvent من السكربت يصلان isTrusted=false كما في المتصفح.
import { describe, expect, it } from 'vitest';
import { trustedClick } from './trusted-click';

describe('trustedClick في jsdom', () => {
  it('click() وdispatchEvent غير موثوقين، وtrustedClick موثوق، ويعبر حدود جذر الظل', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    const button = document.createElement('button');
    root.append(button);
    const seen: boolean[] = [];
    button.addEventListener('click', (event) => seen.push(event.isTrusted));
    button.click();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    trustedClick(button);
    expect(seen).toEqual([false, false, true]);
    // الخاصية لا تُزوَّر من السكربت.
    const forged = new MouseEvent('click');
    expect(() => Object.defineProperty(forged, 'isTrusted', { value: true })).toThrow();
    host.remove();
  });
});
