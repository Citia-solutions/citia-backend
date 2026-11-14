# Módulo: portal-paciente

Lo que el **paciente** ve y hace desde el enlace de su cita (Fase 3, US-04 + US-02.07):
ver la cita, confirmar, cancelar y pedir otra hora, sin cuenta; desde US-11, también aceptar los
términos de uso y el aviso de privacidad. Diseño:
[ADR-10](../../../context/Decisions/ADR-10.md) y [ADR-16 §8](../../../context/Decisions/ADR-16.md);
plan y Definición de Terminado: `context/US/04-respuesta-paciente.md` (contrato §3.4) y
`context/US/11-terminos-paciente.md`.

Módulo de **composición**: no tiene reglas de negocio propias salvo
`accionesPermitidasPaciente`. Orquesta `cita`, `solicitud` y `paciente` en UNA transacción por
petición.

## Estructura

```
src/modules/portal-paciente/
├── domain/                                   ← puro (ADR-02)
│   ├── acciones-paciente.ts                  ← AccionPaciente + accionesPermitidasPaciente(cita, hayPeticion, ahora)
│   └── lector-nombres-cita.ts                ← puerto de SOLO LECTURA: nombre del profesional y de la organización
├── application/
│   ├── portal-paciente.service.ts            ← ver / confirmar / cancelar / pedirOtraHora / aceptarTerminos (un tx cada una)
│   └── accion-no-disponible.error.ts         ← → 409 uniforme
├── infrastructure/persistence/
│   └── sql-lector-nombres-cita.ts            ← una consulta (usuarios ⨝ tenants), filtra por tenant
├── presentation/
│   ├── portal-paciente.controller.ts         ← `publico/cita`, SIN JWT; cuerpos de error fijos
│   └── dto/                                  ← VistaCitaPacienteDto, CancelarCitaPacienteDto, PedirOtraHoraDto,
│                                                AceptarTerminosDto (US-11), @Recortar
├── integration/                              ← contra Postgres (npm run test:integration)
└── portal-paciente.module.ts                 ← importa SharedModule, CitaModule, SolicitudModule, PacienteModule
```

## Endpoints (prefijo global `/api`, sin JWT)

Cabecera `X-Enlace-Cita: <token>` (el token viaja en el fragmento de la página y nunca
en la URL de la API). Todas con `Cache-Control: no-store` y `Referrer-Policy:
no-referrer` (`@SinCacheNiReferrer()`, también en los errores 400/404/409; no en el 429,
que corta el guard antes del interceptor y no lleva datos) y límite
`portalPorIp` (30/min por IP, clase); los POST suman `portalPorEnlace` (5/h por enlace, **un cubo**
compartido por los cuatro POST: aceptar y confirmar gastan 2 de 5).

| Método | Ruta | Cuerpo | Éxito | Errores |
|---|---|---|---|---|
| GET | `/publico/cita` | — | 200 `VistaCitaPacienteDto` (además anota la primera apertura, US-07.01) | 404 |
| POST | `/publico/cita/confirmar` | — | 200 | 404 / 409 |
| POST | `/publico/cita/cancelar` | `{ motivo?: string ≤ 300 }` | 200 | 400 / 404 / 409 |
| POST | `/publico/cita/otra-hora` | `{ preferencia: string 1..300, motivo?: string ≤ 300 }` (recortados) | 201 | 400 / 404 / 409 |
| POST | `/publico/cita/aceptar-terminos` (US-11) | `{ terminosVersion: string }` (del catálogo, que reciba aceptaciones) | 200 | 400 / 404 |

```ts
VistaCitaPacienteDto = {
  inicio: string;            // ISO UTC
  zonaHoraria: string;       // APP_TZ
  duracionMin: number;
  estado: EstadoCita;
  profesional: string;       // nombre completo del DUEÑO de la cita
  organizacion: string;      // nombre del tenant
  accionesPermitidas: Array<'confirmar' | 'cancelar' | 'pedirOtraHora'>;
  solicitudOtraHora: { preferencia: string; solicitadaEn: string } | null;
  terminosPendientes: boolean; // US-11: sin aceptación PROPIA (formulario o enlace) de una versión que cubre
}
```

- **404 uniforme**, cuerpo EXACTO `{ "statusCode": 404, "message": "Enlace no válido o
  vencido" }` para todo enlace no válido: cabecera ausente, formato, inexistente,
  revocado, cita terminal, `ahora ≥ inicio`. Mismo cuerpo en las cinco rutas.
- **409 uniforme**, cuerpo EXACTO `{ "statusCode": 409, "message": "Esta acción ya no está
  disponible" }`: la acción no está en `accionesPermitidas` (p. ej. confirmar una
  confirmada o con una petición abierta), la entidad rechazó la transición, o otra
  petición de otra hora ganó la carrera (23505).
- Un cuerpo inválido da el 400 del `ValidationPipe` (antes de mirar el token: no revela
  nada del enlace). Cualquier otro error → 500 genérico de Nest.
- **400 de la versión de los términos** (US-11): una `terminosVersion` ausente, desconocida o que ya no
  recibe aceptaciones da el 400 del `ValidationPipe` con el mensaje fijo
  `MENSAJE_VERSION_TERMINOS_NO_VIGENTE` (*"La versión de los términos ya no está vigente. Recarga la
  página."*). Si `VersionTerminosNoVigenteError` llega al caso de uso sin pasar por el DTO, el controller
  responde el mismo mensaje con cuerpo fijo `{ statusCode: 400, message }`
  (`CUERPO_VERSION_TERMINOS_NO_VIGENTE`).
- **`aceptar-terminos` no tiene 409**: con un enlace válido, aceptar siempre se puede (también con una
  petición de otra hora abierta o con la cita confirmada). Es idempotente: si el titular ya aceptó una
  versión que cubre, responde 200 sin escribir.
- Tras cancelar: 200 con estado `cancelada`, sin acciones y `solicitudOtraHora: null`; un
  GET posterior → 404 (cita terminal).

## Reglas del módulo

- **Respuesta uniforme.** Nunca distinguir por qué un enlace no sirve. Nada de detalles
  internos (ids, estados, mensajes de dominio) en los cuerpos de error.
- **La vista nunca lleva** nombre del paciente, RUT, contacto, `tipoConsulta`, ids
  internos ni el token. Si se agrega un campo a `VistaCitaPacienteDto`, revisar esta lista.
  *`terminosPendientes` es un booleano sobre la autorización, no un dato del paciente* (US-11).
- **Ninguna ruta acepta ids del cliente**: todo es `token → enlace → cita → tenant`.
- **Una transacción por petición**, siempre en este orden:
  1. `EnlacesCitaService.resolver(token, tx)` → enlace + cita **bloqueada** con
     `FOR NO KEY UPDATE` (la cita es lo PRIMERO que se bloquea);
  2. validez con el reloj del portal (`permiteActuarSobre`; defensa en profundidad);
  3. la petición de otra hora abierta, **sin bloqueo** (`SolicitudesOtraHoraService.abierta`);
  4. `accionesPermitidasPaciente` → 409 si la acción no está;
  5. la acción (`CitasService.confirmarComoPaciente` / `cancelarComoPaciente`,
     `SolicitudesOtraHoraService.pedir`) o, en el GET, la primera apertura
     (`EnlacesCitaService.registrarPrimeraApertura`, que toma el enlace DESPUÉS de la cita), y la vista.
     La vista lee `terminosPendientes` (`PacientesService.titularAceptoVigente`, sin bloqueo) en el GET
     y en los cuatro POST.
- **Aceptar los términos (US-11, ADR-16 §8)**: el mismo esqueleto **sin el paso 4** (no es una acción
  sobre la cita, no está en `accionesPermitidas`). Si el titular no tiene una aceptación propia de una
  versión que cubre, `PacientesService.registrarAceptacion` con canal `enlace_cita`, el id del enlace
  resuelto y `aceptadaEn` = el `ahora` del portal (inserta la fila y pone `consentimiento = true`). Orden
  de bloqueo: **cita → paciente** (el `UPDATE` de la bandera, al final). No toca la cita, la bitácora, el
  outbox ni la primera apertura; ningún hecho nuevo. El GET **nunca** registra una aceptación.
- **No descartar la petición al cancelar** dentro del tx: bloquearla después de la cita
  invertiría el orden de la bandeja (solicitud → cita). La descarta
  `SuscriptorSolicitudes` al recibir `CitaCancelada` (segundos después, DT-33).
- **Abrir la página nunca ejecuta una acción** (S3): el GET no cambia la cita ni su
  bitácora y no publica hechos. **Solo anota la primera apertura del enlace** (US-07.01, H5):
  `enlaces_cita.primera_apertura_en`, escrita una sola vez, solo con un enlace válido (después de
  `resolver` y de la validez, antes de armar la vista) y solo en el GET (los POST no la tocan). Con un
  enlace no válido se lanza el 404 antes y no se escribe nada: el 404 uniforme no cambia. La vista
  no suma campos ni cabeceras. Si el `UPDATE` falla, 500 genérico (solo con un token válido).
- **Nunca registrar el token ni su hash** (ni en logs ni en errores). La cabecera la
  redacta pino (`shared/infrastructure/observabilidad`).
- `accionesPermitidasPaciente` toma las guardas de estado de `Cita.accionesPermitidas(ahora)`
  (única fuente del grafo; desde US-07.01 recibe el mismo `ahora` del portal) y suma: nada si
  `ahora ≥ inicio`; sin `confirmar` ni `pedirOtraHora` con una petición abierta (R6). Lo que del
  grafo depende del reloj (asistencia e inasistencia, desde el inicio) el portal no lo usa.

## Dependencias permitidas

- `portal-paciente → cita` (`EnlacesCitaService`, `CitasService`, tipos de dominio).
- `portal-paciente → solicitud` (`SolicitudesOtraHoraService`, errores de dominio).
- `portal-paciente → paciente` (US-11): `PacientesService.titularAceptoVigente` y `registrarAceptacion`,
  `VersionTerminosNoVigenteError` y el decorador `@VersionTerminosVigente()`. `paciente` no importa
  ningún módulo de los de arriba (sin ciclo).
- Lectura de nombres con su PROPIO lector SQL sobre `usuarios` y `tenants`
  (`LectorNombresCita`): `UsuariosModule` no tiene búsqueda por id y así no se amplía
  su superficie. Solo lectura; si cambian esas columnas, cambia el lector.
- Nadie importa este módulo (solo `AppModule`); `cita`, `solicitud` y `paciente` no saben que existe.

## Tests

- Unitarios: `domain/acciones-paciente.spec.ts`, `application/portal-paciente.service.spec.ts`
  (casos de uso REALES de `cita` y `solicitud` sobre los dobles en memoria: 404 de seis
  formas en las cuatro acciones, 409, nada después de inicio, abrir no ejecuta nada,
  primera apertura —una vez, con el reloj del portal, después del bloqueo de la cita, nunca con
  un enlace no válido ni en los POST—, aislamiento, `terminosPendientes` y `aceptarTerminos` con
  `InMemoryAceptacionTerminosRepository`), `presentation/portal-paciente.controller.spec.ts` (metadatos, cuerpos
  fijos, DTOs), `infrastructure/persistence/sql-lector-nombres-cita.spec.ts`.
- Integración con Postgres: `integration/portal-paciente-concurrencia.integration.spec.ts`
  (transacciones abiertas en conexiones distintas: el paciente cancela mientras el
  profesional reagenda, en los dos órdenes; la bandeja acepta mientras el paciente cancela,
  sin interbloqueo; invalidar mientras el paciente actúa → el mismo 404; `asegurarActivo`
  concurrente → un enlace y el mismo token; `FOR NO KEY UPDATE` no espera al INSERT del
  enlace, con un caso de control con `FOR UPDATE`).
- e2e con Postgres: `test/portal-paciente.e2e-spec.ts` (flujos felices, bandeja,
  suscriptor, 404 uniforme, carrera real del 23505).
- Límite de tasa: `test/limite-tasa.e2e-spec.ts`, con el `PortalPacienteController`
  **REAL** (y los controllers reales de login, registro y solicitud pública) y
  `LIMITE_TASA_ACTIVO=true`: 30/min por IP (GET y POST juntos), 5/h por enlace sumando las
  tres acciones, cabeceras `no-store` / `no-referrer` en 200/201/400/404/409 (el 429 no las
  lleva: el guard corta antes del interceptor), preflight CORS con `X-Enlace-Cita`. El
  resto de las e2e corre con el límite apagado.
