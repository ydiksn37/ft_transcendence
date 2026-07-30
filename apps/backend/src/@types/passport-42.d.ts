declare module 'passport-42' {
  import { Strategy as PassportStrategy } from 'passport';

  export interface Profile {
    id: string | number;
    username: string;
    displayName: string;
    emails?: Array<{ value: string }>;
    photos?: Array<{ value: string }>;
    _raw: string;
    _json: any;
  }

  export interface StrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    scope?: string[];
  }

  export class Strategy extends PassportStrategy {
    constructor(
      options: StrategyOptions,
      verify: (
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: (err: any, user?: any) => void,
      ) => void,
    );
  }
}
