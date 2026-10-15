import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { MotivoRevocacionEnlace } from '../../domain/enlace-cita.entity';
import { CitaOrmEntity } from './cita.orm-entity';

const MOTIVOS_SQL = Object.values(MotivoRevocacionEnlace)
  .map((motivo) => `'${motivo}'`)
  .join(', ');

/**
 * Fila de `enlaces_cita` (Fase 3, contrato §2.1). Esquema real: migración
 * 1750000012000.
 *
 * Índices, CHECK y FK se declaran también aquí para que un esquema creado con
 * `synchronize` (BD efímera de tests) quede igual que el de la migración.
 *
 * El adaptador (`TypeOrmEnlaceCitaRepository`) escribe con SQL explícito
 * (`ON CONFLICT DO NOTHING`, `RETURNING`): esta clase registra la tabla y su
 * forma, no se usa con `save()`.
 */
@Entity('enlaces_cita')
@Index('uq_enlace_cita_token_hash', ['tokenHash'], { unique: true })
@Index('uq_enlace_cita_version', ['citaId', 'version'], { unique: true })
@Index('uq_enlace_cita_activo', ['citaId'], {
  unique: true,
  where: `"revocado_en" IS NULL`,
})
@Check('CHK_enlaces_cita_version', `"version" >= 1`)
@Check('CHK_enlaces_cita_token_hash', `"token_hash" ~ '^[0-9a-f]{64}$'`)
@Check(
  'CHK_enlaces_cita_revocacion',
  `("revocado_en" IS NULL AND "motivo_revocacion" IS NULL AND "revocado_por" IS NULL) OR ("revocado_en" IS NOT NULL AND "motivo_revocacion" IS NOT NULL AND "motivo_revocacion" IN (${MOTIVOS_SQL}))`,
)
export class EnlaceCitaOrmEntity {
  // Es el `actor_id` del paciente en `cambios_cita`.
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cita_id', type: 'uuid' })
  citaId: string;

  @ManyToOne(() => CitaOrmEntity, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'cita_id' })
  cita?: CitaOrmEntity;

  // Sin FK, como en `recordatorios`: el tenant de la fila es el de su cita.
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'int' })
  version: number;

  // SHA-256 hex del token. El token nunca se guarda.
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash: string;

  @CreateDateColumn({ name: 'emitido_en', type: 'timestamptz' })
  emitidoEn: Date;

  @Column({ name: 'revocado_en', type: 'timestamptz', nullable: true })
  revocadoEn: Date | null;

  @Column({ name: 'motivo_revocacion', type: 'varchar', nullable: true })
  motivoRevocacion: MotivoRevocacionEnlace | null;

  // usuarioId de quien lo invalidó.
  @Column({ name: 'revocado_por', type: 'uuid', nullable: true })
  revocadoPor: string | null;
}
