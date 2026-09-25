# Índice de Features

Cada feature documenta una funcionalidad implementada: qué hace, su arquitectura hexagonal,
endpoints, esquema de BD, decisiones y pendientes. Alineadas con los commits (ver
[`../TRAZABILIDAD.md`](../TRAZABILIDAD.md)).

| Feature | US / Tipo | Estado | ADRs | Commits clave |
|---------|-----------|--------|------|---------------|
| [us00a-registro-inicial](us00a-registro-inicial.md) | US-00a (signup) | ✅ Implementado + atomicidad | 00,01,02,03,**06** | `ce7d99e`,`718fe1f`,`2ee856f`,`d4fa476` |
| [us00b-login](us00b-login.md) | US-00b (login JWT) | ✅ Implementado | 01,02,03 | `45198c3`,`c911bce` |
| [us06-dashboard-citas](us06-dashboard-citas.md) | US-06 (dashboard) | ✅ Backend + fix TZ · ⚠️ e2e pend. | 04,**07**,01,02 | `e592d74`,`9ab2bec`,`08dad63` |
| [us02-gestion-citas](us02-gestion-citas.md) | US-02 (gestión de citas) | ✅ Release 1 + vía pública · ⚠️ bandeja pend. | **09**,04,08,06,02 | `f2a7dff`,`e1253c3` |
| [infra-contenedores](infra-contenedores.md) | Infra (Docker + tooling) | ✅ Implementado + seed demo | **05** | `b8cac2a`,`df53128`,`0e54f0b`,`f200557` |
| [registrar-usuario](registrar-usuario.md) | ⛔ DESUSO | Superseded por us00a | — | (histórico) |

## Notas

- **`registrar-usuario.md`** se conserva solo como puntero histórico (diseño antiguo en inglés que
  ya no existe en el código). No usar como referencia.
- Las features de US futuras (RF-01/02/04/05/06/07/08) aún no tienen doc porque no están
  implementadas. Se crearán cuando se aborde cada una.
- **`us02-gestion-citas.md`** cubre las dos vías de entrada (el botón del profesional y el enlace
  público del paciente) porque comparten el mismo agregado y el mismo resolver-o-crear por RUT.
  Separarlas habría duplicado la mitad del documento.
