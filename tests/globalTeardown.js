module.exports = async () => {
  await global.__MONGO__?.stop();
};
