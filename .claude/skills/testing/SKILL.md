---
name: testing
description: Cómo escribir y ejecutar tests con Jest en este backend NestJS, y cómo reportar resultados y coverage. Úsalo al añadir cobertura a código nuevo, al correr la suite o cuando necesites verificar que los cambios pasan los tests.
---

# Skill: Testing (Jest + NestJS)

## Instrucciones

1. Antes de escribir código nuevo, revisa los tests existentes del módulo.
2. Escribe tests para cada service/controller/endpoint nuevo o modificado.
3. Usa `@nestjs/testing` (`Test.createTestingModule`) para instanciar y mockear
   dependencias de componentes NestJS.
4. Ejecuta la suite del área afectada y reporta: **total, passed, failed, coverage**.

## Comandos

- Unit: `npm test`
- Unit + coverage: `npm run test:cov`
- E2E (Supertest): `npm run test:e2e`
- Un archivo/patrón: `npm test -- <ruta-o-patrón>`

## Reglas

- Mínimo **80% de coverage** en código nuevo.
- Un test de integración por endpoint; un test unitario por método público.
- **Mocks** para dependencias externas (repos, BD, HTTP). Sin BD real en unitarios.
- Estructura AAA (Arrange / Act / Assert).
- Nombre: `it('debería <qué hace> cuando <escenario>')`.
- No cierres una tarea con tests en rojo.
