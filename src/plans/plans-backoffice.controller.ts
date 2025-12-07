import {
  Controller,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { Roles } from '../auth/decorators/roles.decorator'; // Vamos criar jájá
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Audit } from '../audit/decorators/audit.decorator';

@Controller('backoffice/plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class PlansBackofficeController {
  constructor(private readonly plansService: PlansService) {}

  @Post()
  @Audit('CREATE', 'Plan')
  create(@Body() createPlanDto: CreatePlanDto) {
    return this.plansService.create(createPlanDto);
  }

  @Patch(':id')
  @Audit('UPDATE', 'Plan')
  update(@Param('id') id: string, @Body() updatePlanDto: UpdatePlanDto) {
    return this.plansService.update(id, updatePlanDto);
  }

  @Delete(':id')
  @Audit('REMOVE', 'Plan')
  remove(@Param('id') id: string) {
    return this.plansService.remove(id);
  }

  @Patch(':id/status')
  @Audit('TOGGLE_STATUS', 'Plan')
  toggleStatus(@Param('id') id: string) {
    return this.plansService.toggleStatus(id);
  }
}
