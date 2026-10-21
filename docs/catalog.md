# Productos en la SmartCard (catálogo de módulos)

Al editar el perfil de una SmartCard (Portal → SmartCard → Editar perfil),
la sección **Productos en la tarjeta** deja agregar productos de los módulos
activos de la empresa. En el perfil público se ven como tarjetas con foto,
precio y botón a la página del producto.

- Hoy: **Real Estate** (propiedades publicadas y disponibles → su landing `/p/<slug>?src=smartcard`).
- Después: cualquier módulo. Basta con escribir su `CatalogSource`
  (`src/lib/catalog/types.ts`) y agregarlo a `SOURCES` en `src/lib/catalog/index.ts`.
  Por ejemplo Food, cuando tenga menú digital público.

## Cómo se guarda

Cada producto es una fila de `profile_links` en el Supabase de
reymen-smartcard con `type = 'product'` y una copia de lo que muestra la
tarjeta (`title`, `subtitle`, `price_label`, `image_url`, `url`), más
`source_ref` (`realty:<id>`). Al reusar `profile_links`, los clics pasan por
`/l/<linkId>` de la app pública y se registran como cualquier link.

- El navegador solo manda el `ref`; los datos se leen en el servidor del
  módulo dueño, y solo si el producto es de la organización y está disponible.
- Máximo 12 productos por perfil; no se repite el mismo producto.
- Cuando cambia la propiedad (precio, título, fotos, estado, publicación) se
  actualiza la copia en todas las tarjetas (`src/lib/realty/smartcard-sync.ts`,
  después de responder). Si se vende, se renta, se inactiva o se despublica,
  se quita de las tarjetas.

## Requisito en reymen-smartcard

La migración `profile_link_products` (columnas nuevas en `profile_links` y
`get_public_profile()` que las devuelve) y la vista de productos en
`apps/public`. Sin esa migración, el editor avisa que los productos todavía no
están habilitados y no deja agregar. La CSP de `apps/public` debe permitir las
fotos de `https://app.reymen.mx` (`PRODUCT_IMAGE_ORIGINS`).
