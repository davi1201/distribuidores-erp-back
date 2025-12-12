import { Test, TestingModule } from '@nestjs/testing';
import { NfeService } from './nfe.service';

describe('NfeService', () => {
  let service: NfeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NfeService],
    }).compile();

    service = module.get<NfeService>(NfeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
