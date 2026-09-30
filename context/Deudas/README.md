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
| [DT-30](DT-30.md) | La asistencia real de las citas pasadas no se registra y no se puede reconstruir | 🔴 alta (v2) ⏳ | 🔵 aplazada hasta la Fase 3 (salida C, 2026-09-30) | decisión de producto · [ADR-04 §2](../Decisions/ADR-04.md) |
| [DT-01](DT-01.md) | Sin renovación ni revocación de sesión | 🔴 alta | abierta | [ADR-01](../Decisions/ADR-01.md) |
| [DT-03](DT-03.md) | Sin verificación de correo ni recuperación de contraseña | 🔴 alta | abierta | [us00a](../Features/us00a-registro-inicial.md) |
| [DT-06](DT-06.md) | Registro público sin ningún freno | 🔴 alta | abierta | [us00a](../Features/us00a-registro-inicial.md) |
| [DT-15](DT-15.md) | No se puede buscar un paciente | 🔴 alta | abierta | [us06](../Features/us06-dashboard-citas.md) |
| [DT-02](DT-02.md) | El rol se emite y nadie lo verifica | 🟠 media→alta | abierta | [ADR-01 §4](../Decisions/ADR-01.md) |
| [DT-07](DT-07.md) | No existe alta de un segundo usuario | 🟠 media | abierta | [us00a](../Features/us00a-registro-inicial.md) |
| [DT-12](DT-12.md) | Solapamiento de citas no detectado | 🟠 media | 🟢 resuelta en diseño ([ADR-11](../Decisions/ADR-11.md)) | [us06](../Features/us06-dashboard-citas.md) |
| [DT-14](DT-14.md) | El instante de la cita se acepta sin zona horaria | 🟠 media | abierta | [ADR-07](../Decisions/ADR-07.md) |
| [DT-19](DT-19.md) | Sin observabilidad | 🔴 alta (RF-06 en el MVP) | 🟢 resuelta en diseño ([ADR-13 §16](../Decisions/ADR-13.md)) | RNF-08 |
| [DT-20](DT-20.md) | Las pruebas e2e nunca se han ejecutado | 🟠 media | abierta | [us06](../Features/us06-dashboard-citas.md) |
| [DT-04](DT-04.md) | Login sin límite de intentos | 🟠 media | abierta | [us00b](../Features/us00b-login.md) |
| [DT-16](DT-16.md) | El consentimiento se captura y nadie lo lee | 🔴 alta (RF-06 en el MVP) | 🟠 **riesgo aceptado** (2026-09-30) · revisar antes del 2026-12-01 (Ley 21.719) | [us06](../Features/us06-dashboard-citas.md) |
| [DT-27](DT-27.md) | Los hechos se publican fuera de la transacción | 🔴 alta (RF-06 en el MVP) | 🟢 resuelta en diseño ([ADR-12](../Decisions/ADR-12.md)) | [ADR-09 §7](../Decisions/ADR-09.md) |
| [DT-13](DT-13.md) | Se aceptan citas en el pasado | 🟡 baja→media | abierta | [us06](../Features/us06-dashboard-citas.md) |
| [DT-05](DT-05.md) | La respuesta de login no es uniforme en el tiempo | 🟡 baja | abierta | [ADR-03 §5](../Decisions/ADR-03.md) |
| [DT-08](DT-08.md) | Colisión de identificador público bajo concurrencia | 🟡 baja | abierta | [ADR-03 §2](../Decisions/ADR-03.md) |
| [DT-09](DT-09.md) | Comprobación de correo duplicado inalcanzable | 🟡 baja | abierta | [us00a](../Features/us00a-registro-inicial.md) |
| [DT-18](DT-18.md) | No existe límite de tasa en ninguna superficie | 🟠 riesgo asumido | **aceptada sin límite por ahora** (2026-09-29) | transversal |
| [DT-11](DT-11.md) | El historial de comportamiento no se está acumulando | 🟠 media (antes crítica) | 🔵 aplazada (2026-09-30, scoring a la v2) · mecanismo en [ADR-12](../Decisions/ADR-12.md) | [ADR-04 §4](../Decisions/ADR-04.md) |
| [DT-17](DT-17.md) | Zona horaria única para toda la instalación | 🟡 baja | 🔵 aplazada | [ADR-07 §2](../Decisions/ADR-07.md) |
| [DT-21](DT-21.md) | Carpetas vacías con nombres mal escritos | 🟢 cosmética | 🟢 resuelta en diseño para `recordatorio/` ([ADR-13 §1](../Decisions/ADR-13.md)) | estructura |
| [DT-29](DT-29.md) | Funcionalidad implementada y no conectada (7 de 14 rutas) | 🟡 baja | abierta (mitigada) | release 1 de US-02 |

## Cerradas o mitigadas

| ID | Deuda | Resultado |
|----|-------|-----------|
| [DT-10](DT-10.md) | La máquina de estados es inalcanzable | release 1 · 2026-08-23 |
| [DT-22](DT-22.md) | Sin vínculo entre citas reagendadas | release 1 · 2026-08-23 |
| [DT-28](DT-28.md) | Una solicitud sin revisar bloquea al paciente | 🟢 mitigada con una ventana de tiempo · 2026-08-24 |

## Previstas — se contraen al implementar la vía pública de [ADR-09](../Decisions/ADR-09.md)

| ID | Deuda | Severidad | Estado | Origen |
|----|-------|-----------|--------|--------|
| [DT-23](DT-23.md) | Nada verifica que el RUT pertenezca a quien lo escribe | 🟠 media | ⚪ prevista | [ADR-09 §3, §8](../Decisions/ADR-09.md) |
| [DT-25](DT-25.md) | La apuesta del formulario no se puede medir | 🟠 media | ⚪ prevista | [ADR-09 §10](../Decisions/ADR-09.md) |
| [DT-26](DT-26.md) | Sin política de retención para las solicitudes | 🟠 media | ⚪ prevista | [ADR-09 §1, §10](../Decisions/ADR-09.md) |
| [DT-24](DT-24.md) | Sin taxonomía de tipos de consulta | 🟡 baja | 🔵 aplazada | [ADR-09 §10](../Decisions/ADR-09.md) |

## Previstas — se contraen al implementar la Fase 2 ([ADR-12](../Decisions/ADR-12.md) y [ADR-13](../Decisions/ADR-13.md))

Todavía sin número: se fichan al implementar, como hizo ADR-10. La lista completa está en la sección
*Deudas técnicas asociadas* de cada ADR. Las dos que más pesan:

- **El correo del paciente no se verifica** ([ADR-13](../Decisions/ADR-13.md)): un error de tipeo
  manda la fecha de la hora y el nombre del profesional a un tercero. Misma familia que DT-23.
- **La cuota de correo es una sola para toda la plataforma** ([ADR-13 §11](../Decisions/ADR-13.md)):
  en el modo prueba, 50 citas al día entre todos; solo la acota un fusible por tenant.

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
| [ADR-03](../Decisions/ADR-03.md) — login por slug | DT-05, DT-08 |
| [ADR-04](../Decisions/ADR-04.md) — modelo de Cita | DT-10 ✅ cerrada, DT-11, DT-22 ✅ cerrada, DT-30 (el grafo solo marca asistencia desde `confirmada`) |
| [ADR-07](../Decisions/ADR-07.md) — zona de la clínica | DT-14, DT-17 |
| [ADR-09](../Decisions/ADR-09.md) — gestión de citas | *cierra* DT-10 y DT-22 · *contrae* DT-23, DT-24, DT-25, DT-26, DT-27, DT-28 · *depende de* DT-15 y DT-18 · *deja abierta* DT-12 |
| [ADR-11](../Decisions/ADR-11.md) — solapamiento | *cierra en diseño* DT-12 |
| [ADR-12](../Decisions/ADR-12.md) — outbox + planificador | *cierra en diseño* DT-27 · *avanza* DT-19 · *aplaza* DT-11 (mecanismo decidido) |
| [ADR-13](../Decisions/ADR-13.md) — recordatorios | *cierra en diseño* DT-21 (`recordatorio/`) · *avanza* DT-19 · *acepta como riesgo* DT-16 · *toca* DT-17, DT-23, DT-26, DT-29, DT-30 · 5 previstas sin número (ver el ADR) |
| Decisión de producto 2026-09-30 (scoring a la v2, sin botones de asistencia) | DT-30 |
| [us00a](../Features/us00a-registro-inicial.md) — registro | DT-03, DT-06, DT-07, DT-09 |
| [us00b](../Features/us00b-login.md) — login | DT-03, DT-04 |
| [us06](../Features/us06-dashboard-citas.md) — dashboard | DT-12, DT-13, DT-15, DT-16, DT-20 |
| Transversal / RNF | DT-18, DT-19, DT-21 |
| Integración front ↔ back | DT-29 (ver también `citia-frontend/context/Deudas/`) |

---

## Lo que hay que mirar primero

**DT-30 es distinta a todas las demás** (desde el 2026-09-30). Es la única cuyo coste **crece solo con
el tiempo**: si nadie marca si el paciente llegó o no llegó, ese dato se pierde para siempre. Hasta
esa fecha la propiedad era de [DT-11](DT-11.md); al separar las dos cosas quedó claro que el
`ghosting` **sí** se puede reconstruir después (con una fecha de corte), y la asistencia real **no**.
El usuario decidió el 2026-09-30 **esperar a la Fase 3** (cuando el paciente confirme desde el
enlace) sin tocar el grafo de ADR-04: hasta entonces la asistencia real no se registra.

**Fase 2 (recordatorios, 2026-09-30): tres deudas pasan a ser parte de su alcance**, no extras:
[DT-27](DT-27.md) (outbox, **antes** del primer suscriptor), [DT-19](DT-19.md) (sin observabilidad
RNF-03 es inverificable) y [DT-21](DT-21.md) (el módulo se rehace). Y una queda como riesgo aceptado
con fecha: [DT-16](DT-16.md), a revisar antes de que entre en vigor la Ley 21.719 (prevista para el
2026-12-01).

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
