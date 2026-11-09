# StudyStudent

StudyStudent is a secure educational notes-sharing platform for students. The repository is currently in Phase 2: architecture preparation and environment-driven implementation planning.

## Stack
- Node.js + Express
- MongoDB + Mongoose
- JWT authentication
- Role-based access control

## Phase 1 delivered
- MongoDB connection configuration and environment setup
- Initial model layer for users, courses, and notes
- Migration script for core indexes and seed data
- Authentication and role middleware
- Focused security tests
- Environment validation for production-safe startup

## Phase 2 architecture
The application is organized around a simple layered Express design:
- `config/`: runtime environment validation and database startup configuration
- `middleware/`: JWT authentication and role authorization
- `models/`: Mongoose schemas for business entities
- `routes/`: API entry points for auth and protected resources
- `migrations/`: initialization and indexing tasks for MongoDB
- `test/`: automated validation for security and configuration checks

## Phase 3 delivered
- Course, subject, unit, and topic models for the academic hierarchy
- Admin-only management APIs for course creation and nested academic organization
- Duplicate-name safety checks inside each scope (`course`, `subject`, `unit`)
- Public hierarchy data exposure for discovery and navigation
- Focused automated tests for nested content creation and role restrictions

## Phase 5 delivered
- Student note upload and moderation workflow
- Pending/approved/rejected/removed status tracking
- Moderator and admin review endpoints
- Review records for moderation audit history

## Phase 6 delivered
- Searchable public note discovery via title, description, and filename
- Filter support by course and subject
- Saved bookmarks for student note collections
- Single-report-per-note protections to prevent duplicate reporting
- Moderator report queue for review and auditing

### Environment contract
Required runtime values:
- `PORT`
- `MONGO_URI`
- `JWT_SECRET`
- `SESSION_COOKIE_NAME`
- `NODE_ENV`

Additional future configuration for feature expansion:
- `FRONTEND_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `EMAIL_FROM`

### Product roadmap checklist
- [x] Phase 1: repository inspection, MongoDB foundation, and security guardrails
- [x] Phase 2: architecture and implementation plan finalized
- [x] Phase 3: expand schema and API resources for academic hierarchy
- [x] Phase 4: implement authentication and role workflows
- [x] Phase 5: student upload, moderation queue, and note lifecycle
- [x] Phase 6: notes discovery, search, bookmarks, and reports
- [x] Phase 7: notification system and dashboard analytics
- [x] Phase 8: security audits, testing, and deployment prep

## Phase 8 delivered
- Helmet hardening and security headers for production responses
- Global and auth-specific request rate limiting to prevent abuse
- Origin allowlist validation for CORS in front-end deployment setups
- Health endpoint for runtime and database status checks
- Docker support for containerized deployment
- Comprehensive tests covering runtime health and request throttling

## Local setup
1. Copy `.env.example` to `.env` and update the MongoDB URL, JWT secret, and Supabase values.
2. Install dependencies:
   npm install
3. Validate environment configuration:
   npm run validate:env
4. Run database migrations:
   npm run migrate:core
   npm run migrate:academic
5. Start the API:
   npm run dev

## Supabase Storage setup
StudyStudent uses MongoDB + Mongoose as the source of truth for metadata and user access, while Supabase Storage is used only for the actual uploaded file content.

Required environment variables:
- `SUPABASE_URL` — project URL from your Supabase dashboard
- `SUPABASE_SERVICE_ROLE_KEY` — server-only secret; never expose this to the browser
- `SUPABASE_STORAGE_BUCKET` — the private bucket used to store user uploads and approved files

Recommended bucket setup:
1. Create a private bucket named `studystudent-files` in Supabase Storage.
2. Keep the bucket private so signed URLs are required for file access.
3. Use a server-side `storageService` implementation to upload, move, and delete objects.
4. Never expose the service role key in frontend code or client-side environment files.

## Health check
GET /api/health