begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'tournament-banners',
  'tournament-banners',
  true,
  null,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = null,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

commit;

-- Uploads are authorized with short-lived signed upload tokens created by the
-- service-role server action. The public bucket serves saved banner URLs, so no
-- browser insert policy or public object-select policy is required.
