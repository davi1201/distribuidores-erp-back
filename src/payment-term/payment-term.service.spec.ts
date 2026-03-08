import { Test, TestingModule } from '@nestjs/testing';
import { PaymentTermsService } from './payment-term.service';

describe('PaymentTermsService', () => {
  let service: PaymentTermsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaymentTermsService],
    }).compile();

    service = module.get<PaymentTermsService>(PaymentTermsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
