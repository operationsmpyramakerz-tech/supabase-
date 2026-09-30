"use client";

const RECEIPT_SOURCE_MAX_BYTES = 8 * 1024 * 1024;
const RECEIPT_UPLOAD_TARGET_BYTES = Math.floor(1.5 * 1024 * 1024);
const RECEIPT_MAX_EDGE = 2000;

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read ${file?.name || "receipt image"}.`));
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareReceiptImage(file) {
  if (!file || !/^image\//i.test(text(file.type))) throw new Error("Receipt uploads must be images.");
  if (number(file.size) > RECEIPT_SOURCE_MAX_BYTES) throw new Error(`${file.name || "Receipt image"} is larger than 8 MB.`);

  if (number(file.size) <= RECEIPT_UPLOAD_TARGET_BYTES) {
    return {
      dataUrl: await readFileAsDataUrl(file),
      name: file.name || "receipt.jpg",
      size: number(file.size),
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error(`${file.name || "Receipt image"} could not be opened for optimization.`));
      candidate.src = objectUrl;
    });

    const naturalWidth = Math.max(1, number(image.naturalWidth || image.width) || 1);
    const naturalHeight = Math.max(1, number(image.naturalHeight || image.height) || 1);
    const longest = Math.max(naturalWidth, naturalHeight);
    let dimensionScale = Math.min(1, RECEIPT_MAX_EDGE / longest);
    let bestBlob = null;
    let bestType = "image/webp";

    for (let sizeAttempt = 0; sizeAttempt < 5; sizeAttempt += 1) {
      const width = Math.max(1, Math.round(naturalWidth * dimensionScale));
      const height = Math.max(1, Math.round(naturalHeight * dimensionScale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Receipt image optimization is not available in this browser.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      let quality = 0.88;
      let blob = await canvasToBlob(canvas, "image/webp", quality);
      let mime = "image/webp";
      if (!blob) {
        quality = 0.86;
        blob = await canvasToBlob(canvas, "image/jpeg", quality);
        mime = "image/jpeg";
      }
      if (!blob) throw new Error(`${file.name || "Receipt image"} could not be optimized.`);

      while (blob.size > RECEIPT_UPLOAD_TARGET_BYTES && quality > 0.5) {
        quality = Math.max(0.5, quality - 0.08);
        blob = await canvasToBlob(canvas, mime, quality);
        if (!blob) break;
      }

      if (blob && (!bestBlob || blob.size < bestBlob.size)) {
        bestBlob = blob;
        bestType = mime;
      }
      if (blob && blob.size <= RECEIPT_UPLOAD_TARGET_BYTES) break;
      dimensionScale *= 0.82;
    }

    if (!bestBlob || bestBlob.size > RECEIPT_UPLOAD_TARGET_BYTES) {
      throw new Error(`${file.name || "Receipt image"} is still too large after optimization. Choose a smaller image.`);
    }

    const baseName = text(file.name).replace(/\.[^.]+$/, "") || "receipt";
    return {
      dataUrl: await readFileAsDataUrl(bestBlob),
      name: `${baseName}.${bestType === "image/webp" ? "webp" : "jpg"}`,
      size: bestBlob.size,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
