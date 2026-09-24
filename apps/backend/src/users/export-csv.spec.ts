import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { accountExportCsv } from './export-csv';
import { ExportQueryDto } from './dto/export.dto';

describe('account CSV export', () => {
  it('exports heterogeneous datasets, nested settings, dates and every history record', () => {
    const csv = accountExportCsv({
      profile: {
        username: 'player',
        createdAt: new Date('2026-09-24T00:00:00Z'),
      },
      settings: { keyBindings: { left: 'KeyA' } },
      matchHistory: [{ id: 'one' }, { id: 'two' }],
      stats: null,
    });
    expect(csv).toContain(
      '"profile","0","createdAt","2026-09-24T00:00:00.000Z"',
    );
    expect(csv).toContain('"settings","0","keyBindings","{""left"":""KeyA""}"');
    expect(csv).toContain('"matchHistory","0","id","one"');
    expect(csv).toContain('"matchHistory","1","id","two"');
    expect(csv).toContain('"stats","0","",""');
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });
  it('escapes delimiters and spreadsheet formulas', () => {
    const csv = accountExportCsv({
      profile: { displayName: '=1+1', bio: 'a,"b"\nc' },
    });
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"a,""b""\nc"');
  });
  it('validates supported export formats and rejects unknown options', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const validate = (value: object) =>
      pipe.transform(value, { type: 'query', metatype: ExportQueryDto });
    expect(await validate({})).toMatchObject({ format: 'json' });
    expect(await validate({ format: 'csv' })).toMatchObject({ format: 'csv' });
    await expect(validate({ format: 'xml' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(validate({ userId: 'victim' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it('preserves scalar values and refuses executable or symbolic values', () => {
    const csv = accountExportCsv({
      values: { enabled: false, count: 0, bytes: 123n },
    });
    expect(csv).toContain('"enabled","false"');
    expect(csv).toContain('"count","0"');
    expect(csv).toContain('"bytes","123"');
    expect(() => accountExportCsv({ values: { invalid: () => 1 } })).toThrow(
      TypeError,
    );
    expect(() =>
      accountExportCsv({ values: { invalid: Symbol('x') } }),
    ).toThrow(TypeError);
  });
});
