# Índice de Features

Cada feature documenta una funcionalidad implementada: qué hace, su arquitectura hexagonal,
endpoints, esquema de BD, decisiones y pendientes. Alineadas con los commits (ver
[`../TRAZABILIDAD.md`](../TRAZABILIDAD.md)). Para leerlas junto con sus ADRs, deudas y commits, entra
por su fase en [`../Fases/`](../Fases/README.md).

*(Estados actualizados el 2026-10-07; la Fase 3, el 2026-10-18, tras su release del 2026-10-17; la Fase 7, el
2026-11-01, tras su release de ese día.)*

## Implementadas

| Feature | US / Tipo | Estado | Fase | ADRs | Commits clave |
|---------|-----------|--------|------|------|---------------|
| [us00a-registro-inicial](us00a-registro-inicial.md) | US-00a (signup) | ✅ Implementado + atomicidad | [Fundaciones](../Fases/fase-base-fundaciones.md) | 00,01,02,03,**06** | `ce7d99e`,`718fe1f`,`2ee856f`,`d4fa476` |
| [us00b-login](us00b-login.md) | US-00b (login JWT) | ✅ Implementado · `tenantSlug` en la respuesta desde 2026-09-28 · `tenantNombre` desde 2026-10-05 (`173d6b6`) | [Fundaciones](../Fases/fase-base-fundaciones.md) | 01,02,03 | `45198c3`,`c911bce`,`7635645` |
| [infra-contenedores](infra-contenedores.md) | Infra (Docker + tooling) | ✅ Implementado + seed demo · Fase 2 (en producción desde 2026-10-06): pino, health, latidos, validación de entorno, CORS por lista, planificador · Fase 3 (en producción desde 2026-10-17): límite de tasa, `trust proxy`, `ENLACE_CITA_CLAVE` (`c757e0e`) | [Fundaciones](../Fases/fase-base-fundaciones.md) | **05** | `b8cac2a`,`df53128`,`0e54f0b`,`f200557`,`a6b0a63` |
| [us06-dashboard-citas](us06-dashboard-citas.md) | US-06 (dashboard) | ✅ Cerrada (2026-09-28): conectada al front y probada contra Postgres · el frontend quitó el mock de métricas (2026-10-05) | [Fase 0](../Fases/fase-0-us06-dashboard.md) | 04,**07**,01,02 | `e592d74`,`9ab2bec`,`08dad63` |
| [us02-gestion-citas](us02-gestion-citas.md) | US-02 (gestión de citas) | ✅ Cerrada (2026-09-28): release 1, vía pública, voucher, agenda, bandeja y solapamiento · US-02.07 ⏸, absorbida por US-04 (ver [us04](us04-respuesta-paciente.md)) | [Fase 1](../Fases/fase-1-us02-gestion-citas.md) | **09**,**11**,04,08,06,02 · 10 (aceptado; lo implementa us04) | `f2a7dff`,`e1253c3`,`2877b13`,`9140bc3`,`e06862a` |
| [us03-recordatorios](us03-recordatorios.md) | US-03 (recordatorios por correo) + outbox, planificador y observabilidad | ✅ **En producción** (release 2026-10-06) · verificada con un correo real (2026-10-07) · [§ En producción](us03-recordatorios.md#en-producción-2026-10-07) | [Fase 2](../Fases/fase-2-us03-recordatorios.md) | **12**,**13**,02 (nota),04,06,07,09 | `f95b637`,`a37f175`,`f2d80aa`,`a13d80a`,`f719c66`,`a938f9d` |
| [us04-respuesta-paciente](us04-respuesta-paciente.md) | US-04 (+ US-02.07) · RF-07: el paciente confirma, cancela o pide otra hora desde el enlace del recordatorio + límite de tasa | ✅ **En producción** (release 2026-10-17) · [desviaciones del contrato](us04-respuesta-paciente.md#desviaciones-del-contrato-y-decisiones-tomadas-al-implementar) | [Fase 3](../Fases/fase-3-us04-respuesta-paciente.md) | **10**,13 (nota),12,09,04,06,02 | `c757e0e`,`4d3d88f`,`92b8020`,`143c8fb` (merge `ce0c533`) |
| [us10-perfil-cuenta](us10-perfil-cuenta.md) | US-10 · RF-04: perfil editable, cambio de contraseña con corte de las demás sesiones, suscripción en lectura (solo el administrador) y mensajes a soporte con su propio envío | ✅ **En producción** (release 2026-11-01) · cierre pendiente de las pruebas manuales y de Q18/Q19 · sin `SOPORTE_CORREO_DESTINO` en production: los mensajes esperan en `pendiente` · [desviaciones del contrato](us10-perfil-cuenta.md#desviaciones-del-contrato) | [Fase 7](../Fases/fase-7-us10-perfil.md) | **15**,01 (extendido),12,13,03,06,02 | `a2058aa`,`35aec28`,`fcfeac3`,`c090105` (release `cd659c1`) |
| [registrar-usuario](registrar-usuario.md) | ⛔ DESUSO | Superseded por us00a | [Fundaciones](../Fases/fase-base-fundaciones.md) (histórico) | — | (histórico) |

## Diseñadas, sin implementar

No tienen documento de feature todavía: se crea al construirlas. Mientras tanto, su punto de entrada
es la fase.

Ninguna por ahora. *(La única que había, la respuesta del paciente de la Fase 3, pasó a
[us04-respuesta-paciente](us04-respuesta-paciente.md) el 2026-10-15.)*

## Notas

- **`registrar-usuario.md`** se conserva solo como puntero histórico (diseño antiguo en inglés que
  ya no existe en el código). No usar como referencia.
- **`us03-recordatorios.md`** (2026-10-04) pasó de *Diseñadas* a *Implementadas*: describe el código de
  la rama `feature/fase2-recordatorios`, en `develop` desde el 2026-10-04 y en producción desde el
  2026-10-06; su sección *En producción* (2026-10-07) dice cómo está configurada en cada entorno. Cubre también la
  infraestructura transversal que estrenó (outbox, planificador, observabilidad); `infra-contenedores`
  solo resume esa parte y enlaza aquí.
- **`us04-respuesta-paciente.md`** (2026-10-15) describe el código de la rama
  `feature/fase3-respuesta-paciente`, en `develop` desde el 2026-10-15 (PR #6) y **en producción desde el
  2026-10-17** (release `05bae58`). Cubre
  también lo que la fase cambió en features existentes —el actor en los hechos de cita, `confirmadaPor` /
  `canceladaPor` en el voucher, la bandeja con peticiones de otra hora y el límite de tasa del login, el
  registro y la solicitud pública—: `us02`, `us00a` y `us00b` no se reescribieron; esos cambios se leen
  aquí.
- **`us10-perfil-cuenta.md`** (2026-11-01) describe el código de la rama `feature/fase7-perfil-cuenta`, que llegó a
  `develop` por fast-forward, sin PR, y está **en producción desde el 2026-11-01** (release `cd659c1`, PR #15). Se creó
  después del release, con los hashes. Cubre también lo que la fase cambió en `auth` (la estrategia JWT consulta el
  corte de sesiones en cada petición, `FirmaJwtModule`) y en `tenant`: `us00a` y `us00b` no se reescribieron.
- **US-07.01** (Fase 5, en producción desde el 2026-10-20) todavía **no tiene feature**: se crea al cerrarla. Mientras
  tanto, lo construido está en [ADR-14](../Decisions/ADR-14.md) y en su plan
  [US-07.01](../US/07.01-registro-hechos.md).
- Las features de US futuras (RF-01/02/04/05/08) aún no tienen doc porque no están
  implementadas ni diseñadas. Su estado vive en el [ROADMAP](../ROADMAP.md) y en
  [`../Fases/`](../Fases/README.md).
- **`us02-gestion-citas.md`** cubre las dos vías de entrada (el botón del profesional y el enlace
  público del paciente) porque comparten el mismo agregado y el mismo resolver-o-crear por RUT.
  Separarlas habría duplicado la mitad del documento. Varias secciones conservan el estado del
  2026-09-25 ("sin implementar"); la nota de su cabecera explica cuál es el vigente.
