# v392 — Projects Preparing: Edit permission for each stage tab

In Users Center → Advanced Permissions → Projects Preparing, turn on **Enable individual Edit permissions for each stage tab**. Configure independent Edit rights for every filter within the 6 stages. View/Open stage grants remain separate.

**Backwards compatibility:** The new switch is OFF for existing users. Their previous stage edit rights continue unchanged until this switch is explicitly enabled and saved.

**API security:** server routes check each edit request against the user's stage+tab grant, and evaluate each targeted record against the current server-side filter when necessary. UI disable alone is never treated as authorization. An allowed Received tab cannot edit rows that aren't currently Received. History and downloads retain prior read rights.

**Special actions:** Creating/renaming/cancelling Box Labels requires Edit All Components in Box Distribution. Creating a project carton is available with All Cartons or Draft permission. Project stage closures still obey existing stage closure permissions and are unaffected.

**Deploy:** replace the modified files at their original paths. No new Supabase tables or migrations are required; permission grants are stored in existing feature grant records. Test the flow with a non-admin user before production use.
