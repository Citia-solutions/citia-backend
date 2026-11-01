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
import { UsuarioOrmEntity } from '../../../usuario/infrastructure/persistence/usuario.orm-entity';
import { LARGO_MAXIMO_MENSAJE_SOPORTE } from '../../domain/limites-soporte';
import {
  CategoriaSoporte,
  EstadoEnvioSoporte,
} from '../../domain/mensaje-soporte.entity';

const lista = (valores: readonly string[]): string =>
  valores.map((valor) => `'${valor}'`).join(', ');

/**
 * Los mismos CHECK que la migración 1750000020000, derivados del vocabulario
 * del dominio. `mensaje-soporte.orm-entity.spec.ts` comprueba que digan lo
 * mismo que el texto de la migración.
 */
export const CHECKS_MENSAJES_SOPORTE = {
  CHK_mensajes_soporte_categoria: `"categoria" IN (${lista(Object.values(CategoriaSoporte))})`,
  CHK_mensajes_soporte_mensaje: `char_length("mensaje") BETWEEN 1 AND ${LARGO_MAXIMO_MENSAJE_SOPORTE} AND btrim("mensaje") <> ''`,
  CHK_mensajes_soporte_estado_envio: `"estado_envio" IN (${lista(Object.values(EstadoEnvioSoporte))})`,
  CHK_mensajes_soporte_enviado: `("estado_envio" = '${EstadoEnvioSoporte.ENVIADO}') = ("enviado_en" IS NOT NULL)`,
  CHK_mensajes_soporte_intentos: `"intentos" >= 0`,
} as const;

/** Predicado del índice parcial del job: el reclamo lo escribe IGUAL. */
export const PREDICADO_PENDIENTES = `"estado_envio" = '${EstadoEnvioSoporte.PENDIENTE}'`;

/**
 * Fila de `mensajes_soporte` (US-10, ADR-15 §7). Esquema real: migración
 * 1750000020000.
 *
 * Índices, CHECK, FK y los nombres de la PK y las FK se declaran también aquí
 * para que un esquema creado con `synchronize` (BD efímera de tests) quede
 * igual que el de la migración. Fechas `timestamptz` declaradas (DT-46).
 *
 * El adaptador (`TypeOrmMensajeSoporteRepository`) escribe con SQL explícito
 * (`RETURNING`, guarda de estado, SKIP LOCKED): esta clase registra la tabla
 * y su forma, no se usa con `save()`.
 */
@Entity('mensajes_soporte')
@Index('idx_mensajes_soporte_pendientes', ['proximoIntentoEn'], {
  where: PREDICADO_PENDIENTES,
})
@Index('idx_mensajes_soporte_tenant_creado', ['tenantId', 'creadoEn'])
@Check(
  'CHK_mensajes_soporte_categoria',
  CHECKS_MENSAJES_SOPORTE.CHK_mensajes_soporte_categoria,
)
@Check(
  'CHK_mensajes_soporte_mensaje',
  CHECKS_MENSAJES_SOPORTE.CHK_mensajes_soporte_mensaje,
)
@Check(
  'CHK_mensajes_soporte_estado_envio',
  CHECKS_MENSAJES_SOPORTE.CHK_mensajes_soporte_estado_envio,
)
@Check(
  'CHK_mensajes_soporte_enviado',
  CHECKS_MENSAJES_SOPORTE.CHK_mensajes_soporte_enviado,
)
@Check(
  'CHK_mensajes_soporte_intentos',
  CHECKS_MENSAJES_SOPORTE.CHK_mensajes_soporte_intentos,
)
export class MensajeSoporteOrmEntity {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_mensajes_soporte_id',
  })
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => TenantOrmEntity, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'tenant_id',
    foreignKeyConstraintName: 'FK_mensajes_soporte_tenant_id',
  })
  tenant?: TenantOrmEntity;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @ManyToOne(() => UsuarioOrmEntity, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'usuario_id',
    foreignKeyConstraintName: 'FK_mensajes_soporte_usuario_id',
  })
  usuario?: UsuarioOrmEntity;

  @Column({
    type: 'varchar',
    length: 20,
    default: CategoriaSoporte.OTRO,
  })
  categoria: CategoriaSoporte;

  // El texto del profesional. Nunca a los logs (ADR-15 §7); sin plazo (DT-26).
  @Column({ type: 'text' })
  mensaje: string;

  @Column({
    name: 'estado_envio',
    type: 'varchar',
    length: 20,
    default: EstadoEnvioSoporte.PENDIENTE,
  })
  estadoEnvio: EstadoEnvioSoporte;

  @Column({ type: 'int', default: 0 })
  intentos: number;

  @Column({
    name: 'proximo_intento_en',
    type: 'timestamptz',
    default: () => 'now()',
  })
  proximoIntentoEn: Date;

  // Solo un código, nunca un mensaje. Truncado por el adaptador.
  @Column({
    name: 'ultimo_error',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  ultimoError: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  proveedor: string | null;

  @Column({
    name: 'proveedor_mensaje_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  proveedorMensajeId: string | null;

  @Column({ name: 'enviado_en', type: 'timestamptz', nullable: true })
  enviadoEn: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}
