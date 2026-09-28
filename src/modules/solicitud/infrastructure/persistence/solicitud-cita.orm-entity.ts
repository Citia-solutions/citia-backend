import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { TenantOrmEntity } from '../../../tenant/infrastructure/persistence/tenant.orm-entity';
import { EstadoSolicitud } from '../../domain/solicitud-cita.entity';

@Entity('solicitudes_cita')
// Soporta la bandeja (pendientes de la organización) y la regla anti-spam
// (una solicitud abierta por RUT dentro de la ventana).
@Index('idx_solicitud_tenant_estado', ['tenantId', 'estado'])
@Index('idx_solicitud_tenant_rut_estado', ['tenantId', 'rut', 'estado'])
export class SolicitudCitaOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', nullable: false })
  tenantId: string;

  @ManyToOne(() => TenantOrmEntity)
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantOrmEntity;

  // Nulo mientras está en la bandeja: el enlace es de la organización.
  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId: string | null;

  // RUT en forma canónica, igual que en pacientes.
  @Column({ type: 'varchar', nullable: false })
  rut: string;

  @Column({ name: 'nombre_paciente', type: 'varchar', nullable: false })
  nombrePaciente: string;

  @Column({ type: 'varchar', nullable: false })
  telefono: string;

  @Column({ type: 'varchar', nullable: false })
  correo: string;

  @Column({ type: 'varchar', nullable: false })
  motivo: string;

  @Column({ name: 'preferencia_horaria', type: 'varchar', nullable: false })
  preferenciaHoraria: string;

  @Column({ default: false })
  consentimiento: boolean;

  @Column({
    type: 'enum',
    enum: EstadoSolicitud,
    default: EstadoSolicitud.RECIBIDA,
  })
  estado: EstadoSolicitud;

  // Cita generada al aceptar. Sin relación ni clave foránea a propósito
  // (ADR-09): `solicitud` depende de `cita` a nivel de APLICACIÓN (la bandeja
  // usa CitasService para crear la cita), no de esquema. La tabla no referencia
  // a `citas` y el núcleo `cita` no sabe que las solicitudes existen.
  @Column({ name: 'cita_id', type: 'uuid', nullable: true })
  citaId: string | null;

  @CreateDateColumn({ name: 'recibida_en' })
  recibidaEn: Date;

  // Cuándo salió de la bandeja (aceptada o rechazada). Nulo mientras está
  // `recibida`. Lo fija el dominio, no la BD: no lleva default.
  @Column({ name: 'resuelta_en', type: 'timestamptz', nullable: true })
  resueltaEn: Date | null;
}
