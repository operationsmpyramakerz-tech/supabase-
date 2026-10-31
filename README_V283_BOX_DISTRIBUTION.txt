Projects Preparing - Separate Box Distribution step (v283)
Base source: supabase--main-282.zip

Updated timeline:
1. Project Testing
2. Warehouse Receiving
3. Production Receiving
4. Box Distribution (standalone screen)
5. Project Kit Cartons (previously #4)

Behavior:
- Production Receiving opens only its receiving view and receiving history.
- Box Distribution opens its own project step view with box controls and box history.
- The existing Production/Cartons APIs, data, and permission checks are reused.
- Stage 4 percentage = total packed qty / total project required qty.
- Stage 5 percentage = quantities in sealed (ready) project cartons / total required qty.
- Project overall = average of all five stage percentages; Project Components is still a separate Master BOM.
- Existing nine school workflow stages are unchanged.
- Stage editors shown for the Boxes step use preparing.stage_update (same verified Users Center feature permission as Production).

Verification:
- 247/247 Projects Preparing tests passed using Node's test runner.
- Changed JSX was parsed successfully; a full Next.js build or Production browser test was NOT run.
- No SQL required. Upload these changed files into the repository root, preserving folder paths.
