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

import { TenantOrmEntity } from '../../../tenant/infrastructure/persistence/tenant.orm-entity';
import { UsuarioOrmEntity } from '../../../usuario/infrastructure/persistence/usuario.orm-entity';
import { CanalAceptacion } from '../../domain/aceptacion-terminos.entity';
import { PacienteOrmEntity } from './paciente.orm-entity';

const lista = (valores: readonly string[]): string =>
  valores.map((valor) => `'${valor}'`).join(', ');

const { FORMULARIO_PUBLICO, ENLACE_CITA, PROFESIONAL } = CanalAceptacion;

/**
 * Los mismos CHECK que la migración 1750000021000, con el vocabulario del
 * dominio. La regex lleva la barra doblada en el fuente (`\\.`): a Postgres
 * le llega `\.`, un punto literal.
 */
export const CHECKS_ACEPTACIONES_TERMINOS = {
  CHK_aceptaciones_terminos_version: `"version" ~ '^[0-9]+\\.[0-9]+$'`,
  CHK_aceptaciones_terminos_canal: `"canal" IN (${lista(Object.values(CanalAceptacion))})`,
  // Exactamente la referencia de su canal.
  CHK_aceptaciones_terminos_referencia:
    `("canal" = '${FORMULARIO_PUBLICO}' AND "solicitud_id" IS NOT NULL AND "enlace_id" IS NULL AND "usuario_id" IS NULL)` +
    ` OR ("canal" = '${ENLACE_CITA}' AND "enlace_id" IS NOT NULL AND "solicitud_id" IS NULL AND "usuario_id" IS NULL)` +
    ` OR ("canal" = '${PROFESIONAL}' AND "usuario_id" IS NOT NULL AND "solicitud_id" IS NULL AND "enlace_id" IS NULL)`,
} as const;

/** Índice único de D11: blanco del `ON CONFLICT` del adaptador. */
export const INDICE_ACEPTACION_UNICA =
  'uq_aceptaciones_terminos_paciente_version_canal';

/**
 * Fila de `aceptaciones_terminos` (US-11, ADR-16 §3). Esquema real: migración
 * 1750000021000.
 *
 * Índice, CHECK, FK y los nombres de la PK y las FK se declaran también aquí
 * para que un esquema creado con `synchronize` (BD efímera de tests) quede
 * igual que el de la migración. Fechas `timestamptz` declaradas (DT-46).
 *
 * El adaptador (`TypeOrmAceptacionTerminosRepository`) escribe con SQL
 * explícito (`INSERT … SELECT … ON CONFLICT DO NOTHING RETURNING`): esta
 * clase registra la tabla y su forma, no se usa con `save()`. Solo
 * inserción. Sin FK a `solicitudes_cita` ni a `enlaces_cita`, a propósito.
 */
@Entity('aceptaciones_terminos')
@Index(INDICE_ACEPTACION_UNICA, ['pacienteId', 'version', 'canal'], {
  unique: true,
})
@Check(
  'CHK_aceptaciones_terminos_version',
  CHECKS_ACEPTACIONES_TERMINOS.CHK_aceptaciones_terminos_version,
)
@Check(
  'CHK_aceptaciones_terminos_canal',
  CHECKS_ACEPTACIONES_TERMINOS.CHK_aceptaciones_terminos_canal,
)
@Check(
  'CHK_aceptaciones_terminos_referencia',
  CHECKS_ACEPTACIONES_TERMINOS.CHK_aceptaciones_terminos_referencia,
)
export class AceptacionTerminosOrmEntity {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_aceptaciones_terminos_id',
  })
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => TenantOrmEntity, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'tenant_id',
    foreignKeyConstraintName: 'FK_aceptaciones_terminos_tenant_id',
  })
  tenant?: TenantOrmEntity;

  @Column({ name: 'paciente_id', type: 'uuid' })
  pacienteId: string;

  @ManyToOne(() => PacienteOrmEntity, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'paciente_id',
    foreignKeyConstraintName: 'FK_aceptaciones_terminos_paciente_id',
  })
  paciente?: PacienteOrmEntity;

  @Column({ type: 'varchar', length: 10 })
  version: string;

  @Column({ type: 'varchar', length: 20 })
  canal: CanalAceptacion;

  // El acto, no la escritura de la fila.
  @Column({ name: 'aceptada_en', type: 'timestamptz' })
  aceptadaEn: Date;

  // Solo en `profesional`: quién marcó la casilla.
  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId: string | null;

  @ManyToOne(() => UsuarioOrmEntity, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'usuario_id',
    foreignKeyConstraintName: 'FK_aceptaciones_terminos_usuario_id',
  })
  usuario?: UsuarioOrmEntity | null;

  // Solo en `formulario_publico`. Sin FK a `solicitudes_cita` (ADR-16 §3).
  @Column({ name: 'solicitud_id', type: 'uuid', nullable: true })
  solicitudId: string | null;

  // Solo en `enlace_cita`. Sin FK a `enlaces_cita` (ADR-16 §3).
  @Column({ name: 'enlace_id', type: 'uuid', nullable: true })
  enlaceId: string | null;

  @CreateDateColumn({ name: 'registrada_en', type: 'timestamptz' })
  registradaEn: Date;
}
