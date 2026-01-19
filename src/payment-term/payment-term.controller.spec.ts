import { Test, TestingModule } from '@nestjs/testing';
import { PaymentTermController } from './payment-term.controller';
import { PaymentTermService } from './payment-term.service';

describe('PaymentTermController', () => {
  let controller: PaymentTermController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentTermController],
      providers: [PaymentTermService],
    }).compile();

    controller = module.get<PaymentTermController>(PaymentTermController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
