create extension if not exists pgcrypto;

create table if not exists photographer_profiles (
  user_id uuid primary key,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists client_profiles (
  user_id uuid primary key,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists galleries (
  id uuid primary key default gen_random_uuid(),
  photographer_user_id uuid not null,
  title text not null,
  description text,
  status text not null default 'draft',
  favorite_limit int not null default 0,
  downloads_locked boolean not null default true,
  price_cents int not null default 0,
  currency text not null default 'usd',
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists galleries_photographer_user_id_idx on galleries (photographer_user_id);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null,
  storage_path_original text not null,
  storage_path_thumb text not null,
  sort_order int not null default 0,
  kind text not null default 'proof',
  created_at timestamptz not null default now()
);

create index if not exists assets_gallery_id_idx on assets (gallery_id);
create unique index if not exists assets_original_path_uq on assets (storage_path_original);
create unique index if not exists assets_thumb_path_uq on assets (storage_path_thumb);

create table if not exists gallery_clients (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null,
  client_user_id uuid not null,
  created_at timestamptz not null default now()
);

create unique index if not exists gallery_clients_gallery_client_uq on gallery_clients (gallery_id, client_user_id);
create index if not exists gallery_clients_client_user_id_idx on gallery_clients (client_user_id);

create table if not exists gallery_invites (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null,
  email text not null,
  token text not null,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_user_id uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists gallery_invites_token_uq on gallery_invites (token);
create index if not exists gallery_invites_gallery_id_idx on gallery_invites (gallery_id);

create table if not exists proof_marks (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null,
  client_user_id uuid not null,
  is_favorite boolean not null default false,
  rating int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proof_marks_rating_chk check (rating is null or (rating >= 1 and rating <= 5))
);

create unique index if not exists proof_marks_asset_client_uq on proof_marks (asset_id, client_user_id);
create index if not exists proof_marks_client_user_id_idx on proof_marks (client_user_id);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null,
  author_user_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_asset_id_idx on comments (asset_id);
create index if not exists comments_author_user_id_idx on comments (author_user_id);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null,
  client_user_id uuid not null,
  stripe_session_id text not null,
  status text not null default 'created',
  amount_cents int not null default 0,
  currency text not null default 'usd',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create unique index if not exists orders_stripe_session_uq on orders (stripe_session_id);
create index if not exists orders_gallery_id_idx on orders (gallery_id);
create index if not exists orders_client_user_id_idx on orders (client_user_id);

create table if not exists gallery_entitlements (
  gallery_id uuid not null,
  client_user_id uuid not null,
  downloads_unlocked boolean not null default false,
  unlocked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (gallery_id, client_user_id)
);

create index if not exists gallery_entitlements_client_user_id_idx on gallery_entitlements (client_user_id);

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists proof_marks_touch_updated_at on proof_marks;
create trigger proof_marks_touch_updated_at
before update on proof_marks
for each row execute function touch_updated_at();

create or replace function enforce_favorite_limit() returns trigger as $$
declare
  g_id uuid;
  fav_limit int;
  fav_count int;
begin
  if new.is_favorite is distinct from true then
    return new;
  end if;

  select a.gallery_id into g_id from assets a where a.id = new.asset_id;
  if g_id is null then
    return new;
  end if;

  select g.favorite_limit into fav_limit from galleries g where g.id = g_id;
  if fav_limit is null or fav_limit <= 0 then
    return new;
  end if;

  select count(*) into fav_count
  from proof_marks pm
  join assets a on a.id = pm.asset_id
  where pm.client_user_id = new.client_user_id
    and pm.is_favorite = true
    and a.gallery_id = g_id
    and pm.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if fav_count >= fav_limit then
    raise exception 'favorite limit reached';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists proof_marks_enforce_favorite_limit on proof_marks;
create trigger proof_marks_enforce_favorite_limit
before insert or update of is_favorite on proof_marks
for each row execute function enforce_favorite_limit();

alter table photographer_profiles enable row level security;
alter table client_profiles enable row level security;
alter table galleries enable row level security;
alter table assets enable row level security;
alter table gallery_clients enable row level security;
alter table gallery_invites enable row level security;
alter table proof_marks enable row level security;
alter table comments enable row level security;
alter table orders enable row level security;
alter table gallery_entitlements enable row level security;

drop policy if exists photographer_profiles_self_select on photographer_profiles;
create policy photographer_profiles_self_select on photographer_profiles
for select to authenticated
using (user_id = auth.uid());

drop policy if exists photographer_profiles_self_upsert on photographer_profiles;
create policy photographer_profiles_self_upsert on photographer_profiles
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists photographer_profiles_self_update on photographer_profiles;
create policy photographer_profiles_self_update on photographer_profiles
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists client_profiles_self_select on client_profiles;
create policy client_profiles_self_select on client_profiles
for select to authenticated
using (user_id = auth.uid());

drop policy if exists galleries_photographer_select on galleries;
create policy galleries_photographer_select on galleries
for select to authenticated
using (photographer_user_id = auth.uid());

drop policy if exists galleries_client_select on galleries;
create policy galleries_client_select on galleries
for select to authenticated
using (
  exists (
    select 1 from gallery_clients gc
    where gc.gallery_id = galleries.id
      and gc.client_user_id = auth.uid()
  )
);

drop policy if exists galleries_photographer_write on galleries;
create policy galleries_photographer_write on galleries
for all to authenticated
using (photographer_user_id = auth.uid())
with check (photographer_user_id = auth.uid());

drop policy if exists assets_photographer_select on assets;
create policy assets_photographer_select on assets
for select to authenticated
using (
  exists (
    select 1 from galleries g
    where g.id = assets.gallery_id
      and g.photographer_user_id = auth.uid()
  )
);

drop policy if exists assets_client_select on assets;
create policy assets_client_select on assets
for select to authenticated
using (
  exists (
    select 1
    from galleries g
    join gallery_clients gc on gc.gallery_id = g.id
    where g.id = assets.gallery_id
      and gc.client_user_id = auth.uid()
      and g.status = 'published'
  )
);

drop policy if exists assets_photographer_write on assets;
create policy assets_photographer_write on assets
for all to authenticated
using (
  exists (
    select 1 from galleries g
    where g.id = assets.gallery_id
      and g.photographer_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from galleries g
    where g.id = assets.gallery_id
      and g.photographer_user_id = auth.uid()
  )
);

drop policy if exists gallery_clients_photographer_select on gallery_clients;
create policy gallery_clients_photographer_select on gallery_clients
for select to authenticated
using (
  exists (
    select 1 from galleries g
    where g.id = gallery_clients.gallery_id
      and g.photographer_user_id = auth.uid()
  )
);

drop policy if exists gallery_clients_client_select on gallery_clients;
create policy gallery_clients_client_select on gallery_clients
for select to authenticated
using (client_user_id = auth.uid());

drop policy if exists gallery_invites_photographer_select on gallery_invites;
create policy gallery_invites_photographer_select on gallery_invites
for select to authenticated
using (
  exists (
    select 1 from galleries g
    where g.id = gallery_invites.gallery_id
      and g.photographer_user_id = auth.uid()
  )
);

drop policy if exists gallery_invites_photographer_write on gallery_invites;
create policy gallery_invites_photographer_write on gallery_invites
for all to authenticated
using (
  exists (
    select 1 from galleries g
    where g.id = gallery_invites.gallery_id
      and g.photographer_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from galleries g
    where g.id = gallery_invites.gallery_id
      and g.photographer_user_id = auth.uid()
  )
);

drop policy if exists proof_marks_photographer_select on proof_marks;
create policy proof_marks_photographer_select on proof_marks
for select to authenticated
using (
  exists (
    select 1
    from assets a
    join galleries g on g.id = a.gallery_id
    where a.id = proof_marks.asset_id
      and g.photographer_user_id = auth.uid()
  )
);

drop policy if exists proof_marks_client_select on proof_marks;
create policy proof_marks_client_select on proof_marks
for select to authenticated
using (client_user_id = auth.uid());

drop policy if exists proof_marks_client_write on proof_marks;
create policy proof_marks_client_write on proof_marks
for insert to authenticated
with check (
  client_user_id = auth.uid()
  and exists (
    select 1
    from assets a
    join galleries g on g.id = a.gallery_id
    join gallery_clients gc on gc.gallery_id = g.id
    where a.id = proof_marks.asset_id
      and gc.client_user_id = auth.uid()
      and g.status = 'published'
  )
);

drop policy if exists proof_marks_client_update on proof_marks;
create policy proof_marks_client_update on proof_marks
for update to authenticated
using (
  client_user_id = auth.uid()
)
with check (
  client_user_id = auth.uid()
);

drop policy if exists comments_photographer_select on comments;
create policy comments_photographer_select on comments
for select to authenticated
using (
  exists (
    select 1
    from assets a
    join galleries g on g.id = a.gallery_id
    where a.id = comments.asset_id
      and g.photographer_user_id = auth.uid()
  )
);

drop policy if exists comments_client_select on comments;
create policy comments_client_select on comments
for select to authenticated
using (
  exists (
    select 1
    from assets a
    join galleries g on g.id = a.gallery_id
    join gallery_clients gc on gc.gallery_id = g.id
    where a.id = comments.asset_id
      and gc.client_user_id = auth.uid()
      and g.status = 'published'
  )
);

drop policy if exists comments_client_insert on comments;
create policy comments_client_insert on comments
for insert to authenticated
with check (
  author_user_id = auth.uid()
  and exists (
    select 1
    from assets a
    join galleries g on g.id = a.gallery_id
    join gallery_clients gc on gc.gallery_id = g.id
    where a.id = comments.asset_id
      and gc.client_user_id = auth.uid()
      and g.status = 'published'
  )
);

drop policy if exists orders_photographer_select on orders;
create policy orders_photographer_select on orders
for select to authenticated
using (
  exists (
    select 1
    from galleries g
    where g.id = orders.gallery_id
      and g.photographer_user_id = auth.uid()
  )
);

drop policy if exists orders_client_select on orders;
create policy orders_client_select on orders
for select to authenticated
using (client_user_id = auth.uid());

drop policy if exists gallery_entitlements_photographer_select on gallery_entitlements;
create policy gallery_entitlements_photographer_select on gallery_entitlements
for select to authenticated
using (
  exists (
    select 1
    from galleries g
    where g.id = gallery_entitlements.gallery_id
      and g.photographer_user_id = auth.uid()
  )
);

drop policy if exists gallery_entitlements_client_select on gallery_entitlements;
create policy gallery_entitlements_client_select on gallery_entitlements
for select to authenticated
using (client_user_id = auth.uid());

alter table proof_marks replica identity full;
alter table comments replica identity full;

do $$
begin
  alter publication supabase_realtime add table proof_marks;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime add table comments;
exception when duplicate_object then
  null;
end $$;

grant usage on schema public to anon, authenticated;

grant select on galleries, assets to authenticated;
grant select, insert, update on proof_marks, comments to authenticated;
grant select on gallery_entitlements, orders to authenticated;
grant select on gallery_invites, gallery_clients to authenticated;
grant select, insert, update on photographer_profiles to authenticated;
