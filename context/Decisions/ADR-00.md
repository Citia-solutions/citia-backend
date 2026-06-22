# ADR-00: TypeORM como ORM definitivo para citia-backend

**Fecha:** 2026-06-22
**Estado:** Aceptado

---

## Contexto

El proyecto usa NestJS 11 + PostgreSQL. Se evaluaron dos ORMs principales:

| Criterio                     | TypeORM                              | Prisma                                 |
|------------------------------|--------------------------------------|----------------------------------------|
| Integración NestJS           | Nativa (`@nestjs/typeorm`)           | Via wrapper comunitario                |
| Estilo de entidades          | Decoradores TypeScript               | Schema `.prisma` + cliente generado    |
| Migraciones                  | CLI propia, control total            | CLI propia, menos flexible             |
| Capa de generación de cliente| No requiere                          | Requiere `prisma generate` en cada cambio |
| Ecosistema                   | Maduro, amplia documentación         | Moderno, creciente                     |

TypeORM ya estaba instalado y configurado en la base del proyecto al momento de esta decisión.

---

## Decisión

Se adopta **TypeORM** como ORM definitivo.

Reglas operativas no negociables:

1. **`synchronize: false`** permanente en entornos `development` y `production`. El campo nunca se activa por conveniencia.
2. Los cambios de schema se gestionan **exclusivamente mediante migraciones TypeORM versionadas** (`src/database/migrations/`).
3. **`synchronize: true`** está permitido únicamente en bases de datos efímeras usadas en tests (`NODE_ENV=test`, contenedor Docker de vida corta).
4. **NUNCA** aplicar una migración generada automáticamente sin revisarla manualmente línea a línea antes del `npm run migration:run`.
5. En producción, las migraciones se ejecutan como paso explícito del pipeline CI/CD, nunca de forma automática al arrancar la aplicación.

---

## Consecuencias positivas

- Integración nativa con NestJS mediante `@nestjs/typeorm` y el módulo `TypeOrmModule.forRootAsync`.
- Entidades definidas con decoradores TypeScript (`@Entity`, `@Column`, `@ManyToOne`, etc.), coherentes con el estilo del proyecto.
- Soporte completo del ciclo de vida de migraciones: `migration:generate`, `migration:run`, `migration:revert`.
- Sin paso de generación de cliente: no hay desfase entre schema y código en tiempo de desarrollo.
- Compatible con arquitectura hexagonal: las entidades TypeORM viven en `infrastructure/persistence/` y no contaminan el dominio.

---

## Consecuencias negativas / riesgos

- Los decoradores de TypeORM acoplan las clases de entidad al ORM. Por eso la regla de separación es estricta: las clases de dominio (`domain/`) son TypeScript puro, sin decoradores ORM; los adaptadores TypeORM (`infrastructure/persistence/`) son los únicos que usan decoradores.
- Las migraciones son responsabilidad del equipo. Un `migration:generate` descuidado puede producir sentencias destructivas (`DROP COLUMN`, `DROP TABLE`).
- El mantenimiento de mappings entre entidad de dominio y entidad de persistencia añade código boilerplate, compensado por el aislamiento arquitectural.

---

## Referencias

- Documentación oficial: https://docs.nestjs.com/techniques/database
- TypeORM migraciones: https://typeorm.io/migrations
