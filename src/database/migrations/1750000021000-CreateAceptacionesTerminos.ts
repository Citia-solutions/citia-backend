import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-11 (plan `context/US/11-terminos-paciente.md`, ADR-16 §3): la prueba de
 * que un paciente aceptó los términos de uso y el aviso de privacidad, con qué
 * versión, cuándo y por qué canal. Tabla del módulo `paciente`.
 *
 * - **Solo inserción** (D1): el puerto no tiene `UPDATE` ni `DELETE`. Sin
 *   trigger, como `cambios_cita`.
 * - `aceptada_en` es el acto (la hora del formulario, del portal o de la app);
 *   `registrada_en`, cuándo se escribió la fila.
 * - **Exactamente una referencia según el canal**
 *   (`CHK_aceptaciones_terminos_referencia`): `formulario_publico` →
 *   `solicitud_id`, `enlace_cita` → `enlace_id`, `profesional` →
 *   `usuario_id`.
 * - `canal` y `version` son VARCHAR + CHECK, no tipos enum (como
 *   `mensajes_soporte`): sin diferencias de nombres de tipo entre la migración
 *   y `synchronize`.
 * - La regex de `version` lleva la barra DOBLADA en este archivo (`\\.`) para
 *   que a Postgres le llegue `\.` (un punto literal).
 * - FK a `tenants`, `pacientes` y `usuarios` con la convención del proyecto
 *   (`ON DELETE RESTRICT`, `ON UPDATE CASCADE`): la prueba no desaparece por
 *   accidente. **Sin FK** a `solicitudes_cita` ni a `enlaces_cita`, a
 *   propósito (ADR-16 §3): referencias, como `cita_id` en ADR-09.
 * - **Sin IP ni navegador** (D12). **Sin relleno** (D7). Sin plazo de
 *   conservación (DT-26).
 *
 * Índices:
 * - `uq_aceptaciones_terminos_paciente_version_canal` (D11): una fila por
 *   paciente, versión y canal. Es el blanco del `ON CONFLICT DO NOTHING` y,
 *   por su prefijo, el índice de "¿el titular ya aceptó?".
 * - Sin índice por `tenant_id`: nada consulta por organización todavía (lo
 *   agregará la exportación de DT-53).
 *
 * ⚠️ `down` (destructivo): `DROP TABLE` **borra toda la prueba de las
 * aceptaciones**. En production NO se revierte después de la primera
 * aceptación real: se corrige hacia adelante con una migración nueva.
 */
export class CreateAceptacionesTerminos1750000021000 implements MigrationInterface {
  name = 'CreateAceptacionesTerminos1750000021000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "aceptaciones_terminos" (
        "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"     UUID         NOT NULL,
        "paciente_id"   UUID         NOT NULL,
        "version"       VARCHAR(10)  NOT NULL,
        "canal"         VARCHAR(20)  NOT NULL,
        "aceptada_en"   TIMESTAMPTZ  NOT NULL,
        "usuario_id"    UUID,
        "solicitud_id"  UUID,
        "enlace_id"     UUID,
        "registrada_en" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_aceptaciones_terminos_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_aceptaciones_terminos_tenant_id" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants" ("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT "FK_aceptaciones_terminos_paciente_id" FOREIGN KEY ("paciente_id")
          REFERENCES "pacientes" ("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT "FK_aceptaciones_terminos_usuario_id" FOREIGN KEY ("usuario_id")
          REFERENCES "usuarios" ("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT "CHK_aceptaciones_terminos_version"
          CHECK ("version" ~ '^[0-9]+\\.[0-9]+$'),
        CONSTRAINT "CHK_aceptaciones_terminos_canal"
          CHECK ("canal" IN ('formulario_publico', 'enlace_cita', 'profesional')),
        -- Exactamente la referencia de su canal.
        CONSTRAINT "CHK_aceptaciones_terminos_referencia" CHECK (
             ("canal" = 'formulario_publico' AND "solicitud_id" IS NOT NULL
                AND "enlace_id" IS NULL AND "usuario_id" IS NULL)
          OR ("canal" = 'enlace_cita' AND "enlace_id" IS NOT NULL
                AND "solicitud_id" IS NULL AND "usuario_id" IS NULL)
          OR ("canal" = 'profesional' AND "usuario_id" IS NOT NULL
                AND "solicitud_id" IS NULL AND "enlace_id" IS NULL)
        )
      )
    `);

    // D11: una fila por paciente, versión y canal. Es el blanco del
    // ON CONFLICT y, por su prefijo, el índice de "¿el titular ya aceptó?".
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_aceptaciones_terminos_paciente_version_canal"
        ON "aceptaciones_terminos" ("paciente_id", "version", "canal")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // ⚠️ Borra toda la prueba. El índice cae con la tabla.
    await queryRunner.query(`
      DROP TABLE "aceptaciones_terminos"
    `);
  }
}
