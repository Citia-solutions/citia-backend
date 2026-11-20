# ADR-16: Términos de uso y aviso de privacidad del paciente — texto versionado en `/terminos`, prueba de la aceptación en `aceptaciones_terminos` y aceptación desde el enlace de la cita

> **Fase:** — (transversal: [Cumplimiento](../Cumplimiento/README.md); [ROADMAP § Cumplimiento](../ROADMAP.md#cumplimiento-ley-21719--transversal)) · **Feature:** [us11-terminos-paciente](../Features/us11-terminos-paciente.md) · **Plan:** [US-11](../US/11-terminos-paciente.md) · **Relacionado:** [borrador v0.2 de los términos](../Cumplimiento/borrador-terminos-paciente.md), [ADR-02](ADR-02.md), [ADR-06](ADR-06.md), [ADR-09](ADR-09.md), [ADR-10](ADR-10.md), [ADR-12](ADR-12.md), [ADR-13](ADR-13.md), [DT-16](../Deudas/DT-16.md), [DT-26](../Deudas/DT-26.md), [DT-52](../Deudas/DT-52.md), [DT-53](../Deudas/DT-53.md), [DT-54](../Deudas/DT-54.md), [DT-62](../Deudas/DT-62.md), [DT-63](../Deudas/DT-63.md), [Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte)

**Fecha:** 2026-11-14
**Estado:** **Aceptado** (2026-11-14). El usuario aprobó el documento completo ese día. · **En producción desde el
2026-11-16** (frontend citia-frontend#21 a las 21:01, backend citia-backend#23 `8738b98` a las 21:22) y **verificado en
production** entre el 2026-11-17 y el 2026-11-20: las tres vías dejan su fila. Lo construido y la verificación están
en la feature [us11-terminos-paciente](../Features/us11-terminos-paciente.md); cómo se cumplió la
[decisión 10](#10-despliegue-primero-el-frontend-después-el-backend), en su
[nota](#nota-2026-11-20-cómo-se-cumplió-la-decisión-10). *Antes (2026-11-14 → 2026-11-16): «implementado en la rama
`feature/terminos-paciente`, sin release», con backend `92a1f36`, `bdeb1aa` y `894b96c` y frontend `eb3fbcc` a
`e276343`. Antes: «Aceptado (2026-11-14)», en implementación.*

- **Decididas por el usuario el 2026-11-14**, al elegir entre opciones: **D1** (tabla de historial de solo inserción;
  `pacientes.consentimiento` sigue como bandera), **D2** (`/terminos` genérica; el nombre de la organización solo
  donde ya se conoce; `[contacto]` resuelto sin campo nuevo ni endpoint por slug), **D4** (tarjeta no bloqueante en
  `/cita`), **D6** (en el alta manual, un `false` responde 400: si el paciente no autoriza, no se registra) y **D8**
  (se quita «con un máximo de [plazo]»). También pidió sumar al §2 del texto la línea del cierre automático como
  inasistencia (job G1), que pide [DT-53](../Deudas/DT-53.md).
- **Aprobadas por el usuario el 2026-11-14 tal como se propusieron:** **D3** (el frontend envía la versión y el
  backend solo acepta versiones conocidas), **D5** (el formulario público exige `consentimiento: true`), **D7** (sin
  relleno), **D9** (se publica como 1.0) y **D10** a **D14** ([abajo](#opciones-evaluadas)), con el número US-11.

**Historia:** US-11 — plan y contrato en [US/11-terminos-paciente.md](../US/11-terminos-paciente.md)
**Relación:** **cierra la parte (2)** de [DT-16](../Deudas/DT-16.md) en las tres vías de entrada (el backend rechaza
`consentimiento: false` y registra de quién viene) y **avanza la (3)** (el titular acepta en el formulario y en
`/cita`); la (1), encender la política, sigue abierta · **avanza el punto 1** de [DT-53](../Deudas/DT-53.md) (el texto
para el paciente, publicado y enlazado desde las páginas públicas) · **matiza** [ADR-09 §3](ADR-09.md) por segunda vez
(la primera fue el correo de [ADR-13 §14](ADR-13.md)): la aceptación del titular pone `consentimiento = true` en la
ficha de un paciente existente · **respeta** [ADR-09 §8](ADR-09.md) (la ruta anónima solo escribe en
`solicitudes_cita`, sin transacción, y el 202 sigue uniforme) · **respeta** S2 y S3 de [ADR-10](ADR-10.md) (abrir
`/cita` no ejecuta nada; aceptar es un `POST`; la vista suma un booleano, ningún dato del paciente) · **replica**
[ADR-06](ADR-06.md) y los puertos de [ADR-02](ADR-02.md) · **no usa** el outbox de [ADR-12](ADR-12.md) (ningún hecho
nuevo).

---

## Contexto

### Por qué ahora

Desde el **2026-11-11** hay en production una cuenta con **pacientes reales** (un piloto: una psicóloga que agenda a
sus pacientes; [Cumplimiento](../Cumplimiento/README.md#el-límite-real-la-primera-clínica-con-pacientes-reales)). El
2026-11-14 el usuario decidió abordar el P1 de cumplimiento **sin abogado por ahora** y sin pausar el piloto,
empezando por los términos que autoriza el paciente. El texto existe: el
[borrador v0.2](../Cumplimiento/borrador-terminos-paciente.md), con sus 7 decisiones confirmadas el mismo día. Este ADR
decide **cómo se publica, cómo se pide y cómo queda la prueba**. La Ley 21.719 rige el **2026-12-01** mientras no se
publique la postergación.

> **Nada de esto es una opinión legal.** El texto es del proyecto y nadie con formación legal lo revisó
> ([Cumplimiento](../Cumplimiento/README.md)).

### Lo que hay hoy (verificado en el código, 2026-11-14)

| Pieza | Estado |
|---|---|
| `pacientes.consentimiento` | `BOOLEAN NOT NULL DEFAULT false`. Lo fija el alta (`Paciente.crear`) y **nunca se actualiza**. Lo lee solo `PoliticaConsentimiento` (`recordatorio/domain/politicas-envio.ts`), **apagada** ([DT-16](../Deudas/DT-16.md)). No sale en el voucher (`CitaDetalleDto`); sí en `PacienteResponseDto` |
| Formulario público | `POST /publico/:tenantSlug/solicitudes` → `SolicitudesService.recibir` hace **un solo `INSERT`** en `solicitudes_cita`, **sin transacción**; la regla del módulo prohíbe darle `TransactionRunner` (`solicitud/CLAUDE.md`). `CrearSolicitudDto.consentimiento` es `@IsBoolean()`: acepta `false`. Responde **202 uniforme** exista o no la organización |
| Solicitud → paciente | Al aceptar una `nueva`, `BandejaSolicitudesService.crearCita` → `CitasService.agendar(…, SOLICITUD_PUBLICA)` → `PacientesService.resolverOCrear`. Paciente nuevo: nace con el `consentimiento` de la solicitud. Paciente existente por RUT: la ficha **no se toca** salvo el correo vacío (ADR-13 §14): **el consentimiento que dio el paciente se pierde** para la ficha (queda solo en la fila de la solicitud) |
| Alta manual | `POST /citas` con `paciente` en línea (lo que usa el modal) o con `pacienteId` (**sin ningún dato de consentimiento**; el frontend no lo usa) y `POST /pacientes` (el frontend **no** lo usa para crear). `CrearPacienteDto.consentimiento` acepta `false`. `PacientesService.crearPaciente` **no abre transacción** |
| Portal `/cita` | `PortalPacienteService`: una transacción por petición, la cita bloqueada primero (`FOR NO KEY UPDATE`). `VistaCitaPacienteDto` sin datos del paciente (regla «la vista nunca lleva…»). Límite `portalPorIp` (30/min) y, en cada `POST`, `portalPorEnlace` (**5/h por enlace, un cubo compartido** por todos los `POST`) |
| Validación global | `ValidationPipe({ whitelist: true, transform: true })`, **sin** `forbidNonWhitelisted`: un campo desconocido se **descarta en silencio** |
| `Tenant` | `id, nombre, slug, tipo, plan, creadoEn`: **sin dato de contacto** |
| Frontend | La casilla del formulario dice *«Autorizo que me contacten para confirmar y recordar mi cita.»* (`MotivoStep.vue`) y la del modal *«El paciente autoriza recibir recordatorios y avisos de sus citas.»* (`ModalNuevaCita.vue`); los dos formularios la **exigen**. La bandeja muestra *«· acepta recordatorios»*. `BaseCheckbox` solo recibe un `label` de texto (sin slot). En `/cita` **el token vive solo en memoria**: si el paciente navega en la misma pestaña, pierde la página |
| Casilla de soporte | [Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte) respondida el 2026-11-14 (`soporte@citiahealth.cl`, reenvío de Cloudflare a Gmail), con **el reenvío de Cloudflare todavía por configurar** |
| Migraciones | la última es `1750000020000` |

---

## Opciones evaluadas

### D1. Dónde vive la prueba — **decidida por el usuario (2026-11-14)**

| Opción | Veredicto |
|---|---|
| **a. Tabla de historial de solo inserción `aceptaciones_terminos`**, con `pacientes.consentimiento` como bandera (ELEGIDA) | Es evidencia: guarda cada aceptación con su versión, fecha y canal, y no se pisa. La bandera sigue sirviendo a `PoliticaConsentimiento` |
| b. Columnas de «última aceptación» en `pacientes` y `solicitudes_cita` | Más simple, pero cada aceptación borra la anterior, y el canal del profesional pisaría al del paciente. Descartada |

### D10. Cómo entra a la tabla la aceptación del formulario público (agregada)

La tabla es del paciente, pero el paciente del formulario **no existe** hasta que el profesional acepta la solicitud
([ADR-09 §3](ADR-09.md)).

| Opción | Veredicto |
|---|---|
| **a. La solicitud guarda la versión (`solicitudes_cita.terminos_version`) y la fila de `aceptaciones_terminos` nace al aceptarla en la bandeja**, con `aceptada_en` = el momento en que el paciente envió el formulario (INCLINACIÓN) | La ruta anónima sigue con **un solo `INSERT`** en su propia tabla y sin `TransactionRunner` ([ADR-09 §8](ADR-09.md), regla 1; regla del módulo). Una solicitud rechazada conserva su prueba en su fila. La tabla siempre apunta a un paciente |
| b. Insertar la fila al recibir el formulario, con `paciente_id` nulo, y completarla al aceptar | Exige una transacción en la ruta anónima y un `UPDATE` sobre una tabla que se quiere de solo inserción (o una segunda fila). Descartada |

### D11. Cuántas filas (agregada)

| Opción | Veredicto |
|---|---|
| Una fila por acto | El modal envía la casilla en **cada** cita manual, también con un paciente que ya existe: sería una fila por cita. Ruido sin valor |
| **Una fila por paciente, versión y canal**: índice único y `INSERT … ON CONFLICT DO NOTHING`; queda el **primer** acto de cada canal para cada versión (INCLINACIÓN) | Idempotente sin leer antes y a prueba de carreras. Los envíos posteriores del formulario conservan su propia prueba en `solicitudes_cita` |

### D12. Qué identifica el acto (agregada)

| Opción | Veredicto |
|---|---|
| **Sin IP ni navegador**: el acto se ata a la solicitud, al enlace o al usuario que marcó la casilla (INCLINACIÓN) | Minimización: hoy los logs no guardan la IP a propósito ([Cumplimiento](../Cumplimiento/README.md)), y una IP no prueba identidad. Lo que sí prueba algo (el enlace llegó al correo del paciente; la solicitud la envió quien escribió su RUT) ya está referenciado |
| Guardar IP y `User-Agent` | Un dato personal más, sin plazo de conservación ([DT-26](../Deudas/DT-26.md)) y de valor probatorio discutible. Descartada por ahora |

### D3. Versiones — **aprobada por el usuario (2026-11-14)**

| Opción | Veredicto |
|---|---|
| **a. Catálogo en el código del backend** (`paciente/domain/terminos-paciente.ts`); el frontend envía la versión que mostró y el backend acepta solo las que «reciben aceptaciones» (POR DEFECTO) | Una versión nueva del texto siempre exige un despliegue del frontend; el del backend acompaña. Sin variable de entorno nueva (una variable obligatoria tumbó production en la Fase 3) |
| b. Variable de entorno con la lista | Se cambia sin desplegar, pero el texto no cambia sin desplegar, así que no se gana nada. Descartada |
| c. Tabla `versiones_terminos` con el texto o su hash | La prueba más fuerte del texto exacto, pero suma una tabla, su administración y su copia. Excesiva para una versión. La copia congelada del texto en `context/Cumplimiento/` cumple ese papel por ahora |

### D2. Cómo se llenan los marcadores — **decidida por el usuario (2026-11-14)**

| Opción | Veredicto |
|---|---|
| **a. `/terminos` genérica («tu profesional») y el nombre donde ya se conoce** (`/cita`, el panel) (ELEGIDA) | Sin endpoint ni campo nuevo |
| b. `/terminos/:tenantSlug` con un endpoint público que dé el nombre por slug | Sería un oráculo de existencia de organizaciones, lo que el 202 uniforme de [ADR-09 §8](ADR-09.md) evita. Descartada |
| `[contacto]`: **«por el medio que usas para comunicarte con tu profesional» + `soporte@citiahealth.cl`** (ELEGIDA) frente a un campo de contacto nuevo en el perfil | El campo nuevo sumaba alcance (perfil, migración, validación) |

### D4. Cómo se pide en `/cita` — **decidida por el usuario (2026-11-14)**

| Opción | Veredicto |
|---|---|
| **a. Tarjeta no bloqueante con «Acepto» sobre las acciones** (ELEGIDA) | Las acciones siguen disponibles. Retirar la autorización es escribirle al profesional, como dice el texto. La tarjeta desaparece cuando el **propio paciente** acepta (formulario o enlace) |
| b. Puerta bloqueante | Impediría cancelar una hora a quien no acepta: castiga la acción que más le sirve al profesional. Descartada |

### D5. Formulario público — **aprobada por el usuario (2026-11-14)**

Exigir `consentimiento: true` (y la versión) en el backend: un `false` responde 400. El 400 sale **antes** de buscar
la organización, como el del RUT mal formado, así que el 202 sigue uniforme.

### D6. Alta manual — **decidida por el usuario (2026-11-14)**

| Opción si llega `consentimiento: false` | Veredicto |
|---|---|
| **a. 400**: la casilla es obligatoria también en la API (POR DEFECTO) | Es lo que el frontend ya exige y lo que dice el texto del alta manual: se le pregunta al paciente **antes** de registrarlo. Si no autoriza, no se registra en Citia |
| b. Aceptar `false`, crear el paciente sin aceptación y esperar a que acepte en `/cita` | El recordatorio le llegaría a alguien que dijo que no (la política sigue apagada). Descartada |

### D7. Pacientes que ya existen — **aprobada por el usuario (2026-11-14)**

Sin relleno: no se inventa evidencia (ni versión ni fecha) para un texto que no existía. Se les pide en `/cita`.

### D9. Número de versión — **aprobada por el usuario (2026-11-14)**

**1.0**, con la fecha del release a producción del frontend. «0.2» describía un borrador.

### D13. Qué ve el profesional en la bandeja (agregada)

Con D5, toda solicitud `nueva` llega con `consentimiento: true`: el *«· acepta recordatorios»* de la bandeja deja de
decir algo.

| Opción | Veredicto |
|---|---|
| **a. Campo aditivo `terminosVersion` en `SolicitudBandejaDto`; la bandeja muestra «· aceptó los términos v1.0»** y nada si es nulo (INCLINACIÓN) | Una columna que ya se lee y una línea de frontend |
| b. Quitar la línea | Se pierde lo único que el profesional ve del consentimiento |
| c. Dejarla | Sigue diciendo lo mismo para todas |

### D14. Qué ve el profesional en el voucher (agregada)

| Opción | Veredicto |
|---|---|
| **a. Nada en esta historia**; la prueba se consulta en la base (INCLINACIÓN) | El profesional no tiene nada que hacer con el dato: no hay «reenviar el enlace» ni flujo de retiro. Menos alcance en `cita` |
| b. Una línea en el voucher: «Términos: aceptados por el paciente (v1.0, 20-11) · registrados por ti · pendientes» | Útil para atender un derecho del paciente, pero exige un campo en `CitaDetalleDto` y una lectura cruzada desde `cita`. Es el paso natural cuando se diseñe [DT-53](../Deudas/DT-53.md) |

### D8. El plazo de conservación (§6) — **decidida por el usuario (2026-11-14)**

Se publica **sin** «con un máximo de [plazo]». El máximo entra en una versión nueva cuando se resuelva
[DT-26](../Deudas/DT-26.md).

---

## Decisión

### 1. El texto: `/terminos`, versión 1.0, genérico (D2, D8, D9)

- **Página pública del frontend** `/terminos`, sin sesión ni layout del panel, sin llamadas a la API y sin recursos de
  terceros. Muestra el texto completo, su versión y su fecha.
- **Un solo texto, genérico**: «tu profesional» es la persona o la clínica que agenda las horas con Citia. El nombre
  aparece donde ya se conoce: en la tarjeta de `/cita` (`profesional` y `organizacion` de la vista) y en el panel.
- **`[contacto]`** = «por el medio que usas para comunicarte con tu profesional», más `soporte@citiahealth.cl`.
- **§6** sin «con un máximo de [plazo]».
- **El texto exacto de la versión 1.0**, los textos cortos (casilla, tarjeta de `/cita`, alta manual) y la lista de
  cambios respecto del borrador v0.2 están en el [plan § El texto que se publica](../US/11-terminos-paciente.md#el-texto-que-se-publica).
- **Copia congelada:** al publicarla, el texto de la 1.0 se copia a `context/Cumplimiento/terminos-paciente-v1.0.md`,
  que **no se edita** (como el pre-análisis). Es la prueba de qué decía la versión que alguien aceptó.

### 2. Catálogo de versiones (D3)

En `paciente/domain/terminos-paciente.ts` (dominio puro):

```ts
interface VersionTerminosPaciente {
  version: string;             // '1.0'
  recibeAceptaciones: boolean; // el backend acepta una aceptación nueva con esta versión
  sigueCubriendo: boolean;     // una aceptación del titular con esta versión basta para no volver a pedirla
}
CATALOGO_TERMINOS_PACIENTE = [{ version: '1.0', recibeAceptaciones: true, sigueCubriendo: true }]
```

- **Reglas del catálogo** (las prueba un unitario): versiones únicas, con formato `^\d+\.\d+$`;
  `recibeAceptaciones ⇒ sigueCubriendo`; **ninguna entrada se borra nunca** (una solicitud vieja puede llegar a la
  bandeja con una versión que ya no recibe aceptaciones, y se registra igual).
- **El frontend envía la versión que mostró** (`terminosVersion`). En el formulario, en el modal y en `/cita`, el
  backend exige una versión con `recibeAceptaciones`; si no, **400** con un mensaje fijo, igual en las tres rutas:
  *«La versión de los términos ya no está vigente. Recarga la página.»* (`MENSAJE_VERSION_TERMINOS_NO_VIGENTE`). El
  frontend lo reconoce por ese texto y pide recargar.
- **Cambiar de versión sin cortar el formulario** (para la 1.1, no para esta historia):
  1. **Backend:** agrega la 1.1 (`recibe` y `cubre`); la 1.0 sigue recibiendo.
  2. **Frontend:** publica el texto 1.1 y envía `'1.1'`.
  3. **Backend, al menos un día después:** la 1.0 deja de recibir; y si la 1.1 es un **uso nuevo** de los datos (§10
     del texto: «te pediremos una autorización nueva»), la 1.0 deja de cubrir. Hacerlo en el paso 1 haría que
     `/cita` pidiera aceptar a quien solo puede enviar la 1.0.

### 3. La tabla `aceptaciones_terminos` (D1, D11, D12)

Del módulo `paciente` (la prueba es de un paciente). Migración `1750000021000-CreateAceptacionesTerminos.ts`; columnas,
CHECK e índice en el [plan § Modelo de datos](../US/11-terminos-paciente.md#modelo-de-datos).

- **Columnas:** `tenant_id`, `paciente_id`, `version`, `canal`, `aceptada_en` (el acto), `registrada_en` (la fila), y
  **exactamente una** referencia según el canal:

  | `canal` | Quién | Referencia | `aceptada_en` |
  |---|---|---|---|
  | `formulario_publico` | el paciente | `solicitud_id` | `solicitudes_cita.recibida_en` |
  | `enlace_cita` | quien tiene el enlace de la cita del paciente | `enlace_id` | el reloj del portal |
  | `profesional` | el profesional, en nombre del paciente | `usuario_id` | el reloj de la app |

- **Solo inserción.** El puerto no tiene `UPDATE` ni `DELETE`. Sin trigger: es la misma convención que
  `cambios_cita`.
- **Una fila por paciente, versión y canal** (D11): `UNIQUE (paciente_id, version, canal)` e `INSERT … ON CONFLICT DO
  NOTHING`. Guarda el primer acto; un segundo es un no-op, también en una carrera.
- **FK** a `tenants`, `pacientes` y `usuarios` (`ON DELETE RESTRICT`): la prueba no desaparece por accidente. **Sin
  FK** a `solicitudes_cita` ni a `enlaces_cita` (referencias, como `cita_id` en [ADR-09](ADR-09.md)): así la tabla de
  `paciente` no ata su esquema a los de `solicitud` y `cita`, y una purga futura de solicitudes
  ([DT-26](../Deudas/DT-26.md)) no queda bloqueada por esta.
- **Sin IP ni navegador** (D12).
- **Quién es «el titular»:** `formulario_publico` y `enlace_cita` (`CANALES_DEL_TITULAR`). La del canal
  `profesional` **no cuenta** para dejar de pedir en `/cita`.

### 4. `pacientes.consentimiento`, bandera derivada (D1)

- **Sigue existiendo** y con el mismo significado operativo: «hay una autorización para contactarlo». La lee
  `PoliticaConsentimiento` (apagada) y la devuelve `PacienteResponseDto`.
- **Toda aceptación registrada, de cualquier canal, la pone en `true`** en la misma transacción:
  `UPDATE pacientes SET consentimiento = true WHERE id = $1 AND tenant_id = $2 AND consentimiento = false`.
- **Matiza [ADR-09 §3](ADR-09.md) por segunda vez:** al vincular por RUT un paciente existente desde una solicitud con
  versión, la ficha gana `consentimiento = true`. No pisa nada que haya escrito el profesional: suma la autorización
  que dio el propio paciente. Es lo que hoy se pierde.
- **Nada la pone en `false`.** El retiro se atiende a mano (lo dice el texto: escribirle al profesional); registrarlo
  en el sistema es una deuda: [DT-62](../Deudas/DT-62.md) *(antes: «una deuda a fichar»)*.

### 5. Formulario público (D5, D10)

- `CrearSolicitudDto`: `consentimiento` pasa a `@Equals(true)` y suma `terminosVersion` (obligatoria, catálogo). Un
  `false`, una versión ausente o desconocida → **400** del `ValidationPipe`, **antes** de buscar la organización: el
  202 sigue uniforme.
- `solicitudes_cita.terminos_version` (migración `1750000022000`), con un CHECK: solo en una `nueva` y con
  `consentimiento = true`. Las de `reagendamiento` (copian el consentimiento de la ficha) la dejan nula.
- `SolicitudesService.recibir` sigue con **un solo `INSERT`** y sin transacción.

### 6. Aceptar la solicitud en la bandeja (D10)

En la transacción de `BandejaSolicitudesService.aceptar` (la solicitud ya bloqueada), después de
`CitasService.agendar`:

- si la solicitud es `nueva` y tiene `terminos_version` → `PacientesService.registrarAceptacion` con canal
  `formulario_publico`, `solicitud_id`, la versión de la solicitud y `aceptada_en = recibida_en`; eso pone
  `consentimiento = true` (decisión 4), **también si el paciente ya existía por RUT**;
- si no tiene versión (enviada antes del despliegue, o de `reagendamiento`) → nada: ese paciente queda como los de D7.

**Orden de bloqueo:** solicitud → (paciente, dentro de `agendar` o al marcar la bandera). Igual que hoy, nadie bloquea
el paciente antes que la solicitud.

### 7. Alta manual (D6)

- `CrearPacienteDto` (lo usan `POST /citas` con `paciente` y `POST /pacientes`): `consentimiento` pasa a
  `@Equals(true)` y suma `terminosVersion` (obligatoria, catálogo). Un `false` → **400**.
- **`POST /citas` con `paciente`:** en la transacción de `CitasService.crearCita`, después de `agendar`, se registra el
  canal `profesional` con `usuario_id` = el del token, la versión y `aceptada_en` = el reloj de la app.
- **`POST /pacientes`:** `PacientesService.crearPaciente` **pasa a abrir una transacción** (`resolverOCrear` +
  registro) y recibe el usuario del token.
- **`POST /citas` con `pacienteId`:** sin cambios; no registra nada (no trae casilla; el frontend no lo usa).
- **Paciente existente por RUT:** se registra igual (una vez por versión, D11).
- **La bandeja no pasa por aquí:** `agendar` y `resolverOCrear` no registran nada por sí mismos. Cada vía registra su
  canal en su propio caso de uso.
- El modal muestra el **texto para el alta manual** con la URL de `/terminos`, antes de la casilla.

### 8. `/cita`: la tarjeta y `POST /publico/cita/aceptar-terminos` (D4)

**La vista** (`VistaCitaPacienteDto`) suma **`terminosPendientes: boolean`**: `true` si el paciente de la cita no tiene
una aceptación del **titular** con una versión que `sigueCubriendo`. Es un booleano, no un dato del paciente; la regla
«la vista nunca lleva…» del módulo se revisa y no cambia. Lo calcula cada respuesta (GET y POST) con una lectura sin
bloqueo, dentro de la misma transacción.

**El GET no cambia de comportamiento** (S3): lee, anota la primera apertura como hoy, y no registra ninguna
aceptación.

**La ruta:** `POST /api/publico/cita/aceptar-terminos`, cuerpo `{ terminosVersion }`, **200** con la vista
(`terminosPendientes: false`).

1. Cuerpo inválido o versión que no recibe → **400** del `ValidationPipe`, antes de mirar el token (como las demás).
2. `resolver` → cita bloqueada → validez → petición abierta (sin bloqueo): el esqueleto de siempre. Enlace no válido →
   **el mismo 404**, con su cuerpo exacto.
3. **Sin `exigir`:** aceptar no es una acción sobre la cita (no está en `accionesPermitidas`); vale con cualquier
   enlace válido, también con una petición de otra hora abierta o con la cita confirmada.
4. Si el titular ya aceptó una versión que cubre → **no escribe nada** (idempotente, 200). Si no →
   `registrarAceptacion` con canal `enlace_cita`, `enlace_id` del enlace resuelto y `aceptada_en` = el `ahora` del
   portal; eso pone `consentimiento = true`.
5. La vista.

- **Orden de bloqueo:** cita → paciente (el `UPDATE` de la bandera, al final). La bandeja bloquea solicitud →
  paciente y nunca una cita existente después; `PATCH /pacientes/:id` solo el paciente. Sin ciclos.
- **No toca** la cita, su bitácora, el outbox ni la primera apertura. **Ningún hecho nuevo.**
- **Sin 409:** con un enlace válido, aceptar siempre se puede.
- **Límite de tasa:** `portalPorIp` (clase) y `portalPorEnlace` en el método: **el mismo cubo** de 5 por hora por
  enlace que confirmar, cancelar y pedir otra hora (aceptar y confirmar gastan 2 de 5).
- **Cabeceras:** las de siempre (`no-store`, `no-referrer`), también en los errores.
- **Lo que prueba:** que **quien tenía el enlace** aceptó. El enlace llega al correo del paciente, pero
  [ADR-10 §2](ADR-10.md) ya asume que puede reenviarse ([Consecuencias](#consecuencias)).

**La tarjeta** (frontend): sobre las acciones, con el nombre del profesional y de la organización, un enlace a
`/terminos` **en otra pestaña** (en la misma, el paciente pierde la página: el token vive solo en memoria) y el botón
**«Acepto»**. Las acciones siguen disponibles. Desaparece con `terminosPendientes: false`. Sin «No acepto»: el retiro
es escribirle al profesional. Texto en el [plan](../US/11-terminos-paciente.md#tarjeta-de-cita).

### 9. Qué ve el profesional (D13, D14)

- **Bandeja:** `SolicitudBandejaDto` suma `terminosVersion: string | null` (aditivo); el frontend muestra *«· aceptó
  los términos v1.0»* en lugar de *«· acepta recordatorios»*.
- **Voucher:** nada en esta historia (D14 = a).
- **Modal Nueva cita:** el texto del alta manual y la casilla nueva (decisión 7).

### 10. Despliegue: **primero el frontend, después el backend**

Con `whitelist` sin `forbidNonWhitelisted`, el backend de hoy **descarta en silencio** `terminosVersion`. Por eso:

1. **Frontend a production** (Netlify): `/terminos`, las casillas nuevas, el texto del alta manual y `terminosVersion`
   en los dos formularios. La tarjeta de `/cita` solo aparece si la vista trae `terminosPendientes === true`: con el
   backend viejo, el campo no viene y no aparece. Nada se rompe. Durante esta ventana las solicitudes llegan sin
   versión (como hoy).
2. **Comprobar** `/terminos` en `app.citiahealth.cl` y que `soporte@citiahealth.cl` recibe correo
   ([Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte): falta configurar el reenvío).
3. **Backend a production** (Railway), **al menos 30 minutos después**: migraciones aditivas al arrancar y las
   reglas nuevas (versión obligatoria, `consentimiento: true`).
4. **Pedirle a la profesional del piloto que recargue el panel** antes de su próxima cita manual.

Al revés (backend primero) el modal y el formulario de hoy recibirían 400 hasta que llegue el frontend. El mismo orden
vale en staging (`develop`).

#### Nota (2026-11-20): cómo se cumplió la decisión 10

El orden se respetó, pero dos pasos no se hicieron como se escribieron:

| Paso | Lo que pasó |
|---|---|
| 1 | ✅ frontend el **2026-11-16 a las 21:01** (citia-frontend#21). La fecha que mostró fue la prevista, el 15; se corrigió al 16 el 2026-11-17 a las 11:08 (citia-frontend#23). Los dos tramos están en la [copia congelada](../Cumplimiento/terminos-paciente-v1.0.md#la-fecha-que-mostró-la-página) |
| 2 | `/terminos` ✅. **El correo de soporte no se comprobó antes del backend:** el reenvío de Cloudflare se configuró el **2026-11-17** y recibe desde las ~11:33 de ese día ([Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte)). Durante unas 14 horas, el texto publicó una dirección que no recibía |
| 3 | backend el **2026-11-16 a las 21:22** (citia-backend#23): **21 minutos** después, no 30. Si alguna pestaña vieja envió en esa ventana, no quedó anotado |
| 4 | no consta que se le pidiera a la profesional del piloto que recargara |

Ninguna de las dos cambia la prueba: el backend solo registra una aceptación con la casilla y una versión que recibe
aceptaciones, y las filas de production tienen la suya
([verificación](../Features/us11-terminos-paciente.md#verificación-en-production-2026-11-17--2026-11-20)).

### 11. Módulos y dependencias

| Módulo | Qué suma | Importa |
|---|---|---|
| `paciente` | tabla y puerto `AceptacionTerminosRepository`, entidad `AceptacionTerminos`, catálogo, `PacienteRepository.marcarConsentimiento`, `PacientesService.registrarAceptacion` / `titularAceptoVigente`, transacción en `crearPaciente`, decorador `@VersionTerminosVigente()` | **`SharedModule`** (nuevo: `TransactionRunner`) |
| `cita` | `crearCita` registra el canal `profesional` | sin cambios (ya importa `PacienteModule`) |
| `solicitud` | `terminos_version`, DTO, la bandeja registra el canal `formulario_publico`, `terminosVersion` en la bandeja | sin cambios (ya importa `PacienteModule`) |
| `portal-paciente` | `aceptar-terminos`, `terminosPendientes` | **`PacienteModule`** (nuevo) |

Sin ciclos: `paciente` no importa ninguno de los otros tres. `domain/` y `application/` siguen sin Nest, TypeORM ni
`class-validator` (`src/arquitectura.spec.ts`).

---

## Qué NO cambia

- La respuesta del formulario público: **202 uniforme**, el mismo cuerpo, el mismo límite.
- `resolverOCrear` y `agendar`: no registran nada por sí mismos.
- `PoliticaConsentimiento`: sigue **apagada** ([DT-16](../Deudas/DT-16.md), parte 1).
- El grafo de la cita, la bitácora, los hechos, el job G1 y los recordatorios.
- El GET de `/cita`: lee y anota la primera apertura, nada más.
- `PATCH /pacientes/:id`: no toca el consentimiento.

---

## Consecuencias

**Positivas**

- **Queda la prueba**: qué versión, cuándo y por qué canal, para los tres caminos de entrada. Hoy no hay ninguna.
- **El consentimiento del formulario deja de perderse** para un paciente que ya existía.
- **El backend deja de aceptar `false`**: lo que el frontend ya exigía, ahora también la API ([DT-16](../Deudas/DT-16.md), parte 2).
- **Los pacientes agendados a mano pueden aceptar ellos mismos** desde su enlace, sin cuenta y sin bloquear nada.
- Ninguna variable de entorno nueva; la ruta anónima no gana transacción ni escrituras fuera de su tabla.

**Negativas / riesgos**

- **El enlace prueba quién lo tenía, no quién es.** Si el paciente reenvió su enlace, otro pudo aceptar. Es el
  límite de cualquier flujo por correo; está escrito en [ADR-10 §2](ADR-10.md).
- **Los pacientes sin recordatorios nunca ven la tarjeta** (sin correo, recordatorios apagados, cita creada tarde): se
  quedan solo con la marca del profesional. D7 lo acepta.
- **Una aceptación del formulario de una solicitud rechazada vive solo en `solicitudes_cita`**, sin plazo de
  conservación ([DT-26](../Deudas/DT-26.md)).
- **El texto vive en el frontend y su copia congelada en el backend**: pueden divergir. La Definición de Terminado los
  compara a mano; un cambio de texto sin cambiar la versión invalida la prueba.
- **Una pestaña abierta antes del despliegue** del frontend que envíe después del backend recibe 400 (sin versión)
  hasta recargar. Es lo que acota la espera del paso 3 de la decisión 10.
- **El `down` de la migración borra la prueba.** En production no se revierte después de la primera aceptación real: se
  corrige hacia adelante.
- **Una consulta más** en cada respuesta del portal (lectura por índice).
- **El texto no lo revisó un abogado** ([Cumplimiento](../Cumplimiento/README.md)); la edad de 16 años, el plazo de 30
  días y la región de Resend siguen con ❓ en el borrador. El sistema no sabe la edad del paciente
  ([DT-54](../Deudas/DT-54.md)).
- **`soporte@citiahealth.cl` se publica**: tiene que recibir correo antes del release (decisión 10, paso 2).
  *(2026-11-20: recibe desde el 2026-11-17, un día después del release; ver la
  [nota de la decisión 10](#nota-2026-11-20-cómo-se-cumplió-la-decisión-10).)*

---

## DT-16 y DT-53: qué cierra y qué deja abierto

| Deuda | Parte | Con este ADR |
|---|---|---|
| [DT-16](../Deudas/DT-16.md) | (1) Encender `PoliticaConsentimiento` | **abierta**, fuera de alcance. Encendida hoy dejaría sin recordatorio solo a las fichas viejas con `false` |
| | (2) Que el backend rechace `false` o registre de quién viene | **cerrada** en las tres vías: rechaza `false` (formulario, `POST /citas`, `POST /pacientes`) y registra canal, versión y, en el alta manual, el usuario |
| | (3) Que lo otorgue el titular | **avanza**: el formulario lo otorga y queda; los agendados a mano pueden otorgarlo en `/cita`, sin obligación (D4) |
| [DT-53](../Deudas/DT-53.md) | 1. Política de privacidad | **avanza**: el texto para el paciente queda publicado y enlazado desde `/agendar-cita` y `/cita`. Sigue sin revisión legal y falta la política de las cuentas de los profesionales |
| | 2. Procedimiento de derechos | **sin cambio en el sistema**: el texto dice a quién escribir y el plazo (30 días ❓), pero no hay procedimiento interno |
| | 3. Exportar y suprimir | **abierto**. Su diseño tendrá que decidir qué pasa con `aceptaciones_terminos` al suprimir un paciente (la FK `RESTRICT` obliga a decidirlo) |

---

## Plan de ejecución

| # | Agente | Pieza |
|---|---|---|
| 0 | `architecture-agent` | este ADR y el plan [US-11](../US/11-terminos-paciente.md) |
| — | usuario | aprobó el documento completo el 2026-11-14 |
| 1 | `database-agent` | migraciones `1750000021000` y `1750000022000`, entidades ORM, puertos y adaptadores, dobles en memoria, `seed.ts` |
| 2 | `api-agent` | catálogo, entidad, `PacientesService`, DTO, bandeja, `crearCita`, portal |
| 3 | `testing-agent` | unitarios e integración; las e2e, solo con la autorización del usuario |
| F | frontend | la sección *Frontend* del plan, en paralelo a 1 y 2; **se despliega primero** (decisión 10) |
| 4 | `architecture-agent` | notas en DT-16 y DT-53, la copia congelada de la 1.0, el borrador marcado como publicado, ROADMAP, la feature y TRAZABILIDAD |

**Estado (2026-11-20):** todo ✅. En production desde el 2026-11-16 (merge a `develop` `7aaec66`, release `8738b98`);
las e2e en `66e54bc`; el cierre (ROADMAP, la feature con la verificación en production y TRAZABILIDAD 137–157), el
2026-11-20. *Antes (2026-11-14): 0, 1 (`92a1f36`), 2 (`bdeb1aa` y `894b96c`) y F (frontend `eb3fbcc` a `e276343`) ✅, en la rama
`feature/terminos-paciente`; 3 🔶: unitarios e integración commiteados (`1d00f9e`, `fc3a83f`, `305dea5`), las e2e en curso.* Del 4 están hechas las notas en DT-16 y DT-53, las deudas
[DT-62](../Deudas/DT-62.md) y [DT-63](../Deudas/DT-63.md), ROADMAP, la feature
[us11-terminos-paciente](../Features/us11-terminos-paciente.md) y TRAZABILIDAD. La copia congelada
([`terminos-paciente-v1.0.md`](../Cumplimiento/terminos-paciente-v1.0.md)) y el borrador marcado como publicado se
hicieron el 2026-11-15 (`docs/terminos-v1-publicada`). El release del frontend fue el 2026-11-16, y la fecha de la
copia y de `/terminos` se corrigió a ese día el 2026-11-17. *Antes: «esperan al release».*

---

## Preguntas abiertas

**Ninguna.** El usuario aprobó todas las decisiones el 2026-11-14 (cabecera). Las notas del texto (edad, plazo de
respuesta, región de Resend) siguen con ❓ en el [borrador](../Cumplimiento/borrador-terminos-paciente.md) y no
bloquean. *Antes: «Las de este ADR están en la cabecera: D3, D5, D6, D7 y D9 van por defecto y D10 a D14 con su
inclinación».*

---

## Referencias

- [Borrador v0.2 de los términos](../Cumplimiento/borrador-terminos-paciente.md) — el texto y sus 7 decisiones.
- [ADR-09 §3 y §8](ADR-09.md) — RUT como identidad, la ruta anónima y el 202 uniforme.
- [ADR-10 §2 y S3](ADR-10.md) — lo que muestra la vista y «abrir no ejecuta».
- [ADR-13 §14](ADR-13.md) — la primera excepción a «la ficha no se toca».
- `src/modules/solicitud/` (`crear-solicitud.dto.ts`, `solicitudes.service.ts`, `bandeja-solicitudes.service.ts`),
  `src/modules/paciente/`, `src/modules/cita/application/citas.service.ts` (`crearCita`, `agendar`),
  `src/modules/portal-paciente/`, `src/modules/recordatorio/domain/politicas-envio.ts`, `src/main.ts`
  (`ValidationPipe`), `src/shared/presentation/limitar-tasa.decorator.ts`.
- Frontend: `src/features/crear-cita/ui/steps/MotivoStep.vue`, `src/features/crear-cita/ui/ModalNuevaCita.vue`,
  `src/features/responder-cita/`, `src/features/bandeja-solicitudes/ui/BandejaSolicitudes.vue`,
  `src/shared/ui/BaseCheckbox.vue`, `src/app/router/index.ts`.

---

## Deudas técnicas asociadas

**Cierra en parte:** [DT-16](../Deudas/DT-16.md) — la parte (2) en las tres vías; avanza la (3).

**Avanza:** [DT-53](../Deudas/DT-53.md) — el punto 1, para el paciente.

**Toca:** [DT-26](../Deudas/DT-26.md) (`aceptaciones_terminos` y `solicitudes_cita.terminos_version` sin plazo; el
máximo de §6 espera a esta deuda) · [DT-52](../Deudas/DT-52.md) (el texto nombra a Railway, Resend y Netlify; la
casilla de soporte, publicada) · [DT-54](../Deudas/DT-54.md) (el texto fija 16 años y el sistema no lo controla).

**Contraídas con el release del 2026-11-16** (fichadas el 2026-11-14 como ⚪ previstas):

1. [DT-62](../Deudas/DT-62.md) — **el retiro de la autorización no se registra.** El texto lo promete por escrito al
   profesional; el sistema no tiene cómo anotarlo ni pone `consentimiento = false`, y con la política apagada la
   bandera tampoco frenaría los recordatorios. Hoy, SQL a mano. Se diseña con [DT-53](../Deudas/DT-53.md).
2. [DT-63](../Deudas/DT-63.md) — **el profesional no ve si el paciente aceptó** (D14 = a). Se diseña con
   [DT-53](../Deudas/DT-53.md).

*Antes: «A fichar al aceptar este ADR (sin número todavía; ⚪ previstas)», con las mismas dos.*

**En el frontend:** `DTF-09` (`citia-frontend/context/Deudas/`) — el texto de `/terminos` vive en el frontend y en la
copia congelada del backend, sin una comparación automática.

Índice completo: [`../Deudas/README.md`](../Deudas/README.md).
