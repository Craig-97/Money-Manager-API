import { sendEmail } from './mailer';

interface PasswordResetEmail {
  to: string;
  firstName?: string;
  token: string;
  expiresInMinutes: number;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

// The front-end page that reads the token from the link and calls resetPassword
export const passwordResetUrl = (token: string) =>
  `${process.env.CLIENT_URL ?? 'http://localhost:5173'}/reset-password?token=${token}`;

export const sendPasswordResetEmail = async ({
  to,
  firstName,
  token,
  expiresInMinutes
}: PasswordResetEmail) => {
  const url = passwordResetUrl(token);
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  const expiry = expiresInMinutes === 60 ? '1 hour' : `${expiresInMinutes} minutes`;

  await sendEmail({
    to,
    subject: 'Reset your Money Manager password',
    text: [
      greeting,
      '',
      'We got a request to reset the password for your Money Manager account.',
      `Choose a new password here: ${url}`,
      '',
      `This link expires in ${expiry}. If you didn't ask for this, you can ignore this email and your password won't change.`
    ].join('\n'),
    html: `
      <p>${escapeHtml(greeting)}</p>
      <p>We got a request to reset the password for your Money Manager account.</p>
      <p><a href="${url}">Choose a new password</a></p>
      <p>This link expires in ${expiry}. If you didn't ask for this, you can ignore this email and your password won't change.</p>
      <p>Or paste this link into your browser:<br>${url}</p>
    `
  });
};
