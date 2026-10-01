function text(value) {
  return String(value ?? "").trim();
}

export function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(blob);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode the selected image."));
    };
    image.src = url;
  });
}

export async function compressImage(file) {
  const allowed = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  if (!allowed.has(String(file?.type || "").toLowerCase())) {
    throw new Error("Choose a PNG, JPG, WEBP, or GIF image.");
  }
  if (file.size > 8 * 1024 * 1024) throw new Error("The original image must be 8 MB or less.");

  if (String(file.type).toLowerCase() === "image/gif") {
    if (file.size > 2.6 * 1024 * 1024) throw new Error("Animated GIF files must be 2.6 MB or less for Vercel upload limits.");
    return { dataUrl: await readBlobAsDataUrl(file), fileName: file.name || "component.gif" };
  }

  const image = await loadImage(file);
  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  const maxSide = 1500;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  let blob = null;
  for (const quality of [0.84, 0.74, 0.64, 0.54]) {
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (blob && blob.size <= 2.6 * 1024 * 1024) break;
  }
  if (!blob) throw new Error("Could not prepare the selected image.");
  if (blob.size > 2.9 * 1024 * 1024) throw new Error("The compressed image is still too large. Choose a smaller image.");

  const baseName = text(file.name).replace(/\.[^.]+$/, "") || "event-component";
  return { dataUrl: await readBlobAsDataUrl(blob), fileName: `${baseName}.webp` };
}
