import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../../domain/user.entity';
import { IUserRepository } from '../../domain/user.repository';

@Injectable()
export class TypeOrmUserRepository implements IUserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  save(user: Partial<User>): Promise<User> {
    return this.repo.save(user);
  }
}
