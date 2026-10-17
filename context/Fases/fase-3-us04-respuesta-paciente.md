# Fase 3 — US-04: Respuesta del paciente (RF-07, + US-02.07)

> **Fase del roadmap** (construcción). No confundir con la
> [etapa 3 del producto](../Descripcion/fase-3-mvp.md) (el MVP, que termina en la Fase 2). Índice:
> [Fases](README.md) · Estado en el [ROADMAP § Fase 3](../ROADMAP.md#fase-3--us-04-respuesta-del-paciente).

| | |
|---|---|
| **Objetivo** | Que el paciente confirme, cancele o pida otra hora desde el enlace que le llega en el recordatorio, sin cuenta; y que el profesional lo vea en el voucher y en la bandeja. |
| **Entregable** | El paciente confirma o cancela desde el correo; agenda y alertas se actualizan (ROADMAP). Las alertas son de la Fase 4 ([DT-43](../Deudas/DT-43.md)). |
| **Estado** | ✅ **implementada y verificada en local (2026-10-15)** · **pendiente de release** · fuera del MVP. Backend y frontend construidos en `feature/fase3-respuesta-paciente` contra el plan [US-04](../US/04-respuesta-paciente.md) ([ADR-10](../Decisions/ADR-10.md) aceptado el 2026-10-14, [Q11](../PREGUNTAS-ABIERTAS.md#q11--cómo-le-llega-al-paciente-el-enlace-de-su-cita) = B); 1709 unitarios, 287 e2e y 139 de integración en verde; recorrido real en local de punta a punta. Falta el release y lo que no se puede probar en local ([checklist](#checklist-de-salida-a-producción)). |
| **Fechas** | FD-06 2026-09-10 · ADR-10 propuesto 2026-09-23 y aplazado 2026-09-25 (Q11 → C) · reabrible desde el 2026-09-30 (el canal existe con la Fase 2) · **diseño aprobado y ADR-10 aceptado 2026-10-14** · implementación 2026-10-14 → 2026-10-15 · **verificada en local 2026-10-15**. |
| **Historias** | US-04, con plan propio en [US/04-respuesta-paciente.md](../US/04-respuesta-paciente.md), que **absorbe** la subtarea [US-02.07](../US/02.07-paciente-reagenda-cancela.md) (su análisis se conserva). |
| **Commits** | ninguno propio todavía (la implementación está sin commitear en la rama de cada repo). ADR-10 y US-02.07 entraron con `2877b13` (fila 41, Fase 1); FD-06 con `16b50e1` (fila 38). |
| **Feature** | [Features/us04-respuesta-paciente.md](../Features/us04-respuesta-paciente.md) (nueva, 2026-10-15) |

---

## Estado al 2026-10-15: implementada y verificada en local

- **Construido y en verde** en `feature/fase3-respuesta-paciente` (backend y frontend, sin commits): el
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
- **Falta:** commits y PR, el release, y lo que solo se prueba fuera de local —el correo real con el botón,
  los escáneres de enlaces de Gmail y Outlook, la IP real detrás del proxy de Railway y las cabeceras de
  Netlify— en el [checklist de salida](#checklist-de-salida-a-producción).

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
4. **Deudas que cambiaron:** [DT-18](../Deudas/DT-18.md) (implementada; se cierra al desplegar),
   [DT-44](../Deudas/DT-44.md) (parte 2 resuelta por el suscriptor), [DT-45](../Deudas/DT-45.md) (corrección
   implementada) y la nueva [DT-46](../Deudas/DT-46.md).
5. Los `CLAUDE.md` de `src/modules/portal-paciente/`, `cita/`, `solicitud/` y `recordatorio/` — reglas locales
   para los agentes.
6. Frontend: [responder-cita-paciente](../../../citia-frontend/context/Features/responder-cita-paciente.md).

---

## Checklist de salida a producción

Lo que falta, fuera del código, para que el primer enlace llegue a un paciente real. *(Estado al
2026-10-15: todo ⬜ pendiente.)* Las lecciones de la [Fase 2](fase-2-us03-recordatorios.md#lecciones-aprendidas)
aplican: mirar el panel y no la memoria, y **no copiar variables entre entornos**.

**Antes del merge a `develop` (staging)**

- [ ] ⬜ **Commits y PR** en los dos repos (Conventional Commits, `npm run lint` y las tres suites en verde)
      y su registro en [TRAZABILIDAD](../TRAZABILIDAD.md).
- [ ] ⬜ **`ENLACE_CITA_CLAVE` en Railway, entorno `staging`**: generada para ese entorno, de 32 caracteres o
      más y distinta de `JWT_SECRET`. **Cargarla antes del despliegue:** la imagen fija `NODE_ENV=production`
      también en staging y, **sin ella, el servicio no arranca** (la validación del entorno la exige). Ojo:
      `entrypoint.sh` corre las migraciones **antes** de arrancar la app, así que un arranque fallido por la
      clave ya dejó aplicadas las migraciones (el esquema nuevo es compatible con el código anterior).
- [ ] ⬜ **`LIMITE_TASA_ACTIVO`** sin definir (o `true`) en staging y en production.
- [ ] ⬜ **`FRONTEND_URL` de staging** = `https://citia-staging.netlify.app`: desde esta fase es además la
      **base del enlace** del correo (era un pendiente de la Fase 2).

**En staging, después del merge**

- [ ] ⬜ **Migraciones `1750000012000` a `1750000014000`** aplicadas por `entrypoint.sh` (log
      `[entrypoint] Migraciones aplicadas`; las tres corren en una sola transacción).
- [ ] ⬜ **`trust proxy` entrega la IP real.** Seis logins seguidos desde un equipo → el sexto recibe 429;
      enseguida, un login desde **otra red** (p. ej. el teléfono con datos móviles) **no** recibe 429. Si la
      otra red también recibe 429, todos los clientes comparten la IP del proxy: Railway pone más de un salto
      y hay que revisar `trust proxy` antes de production.
- [ ] ⬜ **Netlify aplica `public/_headers` a `/cita`:** `curl -I https://citia-staging.netlify.app/cita`
      muestra `Referrer-Policy: no-referrer` y `X-Robots-Tag: noindex, nofollow`.
- [ ] ⬜ **CORS:** la página `/cita` del sitio de staging llama a la API con `X-Enlace-Cita` sin error de
      CORS en la consola (el preflight la permite).

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

- [ ] ⬜ **`ENLACE_CITA_CLAVE` en Railway, entorno `production`:** propia, **distinta de la de staging** y de
      `JWT_SECRET`, 32 caracteres o más; **no copiarla entre entornos** ([DT-40](../Deudas/DT-40.md) fue
      eso). Sin ella el servicio no arranca. Una vez en uso, no rotarla sin leer [DT-45](../Deudas/DT-45.md).
- [ ] ⬜ **Release** `develop` → `main` en los dos repos, el backend **antes o a la vez** que el frontend: el
      backend nuevo es compatible con el frontend actual; al revés, la página `/cita` y el botón de invalidar
      responderían 404.
- [ ] ⬜ **Migraciones `1750000012000` a `1750000014000`** aplicadas en production.
- [ ] ⬜ **Una sola réplica** del backend en Railway: el límite de tasa cuenta en memoria, por proceso.
- [ ] ⬜ **`curl -I https://app.citiahealth.cl/cita`** con las cabeceras de `_headers`.
- [ ] ⬜ **Fecha de corte de [DT-11](../Deudas/DT-11.md) = el día del despliegue a production.** Escribirla ese
      día en DT-11 (regla G1): el futuro job de `ghosting` solo cuenta citas cuyo recordatorio con enlace
      salió después.
- [ ] ⬜ **Tras el release:** [DT-18](../Deudas/DT-18.md) cerrada; [DT-42](../Deudas/DT-42.md) a
      [DT-45](../Deudas/DT-45.md) de `prevista` a `abierta`; en el frontend, `ENLACE_PUBLICO_LISTO = true`
      (la advertencia de "Copiar enlace de agenda" ya no hace falta, DT-18).
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
| — | *(sin commit todavía)* | 2026-10-14 | Diseño aprobado: ADR-10 aceptado, plan de US-04, DT-42 a DT-45, regla G1, Q11 = B | [ADR-10](../Decisions/ADR-10.md) · [US-04](../US/04-respuesta-paciente.md) · [DT-11](../Deudas/DT-11.md) · PREGUNTAS |
| — | *(sin commit todavía)* | 2026-10-14 → 2026-10-15 | Implementación de backend y frontend; verificación en local | [us04-respuesta-paciente](../Features/us04-respuesta-paciente.md) (nueva) · [ADR-10 § Notas de implementación](../Decisions/ADR-10.md#notas-de-implementación-2026-10-15) · [DT-18](../Deudas/DT-18.md), [DT-44](../Deudas/DT-44.md), [DT-45](../Deudas/DT-45.md), [DT-46](../Deudas/DT-46.md) (nueva) · `CLAUDE.md` de `portal-paciente`, `cita`, `solicitud` y `recordatorio` |

---

## Decisiones

| Documento | En una línea | Estado |
|---|---|---|
| [ADR-10](../Decisions/ADR-10.md) | Enlace por cita: confirma y cancela con las transiciones existentes; pide otra hora como solicitud en la bandeja | ✅ **Aceptado (2026-10-14)** · **implementado y verificado en local (2026-10-15)**, pendiente de release · [notas de implementación](../Decisions/ADR-10.md#notas-de-implementación-2026-10-15) |
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
del release: describe lo implementado en la rama.

---

## Deudas

| Deuda | Por qué pesa en esta fase |
|---|---|
| [DT-18](../Deudas/DT-18.md) | **implementada en esta fase** (2026-10-15): límite de tasa en el enlace, el login, el registro y la solicitud pública; **se cierra al desplegar**. Lo que queda abierto vive en DT-04, DT-06 y en la nota de una sola réplica |
| [DT-42](../Deudas/DT-42.md) | **nueva (prevista):** el enlace no verifica identidad; reenviado, transfiere la capacidad |
| [DT-43](../Deudas/DT-43.md) | **nueva (prevista):** el profesional no se entera en el momento de lo que hace el paciente (Fase 4) |
| [DT-44](../Deudas/DT-44.md) | **nueva (prevista):** rechazar la petición de otra hora no avisa al paciente. Su **parte 2** (reagendar desde el voucher no cerraba la petición) **quedó resuelta** al implementar: el suscriptor la deja atendida |
| [DT-45](../Deudas/DT-45.md) | **nueva (prevista), con su corrección implementada:** si cambia `ENLACE_CITA_CLAVE`, `asegurarActivo` revoca el enlace viejo y emite la versión siguiente (autocorrección + test) |
| [DT-46](../Deudas/DT-46.md) | **nueva (detectada al implementar, 2026-10-15):** columnas de fecha de varias entidades ORM sin `timestamptz`; solo afecta a los tests con `synchronize` |
| [DT-11](../Deudas/DT-11.md) | la regla de `ghosting` G1 queda escrita; la fecha de corte es el despliegue de esta fase |
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

- [US-04](../US/04-respuesta-paciente.md) — ✅ **implementada y verificada en local** (2026-10-15), pendiente
  de release. Plan y contrato vigentes; Definición de Terminado: lo automático ✅ (lint con 0
  problemas) y los dos puntos manuales ⬜.
- [US-02.07](../US/02.07-paciente-reagenda-cancela.md) — 🔀 **absorbida por US-04** (2026-10-14); el
  análisis se conserva.

---

## Contraparte en el frontend

- [us/02.07-paciente-reagenda-cancela.md](../../../citia-frontend/context/us/02.07-paciente-reagenda-cancela.md)
  — la vista del paciente (`/cita#<token>`), planificada cuando ADR-10 estaba propuesto.
- El trabajo de esta fase en el front —ruta pública `/cita`, voucher, bandeja y `_headers` de Netlify—
  está en el [plan de US-04 § Frontend](../US/04-respuesta-paciente.md#orden-de-construcción).
- *(2026-10-15)* **Implementado** en la rama `feature/fase3-respuesta-paciente` del frontend, sin commits:
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
