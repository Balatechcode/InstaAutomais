const assert = require('assert');
const path = require('path');
const db = require('../src/db/database');
const { parseNewsMessage } = require('../src/services/parser');
const { generateNewsFormat, generateTelegramPreview } = require('../src/services/formatter');
const { checkDuplicate } = require('../src/services/duplicateChecker');
const { createNews, publishNews } = require('../src/services/instapriceApi');

async function runTests() {
  console.log('🧪 Starting InstaPrice Automation Test Suite...\n');

  // Test 1: Simple OPAL News Parsing
  console.log('Test 1: Simple OPAL News Parsing');
  const sample1 = `OPAL increased PP Prices by Rs. 2500/MT,
w.e.f. 21st September 2026.

www.polymermis.com`;

  const parsed1 = parseNewsMessage(sample1);
  assert.strictEqual(parsed1.company, 'OPAL');
  assert.strictEqual(parsed1.product, 'PP');
  assert.strictEqual(parsed1.action, 'Increased');
  assert.ok(parsed1.priceChange.includes('2,500') || parsed1.priceChange.includes('2500'));
  assert.strictEqual(parsed1.effectiveDate, '21st September 2026');
  assert.strictEqual(parsed1.source, 'www.polymermis.com');
  console.log('  ✅ Simple message parsed successfully!');

  // Test 2: Standard Format Generation (Title & HTML)
  console.log('\nTest 2: Standard Format Generation');
  const formatted1 = await generateNewsFormat(parsed1);
  assert.ok(formatted1.title && formatted1.title.includes('OPAL'));
  assert.ok(formatted1.contentHtml && formatted1.contentHtml.length > 0);
  console.log('  ✅ Title & HTML generated successfully!');
  console.log('  Generated Title:', formatted1.title);
  console.log('  Generated HTML:\n', formatted1.contentHtml);

  // Test 3: Complex Multi-grade HPL Message
  console.log('\nTest 3: Complex HPL Multi-grade Message Parsing');
  const sample2 = `HPL increased PP domestic Prices by Rs. 2500/MT,
except for PP Raffia Prices which is increased by
Rs. 3500/MT approximately w.e.f. 21st September 2026.`;

  const parsed2 = parseNewsMessage(sample2);
  assert.strictEqual(parsed2.company, 'HPL');
  assert.strictEqual(parsed2.product, 'PP');
  assert.strictEqual(parsed2.action, 'Increased');
  assert.strictEqual(parsed2.effectiveDate, '21st September 2026');

  const formatted2 = await generateNewsFormat(parsed2);
  assert.ok(formatted2.title && formatted2.title.includes('HPL'));
  assert.ok(formatted2.contentHtml && formatted2.contentHtml.length > 0);
  console.log('  ✅ Complex multi-grade message parsed successfully!');
  console.log('  Generated Title:', formatted2.title);

  // Test 4: Database & Duplicate Detection
  console.log('\nTest 4: Database Storage & Duplicate Detection');
  await db.initDb();

  const savedId1 = await db.saveNews({
    rawMessage: sample1,
    company: parsed1.company,
    product: parsed1.product,
    action: parsed1.action,
    priceChange: parsed1.priceChange,
    effectiveDate: parsed1.effectiveDate,
    source: parsed1.source,
    title: formatted1.title,
    contentHtml: formatted1.contentHtml,
    image: 'instaprice-default.png',
    status: 'preview'
  });
  assert.ok(savedId1 > 0);

  const dupCheck1 = await checkDuplicate(parsed1);
  assert.strictEqual(dupCheck1.isDuplicate, true);
  assert.ok(dupCheck1.existingNews !== null);
  console.log('  ✅ Duplicate news correctly detected!');

  // Test 5: API Mock Integration (Create & Publish)
  console.log('\nTest 5: Create & Publish News API');
  const createRes = await createNews({
    title: formatted1.title,
    newsHtml: formatted1.contentHtml,
    image: 'instaprice-default.png'
  });
  assert.strictEqual(createRes.success, true);
  assert.ok(createRes.news_id > 0);
  console.log(`  ✅ Create News API returned news_id: ${createRes.news_id}`);

  const publishRes = await publishNews({ newsId: createRes.news_id });
  assert.strictEqual(publishRes.success, true);
  assert.strictEqual(publishRes.news_id, createRes.news_id);
  assert.strictEqual(publishRes.status, 1);
  console.log(`  ✅ Publish News API published news_id: ${publishRes.news_id} successfully!`);

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
