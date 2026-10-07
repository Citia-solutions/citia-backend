import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { TenantOrmEntity } from '../../../tenant/infrastructure/persistence/tenant.orm-entity';
import { UsuarioOrmEntity } from '../../../usuario/infrastructure/persistence/usuario.orm-entity';
import { CanalRecordatorio } from '../../domain/recordatorio.entity';

const CANALES_SQL = Object.values(CanalRecordatorio)
  .map((canal) => `'${canal}'`)
  .join(', ');

/**
 * Fila de `configuraciones_recordatorio` (ADR-13 §2). Esquema real: migración
 * 1750000009000. Única, CHECK y FKs se declaran también aquí para que un
 * esquema creado con `synchronize` (tests) quede igual.
 */
@Entity('configuraciones_recordatorio')
@Unique('uq_configuracion_recordatorio_tenant_usuario', [
  'tenantId',
  'usuarioId',
])
@Check('CHK_configuraciones_recordatorio_canal', `"canal" IN (${CANALES_SQL})`)
export class ConfiguracionRecordatorioOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => TenantOrmEntity, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: TenantOrmEntity;

  // El profesional DUEÑO de las citas (`citas.usuario_id`).
  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @ManyToOne(() => UsuarioOrmEntity, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'usuario_id' })
  usuario?: UsuarioOrmEntity;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({ type: 'varchar', default: CanalRecordatorio.EMAIL })
  canal: CanalRecordatorio;

  @Column({ name: 'antelaciones_min', type: 'int', array: true })
  antelacionesMin: number[];

  @Column({ name: 'telefono_contacto', type: 'varchar', nullable: true })
  telefonoContacto: string | null;

  @Column({ name: 'correo_respuesta', type: 'varchar', nullable: true })
  correoRespuesta: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
