---
tipo: componente-tecnico
estado: activo
repo: stream
proyecto: stream-resources
componente: worker-api
rutas:
  - src/worker.js
  - wrangler.toml
  - public/assets.json
endpoints:
  - /api/health
  - /api/assets
  - /api/manifest
  - /txt/*.txt
up: "[[10 Repositorios GitHub/_repos/stream/obsidian/00 - Indice Stream]]"
tags:
  - Streaming
  - Cloudflare
  - LeksimusBOT
---

# Worker y API

## Archivos

> [!info] Fuentes
> - [src/worker.js](<../src/worker.js>)
> - [wrangler.toml](<../wrangler.toml>)
> - [public/assets.json](<../public/assets.json>)

## Funcion

> [!summary] API
> El Worker sirve assets estaticos y agrega comportamiento dinamico para archivos `.txt`. Tambien expone un manifiesto de assets para que Leksimus pueda descubrir recursos sin rutas hardcodeadas.

## Endpoints

> [!example] Rutas
> | Endpoint | Uso |
> |---|---|
> | `/api/health` | Estado basico del servicio |
> | `/api/assets` | Manifiesto de assets |
> | `/api/manifest` | Alias del manifiesto |
> | `/txt/<archivo>.txt` | Linea aleatoria |
> | `/txt/<archivo>.txt?full=true` | Archivo completo |
> | `/txt/<archivo>.txt?find=texto` | Buscar en lineas |
> | `/txt/<archivo>.txt?line=1` | Linea exacta |
> | `/txt/<archivo>.txt?return=3` | Varias lineas aleatorias |

## Uso por Leksimus

> [!tip] Integracion
> Leksimus deberia leer `/api/assets`, cachear el catalogo por TTL corto y usarlo para validar comandos, botones de dashboard y eventos de overlay.
