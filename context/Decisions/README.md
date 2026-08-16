# Índice de ADRs (Architecture Decision Records)

Registro de decisiones de arquitectura de citia-backend. Cada ADR captura **una** decisión: su
contexto, las opciones evaluadas, la decisión tomada y sus consecuencias.

| ADR | Título | Estado | Fecha | Commits |
|-----|--------|--------|-------|---------|
| [ADR-00](ADR-00.md) | TypeORM como ORM definitivo (`synchronize:false`, migraciones versionadas) | Aceptado | 2026-06-22 | `389eb81`, `b8cac2a` |
| [ADR-01](ADR-01.md) | Autenticación con Passport.js + JWT (tenantId del token) | Aceptado · Implementado | 2026-06-22 | `45198c3`, `346a034` |
| [ADR-02](ADR-02.md) | Convenciones: español + arquitectura hexagonal | Aceptado | 2026-06-22 | `718fe1f` |
| [ADR-03](ADR-03.md) | Login multi-tenant por `tenantSlug` | Aceptado | 2026-06-22 | `195431b`, `cfa35f3` |
| [ADR-04](ADR-04.md) | Modelo de Cita: máquina de estados en el dominio + estado materializado | Aceptado | 2026-06-30 | `e592d74`, `77523c9` |
| [ADR-05](ADR-05.md) | Contenedorización Docker multi-stage + migraciones en el arranque | Aceptado · Implementado | 2026-06-22 | `b8cac2a`, `df53128`, `0e54f0b`, `77a97c9`, `b623b6a` |
| [ADR-06](ADR-06.md) | Atomicidad del registro: puerto `TransactionRunner` con contexto opaco | Aceptado · Implementado | 2026-06-23 | `d4fa476`, `f573485` |
| [ADR-07](ADR-07.md) | Día y hora del dashboard en la zona de la clínica (DST-safe con `Intl`) | Aceptado · Implementado | 2026-07-06 | `08dad63` |

## Relaciones entre ADRs

- ADR-01 (auth) **depende de** ADR-03 (resuelve el tenant por slug antes de firmar el JWT) y de
  ADR-02 (validación en `application` vía puerto `ITokenSigner`).
- ADR-03 (slug) **existe por** la unicidad compuesta `(tenant_id, email)` de US-00a.
- ADR-05 (Docker) **reconcilia** una tensión con ADR-00 (migraciones en prod como paso explícito).
- ADR-06 (transaccional) **aplica** ADR-02 (contexto `unknown` opaco para no filtrar TypeORM).
- ADR-07 (zona horaria) **se apoya en** ADR-04 (`inicio` como `timestamptz` único) y ADR-02
  (utilidad pura en `shared/domain/`).

Ver la matriz completa commit ↔ doc en [`../TRAZABILIDAD.md`](../TRAZABILIDAD.md).
