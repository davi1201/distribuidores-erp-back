import { Test, TestingModule } from '@nestjs/testing';
import { TaxProfilesService } from './tax-profiles.service';

describe('TaxProfilesService', () => {
  let service: TaxProfilesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaxProfilesService],
    }).compile();

    service = module.get<TaxProfilesService>(TaxProfilesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
