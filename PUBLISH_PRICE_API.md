# News API

Token-protected REST APIs to **create** and **publish** news items.

Access is protected by a **fixed access token**. Only callers who present the correct token can use these APIs.

---

## Base

| | |
|---|---|
| **Base URL** | `https://instamine.in/rest` |
| **Method** | `POST` (both endpoints) |
| **Content-Type** | `application/json` |
| **Authentication** | Fixed token, sent in the request body |

## Access Token

```
chemer_news_549632c136167c61cd40a0c74dbdd580
```

Send this exact token in the `token` field of every request. Keep it confidential.

News `status` values: **`0` = Draft**, **`1` = Published**.

---

# 1. Create News API

Creates a new news item.

| | |
|---|---|
| **URL** | `https://instamine.in/rest/V1/news/create` |
| **Method** | `POST` |

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|---------|----------|-------------|
| `token` | string | Yes | The fixed access token. |
| `title` | string | Yes | News title. |
| `news` | string | Yes | News content. HTML is allowed. |
| `image` | string | No | Image file name (e.g. `banner.jpg`). The file must already exist under `media/news/file/`. Omit or `null` if no image. |
| `status` | integer | No | `0` = Draft (default), `1` = Published. |

### Example Request

```bash
curl -X POST "https://instamine.in/rest/V1/news/create" \
  -H "Content-Type: application/json" \
  -d '{
        "token": "chemer_news_549632c136167c61cd40a0c74dbdd580",
        "title": "New product launch",
        "news": "<p>We are excited to announce...</p>",
        "image": "launch.jpg",
        "status": 0
      }'
```

### Success Response — HTTP 200

```json
{
  "success": true,
  "message": "News created successfully with id 2275.",
  "news_id": 2275,
  "status": 0
}
```

| Field | Type | Description |
|-----------|---------|-------------|
| `success` | boolean | `true` when created. |
| `message` | string | Result message. |
| `news_id` | integer | ID of the newly created news item. |
| `status` | integer | Stored status (`0` Draft / `1` Published). |

### Failure Responses

| HTTP Status | Meaning | Example Response |
|-------------|---------|------------------|
| **401 Unauthorized** | Token missing/incorrect. | `{ "message": "Invalid or missing access token." }` |
| **400 Bad Request** | `title` missing/empty. | `{ "message": "A news title is required." }` |
| **400 Bad Request** | `news` content missing/empty. | `{ "message": "News content is required." }` |
| **400 Bad Request** | `status` not 0 or 1. | `{ "message": "Status must be 0 (Draft) or 1 (Published)." }` |
| **500 Internal Server Error** | Unexpected server error. | `{ "message": "Could not create the news item. Please try again later." }` |

---

# 2. Publish News API

Publishes an existing news item (sets its status to Published).

| | |
|---|---|
| **URL** | `https://instamine.in/rest/V1/news/publish` |
| **Method** | `POST` |

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|---------|----------|-------------|
| `token` | string | Yes | The fixed access token. |
| `newsId` | integer | Yes | The ID of the news item to publish. |

### Example Request

```bash
curl -X POST "https://instamine.in/rest/V1/news/publish" \
  -H "Content-Type: application/json" \
  -d '{
        "token": "chemer_news_549632c136167c61cd40a0c74dbdd580",
        "newsId": 2275
      }'
```

### Success Response — HTTP 200

```json
{
  "success": true,
  "message": "News 2275 published successfully.",
  "news_id": 2275,
  "status": 1
}
```

If the item is already published (safe to retry):

```json
{
  "success": true,
  "message": "News 2275 is already published.",
  "news_id": 2275,
  "status": 1
}
```

### Failure Responses

| HTTP Status | Meaning | Example Response |
|-------------|---------|------------------|
| **401 Unauthorized** | Token missing/incorrect. | `{ "message": "Invalid or missing access token." }` |
| **400 Bad Request** | `newsId` missing/invalid. | `{ "message": "A valid newsId is required." }` |
| **404 Not Found** | News item not found. | `{ "message": "No news item found with id \"999999999\"." }` |
| **500 Internal Server Error** | Unexpected server error. | `{ "message": "Could not publish the news item. Please try again later." }` |

---

## Status Codes Summary

| Code | Result | Description |
|------|--------|-------------|
| `200` | Success | Operation completed. |
| `400` | Failure | Invalid or missing parameters. |
| `401` | Failure | Invalid, missing, or unconfigured token. |
| `404` | Failure | News item not found (publish only). |
| `500` | Failure | Unexpected server error. |

---

## Typical Flow

1. **Create** a news item (`/V1/news/create`) — as Draft (`status: 0`) or directly Published (`status: 1`).
2. If created as Draft, **Publish** it later (`/V1/news/publish`) using the returned `news_id`.

## Notes

- The `token` must be kept **confidential**. Anyone with it can create/publish news.
- The publish API is **idempotent** — re-publishing an already-published item returns success.
- Only the documented fields are required; any additional fields are ignored.
- All requests must be made over **HTTPS**.
