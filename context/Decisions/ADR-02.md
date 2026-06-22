# ADR-02: Convenciones de código: español + arquitectura hexagonal

**Fecha:** 2026-06-22
**Estado:** Aceptado

---

## Contexto

El equipo es hispanohablante y el dominio de negocio (gestión de profesionales de la salud, recordatorios, citas) tiene terminología propia en español. Al mismo tiempo, el stack técnico (NestJS, TypeORM, JWT, etc.) usa términos técnicos en inglés que no tienen traducción natural.

Se necesitan reglas explícitas que:

1. Alineen el idioma del código con el idioma del dominio.
2. Garanticen que la arquitectura hexagonal no se erosione con el tiempo (dependencias cruzadas accidentales entre capas).

---

## Decisión

### 1. Idioma del código

- **Español** para nombres de clases, métodos, variables, archivos y carpetas en las capas `domain/` y `application/`.
  - Ejemplos correctos: `Profesional`, `CrearCita`, `repositorioProfesional`, `obtenerCitasPorFecha`.
- **Inglés** permitido únicamente para:
  - Términos técnicos sin traducción natural en el dominio: `token`, `tenant`, `hash`, `payload`, `guard`, `middleware`, `handler`, `dto`, `repository` (sufijo de adaptador).
  - Archivos de infraestructura donde NestJS y TypeORM imponen el nombre (ej.: `*.module.ts`, `*.controller.ts`, `*.service.ts`).
- **Mezcla prohibida** dentro de un mismo identificador (no `crearUserRecord`, sino `crearRegistroUsuario`).

### 2. Arquitectura hexagonal — regla de dependencias por capa

```
src/modules/<modulo>/
├── domain/          # TypeScript puro. Cero imports de TypeORM o NestJS.
├── application/     # Casos de uso. Dependen solo de puertos (abstract class en domain/).
└── infrastructure/  # Adaptadores TypeORM, controllers HTTP, DTOs. Conocen NestJS y TypeORM.
```

Reglas estrictas:

| Capa             | Puede importar de          | NUNCA importa de               |
|------------------|----------------------------|--------------------------------|
| `domain/`        | Solo TypeScript nativo     | `typeorm`, `@nestjs/*`, `class-validator` |
| `application/`   | `domain/`                  | `typeorm`, `@nestjs/*`, `infrastructure/` |
| `infrastructure/`| `domain/`, `application/`, `typeorm`, `@nestjs/*` | — |

### 3. Puerto = abstract class (no interface)

Los puertos de dominio se definen como `abstract class`, no como `interface`, porque NestJS necesita un valor en tiempo de ejecución como token de inyección de dependencias.

```typescript
// domain/puertos/repositorio-profesional.ts
export abstract class RepositorioProfesional {
  abstract buscarPorId(id: string): Promise<Profesional | null>;
  abstract guardar(profesional: Profesional): Promise<void>;
}
```

El adaptador de infraestructura extiende esta clase abstracta y NestJS lo registra como provider con `useClass`.

### 4. Check de cumplimiento (CI)

El siguiente comando debe retornar **cero líneas** en cada PR. Si retorna resultados, el PR no puede mergearse:

```bash
grep -rE "from 'typeorm'|from '@nestjs'" \
  src/modules/*/domain \
  src/modules/*/application
```

Este check se añade como paso en el pipeline de CI (GitHub Actions / script de pre-push).

---

## Consecuencias positivas

- El dominio permanece portable y testeable sin levantar NestJS ni base de datos.
- Los tests unitarios de `domain/` y `application/` son puros (sin mocks de framework).
- El idioma del código refleja el dominio real, reduciendo la fricción cognitiva para el equipo.
- Los ports como `abstract class` eliminan la necesidad de tokens de inyección personalizados (`@Inject(REPO_TOKEN)`).

## Consecuencias negativas / riesgos

- El mapeo entre entidad de dominio y entidad de persistencia (TypeORM) requiere código de traducción boilerplate en los adaptadores.
- El check de grep puede dar falsos positivos si se importan tipos de NestJS genéricos (ej.: `Injectable` en un caso de uso). Mitigación: afinar el patrón del grep o mover esos imports a un decorador de infraestructura.
- La regla de español puede generar fricción si se incorporan desarrolladores no hispanohablantes. Mitigación: documentada explícitamente aquí y en `CLAUDE.md`.

---

## Referencias

- Arquitectura hexagonal (Alistair Cockburn): https://alistair.cockburn.us/hexagonal-architecture/
- NestJS custom providers: https://docs.nestjs.com/fundamentals/custom-providers
