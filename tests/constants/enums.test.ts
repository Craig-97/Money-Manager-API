import { parse, buildASTSchema, GraphQLEnumType } from 'graphql';
import { PaymentType } from '../../constants/payment/paymentType';
import { PaymentCategory } from '../../constants/payment';
import { BankHolidayRegion, Weekday } from '../../constants/payday';
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
    expect(schemaValues('PaymentCategory')).toEqual(enumValues(PaymentCategory));
  });

  it('shares one category list between one-off and recurring payments', () => {
    const schema = buildASTSchema(typeDefs as ReturnType<typeof parse>);

    expect(schema.getType('OneOffPaymentCategory')).toBeUndefined();
    expect(schema.getType('RecurringPaymentCategory')).toBeUndefined();
  });
});
