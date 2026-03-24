# MindBite Content

Static content repository for the MindBite iOS app. All lectures, quizzes, and topic metadata are stored as JSON files and served via Cloudflare R2 CDN.

## Structure

```
mindbite-content/
├── catalog.json           ← Auto-generated master index
├── topics/                ← Topic metadata (6 topics)
├── lectures/              ← Full lectures with cards + quizzes (60 files)
├── images/                ← Thumbnails and card illustrations
├── schema/                ← JSON validation schema
├── scripts/               ← Build and validation scripts
└── .github/workflows/     ← CI/CD pipeline
```

## Commands

```bash
npm run validate           # Validate all JSON against schema
npm run generate-catalog   # Generate catalog.json from lectures
npm run build              # Validate + generate catalog
```

## Adding a New Lecture

1. Create `lectures/{slug}.json` following the schema in `schema/lecture.schema.json`
2. Run `npm run validate` to check for errors
3. Commit and push to `main`
4. GitHub Actions will validate, regenerate catalog, and deploy to R2

## Deployment

On push to `main`, GitHub Actions:
1. Validates all JSON files
2. Regenerates `catalog.json`
3. Uploads changed files to Cloudflare R2
4. App picks up new content within 30 minutes

## Setup (Cloudflare R2)

1. Create an R2 bucket named `mindbite-content`
2. Enable public access via custom domain
3. Add GitHub secrets: `CF_API_TOKEN` and `CF_ACCOUNT_ID`
