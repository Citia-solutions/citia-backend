# Índice de Features

Cada feature documenta una funcionalidad implementada: qué hace, su arquitectura hexagonal,
endpoints, esquema de BD, decisiones y pendientes. Alineadas con los commits (ver
[`../TRAZABILIDAD.md`](../TRAZABILIDAD.md)). Para leerlas junto con sus ADRs, deudas y commits, entra
por su fase en [`../Fases/`](../Fases/README.md).

*(Estados actualizados el 2026-09-30.)*

## Implementadas

| Feature | US / Tipo | Estado | Fase | ADRs | Commits clave |
|---------|-----------|--------|------|------|---------------|
| [us00a-registro-inicial](us00a-registro-inicial.md) | US-00a (signup) | ✅ Implementado + atomicidad | [Fundaciones](../Fases/fase-base-fundaciones.md) | 00,01,02,03,**06** | `ce7d99e`,`718fe1f`,`2ee856f`,`d4fa476` |
| [us00b-login](us00b-login.md) | US-00b (login JWT) | ✅ Implementado · `tenantSlug` en la respuesta desde 2026-09-28 | [Fundaciones](../Fases/fase-base-fundaciones.md) | 01,02,03 | `45198c3`,`c911bce`,`7635645` |
| [infra-contenedores](infra-contenedores.md) | Infra (Docker + tooling) | ✅ Implementado + seed demo · observabilidad diseñada en la Fase 2 | [Fundaciones](../Fases/fase-base-fundaciones.md) | **05** | `b8cac2a`,`df53128`,`0e54f0b`,`f200557`,`a6b0a63` |
| [us06-dashboard-citas](us06-dashboard-citas.md) | US-06 (dashboard) | ✅ Cerrada (2026-09-28): conectada al front y probada contra Postgres · métricas aún de prueba | [Fase 0](../Fases/fase-0-us06-dashboard.md) | 04,**07**,01,02 | `e592d74`,`9ab2bec`,`08dad63` |
| [us02-gestion-citas](us02-gestion-citas.md) | US-02 (gestión de citas) | ✅ Cerrada (2026-09-28): release 1, vía pública, voucher, agenda, bandeja y solapamiento · US-02.07 ⏸ | [Fase 1](../Fases/fase-1-us02-gestion-citas.md) | **09**,**11**,04,08,06,02 · 10 (propuesto) | `f2a7dff`,`e1253c3`,`2877b13`,`9140bc3`,`e06862a` |
| [registrar-usuario](registrar-usuario.md) | ⛔ DESUSO | Superseded por us00a | [Fundaciones](../Fases/fase-base-fundaciones.md) (histórico) | — | (histórico) |

## Diseñadas, sin implementar

No tienen documento de feature todavía: se crea al construirlas. Mientras tanto, su punto de entrada
es la fase.

| Funcionalidad | US | Estado | Fase | Diseño | Plan |
|---|---|---|---|---|---|
| Recordatorios al paciente por correo (+ outbox y planificador) | US-03 · RF-06 | 🔶 diseño cerrado (2026-09-30) · en el MVP | [Fase 2](../Fases/fase-2-us03-recordatorios.md) | [ADR-12](../Decisions/ADR-12.md), [ADR-13](../Decisions/ADR-13.md) | [US-03](../US/03-recordatorios.md) |
| El paciente cancela o pide reagendar desde un enlace | US-02.07 · RF-07 | ⏸ propuesto y aplazado fuera de la v1 | [Fase 3](../Fases/fase-3-us04-respuesta-paciente.md) | [ADR-10](../Decisions/ADR-10.md) (propuesto) | [US-02.07](../US/02.07-paciente-reagenda-cancela.md) |

## Notas

- **`registrar-usuario.md`** se conserva solo como puntero histórico (diseño antiguo en inglés que
  ya no existe en el código). No usar como referencia.
- Las features de US futuras (RF-01/02/04/05/07/08) aún no tienen doc porque no están
  implementadas ni diseñadas. Su estado vive en el [ROADMAP](../ROADMAP.md) y en
  [`../Fases/`](../Fases/README.md).
- **`us02-gestion-citas.md`** cubre las dos vías de entrada (el botón del profesional y el enlace
  público del paciente) porque comparten el mismo agregado y el mismo resolver-o-crear por RUT.
  Separarlas habría duplicado la mitad del documento. Varias secciones conservan el estado del
  2026-09-25 ("sin implementar"); la nota de su cabecera explica cuál es el vigente.
