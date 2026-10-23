// نموذج أولي للقياس فقط (MJ4/T-0.1) — لا يُشحن. يحقن في الصفحة الكائن window.MijharProto:
//  - direction: الكشف الموزون للاتجاه وعزل الكود والمسارات (F-A1/F-A2) وإزالة أثره.
//  - diacritics: إخفاء التشكيل الموضعي مع مصفوفة إزاحة لكل عقدة، وحارس ملكية الكتابة (عدّ الكتابات الذاتية المعلّقة
//    لكل عقدة، لا مقارنة القيم)، ومعالجا copy وdragstart يعيدان النص المشكول الأصلي.
(() => {
  if (window.MijharProto) return;
  const DIAC = /[ً-ٰٟ]/;
  const DIAC_G = /[ً-ٰٟ]/g;
  const SKIP = 'pre, code, kbd, samp, textarea, input, script, style, [contenteditable=""], [contenteditable="true"]';

  // ---------- الاتجاه والعزل ----------
  const STYLE_ID = 'mijhar-reading-styles';
  const BLOCKS = '.markdown-body :is(p, li, h1, h2, h3, h4, h5, h6, td, th), .markdown-title, [data-testid="issue-title"]';
  const ISOLATE_RE = /(?:[\w.-]+\/)+[\w.-]+|\bv?\d+\.\d+(?:\.\d+)*(?:-[\w.]+)?\b|#\d+/g;
  const AR_RE = /[؀-ۿ]/g;
  const LATIN_RE = /[A-Za-z]/g;
  const direction = {
    threshold: 0.3,
    minWords: 3,
    measure(el) {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('code, pre, a, .user-mention, kbd, samp').forEach((e) => e.remove());
      const text = clone.textContent;
      const ar = (text.match(AR_RE) ?? []).length;
      const la = (text.match(LATIN_RE) ?? []).length;
      return { ratio: ar + la ? ar / (ar + la) : 0, words: (text.match(/[؀-ۿ]+/g) ?? []).length };
    },
    apply(root = document) {
      if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = '[data-mijhar-dir="rtl"]{direction:rtl;text-align:right}'
          + '[data-mijhar-dir="rtl"] :is(code,pre,kbd,samp,a.issue-link,a.user-mention,a.commit-link,span.reference){direction:ltr;unicode-bidi:isolate}'
          + '.mijhar-bidi-isolate{direction:ltr;unicode-bidi:isolate}';
        document.head.appendChild(style);
      }
      let changed = 0;
      for (const el of root.querySelectorAll(BLOCKS)) {
        if (el.closest('pre, code') || el.hasAttribute('data-mijhar-dir')) continue;
        const { ratio, words } = this.measure(el);
        if (!(ratio >= this.threshold || words >= this.minWords)) continue;
        el.setAttribute('data-mijhar-orig-dir', el.getAttribute('dir') ?? '');
        el.setAttribute('data-mijhar-dir', 'rtl');
        changed += 1;
        // المسارات والإصدارات و#123 النصية داخل الكتلة.
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest(`${SKIP}, a, .mijhar-bidi-isolate`) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
        const targets = [];
        for (let n = walker.nextNode(); n; n = walker.nextNode()) if (ISOLATE_RE.test(n.nodeValue)) targets.push(n);
        for (const node of targets) {
          ISOLATE_RE.lastIndex = 0;
          const text = node.nodeValue;
          const frag = document.createDocumentFragment();
          let last = 0;
          for (const m of text.matchAll(ISOLATE_RE)) {
            if (m.index > last) frag.append(text.slice(last, m.index));
            const span = document.createElement('span');
            span.className = 'mijhar-bidi-isolate';
            span.setAttribute('data-mijhar-injected', 'true');
            span.setAttribute('dir', 'ltr');
            span.textContent = m[0];
            frag.append(span);
            last = m.index + m[0].length;
          }
          if (last < text.length) frag.append(text.slice(last));
          node.replaceWith(frag);
        }
        ISOLATE_RE.lastIndex = 0;
      }
      return changed;
    },
    remove(root = document) {
      for (const span of root.querySelectorAll('span[data-mijhar-injected="true"]')) {
        const parent = span.parentNode;
        span.replaceWith(document.createTextNode(span.textContent));
        parent.normalize();
      }
      for (const el of root.querySelectorAll('[data-mijhar-dir]')) {
        el.removeAttribute('data-mijhar-dir');
        el.removeAttribute('data-mijhar-orig-dir');
      }
      document.getElementById(STYLE_ID)?.remove();
    },
  };

  // ---------- إخفاء التشكيل وحارس الملكية ----------
  const records = new Map(); // عقدة نصية ← { originalText, strippedText, offsets, generation, pending, dirty }
  const exceptions = [];
  const stats = { ownWrites: 0, foreignWrites: 0, restored: 0, skipped: 0, copyHandled: 0, dragHandled: 0 };
  let observer = null;
  let generation = 0;
  let enabled = false;

  const stripWithOffsets = (text) => {
    let out = '';
    const offsets = [];
    for (let i = 0; i < text.length; i += 1) {
      if (!DIAC.test(text[i])) {
        offsets.push(i);
        out += text[i];
      }
    }
    offsets.push(text.length);
    return { stripped: out, offsets: Uint32Array.from(offsets) };
  };

  const ownWrite = (node, value) => {
    const rec = records.get(node);
    if (rec) rec.pending += 1;
    node.nodeValue = value;
    stats.ownWrites += 1;
  };

  function handle(mutations) {
    for (const m of mutations) {
      if (m.type === 'characterData') {
        const rec = records.get(m.target);
        if (!rec) continue;
        if (rec.pending > 0) {
          rec.pending -= 1; // سجل كتابة ذاتية بترتيبها
          continue;
        }
        // كتابة أجنبية (GitHub): يُعتمد نصها أصلًا جديدًا ولا يُستعاد القديم فوقه.
        stats.foreignWrites += 1;
        rec.dirty = true;
        rec.originalText = m.target.nodeValue;
        const { stripped, offsets } = stripWithOffsets(rec.originalText);
        rec.strippedText = stripped;
        rec.offsets = offsets;
      } else if (m.type === 'childList') {
        for (const n of m.removedNodes) {
          const list = n.nodeType === Node.TEXT_NODE ? [n] : [...records.keys()].filter((t) => n.contains?.(t));
          for (const t of list) {
            if (records.has(t)) {
              exceptions.push({ reason: 'عقدة أزالها GitHub أو استبدلها', text: records.get(t).originalText.slice(0, 40) });
              records.delete(t);
            }
          }
        }
      }
    }
  }

  const diacritics = {
    enable(root = document) {
      if (enabled) return 0;
      enabled = true;
      generation += 1;
      const containers = root.querySelectorAll('.markdown-body, .mj-diac-root');
      let count = 0;
      observer = new MutationObserver(handle);
      for (const c of containers) {
        const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest(SKIP) || !DIAC.test(n.nodeValue) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
        const nodes = [];
        for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
        observer.observe(c, { characterData: true, childList: true, subtree: true });
        for (const node of nodes) {
          const originalText = node.nodeValue;
          const { stripped, offsets } = stripWithOffsets(originalText);
          records.set(node, { originalText, strippedText: stripped, offsets, generation, pending: 0, dirty: false });
          ownWrite(node, stripped);
          count += 1;
        }
      }
      return count;
    },
    disable() {
      if (!enabled) return { restored: 0, skipped: 0 };
      // تفريغ السجلات المعلّقة أولًا (TEST-RTL-05G).
      handle(observer.takeRecords());
      let restored = 0;
      let skipped = 0;
      for (const [node, rec] of records) {
        const ok = node.isConnected && rec.generation === generation && rec.pending === 0;
        if (!ok) {
          skipped += 1;
          exceptions.push({ reason: !node.isConnected ? 'عقدة منفصلة' : 'جيل مختلف أو كتابة معلّقة', text: rec.originalText.slice(0, 40) });
          continue;
        }
        if (rec.dirty) {
          // كتب GitHub بعد الإضافة: يبقى نصه كما هو (لا استعادة فوقه).
          skipped += 1;
          continue;
        }
        if (node.nodeValue !== rec.strippedText) {
          skipped += 1; // فحص إضافي لا دليل ملكية
          continue;
        }
        ownWrite(node, rec.originalText);
        restored += 1;
      }
      handle(observer.takeRecords());
      observer.disconnect();
      observer = null;
      records.clear();
      enabled = false;
      stats.restored += restored;
      stats.skipped += skipped;
      return { restored, skipped };
    },
    // يبني نصَّي الحافظة من التحديد الحالي بإعادة الحركات الأصلية؛ null إن لم يمس التحديد عقدة مسجلة.
    // يعيد الحركات إلى نص التحديد كما يسلسله المتصفح (shown) بمحاذاة تسلسل النصوص الأصلية (stream).
    realign(shown, stream) {
      let out = '';
      let j = 0;
      for (const ch of shown) {
        if (!/\s/.test(ch)) while (j < stream.length && /\s/.test(stream[j])) j += 1;
        if (j < stream.length && stream[j] === ch) {
          out += ch;
          j += 1;
          while (j < stream.length && DIAC.test(stream[j])) out += stream[j++];
        } else {
          out += ch;
        }
      }
      return out;
    },
    rebuild(range, shownText) {
      const touched = [...records.keys()].some((n) => range.intersectsNode(n));
      if (!touched) return null;
      const frag = range.cloneContents();
      // عقد التحديد الأصلية بالترتيب نفسه لعقد النص في النسخة.
      const originals = [];
      const walker = document.createTreeWalker(range.commonAncestorContainer.nodeType === Node.TEXT_NODE ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!range.intersectsNode(n)) continue;
        const start = n === range.startContainer ? range.startOffset : 0;
        const end = n === range.endContainer ? range.endOffset : n.nodeValue.length;
        const rec = records.get(n);
        originals.push(rec && !rec.dirty ? rec.originalText.slice(rec.offsets[start], rec.offsets[end]) : n.nodeValue.slice(start, end));
      }
      const fw = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT);
      const fragNodes = [];
      for (let n = fw.nextNode(); n; n = fw.nextNode()) fragNodes.push(n);
      if (fragNodes.length === originals.length) fragNodes.forEach((n, i) => { n.nodeValue = originals[i]; });
      const box = document.createElement('div');
      box.appendChild(frag);
      const html = box.innerHTML;
      const plain = this.realign(shownText ?? range.toString(), originals.join(''));
      return { plain, html, aligned: fragNodes.length === originals.length };
    },
  };

  document.addEventListener('copy', (e) => {
    if (!enabled) return;
    const sel = getSelection();
    if (!sel.rangeCount) return;
    const data = diacritics.rebuild(sel.getRangeAt(0), sel.toString());
    if (!data) return;
    e.clipboardData.setData('text/plain', data.plain);
    e.clipboardData.setData('text/html', data.html);
    e.preventDefault();
    stats.copyHandled += 1;
  }, true);
  document.addEventListener('dragstart', (e) => {
    if (!enabled || !e.dataTransfer) return;
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const data = diacritics.rebuild(sel.getRangeAt(0), sel.toString());
    if (!data) return;
    e.dataTransfer.setData('text/plain', data.plain);
    e.dataTransfer.setData('text/html', data.html);
    stats.dragHandled += 1;
  }, true);

  window.MijharProto = {
    direction,
    diacritics,
    stats,
    exceptions,
    strip: (t) => t.replace(DIAC_G, ''),
    get enabled() { return enabled; },
    disableAll() {
      const d = diacritics.disable();
      direction.remove();
      return d;
    },
  };
})();
