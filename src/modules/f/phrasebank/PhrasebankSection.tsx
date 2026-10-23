// القسم الثابت المحلي من مساعد الكتابة: بنك عبارات المراجعة (AC-F3 / AC-F5). يختار منه المستخدم عبارة فتظهر في معاينة المساعد، ولا شيء يُدرج من هنا:
// الإدراج من أزرار المعاينة نفسها (عند المؤشر أو بالإلحاق) فيمر بالإدراج الآمن وتراجعه. لا يستورد هذا الملف خدمة الترجمة ولا تقنيع الرموز: بنك ثابت بلا نموذج ولا شبكة.
import { useState } from 'preact/hooks';
import { CATEGORY_LABELS, LANGUAGE_LABELS, PHRASE_CATEGORIES, PHRASE_LANGUAGES, phrasesOf, selectPhrase } from './data';
import type { PhraseCategory, PhraseLanguage, PhraseSelection } from './data';

export interface PhrasebankProps {
  readonly selected: PhraseSelection | null;
  readonly onSelect: (selection: PhraseSelection | null) => void;
}

export function PhrasebankSection({ selected, onSelect }: PhrasebankProps) {
  const [category, setCategory] = useState<PhraseCategory>('question');
  const [language, setLanguage] = useState<PhraseLanguage>('ar');
  const phrases = phrasesOf(category);
  return (
    <section class="phrasebank" data-block="phrasebank" aria-labelledby="mj-phrasebank-title">
      <h3 id="mj-phrasebank-title">بنك عبارات المراجعة</h3>
      <p class="note">عبارات جاهزة محلية بلا نموذج ولا شبكة. اختر عبارة فتظهر في المعاينة أسفل اللوحة، ثم أدرجها من هناك. ما بين «…» و«&lt;…&gt;» تملؤه أنت.</p>
      <div class="phrase-tabs" role="group" aria-label="صنف العبارة">
        {PHRASE_CATEGORIES.map((id) => (
          <button type="button" class="btn chip-btn" key={id} data-category={id} aria-pressed={category === id ? 'true' : 'false'} onClick={() => setCategory(id)}>
            {CATEGORY_LABELS[id]}
          </button>
        ))}
      </div>
      <fieldset class="kinds">
        <legend>لغة العبارة</legend>
        {PHRASE_LANGUAGES.map((id) => (
          <label class="choice" key={id}>
            <input type="radio" name="mj-phrase-language" value={id} checked={language === id} onChange={() => setLanguage(id)} />
            <span>{LANGUAGE_LABELS[id]}</span>
          </label>
        ))}
      </fieldset>
      {category === 'suggestion' && (
        <p class="note" data-note="suggestion-block">
          كتلة <code>suggestion</code> تتحول إلى اقتراح قابل للتطبيق بنقرة حين تُكتب في تعليق مراجعة على سطر من ملفات طلب دمج؛ وفي غيره تظهر كتلة كود عادية. استبدل ما بين &lt;…&gt; بالشيفرة التي تقترحها.
        </p>
      )}
      <ul class="phrase-list" data-phrase-list={category}>
        {phrases.map((phrase) => {
          const active = selected?.id === phrase.id && selected.language === language;
          return (
            <li key={phrase.id}>
              <button type="button" class="btn phrase-btn" data-phrase={phrase.id} aria-pressed={active ? 'true' : 'false'} onClick={() => onSelect(active ? null : selectPhrase(phrase.id, language))}>
                {phrase.label[language === 'ar' ? 'ar' : 'en']}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
