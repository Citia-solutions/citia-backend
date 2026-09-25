# Decisiones del frontend

Registro de decisiones de producto y diseño tomadas del lado del **frontend** que afectan
(contienen o condicionan) al backend. Viven en este repo para que ambos lados estén informados
de lo mismo y no se tomen decisiones contradictorias por separado.

Cada archivo `FD-XX` describe **una** decisión con su porqué, qué implica y qué queda pendiente.

| ID | Decisión | Estado |
|----|----------|--------|
| [FD-01](FD-01.md) | El enlace público reserva la hora de verdad | Tomada |
| [FD-02](FD-02.md) | Cada profesional comparte su propio enlace | Tomada |
| [FD-03](FD-03.md) | Mismos datos, dos formas de entrar | Tomada |
| [FD-04](FD-04.md) | La vista pública todavía no guarda nada | Temporal |
| [FD-05](FD-05.md) | El flujo público vive junto al del panel (por ahora) | Tomada |
| [FD-06](FD-06.md) | Confirmar, cancelar o cambiar la hora desde el correo | Propuesta |

## Cómo se relaciona con los ADR del backend

- **FD-01** contradice una decisión del [ADR-09](../Decisions/ADR-09.md) (el paciente solo "pedía" y el
  profesional confirmaba) y depende del [ADR-08](../Decisions/ADR-08.md) (identificar al profesional
  en la URL).
- **FD-02** también depende del [ADR-08](../Decisions/ADR-08.md).
- **FD-06** depende de los recordatorios (RF-06, sin decidir) y del [ADR-08](../Decisions/ADR-08.md).
