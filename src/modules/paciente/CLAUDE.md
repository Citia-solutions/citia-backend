# Módulo: paciente

Fichas de pacientes por organización (ADR-09 §3: identidad por RUT dentro del tenant), el contacto
(ADR-13 §14) y, desde US-11, **la prueba de la aceptación de los términos del paciente**
(`aceptaciones_terminos`). Diseño: [ADR-16](../../../context/Decisions/ADR-16.md); plan
`context/US/11-terminos-paciente.md`. El texto de los términos vive en el frontend (`/terminos`) y su copia
congelada en `context/Cumplimiento/`.

## Estructura

```
src/modules/paciente/
├── domain/                                    ← puro (ADR-02)
│   ├── paciente.entity.ts                     ← Paciente (crear exige correo; reconstituir no), cambio de contacto
│   ├── paciente.repository.ts                 ← puerto (… completarCorreoSiVacio, marcarConsentimiento)
│   ├── terminos-paciente.ts                   ← CATÁLOGO de versiones de los términos + consultas puras
│   ├── aceptacion-terminos.entity.ts          ← CanalAceptacion, CANALES_DEL_TITULAR, AceptacionTerminos.registrar
│   ├── aceptacion-terminos.repository.ts      ← puerto SOLO INSERCIÓN (insertarSiNoExiste, existeDelTitular)
│   └── exceptions/                            ← CorreoPacienteRequerido, CambioContactoVacio, VersionTerminosNoVigente (→ 400)
├── application/
│   ├── pacientes.service.ts                   ← resolverOCrear, crearPaciente (tx), actualizarContacto,
│   │                                             registrarAceptacion, titularAceptoVigente
│   └── paciente-no-encontrado.error.ts        ← → 404 (PATCH) / 400 (POST /citas con pacienteId)
├── infrastructure/persistence/                ← ORM (pacientes, aceptaciones_terminos) y adaptadores (SQL a mano)
├── presentation/
│   ├── pacientes.controller.ts                ← `pacientes` (JwtAuthGuard), traducción única de errores
│   └── dto/                                   ← CrearPacienteDto (también el `paciente` de POST /citas),
│                                                 ActualizarPacienteDto, PacienteResponseDto,
│                                                 version-terminos.decorator.ts (@VersionTerminosVigente + mensaje fijo)
└── paciente.module.ts                         ← importa SharedModule (TransactionRunner); exporta
                                                  PacienteRepository y PacientesService
```

## Endpoints (prefijo global `/api`, con JWT)

| Método | Ruta | Status | Notas |
|---|---|---|---|
| POST | `/pacientes` | 201 / 400 | `consentimiento: true` y `terminosVersion` obligatorios (US-11, D6); una transacción: `resolverOCrear` + aceptación de canal `profesional` a nombre del usuario del token; responde `consentimiento: true` |
| PATCH | `/pacientes/:id` | 200 / 400 / 404 | solo `telefono` y `correo` (ADR-13 §14); **no** toca el consentimiento |

## Reglas del módulo

- **Tenant y usuario del token, nunca del body.**
- **`resolverOCrear` no cambia y no registra ninguna aceptación** (ADR-16 T3). Lo comparten el alta manual,
  `POST /citas` y la bandeja (vía `CitasService.agendar`), dentro del `tx` de quien llama.

### Términos del paciente (US-11)

- **Catálogo** (`domain/terminos-paciente.ts`, sin variable de entorno): `{ version, recibeAceptaciones,
  sigueCubriendo }`. Reglas (las prueba `terminos-paciente.spec.ts`): versiones únicas con formato
  `^\d+\.\d+$`; `recibeAceptaciones ⇒ sigueCubriendo`; **ninguna entrada se borra nunca**. Un cambio de
  texto es SIEMPRE una versión nueva. Para cambiar de versión, los tres pasos del comentario del archivo
  (backend agrega → frontend publica → backend retira, al menos un día después).
- **`aceptaciones_terminos` es de SOLO INSERCIÓN**: el puerto no tiene `UPDATE` ni `DELETE` (sin trigger,
  como `cambios_cita`). Una fila por paciente, versión y canal (`ON CONFLICT DO NOTHING`: gana el primer
  acto). El puerto **no se exporta**: solo se escribe por `PacientesService.registrarAceptacion`.
- **`registrarAceptacion(props, tx)` es la única puerta** y corre **siempre dentro del `tx` de quien
  llama** (`tx` obligatorio): `AceptacionTerminos.registrar` (valida la versión según el canal) →
  `insertarSiNoExiste` → `marcarConsentimiento` (siempre; condicional). Quién llama y con qué canal:

  | Canal | Quién | Referencia | `aceptadaEn` | Versión exigida |
  |---|---|---|---|---|
  | `formulario_publico` | `BandejaSolicitudesService.aceptar` (rama `nueva` con versión) | `solicitudId` | `solicitud.recibidaEn` | conocida |
  | `enlace_cita` | `PortalPacienteService.aceptarTerminos` | `enlaceId` | el `ahora` del portal | que reciba |
  | `profesional` | `CitasService.crearCita` (con `paciente`) y `crearPaciente` | `usuarioId` (token) | el reloj del servicio | que reciba |

- **`pacientes.consentimiento` es una bandera derivada**: toda aceptación, de cualquier canal, la pone en
  `true` en la misma transacción; **nada la pone en `false`** (el retiro se atiende a mano).
- **El titular** = `CANALES_DEL_TITULAR` (formulario y enlace). `titularAceptoVigente` (lectura sin
  bloqueo, versiones que cubren) es lo que usa `/cita` para `terminosPendientes`: la aceptación del
  profesional no cuenta.
- **Orden de bloqueo:** `registrarAceptacion` toma la fila del paciente (el `UPDATE` de la bandera) **al
  final** del flujo de quien llama: portal cita → paciente; bandeja solicitud → paciente → cita nueva;
  alta manual paciente → cita nueva. Nadie bloquea una cita existente después de un paciente.
- **Errores:** `VersionTerminosNoVigenteError` (el mensaje no repite la versión) → 400 con el mensaje fijo
  `MENSAJE_VERSION_TERMINOS_NO_VIGENTE` en `PacientesController`, `CitasController` y
  `PortalPacienteController`. El mismo texto lo da el DTO (`@VersionTerminosVigente()`: `@IsString` +
  `@IsIn`, sin `@IsOptional`) y lo replica el frontend: **si cambia, cambia en los dos**. Una referencia de
  canal vacía o un canal desconocido → `RangeError` (invariante de quien llama, 500).
- Sin logs nuevos: la prueba es la fila. Sin IP ni navegador (D12).

## Dependencias

- `paciente` **no importa ningún módulo de negocio** (solo `SharedModule`). Lo importan `cita`,
  `solicitud` y `portal-paciente` (y `AppModule`): sin ciclos.

## Tests

- Unitarios: `domain/terminos-paciente.spec.ts`, `domain/aceptacion-terminos.entity.spec.ts`,
  `application/pacientes.service.spec.ts`, `presentation/dto/crear-paciente.dto.spec.ts`,
  `presentation/pacientes.controller.spec.ts`. Dobles: `InMemoryPacienteRepository` y
  `InMemoryAceptacionTerminosRepository` (`test/support/in-memory-repositories.ts`).
- Las suites con Postgres que truncan `pacientes` o `usuarios` incluyen `aceptaciones_terminos` (FK
  `RESTRICT`); las que listan entidades a mano suman `AceptacionTerminosOrmEntity`.
