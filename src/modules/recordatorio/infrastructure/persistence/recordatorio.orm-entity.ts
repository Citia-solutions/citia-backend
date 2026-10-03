import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { CitaOrmEntity } from '../../../cita/infrastructure/persistence/cita.orm-entity';
import {
  CanalRecordatorio,
  EstadoRecordatorio,
  MOTIVOS_POR_ESTADO,
  MotivoRecordatorio,
} from '../../domain/recordatorio.entity';

const lista = (valores: readonly string[]): string =>
  valores.map((valor) => `'${valor}'`).join(', ');

const ESTADOS_SIN_MOTIVO = (
  Object.keys(MOTIVOS_POR_ESTADO) as EstadoRecordatorio[]
).filter((estado) => MOTIVOS_POR_ESTADO[estado].length === 0);

const ESTADOS_CON_MOTIVO = (
  Object.keys(MOTIVOS_POR_ESTADO) as EstadoRecordatorio[]
).filter((estado) => MOTIVOS_POR_ESTADO[estado].length > 0);

/**
 * Mismo CHECK que la migración 1750000010000, derivado del vocabulario. El
 * `"motivo" IS NOT NULL` es imprescindible: `NULL IN (...)` da NULL y un CHECK
 * que evalúa NULL se da por cumplido.
 */
export const CHECK_MOTIVO_RECORDATORIO = [
  `("estado" IN (${lista(ESTADOS_SIN_MOTIVO)}) AND "motivo" IS NULL)`,
  ...ESTADOS_CON_MOTIVO.map(
    (estado) =>
      `("estado" = '${estado}' AND "motivo" IS NOT NULL AND "motivo" IN (${lista(MOTIVOS_POR_ESTADO[estado])}))`,
  ),
].join(' OR ');

/**
 * Fila de `recordatorios` (ADR-13 §2). Esquema real: migración 1750000010000.
 *
 * Índices, CHECK y FK se declaran también aquí para que un esquema creado con
 * `synchronize` (BD efímera de tests) quede igual que el de la migración.
 *
 * El adaptador (`TypeOrmRecordatorioRepository`) escribe con SQL explícito
 * (ON CONFLICT sobre la clave parcial, guardas de estado, SKIP LOCKED):
 * esta clase registra la tabla y su forma, no se usa con `save()`.
 */
@Entity('recordatorios')
@Index(
  'uq_recordatorio_clave',
  ['citaId', 'canal', 'antelacionMin', 'programadoPara'],
  { unique: true, where: `"estado" <> 'cancelado'` },
)
@Index('idx_recordatorio_cola', ['proximoIntentoEn'], {
  where: `"estado" = 'programado'`,
})
@Index('idx_recordatorio_cita', ['citaId'])
@Index('idx_recordatorio_proveedor', ['proveedorMensajeId'])
@Index('idx_recordatorio_enviado_en', ['enviadoEn'], {
  where: `"enviado_en" IS NOT NULL`,
})
@Check(
  'CHK_recordatorios_canal',
  `"canal" IN (${lista(Object.values(CanalRecordatorio))})`,
)
@Check(
  'CHK_recordatorios_estado',
  `"estado" IN (${lista(Object.values(EstadoRecordatorio))})`,
)
@Check('CHK_recordatorios_motivo', CHECK_MOTIVO_RECORDATORIO)
export class RecordatorioOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Sin FK, como en ADR-13 §2: el tenant de la fila es el de su cita.
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'cita_id', type: 'uuid' })
  citaId: string;

  @ManyToOne(() => CitaOrmEntity, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'cita_id' })
  cita?: CitaOrmEntity;

  @Column({ type: 'varchar' })
  canal: CanalRecordatorio;

  @Column({ name: 'antelacion_min', type: 'int' })
  antelacionMin: number;

  @Column({ name: 'inicio_cita', type: 'timestamptz' })
  inicioCita: Date;

  @Column({ name: 'programado_para', type: 'timestamptz' })
  programadoPara: Date;

  @Column({ name: 'vence_en', type: 'timestamptz' })
  venceEn: Date;

  @Column({ type: 'varchar' })
  estado: EstadoRecordatorio;

  @Column({ type: 'varchar', nullable: true })
  motivo: MotivoRecordatorio | null;

  @Column({ type: 'int', default: 0 })
  intentos: number;

  @Column({ name: 'proximo_intento_en', type: 'timestamptz' })
  proximoIntentoEn: Date;

  // Código del proveedor, truncado. Nunca datos personales.
  @Column({ name: 'ultimo_error', type: 'varchar', nullable: true })
  ultimoError: string | null;

  @Column({ type: 'varchar', nullable: true })
  proveedor: string | null;

  @Column({ name: 'proveedor_mensaje_id', type: 'varchar', nullable: true })
  proveedorMensajeId: string | null;

  @Column({ name: 'enviado_en', type: 'timestamptz', nullable: true })
  enviadoEn: Date | null;

  @Column({ name: 'entregado_en', type: 'timestamptz', nullable: true })
  entregadoEn: Date | null;

  @Column({ name: 'queja_en', type: 'timestamptz', nullable: true })
  quejaEn: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
