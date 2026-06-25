import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { AdminUser } from './admin-user.entity';

export enum AdminRoleType {
  SUPER_ADMIN = 'super_admin',
  OPERATIONS = 'operations',
  SUPPORT = 'support',
  FINANCE = 'finance',
  TECH = 'tech',
  READ_ONLY = 'read_only',
}

@Entity('admin_roles')
export class AdminRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: AdminRoleType,
  })
  type: AdminRoleType;

  @Column('text', { array: true, nullable: true })
  permissions: string[];

  @OneToMany(() => AdminUser, (user) => user.role)
  users: AdminUser[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

