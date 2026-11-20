# Feature: US-11 — Términos de uso y aviso de privacidad del paciente (RNF-02, Cumplimiento P1)

> **Fase:** — (transversal: [Cumplimiento](../Cumplimiento/README.md); [ROADMAP § Cumplimiento](../ROADMAP.md#cumplimiento-ley-21719--transversal)) · **Feature:** este documento · **Plan:** [US-11](../US/11-terminos-paciente.md) · **Relacionado:** [ADR-16](../Decisions/ADR-16.md), [ADR-09](../Decisions/ADR-09.md), [ADR-10](../Decisions/ADR-10.md), [ADR-06](../Decisions/ADR-06.md), [ADR-02](../Decisions/ADR-02.md), [DT-16](../Deudas/DT-16.md), [DT-53](../Deudas/DT-53.md), [DT-62](../Deudas/DT-62.md), [DT-63](../Deudas/DT-63.md), [DT-26](../Deudas/DT-26.md), [DT-42](../Deudas/DT-42.md), [DT-46](../Deudas/DT-46.md), [DT-52](../Deudas/DT-52.md), [DT-54](../Deudas/DT-54.md), [Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte), [borrador de los términos](../Cumplimiento/borrador-terminos-paciente.md)

**Historia:** US-11 (RNF-02; prioridad P1 de [Cumplimiento](../Cumplimiento/README.md)) · decisiones D1 a D14 de
ADR-16, aprobadas por el usuario el 2026-11-14 con dos ajustes: **D6 = 400** (si el paciente no autoriza, no se
registra) y la línea del **job G1** en el §2 del texto
**Estado:** ✅ **en producción desde el 2026-11-16** (frontend citia-frontend#21 a las 21:01, backend
citia-backend#23 a las 21:22) y **verificada en production** con la cuenta de prueba entre el 2026-11-17 y el
2026-11-20 ([abajo](#verificación-en-production-2026-11-17--2026-11-20)): las tres vías dejan su fila. *Antes
(2026-11-14 → 2026-11-16): «🔶 implementada en la rama `feature/terminos-paciente`, sin release».*
**Pruebas:** unitarios, integración y e2e en verde en la rama ([abajo](#tests)); `npm test` otra vez en verde sobre
`develop` con US-11 y el arreglo del RUT juntos (2026-11-15, 2603 tests)
**Commits:** `da812f3` y `ee0c2b4` (ADR-16 y plan), `92a1f36` (persistencia), `bdeb1aa` (API), `894b96c` (`CLAUDE.md`
de los módulos), `1d00f9e`, `fc3a83f` y `305dea5` (tests de `paciente`, `solicitud` y `portal-paciente`) y `66e54bc`
(e2e) · `7aaec66` (merge a `develop`, PR #20), `8738b98` (release a `main`, PR #23) · copia congelada `31b5c3f` y
su fecha `7f903b0`, `7fc4a36` y `962b946` · filas 128–157 de la [TRAZABILIDAD](../TRAZABILIDAD.md) · en el
frontend: `eb3fbcc` (`/terminos`), `dc01428` (casillas y `terminosVersion`), `9614634` (tarjeta de `/cita`), `644a601`
(bandeja) y `e276343` (docs), con sus releases citia-frontend#21 y #23
**ADRs:** **[16](../Decisions/ADR-16.md)** (aceptado el 2026-11-14) · matiza por segunda vez
[09](../Decisions/ADR-09.md) §3 (la aceptación del paciente marca la ficha de un paciente que ya existía) · respeta
[09](../Decisions/ADR-09.md) §8 (la ruta anónima, un solo `INSERT` y el 202 uniforme) y S2–S3 de
[10](../Decisions/ADR-10.md) · replica [06](../Decisions/ADR-06.md) y [02](../Decisions/ADR-02.md) · no usa el outbox de
[12](../Decisions/ADR-12.md)

> El porqué de cada pieza está en ADR-16; el contrato completo (decisiones, SQL, DTO, el texto que se publica y la
> Definición de Terminado), en el plan US-11. Este documento resume **lo que existe en el código** (en production
> desde el 2026-11-16; *antes: «de la rama»*).
> **Ninguna desviación rediseña:** lo que se decidió al implementar está en
> [Decisiones de la implementación](#decisiones-de-la-implementación). Las reglas locales para los agentes viven en los
> `CLAUDE.md` de `paciente` (nuevo), `cita`, `solicitud` y `portal-paciente`.

---

## Qué hace

> *Como paciente quiero leer qué hace Citia con mis datos antes de pedir hora, y que quede registrado que acepté y qué
> versión acepté.*
> *Como paciente agendado por mi profesional quiero aceptar los términos yo mismo desde la página de mi hora, sin que
> eso me impida confirmarla o cancelarla.*
> *Como profesional quiero tener un texto concreto que leerle o enviarle al paciente antes de registrarlo a mano.*

- **El texto.** `/terminos` (frontend) es pública y muestra *Versión 1.0* con su fecha. Es genérica: habla de «tu
  profesional», y el nombre de la organización aparece donde ya se conoce (`/cita`). El contacto es «por el medio que
  usas para comunicarte con tu profesional» más `soporte@citiahealth.cl`. El §6 va sin máximo de plazo, y el §2 informa
  que una hora sin confirmar ni asistencia registrada se marca sola como inasistencia (job G1).
- **Formulario público.** La casilla enlaza a `/terminos` en otra pestaña. El backend exige `consentimiento: true` y
  `terminosVersion`: un `false` responde 400 antes de buscar la organización, y el 202 sigue uniforme. La solicitud
  guarda la versión; la prueba nace cuando el profesional la acepta en la bandeja, con la hora del envío.
- **Alta manual (modal *Nueva cita*).** El profesional ve el texto para leerle o enviarle al paciente, con la dirección
  de `/terminos`, y la casilla *«El paciente me autorizó después de leerle o enviarle este texto.»* Un `false` responde
  400: si el paciente no autoriza, no se registra. Crear la cita deja una aceptación de canal `profesional` a nombre de
  quien marcó la casilla.
- **`/cita`.** Si el paciente no aceptó él mismo, ve la tarjeta *Tus datos y Citia* sobre las acciones, con «Acepto».
  Las acciones funcionan igual sin aceptar. La tarjeta desaparece al aceptar y no aparece si ya aceptó en el
  formulario.
- **Bandeja.** *«· aceptó los términos v1.0»* en lugar de *«· acepta recordatorios»*, si la solicitud trae la versión.
- **La bandera.** Cualquier aceptación pone `pacientes.consentimiento = true`, también la de un paciente que ya existía
  por RUT. Nada la pone en `false`.

---

## Arquitectura (hexagonal)

### Lo que cambia por módulo

| Módulo | Qué se agrega o cambia |
|---|---|
| `paciente` · dominio | catálogo `terminos-paciente.ts` (`CATALOGO_TERMINOS_PACIENTE`, `esVersionConocida`, `recibeAceptaciones`, `versionesQueRecibenAceptaciones`, `versionesQueCubren`) · `aceptacion-terminos.entity.ts` (`CanalAceptacion`, `CANALES_DEL_TITULAR`, `AceptacionTerminos.registrar` y `reconstituir`) · `VersionTerminosNoVigenteError` · puerto `AceptacionTerminosRepository` (`insertarSiNoExiste`, `existeDelTitular`) · `PacienteRepository.marcarConsentimiento` |
| `paciente` · aplicación | `PacientesService.registrarAceptacion` (la única puerta a la tabla, con `tx` obligatorio) · `titularAceptoVigente` · `crearPaciente` en una transacción, con el usuario del token |
| `paciente` · infraestructura y presentación | `AceptacionTerminosOrmEntity` y su adaptador (SQL a mano, guardas de UUID) · `@VersionTerminosVigente()` y `MENSAJE_VERSION_TERMINOS_NO_VIGENTE` · `CrearPacienteDto` con `@Equals(true)` y la versión · `PacienteModule` importa `SharedModule` (`TransactionRunner`) |
| `cita` | `CitasService.crearCita` registra el canal `profesional` **solo con `dto.paciente`**, en su transacción · `CitasController` traduce el error de versión a 400 |
| `solicitud` | `SolicitudCita.terminosVersion` · `CrearSolicitudDto` con `@Equals(true)` y la versión · `BandejaSolicitudesService.aceptar` registra `formulario_publico` en la rama `nueva` con versión · `SolicitudBandejaDto.terminosVersion` · `SolicitudesService.recibir` sigue con **un solo `INSERT`, sin transacción** |
| `portal-paciente` | `aceptarTerminos` (sin `exigir`) · `terminosPendientes` en la vista del GET y de los cuatro `POST` · `AceptarTerminosDto` · la ruta nueva · importa `PacienteModule` |
| `database` | dos migraciones · la entidad en el `data-source` de la CLI · `seed.ts` |

### Reglas de dependencia

- `paciente` no importa ningún módulo de negocio, solo `SharedModule`. Lo importan `cita`, `solicitud` y, desde US-11,
  `portal-paciente`: sin ciclos.
- **`agendar` y `resolverOCrear` no registran nada.** Cada vía registra su canal en su propio caso de uso.
- El puerto de aceptaciones **no se exporta**: solo se escribe por `PacientesService.registrarAceptacion`.
- **Ningún hecho nuevo** en `eventos_salida` y ningún log nuevo: la prueba es la fila.
- `src/arquitectura.spec.ts` sigue vigilando `paciente/domain` y `paciente/application`.

---

## Endpoints

Prefijo global `/api`.

| Método | Ruta | Cambio | Éxito | Errores nuevos |
|---|---|---|---|---|
| `POST` | `/publico/:tenantSlug/solicitudes` | `consentimiento` debe ser `true`; suma `terminosVersion` | 202 uniforme (sin cambio) | **400** con `false`, sin versión o con una que no recibe; sale **antes** de buscar la organización |
| `POST` | `/citas` con `paciente` | `paciente.consentimiento: true` y `paciente.terminosVersion`; registra `profesional` | 201, con `paciente.consentimiento: true` | **400** |
| `POST` | `/citas` con `pacienteId` | sin cambio; no registra nada (no trae casilla; el frontend no la usa) | 201 | — |
| `POST` | `/pacientes` | lo mismo que `paciente` de `/citas`; ahora en una transacción | 201, con `consentimiento: true` | **400** |
| `POST` | `/solicitudes/:id/aceptar` | registra `formulario_publico` si la solicitud trae versión | 201 (sin cambio) | — |
| `GET` | `/solicitudes` | `SolicitudBandejaDto.terminosVersion: string \| null` | 200 | — |
| `GET` | `/publico/cita` y los `POST` `confirmar`, `cancelar` y `otra-hora` | la vista suma `terminosPendientes: boolean` | sin cambio | — |
| `POST` | **`/publico/cita/aceptar-terminos`** (nueva) | cuerpo `{ terminosVersion }` | **200** con la vista (`terminosPendientes: false`) | 400 · 404 uniforme · 429 |

### Los mensajes del 400

| Caso | `message` |
|---|---|
| `consentimiento: false` en el formulario | *«Debes aceptar los términos de uso y el aviso de privacidad»* (en la lista del `ValidationPipe`) |
| `consentimiento: false` en el alta manual | *«Se necesita la autorización del paciente»* (ídem) |
| versión ausente, desconocida o que no recibe | el **mensaje fijo** *«La versión de los términos ya no está vigente. Recarga la página.»* (`MENSAJE_VERSION_TERMINOS_NO_VIGENTE`), igual en las tres rutas |

- Del DTO, el mensaje llega dentro de una lista. Si llega al caso de uso sin pasar por el DTO (defensa), los controllers
  de citas, pacientes y portal traducen `VersionTerminosNoVigenteError` a un 400 con el mismo texto.
- En `POST /citas`, el `ValidationPipe` antepone `paciente.` a los mensajes del paciente. Por eso el frontend busca el
  mensaje fijo **contenido** en `message`, no igual.

### `POST /publico/cita/aceptar-terminos`

1. Cuerpo inválido o versión que no recibe → **400**, antes de mirar el token.
2. El esqueleto de siempre: cita bloqueada → validez → petición abierta. Enlace no válido → **el mismo 404**.
3. **Sin `exigir`:** aceptar no es una acción sobre la cita. Vale con una petición de otra hora abierta o con la cita
   confirmada. Nunca 409.
4. Si el titular ya aceptó una versión que cubre, **no escribe** (idempotente). Si no, registra `enlace_cita` con el
   enlace resuelto y `aceptada_en` = el `ahora` del portal; eso pone la bandera en `true`.
5. Devuelve la vista.

No toca la cita, su bitácora, el outbox ni la primera apertura. Límite de tasa: `portalPorIp` (clase) y
`portalPorEnlace` (método), **el mismo cubo** de 5 por hora por enlace que confirmar, cancelar y pedir otra hora.
`no-store` y `no-referrer` en todas las respuestas, también en los errores.

**El GET no cambia de comportamiento:** lee, anota la primera apertura como antes y no registra ninguna aceptación.

---

## La prueba de la aceptación

### `aceptaciones_terminos`

| `canal` | Quién | Referencia | `aceptada_en` | Versión exigida | La registra |
|---|---|---|---|---|---|
| `formulario_publico` | el paciente | `solicitud_id` | `solicitudes_cita.recibida_en`: la hora del envío | conocida (la solicitud pudo llegar antes de un cambio de versión) | `BandejaSolicitudesService.aceptar`, rama `nueva` con versión |
| `enlace_cita` | quien tiene el enlace de la cita | `enlace_id` | el `ahora` del portal | que reciba aceptaciones | `PortalPacienteService.aceptarTerminos` |
| `profesional` | el profesional, en nombre del paciente | `usuario_id` (el del token) | el reloj de la app | que reciba aceptaciones | `CitasService.crearCita` (con `paciente`) y `PacientesService.crearPaciente` |

- **Solo inserción.** Una fila por paciente, versión y canal (`UNIQUE` + `ON CONFLICT DO NOTHING`): gana el primer
  acto, y uno posterior no escribe, también en una carrera.
- `INSERT … SELECT … FROM pacientes WHERE id AND tenant_id`: no se puede escribir una aceptación para un paciente de otra
  organización.
- **Sin IP ni navegador** (D12).
- **El titular** son `formulario_publico` y `enlace_cita`. La aceptación del profesional no cuenta para
  `terminosPendientes`: `/cita` se la sigue pidiendo al paciente.

### `aceptada_en` es la prueba; `registrada_en` dice cuándo se escribió la fila

`registrada_en` es `DEFAULT now()`, y en Postgres `now()` es la hora de **inicio de la transacción**. `aceptada_en` la
pone la aplicación:

- En el canal `profesional`, con el reloj de la app **dentro** de la transacción. Por eso `registrada_en` queda **unos
  milisegundos antes** que `aceptada_en` (visto en local el 2026-11-14). No es un error.
- En `formulario_publico`, `aceptada_en` es la hora en que el paciente envió el formulario. Puede ser días antes de
  `registrada_en`, que es cuando el profesional aceptó la solicitud.

**Para saber cuándo aceptó alguien, se lee `aceptada_en`.** No conviene ordenar ni auditar por `registrada_en`.

### `pacientes.consentimiento`, una bandera derivada

- Toda aceptación registrada la pone en `true`, en la misma transacción
  (`UPDATE … WHERE consentimiento = false`: si ya estaba, no escribe).
- También en un paciente que ya existía por RUT: es la segunda excepción a «la ficha no se toca» de ADR-09 §3.
- **Nada la pone en `false`.** El retiro se atiende a mano ([DT-62](../Deudas/DT-62.md)).
- La lee `PoliticaConsentimiento`, que sigue **apagada** ([DT-16](../Deudas/DT-16.md), parte 1).

### El catálogo de versiones

- Vive en `paciente/domain/terminos-paciente.ts`, sin variable de entorno. Hoy tiene una entrada: la `1.0`, que recibe
  aceptaciones y sigue cubriendo.
- Reglas, probadas en `terminos-paciente.spec.ts`: versiones únicas con formato `^\d+\.\d+$`;
  `recibeAceptaciones ⇒ sigueCubriendo`; ninguna entrada se borra.
- **Un cambio de texto es siempre una versión nueva.** Pasar a otra versión sigue los tres pasos de
  [ADR-16 §2](../Decisions/ADR-16.md#2-catálogo-de-versiones-d3): el backend la agrega, el frontend la publica y el
  backend retira la anterior al menos un día después.
- El frontend tiene un espejo de la versión y del mensaje fijo en `src/shared/config/terminosPaciente.ts`. Si cambia
  uno, cambia el otro en el mismo cambio.

---

## Esquema de BD

Dos migraciones aditivas. Las entidades ORM declaran lo mismo (fechas `timestamptz`, CHECK e índices), así que el
`synchronize` de los tests queda igual que la migración. **Los dos `down` son destructivos.**

| Migración | Qué hace | `down` |
|---|---|---|
| `1750000021000-CreateAceptacionesTerminos` | tabla `aceptaciones_terminos` · FK `ON DELETE RESTRICT` a `tenants`, `pacientes` y `usuarios` · **sin FK** a `solicitudes_cita` ni a `enlaces_cita` (son referencias) · CHECK de la versión, del canal y de «exactamente la referencia de su canal» · índice único `(paciente_id, version, canal)` | **borra toda la prueba**. En production no se revierte después de la primera aceptación real: se corrige hacia adelante |
| `1750000022000-AddTerminosVersionASolicitudesCita` | `solicitudes_cita.terminos_version` (`VARCHAR(10) NULL`) y un CHECK: solo en una `nueva` con `consentimiento = true` | pierde la versión de las solicitudes que no se aceptaron |

- **Sin relleno** (D7): los pacientes que ya existían quedan sin aceptación, y las solicitudes viejas, con
  `terminos_version` en `NULL`.
- Sin índice por `tenant_id`: nada consulta por organización todavía. Sin plazo de conservación
  ([DT-26](../Deudas/DT-26.md)).
- Con estas dos, el repo tiene **23 migraciones**.

### Orden de bloqueo

| Flujo | Orden |
|---|---|
| Portal (las cinco rutas) | cita (`FOR NO KEY UPDATE`) → enlace (solo el GET, la primera apertura) → paciente (solo `aceptar-terminos`, la bandera) |
| Bandeja, `nueva` | solicitud (`FOR UPDATE`) → paciente → cita **nueva** |
| Alta manual | paciente → cita nueva |

Nadie bloquea una cita existente después de un paciente: sin ciclos.

### `seed.ts`

Los pacientes demo con `consentimiento: true` se crean por `crearPaciente`, con su aceptación `profesional` (v1.0) a
nombre del administrador demo. Camila (`false`) representa una ficha vieja: se crea con `resolverOCrear`, sin
aceptación, para probar la política de consentimiento y la tarjeta de `/cita`. El seed borra `aceptaciones_terminos`
del tenant demo antes que `pacientes` y `usuarios` (FK `RESTRICT`).

---

## Frontend (`citia-frontend`)

En production desde el 2026-11-16 a las 21:01 (citia-frontend#21); la fecha de `/terminos`, corregida al 16 desde el
2026-11-17 a las 11:08 (citia-frontend#23). *Antes: «rama `feature/terminos-paciente`, sin release».* Está documentado
en ese repo:
`citia-frontend/context/us/11-terminos-paciente.md` y las features `agendar-cita-paciente`, `crear-cita`,
`responder-cita-paciente` y `bandeja-solicitudes`. Lo que importa desde aquí:

- **`/terminos`** tiene el texto 1.0. Se comparó bloque por bloque con el del
  [plan](../US/11-terminos-paciente.md#el-texto-que-se-publica): 55 de 55 bloques iguales (42 de `/terminos`, incluida
  la línea del job G1).
- **`src/shared/config/terminosPaciente.ts`:** `VERSION_TERMINOS_PACIENTE = '1.0'`,
  `FECHA_TERMINOS_PACIENTE = '2026-11-16'` (el día del release; pasó por `'2026-11-15'`, la fecha prevista, entre
  el 2026-11-16 a las 21:01 y el 2026-11-17 a las 11:08: ver la
  [copia congelada](../Cumplimiento/terminos-paciente-v1.0.md#la-fecha-que-mostró-la-página)) y el mensaje fijo.
- **Funciona con el backend de hoy:** `terminosVersion` viaja igual y el backend viejo la descarta; la tarjeta de
  `/cita` solo aparece con `terminosPendientes === true` (y con la hora vigente), así que sin el campo no aparece.
- **El texto vive en el frontend y en la copia congelada del backend**, y nada los compara solo: el frontend no tiene
  suite de tests. Es `DTF-09`, en `citia-frontend/context/Deudas/`.

---

## Tests y verificación

### Tests

| Archivo | Tipo | Cubre |
|---|---|---|
| `paciente/domain/terminos-paciente.spec.ts`, `aceptacion-terminos.entity.spec.ts` | unit | las reglas del catálogo (también con uno de varias versiones); cada canal con su referencia y las otras en `null`; la versión que exige cada canal |
| `paciente/application/pacientes.service.spec.ts`, `presentation/dto/crear-paciente.dto.spec.ts`, `presentation/pacientes.controller.spec.ts` | unit | `registrarAceptacion`, `titularAceptoVigente` y `crearPaciente` en una transacción; `@Equals(true)` y la versión; el 400 con el mensaje fijo |
| `cita/application/citas.service.spec.ts`, `presentation/citas.controller.spec.ts` | unit | `crearCita` registra `profesional` solo con `paciente`; el error a 400 |
| `solicitud/presentation/dto/crear-solicitud.dto.spec.ts`, `application/bandeja-solicitudes.service.spec.ts` | unit | el formulario; `formulario_publico` con `aceptadaEn = recibidaEn`; sin versión no registra |
| `portal-paciente/application/portal-paciente.service.spec.ts`, `presentation/portal-paciente.controller.spec.ts` | unit | `terminosPendientes` en las cinco respuestas; `aceptarTerminos` idempotente y sin `exigir`; el 404; el 200, los límites y las cabeceras |
| `paciente/infrastructure/persistence/typeorm-aceptacion-terminos.repository.spec.ts`, `typeorm-paciente.repository.spec.ts` (`1d00f9e`) | unit | la forma del SQL, los parámetros, las guardas de UUID, `tx` obligatorio; `marcarConsentimiento` condicional y por organización |
| `paciente/integration/aceptaciones-terminos.integration.spec.ts` (`1d00f9e`) | integración | los tres CHECK (la barra de la expresión regular llega a Postgres); **el índice único con dos transacciones en conexiones distintas → una fila** (si la primera se revierte, escribe la segunda); `INSERT … SELECT` con un paciente de otra organización; FK `RESTRICT`; `registrarAceptacion` atómica en una transacción real |
| `solicitud/`: entidad, `solicitudes.service.spec.ts`, adaptador, `bandeja-solicitudes.service.spec.ts` e `integration/solicitudes-persistencia` (`fc3a83f`) | unit e integración | la versión de ida y vuelta; `recibir` sigue con un solo `INSERT`; `reagendamiento` y `rechazar` no registran; un paciente existente por RUT con `false` queda en `true`; el CHECK `CHK_solicitudes_cita_terminos_version` |
| `portal-paciente/`: servicio, `dto/aceptar-terminos.dto.spec.ts` e `integration/portal-paciente-concurrencia` (`305dea5`) | unit e integración | el orden cita → inserción → bandera en el mismo `tx`; ni el GET ni los otros tres `POST` registran; **`aceptar-terminos` contra la bandeja aceptando una solicitud del mismo paciente, en los dos órdenes, sin interbloqueo**; dos y cinco `aceptar-terminos` con el mismo enlace → una fila |
| la [lista de e2e del plan](../US/11-terminos-paciente.md#e2e-solo-listadas-no-se-corren-sin-la-autorización-del-usuario) (`66e54bc`) | e2e | `pacientes`, `portal-paciente`, `limite-tasa` y `solicitudes-bandeja` con los casos nuevos (400 por la casilla y la versión, filas de los tres canales, `aceptar-terminos` dentro del 404 uniforme, del cubo `portalPorEnlace` y con sus cabeceras); `terminosVersion: '1.0'` en `logs-redaccion`, `citas-dashboard`, `recordatorios-flujo` y `recordatorios-politicas` |

**Resultado (2026-11-14, rama `feature/terminos-paciente`):**

| Suite | Resultado |
|---|---|
| `npm test` | 137 suites, **2577 tests** en verde |
| `npm run test:integration` (Postgres local) | 14 suites, **316 tests** en verde |
| `npm run test:e2e` (con la autorización del usuario) | 18 suites, **418 tests** en verde |
| `tsc`, ESLint y Prettier | limpios |
| Frontend: `npm run build` (`vue-tsc` + `vite`) | en verde |

Ninguna suite corre el SQL de las migraciones `1750000021000` y `1750000022000`: las integraciones arman el esquema
con `synchronize` desde el ORM. Las dos se probaron a mano en `citia_dev` (`migration:run`, dos `migration:revert` y
otra vez `migration:run`), y un diff de esquema en seco no mostró diferencias entre la ORM y la migración.

### Verificación en local (2026-11-14)

En la base `citia_dev`, con una cuenta de prueba y el frontend de la rama, la consulta 1 de la
[Definición de Terminado](../US/11-terminos-paciente.md#definición-de-terminado) mostró **las tres filas**:

| Canal | Desde | Lo que se comprobó |
|---|---|---|
| `profesional` | el modal *Nueva cita* | el `usuario_id` de quien marcó la casilla |
| `formulario_publico` | un formulario público aceptado en la bandeja | su `solicitud_id`, y `aceptada_en` igual a la hora del envío, que es la `recibida_en` de la solicitud |
| `enlace_cita` | la tarjeta de `/cita` | su `enlace_id` |

Además:

- el GET de `/cita` no escribió nada;
- la cita siguió `pendiente` después de aceptar;
- al reabrir el enlace, la tarjeta ya no aparece;
- la consulta 3 del plan dio **0 filas**;
- en la fila `profesional`, `registrada_en` quedó unos milisegundos antes que `aceptada_en`
  ([arriba](#aceptada_en-es-la-prueba-registrada_en-dice-cuándo-se-escribió-la-fila)).

### Verificación en production (2026-11-17 → 2026-11-20)

Con la cuenta de prueba de siempre (no la del piloto) y su organización, en `app.citiahealth.cl`. La
[verificación manual mínima](../US/11-terminos-paciente.md#verificación-manual-mínima) se hizo **en production**; en
staging no se repitió.

| Fecha | Vía | Lo que se vio en la app | Lo que quedó en la base |
|---|---|---|---|
| 2026-11-17 | **`/terminos`** | el texto 1.0 y *«Versión 1.0 · publicada el 16 de noviembre de 2026»* | — |
| 2026-11-17, 12:09 y 12:11 | **formulario público**, aceptado después en la bandeja | dos solicitudes enviadas con la casilla marcada y aceptadas en la bandeja (las hizo el usuario) | dos filas `formulario_publico` v1.0, cada una con su `solicitud_id`; `aceptada_en` = la hora del envío y `registrada_en` = la hora de aceptarla en la bandeja (unos segundos después) |
| 2026-11-17, 12:17 | **modal *Nueva cita***, alta manual | el texto del alta manual; sin la casilla no guarda y dice *«Marca la casilla cuando el paciente te haya autorizado.»* | una fila `profesional` v1.0 con el `usuario_id` de quien marcó la casilla |
| 2026-11-19, 15:30 → 15:32 | **tarjeta de `/cita`**, desde el recordatorio real de una cita de ese mismo paciente | la tarjeta *Tus datos y Citia*; **«Confirmar mi hora» funciona sin aceptar** (la cita pasa a Confirmada y la tarjeta sigue); «Acepto» → *«Gracias. Quedó registrada tu autorización.»* y la tarjeta desaparece; al reabrir el enlace en otra pestaña, sin tarjeta | una fila `enlace_cita` v1.0 con su `enlace_id` |

Las filas se leyeron el **2026-11-20** con un script de solo lectura que corrió el usuario (`BEGIN READ ONLY`, sin
datos personales en la salida: ids cortos, canales, versiones y fechas), con las consultas 1 y 2 de la
[Definición de Terminado](../US/11-terminos-paciente.md#definición-de-terminado). Las migraciones `1750000021000` y
`1750000022000` están aplicadas. Además:

- **D11 se vio en production dos veces.** La cita del 2026-11-19 se creó desde el modal, con la casilla, para el mismo
  paciente que ya tenía su fila `profesional` 1.0: no se insertó otra. Y una tercera solicitud del formulario, enviada
  el 2026-11-17 y aceptada, cayó por RUT en un paciente que ya tenía su `formulario_publico` 1.0: tampoco. Las dos quedaron hechas
  igual (la cita creada y la solicitud aceptada), así que el registro no falló: la fila ya existía.
- **La consulta 3** dejó de contar a ese paciente después de «Acepto», y sigue contando a los pacientes de antes de
  US-11 que no han aceptado (D7).
- **Hallazgo menor, del frontend (sin ficha):** en el modal *Nueva cita*, el aviso rojo de la casilla no se borra al
  marcarla; se borra recién al guardar.

---

## Release (2026-11-16)

En el orden de [ADR-16 §10](../Decisions/ADR-16.md#10-despliegue-primero-el-frontend-después-el-backend): **primero el
frontend, después el backend.** Con `whitelist` sin `forbidNonWhitelisted`, el backend de antes descartaba
`terminosVersion` en silencio. Al revés, el modal y el formulario de antes habrían recibido 400 hasta que llegara el
frontend. En staging, US-11 llegó a `develop` el 2026-11-15 (PR #20, junto con el arreglo del RUT, PR #21).

| # | Paso | Cómo se hizo |
|---|---|---|
| 0 | `FECHA_TERMINOS_PACIENTE` al día del release | se puso la fecha **prevista**, `'2026-11-15'`, y el release fue el 16. Se corrigió al 16 con citia-frontend#22 y su release #23 (2026-11-17, 11:08). Lo que vio cada paciente queda en la [copia congelada](../Cumplimiento/terminos-paciente-v1.0.md#la-fecha-que-mostró-la-página) |
| 1 | Frontend a production (Netlify) | ✅ citia-frontend#21, mergeado el **2026-11-16 a las 21:01** |
| 2 | Comprobar `/terminos` y que **`soporte@citiahealth.cl` recibe correo** | `/terminos` ✅. **El correo, no antes del backend:** el reenvío de Cloudflare se configuró el **2026-11-17**, y desde las ~11:33 de ese día `soporte@citiahealth.cl` recibe ([Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte)). Entre el 2026-11-16 a las 21:01 y esa hora, el texto publicaba una dirección que todavía no recibía |
| 3 | Backend a production (Railway), **al menos 30 minutos después** | ✅ citia-backend#23 (`8738b98`), mergeado el **2026-11-16 a las 21:22**: **21 minutos** después del frontend, no 30. Las migraciones se aplicaron al arrancar |
| 4 | **Pedirle a la profesional del piloto que recargue el panel** | no consta en estos docs |
| 5 | La **copia congelada** [`terminos-paciente-v1.0.md`](../Cumplimiento/terminos-paciente-v1.0.md) | ✅ 2026-11-15 (`31b5c3f`, PR #22 a `develop`); la fecha, corregida al 16 el 2026-11-17 (PR #24). Llega a `main` con el release de los docs de cierre |
| 6 | La verificación manual mínima en production y las consultas de la Definición de Terminado | ✅ 2026-11-17 → 2026-11-20 ([arriba](#verificación-en-production-2026-11-17--2026-11-20)) |

---

## Decisiones de la implementación

Dentro del contrato; ninguna rediseña.

- **Backend.** Las funciones del catálogo reciben el catálogo como último parámetro, con el vigente por defecto: así
  los tests prueban las reglas con varias versiones sin tocar el real. `AceptacionTerminos` tiene además `reconstituir`,
  para el adaptador. Si falta la versión al llegar al caso de uso (solo pasaría sin el DTO), `registrar` lanza
  `VersionTerminosNoVigenteError`, se revierte todo y responde 400.
- **Seed.** Camila se crea sin aceptación, como una ficha de antes de US-11 (arriba).
- **Frontend** (detalle en su plan): la tarjeta solo con la hora vigente; un envío a la vez entre «Acepto» y las
  acciones; el error de «Acepto» se muestra en la tarjeta; sin el botón opcional *«Copiar texto»* del alta manual.

---

## Lo que no hace

- No enciende `PoliticaConsentimiento` ([DT-16](../Deudas/DT-16.md), parte 1): los recordatorios siguen saliendo sin
  mirar la bandera.
- No registra el retiro de la autorización ([DT-62](../Deudas/DT-62.md)) ni muestra la aceptación en el voucher
  ([DT-63](../Deudas/DT-63.md), D14).
- No atiende derechos: exportar, suprimir ([DT-53](../Deudas/DT-53.md)).
- No rellena a los pacientes que ya existían (D7). Se les pide en `/cita`, y quien no recibe recordatorios nunca ve la
  tarjeta.
- No prueba identidad: el enlace prueba quién lo tenía ([ADR-10 §2](../Decisions/ADR-10.md),
  [DT-42](../Deudas/DT-42.md)).
- No controla la edad: el texto fija 16 años ([DT-54](../Deudas/DT-54.md)).
- El texto no lo revisó un abogado ([Cumplimiento](../Cumplimiento/README.md)).

---

## Pendientes

**Ninguno de la historia** (2026-11-20). Lo que queda fuera está en [Lo que no hace](#lo-que-no-hace) y en sus deudas.

| Qué | Nota |
|---|---|
| Las e2e de US-11 | ✅ `66e54bc`, corridas con la autorización del usuario el 2026-11-14 ([arriba](#tests)) |
| Lint y tests en verde | ✅ antes del PR #20 a `develop` |
| El [release](#release-2026-11-16) | ✅ 2026-11-16, frontend primero; el backend, 21 minutos después |
| [Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte) | ✅ `soporte@citiahealth.cl` recibe desde el 2026-11-17, **después** del paso 3 y no antes |
| La copia congelada y el borrador marcado como publicado | ✅ 2026-11-15: [`terminos-paciente-v1.0.md`](../Cumplimiento/terminos-paciente-v1.0.md), con la fecha del release del frontend, corregida al 2026-11-16 el 2026-11-17. *Antes: «al publicar (paso 5)».* |
| La verificación manual | ✅ en production, 2026-11-17 → 2026-11-20 ([arriba](#verificación-en-production-2026-11-17--2026-11-20)); en staging no se hizo |
| El aviso de la casilla del modal que no se borra al marcarla | hallazgo menor del frontend, sin ficha |

---

## Deudas técnicas asociadas

**Cierra en parte:** [DT-16](../Deudas/DT-16.md) — la parte (2), en las tres vías, **cerrada en production desde el
2026-11-16**; avanza la (3).

**Avanza:** [DT-53](../Deudas/DT-53.md) — el punto 1, para el paciente. El texto ya informa el cierre automático como
inasistencia (job G1).

**Contrae** con el release del 2026-11-16 (eran ⚪ previstas): [DT-62](../Deudas/DT-62.md) (el retiro no se
registra) · [DT-63](../Deudas/DT-63.md) (el profesional no ve si el paciente aceptó).

**Toca:** [DT-26](../Deudas/DT-26.md) (`aceptaciones_terminos` y `solicitudes_cita.terminos_version`, sin plazo) ·
[DT-52](../Deudas/DT-52.md) (el texto nombra a Railway, Resend y Netlify y publica la casilla de soporte) ·
[DT-54](../Deudas/DT-54.md) (16 años, sin control) · [DT-46](../Deudas/DT-46.md) (las fechas nuevas declaran
`timestamptz`) · [DT-42](../Deudas/DT-42.md) (el enlace reenviado deja aceptar a otro).

**En el frontend:** `DTF-09` (el texto en dos lugares, sin comparación automática).

Índice completo: [`../Deudas/README.md`](../Deudas/README.md).
