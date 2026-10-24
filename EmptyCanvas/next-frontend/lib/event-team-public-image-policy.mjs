import { parseStrictImageDataUrl } from "./strict-upload-image.mjs";
export function parseEventTeamIdImage(dataUrl) {
  return parseStrictImageDataUrl(dataUrl, { label: "ID photo", maxBytes: 8 * 1024 * 1024 });
}

// The public portal is served by Vercel. Keep requests well below its default
// body limit, including JSON escaping and form fields.
export const PUBLIC_TEAM_MAX_BODY_BYTES = 4_300_000;
export function publicTeamUploadIsWithinLimit(dataUrl) {
  return typeof dataUrl === "string" && dataUrl.length <= 4_100_000;
}
