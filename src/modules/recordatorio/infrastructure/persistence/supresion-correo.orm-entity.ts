import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';

import { MotivoSupresion } from '../../domain/supresion-correo.repository';

const MOTIVOS_SQL = Object.values(MotivoSupresion)
  .map((motivo) => `'${motivo}'`)
  .join(', ');

/**
 * Fila de `supresiones_correo` (ADR-13 §2). Esquema real: migración
 * 1750000011000. Global (sin tenant) y solo con el hash de la dirección.
 */
@Entity('supresiones_correo')
@Check('CHK_supresiones_correo_hash', `"correo_hash" ~ '^[0-9a-f]{64}$'`)
@Check('CHK_supresiones_correo_motivo', `"motivo" IN (${MOTIVOS_SQL})`)
export class SupresionCorreoOrmEntity {
  // SHA-256 hex del correo normalizado (`calcularHashCorreo`).
  @PrimaryColumn({ name: 'correo_hash', type: 'varchar' })
  correoHash: string;

  @Column({ type: 'varchar' })
  motivo: MotivoSupresion;

  // Sin FK: la supresión sobrevive a su recordatorio.
  @Column({ name: 'origen_recordatorio_id', type: 'uuid', nullable: true })
  origenRecordatorioId: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}
