// AC-A7 البند ٥: قائمة «استثناءات استعادة النصوص» في الشيفرة وعرضها في evidence/T-2.7/restore-exceptions.md متسقان.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESTORE_EXCEPTION_IDS } from '../../../../src/core';
import { TEXT_RESTORE_EXCEPTIONS, TEXT_RESTORE_EXCEPTION_IDS } from '../../../../src/modules/a/guard';
import { ROOT } from '../../../setup/paths';

const DOC = fs.readFileSync(path.join(ROOT, 'evidence/T-2.7/restore-exceptions.md'), 'utf8');
const documented = [...DOC.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]);

describe('قائمة استثناءات استعادة النصوص', () => {
  it('كل معرّف في الشيفرة معروض في الوثيقة وكل معروض في الشيفرة', () => {
    expect([...documented].sort()).toEqual([...TEXT_RESTORE_EXCEPTION_IDS].sort());
  });

  it('المرصود وقت التشغيل في جدوله والحد التصميمي في جدوله', () => {
    const [runtime, limits] = DOC.split('## حدود تصميمية') as [string, string];
    for (const exception of TEXT_RESTORE_EXCEPTIONS) {
      const table = exception.reported ? runtime : limits;
      expect(table).toContain(`\`${exception.id}\``);
    }
  });

  it('لا يتصادم معرّف مع قائمة النواة، فيُفهم مصدر كل ترك من رقمه', () => {
    for (const id of TEXT_RESTORE_EXCEPTION_IDS) expect(RESTORE_EXCEPTION_IDS as readonly string[]).not.toContain(id);
  });
});
