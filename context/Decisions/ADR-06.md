# ADR-06: Atomicidad del registro — puerto `TransactionRunner` con contexto opaco

**Fecha:** 2026-06-23
**Estado:** Aceptado · Implementado (2026-06-23)
**Commits:** `d4fa476` (feat: registro atómico), `f573485` (test: rollback)

---

## Contexto

El registro inicial (US-00a, `POST /api/usuarios`) crea **dos filas en tablas distintas** en
secuencia dentro de `UsuariosService.registrar()`:

1. `INSERT` en `tenants` (con slug único),
2. verificación de email + `bcrypt.hash`,
3. `INSERT` en `usuarios` (el primer ADMINISTRADOR del tenant).

En la primera implementación (US-00a, 2026-06-22) estos pasos corrían **sin transacción**. Si algo
fallaba **después** de insertar el Tenant (email duplicado, error de hash, fallo al guardar el
usuario), el Tenant quedaba **persistido y huérfano**: un tenant sin ningún usuario, imposible de
usar y ensuciando la unicidad de `slug`. La feature US-00a decía "operación atómica" pero el
mecanismo que la garantizaba **no existía todavía**.

Además, ADR-02 prohíbe que las capas `domain/` y `application/` conozcan TypeORM. Una transacción
de TypeORM se maneja con un `EntityManager` / `QueryRunner` — tipos de TypeORM que **no pueden**
aparecer en `application`. Se necesitaba envolver el caso de uso en una transacción **sin filtrar
el ORM** al caso de uso.

---

## Decisión

### 1. Puerto `TransactionRunner` en `shared/application/` con contexto opaco

```typescript
// shared/application/transaction-runner.ts
export type TransactionContext = unknown; // opaco: application NO sabe qué es por dentro

export abstract class TransactionRunner {
  abstract run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
}
```

El truco es `TransactionContext = unknown`: la capa `application` recibe un `tx` que **pasa hacia
abajo sin inspeccionar**. No sabe (ni le importa) que por dentro es un `EntityManager` de TypeORM.
El puerto es `abstract class` (token de DI, coherente con ADR-02).

### 2. Adaptador `TypeOrmTransactionRunner` en `shared/infrastructure/`

```typescript
async run<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
  return this.dataSource.transaction((manager) => work(manager));
}
```

Delega en `dataSource.transaction()`: si el callback resuelve, hace `COMMIT`; si lanza, hace
`ROLLBACK`. El `manager` transaccional viaja como el `tx` opaco.

### 3. `SharedModule` provee y **exporta** `TransactionRunner`

Registrado con `{ provide: TransactionRunner, useClass: TypeOrmTransactionRunner }` y exportado
para que `UsuariosModule` (y futuros módulos) lo inyecten.

### 4. Los repositorios aceptan un `tx?` opcional (backward compatible)

`ITenantRepository` e `IUsuarioRepository` reciben un segundo argumento opcional
`tx?: TransactionContext`. Cuando viene, el adaptador resuelve el repositorio desde el
`EntityManager` transaccional; cuando no, usa el repositorio por defecto. Esto mantiene toda
llamada previa (sin `tx`) funcionando igual.

### 5. `registrar()` se envuelve en `tx.run(...)`

Todo el flujo (slug único + guardar tenant + verificar email + hash + guardar usuario) corre
dentro del callback de `tx.run`. Cualquier excepción → **rollback completo** → cero tenants
huérfanos.

**Alternativa descartada:** inyectar el `DataSource`/`EntityManager` de TypeORM directamente en el
service. Es más simple pero **rompe ADR-02** (acopla `application` a TypeORM) y hace el caso de uso
intesteable sin levantar el ORM.

---

## Consecuencias

**Positivas:**
- Se elimina de raíz el Tenant huérfano: registro verdaderamente atómico (todo o nada).
- `application` permanece pura: el `tx` opaco no filtra TypeORM (ADR-02 intacto; grep sigue en 0).
- Patrón **reutilizable**: cualquier caso de uso multi-repositorio puede envolverse en
  `TransactionRunner.run()` sin tocar el dominio.
- Backward compatible: los repos siguen usables sin `tx`.

**Negativas / riesgos:**
- `TransactionContext = unknown` sacrifica seguridad de tipos en la frontera: si un adaptador
  espera un `EntityManager` y recibe otra cosa, el error es en runtime. Mitigación: solo el
  adaptador TypeORM produce y consume el `tx`; el contrato es cerrado.
- Un poco más de ceremonia en los repositorios (rama con/sin `tx`).

---

## Verificación

- Test de integración (`f573485`) que **fuerza un fallo** al guardar el usuario y verifica que el
  Tenant **NO** queda persistido (rollback efectivo, sin huérfanos).
- Unit test del service actualizado al nuevo constructor (`TransactionRunner`), propagando el
  argumento `tx` en las aserciones de los repos.

---

## Referencias

- ADR-02: Código en español + hexagonal (por qué el contexto es opaco).
- `src/shared/application/transaction-runner.ts`, `src/shared/infrastructure/typeorm-transaction-runner.ts`, `src/shared/shared.module.ts`.
- `src/modules/usuario/application/usuarios.service.ts` — `registrar()` envuelto en `tx.run`.
- `context/Features/us00a-registro-inicial.md` — feature que ahora documenta la atomicidad.
