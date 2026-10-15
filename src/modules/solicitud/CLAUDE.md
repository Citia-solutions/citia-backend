# Módulo: solicitud

Solicitudes de hora que un paciente envía desde el enlace público (ADR-09) y la
bandeja donde el profesional las acepta o rechaza. Desde la Fase 3 también las
**peticiones de otra hora** que el paciente hace desde el enlace de SU cita
(`tipo = reagendamiento`, ADR-10 §4, plan `context/US/04-respuesta-paciente.md`).
Contrato de la Fase 1: `context/Features/us02-gestion-citas.md` §"Cierre de Fase 1" (§c).

## Estructura

```
src/modules/solicitud/
├── domain/
│   ├── solicitud-cita.entity.ts          ← SolicitudCita + EstadoSolicitud (recibida|aceptada|rechazada|descartada)
│   │                                        + TipoSolicitud (nueva|reagendamiento); recibir / pedirOtraHora / descartar
│   ├── solicitud-cita.repository.ts      ← Puerto (…ParaActualizar = FOR UPDATE; buscarReagendamientoAbierto[ParaActualizar])
│   ├── transicion-solicitud-invalida.error.ts  ← → 409
│   └── reagendamiento-ya-solicitado.error.ts   ← 23505 de R5 traducido por el adaptador (el portal → 409)
├── application/
│   ├── solicitudes.service.ts            ← Ruta ANÓNIMA: recibir()
│   ├── bandeja-solicitudes.service.ts    ← Ruta AUTENTICADA: listar/aceptar/rechazar
│   ├── solicitudes-otra-hora.service.ts  ← EXPORTADO al portal: abierta() / pedir() (Fase 3)
│   ├── suscriptor-solicitudes.ts         ← SuscriptorEventos del outbox (Fase 3)
│   ├── solicitud-no-encontrada.error.ts  ← → 404
│   ├── datos-aceptacion-incompletos.error.ts  ← `nueva` sin duracionMin/tipoConsulta → 400
│   └── evento-solicitud-invalido.error.ts     ← hecho mal formado (reintento → carta muerta)
├── infrastructure/persistence/           ← ORM entity + adaptador TypeORM (traduce el 23505 de R5)
├── integration/                          ← contra Postgres (npm run test:integration)
├── presentation/
│   ├── solicitudes-publicas.controller.ts  ← publico/:tenantSlug/solicitudes (sin guard)
│   ├── solicitudes.controller.ts           ← solicitudes (JwtAuthGuard)
│   └── dto/
└── solicitud.module.ts                   ← registra SuscriptorSolicitudes (onModuleInit); exporta SolicitudesOtraHoraService
```

## Endpoints (prefijo global `/api`)

| Método | Ruta                               | Guard | Status | Respuesta |
|--------|------------------------------------|-------|--------|-----------|
| POST   | `/publico/:tenantSlug/solicitudes` | — (5/h por IP) | 202 siempre | `SolicitudRecibidaDto` (idéntica exista o no el tenant) |
| GET    | `/solicitudes?estado=&citaOrigenId=` | JWT | 200 / 400 | `SolicitudBandejaDto[]` (defecto `recibida`, tope 100) |
| POST   | `/solicitudes/:id/aceptar`         | JWT   | 201 / 400 / 404 / 409 | `{ solicitud, cita }` |
| POST   | `/solicitudes/:id/rechazar`        | JWT   | 200 / 404 / 409 | `SolicitudBandejaDto` (sin cuerpo) |

- `estado` admite `recibida | aceptada | rechazada | descartada`. `citaOrigenId` (uuid,
  opcional): solo las de reagendamiento de esa cita; el voucher pregunta
  `?citaOrigenId=<id>&estado=recibida` ("El paciente pidió otra hora"). Otro tenant → `[]`.
- `SolicitudBandejaDto` (Fase 3, aditivo): `tipo`, `citaOrigenId` y
  `citaOrigen: { inicio, duracionMin, estado } | null` (la cita de origen TAL COMO ESTÁ;
  `null` en una `nueva`). `motivo` puede ser `''` y `rut`/`correo` `null` en una de
  reagendamiento. Nunca `tenantId`, `usuarioId` ni `enlaceId`.
- `aceptar`: cuerpo `{ inicio, duracionMin?, tipoConsulta? }`.
  - `nueva`: `duracionMin` y `tipoConsulta` obligatorios (si faltan, 400 del servicio:
    "Para aceptar una solicitud nueva, duracionMin y tipoConsulta son obligatorios");
    `cita` = respuesta de `POST /citas` (con `paciente` y `avisos`).
  - `reagendamiento`: solo `inicio` (lo demás se ignora). MUEVE la cita de origen con
    `CitasService.reagendarEnTx` (mismo id, vuelve a `pendiente`, `CitaReagendada`);
    `cita` = respuesta de `PATCH /citas/:id/reagendar` (con `avisos`, sin `paciente`);
    `solicitud.citaId = citaOrigenId`. Cita de origen terminal → 409; inexistente → 404.
- Errores: `SolicitudNoEncontradaError`/`CitaNoEncontradaError` → 404,
  `TransicionSolicitudInvalidaError`/`TransicionEstadoInvalidaError` → 409,
  `DatosAceptacionIncompletosError` → 400.

## Reglas del módulo

- **Dependencias: solicitud → cita y solicitud → paciente (lectura), nunca al revés.**
  La bandeja usa `CitasService.agendar`, `reagendarEnTx` y `resumenesPorIds` (exportados
  por `CitaModule`); pedir otra hora lee la ficha con `PacienteRepository`. `cita` no
  importa nada de aquí: `solicitud` se entera de lo que le pasa a la cita por el
  **outbox** (suscriptor). `cita_id` y `cita_origen_id` no tienen FK a propósito (ADR-09).
- **Tres servicios separados.** `SolicitudesService` (anónimo) solo tiene el
  repositorio de solicitudes y tenants: **no** darle `CitasService` ni
  `TransactionRunner`. Todo lo autenticado va en `BandejaSolicitudesService`.
  `SolicitudesOtraHoraService` no abre transacciones: corre en la del portal.
- **Aceptar/rechazar**: una transacción + `buscarPorIdParaActualizar` (FOR UPDATE);
  `asegurarResolvible` **antes** de crear/mover nada. Aceptar dos veces → 409.
- **Orden de bloqueo (Fase 3): la SOLICITUD primero, después la cita.** La bandeja
  bloquea la solicitud y luego `reagendarEnTx` bloquea la cita. El portal bloquea la
  cita y solo LEE la solicitud (`buscarReagendamientoAbierto`, sin bloqueo); el
  suscriptor solo bloquea la solicitud. Nadie toma los dos en orden inverso → sin
  interbloqueos. Por eso el portal NO descarta la petición al cancelar.
- **Paciente al aceptar una `nueva`** (vía `PacientesService.resolverOCrear`): si el
  RUT ya existe se vincula sin tocar su ficha, **salvo** el correo vacío, que se
  completa con el de la solicitud en la misma transacción (ADR-13 §14). Un correo ya
  guardado, igual o distinto, nunca se reemplaza.
- **La bandeja es de la organización**: filtra por `tenantId` del token, no por
  profesional. Quien resuelve queda como `usuarioId`. `citaOrigen` se resuelve con UNA
  lectura por lote (`resumenesPorIds`), sin N+1.
- **Datos sensibles**: `rut` canónico en BD, formateado en la respuesta, nunca en
  la URL. Los eventos (`SolicitudCitaAceptada`, `SolicitudCitaRechazada`,
  `ReagendamientoSolicitado`) llevan solo ids. No se guarda motivo de rechazo (DT-26).
- **Reagendamiento (Fase 3)**: `tipo = reagendamiento` exige `cita_origen_id`
  (CHECK); una `nueva` exige `rut` y `correo` (CHECK). Como mucho UNA de
  reagendamiento `recibida` por cita de origen (índice único parcial
  `uq_solicitud_reagendamiento_recibida`): el adaptador traduce su 23505 a
  `ReagendamientoYaSolicitadoError` (la transacción queda abortada: dejar que el error
  la revierta). La regla anti-spam por RUT solo cuenta `nueva`. `descartada` la pone
  el sistema (suscriptor), nunca una persona.
- `AceptarSolicitudDto.inicio` exige zona explícita (`@IsInstanteConZona`, en
  `shared/presentation/`).
- Respuestas de aceptar/rechazar se proyectan desde la entidad cargada. `guardar`
  conserva `recibidaEn` del dominio porque el `save` de TypeORM no relee
  @CreateDateColumn en un UPDATE. `recibida_en` es `timestamptz` (también en la
  entidad ORM, para que `synchronize` en tests no la cree sin zona).

### Pedir otra hora (`SolicitudesOtraHoraService`, exportado)

- `abierta(cita, tx)`: la de reagendamiento `recibida` de la cita, sin bloqueo.
- `pedir(cita, enlace, { preferencia, motivo? }, tx)`: copia nombre, teléfono, RUT,
  correo (en blanco → `null`) y consentimiento de la FICHA del paciente; nace
  `recibida` con `usuarioId` = dueño de la cita, `citaOrigenId`, `enlaceId`; motivo
  ausente o en blanco → `''`. No toca la cita (R1). Publica `ReagendamientoSolicitado`
  `{ citaId, usuarioId (dueño), solicitudId, actor: { tipo: 'paciente', id: enlaceId } }`
  en el mismo tx; sin datos del paciente, preferencia, motivo ni token.
- No valida el enlace ni las acciones permitidas: lo hace el portal, en el mismo tx.

### Suscriptor del outbox (`SuscriptorSolicitudes`, ADR-12 §4)

| Hecho | Efecto sobre la de reagendamiento `recibida` de esa cita |
|---|---|
| `CitaCancelada`, `CitaAsistida`, `CitaNoAsistida` | `descartada` (`resueltaEn` = ahora) |
| `CitaReagendada` con `actor.tipo = 'profesional'` | **atendida** = `aceptada` con `usuarioId` = `actor.id` y `citaId` = la cita |
| `CitaReagendada` del paciente / sistema / sin actor | nada |

- **Decisión del orquestador (2026-10-15), restaura ADR-10 "atendida al reagendar":**
  si el profesional mueve la cita desde el voucher con una petición abierta, la
  petición queda respondida, como si la hubiera aceptado en la bandeja. Si la aceptó en
  la bandeja, ya no queda ninguna abierta (se aceptó en el mismo tx que publicó
  `CitaReagendada`): no-op.
- **Solo atiende peticiones recibidas ANTES del reagendamiento**
  (`recibidaEn ≤ ocurridoEn` del hecho). El hecho llega segundos después (DT-33): una
  petición hecha ya con la hora nueva no se cierra sola; la decide la bandeja.
- Idempotente (busca solo `recibida` con `FOR UPDATE`; repetir el hecho no encuentra
  nada), sin efectos externos, sin logs con datos del paciente. Un hecho sin `tenantId`,
  `citaId`, `actor.id` (si es del profesional) u `ocurridoEn` válido lanza
  `EventoSolicitudInvalidoError` (nombra el campo, nunca el valor) → reintento → carta
  muerta.
- El descarte/atención no publica hechos propios (nadie los escucha hoy).

## Tests

- Unitarios junto a cada archivo (bandeja, pedir otra hora, suscriptor, DTOs,
  adaptador con la traducción del 23505).
- e2e sin BD: `test/solicitudes-bandeja.e2e-spec.ts` (incluye peticiones de otra hora).
- Con Postgres: `integration/solicitudes-persistencia.integration.spec.ts` y
  `test/portal-paciente.e2e-spec.ts` (bandeja + portal + suscriptor + carrera real del
  23505).
