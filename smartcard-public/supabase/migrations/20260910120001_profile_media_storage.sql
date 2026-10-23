-- ---------------------------------------------------------------------------
-- Fase 14: bucket de Supabase Storage para las fotos/logos de perfiles.
--
-- Quién puede escribir sigue exactamente el mismo criterio que ya rige la
-- tabla profiles (profiles_update, en 20260905120012_rls_policies.sql):
-- SUPERADMIN + ADMIN. No se inventa un nivel de permiso nuevo -- subir una
-- foto es, conceptualmente, la misma acción que editar cualquier otro campo
-- del perfil, solo que el valor es un archivo en vez de texto.
--
-- La lectura es pública a propósito: estas imágenes las muestra la página
-- pública del perfil (apps/public), sin sesión de por medio -- igual que
-- photo_url/logo_url ya eran visibles para cualquiera vía get_public_profile.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-media',
  'profile-media',
  true,
  5242880, -- 5 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- El bucket ya es "public" (Supabase deja leer sus objetos por la URL
-- pública sin pasar por RLS), pero se agrega también la política explícita
-- de select -- así una lectura autenticada (por ejemplo desde Studio, o si
-- algún día el panel necesita listar/descargar en vez de solo enseñar la
-- URL pública) se comporta igual, sin depender únicamente de la bandera del
-- bucket.
create policy profile_media_select on storage.objects for select
  using (bucket_id = 'profile-media');

create policy profile_media_insert on storage.objects for insert
  with check (
    bucket_id = 'profile-media'
    and public.current_admin_role() in ('SUPERADMIN', 'ADMIN')
  );

create policy profile_media_update on storage.objects for update
  using (
    bucket_id = 'profile-media'
    and public.current_admin_role() in ('SUPERADMIN', 'ADMIN')
  )
  with check (
    bucket_id = 'profile-media'
    and public.current_admin_role() in ('SUPERADMIN', 'ADMIN')
  );

-- No se usa para borrar perfiles enteros (eso sigue siendo profiles_delete,
-- solo SUPERADMIN) -- esto es solo para reemplazar/quitar una imagen, la
-- misma acción de "editar" que ya cubre profiles_update.
create policy profile_media_delete on storage.objects for delete
  using (
    bucket_id = 'profile-media'
    and public.current_admin_role() in ('SUPERADMIN', 'ADMIN')
  );
