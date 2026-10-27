# Probar la propuesta de perfil por IA con conversaciones reales

La IA solo propone: nunca crea un perfil sola. Esta guía sirve para comprobar, con mensajes reales, que detecta bien
**compra/renta, presupuesto, tipo y colonia**, y para ajustar las instrucciones si se equivoca. Cómo funciona está en
[`realty.md`](./realty.md#la-ia-propone-el-perfil-de-búsqueda).

## 1. Antes de empezar (checklist de 5 minutos)

| Requisito | Dónde se revisa |
| --- | --- |
| La organización tiene los módulos **CRM**, **AI WhatsApp (Agente IA)** y **Real Estate** | Admin → cliente → módulos |
| Hay un proveedor de IA configurado (`ANTHROPIC_API_KEY` en el servidor) | Portal → **Canales IA** indica si la IA está configurada |
| El canal por el que escribirás está en **Sugerir** o **Automático** (en **Apagado** no analiza nada) | Portal → **Canales IA** |
| Hay presupuesto de IA disponible | Portal → **Mi consumo de IA** (si se agota, la IA pausa sola) |
| Tu zona de prueba existe como colonia en Real Estate → Configuración | Así «Aceptar» puede ligar la zona |
| El contacto **no** tiene ya un perfil de búsqueda activo ni una propuesta pendiente/descartada hace < 30 días | Ficha del contacto → «Lo que busca» |

Cada mensaje entra por el canal real (WhatsApp vía n8n, o el que tengas conectado). Entre dos análisis de la **misma
conversación** pasan al menos **10 minutos**, así que espera ese tiempo entre una prueba y otra.

## 2. Qué mensajes mandar (desde un teléfono que no sea el del negocio)

Usa un número que no esté en el CRM, para que cree un contacto nuevo. Manda cada caso **en una conversación distinta**
(o espera 10 minutos entre uno y otro).

| # | Mensaje | Qué debe proponer |
| --- | --- | --- |
| 1 | «Hola, busco casa en venta en Cumbres, hasta 4.5 millones, de 3 recámaras con estacionamiento» | Compra · Casa · máx. $4.5M · Cumbres · 3+ recámaras · Estacionamiento |
| 2 | «Quiero rentar un depa por San Pedro, ando en unos 25 mil al mes» | Renta · Departamento · máx. $25k · San Pedro |
| 3 | «Me interesa comprar, mi presupuesto es de 2 a 3 millones, zona Apodaca o Mitras» | Compra · mín. $2M · máx. $3M · Apodaca, Mitras |
| 4 | «Hola, ¿tienen casas?» | **Nada** (no dijo ni compra/renta ni presupuesto) |
| 5 | «Busco casa en Cumbres» (sin presupuesto) | **Nada** (falta presupuesto: no se inventa) |
| 6 | «Me urge algo, tengo 3.5 mdp, ¿qué tienen por Valle Poniente? Quiero comprar» | Compra · máx. $3.5M · Valle Poniente |
| 7 | Mensaje con una colonia que **no** tienes registrada | Propone, pero «Colonias» muestra el nombre y al aceptar queda sin zona |
| 8 | Contacto que ya tiene perfil activo | **Nada** |

Los casos 4, 5 y 8 son tan importantes como los demás: confirman que **calla cuando no sabe**.

## 3. Dónde ver el resultado

1. Abre el contacto (CRM → Contactos) → «Lo que busca» (pestaña **Resumen** de la ficha, o el panel lateral).
   Debe aparecer la tarjeta morada **«La IA detectó lo que busca»** con las etiquetas, presupuesto, colonias y la frase de la conversación.
2. Pulsa **Editar** para ver cómo quedaría en el formulario; **Aceptar** crea el perfil; **Descartar** lo guarda como descartado.
3. Si no aparece nada en 15 minutos, revisa el punto 5.

## 4. Qué revisar (y qué hacer si falla)

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| Presupuesto mal leído («2.5 millones» como 2,500) | El modelo devolvió el número en otra unidad | Anota el mensaje exacto; se ajusta la regla del prompt (`REALTY_SYSTEM` en `src/lib/ai-pipeline.ts`) |
| Propone cuando faltaba el presupuesto | El modelo adivinó | Igual: anota el mensaje; se refuerza la instrucción «nunca adivines» |
| Tipo de propiedad equivocado («depa» → casa) | Vocabulario regional | Se agregan sinónimos al prompt |
| La colonia llega pero no se liga | No existe como zona o se escribe distinto | Crea la zona en Configuración; los nombres se comparan sin acentos ni mayúsculas |
| Presupuesto de renta vs. compra mezclado | Operación mal detectada | Anota el caso |

Lleva una hoja simple con columnas: mensaje · lo que esperabas · lo que propuso · ¿acierto? Con **20–30 conversaciones
reales** ya hay una lectura confiable; con eso se decide si se ajusta el prompt o si está listo para usarse a diario.

## 5. Si no aparece ninguna propuesta

En orden (de lo más común a lo menos):

1. **Canal en Apagado** o sin IA configurada → Portal → Canales IA.
2. **Menos de 10 minutos** desde el análisis anterior de esa conversación.
3. El mensaje **no tenía** compra/renta **y** presupuesto (comportamiento esperado).
4. El contacto **ya tenía perfil activo** o una propuesta pendiente/descartada reciente.
5. **Presupuesto de IA agotado** (pausa sola; el CRM sigue funcionando).
6. El módulo **Real Estate** no está activo para esa organización.
7. La conversación todavía no está ligada a un contacto del CRM (espera unos segundos y reintenta).

Para ver qué pasó en la base (solo soporte/administrador):

```sql
-- Propuestas de las últimas 24 h
SELECT "createdAt", "leadId", status, operation, "propertyType", "maxBudget", "zoneNames", reason
FROM "RealtyProfileSuggestion"
WHERE "createdAt" > now() - interval '1 day'
ORDER BY "createdAt" DESC;

-- Análisis de IA hechos por conversación (si hay análisis pero no propuesta, el mensaje no cumplió las condiciones)
SELECT "createdAt", "leadId", intent, summary FROM "PipelineAiRun"
WHERE "createdAt" > now() - interval '1 day' ORDER BY "createdAt" DESC;
```

## 6. Después de la prueba

- Borra las propuestas y contactos de prueba si no los quieres en producción (CRM → contacto → Eliminar contacto).
- Mándame la hoja con los casos que fallaron y ajusto el prompt con esos mensajes reales como ejemplos.
