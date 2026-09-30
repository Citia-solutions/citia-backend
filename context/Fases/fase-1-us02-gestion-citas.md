# Fase 1 — US-02: Gestión de citas

> **Fase del roadmap** (construcción). No confundir con la
> [etapa 1 del producto](../Descripcion/fase-1-validacion.md) (validación) ni con la "Fase 1" interna de
> ADR-08 o ADR-09. Índice: [Fases](README.md) · Estado en el
> [ROADMAP § Fase 1](../ROADMAP.md#fase-1--us-02-gestión-de-cita).

| | |
|---|---|
| **Objetivo** | Que el profesional cree, edite, reagende y cancele citas con registro de cada cambio; que el paciente pida hora por un enlace público; y que el profesional atienda esas solicitudes. |
| **Entregable** | El profesional ve su agenda, abre el detalle, reagenda y cancela, atiende las solicitudes de sus pacientes y ve los choques de horario, todo reflejado (ROADMAP). |
| **Estado** | ✅ **cerrada**: mergeada en `develop` en ambos repos el 2026-09-28 (`abe9045`) y verificada contra Postgres. US-02.07 (lado paciente) quedó fuera de la v1 y pasa a la [Fase 3](fase-3-us04-respuesta-paciente.md). |
| **Fechas** | ADR-09 2026-08-23 · release 1 2026-08-24 · vía pública y FDs 2026-09-10 · US-02.07/ADR-10 2026-09-23 · voucher 2026-09-24 · contrato de cierre, ADR-11, Q4 y Q11 2026-09-25 · implementación y merge del cierre 2026-09-28 · decisiones posteriores 2026-09-29. |
| **Historia** | US-02 — no tiene plan `US/02-*.md` propio: el contrato vive en la feature. Subtareas: [US-02.07](../US/02.07-paciente-reagenda-cancela.md) ⏸ · [US-02.08](../US/02.08-voucher-cita.md) ✅ · US-02.09 ✅ (solo frontend). |
| **Commits** | filas 35–39 y 41–58 de [TRAZABILIDAD](../TRAZABILIDAD.md) (`f2a7dff` → `c9ac69f`). |

---

## Orden de lectura recomendado

1. **[ROADMAP § Fase 1](../ROADMAP.md#fase-1--us-02-gestión-de-cita)** — la foto final: subtareas,
   backend, frontend, vía pública e integración.
2. **[ADR-09](../Decisions/ADR-09.md)** — el porqué de todo: la solicitud como agregado aparte, el
   paciente pide y el profesional fija la hora, el RUT como identidad, editar ≠ reagendar ≠ cancelar,
   bitácora y hechos. Empieza por su tabla *Estado de cada decisión*.
3. **[us02-gestion-citas](../Features/us02-gestion-citas.md)** — qué hay y cómo funciona. Después, su
   [§ Cierre de Fase 1](../Features/us02-gestion-citas.md#cierre-de-fase-1--contrato-2026-09-25): el
   contrato de agenda por rango, avisos, bandeja y enlace.
4. **[ADR-11](../Decisions/ADR-11.md)** — solapamiento: avisar y permitir.
5. **[US-02.08](../US/02.08-voucher-cita.md)** — el voucher y `accionesPermitidas`.
6. **[US-02.07](../US/02.07-paciente-reagenda-cancela.md)** y **[ADR-10](../Decisions/ADR-10.md)** —
   el lado del paciente, aplazado. Léelos como preparación de la Fase 3, no como parte del cierre.
7. **[FD-01…FD-05](../Frontend-Decisions/README.md)** — lo que el front decidió sobre la vía pública,
   y cómo se resolvió el choque entre FD-01 y ADR-09 (2026-09-29).
8. **Deudas** (sección de abajo): cerradas, mitigada, contraídas y la aceptada (DT-18).
9. **Frontend:** agenda, bandeja, flujo público y voucher (enlaces al final).

---

## Cierre de la fase (resumen)

### Qué quedó

**Backend** (todo en `develop`):

- Crear, editar, reagendar, cancelar y las transiciones `confirmar`, `asistencia`, `inasistencia`,
  validadas por la máquina de estados del dominio; bitácora `cambios_cita` (`GET :id/historial`);
  publicación de hechos (sin suscriptores).
- RUT como identidad del paciente, con resolver-o-crear.
- `GET /api/citas?desde&hasta` (máximo 42 días) y `fecha` en `/hoy`.
- `GET /api/citas/:id` con `accionesPermitidas` (US-02.08).
- `avisos.solapamientos` al crear, editar y reagendar (ADR-11).
- Vía pública `POST /publico/:tenantSlug/solicitudes`: el paciente **pide**, no reserva.
- Bandeja: `GET /solicitudes?estado=`, aceptar (paciente + cita en una transacción con `FOR UPDATE`)
  y rechazar; migración `1750000007000-AddResueltaEnASolicitudesCita`.
- `usuario.tenantSlug` en la respuesta del login, para armar el enlace público.

**Frontend** (según el ROADMAP): modal "Nueva cita", voucher con reagendar y cancelar, refresco del
dashboard, agenda semanal y lista (`/agenda`), bandeja con contador (`/solicitudes`), aviso de
solapamiento, flujo público `/agendar-cita` y el botón "Copiar enlace de agenda" con la advertencia de
DT-18.

### Qué se verificó

- **Prueba manual contra Postgres (2026-09-28):** 29/29 casos en la API; cinco "aceptar" concurrentes
  producen una sola cita; recorrido en el navegador (agenda, aceptar con aviso, rechazar).
- **Suites con base de datos:** e2e 89/89 y `test:integration` 6/6 (tras `c6df6c1`).
- Migración `1750000007000` aplicada en local, `up` y `down` probados.
- Antes del cierre: 174 unit en verde y el primer e2e sin BD (`citas-detalle`, 10/10), según
  [us02 §Tests](../Features/us02-gestion-citas.md#tests).

### Qué quedó pendiente

| Pendiente | Dónde se sigue |
|---|---|
| US-02.07 (el paciente cancela o pide reagendar) | ⏸ fuera de la v1 (Q11 → C) → [Fase 3](fase-3-us04-respuesta-paciente.md) |
| Tests automáticos del `FOR UPDATE` concurrente y del `NULLS LAST` | solo verificados a mano → [DT-20](../Deudas/DT-20.md) |
| Límite de tasa en la ruta pública | riesgo aceptado (2026-09-29) → [DT-18](../Deudas/DT-18.md) |
| Zona explícita en `inicio` al crear y reagendar | recomendado en el contrato, **no aplicado**: solo `AceptarSolicitudDto` usa `@IsInstanteConZona` → [DT-14](../Deudas/DT-14.md) |
| Citas en el pasado | [DT-13](../Deudas/DT-13.md) abierta |
| Historial de la cita en el voucher | "segunda entrega"; la ruta existe y no se consume → [DT-29](../Deudas/DT-29.md) |
| Botones de asistencia en el voucher | decisión del 2026-09-30: esperan a la Fase 3 → [DT-30](../Deudas/DT-30.md) |
| Campos definitivos del formulario público | provisionales ([ADR-09 §10](../Decisions/ADR-09.md)) |
| Prellenar la hora al aceptar, marcar "paciente conocido", actualizar contacto al aceptar | [us02 § Fuera de este cierre](../Features/us02-gestion-citas.md#fuera-de-este-cierre-anotado-no-olvidado); el contacto quedó en parte decidido por ADR-13 §14 |
| Métricas del dashboard | con datos de prueba → [DTF-03](../../../citia-frontend/context/Deudas/DTF-03.md) |
| ADR-08 en el login | propuesto; solo su fase 1 se aplica en la ruta pública |

---

## Cronología: commit → documento

| Fila | Commit | Fecha | Qué | Documento |
|---|---|---|---|---|
| 35 | `f2a7dff` | 2026-08-24 | release 1 de US-02 + RUT + conexión con el front (y creación de `Deudas/`, `Descripcion/`, `PREGUNTAS-ABIERTAS`) | **[ADR-09](../Decisions/ADR-09.md)** §3–§7 · cierra DT-10 y DT-22 |
| 38 | `16b50e1` | 2026-09-10 | decisiones del frontend sobre el enlace público | [FD-01…FD-06](../Frontend-Decisions/README.md) |
| 36 | `e1253c3` | 2026-09-10 | recepción pública de solicitudes | ADR-09 §1, §2, §8–§11 · [us02 §Pública](../Features/us02-gestion-citas.md#pública-sin-autenticación) |
| 37 | `439a5fe` | 2026-09-10 | vía pública en ADR-09 y tablero de deudas | DT-29 nueva · DT-28 mitigada · DT-18 aplazada |
| 39 | `7327d6c` | 2026-09-10 | feature de US-02 y trazabilidad | **[us02](../Features/us02-gestion-citas.md)** (nueva) |
| 41 | `2877b13` | 2026-09-25 | voucher (código) + ADR-10 + planes US-02.07 y US-02.08 | **[ADR-10](../Decisions/ADR-10.md)** · [US-02.07](../US/02.07-paciente-reagenda-cancela.md) · [US-02.08](../US/02.08-voucher-cita.md) · [us02 §Detalle](../Features/us02-gestion-citas.md#detalle-de-la-cita-us-0208) |
| 42–44 | `e9ec6ba`, `dbeb8c1`, `b83209b` | 2026-09-25 | merges a `develop` y retoque del ROADMAP | — |
| 45–53 | `717800e` … `06858f2` | 2026-09-28 | rangos en zona, `chocaCon`, `resuelta_en`, agenda y avisos, bandeja, `tenantSlug` en el login, fixes de seed y suites, tests | **[ADR-11](../Decisions/ADR-11.md)** · [us02 §Cierre](../Features/us02-gestion-citas.md#cierre-de-fase-1--contrato-2026-09-25) · DT-12 · DT-20 |
| 54 | `4c543a5` | 2026-09-28 | contrato de cierre, ADR-11 y ROADMAP | ADR-11 · us02 · DT-12 · Q4 · Q11 |
| 55–56 | `b07d839`, `abe9045` | 2026-09-28 | vista previa del front y **merge del cierre** | — |
| 57–58 | `31ea490`, `c9ac69f` | 2026-09-29 | FD-01 descartada, DT-18 aceptada, fases 0 y 1 cerradas | [FD-01](../Frontend-Decisions/FD-01.md) · [DT-18](../Deudas/DT-18.md) · ROADMAP |

Detalle fila a fila en [TRAZABILIDAD](../TRAZABILIDAD.md). La fila 38 es anterior en el tiempo a la 36
porque vivió en una rama paralela.

---

## Decisiones

| ADR | En una línea | Estado |
|---|---|---|
| [ADR-08](../Decisions/ADR-08.md) | El tenant pasa del body a la URL | Propuesto · su fase 1 la adopta la ruta pública (ADR-09 §11.b); falta el login |
| [ADR-09](../Decisions/ADR-09.md) | La solicitud del paciente es un agregado aparte; el RUT es la identidad; reagendar mueve la cita y queda en la bitácora | Aceptado · implementado (release 1, vía pública, bandeja); límite de tasa aceptado sin límite; campos del formulario provisionales |
| [ADR-10](../Decisions/ADR-10.md) | Enlace por cita para que el paciente cancele o pida reagendar | **Propuesto** · aplazado fuera de la v1 (Q11 → C) → Fase 3 |
| [ADR-11](../Decisions/ADR-11.md) | Solapamiento: avisar y permitir, regla en `Cita.chocaCon` | Aceptado · implementado el 2026-09-28 |

| FD | En una línea | Estado |
|---|---|---|
| [FD-01](../Frontend-Decisions/FD-01.md) | El enlace público reservaría la hora al instante | **Descartada** (2026-09-29): rige ADR-09 decisión 2 |
| [FD-02](../Frontend-Decisions/FD-02.md) | Cada profesional comparte su propio enlace | Tomada |
| [FD-03](../Frontend-Decisions/FD-03.md) | Mismos datos, dos formas de entrar (panel y enlace) | Tomada |
| [FD-04](../Frontend-Decisions/FD-04.md) | La vista pública todavía no guardaba nada | Temporal · superada el 2026-09-10 (ver la nota del FD) |
| [FD-05](../Frontend-Decisions/FD-05.md) | El flujo público vive junto al del panel, por ahora | Tomada |

FD-06 es de la [Fase 3](fase-3-us04-respuesta-paciente.md).

---

## Features

- [us02-gestion-citas](../Features/us02-gestion-citas.md) — ✅ cubre las dos vías de entrada (botón del
  profesional y enlace del paciente) y el contrato del cierre.

---

## Deudas

| Tipo | Deudas |
|---|---|
| **Cerradas** | [DT-10](../Deudas/DT-10.md) máquina de estados inalcanzable · [DT-22](../Deudas/DT-22.md) sin vínculo entre citas reagendadas (release 1, 2026-08-23) |
| **Mitigada** | [DT-28](../Deudas/DT-28.md) una solicitud sin revisar bloqueaba al paciente (ventana de 72 h, 2026-08-24) |
| **Creadas** | [DT-23](../Deudas/DT-23.md) RUT sin verificar titularidad · [DT-24](../Deudas/DT-24.md) sin taxonomía de tipos de consulta · [DT-25](../Deudas/DT-25.md) la apuesta del formulario no se mide · [DT-26](../Deudas/DT-26.md) sin retención de solicitudes · [DT-27](../Deudas/DT-27.md) hechos fuera de la transacción · [DT-29](../Deudas/DT-29.md) rutas implementadas y no conectadas |
| **Afectadas** | [DT-12](../Deudas/DT-12.md) resuelta por ADR-11 e implementada · [DT-14](../Deudas/DT-14.md) agravada por reagendar · [DT-15](../Deudas/DT-15.md) neutralizada para crear cita por el RUT · [DT-18](../Deudas/DT-18.md) aceptada sin límite (2026-09-29) · [DT-20](../Deudas/DT-20.md) avance con suites con BD |

> **DT-23, DT-25 y DT-26 figuran como "previstas"** en el índice de deudas, pero la vía pública y la
> bandeja ya están implementadas. Ver la nota del 2026-09-30 en
> [Deudas/README](../Deudas/README.md#previstas--se-contraen-al-implementar-la-vía-pública-de-adr-09).

---

## Preguntas abiertas relacionadas

- [Q4](../PREGUNTAS-ABIERTAS.md#q4--solapamiento-avisar-o-rechazar) — ✅ respondida (avisar y permitir, ADR-11).
- [Q11](../PREGUNTAS-ABIERTAS.md#q11--cómo-le-llega-al-paciente-el-enlace-de-su-cita) — ✅ C: US-02.07
  fuera de la v1; se retoma con B en la Fase 3.
- [Q8](../PREGUNTAS-ABIERTAS.md#q8--adr-08-el-tenant-en-la-url-dev-b--prioridad-2) — ADR-08 en el login.
- [Q9](../PREGUNTAS-ABIERTAS.md#q9--modelo-de-disponibilidad-no-construir--solo-evaluar) — modelo de
  disponibilidad (la "Fase 2" de ADR-09, no del roadmap).
- [H3](../PREGUNTAS-ABIERTAS.md#h3--modelo-de-amenazas-de-la-vía-pública-antes-de-construirla) —
  modelo de amenazas de la vía pública (DT-23, DT-28).
- [H5](../PREGUNTAS-ABIERTAS.md#h5--manejo-de-datos-de-salud) — retención de datos de salud (DT-26).
- [Q10](../PREGUNTAS-ABIERTAS.md#q10--la-validación-empieza-por-aquí) — la lista de tipos de consulta
  (DT-24) sale de las conversaciones con usuarios.

---

## Planes de US

- [US-02.07](../US/02.07-paciente-reagenda-cancela.md) — ⏸ aplazada; análisis completo para la Fase 3.
- [US-02.08](../US/02.08-voucher-cita.md) — ✅ implementada (`2877b13`).
- US-02.09 — ✅ solo frontend: [us/02.09](../../../citia-frontend/context/us/02.09-dashboard-refleja-cambios.md).

---

## Contraparte en el frontend

| Documento del front | Qué cubre |
|---|---|
| [Features/agenda-profesional.md](../../../citia-frontend/context/Features/agenda-profesional.md) | agenda semanal + lista y aviso de solapamiento |
| [Features/bandeja-solicitudes.md](../../../citia-frontend/context/Features/bandeja-solicitudes.md) | bandeja y enlace de agenda |
| [Features/agendar-cita-paciente.md](../../../citia-frontend/context/Features/agendar-cita-paciente.md) | flujo público `/agendar-cita/:tenantSlug` |
| [Features/gestionar-cita.md](../../../citia-frontend/context/Features/gestionar-cita.md) | voucher (US-02.08) |
| [Features/dashboard-citas-del-dia.md](../../../citia-frontend/context/Features/dashboard-citas-del-dia.md) | lista del día (US-02.09) |
| [us/02.07](../../../citia-frontend/context/us/02.07-paciente-reagenda-cancela.md) · [us/02.08](../../../citia-frontend/context/us/02.08-voucher-cita.md) · [us/02.09](../../../citia-frontend/context/us/02.09-dashboard-refleja-cambios.md) | planes de las subtareas |
| [DTF-05](../../../citia-frontend/context/Deudas/DTF-05.md) · [DTF-06](../../../citia-frontend/context/Deudas/DTF-06.md) · [DTF-07](../../../citia-frontend/context/Deudas/DTF-07.md) | RUT duplicado, límites copiados, zona del navegador |

> Varios documentos del front todavía dicen "sin prueba manual contra el backend real" o "solo con
> respuestas simuladas". Son anteriores a la prueba del 2026-09-28 que registra el ROADMAP.

---

## Depende de / desbloquea

- **Depende de:** [Fundaciones](fase-base-fundaciones.md) y del `Cita`/`Paciente` de la
  [Fase 0](fase-0-us06-dashboard.md).
- **Desbloquea:** el cierre de la [Fase 0](fase-0-us06-dashboard.md) · la
  [Fase 2](fase-2-us03-recordatorios.md) (los hechos de cita y bandeja son lo que el outbox entregará)
  · la [Fase 3](fase-3-us04-respuesta-paciente.md) (US-02.07 y ADR-10) · la
  [Fase 4](fase-4-us05-alertas.md) (los disparadores de alerta) · la [Fase 5](fase-5-us07-scoring.md)
  (la bitácora de reagendamientos).
