// كتلة الفرق (مكوّن Diff block في القسم H): الملف وعدّاه، ثم كل الكتل بأسطرها كاملة (لا اقتطاع)، والفاصل بين كتلتين «…». نص فقط: لا HTML من
// الملف ولا من غيره.
import { Ltr } from '../../../shared/ui';
import { NO_EOL_MARK, fileDiff } from './diff';

export interface DiffBlockProps {
  readonly path: string;
  readonly before: string;
  readonly after: string;
  readonly isNew: boolean;
}

export function DiffBlock({ path, before, after, isNew }: DiffBlockProps) {
  const diff = fileDiff(before, after);
  return (
    <figure class="diff" data-diff={path} aria-label={`فرق ${path}`}>
      <figcaption class="diff-head">
        <Ltr className="mono">{path}</Ltr>
        <span>
          {isNew && <span data-new-file="">ملف جديد · </span>}
          <Ltr>
            <span class="del-count" data-deletions={diff.deletions}>
              −{diff.deletions}
            </span>{' '}
            <span class="add-count" data-additions={diff.additions}>
              +{diff.additions}
            </span>
          </Ltr>
        </span>
      </figcaption>
      <div class="diff-body" dir="ltr">
        {diff.hunks.length === 0 ? (
          <p class="diff-gap" data-diff-empty="">
            لا تغيير بعد: افتح المحرر وعدّل الملف.
          </p>
        ) : (
          diff.hunks.map((hunk, h) => (
            <div key={h} data-hunk={h}>
              {h > 0 && <div class="diff-gap">…</div>}
              {hunk.lines.map((line, k) => (
                <div key={k}>
                  <div class="diff-row" data-kind={line.kind}>
                    <span class="no">{line.kind === 'del' ? line.old : line.new}</span>
                    <span class="sign">{line.kind === 'del' ? '-' : line.kind === 'add' ? '+' : ' '}</span>
                    <span class="text">{line.text}</span>
                  </div>
                  {line.noEol && <div class="diff-gap">{NO_EOL_MARK}</div>}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </figure>
  );
}
