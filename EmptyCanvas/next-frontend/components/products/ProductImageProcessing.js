"use client";

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function apiErrorMessage(body, fallback) {
  return text(body?.error || body?.message) || fallback;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Your session has expired.");
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) throw new Error(apiErrorMessage(body, "The request failed."));
  return body;
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("The selected image could not be read."));
    reader.readAsDataURL(blob);
  });
}

export async function prepareProductImage(file) {
  if (!file || !/^image\//i.test(text(file.type))) throw new Error("Choose a valid image file.");
  if (number(file.size) > 10 * 1024 * 1024) throw new Error("Product image must not exceed 10 MB.");

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error("The selected image could not be opened."));
      candidate.src = objectUrl;
    });

    const longest = Math.max(image.naturalWidth || 1, image.naturalHeight || 1);
    const scale = Math.min(1, 1800 / longest);
    const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    let quality = 0.86;
    let blob = await canvasBlob(canvas, "image/webp", quality);
    while (blob && blob.size > 1.7 * 1024 * 1024 && quality > 0.5) {
      quality -= 0.08;
      blob = await canvasBlob(canvas, "image/webp", quality);
    }
    if (!blob) throw new Error("The selected image could not be compressed.");

    const dataUrl = await blobToDataUrl(blob);
    return {
      dataUrl,
      blob,
      name: `${text(file.name).replace(/\.[^.]+$/, "") || "product-image"}.webp`,
      type: "image/webp",
      size: blob.size,
      previewUrl: dataUrl,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadPreparedProductImage(image) {
  if (!image?.blob || !image?.size) return "";

  const ticket = await requestJson("/next/api/products/image-upload", {
    method: "POST",
    body: JSON.stringify({
      filename: image.name || "product-image.webp",
      mime: image.type || "image/webp",
      size: Number(image.size || 0),
    }),
  });
  const upload = ticket?.upload || {};
  if (!upload?.signedUrl || !upload?.publicUrl) {
    throw new Error("The image upload could not be prepared.");
  }

  const formData = new FormData();
  formData.append("cacheControl", String(upload.cacheControl || "3600"));
  formData.append("", image.blob, image.name || "product-image.webp");

  const headers = { ...(upload.headers || {}) };
  for (const key of Object.keys(headers)) {
    if (String(key).toLowerCase() === "content-type") delete headers[key];
  }

  let response;
  try {
    response = await fetch(upload.signedUrl, {
      method: String(upload.method || "PUT").toUpperCase(),
      credentials: "omit",
      cache: "no-store",
      headers,
      body: formData,
    });
  } catch (error) {
    throw new Error(error?.message || "The browser could not upload the image to storage.");
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let detail = raw;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      detail = text(parsed?.message || parsed?.error || raw);
    } catch {}
    if (response.status === 413) {
      throw new Error(detail || "Storage rejected the image because its file-size limit is lower than this image.");
    }
    throw new Error(detail || `Storage upload failed with status ${response.status}.`);
  }

  return upload.publicUrl;
}
