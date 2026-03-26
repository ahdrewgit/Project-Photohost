insert into storage.buckets (id, name, public)
values ('gallery-assets', 'gallery-assets', false)
on conflict (id) do update set name = excluded.name, public = excluded.public;
