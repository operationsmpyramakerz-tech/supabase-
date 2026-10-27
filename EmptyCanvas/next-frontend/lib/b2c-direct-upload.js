"use client";

function text(value) { return String(value ?? "").trim(); }

async function responseJson(response) {
  const raw = await response.text();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { error: raw.slice(0, 500) }; }
}

function putFile(ticket, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(String(ticket?.upload?.method || "PUT").toUpperCase(), ticket.upload.signedUrl, true);
    xhr.withCredentials = false;
    const headers = ticket?.upload?.headers && typeof ticket.upload.headers === "object" ? ticket.upload.headers : {};
    for (const [name, value] of Object.entries(headers)) {
      if (value !== null && typeof value !== "undefined") xhr.setRequestHeader(name, String(value));
    }
    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : Number(file.size || 0);
      const percent = total > 0 ? Math.min(99, Math.max(1, Math.round((event.loaded / total) * 100))) : 0;
      onProgress?.({ loaded: event.loaded, total, percent, stage: "upload" });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      reject(new Error(`Storage upload failed with status ${xhr.status}.`));
    };
    xhr.onerror = () => reject(new Error("The browser could not upload the file to Supabase Storage."));
    xhr.onabort = () => reject(new Error("The file upload was cancelled."));
    xhr.send(file);
  });
}

export async function uploadB2cFile(file, onProgress = () => {}) {
  if (!file || !Number(file.size)) throw new Error("Choose a valid file first.");
  if (Number(file.size) > 10 * 1024 * 1024) throw new Error(`${file.name || "File"} is larger than 10 MB.`);

  onProgress({ loaded: 0, total: file.size, percent: 1, stage: "ticket" });
  const response = await fetch("/next/api/b2c/upload-ticket", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name || "attachment", mime: file.type || "application/octet-stream", size: file.size }),
  });
  if (response.status === 401 && typeof window !== "undefined") {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new Error("Your session has expired.");
  }
  const payload = await responseJson(response);
  if (!response.ok || payload?.ok === false || !payload?.upload?.signedUrl || !payload?.file?.url) {
    const error = new Error(text(payload?.error) || "Could not prepare the B2C file upload.");
    error.status = response.status;
    throw error;
  }

  await putFile(payload, file, onProgress);
  onProgress({ loaded: file.size, total: file.size, percent: 100, stage: "complete" });
  return payload.file;
}

export default uploadB2cFile;
