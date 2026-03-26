create or replace function public.asset_gallery_id(p_asset_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  g_id uuid;
begin
  perform set_config('row_security', 'off', true);

  select a.gallery_id
    into g_id
  from public.assets a
  where a.id = p_asset_id;

  return g_id;
end;
$$;

create or replace function public.is_gallery_owner(p_gallery_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('row_security', 'off', true);

  return exists(
    select 1
    from public.galleries g
    where g.id = p_gallery_id
      and g.photographer_user_id = p_user_id
  );
end;
$$;

create or replace function public.is_gallery_client(p_gallery_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('row_security', 'off', true);

  return exists(
    select 1
    from public.gallery_clients gc
    where gc.gallery_id = p_gallery_id
      and gc.client_user_id = p_user_id
  );
end;
$$;

create or replace function public.can_client_access_gallery(p_gallery_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('row_security', 'off', true);

  return exists(
    select 1
    from public.galleries g
    join public.gallery_clients gc on gc.gallery_id = g.id
    where g.id = p_gallery_id
      and g.status = 'published'
      and gc.client_user_id = p_user_id
  );
end;
$$;

create or replace function public.can_client_access_asset(p_asset_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('row_security', 'off', true);

  return exists(
    select 1
    from public.assets a
    join public.galleries g on g.id = a.gallery_id
    join public.gallery_clients gc on gc.gallery_id = g.id
    where a.id = p_asset_id
      and g.status = 'published'
      and gc.client_user_id = p_user_id
  );
end;
$$;

drop policy if exists galleries_client_select on public.galleries;
create policy galleries_client_select on public.galleries
for select to authenticated
using (public.can_client_access_gallery(galleries.id, auth.uid()));

drop policy if exists assets_photographer_select on public.assets;
create policy assets_photographer_select on public.assets
for select to authenticated
using (public.is_gallery_owner(assets.gallery_id, auth.uid()));

drop policy if exists assets_client_select on public.assets;
create policy assets_client_select on public.assets
for select to authenticated
using (public.can_client_access_gallery(assets.gallery_id, auth.uid()));

drop policy if exists assets_photographer_write on public.assets;
create policy assets_photographer_write on public.assets
for all to authenticated
using (public.is_gallery_owner(assets.gallery_id, auth.uid()))
with check (public.is_gallery_owner(assets.gallery_id, auth.uid()));

drop policy if exists gallery_clients_photographer_select on public.gallery_clients;
create policy gallery_clients_photographer_select on public.gallery_clients
for select to authenticated
using (public.is_gallery_owner(gallery_clients.gallery_id, auth.uid()));

drop policy if exists gallery_invites_photographer_select on public.gallery_invites;
create policy gallery_invites_photographer_select on public.gallery_invites
for select to authenticated
using (public.is_gallery_owner(gallery_invites.gallery_id, auth.uid()));

drop policy if exists gallery_invites_photographer_write on public.gallery_invites;
create policy gallery_invites_photographer_write on public.gallery_invites
for all to authenticated
using (public.is_gallery_owner(gallery_invites.gallery_id, auth.uid()))
with check (public.is_gallery_owner(gallery_invites.gallery_id, auth.uid()));

drop policy if exists proof_marks_photographer_select on public.proof_marks;
create policy proof_marks_photographer_select on public.proof_marks
for select to authenticated
using (public.is_gallery_owner(public.asset_gallery_id(proof_marks.asset_id), auth.uid()));

drop policy if exists proof_marks_client_write on public.proof_marks;
create policy proof_marks_client_write on public.proof_marks
for insert to authenticated
with check (
  client_user_id = auth.uid()
  and public.can_client_access_asset(proof_marks.asset_id, auth.uid())
);

drop policy if exists comments_photographer_select on public.comments;
create policy comments_photographer_select on public.comments
for select to authenticated
using (public.is_gallery_owner(public.asset_gallery_id(comments.asset_id), auth.uid()));

drop policy if exists comments_client_select on public.comments;
create policy comments_client_select on public.comments
for select to authenticated
using (public.can_client_access_asset(comments.asset_id, auth.uid()));

drop policy if exists comments_client_insert on public.comments;
create policy comments_client_insert on public.comments
for insert to authenticated
with check (
  author_user_id = auth.uid()
  and public.can_client_access_asset(comments.asset_id, auth.uid())
);
