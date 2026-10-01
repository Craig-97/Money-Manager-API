const incrementVersion = <T extends { __v?: number }>(doc: T): T => {
  doc.__v = (doc.__v || 0) + 1;
  return doc;
};

export { incrementVersion };
