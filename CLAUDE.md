# stream — instrucciones para agentes

Este archivo dice dónde están las normas y qué hace falta para trabajar en el código. Las normas no se copian aquí: viven en el vault LksPrime.

## Antes de trabajar

1. **Reglas**: lee `D:\LksPrime\01 Reglas\Reglas obligatorias.md`. Se cumplen todas y se citan por su ID (T-04, R-10…). Método de trabajo en un repo: `D:\LksPrime\01 Reglas\Metodología de trabajo en repositorios.md`.
2. **Proyecto**: lee `D:\LksPrime\02 Proyectos\Streaming\Stream Resources\Stream Resources.md`: estado, enlaces y reglas del proyecto (STR-01 y STR-02). Decisiones, historial y documentación en su carpeta `Docs\`.
3. **Documentación de assets y endpoints**: en `D:\LksPrime\02 Proyectos\Streaming\Stream Resources\Docs\Repo\`. Si cambias assets o endpoints, actualiza esas notas.
4. **Skills**: qué hay y cuándo se usan, en `D:\LksPrime\00 Sistema\Índice de skills.md`.
5. **Documentación**: se escribe en el vault, en la carpeta del proyecto (V-01). En el repo solo va el `README.md` técnico. Una tarea de varias sesiones tiene su nota de actividad en `D:\LksPrime\03 Diario\Actividades\`.

## Proyecto

Cloudflare Worker (`name = "streams"`) que sirve recursos de stream para overlays de OBS, comandos y Leksimus BOT. Rama de producción: `main`. Remoto: `Leksgg/stream`.

- `src/worker.js`: único punto de entrada. Endpoints descritos en `README.md` (`/api/health`, `/api/assets`, `/txt/<archivo>.txt`, `/overlay/index.html?room=...`).
- `public/`: assets servidos por el binding `ASSETS` (`run_worker_first = true`: el Worker intercepta antes de servir estáticos).
- `scripts/scrape_nightlight.js`: scraping con Playwright de fuentes externas.
- `wrangler.toml`: configuración, con logs de observabilidad activados.

## Comandos

```bash
npx wrangler dev          # desarrollo local
npx wrangler deploy       # despliegue a Cloudflare
npm run test:e2e          # E2E con Playwright (levanta wrangler dev en :8821)
npm run test:e2e:report   # reporte HTML del último run
```

Verificación mínima (R-10): el endpoint u overlay tocado responde en `npx wrangler dev` y `npm run test:e2e` pasa.

## Lo que no hay que romper

- El contrato de eventos WebSocket con Leksimus (`alert`, `image`, `video`, `sound`, `fullscreen_clip`) solo cambia coordinado con el repo de Leksimus (STR-01).
- Al añadir o quitar assets de `public/`, el manifiesto de `/api/assets` tiene que seguir siendo coherente.
- Los E2E (`e2e/`, `@playwright/test`) son independientes de la dependencia `playwright` que usa el scraper: no se mezclan.
- `.wrangler/` y `node_modules/` son generados.
