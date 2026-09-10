# ADR-09: Gestión de citas — la solicitud del paciente es un agregado aparte, y reagendar mueve la cita registrando el hecho

**Fecha:** 2026-08-23
**Estado:** Aceptado · **implementado por partes** — ver tabla abajo
**Commits:** — (pendiente)
**Relación:** **extiende** [ADR-04](ADR-04.md) (añade `reagendar()` al grafo de estados y salda su
deuda de historial) · **adopta la fase 1 de** [ADR-08](ADR-08.md) en la ruta pública (ver §11.b) ·
**replica** el patrón de puerto opaco de [ADR-06](ADR-06.md).

## Estado de cada decisión

| # | Decisión | Estado |
|---|----------|--------|
| 1 | `SolicitudCita` como agregado aparte | ✅ 2026-08-24 |
| 2 | El paciente pide, no reserva | ✅ 2026-08-24 |
| 3 | El RUT es la identidad del paciente | ✅ 2026-08-23 |
| 4 | Editar ≠ reagendar ≠ cancelar | ✅ 2026-08-23 |
| 5 | `Cita.reagendar()` | ✅ 2026-08-23 |
| 6 | Bitácora `CambioCita` | ✅ 2026-08-23 |
| 7 | Publicación de hechos | ✅ 2026-08-23 |
| 8 | Ruta pública + límite de tasa | ruta ✅ · límite de tasa 🔵 **aplazado mientras el entorno sea local** ([DT-18](../Deudas/DT-18.md)) |
| 9 | Formulario propio, no de terceros | ✅ (backend listo; el formulario es del frontend) |
| 10 | Campos del formulario | 🟡 ✅ provisionales — a confirmar cuando el frontend los cierre |
| — | Bandeja: listar, aceptar, rechazar | ❌ el dominio lo soporta; falta exponerlo |

> **Requisito de despliegue:** el límite de tasa de la decisión 8 no existe. Es irrelevante mientras
> se trabaje en local, y pasa a bloqueante el día que el backend quede accesible o se comparta el
> enlace fuera del equipo. Ver [DT-18](../Deudas/DT-18.md).

---

## Contexto

**US-02** (gestión de citas) pide que el profesional pueda *crear, editar, reagendar y cancelar*
citas, que los cambios queden registrados y que disparen alerta (RF-05 / US-05) y actualización del
recordatorio pendiente (RF-06 / US-03).

Al abordarla surgió una pregunta de producto que resultó ser una decisión de arquitectura:

> *¿Los datos del paciente los registra el profesional, o los registra el propio paciente?*

La propuesta de partida del equipo fueron **dos vías de entrada**:

1. un botón **"nueva cita"** para que el profesional agende manualmente;
2. un **enlace público** (formulario) que el profesional comparte por WhatsApp / Instagram /
   Facebook, donde el paciente llena sus datos y "eso viaja e inyecta los datos en la BD y nutre el
   dashboard".

La vía 1 es la que ya existe (`POST /api/citas`). La vía 2 es nueva y es la que obliga a decidir.

### Lo que hay hoy (verificado en el código, 2026-08-23)

| Pieza | Estado |
|---|---|
| Crear cita autenticado | ✅ existe |
| Dashboard del día | ✅ existe |
| Máquina de estados de `Cita` | ✅ modelada (ADR-04) · ❌ **ninguna transición expuesta** |
| Editar / reagendar / cancelar | ❌ no existen |
| Modelo de disponibilidad (horarios, huecos) | ❌ **no existe ningún concepto** |
| Búsqueda de pacientes | ❌ solo hay alta; no se puede buscar ni listar |
| Eventos de dominio | ❌ **no existe infraestructura** |
| Rutas públicas | solo registro y login |
| Prevención de solapamiento | ❌ se aceptan citas solapadas y en el pasado |

### El error a evitar

Si el formulario público **inserta directamente una fila en `citas`**, entonces cualquiera con el
enlace controla la agenda del profesional: puede llenarle el día, ocupar horas inexistentes o crear
pacientes falsos. Peor: como una cita nace `pendiente` y el job de cierre (ADR-04 §4) marcará
`ghosting` lo que quede pendiente y vencido, **ese ruido contaminaría el historial de reputación del
paciente**, que es el diferenciador del producto (RF-08).

### La observación que acota el problema

Las dos vías **no son la misma operación con distinto tecleador**. Son actos distintos:

| | Vía profesional | Vía paciente |
|---|---|---|
| Naturaleza | ejercicio de autoridad sobre la agenda | **petición** |
| Confianza | autenticado | anónimo |
| Efecto | la cita existe | nada existe hasta que alguien acepte |

Separar *quién teclea* de *quién decide* es lo que hace tratable el resto del diseño.

---

## Opciones evaluadas

### A. Dónde vive la petición del paciente

| Opción | Notas | Veredicto |
|--------|-------|-----------|
| **A1. Escribe directo en `citas`** | Lo propuesto inicialmente. Cero piezas nuevas. | **Descartada.** Entrega el control de la agenda a cualquiera con el enlace y contamina RF-08. |
| **A2. Nuevo estado `solicitada` en `Cita`** | Una sola tabla, una sola línea de tiempo. | **Descartada.** Mete en `citas` cosas que nunca fueron citas (spam, rechazos); obliga a filtrar el pre-estado en toda consulta existente; y ensucia la base del reporte de comportamiento. |
| **A3. Agregado `SolicitudCita` aparte (ELEGIDA)** | `citas` conserva el significado "compromiso real". La superficie anónima escribe en una única tabla aislada. Aceptar = crear una `Cita` con el flujo ya existente, **sin tocarlo**. | **Elegida.** Es además la que **menos** cambia lo ya construido. |

### B. ¿El paciente pide una hora o la reserva?

| Opción | Infra nueva | Veredicto |
|--------|-------------|-----------|
| **B1. Pide** — indica preferencia horaria; el profesional fija la hora real al aceptar | ninguna | **Elegida para Fase 1** (confirmada por el equipo, 2026-08-23) |
| **B2. Reserva** — elige un hueco real de un calendario público | modelo de disponibilidad + cálculo de huecos + bloqueo ante reservas simultáneas + anticipación mínima + pantalla pública | **Aplazada a Fase 2** |

B2 multiplica US-02 por tres o cuatro y **no entrega más valor en esta fase**: hasta tener confianza
en el sistema, el profesional va a revisar cada cita a mano igualmente. B1 **migra a B2 sin rehacer
nada**: la solicitud pasa de "preferencia en texto" a "hueco elegido" y el resto del flujo no cambia.

### C. Reagendar: ¿mueve la cita o crea otra?

| Opción | Notas | Veredicto |
|--------|-------|-----------|
| **C1. Cancelar + crear una nueva** | Coherente con "de un terminal no se sale" (ADR-04 §2). | **Descartada.** Una cita movida 3 veces son 4 filas **sin vínculo entre sí**: el sistema no puede saber que fueron el mismo compromiso, y RF-08 no puede interpretarlas. Es la deuda que ADR-04 dejó abierta. |
| **C2. Mutar `inicio` en su sitio** | Identidad estable, simple. | Insuficiente sola: pierde el historial de movimientos, que es un criterio de aceptación de US-02 *y* materia prima de RF-08. |
| **C3. Mutar en su sitio + bitácora inmutable (ELEGIDA)** | Una identidad, historial completo. | **Elegida.** Resuelve el criterio "se registra el cambio", alimenta RF-08 y salda la deuda de ADR-04 sin inventar un concepto nuevo. |

---

## Decisión

### 1. `SolicitudCita` es un agregado propio, no un estado de `Cita`

Módulo nuevo `src/modules/solicitud/`, hexagonal completo (ADR-02).

```
SolicitudCita
├─ id
├─ tenantId, usuarioId          ← a qué profesional va dirigida
├─ rut                          ← OBLIGATORIO, normalizado y validado (ver decisión 3)
├─ nombrePaciente               ← datos crudos, sin crear Paciente todavía
├─ telefono, correo             ← ambos obligatorios (ver decisión 10)
├─ motivo                       ← texto libre acotado, obligatorio
├─ preferenciaHoraria           ← texto libre ("mañanas", "jueves después de las 15h")
├─ consentimiento               ← obligatorio, marcado por el propio paciente
├─ estado                       ← recibida · aceptada · rechazada
├─ citaId?                      ← se rellena al aceptar
└─ recibidaEn
```

**Vocabulario deliberadamente distinto** del de `EstadoCita`: `recibida` (no "pendiente") para que
nunca se confundan dos ciclos de vida que significan cosas opuestas — en `Cita`, `pendiente`
significa *"existe y espera confirmación del paciente"*; en `SolicitudCita`, `recibida` significa
*"todavía no existe nada"*.

Estados terminales de la solicitud: `aceptada` y `rechazada`. Rechazar **no** genera ninguna `Cita`
y **no** deja rastro en el historial del paciente.

### 2. El paciente pide; el profesional fija la hora

El formulario público **no** ofrece horas. Recoge preferencia en texto libre. La hora real la
escribe el profesional en el momento de aceptar, con el mismo flujo de creación que ya existe.

**Corolario:** este ADR **no** introduce modelo de disponibilidad. Cuando se aborde (Fase 2), será
un ADR propio.

### 3. El RUT es la identidad del paciente; la solicitud NO crea `Paciente`

Si la solicitud creara un `Paciente` al llegar, el spam crearía pacientes. Los datos viajan crudos
dentro de la solicitud y el `Paciente` se resuelve solo al **aceptar**.

**La clave de identidad es el RUT**, no el contacto. El teléfono cambia, se tipea distinto y admite
mil formatos; el RUT es estable, canonicalizable y —lo decisivo— **verificable sin consultar nada**:
su dígito verificador (módulo 11) permite rechazar un RUT inventado con aritmética pura, sin base de
datos ni servicio externo. Ninguna otra pieza de identidad del sistema tiene esa propiedad.

**Reglas:**

1. **Utilidad pura `shared/domain/rut.ts`**, sin dependencias de framework: `normalizarRut()` (a
   forma canónica sin puntos, con dígito verificador en minúscula) y `esRutValido()` (módulo 11).
   Mismo patrón que `tenant/domain/slug.ts` y `shared/domain/timezone.ts` (ADR-02, ADR-07).
2. **`Paciente.rut` es nullable, con índice único `(tenant_id, rut)`** cuando está presente. Un RUT
   identifica una persona dentro de una organización, y no puede haber dos.
3. **`SolicitudCita.rut` es obligatorio.** Es el precio de entrada a la vía pública.
4. **En el alta manual el RUT es opcional.** *(Alcance decidido con el equipo, 2026-08-23: la vía
   pública asume **personas chilenas**. Quien no tenga RUT entra por el alta manual del profesional,
   y punto — no se diseña identidad alternativa.)* Por eso `Paciente.rut` es nullable: es la válvula
   de escape, y es suficiente.
5. **El RUT se almacena siempre en forma canónica** y **nunca viaja en URLs ni en logs**: es un
   identificador nacional, dato personal sensible por sí mismo.

**Al aceptar una solicitud**, dentro de **una sola transacción** (`TransactionRunner`, ADR-06):

1. buscar `Paciente` del tenant por RUT normalizado;
2. si existe → vincular; si no → crear `Paciente`, propagando el `consentimiento` que el paciente
   marcó él mismo;
3. crear la `Cita` con la hora que fijó el profesional;
4. registrar el `CambioCita` de tipo `creada`.

Es el mismo patrón de escritura multi-tabla que ya resolvió el registro inicial.

> **Ganancia legal no obvia.** Que el consentimiento lo marque **el propio paciente** es
> sustancialmente más sólido que el profesional marcándolo por él, que es como funciona hoy
> (`CrearPacienteDto.consentimiento`). Justo antes de que entren los recordatorios (RF-06), donde el
> consentimiento deja de ser un campo y pasa a ser una puerta legal.

### 4. `editar` ≠ `reagendar` ≠ `cancelar`

Tres operaciones con consecuencias distintas. Agruparlas fue el error de redacción de US-02.

| Operación | Qué cambia | Alerta (US-05) | Recordatorio (US-03) | Cuenta para RF-08 |
|---|---|---|---|---|
| **Editar** | `duracionMin`, `tipoConsulta` | no | no | no |
| **Reagendar** | `inicio` | **sí** | **se reprograma** | **sí** |
| **Cancelar** | estado → `cancelada` (terminal) | **sí** | **se anula** | **sí** |

### 5. `Cita.reagendar(nuevoInicio)` — nueva transición del grafo de ADR-04

- **Legal solo desde `pendiente` o `confirmada`.** Desde cualquier terminal lanza
  `TransicionEstadoInvalidaError` → 409, igual que el resto.
- **Reagendar devuelve la cita a `pendiente`.** Si el paciente había confirmado, confirmó *otra*
  hora: esa confirmación ya no vale y debe volver a pedirse. Esta regla es la que mantiene honesto
  el dato de RF-08 y la que hace que el recordatorio reprogramado tenga sentido.
- `id`, `pacienteId`, `usuarioId` y `tenantId` **no cambian**: la cita es la misma.

### 6. `CambioCita` — bitácora inmutable, append-only

```
CambioCita
├─ id, citaId
├─ tipo                ← creada · editada · reagendada · cancelada
├─ inicioAnterior?, inicioNuevo?
├─ motivo?
├─ actorTipo, actorId  ← profesional · paciente · sistema
└─ ocurridoEn
```

Nunca se actualiza ni se borra. Se escribe **en la misma transacción** que la mutación de la cita:
si el cambio no queda registrado, el cambio no ocurre.

Con esto, *"¿cuántas veces se movió esta cita y quién la movió?"* es una consulta directa — el dato
que RF-08 necesita para responder la pregunta que hoy ni siquiera se puede formular: *¿reagendar
cuatro veces es buen comportamiento (avisó a tiempo) o malo (costó cuatro huecos)?*

### 7. Los hechos se publican ya, aunque nadie escuche

US-05 y US-03 no existen. Construirlos ahora repetiría el error de US-06 (una historia que arrastra
fundaciones enteras). Pero **no** publicar los hechos obliga a operar US-02 después.

Puerto en `shared/application/`, mismo patrón opaco de ADR-06:

```ts
export abstract class PublicadorEventos {
  abstract publicar(evento: EventoDominio): Promise<void>;
}
```

Eventos de esta US: `CitaCreada`, `CitaReagendada`, `CitaCancelada`, `SolicitudCitaRecibida`.

Adaptador Fase 1: **en proceso, sin suscriptores**. Fase 2 (cuando entren recordatorios): adaptador
sobre cola persistente, sin tocar `application`. RNF-03 exige ≥99% de entrega con reintento — eso es
una cola, y esta decisión deja el enchufe puesto sin pagar su coste hoy.

### 8. El enlace público: dependencia dura con ADR-08 y límite de tasa obligatorio

El enlace debe identificar al profesional destinatario. Eso es un identificador público en la
URL — **exactamente** el mecanismo que ADR-08 define y que sigue sin implementar.

> **Esto reordena prioridades: ADR-08 deja de ser una mejora de experiencia del login y pasa a ser
> infraestructura que US-02 necesita.** Se implementa una vez y sirve a las dos.

Reglas de la ruta pública:

1. **Solo escribe en `solicitudes_cita`.** No toca `citas`, `pacientes` ni `usuarios`.
2. **RUT válido obligatorio** (decisión 3). Filtro estructural: rechaza basura aleatoria con
   aritmética, sin base de datos ni servicio externo.
3. **Una solicitud abierta por RUT y profesional.** Si ya existe una en estado `recibida`, la nueva
   se rechaza con respuesta uniforme. **No** es "una solicitud por persona para siempre": un
   paciente real necesita pedir hora muchas veces a lo largo del tiempo, y bloquearlo tras la
   primera sería romper el producto. El límite es sobre lo **pendiente de revisar**, que es
   exactamente lo que el spam busca inundar.
4. **Límite de tasa por enlace y por origen, desde el día uno.** Sigue siendo necesario aunque haya
   RUT: el algoritmo del dígito verificador es público, así que generar RUTs válidos en masa es
   trivial para quien se lo proponga. El RUT **eleva el piso; no cierra la puerta.** Hoy no existe
   límite de tasa ni siquiera en el registro.
5. **Campos exactamente los de la decisión 10**, ni uno más. El conjunto RUT + nombre + contacto +
   motivo es dato de salud de categoría sensible: el formulario recoge lo imprescindible para
   agendar y **nada de historia clínica**.
6. **Respuesta uniforme.** Enviar una solicitud responde siempre igual: exista o no el profesional,
   y haya o no una solicitud abierta con ese RUT. Lo contrario permitiría **sondear qué RUT es
   paciente de qué profesional de la salud** — una filtración mucho más grave que la enumeración de
   tenants que ADR-03 §5 ya evita.

> **Matiz frente a la regla anti-enumeración de ADR-03 §5:** un enlace público **está pensado para
> ser público** — mostrar el nombre del profesional en su propia página de solicitud es correcto y
> necesario para que el paciente confíe. Lo que se prohíbe es **descubrir** slugs: nunca debe existir
> un endpoint que liste, busque o sugiera tenants. Conocer un slug revela un profesional; adivinarlos
> en masa no debe ser posible.

### 9. Formulario propio, no formulario de terceros

*(Confirmado por el equipo, 2026-08-23: se descarta depender de un tercero y se construye una ruta
con formulario de Citia.)*

Un formulario externo (Google Forms u otro) **no puede** validar el tenant, ni deduplicar pacientes,
ni devolver una referencia real de solicitud, ni sostener el consentimiento a nombre de Citia — y
deposita datos de salud en un tercero, lo que es una decisión de cumplimiento normativo y no de
conveniencia técnica (verificar con la normativa chilena de datos personales aplicable a salud).
Además la integración que lo conectara sería trabajo desechable.

**Uso legítimo y acotado:** como instrumento de **validación de demanda** antes de construir nada
—¿los pacientes efectivamente llenan un enlace enviado por WhatsApp?—. En ese uso **no se conecta a
la base de datos**; los datos se transcriben a mano. Si la respuesta es "no", esta US se replantea
entera y el ahorro es enorme.

### 10. Campos del formulario público

*(Definidos por el equipo, 2026-08-23. Todos obligatorios.)*

| Campo | Razón |
|---|---|
| **RUT** | identidad del paciente + filtro estructural de entrada (decisión 3) |
| **Nombre** | para poder dirigirse a la persona |
| **Teléfono** | vía de respuesta principal |
| **Correo** | segundo canal, y base para verificación y recordatorios futuros (RF-06) |
| **Consentimiento** | requisito legal, otorgado por el titular del dato |
| **Preferencia horaria** | texto libre; sustituye a elegir hora (decisión 2) |
| **Motivo de la consulta** | texto libre acotado; es lo que el profesional necesita para orientarse |

**Reglas sobre el motivo:**

- **Acotado en longitud** (orden de 200–300 caracteres) y con una etiqueta que gestione
  expectativas: *"cuéntanos brevemente de qué se trata; no hace falta detalle médico"*. En un campo
  libre, **la etiqueta hace más trabajo que la validación**: sin ella, una caja grande en una página
  que circula por redes invita a escribir una historia clínica completa, que quedaría almacenada
  incluso si la solicitud se rechaza.
- **Se descartó la lista cerrada de tipos de consulta** para esta fase. Diseñar la taxonomía en
  abstracto —sin clientes y sin saber qué especialidades habrá— sería adivinar, y obligaría a
  decidir de entrada si la lista es global o por organización.
- **El texto libre es, además, el instrumento para construir esa lista después.** Los motivos
  acumulados son la muestra real con la que diseñar la taxonomía cuando toque. El orden
  texto-libre → lista es el barato; el inverso no.

**Al aceptar la solicitud**, el profesional fija `tipoConsulta` en la `Cita` (campo que ya existe y
ya es texto libre). Se **precarga con el motivo** de la solicitud y el profesional lo ajusta: evita
retipear y deja el dato en el vocabulario del profesional, no en el del paciente.

> **No se recoge** "¿primera vez o control?", pese a ser el campo con mejor relación señal/coste del
> formulario. Se prefirió minimizar fricción. Es el candidato número uno a añadir si al profesional
> le falta contexto — cuesta un campo y no rompe nada.

### 11. Notas de implementación de la vía pública (2026-08-24)

Tres refinamientos que aparecieron al construirla. Los tres se eligieron por ser **los más
reversibles** disponibles.

**a) El enlace es de la organización, no del profesional.** La decisión 1 daba por hecho un
`usuarioId` desde el momento de recibir la solicitud. No es posible hoy: los tenants tienen un
identificador público (`slug`), los usuarios **no tienen ninguno**, y crear uno es una decisión de
producto que este ADR no tomó. Así que `usuario_id` es nullable y se rellena **al aceptar**: el
profesional que acepta es el dueño.

> Reversible: si mañana el enlace es por profesional, se añade su identificador público y se puebla
> la columna al recibir. Nada de lo construido cambia.

**b) La ruta pública adopta el transporte por segmento de ADR-08 antes que el login.**
`POST /api/publico/:tenantSlug/solicitudes`. La decisión 8 declaraba ADR-08 como prerrequisito; en la
práctica solo hacía falta su *mecanismo*, no su migración. Aplicarlo a una superficie **nueva** no
altera el contrato del login, que ya está en uso por el frontend. ADR-08 sigue pendiente para el
login; esta ruta ya vive en su fase 1.

**c) La regla "una solicitud abierta" se acota a una ventana de tiempo, no a un job de caducidad.**
La unicidad se evalúa sobre solicitudes `recibida` de las últimas N horas
(`SOLICITUD_VENTANA_HORAS`, por defecto 72), no sobre todas.

> **Esto desactiva [DT-28](../Deudas/DT-28.md) sin construir nada.** El defecto era que una bandeja
> abandonada bloqueaba de por vida a un paciente legítimo. Con la ventana, pasadas 72 h el paciente
> puede volver a pedir hora **sin que nadie tenga que hacer nada**, y la solicitud vieja sigue
> visible en la bandeja. Se evita depender del planificador, que aún no está elegido.

**Lo que quedó fuera de esta entrega:** la bandeja (listar solicitudes) y aceptar/rechazar. El
dominio ya los soporta (`aceptar()`, `rechazar()`); falta exponerlos.

**Sobre el límite de tasa de la decisión 8:** se aplazó a conciencia el 2026-08-24 porque el proyecto
se trabaja en local y nada está expuesto. La regla de la decisión 8 ("desde el día uno") se
reinterpreta como **desde el día uno de exposición**, no desde el día uno de existencia del código.
El disparador queda escrito en [DT-18](../Deudas/DT-18.md).

---

## Qué NO cambia

Para dimensionar el riesgo:

- **Tabla `citas`:** sin cambios de esquema. Reagendar muta `inicio`, que ya existe.
- **Máquina de estados de ADR-04:** los seis estados y las transiciones actuales quedan intactos.
  `reagendar()` **añade** una transición; no redefine ninguna.
- **`ghosting` vs `no_asistio`:** intacto. Sigue siendo la base de RF-08.
- **Aislamiento multi-tenant:** intacto. En las rutas autenticadas `tenantId` y `usuarioId` siguen
  saliendo del token (ADR-01 §2). La ruta pública **no** recibe `tenantId` del cuerpo: lo deriva del
  slug de la URL contra `findBySlug`, que ya existe.
- **Dashboard del día:** intacto. Las solicitudes no aparecen ahí; van a una bandeja aparte.
- **Registro y login:** intactos, salvo lo que ya define ADR-08.

---

## Plan de ejecución (Fase 1)

**Prerrequisito:** ADR-08 Fase 1 (transporte del tenant en la URL). Sin eso no hay enlace público.

| # | Pieza | Cambio |
|---|-------|--------|
| 1 | `shared/application/publicador-eventos.ts` + adaptador en `shared/infrastructure/` | **nuevo** — puerto + adaptador en proceso |
| 2 | `cita/domain/cita.entity.ts` | **nuevo** `reagendar(nuevoInicio)`; vuelve a `pendiente`; ilegal desde terminal |
| 3 | `cita/domain/cambio-cita.entity.ts` + puerto `CambioCitaRepository` | **nuevo** — bitácora inmutable |
| 4 | `cita/application/citas.service.ts` | `editar`, `reagendar`, `cancelar`; cada mutación + su `CambioCita` dentro de `TransactionRunner`; publicar evento |
| 5 | `cita/presentation/citas.controller.ts` | exponer las transiciones (`confirmar`, `cancelar`, `reagendar`, asistencia/inasistencia) — **hoy no hay ninguna** |
| 6 | `cita/presentation/` | listado de citas por rango (la US pide lista/calendario, no solo "hoy") |
| 7 | `solicitud/` (módulo nuevo, hexagonal) | dominio, puerto, adaptador, caso de uso `aceptar`/`rechazar` |
| 8 | `solicitud/presentation/` ruta **pública** | recibir solicitud; límite de tasa; respuesta uniforme |
| 9 | `shared/domain/rut.ts` | **nuevo** — `normalizarRut()` + `esRutValido()` (módulo 11), puro, con tests de dominio |
| 10 | `paciente/` | **búsqueda por RUT/nombre** — bloqueante para el botón "nueva cita"; y match por RUT para el alta desde solicitud |
| 11 | `src/database/migrations/` | `pacientes.rut` (nullable) + índice único parcial `(tenant_id, rut)`; **`pacientes.correo`** — hoy `Paciente` tiene un único campo `contacto` y la decisión 10 recoge teléfono y correo por separado, así que hay que separarlos también aquí; tablas `solicitudes_cita` y `cambios_cita`. Índices: `(tenant_id, usuario_id, estado)`, `(tenant_id, rut, estado)` y `(cita_id, ocurrido_en)` |
| 12 | `main.ts` / infra | límite de tasa (primera superficie anónima del proyecto) |
| 13 | tests | dominio de `reagendar` (incluida la vuelta a `pendiente`), módulo 11 del RUT, atomicidad cambio+bitácora, aceptación de solicitud, ruta pública, "segunda solicitud abierta con el mismo RUT ⇒ respuesta uniforme" |
| 14 | `context/Features/us02-gestion-citas.md` | **nueva** feature |
| 15 | `context/Decisions/ADR-04.md` | ✅ hecho — nota de cabecera: la deuda de historial queda saldada aquí |

---

## Consecuencias

**Positivas:**

- La agenda deja de ser escribible por anónimos: el control queda siempre en el profesional.
- El historial de reputación (RF-08) nace limpio — el spam y los rechazos nunca lo tocan.
- **Salda la deuda abierta de ADR-04**: reagendar tiene por fin una representación que RF-07 y RF-08
  pueden interpretar.
- US-03 y US-05 se enchufan después **sin operar US-02**, porque los hechos ya se publican.
- Reutiliza patrones ya validados (puerto opaco de ADR-06, transacción, hexagonal de ADR-02): cero
  conceptos nuevos que aprender.
- El consentimiento pasa a otorgarlo el titular del dato.
- B1 → B2 (reserva real de huecos) no exige rehacer nada de lo aquí decidido.
- **El RUT da identidad real al paciente**: elimina casi por completo la duplicación, hace la
  búsqueda del profesional inmediata y exacta, y es la única defensa del sistema que **no depende de
  infraestructura** (aritmética pura). De paso deja lista la identidad que RF-08 necesita para
  seguir a una persona a lo largo del tiempo.

**Negativas / riesgos:**

- **Un módulo y dos tablas nuevas** para una US que "solo" pedía editar citas. Es el precio de no
  contaminar el agregado central; se acepta a conciencia.
- **La bandeja de solicitudes es trabajo manual nuevo** para el profesional. Si el volumen crece,
  presiona hacia B2 antes de lo previsto.
- **El RUT no es secreto.** El algoritmo del dígito verificador es público y los RUT circulan
  ampliamente: filtra basura y bots perezosos, **no** a alguien decidido. Y como no hay verificación
  del contacto, se puede enviar una solicitud **suplantando el RUT de otra persona**; el profesional
  lo descubre al llamar. Mitigación futura: código de verificación por el canal de contacto — la
  misma pieza que necesita RF-06.
- **La vía pública asume personas chilenas.** Quien no tenga RUT no puede usar el enlace; entra por
  el alta manual del profesional. **Exclusión aceptada a conciencia**, no un olvido: el alta manual
  es la válvula de escape y cubre el caso sin añadir complejidad. Si algún día el segmento pesa, se
  revisará entonces — hoy no se diseña nada para ello.
- **Guardar RUT sube el perfil de sensibilidad de la base.** Es un identificador nacional: obliga a
  forma canónica, a mantenerlo fuera de URLs y logs, y a que su tratamiento esté justificado. En un
  contexto sanitario la justificación existe, pero conviene dejarla escrita.
- **Duplicación residual de pacientes** solo en los casos sin RUT (altas manuales). El problema pasa
  de ser sistemático a ser marginal.
- **Siete campos obligatorios es fricción.** Cada uno reduce cuánta gente completa el formulario, y
  este es el primer contacto del paciente con el producto. Exigir teléfono **y** correo deja fuera a
  quien no usa correo (típicamente pacientes mayores). Es una apuesta consciente: el correo habilita
  verificación y recordatorios más adelante. **Si la tasa de completado resulta baja, el correo es el
  primer campo a volver opcional** — no el motivo, que es lo que el profesional necesita.
- **Depende de ADR-08**, que sigue sin implementar. Si ADR-08 se retrasa, el enlace público se
  retrasa — pero las decisiones 4, 5, 6 y 7 (editar/reagendar/cancelar + bitácora + eventos) **no
  dependen de él** y pueden entregarse antes, en un release propio.
- **`inicio` se sigue aceptando sin exigir zona horaria**: si el cliente lo envía sin indicarla, se
  interpreta en la zona del servidor, reintroduciendo por la entrada el desfase que ADR-07 corrigió
  en la salida. Reagendar multiplica la exposición a este fallo. **Arreglar en el mismo release.**

---

## Decisiones que este ADR deja abiertas a propósito

| Tema | Por qué se aplaza |
|---|---|
| **Modelo de disponibilidad** (horarios, huecos, reserva real) | Fase 2. ADR propio. |
| **Solapamiento de citas** | Hoy se aceptan citas solapadas y en el pasado. **Ojo: elegir B1 no resuelve esto.** B1 evita que un *tercero* provoque el choque; no evita que el profesional se lo provoque a sí mismo al agendar o reagendar. *Detectar* el choque es una consulta sobre las citas del profesional en ese rango —sin modelo de disponibilidad, sin concepto nuevo—; *impedirlo* sí requeriría B2. La recomendación es **avisar y permitir**. Decisión de producto pendiente. |
| **Fusión de pacientes duplicados** | Con RUT el problema queda acotado a las altas manuales sin documento. Decidir con datos si merece herramienta. |
| **Verificación del contacto del paciente** | Encadenada a RF-06 (canal de recordatorios). Mismo canal, misma decisión — y es también lo que cerraría la suplantación de RUT. |
| **Vista de organización** (que un colega o administrador vea la agenda ajena) | Hoy la cita es del profesional. Cambiarlo es una decisión de producto sobre si "clínica" es un cliente viable. |

---

## Referencias

- [ADR-04](ADR-04.md): máquina de estados de `Cita` — este ADR la **extiende** con `reagendar()` y
  salda su deuda de historial de reagendamientos.
- [ADR-08](ADR-08.md): tenant en la URL — **prerrequisito** del enlace público.
- [ADR-06](ADR-06.md): `TransactionRunner` con contexto opaco — patrón replicado en
  `PublicadorEventos`, y mecanismo de atomicidad de cambio + bitácora.
- [ADR-02](ADR-02.md): español + hexagonal — el módulo `solicitud/` sigue la misma regla de capas.
- [ADR-03](ADR-03.md) §5: 401 genérico y no enumeración — ver el matiz de la decisión 8.
- [ADR-07](ADR-07.md): zona de la clínica — ver el riesgo del `inicio` sin zona en la entrada.
- [ADR-01](ADR-01.md) §2: el `tenantId` nunca llega del cliente en rutas autenticadas.
- [us06-dashboard-citas](../Features/us06-dashboard-citas.md): estado actual del módulo `cita`.
- `src/modules/tenant/domain/slug.ts` y `src/shared/domain/timezone.ts` — precedentes de utilidad de
  dominio pura y testeable; `shared/domain/rut.ts` sigue el mismo molde.
- RF-03 (dashboard), RF-05 (alertas), RF-06 (recordatorios), RF-07 (respuesta del paciente),
  RF-08 (calificación de asistencia), RNF-03 (≥99% de entrega con reintento).

---

## Deudas técnicas asociadas

**Cierra:** [DT-10](../Deudas/DT-10.md) (decisión 5, transiciones expuestas) · [DT-22](../Deudas/DT-22.md) (decisiones 5 y 6, reagendar con bitácora).

**Depende de:** [DT-15](../Deudas/DT-15.md) (buscar paciente, para la decisión 3 y el botón "nueva cita") · [DT-18](../Deudas/DT-18.md) (límite de tasa, para la decisión 8).

**Agrava:** [DT-14](../Deudas/DT-14.md) — reagendar multiplica las veces que entra un instante sin zona.

**Deja abierta a propósito:** [DT-12](../Deudas/DT-12.md) (solapamiento) · [DT-16](../Deudas/DT-16.md) (el consentimiento se otorga bien, pero sigue sin leerse).

**Contrae (deudas nuevas que este diseño acepta a sabiendas):** [DT-23](../Deudas/DT-23.md) suplantación de RUT (§3, §8) · [DT-24](../Deudas/DT-24.md) sin taxonomía de tipos de consulta (§10) · [DT-25](../Deudas/DT-25.md) la apuesta del formulario no es medible (§10) · [DT-26](../Deudas/DT-26.md) sin retención para solicitudes (§1, §10) · [DT-27](../Deudas/DT-27.md) el hecho se publica fuera de la transacción (§7) · [DT-28](../Deudas/DT-28.md) una solicitud sin revisar bloquea al paciente (§8 regla 3).

> **Tres de ellas salen mucho más baratas si se resuelven durante la implementación:** DT-27 mientras no haya suscriptores, DT-28 porque es un defecto de la regla y no una limitación, y DT-26 antes de acumular datos.

Índice completo: [`../Deudas/README.md`](../Deudas/README.md).
