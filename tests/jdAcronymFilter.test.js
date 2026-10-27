import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unknownAcronyms } from '../shared/jdTerms.js';

// Text copied from a careers page: menus and buttons in capitals around the real JD.
const page = `SAVED JOBS
SIGN IN
BACK TO SEARCH
Software Developer
APPLY NOW
Join IQVIA and help build healthcare software. Join us to see more jobs.
You will build Python services and keep them compliant with GDPR and HIPAA.
Experience with an SDK is a plus.
LEARN MORE
SEE MORE JOBS`;

test('menu/button words and the company name are not missing skills', () => {
  const got = unknownAcronyms(page, { companyName: 'IQVIA' });
  for (const w of ['SAVED', 'SIGN', 'BACK', 'APPLY', 'NOW', 'LEARN', 'MORE', 'SEE', 'JOIN', 'JOBS', 'IN', 'TO', 'IQVIA']) {
    assert.ok(!got.includes(w), `${w} should be filtered`);
  }
  assert.deepEqual(got, ['GDPR', 'HIPAA', 'SDK']);
});

test('plain words in capitals inside a sentence are skipped too', () => {
  assert.deepEqual(unknownAcronyms('Please APPLY today. Knowledge of GDPR required.'), ['GDPR']);
});
