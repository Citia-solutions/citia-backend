# Decisiones del frontend

Registro de decisiones de producto y diseño tomadas del lado del **frontend** que afectan
(contienen o condicionan) al backend. Viven en este repo para que ambos lados estén informados
de lo mismo y no se tomen decisiones contradictorias por separado.

Cada archivo `FD-XX` describe **una** decisión con su porqué, qué implica y qué queda pendiente.

| ID | Decisión | Estado | Fase |
|----|----------|--------|------|
| [FD-01](FD-01.md) | El enlace público reserva la hora de verdad | **Descartada** (2026-09-29): rige ADR-09 | [Fase 1](../Fases/fase-1-us02-gestion-citas.md) |
| [FD-02](FD-02.md) | Cada profesional comparte su propio enlace | Tomada | [Fase 1](../Fases/fase-1-us02-gestion-citas.md) |
| [FD-03](FD-03.md) | Mismos datos, dos formas de entrar | Tomada | [Fase 1](../Fases/fase-1-us02-gestion-citas.md) |
| [FD-04](FD-04.md) | La vista pública todavía no guarda nada | Temporal · **superada** (2026-09-10: la vista pública ya envía la solicitud) | [Fase 1](../Fases/fase-1-us02-gestion-citas.md) |
| [FD-05](FD-05.md) | El flujo público vive junto al del panel (por ahora) | Tomada | [Fase 1](../Fases/fase-1-us02-gestion-citas.md) |
| [FD-06](FD-06.md) | Confirmar, cancelar o cambiar la hora desde el correo | Propuesta | [Fase 3](../Fases/fase-3-us04-respuesta-paciente.md) |

## Cómo se relaciona con los ADR del backend

- **FD-01** contradecía la decisión 2 del [ADR-09](../Decisions/ADR-09.md) (el paciente solo pide y el
  profesional confirma). Se resolvió el 2026-09-29 a favor de ADR-09 y FD-01 quedó descartada.
- **FD-02** también depende del [ADR-08](../Decisions/ADR-08.md).
- **FD-06** depende de los recordatorios (RF-06, sin decidir) y del [ADR-08](../Decisions/ADR-08.md).

> **Nota (2026-09-30).** Dos de estas relaciones cambiaron. **FD-02:** la ruta pública ya lleva la
> organización en la URL (`/publico/:tenantSlug/…`): es la fase 1 de ADR-08, adoptada por
> [ADR-09 §11](../Decisions/ADR-09.md); lo que falta de ADR-08 es el login. **FD-06:** RF-06 ya está
> decidido (entra en el MVP, [ADR-13](../Decisions/ADR-13.md)) y el enlace por cita
> ([ADR-10](../Decisions/ADR-10.md)) **no** depende de ADR-08. Ver la nota dentro de
> [FD-06](FD-06.md).
