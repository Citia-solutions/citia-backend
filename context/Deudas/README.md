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
| [DT-01](DT-01.md) | Sin renovación ni revocación de sesión | 🔴 alta (se revisa al cerrar la Fase 7) | abierta · avance **en producción** desde el 2026-11-01 (Fase 7): corte de las demás sesiones al cambiar la contraseña y salida de un usuario borrado ([ADR-15 §5](../Decisions/ADR-15.md)); la renovación sigue igual · *antes: implementado, en `develop` (2026-11-01); en diseño (2026-10-31)* | [ADR-01](../Decisions/ADR-01.md) |
| [DT-03](DT-03.md) | Sin verificación de correo ni recuperación de contraseña | 🔴 alta | abierta | [us00a](../Features/us00a-registro-inicial.md) |
| [DT-06](DT-06.md) | Registro público sin ningún freno | 🔴 alta | abierta | [us00a](../Features/us00a-registro-inicial.md) |
| [DT-15](DT-15.md) | No se puede buscar un paciente | 🔴 alta | abierta · neutralizada para crear cita por el RUT (ver nota) | [us06](../Features/us06-dashboard-citas.md) |
| [DT-51](DT-51.md) | No hay contrato de encargo entre la clínica y Citia | 🟠 media → 🔴 alta con la primera clínica con pacientes reales | abierta (fichada el 2026-10-31) · cumplimiento P1 | [pre-análisis legal con IA](../Cumplimiento/pre-analisis-ia-2026-10-30.md) (2026-10-30; no es un abogado) |
| [DT-52](DT-52.md) | Proveedores y datos que salen de Chile, sin inventario ni garantías | 🟠 media → 🔴 alta con la primera clínica con pacientes reales | abierta (fichada el 2026-10-31) · cumplimiento P1 (y P2, el registro al día) | pre-análisis · [ADR-13 §12](../Decisions/ADR-13.md) |
| [DT-53](DT-53.md) | No hay política de privacidad ni canal para los derechos del paciente | 🟠 media → 🔴 alta con la primera clínica con pacientes reales | abierta (fichada el 2026-10-31) · cumplimiento P1 | pre-análisis |
| [DT-02](DT-02.md) | El rol se emite y nadie lo verifica | 🟠 media→alta | abierta · desde el 2026-11-01, una ruta (la suscripción) lo comprueba en su caso de uso; sin guard general | [ADR-01 §4](../Decisions/ADR-01.md) |
| [DT-07](DT-07.md) | No existe alta de un segundo usuario | 🟠 media | abierta | [us00a](../Features/us00a-registro-inicial.md) |
| [DT-35](DT-35.md) | El correo del paciente no se verifica | 🟠 media | abierta (contraída en la Fase 2, 2026-10-03) | [ADR-13 §14](../Decisions/ADR-13.md) |
| [DT-36](DT-36.md) | Una sola cuota de correo para toda la plataforma | 🟠 media | abierta (contraída en la Fase 2, 2026-10-03) | [ADR-13 §11](../Decisions/ADR-13.md) |
| [DT-40](DT-40.md) | Con `MENSAJERIA_ADAPTADOR=registro` los recordatorios quedan "Enviado" sin haberse enviado | 🟠 media | abierta (detectada en producción, 2026-10-07) · la variable ya está en `resend` | puesta en producción · [ADR-13 §13](../Decisions/ADR-13.md) |
| [DT-23](DT-23.md) | Nada verifica que el RUT pertenezca a quien lo escribe | 🟠 media | abierta (contraída con la vía pública, 2026-09-10) | [ADR-09 §3, §8](../Decisions/ADR-09.md) |
| [DT-25](DT-25.md) | La apuesta del formulario no se puede medir | 🟠 media | abierta (contraída con la vía pública, 2026-09-10) | [ADR-09 §10](../Decisions/ADR-09.md) |
| [DT-26](DT-26.md) | Sin política de conservación de los datos por finalidad (empezó por las solicitudes) *(título hasta el 2026-10-31: "Sin política de retención para las solicitudes")* | 🟠 media | abierta (contraída con la vía pública, 2026-09-10) · ampliada el 2026-10-31 a todos los datos · cumplimiento P2 | [ADR-09 §1, §10](../Decisions/ADR-09.md) · pre-análisis |
| [DT-42](DT-42.md) | El enlace por cita no verifica identidad: reenviado o mal dirigido, transfiere la capacidad | 🟠 media (riesgo aceptado) | abierta (contraída al desplegar la Fase 3, 2026-10-17) | [ADR-10 §9](../Decisions/ADR-10.md) |
| [DT-45](DT-45.md) | Cambiar `ENLACE_CITA_CLAVE` deja sin servir, en silencio, los enlaces de los correos siguientes | 🟠 media → 🟡 baja con la corrección | abierta (2026-10-17) · **corrección en producción**: cumple su criterio de cierre, falta confirmarlo | [ADR-10 §1](../Decisions/ADR-10.md) |
| [DT-14](DT-14.md) | El instante de la cita se acepta sin zona horaria | 🟠 media | abierta · avance parcial: aceptar una solicitud ya exige zona (2026-09-28); crear y reagendar no | [ADR-07](../Decisions/ADR-07.md) |
| [DT-19](DT-19.md) | Sin observabilidad | 🟠 media (era 🔴) | 🟢 **verificada en producción** (2026-10-07): uptime y heartbeats en Up · abierta solo por la fuente de logs (sin ella, las alertas por log no llegan) y la prueba de alerta forzada | RNF-08 |
| [DT-20](DT-20.md) | Las pruebas e2e no corren solas: no hay pipeline *(título hasta el 2026-10-18: "nunca se han ejecutado")* | 🟠 media | abierta · avance: suites con BD en verde (2026-09-28; 2026-10-15: 287 e2e y 139 de integración) y concurrencia `SKIP LOCKED` automatizada; sin pipeline | [us06](../Features/us06-dashboard-citas.md) |
| [DT-04](DT-04.md) | Login sin límite de intentos | 🟠 media | abierta | [us00b](../Features/us00b-login.md) |
| [DT-55](DT-55.md) | No se sabe si Citia necesita acreditarse como plataforma de salud digital | 🟠 media, incierta | abierta (fichada el 2026-10-31) · cumplimiento P1 (saber el alcance) | pre-análisis |
| [DT-16](DT-16.md) | El consentimiento se captura y nadie lo lee | 🔴 alta (RF-06 en el MVP) | 🟠 **riesgo aceptado** (2026-09-30) · política implementada y **apagada** (2026-10-03) · revisar antes del 2026-12-01 (Ley 21.719) | [us06](../Features/us06-dashboard-citas.md) |
| [DT-13](DT-13.md) | Se aceptan citas en el pasado | 🟡 baja→media | abierta | [us06](../Features/us06-dashboard-citas.md) |
| [DT-54](DT-54.md) | Citia no distingue a un paciente menor de edad ni registra a su representante | 🟡 baja → 🟠 media con la primera clínica real que atienda a menores | abierta (fichada el 2026-10-31) · cumplimiento P2 | pre-análisis |
| [DT-56](DT-56.md) | Sin procedimiento ante incidentes de datos ni programa interno de cumplimiento | 🟡 baja → 🟠 media con la primera clínica con pacientes reales | abierta (fichada el 2026-10-31) · cumplimiento P2 | pre-análisis |
| [DT-05](DT-05.md) | La respuesta de login no es uniforme en el tiempo | 🟡 baja | abierta | [ADR-03 §5](../Decisions/ADR-03.md) |
| [DT-08](DT-08.md) | Colisión de identificador público bajo concurrencia | 🟡 baja | abierta | [ADR-03 §2](../Decisions/ADR-03.md) |
| [DT-09](DT-09.md) | Comprobación de correo duplicado inalcanzable | 🟡 baja | abierta | [us00a](../Features/us00a-registro-inicial.md) |
| [DT-18](DT-18.md) | No existe límite de tasa en ninguna superficie | 🟠 riesgo asumido | 🟢 **en producción** (2026-10-17) · se cierra con la prueba de `trust proxy` · queda abierto en DT-04, DT-06 y la nota de una réplica · antes: implementada (2026-10-15), en implementación (2026-10-14), aceptada sin límite (2026-09-29) | transversal |
| [DT-43](DT-43.md) | El profesional no se entera en el momento de lo que hace el paciente | 🟡 baja → 🟠 media | abierta (2026-10-17) · se cierra en la Fase 4 | [ADR-10 §7](../Decisions/ADR-10.md) |
| [DT-44](DT-44.md) | La petición de otra hora se resuelve solo en la bandeja, y en silencio para el paciente | 🟡 baja | abierta (2026-10-17), solo la parte 1 (rechazar no avisa al paciente); la parte 2 la resolvió el suscriptor | [ADR-10 §4](../Decisions/ADR-10.md) |
| [DT-17](DT-17.md) | Zona horaria única para toda la instalación | 🟡 baja | 🔵 aplazada | [ADR-07 §2](../Decisions/ADR-07.md) |
| [DT-29](DT-29.md) | Funcionalidad implementada y no conectada (4 de 29 rutas sin consumidor, 2026-10-18) | 🟡 baja | abierta (mitigada) · las rutas de las Fases 2 y 3 nacieron consumidas | release 1 de US-02 |
| [DT-31](DT-31.md) | Imports que cruzan capas por debajo del check de ADR-02 | 🟡 baja | abierta (detectada el 2026-10-04) | [ADR-02 §2](../Decisions/ADR-02.md) |
| [DT-32](DT-32.md) | Sin orden garantizado entre los hechos de un mismo agregado | 🟡 baja | abierta (contraída en la Fase 2) | [ADR-12 §4](../Decisions/ADR-12.md) |
| [DT-33](DT-33.md) | Latencia de segundos entre el cambio y el suscriptor | 🟡 baja → media con RF-05 | abierta (contraída en la Fase 2) | [ADR-12](../Decisions/ADR-12.md) |
| [DT-34](DT-34.md) | La carta muerta del outbox no tiene herramienta | 🟡 baja | abierta (contraída en la Fase 2) | [ADR-12 §3](../Decisions/ADR-12.md) |
| [DT-37](DT-37.md) | Un recordatorio `enviado` puede no llegar nunca a `entregado` | 🟡 baja | abierta (contraída en la Fase 2) · webhook activo en producción desde el 2026-10-07; falta la medición de los `enviado` viejos | [ADR-13 §9–§10](../Decisions/ADR-13.md) |
| [DT-38](DT-38.md) | Carrera con un reagendamiento en el mismo segundo del envío | 🟡 baja | abierta · riesgo aceptado (contraída en la Fase 2) | [ADR-13 §7](../Decisions/ADR-13.md) |
| [DT-39](DT-39.md) | No hay herramienta para quitar una dirección suprimida | 🟡 baja | abierta (contraída en la Fase 2) | [ADR-13 §2](../Decisions/ADR-13.md) |
| [DT-41](DT-41.md) | El subdominio de envío no tiene DMARC y la autenticación del correo no se inspeccionó | 🟡 baja | abierta (detectada en producción, 2026-10-07) | puesta en producción · [ADR-13 §12–§13](../Decisions/ADR-13.md) |
| [DT-46](DT-46.md) | Columnas de fecha de varias entidades ORM sin `timestamptz`: con `synchronize` (tests) quedan sin zona | 🟡 baja | abierta (detectada al implementar la Fase 3, 2026-10-15) · nota 2026-11-01: la Fase 7 no la cierra y ahora muestra `usuarios.creado_en` y `tenants.creado_en` | entidades de `cita`, `paciente`, `tenant`, `usuario` |
| [DT-47](DT-47.md) | `cambios_cita.ocurrido_en` usa `DEFAULT now()`: con transacciones concurrentes la bitácora puede quedar en orden invertido | 🟡 baja → 🟠 media con US-07.02 | abierta (detectada en US-07.01, confirmada 2026-10-20) · **se corrige antes de implementar US-07.02** (2026-10-30), cuando se desbloquee (🚧 desde el 2026-10-30) | migración de `cambios_cita` (Fase 1) |
| [DT-48](DT-48.md) | Un cierre equivocado no se corrige | 🟡 baja → 🟠 media con US-07.02 | abierta (contraída con US-07.01, fichada 2026-10-30) · **salida decidida**: corrección dentro de 7 días, en US-07.02 (🚧 bloqueada desde el 2026-10-30; podría separarse, sin decidir) | [ADR-14](../Decisions/ADR-14.md#consecuencias) · [ADR-04 §2](../Decisions/ADR-04.md) |
| [DT-49](DT-49.md) | La primera apertura del enlace la puede disparar un escáner que ejecuta la página | 🟡 baja (favorece al paciente) | abierta (contraída con US-07.01, fichada 2026-10-30) · propuesta para US-07.02 en el plan | [ADR-14 §10.a](../Decisions/ADR-14.md#10-us-0701-los-datos-que-hoy-se-pierden-va-primero) |
| [DT-50](DT-50.md) | `cita` lee con SQL el esquema de `recordatorios` y `solicitudes_cita` | 🟡 baja | abierta (contraída con US-07.01, fichada 2026-10-30) · mitigada por la integración y los `CLAUDE.md` | plan [US-07.01](../US/07.01-registro-hechos.md#riesgos), riesgo 9 |
| [DT-57](DT-57.md) | Sin foto de perfil | 🟡 baja | 🔵 aplazada (decisión P1 de la Fase 7, fichada 2026-10-31) | [ADR-15 §1](../Decisions/ADR-15.md) · plan [US-10](../US/10-perfil-cuenta.md) |
| [DT-58](DT-58.md) | El nombre de la organización no se puede corregir | 🟡 baja | 🔵 aplazada (decisión P3 de la Fase 7, fichada 2026-10-31) | [ADR-15 §2](../Decisions/ADR-15.md) · [us00a](../Features/us00a-registro-inicial.md) |
| [DT-59](DT-59.md) | El canal de correo vive en `recordatorio` y lo usa `soporte` | 🟡 baja | abierta (contraída al implementar la Fase 7, 2026-11-01) · *antes: ⚪ prevista* | [ADR-15](../Decisions/ADR-15.md), opción F2 |
| [DT-60](DT-60.md) | El decorador `Recortar` está copiado en tres módulos | 🟡 baja | abierta (detectada al implementar la Fase 7, 2026-11-01) | implementación de la Fase 7 · [ADR-15](../Decisions/ADR-15.md#menores-sin-efecto-en-el-contrato) |
| [DT-61](DT-61.md) | El registro no aplica la política de contraseña del cambio: sin tope de 72 bytes | 🟡 baja | abierta (detectada al implementar la Fase 7, 2026-11-01) | [us00a](../Features/us00a-registro-inicial.md) · [ADR-15 §4](../Decisions/ADR-15.md) |

## Cerradas o mitigadas

| ID | Deuda | Resultado |
|----|-------|-----------|
| [DT-10](DT-10.md) | La máquina de estados es inalcanzable | release 1 · 2026-08-23 |
| [DT-22](DT-22.md) | Sin vínculo entre citas reagendadas | release 1 · 2026-08-23 |
| [DT-28](DT-28.md) | Una solicitud sin revisar bloquea al paciente | 🟢 mitigada con una ventana de tiempo · 2026-08-24 |
| [DT-27](DT-27.md) | Los hechos se publican fuera de la transacción | ✅ cerrada por el outbox de ADR-12 · `f95b637` · 2026-10-03 · en producción desde el 2026-10-06 (`c057ade`) |
| [DT-21](DT-21.md) | Carpetas vacías con nombres mal escritos | ✅ cerrada · `recordatorio/` rehecho (`f2d80aa`) y carpetas de `paciente/` borradas (`a37f175`) · 2026-10-03 · en producción desde el 2026-10-06 |
| [DT-30](DT-30.md) | La asistencia real de las citas pasadas no se registra | 🟢 mitigada (2026-10-05): Confirmar, Asistió y No asistió en el voucher (frontend); lo anterior a esa fecha no se reconstruye |
| [DT-12](DT-12.md) | Solapamiento de citas no detectado | ✅ cerrada por [ADR-11](../Decisions/ADR-11.md) (avisar y permitir) · `538657e`, `9140bc3`, tests `06858f2` · 2026-09-28 · en producción desde el 2026-10-04 *(cierre registrado el 2026-10-18)* |
| [DT-11](DT-11.md) | El historial de comportamiento no se está acumulando | ✅ cerrada (2026-10-27): job G1 de [US-07.01](../US/07.01-registro-hechos.md) **prendido en production** (`CIERRE_GHOSTING_ACTIVO=true`) · código `f123617`, release `313a506` (2026-10-20) · primer tick: 1 cita cerrada, 0 fallidas · *antes:* en construcción (2026-10-19), desplegado apagado (2026-10-20), 🔵 aplazada (2026-09-30) |

## Contraídas con la vía pública de [ADR-09](../Decisions/ADR-09.md) (2026-09-10)

> **Nota (2026-09-30).** La vía pública está implementada desde el 2026-09-10 (`e1253c3`) y la bandeja
> desde el 2026-09-28, así que, según la definición de `prevista` de arriba, **DT-23, DT-25 y DT-26 ya
> están contraídas** (existen hoy en el código). Su estado no se cambió en esta pasada de navegación:
> queda para confirmarlo y pasarlas a `abierta`. Guía de la fase: [Fase 1](../Fases/fase-1-us02-gestion-citas.md).
>
> *(2026-10-18: confirmado contra el código —no hay verificación de titularidad del RUT, ni conteo de visitas
> al formulario, ni purga de solicitudes— y pasadas a `abierta`. Están también en la tabla *Por severidad*.)*

| ID | Deuda | Severidad | Estado | Origen |
|----|-------|-----------|--------|--------|
| [DT-23](DT-23.md) | Nada verifica que el RUT pertenezca a quien lo escribe | 🟠 media | abierta (antes ⚪ prevista) | [ADR-09 §3, §8](../Decisions/ADR-09.md) |
| [DT-25](DT-25.md) | La apuesta del formulario no se puede medir | 🟠 media | abierta (antes ⚪ prevista) | [ADR-09 §10](../Decisions/ADR-09.md) |
| [DT-26](DT-26.md) | Sin política de retención para las solicitudes *(desde el 2026-10-31: "Sin política de conservación de los datos por finalidad (empezó por las solicitudes)")* | 🟠 media | abierta (antes ⚪ prevista) | [ADR-09 §1, §10](../Decisions/ADR-09.md) |
| [DT-24](DT-24.md) | Sin taxonomía de tipos de consulta | 🟡 baja | 🔵 aplazada | [ADR-09 §10](../Decisions/ADR-09.md) |

## Contraídas al desplegar la Fase 3 ([ADR-10](../Decisions/ADR-10.md), 2026-10-17)

*(2026-10-14.)* Fichadas al aceptar ADR-10, antes de implementar: son deuda **firmada a sabiendas** con el
diseño de la [Fase 3](../Fases/fase-3-us04-respuesta-paciente.md). Pasan a `abierta` cuando la fase llegue
a producción. De las cuatro previstas de la propuesta, la 1 y la 2 son DT-42 y DT-43; la 3 (peticiones sin
descarte) y la 4 (bloqueo de fila) desaparecieron con el diseño aceptado
([ADR-10 § Deudas](../Decisions/ADR-10.md#deudas-técnicas-asociadas)).

> *(2026-10-15, fase implementada y mergeada a `develop`.)* Siguen `prevista` hasta el
> despliegue, pero dos cambiaron al implementar: **DT-44** perdió su parte 2 (el suscriptor deja atendida la
> petición cuando el profesional reagenda desde el voucher) y **DT-45** tiene su corrección en el código
> (autocorrección en `asegurarActivo` + tests).
>
> *(2026-10-17.)* La Fase 3 llegó a producción: las cuatro pasan a **`abierta`**. Están también en la tabla
> *Por severidad*.

| ID | Deuda | Severidad | Estado | Origen |
|----|-------|-----------|--------|--------|
| [DT-42](DT-42.md) | El enlace por cita no verifica identidad: reenviado o mal dirigido, transfiere la capacidad | 🟠 media (riesgo aceptado) | abierta (2026-10-17) | [ADR-10 §9](../Decisions/ADR-10.md) · prevista 1 |
| [DT-45](DT-45.md) | Cambiar `ENLACE_CITA_CLAVE` deja sin servir, en silencio, los enlaces de los correos siguientes | 🟠 media → 🟡 baja con la corrección | abierta (2026-10-17) · **corrección en producción**: cumple su criterio de cierre, falta confirmarlo | [ADR-10 §1](../Decisions/ADR-10.md) · E2 |
| [DT-43](DT-43.md) | El profesional no se entera en el momento de lo que hace el paciente | 🟡 baja → 🟠 media | abierta (2026-10-17) · se cierra en la Fase 4 | [ADR-10 §7](../Decisions/ADR-10.md) · prevista 2 |
| [DT-44](DT-44.md) | La petición de otra hora se resuelve solo en la bandeja, y en silencio para el paciente | 🟡 baja | abierta (2026-10-17) · **parte 2 resuelta** por el suscriptor (2026-10-15); queda la parte 1 (rechazar no avisa al paciente) | [ADR-10 §4](../Decisions/ADR-10.md) · R3 |

## Contraídas y detectadas con US-07.01 ([ADR-14](../Decisions/ADR-14.md), Fase 5)

*(2026-10-30.)* US-07.01 está en producción desde el 2026-10-20 y su job G1, prendido desde el 2026-10-27. Las
dos previstas de ADR-14 que contrajo (la 1 y la 4) y la deuda nueva de su plan (riesgo 9) se fichan ahora, sin
esperar al cierre de US-07.01. Las previstas 2 (la insistencia consume la cuota de Resend) y 3 (pacientes de
pocas visitas) son de US-07.02 y US-07.03: **siguen previstas** en
[ADR-14](../Decisions/ADR-14.md#deudas-técnicas-asociadas). Guía de la fase: [Fase 5](../Fases/fase-5-us07-scoring.md).

| ID | Qué | Severidad | Cambio |
|----|-----|-----------|--------|
| [DT-11](DT-11.md) | El historial de comportamiento no se acumulaba: el job G1 no existía | 🟠 media | ✅ **cerrada** (2026-10-27): job G1 prendido en production |
| [DT-47](DT-47.md) | La bitácora puede quedar en orden invertido con transacciones concurrentes | 🟡 baja → 🟠 media con US-07.02 | detectada (2026-10-19, confirmada el 2026-10-20) · **se corrige antes de implementar US-07.02**, cuando se desbloquee |
| [DT-48](DT-48.md) | Un cierre equivocado no se corrige | 🟡 baja → 🟠 media con US-07.02 | **nueva** · prevista 1 de ADR-14 · salida decidida el 2026-10-30 (corrección dentro de 7 días, en US-07.02, 🚧 bloqueada desde el mismo día) |
| [DT-49](DT-49.md) | La primera apertura la puede disparar un escáner que ejecuta la página | 🟡 baja | **nueva** · prevista 4 de ADR-14 |
| [DT-50](DT-50.md) | `cita` lee con SQL el esquema de `recordatorios` y `solicitudes_cita` (job G1) | 🟡 baja | **nueva** · riesgo 9 del plan US-07.01 |

## Fichadas con el pre-análisis legal ([Cumplimiento](../Cumplimiento/README.md), 2026-10-31)

*(2026-10-31.)* Salen del [pre-análisis legal hecho con una IA el 2026-10-30](../Cumplimiento/pre-analisis-ia-2026-10-30.md),
que **no es un abogado ni una opinión legal** (el usuario no tiene abogado). No son de ninguna fase: son
transversales y su estado vive en [`Cumplimiento/`](../Cumplimiento/README.md). Casi todas se cierran con contratos,
inventarios, políticas y procedimientos, no con código. Su escalón es **la primera clínica con pacientes reales**, no
producción: Citia ya está en producción sin clínicas reales. Si P1 es condición para recibir a esa clínica, el
usuario no lo ha decidido.

| ID | Qué | Severidad | Prioridad | Cambio |
|----|-----|-----------|-----------|--------|
| [DT-51](DT-51.md) | No hay contrato de encargo entre la clínica y Citia | 🟠 media → 🔴 alta con la primera clínica con pacientes reales | P1 | **nueva** · preguntas B7 y B8 |
| [DT-52](DT-52.md) | Proveedores y datos que salen de Chile, sin inventario ni garantías | 🟠 media → 🔴 alta con la primera clínica con pacientes reales | P1 · P2 (registro al día) | **nueva** · pregunta B9; lo que llegaría a Better Stack, leído del código |
| [DT-53](DT-53.md) | No hay política de privacidad ni canal para los derechos del paciente | 🟠 media → 🔴 alta con la primera clínica con pacientes reales | P1 | **nueva** · P1 y preguntas A5 y B9 |
| [DT-55](DT-55.md) | No se sabe si Citia necesita acreditarse como plataforma de salud digital | 🟠 media, incierta | P1 (saber el alcance) | **nueva** · pregunta B10 |
| [DT-54](DT-54.md) | Citia no distingue a un paciente menor de edad ni registra a su representante | 🟡 baja → 🟠 media con la primera clínica real que atienda a menores | P2 | **nueva** · pregunta B11 |
| [DT-56](DT-56.md) | Sin procedimiento ante incidentes de datos ni programa interno de cumplimiento | 🟡 baja → 🟠 media con la primera clínica con pacientes reales | P2 | **nueva** · pregunta B13 |
| [DT-26](DT-26.md) | Sin política de conservación de los datos por finalidad *(antes: "… para las solicitudes")* | 🟠 media (sin cambio) | P2 | **ampliada**: de las solicitudes a todos los datos (pregunta B11) |
| [DT-16](DT-16.md) | El consentimiento se captura y nadie lo lee | 🔴 alta (sin cambio) | P1 (recordatorios) · P3 (calificación) | **nota**: el pre-análisis confirma que la casilla no sirve de base (pregunta A6) |

## Fichadas con el diseño de la Fase 7 ([ADR-15](../Decisions/ADR-15.md), 2026-10-31)

*(2026-10-31.)* Salen de las decisiones del usuario y del diseño de la [Fase 7](../Fases/fase-7-us10-perfil.md) (US-10,
perfil, suscripción y soporte), **propuesto y sin implementar** *(aceptado ese mismo día; implementado el 2026-11-01:
[abajo](#al-implementar-la-fase-7-2026-11-01))*. Dos son funcionalidad aplazada a conciencia y una es
deuda **firmada a sabiendas** con el diseño, que se contrae al implementarlo. El cambio de correo no tiene deuda propia:
depende de verificarlo y vive como nota en [DT-03](DT-03.md).

| ID | Qué | Severidad | Cambio |
|----|-----|-----------|--------|
| [DT-57](DT-57.md) | Sin foto de perfil: avatar con iniciales | 🟡 baja | **nueva** · 🔵 aplazada (P1) |
| [DT-58](DT-58.md) | El nombre de la organización no se puede corregir (va en cada recordatorio) | 🟡 baja | **nueva** · 🔵 aplazada (P3) |
| [DT-59](DT-59.md) | `soporte` usa el canal de correo de `recordatorio` por archivo; el contador de cuota no ve sus correos | 🟡 baja | **nueva** · ⚪ prevista |
| [DT-01](DT-01.md) | Sin renovación ni revocación de sesión | 🔴 alta (sin cambio) | **nota**: la revocación al cambiar la contraseña y la salida de un usuario borrado, en diseño |
| [DT-02](DT-02.md) | El rol se emite y nadie lo verifica | 🟠 media (sin cambio) | **nota**: la suscripción es la primera ruta que mira el rol, con una comprobación local |
| [DT-03](DT-03.md) | Sin verificación de correo ni recuperación de contraseña | 🔴 alta (sin cambio) | **nota**: la recuperación y el cambio de correo siguen fuera (P2, P6) |
| [DT-26](DT-26.md) · [DT-36](DT-36.md) · [DT-52](DT-52.md) · [DT-53](DT-53.md) · [DT-56](DT-56.md) | conservación, cuota de correo, proveedores, política y incidentes | sin cambio | **notas**: el flujo nuevo de los mensajes a soporte |

### Al implementar la Fase 7 (2026-11-01)

*(2026-11-01.)* El backend de la Fase 7 está implementado y, desde ese mismo día, **en producción** (release
`cd659c1`; *al escribir esto: en `develop`, con el release a `main` abierto*)
([notas de ADR-15](../Decisions/ADR-15.md#notas-de-implementación-2026-11-01)). La prevista se contrae, DT-01 avanza en
el código y se detectan dos menores. Las notas del flujo de soporte (DT-26, DT-36, DT-52, DT-53, DT-56) siguen como
estaban: se implementó lo que describían.

| ID | Qué | Severidad | Cambio |
|----|-----|-----------|--------|
| [DT-59](DT-59.md) | `soporte` usa el canal de correo de `recordatorio` por archivo, con su propia instancia | 🟡 baja | ⚪ prevista → **abierta** (contraída); suma una divergencia: un canal que lanza es error propio en soporte y `transitorio` en recordatorios |
| [DT-01](DT-01.md) | Sin renovación ni revocación de sesión | 🔴 alta (se revisa al cerrar la fase) | **nota**: la revocación al cambiar la contraseña y la salida de un usuario borrado, **implementadas** |
| [DT-02](DT-02.md) | El rol se emite y nadie lo verifica | 🟠 media (sin cambio) | **nota**: la primera comprobación de rol, implementada en el caso de uso de la suscripción |
| [DT-46](DT-46.md) | Fechas ORM sin `timestamptz` | 🟡 baja (sin cambio) | **nota**: sigue abierta; `usuarios.creado_en` y `tenants.creado_en` ahora se muestran |
| [DT-60](DT-60.md) | El decorador `Recortar` está copiado en tres módulos | 🟡 baja | **nueva** (detectada) |
| [DT-61](DT-61.md) | El registro no aplica la política de contraseña del cambio: sin tope de 72 bytes | 🟡 baja | **nueva** (detectada; el origen es el registro, de Fundaciones) |

## Detectada al implementar la Fase 3 (2026-10-15)

| ID | Qué | Severidad | Cambio |
|----|-----|-----------|--------|
| [DT-46](DT-46.md) | Ocho columnas de fecha (`citas`, `cambios_cita`, `pacientes`, `tenants`, `usuarios`) declaradas sin `timestamptz` en sus entidades ORM: las migraciones están bien, pero el esquema de `synchronize` de los tests las crea sin zona y `pg` las lee en la hora del proceso. Corregida ya en `solicitudes_cita.recibida_en` | 🟡 baja | **nueva** |

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
> al entrar el primer cliente real. **2026-10-14:** la Fase 3 lo construye para las cuatro superficies
> públicas. **2026-10-15:** implementado y mergeado a `develop`. **2026-10-17:** en producción; se cierra con
> la prueba de `trust proxy`.

> **`→` en la severidad** significa que la deuda escala sola cuando entre cierto requisito. DT-02
> escala con DT-07; DT-13 escala cuando exista el proceso de cierre de DT-11. **DT-16, DT-19 y DT-27
> escalaron** el 2026-09-30, cuando RF-06 entró en el MVP. *(2026-10-18: desde entonces DT-27 se cerró
> —2026-10-03— y DT-19 volvió a 🟠 media al verificarse en producción —2026-10-07—; solo DT-16 sigue en 🔴
> alta.)* *(2026-10-31: [DT-51](DT-51.md), [DT-52](DT-52.md) y [DT-53](DT-53.md) escalan a 🔴, y
> [DT-54](DT-54.md) y [DT-56](DT-56.md) a 🟠, con la primera clínica con pacientes reales; DT-54, solo si atiende a
> menores.)*

---

## Por origen

| Origen | Deudas |
|--------|--------|
| [ADR-01](../Decisions/ADR-01.md) — auth JWT | DT-01, DT-02 |
| [ADR-02](../Decisions/ADR-02.md) — español + hexagonal | DT-31 (lo que el check automático no ve) |
| [ADR-03](../Decisions/ADR-03.md) — login por slug | DT-05, DT-08 |
| [ADR-04](../Decisions/ADR-04.md) — modelo de Cita | DT-10 ✅ cerrada, DT-11 ✅ cerrada (2026-10-27), DT-22 ✅ cerrada, DT-30 (el grafo solo marcaba asistencia desde `confirmada`; ADR-14 §9 lo extendió), DT-48 ("de un terminal no se sale"; excepción decidida el 2026-10-30) |
| [ADR-07](../Decisions/ADR-07.md) — zona de la clínica | DT-14, DT-17 |
| [ADR-09](../Decisions/ADR-09.md) — gestión de citas | *cierra* DT-10 y DT-22 · *contrae* DT-23, DT-24, DT-25, DT-26, DT-27, DT-28 · *depende de* DT-15 y DT-18 · *deja abierta* DT-12 |
| [ADR-10](../Decisions/ADR-10.md) — enlace por cita (aceptado 2026-10-14; en producción desde el 2026-10-17) | *implementa* DT-18 (en producción; se cierra con la prueba de `trust proxy`) · *contrae* DT-42, DT-43, DT-44, DT-45 (abiertas desde el 2026-10-17; DT-44 sin su parte 2 y DT-45 con su corrección) · *fija la regla de* DT-11 (G1) · *toca* DT-04, DT-06, DT-16, DT-23, DT-26, DT-33 |
| [ADR-11](../Decisions/ADR-11.md) — solapamiento | *cierra* DT-12 ✅ (implementado el 2026-09-28) |
| [ADR-12](../Decisions/ADR-12.md) — outbox + planificador | *cierra* DT-27 ✅ (2026-10-03) · *contrae* DT-32, DT-33, DT-34 · *avanza* DT-19 · *aplaza* DT-11 (mecanismo decidido) |
| [ADR-13](../Decisions/ADR-13.md) — recordatorios | *cierra* DT-21 ✅ (2026-10-03) · *contrae* DT-35, DT-36, DT-37, DT-38, DT-39 · *avanza* DT-19 (verificada en producción; falta la fuente de logs) · *acepta como riesgo* DT-16 (política apagada) · *toca* DT-17, DT-23, DT-26, DT-29, DT-30 |
| [ADR-14](../Decisions/ADR-14.md) — calificación y riesgo (US-07.01 en producción desde el 2026-10-20) | *cierra* DT-11 ✅ (job G1 prendido el 2026-10-27) · *contrae* DT-48, DT-49 (previstas 1 y 4) y DT-50 (plan US-07.01, riesgo 9) · *detecta* DT-47 · *mantiene previstas* la 2 y la 3 (US-07.02 y US-07.03) · *toca* DT-13, DT-16, DT-23, DT-30, DT-44 |
| [ADR-15](../Decisions/ADR-15.md) — cuenta del profesional (aceptado 2026-10-31; implementado 2026-11-01, en `develop`) | *contrae* DT-59 (abierta desde el 2026-11-01) · *aplaza* DT-57 y DT-58 (decisiones P1 y P3) · *cierra en parte* DT-01 (implementado) · *toca* DT-02 (primera comprobación de rol), DT-03, DT-04, DT-26, DT-36, DT-46, DT-52, DT-53, DT-56 |
| Implementación de la Fase 7 (2026-11-01) | DT-60 (`Recortar` en tres copias) · *detecta* DT-61 (cuyo origen es el registro de us00a) |
| Decisión de producto 2026-09-30 (scoring a la v2, sin botones de asistencia) | DT-30 (mitigada el 2026-10-05 al revertir la decisión) |
| Puesta en producción de la Fase 2 (2026-10-07) | DT-40 (`registro` en producción), DT-41 (DMARC) |
| Implementación de la Fase 3 (2026-10-15) | DT-46 (entidades ORM sin `timestamptz`) |
| [Pre-análisis legal con IA](../Cumplimiento/pre-analisis-ia-2026-10-30.md) (2026-10-30; **no es un abogado**) — [Cumplimiento](../Cumplimiento/README.md) | *crea* DT-51, DT-52, DT-53, DT-54, DT-55, DT-56 (fichadas el 2026-10-31) · *amplía* DT-26 (a todos los datos) · *anota* DT-16 (la casilla no sirve de base) |
| [us00a](../Features/us00a-registro-inicial.md) — registro | DT-03, DT-06, DT-07, DT-09, DT-61 (detectada el 2026-11-01) |
| [us00b](../Features/us00b-login.md) — login | DT-03, DT-04 |
| [us06](../Features/us06-dashboard-citas.md) — dashboard | DT-12, DT-13, DT-15, DT-16, DT-20 |
| Transversal / RNF | DT-18, DT-19, DT-21 |
| Integración front ↔ back | DT-29 (ver también `citia-frontend/context/Deudas/`) |

---

## Por fase del roadmap

*(2026-09-30; Fase 2 actualizada el 2026-10-04 y el 2026-10-07; Fase 3, el 2026-10-15 y el 2026-10-17; Fase 5, el 2026-10-30; la fila transversal de Cumplimiento y la de la Fase 7, el 2026-10-31; la de la Fase 7 otra vez, el 2026-11-01.)* Qué deudas creó, cerró o movió cada fase. El detalle y el orden de lectura están en
la guía de cada una, en [`../Fases/`](../Fases/README.md).

| Fase | Creadas (origen) | Cerradas o mitigadas | Afectadas |
|---|---|---|---|
| [Fundaciones](../Fases/fase-base-fundaciones.md) | DT-01…DT-09, DT-18, DT-19, DT-21 | — | — |
| [Fase 0 — US-06](../Fases/fase-0-us06-dashboard.md) | DT-10…DT-17, DT-20, DT-22 | — | — |
| [Fase 1 — US-02](../Fases/fase-1-us02-gestion-citas.md) | DT-23…DT-29 | cierra DT-10, DT-22 y DT-12 (esta, implementada el 2026-09-28 y registrada el 2026-10-18) · mitiga DT-28 | DT-14 (avance parcial), DT-15, DT-18 (aceptada), DT-20 (avance) |
| [Fase 2 — US-03](../Fases/fase-2-us03-recordatorios.md) | DT-30 (diseño) · DT-31 (detectada) · DT-32…DT-39 (las previstas, contraídas al implementar) · DT-40, DT-41 (detectadas en producción, 2026-10-07) | **cierra** DT-21 y DT-27 (2026-10-03) · **mitiga** DT-30 (2026-10-05) · DT-19 verificada en producción, abierta por la fuente de logs | DT-11 (aplazada), DT-16 (política apagada), DT-17, DT-20 (avance), DT-23, DT-26, DT-29, DT-37 (webhook activo) |
| [Fase 3 — US-04](../Fases/fase-3-us04-respuesta-paciente.md) | DT-42…DT-45 (previstas el 2026-10-14, abiertas desde el despliegue del 2026-10-17; las previstas 3 y 4 de la propuesta de ADR-10 desaparecieron) · DT-46 (detectada al implementar, 2026-10-15) | DT-18 **en producción** (2026-10-17), se cierra con la prueba de `trust proxy` · DT-44 parte 2 resuelta y DT-45 con su corrección, antes de contraerse | DT-30 (ya mitigada el 2026-10-05; la confirmación del paciente reduce las `pendiente` vencidas) · DT-11 (regla G1, corte = despliegue de la fase) · DT-04, DT-06 (límite por IP, no por cuenta ni captcha), DT-16 (sigue como deuda), DT-23, DT-26, DT-33 |
| [Fase 4 — US-05](../Fases/fase-4-us05-alertas.md) | — | — | DT-28 (aviso al profesional) |
| [Fase 5 — US-07](../Fases/fase-5-us07-scoring.md) | DT-47 (detectada en US-07.01, 2026-10-19) · DT-48, DT-49, DT-50 (contraídas con US-07.01, fichadas el 2026-10-30) | **cierra** DT-11 (2026-10-27, job G1 prendido en production) | depende de DT-30 (mitigada el 2026-10-05; lo anterior a esa fecha no se recupera; la lista de citas pasadas sin cerrar es su punto 3) · DT-13, DT-23, DT-37, DT-40 · DT-44 (la decisión 8 de ADR-14 neutraliza su efecto en la calificación) |
| [Fase 7 — US-10](../Fases/fase-7-us10-perfil.md) (en producción desde el 2026-11-01; *antes: implementada, en `develop`; en diseño*) | DT-57, DT-58 (aplazadas) · DT-59 (prevista el 2026-10-31, abierta desde el 2026-11-01) · DT-60, DT-61 (detectadas al implementar, 2026-11-01) | DT-01 en parte (en producción desde el 2026-11-01: esa parte cuenta como cerrada; la severidad se revisa al cerrar la fase) | DT-01, DT-02 (primera comprobación de rol), DT-46 (sigue abierta), DT-03, DT-04, DT-26, DT-36, DT-52, DT-53, DT-56 (notas) |
| Transversal — [Cumplimiento](../Cumplimiento/README.md) (no es una fase) | DT-51…DT-56 (fichadas el 2026-10-31, del pre-análisis legal con IA del 2026-10-30) | — | DT-26 (ampliada a una política general de conservación) · DT-16 (nota) · la P3 es la condición del 🚧 de US-07.02 y US-07.03 (Fase 5) |

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

> **Actualizado 2026-10-15 (Fase 3 implementada y mergeada a `develop`):** [DT-18](DT-18.md)
> está implementada y se cierra al desplegar; lo que no cubre (bloqueo por cuenta, captcha, almacén
> compartido) sigue en [DT-04](DT-04.md) y [DT-06](DT-06.md). Al desplegar, lo que más conviene vigilar es
> [DT-45](DT-45.md): su corrección ya está en el código, pero `ENLACE_CITA_CLAVE` **no se copia entre
> entornos** (el patrón de DT-40). Nueva y menor: [DT-46](DT-46.md), que solo afecta a los tests.

> **Actualizado 2026-10-17 (Fase 3 en producción):** [DT-42](DT-42.md) a [DT-45](DT-45.md) pasan a
> `abierta`; [DT-18](DT-18.md) queda en producción y se cierra con la prueba de `trust proxy`. El release
> confirmó por qué importa la clave: el primer despliegue no recibió `ENLACE_CITA_CLAVE` y production cayó
> unos 9 minutos ([incidente](../Fases/fase-3-us04-respuesta-paciente.md#incidente-production-caído-9-minutos)).
> Con la Fase 3 en producción, DT-12, DT-23, DT-25 y DT-26 también se pusieron al día (2026-10-18).

> **Actualizado 2026-10-30 (US-07.01 en producción, job G1 prendido el 2026-10-27):** [DT-11](DT-11.md) **se
> cierra**: el `ghosting` ya se materializa solo. Se fichan [DT-48](DT-48.md), [DT-49](DT-49.md) y
> [DT-50](DT-50.md). Antes de **implementar** US-07.02 (calificación y riesgo) hay que corregir
> [DT-47](DT-47.md), porque la calificación lee el orden de la bitácora; y US-07.02 trae la salida ya decidida de
> [DT-48](DT-48.md) (corrección de un cierre dentro de 7 días), que conviene que llegue antes o junto con la
> calificación: es lo que impide que un cierre equivocado pese 12 meses. **Ese mismo día US-07.02 y US-07.03
> quedaron 🚧 bloqueadas, plan incluido**, hasta que un abogado revise el
> [contexto legal de ADR-14](../Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado): DT-47 y DT-48 siguen
> abiertas y esperan con US-07.02; ya no son pasos inmediatos. *Observación, sin decidir:* la corrección de DT-48
> no perfila al paciente y podría separarse de US-07.02 si el usuario lo quiere.

> **Actualizado 2026-10-31 (cumplimiento legal):** con el
> [pre-análisis legal hecho con una IA el 2026-10-30](../Cumplimiento/pre-analisis-ia-2026-10-30.md) (**no es un
> abogado ni una opinión legal**) se fichan seis deudas de cumplimiento, [DT-51](DT-51.md) a [DT-56](DT-56.md), y
> [DT-26](DT-26.md) pasa de las solicitudes a una política general de conservación por finalidad. Son de contratos,
> inventarios, políticas y procedimientos más que de código. **Antes de la primera clínica con pacientes reales
> conviene mirar las de P1:** [DT-51](DT-51.md) (contrato de encargo), [DT-52](DT-52.md) (proveedores y
> transferencias) y [DT-53](DT-53.md) (política de privacidad y derechos), que escalan a 🔴 ese día, y
> [DT-55](DT-55.md) (acreditación, incierta). Si P1 es condición para recibir a esa clínica, el usuario no lo ha
> decidido. [DT-16](DT-16.md) sigue en 🔴, con su revisión antes del 2026-12-01. Estado y prioridades en
> [Cumplimiento](../Cumplimiento/README.md).

> **Actualizado 2026-10-31 (Fase 7 en diseño):** el diseño de la [Fase 7](../Fases/fase-7-us10-perfil.md)
> ([ADR-15](../Decisions/ADR-15.md), propuesto) ataca por primera vez [DT-01](DT-01.md): cambiar la contraseña cortará
> las demás sesiones y un usuario borrado dejará de entrar; la renovación sigue pendiente. Ficha [DT-57](DT-57.md) y
> [DT-58](DT-58.md) (aplazadas) y [DT-59](DT-59.md) (prevista), y suma un flujo de datos nuevo, los mensajes a soporte,
> a [DT-26](DT-26.md), [DT-52](DT-52.md), [DT-53](DT-53.md) y [DT-56](DT-56.md). La casilla de soporte es un proveedor
> nuevo que entra a DT-52 **antes** de usarse.

> **Actualizado 2026-11-01 (Fase 7 implementada, en `develop` con el release a `main` abierto; en producción ese
> mismo día, release `cd659c1`):** la parte de
> revocación de [DT-01](DT-01.md) está en el código (corte al cambiar la contraseña y 401 para un usuario borrado); la
> severidad se revisa al cerrar la fase. [DT-59](DT-59.md) pasa a `abierta`. Dos menores detectadas al implementar:
> [DT-60](DT-60.md) (`Recortar` copiado) y [DT-61](DT-61.md) (el registro no tiene el tope de 72 bytes del cambio de
> contraseña). [Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte) sigue sin respuesta: sin
> `SOPORTE_CORREO_DESTINO`, el texto de los mensajes a soporte se queda en la base y todavía no llega a Resend ni a una
> casilla; cuando se cargue, la casilla tiene que estar ya en el inventario de [DT-52](DT-52.md).

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
> sus botones esperan a la Fase 3. *(2026-10-05: ya no; el voucher tiene Confirmar, Asistió y No asistió.)*

**ADR-09 cerró dos deudas y contrae seis.** Es un balance sano —las que cierra son de severidad alta
y las que contrae son medias o menos— pero conviene mirarlas antes de implementar, porque **tres se
resuelven mucho más barato durante que después**:

- [DT-27](DT-27.md) (publicar el hecho dentro de la transacción) es casi gratis mientras no haya
  ningún suscriptor, y caro de migrar con consumidores vivos.
- [DT-28](DT-28.md) es un **defecto de diseño**, no una limitación: la regla anti-spam, tal cual está
  escrita, bloquea de por vida a un paciente legítimo si el profesional abandona la bandeja.
- [DT-26](DT-26.md) (retención) es más fácil de decidir antes de acumular datos de salud de gente
  que nunca fue paciente, que después.
