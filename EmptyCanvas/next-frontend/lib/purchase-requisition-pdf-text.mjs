// PDFKit/fontkit shapes the letters in each Arabic word but lays out text left-to-right.
// Swap the order of the WORDS (not characters) in the native PR PDF fallback only.
// English identifiers / numbers are kept as indivisible LTR runs. Do not pre-shape
// the Arabic characters here: doing so would corrupt their joining under fontkit.
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const LTR_PHRASE = /\([^()]*[A-Za-z0-9][^()]*\)|[A-Za-z0-9][A-Za-z0-9._%+@:\/\#&=,\-]*(?:\s+[A-Za-z0-9][A-Za-z0-9._%+@:\/\#&=,\-]*)*(?:\s*\([^()]*[A-Za-z0-9][^()]*\))?/g;

function reverseWordGroup(group) {
  const literals = [];
  const protectedGroup = group.replace(LTR_PHRASE, (phrase) => {
    const index = literals.push(phrase) - 1;
    return `\uE000${index}\uE001`;
  });
  return protectedGroup.trim().split(/\s+/).reverse().join(" ")
    .replace(/\uE000(\d+)\uE001/g, (_, index) => literals[Number(index)] || "");
}

export function nativePrPdfRtlWordOrder(value) {
  const text = String(value ?? "");
  if (!ARABIC.test(text)) return text;
  return text.split(/(\r?\n)/).map((line) => {
    if (!ARABIC.test(line)) return line;
    // Each checkbox belongs to the Arabic option after it. Two spaces separate
    // individual choices in the form's check() output.
    const groups = line.trim().split(/\s{2,}/);
    return groups.map(reverseWordGroup).reverse().join("  ");
  }).join("");
}
