const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
const serviceAccountPath = path.resolve(__dirname, 'codecollab-v2-firebase-adminsdk.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
  projectId: 'codecollab-v2'
});

const db = admin.firestore();

async function cleanupOldData() {
  console.log('🧹 Starting Firestore cleanup...\n');
  
  try {
    // 1. Clean up old test documents
    console.log('📝 Cleaning test collection...');
    const testSnapshot = await db.collection('test').get();
    const testBatch = db.batch();
    testSnapshot.docs.forEach(doc => {
      testBatch.delete(doc.ref);
    });
    await testBatch.commit();
    console.log(`✅ Deleted ${testSnapshot.size} test documents\n`);
    
    // 2. Clean up old presence data (older than 1 day)
    console.log('👥 Cleaning old presence data...');
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const projectsSnapshot = await db.collection('projects').get();
    
    let totalPresenceDeleted = 0;
    for (const projectDoc of projectsSnapshot.docs) {
      const presenceSnapshot = await projectDoc.ref.collection('presence')
        .where('last_seen', '<', oneDayAgo)
        .get();
      
      if (!presenceSnapshot.empty) {
        const presenceBatch = db.batch();
        presenceSnapshot.docs.forEach(doc => {
          presenceBatch.delete(doc.ref);
        });
        await presenceBatch.commit();
        totalPresenceDeleted += presenceSnapshot.size;
      }
    }
    console.log(`✅ Deleted ${totalPresenceDeleted} old presence documents\n`);
    
    // 3. Show current database stats
    console.log('📊 Current database statistics:');
    const projectCount = projectsSnapshot.size;
    console.log(`   Projects: ${projectCount}`);
    
    let totalFiles = 0;
    let totalMessages = 0;
    for (const projectDoc of projectsSnapshot.docs) {
      const filesSnapshot = await projectDoc.ref.collection('files').get();
      const messagesSnapshot = await projectDoc.ref.collection('messages').get();
      totalFiles += filesSnapshot.size;
      totalMessages += messagesSnapshot.size;
    }
    console.log(`   Files: ${totalFiles}`);
    console.log(`   Messages: ${totalMessages}`);
    
    console.log('\n✨ Cleanup complete!');
    console.log('\n💡 Tips to reduce quota usage:');
    console.log('   - Avoid storing large files directly in messages');
    console.log('   - Clean up old test projects regularly');
    console.log('   - Use pagination for large collections');
    console.log('   - Consider upgrading to Blaze plan if needed');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    console.error('   Error details:', error.message);
  }
  
  process.exit(0);
}

cleanupOldData();
