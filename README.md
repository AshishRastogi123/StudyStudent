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
- [ ] Phase 5: student upload, moderation queue, and note lifecycle
- [ ] Phase 6: notes discovery, search, bookmarks, and reports
- [ ] Phase 7: notification system and dashboard analytics
- [ ] Phase 8: security audits, testing, and deployment prep

## Local setup
1. Copy `.env.example` to `.env` and update the MongoDB URL and JWT secret.
2. Install dependencies:
   npm install
3. Validate environment configuration:
   npm run validate:env
4. Run database migrations:
   npm run migrate:core
   npm run migrate:academic
5. Start the API:
   npm run dev

## Health check
GET /api/health