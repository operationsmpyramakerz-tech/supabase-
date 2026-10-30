// Pure layout helpers for the PDFKit fallback. Arabic is laid out a token at
// a time, RTL, rather than reversing a sentence and asking PDFKit to infer bidi.
// PDFKit/fontkit still shapes the glyphs inside each Arabic word.
const ARABIC = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/;

export function hasPrArabic(value) { return ARABIC.test(String(value ?? '')); }

export function prTextTokens(value) {
  const text = String(value ?? '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  const tokens = [];
  // Keep English parentheticals together (e.g. "(PR No.)"), but split Arabic
  // parentheticals so the parentheses are positioned at opposite RTL ends.
  for (const word of text.match(/\([^()]*\)|\S+/g) || []) {
    if (/^\([^()]*\)$/.test(word) && hasPrArabic(word)) {
      tokens.push('(');
      tokens.push(...prTextTokens(word.slice(1, -1)));
      tokens.push(')');
    } else {
      tokens.push(word);
    }
  }
  return tokens;
}

export function prSplitLines(value, availableWidth, measure, gap = 3.5) {
  const result = [];
  for (const textLine of String(value ?? '').split(/\r?\n/)) {
    if (!textLine.trim()) { result.push([]); continue; }
    const tokens = prTextTokens(textLine);
    let line = [], width = 0;
    for (const token of tokens) {
      const tokenWidth = measure(token);
      if (line.length && width + gap + tokenWidth > availableWidth) {
        result.push(line); line = []; width = 0;
      }
      if (line.length) width += gap;
      line.push(token); width += tokenWidth;
    }
    result.push(line);
  }
  return result;
}

export function prLineWidth(tokens, measure, gap = 3.5) {
  return tokens.reduce((sum, token, index) => sum + measure(token) + (index ? gap : 0), 0);
}

// Latin numerals (e.g. "350" and "100") use a higher optical baseline than
// surrounding Arabic words in PDFKit. Apply a small descent ONLY when these
// isolated numeric tokens occur in an Arabic Notes paragraph; no font-size or
// line-height change is needed.
export function prNotesNumeralBaselineDrop(token, fontSize) {
  const text=String(token ?? "").trim();
  return /^\d+(?:[.,]\d+)*$/.test(text) && Number.isFinite(fontSize) && fontSize>0
    ? fontSize*.25 : 0;
}
