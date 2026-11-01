import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { TenantOrmEntity } from '../../../tenant/infrastructure/persistence/tenant.orm-entity';
import { RolUsuario } from '../../domain/usuario.entity';

/**
 * Mismo CHECK que la migración 1750000019000 (US-10): la especialidad es
 * `NULL` o tiene algo más que espacios.
 */
export const CHECK_ESPECIALIDAD_NO_VACIA = `"especialidad" IS NULL OR btrim("especialidad") <> ''`;

@Entity('usuarios')
@Unique(['tenantId', 'email'])
@Index('idx_usuario_tenant', ['tenantId'])
@Check('CHK_usuarios_especialidad_no_vacia', CHECK_ESPECIALIDAD_NO_VACIA)
export class UsuarioOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  email: string;

  @Column({ name: 'password_hash', nullable: false })
  passwordHash: string;

  @Column({ name: 'nombre_completo', nullable: false })
  nombreCompleto: string;

  // US-10 (migración 1750000019000): `NULL` = sin especialidad.
  @Column({
    name: 'especialidad',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  especialidad: string | null;

  @Column({
    type: 'enum',
    enum: RolUsuario,
    default: RolUsuario.PROFESIONAL,
  })
  rol: RolUsuario;

  @Column({ name: 'tenant_id', nullable: false })
  tenantId: string;

  @ManyToOne(() => TenantOrmEntity)
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantOrmEntity;

  // US-10 (migración 1750000019000): corte de sesiones; `NULL` = sin corte.
  // `timestamptz` declarado (DT-46): lo compara la estrategia JWT con el `iat`.
  @Column({
    name: 'sesiones_validas_desde',
    type: 'timestamptz',
    nullable: true,
  })
  sesionesValidasDesde: Date | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  actualizadoEn: Date;
}
