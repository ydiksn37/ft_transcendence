import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    this.from =
      process.env.SMTP_FROM ?? 'ft_transcendence <noreply@transcendence.local>';
    this.transporter =
      host && user && pass
        ? nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: { user, pass },
          })
        : null;
  }

  async sendAccountDeletionCode(
    email: string,
    displayName: string,
    code: string,
    expiresMinutes: number,
  ): Promise<void> {
    await this.send(
      email,
      '[ft_transcendence] Confirm account deletion',
      [
        `Hello ${displayName},`,
        '',
        'We received a request to permanently delete your account.',
        `Confirmation code: ${code}`,
        `This code expires in ${expiresMinutes} minutes.`,
        '',
        'If you did not request this, do not share the code and change your password.',
      ].join('\n'),
    );
  }

  async sendAccountDeleted(email: string, displayName: string): Promise<void> {
    await this.send(
      email,
      '[ft_transcendence] Account deleted',
      [
        `Hello ${displayName},`,
        '',
        'Your ft_transcendence account and personal data have been permanently deleted.',
        'Anonymized match records may be retained without an account identifier.',
      ].join('\n'),
    );
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.transporter) {
      throw new ServiceUnavailableException('メール送信設定が未構成です');
    }
    await this.transporter.sendMail({ from: this.from, to, subject, text });
  }
}
