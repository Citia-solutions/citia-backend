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
  ActorCambio,
  PedidoPor,
  TipoCambio,
} from '../../domain/cambio-cita.entity';
import { EstadoCita } from '../../domain/cita.entity';
import { CitaOrmEntity } from './cita.orm-entity';

// Bitacora append-only. Sin UpdateDateColumn a proposito: una fila nunca se
// modifica despues de escribirse.
//
// Esquema real: migraciones 1750000005000 y 1750000016000 (`pedido_por` y sus
// dos CHECK). Los CHECK se declaran también aquí para que el esquema de
// `synchronize` (tests) quede igual al de la migración.
@Entity('cambios_cita')
@Index('idx_cambio_cita_ocurrido', ['citaId', 'ocurridoEn'])
// US-07.01: "quién lo pidió" solo tiene sentido al cancelar o reagendar.
@Check(
  'CHK_cambios_cita_pedido_por',
  `"pedido_por" IS NULL OR "tipo" IN ('${TipoCambio.CANCELADA}', '${TipoCambio.REAGENDADA}')`,
)
// US-07.01: el paciente, por su enlace, nunca actúa "por decisión del
// profesional". Vacío se acepta (filas anteriores a US-07.01).
@Check(
  'CHK_cambios_cita_pedido_por_paciente',
  `"actor_tipo" <> '${ActorCambio.PACIENTE}' OR "pedido_por" IS NULL OR "pedido_por" = '${PedidoPor.PACIENTE}'`,
)
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

  // US-07.01 (H3): quién pidió la cancelación o el reagendamiento. Vacío =
  // sin dato = cuenta como del profesional.
  @Column({
    name: 'pedido_por',
    type: 'enum',
    enum: PedidoPor,
    nullable: true,
  })
  pedidoPor: PedidoPor | null;

  // `timestamptz` como en la migración 1750000005000 (DT-46): sin el tipo, un
  // esquema creado con `synchronize` (tests) la dejaba sin zona, y desde
  // US-07.01 `ultimosCambiosPorTipo` devuelve este instante para compararlo.
  @CreateDateColumn({ name: 'ocurrido_en', type: 'timestamptz' })
  ocurridoEn: Date;
}
