---
tipo: componente-tecnico
estado: activo
repo: stream
proyecto: stream-resources
componente: overlay-obs
ruta:
  - public/overlay/index.html
  - public/overlay/intermission.html
eventos_overlay:
  - alert
  - image
  - video
  - sound
  - fullscreen_clip
up: "[[10 Repositorios GitHub/_repos/stream/obsidian/00 - Indice Stream]]"
tags:
  - Streaming
  - OBS
  - LeksimusBOT
  - Twitch
---

# Overlay OBS

## Archivo

> [!info] Fuente
> - [public/overlay/index.html](<../public/overlay/index.html>)
> - [public/overlay/intermission.html](<../public/overlay/intermission.html>)

## Funcion

> [!summary] Browser Source
> Overlay transparente para OBS que se conecta por WebSocket al servidor de Leksimus usando `room` o `streamer`. Renderiza recursos visuales y sonoros sobre una grilla 3x3 o como clip fullscreen.

> [!summary] Intermision
> `public/overlay/intermission.html` guarda la escena standalone de intermission de Leksimus Bot. Esta pensada para Browser Source 1920x1080, con slot principal, chat lateral, widget libre, panel de redes, reloj y guias activables con `?guides=on`.

## Contrato de eventos

> [!example] Eventos
> | Tipo | Uso |
> |---|---|
> | `alert` | Caja de texto con subtitulo opcional |
> | `image` | Imagen posicionada en grilla |
> | `video` | Video posicionado en grilla |
> | `sound` | Sonido sin visual |
> | `fullscreen_clip` | Video a pantalla completa |

## Dependencia

> [!quote] Leksimus
> Este overlay depende del bus WebSocket de [[08 Proyectos/Leksimus BOT/Leksimus BOT]]. El repo `stream` aporta la superficie visual y los assets; Leksimus decide cuando y a que room emitir.
