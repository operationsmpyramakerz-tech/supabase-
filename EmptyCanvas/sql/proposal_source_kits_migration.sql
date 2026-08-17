-- Track the real kit source(s) that contributed each proposal item.
-- Required for accurate "By kits tag" grouping without re-expanding a product
-- into every kit that happens to contain it in the global kit catalogue.

alter table public.product_proposal_items
  add column if not exists source_kits jsonb not null default '[]'::jsonb;

comment on column public.product_proposal_items.source_kits is
  'Kit contribution metadata used by proposal grouping/export. Shape: [{kitId, kitName, quantity, order}].';

create index if not exists product_proposal_items_source_kits_gin_idx
  on public.product_proposal_items using gin (source_kits);
