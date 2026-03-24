#!/usr/bin/env node

/**
 * generate-catalog.js
 *
 * Reads all lecture JSON files and topic JSON files,
 * then generates a catalog.json master index for the MindBite app.
 *
 * Usage: node scripts/generate-catalog.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LECTURES_DIR = path.join(ROOT, 'lectures');
const TOPICS_DIR = path.join(ROOT, 'topics');
const OUTPUT = path.join(ROOT, 'catalog.json');

function readJsonDir(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  return files.map(f => {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    return JSON.parse(content);
  });
}

function main() {
  // Read topics
  const topics = readJsonDir(TOPICS_DIR).sort((a, b) => a.sortOrder - b.sortOrder);

  // Read all lectures
  const lectures = readJsonDir(LECTURES_DIR).sort(
    (a, b) => new Date(a.publishedAt) - new Date(b.publishedAt)
  );

  // Find the latest featured lecture
  const featuredLecture = lectures.find(l => l.featured);

  // Build catalog entries (lightweight — no cards, no quiz, no full sources)
  const catalogLectures = lectures.map(l => ({
    slug: l.slug,
    title: l.title,
    subtitle: l.subtitle,
    topicId: l.topicId,
    estimatedMinutes: l.estimatedMinutes,
    difficulty: l.difficulty,
    thumbnailUrl: l.thumbnailUrl,
    isPremium: l.isPremium,
    publishedAt: l.publishedAt,
    popularityScore: l.popularityScore || 0
  }));

  // Build catalog
  const catalog = {
    version: "1.0.0",
    updatedAt: new Date().toISOString(),
    featured: featuredLecture
      ? {
          lectureSlug: featuredLecture.slug,
          validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }
      : null,
    topics: topics.map(t => ({
      id: t.id,
      name: t.name,
      emoji: t.emoji,
      colorHex: t.colorHex,
      description: t.description,
      sortOrder: t.sortOrder
    })),
    lectures: catalogLectures
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(catalog, null, 2), 'utf8');

  console.log(`✅ catalog.json generated successfully`);
  console.log(`   Topics: ${topics.length}`);
  console.log(`   Lectures: ${lectures.length}`);
  console.log(`   Featured: ${featuredLecture ? featuredLecture.slug : 'none'}`);
  console.log(`   Output: ${OUTPUT}`);
}

main();
