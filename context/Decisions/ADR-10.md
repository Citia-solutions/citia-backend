# ADR-10: El paciente responde a su cita con un enlace por cita — confirma y cancela con las transiciones existentes, y pide otra hora como una solicitud en la bandeja

> **Fase:** [Fase 3 — US-04](../Fases/fase-3-us04-respuesta-paciente.md) (se implementa), [Fase 1 — US-02](../Fases/fase-1-us02-gestion-citas.md) (origen, aplazada) · **Feature:** [us04](../Features/us04-respuesta-paciente.md), [us02](../Features/us02-gestion-citas.md) · **Plan:** [US-04](../US/04-respuesta-paciente.md) (vigente), [US-02.07](../US/02.07-paciente-reagenda-cancela.md) (análisis original, absorbida por US-04) · **Relacionado:** [ADR-09](../Decisions/ADR-09.md), [ADR-12](../Decisions/ADR-12.md), [ADR-13](../Decisions/ADR-13.md), [ADR-04](../Decisions/ADR-04.md), [FD-06](../Frontend-Decisions/FD-06.md), [DT-11](../Deudas/DT-11.md), [DT-16](../Deudas/DT-16.md), [DT-18](../Deudas/DT-18.md), [DT-42](../Deudas/DT-42.md), [DT-43](../Deudas/DT-43.md), [DT-44](../Deudas/DT-44.md), [DT-45](../Deudas/DT-45.md), [Q11](../PREGUNTAS-ABIERTAS.md#q11--cómo-le-llega-al-paciente-el-enlace-de-su-cita)

**Fecha:** 2026-09-23 (propuesto) · 2026-10-14 (aceptado)
**Estado:** ✅ **Aceptado (2026-10-14)** por el arquitecto, con [Q11](../PREGUNTAS-ABIERTAS.md#q11--cómo-le-llega-al-paciente-el-enlace-de-su-cita)
= **B** y los requisitos de seguridad S1–S3 más el límite de tasa ([Pendiente para aceptar](#pendiente-para-aceptar)).
**Implementado y en producción desde el 2026-10-17** en los dos repos (merge a `develop` el 2026-10-15:
backend [PR #6](https://github.com/Citia-solutions/citia-backend/pull/6), frontend
[PR #7](https://github.com/Citia-solutions/citia-frontend/pull/7); release: backend
[PR #7](https://github.com/Citia-solutions/citia-backend/pull/7), frontend
[PR #8](https://github.com/Citia-solutions/citia-frontend/pull/8)). Cómo quedó:
[Notas de implementación](#notas-de-implementación-2026-10-15) y
[us04-respuesta-paciente](../Features/us04-respuesta-paciente.md).
**Historia del estado:**
- **2026-09-23 — Propuesto**, pendiente de Q11 y de los requisitos de seguridad del enlace.
- **2026-09-25 — 🔵 Aplazado fuera de la v1** (Q11 → C): no había canal hacia el paciente. El diseño se
  conservó para retomarlo con RF-06.
- **2026-09-30 — Reabrible:** con Q1 → A los recordatorios entran en el MVP, el canal va a existir y
  [ADR-13 §12](ADR-13.md) deja preparado el bloque `accion` de la plantilla.
- **2026-10-14 — Aceptado, con cambios** respecto de la propuesta: token recalculable con HMAC, un enlace
  por cita que nace con el primer recordatorio, confirmar entra, pedir otra hora pasa a la bandeja
  existente y la composición vive en un módulo nuevo `portal-paciente`. Detalle en
  [Qué cambió respecto de la propuesta](#qué-cambió-respecto-de-la-propuesta-2026-09-23).

**Commits:** `2877b13` (propuesto) · `4c543a5` (aplazado) · `b93f2c0` (aceptado y notas de implementación) ·
implementación: `c757e0e`, `6fbf4e3`, `4d3d88f`, `5f8ac6d`, `92b8020`, `143c8fb`, `3b312f9` · `ce0c533`
(merge a `develop`, PR #6) · `05bae58` (release a producción, PR #7). Filas 85–92, 94 y 95 de la
[TRAZABILIDAD](../TRAZABILIDAD.md).
**Historias:** US-04 — plan en [US/04-respuesta-paciente.md](../US/04-respuesta-paciente.md) — y la subtarea
[US-02.07](../US/02.07-paciente-reagenda-cancela.md), que US-04 absorbe.
**Relación:** **matiza** [ADR-09](ADR-09.md) §8 regla 1 (la vía pública solo escribe en `solicitudes_cita`)
y **extiende** su agregado `SolicitudCita` con un `tipo` · **se apoya en** [ADR-04](ADR-04.md) sin tocar su
grafo · **usa** el outbox de [ADR-12](ADR-12.md) (un suscriptor nuevo) · **matiza** [ADR-13](ADR-13.md) §1
(el módulo `recordatorio` pasa a llamar al módulo `cita` para obtener el enlace) y **llena** su bloque
`accion` (§12) · **replica** la atomicidad de [ADR-06](ADR-06.md) y la respuesta uniforme de
[ADR-03](ADR-03.md) §5 · **no depende** de [ADR-08](ADR-08.md) (el enlace no lleva `tenantSlug`).

> **Sobre el número.** [Q6](../PREGUNTAS-ABIERTAS.md) (planificador del proceso de cierre) también
> anticipaba un "ADR-10". Como este se escribió primero, toma el 10; el de Q6 terminó siendo
> [ADR-12](ADR-12.md).

> **Qué es y qué no es este ADR.** Registra la decisión **aceptada** y su porqué. El análisis de opciones
> original está en [US-02.07](../US/02.07-paciente-reagenda-cancela.md) §1–§9; el contrato de implementación
> (tablas, rutas, DTOs, orden por agente y Definición de Terminado) está en el plan
> [US-04](../US/04-respuesta-paciente.md). Si este ADR y el plan discrepan en un nombre, manda el plan.

---

## Contexto

RF-07 dice: *"el paciente confirma, cancela o **solicita reagendar** desde el recordatorio"*. Cuando se
propuso este ADR, la frase daba por hecho dos cosas que no existían:

1. **Un canal hacia el paciente.** Desde la [Fase 2](../Fases/fase-2-us03-recordatorios.md) existe: los
   recordatorios por correo están en producción desde el 2026-10-06 ([ADR-13](ADR-13.md)), y la plantilla
   trae un bloque `accion?` vacío para este enlace. [Q11](../PREGUNTAS-ABIERTAS.md) se respondió **B**.
2. **Una forma de saber que quien pulsa el botón es el paciente de esa cita.** Sigue siendo el hueco de
   fondo, y es lo que resuelve este ADR.

### Lo que hay hoy (verificado en el código, 2026-10-14)

| Pieza | Estado |
|---|---|
| `Cita.confirmar()`, `cancelar()`, `reagendar()` | existen; confirmar es legal desde `pendiente`, cancelar y reagendar desde `pendiente \| confirmada` (ADR-04, ADR-09 §5) |
| Bitácora `cambios_cita` | append-only, misma transacción que la mutación; `actor_tipo` es el enum `enum_cambios_cita_actor` (`profesional`, `paciente`, `sistema`); `actor_id` es `uuid` nullable sin clave foránea |
| `CitasService.mutar()`, `registrarCambio()`, `publicar()` | reciben un `AuthenticatedUser`; el actor es siempre `PROFESIONAL`; el `usuarioId` del hecho sale del token; la carga de la cita **no** bloquea la fila |
| Hechos | se publican en el **outbox** `eventos_salida` dentro de la transacción ([ADR-12](ADR-12.md), DT-27 cerrada); el único suscriptor es el de recordatorios |
| Recordatorios | en producción; el envío corre dentro de una transacción y usa `Idempotency-Key` = id del recordatorio ([ADR-13 §9](ADR-13.md)); la plantilla es determinista |
| `solicitudes_cita` | `rut`, `correo`, `telefono` y `motivo` NOT NULL; estados `recibida · aceptada · rechazada`; regla anti-spam por RUT con ventana de 72 h ([DT-28](../Deudas/DT-28.md)) |
| Logs | `pino` con redacción de `authorization` ([ADR-13 §16](ADR-13.md)) |
| Límite de tasa | no existe ([DT-18](../Deudas/DT-18.md)); tampoco `trust proxy` detrás del proxy de Railway |

> El cuadro del 2026-09-23 (sin outbox, sin canal, sin política de logs) está en la versión propuesta
> (`2877b13`).

### La observación que acota el problema

Hasta hoy la única superficie sin sesión escribe en una tabla aislada donde *"todavía no existe nada"*
(ADR-09 §1). La Fase 3 abre la **primera superficie sin sesión que modifica una cita real**. Eso solo es
aceptable si quien llega **no es anónimo**: trae una autoridad que el sistema le entregó en nombre del
profesional, acotada a **una cita** y a **tres operaciones** (confirmar, cancelar, pedir otra hora).

---

## Opciones evaluadas

### A. Cómo se identifica el paciente frente a una cita

| Opción | Veredicto |
|--------|-----------|
| **A1. Token opaco por cita en el enlace (ELEGIDA)** | Un clic, no expone RUT, no hay nada que enumerar. Es la misma pieza para todos los recordatorios de la cita. |
| **A2. RUT + código enviado al contacto** | **Descartada.** Más fricción, y una pantalla "escribe tu RUT" mal hecha permite sondear qué RUT es paciente de qué profesional de la salud (lo que ADR-09 §8 regla 6 evita). Queda como camino si se exige verificar identidad ([DT-42](../Deudas/DT-42.md)). |
| **A3. Esperar a RF-06** | Ya no aplica: RF-06 existe desde la Fase 2. |

### B. Dónde vive la petición de otra hora

| Opción | Veredicto |
|--------|-----------|
| **B1. Reutilizar `solicitudes_cita` con un `tipo` (ELEGIDA el 2026-10-14)** | La propuesta la descartó por cuatro motivos; los cuatro se resuelven sin mezclar los dos ciclos de vida (tabla en la [decisión 4](#4-pedir-otra-hora--una-solicitudcita-de-tipo-reagendamiento-en-la-bandeja)). A cambio, la petición llega a la **bandeja que el profesional ya usa**, y el dashboard no se toca. |
| **B2. Solo una fila en la bitácora** | **Descartada.** La bitácora registra cambios de la cita y una petición no cambia nada. |
| **B3. Agregado propio `SolicitudReagendamiento` en el módulo `cita`** (elegida en la propuesta, **abandonada**) | Obligaba a mostrar la petición como una marca nueva en el dashboard y en el voucher: una segunda bandeja, escondida dentro de la pantalla principal del profesional. Ver la decisión 4. |
| **B4. Estado nuevo en `Cita` (`reagendamiento_solicitado`)** | **Descartada.** Obliga a revisar todas las transiciones de ADR-04 y el job de cierre, y hace que una cita confirmada deje de estarlo solo porque el paciente preguntó. |

### C. Transporte del token hacia la API

| Opción | Veredicto |
|--------|-----------|
| **C1. En la ruta o en la query de la API** | **Descartada.** Las URL terminan en logs de acceso, historiales, proxies y `Referer`. |
| **C2. `Authorization: Bearer <token>`** | **Descartada.** Dos significados distintos para la misma cabecera en el mismo backend invitan a que un guard acepte lo que no debe. |
| **C3. En el cuerpo** | **Descartada como mecanismo único.** Obliga a que *leer* sea un `POST` y mezcla la credencial con los datos. |
| **C4. Cabecera dedicada `X-Enlace-Cita` (ELEGIDA)** | Sirve igual para leer y para escribir, no aparece en URLs, se redacta en logs por nombre y no se confunde con el JWT. Coste: preflight CORS. |

### D. Cómo se obtiene y se guarda el token

| Opción | Veredicto |
|--------|-----------|
| **D1. Aleatorio (`randomBytes(32)`) + SHA-256, irrecuperable** (elegida en la propuesta, **abandonada**) | Como no se puede volver a calcular, el mismo enlace en todos los recordatorios exige guardarlo en claro o **rotarlo en cada envío**. Rotar deja muerto el enlace del correo anterior y hace que un reintento con la misma `Idempotency-Key` lleve otro contenido. |
| **D2. Hash lento (bcrypt / argon2)** | **Descartada.** Existe para secretos de baja entropía; impide buscar por índice y regala CPU a cada petición anónima. |
| **D3. HMAC-SHA-256 con clave del servidor, recalculable (ELEGIDA el 2026-10-14, E2)** | El token se **deriva** de (cita, versión) con una clave que no está en la base: se recalcula en cada recordatorio sin guardarlo, y la base guarda solo `sha256(token)`. Una fuga de la base sola no entrega enlaces. Coste: una clave más que custodiar y una rotación que no es gratis ([DT-45](../Deudas/DT-45.md)). |
| **D4. Guardar el token en claro o cifrado** | **Descartada.** En claro, una fuga de la base entrega enlaces utilizables; cifrado, es D3 con más piezas (clave, cifrar y descifrar). |

### E. Cuándo nace el enlace y cuántos hay por cita

| Opción | Veredicto |
|--------|-----------|
| **E-a. Lo emite el profesional desde el voucher** (puente de Q11-A) | **Descartada** con Q11 = B: no hay mensaje manual que mandar. |
| **E-b. Al crear la cita** | **Descartada.** Crea enlaces para citas que nunca reciben un recordatorio (recordatorios apagados, paciente sin correo) y acopla `agendar` al enlace. |
| **E-c. Perezoso, al enviar el primer recordatorio; uno activo por cita (ELEGIDA, E1 + E3)** | Solo hay enlace donde hubo un envío. Todos los recordatorios de la cita llevan el mismo; `asegurarActivo` es idempotente y determinista. |
| **E-d. Uno por recordatorio** | **Descartada.** Varios enlaces vivos para la misma cita: más que invalidar, y el paciente no sabe cuál vale. |

### F. Dónde viven las rutas públicas

| Opción | Veredicto |
|--------|-----------|
| **F1. En el módulo `cita`** | **Descartada.** Pedir otra hora escribe en `solicitud`, y `solicitud → cita` ya existe (la bandeja agenda): `cita → solicitud` cerraría un ciclo. |
| **F2. En el módulo `solicitud`** | **Descartada.** Metería escrituras sobre `citas` en el módulo de la vía anónima, cuyo servicio anónimo no debe tener `CitasService` (regla del módulo). |
| **F3. Módulo de composición `portal-paciente` (ELEGIDA)** | Importa `cita` y `solicitud`; ninguno lo importa a él. Sin ciclos, y toda la superficie anónima nueva queda en un solo lugar, fácil de revisar y de limitar. |

---

## Decisión (aceptada el 2026-10-14)

Resumen con los identificadores del contrato de implementación (detalle en el plan
[US-04](../US/04-respuesta-paciente.md#decisiones)):

| Grupo | Decisiones |
|---|---|
| **S** — seguridad (requisitos del arquitecto) | S0 enlace dentro del recordatorio (Q11 = B) · S1 invalidar desde el voucher · S2 la página muestra lo mínimo · S3 fragmento + cabecera + `no-store` / `no-referrer` + sin scripts de terceros + **abrir la página nunca ejecuta una acción** |
| **E** — el enlace | E1 uno activo por cita · E2 token recalculable con HMAC · E3 nace al enviar el primer recordatorio · E4 en el voucher solo "Invalidar enlace" · E5 un solo botón fijo en el correo |
| **R** — pedir otra hora | R1 no toca la cita original · R2 `SolicitudCita` de tipo `reagendamiento`; aceptarla mueve la cita · R3 rechazar no avisa (v1) · R4 nada en el dashboard; nota en el voucher · R5 una abierta por cita; la regla anti-spam por RUT solo cuenta las `nueva` · R6 con una abierta, solo cancelar |
| **G** — ghosting y actor | G1 regla de `ghosting` (se documenta, [DT-11](../Deudas/DT-11.md)) · G2 la confirmación del paciente y la del profesional pesan igual · G3 `confirmadaPor` / `canceladaPor` en el voucher · G4 el job no se construye en esta fase |
| **L** — límite de tasa | L1 enlace, login, registro y solicitud pública · L2 en memoria, una réplica · L3 límites por superficie, sin bloqueo por fallos |

### 1. Enlace por cita: uno por cita, recalculable con HMAC, nace con el primer recordatorio

Entidad nueva **`EnlaceCita`** en `src/modules/cita/domain/` (ADR-02), tabla `enlaces_cita`. Vive en el
módulo `cita` porque su validez se evalúa contra la cita **dentro de la transacción de la acción**, y
porque su id es el actor del paciente en la bitácora.

```
EnlaceCita  (tabla enlaces_cita)
├─ id                ← uuid; es el actor_id del paciente en cambios_cita (decisión 3)
├─ citaId, tenantId  ← el token resuelve cita → tenant; nunca se piden al cliente
├─ version           ← empieza en 1; tras una invalidación, el siguiente enlace es version + 1
├─ tokenHash         ← sha256(token) en hex, UNIQUE
├─ emitidoEn
├─ revocadoEn?
├─ motivoRevocacion? ← hoy solo `invalidado`
└─ revocadoPor?      ← usuarioId del profesional que invalidó
```

Índices: UNIQUE (`cita_id`, `version`) y UNIQUE parcial (`cita_id`) WHERE `revocado_en IS NULL` (como
máximo un enlace activo por cita, garantizado en la base).

**Las reglas:**

1. **Alcance: una cita.** El token no da acceso a otras citas del mismo paciente, ni a su ficha, ni al
   tenant. Todo acceso se resuelve `token → enlace → cita → tenant`, sin aceptar ningún id del cliente.
2. **Token recalculable (E2).**
   `token = base64url(HMAC-SHA256(ENLACE_CITA_CLAVE, "enlace-cita:" + citaId + ":" + version))`, 43
   caracteres. **En la base solo está `token_hash = sha256(token)`.** La clave `ENLACE_CITA_CLAVE` es
   distinta de `JWT_SECRET`, obligatoria en producción con al menos 32 caracteres (la misma validación de
   arranque que `JWT_SECRET`) y solo tiene valor por defecto en desarrollo y tests. El dominio la usa a
   través de un puerto `DerivadorTokenEnlace` (`derivar`, `hashear`), con un adaptador sobre `node:crypto`.
   - **Por qué recalculable:** todos los recordatorios de una cita deben llevar el mismo enlace (E1) y la
     plantilla debe ser determinista entre reintentos, porque el envío usa la misma `Idempotency-Key`
     ([ADR-13 §9](ADR-13.md)). Con un token irrecuperable, las dos cosas obligan a guardarlo en claro.
   - **Qué protege y qué no:** una fuga de la base sola no entrega enlaces (hay un hash de un valor de 256
     bits). La clave, en cambio, **es** el secreto: con ella y el id de una cita se calcula el token, así
     que se custodia como `JWT_SECRET`. Cambiarla tiene efectos sobre los enlaces activos
     ([DT-45](../Deudas/DT-45.md)).
3. **Nace perezosamente al enviar el primer recordatorio (E3).** `asegurarActivo(citaId, tenantId, tx)`
   corre dentro de la transacción del envío: si hay un enlace activo, lo usa; si no, inserta
   `max(version) + 1` (1 si no hay ninguno) con `INSERT … ON CONFLICT DO NOTHING` y relee. Es idempotente y
   determinista: la misma (cita, versión) da el mismo token. Si falla, el envío falla como error interno y
   se reintenta. **No hay emisión manual:** el profesional no ve ni copia el enlace (E4), y el paciente no
   puede reemitir el suyo.
4. **Validez = enlace no revocado ∧ cita vigente (`pendiente | confirmada`) ∧ ahora < `inicio` vigente.**
   Es una regla de **dominio**, evaluada dentro de la transacción de la acción. "Antes de `inicio`" se
   compara con el `inicio` **vigente**: si el profesional reagenda, el mismo enlace sirve para la hora
   nueva. Es una comparación entre instantes (`timestamptz` contra el reloj del servidor).
   - **Sin tope de días** (la propuesta fijaba 30 días desde la emisión). El enlace nace con el primer
     recordatorio, días u horas antes de la cita, y muere en `inicio`: un segundo reloj no protegía nada
     que `inicio` no protegiera ya, y obligaba a reemitir.
   - **Sin revocación explícita al pasar a terminal** (la propuesta revocaba en cada transición a
     terminal). El estado de la cita ya invalida el enlace por la regla 4; así ninguna transición —ni el
     futuro job de cierre— tiene que acordarse de revocar, y el esqueleto de mutación no depende del
     enlace. La única revocación es invalidar (regla 5).
5. **Invalidar desde el voucher (S1).** `POST /api/citas/:id/enlace/invalidar`, con JWT y filtrado por el
   tenant del token, responde **204**; 404 si la cita no es del tenant; 204 también si no hay enlace activo
   (idempotente). Marca el enlace revocado (`motivo_revocacion = invalidado`, `revocado_por`) y el
   siguiente recordatorio de la cita crea la versión siguiente. Es la respuesta al requisito *"qué debe
   poder hacer el sistema cuando el enlace llega a quien no es"*. Sus límites están en
   [DT-42](../Deudas/DT-42.md).
6. **Respuesta uniforme para todo token no válido.** Cabecera ausente, formato incorrecto, inexistente,
   revocado, cita terminal o `inicio` ya pasado → **el mismo 404**:
   `{ "statusCode": 404, "message": "Enlace no válido o vencido" }`. Un token con formato inválido (que no
   sea de 43 caracteres base64url) se rechaza **sin tocar la base**. Es la regla de ADR-03 §5 y ADR-09 §8
   regla 6 aplicada a esta superficie. Con un enlace válido, una acción que ya no está permitida responde
   **409** `{ "statusCode": 409, "message": "Esta acción ya no está disponible" }`: quien llega ya demostró
   tener el enlace, y el estado de su cita es información suya.
7. **Transporte (S3).**
   - El enlace que recibe el paciente lleva el token en el **fragmento**: `https://<frontend>/cita#<token>`.
     El navegador no envía el fragmento al servidor ni lo incluye en `Referer`.
   - El frontend lo guarda en memoria, **limpia el fragmento** (`history.replaceState`) y lo envía a la API
     en la cabecera **`X-Enlace-Cita`** (opción C4), en todas las rutas públicas de la cita.
   - Las respuestas públicas llevan `Cache-Control: no-store` y `Referrer-Policy: no-referrer`; CORS
     permite la cabecera.
   - Los logs redactan `x-enlace-cita` igual que `authorization`, y **nunca** registran el token ni su
     hash. Ningún hecho del outbox los lleva.
   - La página del paciente **no carga scripts de terceros** (analítica, píxeles): cualquier script de la
     página puede leer `location.hash`.
   - **Abrir la página nunca ejecuta una acción.** Los filtros de correo (los escáneres de enlaces de
     Gmail, Outlook y los antivirus corporativos) abren los enlaces de los correos antes que el paciente.
     Si abrir confirmara la cita, la confirmaría un robot. Por eso la lectura es un `GET` que no muta nada
     y **toda acción es un `POST` tras un clic** del paciente.
8. **No necesita `tenantSlug`.** El token resuelve cita → tenant; pedir además el slug solo añade
   superficie. Por eso este ADR no depende de ADR-08.

### 2. Qué ve el paciente: lo mínimo para reconocer la cita (S2)

El enlace **puede reenviarse**, así que se trata como si lo fuera a leer un tercero.

| Se muestra | No se muestra |
|---|---|
| `inicio` + zona de la clínica (para mostrarla en su hora, [ADR-07](ADR-07.md)), `duracionMin`, `estado` | RUT, teléfono, correo, **nombre del paciente** |
| nombre de la organización y del profesional | `tipoConsulta` |
| la petición de otra hora abierta, si la hay (preferencia y fecha) | historial de la cita, otras citas |
| `accionesPermitidas` del paciente (`confirmar`, `cancelar`, `pedirOtraHora`), calculadas por el backend | `tenantId`, `usuarioId`, `pacienteId`, id del enlace, cualquier id interno |

- **`tipoConsulta` no se muestra.** Es texto libre del profesional y puede ser dato de salud explícito
  ("control de embarazo", "psiquiatría").
- **El nombre del paciente tampoco.** Junto al del profesional vincula a una persona con una atención de
  salud. El nombre del profesional **sí** se muestra (requisito confirmado por el arquitecto): sin él, el
  paciente no reconoce la hora.
- **`accionesPermitidas` lo calcula el backend**, con `ahora < inicio`: así la regla "nada después de
  `inicio`" no se duplica en el frontend. El frontend las pinta; la API las vuelve a exigir. La forma del
  DTO (`VistaCitaPacienteDto`) está en el [plan](../US/04-respuesta-paciente.md#rutas).

### 3. Confirmar y cancelar por el paciente = las transiciones existentes

- **Confirmar entra** (la propuesta lo dejaba fuera). Es `Cita.confirmar()`, `pendiente → confirmada`, sin
  copia de la regla. Se había dejado fuera porque *"cambia la semántica de `ghosting`"*: con una vía real
  para confirmar, una cita que sigue `pendiente` significa algo distinto. La regla G1 (decisión 5) fija
  ese significado, así que ya no hay motivo para dejarla fuera. La confirmación del paciente y la del
  profesional **pesan igual** (G2); el peso lo decide la Fase 5 y hoy solo se guarda el actor.
- **Cancelar** es `Cita.cancelar()`, legal desde `pendiente | confirmada`, con `motivo` opcional de hasta
  300 caracteres y la misma etiqueta que ADR-09 §10 (no invitar a escribir detalle médico).
- **Acciones permitidas del paciente**, todas con `ahora < inicio`:
  - `confirmar`: la cita está `pendiente` y no hay una petición de otra hora abierta;
  - `cancelar`: la cita está vigente;
  - `pedirOtraHora`: la cita está vigente y no hay una petición de otra hora abierta.
- **Bitácora:** `actor_tipo = paciente`, **`actor_id` = id del `EnlaceCita` usado**. Permite saber con qué
  enlace se hizo sin guardar nada del paciente. `actor_id` es una referencia polimórfica cuyo significado
  lo da `actor_tipo` (usuario si `profesional`, enlace si `paciente`, nulo si `sistema`).
- **Quién confirmó o canceló (G3):** `GET /api/citas/:id` suma, de forma aditiva, `confirmadaPor` y
  `canceladaPor` (`'paciente' | 'profesional' | 'sistema' | null`), derivados del último cambio
  `confirmada` / `cancelada` de la bitácora. El voucher muestra *"Confirmada por el paciente"* o
  *"Confirmada por ti"*.

**Refactor obligatorio del esqueleto de mutación.** `mutar()`, `registrarCambio()` y `publicar()` dejan de
recibir un `AuthenticatedUser` y pasan a recibir un **actor** más el `tenantId` explícito:

```
Actor = { tipo: 'profesional', usuarioId }
      | { tipo: 'paciente',    enlaceId  }
      | { tipo: 'sistema' }
```

El `usuarioId` del hecho publicado sale de **`cita.usuarioId`**, no del token. La carga de la cita para
mutar usa **`SELECT … FOR UPDATE`** (decisión 9, concurrencia). Métodos nuevos, dentro de una transacción
que abre quien llama: `confirmarComoPaciente`, `cancelarComoPaciente` y `reagendarEnTx` (este último, para
la bandeja). Un solo esqueleto para el profesional, el paciente y el futuro job de cierre
(`ActorCambio.SISTEMA`); lo que no se admite es una segunda copia. Los tests existentes de `CitasService`
siguen en verde sin cambiar su intención.

### 4. Pedir otra hora = una `SolicitudCita` de tipo `reagendamiento` en la bandeja

- **R1 — No toca la cita original.** La cita sigue en el dashboard, en su estado, ocupando su hora.
- **R2 — Es una `SolicitudCita` de tipo `reagendamiento`** en la bandeja existente
  ([ADR-09](ADR-09.md)). Columnas nuevas en `solicitudes_cita`: `tipo` (`nueva | reagendamiento`, por
  defecto `nueva`), `cita_origen_id` y `enlace_id` (sin clave foránea, como `cita_id`). Los datos del
  paciente se copian de su ficha (el RUT puede faltar: el alta manual lo permite) y la solicitud nace con
  `usuarioId` = dueño de la cita. **Aceptarla mueve la cita original** con `reagendar` (mismo id, vuelve a
  `pendiente`, los recordatorios se reprograman solos por el outbox), y `solicitud.citaId = citaOrigenId`.
  Al aceptar una de reagendamiento, la bandeja pide **solo fecha y hora**: `duracionMin` y `tipoConsulta`
  pasan a opcionales y se ignoran (siguen obligatorios para `nueva`). Si la cita origen ya es terminal →
  409.
- **R3 — Rechazarla no avisa al paciente** (v1). La cita original queda como estaba
  ([DT-44](../Deudas/DT-44.md)).
- **R4 — Nada en el dashboard.** El voucher muestra la nota *"El paciente pidió otra hora"*, con la
  consulta que ya existe: `GET /api/solicitudes?citaOrigenId=<id>&estado=recibida`.
- **R5 — Una petición abierta por cita** (índice único parcial sobre `cita_origen_id` donde
  `tipo = 'reagendamiento' AND estado = 'recibida'`). La regla anti-spam por RUT (ventana de 72 h) **solo
  cuenta las solicitudes `nueva`**: un paciente puede tener a la vez una cita con petición de otra hora y
  una solicitud de hora nueva.
- **R6 — Con una petición abierta, el enlace solo permite cancelar.**
- **Descarte.** Estado terminal nuevo `descartada`. Cuando la cita llega a terminal (`CitaCancelada`,
  `CitaAsistida`, `CitaNoAsistida`), un **suscriptor del outbox** del módulo `solicitud`
  (`SuscriptorSolicitudes`) descarta la petición abierta de esa cita, de forma idempotente. No ocurre en la
  transacción de la cita para no crear la dependencia `cita → solicitud`; el portal, que importa los dos
  módulos, puede además descartarla en la misma transacción cuando el paciente cancela.
- **Hecho nuevo** `ReagendamientoSolicitado` (decisión 7).

**Por qué se abandonó el agregado `SolicitudReagendamiento` y la marca en el dashboard.**

La propuesta descartaba reutilizar `solicitudes_cita` (opción B1) por cuatro motivos. El diseño aceptado
responde a cada uno:

| Motivo de la propuesta | Cómo lo resuelve el diseño aceptado |
|---|---|
| El agregado significa *"no existe nada"* y aceptarlo **crea** una cita; aquí la cita existe y atenderla la **mueve** | el `tipo` separa los dos significados de forma explícita: `nueva` crea, `reagendamiento` mueve con `reagendar` |
| Exige RUT, contacto y consentimiento que ya están en la cita | `rut` (y `correo`) pasan a nullable y los datos se copian de la ficha; el paciente no escribe nada salvo su preferencia |
| Sobrecarga `citaId` | columna propia `cita_origen_id`; `cita_id` sigue significando "la cita que resultó de aceptar", que en este caso es la misma |
| La regla anti-spam por RUT bloquearía a quien tenga a la vez una solicitud nueva abierta | la regla anti-spam solo cuenta `nueva`; el reagendamiento tiene su propia regla (R5) |

Y lo que pesó a favor: **no vulnerar el dashboard del profesional.** La propuesta necesitaba una marca de
petición abierta en `CitaDashboardDto` y en el detalle, con una consulta más por cada lectura del día. Eso
cambiaba el contrato y la consulta de `GET /api/citas/hoy` —la pantalla del MVP, en producción, que el
profesional mira toda la jornada— para mostrar algo que ya tiene casa: la **bandeja**, donde el profesional
ya atiende las peticiones de sus pacientes, con contador en el sidebar, aceptar con fecha y hora y aviso de
solapamiento ([ADR-11](ADR-11.md)), rechazar e historial. Con la marca habría dos bandejas, y una de ellas
escondida dentro del dashboard. Con la bandeja, el dashboard no cambia ni una línea, y el profesional gana
además la forma de **cerrar una petición sin mover la cita** (rechazar), que la propuesta dejaba fuera.

**Coste aceptado:** `SolicitudCita` pasa a tener dos significados, distinguidos por `tipo`; aceptar tiene
dos ramas; y la bandeja expone `tipo`, `citaOrigenId` y `citaOrigen` (`{ inicio, duracionMin, estado }`).

### 5. Regla innegociable: nada después de `inicio`

**El paciente no puede confirmar, cancelar ni pedir otra hora después del `inicio` vigente de la cita.**
Si pudiera, quien no se presentó convertiría a posteriori una cita sin cerrar en una `cancelada` y
**limpiaría su propio historial de RF-08**. Es la razón más fuerte de todo el diseño.

- Se hace cumplir en el **dominio** (regla 4 de la decisión 1), dentro de la transacción de la acción. El
  frontend la refleja vía `accionesPermitidas`, pero no es la defensa.
- **No se añade** ninguna regla de "cancelar con X horas de antelación". La bitácora guarda `ocurridoEn` e
  `inicio`: la antelación se calcula después, en RF-08.

**Regla de `ghosting` (G1).** Se documenta ahora; el job **no** se construye en esta fase (G4). Una cita es
`ghosting` si **(1)** sigue `pendiente` pasado el fin del día de la clínica de su `inicio`, **(2)** al
paciente se le envió al menos un recordatorio con enlace (estado `enviado` o `entregado`) y **(3)** no tiene
una petición de otra hora `recibida`. Si no se cumple, queda sin cerrar: neutra para el scoring. La
condición 3 es la regla que la propuesta dejaba anotada para el ADR del proceso de cierre (*"una petición
sin atender no es `ghosting`: el paciente avisó"*). Regla completa y fecha de corte en
[DT-11](../Deudas/DT-11.md); nota en [ADR-04 §4](ADR-04.md).

### 6. Canal: Q11 = B, el enlace viaja en el recordatorio

- **S0:** el sistema pone el enlace dentro de **cada** recordatorio (correo por Resend, [ADR-13](ADR-13.md)).
- **E5 — Un solo botón fijo:** texto `Ver o responder mi hora`, url `${FRONTEND_URL}/cita#${token}`. Nunca
  depende del estado de la cita, para que la plantilla siga siendo determinista entre reintentos (mismo
  recordatorio + misma versión del enlace ⇒ mismo contenido). Llena el bloque `accion` de
  [ADR-13 §12](ADR-13.md).
- **El seguimiento de clics sigue desactivado** en Resend: de lo contrario el enlace pasaría por un
  redirector del proveedor ([ADR-13 §12](ADR-13.md)).
- **Consentimiento ([DT-16](../Deudas/DT-16.md)): sigue como deuda**, por decisión del arquitecto. No se
  consulta antes de enviar. La propuesta anticipaba que con la salida B pasaría a bloqueante; esa nota ya
  se contradijo a sabiendas el 2026-09-30 y se mantiene así.

La tabla de salidas A / B / C de la propuesta se conserva en [US-02.07 §6](../US/02.07-paciente-reagenda-cancela.md).

### 7. Hechos publicados

- **Todos los hechos de la cita llevan el actor** en el payload (`actor: { tipo, id }`, con `id` nulo para
  `sistema`), y su `usuarioId` sale de la cita. Es lo que una alerta futura (RF-05) necesita para decir
  *"el paciente canceló"*.
- **Hecho nuevo `ReagendamientoSolicitado`** (`citaId`, `usuarioId` de la cita, `solicitudId`,
  `actor: { tipo: 'paciente', id: enlaceId }`), publicado por el módulo `solicitud`. RF-05 lo lista.
- Ningún hecho incluye el token ni su hash.
- Todos viajan por el **outbox** ([ADR-12](ADR-12.md)): DT-27 está cerrada desde la Fase 2. Suscriptores:
  el de recordatorios (ya existente: reagendar reprograma, cancelar anula) y el nuevo
  `SuscriptorSolicitudes` (decisión 4). Las alertas al profesional son de la Fase 4
  ([DT-43](../Deudas/DT-43.md)).

### 8. Módulos y dependencias: `portal-paciente` como composición

```
recordatorio    ──▶ cita        (EnlacesCitaService.asegurarActivo, dentro de la transacción del envío)
solicitud       ──▶ cita        (ya existía: agendar; nuevo: reagendarEnTx y lectura de la cita origen)
portal-paciente ──▶ cita, solicitud, y lectura de nombres de profesional y organización
cita            ──▶ (no importa solicitud, recordatorio ni portal-paciente)
```

- **`portal-paciente`** (`src/modules/portal-paciente/`) es un módulo de **composición**, sin dominio propio:
  su controller público (`publico/cita`, sin JWT) resuelve el enlace con `cita`, y para pedir otra hora y
  leer la petición abierta llama a `solicitud`. Así **no nace la dependencia `cita → solicitud`**, que con
  `solicitud → cita` ya existente sería un ciclo (opción F3).
- **`solicitud` se entera de que la cita terminó por el outbox** (suscriptor), no por una llamada desde
  `cita`.
- **Matiza [ADR-13 §1](ADR-13.md).** Hasta ahora `recordatorio` solo **leía** de los demás módulos, con SQL
  propio y sin importarlos. Desde esta fase importa `CitaModule` para obtener el token: la escritura en
  `enlaces_cita` la hace el módulo `cita`, a través de su servicio, no `recordatorio`.

### 9. Seguridad: por qué se rompe a propósito ADR-09 §8 regla 1

| | Solicitud pública (ADR-09) | Enlace por cita (este ADR) |
|---|---|---|
| Quién puede llegar | cualquiera con el slug (público a propósito) | solo quien recibió el recordatorio |
| Qué escribe | `solicitudes_cita` | **`citas`** (confirmar, cancelar) y `solicitudes_cita` (pedir otra hora) |
| Qué autoriza | nada: es una petición | una **capacidad delegada** sobre una cita |
| Enumeración | slug adivinable → respuesta uniforme | token no adivinable → respuesta uniforme igual |

**Justificación.** La regla 1 ("la vía pública solo escribe en `solicitudes_cita`") protege la agenda de la
**escritura anónima**. El enlace no es escritura anónima: es autoridad que el sistema entrega en nombre del
profesional, acotada a **una cita**, a **tres operaciones** y a una ventana que se cierra en `inicio`. Pedir
otra hora, además, sigue escribiendo solo en `solicitudes_cita`. La regla 1 queda **matizada, no
derogada**: sigue vigente para toda superficie pública que no porte una capacidad sobre una cita.

**Checklist de seguridad** (obligatorio en la Definición de Terminado del plan):

- el token nunca en la URL de la API, ni en logs, ni en hechos del outbox;
- ninguna ruta pública acepta ids del cliente: todo es `token → enlace → cita → tenant`;
- aislamiento: un enlace solo ve y actúa sobre su cita;
- nada después de `inicio` (dominio + test de aplicación);
- abrir la página nunca ejecuta una acción.

**Riesgo aceptado: enlace reenviado = capacidad transferida** ([DT-42](../Deudas/DT-42.md)). El enlace no
verifica identidad, igual que el RUT de la solicitud ([DT-23](../Deudas/DT-23.md)). Mitigaciones: datos
mínimos (decisión 2), invalidar desde el voucher (decisión 1, regla 5), ventana que termina en `inicio`,
límite por enlace (decisión 10) y una bitácora que registra que fue el paciente y con qué enlace.

**Concurrencia.** El enlace introduce un segundo actor que muta la misma cita en paralelo con el
profesional. La carga de la cita bloquea la fila (`SELECT … FOR UPDATE`) tanto en el esqueleto de mutación
como al resolver el enlace, y cada acción del paciente es **una** transacción que re-evalúa la validez y
`accionesPermitidas` dentro de ella: "paciente cancela" y "profesional reagenda" no se pisan, y si el
enlace se invalida o llega `inicio` entre la lectura y el clic, la acción no ocurre.

### 10. Límite de tasa (L1–L3)

Con 256 bits el límite no es la defensa contra la adivinanza, pero es obligatorio (ruido, coste, abuso de
un enlace filtrado). Se construye en esta fase con `@nestjs/throttler`, en memoria, para las cuatro
superficies públicas ([DT-18](../Deudas/DT-18.md)):

| Superficie | Clave | Límite |
|---|---|---|
| `/api/publico/cita*` (todas) | IP | 30 / minuto |
| `POST` de `/api/publico/cita/*` | enlace (sha256 de la cabecera) | 5 / hora |
| `POST /api/auth/login` | IP | 5 / minuto |
| `POST /api/usuarios` (registro) | IP | 5 / hora |
| `POST /api/publico/:tenantSlug/solicitudes` | IP | 5 / hora |

- **L2 — en memoria**, válido con **una réplica** en Railway. Con `app.set('trust proxy', 1)`: sin él,
  todas las IP serían la del proxy de Railway.
- **L3 —** el exceso responde un **429 genérico**. El throttler cuenta **peticiones**, no fallos: no hay
  bloqueo de cuenta por intentos fallidos (lo que pide [DT-04](../Deudas/DT-04.md) sigue abierto).
- Desactivable en tests **por configuración** (no parcheando cada test), con al menos un e2e que demuestre
  el 429.

---

## Qué NO cambia

- **Grafo de estados de ADR-04:** intacto. Ni estados nuevos ni transiciones nuevas en `Cita`.
- **Tabla `citas`:** sin cambios de esquema.
- **`cambios_cita`:** sin cambios de esquema; empieza a usar `actor_tipo = paciente` y `actor_id` con el id
  del enlace.
- **El dashboard del profesional:** `GET /api/citas/hoy` y `CitaDashboardDto` no cambian.
- **Rutas autenticadas del profesional:** mismo contrato. Solo hay cambios **aditivos**: `confirmadaPor` y
  `canceladaPor` en `GET /api/citas/:id`, `POST /api/citas/:id/enlace/invalidar`, el filtro `citaOrigenId` y
  los campos de reagendamiento en la bandeja.
- **La vía pública de ADR-09:** mismo contrato; gana el límite de tasa.
- **Aislamiento multi-tenant:** intacto. En las rutas autenticadas el tenant sale del JWT (ADR-01 §2); en
  las del enlace sale del enlace, nunca del cliente.

---

## Consecuencias

**Positivas:**

- El paciente confirma, cancela o pide otra hora sin llamar y sin cuenta, con un clic desde el correo que
  ya recibe.
- El historial de RF-08 queda protegido: nada después de `inicio`, y lo que hace el paciente se distingue
  en la bitácora de lo que hace el profesional.
- `ActorCambio.PACIENTE` y `SISTEMA` dejan de ser decorativos: el refactor del actor deja listo el job de
  cierre de DT-11 sin duplicar el esqueleto.
- El dashboard no cambia; la petición de otra hora usa la bandeja que el profesional ya conoce.
- El profesional conserva el control de la agenda: el paciente confirma o cancela lo suyo, pero **no
  mueve** nada.
- El límite de tasa llega a las cuatro superficies públicas, no solo a la nueva.

**Negativas / riesgos:**

- **Primera superficie sin sesión que modifica una cita.** Mitigada por la entropía del token, la ventana
  corta y el límite por enlace.
- **Enlace reenviado = capacidad transferida**, y una cancelación no se reabre ([DT-42](../Deudas/DT-42.md)).
- **Una clave nueva que custodiar** (`ENLACE_CITA_CLAVE`); cambiarla rompe en silencio los enlaces de los
  correos siguientes ([DT-45](../Deudas/DT-45.md)).
- **`SolicitudCita` con dos significados**, distinguidos por `tipo`.
- **El descarte de la petición abierta es eventual** (segundos, por el outbox; [DT-33](../Deudas/DT-33.md)):
  aceptar en ese intervalo una petición cuya cita ya terminó responde 409.
- **La petición se resuelve solo en la bandeja**, sin respuesta al paciente ([DT-44](../Deudas/DT-44.md)).
- **Sin aviso en tiempo real** al profesional ([DT-43](../Deudas/DT-43.md)).
- **Límite de tasa en memoria:** vale con una réplica; con más, hace falta un almacén compartido.
- **`actor_id` polimórfico** sin clave foránea: su significado depende de `actor_tipo`.
- **Enlaces y peticiones cerradas se acumulan** sin política de retención (amplía [DT-26](../Deudas/DT-26.md)).
- **El refactor del actor toca el esqueleto que usan todas las mutaciones del profesional**: exige que los
  tests existentes de `CitasService` sigan en verde sin cambiar su intención.

---

## Qué cambió respecto de la propuesta (2026-09-23)

| Tema | Propuesta (2026-09-23) | Aceptado (2026-10-14) | Por qué |
|---|---|---|---|
| Canal (Q11) | A (puente manual) o C (aplazar) | **B**: el enlace va en cada recordatorio | la Fase 2 creó el canal |
| Token | aleatorio, solo el hash, irrecuperable; reemitir rota | **HMAC recalculable**; en la base solo el hash | el mismo enlace en todos los recordatorios y una plantilla determinista entre reintentos |
| Emisión | a demanda, por el profesional (`POST /api/citas/:id/enlace-paciente`) | **perezosa, al enviar el primer recordatorio**; sin ruta de emisión | con Q11 = B nadie lo envía a mano |
| Cuando llega a quien no es | reemitir (rota el anterior) | **invalidar** desde el voucher; la versión siguiente llega con el próximo recordatorio | no hay "copiar enlace" (E4) |
| Validez | no revocado ∧ no terminal ∧ antes de `inicio` ∧ **antes de 30 días** | no revocado ∧ vigente ∧ antes de `inicio`; **sin tope** | el enlace nace cerca de la cita y muere en `inicio` |
| Revocación | en la transacción de toda transición a terminal | **ninguna explícita**: el estado ya lo invalida | ninguna transición futura tiene que acordarse |
| Confirmar | fuera (cambiaba la semántica de `ghosting`) | **entra** | la regla G1 fija esa semántica |
| Pedir otra hora | agregado `SolicitudReagendamiento` en `cita` | **`SolicitudCita` de tipo `reagendamiento`** en la bandeja | no vulnerar el dashboard; la bandeja ya existe |
| Marca para el profesional | campo en `CitaDashboardDto` y en el detalle | **nada en el dashboard**; nota en el voucher con la ruta existente | ídem |
| Atender la petición | al reagendar, en la misma transacción | al **aceptarla en la bandeja** (mueve la cita); rechazarla la cierra sin moverla | el profesional decide en un solo lugar |
| Descartar la petición | en la transacción de la transición a terminal | **suscriptor del outbox** | no crear la dependencia `cita → solicitud` |
| Dónde viven las rutas públicas | módulo `cita` | módulo de composición **`portal-paciente`** | ídem |
| Hash | SHA-256 sin clave; "HMAC no necesario hoy" | HMAC para derivar; SHA-256 para guardar | consecuencia del token recalculable |
| Límite de tasa | obligatorio antes del primer enlace real; política pendiente | **política fijada** (decisión 10) y se construye en esta fase | requisito del arquitecto |
| Peticiones sin atender y `ghosting` | regla anotada para el ADR de Q6 | **incorporada a G1** (condición 3) | ídem |

---

## Plan de ejecución

El orden de construcción por agente, las dependencias nuevas y la Definición de Terminado están en el plan
[US-04 § Orden de construcción](../US/04-respuesta-paciente.md#orden-de-construcción). En resumen:
`architecture-agent` (este ADR y el plan) → `backend-agent` (clave, `trust proxy`, CORS, redacción, cabeceras
y límite de tasa) → `database-agent` (`enlaces_cita` y cambios en `solicitudes_cita`) → `api-agent` (enlace,
refactor del actor, recordatorio, bandeja, suscriptor y `portal-paciente`) → `testing-agent`, con el frontend
en paralelo contra el mismo contrato.

---

## Notas de implementación (2026-10-15)

> Las decisiones de arriba **no cambian** salvo donde esta tabla lo dice. El código está **implementado y
> en producción** (commits `c757e0e` → `3b312f9`, mergeados a `develop` el 2026-10-15 y desplegados el
> 2026-10-17). Lo que existe, con su contrato exacto, está en
> [us04-respuesta-paciente](../Features/us04-respuesta-paciente.md); la tabla completa de desviaciones del
> plan (veinte, ninguna rediseña), en
> [us04 § Desviaciones](../Features/us04-respuesta-paciente.md#desviaciones-del-contrato-y-decisiones-tomadas-al-implementar).
> Aquí, solo las que tocan una decisión de este ADR.

| # | Decisión | Cómo quedó | Por qué |
|---|---|---|---|
| 1 | §3 y §9: la carga de la cita bloquea con `SELECT … FOR UPDATE` | **`FOR NO KEY UPDATE`**, en el esqueleto de mutación y en `resolver` | el `INSERT` en `enlaces_cita` toma `FOR KEY SHARE` sobre la cita (FK) y el envío del recordatorio mantiene su transacción abierta durante la llamada al proveedor: con `FOR UPDATE`, profesional y envío se esperarían. Serializa igual las mutaciones de la cita; probado con un caso de control |
| 2 | §1 regla 2 y *Decisiones abiertas*: rotación de `ENLACE_CITA_CLAVE` | **Autocorrección en `asegurarActivo`**: revoca el enlace de la clave anterior como revocación del sistema (`revocado_por` nulo) y emite la versión siguiente; si aun así no corresponde, lanza y el envío reintenta | es el cierre propuesto en [DT-45](../Deudas/DT-45.md); nunca sale un correo con un enlace que no resuelve |
| 3 | §4, *Descarte*: el portal "puede además" descartar la petición abierta en la misma transacción al cancelar | **No** lo hace: la descarta solo `SuscriptorSolicitudes` | bloquear la solicitud después de la cita invertiría el orden de la bandeja (solicitud → cita) y podría interbloquearse |
| 4 | §4 y *Decisiones abiertas*: reagendar desde el voucher con una petición abierta no la cierra ([DT-44](../Deudas/DT-44.md)) | `SuscriptorSolicitudes` también escucha `CitaReagendada`: si es del **profesional** y la petición se recibió **antes** (`recibidaEn ≤ ocurridoEn`), queda **atendida** (`aceptada`) | decisión del orquestador al implementar (2026-10-15), con la primera salida que proponía DT-44; resuelve su parte 2. Una petición hecha ya con la hora nueva la sigue decidiendo la bandeja |
| 5 | §8: nombres del profesional y la organización vía `usuario` / `tenant` "o un lector" | Lector SQL propio de **solo lectura** en `portal-paciente` (`SqlLectorNombresCita`); `solicitud` importa `PacienteModule` para copiar la ficha y **exporta** `SolicitudesOtraHoraService` | no ampliar la superficie de `usuario` y `tenant`; sin ciclos (`cita` sigue sin importar a nadie de los tres) |
| 6 | §10: límite de tasa desactivable en tests | Guard **global opt-in** (`@LimitarTasa`), cubos compartidos por nombre, `LIMITE_TASA_ACTIVO=false`; el 429 sale sin `no-store` / `no-referrer` (lo corta el guard antes del interceptor; no lleva datos) | una ruta sin marca no se limita; las e2e no se parchean una a una |
| 7 | §5: nada después de `inicio`, evaluado dentro del tx | Confirmar y cancelar lo **repiten** con un reloj nuevo justo antes de escribir; pedir otra hora usa el instante tomado al resolver | ventana de milisegundos; pedir otra hora no toca la cita ni su historial (R1) |

**Verificación (2026-10-15):** 1709 unitarios, 287 e2e y 139 de integración en verde, y un recorrido real en
local (backend, frontend y Postgres) de confirmar, pedir otra hora → aceptar en la bandeja (mueve la misma
cita y el mismo enlace sirve), cancelar e invalidar. Pendiente: el correo real con el botón y los escáneres de
enlaces de Gmail y Outlook ([checklist](../Fases/fase-3-us04-respuesta-paciente.md#checklist-de-salida-a-producción)).

---

## Decisiones que este ADR deja abiertas

**Resueltas al aceptar (2026-10-14):**

| Tema | Resolución |
|---|---|
| **Q11 — canal** | **B**: el enlace va en el recordatorio (S0) |
| **Tope absoluto de validez** | **ninguno**: la validez termina en `inicio` |
| **¿El paciente puede reemitir su enlace?** | **No.** Tampoco el profesional lo emite: solo puede invalidarlo |
| **¿Mostrar `tipoConsulta`?** | **No** (S2) |
| **`actorId` del paciente** | id del enlace |
| **¿El profesional puede cerrar una petición sin reagendar?** | **Sí**: la rechaza en la bandeja (R3) |
| **Confirmar la cita desde el enlace** | **Entra**, con la regla G1 |
| **Petición sin atender ≠ `ghosting`** | incorporada a G1 (condición 3) |
| **HMAC con clave del servidor** | **sí**, para derivar el token (E2) |

**Siguen abiertas:**

| Tema | Recomendación | Quién |
|---|---|---|
| **Que el paciente elija entre horarios disponibles** ([FD-06](../Frontend-Decisions/FD-06.md)) | no en la v1: "otra hora" es una petición manual. Necesita el modelo de disponibilidad (ADR-09, [Q9](../PREGUNTAS-ABIERTAS.md#q9--modelo-de-disponibilidad-no-construir--solo-evaluar)) | producto + arquitecto |
| **Avisar al paciente cuando se rechaza su petición** | después de revisar el consentimiento ([DT-44](../Deudas/DT-44.md), [DT-16](../Deudas/DT-16.md)) | arquitecto |
| ~~**Reagendar desde el voucher con una petición abierta**~~ | ~~hoy no la cierra ([DT-44](../Deudas/DT-44.md)): o el suscriptor trata `CitaReagendada`, o el voucher lleva a la bandeja~~ → **resuelta al implementar (2026-10-15):** el suscriptor la deja atendida ([nota 4](#notas-de-implementación-2026-10-15)) | arquitecto |
| **Plazo mínimo para cancelar** | no ahora; la antelación ya queda medible | producto |
| **El job de `ghosting`** | fuera de esta fase (G4); la regla queda escrita en [DT-11](../Deudas/DT-11.md) | Fase 5 |
| **Las `confirmada` que nadie cerró** (pregunta 2 de Q6) | G1 solo cubre las `pendiente`; sigue abierta | Fase 5 |
| **Peso de la confirmación del paciente frente a la del profesional** | iguales por ahora (G2); el peso se fija en el scoring | Fase 5 |
| **Rotación de `ENLACE_CITA_CLAVE`** | autocorrección en `asegurarActivo` ([DT-45](../Deudas/DT-45.md)) → **implementada (2026-10-15)** ([nota 2](#notas-de-implementación-2026-10-15)) | arquitecto → `api-agent` |
| **Almacén compartido del límite de tasa** | solo si hay más de una réplica | desarrollo |

---

## Pendiente para aceptar

> ✅ **Cumplido el 2026-10-14.**

El ADR pedía tres cosas para pasar de **Propuesto** a **Aceptado**. Las tres se cumplieron el 2026-10-14:

1. **Requisitos de seguridad del arquitecto** (la otra mitad de
   [Q11](../PREGUNTAS-ABIERTAS.md#q11--cómo-le-llega-al-paciente-el-enlace-de-su-cita)), respondidos como
   requisito:

   | Pregunta | Requisito fijado |
   |---|---|
   | Qué debe poder hacer el sistema cuando el enlace llega a quien no es | **S1:** el profesional lo **invalida** desde el voucher (sube la versión; el anterior deja de servir) |
   | ¿`tipoConsulta` y el nombre del profesional en un enlace reenviable? | **S2:** `tipoConsulta` **no**; el nombre del profesional **sí**; nunca nombre del paciente, RUT, contacto ni ids |
   | ¿Basta el transporte propuesto? | **S3:** sí —fragmento, `X-Enlace-Cita`, `no-store`, `no-referrer`, sin scripts de terceros, `history.replaceState`— **más** una exigencia nueva: abrir la página nunca ejecuta una acción |
   | Política de límite de tasa | **L1–L3:** la tabla de la decisión 10 |
   | ¿SHA-256 sin clave o HMAC? | **HMAC** para derivar el token, recalculable (E2); en la base, el SHA-256 del token |

2. **Respuesta a Q11:** **B** (2026-10-14). [DT-16](../Deudas/DT-16.md) **no** pasa a bloqueante: sigue como
   deuda por decisión del arquitecto.
3. **Confirmación del equipo** de las recomendaciones: hecha por el arquitecto (tabla *Resueltas al
   aceptar*).

---

## Referencias

- [US-04](../US/04-respuesta-paciente.md): plan vigente (contrato, orden de construcción, Definición de
  Terminado).
- [US-02.07](../US/02.07-paciente-reagenda-cancela.md): análisis original §1–§9, absorbido por US-04.
- [ADR-09](ADR-09.md): §1 (`SolicitudCita`), §5 (`reagendar`), §6 (bitácora), §8 (vía pública y respuesta
  uniforme), §10 (etiqueta de los campos libres).
- [ADR-04](ADR-04.md): grafo de estados y terminales; materialización del `ghosting` (§4).
- [ADR-12](ADR-12.md): outbox y suscriptores (§4); el job de cierre (§8).
- [ADR-13](ADR-13.md): §1 (dependencias del módulo `recordatorio`), §9 (idempotencia del envío), §12
  (bloque `accion`, seguimiento de clics).
- [ADR-03](ADR-03.md) §5: respuesta genérica, no enumeración.
- [ADR-06](ADR-06.md): `TransactionRunner`.
- [ADR-07](ADR-07.md): `inicio` en la zona de la clínica.
- [ADR-02](ADR-02.md): hexagonal y español — `EnlaceCita` en `cita/domain/`.
- `src/modules/cita/application/citas.service.ts` (`mutar`, `registrarCambio`, `publicar`),
  `src/modules/cita/domain/cambio-cita.entity.ts` (`ActorCambio`),
  `src/modules/recordatorio/application/plantilla-recordatorio.ts` (`accion`),
  `src/modules/solicitud/domain/solicitud-cita.entity.ts`.
- RF-05 (alertas), RF-06 (recordatorios), RF-07 (respuesta del paciente), RF-08 (calificación de asistencia).

---

## Deudas técnicas asociadas

**Implementa:** [DT-18](../Deudas/DT-18.md) — el límite de tasa se construye en esta fase para las cuatro
superficies públicas (*2026-10-17: en producción; se cierra con la prueba de `trust proxy`*).

**Depende de:** [DT-19](../Deudas/DT-19.md) — la redacción de `x-enlace-cita` se suma a la política de logs
existente.

**Toca:** [DT-11](../Deudas/DT-11.md) — la regla G1 y la fecha de corte (el despliegue de esta fase); el
refactor del actor le deja listo `ActorCambio.SISTEMA` · [DT-16](../Deudas/DT-16.md) — sigue como deuda; el
enlace no consulta el consentimiento · [DT-23](../Deudas/DT-23.md) — el enlace, como el RUT, no verifica
identidad · [DT-26](../Deudas/DT-26.md) — se amplía a `enlaces_cita` y a las peticiones de otra hora ·
[DT-33](../Deudas/DT-33.md) — el descarte de la petición por el suscriptor tarda segundos ·
[DT-04](../Deudas/DT-04.md) — el login gana límite por IP, no por cuenta.

**Previstas, ya fichadas (2026-10-14):**

| Prevista de la propuesta | Destino |
|---|---|
| 1. Enlace reenviado = capacidad transferida | **[DT-42](../Deudas/DT-42.md)** (riesgo aceptado; sigue vigente) |
| 2. Sin aviso en tiempo real al profesional mientras RF-05 esté fuera | **[DT-43](../Deudas/DT-43.md)** (sigue vigente; se cierra en la Fase 4) |
| 3. Peticiones sin descarte explícito por el profesional | **desaparece**: la petición vive en la bandeja y el profesional la rechaza (R3); además se descarta sola cuando la cita termina |
| 4. Bloqueo de fila en el esqueleto de mutación, si no entraba en el mismo release | **desaparece**: el `SELECT … FOR UPDATE` entra en esta fase y está en la Definición de Terminado |

**Nuevas del diseño aceptado:** [DT-44](../Deudas/DT-44.md) (la petición de otra hora se resuelve solo en la
bandeja y en silencio para el paciente) · [DT-45](../Deudas/DT-45.md) (cambiar `ENLACE_CITA_CLAVE` rompe en
silencio los enlaces de los correos siguientes). *(2026-10-15: DT-44 perdió su parte 2 y DT-45 tiene su
corrección implementada; ver [Notas de implementación](#notas-de-implementación-2026-10-15).)*

Índice completo: [`../Deudas/README.md`](../Deudas/README.md).
