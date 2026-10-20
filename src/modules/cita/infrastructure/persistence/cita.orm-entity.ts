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
import { EstadoCita, OrigenCita } from '../../domain/cita.entity';

// Esquema real: migraciones 1750000003000, 1750000015000 (`origen`) y
// 1750000018000 (índice del job G1). Columnas, enums e índices se declaran
// también aquí para que el esquema de `synchronize` (tests) quede igual.
@Entity('citas')
@Index('idx_cita_tenant_usuario_inicio', ['tenantId', 'usuarioId', 'inicio'])
// US-07.01: el job G1 barre todos los tenants buscando citas `pendiente` por
// rango de `inicio`. Su consulta escribe el predicado igual que el índice.
@Index('idx_cita_pendiente_inicio', ['inicio'], {
  where: `"estado" = '${EstadoCita.PENDIENTE}'`,
})
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

  // US-07.01 (H4): de dónde salió. Lo fija el código al crear; el DEFAULT
  // cubre la ventana del despliegue, los INSERT a mano de los tests y el seed.
  @Column({
    type: 'enum',
    enum: OrigenCita,
    default: OrigenCita.MANUAL,
  })
  origen: OrigenCita;

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
