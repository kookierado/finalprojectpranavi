// test.js: runs every test case through the moderator and reports how it did.
//
//   npm run test:moderation
//
// Read the results like this:
//   MISSED       harmful messages that got through (too lenient)
//   FALSE ALARM  allowed messages that were blocked (too strict)
// Lowering MIN_SCORE or MARGIN in index.js catches more harm but causes more false
// alarms. Raising them does the opposite. In a news chat, false alarms silence real
// discussion, so it's worth thinking about which mistake you'd rather make.

const { load, moderate } = require('./index');
const { TEST_CASES } = require('./test-cases');

(async () => {
  await load();

  let correct = 0;
  let missed = 0;
  let falseAlarms = 0;

  for (const tc of TEST_CASES) {
    const r = await moderate(tc.text);
    const got = r.allowed ? 'allow' : 'block';
    const ok = got === tc.expect;
    if (ok) correct++;
    else if (tc.expect === 'block') missed++;
    else falseAlarms++;

    const mark = ok ? 'ok         ' : tc.expect === 'block' ? 'MISSED     ' : 'FALSE ALARM';
    console.log(`${mark}  ${got.padEnd(5)}  ${r.topHarmful.padEnd(10)} ${r.score.toFixed(2)}  safe ${r.safeScore.toFixed(2)}  "${tc.text}"`);
    if (!ok) console.log(`             closest example: "${r.nearest.text}" (${r.nearest.category}, ${r.nearest.similarity})`);
  }

  const total = TEST_CASES.length;
  console.log(`\n${correct}/${total} correct (${Math.round((100 * correct) / total)}%)  ·  ${missed} missed  ·  ${falseAlarms} false alarms`);
})();
