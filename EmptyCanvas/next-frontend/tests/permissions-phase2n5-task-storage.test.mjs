import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasTaskFileReference, referenceFromTaskUrl, taskLinkIsVisible } from "../lib/storage-task-record-policy.mjs";

const source = path => readFileSync(new URL(path, import.meta.url), "utf8");
const token = "test-b64urltoken.payloadsig";
const url = `/next/api/storage/file-direct?reference=${token}&name=test.pdf`;
const linked = { ticket_id: "abc", section_id: "s1", assignment_id: null, file_kind: "section_work" };
const task = { id: "abc", sections: [{ id: "s1", workFiles: [{ url }], attachments: [{ url: `/next/api/storage/file-direct?reference=another.token` }] }] };

test("Phase 2N5: file reference matches an exact signed token, never a substring", () => {
  assert.equal(referenceFromTaskUrl(url), token);
  assert.equal(referenceFromTaskUrl(`/api/storage/file/${token}`), token);
  assert.equal(referenceFromTaskUrl(`https://attacker.invalid/next/api/storage/file-direct?reference=${token}`), "");
  assert.equal(hasTaskFileReference([{ url }], token), true);
  assert.equal(hasTaskFileReference([{ url }], "token.payloadsig"), false);
  assert.equal(hasTaskFileReference([{ url }], "another.token"), false);
});

test("Phase 2N5: file must be in the exact parent section and be visible in current task DTO", () => {
  assert.equal(taskLinkIsVisible(linked, task, token), true);
  assert.equal(taskLinkIsVisible({ ...linked, ticket_id: "not-abc" }, task, token), false);
  assert.equal(taskLinkIsVisible({ ...linked, section_id: "s2" }, task, token), false);
  assert.equal(taskLinkIsVisible(linked, { ...task, sections: [{ id: "s1", workFiles: [] }] }, token), false);
  assert.equal(taskLinkIsVisible({ ...linked, file_kind: "section_attachment" }, task, token), false);
});

test("Phase 2N5: assignment files require a matching authorized assignment response", () => {
  const link = { ...linked, assignment_id: "a1", file_kind: "assignment_work" };
  const workflow = { assignments: [{ id: "a1", sectionId: "s1", workFiles: [{ url }] }] };
  assert.equal(taskLinkIsVisible(link, task, token, workflow), true);
  assert.equal(taskLinkIsVisible(link, task, token, null), false);
  assert.equal(taskLinkIsVisible(link, task, token, { assignments: [{ ...workflow.assignments[0], workFiles: [] }] }), false);
  assert.equal(taskLinkIsVisible({ ...link, assignment_id: "a2" }, task, token, workflow), false);
});

test("Phase 2N5: hidden work report must also clear the workFiles array", () => {
  const tasks = source("../lib/task-management-data.js");
  const viewer = tasks.split("function sectionForViewer(")[1].split("function ticketForViewer(")[0];
  assert.match(viewer, /workFile: null,\s*(?:\/\/[^\n]*\n\s*)?workFiles: \[\]/);
  const mutations = source("../lib/task-management-mutations.js");
  const assignmentViewer = mutations.split("function assignmentForViewer(")[1].split("function workflowForViewer(")[0];
  assert.match(assignmentViewer, /workFile: null, workFiles: \[\]/);
  assert.match(assignmentViewer, /assignment\.assigneeId/);
  assert.doesNotMatch(assignmentViewer, /sameAssignmentMember\(/);
});

test("Phase 2N5: download is gated by Task record check before issuing short-lived uncached URL", () => {
  const route = source("../app/api/storage/file-direct/route.js");
  const gateIdx = route.indexOf("await assertTaskStorageRecordAccess");
  const signIdx = route.indexOf("await signedDownloadUrl");
  assert.ok(gateIdx > 0 && gateIdx < signIdx);
  assert.match(route, /ERP_STORAGE_TASK_RECORD_AUTH_ENABLED/);
  assert.match(route, /expiresIn: recordAuth \? 60/);
  assert.match(route, /cache: !recordAuth/);
  assert.match(source("../lib/storage-task-record-access.js"), /getTaskManagementTicket\(ticketId, context, \{ force: true \}\)/);
  assert.match(source("../lib/storage-task-record-access.js"), /getTaskManagementPeopleWorkflow\(context, sectionId\)/);
});

test("Phase 2N5: SQL lookup is restricted to service-role and attached task columns", () => {
  const sql = source("../sql/ERP_Phase2N5_Task_Storage_Record_Access.sql");
  assert.match(sql, /REVOKE ALL.* FROM anon, authenticated/i);
  assert.match(sql, /GRANT EXECUTE.*TO service_role/i);
  assert.match(sql, /s\.attachments::text/);
  assert.match(sql, /a\.work_file_url/);
});
