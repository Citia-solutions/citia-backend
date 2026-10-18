# Citia explicado — por dónde empezar

Esta carpeta cuenta el proyecto **en lenguaje simple**, como se lo explicarías a alguien que sabe
programar pero acaba de llegar y no conoce Citia ni sus decisiones. No reemplaza a los documentos
oficiales de `context/` (ADRs, fases, deudas, features…): los **traduce** y te dice adónde ir cuando
quieras el detalle. Cada archivo termina con una sección **"Para profundizar"** con esos enlaces.

> **Estado de referencia: 2026-10-18.** El MVP (Fundaciones y Fases 0, 1 y 2) está en producción, y
> desde el 2026-10-17 también la Fase 3 (el paciente responde desde el correo), que queda por cerrar con
> una prueba manual.

---

## El orden recomendado

Léelos en este orden la primera vez. Cada uno asume que leíste los anteriores.

| # | Archivo | Qué te deja claro | Tiempo aprox. |
|---|---|---|---|
| 1 | [01 — El producto](01-el-producto.md) | Qué es Citia, para quién, qué problema resuelve (las inasistencias), cómo se decidió qué entraba al MVP y qué quedó fuera | 15 min |
| 2 | [02 — Cómo está armado](02-como-esta-armado.md) | El stack, la arquitectura hexagonal, los módulos, la multi-organización, cómo se hablan los módulos, los entornos y cómo trabaja el equipo | 25 min |
| 3 | [11 — Glosario](11-glosario.md) | Las palabras del proyecto (tenant, outbox, ghosting, token…). **Tenlo abierto en otra pestaña** mientras lees el resto | consulta |
| 4 | [04 — Roadmap y fases](04-roadmap-y-fases.md) | En qué orden se construyó todo y por qué, qué hizo cada fase y qué falta | 30 min |
| 5 | [03 — Las decisiones (ADRs)](03-decisiones-adr.md) | Por qué el sistema es como es: cada decisión de arquitectura, qué se descartó y qué consecuencia tiene hoy | 40 min |
| 6 | [05 — Historias de usuario](05-historias-de-usuario.md) | Cómo se planifica cada funcionalidad antes de programarla y qué exige su "Definición de Terminado" | 25 min |
| 7 | [06 — Features](06-features.md) | Lo que está construido, funcionalidad por funcionalidad: qué hace, endpoints y cómo fluye por dentro | 30 min |
| 8 | [04b — La Fase 3 a fondo](04b-fase-3-a-fondo.md) | Un caso completo de punta a punta: el enlace del paciente, su seguridad y su concurrencia | 15 min |
| 9 | [07 — Deudas técnicas](07-deudas-tecnicas.md) | Lo que el sistema todavía no hace bien y lo sabemos; cuáles importan más | 25 min |
| 10 | [08 — Preguntas abiertas](08-preguntas-abiertas.md) | Lo que todavía no está decidido y quién lo decide | 15 min |
| 11 | [09 — Decisiones del frontend](09-decisiones-del-frontend.md) | Lo que el front propuso y cómo se cruzó con las decisiones del backend | 15 min |
| 12 | [10 — El frontend](10-el-frontend.md) | El repo `citia-frontend`: estructura, rutas, sesión y cómo habla con el backend | 20 min |

**¿Por qué este orden?** Primero el **para qué** (producto), después el **con qué** (arquitectura y
vocabulario), después el **en qué orden** (fases) y el **por qué así** (ADRs). Con eso ya entiendes los
planes (US) y lo construido (features). La Fase 3 a fondo va a esa altura porque junta casi todo lo
anterior en un solo caso real. Las deudas y las preguntas abiertas van al final porque solo se
entienden cuando sabes qué existe. El frontend cierra porque depende de todo lo del backend.

---

## Rutas cortas según lo que vayas a hacer

No siempre hace falta leer todo. Elige tu ruta:

- **"Tengo una hora y quiero entender el proyecto":** 01 → 02 → la tabla de estado de 04 → 04b.
- **"Voy a tocar el backend":** 02 → 11 → 03 → 06 → la ficha del módulo en `src/modules/<módulo>/CLAUDE.md`
  → las deudas de ese módulo en 07.
- **"Voy a tocar el frontend":** 01 → 10 → 09 → 06 (para conocer los endpoints) → 04b si tocas la
  página `/cita`.
- **"Voy a diseñar la próxima fase":** 04 (qué viene y de qué depende) → 08 (qué falta decidir) → 07
  (qué deudas se cruzan) → 03 (las decisiones que no hay que contradecir) → 05 (cómo se escribe un
  plan de US).
- **"Necesito entender un error en producción":** 02 (entornos, variables y observabilidad) → 06 (la
  feature afectada) → 07 (puede ser una deuda conocida).

---

## Cómo se relaciona con los documentos oficiales

```
context/
├── Explicado/          ← estás aquí: la versión en lenguaje simple
├── Descripcion/        ← las etapas del producto           → explicado en 01
├── rf.md · rnf.md      ← requisitos                         → explicado en 01
├── stack-tecnologico.md · rules.md                          → explicado en 02
├── Decisions/          ← ADRs                               → explicado en 03
├── ROADMAP.md · Fases/ · TRAZABILIDAD.md                    → explicado en 04 y 04b
├── US/                 ← planes de historias de usuario     → explicado en 05
├── Features/           ← lo implementado                    → explicado en 06
├── Deudas/             ← deudas técnicas                    → explicado en 07
├── PREGUNTAS-ABIERTAS.md                                    → explicado en 08
└── Frontend-Decisions/ ← decisiones del frontend            → explicado en 09
citia-frontend/                                              → explicado en 10
```

**Si algo de aquí no coincide con un documento oficial, manda el oficial** (y para el estado de una
fase, manda el [`ROADMAP.md`](../ROADMAP.md)). Estas explicaciones se escribieron el 2026-10-15 y se
pusieron al día el 2026-10-18, tras el release de la Fase 3 y la corrección de los documentos oficiales;
si el proyecto avanzó, actualízalas junto con el documento que cambió.

---

## Tres ideas que atraviesan todo el proyecto

Si te quedas con algo, que sea esto:

1. **Primero se decide y se escribe, después se programa.** Cada cosa importante tiene un ADR o un
   plan de US antes de tocar código, y las deudas se anotan en vez de esconderse.
2. **El historial del paciente es el corazón del negocio.** Muchas reglas que parecen raras (no
   cancelar después de la hora, distinguir "no avisó" de "avisó y no vino", quién hizo cada cambio)
   existen para que ese historial sea confiable.
3. **Cada organización vive en su propia caja.** Todo se filtra por organización (tenant), y lo
   público (enlaces del paciente, solicitudes de hora) está diseñado para no dar pistas a curiosos.
