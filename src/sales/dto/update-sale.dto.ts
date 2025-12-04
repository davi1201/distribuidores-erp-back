import { PartialType } from '@nestjs/swagger';
import { CreateOrderDto } from './create-sale.dto';

export class UpdateSaleDto extends PartialType(CreateOrderDto) {}
