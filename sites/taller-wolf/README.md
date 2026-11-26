# Taller Wolf · Landing page

Una sola página estática: `index.html` (HTML, CSS y JS en el mismo archivo, sin dependencias ni backend).

## Archivos
- `index.html` — la página completa.
- `taller-wolf-logo-limpio.png` — el logo oficial, tal cual (800×825, fondo negro). La página es de fondo claro y
  muestra el logo como placa negra con esquinas redondeadas en el encabezado, la portada y el pie; también es el
  ícono de la pestaña y la vista previa al compartir (Open Graph).

## Probar en tu computadora
```bash
cd taller-wolf
python3 -m http.server 8080
```
Abre http://localhost:8080. También funciona abriendo `index.html` con doble clic, pero el mapa se ve mejor desde el
servidor local.

Para verla como celular: en Chrome, F12 → ícono de dispositivo (Ctrl+Shift+M).

## Al publicarla
En `<head>`, cambia `og:image` (y la `image` del bloque JSON-LD) por la URL completa del logo, por ejemplo
`https://tu-dominio.mx/taller-wolf-logo-limpio.png`, para que WhatsApp y Facebook muestren el logo al compartir.

## Estado (23 nov 2026)
- **En pausa** mientras se trabaja con Grupo Carvallo.
- Lista: fondo claro, logo real (`taller-wolf-logo-limpio.png`, sin modificar), 9 servicios, horario lun–vie 9–19 y sáb 9–15, formulario que arma el mensaje de WhatsApp al 871 107 9931.
- Pendiente: dominio y publicación (cambiar `og:image` a URL completa), confirmar el pin del mapa, y la propuesta de piezas de marca con Higgsfield (logo animado; sin fotos de IA presentadas como del taller).
