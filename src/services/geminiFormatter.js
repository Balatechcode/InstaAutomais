/**
 * Gemini AI News Formatter Service
 * Uses Google Gemini API to convert raw polymer news messages into
 * properly formatted InstaPrice Title and HTML Content.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const SYSTEM_PROMPT = `You are a professional polymer news formatter for InstaPrice (India's polymer pricing platform).

Your job: Convert a raw WhatsApp/Telegram polymer price update message into a properly formatted JSON object with two fields: "title" and "contentHtml".

STRICT FORMATTING RULES:

1. TITLE FORMAT:
   - Pattern: "[Company] [Product(s)] Prices w.e.f. [Date]"
   - Always include the effective date if present in the source message.
   - If multiple products mentioned (e.g., PP and PE), include all: "IOCL PP and PE Prices w.e.f. 21st September 2026"
   - Do NOT include "increased", "decreased", "rolled over" in the title.
   - Keep it clean and concise.

2. HTML CONTENT FORMAT:
   - Wrap everything in: <div style="font-size:14px; line-height:1.6;">
   - First line: Title as bold heading: <p style="font-size:14px;"><strong>[Title]</strong></p>
   - Then for EACH product, create a separate section:
     - Product heading: <p style="font-size:14px;"><strong>[Product Name]</strong></p>
     - Product details: <p style="font-size:14px;">[Details about price change]</p>
   - Close with </div>

3. PRICE FORMATTING:
   - Use Indian comma format: Rs. 2,500/MT (not Rs. 2500/MT)
   - Always include Rs. prefix and /MT suffix.

4. ROLLED OVER / NO CHANGE:
   - If a product is "rolled over", write: "All [Product] grades prices are rolled over (no change)."
   - Do NOT mention a price amount for rolled-over products.

5. PRICE INCREASE/DECREASE:
   - Write: "All [Product] grades prices are [increased/decreased] by Rs. X,XXX/MT."
   - If specific grades have different prices, mention exceptions:
     "All [Product] grades prices are increased by Rs. 2,500/MT, except [Grade] which is increased by Rs. 3,500/MT."

6. IMPORTANT:
   - Every HTML element MUST have style="font-size:14px;" explicitly.
   - Output ONLY valid JSON. No markdown, no code fences, no extra text.
   - The JSON must have exactly two keys: "title" and "contentHtml".

EXAMPLE:

Input: "IOCL increased PP Prices by Rs. 2500/MT while rolled over PE Prices, w.e.f. 21st September, 2026."

Output:
{
  "title": "IOCL PP and PE Prices w.e.f. 21st September 2026",
  "contentHtml": "\\n<div style=\\"font-size:14px; line-height:1.6;\\">\\n<p style=\\"font-size:14px;\\"><strong>IOCL PP and PE Prices w.e.f. 21st September 2026</strong></p>\\n<p style=\\"font-size:14px;\\"><strong>PP</strong></p>\\n<p style=\\"font-size:14px;\\">All PP grades prices are increased by Rs. 2,500/MT.</p>\\n<p style=\\"font-size:14px;\\"><strong>PE</strong></p>\\n<p style=\\"font-size:14px;\\">All PE grades prices are rolled over (no change).</p>\\n</div>"
}`;

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
