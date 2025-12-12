import { customAlphabet } from 'nanoid';

export const generateSku = customAlphabet(
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZ',
  8,
);
