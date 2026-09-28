import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('Avatar upload validation and storage', () => {
  let app: INestApplication;
  let directory: string;
  const originalDirectory = process.env.UPLOAD_DIR;
  const updateAvatar = jest.fn();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jv1sAAAAASUVORK5CYII=',
    'base64',
  );

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: { updateAvatar } }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().user = { id: 'avatar-test-user' };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
  });

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'avatar-upload-test-'));
    process.env.UPLOAD_DIR = directory;
    updateAvatar
      .mockReset()
      .mockImplementation((_id, avatarUrl) => ({ avatarUrl }));
  });

  afterEach(async () => {
    if (originalDirectory === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = originalDirectory;
    await rm(directory, { recursive: true, force: true });
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['png', 'image/png', png],
    [
      'gif',
      'image/gif',
      Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64',
      ),
    ],
    [
      'jpg',
      'image/jpeg',
      Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex'),
    ],
    [
      'webp',
      'image/webp',
      Buffer.from(
        'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
        'base64',
      ),
    ],
  ])(
    'validates %s bytes before storing with a safe extension',
    async (ext, mime, buffer) => {
      const response = await request(app.getHttpServer())
        .post('/users/me/avatar')
        .attach('avatar', buffer, {
          filename: 'untrusted.html',
          contentType: 'application/octet-stream',
        })
        .expect(201);
      const files = await readdir(directory);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(new RegExp(`^avatar-[a-f0-9-]+\\.${ext}$`));
      expect(await readFile(join(directory, files[0]))).toEqual(buffer);
      expect(response.body.avatarUrl).toBe(`/uploads/${files[0]}`);
      expect(updateAvatar).toHaveBeenCalledWith(
        'avatar-test-user',
        response.body.avatarUrl,
        expect.objectContaining({ mimeType: mime, sizeBytes: buffer.length }),
      );
    },
  );

  it('rejects fake image content without writing a public file', async () => {
    await request(app.getHttpServer())
      .post('/users/me/avatar')
      .attach('avatar', Buffer.from('<script>alert(1)</script>'), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect(await readdir(directory)).toEqual([]);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it('rejects missing or oversized uploads without writing files', async () => {
    await request(app.getHttpServer()).post('/users/me/avatar').expect(400);
    await request(app.getHttpServer())
      .post('/users/me/avatar')
      .attach('avatar', Buffer.alloc(2 * 1024 * 1024 + 1), {
        filename: 'large.png',
        contentType: 'image/png',
      })
      .expect(413);
    expect(await readdir(directory)).toEqual([]);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it('removes the new file if the database update fails', async () => {
    updateAvatar.mockRejectedValueOnce(new Error('database unavailable'));
    await request(app.getHttpServer())
      .post('/users/me/avatar')
      .attach('avatar', png, {
        filename: 'avatar.png',
        contentType: 'image/png',
      })
      .expect(500);
    expect(await readdir(directory)).toEqual([]);
  });
});
