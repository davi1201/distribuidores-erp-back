import { Test, TestingModule } from '@nestjs/testing';
import { PaymentTermsController } from './payment-term.controller';
import { PaymentTermsService } from './payment-term.service';

describe('PaymentTermsController', () => {
  let controller: PaymentTermsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentTermsController],
      providers: [PaymentTermsService],
    }).compile();

    controller = module.get<PaymentTermsController>(PaymentTermsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
