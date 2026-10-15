# Índice de Deudas Técnicas

Registro de lo que el sistema **no** hace y debería, o hace de forma provisional. Cada deuda nace de
un párrafo concreto de un ADR o de una feature y enlaza de vuelta a él; los ADRs y features enlazan
hacia aquí. Regla del proyecto: **una deuda conocida y escrita no es deuda oculta** — lo que no puede
pasar es que una limitación viva solo en la cabeza de alguien.

**Estados:** `abierta` (existe hoy en el código) · ⚪ `prevista` (**todavía no existe**: se contrae al
implementar un ADR ya decidido) · 🟢 `resuelta en diseño` (hay ADR que la cierra, falta implementar)
· 🔵 `aplazada` (decisión consciente de no hacerla todavía) · `cerrada`.

> **`prevista` es el estado más útil de esta lista.** Distingue la deuda que ya se tiene de la que se
> está **firmando a sabiendas** al aprobar un diseño. Anotarla antes de contraerla es lo que impide
> que dentro de seis meses parezca un descuido en vez de una elección.

---

## Por severidad

| ID | Deuda | Severidad | Estado | Origen |
|----|-------|-----------|--------|--------|
| [DT-30](DT-30.md) | La asistencia real de las citas pasadas no se registra y no se puede reconstruir | 🟡 baja (era 🔴) | 🟢 mitigada (2026-10-05): botones de asistencia en el voucher | decisión de producto · [ADR-04 §2](../Decisions/ADR-04.md) |
| [DT-01](DT-01.md) | Sin renovación ni revocación de sesión | 🔴 alta | abierta | [ADR-01](../Decisions/ADR-01.md) |
| [DT-03](DT-03.md) | Sin verificación de correo ni recuperación de contraseña | 🔴 alta | abierta | [us00a](../Features/us00a-registro-inicial.md) |
| [DT-06](DT-06.md) | Registro público sin ningún freno | 🔴 alta | abierta | [us00a](../Features/us00a-registro-inicial.md) |
| [DT-15](DT-15.md) | No se puede buscar un paciente | 🔴 alta | abierta · neutralizada para crear cita por el RUT (ver nota) | [us06](../Features/us06-dashboard-citas.md) |
| [DT-02](DT-02.md) | El rol se emite y nadie lo verifica | 🟠 media→alta | abierta | [ADR-01 §4](../Decisions/ADR-01.md) |
| [DT-07](DT-07.md) | No existe alta de un segundo usuario | 🟠 media | abierta | [us00a](../Features/us00a-registro-inicial.md) |
| [DT-35](DT-35.md) | El correo del paciente no se verifica | 🟠 media | abierta (contraída en la Fase 2, 2026-10-03) | [ADR-13 §14](../Decisions/ADR-13.md) |
| [DT-36](DT-36.md) | Una sola cuota de correo para toda la plataforma | 🟠 media | abierta (contraída en la Fase 2, 2026-10-03) | [ADR-13 §11](../Decisions/ADR-13.md) |
| [DT-40](DT-40.md) | Con `MENSAJERIA_ADAPTADOR=registro` los recordatorios quedan "Enviado" sin haberse enviado | 🟠 media | abierta (detectada en producción, 2026-10-07) · la variable ya está en `resend` | puesta en producción · [ADR-13 §13](../Decisions/ADR-13.md) |
| [DT-12](DT-12.md) | Solapamiento de citas no detectado | 🟠 media | 🟢 resuelta en diseño ([ADR-11](../Decisions/ADR-11.md)) · **implementada** en `develop` (2026-09-28): cumple su criterio de cierre, falta confirmarlo | [us06](../Features/us06-dashboard-citas.md) |
| [DT-14](DT-14.md) | El instante de la cita se acepta sin zona horaria | 🟠 media | abierta | [ADR-07](../Decisions/ADR-07.md) |
| [DT-19](DT-19.md) | Sin observabilidad | 🟠 media (era 🔴) | 🟢 **verificada en producción** (2026-10-07): uptime y heartbeats en Up · abierta solo por la fuente de logs (sin ella, las alertas por log no llegan) y la prueba de alerta forzada | RNF-08 |
| [DT-20](DT-20.md) | Las pruebas e2e nunca se han ejecutado | 🟠 media | abierta · avance: suites con BD en verde (2026-09-28; 2026-10-04: 212 e2e y 80 de integración) y concurrencia `SKIP LOCKED` automatizada; sin pipeline | [us06](../Features/us06-dashboard-citas.md) |
| [DT-04](DT-04.md) | Login sin límite de intentos | 🟠 media | abierta | [us00b](../Features/us00b-login.md) |
| [DT-16](DT-16.md) | El consentimiento se captura y nadie lo lee | 🔴 alta (RF-06 en el MVP) | 🟠 **riesgo aceptado** (2026-09-30) · política implementada y **apagada** (2026-10-03) · revisar antes del 2026-12-01 (Ley 21.719) | [us06](../Features/us06-dashboard-citas.md) |
| [DT-13](DT-13.md) | Se aceptan citas en el pasado | 🟡 baja→media | abierta | [us06](../Features/us06-dashboard-citas.md) |
| [DT-05](DT-05.md) | La respuesta de login no es uniforme en el tiempo | 🟡 baja | abierta | [ADR-03 §5](../Decisions/ADR-03.md) |
| [DT-08](DT-08.md) | Colisión de identificador público bajo concurrencia | 🟡 baja | abierta | [ADR-03 §2](../Decisions/ADR-03.md) |
| [DT-09](DT-09.md) | Comprobación de correo duplicado inalcanzable | 🟡 baja | abierta | [us00a](../Features/us00a-registro-inicial.md) |
| [DT-18](DT-18.md) | No existe límite de tasa en ninguna superficie | 🟠 riesgo asumido | **aceptada sin límite por ahora** (2026-09-29) | transversal |
| [DT-11](DT-11.md) | El historial de comportamiento no se está acumulando | 🟠 media (antes crítica) | 🔵 aplazada (2026-09-30, scoring a la v2) · mecanismo en [ADR-12](../Decisions/ADR-12.md) | [ADR-04 §4](../Decisions/ADR-04.md) |
| [DT-17](DT-17.md) | Zona horaria única para toda la instalación | 🟡 baja | 🔵 aplazada | [ADR-07 §2](../Decisions/ADR-07.md) |
| [DT-29](DT-29.md) | Funcionalidad implementada y no conectada (7 de 24 rutas sin consumidor) | 🟡 baja | abierta (mitigada) · las rutas de la Fase 2 nacieron consumidas | release 1 de US-02 |
| [DT-31](DT-31.md) | Imports que cruzan capas por debajo del check de ADR-02 | 🟡 baja | abierta (detectada el 2026-10-04) | [ADR-02 §2](../Decisions/ADR-02.md) |
| [DT-32](DT-32.md) | Sin orden garantizado entre los hechos de un mismo agregado | 🟡 baja | abierta (contraída en la Fase 2) | [ADR-12 §4](../Decisions/ADR-12.md) |
| [DT-33](DT-33.md) | Latencia de segundos entre el cambio y el suscriptor | 🟡 baja → media con RF-05 | abierta (contraída en la Fase 2) | [ADR-12](../Decisions/ADR-12.md) |
| [DT-34](DT-34.md) | La carta muerta del outbox no tiene herramienta | 🟡 baja | abierta (contraída en la Fase 2) | [ADR-12 §3](../Decisions/ADR-12.md) |
| [DT-37](DT-37.md) | Un recordatorio `enviado` puede no llegar nunca a `entregado` | 🟡 baja | abierta (contraída en la Fase 2) · webhook activo en producción desde el 2026-10-07; falta la medición de los `enviado` viejos | [ADR-13 §9–§10](../Decisions/ADR-13.md) |
| [DT-38](DT-38.md) | Carrera con un reagendamiento en el mismo segundo del envío | 🟡 baja | abierta · riesgo aceptado (contraída en la Fase 2) | [ADR-13 §7](../Decisions/ADR-13.md) |
| [DT-39](DT-39.md) | No hay herramienta para quitar una dirección suprimida | 🟡 baja | abierta (contraída en la Fase 2) | [ADR-13 §2](../Decisions/ADR-13.md) |
| [DT-41](DT-41.md) | El subdominio de envío no tiene DMARC y la autenticación del correo no se inspeccionó | 🟡 baja | abierta (detectada en producción, 2026-10-07) | puesta en producción · [ADR-13 §12–§13](../Decisions/ADR-13.md) |

## Cerradas o mitigadas

| ID | Deuda | Resultado |
|----|-------|-----------|
| [DT-10](DT-10.md) | La máquina de estados es inalcanzable | release 1 · 2026-08-23 |
| [DT-22](DT-22.md) | Sin vínculo entre citas reagendadas | release 1 · 2026-08-23 |
| [DT-28](DT-28.md) | Una solicitud sin revisar bloquea al paciente | 🟢 mitigada con una ventana de tiempo · 2026-08-24 |
| [DT-27](DT-27.md) | Los hechos se publican fuera de la transacción | ✅ cerrada por el outbox de ADR-12 · `f95b637` · 2026-10-03 · en producción desde el 2026-10-06 (`c057ade`) |
| [DT-21](DT-21.md) | Carpetas vacías con nombres mal escritos | ✅ cerrada · `recordatorio/` rehecho (`f2d80aa`) y carpetas de `paciente/` borradas (`a37f175`) · 2026-10-03 · en producción desde el 2026-10-06 |
| [DT-30](DT-30.md) | La asistencia real de las citas pasadas no se registra | 🟢 mitigada (2026-10-05): Confirmar, Asistió y No asistió en el voucher (frontend); lo anterior a esa fecha no se reconstruye |

## Previstas — se contraen al implementar la vía pública de [ADR-09](../Decisions/ADR-09.md)

> **Nota (2026-09-30).** La vía pública está implementada desde el 2026-09-10 (`e1253c3`) y la bandeja
> desde el 2026-09-28, así que, según la definición de `prevista` de arriba, **DT-23, DT-25 y DT-26 ya
> están contraídas** (existen hoy en el código). Su estado no se cambió en esta pasada de navegación:
> queda para confirmarlo y pasarlas a `abierta`. Guía de la fase: [Fase 1](../Fases/fase-1-us02-gestion-citas.md).

| ID | Deuda | Severidad | Estado | Origen |
|----|-------|-----------|--------|--------|
| [DT-23](DT-23.md) | Nada verifica que el RUT pertenezca a quien lo escribe | 🟠 media | ⚪ prevista | [ADR-09 §3, §8](../Decisions/ADR-09.md) |
| [DT-25](DT-25.md) | La apuesta del formulario no se puede medir | 🟠 media | ⚪ prevista | [ADR-09 §10](../Decisions/ADR-09.md) |
| [DT-26](DT-26.md) | Sin política de retención para las solicitudes | 🟠 media | ⚪ prevista | [ADR-09 §1, §10](../Decisions/ADR-09.md) |
| [DT-24](DT-24.md) | Sin taxonomía de tipos de consulta | 🟡 baja | 🔵 aplazada | [ADR-09 §10](../Decisions/ADR-09.md) |

## Contraídas al implementar la Fase 2 ([ADR-12](../Decisions/ADR-12.md) y [ADR-13](../Decisions/ADR-13.md))

*(2026-10-04; en producción desde el 2026-10-06.)* Las ocho deudas que los dos ADR dejaban **previstas**
existen desde que se implementó la fase (rama `feature/fase2-recordatorios`, mergeada a `develop` el
2026-10-04), así que se ficharon con número y pasan a `abierta`. Están también en la tabla *Por
severidad* de arriba.

| ID | Deuda | Severidad | Prevista n.º |
|----|-------|-----------|--------------|
| [DT-35](DT-35.md) | El correo del paciente no se verifica | 🟠 media | ADR-13 · 1 |
| [DT-36](DT-36.md) | Una sola cuota de correo para toda la plataforma | 🟠 media | ADR-13 · 2 |
| [DT-37](DT-37.md) | Un `enviado` puede no llegar nunca a `entregado` | 🟡 baja (media sin webhook) | ADR-13 · 3 |
| [DT-38](DT-38.md) | Carrera con un reagendamiento en el mismo segundo del envío | 🟡 baja | ADR-13 · 4 |
| [DT-39](DT-39.md) | No hay herramienta para quitar una dirección suprimida | 🟡 baja | ADR-13 · 5 |
| [DT-32](DT-32.md) | Sin orden garantizado entre los hechos de un mismo agregado | 🟡 baja | ADR-12 · 1 |
| [DT-33](DT-33.md) | Latencia de segundos entre el cambio y el suscriptor | 🟡 baja → media con RF-05 | ADR-12 · 2 |
| [DT-34](DT-34.md) | La carta muerta del outbox no tiene herramienta | 🟡 baja | ADR-12 · 3 |

Además, **detectada al implementar** (no estaba prevista): [DT-31](DT-31.md), los imports que cruzan
capas en los módulos anteriores y que el check de ADR-02 no veía.

## Detectadas al poner en producción la Fase 2 (2026-10-07)

*(2026-10-07.)* La puesta en producción y la prueba de punta a punta dejaron dos deudas nuevas y
cambiaron el estado de otras dos. Detalle en el
[cierre de la Fase 2](../Fases/fase-2-us03-recordatorios.md#cierre-de-la-fase-2026-10-07).

| ID | Qué | Severidad | Cambio |
|----|-----|-----------|--------|
| [DT-40](DT-40.md) | `registro` marca "Enviado" sin enviar; production arrancó con la variable copiada de staging | 🟠 media | **nueva** |
| [DT-41](DT-41.md) | Sin DMARC en `notificaciones.citiahealth.cl`; cabeceras SPF/DKIM/DMARC sin inspeccionar | 🟡 baja | **nueva** |
| [DT-19](DT-19.md) | Observabilidad | 🟠 media (era 🔴) | verificada en producción; abierta por la fuente de logs y la prueba de alerta forzada |
| [DT-37](DT-37.md) | `enviado` que no llega a `entregado` | 🟡 baja | el webhook ya existe y funciona en producción |

> **DT-18 tenía un disparador de entorno** (el primer despliegue accesible), que ya se cumplió. El
> 2026-09-29 se decidió seguir **sin límite de tasa por el momento**: ya no bloquea el despliegue y
> pasa a ser un riesgo aceptado, que hay que revisar antes de difundir el enlace de forma masiva o
> al entrar el primer cliente real.

> **`→` en la severidad** significa que la deuda escala sola cuando entre cierto requisito. DT-02
> escala con DT-07; DT-13 escala cuando exista el proceso de cierre de DT-11. **DT-16, DT-19 y DT-27
> ya escalaron** (2026-09-30): RF-06 entró en el MVP, así que su severidad se muestra ya alta.

---

## Por origen

| Origen | Deudas |
|--------|--------|
| [ADR-01](../Decisions/ADR-01.md) — auth JWT | DT-01, DT-02 |
| [ADR-02](../Decisions/ADR-02.md) — español + hexagonal | DT-31 (lo que el check automático no ve) |
| [ADR-03](../Decisions/ADR-03.md) — login por slug | DT-05, DT-08 |
| [ADR-04](../Decisions/ADR-04.md) — modelo de Cita | DT-10 ✅ cerrada, DT-11, DT-22 ✅ cerrada, DT-30 (el grafo solo marca asistencia desde `confirmada`) |
| [ADR-07](../Decisions/ADR-07.md) — zona de la clínica | DT-14, DT-17 |
| [ADR-09](../Decisions/ADR-09.md) — gestión de citas | *cierra* DT-10 y DT-22 · *contrae* DT-23, DT-24, DT-25, DT-26, DT-27, DT-28 · *depende de* DT-15 y DT-18 · *deja abierta* DT-12 |
| [ADR-11](../Decisions/ADR-11.md) — solapamiento | *cierra en diseño* DT-12 |
| [ADR-12](../Decisions/ADR-12.md) — outbox + planificador | *cierra* DT-27 ✅ (2026-10-03) · *contrae* DT-32, DT-33, DT-34 · *avanza* DT-19 · *aplaza* DT-11 (mecanismo decidido) |
| [ADR-13](../Decisions/ADR-13.md) — recordatorios | *cierra* DT-21 ✅ (2026-10-03) · *contrae* DT-35, DT-36, DT-37, DT-38, DT-39 · *avanza* DT-19 (verificada en producción; falta la fuente de logs) · *acepta como riesgo* DT-16 (política apagada) · *toca* DT-17, DT-23, DT-26, DT-29, DT-30 |
| Decisión de producto 2026-09-30 (scoring a la v2, sin botones de asistencia) | DT-30 (mitigada el 2026-10-05 al revertir la decisión) |
| Puesta en producción de la Fase 2 (2026-10-07) | DT-40 (`registro` en producción), DT-41 (DMARC) |
| [us00a](../Features/us00a-registro-inicial.md) — registro | DT-03, DT-06, DT-07, DT-09 |
| [us00b](../Features/us00b-login.md) — login | DT-03, DT-04 |
| [us06](../Features/us06-dashboard-citas.md) — dashboard | DT-12, DT-13, DT-15, DT-16, DT-20 |
| Transversal / RNF | DT-18, DT-19, DT-21 |
| Integración front ↔ back | DT-29 (ver también `citia-frontend/context/Deudas/`) |

---

## Por fase del roadmap

*(2026-09-30; Fase 2 actualizada el 2026-10-04 y el 2026-10-07.)* Qué deudas creó, cerró o movió cada fase. El detalle y el orden de lectura están en
la guía de cada una, en [`../Fases/`](../Fases/README.md).

| Fase | Creadas (origen) | Cerradas o mitigadas | Afectadas |
|---|---|---|---|
| [Fundaciones](../Fases/fase-base-fundaciones.md) | DT-01…DT-09, DT-18, DT-19, DT-21 | — | — |
| [Fase 0 — US-06](../Fases/fase-0-us06-dashboard.md) | DT-10…DT-17, DT-20, DT-22 | — | — |
| [Fase 1 — US-02](../Fases/fase-1-us02-gestion-citas.md) | DT-23…DT-29 | cierra DT-10 y DT-22 · mitiga DT-28 | DT-12 (implementada), DT-14, DT-15, DT-18 (aceptada), DT-20 (avance) |
| [Fase 2 — US-03](../Fases/fase-2-us03-recordatorios.md) | DT-30 (diseño) · DT-31 (detectada) · DT-32…DT-39 (las previstas, contraídas al implementar) · DT-40, DT-41 (detectadas en producción, 2026-10-07) | **cierra** DT-21 y DT-27 (2026-10-03) · **mitiga** DT-30 (2026-10-05) · DT-19 verificada en producción, abierta por la fuente de logs | DT-11 (aplazada), DT-16 (política apagada), DT-17, DT-20 (avance), DT-23, DT-26, DT-29, DT-37 (webhook activo) |
| [Fase 3 — US-04](../Fases/fase-3-us04-respuesta-paciente.md) | 4 previstas de ADR-10, sin número | — | DT-30 (ya mitigada el 2026-10-05; la confirmación del paciente reduce las `pendiente` vencidas) · DT-11, DT-16, DT-18, DT-23, DT-26 |
| [Fase 4 — US-05](../Fases/fase-4-us05-alertas.md) | — | — | DT-28 (aviso al profesional) |
| [Fase 5 — US-07](../Fases/fase-5-us07-scoring.md) | — | — | DT-11 se cierra aquí · depende de DT-30 (que se cierra en la Fase 3) · DT-13, DT-23 |

> Las deudas de Fundaciones y de la Fase 0 se **ficharon** el 2026-08-24 (`f2a7dff`), cuando se creó
> este registro; su origen es anterior.

---

## Lo que hay que mirar primero

**DT-30 es distinta a todas las demás** (desde el 2026-09-30). Es la única cuyo coste **crece solo con
el tiempo**: si nadie marca si el paciente llegó o no llegó, ese dato se pierde para siempre. Hasta
esa fecha la propiedad era de [DT-11](DT-11.md); al separar las dos cosas quedó claro que el
`ghosting` **sí** se puede reconstruir después (con una fecha de corte), y la asistencia real **no**.
El usuario decidió el 2026-09-30 **esperar a la Fase 3** (cuando el paciente confirme desde el
enlace) sin tocar el grafo de ADR-04: hasta entonces la asistencia real no se registra. **El 2026-10-05
lo revirtió:** el voucher ya ofrece Confirmar, Asistió y No asistió, y DT-30 queda mitigada; lo que no
vuelve es la asistencia de las citas anteriores a esa fecha.

**Fase 2 (recordatorios, 2026-09-30): tres deudas pasan a ser parte de su alcance**, no extras:
[DT-27](DT-27.md) (outbox, **antes** del primer suscriptor), [DT-19](DT-19.md) (sin observabilidad
RNF-03 es inverificable) y [DT-21](DT-21.md) (el módulo se rehace). Y una queda como riesgo aceptado
con fecha: [DT-16](DT-16.md), a revisar antes de que entre en vigor la Ley 21.719 (prevista para el
2026-12-01).

> **Actualizado 2026-10-04 (implementación en la rama `feature/fase2-recordatorios`, PR #1 pendiente
> de merge):** DT-27 y DT-21 **cerradas**; DT-19 implementada y abierta solo hasta probar en Better Stack
> que el latido y una alerta llegan; DT-16 con su política implementada y apagada. Antes de escribir a
> pacientes reales conviene mirar dos de las nuevas: [DT-37](DT-37.md) (sin el webhook creado, la tasa
> de fallo no ve los rebotes) y [DT-35](DT-35.md) (un correo mal tipeado llega a un tercero).

> **Actualizado 2026-10-07 (Fase 2 cerrada en producción):** DT-19 verificada en producción, abierta
> solo por la fuente de logs: sin ella, la alerta de tasa de fallo (RNF-03) y las de cuota quedan en los
> logs de Railway y **no le llegan a nadie**. DT-37 ya tiene webhook. Dos nuevas de la puesta en
> producción: [DT-40](DT-40.md) (`registro` marca "Enviado" sin enviar; es la que más conviene cerrar,
> porque el error se repite con solo copiar variables entre entornos) y [DT-41](DT-41.md) (DMARC).

**Cuatro deudas se resuelven en el mismo release que US-02** y conviene tratarlas como parte de su
alcance, no como extras: DT-10 y DT-22 las cierra ADR-09; DT-15 la bloquea; DT-14 se agrava con
reagendar.

**Tres deudas están encadenadas y hay que atacarlas en orden:** DT-10 (exponer transiciones) → DT-11
(proceso de cierre) → RF-08. *(Desde el 2026-09-30 el tramo DT-11 → RF-08 queda para la v2, y
[DT-30](DT-30.md) se suma a la cadena: sin asistencia registrada, RF-08 no tiene con qué calcular.)* Y por separado: DT-07 (segundo usuario) obliga a DT-02 (autorización) en
el mismo release.

**Estado tras el release 1 (2026-08-23):** DT-10 y DT-22 **cerradas**; DT-27 pasó de prevista a
real. Las otras cinco previstas siguen sin contraerse porque dependen de la vía pública.

> **Lo que el release 1 destrabó:** ahora una cita puede llegar a `confirmada`, así que el job de
> [DT-11](DT-11.md) por fin tendría algo que distinguir. ~~El reloj sigue corriendo hasta que ese job
> exista.~~ **Actualizado 2026-09-30:** el job se aplaza con el scoring; el reloj que sí corre es el de
> [DT-30](DT-30.md) (la asistencia real), y en la v1 nadie puede confirmar una cita desde la interfaz;
> sus botones esperan a la Fase 3.

**ADR-09 cerró dos deudas y contrae seis.** Es un balance sano —las que cierra son de severidad alta
y las que contrae son medias o menos— pero conviene mirarlas antes de implementar, porque **tres se
resuelven mucho más barato durante que después**:

- [DT-27](DT-27.md) (publicar el hecho dentro de la transacción) es casi gratis mientras no haya
  ningún suscriptor, y caro de migrar con consumidores vivos.
- [DT-28](DT-28.md) es un **defecto de diseño**, no una limitación: la regla anti-spam, tal cual está
  escrita, bloquea de por vida a un paciente legítimo si el profesional abandona la bandeja.
- [DT-26](DT-26.md) (retención) es más fácil de decidir antes de acumular datos de salud de gente
  que nunca fue paciente, que después.
