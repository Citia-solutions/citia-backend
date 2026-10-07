# Módulo: solicitud

Solicitudes de hora que un paciente envía desde el enlace público (ADR-09) y la
bandeja donde el profesional las acepta o rechaza. Contrato completo:
`context/Features/us02-gestion-citas.md` §"Cierre de Fase 1" (§c).

## Estructura

```
src/modules/solicitud/
├── domain/
│   ├── solicitud-cita.entity.ts          ← SolicitudCita + EstadoSolicitud (recibida|aceptada|rechazada)
│   ├── solicitud-cita.repository.ts      ← Puerto (buscarPorIdParaActualizar = FOR UPDATE)
│   └── transicion-solicitud-invalida.error.ts  ← → 409
├── application/
│   ├── solicitudes.service.ts            ← Ruta ANÓNIMA: recibir()
│   ├── bandeja-solicitudes.service.ts    ← Ruta AUTENTICADA: listar/aceptar/rechazar
│   └── solicitud-no-encontrada.error.ts  ← → 404
├── infrastructure/persistence/           ← ORM entity + adaptador TypeORM
├── presentation/
│   ├── solicitudes-publicas.controller.ts  ← publico/:tenantSlug/solicitudes (sin guard)
│   ├── solicitudes.controller.ts           ← solicitudes (JwtAuthGuard)
│   └── dto/
└── solicitud.module.ts
```

## Endpoints (prefijo global `/api`)

| Método | Ruta                               | Guard | Status | Respuesta |
|--------|------------------------------------|-------|--------|-----------|
| POST   | `/publico/:tenantSlug/solicitudes` | —     | 202 siempre | `SolicitudRecibidaDto` (idéntica exista o no el tenant) |
| GET    | `/solicitudes?estado=`             | JWT   | 200 | `SolicitudBandejaDto[]` (defecto `recibida`, tope 100) |
| POST   | `/solicitudes/:id/aceptar`         | JWT   | 201 / 404 / 409 | `{ solicitud, cita }` (`cita` = respuesta de `POST /citas`) |
| POST   | `/solicitudes/:id/rechazar`        | JWT   | 200 / 404 / 409 | `SolicitudBandejaDto` (sin cuerpo) |

## Reglas del módulo

- **Dependencia solicitud → cita, nunca al revés.** La bandeja crea la cita con
  `CitasService.agendar(dto, usuario, tx)` (exportado por `CitaModule`). El módulo
  `cita` no importa nada de aquí. `cita_id` no tiene FK a propósito (ADR-09).
- **Dos servicios separados.** `SolicitudesService` (anónimo) solo tiene el
  repositorio de solicitudes y tenants: **no** darle `CitasService` ni
  `TransactionRunner`. Todo lo autenticado va en `BandejaSolicitudesService`.
- **Aceptar/rechazar**: una transacción + `buscarPorIdParaActualizar` (FOR UPDATE);
  `asegurarResolvible` **antes** de crear paciente/cita. Aceptar dos veces → 409.
- **Paciente al aceptar** (vía `PacientesService.resolverOCrear`): si el RUT ya
  existe se vincula sin tocar su ficha, **salvo** el correo vacío, que se completa
  con el de la solicitud en la misma transacción (ADR-13 §14). Un correo ya
  guardado, igual o distinto, nunca se reemplaza.
- **La bandeja es de la organización**: filtra por `tenantId` del token, no por
  profesional. Quien resuelve queda como `usuarioId`.
- **Datos sensibles**: `rut` canónico en BD, formateado en la respuesta, nunca en
  la URL. Los eventos (`SolicitudCitaAceptada`, `SolicitudCitaRechazada`) llevan
  solo ids. Sin `tenantId`/`usuarioId` en `SolicitudBandejaDto`. No se guarda
  motivo de rechazo (DT-26).
- `AceptarSolicitudDto.inicio` exige zona explícita (`@IsInstanteConZona`, en
  `shared/presentation/`).
- Respuestas de aceptar/rechazar se proyectan desde la entidad cargada. `guardar`
  conserva `recibidaEn` del dominio porque el `save` de TypeORM no relee
  @CreateDateColumn en un UPDATE.
