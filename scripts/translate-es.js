#!/usr/bin/env node

/**
 * translate-es.js
 *
 * Generates Spanish content under es/ from the canonical English JSON files.
 * It preserves IDs, slugs, dates, images, source metadata, and True/False answer
 * values, because the iOS quiz UI uses those raw values internally.
 *
 * Usage: npm run translate:es
 *        npm run translate:es -- --missing-only
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const EN_LECTURES_DIR = path.join(ROOT, 'lectures');
const EN_TOPICS_DIR = path.join(ROOT, 'topics');
const ES_ROOT = path.join(ROOT, 'es');
const ES_LECTURES_DIR = path.join(ES_ROOT, 'lectures');
const ES_TOPICS_DIR = path.join(ES_ROOT, 'topics');
const CACHE_FILE = path.join('/private/tmp', 'mindbite-translation-cache-es.json');
const BATCH_SEPARATOR = '<MB_SPLIT>';
const MAX_BATCH_CHARS = 300;
const MAX_DIRECT_CHARS = 300;
const missingOnly = process.argv.includes('--missing-only');

let cache = {};
if (fs.existsSync(CACHE_FILE)) {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function saveCache() {
  writeJson(CACHE_FILE, cache);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function requestTranslation(text) {
  let lastError;

  try {
    const lingvaResponse = execFileSync('curl', [
      '-s',
      '--fail',
      '--retry', '3',
      '--retry-delay', '2',
      `https://lingva.ml/api/v1/en/es/${encodeURIComponent(text)}`
    ], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 8
    });

    if (!lingvaResponse.trimStart().startsWith('<')) {
      const parsed = JSON.parse(lingvaResponse);
      if (parsed.translation) {
        return parsed.translation;
      }
    }
  } catch (error) {
    lastError = error;
  }

  try {
    const googleResponse = execFileSync('curl', [
      '-s',
      '--fail',
      '--retry', '3',
      '--retry-delay', '2',
      '--data-urlencode', 'client=gtx',
      '--data-urlencode', 'sl=en',
      '--data-urlencode', 'tl=es',
      '--data-urlencode', 'dt=t',
      '--data-urlencode', `q=${text}`,
      'https://translate.googleapis.com/translate_a/single'
    ], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 8
    });

    if (!googleResponse.trimStart().startsWith('<')) {
      const parsed = JSON.parse(googleResponse);
      return parsed[0].map(part => part[0]).join('');
    }
  } catch (error) {
    lastError = error;
  }

  try {
    const myMemoryResponse = execFileSync('curl', [
      '-sG',
      '--fail',
      '--retry', '3',
      '--retry-delay', '2',
      '--data-urlencode', `q=${text}`,
      '--data-urlencode', 'langpair=en|es',
      '--data-urlencode', 'mt=1',
      'https://api.mymemory.translated.net/get'
    ], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 8
    });

    const parsed = JSON.parse(myMemoryResponse);
    if (parsed.responseStatus === 200 && parsed.responseData?.translatedText) {
      return parsed.responseData.translatedText;
    }
  } catch (error) {
    lastError = error;
  }

  throw lastError ?? new Error('No translation provider returned a usable response');
}

function splitLongText(text) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if (sentence.length > MAX_DIRECT_CHARS) {
      if (current) {
        chunks.push(current);
        current = '';
      }

      const words = sentence.split(/\s+/);
      let wordChunk = '';
      for (const word of words) {
        const candidate = wordChunk ? `${wordChunk} ${word}` : word;
        if (candidate.length > MAX_DIRECT_CHARS && wordChunk) {
          chunks.push(wordChunk);
          wordChunk = word;
        } else {
          wordChunk = candidate;
        }
      }
      if (wordChunk) {
        chunks.push(wordChunk);
      }
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > MAX_DIRECT_CHARS && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function translate(text) {
  if (text === undefined || text === null || text === '') {
    return text;
  }

  if (cache[text]) {
    return cache[text];
  }

  if (text.length > MAX_DIRECT_CHARS) {
    const translated = splitLongText(text)
      .map(chunk => translate(chunk))
      .join(' ');
    cache[text] = translated;
    saveCache();
    return translated;
  }

  let translated;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      translated = requestTranslation(text);
      break;
    } catch (error) {
      if (attempt === 4) {
        throw error;
      }
      sleep(1500 * attempt);
    }
  }

  cache[text] = translated;
  saveCache();
  return translated;
}

function chunkTexts(texts) {
  const chunks = [];
  let current = [];
  let currentLength = 0;

  for (const text of texts) {
    const nextLength = currentLength + text.length + BATCH_SEPARATOR.length + 2;
    if (current.length > 0 && nextLength > MAX_BATCH_CHARS) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }

    current.push(text);
    currentLength += text.length + BATCH_SEPARATOR.length + 2;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function translateMany(texts) {
  const missing = [...new Set(texts.filter(text => text && !cache[text]))];
  const direct = missing.filter(text => text.length > MAX_DIRECT_CHARS);
  const batchable = missing.filter(text => text.length <= MAX_DIRECT_CHARS);

  direct.forEach(translate);

  for (const chunk of chunkTexts(batchable)) {
    if (chunk.length === 1) {
      translate(chunk[0]);
      continue;
    }

    const joined = chunk.join(`\n${BATCH_SEPARATOR}\n`);
    let translated;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        translated = requestTranslation(joined);
        break;
      } catch (error) {
        if (attempt === 4) {
          throw error;
        }
        sleep(1500 * attempt);
      }
    }

    const parts = translated.split(new RegExp(`\\n?${BATCH_SEPARATOR}\\n?`));
    if (parts.length !== chunk.length) {
      chunk.forEach(translate);
      continue;
    }

    chunk.forEach((text, index) => {
      cache[text] = parts[index].trim();
    });
    saveCache();
  }
}

function collectTopicStrings(topic) {
  return [topic.name, topic.description];
}

function collectLectureStrings(lecture) {
  const strings = [
    lecture.title,
    lecture.subtitle
  ];

  lecture.cards.forEach(card => {
    strings.push(card.heading, card.body, card.imageCaption, card.funFact);
  });

  lecture.quiz.questions.forEach(question => {
    strings.push(question.questionText, question.explanation);
    if (question.type === 'multiple_choice' && Array.isArray(question.options)) {
      strings.push(...question.options);
    } else if (question.type !== 'true_false') {
      strings.push(question.correctAnswer);
    }
  });

  return strings.filter(Boolean);
}

function translateTopic(topic) {
  return {
    ...topic,
    name: translate(topic.name),
    description: translate(topic.description)
  };
}

function translateCard(card) {
  return {
    ...card,
    heading: translate(card.heading),
    body: translate(card.body),
    imageCaption: card.imageCaption ? translate(card.imageCaption) : card.imageCaption,
    funFact: card.funFact ? translate(card.funFact) : card.funFact
  };
}

function translateQuestion(question) {
  const translated = {
    ...question,
    questionText: translate(question.questionText),
    explanation: translate(question.explanation)
  };

  if (question.type === 'multiple_choice' && Array.isArray(question.options)) {
    const translatedOptions = question.options.map(option => translate(option));
    const correctIndex = question.options.findIndex(option => option === question.correctAnswer);
    translated.options = translatedOptions;
    translated.correctAnswer = correctIndex >= 0
      ? translatedOptions[correctIndex]
      : translate(question.correctAnswer);
  } else if (question.type === 'true_false') {
    translated.correctAnswer = question.correctAnswer;
  } else {
    translated.correctAnswer = translate(question.correctAnswer);
  }

  return translated;
}

function translateLecture(lecture) {
  return {
    ...lecture,
    title: translate(lecture.title),
    subtitle: translate(lecture.subtitle),
    cards: lecture.cards.map(translateCard),
    quiz: {
      ...lecture.quiz,
      questions: lecture.quiz.questions.map(translateQuestion)
    }
  };
}

function translateTopics() {
  ensureDir(ES_TOPICS_DIR);

  const files = fs.readdirSync(EN_TOPICS_DIR).filter(file => file.endsWith('.json')).sort();
  const topics = files.map(file => readJson(path.join(EN_TOPICS_DIR, file)));
  translateMany(topics.flatMap(collectTopicStrings));
  topics.forEach((topic, index) => {
    writeJson(path.join(ES_TOPICS_DIR, files[index]), translateTopic(topic));
  });

  console.log(`Topics translated: ${files.length}`);
}

function translateLectures() {
  ensureDir(ES_LECTURES_DIR);

  const files = fs.readdirSync(EN_LECTURES_DIR).filter(file => file.endsWith('.json')).sort();
  const pendingFiles = missingOnly
    ? files.filter(file => !fs.existsSync(path.join(ES_LECTURES_DIR, file)))
    : files;

  if (missingOnly) {
    console.log(`Missing lectures: ${pendingFiles.length}/${files.length}`);
  }

  pendingFiles.forEach((file, index) => {
    const lecture = readJson(path.join(EN_LECTURES_DIR, file));
    translateMany(collectLectureStrings(lecture));
    const translated = translateLecture(lecture);
    writeJson(path.join(ES_LECTURES_DIR, file), translated);
    console.log(`[${index + 1}/${pendingFiles.length}] ${lecture.slug}`);
  });

  console.log(`Lectures translated: ${pendingFiles.length}`);
}

function main() {
  ensureDir(ES_ROOT);
  translateTopics();
  translateLectures();
  saveCache();
}

main();
