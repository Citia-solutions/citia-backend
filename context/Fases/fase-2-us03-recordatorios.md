# Fase 2 — US-03: Recordatorios al paciente (RF-06)

> **Fase del roadmap** (construcción). No confundir con la
> [etapa 2 del producto](../Descripcion/fase-2-requisitos.md) (requisitos) ni con la "fase 2" interna de
> ADR-08 (subdominio) o de ADR-09 (modelo de disponibilidad). Índice: [Fases](README.md) · Estado en el
> [ROADMAP § Fase 2](../ROADMAP.md#fase-2--us-03-recordatorios-al-paciente).

| | |
|---|---|
| **Objetivo** | Que el paciente reciba un recordatorio automático por correo antes de su hora, sin que el profesional le escriba; y que el equipo se entere de un fallo antes que el cliente. |
| **Entregable** | El profesional configura sus recordatorios; el sistema los programa, los envía por correo, registra su entrega y refleja reagendar y cancelar; si algo falla, llega una alerta (ROADMAP). |
| **Estado** | 🔶 **diseño cerrado y decisiones confirmadas (2026-09-30)** · implementación sin empezar · **entra en el MVP** (Q1 → A). |
| **Fechas** | diseño y decisiones: 2026-09-30. Implementación: sin fecha. |
| **Historia** | US-03 — plan en [US/03-recordatorios.md](../US/03-recordatorios.md). |
| **Commits** | fila 59 de [TRAZABILIDAD](../TRAZABILIDAD.md): `ab30bb7`. **Solo en la rama `docs/fase2-recordatorios`**; al 2026-09-30 no está en `develop`. |

---

## Guía de lectura del diseño del 2026-09-30

Todo lo de esta fase entró en un solo commit (`ab30bb7`). Este es el orden que tiene sentido —de la
decisión de producto al plan, y de la infraestructura a la feature— y qué mirar en cada documento.

### 1. Por qué entra: el cambio de alcance

- **[Descripcion/fase-3-mvp.md](../Descripcion/fase-3-mvp.md)** (etapa 3 del producto). Mira
  [§1](../Descripcion/fase-3-mvp.md#1-las-tres-cosas): los recordatorios reemplazan al scoring como
  tercera pieza del MVP; la tabla *Qué entra y qué no*; y
  [§3](../Descripcion/fase-3-mvp.md#3-el-mvp-entrega-valor-por-sí-solo): qué se le promete al primer
  cliente y qué no.
- **[Q1 en PREGUNTAS-ABIERTAS](../PREGUNTAS-ABIERTAS.md#q1--el-mvp-incluye-recordatorios-automáticos)**
  — la respuesta A y el scoring a la v2.

### 2. El mapa de decisiones

- **[ROADMAP § Fase 2](../ROADMAP.md#fase-2--us-03-recordatorios-al-paciente)** — la tabla
  *Decisiones (usuario, 2026-09-30)* resume todas en una página; úsala como índice. Debajo, las 12
  piezas del backend con su agente y los prerrequisitos operativos.

### 3. La infraestructura: ADR-12 (léelo antes que ADR-13)

- **[ADR-12](../Decisions/ADR-12.md)** — outbox transaccional y planificador en Postgres. Mira:
  - *Lo que hay hoy*: la tabla de dónde se llama a `publicar` en cada caso de uso;
  - §1–§3: `eventos_salida`, `publicar(evento, tx)` y el despachador;
  - §4: las cuatro reglas de los suscriptores (la 2, **reconciliar**, sostiene todo ADR-13);
  - §5–§7: `@nestjs/schedule`, el barrido sobre todos los tenants y el requisito de contenedor
    siempre encendido;
  - §8: el proceso de cierre queda aplazado con el mecanismo listo (tabla de Q6);
  - *Consecuencias*: la latencia de segundos no sirve para las alertas de la Fase 4.
- **[DT-27](../Deudas/DT-27.md)** — la corrección del 2026-09-30 (se publica **antes** del commit, no
  después) y el criterio de cierre.

### 4. La feature: ADR-13

- **[ADR-13](../Decisions/ADR-13.md)** — el documento más largo del repo. Recorrido sugerido:
  - *Decisiones de producto de partida*: las ocho decisiones del usuario;
  - §1: el módulo `recordatorio/` se rehace y solo **lee** de los demás;
  - §4–§6: estados del recordatorio, planificación pura (horas sin envío, tardíos) y la tabla de
    disparadores de la reconciliación;
  - §7–§10: envío con revalidación y políticas, puerto `CanalMensajeria`, idempotencia y webhooks
    firmados;
  - §11: cuota del modo prueba y fusible por tenant;
  - §12–§15: contenido y privacidad, remitente, correo obligatorio, consentimiento apagado;
  - §16: observabilidad;
  - [Decisiones confirmadas](../Decisions/ADR-13.md#decisiones-confirmadas-2026-09-30) y
    [Lo que queda por verificar](../Decisions/ADR-13.md#lo-que-queda-por-verificar-al-implementar).

### 5. El plan de construcción

- **[US/03-recordatorios.md](../US/03-recordatorios.md)** — prerrequisitos operativos del usuario,
  PR 1 (outbox + planificador + observabilidad) y PR 2 (recordatorios) con agente, dependencia y días,
  paquetes nuevos y la Definición de Terminado.
- **[stack-tecnologico.md](../stack-tecnologico.md)** — puntos 4 a 7 (cola en Postgres, Resend, Better
  Stack, Railway + Cloudflare) y [Modo prueba](../stack-tecnologico.md#modo-prueba): cuánto alcanza el
  plan gratis y cuándo pasar a pago.

### 6. Las deudas que cambiaron

En este orden (de la que más pesa a la más mecánica):

1. **[DT-30](../Deudas/DT-30.md)** — **nueva.** La asistencia real no se registra y no se puede
   reconstruir. Mira la tabla de salidas A/B/C y lo que implica esperar a la Fase 3.
2. **[DT-11](../Deudas/DT-11.md)** — aplazada con el scoring; mira el matiz de la **fecha de corte**
   para el `ghosting` retroactivo.
3. **[DT-16](../Deudas/DT-16.md)** — riesgo aceptado; mira los **disparadores de revisión** (Ley
   21.719, prevista para el 2026-12-01).
4. **[DT-19](../Deudas/DT-19.md)** — resuelta en diseño; la tabla de lo decidido y el criterio de cierre.
5. **[DT-27](../Deudas/DT-27.md)** — resuelta en diseño por ADR-12 (ya leída en el punto 3).
6. **[DT-21](../Deudas/DT-21.md)** — `recordatorio/` se rehace; un commit de limpieza aparte.
7. **[DT-29](../Deudas/DT-29.md)** — la nota sobre `asistencia` e `inasistencia` sin consumir.
8. **[Deudas/README](../Deudas/README.md)** — la sección
   [Previstas de la Fase 2](../Deudas/README.md#previstas--se-contraen-al-implementar-la-fase-2-adr-12-y-adr-13)
   y [Lo que hay que mirar primero](../Deudas/README.md#lo-que-hay-que-mirar-primero).

### 7. Notas que el diseño dejó en documentos existentes

- [ADR-04](../Decisions/ADR-04.md) — nota de cabecera: BullMQ → ADR-12; el job se aplaza.
- [ADR-09 §3](../Decisions/ADR-09.md) — matiz: un correo vacío se completa al vincular por RUT.
- [us02 § Fuera de este cierre](../Features/us02-gestion-citas.md#fuera-de-este-cierre-anotado-no-olvidado)
  — actualizar contacto al aceptar, parcialmente decidido.
- [PREGUNTAS-ABIERTAS](../PREGUNTAS-ABIERTAS.md) — notas en Q6 y Q11.
- [Decisions/README](../Decisions/README.md#relaciones-entre-adrs) — relaciones de ADR-12 y ADR-13.

---

## Qué se diseñó

| Pieza | Decisión | Dónde |
|---|---|---|
| Entrega de hechos | outbox `eventos_salida` en la misma transacción; `publicar(evento, tx)`; despachador con reintentos y carta muerta | ADR-12 §1–§4 |
| Planificador | `@nestjs/schedule` en el proceso, `FOR UPDATE SKIP LOCKED`, sin Redis ni BullMQ | ADR-12 §5–§7 |
| Recordatorio | entidad con seis estados y motivo; planificación con funciones puras | ADR-13 §4–§5 |
| Reprogramar y anular | el suscriptor reconcilia contra el estado actual de la cita | ADR-13 §6 |
| Canal | correo vía Resend detrás de `CanalMensajeria`; webhooks firmados | ADR-13 §8–§10 |
| Modo prueba | 3.000/mes y 100/día; aviso al 80 %; 40 envíos por tenant al día | ADR-13 §11 |
| Privacidad | solo fecha, hora, profesional, organización y contacto; sin seguimiento | ADR-13 §12 |
| Correo del paciente | obligatorio en el alta manual; `PATCH /api/pacientes/:id` mínimo | ADR-13 §14 |
| Consentimiento | política implementada y apagada | ADR-13 §15 · DT-16 |
| Observabilidad | `pino`, `GET /api/health`, latidos y alertas en Better Stack | ADR-13 §16 · DT-19 |
| Hosting | backend + Postgres en Railway, siempre encendido; SPA en Cloudflare | stack · ADR-12 §7 |

**Prerrequisitos operativos (usuario):** comprar el dominio `.cl`, delegar el DNS a Cloudflare y
verificar el subdominio de envío en Resend; cuentas de Resend y Better Stack; Railway con "App
Sleeping" desactivado. **Sin el dominio verificado no se puede escribir a pacientes reales.**

---

## Cronología: commit → documento

| Fila | Commit | Fecha | Qué | Documentos |
|---|---|---|---|---|
| 59 | `ab30bb7` | 2026-09-30 | diseño de la Fase 2 | **nuevos:** [ADR-12](../Decisions/ADR-12.md), [ADR-13](../Decisions/ADR-13.md), [US-03](../US/03-recordatorios.md), [DT-30](../Deudas/DT-30.md) · **actualizados:** ADR-04, ADR-09, DT-11, DT-16, DT-19, DT-21, DT-27, DT-29, us02, índices, PREGUNTAS, ROADMAP, stack, Descripcion |
| — | *(esta reorganización)* | 2026-09-30 | navegación por fases | se registra en la próxima pasada ([convención](../TRAZABILIDAD.md)) |

---

## Decisiones

| ADR | En una línea | Estado |
|---|---|---|
| [ADR-12](../Decisions/ADR-12.md) | Outbox transaccional y planificador en proceso sobre Postgres; cierre de citas aplazado | Aceptado · sin implementar |
| [ADR-13](../Decisions/ADR-13.md) | Recordatorios por correo: entidad con estado, planificación pura, Resend detrás de un puerto | Aceptado · sin implementar · todas sus decisiones confirmadas (2026-09-30) |

Resuelve además tres de las *Decisiones previas* del ROADMAP: canal (correo), proveedor (Resend) y
planificador (Postgres, sin Redis). **Decisiones del frontend:** ninguna todavía.

---

## Features

Ninguna todavía: la fase está diseñada, no implementada. Cuando se construya, su documento irá en
`Features/` (por ejemplo `us03-recordatorios.md`) y se enlazará aquí y en el
[índice de features](../Features/README.md).

---

## Deudas

| Tipo | Deudas |
|---|---|
| **Creada** | [DT-30](../Deudas/DT-30.md) asistencia real no registrada · aplazada hasta la Fase 3 |
| **Resueltas en diseño** (se cierran al implementar) | [DT-27](../Deudas/DT-27.md) (PR 1) · [DT-19](../Deudas/DT-19.md) · [DT-21](../Deudas/DT-21.md) (`recordatorio/`) |
| **Afectadas** | [DT-11](../Deudas/DT-11.md) aplazada · [DT-16](../Deudas/DT-16.md) riesgo aceptado · [DT-17](../Deudas/DT-17.md) horas sin envío globales · [DT-23](../Deudas/DT-23.md) completar un correo vacío por RUT · [DT-26](../Deudas/DT-26.md) se amplía a recordatorios y supresiones · [DT-29](../Deudas/DT-29.md) `POST /pacientes` sin consumidor |
| **Previstas sin número** | tres de [ADR-12](../Decisions/ADR-12.md#deudas-técnicas-asociadas) y cinco de [ADR-13](../Decisions/ADR-13.md#deudas-técnicas-asociadas); se fichan al implementar |

---

## Preguntas abiertas relacionadas

- [Q1](../PREGUNTAS-ABIERTAS.md#q1--el-mvp-incluye-recordatorios-automáticos) — ✅ A.
- [Q6](../PREGUNTAS-ABIERTAS.md#q6--planificador-para-el-proceso-de-cierre-dev-a--prioridad-1) — ✅ en
  cuanto al mecanismo; sus preguntas 1 y 2 siguen abiertas para la Fase 5.
- [Q11](../PREGUNTAS-ABIERTAS.md#q11--cómo-le-llega-al-paciente-el-enlace-de-su-cita) — la nota del
  2026-09-30: con recordatorios, el canal existe y la Fase 3 retoma ADR-10 con la salida B.
- [H5](../PREGUNTAS-ABIERTAS.md#h5--manejo-de-datos-de-salud) — datos de salud; DT-16 pide revisar
  también la transferencia internacional al proveedor de correo.
- **Sin decisiones abiertas** propias (ROADMAP): solo datos de proveedores por verificar al implementar.

---

## Planes de US

- [US/03-recordatorios.md](../US/03-recordatorios.md) — ✅ diseño cerrado · ⬜ sin implementar.

---

## Contraparte en el frontend

No existe todavía ningún documento de recordatorios en `citia-frontend/context/` (verificado el
2026-09-30). El trabajo del front está listado en el
[ROADMAP § Fase 2 → Frontend](../ROADMAP.md#frontend-citia-frontend) y en el plan
([US-03](../US/03-recordatorios.md)): correo obligatorio en el modal (**mismo release** que el
`PATCH /pacientes`), pantalla de configuración, estado de los recordatorios en el voucher y despliegue
en Cloudflare con *fallback* de SPA.

---

## Depende de / desbloquea

- **Depende de:** la [Fase 1](fase-1-us02-gestion-citas.md) (los hechos que publican cita y bandeja) y
  del dominio verificado en Resend.
- **Desbloquea:** la [Fase 3](fase-3-us04-respuesta-paciente.md) (el recordatorio lleva el enlace, bloque
  `accion` de la plantilla) · la [Fase 4](fase-4-us05-alertas.md) (las alertas son otro suscriptor del
  outbox) · la [Fase 5](fase-5-us07-scoring.md) (el job de cierre corre en este planificador).
