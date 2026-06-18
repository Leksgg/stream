---
tipo: readme-repo
estado: activo
repo: stream
proyecto: stream-resources
up: "[[10 Repositorios GitHub/_repos/stream/obsidian/00 - Indice Stream]]"
tags:
  - Streaming
  - Cloudflare
  - LeksimusBOT
  - OBS
---

# stream

Cloudflare Worker para recursos de stream usados por overlays, comandos y Leksimus BOT.

## Endpoints

- `/api/health` — estado basico del Worker.
- `/api/assets` — manifiesto JSON de assets disponibles para el bot/dashboard.
- `/api/manifest` — alias de `/api/assets`.
- `/txt/<archivo>.txt` — linea aleatoria por defecto.
- `/txt/<archivo>.txt?full=true` — archivo completo.
- `/txt/<archivo>.txt?find=texto` — busqueda por texto.
- `/txt/<archivo>.txt?line=1` — linea exacta, base 1.
- `/txt/<archivo>.txt?return=3` — multiples lineas aleatorias.

## Overlay

`/overlay/index.html?room=<overlayRoomToken>`

El overlay escucha eventos WebSocket desde Leksimus y soporta:

- `alert`
- `image`
- `video`
- `sound`
- `fullscreen_clip`
