/*
 * PDFKit/fontkit shapes Arabic letters, but does not run the Unicode BiDi
 * algorithm for a mixed Arabic/English field. In native-shaping mode, reverse
 * the *order of RTL words* while keeping consecutive Latin words/numbers as
 * intact LTR runs (e.g. "Theme Two", not "Two Theme").
 *
 * The resulting visual-order string must be drawn under
 * withNativeArabicPdfText(); do not pass it through the legacy Arabic shaper.
 */
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const ARABIC_LETTER_RE = /[\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06FA-\u06FC\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_RE = /[A-Za-z]/;

function isMixedArabicReason(value) {
  const text = String(value ?? "");
  return ARABIC_RE.test(text) && LATIN_RE.test(text);
}

function baseDirection(value) {
  for (const char of String(value ?? "")) {
    if (ARABIC_LETTER_RE.test(char)) return "rtl";
    if (LATIN_RE.test(char)) return "ltr";
  }
  return ARABIC_RE.test(String(value ?? "")) ? "rtl" : "ltr";
}

function splitIntoUnits(line) {
  const words = String(line || "").trim().match(/\([^()]*\)|\S+/gu) || [];
  const units = [];
  for (const word of words) {
    const parenthesized = /^\([^()]*\)$/.test(word);
    const arabic = ARABIC_RE.test(word);
    const latin = !arabic && /[A-Za-z0-9]/.test(word);
    // Keep a multiword parenthesized note together rather than producing
    // broken bracket halves such as "الفصل) (كتب" after RTL reordering.
    const value = parenthesized && arabic
      ? `(${visualOrder(splitIntoUnits(word.slice(1, -1)), "rtl")})`
      : word;
    const last = units[units.length - 1];
    // A product/course name or number is a single LTR phrase, not separate
    // words to be reversed individually in an RTL paragraph.
    if (latin && last?.latin) last.value += ` ${value}`;
    else units.push({ value, arabic, latin });
  }
  return units;
}

function visualOrder(units, direction) {
  if (direction === "rtl") return units.slice().reverse().map((unit) => unit.value).join(" ");

  // When the whole field starts in English, preserve the English run order
  // and reverse only adjacent Arabic words within each Arabic run.
  const output = [];
  let arabicRun = [];
  const flush = () => {
    if (arabicRun.length) output.push(...arabicRun.reverse());
    arabicRun = [];
  };
  for (const unit of units) {
    if (unit.arabic) arabicRun.push(unit.value);
    else {
      flush();
      output.push(unit.value);
    }
  }
  flush();
  return output.join(" ");
}

function prepareMixedArabicReason(value, { width, measure } = {}) {
  const source = String(value ?? "").replace(/\r\n?/g, "\n");
  const direction = baseDirection(source);
  if (!isMixedArabicReason(source)) return { text: source, align: direction === "rtl" ? "right" : "left" };

  const canWrap = Number.isFinite(width) && width > 0 && typeof measure === "function";
  const lines = source.split("\n").flatMap((sourceLine) => {
    const units = splitIntoUnits(sourceLine);
    if (!units.length) return [""];
    if (!canWrap) return [visualOrder(units, direction)];

    const wrapped = [];
    let current = [];
    for (const unit of units) {
      const candidate = current.concat(unit);
      if (current.length && measure(visualOrder(candidate, direction)) > width) {
        wrapped.push(visualOrder(current, direction));
        current = [unit];
      } else current = candidate;
    }
    if (current.length) wrapped.push(visualOrder(current, direction));
    return wrapped;
  });
  return { text: lines.join("\n"), align: direction === "rtl" ? "right" : "left" };
}

module.exports = { isMixedArabicReason, baseDirection, prepareMixedArabicReason };
