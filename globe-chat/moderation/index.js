// moderation/index.js: decides whether a chat message is harmful by its MEANING.
//
// How it works, in four steps:
//
// 1. EMBED. A small language model (all-MiniLM-L6-v2) turns any sentence into a
//    list of 384 numbers, called an embedding or vector. The model has learned from
//    millions of sentences that ones with similar meaning get similar numbers. So
//    "go jump off a bridge" lands near "go kill yourself", even though they share
//    no words.
//
// 2. COMPARE. When the server starts, every example sentence in examples.js is
//    embedded once. For each new message, we measure how close its vector is to
//    every example's vector with COSINE SIMILARITY: 1 means same meaning,
//    0 means unrelated.
//
// 3. SCORE. For each category we take the TOP_K closest examples and average
//    them. Averaging the closest few, rather than taking only the single closest,
//    means one odd example can't decide the result alone.
//
// 4. DECIDE. A message is blocked only if:
//      - a harmful category scores highest,
//      - it is close enough to count (score >= MIN_SCORE), and
//      - it beats the `safe` score by MARGIN.
//    The margin is why harsh-but-allowed messages ("the president is a liar")
//    get through: they sit near the safe examples too.
//
// Tune MIN_SCORE and MARGIN by running `npm run test:moderation` and comparing results.

const { CATEGORIES } = require('./examples');

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const TOP_K = 3;          // how many nearest examples to average per category
// Chosen by running the test set with many combinations. A lower margin (0.05) catches
// every harmful test message, but it also blocked "as a Black woman this election
// worries me": the model links naming a group with the `hate` examples. 0.07 lets
// that through and misses 2 borderline insults. We chose to accept those misses
// rather than silence people for mentioning who they are.
const MIN_SCORE = 0.25;   // below this, the message isn't close to ANY harmful example
const MARGIN = 0.07;      // how much a harmful category must beat `safe` by

let embedder = null;      // the loaded model
let exampleVectors = [];  // [{ category, text, vector }] for every example sentence
let loading = null;       // the promise from load(), so it only runs once

// Turn sentences into vectors. `normalize: true` scales every vector to length 1,
// which makes cosine similarity a simple dot product.
async function embed(texts) {
  const output = await embedder(texts, { pooling: 'mean', normalize: true });
  return output.tolist();
}

// With length-1 vectors, cosine similarity is: multiply matching numbers and add them up
function cosineSimilarity(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

// Load the model and embed all the examples. The first run downloads the model
// (~23 MB) and caches it, so later starts are fast and work offline.
function load() {
  if (!loading) {
    loading = (async () => {
      // transformers.js is an ES module and this server uses require(), so import it this way
      const { pipeline } = await import('@huggingface/transformers');
      embedder = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });

      const entries = Object.entries(CATEGORIES).flatMap(([category, { examples }]) =>
        examples.map((text) => ({ category, text })));
      const vectors = await embed(entries.map((e) => e.text));
      exampleVectors = entries.map((e, i) => ({ ...e, vector: vectors[i] }));
      console.log(`Moderation ready: ${exampleVectors.length} examples in ${Object.keys(CATEGORIES).length} categories`);
    })();
  }
  return loading;
}

const isReady = () => exampleVectors.length > 0;

// Score one message against every category.
// Returns { scores: { harassment: 0.41, safe: 0.62, ... }, nearest: { text, category, similarity } }
async function score(text) {
  const [vector] = await embed([text]);

  const byCategory = {};
  let nearest = null;
  for (const ex of exampleVectors) {
    const similarity = cosineSimilarity(vector, ex.vector);
    (byCategory[ex.category] ??= []).push(similarity);
    if (!nearest || similarity > nearest.similarity) nearest = { text: ex.text, category: ex.category, similarity };
  }

  const scores = {};
  for (const [category, sims] of Object.entries(byCategory)) {
    const top = sims.sort((a, b) => b - a).slice(0, TOP_K);
    scores[category] = top.reduce((a, b) => a + b, 0) / top.length;
  }
  return { scores, nearest };
}

// The main function the server calls.
// Returns { allowed, category, label, score, safeScore, nearest }
async function moderate(text) {
  // If the model isn't loaded yet (server just started) or failed to load, let the
  // message through and say so in the log. This keeps chat working instead of
  // blocking everyone; the tradeoff is a short window with no checks.
  if (!isReady()) return { allowed: true, category: null, reason: 'model not loaded' };

  const { scores, nearest } = await score(text);
  const safeScore = scores.safe;

  // The highest-scoring harmful category
  const [category, best] = Object.entries(scores)
    .filter(([c]) => c !== 'safe')
    .sort((a, b) => b[1] - a[1])[0];

  const harmful = best >= MIN_SCORE && best - safeScore >= MARGIN;
  return {
    allowed: !harmful,
    category: harmful ? category : null,
    label: harmful ? CATEGORIES[category].label : null,
    score: Number(best.toFixed(3)),
    topHarmful: category,
    safeScore: Number(safeScore.toFixed(3)),
    nearest: { ...nearest, similarity: Number(nearest.similarity.toFixed(3)) },
  };
}

module.exports = { load, moderate, score, isReady, MIN_SCORE, MARGIN };
