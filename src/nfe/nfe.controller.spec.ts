import { Test, TestingModule } from '@nestjs/testing';
import { NfeController } from './nfe.controller';
import { NfeService } from './nfe.service';

describe('NfeController', () => {
  let controller: NfeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NfeController],
      providers: [NfeService],
    }).compile();

    controller = module.get<NfeController>(NfeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
