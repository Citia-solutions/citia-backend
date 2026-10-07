# Fase 2 — US-03: Recordatorios al paciente (RF-06)

> **Fase del roadmap** (construcción). No confundir con la
> [etapa 2 del producto](../Descripcion/fase-2-requisitos.md) (requisitos) ni con la "fase 2" interna de
> ADR-08 (subdominio) o de ADR-09 (modelo de disponibilidad). Índice: [Fases](README.md) · Estado en el
> [ROADMAP § Fase 2](../ROADMAP.md#fase-2--us-03-recordatorios-al-paciente).

| | |
|---|---|
| **Objetivo** | Que el paciente reciba un recordatorio automático por correo antes de su hora, sin que el profesional le escriba; y que el equipo se entere de un fallo antes que el cliente. |
| **Entregable** | El profesional configura sus recordatorios; el sistema los programa, los envía por correo, registra su entrega y refleja reagendar y cancelar; si algo falla, llega una alerta (ROADMAP). |
| **Estado** | ✅ **cerrada en producción (2026-10-07)** · **en el MVP** (Q1 → A). Release a `main` el 2026-10-06: backend [PR #4](https://github.com/Citia-solutions/citia-backend/pull/4) (`c057ade`) y frontend [PR #6](https://github.com/Citia-solutions/citia-frontend/pull/6); prueba de punta a punta con un correo real el 2026-10-07 ([cierre](#cierre-de-la-fase-2026-10-07)). Quedan [pendientes posteriores](#pendientes-posteriores), ninguno bloqueante. |
| **Fechas** | diseño y decisiones: 2026-09-30 · merge del diseño a `develop`: 2026-10-01 · implementación: 2026-10-01 → 2026-10-04 · merge a `develop`: 2026-10-04 · release a producción: 2026-10-06 · cierre: 2026-10-07. |
| **Historia** | US-03 — plan en [US/03-recordatorios.md](../US/03-recordatorios.md). |
| **Commits** | filas 59, 61–74 y 76–83 de [TRAZABILIDAD](../TRAZABILIDAD.md) (la 60 y la 75 son transversales): el diseño (`ab30bb7`, `2f33394`) está en `develop` desde el merge `510015a` (2026-10-01); la implementación (`daf0617` → `f2ccb01`), desde el merge del PR #1 (`060303c`, 2026-10-04); todo está en `main` —producción— desde el release `c057ade` (2026-10-06). [Cronología](#cronología-commit--documento). |
| **Feature** | [Features/us03-recordatorios.md](../Features/us03-recordatorios.md) |

---

## Cierre de la fase (2026-10-07)

La Fase 2 está **en producción** desde el release del 2026-10-06 y se dio por **cerrada** el 2026-10-07,
tras la prueba de punta a punta con un correo real. Con ella, **el MVP completo** (Fases 0, 1 y 2) está en
producción. Siguiente: la [Fase 3](fase-3-us04-respuesta-paciente.md) (US-04, respuesta del paciente).

### Qué se entregó

- **Backend** (PR #1, más PR #3 en el mismo release): outbox transaccional con despachador y planificador
  en Postgres (cierra [DT-27](../Deudas/DT-27.md)); módulo `recordatorio` completo —configuración por
  profesional, planificación pura, reconciliación por hechos y respaldo cada hora, envío por Resend con
  revalidación, políticas, cuota y fusible por tenant, webhook firmado, estado por cita—; correo del
  paciente obligatorio y `PATCH /api/pacientes/:id`; logs JSON con pino, `GET /api/health`, latidos y
  alertas por log; **validación estricta del entorno en producción** (sin defaults para la base y
  `FRONTEND_URL`, `JWT_SECRET` de 32 caracteres o más, `MENSAJERIA_ADAPTADOR` obligatoria); CORS por
  lista. En el mismo release, el login devuelve **`tenantNombre`** (`173d6b6`).
- **Frontend** (PR #2 a #5): correo obligatorio en el modal, pantalla `/recordatorios`, estado de los
  recordatorios y vista *Contacto* en el voucher, despliegue en Netlify con `public/_redirects`; la
  limpieza previa al release —**sin mock** (el dashboard muestra cuatro tarjetas con datos reales),
  sesión persistente, **Confirmar / Asistió / No asistió** en el voucher, que mitiga
  [DT-30](../Deudas/DT-30.md)—; y detalles menores —página 404, fechas pasadas, **zona horaria fija de
  Chile** (cierra DTF-07 del frontend), calendario público, Git Flow en las instrucciones—.
- **Infraestructura:** Railway con un entorno por rama (staging ← `develop`, production ← `main`), cada uno
  con su Postgres; Netlify con un sitio por entorno; DNS en Cloudflare; subdominio de envío verificado en
  Resend; monitor y heartbeats en Better Stack. Mapa completo en
  [stack § Mapa de entornos](../stack-tecnologico.md#mapa-de-entornos).

### Cómo se verificó

| Nivel | Qué | Resultado |
|---|---|---|
| Automático (2026-10-04, antes del merge) | 1274 unitarios, 212 e2e y 80 de integración; `eslint` | ✅ en verde; Definición de Terminado automática completa |
| Arranque en producción | la validación estricta del entorno acepta las variables de production; el `entrypoint.sh` aplica las migraciones sobre la base nueva | ✅ la app arranca (con una variable obligatoria mal puesta, no lo haría) |
| Observabilidad en producción | monitor de `/api/health`; heartbeats `citia-prod-recordatorios` y `citia-prod-eventos` | ✅ en **Up**, alertas por correo |
| **Punta a punta en producción** (2026-10-07) | tres citas a las 16:00 con el correo del usuario como paciente y el recordatorio configurado a **30 min** antes | ✅ ver abajo |
| No verificado | prueba de alerta forzada; cabeceras SPF, DKIM y DMARC; seguimiento de aperturas y clics apagado | ⬜ [DT-19](../Deudas/DT-19.md), [DT-41](../Deudas/DT-41.md) |

**La prueba de punta a punta.** A las 15:30 llegaron **tres correos**, uno por cita y **sin duplicados**, a
la **bandeja de entrada** (no a spam), desde `Citia <recordatorios@notificaciones.citiahealth.cl>`, con la
fecha y la hora **en hora de Chile** y **sin datos de salud**. En el voucher, los tres recordatorios
pasaron a **Entregado**. Eso confirma, en producción y de una vez:

- la planificación desde la configuración del profesional (30 min es la antelación mínima permitida) y el
  job de envío del planificador;
- un correo por recordatorio, sin duplicados (la idempotencia bajo concurrencia —clave única,
  `SKIP LOCKED`, `Idempotency-Key`— ya estaba probada en los e2e);
- la plantilla: zona de la clínica ([ADR-07](../Decisions/ADR-07.md)) y privacidad
  ([ADR-13 §12](../Decisions/ADR-13.md));
- el subdominio de envío verificado: el correo llegó a la bandeja de entrada y no a spam;
- el **webhook firmado** (Svix): solo él puede llevar un recordatorio a `entregado`.

### Incidentes de la puesta en producción

| # | Incidente | Efecto | Causa | Resolución |
|---|---|---|---|---|
| 1 | Railway desplegaba el **repo personal** | el backend publicado era un código congelado en agosto (`bfeada0`, 2026-08-16), no el de la organización | el servicio se había creado conectado a `BasthianAlejandr0/citia-backend` | se reconectó a `Citia-solutions/citia-backend`: **staging** ← `develop` y **production** ← `main`, cada uno con su Postgres y las `DB_*` como referencias (`${{Postgres.PGHOST}}`, …) |
| 2 | **`main` sin historia común** con `develop` | no se podía hacer un release `develop` → `main` | `main` solo tenía el commit inicial que crea GitHub (README) | merge con `--allow-unrelated-histories` (`f1f711f`, 2026-10-04); production arrancó con una **base nueva**. Desde ahí los releases son PR normales (PR #4) |
| 3 | **Variables copiadas de staging** | production corrió con `MENSAJERIA_ADAPTADOR=registro`: varios recordatorios quedaron **"Enviado" sin enviarse** | se importaron en bloque las variables de staging; `registro` es un valor válido y la validación lo aceptó | `MENSAJERIA_ADAPTADOR=resend`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` y `CORREO_DOMINIO` propios de production; el comportamiento de `registro` queda como [DT-40](../Deudas/DT-40.md) |
| 4 | **Netlify cruzado** | el sitio de staging compilaba contra el backend de **producción** y el de producción desplegaba **`develop`** | la configuración de los dos sitios quedó intercambiada (rama de producción y `VITE_API_URL`) | cada sitio con su rama y su `VITE_API_URL`; corregido y verificado el 2026-10-07 |

### Lecciones aprendidas

1. **Mirar qué repo y qué rama despliega cada servicio**, en el panel y no de memoria, antes del primer
   release: se daba por bueno un despliegue que llevaba semanas congelado.
2. **No copiar variables entre entornos en bloque.** Las que cambian el comportamiento
   (`MENSAJERIA_ADAPTADOR`, `FRONTEND_URL`, `CORREO_DOMINIO`, las URL de latido, `VITE_API_URL`) se revisan
   una por una. Mejor todavía: que el código rechace las combinaciones peligrosas ([DT-40](../Deudas/DT-40.md)).
3. **"Enviado" no es "llegó".** Solo *Entregado* (por el webhook) prueba la entrega; una prueba de punta a
   punta mira la bandeja del destinatario y el voucher hasta *Entregado*.
4. **Un aviso en el log no es una alerta.** El `warn` de `registro` en producción existía y nadie lo vio:
   sin la fuente de logs en Better Stack, tampoco llegan las alertas de tasa de fallo y de cuota
   ([DT-19](../Deudas/DT-19.md)).
5. **`VITE_API_URL` se incrusta al compilar:** un sitio mal configurado llama al backend equivocado sin
   ningún error visible. Tras cada cambio de configuración, comprobar en la pestaña de red a qué API llama
   cada sitio.
6. **Inicializar `main` desde `develop` el primer día** evita el merge de historias no relacionadas.
7. **Los planes gratis condicionan la operación:** con ~15 deploys al mes en Netlify, las *deploy
   previews* y los *branch deploys* quedaron apagados.

### Pendientes posteriores

Ninguno bloquea el cierre. También en el [ROADMAP](../ROADMAP.md#pendientes-posteriores-al-cierre).

| Pendiente | Por qué | Dónde |
|---|---|---|
| Que `registro` no marque "Enviado" en producción, o que la app no arranque con él sin confirmarlo | el incidente 3 se repite con solo copiar variables | [DT-40](../Deudas/DT-40.md) |
| Registro **DMARC** (TXT `_dmarc.notificaciones` = `v=DMARC1; p=none;`), revisar las cabeceras y confirmar el seguimiento apagado en Resend | autenticación del correo completa | [DT-41](../Deudas/DT-41.md) |
| **Fuente de logs** en Better Stack, alertas por log y prueba de alerta forzada | sin ella, las alertas de tasa de fallo y cuota no llegan | [DT-19](../Deudas/DT-19.md) |
| **Resend en staging** | staging corre con `registro`: no prueba el envío real ni el webhook. Opciones: otra clave con el mismo dominio (comparte la cuota, [DT-36](../Deudas/DT-36.md)) o el remitente de pruebas de Resend, que solo entrega al correo de la cuenta | Railway (staging) |
| Redirigir `citiahealth.cl` y `www` a `app.citiahealth.cl` | hoy muestran la página estacionada de Hostinger | Cloudflare |
| Confirmar **"App Sleeping" apagado** | requisito de [ADR-12 §7](../Decisions/ADR-12.md); hoy solo se infiere de los heartbeats en Up | Railway (production) |
| Confirmar el **`FRONTEND_URL` del backend de staging** | el plan preveía `staging.citiahealth.cl`; el sitio quedó en `citia-staging.netlify.app` | Railway (staging) |
| Contar los pacientes sin correo en production | los creados entre el 2026-10-04 y el 2026-10-06, si los hay, quedan `omitido` | [checklist](#checklist-de-salida-a-producción) |
| Decisiones Q12–Q15 | [abajo](#decisiones-pendientes-del-usuario-2026-10-04) | PREGUNTAS |

---

## Estado al 2026-10-04

> *Histórico: el estado antes del merge. El vigente es el [cierre](#cierre-de-la-fase-2026-10-07).*

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

> *(2026-10-07.)* Para lo que pasó después del merge —release, infraestructura, incidentes y la prueba con
> un correo real— lee primero el [cierre](#cierre-de-la-fase-2026-10-07) y
> [us03 § En producción](../Features/us03-recordatorios.md#en-producción-2026-10-07).

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

Lo que faltaba, fuera del código, para que el primer recordatorio llegara a un paciente real.
*(Estado real al 2026-10-07: ✅ hecho · 🔶 hecho sin confirmar del todo · ⬜ pendiente opcional, en
[Pendientes posteriores](#pendientes-posteriores).)*

- [x] ✅ **Dominio** `citiahealth.cl` comprado (Hostinger; registro en NIC Chile; vence el 2027-10-01) y su
      DNS **delegado a Cloudflare**.
- [x] ✅ **Subdominio de envío verificado en Resend:** `notificaciones.citiahealth.cl` (región São Paulo);
      en Cloudflare, **solo DNS**, CNAME `send` y `rsend` y el TXT de DKIM; clave de API creada.
      ⬜ **Falta DMARC** (TXT `_dmarc.notificaciones` = `v=DMARC1; p=none;`) y confirmar que el seguimiento
      de aperturas y clics está apagado → [DT-41](../Deudas/DT-41.md).
- [x] ✅ **Webhook creado** en Resend hacia `/api/webhooks/resend` del backend de production, con los eventos
      `email.*` y su secreto en `RESEND_WEBHOOK_SECRET`: el voucher llegó a *Entregado* en la prueba
      ([DT-37](../Deudas/DT-37.md), punto 1).
- [x] ✅ **Better Stack:** monitor de uptime sobre `GET /api/health`; heartbeats `citia-prod-recordatorios`
      (job de envío) y `citia-prod-eventos` (despachador `salida`) en **Up**; alertas por correo (las
      llamadas a teléfonos de Chile no están habilitadas en la cuenta). ⬜ Fuente de logs y alertas por
      consulta de logs → [DT-19](../Deudas/DT-19.md).
- [x] ✅ **Variables en Railway** (production): `NODE_ENV=production` (lo fija la imagen); `JWT_SECRET` propio
      (la validación exige 32 caracteres o más); `FRONTEND_URL=https://app.citiahealth.cl`; `MENSAJERIA_ADAPTADOR=resend`;
      `RESEND_API_KEY`; `RESEND_WEBHOOK_SECRET`; `CORREO_DOMINIO=notificaciones.citiahealth.cl`; las dos URL
      de latido; las `DB_*` como referencias al Postgres del entorno. La validación estricta del entorno las
      acepta. `CORS_ORIGENES_EXTRA` no hace falta: las vistas previas de Netlify están apagadas.
      ⬜ `BETTERSTACK_SOURCE_TOKEN` y `BETTERSTACK_INGESTING_HOST`. *(Al principio estaban copiadas de
      staging, con `registro`: [incidente 3](#incidentes-de-la-puesta-en-producción).)* Tabla completa en
      [us03 § En producción](../Features/us03-recordatorios.md#en-producción-2026-10-07).
- [ ] 🔶 **"App Sleeping" apagado** en el servicio del backend ([ADR-12 §7](../Decisions/ADR-12.md)): sin
      confirmar en el panel; los heartbeats cada minuto siguen en Up, lo que indica que el proceso no se
      duerme.
- [x] ✅ **Frontend publicado en Netlify**, un sitio por entorno: `app.citiahealth.cl` ← `main` (production)
      y `citia-staging` ← `develop` (`citia-staging.netlify.app`; el `staging.citiahealth.cl` del plan no se
      creó), con `public/_redirects` y `VITE_API_URL` apuntando al backend de su entorno. *Deploy
      previews* y *branch deploys* apagados por créditos.
- [x] ✅ **Migraciones** `1750000008000` a `1750000011000` aplicadas por el `entrypoint.sh` sobre la base nueva
      de production (la prueba de punta a punta usa las cuatro tablas).
- [ ] ⬜ **Contar los pacientes sin correo:** no se hizo. Production arrancó con una base nueva el
      2026-10-04 y corrió la Fase 1 (sin correo obligatorio) solo hasta el release del 2026-10-06, así que
      el riesgo es bajo; si en ese lapso se creó algún paciente sin correo, sus recordatorios quedan
      `omitido` (`sin_correo`) hasta completarlo con `PATCH /api/pacientes/:id`. La consulta:
      `SELECT count(*) FROM pacientes WHERE correo IS NULL OR btrim(correo) = '';`.
- [x] ✅ **Merge** de [PR #1](https://github.com/Citia-solutions/citia-backend/pull/1) y
      [PR #2](https://github.com/Citia-solutions/citia-frontend/pull/2) a `develop` (2026-10-04) y **release
      conjunto** a producción el 2026-10-06: backend [PR #4](https://github.com/Citia-solutions/citia-backend/pull/4)
      y frontend [PR #6](https://github.com/Citia-solutions/citia-frontend/pull/6).
- [x] ✅ Los **dos puntos manuales** de la Definición de Terminado, con dos salvedades anotadas: no se hizo la
      prueba de alerta forzada ([DT-19](../Deudas/DT-19.md)) y no se inspeccionaron las cabeceras SPF, DKIM
      y DMARC, que además no tiene registro ([DT-41](../Deudas/DT-41.md)). Detalle en
      [US-03](../US/03-recordatorios.md#definición-de-terminado).

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
   reconstruir. Mira la tabla de salidas A/B/C y lo que implica esperar a la Fase 3. *(2026-10-05:
   mitigada; el usuario revirtió la salida C y el voucher registra la asistencia.)*
2. **[DT-11](../Deudas/DT-11.md)** — aplazada con el scoring; mira el matiz de la **fecha de corte**
   para el `ghosting` retroactivo.
3. **[DT-16](../Deudas/DT-16.md)** — riesgo aceptado; mira los **disparadores de revisión** (Ley
   21.719, prevista para el 2026-12-01).
4. **[DT-19](../Deudas/DT-19.md)** — resuelta en diseño; la tabla de lo decidido y el criterio de cierre. *(2026-10-04: implementada; falta la prueba manual. 2026-10-07: verificada en producción; falta la fuente de logs.)*
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
[checklist](#checklist-de-salida-a-producción). 2026-10-07: todo hecho, salvo lo anotado en el checklist.)*

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
| 74 | `4967ab5` | 2026-10-04 | implementación de la Fase 2 en `context/` | **nuevos:** [us03-recordatorios](../Features/us03-recordatorios.md), DT-31 a DT-39 · notas de implementación en ADR-12 y ADR-13 · nota en ADR-02 · checklist · Q12–Q15 |
| 75 | `f1f711f` | 2026-10-04 | merge `develop` → `main` con `--allow-unrelated-histories` (transversal) | — (primer release a producción, **sin** la Fase 2; [incidente 2](#incidentes-de-la-puesta-en-producción)) |
| 76 | `060303c` | 2026-10-04 | merge PR #1 → `develop` | — (lleva 62–74 a `develop` y a staging) |
| 77 | `893c112` | 2026-10-04 | el frontend se queda en Netlify | [stack](../stack-tecnologico.md#despliegue-del-frontend-netlify), ROADMAP, esta guía, US-03 |
| 78 | `31d2c9e` | 2026-10-04 | merge PR #2 (docs Netlify) → `develop` | — |
| 79 | `173d6b6` | 2026-10-05 | `tenantNombre` en la respuesta del login | [us00b](../Features/us00b-login.md) |
| 80 | `9fdb989` | 2026-10-05 | la vista previa del backend acepta el frontend local | — (tooling) |
| 81 | `e603ed3` | 2026-10-05 | la asistencia desde el voucher mitiga DT-30 | [DT-30](../Deudas/DT-30.md), [DT-29](../Deudas/DT-29.md), Deudas/README |
| 82 | `4fc9a86` | 2026-10-05 | merge PR #3 → `develop` | — (integra 79–81) |
| 83 | `c057ade` | 2026-10-06 | merge PR #4 `develop` → `main`: **release de la Fase 2** | — (lleva 74 y 76–82 a producción) |
| — | *(esta pasada de documentación)* | 2026-10-07 | cierre de la Fase 2 en `context/` | se registra en la próxima pasada ([convención](../TRAZABILIDAD.md)) |

### PR y releases de los dos repos

| Fecha y hora | Repo | PR | Rama → destino | Qué | Merge |
|---|---|---|---|---|---|
| 2026-10-01 | backend | — | `docs/fase2-recordatorios` → `develop` | diseño de la fase | `510015a` |
| 2026-10-04 16:13 | backend | — | `develop` → `main` | primer release (Fase 1, sin la Fase 2); une las historias | `f1f711f` |
| 2026-10-04 16:15 | backend | [#1](https://github.com/Citia-solutions/citia-backend/pull/1) | `feature/fase2-recordatorios` → `develop` | **Fase 2 completa** | `060303c` |
| 2026-10-04 16:30 | frontend | [#2](https://github.com/Citia-solutions/citia-frontend/pull/2) | `feature/fase2-recordatorios` → `develop` | correo obligatorio, `/recordatorios`, estado en el voucher | `8fc0158` |
| 2026-10-04 16:40 | frontend | [#3](https://github.com/Citia-solutions/citia-frontend/pull/3) | `chore/netlify-spa` → `develop` | *fallback* de SPA para Netlify | `098afac` |
| 2026-10-04 16:40 | backend | [#2](https://github.com/Citia-solutions/citia-backend/pull/2) | `docs/frontend-netlify` → `develop` | el frontend se queda en Netlify (docs) | `31d2c9e` |
| 2026-10-05 21:04 | frontend | [#4](https://github.com/Citia-solutions/citia-frontend/pull/4) | `feature/frontend-prerelease` → `develop` | limpieza previa: sin mock, sesión persistente, asistencia en el voucher | `e40e9df` |
| 2026-10-05 21:04 | backend | [#3](https://github.com/Citia-solutions/citia-backend/pull/3) | `feature/login-tenant-nombre` → `develop` | `tenantNombre` en el login, vista previa, DT-30 mitigada | `4fc9a86` |
| 2026-10-06 17:55 | frontend | [#5](https://github.com/Citia-solutions/citia-frontend/pull/5) | `chore/frontend-detalles-menores` → `develop` | 404, fechas pasadas, zona horaria fija de Chile, calendario público, Git Flow | `b8fa400` |
| 2026-10-06 21:59 | backend | [#4](https://github.com/Citia-solutions/citia-backend/pull/4) | `develop` → `main` | **release de la Fase 2** | `c057ade` |
| 2026-10-06 21:59 | frontend | [#6](https://github.com/Citia-solutions/citia-frontend/pull/6) | `develop` → `main` | **release de la Fase 2** | `f6ba0f9` |
| 2026-10-07 | — | — | — | configuración de production, prueba de punta a punta, **cierre** | — |

---

## Decisiones

| ADR | En una línea | Estado |
|---|---|---|
| [ADR-12](../Decisions/ADR-12.md) | Outbox transaccional y planificador en proceso sobre Postgres; cierre de citas aplazado | Aceptado · **implementado y en producción** (2026-10-06) · [notas](../Decisions/ADR-12.md#notas-de-implementación-2026-10-04) |
| [ADR-13](../Decisions/ADR-13.md) | Recordatorios por correo: entidad con estado, planificación pura, Resend detrás de un puerto | Aceptado · **implementado y en producción** (2026-10-06; verificado con un correo real el 2026-10-07) · decisiones confirmadas (2026-09-30) · [notas](../Decisions/ADR-13.md#notas-de-implementación-2026-10-04) |
| [ADR-02](../Decisions/ADR-02.md) | Convenciones: español + hexagonal | Aceptado · **nota del 2026-10-04**: el check del §4 pasa a ser `src/arquitectura.spec.ts` |

Resuelve además tres de las *Decisiones previas* del ROADMAP: canal (correo), proveedor (Resend) y
planificador (Postgres, sin Redis). **Decisiones del frontend:** ninguna FD nueva; las cuatro preguntas que
dejó el frontend están en [Decisiones pendientes](#decisiones-pendientes-del-usuario-2026-10-04). **Decisiones
del usuario durante el release:** el frontend se queda en Netlify (2026-10-04, `893c112`) y el voucher
registra la asistencia (2026-10-05, revierte la salida C de [DT-30](../Deudas/DT-30.md)).

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
| **Cerradas** (2026-10-03) | [DT-27](../Deudas/DT-27.md) (`f95b637`) · [DT-21](../Deudas/DT-21.md) (`f2d80aa`, `a37f175`) |
| **Mitigada** (2026-10-05) | [DT-30](../Deudas/DT-30.md): Confirmar, Asistió y No asistió en el voucher |
| **Verificada en producción, abierta** (2026-10-07) | [DT-19](../Deudas/DT-19.md): heartbeats y monitor en Up; falta la fuente de logs y la prueba de alerta forzada |
| **Detectadas en producción** (2026-10-07) | [DT-40](../Deudas/DT-40.md) `registro` marca "Enviado" sin enviar · [DT-41](../Deudas/DT-41.md) sin DMARC, cabeceras sin inspeccionar |
| **Contraídas al implementar** (eran las previstas) | [DT-32](../Deudas/DT-32.md), [DT-33](../Deudas/DT-33.md), [DT-34](../Deudas/DT-34.md) (ADR-12) · [DT-35](../Deudas/DT-35.md), [DT-36](../Deudas/DT-36.md), [DT-37](../Deudas/DT-37.md), [DT-38](../Deudas/DT-38.md), [DT-39](../Deudas/DT-39.md) (ADR-13) |
| **Detectada** | [DT-31](../Deudas/DT-31.md) imports que cruzan capas en otros módulos |
| **Afectadas** | [DT-37](../Deudas/DT-37.md) webhook activo en producción · [DT-11](../Deudas/DT-11.md) aplazada · [DT-16](../Deudas/DT-16.md) riesgo aceptado, política implementada y apagada · [DT-20](../Deudas/DT-20.md) avance (concurrencia automatizada) · [DT-17](../Deudas/DT-17.md) horas sin envío globales · [DT-23](../Deudas/DT-23.md) completar un correo vacío por RUT · [DT-26](../Deudas/DT-26.md) se amplía a recordatorios y supresiones · [DT-29](../Deudas/DT-29.md) `POST /pacientes` sin consumidor; las rutas nuevas nacieron consumidas |

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

- [US/03-recordatorios.md](../US/03-recordatorios.md) — ✅ **cerrada en producción** (2026-10-07) · Definición
  de Terminado ✅ completa, con dos salvedades anotadas en los puntos manuales (alerta forzada y cabeceras).

---

## Contraparte en el frontend

*(2026-10-04; actualizado el 2026-10-07.)* Mergeada en `develop` con
[citia-frontend#2](https://github.com/Citia-solutions/citia-frontend/pull/2) (2026-10-04) y en producción con
el release [citia-frontend#6](https://github.com/Citia-solutions/citia-frontend/pull/6) (2026-10-06), el mismo
día que el backend. **Probada contra el backend real en producción** el 2026-10-07. Desde
`app.citiahealth.cl` (production) y `citia-staging.netlify.app` (staging).

| Pieza | Documento del frontend | Commit |
|---|---|---|
| Correo obligatorio en el modal "Nueva cita" | [crear-cita](../../../citia-frontend/context/Features/crear-cita.md) | `42976fe` |
| Pantalla `/recordatorios`: activar, 1 a 3 momentos, teléfono y correo de contacto | [recordatorios](../../../citia-frontend/context/Features/recordatorios.md) | `7417a41` |
| Estado de los recordatorios en el voucher y vista **Contacto** (`PATCH /api/pacientes/:id`) | [gestionar-cita](../../../citia-frontend/context/Features/gestionar-cita.md), [recordatorios](../../../citia-frontend/context/Features/recordatorios.md) | `2413eaf` |
| ~~Despliegue en Cloudflare Workers Static Assets (`wrangler.jsonc`)~~ → reemplazado por **Netlify** (`public/_redirects`) el 2026-10-04 | `citia-frontend/context/stack-tecnologico.md` | `f98f760` → [citia-frontend#3](https://github.com/Citia-solutions/citia-frontend/pull/3) |
| Documentación | `citia-frontend/context/` | `8dc2e9b` |
| Limpieza previa al release ([PR #4](https://github.com/Citia-solutions/citia-frontend/pull/4)): sesión persistente y cerrar sesión, dashboard **sin mock** (cuatro tarjetas reales), Confirmar / Asistió / No asistió en el voucher (asistencia bloqueada antes de la hora) | [dashboard-citas-del-dia](../../../citia-frontend/context/Features/dashboard-citas-del-dia.md), [login-sesion](../../../citia-frontend/context/Features/login-sesion.md), [gestionar-cita](../../../citia-frontend/context/Features/gestionar-cita.md) | `a39dbdc`, `559f7c5`, `0165a4b` |
| Detalles menores ([PR #5](https://github.com/Citia-solutions/citia-frontend/pull/5)): 404, fechas pasadas, modal, **zona horaria fija de Chile**, calendario público; Git Flow en las instrucciones | `citia-frontend/context/Deudas/` (DTF-07 cerrada) | `264a544`, `1d8e5f8` |

Deudas del lado del frontend: DTF-06 (límites, horas sin envío y margen copiados del backend) y DTF-07
(las horas se muestran en la zona del navegador; **cerrada el 2026-10-06**: zona fija de Chile). Sus preguntas abiertas están en
[Decisiones pendientes](#decisiones-pendientes-del-usuario-2026-10-04).

---

## Depende de / desbloquea

- **Depende de:** la [Fase 1](fase-1-us02-gestion-citas.md) (los hechos que publican cita y bandeja) y
  del dominio verificado en Resend (*2026-10-07: ✅ `notificaciones.citiahealth.cl` verificado*).
- **Desbloquea:** la [Fase 3](fase-3-us04-respuesta-paciente.md) (el recordatorio lleva el enlace, bloque
  `accion` de la plantilla) · la [Fase 4](fase-4-us05-alertas.md) (las alertas son otro suscriptor del
  outbox) · la [Fase 5](fase-5-us07-scoring.md) (el job de cierre corre en este planificador).
