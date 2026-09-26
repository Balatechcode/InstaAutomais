const db = require('../db/database');

/**
 * Checks if a news item is a duplicate of a previously created or published item.
 * @param {Object} parsedData 
 * @returns {Promise<Object>} { isDuplicate: boolean, existingNews: Object|null }
 */
async function checkDuplicate(parsedData) {
  try {
    const existing = await db.findDuplicate({
      company: parsedData.company,
      product: parsedData.product,
      effectiveDate: parsedData.effectiveDate,
      priceChange: parsedData.priceChange
    });

    if (existing) {
      return {
        isDuplicate: true,
        existingNews: existing,
        message: `⚠️ Duplicate News Detected\nSimilar news already exists.\nNews ID: ${existing.news_id || existing.id}`
      };
    }

    return {
      isDuplicate: false,
      existingNews: null
    };
  } catch (err) {
    console.error('Error during duplicate check:', err.message);
    return { isDuplicate: false, existingNews: null };
  }
}

module.exports = {
  checkDuplicate
};
