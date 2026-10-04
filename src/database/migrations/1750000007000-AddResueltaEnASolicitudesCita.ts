import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cierre de Fase 1 de US-02 — bandeja de solicitudes (ADR-09 §11).
 *
 * `resuelta_en` registra cuándo la solicitud salió de la bandeja (aceptada o
 * rechazada). Es nullable porque una solicitud `recibida` todavía no se ha
 * resuelto. Sin backfill: hasta esta fase no existía ninguna ruta que
 * resolviera solicitudes, así que no hay filas `aceptada`/`rechazada` que
 * completar. Aun así, el repositorio ordena las resueltas con NULLS LAST para
 * que una fila sin marca nunca encabece la bandeja.
 *
 * Ordena la bandeja de resueltas y da la base para retener por antigüedad las
 * rechazadas (DT-26).
 *
 * Cambio aditivo: no borra ni reescribe datos. El `down` elimina la columna y,
 * con ella, las marcas de resolución registradas desde que se aplicó.
 */
export class AddResueltaEnASolicitudesCita1750000007000 implements MigrationInterface {
  name = 'AddResueltaEnASolicitudesCita1750000007000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "solicitudes_cita" ADD COLUMN "resuelta_en" TIMESTAMPTZ NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "solicitudes_cita" DROP COLUMN "resuelta_en"
    `);
  }
}
