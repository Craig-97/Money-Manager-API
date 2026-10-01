/* The allowed values of an enum object, for Mongoose `enum` validators and runtime checks */
export const enumValues = <T extends Record<string, string>>(definition: T) =>
  Object.values(definition) as T[keyof T][];

/* Renders an enum object as a GraphQL `enum` definition for use inside typeDefs */
export const gqlEnum = (name: string, definition: Record<string, string>) =>
  `enum ${name} {\n${Object.values(definition)
    .map(value => `    ${value}`)
    .join('\n')}\n  }`;
