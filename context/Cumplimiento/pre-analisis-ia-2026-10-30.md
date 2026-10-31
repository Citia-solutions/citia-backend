# Pre-análisis legal con una IA (2026-10-30)

> **Fase:** — (transversal: [Cumplimiento](README.md)) · **Feature:** — · **Plan:** — · **Relacionado:** [ADR-14 § Contexto legal](../Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado), [ADR-13 §12](../Decisions/ADR-13.md#12-contenido-y-privacidad), [DT-16](../Deudas/DT-16.md), [DT-26](../Deudas/DT-26.md), [DT-51](../Deudas/DT-51.md), [DT-52](../Deudas/DT-52.md), [DT-53](../Deudas/DT-53.md), [DT-54](../Deudas/DT-54.md), [DT-55](../Deudas/DT-55.md), [DT-56](../Deudas/DT-56.md)

> **No es un abogado ni una opinión legal.** El 2026-10-30 el usuario le pidió a una IA que respondiera, "como
> abogado especializado en protección de datos", las preguntas que tenía preparadas para un abogado. La propia IA
> presentó sus respuestas como un "dictamen preliminar, no vinculante". Al 2026-10-30 el usuario no tiene abogado.
> Este documento es un **insumo ordenado para cuando lo haya**: no resuelve nada, y nada de lo que dice se da por
> cierto.

**Foto fechada.** Resume, con palabras de esta documentación, las respuestas del 2026-10-30 tal como las recogió
la sesión que acompañó al usuario; no copia el texto de la IA y **no se actualiza**. El estado vivo, con lo que
cambie después, está en el [README de Cumplimiento](README.md).

---

## Qué se preguntó

Trece preguntas en dos bloques, más un tercero para retirar:

- **A** (A1 a A6): la calificación del paciente, US-07.02 y US-07.03.
- **B** (B7 a B13): Citia como plataforma, califique o no a alguien.
- **C**: las preguntas sobre datos entre clínicas, para confirmar que se podían retirar.

La lista exacta que se le dio a la IA no está en el repo. Su bloque A **no coincide en numeración** con las seis
preguntas de [ADR-14](../Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado): ver la
[correspondencia](#correspondencia-con-las-preguntas-de-adr-14).

## El criterio de la IA

Separar dos cosas: **Citia como plataforma**, cuyas obligaciones existen aunque nunca califique a nadie, y **Citia
calificando pacientes**, que suma riesgos propios: datos sensibles, perfilamiento y decisiones automatizadas.
Recomendó no frenar la plataforma y sí la calificación, hasta que tenga fundamento jurídico.

**Ese mismo día el usuario bloqueó US-07.02 y US-07.03, plan incluido**
([ADR-14](../Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado),
[Fase 5](../Fases/fase-5-us07-scoring.md#bloqueo-de-us-0702-y-us-0703-2026-10-30)).

---

## Bloque A — la calificación

| # | Tema | Lo que respondió la IA (resumen) | Matiz de esta documentación |
|---|---|---|---|
| A1 | ¿La asistencia a una hora es un dato de salud? ¿Es ficha clínica? | Puede ser un **dato sensible relativo a la salud por el contexto**: revela que la persona se atiende con un profesional de la salud. Eso no convierte cada evento de la agenda en ficha clínica (Ley 20.584, art. 12): una cancelación se parece más a un registro administrativo, y la asistencia y las faltas repetidas podrían importar para la atención según cómo se usen. Propone separar la agenda, la asistencia y el perfil derivado, con finalidades, permisos y plazos distintos; separarlos no los vuelve no sensibles | Citia ya separa la cita (`citas`) de sus hechos (`cambios_cita`, la bitácora), y la calificación de ADR-14 se calcularía desde los hechos. Lo que no existe son los plazos distintos ([DT-26](../Deudas/DT-26.md)) |
| A2 | Art. 16 bis, inciso 1 | **Riesgo jurídico alto.** Los datos de salud se tratan solo para los fines de las leyes sanitarias. Gestionar la asistencia (la agenda, la continuidad de la atención) tiene una justificación razonable; **perfilar para anticipar la conducta** es una inferencia nueva que esa finalidad no habilita por sí sola, y el consentimiento no salva cualquier finalidad. Para avanzar habría que mostrar qué decisión concreta mejora, que es necesario y proporcionado, cómo encaja en las normas sanitarias y con qué base jurídica válida | Es el motivo principal del bloqueo |
| A3 | Art. 8 bis: ¿basta con que el sistema sugiera y el profesional decida? | Solo si la **intervención humana es real**: antecedentes verificables, el profesional puede rechazar la sugerencia, la interfaz no empuja a aceptarla y no hay restricciones automáticas. "Afectar significativamente" se mide por las consecuencias: un aviso interno o pedir que confirme es riesgo menor; cobrar un anticipo, bajar la prioridad, impedir reservar o rechazar, alto o muy alto. La clasificación debe ser informativa | Coincide con [ADR-14, decisión 6](../Decisions/ADR-14.md#6-acciones-permitidas-informar-ayudar-a-llegar-sugerir-nunca-restringir): nunca restringir |
| A4 | Evaluación de impacto (art. 15 ter) | Recomienda hacerla. La aprueba **la clínica**, que es la responsable; Citia prepara una evaluación técnica general de su funcionalidad que cada clínica revisa y adopta | — |
| A5 | Información y acceso (art. 14 ter, letra l) | La política de privacidad tiene que decir que la clasificación existe, qué datos usa, cómo se calcula, con qué umbrales, para qué, quién la ve, en qué decisiones influye y cómo pedir que se revise. Que el paciente no vea su etiqueta **no le quita el derecho de acceso**: hay que poder entregarle su categoría, los antecedentes usados y una explicación significativa del criterio, no el código | Entrada para el plan de US-07.02 cuando se desbloquee: la etiqueta no se guarda (ADR-14, opción C1), así que tiene que poder calcularse y entregarse a pedido |
| A6 | ¿Sirve la casilla de consentimiento como base legal? | **No** ([DT-16](../Deudas/DT-16.md)): no acredita que el paciente haya manifestado nada ni para qué, no separa la agenda del perfilamiento y no deja evidencia. Si existiera una finalidad sanitaria admisible, habría que ver si hay habilitación legal o, si no, un consentimiento expreso, específico, informado, revocable y con evidencia | Confirma lo que ADR-14 ya decía |

---

## Bloque B — Citia como plataforma

La IA lo consideró **más urgente que la calificación**.

| # | Tema | Lo que respondió la IA (resumen) | Matiz de esta documentación | Deuda |
|---|---|---|---|---|
| B7 | Rol | Citia **encargado** y la clínica **responsable**. Encaja con la Ley 20.584, art. 3: el prestador responde de las bases generadas con sistemas de apoyo y el proveedor es mandatario. Citia pasa a ser responsable si usa los datos para fines propios: entrenar modelos con datos identificables, armar perfiles comerciales, compartir entre clínicas o hacer analítica propia. Hay que separar finalidades y roles en el contrato | No trató dos cosas: las cuentas de los profesionales, donde Citia sería responsable, y la lista global de supresiones de correo ([README](README.md#roles-según-el-pre-análisis-sin-confirmar)) | [DT-51](../Deudas/DT-51.md) |
| B8 | Contrato de encargo (art. 15 bis) | Debe fijar objeto, duración, finalidad, tipos de datos, categorías de titulares, derechos y obligaciones, y la autorización escrita para subencargar. La Agencia publicará modelos tipo; **no hay que esperarlos**. Propone quince cláusulas (la lista, en [DT-51](../Deudas/DT-51.md)). La clave: **Citia no usa los datos para fines propios** | — | [DT-51](../Deudas/DT-51.md) |
| B9 | Transferencias internacionales (arts. 27 y 28) | **Prioridad alta, antes de la primera clínica.** Mecanismos posibles: país adecuado, garantías contractuales o excepciones legales; lo acredita el responsable. Según la IA, Resend y Railway operan en EE. UU. y tienen DPA; de Netlify hay que ver qué datos le llegan (hosting, funciones, registros); de Better Stack, revisar que los logs no lleven identificadores, correos, nombres ni datos de citas. Pasos: inventario de proveedores, qué datos recibe cada uno, países, DPA, subencargados, garantías e información al paciente. Un DPA pensado para el RGPD es una buena base, pero no resuelve solo lo chileno | ADR-13 §12 ya minimiza el correo y los logs; falta el inventario y los DPA. Hoy Better Stack no recibe logs (la fuente no está conectada, [DT-19](../Deudas/DT-19.md)), y los logs llevan ids seudónimos. El dominio de Resend está en la región São Paulo ([stack](../stack-tecnologico.md#infraestructura-en-producción-2026-10-07)) | [DT-52](../Deudas/DT-52.md) |
| B10 | Acreditación (Ley 20.584, art. 10 bis) | Las plataformas que almacenan y tratan datos personales en salud digital deben acreditarse según un reglamento del Minsal. Para una agenda que guarda datos de pacientes la exposición es directa: no hay que asumir que no aplica, ni inventar un procedimiento. Revisar el reglamento y las normas técnicas y **consultar al Minsal** el alcance para un SaaS de agenda. Resolverlo antes de escalar | — | [DT-55](../Deudas/DT-55.md) |
| B11 | Conservación y menores | La ficha clínica se guarda al menos 15 años (art. 13), pero eso no obliga a guardar 15 años cada registro administrativo. Plazos por finalidad: el historial operativo de citas; el de inasistencias, solo mientras sea necesario y lícito; los logs técnicos, por un plazo acotado; y suprimir o anonimizar a los pacientes eliminados. No guardar indefinidamente porque es barato. **Menores** (art. 16 quáter): bajo los 14 años consienten los padres o representantes; a los 14 y 15, también para datos sensibles; a los 16 y 17, rigen las reglas de los adultos para datos sensibles; con el interés superior del niño y su autonomía progresiva. Citia necesita identificar al representante legal y documentar su autorización | — | [DT-26](../Deudas/DT-26.md), [DT-54](../Deudas/DT-54.md) |
| B12 | Vigencia | Trabajar con el escenario más exigente, el 2026-12-01. Las obligaciones de la Ley 19.628 y de la Ley 20.584 ya existen | La postergación pasó el Senado el 2026-10-29 ([fuentes](#fuentes-y-verificación)) | — |
| B13 | Modelo de prevención | Primero un **programa interno** de cumplimiento; certificar después (Decreto 662). Elementos: responsable de cumplimiento, inventario de datos, registro de operaciones, políticas (privacidad, seguridad, conservación), gestión de incidentes, contratos y DPA, evaluación de riesgos, capacitación, procedimiento de derechos y auditoría | — | [DT-56](../Deudas/DT-56.md) |

---

## Bloque C — datos entre clínicas

De acuerdo con retirar estas preguntas, con una condición: que **el sistema impida compartir** (aislamiento y acceso
por clínica, consultas siempre filtradas, cuidado con logs y telemetría, y un contrato que prohíba reutilizar).

*Matiz:* Citia es multi-tenant, con `tenant_id` en cada consulta, y los lectores SQL entre módulos
([DT-50](../Deudas/DT-50.md)) también filtran por tenant. *Observación de esta documentación (2026-10-31), no del
pre-análisis:* la lista de supresiones de correo es global a propósito ([ADR-13 §2](../Decisions/ADR-13.md#2-tablas)).

---

## Prioridades que propuso

- **P1**, que la IA llamó "bloqueante para producción": rol de encargado, contrato de encargo, inventario de
  proveedores y transferencias, DPA, política de privacidad y procedimiento de derechos, aislamiento por clínica (ya
  existe) y alcance del art. 10 bis. *Matiz:* Citia ya está en producción sin clínicas reales; el límite real es la
  **primera clínica con pacientes reales**.
- **P2**, durante la preparación: política de conservación y eliminación, medidas de seguridad documentadas,
  gestión de incidentes, reglas para menores, registro de proveedores y subencargados, y programa interno.
- **P3**, antes de reactivar US-07.02 y US-07.03: finalidad sanitaria admisible, base jurídica, riesgos del
  perfilamiento, evaluación de impacto, información al paciente, revisión humana y consecuencias de cada etiqueta.

## Dictamen general

| Tema | Conclusión de la IA |
|---|---|
| Modelo clínica responsable / Citia encargado | viable |
| Agenda | viable, con controles |
| Historial de asistencia | requiere delimitación |
| Perfilamiento (la calificación) | no habilitar todavía |
| Infraestructura internacional | requiere adecuación |
| Contratos | pendientes |
| Acreditación (art. 10 bis) | pendiente de aclaración |
| Conservación | requiere una política |

**Siguiente paso que propuso:** un documento maestro de cumplimiento (mapa de datos, roles, registro de
operaciones, proveedores y transferencias, política de privacidad, contrato de encargo, conservación, derechos,
riesgos y plan de adecuación). La carpeta [Cumplimiento](README.md) **no es ese documento**: es el estado y la
lista de lo que falta. El 2026-10-31 el usuario eligió documentar, no redactar.

---

## Correspondencia con las preguntas de ADR-14

| Pre-análisis | Tema | En [ADR-14 § Contexto legal](../Decisions/ADR-14.md#contexto-legal-a-validar-por-un-abogado) |
|---|---|---|
| A1 | dato de salud y ficha clínica | pregunta 1 |
| A2 | art. 16 bis | pregunta 2 y fila *Datos de salud* |
| A3 | art. 8 bis | fila *Oposición* (no es pregunta) |
| A4 | evaluación de impacto | pregunta 3 y fila *Evaluación de impacto* |
| A5 | información y acceso | pregunta 6 y fila *Transparencia* |
| A6 | base legal | fila *Base de licitud* (no es pregunta) |
| B8 | contrato de encargo | pregunta 4 (ADR-14 la hace para la calificación; B8, para toda la plataforma) |
| B12 | vigencia | pregunta 5 y fila *Vigencia* |

---

## Fuentes y verificación

- **Verificado por la sesión en la web el 2026-10-30:**
  - la **postergación**: el Senado aprobó el 2026-10-29, por 33 votos a 6, el proyecto del boletín 18.623-07 con la
    fecha **2027-10-15** (el Ejecutivo proponía el 2027-12-01), y pasó a la Cámara. Mientras no se publique, la Ley
    21.719 rige el **2026-12-01**. 🟡 Fuentes secundarias: Garrigues, La Tercera y El América (29-10-2026);
  - el **Decreto 662** (Hacienda, publicado el 2026-09-09; BCN, idNorma 1227971): certificación voluntaria de los
    modelos de prevención, que pide el responsable ante la Agencia, dura 3 años y se inscribe en el Registro
    Nacional de Sanciones y Cumplimiento; delegado de protección de datos obligatorio solo para certificar;
  - 🟡 que al 2026-10-11 la Agencia no estaba plenamente instalada (sin fuente anotada en el resumen de la sesión).
- **Los artículos** que cita la IA (Ley 20.584, arts. 3, 10 bis, 12 y 13; Ley 21.719, arts. 8 bis, 14 ter letra l,
  15 bis, 15 ter, 16 bis, 16 quáter, 27 y 28) coinciden con la investigación del 2026-10-19, hecha contra el texto
  oficial de la BCN (Ley 21.719, idNorma 1209272, versión del 2026-02-05; Ley 20.584, 1039348, versión del
  2026-02-16; DS 41/2012, 1046753; Ley 19.628, 141599, versión del 2022-11-10). **Dos excepciones:** de los arts. 27
  y 28 la investigación no transcribió el texto (❓), y el plazo de 15 años de la ficha (Ley 20.584, art. 13) lo da
  el pre-análisis, no la investigación (❓).
- **Dónde están los originales:** el resumen de la sesión del 2026-10-30 y la investigación del 2026-10-19 están en
  las notas del usuario, **fuera del repo**. Este archivo es lo que queda de ellos en el repo.
