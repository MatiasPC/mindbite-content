#!/usr/bin/env node

/**
 * generate-catalog.js
 *
 * Reads lecture JSON files and topic JSON files, then generates catalog.json
 * indexes for the default English content and any locale folders that contain
 * their own topics/ and lectures/ directories.
 *
 * Usage: node scripts/generate-catalog.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_CONTENT_SET = {
  label: 'en',
  root: ROOT,
  output: path.join(ROOT, 'catalog.json')
};

function localeContentSets() {
  const ignored = new Set(['.git', 'lectures', 'node_modules', 'schema', 'scripts', 'topics']);

  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => !ignored.has(entry.name))
    .map(entry => ({
      label: entry.name,
      root: path.join(ROOT, entry.name),
      output: path.join(ROOT, entry.name, 'catalog.json')
    }))
    .filter(set =>
      fs.existsSync(path.join(set.root, 'lectures')) &&
      fs.existsSync(path.join(set.root, 'topics'))
    )
    .sort((a, b) => a.label.localeCompare(b.label));
}

function readJsonDir(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  return files.map(f => {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    return JSON.parse(content);
  });
}

function buildCatalog(contentSet) {
  const lecturesDir = path.join(contentSet.root, 'lectures');
  const topicsDir = path.join(contentSet.root, 'topics');

  const topics = readJsonDir(topicsDir).sort((a, b) => a.sortOrder - b.sortOrder);
  const lectures = readJsonDir(lecturesDir).sort(
    (a, b) => new Date(a.publishedAt) - new Date(b.publishedAt)
  );

  const featuredLecture = lectures.find(l => l.featured);
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

  fs.writeFileSync(contentSet.output, JSON.stringify(catalog, null, 2), 'utf8');

  console.log(`✅ ${contentSet.label}/catalog.json generated successfully`);
  console.log(`   Topics: ${topics.length}`);
  console.log(`   Lectures: ${lectures.length}`);
  console.log(`   Featured: ${featuredLecture ? featuredLecture.slug : 'none'}`);
  console.log(`   Output: ${contentSet.output}`);
}

function main() {
  const contentSets = [DEFAULT_CONTENT_SET, ...localeContentSets()];
  contentSets.forEach(buildCatalog);
}

main();
