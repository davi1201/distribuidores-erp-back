import { IsNotEmpty, IsString, MinLength, IsUUID } from 'class-validator';

export class AcceptInviteDto {
  @IsUUID()
  @IsNotEmpty()
  token: string; // O token que veio na URL

  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'O nome deve ter pelo menos 3 caracteres.' })
  name: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'A senha deve ter pelo menos 6 caracteres.' })
  password: string;
}
