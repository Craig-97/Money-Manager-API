const incrementVersion = doc => {
  doc.__v = (doc.__v || 0) + 1;
  return doc;
};

export { incrementVersion };
