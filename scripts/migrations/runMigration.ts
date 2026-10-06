import '../../env';
import mongoose from 'mongoose';

/*
 * Connects to MONGODB_CONNECTION_STRING from .env and runs a migration. Nothing is written unless
 * the command ends in --apply, so the first run always shows what would change.
 */
export const runMigration = async (name: string, migrate: (apply: boolean) => Promise<void>) => {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_CONNECTION_STRING;
  if (!uri) {
    console.error('MONGODB_CONNECTION_STRING is not set');
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(uri);
  console.log(`${name} on database "${mongoose.connection.name}"`);
  console.log(apply ? 'Applying changes\n' : 'Dry run: nothing will be written. Add --apply to write.\n');
  try {
    await migrate(apply);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};
