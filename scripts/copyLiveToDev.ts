// npm run db:copy [-- --apply] [--overwrite]
import '../env';
import mongoose, { type Connection } from 'mongoose';
import { connectionString } from '../db/connectionString';

/*
 * Copies every collection in the live database into the dev one, with its indexes, so changes and
 * migrations can be tried on real data first. The live database is only ever read.
 *
 * It only reports what it would copy unless given --apply. It won't write into a dev database that
 * already has data unless also given --overwrite, which replaces the dev collections with the live
 * ones. It refuses outright when both connection strings lead to the same database.
 */

const BATCH = 500;

const collectionsOf = async (connection: Connection) =>
  (await connection.db!.listCollections({}, { nameOnly: true }).toArray())
    .map(collection => collection.name)
    .filter(name => !name.startsWith('system.'))
    .sort();

const copyCollection = async (name: string, { from, to }: { from: Connection; to: Connection }) => {
  const source = from.db!.collection(name);
  const target = to.db!.collection(name);
  let copied = 0;
  let batch: Record<string, unknown>[] = [];
  for await (const doc of source.find()) {
    batch.push(doc);
    if (batch.length === BATCH) {
      await target.insertMany(batch, { ordered: false });
      copied += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await target.insertMany(batch, { ordered: false });
    copied += batch.length;
  }
  // The same indexes, so unique ones keep catching duplicates
  for (const { key, v: _v, ns: _ns, ...options } of await source.indexes()) {
    if (options.name === '_id_') continue;
    await target.createIndex(key, options);
  }
  return copied;
};

const main = async () => {
  const apply = process.argv.includes('--apply');
  const overwrite = process.argv.includes('--overwrite');
  const live = connectionString({ live: true });
  const dev = connectionString({ live: false });

  const from = await mongoose.createConnection(live.uri).asPromise();
  const to = await mongoose.createConnection(dev.uri).asPromise();
  try {
    if (from.host === to.host && from.name === to.name) {
      throw new Error(
        `${live.variable} and ${dev.variable} both lead to "${from.name}". Give the dev one its own database name.`
      );
    }
    console.log(`Copy live "${from.name}" into dev "${to.name}"`);
    console.log(apply ? 'Copying\n' : 'Dry run: nothing will be written. Add --apply to copy.\n');

    // A dev database with data in it is only replaced when asked
    const inDev = [];
    for (const name of await collectionsOf(to)) {
      const count = await to.db!.collection(name).countDocuments();
      if (count) inDev.push(`${name} (${count})`);
    }
    if (inDev.length && !overwrite) {
      throw new Error(
        `The dev database already has data: ${inDev.join(', ')}. Add --overwrite to replace it.`
      );
    }

    for (const name of await collectionsOf(from)) {
      const count = await from.db!.collection(name).countDocuments();
      if (!apply) {
        console.log(`${name}: would copy ${count} document(s)`);
        continue;
      }
      if (overwrite) await to.db!.collection(name).drop().catch(() => undefined);
      console.log(`${name}: copied ${await copyCollection(name, { from, to })} document(s)`);
    }
  } finally {
    await from.close();
    await to.close();
  }
};

main().catch(error => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
