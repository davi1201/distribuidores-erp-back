import { Test, TestingModule } from '@nestjs/testing';
import { TaxProfilesController } from './tax-profiles.controller';
import { TaxProfilesService } from './tax-profiles.service';

describe('TaxProfilesController', () => {
  let controller: TaxProfilesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaxProfilesController],
      providers: [TaxProfilesService],
    }).compile();

    controller = module.get<TaxProfilesController>(TaxProfilesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
