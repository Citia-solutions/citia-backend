import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { TenantOrmEntity } from '../../../tenant/infrastructure/persistence/tenant.orm-entity';

@Entity('pacientes')
@Index('idx_paciente_tenant', ['tenantId'])
export class PacienteOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  nombre: string;

  @Column({ nullable: false })
  contacto: string;

  @Column({ default: false })
  consentimiento: boolean;

  @Column({ name: 'tenant_id', nullable: false })
  tenantId: string;

  @ManyToOne(() => TenantOrmEntity)
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantOrmEntity;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  actualizadoEn: Date;
}
