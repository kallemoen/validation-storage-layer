import type { ValidationRule } from '../../types/validation.js';

export const currencyMatchesConfig: ValidationRule = {
  name: 'currency_matches_config',
  check(input, context) {
    const currency = input.price_currency_code;
    if (currency === null || currency === undefined) return [];

    const expectedCurrency = context.scraperConfig.config?.currency_code as string | undefined;
    if (!expectedCurrency) return []; // No currency configured, skip check

    if (typeof currency === 'string' && currency !== expectedCurrency) {
      return [{
        field: 'price_currency_code',
        rule: 'currency_matches_config',
        value: currency,
        expected: expectedCurrency,
      }];
    }
    return [];
  },
};
