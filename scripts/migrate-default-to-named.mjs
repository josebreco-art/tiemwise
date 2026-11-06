import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch, getDoc, setDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import fs from 'fs';
import path from 'path';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const auth = getAuth(app);

async function migrate() {
  console.log('Signing in anonymously...');
  await signInAnonymously(auth);
  console.log('Authenticated.');

  const dbDefault = getFirestore(app);
  const targetDbId = config.firestoreDatabaseId;
  if (!targetDbId) {
    console.error('No firestoreDatabaseId specified in firebase-applet-config.json');
    process.exit(1);
  }
  const dbTarget = getFirestore(app, targetDbId);

  const collections = [
    'employees',
    'locations',
    'timeRecords',
    'payslips',
    'schedules',
    'holidays',
    'manualAdjustments'
  ];

  const fullBackup = {
    migratedAt: new Date().toISOString(),
    sourceDb: '(default)',
    targetDb: targetDbId,
    collections: {},
    appSettings: null
  };

  console.log(`Starting migration from (default) to [${targetDbId}]...`);

  for (const colName of collections) {
    const sourceColRef = collection(dbDefault, colName);
    const snapshot = await getDocs(sourceColRef);
    console.log(`\nCollection "${colName}": found ${snapshot.docs.length} documents in (default).`);

    fullBackup.collections[colName] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    if (snapshot.empty) continue;

    let batch = writeBatch(dbTarget);
    let count = 0;
    let totalMigrated = 0;

    for (const docSnap of snapshot.docs) {
      const targetDocRef = doc(dbTarget, colName, docSnap.id);
      batch.set(targetDocRef, docSnap.data(), { merge: true });
      count++;
      totalMigrated++;

      if (count >= 400) {
        await batch.commit();
        console.log(`  Committed batch of ${count} documents to ${colName} (total so far: ${totalMigrated})...`);
        batch = writeBatch(dbTarget);
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
      console.log(`  Committed final batch of ${count} documents to ${colName}. Total: ${totalMigrated}`);
    }
  }

  // Migrate appSettings/main
  console.log('\nMigrating appSettings/main...');
  try {
    const settingsSnap = await getDoc(doc(dbDefault, 'appSettings', 'main'));
    if (settingsSnap.exists()) {
      const data = settingsSnap.data();
      fullBackup.appSettings = { id: 'main', ...data };
      await setDoc(doc(dbTarget, 'appSettings', 'main'), data, { merge: true });
      console.log('appSettings/main copied successfully!');
    } else {
      console.log('No appSettings/main found in (default).');
    }
  } catch (err) {
    console.error('Error copying appSettings:', err.message);
  }

  // Save backup to disk as safe insurance
  const backupDir = path.resolve('./backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const backupFile = path.join(backupDir, `migration_backup_${Date.now()}.json`);
  const latestFile = path.join(backupDir, 'backup_latest.json');
  fs.writeFileSync(backupFile, JSON.stringify(fullBackup, null, 2), 'utf-8');
  fs.writeFileSync(latestFile, JSON.stringify(fullBackup, null, 2), 'utf-8');
  console.log(`\nLocal backup saved to ${backupFile} and ${latestFile}`);

  console.log('\nMigration complete! Verifying document counts in target database:');
  for (const colName of collections) {
    const snap = await getDocs(collection(dbTarget, colName));
    console.log(`Target [${targetDbId}] "${colName}": ${snap.docs.length} documents.`);
  }

  process.exit(0);
}

migrate().catch(err => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
