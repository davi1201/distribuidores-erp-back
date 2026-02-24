import { Test, TestingModule } from '@nestjs/testing';
import { BankReconciliationController } from './bank-reconciliation.controller';
import { BankReconciliationService } from './bank-reconciliation.service';

describe('BankReconciliationController', () => {
  let controller: BankReconciliationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BankReconciliationController],
      providers: [BankReconciliationService],
    }).compile();

    controller = module.get<BankReconciliationController>(BankReconciliationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
