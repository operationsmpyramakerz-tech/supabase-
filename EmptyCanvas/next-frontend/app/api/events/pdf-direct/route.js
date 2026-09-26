import { PassThrough } from "node:stream";
import { NextResponse } from "next/server";
import eventRequestPdfModule from "../../../../lib/eventRequestPdf";
import { getEvent, eventsDataError } from "../../../../lib/events-data";
import { getDirectAccountGate } from "../../../../lib/products-auth";

const { pipeEventRequestPDF } = eventRequestPdfModule;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function text(value) {
  return String(value ?? "").trim();
}

function safeFilePart(value, fallback = "event_request") {
  const cleaned = text(value || fallback)
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return cleaned || fallback;
}

function jsonError(message, status = 500) {
  return NextResponse.json(
    { ok: false, error: message || "Event PDF export failed." },
    { status: Number(status) || 500, headers: { "Cache-Control": "private, no-store" } },
  );
}

function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.once("end", finish);
    stream.once("error", fail);
  });
}

async function renderEventPdf(event) {
  const stream = new PassThrough();
  const bufferPromise = collectStream(stream);
  await pipeEventRequestPDF(event || {}, stream);
  return await bufferPromise;
}

export async function GET(request) {
  const gate = await getDirectAccountGate(["Event Calendar", "Event Requests"]);
  if (!gate.ok) return jsonError(gate.error || "Authentication required.", gate.status || 503);

  const url = new URL(request.url);
  const id = text(url.searchParams.get("id"));
  if (!id) return jsonError("Invalid event ID.", 400);

  try {
    const event = await getEvent(id);
    if (!event) return jsonError("Event request was not found.", 404);

    const buffer = await renderEventPdf(event);
    const fileName = `event_request_${safeFilePart(event.eventCode || event.eventName)}.pdf`;
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
        "X-ERP-Export-Mode": "next-direct",
      },
    });
  } catch (error) {
    console.error("[events] direct PDF export failed:", error?.details || error?.message || error);
    return jsonError(eventsDataError(error), Number(error?.status) || 500);
  }
}
