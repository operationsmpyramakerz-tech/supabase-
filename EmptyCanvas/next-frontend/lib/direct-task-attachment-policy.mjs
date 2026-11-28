// Private direct-task uploads have a separate, signed owner-bound path prefix.
// An existing workflow link, a URL copied from another task, or a forged
// client filename cannot be attached to a newly created individual task.
import { createHash } from "node:crypto";
import { referenceFromTaskUrl } from "./storage-task-record-policy.mjs";

export const DIRECT_TASK_ATTACHMENT_PREFIX = "task-management/attachments/direct-tasks/";
export const DIRECT_TASK_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DIRECT_TASK_ATTACHMENT_MAX_FILES = 20;
export const DIRECT_TASK_ATTACHMENT_BUCKET = "erp-private-files";

function invalid(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function directTaskOwnerPrefix(memberId) {
  const id = String(memberId || "").trim();
  if (!id) invalid("Your member identity could not be verified.", 403);
  return DIRECT_TASK_ATTACHMENT_PREFIX + createHash("sha256").update(id).digest("hex") + "/";
}

export function isDirectTaskAttachment(payload) {
  return payload?.scope === "task-management" && String(payload.path || "").startsWith(DIRECT_TASK_ATTACHMENT_PREFIX);
}

export function validateDirectTaskAttachments(files, { memberId, verifyReference, makeUrl }) {
  if (files == null) return [];
  if (!Array.isArray(files) || files.length > DIRECT_TASK_ATTACHMENT_MAX_FILES) invalid("Choose at most 20 attachments.");
  if (!files.length) return [];
  const ownerPrefix = directTaskOwnerPrefix(memberId);
  const seen = new Set();
  const output = [];
  for (const file of files) {
    const ref = referenceFromTaskUrl(file?.url);
    if (!ref) invalid("Invalid task attachment.");
    const payload = verifyReference(ref);
    if (!isDirectTaskAttachment(payload) || payload.recordAuthRequired !== true ||
        !String(payload.path).startsWith(ownerPrefix) || payload.bucket !== DIRECT_TASK_ATTACHMENT_BUCKET) {
      invalid("This attachment does not belong to your task uploads.", 403);
    }
    if (!Number.isSafeInteger(payload.size) || payload.size < 1 || payload.size > DIRECT_TASK_ATTACHMENT_MAX_BYTES) invalid("Attachments must be 10 MB or less.");
    if (seen.has(ref)) continue;
    seen.add(ref);
    // Only signed metadata is trusted, never the client-provided name, type or size.
    output.push({ name: payload.name, url: makeUrl(ref, payload.name), type: payload.type, size: payload.size });
  }
  return output;
}

// Read the authenticated binary upload without buffering more than 10 MB.
// No base64 overhead, and Content-Length is only an early rejection hint.
export async function readDirectTaskAttachment(request) {
  const length = request.headers.get("content-length");
  if (length !== null && Number(length) > DIRECT_TASK_ATTACHMENT_MAX_BYTES) invalid("Attachments must be 10 MB or less.", 413);
  if (!request.body) invalid("Choose a file first.");
  const reader = request.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > DIRECT_TASK_ATTACHMENT_MAX_BYTES) {
        await reader.cancel().catch(() => {});
        invalid("Attachments must be 10 MB or less.", 413);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) invalid("The selected attachment is empty.");
  return Buffer.concat(chunks, size);
}
