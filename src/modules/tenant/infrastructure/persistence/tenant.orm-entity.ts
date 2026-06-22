import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { TipoTenant } from '../../domain/tenant.entity';

@Entity('tenants')
export class TenantOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  nombre: string;

  @Column({
    type: 'enum',
    enum: TipoTenant,
    default: TipoTenant.INDEPENDIENTE,
  })
  tipo: TipoTenant;

  @Column({ default: 'free' })
  plan: string;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
