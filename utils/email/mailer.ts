import nodemailer, { type Transporter } from 'nodemailer';

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transporter: Transporter | null = null;

// Created on first send so the SMTP settings are read after dotenv has loaded them
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined
    });
  }
  return transporter;
};

// Sends through SMTP when SMTP_HOST is set. Without it (local development) the email is
// logged instead, so the flow can be followed without a mail server
export const sendEmail = async (email: Email) => {
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === 'production') {
      console.error(`SMTP_HOST is not set, so the email "${email.subject}" was not sent`);
    } else {
      console.info(`[email] To: ${email.to}\nSubject: ${email.subject}\n\n${email.text}`);
    }
    return;
  }

  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM ?? 'Money Manager <no-reply@moneymanager.app>',
    ...email
  });
};
