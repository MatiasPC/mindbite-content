#!/usr/bin/env node

/**
 * validate.js
 *
 * Validates all lecture JSON files against the schema
 * and checks for content quality issues.
 *
 * Usage: node scripts/validate.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LECTURES_DIR = path.join(ROOT, 'lectures');
const TOPICS_DIR = path.join(ROOT, 'topics');

const VALID_TOPIC_IDS = [
  'philosophy', 'science', 'history',
  'nature-animals', 'psychology', 'space-astronomy'
];

const VALID_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const VALID_QUESTION_TYPES = ['multiple_choice', 'true_false', 'fill_blank'];
const VALID_SOURCE_TYPES = ['journal', 'book', 'institution', 'documentary', 'expert'];

let errors = 0;
let warnings = 0;

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

function validateLecture(filePath) {
  const fileName = path.basename(filePath);
  let lecture;

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    lecture = JSON.parse(raw);
  } catch (e) {
    error(fileName, `Invalid JSON: ${e.message}`);
    return;
  }

  // Required fields
  const required = ['id', 'slug', 'title', 'subtitle', 'topicId', 'estimatedMinutes',
    'difficulty', 'thumbnailUrl', 'isPremium', 'cards', 'sources', 'quiz',
    'publishedAt', 'createdAt', 'updatedAt'];

  for (const field of required) {
    if (lecture[field] === undefined || lecture[field] === null) {
      error(fileName, `Missing required field: ${field}`);
    }
  }

  // Slug match
  const expectedSlug = fileName.replace('.json', '');
  if (lecture.slug !== expectedSlug) {
    error(fileName, `Slug "${lecture.slug}" doesn't match filename "${expectedSlug}"`);
  }

  // Topic ID
  if (!VALID_TOPIC_IDS.includes(lecture.topicId)) {
    error(fileName, `Invalid topicId: "${lecture.topicId}"`);
  }

  // Difficulty
  if (!VALID_DIFFICULTIES.includes(lecture.difficulty)) {
    error(fileName, `Invalid difficulty: "${lecture.difficulty}"`);
  }

  // Estimated minutes
  if (lecture.estimatedMinutes < 5 || lecture.estimatedMinutes > 15) {
    warn(fileName, `estimatedMinutes ${lecture.estimatedMinutes} outside 5-15 range`);
  }

  // Cards
  if (!Array.isArray(lecture.cards)) {
    error(fileName, 'cards must be an array');
  } else {
    if (lecture.cards.length < 5 || lecture.cards.length > 8) {
      error(fileName, `Expected 5-8 cards, got ${lecture.cards.length}`);
    }

    lecture.cards.forEach((card, i) => {
      if (!card.heading) error(fileName, `Card ${i + 1} missing heading`);
      if (!card.body) error(fileName, `Card ${i + 1} missing body`);
      if (card.body && card.body.length < 50) {
        warn(fileName, `Card ${i + 1} body seems short (${card.body.length} chars)`);
      }
      if (card.order !== i + 1) {
        warn(fileName, `Card ${i + 1} order is ${card.order}, expected ${i + 1}`);
      }
    });
  }

  // Sources
  if (!Array.isArray(lecture.sources) || lecture.sources.length < 1) {
    error(fileName, 'Must have at least 1 source');
  } else {
    lecture.sources.forEach((src, i) => {
      if (!src.title) error(fileName, `Source ${i + 1} missing title`);
      if (!VALID_SOURCE_TYPES.includes(src.type)) {
        error(fileName, `Source ${i + 1} invalid type: "${src.type}"`);
      }
    });
  }

  // Quiz
  if (!lecture.quiz) {
    error(fileName, 'Missing quiz');
  } else {
    const quiz = lecture.quiz;
    if (!Array.isArray(quiz.questions)) {
      error(fileName, 'quiz.questions must be an array');
    } else {
      if (quiz.questions.length !== 5) {
        error(fileName, `Expected 5 quiz questions, got ${quiz.questions.length}`);
      }

      quiz.questions.forEach((q, i) => {
        if (!q.questionText) error(fileName, `Question ${i + 1} missing questionText`);
        if (!q.correctAnswer) error(fileName, `Question ${i + 1} missing correctAnswer`);
        if (!q.explanation) error(fileName, `Question ${i + 1} missing explanation`);
        if (!VALID_QUESTION_TYPES.includes(q.type)) {
          error(fileName, `Question ${i + 1} invalid type: "${q.type}"`);
        }
        if (q.type === 'multiple_choice') {
          if (!Array.isArray(q.options) || q.options.length !== 4) {
            error(fileName, `Question ${i + 1} (MC) needs exactly 4 options`);
          }
          if (q.options && !q.options.includes(q.correctAnswer)) {
            error(fileName, `Question ${i + 1} correctAnswer "${q.correctAnswer}" not in options`);
          }
        }
      });
    }
  }
}

function validateTopics() {
  const topicFiles = fs.readdirSync(TOPICS_DIR).filter(f => f.endsWith('.json'));
  topicFiles.forEach(f => {
    try {
      const topic = JSON.parse(fs.readFileSync(path.join(TOPICS_DIR, f), 'utf8'));
      if (!topic.id || !topic.name || !topic.emoji || !topic.colorHex) {
        error(f, 'Topic missing required fields');
      }
    } catch (e) {
      error(f, `Invalid JSON: ${e.message}`);
    }
  });
  ok(`${topicFiles.length} topic files validated`);
}

function main() {
  console.log('🔍 Validating MindBite content...\n');

  // Validate topics
  validateTopics();

  // Validate lectures
  const lectureFiles = fs.readdirSync(LECTURES_DIR).filter(f => f.endsWith('.json'));
  lectureFiles.forEach(f => {
    validateLecture(path.join(LECTURES_DIR, f));
  });

  console.log(`\n📊 Results: ${lectureFiles.length} lectures checked`);
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
