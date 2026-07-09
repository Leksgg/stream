# stream — guía para agentes

**Cloudflare Worker** (`name = "streams"`) que sirve recursos de stream para overlays OBS, comandos y Leksimus BOT. Rama: `main`. Remoto: `Leksgg/stream`.

## Arquitectura

- `src/worker.js` — único punto de entrada del Worker. Endpoints documentados en `README.md` (`/api/health`, `/api/assets`, `/txt/<archivo>.txt` con sus query params, `/overlay/index.html?room=...`).
- `public/` — assets estáticos servidos por el binding `ASSETS` (`run_worker_first = true`: el Worker intercepta antes de servir estáticos). Imágenes, sonidos, vídeos y textos dinámicos del overlay viven aquí.
- `scripts/scrape_nightlight.js` — scraping con Playwright de fuentes externas (única dependencia npm).
- `wrangler.toml` — configuración; logs de observabilidad activados.

## Comandos

```bash
npx wrangler dev      # desarrollo local
npx wrangler deploy   # deploy a Cloudflare
```

## Reglas

- El overlay escucha eventos WebSocket desde Leksimus (`alert`, `image`, `video`, `sound`, `fullscreen_clip`). Cambios en el contrato de eventos deben coordinarse con el repo Leksimus — no renombrar eventos unilateralmente.
- Al añadir o quitar assets de `public/`, mantener coherente el manifiesto que expone `/api/assets`.
- La carpeta `obsidian/` contiene notas de indexación para el vault Leksodia (excepción controlada de las convenciones de grafo): son notas laterales que documentan assets y endpoints. Si cambias estructura de assets o endpoints, actualiza la nota correspondiente en `obsidian/` (incluido `Inventario de archivos - stream.md`). No añadir frontmatter a código o assets para Obsidian; solo a las notas de `obsidian/`.
- `.wrangler/` y `node_modules/` son generados: no tocarlos ni indexarlos.

## Conducta del agente (cualquier modelo)

1. **Anclaje de contexto.** Al iniciar sesión y siempre que se retome el trabajo tras una compresión o resumen de contexto, releer este archivo y la tarea en curso antes de continuar.
2. **Verificar antes de afirmar.** No declarar que un endpoint u overlay funciona sin probarlo (`npx wrangler dev`). Si no se pudo verificar, decirlo explícitamente.
3. **No rellenar huecos.** El contrato de eventos WebSocket con Leksimus es fuente de verdad externa: si un evento o parámetro no está documentado aquí o en el repo Leksimus, decir "no está documentado", nunca asumir su forma.
4. **Declarar supuestos.** Antes de un cambio no trivial, listar qué se sabe, qué se asume y qué se va a comprobar; validar contra el código actual.
5. **Segunda pasada.** Revisar el propio diff contra el objetivo antes de cerrar (incluida la coherencia de `/api/assets` y las notas de `obsidian/`). Hallazgos colaterales se anotan, no se arreglan de paso.
