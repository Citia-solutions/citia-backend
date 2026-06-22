import { ConflictException, Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import type { IUserRepository } from '../domain/user.repository';
import { USER_REPOSITORY } from '../domain/user.repository';
import { CreateUserDto } from '../presentation/dto/create-user.dto';
import { UserResponseDto } from '../presentation/dto/user-response.dto';

@Injectable()
export class UsuariosService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async registerUser(dto: CreateUserDto): Promise<UserResponseDto> {
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const saved = await this.userRepository.save({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      ...(dto.role !== undefined && { role: dto.role }),
    });

    return new UserResponseDto({
      id: saved.id,
      email: saved.email,
      fullName: saved.fullName,
      role: saved.role,
      createdAt: saved.createdAt,
    });
  }
}
