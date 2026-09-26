const config = require('../config/config');

let mockIdCounter = 2278;

function getApiEndpoint(route) {
  let base = (config.apiBaseUrl || 'https://instamine.in/rest').replace(/\/+$/, '');
  if (!base.toLowerCase().endsWith('/v1')) {
    base += '/V1';
  }
  return `${base}${route}`;
}

/**
 * Creates news entry on InstaPrice server via API.
 * @param {Object} params { title, newsHtml, image }
 * @returns {Promise<Object>} { success, news_id, status }
 */
async function createNews({ title, newsHtml, image }) {
  const payload = {
    token: config.apiToken,
    title,
    news: newsHtml,
    image: image || config.defaultImage,
    status: 0
  };

  if (config.mockMode) {
    console.log('[MOCK API] POST /rest/V1/news/create Payload:', payload);
    const mockNewsId = mockIdCounter++;
    return {
      success: true,
      news_id: mockNewsId,
      status: 0,
      isMock: true
    };
  }

  const endpoint = getApiEndpoint('/news/create');
  console.log(`[API CALL] POST ${endpoint} Payload:`, payload);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`InstaPrice API returned status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error('Error calling createNews API:', err.message);
    throw err;
  }
}

/**
 * Publishes created news entry on InstaPrice server via API.
 * @param {Object} params { newsId }
 * @returns {Promise<Object>} { success, message, news_id, status }
 */
async function publishNews({ newsId }) {
  const payload = {
    token: config.apiToken,
    newsId: parseInt(newsId, 10)
  };

  if (config.mockMode) {
    console.log('[MOCK API] POST /rest/V1/news/publish Payload:', payload);
    return {
      success: true,
      message: `News ${newsId} published successfully.`,
      news_id: parseInt(newsId, 10),
      status: 1,
      isMock: true
    };
  }

  const endpoint = getApiEndpoint('/news/publish');
  console.log(`[API CALL] POST ${endpoint} Payload:`, payload);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`InstaPrice API returned status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error('Error calling publishNews API:', err.message);
    throw err;
  }
}

module.exports = {
  createNews,
  publishNews
};
