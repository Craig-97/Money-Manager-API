import { parse, buildASTSchema, GraphQLEnumType } from 'graphql';
import { PaymentType } from '../../constants/payment/paymentType';
import { OneOffPaymentCategory } from '../../constants/payment';
import { BankHolidayRegion, Weekday } from '../../constants/payday';
import { RecurringPaymentCategory } from '../../constants/payment';
import { enumValues, gqlEnum } from '../../utils/helpers/enumHelpers';
import { typeDefs } from '../../typeDefs';

describe('enums', () => {
  it('lists the values of an enum object', () => {
    expect(enumValues(PaymentType)).toEqual(['INCOME', 'EXPENSE']);
  });

  it('renders an enum object as a GraphQL enum definition', () => {
    expect(gqlEnum('Weekday', Weekday)).toBe(
      'enum Weekday {\n    MONDAY\n    TUESDAY\n    WEDNESDAY\n    THURSDAY\n    FRIDAY\n  }'
    );
  });

  it('exposes the same values in the GraphQL schema as the models validate against', () => {
    const schema = buildASTSchema(typeDefs as ReturnType<typeof parse>);

    const schemaValues = (name: string) =>
      (schema.getType(name) as GraphQLEnumType).getValues().map(value => value.name);

    expect(schemaValues('Weekday')).toEqual(enumValues(Weekday));
    expect(schemaValues('BankHolidayRegion')).toEqual(enumValues(BankHolidayRegion));
    expect(schemaValues('PaymentType')).toEqual(enumValues(PaymentType));
    expect(schemaValues('OneOffPaymentCategory')).toEqual(enumValues(OneOffPaymentCategory));
    expect(schemaValues('RecurringPaymentCategory')).toEqual(
      enumValues(RecurringPaymentCategory)
    );
  });

  it('does not accept a category from the other payment type', () => {
    const schema = buildASTSchema(typeDefs as ReturnType<typeof parse>);
    const names = (name: string) =>
      (schema.getType(name) as GraphQLEnumType).getValues().map(value => value.name);

    expect(names('OneOffPaymentCategory')).not.toContain('RENT');
    expect(names('RecurringPaymentCategory')).not.toContain('SHOPPING');
    expect(schema.getType('PaymentCategory')).toBeUndefined();
  });
});
