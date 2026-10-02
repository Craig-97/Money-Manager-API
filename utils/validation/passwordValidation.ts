import { INVALID_PASSWORD } from '../errors';

// Matches the rules the front-end enforces on its password fields
export const validatePassword = (password: string) => {
  if (password.length < 8 || !/[0-9]/.test(password)) {
    throw INVALID_PASSWORD();
  }
};
