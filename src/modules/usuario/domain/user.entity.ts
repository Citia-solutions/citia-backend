import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  PROFESSIONAL = 'PROFESSIONAL',
  ADMIN = 'ADMIN',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: false })
  email: string;

  @Column({ name: 'password_hash', nullable: false })
  passwordHash: string;

  @Column({ name: 'full_name', nullable: false })
  fullName: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.PROFESSIONAL,
  })
  role: UserRole;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
