import { UserRole } from '../../domain/user.entity';

export class UserResponseDto {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  createdAt: Date;

  constructor(partial: UserResponseDto) {
    Object.assign(this, partial);
  }
}
