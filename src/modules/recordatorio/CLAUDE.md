# Módulo: recordatorio

Recordatorios al paciente por correo (RF-06). Diseño completo en
`context/Decisions/ADR-13.md` (y el outbox/planificador en `ADR-12.md`); plan y
Definición de Terminado en `context/US/03-recordatorios.md`.

## Estructura

```
src/modules/recordatorio/
├── domain/                                   ← puro (ADR-02: ni @nestjs ni typeorm)
│   ├── recordatorio.entity.ts                ← Recordatorio, 6 estados, motivos y transiciones (§4)
│   ├── configuracion-recordatorio.entity.ts  ← 1 a 3 antelaciones, activo, contacto; predeterminada (§3)
│   ├── planificacion.ts / reconciliacion.ts  ← planificar, resolverTardios, reconciliar (§5, §6)
│   ├── horas-sin-envio.ts / periodos-conteo.ts / hash-correo.ts
│   ├── politicas-envio.ts                    ← las 9 políticas en orden (§7)
│   ├── reintentos-envio.ts                   ← calendario 1, 5, 15, 30, 60 min acotado por venceEn (§8)
│   ├── canal-mensajeria.ts                   ← puerto CanalMensajeria + 6 resultados + claveIdempotencia
│   ├── lector-citas.ts                       ← puerto de SOLO LECTURA sobre cita/paciente/usuario/tenant
│   └── *.repository.ts                       ← puertos (todos exigen tx)
├── application/
│   ├── suscriptor-recordatorios.ts           ← SuscriptorEventos del outbox (ADR-12 §4)
│   ├── reconciliar-recordatorios.service.ts  ← reconcilia UNA cita contra su estado actual
│   ├── reconciliacion-respaldo.service.ts    ← barrido horario de citas sin recordatorio
│   ├── enviar-recordatorios.service.ts       ← reclamo + políticas + envío, un tx por recordatorio
│   ├── plantilla-recordatorio.ts             ← asunto neutro, HTML escapado y texto; bloque accion? (Fase 3)
│   ├── procesar-webhook-entrega.service.ts   ← eventos de entrega monótonos + supresión
│   ├── tasa-fallo-recordatorios.service.ts   ← fallidos ÷ (entregados + fallidos) en 24 h
│   ├── configuracion-recordatorios.service.ts← GET/PUT configuración; publica el hecho
│   ├── consultar-recordatorios.service.ts    ← estado de los recordatorios de una cita
│   ├── bitacora-recordatorios.ts             ← puerto de logs con nombre estable (sin Nest)
│   └── avisos-por-periodo.ts                 ← "una vez por periodo y proceso" (cuota 80 %, agotada)
├── infrastructure/
│   ├── persistence/                          ← ORM, adaptadores SQL (SKIP LOCKED, ON CONFLICT parcial), SqlLectorCitas
│   ├── mensajeria/
│   │   ├── resend-canal-mensajeria.ts        ← SDK `resend`, Idempotency-Key, etiqueta, clasificación
│   │   ├── registro-canal-mensajeria.ts      ← no envía; constancia sin datos personales
│   │   ├── crear-canal-mensajeria.ts         ← binding por MENSAJERIA_ADAPTADOR
│   │   ├── verificador-webhook-resend.ts     ← firma Svix (`svix` 1.x) sobre el cuerpo crudo
│   │   └── eventos-resend.ts                 ← payload de Resend → evento de entrega
│   ├── observabilidad/bitacora-recordatorios-logger.ts
│   ├── config/opciones-recordatorios.ts      ← lee el entorno (con defaults para e2e parciales)
│   └── planificacion/planificador-recordatorios.ts ← jobs (envío, respaldo, tasa de fallo)
├── presentation/
│   ├── configuracion-recordatorios.controller.ts
│   ├── recordatorios-cita.controller.ts
│   ├── webhooks-resend.controller.ts
│   └── dto/
├── recordatorio.module.ts                    ← persistencia, casos de uso, controllers, suscriptor
└── recordatorio-planificacion.module.ts      ← SOLO los jobs (lo importa solo AppModule)
```

## Endpoints (prefijo global `/api`)

| Método | Ruta | Guard | Status | Respuesta |
|--------|------|-------|--------|-----------|
| GET | `/recordatorios/configuracion` | JWT | 200 | `ConfiguracionRecordatoriosDto` (la guardada o la predeterminada, `predeterminada: true`) |
| PUT | `/recordatorios/configuracion` | JWT | 200 / 400 | `ConfiguracionRecordatoriosDto`; publica `ConfiguracionRecordatorioActualizada` |
| GET | `/citas/:citaId/recordatorios` | JWT | 200 / 400 (no UUID) / 404 (otro tenant o no existe) | `RecordatorioCitaDto[]` (incluye cancelados) |
| POST | `/webhooks/resend` | firma Svix (público) | 200 `{ recibido: true }` / 400 uniforme | — |

- La configuración es SIEMPRE la del usuario del token (`userId`); nunca se
  recibe `tenantId`/`usuarioId` en el cuerpo (whitelist los descarta).
- `RecordatorioCitaDto` **no** trae destinatario, `proveedor`,
  `proveedorMensajeId`, `ultimoError` ni `intentos`.
- `citas/:citaId/recordatorios` vive AQUÍ, no en `cita` (que no sabe que este
  módulo existe). No choca con `GET /citas/:id` (un segmento menos).

## Flujo

1. Un caso de uso de cita publica un hecho (`CitaCreada`, `CitaReagendada`, …)
   en el outbox, en su transacción.
2. El despachador (ADR-12) lo entrega a `SuscriptorRecordatorios`, que
   **reconcilia** la cita: candado por cita → relee → `planificar` → anula lo
   que sobra → inserta lo que falta (`ON CONFLICT DO NOTHING`).
3. `PlanificadorRecordatorios` corre el **envío** cada
   `RECORDATORIO_INTERVALO_SEG`: reclama (`FOR UPDATE SKIP LOCKED`), relee,
   evalúa las 9 políticas y, si toca, genera la plantilla y llama a
   `CanalMensajeria` (tope 10 s, `Idempotency-Key = recordatorio/<id>`). La
   transacción queda abierta durante la llamada (deliberado, ADR-13 §7).
4. Resend avisa por webhook (`email.delivered`, `email.bounced`, …); el
   webhook actualiza la fila de forma monótona y suprime la dirección si hay
   rebote permanente, queja o supresión del proveedor.
5. Respaldo cada hora (minuto 15): reconcilia las citas vigentes de los
   próximos 8 días sin ningún recordatorio. Tasa de fallo cada 15 min.

Resultado del proveedor → efecto: `aceptado` → `enviado` · `transitorio` →
reintento (1, 5, 15, 30, 60 min, acotado por `venceEn`; agotado → `fallido`
`vencido`) · `cuota_agotada` → se pospone al reinicio UTC o `fallido`
`cuota_agotada`, corta el lote y el proceso deja de llamar hasta el reinicio ·
`permanente` → `fallido` (`correo_invalido`/`rechazado`) · `configuracion` →
no toca la fila, corta el lote, alerta e `informarFallo` · `posible_duplicado`
→ `enviado` sin id.

## Reglas locales

- **`tx` obligatorio en todos los puertos**, también para leer: las rutas GET
  abren una con `TransactionRunner.run`. Los adaptadores lanzan sin `tx`.
- **BARRIDOS GLOBALES** (sin filtro de tenant, ADR-12 §6): reclamar,
  contar (cuota, desenlaces), el respaldo y el webhook. Solo los usan los jobs
  y el webhook; NUNCA una ruta autenticada. Tras tomar una fila, todo usa SU
  `tenantId`.
- **Solo lectura sobre otros módulos:** `LectorCitas` (SQL) lee `citas`,
  `pacientes`, `usuarios`, `tenants`; nunca escribe ni importa sus módulos.
  Ningún módulo importa `RecordatorioModule`.
- **Configuración del DUEÑO de la cita** (`cita.usuarioId`), nunca el
  `usuarioId` del payload del hecho (es quien hizo la petición).
- **Privacidad (ADR-13 §12):** logs solo con ids, estados, motivos y códigos
  (`BitacoraRecordatorios`); nunca destinatario, cuerpo, teléfono ni nombres.
  `codigo` de proveedor = nombre del error, nunca su mensaje. Supresiones por
  HASH (`calcularHashCorreo`). Asunto neutro; el cuerpo no lleva datos del
  paciente ni tipo de consulta; todo dato interpolado se escapa.
- **Latido `recordatorios`:** lo da el job de envío (cada minuto). El respaldo
  solo `informarFallo` si falla; no late al terminar bien, para no "resolver"
  en falso un envío caído.
- **Jobs solo en `RecordatorioPlanificacionModule`**, registrados a mano en
  `SchedulerRegistry` y nada si `PLANIFICADOR_ACTIVO=false` (las e2e los
  invocan a mano: `ejecutarEnvio()`, `ejecutarRespaldo()`, `ejecutarTasaFallo()`).
- `main.ts` crea la app con `rawBody: true`: el webhook verifica la firma
  sobre `req.rawBody`. En e2e: `createNestApplication({ rawBody: true })`.
- `svix` está fijado en **1.x** a propósito: la 2.x es solo ESM y Jest (CJS) no
  la carga.
- Si cambian estados o motivos: migración nueva para los CHECK
  (`database-agent`).

## Variables de entorno (ADR-13 §18; validadas en `shared/infrastructure/config/entorno.ts`)

| Variable | Defecto | Notas |
|---|---|---|
| `MENSAJERIA_ADAPTADOR` | `registro` | **Obligatoria en producción** (sin default) |
| `RESEND_API_KEY` / `RESEND_WEBHOOK_SECRET` | — | obligatorias con `resend`; el secreto empieza con `whsec_` |
| `CORREO_DOMINIO` / `CORREO_REMITENTE` | — / `Citia <onboarding@resend.dev>` | remitente derivado del dominio si no se define |
| `RESEND_CUOTA_DIARIA` / `_MENSUAL` / `CUOTA_UMBRAL_AVISO` | 100 / 3000 / 0.8 | contador local (día y mes UTC) |
| `RECORDATORIO_ANTELACIONES_MIN` | `1440,120` | configuración predeterminada |
| `RECORDATORIO_SILENCIO_DESDE` / `HASTA` | `21:00` / `08:00` | zona `APP_TZ` |
| `RECORDATORIO_MARGEN_MINIMO_MIN` / `_ANTELACION_MINIMA_TARDIA_MIN` | 30 / 60 | |
| `RECORDATORIO_MAX_INTENTOS` | 5 | reintentos tras errores transitorios (5 = calendario completo) |
| `RECORDATORIO_LOTE` / `_INTERVALO_SEG` | 20 / 60 | job de envío |
| `RECORDATORIO_MAX_DIARIO_POR_TENANT` | 40 | fusible, día de la clínica |
| `RECORDATORIO_EXIGIR_CONSENTIMIENTO` | `false` | DT-16 |
| `RECORDATORIO_UMBRAL_TASA_FALLO` / `_MUESTRA_MIN` | 0.05 / 20 | alerta de tasa de fallo |
| `BETTERSTACK_HEARTBEAT_RECORDATORIOS_URL` | — | latido del envío |

## Tests

- Unitarios junto a cada archivo; dobles en `test/support/recordatorios-en-memoria.ts`
  (puertos) y `test/support/mensajeria-falsa.ts` (`CanalMensajeriaFalso`, `BitacoraEnMemoria`).
- Adaptador de Resend: respuestas grabadas con `fetch` simulado y el SDK real.
- e2e: `test/recordatorios-http.e2e-spec.ts` (sin BD, contrato HTTP) y
  `test/recordatorios-flujo.e2e-spec.ts` (Postgres, jobs a mano).
