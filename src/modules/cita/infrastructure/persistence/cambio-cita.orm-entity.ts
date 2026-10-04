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
import { ActorCambio, TipoCambio } from '../../domain/cambio-cita.entity';
import { EstadoCita } from '../../domain/cita.entity';
import { CitaOrmEntity } from './cita.orm-entity';

// Bitacora append-only. Sin UpdateDateColumn a proposito: una fila nunca se
// modifica despues de escribirse.
@Entity('cambios_cita')
@Index('idx_cambio_cita_ocurrido', ['citaId', 'ocurridoEn'])
export class CambioCitaOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cita_id', nullable: false })
  citaId: string;

  @ManyToOne(() => CitaOrmEntity)
  @JoinColumn({ name: 'cita_id' })
  cita: CitaOrmEntity;

  @Column({ name: 'tenant_id', nullable: false })
  tenantId: string;

  @ManyToOne(() => TenantOrmEntity)
  @JoinColumn({ name: 'tenant_id' })
  tenant: TenantOrmEntity;

  @Column({ type: 'enum', enum: TipoCambio })
  tipo: TipoCambio;

  @Column({
    name: 'estado_anterior',
    type: 'enum',
    enum: EstadoCita,
    nullable: true,
  })
  estadoAnterior: EstadoCita | null;

  @Column({
    name: 'estado_nuevo',
    type: 'enum',
    enum: EstadoCita,
    nullable: true,
  })
  estadoNuevo: EstadoCita | null;

  @Column({ name: 'inicio_anterior', type: 'timestamptz', nullable: true })
  inicioAnterior: Date | null;

  @Column({ name: 'inicio_nuevo', type: 'timestamptz', nullable: true })
  inicioNuevo: Date | null;

  @Column({ type: 'varchar', nullable: true })
  motivo: string | null;

  @Column({ name: 'actor_tipo', type: 'enum', enum: ActorCambio })
  actorTipo: ActorCambio;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @CreateDateColumn({ name: 'ocurrido_en' })
  ocurridoEn: Date;
}
