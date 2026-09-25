import { RedisService } from './redis.service';

describe('Redis fixed-window counter', () => {
  it('uses a single atomic script for count and TTL and forwards the result', async () => {
    const evalScript = jest.fn().mockResolvedValue([3, 3590]);
    const service = new RedisService();
    Object.assign(service, { client: { eval: evalScript } });
    await expect(
      service.incrementWindow('ratelimit:apikey:test', 3600),
    ).resolves.toEqual({ count: 3, ttl: 3590 });
    expect(evalScript).toHaveBeenCalledTimes(1);
    expect(evalScript).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'ratelimit:apikey:test',
      3600,
    );
  });
  it('does not silently bypass Redis failure', async () => {
    const service = new RedisService();
    Object.assign(service, {
      client: { eval: jest.fn().mockRejectedValue(new Error('unavailable')) },
    });
    await expect(service.incrementWindow('test', 3600)).rejects.toThrow(
      'unavailable',
    );
  });
});
