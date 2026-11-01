# Módulo: soporte

Mensajes de un profesional a soporte (US-10, P7). Diseño en [ADR-15](../../../context/Decisions/ADR-15.md) §7–§9
(y el planificador en [ADR-12](../../../context/Decisions/ADR-12.md), el canal de correo en
[ADR-13](../../../context/Decisions/ADR-13.md) §7–§8). Plan y Definición de Terminado: `context/US/10-perfil-cuenta.md`.

## Estructura

```
src/modules/soporte/
├── domain/                                   ← puro (ADR-02: ni @nestjs ni typeorm)
│   ├── mensaje-soporte.entity.ts             ← MensajeSoporte: crear / reconstituir y transiciones del envío
│   │                                            (marcarEnviado, registrarFallo, posponer, marcarFallido; solo desde pendiente)
│   ├── mensaje-soporte.repository.ts         ← puerto (tx obligatorio; reclamar y bloquear = BARRIDO GLOBAL)
│   ├── limites-soporte.ts                    ← 2000 caracteres, tope 5/24 h, política de reintento (8), cuota 1 h
│   └── exceptions/
│       ├── mensaje-soporte-invalido.error.ts       ← → 400 (red de seguridad del DTO)
│       ├── tope-mensajes-soporte.error.ts          ← → 429 con su mensaje
│       └── transicion-envio-soporte-invalida.error.ts ← error de programación (el job lo trata como error propio)
├── application/
│   ├── registrar-mensaje-soporte.service.ts  ← tope por organización + insertar, una transacción; NO envía
│   ├── enviar-mensajes-soporte.service.ts    ← el envío: reclamo + lectura + plantilla + canal, un tx por mensaje
│   └── plantilla-mensaje-soporte.ts          ← armarCorreoSoporte: asunto, HTML escapado y texto (puro, determinista)
├── infrastructure/
│   ├── persistence/                          ← ORM (CHECK e índices = migración 1750000020000) y adaptador SQL
│   └── planificacion/planificador-soporte.ts ← cron `soporte.envio` (`20 * * * * *`, APP_TZ), lote 20
├── integration/                              ← contra Postgres (npm run test:integration)
├── presentation/
│   ├── soporte.controller.ts                 ← POST /soporte/mensajes (JwtAuthGuard, @LimitarTasa('soporte'))
│   └── dto/                                  ← CrearMensajeSoporteDto, MensajeSoporteCreadoDto
├── soporte.module.ts                         ← persistencia, casos de uso, controller, su CanalMensajeria
└── soporte-planificacion.module.ts           ← SOLO el job (PlanificadorSoporte); lo importa solo AppModule
```

## Endpoint (prefijo global `/api`)

| Método | Ruta | Guard | Status | Respuesta |
|--------|------|-------|--------|-----------|
| POST | `/soporte/mensajes` | JWT + cubo `soporte` (5/h por IP) | 201 / 400 / 401 / 429 | `{ id, creadoEn }` |

- Cuerpo: `{ categoria?: 'problema' | 'consulta' | 'sugerencia' | 'otro', mensaje: string }`. Sin categoría → `otro`.
  `mensaje`: 1 a 2000 caracteres tras recortar los extremos (conserva los saltos internos).
- Quién escribe sale del token (`userId`, `tenantId`); un `tenantId` en el cuerpo se descarta (`whitelist`).
- **429 por tope:** 5 o más mensajes de la organización en las últimas 24 h →
  `{ statusCode: 429, message: 'Ya enviaste 5 mensajes a soporte en las últimas 24 horas. Vuelve a intentarlo más tarde.' }`.
  El tope es blando (dos peticiones simultáneas pueden dejar 6). El 429 del cubo (por IP) es el genérico del límite
  de tasa y llega antes que el 401.
- La respuesta no trae el texto ni el estado del envío.

## Flujo

1. La ruta guarda la fila `pendiente` en `mensajes_soporte` (misma transacción que el conteo del tope). **No envía.**
   La fila ES el outbox de ese correo (T8): no hay hecho en `eventos_salida`.
2. El job `soporte.envio` (cada minuto, segundo 20) reclama hasta 20 (`FOR UPDATE SKIP LOCKED`), lee usuario y
   organización por sus puertos, arma el correo y lo envía por `CanalMensajeria`:
   destinatario `SOPORTE_CORREO_DESTINO`, remitente `CORREO_REMITENTE`, `Reply-To` = correo del profesional leído al
   enviar (`null` si ya no existe), `Idempotency-Key = soporte/<id>`, etiqueta `mensaje_soporte_id`. La transacción
   queda abierta durante la llamada (≤ 11 s), como los recordatorios.
3. Resultado del canal → efecto: `aceptado` / `posible_duplicado` → `enviado` · `transitorio` → reintento (1, 2, 4,
   8, 16, 32, 60 min; `fallido` al 8.º fallo) · `cuota_agotada` → otra vez en 1 h sin gastar intento, corta el lote ·
   `permanente` → `fallido` · `configuracion` → no toca la fila, corta el lote y alerta · error propio (incluye el
   canal que lanza o no responde a tiempo) → se revierte y, en otra transacción, `bloquearPorId` →
   `registrarFallo(nombre del error)`.
4. Pausa de 500 ms entre dos llamadas al proveedor (la cuenta de Resend se comparte con los recordatorios).
5. Los eventos de entrega de Resend de estos correos llegan al webhook de `recordatorio` y se ignoran
   (`recordatorios.webhook_desconocido`): `enviado` es el estado final.

`intentos` cuenta los intentos de envío que terminaron en algo (también el aceptado); `posponer` y `configuracion` no
suman.

## Reglas locales

- **Privacidad:** el texto **nunca** va a un log (solo ids, estados, categoría y códigos). La clave de log `mensaje`
  se redacta entera (`CAMPOS_SENSIBLES`): usar `mensajeId`. `ultimo_error` guarda solo un código (nombre del error o
  código del proveedor), nunca un mensaje de error. El texto sí va a la base, a Resend y a la casilla de soporte
  (DT-52, DT-26: sin plazo de conservación).
- **Plantilla:** todo dato escapado en el HTML; asunto en una línea (`Soporte · <Categoría> · <organización ≤ 60>`);
  determinista (usa `creado_en` en `APP_TZ`): un reintento manda el mismo correo.
- **BARRIDOS GLOBALES** (ADR-12 §6): `reclamarSiguientePendiente` y `bloquearPorId`. Solo el job; nunca la ruta. Tras
  tomar una fila, todo usa SU `tenantId`.
- **`SOPORTE_CORREO_DESTINO` es opcional** (T10): sin ella el job no se registra y deja `soporte.sin_destino` (`warn`)
  al arrancar; los mensajes esperan en `pendiente` y salen con el primer tick tras cargarla. Invocado a mano sin
  destino, el envío no reclama nada (`configuracion = 'sin_destino'`).
- **Jobs solo en `SoportePlanificacionModule`**, registrados a mano en `SchedulerRegistry`, nada con
  `PLANIFICADOR_ACTIVO=false`; apagado ordenado; sin latido de Better Stack. Las e2e invocan `ejecutarEnvio()`.
- **Dependencia de `recordatorio` POR ARCHIVO (DT-59):** `CanalMensajeria`, `MensajeSaliente`, `TipoResultadoEnvio`
  (`recordatorio/domain/canal-mensajeria.ts`) y `crearCanalMensajeria`
  (`recordatorio/infrastructure/mensajeria/crear-canal-mensajeria.ts`, solo desde `soporte.module.ts`). **No** se
  importa `RecordatorioModule`. `SoporteModule` arma su propia instancia del canal (su log de arranque dice
  "Recordatorios: …", cosmético). Si cambia el puerto o la fábrica, revisar este módulo.
- Lee `usuarios` y `tenants` por `IUsuarioRepository.findById` e `ITenantRepository.findById` (`UsuariosModule`,
  `TenantModule`); no escribe sus tablas.
- Estados y categorías: si cambian, migración nueva para los CHECK (`database-agent`).

## Logs

| Cuándo | Nivel | Evento |
|---|---|---|
| Mensaje recibido | info | `soporte.mensaje_recibido` (`mensajeId`, `tenantId`, `usuarioId`, `categoria`) |
| Tope por organización | info | `soporte.tope_diario` (`tenantId`) |
| Arranque con el job / sin destino | info / warn | `planificador.activo` (`jobs: ['soporte.envio']`) / `soporte.sin_destino` |
| Tick con trabajo | info | `soporte.envio` (`enviados`, `reintentos`, `pospuestos`, `fallidos`, `interrumpido`) |
| Mensaje `fallido` | error | `soporte.envio_fallido` (alerta; `mensajeId`, `tenantId`, `codigo`) |
| Lote cortado por configuración | error | `soporte.envio_configuracion` (alerta; `codigo`) |
| Cuota agotada | warn | `soporte.envio_cuota` (`codigo`) |
| Error propio en un mensaje | warn | `soporte.envio_error_interno` (`mensajeId`, `tenantId`, `codigo`) |
| El tick falló (infraestructura) | error | `soporte.envio.fallido` |

Un mensaje `fallido` se reenvía volviéndolo a `pendiente` con SQL (no hay ruta para eso).

## Tests

- Unitarios junto a cada archivo; dobles en `test/support/soporte-en-memoria.ts` (puerto + transacciones que
  revierten) y `test/support/mensajeria-falsa.ts` (`CanalMensajeriaFalso`).
- Integración: `integration/envio-soporte.integration.spec.ts` (SKIP LOCKED con dos procesos, dos `ejecutar` en
  paralelo, tope, CHECK).
- e2e: `test/soporte.e2e-spec.ts` (Postgres, job a mano, logs sin el texto) y `test/planificador.e2e-spec.ts`.
