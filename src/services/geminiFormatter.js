/**
 * Gemini AI News Formatter Service
 * Uses Google Gemini API to convert raw polymer news messages into
 * properly formatted InstaPrice Title and HTML Content.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const SYSTEM_PROMPT = `You are an InstaPrice polymer news formatter.

Convert raw WhatsApp/Telegram polymer price updates into correctly formatted news.

OUTPUT:
Return ONLY valid JSON with exactly two fields: "title" and "contentHtml". If multiple companies have different updates, return an array of separate objects.

TITLE FORMAT:
"[Company] [Relevant Products] Price Update w.e.f. [Effective Date]"

Examples:
"IOCL HDPE, LLDPE & PP Price Update w.e.f. 27th October 2026"
"OPaL HDPE, LLDPE & PP Price Update w.e.f. 27th October 2026"

CONTENT HTML:
Use this structure:


<p style="font-size:14px;"><strong>first title here </strong></p>
<p style="font-size:14px;"><strong>heading</strong></p>
<p style="font-size:14px;">product details</p>
<p style="font-size:14px;">product details</p>
<p style="font-size:14px;"><strong>heading</strong></p>
<p style="font-size:14px;">product details</p>
<p style="font-size:14px;">product details</p>

RULES:
1. Create the title using the correct company, relevant polymer products, and effective date.
2. Give each product/category its own bold heading and a separate details paragraph.
3. Standardize price changes:
   - Increase: "HDPE Pipe grades prices are increased by Rs. 2,000/MT."
   - Decrease: "All LLDPE grades prices are decreased by Rs. 1,500/MT."
   - No change: "All PP grades prices are rolled over (no change)."
4. Format amounts using Indian commas: Rs. 2,000/MT.
5. Preserve all grade-specific changes and exceptions. For example, if HD Pipe increases but other HD grades roll over, show them separately.
6. Never invent prices, products, dates, or company names. Use the effective date from the source, not the message timestamp. If unavailable, write "Effective Date Not Specified".
7. Keep different companies and different effective dates in separate news entries. Remove duplicate forwarded messages.
8. Every HTML element must have style="font-size:14px;". Keep the wrapper's line-height:1.6.
9. Escape HTML correctly inside JSON strings.
10. Ignore sender names, timestamps, and irrelevant chat text.
Return only valid JSON. No Markdown or explanations.`;

let genAI = null;
let model = null;

function initGemini() {
  if (!GEMINI_API_KEY) {
    console.warn('[GEMINI] No API key found. Set GEMINI_API_KEY or OPENAI_API_KEY in .env');
    return false;
  }
  try {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
    console.log('[GEMINI] Initialized successfully with gemini-3.6-flash');
    return true;
  } catch (err) {
    console.error('[GEMINI] Failed to initialize:', err.message);
    return false;
  }
}

/**
 * Format news using Gemini AI.
 * @param {string} rawMessage - The raw WhatsApp/Telegram message text.
 * @returns {Promise<{title: string, contentHtml: string}>}
 */
async function formatWithGemini(rawMessage) {
  if (!model) {
    const ok = initGemini();
    if (!ok) throw new Error('Gemini API not configured. Set GEMINI_API_KEY in .env');
  }

  const prompt = `${SYSTEM_PROMPT}\n\nNow format this message:\n\n"${rawMessage}"`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text().trim();

  // Strip markdown code fences if present
  let jsonStr = text;
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed.title || !parsed.contentHtml) {
      throw new Error('Missing title or contentHtml in Gemini response');
    }
    return { title: parsed.title, contentHtml: parsed.contentHtml };
  } catch (parseErr) {
    console.error('[GEMINI] Failed to parse response as JSON:', text);
    throw new Error(`Gemini returned invalid JSON: ${parseErr.message}`);
  }
}

module.exports = {
  formatWithGemini,
  initGemini
};
