import '../../env';
import mongoose from 'mongoose';
import { connectionString } from '../../db/connectionString';

/*
 * Connects to the dev database from .env and runs a migration, or to the live one when the command
 * has --live (as at deploy). Nothing is written unless it also has --apply, so the first run always
 * shows what would change.
 */
export const runMigration = async (name: string, migrate: (apply: boolean) => Promise<void>) => {
  const apply = process.argv.includes('--apply');
  let target: ReturnType<typeof connectionString>;
  try {
    target = connectionString({ live: process.argv.includes('--live') || undefined });
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
    return;
  }

  // Loading the models would otherwise create their collections and indexes on connect, so even a
  // dry run would write. A migration builds what it needs itself.
  mongoose.set('autoCreate', false);
  mongoose.set('autoIndex', false);
  await mongoose.connect(target.uri);
  const where = target.live ? 'the LIVE database' : 'the dev database';
  console.log(`${name} on ${where} "${mongoose.connection.name}" (${target.variable})`);
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
