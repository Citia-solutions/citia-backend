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

import { PacienteOrmEntity } from '../../../paciente/infrastructure/persistence/paciente.orm-entity';
import { TenantOrmEntity } from '../../../tenant/infrastructure/persistence/tenant.orm-entity';
import { UsuarioOrmEntity } from '../../../usuario/infrastructure/persistence/usuario.orm-entity';
import { EstadoCita } from '../../domain/cita.entity';

@Entity('citas')
@Index('idx_cita_tenant_usuario_inicio', ['tenantId', 'usuarioId', 'inicio'])
export class CitaOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamptz', nullable: false })
  inicio: Date;

  @Column({ name: 'duracion_min', type: 'int', nullable: false })
  duracionMin: number;

  @Column({ name: 'tipo_consulta', type: 'varchar', nullable: false })
  tipoConsulta: string;

  @Column({
    type: 'enum',
    enum: EstadoCita,
    default: EstadoCita.PENDIENTE,
  })
  estado: EstadoCita;

  @Column({ name: 'tenant_id', nullable: false })
  tenantId: string;

  @ManyToOne(() => TenantOrmEntity)
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantOrmEntity;

  @Column({ name: 'paciente_id', nullable: false })
  pacienteId: string;

  @ManyToOne(() => PacienteOrmEntity)
  @JoinColumn({ name: 'paciente_id' })
  paciente: PacienteOrmEntity;

  @Column({ name: 'usuario_id', nullable: false })
  usuarioId: string;

  @ManyToOne(() => UsuarioOrmEntity)
  @JoinColumn({ name: 'usuario_id' })
  usuario: UsuarioOrmEntity;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  actualizadoEn: Date;
}
