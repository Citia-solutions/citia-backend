# Fase 2 — US-03: Recordatorios al paciente (RF-06)

> **Fase del roadmap** (construcción). No confundir con la
> [etapa 2 del producto](../Descripcion/fase-2-requisitos.md) (requisitos) ni con la "fase 2" interna de
> ADR-08 (subdominio) o de ADR-09 (modelo de disponibilidad). Índice: [Fases](README.md) · Estado en el
> [ROADMAP § Fase 2](../ROADMAP.md#fase-2--us-03-recordatorios-al-paciente).

| | |
|---|---|
| **Objetivo** | Que el paciente reciba un recordatorio automático por correo antes de su hora, sin que el profesional le escriba; y que el equipo se entere de un fallo antes que el cliente. |
| **Entregable** | El profesional configura sus recordatorios; el sistema los programa, los envía por correo, registra su entrega y refleja reagendar y cancelar; si algo falla, llega una alerta (ROADMAP). |
| **Estado** | ✅ **implementada en la rama `feature/fase2-recordatorios`** (2026-10-04) · ⏳ **pendiente de merge** ([PR #1](https://github.com/Citia-solutions/citia-backend/pull/1) y, en el mismo release, [PR #2](https://github.com/Citia-solutions/citia-frontend/pull/2) del frontend) **y de los prerrequisitos operativos** ([checklist](#checklist-de-salida-a-producción)) · **en el MVP** (Q1 → A). |
| **Fechas** | diseño y decisiones: 2026-09-30 · merge del diseño a `develop`: 2026-10-01 · implementación: 2026-10-01 → 2026-10-04. |
| **Historia** | US-03 — plan en [US/03-recordatorios.md](../US/03-recordatorios.md). |
| **Commits** | filas 59 y 61–73 de [TRAZABILIDAD](../TRAZABILIDAD.md) (la 60 es transversal, pero entró en la misma rama del diseño): el diseño (`ab30bb7`, `2f33394`) está en `develop` desde el merge `510015a` (2026-10-01); la implementación (`daf0617` → `f2ccb01`) está **solo en la rama `feature/fase2-recordatorios`**. [Cronología](#cronología-commit--documento). |
| **Feature** | [Features/us03-recordatorios.md](../Features/us03-recordatorios.md) |

---

## Estado al 2026-10-04

- **Construido y en verde** en la rama `feature/fase2-recordatorios`: outbox con despachador y
  planificador (cierra [DT-27](../Deudas/DT-27.md)), logs con pino, `GET /api/health`, latidos,
  validación de entorno y CORS por lista, correo obligatorio y `PATCH /api/pacientes/:id`, y el módulo
  `recordatorio` completo (persistencia, planificación, reconciliación, envío por Resend, webhook firmado,
  rutas de configuración y estado). **1274 unitarios, 212 e2e y 80 de integración**; `eslint` sin errores.
- **Definición de Terminado:** todo lo automático ✅; los **dos puntos manuales** ❌ (Better Stack y un
  correo real con el dominio verificado) — [US-03](../US/03-recordatorios.md#definición-de-terminado).
- **Frontend** listo en su rama ([PR #2](https://github.com/Citia-solutions/citia-frontend/pull/2)):
  correo obligatorio en el modal, pantalla `/recordatorios`, estado de los recordatorios y vista
  *Contacto* en el voucher, despliegue en Netlify (revertido desde Cloudflare el 2026-10-04). Probado solo con respuestas simuladas.
- **Falta para producción:** el merge de los dos PR en el mismo release, los prerrequisitos operativos
  ([checklist](#checklist-de-salida-a-producción)) y cuatro decisiones del usuario
  ([abajo](#decisiones-pendientes-del-usuario-2026-10-04)).

---

## Guía de lectura de la implementación (2026-10-04)

1. **[Features/us03-recordatorios.md](../Features/us03-recordatorios.md)** — lo que existe: arquitectura,
   flujo outbox → suscriptor → reconciliación → envío → webhook, endpoints con contrato exacto, tablas,
   jobs, variables, observabilidad y tests.
2. **Notas de implementación** de [ADR-12](../Decisions/ADR-12.md#notas-de-implementación-2026-10-04)
   y [ADR-13](../Decisions/ADR-13.md#notas-de-implementación-2026-10-04) — dónde se apartó el código del
   diseño y por qué (vencimiento del último recordatorio, reintentos, clasificación real de Resend,
   respaldo sin candado global, `svix` 1.x…), y qué datos de los proveedores se confirmaron.
3. **[US-03 § Definición de Terminado](../US/03-recordatorios.md#definición-de-terminado)** — cada punto
   con su archivo de test.
4. **[ADR-02 § Nota del 2026-10-04](../Decisions/ADR-02.md#nota-2026-10-04-el-check-del-4-pasa-a-ser-un-test)**
   — el check de capas pasa a ser `src/arquitectura.spec.ts`, y [DT-31](../Deudas/DT-31.md) lo que no ve.
5. **Deudas**: [Deudas/README § Contraídas al implementar la Fase 2](../Deudas/README.md#contraídas-al-implementar-la-fase-2-adr-12-y-adr-13)
   (DT-32 a DT-39) y las que cambiaron (DT-16, DT-19, DT-20, DT-21, DT-27, DT-29).
6. **[us02](../Features/us02-gestion-citas.md#correo-del-paciente-obligatorio-fase-2)** e
   **[infra](../Features/infra-contenedores.md#fase-2-observabilidad-planificador-y-variables-nuevas)** — lo
   que la fase cambió en features existentes.
7. `src/modules/recordatorio/CLAUDE.md` — reglas locales del módulo para los agentes.

---

## Checklist de salida a producción

Lo que falta, fuera del código, para que el primer recordatorio llegue a un paciente real. El orden
importa: los tres primeros dependen de DNS y del proveedor.

- [x] **Dominio** `citiahealth.cl` comprado y su DNS **delegado a Cloudflare**.
- [ ] **Subdominio de envío verificado en Resend** (p. ej. `notificaciones.citiahealth.cl`): registros SPF,
      DKIM, MX de retorno y DMARC (`p=none` al inicio) en Cloudflare, **solo DNS, sin proxy**; seguimiento
      de aperturas y clics **desactivado**; clave de API creada.
- [ ] **Webhook creado** en Resend hacia `https://<backend>/api/webhooks/resend` con los eventos `email.*`;
      su secreto `whsec_…` va a `RESEND_WEBHOOK_SECRET`. Sin él, nada pasa a `entregado` y la tasa de fallo
      no ve los rebotes ([DT-37](../Deudas/DT-37.md)).
- [ ] **Better Stack:** monitor de uptime sobre `GET /api/health`; heartbeats `recordatorios` (cada minuto,
      5 de gracia) y `salida`; fuente de logs; destino de las alertas. Comprobar si el plan gratis tiene
      alertas por consulta de logs.
- [ ] **Variables en Railway** (el arranque falla si falta alguna obligatoria):
      `NODE_ENV=production`; `JWT_SECRET` de **32 caracteres o más** (no de ejemplo); `FRONTEND_URL` =
      el origen del frontend publicado, **sin ruta**; `MENSAJERIA_ADAPTADOR=resend`; `RESEND_API_KEY`;
      `RESEND_WEBHOOK_SECRET`; `CORREO_DOMINIO` (el subdominio verificado); `CORS_ORIGENES_EXTRA` (vistas
      previas: el comodín solo admite `*.<proyecto>.pages.dev`; las de Netlify van como orígenes exactos);
      `BETTERSTACK_SOURCE_TOKEN`, `BETTERSTACK_INGESTING_HOST`, `BETTERSTACK_HEARTBEAT_SALIDA_URL` y
      `BETTERSTACK_HEARTBEAT_RECORDATORIOS_URL`. Además de las `DB_*`. Tabla completa en
      [us03 § Variables](../Features/us03-recordatorios.md#variables-de-entorno).
- [ ] **"App Sleeping" apagado** en el servicio del backend en Railway ([ADR-12 §7](../Decisions/ADR-12.md)).
- [ ] **Frontend publicado en Netlify**: un sitio por entorno (`develop` → `staging.citiahealth.cl`,
      `main` → `app.citiahealth.cl`), con `public/_redirects`, `VITE_API_URL` apuntando al backend de
      Railway de ese entorno, y su dominio en el `FRONTEND_URL` del backend correspondiente.
- [ ] **Migraciones** `1750000008000` a `1750000011000` aplicadas (las corre el `entrypoint.sh` al
      arrancar; `eventos_salida`, `configuraciones_recordatorio`, `recordatorios`, `supresiones_correo`).
- [ ] **Contar los pacientes sin correo** antes del despliegue:
      `SELECT count(*) FROM pacientes WHERE correo IS NULL OR btrim(correo) = '';` — sus recordatorios
      quedarán `omitido` (`sin_correo`) hasta completarlos con `PATCH /api/pacientes/:id`.
- [ ] **Merge** de [PR #1](https://github.com/Citia-solutions/citia-backend/pull/1) y
      [PR #2](https://github.com/Citia-solutions/citia-frontend/pull/2) en el **mismo release** (sin el
      frontend nuevo, el modal recibe 400 por el correo).
- [ ] Los **dos puntos manuales** de la Definición de Terminado: latido y alerta de prueba en Better
      Stack (cierra [DT-19](../Deudas/DT-19.md)); un recordatorio real con SPF, DKIM y DMARC en `pass`.

> Desde el despliegue, **todas las citas futuras** reciben recordatorios (activos por defecto a las 24 h
> y 2 h): la reconciliación de respaldo programa en la primera hora las que ya existían.

---

## Decisiones pendientes del usuario (2026-10-04)

Salieron al implementar; ninguna bloquea el merge. Están también en
[PREGUNTAS-ABIERTAS](../PREGUNTAS-ABIERTAS.md#fase-2--decisiones-pendientes-tras-implementar-2026-10-04).

| # | Pregunta | Contexto |
|---|---|---|
| [Q12](../PREGUNTAS-ABIERTAS.md#q12--ocultar-recordatorios-al-rol-recepcion) | ¿Ocultar `/recordatorios` al rol `recepcion`? | la configuración es por usuario y se aplica a las citas de las que es dueño; una cuenta de recepción guardaría una configuración que no afecta a nadie |
| [Q13](../PREGUNTAS-ABIERTAS.md#q13--textos-y-colores-de-los-estados-de-recordatorio) | Textos y colores de los estados en el frontend | hoy: *Programado* (azul), *Enviado* y *Entregado* (verde), *Falló* (rojo), *Cancelado* (gris), *Omitido* (ámbar), y un texto por motivo |
| [Q14](../PREGUNTAS-ABIERTAS.md#q14--se-mantiene-la-vista-contacto-del-voucher) | ¿Se mantiene la vista *Contacto* del voucher? | permite completar o corregir teléfono y correo con `PATCH /api/pacientes/:id` desde la cita |
| [Q15](../PREGUNTAS-ABIERTAS.md#q15--cuándo-reinicia-resend-la-cuota-mensual-del-plan-gratis) | ¿Cuándo reinicia Resend la cuota mensual del plan gratis? | sin confirmar en su documentación; el contador local asume mes calendario UTC ([DT-36](../Deudas/DT-36.md)) |

---

## Guía de lectura del diseño del 2026-09-30

Todo el diseño de esta fase entró en un solo commit (`ab30bb7`). Este es el orden que tiene sentido —de la
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
  Stack, Railway + Netlify) y [Modo prueba](../stack-tecnologico.md#modo-prueba): cuánto alcanza el
  plan gratis y cuándo pasar a pago.

### 6. Las deudas que cambiaron

En este orden (de la que más pesa a la más mecánica):

1. **[DT-30](../Deudas/DT-30.md)** — **nueva.** La asistencia real no se registra y no se puede
   reconstruir. Mira la tabla de salidas A/B/C y lo que implica esperar a la Fase 3.
2. **[DT-11](../Deudas/DT-11.md)** — aplazada con el scoring; mira el matiz de la **fecha de corte**
   para el `ghosting` retroactivo.
3. **[DT-16](../Deudas/DT-16.md)** — riesgo aceptado; mira los **disparadores de revisión** (Ley
   21.719, prevista para el 2026-12-01).
4. **[DT-19](../Deudas/DT-19.md)** — resuelta en diseño; la tabla de lo decidido y el criterio de cierre. *(2026-10-04: implementada; falta la prueba manual.)*
5. **[DT-27](../Deudas/DT-27.md)** — resuelta en diseño por ADR-12 (ya leída en el punto 3). *(2026-10-04: cerrada.)*
6. **[DT-21](../Deudas/DT-21.md)** — `recordatorio/` se rehace; un commit de limpieza aparte. *(2026-10-04: cerrada, sin commit aparte: git no versiona carpetas vacías.)*
7. **[DT-29](../Deudas/DT-29.md)** — la nota sobre `asistencia` e `inasistencia` sin consumir.
8. **[Deudas/README](../Deudas/README.md)** — la sección de las previstas de la Fase 2 (desde el
   2026-10-04, [Contraídas al implementar la Fase 2](../Deudas/README.md#contraídas-al-implementar-la-fase-2-adr-12-y-adr-13),
   ya con número: DT-32 a DT-39) y [Lo que hay que mirar primero](../Deudas/README.md#lo-que-hay-que-mirar-primero).

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
| Hosting | backend + Postgres en Railway, siempre encendido; SPA en Netlify (2026-10-04) | stack · ADR-12 §7 |

**Prerrequisitos operativos (usuario):** comprar el dominio `.cl`, delegar el DNS a Cloudflare y
verificar el subdominio de envío en Resend; cuentas de Resend y Better Stack; Railway con "App
Sleeping" desactivado. **Sin el dominio verificado no se puede escribir a pacientes reales.**
*(2026-10-04: el dominio ya está comprado —`citiahealth.cl`, delegado a Cloudflare—; el resto sigue en el
[checklist](#checklist-de-salida-a-producción).)*

---

## Cronología: commit → documento

| Fila | Commit | Fecha | Qué | Documentos |
|---|---|---|---|---|
| 59 | `ab30bb7` | 2026-09-30 | diseño de la Fase 2 | **nuevos:** [ADR-12](../Decisions/ADR-12.md), [ADR-13](../Decisions/ADR-13.md), [US-03](../US/03-recordatorios.md), [DT-30](../Deudas/DT-30.md) · **actualizados:** ADR-04, ADR-09, DT-11, DT-16, DT-19, DT-21, DT-27, DT-29, us02, índices, PREGUNTAS, ROADMAP, stack, Descripcion |
| 60 | `2f33394` | 2026-09-30 | navegación por fases y enlaces cruzados | **nuevos:** `Fases/` (esta guía incluida) · columna Fase en TRAZABILIDAD · bloques de navegación en ADR, deudas, features, US y FD |
| 61 | `510015a` | 2026-10-01 | merge `docs/fase2-recordatorios` → `develop` | — (lleva 59 y 60 a `develop`) |
| 62 | `daf0617` | 2026-10-01 | tabla `eventos_salida` y repositorio del outbox | [ADR-12](../Decisions/ADR-12.md) §1, §3 · [us03 § Esquema](../Features/us03-recordatorios.md#eventos_salida--1750000008000-createeventossalida) |
| 63 | `a6c237f` | 2026-10-01 | `publicar(evento, tx)` exige la transacción | [ADR-12](../Decisions/ADR-12.md) §2 · [us02 § Publicación de hechos](../Features/us02-gestion-citas.md#publicación-de-hechos) |
| 64 | `d45de20` | 2026-10-03 | pino, health, latidos, validación de entorno, CORS por lista | [ADR-13](../Decisions/ADR-13.md) §16, §18 · [DT-19](../Deudas/DT-19.md) · [infra § Fase 2](../Features/infra-contenedores.md#fase-2-observabilidad-planificador-y-variables-nuevas) |
| 65 | `f95b637` | 2026-10-03 | outbox real, despachador y planificador | [ADR-12](../Decisions/ADR-12.md) §2–§5 · **cierra [DT-27](../Deudas/DT-27.md)** |
| 66 | `db46e37` | 2026-10-03 | tests del outbox con Postgres; e2e en serie | [ADR-12 § Verificación](../Decisions/ADR-12.md#verificación) · [DT-20](../Deudas/DT-20.md) |
| 67 | `a37f175` | 2026-10-03 | correo obligatorio y `PATCH /api/pacientes/:id` | [ADR-13](../Decisions/ADR-13.md) §14 · [us02 § Correo](../Features/us02-gestion-citas.md#correo-del-paciente-obligatorio-fase-2) · [DT-21](../Deudas/DT-21.md) (`paciente/`) |
| 68 | `f2d80aa` | 2026-10-03 | persistencia de recordatorios | [ADR-13](../Decisions/ADR-13.md) §1–§2 · **cierra [DT-21](../Deudas/DT-21.md)** |
| 69 | `a13d80a` | 2026-10-03 | dominio, planificación pura y reconciliación | [ADR-13](../Decisions/ADR-13.md) §3–§8 |
| 70 | `f719c66` | 2026-10-03 | envío por Resend, webhook firmado, rutas | [ADR-13](../Decisions/ADR-13.md) §7–§13, §16–§17 · **nueva:** [us03-recordatorios](../Features/us03-recordatorios.md) (en esta pasada) |
| 71 | `a938f9d` | 2026-10-04 | Definición de Terminado; `src/arquitectura.spec.ts` | [US-03](../US/03-recordatorios.md#definición-de-terminado) · [ADR-02](../Decisions/ADR-02.md#nota-2026-10-04-el-check-del-4-pasa-a-ser-un-test) · [DT-31](../Deudas/DT-31.md) |
| 72 | `8dd4747` | 2026-10-04 | coverage sin los specs | — (tooling) |
| 73 | `f2ccb01` | 2026-10-04 | vista previa del backend en `.claude/launch.json` | — (tooling) |
| — | *(esta pasada de documentación)* | 2026-10-04 | implementación de la Fase 2 en `context/` | se registra en la próxima pasada ([convención](../TRAZABILIDAD.md)) |

---

## Decisiones

| ADR | En una línea | Estado |
|---|---|---|
| [ADR-12](../Decisions/ADR-12.md) | Outbox transaccional y planificador en proceso sobre Postgres; cierre de citas aplazado | Aceptado · **implementado** en la rama (PR #1, pendiente de merge) · [notas](../Decisions/ADR-12.md#notas-de-implementación-2026-10-04) |
| [ADR-13](../Decisions/ADR-13.md) | Recordatorios por correo: entidad con estado, planificación pura, Resend detrás de un puerto | Aceptado · **implementado** en la rama (PR #1, pendiente de merge) · decisiones confirmadas (2026-09-30) · [notas](../Decisions/ADR-13.md#notas-de-implementación-2026-10-04) |
| [ADR-02](../Decisions/ADR-02.md) | Convenciones: español + hexagonal | Aceptado · **nota del 2026-10-04**: el check del §4 pasa a ser `src/arquitectura.spec.ts` |

Resuelve además tres de las *Decisiones previas* del ROADMAP: canal (correo), proveedor (Resend) y
planificador (Postgres, sin Redis). **Decisiones del frontend:** ninguna FD nueva; las cuatro preguntas que
dejó el frontend están en [Decisiones pendientes](#decisiones-pendientes-del-usuario-2026-10-04).

---

## Features

| Feature | Qué |
|---|---|
| **[us03-recordatorios](../Features/us03-recordatorios.md)** (nueva) | recordatorios por correo + outbox, planificador y observabilidad |
| [us02-gestion-citas](../Features/us02-gestion-citas.md#correo-del-paciente-obligatorio-fase-2) | correo obligatorio, `PATCH /api/pacientes/:id`, completar el correo por RUT; los hechos van al outbox |
| [infra-contenedores](../Features/infra-contenedores.md#fase-2-observabilidad-planificador-y-variables-nuevas) | pino, health, CORS por lista, planificador, variables nuevas, compose |

---

## Deudas

| Tipo | Deudas |
|---|---|
| **Creada** | [DT-30](../Deudas/DT-30.md) asistencia real no registrada · aplazada hasta la Fase 3 |
| **Cerradas** (2026-10-03, en rama) | [DT-27](../Deudas/DT-27.md) (`f95b637`) · [DT-21](../Deudas/DT-21.md) (`f2d80aa`, `a37f175`) |
| **Implementada, abierta hasta la prueba manual** | [DT-19](../Deudas/DT-19.md) (latido y alerta en Better Stack) |
| **Contraídas al implementar** (eran las previstas) | [DT-32](../Deudas/DT-32.md), [DT-33](../Deudas/DT-33.md), [DT-34](../Deudas/DT-34.md) (ADR-12) · [DT-35](../Deudas/DT-35.md), [DT-36](../Deudas/DT-36.md), [DT-37](../Deudas/DT-37.md), [DT-38](../Deudas/DT-38.md), [DT-39](../Deudas/DT-39.md) (ADR-13) |
| **Detectada** | [DT-31](../Deudas/DT-31.md) imports que cruzan capas en otros módulos |
| **Afectadas** | [DT-11](../Deudas/DT-11.md) aplazada · [DT-16](../Deudas/DT-16.md) riesgo aceptado, política implementada y apagada · [DT-20](../Deudas/DT-20.md) avance (concurrencia automatizada) · [DT-17](../Deudas/DT-17.md) horas sin envío globales · [DT-23](../Deudas/DT-23.md) completar un correo vacío por RUT · [DT-26](../Deudas/DT-26.md) se amplía a recordatorios y supresiones · [DT-29](../Deudas/DT-29.md) `POST /pacientes` sin consumidor; las rutas nuevas nacieron consumidas |

---

## Preguntas abiertas relacionadas

- [Q1](../PREGUNTAS-ABIERTAS.md#q1--el-mvp-incluye-recordatorios-automáticos) — ✅ A.
- [Q6](../PREGUNTAS-ABIERTAS.md#q6--planificador-para-el-proceso-de-cierre-dev-a--prioridad-1) — ✅ en
  cuanto al mecanismo; sus preguntas 1 y 2 siguen abiertas para la Fase 5.
- [Q11](../PREGUNTAS-ABIERTAS.md#q11--cómo-le-llega-al-paciente-el-enlace-de-su-cita) — la nota del
  2026-09-30: con recordatorios, el canal existe y la Fase 3 retoma ADR-10 con la salida B.
- [H5](../PREGUNTAS-ABIERTAS.md#h5--manejo-de-datos-de-salud) — datos de salud; DT-16 pide revisar
  también la transferencia internacional al proveedor de correo.
- **Q12 a Q15** (2026-10-04) — las [decisiones pendientes del usuario](#decisiones-pendientes-del-usuario-2026-10-04)
  que dejó la implementación. Los datos de proveedores que el diseño daba por supuestos quedaron
  verificados salvo dos ([ADR-13](../Decisions/ADR-13.md#datos-de-proveedores-lo-que-queda-por-verificar-resuelto)).

---

## Planes de US

- [US/03-recordatorios.md](../US/03-recordatorios.md) — ✅ implementada (en rama) · Definición de Terminado ✅
  salvo los dos puntos manuales ❌.

---

## Contraparte en el frontend

*(2026-10-04.)* Implementada en la rama `feature/fase2-recordatorios` de `citia-frontend`
([PR #2](https://github.com/Citia-solutions/citia-frontend/pull/2)), que sale en el **mismo release** que
el backend. Verificada solo con respuestas simuladas; falta la prueba contra el backend real.

| Pieza | Documento del frontend | Commit |
|---|---|---|
| Correo obligatorio en el modal "Nueva cita" | [crear-cita](../../../citia-frontend/context/Features/crear-cita.md) | `42976fe` |
| Pantalla `/recordatorios`: activar, 1 a 3 momentos, teléfono y correo de contacto | [recordatorios](../../../citia-frontend/context/Features/recordatorios.md) | `7417a41` |
| Estado de los recordatorios en el voucher y vista **Contacto** (`PATCH /api/pacientes/:id`) | [gestionar-cita](../../../citia-frontend/context/Features/gestionar-cita.md), [recordatorios](../../../citia-frontend/context/Features/recordatorios.md) | `2413eaf` |
| ~~Despliegue en Cloudflare Workers Static Assets (`wrangler.jsonc`)~~ → reemplazado por **Netlify** (`public/_redirects`) el 2026-10-04 | `citia-frontend/context/stack-tecnologico.md` | `f98f760` → [citia-frontend#3](https://github.com/Citia-solutions/citia-frontend/pull/3) |
| Documentación | `citia-frontend/context/` | `8dc2e9b` |

Deudas del lado del frontend: DTF-06 (límites, horas sin envío y margen copiados del backend) y DTF-07
(las horas se muestran en la zona del navegador). Sus preguntas abiertas están en
[Decisiones pendientes](#decisiones-pendientes-del-usuario-2026-10-04).

---

## Depende de / desbloquea

- **Depende de:** la [Fase 1](fase-1-us02-gestion-citas.md) (los hechos que publican cita y bandeja) y
  del dominio verificado en Resend (*2026-10-04: dominio comprado y delegado; falta verificar el subdominio
  de envío*).
- **Desbloquea:** la [Fase 3](fase-3-us04-respuesta-paciente.md) (el recordatorio lleva el enlace, bloque
  `accion` de la plantilla) · la [Fase 4](fase-4-us05-alertas.md) (las alertas son otro suscriptor del
  outbox) · la [Fase 5](fase-5-us07-scoring.md) (el job de cierre corre en este planificador).
