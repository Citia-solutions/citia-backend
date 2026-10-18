# Fase 3 — US-04: Respuesta del paciente (RF-07, + US-02.07)

> **Fase del roadmap** (construcción). No confundir con la
> [etapa 3 del producto](../Descripcion/fase-3-mvp.md) (el MVP, que termina en la Fase 2). Índice:
> [Fases](README.md) · Estado en el [ROADMAP § Fase 3](../ROADMAP.md#fase-3--us-04-respuesta-del-paciente).

| | |
|---|---|
| **Objetivo** | Que el paciente confirme, cancele o pida otra hora desde el enlace que le llega en el recordatorio, sin cuenta; y que el profesional lo vea en el voucher y en la bandeja. |
| **Entregable** | El paciente confirma o cancela desde el correo; agenda y alertas se actualizan (ROADMAP). Las alertas son de la Fase 4 ([DT-43](../Deudas/DT-43.md)). |
| **Estado** | ✅ **en producción (2026-10-17)** · **cierre pendiente** de las pruebas manuales (correo real y escáneres) y de la de `trust proxy` · fuera del MVP. Backend y frontend construidos contra el plan [US-04](../US/04-respuesta-paciente.md) ([ADR-10](../Decisions/ADR-10.md) aceptado el 2026-10-14, [Q11](../PREGUNTAS-ABIERTAS.md#q11--cómo-le-llega-al-paciente-el-enlace-de-su-cita) = B); 1709 unitarios, 287 e2e y 139 de integración en verde; mergeados a `develop` el 2026-10-15 (backend [PR #6](https://github.com/Citia-solutions/citia-backend/pull/6), frontend [PR #7](https://github.com/Citia-solutions/citia-frontend/pull/7)) y llevados a `main` el 2026-10-17 (backend [PR #7](https://github.com/Citia-solutions/citia-backend/pull/7), frontend [PR #8](https://github.com/Citia-solutions/citia-frontend/pull/8)). El release tuvo un **corte de ~9 minutos** ([abajo](#release-a-producción-2026-10-17)). |
| **Fechas** | FD-06 2026-09-10 · ADR-10 propuesto 2026-09-23 y aplazado 2026-09-25 (Q11 → C) · reabrible desde el 2026-09-30 (el canal existe con la Fase 2) · **diseño aprobado y ADR-10 aceptado 2026-10-14** · implementación 2026-10-14 → 2026-10-15 · verificada en local, commits y merge a `develop` 2026-10-15 · **release a producción 2026-10-17** (de madrugada, hora de Chile). |
| **Historias** | US-04, con plan propio en [US/04-respuesta-paciente.md](../US/04-respuesta-paciente.md), que **absorbe** la subtarea [US-02.07](../US/02.07-paciente-reagenda-cancela.md) (su análisis se conserva). |
| **Commits** | filas 85–92, 94 y 95 de la [TRAZABILIDAD](../TRAZABILIDAD.md): ocho commits, `c757e0e` → `b93f2c0`, el merge `ce0c533` (PR #6) a `develop` y el release `05bae58` (PR #7) a `main`. En el frontend, los merges `e8ce193` (PR #7, a `develop`) y `1a7f324` (PR #8, a `main`). Antes, ADR-10 y US-02.07 entraron con `2877b13` (fila 41, Fase 1) y FD-06 con `16b50e1` (fila 38). |
| **Feature** | [Features/us04-respuesta-paciente.md](../Features/us04-respuesta-paciente.md) (nueva, 2026-10-15) |

---

## Release a producción (2026-10-17)

La Fase 3 está **en producción** desde la madrugada del 2026-10-17. Todo recordatorio que sale desde
entonces lleva el botón *Ver o responder mi hora*. Queda abierta hasta las pruebas manuales de la
[Definición de Terminado](../US/04-respuesta-paciente.md#definición-de-terminado) (correo real y
escáneres), como la Fase 2 se cerró con su prueba de punta a punta.

### Cómo salió

| Hora (UTC) | Hora (Chile) | Qué |
|---|---|---|
| 03:12 | 00:12 | merge del backend [PR #7](https://github.com/Citia-solutions/citia-backend/pull/7) a `main` (`05bae58`); Railway despliega production |
| ~03:13 | ~00:13 | Railway marca el despliegue como exitoso, pero la app no responde: **502** *"Application failed to respond"* |
| 03:13 → 03:22 | 00:13 → 00:22 | el contenedor se reinicia en bucle: el `entrypoint.sh` aplica las migraciones y la validación del entorno detiene la app con `ENLACE_CITA_CLAVE: es obligatoria en producción` |
| 03:22 | 00:22 | con la variable aplicada en Railway, production vuelve: `/api/health` ok y el portal responde |
| 03:24 | 00:24 | merge del frontend [PR #8](https://github.com/Citia-solutions/citia-frontend/pull/8) a `main` (`1a7f324`), **después** de verificar el backend |
| 03:27 | 00:27 | Netlify publica `app.citiahealth.cl` con `/cita` |

### Cómo se verificó

| Nivel | Qué | Resultado |
|---|---|---|
| Código de `develop` (2026-10-17, antes del release) | `npm run build`, `eslint` y 1709 unitarios | ✅ en verde; los e2e no se repitieron (sin Postgres local) y estaban en verde desde el 2026-10-15 sobre el mismo código |
| Staging (desde `develop`) | el backend arranca con la Fase 3; `GET /api/publico/cita` responde el 404 uniforme; el preflight CORS permite `x-enlace-cita`; Netlify aplica `_headers` a `/cita` | ✅ (comprobado con `curl`) |
| Production, backend | `/api/health` ok; el portal responde el 404 uniforme con `Cache-Control: no-store` y `Referrer-Policy: no-referrer`; el preflight desde `https://app.citiahealth.cl` permite `x-enlace-cita`; migraciones `1750000012000` a `1750000014000` aplicadas (log del `entrypoint.sh`) | ✅ |
| Production, frontend | `curl -I https://app.citiahealth.cl/cita` → 200 con `Referrer-Policy: no-referrer` y `X-Robots-Tag: noindex, nofollow`; el sitio llama al backend de production | ✅ |
| No verificado | correo real con el botón; escáneres de Gmail y Outlook; `trust proxy` con dos redes | ⬜ [checklist](#checklist-de-salida-a-producción) |

### Incidente: production caído ~9 minutos

| Efecto | Causa | Resolución |
|---|---|---|
| `https://citia-backend-production.up.railway.app` respondió **502** de 00:13 a 00:22 (hora de Chile); la app de `app.citiahealth.cl` quedó sin backend | `ENLACE_CITA_CLAVE` **no le llegaba al contenedor** de production, aunque se había dado por cargada: la validación estricta del entorno detuvo el arranque, como está diseñada para hacerlo | se aplicó la variable en Railway (servicio `citia-backend`, entorno `production`); el contenedor siguiente arrancó. **Sin pérdida de datos**: las migraciones corrieron antes del fallo y el esquema nuevo es compatible con el código anterior |

### Lecciones aprendidas

1. **Una variable se confirma en los *Deploy Logs*, no en el panel de variables.** Railway puede mostrarla
   en otro entorno o como cambio pendiente sin aplicar; lo que vale es lo que el contenedor recibe.
2. **"Desplegado" no es "arrancó".** Railway dio el despliegue por exitoso con la app caída: después de cada
   release, mirar `/api/health` y una ruta nueva, no el estado del despliegue. Que un despliegue que no
   responde a `/api/health` no reemplace al anterior depende de la configuración del servicio en Railway
   (*healthcheck*); queda por revisar.
3. **El `entrypoint.sh` migra antes de validar el entorno.** Un arranque fallido por configuración igual
   deja el esquema nuevo aplicado; hoy es inocuo porque las migraciones son aditivas, pero conviene tenerlo
   presente antes de una migración destructiva.
4. **El orden backend → frontend protegió a los usuarios:** con el backend caído, el frontend seguía en la
   versión anterior y no apuntaba a rutas que todavía no existían.

---

## Estado al 2026-10-15: en `develop`, pendiente de release

- **Construido, en verde y mergeado a `develop`** el 2026-10-15 (backend PR #6, frontend PR #7): el
  enlace por cita (HMAC recalculable, uno por cita, nace con el primer recordatorio, invalidable desde el
  voucher, autocorrección si cambia la clave); el refactor del actor (bitácora y hechos con `actor`,
  `confirmadaPor` / `canceladaPor` en el voucher); el botón del recordatorio; pedir otra hora como solicitud
  de `reagendamiento` en la bandeja, que al aceptarse mueve la misma cita; el suscriptor que descarta la
  petición cuando la cita termina y la deja atendida si el profesional reagenda; el módulo nuevo
  `portal-paciente`; y el **límite de tasa** en el enlace, el login, el registro y la solicitud pública
  ([DT-18](../Deudas/DT-18.md)). En el frontend: la página `/cita`, el voucher, la bandeja y `_headers` de
  Netlify.
- **Pruebas:** **1709** unitarios (95 suites), **287** e2e (15 suites) y **139** de integración (8 suites) en
  verde; cobertura global 84 % de líneas, ≈ 100 % en lo nuevo del portal, el enlace, el suscriptor y pedir
  otra hora.
- **Verificación real en local** (backend + frontend + Postgres): abrir el enlace, confirmar (bitácora con
  actor `paciente` = id del enlace), pedir otra hora → bandeja → aceptar mueve la **misma** cita y el
  **mismo** enlace sirve para la hora nueva, recordatorios reprogramados, cancelar → `canceladaPor =
  paciente` y el enlace da 404, invalidar → 204 y el enlace da 404. Encontró un bug del frontend, ya
  corregido (la página no releía el token si cambiaba solo el fragmento en la misma pestaña).
- **Desviaciones del contrato:** veinte, ninguna rediseña; las que pesan son el bloqueo
  `FOR NO KEY UPDATE`, la autocorrección de la clave ([DT-45](../Deudas/DT-45.md)) y el suscriptor que
  atiende la petición al reagendar desde el voucher ([DT-44](../Deudas/DT-44.md), parte 2). Tabla completa en
  [us04 § Desviaciones](../Features/us04-respuesta-paciente.md#desviaciones-del-contrato-y-decisiones-tomadas-al-implementar).
- **Falta:** `ENLACE_CITA_CLAVE` en cada entorno de Railway, el release a `main` y lo que solo se prueba
  fuera de local —el correo real con el botón, los escáneres de enlaces de Gmail y Outlook, la IP real detrás
  del proxy de Railway y las cabeceras de Netlify— en el [checklist de salida](#checklist-de-salida-a-producción).

> *Antes (2026-10-15, en la mañana):* implementada y verificada en local en la rama
> `feature/fase3-respuesta-paciente` de cada repo, sin commits.

---

## Guía de lectura de la implementación (2026-10-15)

1. **[Features/us04-respuesta-paciente.md](../Features/us04-respuesta-paciente.md)** — lo que existe:
   módulos y dependencias, orden de bloqueo, flujo de punta a punta, rutas con su contrato exacto, tablas,
   hechos y suscriptor, seguridad, límite de tasa, configuración, tests y la tabla de desviaciones del
   contrato.
2. **[ADR-10 § Notas de implementación](../Decisions/ADR-10.md#notas-de-implementación-2026-10-15)** — dónde
   se apartó el código de la decisión y por qué.
3. **[US-04 § Definición de Terminado](../US/04-respuesta-paciente.md#definición-de-terminado)** — cada punto
   con su archivo de test; los dos manuales, pendientes.
4. **Deudas que cambiaron:** [DT-18](../Deudas/DT-18.md) (implementada; en producción desde el 2026-10-17, se
   cierra con la prueba de `trust proxy`),
   [DT-44](../Deudas/DT-44.md) (parte 2 resuelta por el suscriptor), [DT-45](../Deudas/DT-45.md) (corrección
   implementada) y la nueva [DT-46](../Deudas/DT-46.md).
5. Los `CLAUDE.md` de `src/modules/portal-paciente/`, `cita/`, `solicitud/` y `recordatorio/` — reglas locales
   para los agentes.
6. Frontend: [responder-cita-paciente](../../../citia-frontend/context/Features/responder-cita-paciente.md).

---

## Checklist de salida a producción

Lo que falta, fuera del código, para que el primer enlace llegue a un paciente real. *(Estado al
2026-10-17, tras el release: ✅ lo comprobado; ⬜ lo que queda, sobre todo las pruebas manuales y la de
`trust proxy`.)* Las lecciones de la [Fase 2](fase-2-us03-recordatorios.md#lecciones-aprendidas) aplican:
mirar el panel y no la memoria, y **no copiar variables entre entornos**; y las del
[release de esta fase](#lecciones-aprendidas), mirar los *Deploy Logs*.

**Antes del merge a `develop` (staging)**

- [x] ✅ **Commits y PR** en los dos repos (Conventional Commits, `npm run lint` y las tres suites en verde)
      y su registro en [TRAZABILIDAD](../TRAZABILIDAD.md). *(2026-10-15: backend
      [PR #6](https://github.com/Citia-solutions/citia-backend/pull/6), merge `ce0c533`, filas 85–92 y 94;
      frontend [PR #7](https://github.com/Citia-solutions/citia-frontend/pull/7), merge `e8ce193`.)*
- [x] ✅ **`ENLACE_CITA_CLAVE` en Railway, entorno `staging`**: generada para ese entorno, de 32 caracteres o
      más y distinta de `JWT_SECRET`. *(2026-10-17: staging arranca con la Fase 3, así que la tiene.)* La imagen fija `NODE_ENV=production`
      también en staging y, **sin ella, el servicio no arranca** (la validación del entorno la exige). Ojo:
      `entrypoint.sh` corre las migraciones **antes** de arrancar la app, así que un arranque fallido por la
      clave ya dejó aplicadas las migraciones (el esquema nuevo es compatible con el código anterior).
- [ ] 🔶 **`LIMITE_TASA_ACTIVO`** sin definir (o `true`) en staging y en production. *(2026-10-17: confirmado
      en production por el usuario; staging sin revisar.)*
- [ ] ⬜ **`FRONTEND_URL` de staging** = `https://citia-staging.netlify.app`: desde esta fase es además la
      **base del enlace** del correo (era un pendiente de la Fase 2).

**En staging, después del merge**

- [x] ✅ **Migraciones `1750000012000` a `1750000014000`** aplicadas por `entrypoint.sh` (log
      `[entrypoint] Migraciones aplicadas`; las tres corren en una sola transacción). *(2026-10-17: la app de
      staging arranca con el código que las usa.)*
- [ ] ⬜ **`trust proxy` entrega la IP real.** Seis logins seguidos desde un equipo → el sexto recibe 429;
      enseguida, un login desde **otra red** (p. ej. el teléfono con datos móviles) **no** recibe 429. Si la
      otra red también recibe 429, todos los clientes comparten la IP del proxy: Railway pone más de un salto
      y hay que revisar `trust proxy`. *(2026-10-17: no se hizo antes del release; ahora se hace en
      production, con el mismo procedimiento.)*
- [x] ✅ **Netlify aplica `public/_headers` a `/cita`:** `curl -I https://citia-staging.netlify.app/cita`
      muestra `Referrer-Policy: no-referrer` y `X-Robots-Tag: noindex, nofollow`. *(2026-10-17.)*
- [x] ✅ **CORS:** la página `/cita` del sitio de staging llama a la API con `X-Enlace-Cita` sin error de
      CORS en la consola (el preflight la permite). *(2026-10-17: preflight comprobado con `curl` desde el
      origen de staging; la consola del navegador no se revisó.)*

**Correo real y escáneres** (los dos puntos *manuales* de la [Definición de Terminado](../US/04-respuesta-paciente.md#definición-de-terminado))

Staging corre con `MENSAJERIA_ADAPTADOR=registro`: emite el enlace pero no envía el correo, y el token no
queda en ningún log. Para esta prueba hace falta **Resend en staging** (pendiente desde la Fase 2; comparte la
cuota, [DT-36](../Deudas/DT-36.md)) o hacerla **en production** justo después del release, con una cita de
prueba y el correo del usuario como paciente, como la prueba de la Fase 2.

- [ ] ⬜ **Correo real:** llega con el botón *Ver o responder mi hora*; el enlace abre `/cita` con la hora de
      Chile; confirmar se refleja en el voucher (*"Confirmada por el paciente"*).
- [ ] ⬜ **Escáneres de enlaces:** enviado a una casilla de **Gmail** y a una de **Outlook**, la cita sigue
      `pendiente` después de la entrega (abrir la página no ejecuta nada).

**Release a production**

- [x] ✅ **`ENLACE_CITA_CLAVE` en Railway, entorno `production`:** propia, **distinta de la de staging** y de
      `JWT_SECRET`, 32 caracteres o más; **no copiarla entre entornos** ([DT-40](../Deudas/DT-40.md) fue
      eso). Sin ella el servicio no arranca. Una vez en uso, no rotarla sin leer [DT-45](../Deudas/DT-45.md).
      *(2026-10-17: no le llegaba al contenedor en el primer despliegue y production cayó ~9 minutos; ver el
      [incidente](#incidente-production-caído-9-minutos).)*
- [x] ✅ **Release** `develop` → `main` en los dos repos, el backend **antes o a la vez** que el frontend: el
      backend nuevo es compatible con el frontend actual; al revés, la página `/cita` y el botón de invalidar
      responderían 404. *(2026-10-17: backend `05bae58`, frontend `1a7f324`, en ese orden.)*
- [x] ✅ **Migraciones `1750000012000` a `1750000014000`** aplicadas en production. *(2026-10-17, log del
      `entrypoint.sh`.)*
- [x] ✅ **Una sola réplica** del backend en Railway: el límite de tasa cuenta en memoria, por proceso.
      *(2026-10-17, confirmado por el usuario.)*
- [x] ✅ **`curl -I https://app.citiahealth.cl/cita`** con las cabeceras de `_headers`. *(2026-10-17.)*
- [x] ✅ **Fecha de corte de [DT-11](../Deudas/DT-11.md) = el día del despliegue a production.** Escribirla ese
      día en DT-11 (regla G1): el futuro job de `ghosting` solo cuenta citas cuyo recordatorio con enlace
      salió después. *(**2026-10-17**, desde las 03:22 UTC; escrita en
      [DT-11](../Deudas/DT-11.md#regla-del-ghosting-g1-2026-10-14).)*
- [ ] 🔶 **Tras el release:** ~~[DT-42](../Deudas/DT-42.md) a [DT-45](../Deudas/DT-45.md) de `prevista` a
      `abierta`~~ ✅ (2026-10-17); [DT-18](../Deudas/DT-18.md) cerrada ⬜ (en producción; falta la prueba de
      `trust proxy`); en el frontend, `ENLACE_PUBLICO_LISTO = true` ⬜ (la advertencia de "Copiar enlace de
      agenda" ya no hace falta, DT-18).
- [ ] ⬜ **Observar el límite del login** las primeras semanas: 5 por minuto por IP lo comparten las personas
      de una misma clínica detrás de una sola IP pública.

> Desde el despliegue, **todo recordatorio que salga** lleva el botón, también los de citas creadas antes (el
> enlace nace al enviar). Los correos ya enviados antes del release no lo tienen.

---

## Orden de lectura del diseño (2026-10-14)

> *(2026-10-15.)* Para lo implementado, empieza por la [guía de lectura de la
> implementación](#guía-de-lectura-de-la-implementación-2026-10-15).

1. **[US-04](../US/04-respuesta-paciente.md)** — el plan vigente y el **contrato** de implementación:
   decisiones S/E/R/G/L, modelo de datos, módulos, rutas, orden por agente y Definición de Terminado.
2. **[ADR-10](../Decisions/ADR-10.md)** — la decisión aceptada y su porqué. Mira §1 (el enlace: HMAC
   recalculable, uno por cita, validez hasta `inicio`), §4 (pedir otra hora en la bandeja y por qué no en el
   dashboard), §5 (nada después de `inicio` y la regla de `ghosting` G1), §8 (`portal-paciente`), §10
   (límite de tasa) y [Qué cambió respecto de la propuesta](../Decisions/ADR-10.md#qué-cambió-respecto-de-la-propuesta-2026-09-23).
3. **[US-02.07](../US/02.07-paciente-reagenda-cancela.md)** — el análisis original (§1–§9) del que salió
   ADR-10, con la tabla de lo que se mantuvo y lo que cambió.
4. **[ADR-13 §1 y §12](../Decisions/ADR-13.md)** — el módulo de recordatorios, que ahora pide el enlace al
   módulo `cita`, y el bloque `accion` de la plantilla con el botón fijo.
5. **[DT-11](../Deudas/DT-11.md#regla-del-ghosting-g1-2026-10-14)** — la regla de `ghosting` G1 y la fecha
   de corte (el despliegue de esta fase).
6. **[FD-06](../Frontend-Decisions/FD-06.md)** — lo que el front propuso; la v1 resuelve "cambiar la hora"
   como una petición manual.
7. **Deudas nuevas:** [DT-42](../Deudas/DT-42.md) a [DT-45](../Deudas/DT-45.md); y la que se implementa,
   [DT-18](../Deudas/DT-18.md).

---

## Qué hay diseñado (y qué no)

> *(2026-10-15.)* Todo lo de esta sección está **implementado** y verificado en local; las diferencias con el
> diseño, en [us04 § Desviaciones](../Features/us04-respuesta-paciente.md#desviaciones-del-contrato-y-decisiones-tomadas-al-implementar).

**Aceptado el 2026-10-14** ([ADR-10](../Decisions/ADR-10.md), contrato en [US-04](../US/04-respuesta-paciente.md)):

- **El enlace:** uno por cita, el mismo en todos sus recordatorios; token **recalculable con HMAC**
  (`ENLACE_CITA_CLAVE`), en la base solo su SHA-256; nace al enviar el primer recordatorio; vale mientras la
  cita esté vigente y antes de su `inicio`; el profesional lo puede **invalidar** desde el voucher.
- **El transporte:** fragmento `#` y cabecera `X-Enlace-Cita`; `no-store` y `no-referrer`; sin scripts de
  terceros; **abrir la página nunca ejecuta una acción**.
- **Las acciones:** **confirmar** y **cancelar** con las transiciones existentes; **pedir otra hora** como
  una `SolicitudCita` de tipo `reagendamiento` en la bandeja, que al aceptarse mueve la misma cita. Nada
  en el dashboard.
- **El correo:** un solo botón fijo, *Ver o responder mi hora*.
- **Módulos:** `portal-paciente` (nuevo, composición) importa `cita` y `solicitud`; `recordatorio` importa
  `cita`; `cita` no importa ninguno de los tres. La petición abierta se descarta por un suscriptor del
  outbox.
- **Límite de tasa** en el enlace, el login, el registro y la solicitud pública ([DT-18](../Deudas/DT-18.md)).
- **Regla de `ghosting` G1** (se documenta; el job no se construye).

**Resuelto al aprobar el diseño** (antes "por decidir al retomar la fase"):

- ~~aceptar ADR-10 con los requisitos de seguridad y reabrir Q11 con la salida B~~ → **hecho el
  2026-10-14**: Q11 = B; requisitos S1–S3 y límite de tasa.
- ~~**confirmar desde el enlace**~~ → **entra**, con la regla G1 que fija la semántica del `ghosting`.
- ~~los botones de asistencia del voucher~~ → ya estaban desde el 2026-10-05 ([DT-30](../Deudas/DT-30.md)
  mitigada).

> **El choque FD-06 frente a ADR-10, resuelto para la v1.** FD-06 decía que reagendar "siempre necesita
> una página, porque hay que mostrarle horarios disponibles para elegir". El sistema no tiene modelo de
> disponibilidad (ADR-09 §2). La v1 resuelve **"cambiar la hora" como una petición manual**: el paciente
> escribe su preferencia y el profesional fija la hora al aceptarla en la bandeja. **Que el paciente elija
> entre horarios disponibles queda para después** (necesita el modelo de disponibilidad, Q9).

---

## Cronología: commit → documento

| Fila | Commit | Fecha | Qué | Documento |
|---|---|---|---|---|
| 38 | `16b50e1` | 2026-09-10 | FD-06 propuesta | [FD-06](../Frontend-Decisions/FD-06.md) |
| 41 | `2877b13` | 2026-09-25 | ADR-10 propuesto y plan de US-02.07 | [ADR-10](../Decisions/ADR-10.md) · [US-02.07](../US/02.07-paciente-reagenda-cancela.md) |
| 54 | `4c543a5` | 2026-09-28 | US-02.07 aplazada fuera de la v1 (Q11 → C) | ADR-10 · US-02.07 · PREGUNTAS |
| 59 | `ab30bb7` | 2026-09-30 | ADR-13 prepara el bloque `accion`; DT-30 espera a esta fase | [ADR-13](../Decisions/ADR-13.md) · [DT-30](../Deudas/DT-30.md) |
| 85 | `c757e0e` | 2026-10-15 | Límite de tasa, `trust proxy`, `ENLACE_CITA_CLAVE`, CORS con `X-Enlace-Cita`, redacción en logs, `no-store` / `no-referrer` | [us04 § Límite de tasa](../Features/us04-respuesta-paciente.md#límite-de-tasa) · [DT-18](../Deudas/DT-18.md) · [infra](../Features/infra-contenedores.md) |
| 86 | `6fbf4e3` | 2026-10-15 | Tabla `enlaces_cita` y solicitudes de reagendamiento (migraciones `1750000012000` a `1750000014000`) | [us04 § Esquema de BD](../Features/us04-respuesta-paciente.md#esquema-de-bd) · [DT-46](../Deudas/DT-46.md) (nueva) |
| 87 | `4d3d88f` | 2026-10-15 | Enlace por cita con HMAC, invalidación desde el voucher y actor en la bitácora | [us04](../Features/us04-respuesta-paciente.md) · [ADR-10 § Notas de implementación](../Decisions/ADR-10.md#notas-de-implementación-2026-10-15) · [DT-45](../Deudas/DT-45.md) · `CLAUDE.md` de `cita` |
| 88 | `5f8ac6d` | 2026-10-15 | El recordatorio lleva el enlace (botón fijo) | [us04](../Features/us04-respuesta-paciente.md) · [ADR-13](../Decisions/ADR-13.md) §1, §12 · `CLAUDE.md` de `recordatorio` |
| 89 | `92b8020` | 2026-10-15 | Pedir otra hora como solicitud de reagendamiento; suscriptor que la descarta o la atiende | [us04 § Hechos y suscriptor](../Features/us04-respuesta-paciente.md#hechos-y-suscriptor) · [DT-44](../Deudas/DT-44.md) (parte 2 resuelta) · `CLAUDE.md` de `solicitud` |
| 90 | `143c8fb` | 2026-10-15 | Módulo `portal-paciente`: `GET /api/publico/cita` y las tres acciones | [us04 § Endpoints](../Features/us04-respuesta-paciente.md#endpoints) · `CLAUDE.md` de `portal-paciente` |
| 91 | `3b312f9` | 2026-10-15 | e2e de la Definición de Terminado | [US-04 § Definición de Terminado](../US/04-respuesta-paciente.md#definición-de-terminado) · [us04 § Tests](../Features/us04-respuesta-paciente.md#tests-y-verificación) |
| 92 | `b93f2c0` | 2026-10-15 | Diseño aprobado el 2026-10-14 (ADR-10 aceptado, plan de US-04, DT-42 a DT-45, regla G1, Q11 = B) e implementación documentada | [ADR-10](../Decisions/ADR-10.md) · [US-04](../US/04-respuesta-paciente.md) · [us04](../Features/us04-respuesta-paciente.md) (nueva) · [DT-11](../Deudas/DT-11.md) · [DT-18](../Deudas/DT-18.md) · [DT-42](../Deudas/DT-42.md)…[DT-46](../Deudas/DT-46.md) · PREGUNTAS |
| 94 | `ce0c533` | 2026-10-15 | Merge del PR #6 a `develop` (frontend: PR #7, `e8ce193`) | — (se despliega en staging) |
| 95 | `05bae58` | 2026-10-17 | **Release a producción** (PR #7 a `main`; frontend: PR #8, `1a7f324`) | [§ Release a producción](#release-a-producción-2026-10-17) |

---

## Decisiones

| Documento | En una línea | Estado |
|---|---|---|
| [ADR-10](../Decisions/ADR-10.md) | Enlace por cita: confirma y cancela con las transiciones existentes; pide otra hora como solicitud en la bandeja | ✅ **Aceptado (2026-10-14)** · **implementado y en producción (2026-10-17)** · [notas de implementación](../Decisions/ADR-10.md#notas-de-implementación-2026-10-15) |
| [ADR-13](../Decisions/ADR-13.md) §1, §12 | El recordatorio pide el enlace al módulo `cita` y lo pone en el bloque `accion`, con un botón fijo | Aceptado (Fase 2) · nota del 2026-10-14 |
| [ADR-04](../Decisions/ADR-04.md) §4 | Regla de `ghosting` G1 (nota) | Aceptado · nota del 2026-10-14 |
| [ADR-12](../Decisions/ADR-12.md) §4, §8 | Suscriptor nuevo de solicitudes; G1 responde la pregunta 1 de Q6 | Aceptado · nota del 2026-10-14 |
| [FD-06](../Frontend-Decisions/FD-06.md) | Confirmar, cancelar o cambiar la hora desde el correo, en una sola página | Propuesta · **resuelta en parte** (2026-10-14): "cambiar la hora" es una petición manual en la v1 |

**No depende de ADR-08:** el enlace no lleva `tenantSlug` (ADR-10, *Relación*).

---

## Features

| Feature | Qué |
|---|---|
| **[us04-respuesta-paciente](../Features/us04-respuesta-paciente.md)** (nueva, 2026-10-15) | el enlace del paciente, la página pública, pedir otra hora en la bandeja, el suscriptor y el límite de tasa; incluye lo que la fase cambió en features existentes (actor en los hechos de cita y `confirmadaPor` / `canceladaPor` del voucher —[us02](../Features/us02-gestion-citas.md)—, límite del login y del registro —[us00b](../Features/us00b-login.md), [us00a](../Features/us00a-registro-inicial.md)—) |

Creada en el paso 8 del [orden de construcción](../US/04-respuesta-paciente.md#orden-de-construcción), antes
del release: describe lo implementado, en producción desde el 2026-10-17.

---

## Deudas

| Deuda | Por qué pesa en esta fase |
|---|---|
| [DT-18](../Deudas/DT-18.md) | **implementada en esta fase** (2026-10-15) y **en producción** desde el 2026-10-17: límite de tasa en el enlace, el login, el registro y la solicitud pública; **se cierra** al comprobar `trust proxy` en production. Lo que queda abierto vive en DT-04, DT-06 y en la nota de una sola réplica |
| [DT-42](../Deudas/DT-42.md) | **nueva, abierta** desde el despliegue (2026-10-17): el enlace no verifica identidad; reenviado, transfiere la capacidad |
| [DT-43](../Deudas/DT-43.md) | **nueva, abierta** desde el despliegue (2026-10-17): el profesional no se entera en el momento de lo que hace el paciente (Fase 4) |
| [DT-44](../Deudas/DT-44.md) | **nueva, abierta** desde el despliegue (2026-10-17), solo con su parte 1: rechazar la petición de otra hora no avisa al paciente. Su **parte 2** (reagendar desde el voucher no cerraba la petición) **quedó resuelta** al implementar: el suscriptor la deja atendida |
| [DT-45](../Deudas/DT-45.md) | **nueva, abierta** desde el despliegue (2026-10-17), **con su corrección en el código:** si cambia `ENLACE_CITA_CLAVE`, `asegurarActivo` revoca el enlace viejo y emite la versión siguiente (autocorrección + test) |
| [DT-46](../Deudas/DT-46.md) | **nueva (detectada al implementar, 2026-10-15):** columnas de fecha de varias entidades ORM sin `timestamptz`; solo afecta a los tests con `synchronize` |
| [DT-11](../Deudas/DT-11.md) | la regla de `ghosting` G1 queda escrita; la fecha de corte es el despliegue de esta fase: **2026-10-17** |
| [DT-16](../Deudas/DT-16.md) | con la salida B escribe Citia; **sigue como deuda** por decisión del arquitecto (no se consulta el consentimiento antes de enviar) |
| [DT-30](../Deudas/DT-30.md) | ~~**se reabre al empezar la fase**~~ **mitigada el 2026-10-05**; la confirmación del paciente reduce las citas que llegan `pendiente` a su hora |
| [DT-23](../Deudas/DT-23.md) | el enlace, como el RUT, no verifica identidad (mismo cierre que DT-42) |
| [DT-26](../Deudas/DT-26.md) | la retención se amplía a `enlaces_cita` y a las peticiones de otra hora |
| [DT-33](../Deudas/DT-33.md) | el descarte de la petición abierta por el suscriptor tarda segundos |
| [DT-04](../Deudas/DT-04.md) | el login gana un límite por IP, pero no el bloqueo por cuenta que pide esta deuda |
| [DT-06](../Deudas/DT-06.md) | el registro gana un límite por IP; siguen faltando las defensas que no son de tasa (verificación de correo, captcha) |

Las cuatro previstas de la propuesta de ADR-10: dos se ficharon (DT-42, DT-43) y dos desaparecieron (ver
[ADR-10 § Deudas](../Decisions/ADR-10.md#deudas-técnicas-asociadas)).

---

## Preguntas abiertas relacionadas

- [Q11](../PREGUNTAS-ABIERTAS.md#q11--cómo-le-llega-al-paciente-el-enlace-de-su-cita) — ✅ **respondida B
  (2026-10-14)**, con su otra mitad de seguridad (S1–S3 y límite de tasa).
- [Q6](../PREGUNTAS-ABIERTAS.md#q6--planificador-para-el-proceso-de-cierre-dev-a--prioridad-1) — la
  pregunta 1 quedó resuelta por la regla G1; la 2 sigue abierta (Fase 5).
- [Q9](../PREGUNTAS-ABIERTAS.md#q9--modelo-de-disponibilidad-no-construir--solo-evaluar) — el modelo de
  disponibilidad es lo que haría falta para que el paciente elija la hora (FD-06).
- [ADR-10 § Decisiones que deja abiertas](../Decisions/ADR-10.md#decisiones-que-este-adr-deja-abiertas)
  — elegir horarios, avisar al rechazar, reagendar desde el voucher con una petición abierta, rotación de la
  clave.

---

## Planes de US

- [US-04](../US/04-respuesta-paciente.md) — ✅ **en producción** (2026-10-17). Plan y contrato vigentes;
  Definición de Terminado: lo automático ✅ (lint con 0 problemas) y los dos puntos manuales ⬜.
- [US-02.07](../US/02.07-paciente-reagenda-cancela.md) — 🔀 **absorbida por US-04** (2026-10-14); el
  análisis se conserva.

---

## Contraparte en el frontend

- [us/02.07-paciente-reagenda-cancela.md](../../../citia-frontend/context/us/02.07-paciente-reagenda-cancela.md)
  — la vista del paciente (`/cita#<token>`), planificada cuando ADR-10 estaba propuesto.
- El trabajo de esta fase en el front —ruta pública `/cita`, voucher, bandeja y `_headers` de Netlify—
  está en el [plan de US-04 § Frontend](../US/04-respuesta-paciente.md#orden-de-construcción).
- *(2026-10-15)* **Implementado y mergeado a `develop`** en el frontend
  ([PR #7](https://github.com/Citia-solutions/citia-frontend/pull/7), merge `e8ce193`); **en producción** desde
  el 2026-10-17 ([PR #8](https://github.com/Citia-solutions/citia-frontend/pull/8), `1a7f324`):
  [responder-cita-paciente](../../../citia-frontend/context/Features/responder-cita-paciente.md) (página
  `/cita`, voucher —quién confirmó o canceló, nota *"El paciente pidió otra hora"*, *Invalidar enlace del
  paciente*—, bandeja con *"Pide otra hora"* y estado `descartada`, `public/_headers`). Probado contra este
  backend en local; ahí apareció y se corrigió que `/cita` no releía el token si cambiaba solo el fragmento
  en la misma pestaña.

---

## Depende de / desbloquea

- **Depende de:** la [Fase 2](fase-2-us03-recordatorios.md) ✅ (el recordatorio es lo que lleva el enlace)
  y de que se acepte ADR-10 ✅ (2026-10-14).
- **Desbloquea:** la [Fase 4](fase-4-us05-alertas.md) (confirmar, cancelar y pedir otra hora publican hechos
  con actor, listos para las alertas) y la [Fase 5](fase-5-us07-scoring.md) (la respuesta registrada, la
  regla G1 y la fecha de corte alimentan el scoring).
