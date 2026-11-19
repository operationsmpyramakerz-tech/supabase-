const { containsArabic, withNativeArabicPdfText } = require("./pdfArabicSupport");
const { baseDirection, prepareMixedArabicReason, isMixedArabicReason } = require("./pdfMixedArabicReason");

const graphemeSegmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

// PDFKit/fontkit shapes the letters in each Arabic word, but PDFKit does not
// perform paragraph-level BiDi layout. Keep the existing native word-order
// convention, including intact English phrases/codes/numbers. Never pass its
// result back into PDFKit's automatic line wrapper: that can move the FIRST
// logical word (last visual word) to the NEXT line, as in ORD-155.
function visualLine(logical, direction) {
  if (!containsArabic(logical)) return logical;
  // Retain the source paragraph direction on every continuation line.
  if (isMixedArabicReason(logical)) return prepareMixedArabicReason(logical, { direction }).text;
  const words = logical.match(/\S+/gu) || [];
  const runs = [];
  for (const word of words) {
    const numeric = /^[\p{N}.,:/+%\-–]+$/u.test(word);
    const previous = runs[runs.length - 1];
    if (numeric && previous?.numeric) previous.words.push(word);
    else runs.push({ numeric, words: [word] });
  }
  // Pure Arabic remains RTL even inside a paragraph that starts in English.
  return runs.reverse().map(run => run.words.join(" ")).join(" ");
}

function wrapLogicalLines(value, width, measure) {
  const maxWidth = Number(width);
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) throw new Error("Invalid maintenance PDF text width");
  const output = [];
  for (const paragraph of String(value ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const direction = baseDirection(paragraph);
    const words = paragraph.match(/\S+/gu) || [];
    let current = "";
    const makeLine = (logical) => {
      const text = visualLine(logical, direction);
      return { logical, text, width: measure(text) };
    };
    const fits = logical => makeLine(logical).width <= maxWidth;
    const flush = () => { if (current) output.push(makeLine(current)); current = ""; };
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (fits(candidate)) { current = candidate; continue; }
      flush();
      if (fits(word)) { current = word; continue; }
      // A long unbroken code/URL/word must be split in LOGICAL order, not after
      // visual reordering. Keep Arabic combining marks with their base glyph.
      const clusters = graphemeSegmenter
        ? Array.from(graphemeSegmenter.segment(word), item => item.segment)
        : Array.from(word);
      for (const cluster of clusters) {
        if (current && !fits(current + cluster)) flush();
        current += cluster;
      }
    }
    flush();
    if (!words.length) output.push(makeLine(""));
  }
  return output;
}

function layoutMaintenanceArabicText(doc, value, width, { fontName, fontSize, lineGap = 1 }) {
  const fonts = doc.__pdfArabicFontNames;
  const arabicFont = /bold|black|heavy|semi|demi/i.test(fontName)
    ? fonts?.bold || fonts?.regular : fonts?.regular;
  // It's better to fail explicitly than silently export mangled Arabic using
  // Helvetica, which has no Arabic glyphs. Existing font bootstrap is unchanged.
  if (!arabicFont) throw new Error("Arabic font unavailable for maintenance PDF");
  try {
    doc.font(arabicFont).fontSize(fontSize);
    return withNativeArabicPdfText(doc, () => {
      const lines = wrapLogicalLines(value, width, text => doc.widthOfString(text));
      const lineHeight = doc.currentLineHeight(true) + lineGap;
      return {
        isArabic: true,
        align: baseDirection(value) === "rtl" ? "right" : "left",
        lines, lineHeight, height: lines.length * lineHeight,
        arabicFont, fontName, fontSize,
      };
    });
  } finally {
    doc.font(fontName).fontSize(fontSize);
  }
}

function drawMaintenanceArabicText(doc, layout, x, y, width, { align = layout.align, ...options } = {}) {
  try {
    doc.font(layout.arabicFont).fontSize(layout.fontSize);
    withNativeArabicPdfText(doc, () => {
      layout.lines.forEach((line, index) => {
        if (!line.text) return;
        const offset = align === "right" ? width - line.width : align === "center" ? (width - line.width) / 2 : 0;
        // Important: omit `width` altogether. PDFKit creates a LineWrapper
        // when width is set even if lineBreak is false. Explicit coordinates
        // plus lineBreak:false ensure that the measured line is printed ONCE.
        doc.text(line.text, x + Math.max(0, offset), y + index * layout.lineHeight, {
          ...options, lineBreak: false,
        });
      });
    });
    doc.x = x;
    doc.y = y + layout.height;
    return doc;
  } finally {
    doc.font(layout.fontName).fontSize(layout.fontSize);
  }
}

module.exports = { wrapLogicalLines, layoutMaintenanceArabicText, drawMaintenanceArabicText };
