import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import fs from 'fs';
import path from 'path';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

async function runBackup() {
  console.log('Connecting to Firebase and signing in anonymously...');
  await signInAnonymously(auth);
  console.log('Signed in successfully.');

  const collections = [
    'employees',
    'locations',
    'timeRecords',
    'payslips',
    'schedules',
    'holidays',
    'manualAdjustments'
  ];

  const backupData = {
    metadata: {
      exportedAt: new Date().toISOString(),
      projectId: config.projectId,
    },
    collections: {},
    appSettings: null
  };

  for (const colName of collections) {
    try {
      const colRef = collection(db, colName);
      const snapshot = await getDocs(colRef);
      backupData.collections[colName] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      console.log(`Collection "${colName}": ${snapshot.docs.length} documents backed up.`);
    } catch (err) {
      console.error(`Error reading collection ${colName}:`, err.message);
      backupData.collections[colName] = [];
    }
  }

  try {
    const settingsDoc = await getDoc(doc(db, 'appSettings', 'main'));
    if (settingsDoc.exists()) {
      backupData.appSettings = {
        id: settingsDoc.id,
        ...settingsDoc.data()
      };
      console.log('appSettings/main backed up successfully.');
    } else {
      console.log('appSettings/main document not found, using null.');
    }
  } catch (err) {
    console.error('Error reading appSettings:', err.message);
  }

  const backupDir = path.resolve('./backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(backupDir, `backup_${timestamp}.json`);
  const latestFilename = path.join(backupDir, 'backup_latest.json');

  const jsonStr = JSON.stringify(backupData, null, 2);
  fs.writeFileSync(filename, jsonStr, 'utf-8');
  fs.writeFileSync(latestFilename, jsonStr, 'utf-8');

  console.log(`\nBackup completed successfully!`);
  console.log(`Saved to: ${filename}`);
  console.log(`Latest pointer: ${latestFilename}`);

  const totalRecords = Object.values(backupData.collections).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`Total records backed up: ${totalRecords}`);
}

runBackup().catch(err => {
  console.error('Fatal backup error:', err);
  process.exit(1);
});
