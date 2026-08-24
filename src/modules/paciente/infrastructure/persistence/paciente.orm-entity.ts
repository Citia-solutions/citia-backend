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
// Un RUT identifica una persona dentro de una organizacion (ADR-09 §3).
// Indice parcial: los pacientes sin RUT no colisionan entre si.
@Index('uq_paciente_tenant_rut', ['tenantId', 'rut'], {
  unique: true,
  where: '"rut" IS NOT NULL',
})
export class PacienteOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Forma canonica: solo digitos + verificador, sin puntos ni guion.
  @Column({ type: 'varchar', nullable: true })
  rut: string | null;

  @Column({ nullable: false })
  nombre: string;

  @Column({ nullable: false })
  telefono: string;

  @Column({ type: 'varchar', nullable: true })
  correo: string | null;

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
