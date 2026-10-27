# Orders Performance — Phase 17 (Proposal bundle reuse)

## What changed

The Phase 14 live Supabase RPC already returns proposal-item rows for the
requested order components. In the old path, one order component with no
stored `source_kits` could force one (or two) additional REST queries for the
same proposal, even when the current bundle had already proven that the exact
proposal/product entry has an empty source array.

Phase 17 now:

1. Reuses the original bundle's live proposal data to confirm that an exact
   proposal/product match has *no* source array; it doesn't make a duplicate
   REST lookup for that confirmed-empty pair.
2. Keeps the existing stored `kitTag` fallback (including its quantity) when
   source provenance is empty.
3. For a genuinely unresolved historical proposal/product link, skips the
   redundant targeted query that duplicated the bundle's exact-match attempt.
   It goes straight to the existing full-fidelity lookup.
4. Preserves the original compatibility path when the bundle RPC is missing,
   malformed, or incomplete. There is no persistent cache or change to
   authorization, order statuses, quantities or Supabase data.

## Upload

Upload the changed files preserving the paths under `supabase--main/`.
**No SQL is required.** The Phase 14 RPC must already be active (your timing
with `fastPath;dur=1.0` confirms this).

## Validate

After deploying, reload Operations Orders, enable **Speed**, and open the
same ORD-3 once with a *fresh* request. Compare `Click -> visible` and
`Server breakdown` with the prior recorded result:

- Before: **3414 ms total**, `bundle=1239.3`, `proposalItems=1047.0`,
  `proposalFallback=658.6`, `proposalUnresolved=1`, `proposalRecovered=0`.
- New `bundleProposalEmpty`: count of exact proposal/product rows for which
  the bundle positively confirms an empty source array.
- New `bundleProposalFullOnly`: count of unresolved legacy rows that skip
  the already-redundant targeted query but still get the compatibility lookup.
- New `proposalConfirmedEmpty`: number of rows omitted from extra REST calls.

If `proposalConfirmedEmpty=1` and `proposalUnresolved=0`, the extra Proposal
REST call has been skipped. If `bundleProposalFullOnly=1`, the full legacy
lookup is still needed; expect some remaining delay. The precise performance
gain depends on the live network and Supabase timings.

The Phase 16 backfill applied from SQL Editor can only populate rows with a
unique match containing nonempty sources. It cannot fill empty/missing
historical provenance safely. This change deals with that case at read-time.

## Safety

No permission check is moved or bypassed: the API route still authenticates
and authorizes before the bundle query. No data is cached across users or
persistently stored. The known-empty optimization requires a positive,
exact proposal/product match in the live database result. If a match is
missing, ambiguous or malformed, the existing full-fidelity lookup remains.

Static syntax and logic tests were run locally. No live Supabase benchmark or
Vercel deployment was performed in this environment.
