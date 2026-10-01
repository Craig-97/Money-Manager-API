import { parse, buildASTSchema, GraphQLEnumType } from 'graphql';
import { PaymentType } from '../../constants/paymentType';
import { BankHolidayRegion, Weekday } from '../../models/Payday';
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
  });
});
