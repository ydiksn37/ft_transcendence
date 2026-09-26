import { TournamentService } from './tournament.service';

describe('TournamentService live tournament persistence', () => {
  it('creates entries and the complete persistent bracket in one transaction', async () => {
    const tx = {
      tournament: { create: jest.fn().mockResolvedValue({ id: 'tournament' }) },
      tournamentEntry: {
        createMany: jest.fn().mockResolvedValue({ count: 4 }),
      },
      tournamentMatch: {
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: 'db-m1' })
          .mockResolvedValueOnce({ id: 'db-m2' })
          .mockResolvedValueOnce({ id: 'db-final' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new TournamentService(prisma as never);

    const result = await service.createLiveTournament(
      'Cup',
      'u1',
      ['u1', 'u2', 'u3', 'u4'],
      [
        {
          clientMatchId: 'm1',
          round: 1,
          matchNumber: 1,
          player1Id: 'u1',
          player2Id: 'u2',
          status: 'PENDING',
        },
        {
          clientMatchId: 'm2',
          round: 1,
          matchNumber: 2,
          player1Id: 'u3',
          player2Id: 'u4',
          status: 'PENDING',
        },
        {
          clientMatchId: 'final',
          round: 2,
          matchNumber: 1,
          player1Id: null,
          player2Id: null,
          status: 'PENDING',
        },
      ],
    );

    expect(tx.tournamentEntry.createMany).toHaveBeenCalledWith({
      data: [
        { tournamentId: 'tournament', userId: 'u1', seed: 1 },
        { tournamentId: 'tournament', userId: 'u2', seed: 2 },
        { tournamentId: 'tournament', userId: 'u3', seed: 3 },
        { tournamentId: 'tournament', userId: 'u4', seed: 4 },
      ],
    });
    expect(tx.tournamentMatch.create).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      tournamentId: 'tournament',
      matchIds: { m1: 'db-m1', m2: 'db-m2', final: 'db-final' },
    });
  });

  it('persists participant counts other than 4, 8, or 16', async () => {
    const tx = {
      tournament: { create: jest.fn().mockResolvedValue({ id: 'tournament' }) },
      tournamentEntry: {
        createMany: jest.fn().mockResolvedValue({ count: 5 }),
      },
      tournamentMatch: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new TournamentService(prisma as never);

    await service.createLiveTournament(
      'Cup',
      'u1',
      ['u1', 'u2', 'u3', 'u4', 'u5'],
      [],
    );

    expect(tx.tournament.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ maxPlayers: 5 }),
    });
    expect(tx.tournamentEntry.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: 'u5', seed: 5 }),
      ]),
    });
  });

  it('completes a match and advances its winner into the correct next slot', async () => {
    const tx = {
      tournamentMatch: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'm2',
            tournamentId: 't1',
            round: 1,
            matchNumber: 2,
            player1Id: 'u3',
            player2Id: 'u4',
            status: 'IN_PROGRESS',
          })
          .mockResolvedValueOnce({ id: 'final' }),
        update: jest.fn().mockResolvedValue({ id: 'm2', status: 'COMPLETED' }),
      },
      tournament: { update: jest.fn() },
      tournamentEntry: { update: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new TournamentService(prisma as never);

    await service.completeLiveMatch('t1', 'm2', 'u4', 'result');

    expect(tx.tournamentMatch.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'final' },
      data: { player2Id: 'u4' },
    });
    expect(tx.tournament.update).not.toHaveBeenCalled();
  });

  it('marks the tournament complete when the final has no parent match', async () => {
    const tx = {
      tournamentMatch: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'final',
            tournamentId: 't1',
            round: 2,
            matchNumber: 1,
            player1Id: 'u1',
            player2Id: 'u4',
            status: 'IN_PROGRESS',
          })
          .mockResolvedValueOnce(null),
        update: jest.fn().mockResolvedValue({ id: 'final' }),
      },
      tournament: { update: jest.fn().mockResolvedValue({}) },
      tournamentEntry: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new TournamentService(prisma as never);

    await service.completeLiveMatch('t1', 'final', 'u1', 'result');

    expect(tx.tournament.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: expect.objectContaining({ status: 'COMPLETED', winnerId: 'u1' }),
    });
    expect(tx.tournamentEntry.update).toHaveBeenCalledWith({
      where: { tournamentId_userId: { tournamentId: 't1', userId: 'u1' } },
      data: { finalRank: 1 },
    });
  });
});
