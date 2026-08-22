import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-42';

@Injectable()
export class FtOauthStrategy extends PassportStrategy(Strategy, '42') {
  constructor() {
    super({
      clientID: process.env.FT_CLIENT_ID ?? '',
      clientSecret: process.env.FT_CLIENT_SECRET ?? '',
      callbackURL:
        process.env.FT_CALLBACK_URL ?? 'https://localhost/api/auth/42/callback',
      scope: ['public'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (err: any, user: any) => void,
  ): Promise<void> {
    const { id, username, displayName, emails, photos } = profile;
    const user = {
      oauthId: String(id),
      oauthProvider: '42',
      username: username ?? `ft_${id}`,
      displayName: displayName ?? username ?? `User${id}`,
      email: emails?.[0]?.value ?? `${id}@students.42.fr`,
      avatarUrl: photos?.[0]?.value ?? null,
    };
    done(null, user);
  }
}
