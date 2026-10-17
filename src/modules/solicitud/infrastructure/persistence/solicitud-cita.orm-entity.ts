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
import {
  EstadoSolicitud,
  TipoSolicitud,
} from '../../domain/solicitud-cita.entity';

/**
 * Fila de `solicitudes_cita`. Esquema real: migraciones 1750000006000,
 * 1750000007000, 1750000013000 y 1750000014000.
 *
 * Índices y CHECK se declaran también aquí para que un esquema creado con
 * `synchronize` (BD efímera de tests) quede igual que el de las migraciones.
 */
@Entity('solicitudes_cita')
// Soporta la bandeja (pendientes de la organización) y la regla anti-spam
// (una solicitud abierta por RUT dentro de la ventana).
@Index('idx_solicitud_tenant_estado', ['tenantId', 'estado'])
@Index('idx_solicitud_tenant_rut_estado', ['tenantId', 'rut', 'estado'])
// Fase 3 (R5): una solicitud de otra hora `recibida` por cita de origen.
@Index('uq_solicitud_reagendamiento_recibida', ['citaOrigenId'], {
  unique: true,
  where: `"tipo" = '${TipoSolicitud.REAGENDAMIENTO}' AND "estado" = '${EstadoSolicitud.RECIBIDA}'`,
})
// Fase 3 (R4): `GET /solicitudes?citaOrigenId=`.
@Index('idx_solicitud_tenant_cita_origen', ['tenantId', 'citaOrigenId'])
@Check(
  'CHK_solicitudes_cita_reagendamiento_origen',
  `"tipo" <> '${TipoSolicitud.REAGENDAMIENTO}' OR "cita_origen_id" IS NOT NULL`,
)
@Check(
  'CHK_solicitudes_cita_nueva_datos',
  `"tipo" <> '${TipoSolicitud.NUEVA}' OR ("rut" IS NOT NULL AND "correo" IS NOT NULL)`,
)
export class SolicitudCitaOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', nullable: false })
  tenantId: string;

  @ManyToOne(() => TenantOrmEntity)
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantOrmEntity;

  // Nulo mientras una `nueva` está en la bandeja: el enlace es de la
  // organización. Una de reagendamiento nace con el dueño de la cita.
  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId: string | null;

  // RUT en forma canónica, igual que en pacientes. NULL solo en
  // reagendamiento (copiado de una ficha sin RUT).
  @Column({ type: 'varchar', nullable: true })
  rut: string | null;

  @Column({ name: 'nombre_paciente', type: 'varchar', nullable: false })
  nombrePaciente: string;

  @Column({ type: 'varchar', nullable: false })
  telefono: string;

  // NULL solo en reagendamiento (copiado de una ficha sin correo).
  @Column({ type: 'varchar', nullable: true })
  correo: string | null;

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

  // Cita generada (o movida) al aceptar. Sin relación ni clave foránea a
  // propósito (ADR-09): `solicitud` depende de `cita` a nivel de APLICACIÓN
  // (la bandeja usa CitasService), no de esquema. La tabla no referencia a
  // `citas` y el núcleo `cita` no sabe que las solicitudes existen.
  @Column({ name: 'cita_id', type: 'uuid', nullable: true })
  citaId: string | null;

  // `timestamptz` como en la migración 1750000006000: sin el tipo, un esquema
  // creado con `synchronize` (tests) la dejaba como `timestamp` sin zona y
  // `pg` la leía en la zona del proceso (desfase de horas fuera de UTC).
  @CreateDateColumn({ name: 'recibida_en', type: 'timestamptz' })
  recibidaEn: Date;

  // Cuándo salió de la bandeja (aceptada, rechazada o descartada). Nulo
  // mientras está `recibida`. Lo fija el dominio, no la BD: no lleva default.
  @Column({ name: 'resuelta_en', type: 'timestamptz', nullable: true })
  resueltaEn: Date | null;

  @Column({
    type: 'enum',
    enum: TipoSolicitud,
    default: TipoSolicitud.NUEVA,
  })
  tipo: TipoSolicitud;

  // Solo en reagendamiento: la cita que se quiere mover. Sin FK (ADR-09),
  // como `cita_id`.
  @Column({ name: 'cita_origen_id', type: 'uuid', nullable: true })
  citaOrigenId: string | null;

  // Solo en reagendamiento: con qué enlace se pidió (`enlaces_cita.id`). Sin FK.
  @Column({ name: 'enlace_id', type: 'uuid', nullable: true })
  enlaceId: string | null;
}
