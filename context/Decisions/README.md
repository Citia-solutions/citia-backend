# Índice de ADRs (Architecture Decision Records)

Registro de decisiones de arquitectura de citia-backend. Cada ADR captura **una** decisión: su
contexto, las opciones evaluadas, la decisión tomada y sus consecuencias.

| ADR | Título | Estado | Fecha | Commits |
|-----|--------|--------|-------|---------|
| [ADR-00](ADR-00.md) | TypeORM como ORM definitivo (`synchronize:false`, migraciones versionadas) | Aceptado | 2026-06-22 | `389eb81`, `b8cac2a` |
| [ADR-01](ADR-01.md) | Autenticación con Passport.js + JWT (tenantId del token) | Aceptado · Implementado | 2026-06-22 | `45198c3`, `346a034` |
| [ADR-02](ADR-02.md) | Convenciones: español + arquitectura hexagonal | Aceptado | 2026-06-22 | `718fe1f` |
| [ADR-03](ADR-03.md) | Login multi-tenant por `tenantSlug` | Aceptado | 2026-06-22 | `195431b`, `cfa35f3` |
| [ADR-04](ADR-04.md) | Modelo de Cita: máquina de estados en el dominio + estado materializado | Aceptado · mecanismo del §4 (BullMQ) reemplazado por ADR-12 | 2026-06-30 | `e592d74`, `77523c9` |
| [ADR-05](ADR-05.md) | Contenedorización Docker multi-stage + migraciones en el arranque | Aceptado · Implementado | 2026-06-22 | `b8cac2a`, `df53128`, `0e54f0b`, `77a97c9`, `b623b6a` |
| [ADR-06](ADR-06.md) | Atomicidad del registro: puerto `TransactionRunner` con contexto opaco | Aceptado · Implementado | 2026-06-23 | `d4fa476`, `f573485` |
| [ADR-07](ADR-07.md) | Día y hora del dashboard en la zona de la clínica (DST-safe con `Intl`) | Aceptado · Implementado | 2026-07-06 | `08dad63` |
| [ADR-08](ADR-08.md) | El tenant sale del body del login y pasa a la URL (puerto `TenantResolver`) | **Propuesto** · sin implementar | 2026-08-16 | — |
| [ADR-09](ADR-09.md) | Gestión de citas: `SolicitudCita` como agregado aparte, RUT como identidad del paciente, reagendar con bitácora | Aceptado · **release 1 implementado** · vía pública pendiente | 2026-08-23 | — |
| [ADR-10](ADR-10.md) | Enlace por cita para el paciente (US-02.07): token opaco hasheado, cancelar con la transición existente, pedir reagendar sin mover la cita | **Propuesto** · **aplazado fuera de la v1** (Q11 → C, 2026-09-25) | 2026-09-23 | — |
| [ADR-11](ADR-11.md) | Solapamiento de citas: avisar y permitir, regla en la entidad `Cita` (`chocaCon`), campo opcional `avisos.solapamientos` | Aceptado · sin implementar | 2026-09-25 | — |
| [ADR-12](ADR-12.md) | Outbox transaccional (`eventos_salida`) y planificador en proceso con `@nestjs/schedule` sobre Postgres (`FOR UPDATE SKIP LOCKED`); cierre de citas aplazado | Aceptado · sin implementar | 2026-09-30 | — |
| [ADR-13](ADR-13.md) | Recordatorios al paciente por correo (RF-06): entidad `Recordatorio` con estado, planificación pura, Resend detrás de `CanalMensajeria`, webhooks firmados, cuota del modo prueba | Aceptado · sin implementar · decisiones confirmadas (2026-09-30) | 2026-09-30 | — |

## Relaciones entre ADRs

- ADR-01 (auth) **depende de** ADR-03 (resuelve el tenant por slug antes de firmar el JWT) y de
  ADR-02 (validación en `application` vía puerto `ITokenSigner`).
- ADR-03 (slug) **existe por** la unicidad compuesta `(tenant_id, email)` de US-00a.
- ADR-05 (Docker) **reconcilia** una tensión con ADR-00 (migraciones en prod como paso explícito).
- ADR-06 (transaccional) **aplica** ADR-02 (contexto `unknown` opaco para no filtrar TypeORM).
- ADR-07 (zona horaria) **se apoya en** ADR-04 (`inicio` como `timestamptz` único) y ADR-02
  (utilidad pura en `shared/domain/`).
- ADR-08 (tenant en la URL) **supersede parcialmente** a ADR-03: solo su regla 4 (transporte del
  tenant); la unicidad compuesta, el slug autogenerado y el 401 genérico siguen vigentes. **Replica**
  el patrón de puerto opaco de ADR-06 y la selección por config de ADR-07.
- ADR-09 (gestión de citas) **extiende** ADR-04 —añade la transición `reagendar()` y salda su deuda
  de historial de reagendamientos— y **depende de** ADR-08: el enlace público del paciente necesita
  el tenant en la URL, lo que convierte a ADR-08 en prerrequisito de infraestructura, no en una
  mejora de experiencia. **Replica** el puerto opaco de ADR-06 (en `PublicadorEventos`) y matiza la
  regla anti-enumeración de ADR-03 §5 para la superficie pública.
- ADR-10 (enlace por cita) **matiza** la regla 1 de ADR-09 §8 —la vía pública solo escribe en
  `solicitudes_cita`— para una capacidad delegada por el profesional sobre una cita; **se apoya en**
  ADR-04 sin tocar su grafo y **replica** la atomicidad de ADR-06 y la respuesta uniforme de ADR-03
  §5. **No depende** de ADR-08: el enlace no lleva `tenantSlug`. Toma el número 10 que Q6 anticipaba;
  el ADR del proceso de cierre usa el siguiente libre. **Aplazado fuera de la v1** (Q11 → C,
  2026-09-25).
- ADR-11 (solapamiento) **resuelve** la decisión que ADR-09 dejó abierta y responde Q4: avisar y
  permitir. **Se apoya en** ADR-04 (vigente vs terminal; la regla vive en la entidad) y en ADR-07
  (hora y fecha del aviso en la zona de la clínica). Toma el número 11, así que el ADR de Q6
  (proceso de cierre) pasa a ser el ADR-12.
- ADR-12 (outbox + planificador) **cierra en diseño** DT-27 y **responde** Q6 en cuanto al mecanismo.
  **Reemplaza** la mención a BullMQ de ADR-04 §4 (la materialización vía proceso programado sigue
  vigente, pero el job de cierre queda aplazado con el scoring). **Implementa** la "fase 2" del
  adaptador de `PublicadorEventos` que ADR-09 §7 dejó prevista, y **reutiliza** el `TransactionRunner`
  de ADR-06: el puerto pasa a exigir el `tx`. Deja anotada para el futuro job de cierre la regla de
  ADR-10 §5 (petición de reagendamiento sin atender ≠ `ghosting`).
- ADR-13 (recordatorios) **es el primer suscriptor** de ADR-12 y usa su planificador. **Se apoya en**
  ADR-04 (vigente/terminal decide si un recordatorio vive), ADR-09 §4 (editar no lo toca, reagendar lo
  reprograma, cancelar lo anula) y ADR-07 (horas sin envío y texto en la zona de la clínica).
  **Matiza** ADR-09 §3: al vincular un paciente por RUT, un correo vacío se completa (ADR-09 lleva una
  nota que apunta aquí). **Prepara**
  ADR-10: el enlace por cita de la Fase 3 viaja en este mismo correo (bloque `accion` de la
  plantilla), y el seguimiento de clics se desactiva para que el token no pase por el proveedor.
  **Contradice a sabiendas** la nota de consentimiento de ADR-10 §6 (con la salida B, DT-16 pasaba a
  bloqueante): el usuario aceptó el riesgo el 2026-09-30 (ver DT-16).

Ver la matriz completa commit ↔ doc en [`../TRAZABILIDAD.md`](../TRAZABILIDAD.md).
