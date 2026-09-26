/**
 * News Formatter Service
 * Converts extracted news data into standard InstaPrice Title and HTML Content.
 * Uses Gemini AI for intelligent formatting, with regex fallback.
 */
const { formatWithGemini, initGemini } = require('./geminiFormatter');

let geminiAvailable = false;

// Try to initialize Gemini on module load
try {
  geminiAvailable = initGemini();
} catch (e) {
  console.warn('[FORMATTER] Gemini not available, using regex fallback:', e.message);
}

/**
 * Generates Title and HTML Content from extracted news details.
 * Uses Gemini AI when available, falls back to regex-based formatting.
 * @param {Object} parsedData 
 * @returns {Promise<Object>} { title, contentHtml }
 */
async function generateNewsFormat(parsedData) {
  const { company, product, action, priceChange, effectiveDate, rawMessage, gradeBreakdown, mainAmount } = parsedData;

  // Try Gemini AI first
  if (geminiAvailable && rawMessage) {
    try {
      console.log('[FORMATTER] Using Gemini AI for formatting...');
      const result = await formatWithGemini(rawMessage);
      console.log('[FORMATTER] Gemini formatted successfully.');
      return result;
    } catch (err) {
      console.error('[FORMATTER] Gemini failed, falling back to regex:', err.message);
    }
  }

  // ── FALLBACK: Regex-based formatting ──────────────────────────────

  // 1. Generate Title – include effective date when available
  const actionText = action ? action.toLowerCase() : '';
  const isRollOverOverall = /rolled over/i.test(actionText);
  let title = `${company} ${product} Prices`;
  if (effectiveDate && effectiveDate !== 'Immediate') {
    title += ` w.e.f. ${effectiveDate}`;
  }

  // Helper to format price with Indian commas and ensure "Rs." prefix and "/MT" suffix
  const formatPrice = (raw) => {
    if (!raw) return raw;
    const hasSuffix = /\/mt$/i.test(raw);
    const numeric = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    if (isNaN(numeric)) return raw;
    const formatted = new Intl.NumberFormat('en-IN').format(numeric);
    return `Rs. ${formatted}${hasSuffix ? '/MT' : '/MT'}`;
  };

  // Split the product field into individual product names (e.g., "PP and PE" => ["PP","PE"])
  const productList = product.split(/\s+and\s+|,\s*|\s+&\s+/i).map(p => p.trim()).filter(p => p);

  // Build a section for each product
  const sections = productList.map(prod => {
    const priceMatch = rawMessage.match(new RegExp(`${prod}[^\\n]*?Rs\\.?\\s*([0-9,]+)`, 'i'));
    let price = null;
    if (priceMatch && priceMatch[1]) {
      price = formatPrice(priceMatch[1].replace(/,/g, ''));
    } else if (priceChange && !priceChange.startsWith('Rs')) {
      price = formatPrice(priceChange);
    } else if (priceChange && priceChange.startsWith('Rs')) {
      price = formatPrice(priceChange.replace(/^Rs\.?\s*/i, ''));
    }
    const isRollOverProd = price ? false : new RegExp(`${prod}.*rolled over`, 'i').test(rawMessage);

    if (gradeBreakdown && gradeBreakdown.length > 0) {
      const mainPriceStr = mainAmount ? formatPrice(mainAmount) : 'specified amounts';
      const exceptionsStr = gradeBreakdown.map(g => {
        const gPrice = formatPrice(g.amount);
        if (isRollOverOverall) {
          return `${g.grade} Prices which is ${actionText}`;
        }
        return `${g.grade} Prices which is ${actionText} by ${gPrice}`;
      }).join(' and ');
      const paragraph = `All ${prod} grade Prices ${actionText}${isRollOverProd ? '' : ' by'} ${mainPriceStr}, except for ${exceptionsStr} w.e.f. ${effectiveDate}.`;
      return { heading: prod, paragraph };
    }

    if (price) {
      return { heading: prod, paragraph: `All ${prod} grade Prices ${actionText} by ${price}.` };
    }

    if (isRollOverProd) {
      return { heading: prod, paragraph: `${company} has ${actionText} (no change) ${prod} prices w.e.f. ${effectiveDate}.` };
    }
    return { heading: prod, paragraph: `${company} has ${actionText} ${prod} prices w.e.f. ${effectiveDate}.` };
  });

  // 2. Assemble HTML – every element gets explicit 14px font size
  const htmlLines = [];
  htmlLines.push('<div style="font-size:14px; line-height:1.6;">');
  htmlLines.push(`<p style="font-size:14px;"><strong>${title}</strong></p>`);
  sections.forEach(sec => {
    htmlLines.push(`<p style="font-size:14px;"><strong>${sec.heading}</strong></p>`);
    htmlLines.push(`<p style="font-size:14px;">${sec.paragraph}</p>`);
  });
  htmlLines.push('</div>');
  const html = '\n' + htmlLines.join('\n');

  return {
    title,
    contentHtml: html
  };
}

/**
 * Formats a preview text for Telegram display.
 * @param {Object} newsRecord 
 * @returns {string} Formatted Telegram Markdown/HTML preview
 */
function generateTelegramPreview(newsRecord) {
  return `📰 *NEWS PREVIEW*

*Title:*
${newsRecord.title}

*Content:*
${newsRecord.title}

${newsRecord.product}

${extractRawTextFromHtml(newsRecord.contentHtml)}

*Image:*
\`${newsRecord.image || 'instaprice-default.png'}\`

*Status:* ${newsRecord.status.toUpperCase()}`;
}

/**
 * Helper to strip HTML tags for Telegram preview text.
 */
function extractRawTextFromHtml(html) {
  if (!html) return '';
  return html
    .replace(/<p><strong>(.*?)<\/strong><\/p>/gi, '')
    .replace(/<p>/gi, '')
    .replace(/<\/p>/gi, '\n')
    .trim();
}

module.exports = {
  generateNewsFormat,
  generateTelegramPreview,
  extractRawTextFromHtml
};
