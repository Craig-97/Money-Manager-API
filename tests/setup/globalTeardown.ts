export default async () => {
  await globalThis.__MONGO__?.stop();
};
