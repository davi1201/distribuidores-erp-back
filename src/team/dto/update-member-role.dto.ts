import { IsEnum, IsNotEmpty } from 'class-validator';
import { Role } from '@prisma/client';

export class UpdateMemberRoleDto {
  @IsNotEmpty()
  @IsEnum(Role, { message: 'Papel inválido. Use: ADMIN, SELLER ou SUPPORT' })
  role: Role;
}
