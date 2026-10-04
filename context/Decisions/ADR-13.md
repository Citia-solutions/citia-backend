# ADR-13: Recordatorios al paciente por correo (RF-06) — el recordatorio es una entidad con estado, se planifica con una función pura y se envía por Resend detrás del puerto `CanalMensajeria`

> **Fase:** [Fase 2 — US-03](../Fases/fase-2-us03-recordatorios.md) (origen), [Fase 3 — US-04](../Fases/fase-3-us04-respuesta-paciente.md) · **Feature:** [us03-recordatorios](../Features/us03-recordatorios.md) · **Plan:** [US-03](../US/03-recordatorios.md) · **Relacionado:** [ADR-12](../Decisions/ADR-12.md), [ADR-10](../Decisions/ADR-10.md), [DT-16](../Deudas/DT-16.md), [DT-19](../Deudas/DT-19.md), [DT-21](../Deudas/DT-21.md), [DT-30](../Deudas/DT-30.md), [Q1](../PREGUNTAS-ABIERTAS.md#q1--el-mvp-incluye-recordatorios-automáticos), [stack](../stack-tecnologico.md)

**Fecha:** 2026-09-30
**Estado:** Aceptado · **implementado** (rama `feature/fase2-recordatorios`,
[PR #1](https://github.com/Citia-solutions/citia-backend/pull/1), pendiente de merge a `develop`; el
frontend sale en el mismo release, [PR #2](https://github.com/Citia-solutions/citia-frontend/pull/2)) ·
**todas las decisiones confirmadas por el usuario el 2026-09-30** (ver
[Decisiones confirmadas](#decisiones-confirmadas-2026-09-30)) · desvíos y datos de proveedores
verificados en [Notas de implementación](#notas-de-implementación-2026-10-04)
**Commits:** `ab30bb7` (diseño) · `d45de20` (pino, health, latidos, entorno, CORS) · `a37f175` (correo
obligatorio y `PATCH /pacientes/:id`) · `f2d80aa` (persistencia) · `a13d80a` (dominio, planificación y
reconciliación) · `f719c66` (envío por Resend, webhook y rutas) · `a938f9d` (Definición de Terminado)
**Historia:** US-03 — plan de construcción en [US/03-recordatorios.md](../US/03-recordatorios.md)
**Relación:** **se apoya en** [ADR-12](ADR-12.md) (outbox + planificador; este es su primer suscriptor)
· **se apoya en** [ADR-04](ADR-04.md) (estados vigentes y terminales) y en [ADR-09 §4](ADR-09.md)
(editar no toca el recordatorio; reagendar lo reprograma; cancelar lo anula) · **usa** la zona de
[ADR-07](ADR-07.md) · **replica** la atomicidad de [ADR-06](ADR-06.md) · **prepara** [ADR-10](ADR-10.md)
(la Fase 3 añade el enlace por cita dentro de este mismo correo) · **responde** en la práctica a
[Q1](../PREGUNTAS-ABIERTAS.md) (A: los recordatorios entran en el MVP).

---

## Contexto

### Decisiones de producto de partida (usuario, 2026-09-30)

Este ADR no reabre ninguna; las convierte en diseño.

| # | Decisión |
|---|---|
| 1 | Q1 → **A**: los recordatorios (RF-06) entran en el MVP. El scoring (RF-08) sale y pasa a la v2. |
| 2 | Canal: **correo transaccional vía Resend**. WhatsApp y SMS quedan fuera del MVP y entran después como otro adaptador del mismo puerto. Descartados: Brevo, SendGrid. |
| 3 | **Un solo remitente** para toda la plataforma, con nombre visible **"Citia"**, no el del profesional. El dominio **aún no está comprado**. |
| 4 | Contenido **solo informativo**: fecha, hora, profesional y cómo contactar. Sin tipo de consulta ni datos de salud. El enlace para responder llega en la Fase 3 (US-04 / ADR-10). |
| 5 | El **correo del paciente pasa a ser obligatorio** en el alta manual. |
| 6 | El **consentimiento no se revisa** antes de enviar, por ahora: riesgo aceptado ([DT-16](../Deudas/DT-16.md)). |
| 7 | **Modo prueba** con planes gratis: Resend Free = **3.000 correos al mes y 100 al día**. El número de recordatorios por cita es configurable (predeterminado: 24 h y 2 h antes). |
| 8 | Observabilidad con **Better Stack** (plan gratis): uptime, latido del job, logs, errores. |

### Lo que hay hoy (verificado en el código, 2026-09-30)

| Pieza | Estado |
|---|---|
| Hechos de dominio | `CitaCreada`, `CitaConfirmada`, `CitaCancelada`, `CitaAsistida`, `CitaNoAsistida`, `CitaReagendada`, `CitaEditada`, `SolicitudCitaAceptada`, `SolicitudCitaRechazada`; se publican dentro de la transacción, sin suscriptores ([ADR-12](ADR-12.md) lo convierte en outbox) |
| Payload de los hechos de cita | `usuarioId` es **quien hizo la petición** (del token), no el dueño de la cita; en una aceptación por un colega no coinciden |
| Planificador | no existe ([ADR-12](ADR-12.md) lo introduce) |
| `src/modules/recordatorio/` | tres carpetas vacías, dos mal escritas ([DT-21](../Deudas/DT-21.md)) |
| `Paciente.correo` | columna nullable; `@IsOptional()` en `CrearPacienteDto`, **que también valida el paciente en línea de `POST /citas`** |
| `SolicitudCita.correo` | obligatorio (`crear-solicitud.dto.ts`) |
| `PacientesService.resolverOCrear` | si el RUT existe, devuelve el paciente **sin tocarlo** |
| Nombre del profesional | `Usuario.nombreCompleto`; de la organización, `Tenant.nombre` |
| Contacto público del profesional | **no existe**: `Usuario` solo tiene el correo de acceso |
| Zona | `APP_TZ` + `shared/domain/timezone.ts` (hora `HH:mm` y fecha `YYYY-MM-DD`; no hay fecha larga en español) |
| Consentimiento | se guarda y nadie lo lee; el frontend exige la casilla en el modal y en el formulario público, pero el backend acepta `false` |
| Observabilidad | ninguna ([DT-19](../Deudas/DT-19.md)) |

---

## Opciones evaluadas

### A. Canal

| Opción | Veredicto |
|--------|-----------|
| **A1. Correo (ELEGIDA)** | Barato, sin aprobación de plantillas, el paciente ya dejó su correo en el formulario público. Es la base para el enlace de la Fase 3. |
| **A2. WhatsApp Business** | **Fuera del MVP.** Cobro por conversación, verificación del negocio y plantillas aprobadas por Meta, y exige *opt-in* explícito (lo que vuelve bloqueante [DT-16](../Deudas/DT-16.md)). Entra como otro adaptador de `CanalMensajeria`. |
| **A3. SMS** | **Fuera del MVP.** Costo por mensaje en Chile y sin contenido enriquecido. Mismo punto de entrada que A2. |

### B. Proveedor de correo

| Opción | Veredicto |
|--------|-----------|
| **B1. Resend (ELEGIDA)** | API simple, SDK oficial para Node, webhooks de entrega firmados, plan gratis suficiente para el piloto. |
| **B2. Brevo · SendGrid** | **Descartados por el usuario** (2026-09-30). |
| **B3. SMTP genérico** (nodemailer) | **Descartada.** Sin webhooks de entrega uniformes: RNF-03 pide registro de entrega. |

### C. Quién decide el momento del envío

| Opción | Veredicto |
|--------|-----------|
| **C1. Tabla propia + barrido cada minuto (ELEGIDA)** | Permite **revalidar la cita justo antes de enviar**, anular es cambiar una fila, y la cuota queda bajo nuestro control. |
| **C2. Programar el correo en Resend** (`scheduled_at`) | **Descartada.** Cada reagendamiento o cancelación exige llamar a la API para anular (otra doble escritura), no se puede revalidar la cita en el momento del envío y la cuota se consume cuando el proveedor decide. |
| **C3. Calcular al vuelo sin tabla** (cada minuto, citas cuyo `inicio − antelación` acaba de pasar) | **Descartada.** Sin registro de entrega ni reintentos; un tick perdido es un recordatorio perdido. |

### D. Dónde vive el estado del envío

| Opción | Veredicto |
|--------|-----------|
| **D1. Entidad `Recordatorio` propia con máquina de estados (ELEGIDA)** | Varios recordatorios por cita, cada uno con su estado, intentos y motivo. No toca `citas`. |
| **D2. Columnas en `citas`** | **Descartada.** N recordatorios por cita no caben en columnas y mezclaría su ciclo de vida con el grafo de ADR-04. |

### E. Qué pasa cuando el paciente responde el correo *(confirmado 2026-09-30: E2)*

| Opción | Veredicto |
|--------|-----------|
| **E1. Sin `Reply-To` ("no responder")** | **Descartada.** La respuesta se pierde: el paciente cree que avisó y el profesional no se entera. Es el peor caso para un producto contra el ausentismo. |
| **E2. `Reply-To` = un correo que el profesional elige en su configuración (ELEGIDA, confirmada 2026-09-30)** | La respuesta llega directo a quien la tiene que leer, sin infraestructura. Coste: el profesional expone un correo (el que él decida). Si no configura ninguno, no hay `Reply-To` y el mensaje lo dice. |
| **E3. Citia recibe las respuestas y las muestra en la app** | **Descartada para la Fase 2.** Guardaría texto libre del paciente —probablemente con datos de salud— y es un subsistema entero. La Fase 3 resuelve la respuesta con el enlace de ADR-10. |
| **E4. Buzón de soporte de Citia** | **Descartada.** El equipo de Citia leería mensajes de salud de pacientes ajenos. |

### F. Pacientes que ya existen con `correo` NULL *(confirmado 2026-09-30: F4)*

| Opción | Veredicto |
|--------|-----------|
| **F1. Rellenar con un valor ficticio y poner `NOT NULL`** | **Descartada.** Datos falsos, y cada uno sería un rebote que daña la reputación del remitente. |
| **F2. Rellenar desde `solicitudes_cita`** | **No aplica.** Los pacientes creados al aceptar una solicitud ya tienen correo (es obligatorio en el formulario público). Los NULL vienen del alta manual. |
| **F3. `NOT NULL` y bloquear cualquier operación sobre esos pacientes** | **Descartada.** Bloquea la agenda por un dato de contacto. |
| **F4. Columna nullable en la base, correo exigido en toda escritura nueva, y el recordatorio se `omite` si falta (ELEGIDA, confirmada 2026-09-30)** | Honesto (no inventa datos), migración sin riesgo, y el profesional ve por qué no salió el recordatorio. Se completa con una ruta para editar el contacto del paciente (decisión 14). |

---

## Decisión

### 1. El módulo `recordatorio/` se rehace, y solo lee de los demás

Se borran `aplication/` e `infraestructure/` ([DT-21](../Deudas/DT-21.md)) y se crea con la estructura
del resto del proyecto:

```
src/modules/recordatorio/
├── domain/
│   ├── recordatorio.entity.ts               ← Recordatorio, EstadoRecordatorio, MotivoRecordatorio (decisión 4)
│   ├── configuracion-recordatorio.entity.ts ← antelaciones, activo, contacto; valida sus reglas (decisión 3)
│   ├── planificacion.ts                     ← funciones puras (decisión 5)
│   ├── politicas-envio.ts                   ← PoliticaEnvio y su resultado (decisión 7)
│   ├── canal-mensajeria.ts                  ← puerto CanalMensajeria (decisión 8)
│   ├── lector-citas.ts                      ← puerto de SOLO LECTURA sobre cita, paciente, usuario y tenant
│   ├── recordatorio.repository.ts           ← puerto; incluye los métodos de BARRIDO GLOBAL (ADR-12 §6)
│   ├── configuracion-recordatorio.repository.ts
│   └── supresion-correo.repository.ts
├── application/
│   ├── suscriptor-recordatorios.ts          ← SuscriptorEventos de ADR-12 §4
│   ├── reconciliar-recordatorios.service.ts
│   ├── enviar-recordatorios.service.ts
│   ├── procesar-webhook-entrega.service.ts
│   ├── configuracion-recordatorios.service.ts
│   └── plantilla-recordatorio.ts            ← asunto, HTML y texto; bloque `accion?` para la Fase 3
├── infrastructure/
│   ├── persistence/                         ← entidades ORM, adaptadores TypeORM y el lector SQL
│   ├── mensajeria/
│   │   ├── resend-canal-mensajeria.ts
│   │   └── registro-canal-mensajeria.ts     ← desarrollo y tests: no envía, deja constancia sin datos personales
│   └── planificacion/                       ← jobs de @nestjs/schedule (ADR-12 §5)
├── presentation/
│   ├── configuracion-recordatorios.controller.ts
│   ├── recordatorios-cita.controller.ts     ← GET citas/:citaId/recordatorios
│   ├── webhooks-resend.controller.ts
│   └── dto/
├── recordatorio.module.ts
└── CLAUDE.md                                ← al implementarlo, mismo formato que solicitud/CLAUDE.md
```

**Reglas de dependencia:**

- **`cita` no sabe que `recordatorio` existe.** La única comunicación `cita → recordatorio` son los
  hechos del outbox. Ningún módulo importa `RecordatorioModule`.
- **`recordatorio` lee, nunca escribe,** las tablas de `cita`, `paciente`, `usuario` y `tenant`, a
  través del puerto `LectorCitas` (una proyección SQL de solo lectura en su infraestructura).
  *Alternativa descartada:* importar cuatro módulos para leer cuatro campos. `CitaModule` solo exporta
  `CitasService`, que habla en términos de peticiones HTTP (`AuthenticatedUser`), y la reconciliación
  de respaldo necesita un cruce `citas × recordatorios` que pertenece a este módulo. Coste aceptado:
  `recordatorio` depende del **esquema** de esas tablas, en lectura.
- La vista "recordatorios de una cita" la sirve un controller **de este módulo** en
  `citas/:citaId/recordatorios`. Meterla en `CitaDetalleDto` invertiría la dependencia.

### 2. Tablas

**`configuraciones_recordatorio`** — una por profesional

```
├─ id                 uuid PK
├─ tenant_id          uuid FK tenants
├─ usuario_id         uuid FK usuarios     ← el profesional DUEÑO de las citas (cita.usuarioId)
├─ activo             boolean default true
├─ canal              varchar default 'email'   ← único valor aceptado en la Fase 2
├─ antelaciones_min   int[]                ← p. ej. {1440,120}
├─ telefono_contacto  varchar null         ← "cómo contactar" en el mensaje
├─ correo_respuesta   varchar null         ← Reply-To (opción E2, confirmada 2026-09-30)
├─ creado_en, actualizado_en
└─ único (tenant_id, usuario_id)
```

**`recordatorios`** — uno por cita, canal y antelación

```
├─ id                    uuid PK      ← también la clave de idempotencia ante el proveedor (decisión 9)
├─ tenant_id             uuid
├─ cita_id               uuid FK citas
├─ canal                 varchar      ← 'email'
├─ antelacion_min        int          ← el "tipo": 1440 = 24 h, 120 = 2 h
├─ inicio_cita           timestamptz  ← el inicio de la cita para el que se calculó
├─ programado_para       timestamptz  ← hora PLANIFICADA (forma parte de la clave)
├─ vence_en              timestamptz  ← después de esto ya no sirve (decisión 5)
├─ estado                varchar      ← programado · enviado · entregado · fallido · cancelado · omitido
├─ motivo                varchar null ← código de la decisión 4
├─ intentos              int default 0
├─ proximo_intento_en    timestamptz  ← hora REAL de la cola (= programado_para, salvo tardíos y reintentos)
├─ ultimo_error          varchar null ← código del proveedor; nunca datos personales
├─ proveedor             varchar null ← 'resend'
├─ proveedor_mensaje_id  varchar null
├─ enviado_en, entregado_en, queja_en   timestamptz null
└─ creado_en, actualizado_en

uq_recordatorio_clave   UNIQUE (cita_id, canal, antelacion_min, programado_para) WHERE estado <> 'cancelado'
idx_recordatorio_cola   (proximo_intento_en) WHERE estado = 'programado'
idx_recordatorio_cita   (cita_id)
idx_recordatorio_proveedor (proveedor_mensaje_id)
idx_recordatorio_enviado_en (enviado_en) WHERE enviado_en IS NOT NULL
```

- **La clave única es cita + tipo (canal y antelación) + hora planificada**, y excluye los
  `cancelado`: si una cita se reagenda y luego vuelve a su hora original, los recordatorios anulados no
  bloquean los nuevos. Los `enviado`/`entregado` sí bloquean: no se recuerda dos veces la misma hora.
- **No se guarda el destinatario ni el contenido.** El correo se lee del paciente al enviar; el
  registro de entrega es el estado, las fechas y el id del proveedor. Menos datos personales duplicados.

**`supresiones_correo`** — direcciones a las que no se vuelve a escribir

```
├─ correo_hash             varchar PK   ← SHA-256 del correo normalizado (sin espacios, en minúsculas)
├─ motivo                  varchar      ← rebote · queja
├─ origen_recordatorio_id  uuid null
└─ creado_en
```

**Global, no por tenant**, a propósito: el remitente es uno solo (Citia) y la reputación ante los
proveedores de correo es de toda la plataforma. Guardar el hash y no la dirección basta para comparar.

### 3. Configuración por profesional

- **Sin fila, se aplica la predeterminada** del entorno (`RECORDATORIO_ANTELACIONES_MIN=1440,120`,
  activa). La fila se crea la primera vez que el profesional guarda. No hace falta migrar datos para
  los usuarios existentes.
- **Reglas en el dominio:** de 1 a 3 antelaciones, distintas, enteras, entre 30 y 10.080 minutos
  (7 días); canal solo `email`; `telefono_contacto` de hasta 30 caracteres; `correo_respuesta` con
  formato de correo.
- **Activa por defecto, a las 24 h y 2 h** (confirmado 2026-09-30); el profesional puede apagarla.
  Es lo que cumple la promesa de "no tener que acordarse", y significa que desde el despliegue todas
  las citas futuras reciben recordatorios.
- **Guardar la configuración publica `ConfiguracionRecordatorioActualizada`** (`usuarioId`) por el
  outbox, en la misma transacción. Su suscriptor reconcilia las citas futuras vigentes de ese
  profesional (decisión 6). Así "cambié a 48 h" se aplica también a lo ya agendado.
- **Horas sin envío: 21:00–08:00, todos los días, en la zona de la clínica** (confirmado 2026-09-30).
  Globales por ahora (`RECORDATORIO_SILENCIO_DESDE` / `HASTA`); por profesional, más adelante y de
  forma aditiva.

### 4. Máquina de estados del recordatorio

Misma disciplina que ADR-04: estado privado, transiciones con guarda, error de dominio si es ilegal.

| Desde | Evento | Hacia | `motivo` |
|---|---|---|---|
| — | se planifica con su hora en el futuro | `programado` | — |
| — | se planifica cuando su hora ya pasó (decisión 5.e) | `omitido` | `creada_tarde` · `fusionado` |
| `programado` | el proveedor lo aceptó | `enviado` | — |
| `programado` | llega `delivered` antes de confirmar el envío (decisión 9) | `entregado` | — |
| `programado` | la cita pasó a terminal | `cancelado` | `cita_terminal` |
| `programado` | la cita se reagendó o cambió la configuración | `cancelado` | `reprogramado` |
| `programado` | el profesional apagó los recordatorios | `cancelado` | `desactivado` |
| `programado` | una política impidió enviarlo (decisión 7) | `omitido` | `sin_correo` · `correo_suprimido` · `limite_tenant` · `sin_consentimiento` |
| `programado` | error permanente del proveedor | `fallido` | `correo_invalido` · `rechazado` |
| `programado` | pasó `vence_en` sin poder enviarlo | `fallido` | `vencido` · `cuota_agotada` |
| `enviado` | webhook `delivered` | `entregado` | — |
| `enviado` | webhook `bounced` o `failed` | `fallido` | `rebote` · `rechazado` |
| `entregado` | webhook `complained` | `entregado` (se fija `queja_en`) | — |

**La diferencia entre los tres finales negativos importa para medir RNF-03:**

- **`cancelado`**: dejó de tener sentido (la cita cambió). No es un fallo.
- **`omitido`**: tenía sentido, pero una regla decidió no enviarlo. No es un fallo del servicio; se
  muestra al profesional con su motivo.
- **`fallido`**: se intentó y no llegó. **Es lo que cuenta contra el 99 %.**

### 5. Planificación: funciones puras en el dominio

```ts
// recordatorio/domain/planificacion.ts — sin reloj, sin base, sin framework
planificar({
  inicio, antelacionesMin, activo, vigente,
  tz,                              // APP_TZ hoy; de la organización cuando se cierre DT-17
  silencio: { desde: '21:00', hasta: '08:00' },
  margenMinimoMin,                 // RECORDATORIO_MARGEN_MINIMO_MIN
}): RecordatorioPlanificado[]      // { antelacionMin, programadoPara, venceEn }

resolverTardios(planificados, existentes, ahora, antelacionMinimaTardiaMin)
  // → qué insertar como `programado` inmediato y qué como `omitido`
```

Reglas:

- **a. Nada que planificar** si la cita no está vigente, si la configuración está apagada o si
  `inicio − margen mínimo ≤ ahora` (incluye las citas agendadas en el pasado, [DT-13](../Deudas/DT-13.md)).
- **b. Aritmética de instantes:** `programado_para = inicio − antelación`. "24 h antes" son 24 horas
  reales. En la noche del cambio de horario eso cae una hora antes o después en el reloj de pared: se
  acepta, no merece calendario.
- **c. Horas sin envío,** evaluadas en la zona de la clínica con `Intl` (ADR-07): si
  `programado_para` cae dentro de `[desde, hasta)`, **se adelanta** al último minuto permitido antes de
  que empiece el silencio (20:59 con los valores por defecto). Adelantar nunca deja el recordatorio más
  cerca de la cita de lo que el profesional configuró.
- **d. Vencimiento:** cada recordatorio vence cuando toca el siguiente de la misma cita (el de menor
  antelación); el último vence `margen mínimo` antes del `inicio`. Si dos quedan a menos de 30 minutos
  entre sí (típicamente por el ajuste de silencio), se conserva el de menor antelación y el otro queda
  `omitido` con motivo `fusionado`.
- **e. Cita creada con menos antelación que el recordatorio:** si la hora planificada ya pasó y hay
  otro recordatorio futuro, se registra `omitido` (`creada_tarde`). Si **ninguno** queda en el futuro y
  faltan al menos `RECORDATORIO_ANTELACION_MINIMA_TARDIA_MIN` (60) para la cita, sale **uno solo**, el
  de menor antelación, lo antes posible fuera de las horas sin envío (`proximo_intento_en`); si faltan
  menos, todos `omitido`. *Confirmado 2026-09-30.*
- **f. La clave usa la hora planificada, no la real.** Un recordatorio tardío guarda
  `programado_para` = la hora que le tocaba (ya pasada) y `proximo_intento_en` = ahora. Así reconciliar
  dos veces no inserta un segundo tardío: choca con la clave única.
- **g. Zona y cambios de horario:** todo se guarda como instante (`timestamptz`); la hora local solo
  se calcula para el silencio y para el texto, que **se genera al enviar** (decisión 12). Si el
  gobierno cambia las reglas del horario de verano entre la programación y el envío, el texto sale con
  la hora correcta — siempre que la imagen de Node tenga los datos de zona al día (actualizar la imagen
  base cuando Chile cambie sus reglas).

### 6. Reconciliación: cuándo se programa, reprograma o anula

El suscriptor (ADR-12 §4) **no aplica deltas**: por cada hecho relevante, reconcilia la cita contra su
estado actual. Mismo algoritmo para todos los disparadores:

1. Candado consultivo por cita dentro de la transacción (`pg_advisory_xact_lock`), para que dos
   reconciliaciones de la misma cita no se crucen. Sin tocar la tabla `citas`.
2. Releer la cita con `LectorCitas` (filtrando por el `tenant_id` del hecho) y la configuración de
   **`cita.usuarioId`** — no el `usuarioId` del payload, que es quien hizo la petición.
3. `planificar(...)` → lo que debería existir.
4. Anular (`cancelado`) los `programado` que ya no correspondan, con el motivo que toque.
5. Insertar lo que falte, aplicando `resolverTardios`; `ON CONFLICT DO NOTHING` sobre la clave única
   como última defensa.

| Disparador | Efecto |
|---|---|
| `CitaCreada` (también la que crea aceptar una solicitud, en la misma transacción) | planificar |
| `CitaReagendada` | replanificar: anula los del `inicio` anterior, crea los del nuevo |
| `CitaCancelada`, `CitaAsistida`, `CitaNoAsistida` | anular los `programado` |
| `CitaConfirmada`, `CitaEditada` | reconciliar (normalmente no cambia nada: ADR-09 §4) |
| `SolicitudCitaAceptada`, `SolicitudCitaRechazada` | ninguno: la cita llega por su `CitaCreada` |
| `ConfiguracionRecordatorioActualizada` (nuevo) | reconciliar las citas futuras vigentes del profesional |
| *(futuro)* el hecho del cierre por `ghosting` | anular los `programado` |
| **Reconciliación de respaldo** (job cada hora, candado consultivo, BARRIDO GLOBAL) | reconciliar las citas vigentes de los próximos 8 días **sin ningún recordatorio para su `inicio` actual** |

La reconciliación de respaldo cubre tres casos sin código propio: las citas que ya existían el día del
despliegue, un hecho que terminó en `fallido` en el outbox, y cualquier error de programación que haya
dejado una cita sin planificar.

### 7. Envío: barrido, revalidación y políticas

Caso de uso `EnviarRecordatoriosService`, invocado cada 60 s. Procesa hasta `RECORDATORIO_LOTE` (20)
recordatorios, **uno por transacción**:

1. **Reclamar** (BARRIDO GLOBAL, ADR-12 §6):
   `WHERE estado = 'programado' AND proximo_intento_en <= now() ORDER BY proximo_intento_en LIMIT 1 FOR UPDATE SKIP LOCKED`.
2. **Releer** la cita, el correo y el consentimiento del paciente, el nombre del profesional y de la
   organización, y el contacto de la configuración, con el `tenant_id` de la fila.
3. **Evaluar las políticas en orden.** Cada una responde *continuar*, *anular*, *omitir*, *posponer
   hasta* o *fallar*:

| # | Política | Si no se cumple |
|---|---|---|
| 1 | **Vigencia de la cita:** existe, está vigente y su `inicio` = `inicio_cita` | `cancelado` (`cita_terminal` / `reprogramado`) |
| 2 | **Vencimiento:** `ahora < vence_en` | `fallido` (`vencido`) |
| 3 | **Configuración activa** | `cancelado` (`desactivado`) |
| 4 | **Horas sin envío** (reintentos y tardíos) | posponer al fin del silencio si queda antes de `vence_en`; si no, `fallido` (`vencido`) |
| 5 | **Correo presente** | `omitido` (`sin_correo`) |
| 6 | **No suprimido** | `omitido` (`correo_suprimido`) |
| 7 | **Consentimiento** — **desactivada** (`RECORDATORIO_EXIGIR_CONSENTIMIENTO=false`, decisión 15) | `omitido` (`sin_consentimiento`) |
| 8 | **Límite diario del tenant** (decisión 11) | `omitido` (`limite_tenant`) |
| 9 | **Cuota del proveedor** según el contador local (decisión 11) | posponer al reinicio de la cuota si llega antes de `vence_en`; si no, `fallido` (`cuota_agotada`) |

4. **Generar el contenido** (decisión 12) y llamar a `CanalMensajeria.enviar(...)` con un tiempo
   máximo de 10 s.
5. **Aplicar el resultado** (decisión 8) y confirmar la transacción. Esperar al menos 500 ms antes del
   siguiente, para respetar el límite de peticiones por segundo del proveedor.

**La transacción queda abierta durante la llamada HTTP**, con la fila bloqueada. Es deliberado: si el
proceso muere después de que Resend aceptó y antes del commit, la fila vuelve a `programado` y el
reintento lo absorbe la clave de idempotencia (decisión 9). A este volumen es una conexión del pool
durante un segundo. *Evolución si el volumen crece:* estado intermedio `enviando` con reclamo en una
transacción corta y un barrido que devuelva los atascados.

**Carrera aceptada:** si el profesional reagenda en el mismo segundo en que sale el recordatorio, el
paciente puede recibirlo con la hora anterior. La reconciliación programa enseguida los de la hora
nueva. Bloquear la fila de la cita durante el envío lo evitaría a cambio de acoplar este módulo a los
candados de `cita`; no compensa.

### 8. El puerto `CanalMensajeria` y la clasificación de errores

```ts
// recordatorio/domain/canal-mensajeria.ts
export abstract class CanalMensajeria {
  abstract enviar(mensaje: MensajeSaliente): Promise<ResultadoEnvio>;
}
// MensajeSaliente: destinatario, asunto, html, texto, responderA?, claveIdempotencia, etiquetas
// ResultadoEnvio: aceptado | transitorio | cuota_agotada | permanente | configuracion | posible_duplicado
```

El adaptador traduce la respuesta del proveedor; el caso de uso solo conoce el resultado. Nombres de
error según la documentación de Resend (el adaptador los fija con tests sobre respuestas grabadas):

| Resultado | Ejemplos en Resend | Qué se hace |
|---|---|---|
| `aceptado` | 200 con `id` | `enviado`, se guarda `proveedor_mensaje_id` |
| `transitorio` | 5xx, tiempo agotado, error de red, 429 `rate_limit_exceeded`, 409 `concurrent_idempotent_requests` | `intentos + 1`; reintento a los 1, 5, 15, 30 y 60 min, **acotado por `vence_en`**; al agotar `RECORDATORIO_MAX_INTENTOS` (5) o pasar `vence_en` → `fallido` (`vencido`) |
| `cuota_agotada` | 429 `daily_quota_exceeded` / cuota mensual | **no** se reintenta con espera: un recordatorio tardío no sirve. Se pospone al reinicio de la cuota si llega antes de `vence_en`; si no, `fallido` (`cuota_agotada`). Se corta el lote y se alerta |
| `permanente` | 422 `validation_error` (destinatario mal formado), `invalid_parameter` | `fallido` (`correo_invalido` / `rechazado`), sin reintento |
| `configuracion` | 401/403 (`missing_api_key`, `invalid_api_key`, `restricted_api_key`), dominio no verificado | **no** se toca el recordatorio ni se suma intento; se corta el lote y se alerta. Si nadie lo arregla, vencen y quedan `fallido` |
| `posible_duplicado` | 409 `invalid_idempotent_request` (misma clave con contenido distinto: ya hubo un envío aceptado) | `enviado` sin id y aviso en el log; el webhook completa el resto |

Un rebote real (buzón inexistente) no llega aquí: la API acepta el correo y el rebote llega después
por webhook (decisión 10).

### 9. Idempotencia: al menos una vez, sin duplicados

Cuatro capas, cada una cubre un hueco distinto:

1. **Clave única** `(cita, canal, antelación, hora planificada)`: no pueden existir dos recordatorios
   vivos para lo mismo, por muchos hechos repetidos que lleguen.
2. **Reclamo con `SKIP LOCKED` + transición de estado:** dos procesos no envían la misma fila; una fila
   `enviado` no vuelve a la cola.
3. **Clave de idempotencia ante Resend** = `recordatorio/<id>` (cabecera `Idempotency-Key`): si el
   proceso muere después de que Resend aceptó y antes del commit, el reintento no genera un segundo
   correo. La ventana del proveedor (24 h según su documentación) cubre de sobra el intervalo de
   reintentos, que termina en `vence_en`.
4. **Webhooks monótonos:** un evento repetido no cambia nada; un `delivered` que llega antes de que se
   confirme el envío (o para una fila que quedó en `programado` por una caída) la pasa a `entregado`, y
   el reintento ya no ocurre.

### 10. Webhooks de Resend

- **`POST /api/webhooks/resend`**, sin JWT, **autenticado por la firma**. Resend firma con Svix
  (cabeceras `svix-id`, `svix-timestamp`, `svix-signature`; secreto `RESEND_WEBHOOK_SECRET`).
  Requiere el **cuerpo crudo** (`rawBody: true` en `NestFactory.create`). Se rechaza una firma
  inválida o un sello de tiempo de más de 5 minutos con un 400 uniforme.
- **Búsqueda:** por la etiqueta `recordatorio_id` que se envía con cada correo y, si falta, por
  `proveedor_mensaje_id`. Un id desconocido (p. ej. un correo de prueba) → 200 y se ignora. Si la fila
  está bloqueada por un envío en curso, la actualización espera al commit.
- **Rompe el patrón de tenant, a propósito** (ADR-12 §6): el webhook no sabe de qué organización es; lo
  deduce de la fila.

| Evento | Efecto |
|---|---|
| `email.sent` | completa `proveedor_mensaje_id` si faltaba |
| `email.delivered` | `programado`/`enviado` → `entregado`, `entregado_en` |
| `email.delivery_delayed` | solo log |
| `email.bounced` (permanente) | `enviado` → `fallido` (`rebote`) y **supresión** de la dirección; un rebote transitorio solo se registra |
| `email.complained` | `queja_en` y **supresión**; el estado no cambia |
| `email.failed` | `fallido` (`rechazado`) |
| aperturas, clics y demás | se ignoran: el seguimiento está desactivado (decisión 12) |

### 11. Cuota del modo prueba y límite por tenant

**Capacidad con Resend Free** (100 al día, 3.000 al mes) y dos recordatorios por cita:

| Límite | Cálculo | Citas que cubre |
|---|---|---|
| Diario | 100 ÷ 2 | **50 citas al día** en toda la plataforma |
| Mensual | 3.000 ÷ 2 ÷ 22 días hábiles | ~68 citas por día hábil |

**El límite diario muerde primero.** Con ~5–6 citas al día por profesional alcanza para unos
**9 profesionales**. Configurar un solo recordatorio por cita duplica la capacidad: es la palanca que
la configuración deja en manos de cada profesional.

- **Contador local**, derivado de `recordatorios.enviado_en` (día y mes en UTC; **a verificar** cómo
  reinicia Resend su cuota, ver [Lo que queda por verificar](#lo-que-queda-por-verificar-al-implementar)). Topes en `RESEND_CUOTA_DIARIA` y `RESEND_CUOTA_MENSUAL`. Es una
  estimación prudente: **el 429 del proveedor manda**. Si la plataforma empieza a enviar otros correos
  por la misma cuenta (alertas RF-05, recuperación de contraseña de DT-03), el contador pasa a una tabla
  propia de envíos.
- **Aviso al 80 %:** al cruzar `CUOTA_UMBRAL_AVISO` (0,8) de la cuota diaria o mensual, un log de
  nivel `warn` con `alerta = "recordatorios.cuota_80"`, una vez por período y proceso. Better Stack lo
  convierte en aviso (decisión 16).
- **Cuota agotada = caso propio** (decisiones 7 y 8): se deja de llamar al proveedor hasta el
  reinicio, lo que ya no alcanza a salir a tiempo queda `fallido` (`cuota_agotada`), y se alerta.
- **Límite diario por tenant** (`RECORDATORIO_MAX_DIARIO_POR_TENANT`, **40**, confirmado 2026-09-30;
  día en la zona de la clínica): un fusible contra un tenant desbocado —un error, datos de prueba, abuso— que se comería la
  cuota de todos. No es un reparto justo; es un tope.

**Cuándo pasar a pago:** Resend Pro (US$20 al mes, sin tope diario según su página de precios) cuando
el aviso del 80 % diario salte tres días de una misma semana, o al superar ~9 profesionales activos.
Detalle de costos en [stack-tecnologico.md](../stack-tecnologico.md#modo-prueba).

### 12. Contenido y privacidad

| Se incluye | No se incluye |
|---|---|
| fecha y hora en la zona de la clínica ("martes 14 de octubre, 10:30") | tipo de consulta (`tipoConsulta`) ni motivo |
| nombre del profesional y de la organización | nombre, RUT, teléfono o correo del paciente |
| cómo contactar: `telefono_contacto` y, si hay `Reply-To`, "responde a este correo" | estado, historial u otras citas |
| que es un aviso automático enviado por Citia en nombre del profesional | ids internos, pixeles o enlaces de seguimiento |

- **Asunto neutro:** *"Recordatorio de tu hora: martes 14 de octubre, 10:30"*. Sin el nombre del
  profesional ni de la organización: el asunto se ve en la pantalla bloqueada, y el nombre de una
  organización puede revelar la especialidad.
- **El cuerpo sí nombra al profesional y a la organización** (el nombre de la organización,
  confirmado 2026-09-30): como el remitente es "Citia", sin ellos el paciente no reconoce de qué hora le
  hablan.
- **Sin nombre del paciente,** coherente con [ADR-10 §2](ADR-10.md): un correo también se reenvía.
- **Se genera al enviar,** no al programar: sale con el teléfono de contacto y las reglas de zona
  vigentes.
- **HTML y texto plano,** en español de Chile. Fecha larga con `Intl.DateTimeFormat('es-CL')` en la
  zona de la clínica: función nueva `formatearFechaLargaEnZona` en `shared/domain/timezone.ts`.
- **Preparada para la Fase 3:** la plantilla recibe un bloque opcional `accion?: { texto, url }`. En la
  Fase 2 va vacío y no se dibuja; la Fase 3 lo llena con el enlace de ADR-10
  (`https://<frontend>/cita#<token>`). Agregar el enlace es pasar un campo, no rehacer la plantilla.
- **Seguimiento desactivado** en el dominio de Resend (aperturas y clics). Además de privacidad: el
  seguimiento de clics reescribe los enlaces a través de servidores de Resend, y en la Fase 3 haría
  pasar el token del enlace por un tercero.
- **Logs:** nunca el destinatario ni el cuerpo. Solo ids (recordatorio, cita, tenant), estado y código
  de error.
- **Encargado de tratamiento:** Resend (EE. UU.) recibe el correo del paciente, el nombre del
  profesional y la fecha. Es una transferencia internacional de datos personales, a revisar junto con
  el consentimiento ([DT-16](../Deudas/DT-16.md)).

### 13. Remitente, dominio y desarrollo

- **`CORREO_REMITENTE="Citia <recordatorios@${CORREO_DOMINIO}>"`**, igual para todos los tenants.
- **El dominio no está comprado. Prerrequisito de la salida a producción:**
  1. comprar el `.cl` en NIC Chile y delegar su DNS a Cloudflare;
  2. agregar el dominio en Resend y crear en Cloudflare los registros que Resend indique: **SPF**
     (TXT), **DKIM** (TXT `resend._domainkey`), el **MX** del subdominio de retorno, y **DMARC**
     (`_dmarc`, empezando con `p=none` y endureciendo tras observar). Registros solo DNS, sin proxy;
  3. esperar la verificación.

  **Se envía desde un subdominio** (p. ej. `notificaciones.<dominio>`; confirmado 2026-09-30) para
  aislar la reputación de los recordatorios del correo principal del dominio. `CORREO_DOMINIO` es ese
  subdominio.
- **Mientras el dominio no esté verificado, no se puede escribir a pacientes reales.** Resend solo
  permite enviar a la dirección de la cuenta desde su remitente de pruebas.
- **Desarrollo y tests:** `MENSAJERIA_ADAPTADOR=registro` (valor por defecto fuera de producción): no
  envía, deja constancia sin datos personales y responde `aceptado` con un id ficticio. Para probar de
  punta a punta: `MENSAJERIA_ADAPTADOR=resend` con `CORREO_REMITENTE="Citia <onboarding@resend.dev>"`,
  hacia el correo de la cuenta y las direcciones de prueba que Resend documenta para simular rebotes y
  quejas.

### 14. El correo del paciente pasa a ser obligatorio en el alta

- **DTO:** `CrearPacienteDto.correo` deja de ser `@IsOptional()` (`@IsEmail()`, `@IsNotEmpty()`,
  `@MaxLength(254)`). **Alcanza a dos rutas**, porque el DTO es el mismo: `POST /api/pacientes` y el
  paciente en línea de `POST /api/citas`. Es lo que se busca: la vía manual que el frontend usa de
  verdad es el modal "Nueva cita" (`POST /pacientes` no tiene consumidor, [DT-29](../Deudas/DT-29.md)).
  **El frontend debe marcar el campo como obligatorio en el mismo release**
  (`features/crear-cita/model/crearCitaSchema.ts` y `toCrearCitaRequest.ts`), o recibirá un 400.
- **Dominio:** `Paciente` es hoy una clase plana. Gana una fábrica para pacientes nuevos que exige el
  correo (`CorreoPacienteRequeridoError`), usada por `resolverOCrear` al crear. **No** se aplica al
  reconstituir desde la base: las filas existentes pueden tener NULL.
- **Aceptar una solicitud:** ya trae correo obligatorio del formulario público. Sin cambios.
- **Paciente existente encontrado por RUT con correo NULL** (confirmado 2026-09-30): se **completa**
  con el correo que llega, solo si el guardado está vacío; **nunca** se reemplaza uno distinto. Matiza,
  para ese único caso, el paso 2 de ADR-09 §3 ("si existe → vincular"), que hoy se implementa como "se
  vincula al paciente existente sin tocarlo" (`BandejaSolicitudesService.aceptar` y
  `PacientesService.resolverOCrear`). ADR-09 lleva una nota que apunta aquí. *Riesgo aceptado:* por el
  formulario público, alguien que escriba el RUT de otra persona con su propio correo completaría el
  correo vacío de un paciente real; exige que el profesional acepte la solicitud viendo los datos, y es
  la misma familia que [DT-23](../Deudas/DT-23.md).
- **`POST /citas` con `pacienteId` de un paciente sin correo:** la cita se crea igual y sus
  recordatorios terminan `omitido` (`sin_correo`), visibles para el profesional. La agenda nunca se
  bloquea por un dato de contacto.
- **Filas existentes con NULL: opción F4** (confirmada 2026-09-30), más una ruta mínima
  **`PATCH /api/pacientes/:id`** (solo `telefono` y `correo`, también confirmada) para completarlas. Antes del despliegue,
  contar las filas afectadas en Railway (`SELECT count(*) FROM pacientes WHERE correo IS NULL`); en el
  piloto se esperan casi cero.

### 15. Consentimiento: un punto de extensión, apagado

- La política 7 de la decisión 7 **existe, se prueba y está apagada**
  (`RECORDATORIO_EXIGIR_CONSENTIMIENTO=false`). Encenderla es cambiar una variable, no rediseñar.
- **Riesgo aceptado por el usuario (2026-09-30):** se envía sin mirar `pacientes.consentimiento`.
  Atenuante práctico: los dos formularios del frontend ya exigen la casilla; el hueco es que el backend
  acepta `false` y que en el alta manual la marca el profesional en nombre del paciente.
- **Disparador de revisión: la Ley 21.719** de protección de datos personales, cuya entrada en vigor
  está prevista para el **1 de diciembre de 2026** (confirmar con asesoría legal). Ver
  [DT-16](../Deudas/DT-16.md) para los demás disparadores.

### 16. Observabilidad (avanza DT-19)

- **Logs JSON con `pino`** (`nestjs-pino`), con identificador por petición y **redacción** de
  `authorization`, `x-enlace-cita`, las cabeceras `svix-*`, y los campos `correo`, `rut` y `telefono`.
  Van a la salida estándar (Railway los muestra) y, si hay `BETTERSTACK_SOURCE_TOKEN`, a Better Stack.
  Cambiar de destino (p. ej. a Grafana) es cambiar el transporte, no el código.
- **Eventos de log con nombre estable,** para que las alertas no dependan de textos:

| Evento | Nivel | Campos |
|---|---|---|
| `recordatorio.enviado` / `.omitido` / `.fallido` | info / info / warn | ids, antelación, intentos, motivo, código |
| `alerta = recordatorios.tasa_fallo` | error | tasa, ventana, muestra |
| `alerta = recordatorios.cuota_80` | warn | alcance (día/mes), usados, cuota |
| `alerta = recordatorios.cuota_agotada` | error | alcance |
| `alerta = recordatorios.configuracion` | error | código del proveedor |
| `alerta = eventos_salida.fallido` | error | id y nombre del hecho (ADR-12 §3) |

- **Latidos (heartbeats) de Better Stack:** uno para el job de envío (esperado cada minuto, gracia de
  5) y otro para el despachador de salida (como mucho uno por minuto). Si el contenedor se duerme o el
  job se cuelga, el latido deja de llegar y Better Stack avisa.
- **Tasa de fallo (RNF-03 / RNF-08):** cada 15 minutos, sobre las últimas 24 h,
  `fallidos ÷ (entregados + fallidos)` —sin contar `cancelado` ni `omitido`—. Alerta si supera
  `RECORDATORIO_UMBRAL_TASA_FALLO` (5 %) con al menos `RECORDATORIO_UMBRAL_MUESTRA_MIN` (20) casos
  (confirmado 2026-09-30).
  El umbral está por encima del objetivo del 1 % a propósito: con 50 envíos al día un solo fallo es un
  2 %. El 1 % se mide mes a mes. `cuota_agotada` y `configuracion` alertan de inmediato.
- **Uptime:** `GET /api/health` (consulta `SELECT 1`) vigilado por Better Stack.
- Si las alertas por consulta de logs no estuvieran en el plan gratis, el mismo evento se reporta
  como fallo del latido correspondiente (a verificar al crear la cuenta).

### 17. Endpoints (forma indicativa; los nombres exactos los fija `api-agent`)

| Método | Ruta | Guard | Qué hace |
|---|---|---|---|
| GET | `/api/recordatorios/configuracion` | JWT | configuración del profesional del token (la predeterminada si no guardó ninguna) |
| PUT | `/api/recordatorios/configuracion` | JWT | la guarda y publica `ConfiguracionRecordatorioActualizada` |
| GET | `/api/citas/:citaId/recordatorios` | JWT, filtrado por tenant | `[{ id, canal, antelacionMin, programadoPara, estado, motivo, enviadoEn, entregadoEn }]`; 404 si la cita no es del tenant. Sin destinatario ni id del proveedor |
| POST | `/api/webhooks/resend` | firma Svix | eventos de entrega (decisión 10) |
| GET | `/api/health` | — | salud para el monitor de uptime (`backend-agent`) |
| PATCH | `/api/pacientes/:id` | JWT, filtrado por tenant | completar `telefono` / `correo` (decisión 14, confirmada 2026-09-30) |

### 18. Variables de entorno nuevas

| Variable | Por defecto | Para qué |
|---|---|---|
| `MENSAJERIA_ADAPTADOR` | `registro` | `registro` o `resend` |
| `RESEND_API_KEY` | — | clave de la API (secreto) |
| `RESEND_WEBHOOK_SECRET` | — | secreto `whsec_…` de la firma (secreto) |
| `CORREO_DOMINIO` | — | subdominio de envío verificado, p. ej. `notificaciones.<dominio>` (el dominio aún no está comprado) |
| `CORREO_REMITENTE` | `Citia <onboarding@resend.dev>` | remitente visible |
| `RESEND_CUOTA_DIARIA` / `RESEND_CUOTA_MENSUAL` | `100` / `3000` | topes del plan |
| `CUOTA_UMBRAL_AVISO` | `0.8` | aviso al 80 % |
| `RECORDATORIO_ANTELACIONES_MIN` | `1440,120` | configuración predeterminada |
| `RECORDATORIO_SILENCIO_DESDE` / `HASTA` | `21:00` / `08:00` | horas sin envío (zona de la clínica) |
| `RECORDATORIO_MARGEN_MINIMO_MIN` | `30` | el último recordatorio vence este tiempo antes de la cita |
| `RECORDATORIO_ANTELACION_MINIMA_TARDIA_MIN` | `60` | umbral del recordatorio tardío |
| `RECORDATORIO_MAX_INTENTOS` | `5` | reintentos por errores transitorios |
| `RECORDATORIO_LOTE` / `RECORDATORIO_INTERVALO_SEG` | `20` / `60` | tamaño y cadencia del job de envío |
| `RECORDATORIO_MAX_DIARIO_POR_TENANT` | `40` | fusible por organización |
| `RECORDATORIO_EXIGIR_CONSENTIMIENTO` | `false` | política de consentimiento (DT-16) |
| `RECORDATORIO_UMBRAL_TASA_FALLO` / `_MUESTRA_MIN` | `0.05` / `20` | alerta de tasa de fallo |
| `BETTERSTACK_SOURCE_TOKEN` | — | envío de logs (opcional) |
| `BETTERSTACK_HEARTBEAT_RECORDATORIOS_URL` / `_SALIDA_URL` | — | latidos |

Más las de [ADR-12](ADR-12.md) (`PLANIFICADOR_ACTIVO`, `EVENTOS_SALIDA_*`) y las de CORS de la Fase 2
(ver [US-03](../US/03-recordatorios.md)). `APP_TZ` se reutiliza.

---

## Qué NO cambia

- **El grafo de estados de ADR-04** y la tabla `citas`: sin columnas nuevas.
- **El contrato de las rutas de cita y solicitud,** salvo que el correo del paciente pasa a ser
  obligatorio (decisión 14): endurecimiento deliberado del contrato de entrada.
- **`CitaDetalleDto` y `CitaDashboardDto`:** los recordatorios se consultan en su propia ruta.
- **La vía pública de ADR-09:** intacta.
- **El aislamiento por tenant en todas las rutas HTTP autenticadas.** Solo los jobs y el webhook
  barren todos los tenants, y lo dicen (ADR-12 §6).

---

## Consecuencias

**Positivas**

- El sistema **le habla al paciente** por primera vez: el MVP empieza a cumplir el criterio de "dejar
  de mandar WhatsApps" para el recordatorio en sí.
- Cada recordatorio tiene un estado y un motivo que el profesional puede ver; RNF-03 se puede medir.
- El outbox, la reconciliación y la clave única hacen que reagendar, cancelar o repetir hechos nunca
  produzca un recordatorio duplicado ni uno para una cita que ya no existe.
- La planificación es pura y se prueba sin base ni reloj, incluidos el silencio y el cambio de horario.
- WhatsApp, SMS y el enlace de la Fase 3 se enchufan sin rehacer nada: otro adaptador, otro campo.

**Negativas / riesgos**

- **El paciente responde por fuera del sistema** hasta la Fase 3: la confirmación o la cancelación
  sigue llegando por teléfono o por `Reply-To`, y no queda registrada.
- **Cuota compartida y pequeña:** 50 citas al día para toda la plataforma en el modo prueba.
- **La salida a producción depende de comprar y verificar el dominio**, que tiene plazos de DNS fuera
  del control del equipo.
- **Se envía sin mirar el consentimiento** (riesgo aceptado, decisión 15) y a un correo que **nadie
  verificó** (un error de tipeo manda la fecha y el nombre del profesional a un tercero).
- **Tres tablas nuevas (cuatro con la de ADR-12) y un módulo**, y el primer caso del proyecto donde un
  módulo lee el esquema de otros directamente (decisión 1).
- **Correo obligatorio:** exige un cambio coordinado en el frontend.

---

## Plan de ejecución

| # | Agente | Pieza |
|---|---|---|
| 1 | `database-agent` | migraciones de `configuraciones_recordatorio`, `recordatorios` (índice único parcial y de cola) y `supresiones_correo`; entidades ORM; adaptadores con los métodos de BARRIDO GLOBAL y `FOR UPDATE SKIP LOCKED`; lector SQL de solo lectura |
| 2 | `backend-agent` | lo de ADR-12; `rawBody`; CORS con lista de orígenes; `nestjs-pino` con redacción; `GET /api/health`; latidos; validación de las variables de entorno |
| 3 | `api-agent` | dominio (`Recordatorio`, `ConfiguracionRecordatorio`, planificación, políticas); suscriptor y reconciliación; envío; `ResendCanalMensajeria` y `RegistroCanalMensajeria`; plantilla; webhooks; rutas de configuración y de estado; correo obligatorio del paciente y `PATCH /pacientes/:id`; `formatearFechaLargaEnZona` |
| 4 | `testing-agent` | ver la Definición de Terminado de [US-03](../US/03-recordatorios.md) |

---

## Decisiones confirmadas (2026-09-30)

El usuario confirmó el 2026-09-30 las recomendaciones que este ADR dejaba abiertas. Ya son parte de la
decisión; se listan juntas para que se puedan revisar de un vistazo.

| Tema | Decisión | Dónde |
|---|---|---|
| **Respuestas del paciente (`Reply-To`)** | E2: el correo que el profesional configure; si no configura ninguno, no hay `Reply-To` y el texto lo dice | opción E, decisión 12 |
| **Horas sin envío** | 21:00–08:00, todos los días, en la zona de la clínica; globales | decisiones 3 y 5.c |
| **Pacientes existentes sin correo** | F4: columna nullable, correo obligatorio en toda escritura, recordatorio `omitido` si falta, y `PATCH /api/pacientes/:id` mínimo | opción F, decisión 14 |
| **Recordatorios activos por defecto** | sí, a las 24 h y 2 h | decisión 3 |
| **Cita creada tarde** | un solo recordatorio inmediato si faltan al menos 60 min | decisión 5.e |
| **Completar el correo vacío al vincular por RUT** | sí, solo si está vacío; matiza ADR-09 §3 | decisión 14 |
| **Nombre de la organización en el cuerpo** | sí | decisión 12 |
| **Subdominio de envío** | sí (p. ej. `notificaciones.<dominio>`) | decisión 13 |
| **Límite diario por tenant** | 40 envíos | decisión 11 |
| **Alerta de tasa de fallo** | más de 5 % en 24 h con al menos 20 casos | decisión 16 |

## Lo que queda por verificar al implementar

No son decisiones abiertas: son datos de los proveedores que el diseño da por supuestos y que hay que
comprobar contra su documentación (o con tests sobre respuestas grabadas) al construir el adaptador.
Si alguno no se cumple, cambia el adaptador, no el diseño.

| Dato | Supuesto del diseño | Si no se cumple |
|---|---|---|
| Nombres de los errores de Resend | `rate_limit_exceeded`, `daily_quota_exceeded`, `validation_error`, `invalid_idempotent_request`, etc. (decisión 8) | se ajusta la tabla de clasificación del adaptador |
| Ventana de la clave de idempotencia de Resend | 24 h (decisión 9) | si es menor que el intervalo de reintentos, se acorta `vence_en` o se pasa a un estado `enviando` |
| Etiquetas en el payload del webhook | `data.tags` trae `recordatorio_id` (decisión 10) | se busca solo por `proveedor_mensaje_id` y se reintenta el webhook si la fila aún no tiene id |
| Reinicio de la cuota diaria de Resend | día calendario en UTC (decisión 11) | se ajusta el cálculo del contador local |
| Direcciones de prueba de Resend | existen para simular rebote y queja (decisión 13) | se prueban los webhooks con eventos grabados |
| Alertas por consulta de logs en Better Stack gratis | disponibles (decisión 16) | la alerta se reporta como fallo del latido |
| Entrada en vigor de la Ley 21.719 | 1 de diciembre de 2026 (decisión 15) | se mueve la fecha de revisión de DT-16 |

> El resultado de esta verificación está en
> [Notas de implementación → Datos de proveedores](#datos-de-proveedores-lo-que-queda-por-verificar-resuelto).

---

## Notas de implementación (2026-10-04)

> Las decisiones de arriba **no cambian**. Esta sección registra cómo quedó el código en la rama
> `feature/fase2-recordatorios` ([PR #1](https://github.com/Citia-solutions/citia-backend/pull/1)) y
> dónde se precisó o se apartó del diseño. Descripción completa del módulo, contratos y tablas:
> [us03-recordatorios](../Features/us03-recordatorios.md). Reglas locales para los agentes:
> `src/modules/recordatorio/CLAUDE.md`.

### Qué se construyó y dónde

| Pieza | Commit |
|---|---|
| `nestjs-pino` con redacción, `GET /api/health`, puerto `Latidos`, validación del entorno, CORS por lista (§16, §18) | `d45de20` |
| Correo obligatorio en `CrearPacienteDto` y en `Paciente.crear`, completar por RUT, `PATCH /api/pacientes/:id` (§14) | `a37f175` |
| Migraciones `1750000009000` (configuraciones), `1750000010000` (recordatorios), `1750000011000` (supresiones); puertos, adaptadores SQL y `SqlLectorCitas`; `RecordatorioModule` rehecho (§1, §2) | `f2d80aa` |
| `Recordatorio` y `ConfiguracionRecordatorio`, `planificar` / `resolverTardios` / `reconciliar`, nueve políticas, puerto `CanalMensajeria`, `SuscriptorRecordatorios`, job de respaldo, `formatearFechaLargaEnZona` (§3–§8) | `a13d80a` |
| `EnviarRecordatoriosService`, plantilla, `ResendCanalMensajeria` y `RegistroCanalMensajeria`, cuota y fusible, tasa de fallo, webhook firmado, rutas de configuración y estado, `CLAUDE.md` del módulo (§7–§13, §16, §17) | `f719c66` |
| Integración con Postgres, e2e de políticas y de redacción de logs, `src/arquitectura.spec.ts` | `a938f9d` |

### Desvíos y precisiones

**Planificación y reconciliación (§5, §6)**

| # | Diseño | Cómo quedó | Por qué |
|---|---|---|---|
| 1 | 5.d: el último recordatorio vence `margen mínimo` antes del `inicio` | **`max(inicio − margen, min(inicio, programadoPara + margen))`** (`planificacion.ts`, `vencimientoDelUltimo`) | con la regla literal, una antelación de 30 min y un margen de 30 vencería en el mismo instante en que toca y no saldría nunca. Para antelaciones ≥ 2 × margen da lo mismo |
| 2 | 5.e: tardío si "faltan al menos 60 min" | Se mide **desde la hora a la que el tardío saldría de verdad** (el fin del silencio si `ahora` cae dentro), no desde `ahora`; y **no se crea tardío si ya salió** (`enviado`/`entregado`) **otro recordatorio para ese mismo `inicio`** | fuera del silencio es lo mismo; dentro, evita un "tardío" que llegaría con menos de 60 min. Lo segundo evita recordar dos veces la misma hora |
| 3 | §6: respaldo con candado consultivo (ADR-12 §5) | **Sin candado global**: cada cita se reconcilia en su propia transacción con el candado por cita, y la reconciliación es idempotente. Paginado por cursor `(inicio, id)`, horizonte de 8 días | a este volumen repetir el trabajo es más barato que coordinarlo; el candado por cita ya evita que dos procesos se crucen |
| 4 | §6: respaldo "cada hora" | **Cron `0 15 * * * *` en `APP_TZ`** (cada hora, en el minuto 15), no un intervalo de 1 h | un intervalo vuelve a contar desde cero en cada despliegue: con despliegues más seguidos que una hora no correría nunca |
| 5 | §1: jobs en `infrastructure/planificacion/` | Igual, y se cargan desde **`RecordatorioPlanificacionModule`**, que solo importa `AppModule`; `RecordatorioModule` no tiene jobs | las e2e que cargan `RecordatorioModule` no levantan jobs ni necesitan `ScheduleModule` ni `Latidos` |

**Envío y proveedor (§7, §8, §11)**

| # | Diseño | Cómo quedó | Por qué |
|---|---|---|---|
| 6 | §8: reintentos a los 1, 5, 15, 30 y 60 min; al agotar `RECORDATORIO_MAX_INTENTOS` (5) → `fallido` | **`RECORDATORIO_MAX_INTENTOS` cuenta reintentos**, no llamadas: con 5 se recorre el calendario completo y el **sexto** fallo transitorio lo agota, así que la columna `intentos` puede llegar a **6**. Si la espera cae a menos de 1 min de `vence_en`, **el último reintento se adelanta a `vence_en − 1 min`**; si ni eso queda en el futuro, `fallido` (`vencido`) | así lo dice §18 ("reintentos por errores transitorios"); el adelanto da una última oportunidad que la política de vencimiento todavía deja salir |
| 7 | §8: tabla de clasificación de Resend | **Ajustada a la documentación real** (verificada el 2026-10-03 contra la API y el SDK `resend` 6.32): `validation_error` llega como **400** (no 422); un **403 por dominio no verificado** (o "solo puedes escribir a tu correo") va como `configuracion`; **404 / 405 e `invalid_idempotency_key`** van como `configuracion` (la URL, el método o nuestra clave están mal y afectarían a todos); un **400/422 sobre `to`** es `permanente` (`correo_invalido`), sobre `from` es `configuracion`, y cualquier otro 4xx es `permanente` (`rechazado`). Además `monthly_quota_exceeded` es `cuota_agotada` (mes), y un 200 sin `id` se trata como `posible_duplicado` | el `codigo` guardado es el nombre del error (o `http_<status>`), nunca su mensaje, que puede traer direcciones |
| 8 | §7.5: "esperar al menos 500 ms" | **Pausa fija de 500 ms** entre dos llamadas al proveedor (`PAUSA_ENTRE_ENVIOS_MS`), y un tope propio del caso de uso de **11 s** por llamada además de los 10 s del adaptador | el tope del caso de uso es la defensa si el adaptador no corta: la fila está bloqueada mientras dura la llamada |
| 9 | §11: cuota agotada por el proveedor | Tras un 429 de cuota, **el proceso deja de llamar al proveedor hasta el reinicio del periodo** (día o mes UTC). El bloqueo vive **en memoria**: un reinicio del contenedor lo olvida y la siguiente llamada recibe otro 429, que lo vuelve a armar | inofensivo (una llamada de más) y evita una tabla para un estado de horas |
| 10 | §7: una fila que lanza dentro de su transacción | **Los errores internos por fila se registran como reintento** con código `interno:<error.name>` (en una transacción aparte), con log `recordatorios.envio_error_interno`, y el lote sigue | que una fila rota no bloquee la cola ni se reintente en cada tick sin espera |

**Webhooks y supresiones (§9, §10)**

| # | Diseño | Cómo quedó | Por qué |
|---|---|---|---|
| 11 | §10: `email.bounced` / `email.failed` pasan `enviado` → `fallido` | **Monótono también desde `programado`**: `rebotado` y `rechazado` se aplican igual que `entregado` (§9.4) a una fila que quedó en `programado` por una caída tras la aceptación | mismo caso que `entregado` desde `programado`; sin esto, el reintento volvería a escribir a una dirección que rebotó |
| 12 | §10: supresión por rebote permanente o queja | **Solo suprimen los webhooks**: rebote permanente, queja y **`email.suppressed`** (Resend no lo envió porque la dirección está en *su* lista), que se trata como rebote. **Un `permanente` síncrono (400/422) no suprime**: la dirección mal escrita se corrige con `PATCH /pacientes/:id` | un rechazo síncrono no dañó la reputación del remitente |

**Persistencia (§2)**

| # | Diseño | Cómo quedó | Por qué |
|---|---|---|---|
| 13 | §2: tablas | **Restricciones extra**: CHECK `canal IN ('email')` en `recordatorios` y en `configuraciones_recordatorio`; CHECK de formato del hash en `supresiones_correo` (`^[0-9a-f]{64}$`) y de su `motivo`; **CHECK de `motivo` emparejado con el `estado`** (sin motivo en `programado`/`enviado`/`entregado`; cada final negativo solo con los suyos). En la primera versión, un final negativo **sin** motivo pasaba el CHECK (`NULL IN (…)` da NULL y un CHECK que evalúa NULL se da por cumplido); se corrigió con `motivo IS NOT NULL` explícito | la base es la última defensa de la máquina de estados; el hash impide guardar una dirección en claro por error |
| 14 | §1: puertos con `tx` | **`tx` obligatorio en todos los puertos, también en las lecturas**: las rutas GET abren una transacción con `TransactionRunner.run`, y los adaptadores lanzan si no la reciben | el candado consultivo por cita y la coherencia de las lecturas dependen de ella |

**API (§17)**

| # | Diseño | Cómo quedó | Por qué |
|---|---|---|---|
| 15 | `GET /api/citas/:citaId/recordatorios` → `[{ id, canal, antelacionMin, programadoPara, estado, motivo, enviadoEn, entregadoEn }]` | **Se agregó `proximoIntentoEn`** a `RecordatorioCitaDto`: la hora real del próximo intento, solo mientras está `programado` (`null` en otro estado). Incluye los `cancelado`; orden por `programadoPara` | difiere de `programadoPara` en un tardío, un reintento o una espera por silencio o cuota; el voucher lo muestra como "se enviará" |
| 16 | `GET/PUT /api/recordatorios/configuracion` | La respuesta lleva `predeterminada: true` mientras el profesional no guardó; **PUT es reemplazo completo** (lo que no viaja, o viaja vacío, queda `null`); `canal` no se recibe | el frontend distingue la configuración del entorno de la guardada |
| 17 | `POST /api/webhooks/resend` | Responde `200 { recibido: true }`; firma inválida, vieja (> 5 min) o ausente → `400` uniforme | cualquier 2xx confirma la entrega a Resend |

**Observabilidad (§16)**

| # | Diseño | Cómo quedó | Por qué |
|---|---|---|---|
| 18 | Latido del job de envío | **El latido `recordatorios` lo da solo el job de envío** (cada minuto). La reconciliación de respaldo **no late** al terminar bien: solo `informarFallo` si falla. Un rechazo de `configuracion` del proveedor también informa fallo | un latido por hora no prueba nada y "resolvería" en falso un envío caído |
| 19 | Tasa de fallo cada 15 min | Igual, y **la alerta se repite en cada medición mientras siga sobre el umbral** (el incidente sigue abierto); la medición sale siempre como `recordatorios.tasa_fallo_medida` (info) | — |
| 20 | Eventos con nombre estable | Además de los de la tabla: `recordatorio.cancelado`, `.pospuesto`, `.reintento`, `.posible_duplicado`, `recordatorios.configuracion_proveedor`, `recordatorios.envio_error_interno`, `recordatorios.webhook_rechazado` / `_ignorado`, `recordatorios.respaldo` | — |

**Dependencias y entorno (§18)**

| # | Diseño | Cómo quedó | Por qué |
|---|---|---|---|
| 21 | `svix` para la firma | **`svix` fijado en 1.x** (1.99.1) | la 2.x es solo ESM y Jest (CommonJS) no la carga |
| 22 | §13: `MENSAJERIA_ADAPTADOR=registro` por defecto | Por defecto `registro` **fuera de producción**; **en producción es obligatoria, sin default** (el arranque falla si falta). Con `resend`, `RESEND_API_KEY` y `RESEND_WEBHOOK_SECRET` (que debe empezar con `whsec_`) son obligatorias. `CORREO_REMITENTE` se deriva de `CORREO_DOMINIO` si no se define | que producción nunca quede en `registro` (que no envía nada) por omisión |
| 23 | Variables de §18 | Todas validadas en `shared/infrastructure/config/entorno.ts`. Se agregaron `LOG_NIVEL`, `LOG_FORMATO` y `BETTERSTACK_INGESTING_HOST`. `docker-compose.yml` reenvía las cuatro de mensajería (`MENSAJERIA_ADAPTADOR`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `CORREO_DOMINIO`) | — |

**Correo del paciente (§14)**

| # | Diseño | Cómo quedó |
|---|---|---|
| 24 | `@IsEmail()` + fábrica de dominio | La **normalización** (sin espacios, en minúsculas) está **en el DTO** (`@NormalizarCorreo()`, antes de validar) **y en el dominio** (`shared/domain/correo.ts`, la misma forma que usa el hash de supresiones) |
| 25 | Completar un correo vacío al vincular por RUT | Con un **`UPDATE` condicional** (`… WHERE id AND tenant_id AND (correo IS NULL OR btrim(correo) = '')`) dentro del `tx`: una vinculación concurrente no lo pisa y un correo ya guardado nunca se reemplaza |
| 26 | — | `PacienteNoEncontradoError` **se movió** de `cita/application` a `paciente/application` (lo usan `PATCH /pacientes/:id` y `POST /citas`) |
| 27 | — | El seed demo usa correos `@example.com` (dominio reservado: nunca llega a nadie) |

### Datos de proveedores (lo que queda por verificar, resuelto)

| Dato | Resultado (2026-10-03) |
|---|---|
| Nombres de los errores de Resend | ✅ verificados; la tabla del adaptador cambió (desvío 7) |
| Ventana de la clave de idempotencia | ✅ **24 h**, de sobra para el calendario de reintentos |
| Etiquetas en el webhook | ✅ `data.tags` llega como **objeto** `{ recordatorio_id: … }`, no como la lista del envío; el traductor acepta las dos formas y, si falta, busca por `proveedor_mensaje_id` |
| Reinicio de la cuota diaria | ✅ **día calendario en UTC** |
| Límite de peticiones | ✅ **10 por segundo** según la documentación; la pausa de 500 ms deja el envío en 2 por segundo |
| Reinicio de la **cuota mensual** del plan gratis | ❓ **sin confirmar**: el contador local asume mes calendario UTC. Pregunta abierta en [PREGUNTAS-ABIERTAS](../PREGUNTAS-ABIERTAS.md#q15--cuándo-reinicia-resend-la-cuota-mensual-del-plan-gratis) |
| Tipo de rebote: `Temporary` frente a `Transient` | ❓ **sin confirmar** cuál usa Resend. No cambia nada: solo `Permanent` (sin distinguir mayúsculas) suprime; cualquier otro tipo se registra y se ignora |
| Direcciones de prueba de Resend | los tests automáticos no las usan: los webhooks se prueban con eventos firmados con Svix (`test/recordatorios-http.e2e-spec.ts`, `test/recordatorios-flujo.e2e-spec.ts`). Quedan para la prueba manual con el dominio verificado |
| Alertas por consulta de logs en Better Stack gratis | pendiente hasta crear la cuenta. Si no están, las alertas críticas ya se ven como fallo de latido (desvío 18) |

### Prerrequisitos operativos (estado al 2026-10-04)

El dominio ya está comprado: **`citiahealth.cl`**, delegado a Cloudflare. Falta verificar el
subdominio de envío en Resend, crear el webhook, configurar Better Stack y cargar las variables en
Railway. Checklist completo en la
[Fase 2 → salida a producción](../Fases/fase-2-us03-recordatorios.md#checklist-de-salida-a-producción).

---

## Referencias

- [ADR-12](ADR-12.md) — outbox, suscriptores, planificador, barrido global.
- [ADR-04](ADR-04.md) — estados vigentes y terminales.
- [ADR-07](ADR-07.md) — zona de la clínica con `Intl`.
- [ADR-09](ADR-09.md) — §3 (RUT, correo, consentimiento), §4 (editar / reagendar / cancelar frente al
  recordatorio), §7 (hechos).
- [ADR-10](ADR-10.md) — el enlace por cita que la Fase 3 pondrá en este correo; §2 (qué no se muestra).
- RF-06, RF-07 · RNF-02, RNF-03, RNF-08.
- `src/modules/paciente/presentation/dto/crear-paciente.dto.ts`,
  `src/modules/paciente/application/pacientes.service.ts` (`resolverOCrear`),
  `src/modules/cita/presentation/dto/crear-cita.dto.ts`, `src/shared/domain/timezone.ts`.
- Implementación (2026-10-04): `src/modules/recordatorio/` (con su `CLAUDE.md`),
  `src/shared/infrastructure/observabilidad/`, `src/shared/infrastructure/config/entorno.ts`,
  `src/shared/presentation/salud.controller.ts`.

---

## Deudas técnicas asociadas

**Cierra:** [DT-21](../Deudas/DT-21.md) (el módulo `recordatorio/` se rehízo en `f2d80aa`; las
carpetas mal escritas de `paciente/` ya no existen) — **cerrada** el 2026-10-03.

**Avanza:** [DT-19](../Deudas/DT-19.md) (logs, health, latidos y alertas implementados; falta la
verificación manual en Better Stack).

**Toca:** [DT-16](../Deudas/DT-16.md) — riesgo aceptado con punto de extensión (decisión 15) ·
[DT-17](../Deudas/DT-17.md) — silencio y zona globales · [DT-23](../Deudas/DT-23.md) — completar un
correo vacío por RUT · [DT-26](../Deudas/DT-26.md) — se amplía a recordatorios y supresiones ·
[DT-29](../Deudas/DT-29.md) — `POST /pacientes` sigue sin consumidor · [DT-30](../Deudas/DT-30.md) —
el recordatorio no registra asistencia; sus botones esperan a la Fase 3 (2026-09-30).

**Previstas, ya contraídas** (se ficharon al implementar, 2026-10-04):

1. **El correo del paciente no se verifica:** un error de tipeo envía fecha y profesional a un tercero
   → [DT-35](../Deudas/DT-35.md).
2. **Cuota compartida por toda la plataforma**, solo acotada por el fusible por tenant
   → [DT-36](../Deudas/DT-36.md).
3. **`enviado` que nunca llega a `entregado`** si los webhooks no están configurados (desarrollo) o se
   pierden → [DT-37](../Deudas/DT-37.md).
4. **Carrera aceptada** con un reagendamiento en el mismo segundo del envío (decisión 7)
   → [DT-38](../Deudas/DT-38.md).
5. **Sin herramienta para quitar una dirección de `supresiones_correo`** (se hace con SQL)
   → [DT-39](../Deudas/DT-39.md).

**Detectada al implementar:** [DT-31](../Deudas/DT-31.md) — imports que cruzan capas en los módulos
anteriores (`recordatorio` no tiene servicios que importen DTOs de `presentation/`).

Índice completo: [`../Deudas/README.md`](../Deudas/README.md).
