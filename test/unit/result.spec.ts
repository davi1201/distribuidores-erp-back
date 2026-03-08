// ============================================================================
// RESULT PATTERN TESTS - Testes do padrão Result/Either
// ============================================================================

import {
  Success,
  Failure,
  ok,
  fail,
  combine,
  tryCatch,
  tryCatchSync,
  DomainError,
  DomainErrors,
} from '../../src/core/result';

describe('Result Pattern', () => {
  describe('Success', () => {
    it('deve criar um resultado de sucesso', () => {
      const result = ok('valor');

      expect(result.isSuccess).toBe(true);
      expect(result.isFailure).toBe(false);
      expect(result.value).toBe('valor');
    });

    it('deve permitir map em sucesso', () => {
      const result = ok(5).map((x) => x * 2);

      expect(result.isSuccess).toBe(true);
      expect((result as Success<number>).value).toBe(10);
    });

    it('deve permitir flatMap em sucesso', () => {
      const result = ok(5).flatMap((x) => ok(x * 2));

      expect(result.isSuccess).toBe(true);
      expect((result as Success<number>).value).toBe(10);
    });

    it('deve retornar valor com getOrElse', () => {
      const result = ok('valor');

      expect(result.getOrElse('default')).toBe('valor');
    });

    it('deve retornar valor com unwrap', () => {
      const result = ok('valor');

      expect(result.unwrap()).toBe('valor');
    });
  });

  describe('Failure', () => {
    it('deve criar um resultado de falha', () => {
      const error = new DomainError('CODE', 'mensagem');
      const result = fail(error);

      expect(result.isSuccess).toBe(false);
      expect(result.isFailure).toBe(true);
      expect(result.error).toBe(error);
    });

    it('não deve aplicar map em falha', () => {
      const error = new DomainError('CODE', 'mensagem');
      const result = fail(error).map((x) => x);

      expect(result.isFailure).toBe(true);
    });

    it('deve retornar default com getOrElse', () => {
      const error = new DomainError('CODE', 'mensagem');
      const result = fail(error);

      expect(result.getOrElse('default')).toBe('default');
    });

    it('deve lançar erro com unwrap', () => {
      const error = new DomainError('CODE', 'mensagem');
      const result = fail(error);

      expect(() => result.unwrap()).toThrow(error);
    });
  });

  describe('combine', () => {
    it('deve combinar múltiplos sucessos', () => {
      const results = [ok(1), ok(2), ok(3)];
      const combined = combine(results);

      expect(combined.isSuccess).toBe(true);
      expect((combined as Success<number[]>).value).toEqual([1, 2, 3]);
    });

    it('deve retornar primeira falha', () => {
      const error = new DomainError('CODE', 'erro');
      const results = [ok(1), fail(error), ok(3)];
      const combined = combine(results);

      expect(combined.isFailure).toBe(true);
      expect((combined as Failure<DomainError>).error).toBe(error);
    });
  });

  describe('tryCatch', () => {
    it('deve retornar sucesso quando função executa', async () => {
      const result = await tryCatch(async () => 'valor');

      expect(result.isSuccess).toBe(true);
      expect((result as Success<string>).value).toBe('valor');
    });

    it('deve retornar falha quando função lança erro', async () => {
      const result = await tryCatch(async () => {
        throw new Error('erro');
      });

      expect(result.isFailure).toBe(true);
      expect((result as Failure<DomainError>).error.message).toBe('erro');
    });

    it('deve usar errorMapper quando fornecido', async () => {
      const result = await tryCatch(
        async () => {
          throw new Error('original');
        },
        () => new DomainError('CUSTOM', 'mapeado'),
      );

      expect(result.isFailure).toBe(true);
      expect((result as Failure<DomainError>).error.code).toBe('CUSTOM');
      expect((result as Failure<DomainError>).error.message).toBe('mapeado');
    });
  });

  describe('tryCatchSync', () => {
    it('deve retornar sucesso quando função executa', () => {
      const result = tryCatchSync(() => 'valor');

      expect(result.isSuccess).toBe(true);
      expect((result as Success<string>).value).toBe('valor');
    });

    it('deve retornar falha quando função lança erro', () => {
      const result = tryCatchSync(() => {
        throw new Error('erro');
      });

      expect(result.isFailure).toBe(true);
    });
  });

  describe('DomainErrors', () => {
    it('deve criar erro NOT_FOUND', () => {
      const error = DomainErrors.notFound('Produto', 'prod-1');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Produto não encontrado(a)');
      expect(error.details).toEqual({ entity: 'Produto', id: 'prod-1' });
    });

    it('deve criar erro ALREADY_EXISTS', () => {
      const error = DomainErrors.alreadyExists('Email', 'email');

      expect(error.code).toBe('ALREADY_EXISTS');
      expect(error.message).toBe('Email já existe');
    });

    it('deve criar erro INSUFFICIENT_STOCK', () => {
      const error = DomainErrors.insufficientStock('prod-1', 10, 5);

      expect(error.code).toBe('INSUFFICIENT_STOCK');
      expect(error.details).toEqual({
        productId: 'prod-1',
        requested: 10,
        available: 5,
      });
    });
  });
});

describe('DomainError', () => {
  it('deve criar erro com código e mensagem', () => {
    const error = new DomainError('TEST_ERROR', 'Mensagem de teste');

    expect(error.code).toBe('TEST_ERROR');
    expect(error.message).toBe('Mensagem de teste');
    expect(error.name).toBe('DomainError');
  });

  it('deve criar erro com detalhes', () => {
    const details = { field: 'email', value: 'invalid' };
    const error = new DomainError('VALIDATION', 'Campo inválido', details);

    expect(error.details).toEqual(details);
  });
});
