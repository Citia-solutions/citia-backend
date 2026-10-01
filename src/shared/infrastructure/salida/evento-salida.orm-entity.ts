import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { EstadoEventoSalida } from '../../application/eventos-salida.repository';

const ESTADOS_SQL = Object.values(EstadoEventoSalida)
  .map((estado) => `'${estado}'`)
  .join(', ');

/**
 * Fila del outbox (ADR-12 §1). Esquema real: migración 1750000008000.
 *
 * El índice parcial y el CHECK se declaran también aquí para que un esquema
 * creado con `synchronize` (BD efímera de tests) quede igual que el de la
 * migración.
 *
 * Sin relación con `tenants` a propósito: la tabla es infraestructura.
 */
@Entity('eventos_salida')
@Index('idx_salida_pendientes', ['proximoIntentoEn'], {
  where: `"estado" = 'pendiente'`,
})
@Check('CHK_eventos_salida_estado', `"estado" IN (${ESTADOS_SQL})`)
export class EventoSalidaOrmEntity {
  // Lo genera el adaptador al insertar; el DEFAULT de la BD es solo red.
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  nombre: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  // Solo ids y datos no sensibles (ADR-09 §3 regla 5).
  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ name: 'ocurrido_en', type: 'timestamptz' })
  ocurridoEn: Date;

  @Column({ type: 'varchar', default: EstadoEventoSalida.PENDIENTE })
  estado: EstadoEventoSalida;

  @Column({ type: 'int', default: 0 })
  intentos: number;

  @Column({
    name: 'proximo_intento_en',
    type: 'timestamptz',
    default: () => 'now()',
  })
  proximoIntentoEn: Date;

  // Código o mensaje corto, nunca datos personales. Truncado por el adaptador.
  @Column({ name: 'ultimo_error', type: 'varchar', nullable: true })
  ultimoError: string | null;

  @Column({ name: 'entregado_en', type: 'timestamptz', nullable: true })
  entregadoEn: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}
