import { Test, TestingModule } from '@nestjs/testing';
import { PaymentTermService } from './payment-term.service';

describe('PaymentTermService', () => {
  let service: PaymentTermService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaymentTermService],
    }).compile();

    service = module.get<PaymentTermService>(PaymentTermService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
