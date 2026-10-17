-- Allow WebP uploads alongside JPEG. The client compresses photos before uploading; browsers that
-- support WebP encoding produce files about 25–30 % smaller at the same visual quality. Existing
-- JPEG files are not affected. The file extension in the path stays `.jpg` for simplicity: what
-- matters is the MIME type in the Content-Type header, not the extension.

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/webp']
where id = 'moments';

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/webp']
where id = 'chat';
