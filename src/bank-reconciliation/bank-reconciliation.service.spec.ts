import { Test, TestingModule } from '@nestjs/testing';
import { BankReconciliationService } from './bank-reconciliation.service';

describe('BankReconciliationService', () => {
  let service: BankReconciliationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BankReconciliationService],
    }).compile();

    service = module.get<BankReconciliationService>(BankReconciliationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
