# Make a Mitzva Backend

This repository contains the backend API for the Make a Mitzva platform. The backend manages users, mitzva requests, chat between users, media uploads, and admin moderation. It is an Express 5 application with MongoDB and Mongoose, using JWT for authentication and Cloudinary for media storage.

The goal of this README is to document the backend in enough detail to serve as a book for future maintainers. It covers architecture, data models, request flows, routing, security, and operational behavior.

## High-level architecture

- Runtime: Node.js (ESM) with Express 5
- Database: MongoDB with Mongoose ODM
- Media storage: Cloudinary
- Auth: JSON Web Tokens (JWT)
- Uploads: Multer (memory storage) with optional Sharp optimization
- Security: Helmet and CORS

The backend is a single Express server (`index.js`) that wires routers from `routers/`, which delegate business logic to controllers in `controllers/`. Data is modeled with Mongoose schemas in `models/`.

## Repository layout

- `index.js` Bootstraps Express, middleware, routers, health checks, and MongoDB connection
- `controllers/` Request handlers and domain logic
- `routers/` Express routers that define URL structure and attach middleware
- `models/` Mongoose schemas and data validation
- `middleware/` Authentication and authorization logic
- `cloudinary.js` Cloudinary configuration wrapper
- `src/phoneUtils.js` Client-style phone helpers (used outside the server; included for reference)

## Boot sequence and server lifecycle

1. Environment variables are loaded via `dotenv`.
2. Express is created and configured with:
   - `express.json()` for JSON bodies.
   - `helmet()` for common security headers.
   - `cors()` with an allow-list based on `CLIENT_ORIGINS`.
3. Routers are mounted under `/api`.
4. A health endpoint is registered at `/api/health`.
5. MongoDB connection is established via `mongoose.connect`.
6. The server starts listening on `PORT` (default `4000`).

The health endpoint returns the current connection state, database name, host, uptime, and timestamp. This makes it suitable for liveness and readiness checks.

## Environment configuration

Create a `.env` file in the project root. The backend relies on these variables:

```
PORT=4000
MONGODB_URI=mongodb://localhost:27017/make-a-mitzva
JWT_SECRET=replace_me
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLIENT_ORIGINS=http://localhost:5173,https://your-domain.com
```

Notes:
- `CLIENT_ORIGINS` is a comma-separated allow-list for CORS. In local development, `http://localhost:5173` is enough. If not set, it defaults to `http://localhost:5173`.
- `JWT_SECRET` is required for creating tokens; the auth middleware also falls back to a static string if it is missing. For production, always set a strong `JWT_SECRET`.

## Dependencies and what they do

- `express` HTTP server and routing
- `mongoose` ODM and schema validation
- `jsonwebtoken` JWT creation and verification
- `bcrypt` password hashing
- `validator` email validation
- `cors` cross-origin request handling
- `helmet` security headers
- `multer` file upload parsing (memory storage)
- `sharp` image optimization (WebP conversion and resizing)
- `cloudinary` media hosting

## Security model

- JWT tokens are issued during registration and login.
- `authenticateToken` middleware:
  - Reads `Authorization: Bearer <token>`.
  - Verifies the token and loads the user from the database.
  - Attaches `{ id, role }` to `req.user`.
- `isAdmin` middleware:
  - Allows only users with `role === "admin"`.

## Data model details

### User (`models/userModel.js`)

Fields:
- `name` (String, required, lowercase, trimmed)
- `age` (Number, required, 16..120)
- `email` (String, required, unique, validated)
- `password` (String, required, hashed)
- `phone` (String, required, unique)
- `stars` (Number, default 0)
- `couponEarned` (Boolean, default false)
- `role` (String enum `user|admin`, default `user`)
- `isBanned` (Boolean, default false)
- `profileImage` (String, default empty)
- timestamps (`createdAt`, `updatedAt`)

Phone normalization:
- The `phone` field runs through a `normalizePhone` function.
- It strips non-digits, removes international prefixes, and enforces Israeli mobile format (`5XXXXXXXX`).
- Valid numbers are stored as `+972` prefixed E.164-style numbers.
- Invalid numbers cause validation to fail.

### Request (`models/requestModel.js`)

Fields:
- `title` (String, required, max 10 chars)
- `description` (String, required, max 200 chars)
- `urgency` (String enum `low|normal|high`, default `normal`)
- `isCompleted` (Boolean, default false)
- `createdAt` (Date, expires after 86400 seconds)
- `createdBy` (ObjectId -> User, required)
- `completedBy` (ObjectId -> User, optional)
- `location` (GeoJSON Point)
  - `type` fixed to `Point`
  - `coordinates` array `[longitude, latitude]`
- `helperConfirmed` (Boolean, default false)
- `seekerConfirmed` (Boolean, default false)
- timestamps (`createdAt`, `updatedAt`)

Indexes:
- A `2dsphere` index is created on `location` for geospatial queries.

Expiration:
- `createdAt` has a TTL index of 86400 seconds (24 hours). Old requests are removed automatically by MongoDB once this TTL passes.

### Chat (`models/chatModel.js`)

Fields:
- `request` (ObjectId -> Request)
- `participants` (Array of ObjectId -> User)
- `messages` (Array)
  - `sender` (ObjectId -> User)
  - `text` (String)
  - `attachments` (Array of attachment objects)
  - `createdAt` (Date)
- timestamps (`createdAt`, `updatedAt`)

Attachment schema:
- `url` (String, required)
- `type` (String enum `image|video|file`, default `file`)
- `publicId` (String)
- `originalName` (String)

## Authentication flows

### Registration (`POST /api/users/register`)

1. Validate required fields (name, age, email, password, phone).
2. Normalize email and check uniqueness.
3. Hash password with bcrypt.
4. Create user document.
5. Issue JWT token with `{ id, role }` and 7-day expiry.
6. Return token and sanitized user data.

### Login (`POST /api/users/login`)

1. Validate email and password.
2. Look up user by normalized email.
3. Block banned users.
4. Compare password hash.
5. Issue JWT token with 7-day expiry.
6. Return token and sanitized user data.

### Token consumption

- The client must send `Authorization: Bearer <token>` for protected routes.
- The middleware fetches the user and rejects if the user is missing or token invalid.

## Request lifecycle

### Create a request (`POST /api/requests`)

- Requires authentication.
- Validates title, description, and coordinates.
- Writes a `Request` document with `isCompleted = false` and GeoJSON location.

### Discover nearby requests (`GET /api/requests/nearby`)

- Public route.
- Requires `longitude`, `latitude`, and `distanceInMeters` query parameters.
- Uses `Request.aggregate` with `$geoNear` on `location`.
- Filters to open requests only (`isCompleted = false`).
- Joins user data by populating `createdBy` via `$lookup`.

### List my open requests (`GET /api/requests/my-open`)

- Requires authentication.
- Returns open requests created by the logged-in user.
- Populates `createdBy` and `completedBy` fields.

### List my completed requests (`GET /api/requests/my-completed`)

- Requires authentication.
- Returns requests created by the user that are completed.
- Populates `createdBy` and `completedBy`.

### List requests I solved (`GET /api/requests/i-solved`)

- Requires authentication.
- Returns requests where the user is `completedBy` and `isCompleted = true`.

### Claim a request (`PATCH /api/requests/:id/help`)

- Requires authentication.
- Rejects if the user is the creator or if another helper already exists.
- Assigns `completedBy` to the helper and sets `helperConfirmed = true`.

### Mark request completed (`PATCH /api/requests/:id/complete`)

- Requires authentication.
- Only the creator can mark completion.
- Requires a helper to be assigned first.
- Sets `seekerConfirmed = true`.
- When both helper and seeker are confirmed:
  - Sets `isCompleted = true`.
  - Increments helper `stars` by 10.
  - If helper reaches 500 stars, sets `couponEarned = true`.
- Handles missing helper accounts gracefully by skipping star logic.

## Chat system

### Start or find a chat (`POST /api/chats/start`)

- Requires authentication.
- Accepts `otherUserId` and `requestId`.
- Prevents starting a chat with yourself.
- Ensures the `requestId` exists.
- Uses the sorted participant list plus `requestId` to ensure a single chat per pair per request.

### List my chats (`GET /api/chats/my`)

- Requires authentication.
- Returns chats sorted by `updatedAt` descending.
- Populates participants and associated request details.
- If a user was deleted, the API returns a placeholder sender to avoid UI crashes.

### Fetch messages (`GET /api/chats/:chatId/messages`)

- Requires authentication.
- Populates message senders.
- Normalizes deleted users to a placeholder sender.

### Send a message (`POST /api/chats/:chatId/messages`)

- Requires authentication.
- Accepts `text` and optional `attachments` array.
- Rejects empty messages without attachments.
- Pushes a new message and returns the new message populated with sender data.

### Upload chat media (`POST /api/chats/:chatId/attachments`)

- Requires authentication.
- Accepts multipart file field `file`.
- If the file is an image, it is resized to max 1600x1600 and converted to WebP.
- Uploads to Cloudinary folder `chat-media` with `resource_type: auto`.
- Returns Cloudinary URL, publicId, and derived type (`image|video|file`).

## Profile image uploads

Route: `POST /api/upload`

- Accepts multipart file field `image`.
- Optimizes images with Sharp and converts to WebP (max width 1600).
- Uploads to Cloudinary folder `users`.
- Returns the hosted URL.

The profile image can then be stored via `PATCH /api/users/profile-image`.

## Admin operations

All admin routes require both authentication and the `admin` role.

- `GET /api/admin/users` List users with public fields.
- `PATCH /api/admin/users/:id/ban` Ban a user.
- `PATCH /api/admin/users/:id/unban` Unban a user.
- `DELETE /api/admin/users/:id` Delete a user.
- `GET /api/admin/requests` List all requests with creators and completers.
- `DELETE /api/admin/requests/:id` Delete a request.

## API route map

Base prefix: `/api`

Users:
- `POST /users/register`
- `POST /users/login`
- `GET /users/me`
- `PATCH /users/profile-image`
- `DELETE /users/delete/:id`

Requests:
- `POST /requests`
- `GET /requests/nearby?longitude=&latitude=&distanceInMeters=`
- `GET /requests/my-open`
- `GET /requests/my-completed`
- `GET /requests/i-solved`
- `PATCH /requests/:id/help`
- `PATCH /requests/:id/complete`

Chats:
- `POST /chats/start`
- `GET /chats/my`
- `GET /chats/:chatId/messages`
- `POST /chats/:chatId/messages`
- `POST /chats/:chatId/attachments` (multipart field `file`)

Uploads:
- `POST /upload` (multipart field `image`)

Admin:
- `GET /admin/users`
- `PATCH /admin/users/:id/ban`
- `PATCH /admin/users/:id/unban`
- `DELETE /admin/users/:id`
- `GET /admin/requests`
- `DELETE /admin/requests/:id`

Health:
- `GET /health`

## Error handling conventions

- Handlers return JSON responses with `error` or `message` keys.
- Validation errors use 400-series status codes.
- Unauthorized or forbidden access uses 401 or 403.
- Missing records use 404.
- Server errors use 500 and include a `details` message when available.

## Development and operations

Install dependencies and run in development:

```
npm install
npm run dev
```

Run in production:

```
npm start
```

## What to read next

If you are building a deeper guide or a printed document, the key source files to read in order are:

1. `index.js` for server boot and middleware.
2. `middleware/authMiddleware.js` for authentication and authorization.
3. `models/userModel.js`, `models/requestModel.js`, `models/chatModel.js` for schema rules.
4. `routers/` for URL design.
5. `controllers/` for domain logic and workflow enforcement.
