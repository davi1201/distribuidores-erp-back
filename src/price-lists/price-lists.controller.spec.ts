import { Test, TestingModule } from '@nestjs/testing';
import { PriceListsController } from './price-lists.controller';
import { PriceListsService } from './price-lists.service';

describe('PriceListsController', () => {
  let controller: PriceListsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PriceListsController],
      providers: [PriceListsService],
    }).compile();

    controller = module.get<PriceListsController>(PriceListsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
