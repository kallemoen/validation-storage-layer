import type { ValidationRule } from '../../types/validation.js';

export const priceCurrencyPair: ValidationRule = {
  name: 'price_currency_pair',
  check(input) {
    const hasAmount = input.price_amount !== null && input.price_amount !== undefined;
    const hasCurrency = input.price_currency_code !== null && input.price_currency_code !== undefined;

    if (hasAmount !== hasCurrency) {
      return [{
        field: hasAmount ? 'price_currency_code' : 'price_amount',
        rule: 'price_currency_pair',
        value: hasAmount ? input.price_currency_code : input.price_amount,
        detail: 'price_amount and price_currency_code must both be present or both be null',
      }];
    }
    return [];
  },
};
