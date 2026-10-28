/**
 * Gemini AI News Formatter Service
 * Uses Google Gemini API to convert raw polymer news messages into
 * properly formatted InstaPrice Title and HTML Content.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const SYSTEM_PROMPT = `You are a professional polymer news formatter for InstaPrice (India's polymer pricing platform).
Your job: Convert any raw WhatsApp/Telegram polymer price update message (regardless of the company like IOCL, HPL, OPaL, etc.) into a uniformly formatted JSON object with two fields: "title" and "contentHtml".

STRICT FORMATTING RULES (UNIFORM ACROSS ALL COMPANIES):

1. TITLE FORMAT:
   - Pattern: "[Company] [Product(s)] Prices w.e.f. [Date]"
   - Always include the effective date extracted from the source message.
   - Keep it clean, concise, and do NOT include words like "increased", "decreased", or "rolled over" in the title.
   - Example: "HPL HDPE & LLDPE Prices w.e.f. 27th October 2026" or "OPaL PP, HD & LL Prices w.e.f. 27th October 2026"

2. HTML CONTENT FORMAT:
   - Wrap everything in: <div style="font-size:14px; line-height:1.6;">
   - First line: Title as bold heading: <p style="font-size:14px;"><strong>[Title]</strong></p>
   - Then, standardize each polymer category/product mentioned (e.g., HDPE, LLDPE, PP) into a consistent breakdown structure:
     - Product heading: <p style="font-size:14px;"><strong>[Product Name]</strong></p>
     - Product details: <p style="font-size:14px;">[Standardized details about price change following Indian comma format like Rs. 2,000/MT]</p>
   - Close with </div>

3. STANDARDIZATION & NORMALIZATION (Handling different company formats):
   - No matter how the raw text is written, convert price changes into clear statements:
     - For increases: "All [Product] grades prices are increased by Rs. X,XXX/MT." (or specify exceptions if mentioned).
     - For rolled over / no change: "All [Product] grades prices are rolled over (no change)."
     - For decreases: "All [Product] grades prices are decreased by Rs. X,XXX/MT."
   - Ensure every product category found in the raw text gets its own dedicated section with a bold heading.

4. IMPORTANT:
   - Every HTML element MUST have style="font-size:14px;" explicitly.
   - Output ONLY valid JSON. No markdown, no code fences, no extra text.
   - The JSON must have exactly two keys: "title" and "contentHtml".

EXAMPLE:

Input: "IOCL increased HD-IM/HD-Pipe grades prices by Rs. 2000/MT and LLDPE Drip by Rs. 2000/MT, while rolled over all other HD-Yarn/HD-BM/HM-Film, LLDPE and PP Prices w.e.f. 27th October 2026. 
www.polymermis.com,

OpaL price Revision

Rolled over prices of all PP grades. 
Increased prices of all HD pipe and HD IM grades by Rs.2000/MT and rolled over prices of all other HD grades.    
Rolled over prices of all LL grades. ,
 
HPL domestic prices w.e.f. 27th Oct'26:
*HDPE* : All HM & HD Pipe and HD IM Hi & HD IM Lo grades prices are up by Rs. 2,000/MT, whereas other HDPE grades prices are rolled over.
*LLDPE* : All LLDPE grades prices are rolled over.
_Please refer to the Price circular for details._
,

OPAL increased LLDPE Butene  Film (including drip) Prices by Rs. 2000/MT while rolled over all other PE and PP Prices, w.e.f. 22nd October 2026.

"

Output:
{
  "title": "IOCL PP and PE Prices w.e.f. 21st September 2026",
  "contentHtml": "
<p><span style="font-size: 14pt;"><strong>IOCL Polymer Prices w.e.f. 27th October 2026.</strong></span></p>
<p><span style="font-size: 14pt;"><strong>HD-IM / HD-Pipe</strong></span></p>
<p><span style="font-size: 14pt;">HD-IM and HD-Pipe grades prices are increased by Rs. 2,000/MT.</span></p>
<p><span style="font-size: 14pt;"><strong>LLDPE Drip</strong></span></p>
<p><span style="font-size: 14pt;">LLDPE Drip prices are increased by Rs. 2,000/MT.</span></p>
<p><span style="font-size: 14pt;"><strong>HD-Yarn / HD-BM / HM-Film / LLDPE / PP</strong></span></p>
<p><span style="font-size: 14pt;">All other HD-Yarn, HD-BM, HM-Film, LLDPE and PP prices are rolled over (no change).</span></p>
"
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
