# ADR-10: El paciente actúa sobre su cita con un enlace por cita — cancela con la transición existente y pide reagendar sin mover la cita

**Fecha:** 2026-09-23
**Estado:** **Propuesto** · sin implementar · pendiente de [H7](../PREGUNTAS-ABIERTAS.md) y
[Q11](../PREGUNTAS-ABIERTAS.md) (ver [Pendiente para aceptar](#pendiente-para-aceptar))
**Commits:** — (pendiente)
**Subtarea:** [US-02.07](../US/02.07-paciente-reagenda-cancela.md) — *subtarea de US-02 (gestión de
citas)*, no una historia propia.
**Relación:** **matiza** [ADR-09](ADR-09.md) §8 regla 1 (la vía pública solo escribe en
`solicitudes_cita`) · **se apoya en** [ADR-04](ADR-04.md) sin tocar su grafo · **replica** la
atomicidad de [ADR-06](ADR-06.md) y la respuesta uniforme de [ADR-03](ADR-03.md) §5 · **no depende**
de [ADR-08](ADR-08.md) (el enlace no lleva `tenantSlug`).

> **Sobre el número.** [Q6](../PREGUNTAS-ABIERTAS.md) (planificador del proceso de cierre) también
> anticipaba un "ADR-10". Como este se escribió primero, toma el 10; el ADR de Q6 usa el siguiente
> número libre.

> **Qué es y qué no es este ADR.** Convierte en decisión propuesta el análisis de §1 a §9 de
> [US-02.07](../US/02.07-paciente-reagenda-cancela.md); no lo reinventa. Las tablas de opciones
> completas viven allí; aquí queda la decisión, su porqué y lo que se descartó.

---

## Contexto

RF-07 dice: *"el paciente confirma, cancela o **solicita reagendar** desde el recordatorio"*. La frase
da por hecho dos cosas que no existen:

1. **Un canal hacia el paciente.** RF-06 (recordatorios) está fuera del MVP. Es [Q11](../PREGUNTAS-ABIERTAS.md).
2. **Una forma de saber que quien pulsa el botón es el paciente de esa cita.** No hay cuenta, ni
   token, ni código. Es el hueco de fondo.

US-02.07 recorta RF-07 a **cancelar** y **pedir reagendar** (confirmar queda fuera, ver
[Decisiones abiertas](#decisiones-que-este-adr-deja-abiertas)).

### Lo que hay hoy (verificado en el código, 2026-09-23)

| Pieza | Estado |
|---|---|
| `Cita.cancelar()`, `Cita.reagendar()` | existen; legales solo desde `pendiente \| confirmada` (ADR-04, ADR-09 §5) |
| Bitácora `cambios_cita` | append-only, misma transacción que la mutación (ADR-09 §6) |
| `ActorCambio.PACIENTE` / `SISTEMA` | en el enum, **nadie los usa** |
| `CitasService.registrarCambio()` | fija siempre `ActorCambio.PROFESIONAL` y `actorId` = usuario del token |
| `CitasService.publicar()` | el `usuarioId` del hecho sale del **token**, no de la cita; el hecho **no lleva actor** |
| `CitasService.mutar()` | carga la cita por `(citaId, tenantId del token)`; recibe un `AuthenticatedUser` |
| `cambios_cita.actor_id` | `uuid`, nullable, sin clave foránea |
| Vía pública | solo `POST /api/publico/:tenantSlug/solicitudes`, sin límite de tasa ([DT-18](../Deudas/DT-18.md)) |
| Política de logs | no existe ([DT-19](../Deudas/DT-19.md)) |
| `GET /api/citas/:id` | **en construcción en paralelo** para [US-02.08](../US/02.08-voucher-cita.md), con `accionesPermitidas` |

### La observación que acota el problema

Hasta hoy la única superficie sin sesión escribe en una tabla aislada donde *"todavía no existe
nada"* (ADR-09 §1). US-02.07 abre la **primera superficie sin sesión que modifica una cita real**.
Eso solo es aceptable si quien llega **no es anónimo**: tiene que traer una autoridad que el
profesional le entregó, acotada a una cita y a dos operaciones.

---

## Opciones evaluadas

### A. Cómo se identifica el paciente frente a una cita

| Opción | Veredicto |
|--------|-----------|
| **A1. Token opaco por cita en el enlace (ELEGIDA)** | Un clic, no expone RUT, no hay nada que enumerar. Es **la misma pieza que RF-06 necesitará** en cada recordatorio: no es trabajo desechable. |
| **A2. RUT + código enviado al contacto** | **Descartada para esta fase.** Necesita el canal de envío, que es justo lo que no hay. Una pantalla "escribe tu RUT" mal hecha permite sondear qué RUT es paciente de qué profesional de la salud (lo que ADR-09 §8 regla 6 evita). Queda como camino si se exige verificar identidad. |
| **A3. Esperar a RF-06** | **Descartada como opción única.** El mecanismo de A1 habría que construirlo igual. Válida como *secuencia* si Q11 se responde "no hay canal en la v1". |

### B. Dónde vive la petición de reagendamiento

| Opción | Veredicto |
|--------|-----------|
| **B1. Reutilizar `solicitudes_cita`** | **Descartada.** Ese agregado significa *"no existe nada"* y aceptarlo *crea* una cita; aquí la cita existe y atender la petición la *mueve*. Exige RUT, contacto y consentimiento que ya están en la cita; sobrecarga `citaId`; y la regla anti-spam por RUT bloquearía a quien tenga a la vez una solicitud nueva abierta. Es mezclar dos ciclos de vida opuestos, el error que ADR-09 evitó. |
| **B2. Solo una fila en la bitácora** | **Descartada.** La bitácora registra cambios de la cita y una petición no cambia nada. Saber "¿hay una petición abierta?" obligaría a derivarlo de la secuencia de la bitácora en cada lectura del dashboard. |
| **B3. Agregado propio `SolicitudReagendamiento` en el módulo `cita` (ELEGIDA)** | Una tabla pequeña, vocabulario propio, sin tocar `SolicitudCita` ni el grafo de `Cita`. |
| **B4. Estado nuevo en `Cita` (`reagendamiento_solicitado`)** | **Descartada.** Obliga a revisar todas las transiciones de ADR-04 y el job de cierre, y hace que una cita confirmada deje de estarlo solo porque el paciente preguntó. |

### C. Transporte del token hacia la API

| Opción | Veredicto |
|--------|-----------|
| **C1. En la ruta o en la query de la API** (`/api/publico/citas/<token>`) | **Descartada.** Las URL terminan en logs de acceso, historiales, proxies y `Referer`, y no hay política de logs (DT-19). |
| **C2. `Authorization: Bearer <token>`** | **Descartada.** Choca con la semántica del JWT del profesional y con Passport: dos significados distintos para la misma cabecera en el mismo backend invitan a que un guard acepte lo que no debe. |
| **C3. En el cuerpo** | **Descartada como mecanismo único.** Obliga a que *leer* la cita sea un `POST`, y mezcla la credencial con los datos de la operación. |
| **C4. Cabecera dedicada `X-Enlace-Cita` (ELEGIDA)** | Funciona igual para leer y para escribir, no aparece en URLs, es fácil de redactar en logs por nombre, y no se confunde con la credencial del profesional. Coste: dispara preflight CORS y hay que permitir la cabecera. |

### D. Hash del token

| Opción | Veredicto |
|--------|-----------|
| **D1. SHA-256 sin sal, búsqueda por igualdad del hash (ELEGIDA)** | Con 256 bits de entropía, invertir el hash o probar candidatos es inviable: la lentitud no aporta nada. Permite índice único y búsqueda directa. |
| **D2. Hash lento (bcrypt / argon2)** | **Descartada.** Existe para secretos de baja entropía (contraseñas). Con sal no se puede buscar por índice: obligaría a añadir un identificador en claro al token y a pagar CPU en cada petición anónima, lo que además regala un vector de denegación de servicio. |
| **D3. HMAC-SHA-256 con clave del servidor** | **No necesaria hoy.** Añadiría defensa si se filtrara la base *y* la entropía fuera baja; no es el caso. Coste: gestión y rotación de una clave más. Migrable después sin cambiar el contrato. |

---

## Decisión (propuesta)

### 1. Enlace por cita: token opaco, una cita, solo el hash

Entidad nueva **`EnlaceCita`** en `src/modules/cita/domain/` (ADR-02). Vive en el módulo `cita` y no
en uno propio porque su revocación tiene que ocurrir **dentro de las transacciones de `cita`**: un
módulo aparte crearía una dependencia circular (cita revoca enlace, enlace opera cita).

```
EnlaceCita
├─ id                 ← uuid; es el actorId del paciente en la bitácora (decisión 3)
├─ citaId, tenantId   ← el token resuelve cita → tenant; nunca se piden al cliente
├─ tokenHash          ← SHA-256 del token, índice único
├─ emitidoEn, expiraEn
├─ emitidoPorTipo, emitidoPorId   ← profesional (usuarioId) · sistema (RF-06)
├─ revocadoEn?
└─ motivoRevocacion?  ← reemitido · cita_terminal
```

**Las ocho reglas:**

1. **Alcance: una cita.** El token no da acceso a otras citas del mismo paciente, ni a su ficha, ni
   al tenant. Todo acceso se resuelve `token → enlace → cita`, sin aceptar ningún id del cliente.
2. **Secreto de 256 bits** de un generador criptográfico (`crypto.randomBytes(32)`), codificado en
   base64url (43 caracteres). El requisito mínimo es 128 bits; se toman 256 porque el margen no cuesta
   nada. **Se guarda solo el SHA-256** (opción D1): una fuga de la base no entrega enlaces utilizables.
3. **Emisión a demanda, no al crear la cita.** Como solo se guarda el hash, el enlace no se puede
   "volver a mostrar": se **emite** cuando el profesional (o, el día de RF-06, el sistema) lo necesita.
   **Emitir uno nuevo revoca el anterior en la misma transacción.** Como máximo un enlace activo por
   cita, garantizado en la base (índice único parcial sobre `cita_id` donde `revocado_en IS NULL`).
   El paciente **no** puede reemitir su propio enlace.
4. **Validez = enlace no revocado ∧ cita no terminal ∧ ahora < `inicio` ACTUAL de la cita ∧ ahora <
   `expiraEn`.** El tope absoluto se propone en **30 días desde la emisión**, configurable
   (`ENLACE_CITA_VIGENCIA_DIAS`). "Antes de `inicio`" se evalúa contra el `inicio` **vigente**, no el
   de la emisión: si el profesional reagenda, el mismo enlace sirve para la hora nueva. Si la cita
   está a más de 30 días, el enlace vence antes de `inicio` y se reemite (o lo emite el recordatorio
   de RF-06 cerca de la fecha). La comparación
   es entre instantes (`timestamptz` contra reloj del servidor): no depende de la zona de la clínica.
   **Esta regla vive en el dominio**, no en el controller ni en el frontend (ver decisión 5).
5. **Revocación en la misma transacción que toda transición a terminal**: `cancelar` (cualquier
   actor), `marcarAsistencia`, `marcarInasistencia` y `marcarGhosting` (el job de
   [DT-11](../Deudas/DT-11.md) incluido). Se engancha en el esqueleto común de mutación, no en cada
   caso de uso, para que ninguna transición futura lo olvide. `reagendar` **no** revoca.
6. **Respuesta uniforme para todo token no válido**: cabecera ausente, formato incorrecto,
   inexistente, vencido, revocado o de cita terminal → **el mismo 404 genérico**, mismo cuerpo. Un
   token con formato inválido se rechaza sin tocar la base, con la misma respuesta. Es la regla de
   ADR-03 §5 y ADR-09 §8 regla 6 aplicada a esta superficie.
7. **El token nunca en la URL de la API.**
   - El enlace que recibe el paciente lo lleva en el **fragmento**: `https://<frontend>/cita#<token>`.
     El navegador no envía el fragmento al servidor ni lo incluye en `Referer`.
   - El frontend lo lee y lo envía a la API **en la cabecera `X-Enlace-Cita`** (opción C4), en todas
     las rutas públicas de esta subtarea.
   - Respuestas de la API con `Cache-Control: no-store` y `Referrer-Policy: no-referrer`; la cabecera
     `X-Enlace-Cita` se añade a las permitidas por CORS (tarea de `backend-agent`).
   - Todo logger o interceptor, presente o futuro, **redacta** `X-Enlace-Cita` igual que
     `Authorization` (condición para cerrar DT-19 en esta superficie). La respuesta de emisión tampoco
     se registra.
   - Contrato con el frontend: la página del paciente **no carga scripts de terceros** (analítica,
     píxeles), porque cualquier script de la página puede leer `location.hash`. Recomendado limpiar el
     fragmento del historial tras leerlo (`history.replaceState`).
8. **No necesita `tenantSlug`.** El token resuelve cita → tenant; pedir además el slug solo añade
   superficie. Por eso este ADR no depende de ADR-08.

**Rutas (forma indicativa; los nombres exactos los fija `api-agent`):**

| Ruta | Autenticación | Efecto |
|---|---|---|
| `POST /api/citas/:id/enlace-paciente` | JWT del profesional, filtrado por tenant del token | emite (y rota) el enlace; devuelve el token **una sola vez**; 409 si la cita es terminal o ya pasó su `inicio` |
| `GET /api/publico/cita` | `X-Enlace-Cita` | ver la cita (decisión 2) |
| `POST /api/publico/cita/cancelar` | `X-Enlace-Cita` | cancelar (decisión 3) |
| `POST /api/publico/cita/reagendamiento` | `X-Enlace-Cita` | pedir reagendar (decisión 4) |

La validación del enlace se repite **dentro de la transacción** de la acción, no solo en un guard
previo: si el enlace se revoca o llega `inicio` entre la lectura y el clic, la acción no ocurre.

### 2. Qué ve el paciente: lo mínimo para reconocer la cita

El enlace **puede reenviarse**, así que se trata como si lo fuera a leer un tercero.

| Se muestra | No se muestra |
|---|---|
| `inicio` + zona de la clínica (para mostrarla en su hora, [ADR-07](ADR-07.md)), `duracionMin`, `estado` | RUT, teléfono, correo, **nombre del paciente** |
| nombre de la organización y del profesional | `tipoConsulta` |
| la petición de reagendamiento abierta, si la hay (preferencia y fecha) | historial de la cita, otras citas |
| `accionesPermitidas` del paciente (`cancelar`, `solicitarReagendamiento`) calculadas por el backend | `tenantId`, `usuarioId`, `pacienteId`, id del enlace, cualquier id interno |

- **`tipoConsulta` no se muestra.** Es texto libre del profesional y puede ser dato de salud explícito
  ("control de embarazo", "psiquiatría"); en un enlace reenviable no aporta nada que el paciente no
  sepa.
- **El nombre del paciente tampoco.** Junto al nombre del profesional vincula a una persona concreta
  con una atención de salud; el paciente ya sabe cómo se llama.
- **`accionesPermitidas` lo calcula el backend**, igual que en el detalle de US-02.08: así la regla
  "nada después de `inicio`" no se duplica en el frontend. El frontend las pinta; la API las vuelve a
  exigir.

### 3. Cancelar por el paciente = la misma transición `Cita.cancelar()`

- **Misma regla de dominio**, sin copia: legal desde `pendiente | confirmada`. Desde terminal no hay
  caso: el enlace ya está revocado y responde 404 (decisión 1, reglas 5 y 6).
- **Bitácora:** `actorTipo = PACIENTE`, **`actorId` = id del `EnlaceCita` usado**. Permite saber con
  qué enlace se hizo sin guardar nada del paciente. `actor_id` pasa a ser una referencia polimórfica
  cuyo significado lo da `actor_tipo` (usuario si `profesional`, enlace si `paciente`, nulo si
  `sistema`); se documenta así en la entidad. *(Alternativa: nulo. Se prefiere el id porque es lo
  único que permite rastrear un enlace reenviado.)*
- **`motivo` opcional y acotado** (orden de 200–300 caracteres, con `MaxLength` en el DTO público) y
  con la misma advertencia de etiqueta que ADR-09 §10: no invitar a escribir detalle médico.
- **Efectos en la misma transacción:** revocar el enlace y descartar la petición de reagendamiento
  abierta, si la hay (decisión 1 regla 5, decisión 4).
- Publica `CitaCancelada` **con actor** (decisión 7).

**Refactor obligatorio, no opcional.** `mutar()`, `registrarCambio()` y `publicar()` dejan de recibir
un `AuthenticatedUser` y pasan a recibir un **actor**:

```
Actor = { tipo: PROFESIONAL, usuarioId }
      | { tipo: PACIENTE,    enlaceId  }
      | { tipo: SISTEMA }
```

más el `tenantId` con el que se carga la cita (del token JWT para el profesional, del enlace para el
paciente, de la propia fila para el job de cierre, que barre todos los tenants). El `usuarioId` del
hecho publicado sale de **`cita.usuarioId`**, no del token. Resultado: un solo esqueleto de mutación
para el profesional, el paciente y el job de [DT-11](../Deudas/DT-11.md) (`ActorCambio.SISTEMA`), sin
duplicarlo. Si el esqueleto queda en `CitasService` o se extrae a un colaborador interno lo decide
`api-agent`; lo que no se admite es una segunda copia.

### 4. Reagendar por el paciente = una petición, no un movimiento

Coherente con RF-07 (*"solicita reagendar"*) y con ADR-09 decisión B1 (*el paciente pide, no
reserva*): la cita **no se mueve ni cambia de estado**. El profesional ve la petición y, si procede,
usa el `reagendar` que ya existe con la hora que él fije.

Agregado nuevo **`SolicitudReagendamiento`** en `src/modules/cita/domain/` (opción B3):

```
SolicitudReagendamiento
├─ id, citaId, tenantId
├─ enlaceId            ← con qué enlace se pidió
├─ preferencia         ← texto libre acotado ("jueves en la tarde")
├─ motivo?             ← opcional, acotado, misma etiqueta que ADR-09 §10
├─ estado              ← abierta · atendida · descartada
├─ creadaEn, cerradaEn?
```

- **Una sola petición abierta por cita**, garantizada en la base (índice único parcial sobre `cita_id`
  donde `estado = 'abierta'`). Una segunda petición con otra abierta → **409** genérico. *(Aquí no
  aplica la respuesta uniforme: quien llega ya demostró tener el enlace, y la existencia de la
  petición es información suya.)*
- **Atendida** cuando el profesional reagenda la cita, **en la misma transacción** de `reagendar`.
- **Descartada** cuando la cita llega a terminal, en la misma transacción que esa transición.
- **La cita confirmada sigue `confirmada`** mientras la petición está abierta. Sin estado nuevo en el
  grafo de ADR-04; la petición se muestra como marca aparte (decisión 8).
- No escribe en `cambios_cita`: la petición no cambia la cita. Su propia tabla —que no se borra al
  cerrarse— es el registro de que el paciente avisó, disponible para RF-08.
- Vocabulario deliberadamente distinto de `SolicitudCita` (`recibida · aceptada · rechazada`) para que
  no se confundan dos agregados con ciclos de vida opuestos.

### 5. Regla innegociable: nada después de `inicio`

**El paciente no puede cancelar ni pedir reagendar después del `inicio` vigente de la cita.** Si
pudiera, quien no se presentó convertiría a posteriori un `ghosting` —o una cita que nadie cerró— en
una `cancelada`, y **limpiaría su propio historial de RF-08**. Es la razón más fuerte de todo el
diseño.

- Se hace cumplir en el **dominio** (la validez del enlace de la decisión 1 regla 4), dentro de la
  transacción de la acción. El frontend la refleja vía `accionesPermitidas`, pero no es la defensa.
- **No se añade** ninguna regla de "cancelar con X horas de antelación". La bitácora guarda
  `ocurridoEn` e `inicio`: la antelación se calcula después, en RF-08. Un plazo mínimo sería una
  decisión de producto aparte.
- **No se decide aquí:** *"una petición de reagendamiento sin atender no debería terminar en
  `ghosting`"* (el paciente avisó; el silencio fue del profesional). Es una regla del proceso de
  cierre y **se anota para el ADR de [Q6](../PREGUNTAS-ABIERTAS.md)**, que tendrá que consultar las
  peticiones abiertas antes de marcar.

### 6. Canal: el diseño no depende de quién entrega el enlace

[Q11](../PREGUNTAS-ABIERTAS.md) **sigue abierta** y es decisión de producto. Este ADR se diseña para
que su respuesta cambie **el alcance, no el diseño**: el enlace es el mismo, solo cambia quién llama
a "emitir".

| Respuesta a Q11 | Quién emite | Quién envía | Alcance de la implementación |
|---|---|---|---|
| **A. Puente manual** | el profesional, desde el voucher ([US-02.08](../US/02.08-voucher-cita.md)) | el profesional, por su WhatsApp | todo este ADR + botón "emitir enlace" en el voucher |
| **B. RF-06 en el MVP** | el sistema, en cada recordatorio | **Citia** | todo este ADR; la ruta de emisión manual pasa a ser secundaria |
| **C. Aplazar US-02.07** | — | — | no se implementa; el ADR queda propuesto hasta que exista canal |

> **Consentimiento ([DT-16](../Deudas/DT-16.md)).** Con **A**, quien escribe al paciente es el
> profesional, desde su propio canal, como hoy: Citia no contacta a nadie y el consentimiento no
> actúa como puerta del envío. Con **B**, escribe **Citia**, y el consentimiento pasa a ser condición
> legal de cada envío: DT-16 se vuelve bloqueante para B, no para este ADR.

La salida A es, reconocidamente, el mensaje manual que el producto promete eliminar (criterio 1 de
[fase 0](../Descripcion/fase-0-problema.md)); se acepta solo como puente.

### 7. Hechos publicados

- **`CitaCancelada` lleva el actor** en el payload (`actor: { tipo, id }`). Es lo que una alerta
  futura (RF-05) necesita para decir *"el paciente canceló"*. El resto de hechos de mutación lo
  llevan también, por salir del mismo esqueleto.
- **Hecho nuevo `ReagendamientoSolicitado`** (`citaId`, `usuarioId` de la cita, `solicitudId`,
  actor paciente). RF-05 lo lista explícitamente.
- Ningún hecho incluye el token ni su hash.
- **Sin suscriptores** todavía: el profesional se entera al mirar el dashboard o el voucher.
  [DT-27](../Deudas/DT-27.md) (hecho publicado fuera de la transacción) sigue inofensiva mientras
  nadie escuche; estos son exactamente los hechos que la primera alerta no podrá perder.

### 8. Marca de petición abierta para el profesional

- **`GET /api/citas/hoy`**: `CitaDashboardDto` gana un campo con la petición abierta (p. ej.
  `reagendamientoSolicitado: { preferencia, solicitadoEn } | null`). La cancelación por el paciente
  **no necesita backend**: el endpoint no filtra por estado y la cita ya aparece `cancelada`
  (US-02.09, frontend).
- **`GET /api/citas/:id`** (en construcción ahora para US-02.08, con `accionesPermitidas`): **crecerá
  con la misma marca** y, según Q11, con la acción "emitir enlace". Es un cambio **aditivo**: ningún
  campo existente cambia de nombre, tipo ni significado.
- Consulta sin N+1: la marca se resuelve en la misma lectura del día (join o una segunda consulta por
  lote), no una consulta por cita.
- **Sin tiempo real.** El dashboard se entera cuando vuelve a consultar; el aviso en vivo es RF-05.

### 9. Seguridad: por qué se rompe a propósito ADR-09 §8 regla 1

| | Solicitud pública (ADR-09) | Enlace por cita (este ADR) |
|---|---|---|
| Quién puede llegar | cualquiera con el slug (público a propósito) | solo quien recibió el enlace |
| Qué escribe | `solicitudes_cita` | **`citas`** (cancelar) y `solicitudes_reagendamiento` |
| Qué autoriza | nada: es una petición | una **capacidad delegada** por el profesional sobre una cita |
| Enumeración | slug adivinable → respuesta uniforme | token no adivinable → respuesta uniforme igual |

**Justificación.** La regla 1 ("la vía pública solo escribe en `solicitudes_cita`") protege la agenda
de la **escritura anónima**. El enlace no es escritura anónima: es autoridad que el profesional
delega explícitamente —la emite él, o el sistema en su nombre—, acotada a **una cita**, a **dos
operaciones**, y a una ventana que se cierra en `inicio`. La regla 1 queda **matizada, no derogada**:
sigue vigente para toda superficie pública que no porte una capacidad emitida por el profesional.

**Límite de tasa ([DT-18](../Deudas/DT-18.md)).** Con 256 bits no es la defensa contra la adivinanza,
pero sigue siendo obligatorio (ruido, coste, abuso de un enlace filtrado): por origen en las rutas
públicas y por enlace en las acciones. **Mismo disparador que DT-18: bloqueante antes de enviar el
primer enlace fuera del equipo.** La política concreta la define H7.

**Riesgo aceptado: enlace reenviado = capacidad transferida.** El enlace no verifica identidad, igual
que el RUT de la solicitud ([DT-23](../Deudas/DT-23.md)). Si llega a quien no es, un tercero puede
cancelar, y una cita cancelada no se reabre (ADR-04). Mitigaciones: datos mínimos (decisión 2),
rotación al reemitir (decisión 1 regla 3), ventana que termina en `inicio`, y la bitácora registra
que fue el paciente y con qué enlace. El cierre real es el mismo que DT-23: el canal verificado de
RF-06.

**Concurrencia.** El enlace introduce un segundo actor que muta la misma cita en paralelo con el
profesional (y, más adelante, con el job de cierre). La carga de la cita en el esqueleto de mutación
debe bloquear la fila dentro de la transacción (`SELECT … FOR UPDATE` en el adaptador) para que
"paciente cancela" y "profesional reagenda" no se pisen dejando la bitácora incoherente.

---

## Qué NO cambia

- **Grafo de estados de ADR-04:** intacto. Ni estados nuevos ni transiciones nuevas.
- **Tabla `citas`:** sin cambios de esquema.
- **`cambios_cita`:** sin cambios de esquema; empieza a usar `ActorCambio.PACIENTE` y `actor_id` con
  el id del enlace.
- **Rutas autenticadas del profesional:** mismo contrato; solo cambia la firma interna del esqueleto.
- **`SolicitudCita` y la vía pública de ADR-09:** intactas.
- **Aislamiento multi-tenant:** intacto. En las rutas autenticadas el tenant sigue saliendo del JWT
  (ADR-01 §2); en las del enlace sale del enlace, nunca del cliente.

---

## Consecuencias

**Positivas:**

- El paciente avisa sin llamar y sin cuenta, con un clic.
- El historial de RF-08 queda protegido: nada después de `inicio`, y la cancelación del paciente se
  distingue de la del profesional en la bitácora.
- `ActorCambio.PACIENTE` y `SISTEMA` dejan de ser decorativos: el refactor del actor desbloquea
  también el job de cierre de DT-11 sin duplicar el esqueleto.
- El enlace es la pieza que RF-06 necesita en cada recordatorio: la respuesta a Q11 cambia el
  alcance, no el diseño.
- El profesional conserva el control de la agenda: el paciente cancela lo suyo, pero **no mueve**
  nada.

**Negativas / riesgos:**

- **Primera superficie sin sesión que modifica una cita.** Más superficie de ataque que la de ADR-09,
  mitigada por la entropía del token y la ventana corta.
- **Enlace reenviado = capacidad transferida**, y una cancelación no se reabre (riesgo aceptado,
  decisión 9).
- **Dos tablas nuevas** (`enlaces_cita`, `solicitudes_reagendamiento`) en el módulo `cita`.
- **`actor_id` polimórfico** sin clave foránea: su significado depende de `actor_tipo`.
- **Con el puente manual (Q11-A)** el profesional sigue enviando un mensaje a mano.
- **Sin aviso en tiempo real**: una cancelación a última hora solo se ve si el profesional mira.
- **Dependencia operativa de DT-18**: sin límite de tasa no se puede enviar ningún enlace real.
- **Enlaces y peticiones cerradas se acumulan** sin política de retención (amplía DT-26).
- **El refactor del actor toca el esqueleto que usan todas las mutaciones del profesional**: exige
  que los tests existentes de `CitasService` sigan en verde sin cambiar su intención.

---

## Plan de ejecución (cuando se acepte)

| # | Agente | Pieza |
|---|---|---|
| 1 | `database-agent` | migraciones: `enlaces_cita` (hash único, cita, tenant, emisión, expiración, revocación, emisor; índice único parcial de enlace activo por cita) y `solicitudes_reagendamiento` (índice único parcial de abierta por cita) |
| 2 | `api-agent` | dominio: `EnlaceCita` (emitir, validar contra la cita, revocar), `SolicitudReagendamiento`; refactor del actor en el esqueleto de mutación; revocación y descarte en toda transición a terminal; atención en `reagendar`; bloqueo de fila |
| 3 | `api-agent` | emisión autenticada `POST /api/citas/:id/enlace-paciente` |
| 4 | `api-agent` | rutas públicas con `X-Enlace-Cita`, respuesta uniforme, DTO mínimo con `accionesPermitidas` |
| 5 | `api-agent` | marca de petición abierta en `CitaDashboardDto` y en el detalle de `GET /api/citas/:id` |
| 6 | `backend-agent` | CORS con `X-Enlace-Cita`, cabeceras `no-store` / `no-referrer`, redacción de la cabecera en logs; límite de tasa (DT-18) **antes del primer enlace real** |
| 7 | `testing-agent` | la Definición de Terminado de US-02.07, en especial: token inválido de seis formas → respuesta idéntica; nada después de `inicio` como test de aplicación; aislamiento entre citas y tenants; atomicidad de revocación y descarte |

---

## Decisiones que este ADR deja abiertas

| Tema | Recomendación | Quién |
|---|---|---|
| **Q11 — canal** | A como puente si I+D confirma que el profesional lo aceptaría; si no, C | I+D → decisión conjunta |
| **Tope absoluto de validez** | 30 días desde la emisión, configurable | equipo |
| **¿El paciente puede reemitir su enlace?** | **No**: solo el profesional o el sistema | equipo (confirmar) |
| **¿Mostrar `tipoConsulta`?** | **No** | equipo + H7 (pregunta 2) |
| **`actorId` del paciente** | id del enlace (alternativa: nulo) | equipo |
| **¿El profesional puede descartar una petición sin reagendar?** | fuera del primer corte: hoy se cierra al reagendar o al llegar a terminal. Si la marca abierta molesta, añadir `descartar()` es aditivo | equipo |
| **Confirmar la cita desde el enlace** (la otra operación de RF-07) | fuera de US-02.07. El enlace lo soporta sin rediseño, pero tocar `pendiente → confirmada` desde el paciente cambia la semántica de `ghosting` para RF-08 y merece decisión propia | equipo |
| **Plazo mínimo para cancelar** | no ahora; la antelación ya queda medible | producto |
| **Petición sin atender ≠ ghosting** | regla para el ADR de Q6 | Dev A (Q6) |
| **HMAC con clave del servidor en vez de SHA-256** | no necesario hoy; migrable sin cambiar contrato | H7 puede exigirlo |

---

## Pendiente para aceptar

Este ADR pasa de **Propuesto** a **Aceptado** cuando existan, enlazadas aquí:

1. **Revisión del hacker ético ([H7](../PREGUNTAS-ABIERTAS.md))**, respondiendo como requisito (no
   como solución):
   - qué debe poder hacer el sistema cuando el enlace llega a quien no es (hoy: reemitir revoca el
     anterior);
   - si `tipoConsulta` y el nombre del profesional son aceptables en un enlace reenviable;
   - si el transporte propuesto (fragmento `#` + cabecera `X-Enlace-Cita` + `no-store` /
     `no-referrer` + sin scripts de terceros) es suficiente;
   - la política de límite de tasa exigible para esta superficie, además de DT-18;
   - si SHA-256 sin clave basta o exige HMAC.
2. **Respuesta a [Q11](../PREGUNTAS-ABIERTAS.md)** (A, B o C). Con **C**, el ADR no se acepta: queda
   propuesto hasta que exista canal. Con **B**, además, [DT-16](../Deudas/DT-16.md) pasa a bloqueante.
3. **Confirmación del equipo** de las recomendaciones de la tabla anterior.

---

## Referencias

- [US-02.07](../US/02.07-paciente-reagenda-cancela.md): análisis completo §1–§9 del que sale este ADR.
- [US-02.08](../US/02.08-voucher-cita.md): voucher y `GET /api/citas/:id` con `accionesPermitidas`.
- [ADR-09](ADR-09.md): §1 (`SolicitudCita`), §5 (`reagendar`), §6 (bitácora), §7 (hechos), §8
  (vía pública y respuesta uniforme), §10 (etiqueta de los campos libres).
- [ADR-04](ADR-04.md): grafo de estados y terminales; el job de ghosting (§4).
- [ADR-03](ADR-03.md) §5: respuesta genérica, no enumeración.
- [ADR-06](ADR-06.md): `TransactionRunner`, atomicidad mutación + bitácora + revocación.
- [ADR-07](ADR-07.md): mostrar `inicio` en la zona de la clínica.
- [ADR-02](ADR-02.md): hexagonal y español — `EnlaceCita` y `SolicitudReagendamiento` en
  `cita/domain/`.
- `src/modules/cita/application/citas.service.ts` (`mutar`, `registrarCambio`, `publicar`) y
  `src/modules/cita/domain/cambio-cita.entity.ts` (`ActorCambio`).
- RF-05 (alertas), RF-06 (recordatorios), RF-07 (respuesta del paciente), RF-08 (calificación de
  asistencia).

---

## Deudas técnicas asociadas

**Depende de:** [DT-18](../Deudas/DT-18.md) (límite de tasa — **bloqueante antes del primer enlace
real**) · [DT-19](../Deudas/DT-19.md) (sin política de logs: la cabecera del token debe redactarse
desde el primer logger).

**Toca:** [DT-11](../Deudas/DT-11.md) — el refactor del actor le deja listo `ActorCambio.SISTEMA`, y
el proceso de cierre tendrá que conocer las peticiones abiertas (decisión 5) ·
[DT-16](../Deudas/DT-16.md) — bloqueante solo si Q11 = B · [DT-23](../Deudas/DT-23.md) — el enlace,
como el RUT, no verifica identidad; mismo cierre (canal verificado de RF-06) ·
[DT-26](../Deudas/DT-26.md) — se amplía a enlaces y peticiones cerradas ·
[DT-27](../Deudas/DT-27.md) — `CitaCancelada` con actor y `ReagendamientoSolicitado` son los hechos
que la primera alerta no puede perder.

**Previstas (a fichar al aceptarse este ADR; sin número todavía):**

1. **Enlace reenviado = capacidad transferida** — riesgo aceptado (decisión 9); se cierra con el canal
   verificado de RF-06, junto a DT-23.
2. **Sin aviso en tiempo real al profesional** mientras RF-05 esté fuera del MVP (decisión 7).
3. **Peticiones sin descarte explícito por el profesional**, si se confirma dejarlo fuera del primer
   corte (decisiones abiertas).
4. **Bloqueo de fila en el esqueleto de mutación**, solo si no entra en el mismo release (decisión 9).

Índice completo: [`../Deudas/README.md`](../Deudas/README.md).
