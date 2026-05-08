import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { OrsService } from './ors/ors.service';

const mockFetch = jest.fn();
(global as unknown as { fetch: jest.Mock }).fetch = mockFetch;

describe('OrsService', () => {
  let service: OrsService;

  beforeEach(async () => {
    mockFetch.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrsService],
    }).compile();
    service = module.get<OrsService>(OrsService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('proxyPost', () => {
    it('returns parsed JSON on a successful upstream response', async () => {
      const payload = { routes: [] };
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => payload });
      const result = await service.proxyPost('/v2/directions/driving-car', {});
      expect(result).toEqual(payload);
    });

    it('throws HttpException when upstream returns an error status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 2099, message: 'Unable to process route' } }),
      });
      await expect(
        service.proxyPost('/v2/directions/driving-car', {}),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('forwards the Authorization header to the upstream service', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      await service.proxyPost('/v2/directions/driving-car', {}, 'Bearer token123');
      const calledOptions = mockFetch.mock.calls[0][1] as RequestInit;
      expect((calledOptions.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer token123',
      );
    });
  });

  describe('proxyGet', () => {
    it('returns parsed JSON on a successful upstream response', async () => {
      const payload = { status: 'ready' };
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => payload });
      const result = await service.proxyGet('/v2/status', {});
      expect(result).toEqual(payload);
    });

    it('throws HttpException when upstream returns an error status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Service unavailable' }),
      });
      await expect(service.proxyGet('/v2/status', {})).rejects.toBeInstanceOf(
        HttpException,
      );
    });

    it('appends defined query parameters to the request URL', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      await service.proxyGet('/v2/geocode/search', { text: 'Sydney', size: '5' });
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('text=Sydney');
      expect(calledUrl).toContain('size=5');
    });

    it('omits undefined query parameters from the request URL', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      await service.proxyGet('/v2/geocode/search', { text: 'Sydney', size: undefined });
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('size');
    });

    it('repeats array query parameters as separate entries', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      await service.proxyGet('/v2/pois', { category_ids: ['180', '190'] });
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('category_ids=180');
      expect(calledUrl).toContain('category_ids=190');
    });
  });
});

