import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { ClerkAuthGuard } from '../auth/guards/clerk-auth.guard';

@Controller('locations')
@UseGuards(ClerkAuthGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get('states')
  getStates() {
    return this.locationsService.findAllStates();
  }

  @Get('cities/:id')
  getCities(@Param('id') id: number) {
    return this.locationsService.findCitiesByState(parseInt(id as any, 10));
  }
}
