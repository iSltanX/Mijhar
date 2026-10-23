// بديل غياب المحرك (AC-C4): نسخ النص مقنَّعًا إلى الحافظة ليترجمه المستخدم بأداة يختارها، بلا أي اتصال من الإضافة. الشيفرة والمسارات والروابط
// والإشارات والمصطلحات المحمية لا تُنسخ، بل رموزها ⟦TYPE_N⟧ وحدها. الفقرات تُقنَّع في تمريرة واحدة فتبقى فهارس الرموز فريدة في النص المنسوخ كله.
import { maskSegments } from '../masking';
import type { MaskSegment } from '../masking';

export interface MaskedCopy {
  readonly text: string;
  readonly paragraphs: number;
  readonly tokens: number;
}

export function maskedCopyText(paragraphs: readonly (readonly MaskSegment[])[]): MaskedCopy {
  const segments: MaskSegment[] = [];
  paragraphs.forEach((paragraph, i) => {
    if (i > 0) segments.push('\n\n');
    segments.push(...paragraph);
  });
  const { masked, expectedTokens } = maskSegments(segments);
  return { text: masked.trim(), paragraphs: paragraphs.length, tokens: expectedTokens.size };
}

export type ClipboardWrite = (text: string) => Promise<void>;

/** الحافظة في السياق الحالي؛ تُستدعى من نقرة المستخدم. */
export const writeClipboard: ClipboardWrite = async (text) => {
  if (!globalThis.navigator?.clipboard) throw new Error('الحافظة غير متاحة في هذا السياق');
  await globalThis.navigator.clipboard.writeText(text);
};

/** ينسخ الفقرات مقنَّعة ويعيد ما يُعلَن للمستخدم. */
export async function copyMaskedText(paragraphs: readonly (readonly MaskSegment[])[], write: ClipboardWrite = writeClipboard): Promise<string> {
  const copy = maskedCopyText(paragraphs);
  if (copy.paragraphs === 0 || copy.text === '') return 'لا نص إنجليزي لنسخه هنا.';
  try {
    await write(copy.text);
  } catch (error) {
    return `تعذّر النسخ إلى الحافظة: ${error instanceof Error ? error.message : String(error)}`;
  }
  return copy.tokens > 0
    ? `نُسخ النص المقنَّع (${copy.paragraphs} فقرة)، وفيه ${copy.tokens} عنصرًا محميًا مستبدلًا برموز ⟦…⟧ لا تُنسخ قيمها.`
    : `نُسخ النص (${copy.paragraphs} فقرة)، ولا عنصر محميًا فيه.`;
}
