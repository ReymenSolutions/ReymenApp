# Interfaz del CRM: lenguaje visual y movimiento

Referencia rápida para que las pantallas nuevas del CRM se vean y se muevan igual que las demás.

## Tokens (`src/app/globals.css`)
| Token | Uso |
|---|---|
| `rounded-card` / `rounded-chip` | radios de tarjetas y de chips/íconos |
| `shadow-card`, `shadow-card-hover`, `shadow-pop` | sombras: reposo, elevación al pasar el cursor, menús/paneles/arrastre |
| `motion-micro` (180 ms), `motion-enter` (320 ms) | transiciones; paneles usan 300 ms |
| `reveal` + `style={{ "--i": n }}` | entrada escalonada (opacidad + 8 px, 50 ms por elemento, tope 12) |
| `animate-panel-in/out`, `animate-overlay-in/out`, `animate-pop-in`, `animate-note-in`, `animate-skeleton` | animaciones de paneles, menús, notas nuevas y esqueletos |

Easing único: `--ease-smooth` (sin rebotes). Solo se animan `transform` y `opacity` (más color/sombra en microinteracciones). `prefers-reduced-motion` desactiva todas las animaciones de CSS y las de JavaScript.

## Primitivas (`src/components/motion`, `src/components/ui`)
- `AnimatedNumber`: cifra que sube desde 0 al cargar y se interpola desde el valor anterior al cambiar; el lector de pantalla recibe siempre el valor final. Formatos en `src/lib/format-number.ts` (moneda, porcentaje, decimales).
- `AnimatedBar`: barra que crece al aparecer y se ajusta con suavidad (usa `transform`).
- `Reveal`: entrada escalonada para componentes de servidor (CSS puro).
- `useFlip`: anima la reorganización de una lista (técnica FLIP) con `data-flip-id`.
- `useReducedMotion`: preferencia del sistema.
- `Skeleton`: bloques de carga; cada `loading.tsx` reproduce la estructura final de su pantalla.
- `Sheet`: panel lateral derecho accesible (Radix Dialog): fondo atenuado, Escape, foco atrapado y devuelto a quien lo abrió.
- `Button` acepta `loading` (indicador + bloqueo contra doble envío).

## Pantallas
- **Dashboard** (`/portal/dashboard`): `MetricCard` (`variant="hero"` para la métrica principal, `trend` para la variación, `children` para datos secundarios). Valor en pipeline y variación de leads salen de `src/lib/crm-dashboard.ts` con datos reales: no se mezclan monedas y sin periodo previo no se muestra variación.
- **Pipeline** (`/portal/pipeline`): `PipelineBoard` con `@dnd-kit/core` (ratón, toque con pulsación larga y teclado: Espacio para tomar, flechas para elegir etapa, Espacio para soltar). Guarda con `moveOpportunityStage`; si falla, la tarjeta regresa y se avisa. Cada tarjeta tiene también "Mover a…" para cambiar de etapa sin arrastrar.
- **Detalle**: `LeadDetailPanel` (panel lateral) se abre desde el pipeline y desde la tabla de leads (clic normal; Ctrl/Cmd/clic medio van a la ficha completa). Carga con `getLeadPanel` (acotado a la organización).

## Modo oscuro
`white` se remapea a superficie oscura (ver cabecera de `globals.css`): lo que deba verse blanco encima de un degradado se escribe con `rgb(255 255 255 / …)`, no con `bg-white`.
