#!/usr/bin/env node

/**
 * validate.js
 *
 * Validates lecture and topic JSON files for the default English content and
 * any locale folders that contain their own topics/ and lectures/ directories.
 *
 * Usage: node scripts/validate.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_CONTENT_SET = {
  label: 'en',
  root: ROOT
};

const VALID_TOPIC_IDS = [
  'philosophy', 'science', 'history',
  'nature-animals', 'psychology', 'space-astronomy'
];

const VALID_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const VALID_QUESTION_TYPES = ['multiple_choice', 'true_false', 'fill_blank'];
const VALID_SOURCE_TYPES = ['journal', 'book', 'institution', 'documentary', 'expert'];

let errors = 0;
let warnings = 0;

function localeContentSets() {
  const ignored = new Set(['.git', 'lectures', 'node_modules', 'schema', 'scripts', 'topics']);

  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => !ignored.has(entry.name))
    .map(entry => ({
      label: entry.name,
      root: path.join(ROOT, entry.name)
    }))
    .filter(set =>
      fs.existsSync(path.join(set.root, 'lectures')) &&
      fs.existsSync(path.join(set.root, 'topics'))
    )
    .sort((a, b) => a.label.localeCompare(b.label));
}

function scopedName(contentSet, fileName) {
  return `${contentSet.label}/${fileName}`;
}

function error(file, msg) {
  console.error(`❌ [${file}] ${msg}`);
  errors++;
}

function warn(file, msg) {
  console.warn(`⚠️  [${file}] ${msg}`);
  warnings++;
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}

function validateLecture(contentSet, filePath) {
  const fileName = path.basename(filePath);
  const scopedFileName = scopedName(contentSet, fileName);
  let lecture;

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    lecture = JSON.parse(raw);
  } catch (e) {
    error(scopedFileName, `Invalid JSON: ${e.message}`);
    return;
  }

  const required = ['id', 'slug', 'title', 'subtitle', 'topicId', 'estimatedMinutes',
    'difficulty', 'thumbnailUrl', 'isPremium', 'cards', 'sources', 'quiz',
    'publishedAt', 'createdAt', 'updatedAt'];

  for (const field of required) {
    if (lecture[field] === undefined || lecture[field] === null) {
      error(scopedFileName, `Missing required field: ${field}`);
    }
  }

  const expectedSlug = fileName.replace('.json', '');
  if (lecture.slug !== expectedSlug) {
    error(scopedFileName, `Slug "${lecture.slug}" doesn't match filename "${expectedSlug}"`);
  }

  if (!VALID_TOPIC_IDS.includes(lecture.topicId)) {
    error(scopedFileName, `Invalid topicId: "${lecture.topicId}"`);
  }

  if (!VALID_DIFFICULTIES.includes(lecture.difficulty)) {
    error(scopedFileName, `Invalid difficulty: "${lecture.difficulty}"`);
  }

  if (lecture.estimatedMinutes < 5 || lecture.estimatedMinutes > 15) {
    warn(scopedFileName, `estimatedMinutes ${lecture.estimatedMinutes} outside 5-15 range`);
  }

  if (!Array.isArray(lecture.cards)) {
    error(scopedFileName, 'cards must be an array');
  } else {
    if (lecture.cards.length < 5 || lecture.cards.length > 8) {
      error(scopedFileName, `Expected 5-8 cards, got ${lecture.cards.length}`);
    }

    lecture.cards.forEach((card, i) => {
      if (!card.heading) error(scopedFileName, `Card ${i + 1} missing heading`);
      if (!card.body) error(scopedFileName, `Card ${i + 1} missing body`);
      if (card.body && card.body.length < 50) {
        warn(scopedFileName, `Card ${i + 1} body seems short (${card.body.length} chars)`);
      }
      if (card.order !== i + 1) {
        warn(scopedFileName, `Card ${i + 1} order is ${card.order}, expected ${i + 1}`);
      }
    });
  }

  if (!Array.isArray(lecture.sources) || lecture.sources.length < 1) {
    error(scopedFileName, 'Must have at least 1 source');
  } else {
    lecture.sources.forEach((src, i) => {
      if (!src.title) error(scopedFileName, `Source ${i + 1} missing title`);
      if (!VALID_SOURCE_TYPES.includes(src.type)) {
        error(scopedFileName, `Source ${i + 1} invalid type: "${src.type}"`);
      }
    });
  }

  if (!lecture.quiz) {
    error(scopedFileName, 'Missing quiz');
  } else {
    const quiz = lecture.quiz;
    if (!Array.isArray(quiz.questions)) {
      error(scopedFileName, 'quiz.questions must be an array');
    } else {
      if (quiz.questions.length !== 5) {
        error(scopedFileName, `Expected 5 quiz questions, got ${quiz.questions.length}`);
      }

      quiz.questions.forEach((q, i) => {
        if (!q.questionText) error(scopedFileName, `Question ${i + 1} missing questionText`);
        if (!q.correctAnswer) error(scopedFileName, `Question ${i + 1} missing correctAnswer`);
        if (!q.explanation) error(scopedFileName, `Question ${i + 1} missing explanation`);
        if (!VALID_QUESTION_TYPES.includes(q.type)) {
          error(scopedFileName, `Question ${i + 1} invalid type: "${q.type}"`);
        }
        if (q.type === 'multiple_choice') {
          if (!Array.isArray(q.options) || q.options.length !== 4) {
            error(scopedFileName, `Question ${i + 1} (MC) needs exactly 4 options`);
          }
          if (q.options && !q.options.includes(q.correctAnswer)) {
            error(scopedFileName, `Question ${i + 1} correctAnswer "${q.correctAnswer}" not in options`);
          }
        }
      });
    }
  }
}

function validateTopics(contentSet) {
  const topicsDir = path.join(contentSet.root, 'topics');
  const topicFiles = fs.readdirSync(topicsDir).filter(f => f.endsWith('.json'));
  topicFiles.forEach(f => {
    const scopedFileName = scopedName(contentSet, f);
    try {
      const topic = JSON.parse(fs.readFileSync(path.join(topicsDir, f), 'utf8'));
      if (!topic.id || !topic.name || !topic.emoji || !topic.colorHex) {
        error(scopedFileName, 'Topic missing required fields');
      }
      if (!VALID_TOPIC_IDS.includes(topic.id)) {
        error(scopedFileName, `Invalid topic id: "${topic.id}"`);
      }
    } catch (e) {
      error(scopedFileName, `Invalid JSON: ${e.message}`);
    }
  });
  ok(`${contentSet.label}: ${topicFiles.length} topic files validated`);
}

function validateContentSet(contentSet) {
  validateTopics(contentSet);

  const lecturesDir = path.join(contentSet.root, 'lectures');
  const lectureFiles = fs.readdirSync(lecturesDir).filter(f => f.endsWith('.json'));
  lectureFiles.forEach(f => {
    validateLecture(contentSet, path.join(lecturesDir, f));
  });

  ok(`${contentSet.label}: ${lectureFiles.length} lecture files validated`);
}

function main() {
  console.log('🔍 Validating MindBite content...\n');

  const contentSets = [DEFAULT_CONTENT_SET, ...localeContentSets()];
  contentSets.forEach(validateContentSet);

  console.log(`\n📊 Results: ${contentSets.length} content set(s) checked`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Warnings: ${warnings}`);

  if (errors > 0) {
    console.log('\n💥 Validation FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ All content is valid!');
    process.exit(0);
  }
}

main();
