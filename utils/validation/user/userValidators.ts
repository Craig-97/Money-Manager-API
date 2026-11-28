import { INVALID_ACCENT, INVALID_PASSWORD } from '../../errors';
import { parseInput } from '../common';
import { accent, password } from './userFields';

// These keep the error codes the front end already knows, rather than BAD_USER_INPUT

export const validatePassword = (value: string) => parseInput(password, value, INVALID_PASSWORD);

export const validateAccent = (value: string) => parseInput(accent, value, INVALID_ACCENT);
