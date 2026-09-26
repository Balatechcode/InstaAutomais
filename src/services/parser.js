/**
 * Polymer News Parser Service
 * Extracts Company, Product, Action, Price Change, Effective Date, and Source from raw WhatsApp text.
 */

const KNOWN_COMPANIES = [
  'OPAL', 'HPL', 'RIL', 'RELIANCE', 'IOCL', 'GAIL', 'HALDIA', 'BCPL',
  'MRPL', 'FINOLEX', 'SUPREME', 'CPCL', 'HMEL', 'DCM SHRIRAM', 'CHEMPLAST',
  'DAELIM', 'FORMOSA', 'LG CHEM', 'SABIC', 'BOROUGE', 'LUMMUS'
];

const KNOWN_PRODUCTS = [
  'PP RAFFIA', 'PP INJECTION', 'PP FILM', 'PP BLOCK COPOLYMER', 'PP IMPACT COPOLYMER',
  'PP', 'HDPE', 'LLDPE', 'LDPE', 'PVC', 'PS', 'PET', 'PE', 'ABS', 'EVA'
];

/**
 * Parses raw WhatsApp/Telegram news text.
 * @param {string} rawText 
 * @returns {Object} Extracted data
 */
function parseNewsMessage(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Invalid input message');
  }

  const cleanText = rawText.trim();
  const upperText = cleanText.toUpperCase();

  // 1. Extract Company
  let company = 'Unknown Company';
  for (const comp of KNOWN_COMPANIES) {
    if (upperText.includes(comp)) {
      company = comp;
      break;
    }
  }

  // Fallback company extraction if not in list: first uppercase word before action verb
  if (company === 'Unknown Company') {
    const matchComp = cleanText.match(/^([A-Z0-9\&\s]+?)\s+(increased|hiked|raised|decreased|cut|reduced|rolled|announced|revised)/i);
    if (matchComp && matchComp[1]) {
      company = matchComp[1].trim();
    }
  }

  // 2. Extract Action
  let action = 'Updated';
  if (/increased|hiked|raised|plus|\+\s*Rs|\+\s*₹/i.test(cleanText)) {
    action = 'Increased';
  } else if (/decreased|cut|reduced|down|minus|\-\s*Rs|\-\s*₹/i.test(cleanText)) {
    action = 'Decreased';
  } else if (/rolled\s*over|unchanged|same|stable/i.test(cleanText)) {
    action = 'Rolled Over';
  } else if (/revised/i.test(cleanText)) {
    action = 'Revised';
  }

  // 3. Extract Main Product & Specific Grades
  let primaryProduct = 'Polymer';
  for (const prod of KNOWN_PRODUCTS) {
    if (upperText.includes(prod)) {
      primaryProduct = prod;
      break;
    }
  }

  // Normalize generic grades e.g., PP RAFFIA primary product label -> PP
  if (primaryProduct.startsWith('PP')) primaryProduct = 'PP';
  else if (primaryProduct.includes('PE') || primaryProduct.includes('HDPE') || primaryProduct.includes('LLDPE') || primaryProduct.includes('LDPE')) primaryProduct = 'PE';

  // 4. Extract Price Changes (Supports simple & multi-grade updates)
  let priceChange = '';
  let gradeBreakdown = [];

  // Look for multi-grade exceptions (e.g., "except for PP Raffia Prices which is increased by Rs. 3500/MT")
  const exceptionRegex = /(?:except|and)\s+(?:for\s+)?([A-Z0-9\s]+?)\s+(?:Prices\s+)?(?:which\s+is\s+)?(?:increased|decreased|hiked|reduced|cut)?\s*(?:by\s*)?(?:Rs\.?|₹|\$)?\s*([0-9,]+(?:\.[0-9]+)?(?:\s*\/\s*(?:MT|KG|TON))?)/gi;
  let exceptionMatch;
  while ((exceptionMatch = exceptionRegex.exec(cleanText)) !== null) {
    gradeBreakdown.push({
      grade: exceptionMatch[1].trim(),
      amount: formatPriceAmount(exceptionMatch[2])
    });
  }

  // Look for primary price change (e.g. "by Rs. 2500/MT" or "+ Rs. 2500/MT")
  const primaryPriceMatch = cleanText.match(/(?:by|of|\+|\-)\s*(?:Rs\.?|₹|\$)?\s*([0-9,]+(?:\.[0-9]+)?(?:\s*\/\s*(?:MT|KG|TON))?)/i);
  let mainAmount = '';
  if (primaryPriceMatch && primaryPriceMatch[1]) {
    mainAmount = formatPriceAmount(primaryPriceMatch[1]);
  }

  if (gradeBreakdown.length > 0) {
    priceChange = `Rs. ${mainAmount || 'N/A'}`;
    if (!priceChange.includes('/MT') && !priceChange.includes('KG')) priceChange += '/MT';
    
    // Construct rich price summary
    const breakdownStrs = gradeBreakdown.map(g => `${g.grade}: Rs. ${g.amount}`);
    priceChange = `All ${primaryProduct} grade Prices ${action.toLowerCase()} by Rs. ${mainAmount || 'N/A'}${mainAmount.includes('/MT') ? '' : '/MT'}. (${breakdownStrs.join(', ')})`;
  } else if (mainAmount) {
    priceChange = `Rs. ${mainAmount}${mainAmount.toLowerCase().includes('/mt') ? '' : '/MT'}`;
  } else {
    priceChange = 'Price Change Specified in News';
  }

  // 5. Extract Effective Date
  let effectiveDate = 'Immediate';
  const dateRegex = /(?:w\.?e\.?f\.?|wef|effective|from|with\s+effect\s+from)\s*:?\s*([0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+[0-9]{4}|[0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4}|[A-Za-z]+\s+[0-9]{1,2},?\s+[0-9]{4})/i;
  const dateMatch = cleanText.match(dateRegex);

  if (dateMatch && dateMatch[1]) {
    effectiveDate = dateMatch[1].trim();
  } else {
    // Attempt general date match if w.e.f not present
    const generalDateMatch = cleanText.match(/([0-9]{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|October|November|December|January|February|March|April|June|July|August|September|Oct|Nov|Dec)[a-z]*\s+[0-9]{4})/i);
    if (generalDateMatch && generalDateMatch[1]) {
      effectiveDate = generalDateMatch[1].trim();
    }
  }

  // 6. Extract Source / URL
  let source = 'WhatsApp';
  const urlMatch = cleanText.match(/(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9\-]+\.(?:com|in|org|net))/i);
  if (urlMatch && urlMatch[1]) {
    source = urlMatch[1].trim();
  }

  return {
    rawMessage: cleanText,
    company,
    product: primaryProduct,
    action,
    priceChange,
    effectiveDate,
    source,
    gradeBreakdown,
    mainAmount
  };
}

/**
 * Standardizes price amount string (adds commas if needed, e.g. 2500 -> 2,500)
 */
function formatPriceAmount(str) {
  if (!str) return '';
  let clean = str.trim();
  // If numeric string without commas, format e.g. 2500 -> 2,500
  const numMatch = clean.match(/^([0-9]{4,6})(\/MT|\s*\/MT)?$/i);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10).toLocaleString('en-IN');
    return `${num}${numMatch[2] || '/MT'}`;
  }
  return clean;
}

module.exports = {
  parseNewsMessage,
  KNOWN_COMPANIES,
  KNOWN_PRODUCTS
};
