# Cumplimiento: protección de datos personales (Ley 21.719, Ley 19.628 y Ley 20.584)

> **Fase:** — (transversal: no es una fase del roadmap; [ROADMAP § Cumplimiento](../ROADMAP.md#cumplimiento-ley-21719--transversal)) · **Feature:** [us11](../Features/us11-terminos-paciente.md) (términos del paciente) · **Plan:** [US-11](../US/11-terminos-paciente.md) · **Relacionado:** [ADR-16](../Decisions/ADR-16.md), [DT-62](../Deudas/DT-62.md), [DT-63](../Deudas/DT-63.md), [ADR-13 §2 y §12](../Decisions/ADR-13.md#12-contenido-y-privacidad), [ADR-14 § Contexto legal](../Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado), [DT-16](../Deudas/DT-16.md), [DT-26](../Deudas/DT-26.md), [DT-51](../Deudas/DT-51.md), [DT-52](../Deudas/DT-52.md), [DT-53](../Deudas/DT-53.md), [DT-54](../Deudas/DT-54.md), [DT-55](../Deudas/DT-55.md), [DT-56](../Deudas/DT-56.md), [Q17](../PREGUNTAS-ABIERTAS.md#q17--manejo-de-datos-de-salud)

> **Esto no es asesoría legal, y nada de lo que sigue está resuelto.** Al 2026-10-31 el usuario **no tiene
> abogado**. Esta carpeta ordena lo que se sabe a partir de un **pre-análisis legal hecho con una IA el
> 2026-10-30**, que **no es un abogado ni una opinión legal** (la propia IA lo presentó como un "dictamen
> preliminar, no vinculante"), y de la investigación del 2026-10-19 que alimentó el
> [contexto legal de ADR-14](../Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado). Sirve para llegar
> ordenado a un abogado, no para reemplazarlo. **Ninguna fila se da por cierta hasta esa revisión.**

**Creada:** 2026-10-31, cuando el usuario eligió *"documentar cumplimiento"* · **Última revisión:** 2026-11-14, en la
tarde (**US-11**, los términos del paciente y la prueba de su aceptación, **implementada en la rama
`feature/terminos-paciente`, sin release**: [ADR-16](../Decisions/ADR-16.md),
[feature](../Features/us11-terminos-paciente.md)) · *antes:* 2026-11-14 (la
**primera clínica con pacientes reales** está en production desde el 2026-11-11:
[abajo](#el-límite-real-la-primera-clínica-con-pacientes-reales)) · *antes:* 2026-11-01 (el
flujo de soporte de la Fase 7, **en producción** desde ese día, todavía sin casilla de destino:
[abajo](#lo-que-trae-la-fase-7-diseño-2026-10-31-implementación-2026-11-01)) · *antes:* 2026-11-01 (implementado y en
`develop`) · 2026-10-31 (el mismo flujo, en diseño)

---

## Qué hay en esta carpeta

| Archivo | Qué es |
|---|---|
| este README | el **estado vivo**: roles, vigencia, lo que Citia ya tiene, lo que falta por prioridad, las preguntas para el abogado y lo que el usuario no ha decidido. Se actualiza; lo que cambia queda como *Antes: …* |
| [`pre-analisis-ia-2026-10-30.md`](pre-analisis-ia-2026-10-30.md) | la **foto fechada** del pre-análisis: las respuestas a las 13 preguntas, resumidas, con sus matices, el dictamen general y las fuentes. **No se edita** |
| [`borrador-terminos-paciente.md`](borrador-terminos-paciente.md) | *(2026-11-14)* el **borrador v0.2** de los términos de uso y del aviso de privacidad que autoriza el paciente, con el texto de la casilla y el del alta manual. Sus 7 decisiones las confirmó el usuario el 2026-11-14; lleva también lo que falta para publicarlo. **Es un antecedente:** se publicó como la **1.0** del [plan US-11](../US/11-terminos-paciente.md#el-texto-que-se-publica) el 2026-11-16 ([copia congelada](terminos-paciente-v1.0.md)) |
| [`terminos-paciente-v1.0.md`](terminos-paciente-v1.0.md) | *(2026-11-15)* la **copia congelada** del texto 1.0, publicada el 2026-11-16 (la página dijo «15 de noviembre» hasta la corrección del 2026-11-17), con los textos cortos (casilla, tarjeta de `/cita` y alta manual). **No se edita**: es la prueba de qué decía la versión que alguien aceptó ([ADR-16 §1](../Decisions/ADR-16.md#1-el-texto-terminos-versión-10-genérico-d2-d8-d9)) |

Lo que falta vive en sus deudas ([`Deudas/`](../Deudas/README.md)) y, si algo se decide, irá en un ADR. Esta carpeta
no reemplaza a ninguno de los dos: es la entrada.

**Leyenda** (la misma de la investigación del 2026-10-19): ✅ verificado en el texto oficial (BCN) · 🟡 solo en
fuente secundaria · ❓ inferencia o dato sin verificar.

---

## El límite real: la primera clínica con pacientes reales

El pre-análisis llama a su prioridad 1 "bloqueante para producción". Pero Citia **ya está en producción** (el MVP,
desde el release del 2026-10-06) y, al 2026-10-31, **sin clínicas reales**: lo que hay en production son pruebas
del usuario. El límite que importa es **la primera clínica con pacientes reales**. Desde ese día Citia trata datos
de pacientes por cuenta de alguien, y lo que hoy es preparación pasa a ser obligación.

> **2026-11-14 — el límite ya se cruzó.** El **2026-11-11** se creó en production la **primera cuenta de una persona
> real**. Ese día se crearon tres cuentas con un comando de PowerShell; las otras dos son pruebas del usuario. El
> 2026-11-14 el usuario confirmó que esa cuenta **ya agenda pacientes reales**. Es un **piloto de prueba**: la cuenta
> es de una psicóloga amiga del usuario, que la usa con sus pacientes. Desde el 2026-11-11, entonces:
>
> - **Citia trata datos de pacientes reales por cuenta de una clínica**, sin el P1 hecho: no hay contrato de encargo
>   ([DT-51](../Deudas/DT-51.md)), inventario de proveedores con garantías ([DT-52](../Deudas/DT-52.md)), política de
>   privacidad ni procedimiento de derechos ([DT-53](../Deudas/DT-53.md)). Tampoco se sabe el alcance del art. 10 bis
>   ([DT-55](../Deudas/DT-55.md)), y el consentimiento de los recordatorios sigue siendo una casilla que no sirve de base
>   ([DT-16](../Deudas/DT-16.md)).
> - **DT-51, DT-52 y DT-53 suben a 🔴 alta y DT-56 a 🟠 media**, como ellas mismas lo tenían previsto para este día.
>   DT-54 sube solo si esa clínica atiende a menores (sin confirmar).
> - **Sus pacientes pasan por todo el sistema.** Los recordatorios salen por Resend, G1 cierra sus citas sin respuesta
>   y US-07.01 guarda hechos de asistencia (la bitácora y la primera apertura del enlace). Según el pre-análisis, la
>   asistencia puede ser un dato sensible de salud (A1). La calificación (US-07.02) sigue 🚧 bloqueada: esos hechos se
>   guardan, pero no se usan para perfilar.
> - **La Ley 21.719 rige el 2026-12-01** mientras no se publique la postergación ([abajo](#vigencia-verificada-el-2026-10-30)).
> - Que **P1 fuera condición para recibir la primera clínica** ya no se puede decidir. **El usuario decidió el
>   2026-11-14** abordar el P1 **sin abogado por ahora** y sin pausar el piloto. Empieza por los **términos y el
>   consentimiento que autoriza el paciente**: [borrador](borrador-terminos-paciente.md), con sus decisiones confirmadas el mismo día.
>
> - **Los términos del paciente están construidos (2026-11-14), sin release.** [ADR-16](../Decisions/ADR-16.md) se
>   aceptó ese día y US-11 quedó implementada en la rama `feature/terminos-paciente`, verificada en local: el texto 1.0
>   en `/terminos`, la prueba de cada aceptación en `aceptaciones_terminos` y el rechazo de `consentimiento: false` en
>   el backend. Detalle en la [feature](../Features/us11-terminos-paciente.md). Los pacientes del piloto **no se
>   rellenan**: aceptan en `/cita` cuando les llegue un recordatorio.
>
> *Antes (2026-10-31 → 2026-11-14): "**Si P1 es condición para recibir a esa primera clínica, el usuario no lo ha
> decidido**".*

---

## Roles (según el pre-análisis; sin confirmar)

| Quién | Rol | Por qué | Qué lo cambiaría |
|---|---|---|---|
| **La clínica** (el tenant) | **responsable** de los datos de sus pacientes | decide los fines y los medios del tratamiento (Ley 21.719, art. 2 ✅). La Ley 20.584, art. 3, hace al prestador responsable de las bases que genera con sus sistemas de apoyo, y al proveedor, mandatario ✅ (❓ si ese artículo alcanza a un software de agenda) | — |
| **Citia** | **encargado**: trata los datos por cuenta de la clínica | Ley 21.719, art. 15 bis ✅ | usar los datos para **fines propios**: entrenar modelos con datos identificables, perfiles comerciales, compartir entre clínicas o analítica propia. Entonces "se le considerará como responsable" y responde solidariamente por los daños (art. 15 bis ✅) |
| **Resend, Railway, Netlify y Better Stack** | **subencargados** de Citia (❓ lectura de esta documentación sobre el modelo del pre-análisis) | tratan datos por cuenta de Citia | — · el contrato con la clínica tiene que autorizarlos por escrito ([DT-51](../Deudas/DT-51.md), [DT-52](../Deudas/DT-52.md)) |

**Dos observaciones de esta documentación (2026-10-31) que el pre-análisis no trató:**

1. **Las cuentas de los profesionales** (nombre, correo y contraseña de quien se registra: `usuarios` y `tenants`)
   las trata Citia para dar su propio servicio. Ahí Citia sería **responsable**, no encargado (❓), y necesitaría
   su propia información de privacidad ([DT-53](../Deudas/DT-53.md)).
2. **`supresiones_correo` es global, no por clínica, y a propósito**
   ([ADR-13 §2](../Decisions/ADR-13.md#2-tablas)): el remitente es uno solo y la reputación ante los proveedores
   de correo es de toda la plataforma. Guarda solo el hash SHA-256 del correo, pero un rebote o una queja en un
   recordatorio de la clínica A deja sin recordatorios a esa dirección también en la clínica B. **Es el único dato
   que hoy produce un efecto entre clínicas.** Si es un fin propio de Citia o parte del encargo es una pregunta
   para el abogado y una cláusula del contrato (❓, [DT-51](../Deudas/DT-51.md)).

---

## Vigencia (verificada el 2026-10-30)

- **Ley 21.719:** publicada el 2024-12-13; rige el **2026-12-01** (art. 1.º transitorio) ✅.
- **Postergación (boletín 18.623-07):** el Senado la aprobó el **2026-10-29** (33 votos a 6) con la fecha
  **2027-10-15** (el Ejecutivo proponía el 2027-12-01), y pasó a la **Cámara** 🟡 (Garrigues, La Tercera y El
  América, 29-10-2026). **Mientras no se publique, la fecha legal sigue siendo el 2026-12-01.**
- **Criterio de trabajo** (el del pre-análisis): el escenario más exigente, el **2026-12-01**. Al 2026-10-31
  faltan 31 días.
- **Lo que ya rige hoy**, con o sin postergación: la **Ley 19.628** (datos sensibles solo con ley, consentimiento o
  para beneficios de salud, art. 10; uso solo para los fines de la recolección, art. 9; **mandato por escrito**
  que fije las condiciones de uso, art. 8 ✅) y la **Ley 20.584** (la ficha clínica es dato sensible y tiene
  destinatarios limitados, arts. 12 y 13 ✅).
- **Decreto 662** (Hacienda, publicado el **2026-09-09**; BCN, idNorma 1227971): reglamento de los modelos de
  prevención de infracciones. Su **certificación es voluntaria**, la pide el responsable ante la Agencia, dura 3
  años y se inscribe en el Registro Nacional de Sanciones y Cumplimiento; el delegado de protección de datos es
  obligatorio **solo para certificar**. 🟡 Al 2026-10-11 la Agencia no estaba plenamente instalada.
- **Multas:** leves hasta 5.000 UTM, graves hasta 10.000 y gravísimas hasta 20.000 (art. 35 ✅). En los primeros 12
  meses, a las empresas de menor tamaño la Agencia puede aplicar solo amonestación escrita (art. sexto transitorio
  ✅; ❓ no se revisó si Citia o cada clínica califican).

---

## Lo que Citia ya tiene

*(Lectura del código del backend y de los ADR, 2026-10-31, sin ejecutar tests. Que algo exista no significa que
baste: eso lo dice el abogado.)*

| Qué | Dónde | Límite conocido |
|---|---|---|
| **Correo mínimo.** El recordatorio no lleva nombre, RUT, teléfono ni correo del paciente en el cuerpo, ni tipo de consulta, motivo, estado o historial; el asunto es neutro, sin el nombre del profesional ni de la organización | [ADR-13 §12](../Decisions/ADR-13.md#12-contenido-y-privacidad) · `recordatorio/application/plantilla-recordatorio.ts` | Resend recibe igual el **correo del paciente** (destinatario), el nombre del profesional y de la organización (que puede delatar la especialidad), la fecha y hora, el teléfono de contacto de la clínica y el **enlace con el token** de la Fase 3. El seguimiento de aperturas y clics está apagado por diseño, **sin confirmar en el panel** ([stack](../stack-tecnologico.md#infraestructura-en-producción-2026-10-07), [DT-52](../Deudas/DT-52.md)) |
| **Recordatorios sin destinatario ni contenido guardados**: solo estado, fechas e id del proveedor | [ADR-13 §2](../Decisions/ADR-13.md#2-tablas) | sin plazo de conservación ([DT-26](../Deudas/DT-26.md)) |
| **Logs sin datos del paciente.** Nunca el destinatario ni el cuerpo; redacción por nombre de campo (`correo`, `rut`, `telefono`, `nombreCompleto`, `destinatario`, `cuerpo`, `body`, credenciales y tokens; desde la Fase 7, también `contrasenaActual`, `contrasenaNueva` y `mensaje`); de cada petición solo método, ruta, query y cabeceras inocuas, **sin la IP** | [ADR-13 §12 y §16](../Decisions/ADR-13.md#16-observabilidad-avanza-dt-19) · `shared/infrastructure/observabilidad/opciones-logger.ts` · `test/logs-redaccion.e2e-spec.ts` | sí llevan **ids** (UUID de cita, tenant, recordatorio y hecho; el del paciente en la ruta de `PATCH /api/pacientes/:id`), que son seudónimos (❓ siguen siendo datos personales). La redacción no cubre lo que se escriba dentro del texto del mensaje: es una convención del código, no un control. Hoy los logs solo llegan a Railway ([DT-52](../Deudas/DT-52.md)) |
| **Aislamiento por clínica.** `tenant_id` obligatorio en `pacientes`, `citas`, `cambios_cita`, `solicitudes_cita`, `enlaces_cita` y `recordatorios`; un paciente es único por clínica y RUT (`uq_paciente_tenant_rut`): el mismo RUT en dos clínicas son dos pacientes sin relación. Los lectores SQL que cruzan módulos también filtran por tenant ([DT-50](../Deudas/DT-50.md)) | migraciones de `src/database/migrations/` | la excepción deliberada de `supresiones_correo` ([arriba](#roles-según-el-pre-análisis-sin-confirmar)). Los jobs del planificador barren todas las clínicas a la vez, a propósito ([ADR-12 §6](../Decisions/ADR-12.md)), pero cada fila conserva su tenant |
| **Nada compartido entre clínicas** para la calificación, y solo con lo que el paciente hizo en esa clínica: nunca edad, sexo, comuna, previsión ni tipo de consulta | [ADR-14, decisiones 7 y 11](../Decisions/ADR-14.md#11-datos-entre-clínicas) (confirmada el 2026-10-30) | — |
| **Nunca restringir**: la calificación solo informaría, ayudaría al paciente a llegar y sugeriría; no libera horas, no bloquea ni exige condiciones | [ADR-14, decisión 6](../Decisions/ADR-14.md#6-acciones-permitidas-informar-ayudar-a-llegar-sugerir-nunca-restringir) | — |
| **No hay calificación en producción.** US-07.02 y US-07.03 están 🚧 **bloqueadas desde el 2026-10-30, plan incluido**: hoy no se perfila a nadie | [ADR-14 § Contexto legal](../Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado) · [Fase 5](../Fases/fase-5-us07-scoring.md#bloqueo-de-us-0702-y-us-0703-2026-10-30) | US-07.01 **sí** registra hechos (primera apertura del enlace, origen de la cita, quién pidió cada cambio, cierre automático como `ghosting`). Son registros de agenda, no un perfil, pero la apertura del enlace es una forma de seguimiento que la clínica debe informar ([ADR-14, *Consecuencias*](../Decisions/ADR-14.md#consecuencias); [DT-53](../Deudas/DT-53.md)) |
| **Política de consentimiento de los recordatorios**, implementada y apagada | [DT-16](../Deudas/DT-16.md) | no es una base de licitud: la casilla única no sirve (pre-análisis, pregunta A6) |
| **Medidas de seguridad del enlace del paciente**: el token va en el fragmento de la URL (el navegador no lo manda al abrir la página), se guarda como hash, se revoca, el 404 es uniforme y hay límite de tasa | [ADR-10](../Decisions/ADR-10.md) · [DT-18](../Deudas/DT-18.md) | existen en el código, pero no hay una política de seguridad escrita ([DT-56](../Deudas/DT-56.md)) |
| **Un plazo de conservación**: los hechos del outbox ya entregados se borran a los 14 días | [DT-26](../Deudas/DT-26.md) (nota del 2026-10-04) | es el único: nada más tiene plazo |

---

## Lo que falta, por prioridad

*(Prioridades del pre-análisis, con el matiz del límite real. Al 2026-10-31 ninguna está empezada. 2026-11-14: DT-53 y
DT-16 avanzan con US-11, en la rama `feature/terminos-paciente`, sin release.)*

### P1 — antes de la primera clínica con pacientes reales

| Qué | Deuda | Nota |
|---|---|---|
| Fijar el rol (Citia encargado, la clínica responsable) en un **contrato de encargo** | [DT-51](../Deudas/DT-51.md) | la Ley 19.628 ya exige hoy el mandato por escrito (art. 8) |
| **Inventario de proveedores**: qué datos recibe cada uno, en qué país, con qué **DPA** y con qué garantía para la transferencia internacional | [DT-52](../Deudas/DT-52.md) | Resend, Railway, Netlify y Better Stack |
| **Política de privacidad** y **procedimiento para los derechos** del paciente | [DT-53](../Deudas/DT-53.md) | la publica la clínica; Citia le da el material y el apoyo, y tiene su propia política para las cuentas de los profesionales · *(2026-11-14)* el texto para el paciente, 1.0, está en la rama de US-11 ([ADR-16](../Decisions/ADR-16.md)); el procedimiento de derechos sigue sin hacer, y el retiro de la autorización no se registra ([DT-62](../Deudas/DT-62.md)) |
| **Alcance del art. 10 bis** de la Ley 20.584 (acreditación de plataformas de salud digital) | [DT-55](../Deudas/DT-55.md) | consultar al Minsal. P1 es *saber si aplica*, no necesariamente acreditarse |
| Aislamiento por clínica | — | ✅ ya existe, con la observación de `supresiones_correo` |
| Revisar el consentimiento de los recordatorios | [DT-16](../Deudas/DT-16.md) | sus disparadores de revisión ya eran el 2026-12-01 y "la entrada del primer cliente real" · *(2026-11-14)* con US-11, en la rama: el backend rechaza `consentimiento: false` y guarda qué versión se aceptó, cuándo y por dónde; la política de los recordatorios sigue apagada |

### P2 — durante la preparación

| Qué | Deuda |
|---|---|
| Política de **conservación y eliminación** por finalidad | [DT-26](../Deudas/DT-26.md) (ampliada el 2026-10-31) |
| Medidas de seguridad documentadas, **gestión de incidentes** y **programa interno** de cumplimiento | [DT-56](../Deudas/DT-56.md) |
| Reglas para **menores de edad** y sus representantes | [DT-54](../Deudas/DT-54.md) |
| Registro de proveedores y subencargados, mantenido al día | [DT-52](../Deudas/DT-52.md) (su parte continua) |

### P3 — antes de desbloquear US-07.02 y US-07.03

No hay deuda nueva: es la condición del bloqueo y vive en
[ADR-14 § Contexto legal](../Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado).

- **Finalidad sanitaria admisible** (art. 16 bis, inciso 1) y **base jurídica**: la casilla de
  [DT-16](../Deudas/DT-16.md) no sirve.
- **Riesgos del perfilamiento** y **evaluación de impacto** (art. 15 ter): la aprueba la clínica; Citia prepararía
  una evaluación técnica de su funcionalidad que cada clínica revisa y adopta.
- **Información al paciente** (art. 14 ter, letra l) y **acceso a su etiqueta**, aunque no la vea en la interfaz.
- **Intervención humana real** (art. 8 bis) y las consecuencias de cada etiqueta
  ([decisión 6](../Decisions/ADR-14.md#6-acciones-permitidas-informar-ayudar-a-llegar-sugerir-nunca-restringir)).

---

## Lo que trae la Fase 7 (diseño 2026-10-31, implementación 2026-11-01)

*(Implementado y **en producción** desde el 2026-11-01: [ADR-15](../Decisions/ADR-15.md) y sus
[notas de implementación](../Decisions/ADR-15.md#notas-de-implementación-2026-11-01), plan
[US-10](../US/10-perfil-cuenta.md), feature [us10-perfil-cuenta](../Features/us10-perfil-cuenta.md). Sin
`SOPORTE_CORREO_DESTINO` en production, el texto de los mensajes a soporte se queda en la base y todavía no llega a
Resend ni a una casilla. Antes: "implementado, en `develop` (staging) con el release a `main` abierto"; antes: "en
diseño, sin implementar".)* La Fase 7 no toca los datos de los pacientes,
pero suma un **flujo de datos nuevo** y dos datos de las cuentas:

| Qué | Qué datos | Adónde van | Deuda |
|---|---|---|---|
| **Mensajes a soporte** | el texto que escribe el profesional (hasta 2000 caracteres), una categoría, su nombre, correo y rol, y el nombre y el slug de su organización | la base (`mensajes_soporte`, Railway), **Resend** (por primera vez con texto libre en el cuerpo) y **la casilla de soporte**, un proveedor nuevo sin decidir ([Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte)). **Nunca a los logs** | [DT-52](../Deudas/DT-52.md) (inventario: la casilla entra **antes** de usarse), [DT-26](../Deudas/DT-26.md) (sin plazo), [DT-56](../Deudas/DT-56.md) (la casilla en los incidentes) |
| **Especialidad del profesional** | texto libre opcional | solo la base; se muestra solo en su perfil, nunca al paciente (podría delatar su condición) | — (dato de la cuenta) |
| **Corte de sesiones** | la fecha del último cambio de contraseña | solo la base | — |

- **El riesgo del texto libre.** Aunque el formulario avisa *"No incluyas datos de tus pacientes"*, un profesional
  puede escribir un nombre, un RUT o un diagnóstico. Esos datos **saldrían del encargo** (Citia los recibiría para
  darle soporte al profesional, no para la clínica) y quedarían en Resend y en la casilla. El backend no los filtra:
  detectar un RUT en texto libre daría falsos positivos y una falsa seguridad. Lo que queda es el aviso, la política
  ([DT-53](../Deudas/DT-53.md)) y un plazo de conservación ([DT-26](../Deudas/DT-26.md)).
- **El rol de Citia** con los mensajes de los profesionales sería el de **responsable** (❓, la observación 1 de
  [Roles](#roles-según-el-pre-análisis-sin-confirmar)).

**Cómo quedó en el código (2026-11-01)** — lectura del código, sin las pruebas de integración y e2e, que estaban en
curso:

- **Los logs nunca llevan el texto.** Los eventos de soporte registran solo ids, la categoría, estados y códigos. Además,
  la clave `mensaje` está en la lista de campos que se redactan **en cualquier log**: si alguien registrara un objeto
  con el texto bajo esa clave, saldría tachado. Es un control por nombre de campo, no por contenido: el texto bajo otra
  clave no se tacharía. El e2e de soporte comprueba que los logs capturados no contienen el texto.
- **`ultimo_error` guarda solo un código** (el nombre del error o el código del proveedor), nunca un mensaje de error
  que pudiera repetir el texto. Los errores de validación tampoco repiten el texto recibido.
- **Mientras no se cargue `SOPORTE_CORREO_DESTINO`** ([Q19](../PREGUNTAS-ABIERTAS.md#q19--casilla-de-soporte), sin
  respuesta), el texto **se queda en la base** (Railway) y no llega a Resend ni a ninguna casilla: los mensajes esperan
  en `pendiente`. Al cargarla, salen todos los acumulados (20 por minuto). **La casilla tiene que estar en el inventario
  de [DT-52](../Deudas/DT-52.md) antes de cargar la variable**, no después.
- **En staging** (`MENSAJERIA_ADAPTADOR=registro`), un mensaje queda `enviado` sin haber salido ([DT-40](../Deudas/DT-40.md)).
- **La contraseña** nunca va a los logs (`contrasenaActual` y `contrasenaNueva` se redactan) y el corte de sesiones solo
  registra ids y un motivo (`auth.sesion_cortada`).
- **Conservación:** sin plazo, como estaba previsto ([DT-26](../Deudas/DT-26.md), [pregunta 5 del plan](../US/10-perfil-cuenta.md#preguntas-abiertas)
  sin respuesta). El `down` de la migración `1750000020000` borra todos los mensajes: no es una herramienta de
  conservación.

## Preguntas para el abogado

### Bloque A — la calificación (US-07.02 y US-07.03)

Son las seis de [ADR-14 § Contexto legal](../Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado); no se
copian aquí. **Ojo con la numeración:** el pre-análisis numeró su bloque A de otra forma (su A3 es el art. 8 bis y
su A6, la base de licitud, que en ADR-14 son filas de la tabla y no preguntas). La correspondencia está en el
[pre-análisis](pre-analisis-ia-2026-10-30.md#correspondencia-con-las-preguntas-de-adr-14).

### Bloque B — Citia como plataforma

*(Las formuladas al pre-análisis, reescritas como preguntas para el abogado. Lo que respondió la IA, en el
[pre-análisis](pre-analisis-ia-2026-10-30.md#bloque-b--citia-como-plataforma).)*

7. **Rol.** ¿Citia es encargado frente a cada clínica? ¿El art. 3 de la Ley 20.584 alcanza a un software de agenda?
   ¿Qué usos convertirían a Citia en responsable?
8. **Contrato de encargo** (art. 15 bis). ¿Qué cláusulas mínimas necesita? ¿Sirven de base las quince que propone el
   pre-análisis ([DT-51](../Deudas/DT-51.md))? ¿Publicó ya la Agencia un modelo tipo?
9. **Transferencias internacionales** (arts. 27 y 28). ¿Qué mecanismo vale para Resend, Railway, Netlify y Better
   Stack? ¿Basta un DPA pensado para el RGPD? ¿Qué hay que informarle al paciente?
10. **Acreditación** (Ley 20.584, art. 10 bis). ¿Alcanza a una agenda en línea que guarda datos de pacientes? ¿Existe
    el reglamento del Minsal?
11. **Conservación y menores.** ¿Qué plazo corresponde a cada finalidad (historial de citas, inasistencias, logs,
    pacientes eliminados) frente a los 15 años de la ficha clínica (Ley 20.584, art. 13)? ¿Cómo se identifica al
    representante de un menor y se documenta su autorización (art. 16 quáter)?
12. **Vigencia.** ¿Qué cambia si se publica la postergación al 2027-10-15? ¿Qué de todo esto exigen ya la Ley 19.628 y
    la Ley 20.584?
13. **Modelo de prevención** (Decreto 662). ¿Conviene un programa interno ahora y certificar después? ¿Puede
    certificar un encargado, o solo el responsable?

### Fuera de los bloques

- *(Observaciones de esta documentación, 2026-10-31, sin pre-análisis.)* ¿Es Citia responsable de los datos de las
  cuentas de los profesionales? ¿La lista global de supresiones de correo es un fin propio de Citia o parte del
  encargo, y debe nombrarla el contrato?
- *(Del diseño de la Fase 7, 2026-10-31; implementado el 2026-11-01.)* Si un profesional escribe datos de un paciente en un mensaje a soporte,
  ¿qué rol tiene Citia sobre ellos, cuánto puede guardarlos y basta el aviso del formulario?
- *(De la investigación del 2026-10-19 que el pre-análisis no cubrió.)* El secreto profesional (Código Penal, Código
  Sanitario, ética profesional) y qué cambió la Ley 21.806.
- **Bloque C (datos entre clínicas): retirado.** Lo resolvió
  [ADR-14, decisión 11](../Decisions/ADR-14.md#11-datos-entre-clínicas): nada compartido. El pre-análisis estuvo de
  acuerdo, con la condición de que el sistema lo impida (aislamiento y acceso por clínica, consultas filtradas, logs
  y telemetría, y un contrato que prohíba reutilizar).

---

## Lo que el usuario no ha decidido

*(Al 2026-10-31; el punto 1 cambió el 2026-11-14.)*

1. ✅ **Decidido el 2026-11-14:** con el piloto de la primera clínica con pacientes reales ya en marcha (desde el
   2026-11-11), el P1 se aborda **sin abogado por ahora** y **sin pausar el piloto**. Se empieza por los términos y el
   consentimiento que autoriza el paciente ([borrador](borrador-terminos-paciente.md)). *Antes (2026-10-31 →
   2026-11-14): "Si P1 es condición para recibir la primera clínica con pacientes reales. No está decidido en ningún
   sentido." Esa decisión ya no se podía tomar: la clínica entró antes.*
2. **Quién es el responsable de cumplimiento**, la primera pieza del programa interno ([DT-56](../Deudas/DT-56.md)).
3. **Cuándo redactar el contrato de encargo** ([DT-51](../Deudas/DT-51.md)). La política de privacidad para el
   paciente ([DT-53](../Deudas/DT-53.md)) **empezó el 2026-11-14**, con el [borrador](borrador-terminos-paciente.md),
   y ese mismo día quedó implementada como US-11 en su rama, sin release.
   *Antes: "Cuándo redactar la política de privacidad y el contrato de encargo. El 2026-10-31 el usuario eligió
   documentar, no redactar."*
4. **Cuándo, y con quién, la revisión de un abogado**: sin fecha, como dice
   [ADR-14](../Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado).

---

## Cómo se mantiene

- **Cuando un abogado revise algo:** anotar la fecha y qué confirmó o corrigió, cambiar los ❓ y 🟡 que correspondan y
  dejar lo anterior como *Antes: …*. Nada se borra.
- **Cuando una deuda de la lista cambie o se cierre:** actualizar su fila aquí, en el
  [índice de deudas](../Deudas/README.md) y en el [ROADMAP § Cumplimiento](../ROADMAP.md#cumplimiento-ley-21719--transversal).
- **El pre-análisis no se edita:** si hay otro, va en un archivo nuevo, con su fecha.
