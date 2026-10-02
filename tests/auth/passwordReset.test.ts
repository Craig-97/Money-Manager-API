import mongoose from 'mongoose';
import * as mailer from '../../utils/email/mailer';
import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithAccount
} from '../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const sendEmail = jest.spyOn(mailer, 'sendEmail').mockResolvedValue(undefined);
beforeEach(() => sendEmail.mockClear());

const REQUEST = `mutation ($email: String!) { requestPasswordReset(email: $email) { success } }`;
const VALID = `query ($token: String!) { passwordResetTokenValid(token: $token) }`;
const RESET = `mutation ($token: String!, $password: String!) {
  resetPassword(token: $token, password: $password) { token tokenExpiration user { id email } }
}`;
const LOGIN = `query ($email: String!, $password: String!) {
  login(email: $email, password: $password) { token }
}`;

// Requests a reset and returns the token from the link in the sent email
const requestToken = async (email: string) => {
  await gql(REQUEST, { email });
  const { text } = sendEmail.mock.calls.at(-1)![0];
  return text.match(/reset-password\?token=([a-f0-9]+)/)![1];
};

describe('requestPasswordReset', () => {
  it('emails a reset link to the user', async () => {
    const { email } = await createUserWithAccount({ withAccount: false });
    const body = await gql(REQUEST, { email });
    expect(body.errors).toBeUndefined();
    expect(body.data.requestPasswordReset.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      to: email,
      subject: 'Reset your Money Manager password',
      text: expect.stringContaining('Hi Test,')
    });
  });

  it('succeeds without sending anything for an unknown email', async () => {
    const body = await gql(REQUEST, { email: 'nobody@example.com' });
    expect(body.errors).toBeUndefined();
    expect(body.data.requestPasswordReset.success).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('stores only a hash of the token', async () => {
    const { email } = await createUserWithAccount({ withAccount: false });
    const token = await requestToken(email);
    const stored = await mongoose.model('User').findOne({ email });
    expect(stored.passwordResetTokenHash).toEqual(expect.any(String));
    expect(stored.passwordResetTokenHash).not.toBe(token);
  });

  it('replaces the previous link when requested again', async () => {
    const { email } = await createUserWithAccount({ withAccount: false });
    const first = await requestToken(email);
    const second = await requestToken(email);
    expect((await gql(VALID, { token: first })).data.passwordResetTokenValid).toBe(false);
    expect((await gql(VALID, { token: second })).data.passwordResetTokenValid).toBe(true);
  });
});

describe('resetPassword', () => {
  it('sets the new password and signs the user in', async () => {
    const { email, password, user } = await createUserWithAccount({ withAccount: false });
    const token = await requestToken(email);

    const body = await gql(RESET, { token, password: 'NewPassword1' });
    expect(body.errors).toBeUndefined();
    expect(body.data.resetPassword).toMatchObject({
      token: expect.any(String),
      tokenExpiration: 1,
      user: { id: user.id, email }
    });

    expect((await gql(LOGIN, { email, password: 'NewPassword1' })).errors).toBeUndefined();
    expect(errorCode(await gql(LOGIN, { email, password }))).toBe('INVALID_CREDENTIALS');
  });

  it('only lets a link be used once', async () => {
    const { email } = await createUserWithAccount({ withAccount: false });
    const token = await requestToken(email);
    await gql(RESET, { token, password: 'NewPassword1' });

    expect((await gql(VALID, { token })).data.passwordResetTokenValid).toBe(false);
    expect(errorCode(await gql(RESET, { token, password: 'Another1pass' }))).toBe(
      'PASSWORD_RESET_TOKEN_INVALID'
    );
  });

  it('rejects an expired link', async () => {
    const { email } = await createUserWithAccount({ withAccount: false });
    const token = await requestToken(email);
    await mongoose
      .model('User')
      .updateOne({ email }, { passwordResetExpires: new Date(Date.now() - 1000) });

    expect((await gql(VALID, { token })).data.passwordResetTokenValid).toBe(false);
    expect(errorCode(await gql(RESET, { token, password: 'NewPassword1' }))).toBe(
      'PASSWORD_RESET_TOKEN_INVALID'
    );
  });

  it('rejects an unknown token', async () => {
    expect(errorCode(await gql(RESET, { token: 'abc123', password: 'NewPassword1' }))).toBe(
      'PASSWORD_RESET_TOKEN_INVALID'
    );
  });

  it.each(['short1', 'nonumbers'])('rejects the weak password %s and keeps the link usable', async weak => {
    const { email } = await createUserWithAccount({ withAccount: false });
    const token = await requestToken(email);

    expect(errorCode(await gql(RESET, { token, password: weak }))).toBe('INVALID_PASSWORD');
    expect((await gql(VALID, { token })).data.passwordResetTokenValid).toBe(true);
  });
});
