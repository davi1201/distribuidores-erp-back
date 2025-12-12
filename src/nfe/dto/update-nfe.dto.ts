import { PartialType } from '@nestjs/swagger';
import { CreateNfeDto } from './create-nfe.dto';

export class UpdateNfeDto extends PartialType(CreateNfeDto) {}
