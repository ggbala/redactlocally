import type { ValidatorId } from '../types';
import { isValidIban } from './iban';
import { isValidLuhn } from './luhn';
import { isValidSsn } from './ssn';

const VALIDATOR_REGISTRY: Readonly<Record<ValidatorId, (value: string) => boolean>> = {
  luhn: isValidLuhn,
  iban: isValidIban,
  ssn: isValidSsn,
};

export function runValidator(validatorId: ValidatorId, value: string): boolean {
  const fn = VALIDATOR_REGISTRY[validatorId];
  return fn ? fn(value) : false;
}

export { isValidIban, isValidLuhn, isValidSsn };
