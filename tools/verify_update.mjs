import { readFile } from 'node:fs/promises';
import { createHash, createPublicKey, verify } from 'node:crypto';

const [artifact, signatureFile, publicKeyFile, version] = process.argv.slice(2);
if (!version)
  throw new Error(
    'Usage: verify_update.mjs artifact signature public-key version',
  );
const publicLines = Buffer.from(
  (await readFile(publicKeyFile, 'utf8')).trim(),
  'base64',
)
  .toString('utf8')
  .trim()
  .split(/\r?\n/);
const signatureLines = Buffer.from(
  (await readFile(signatureFile, 'utf8')).trim(),
  'base64',
)
  .toString('utf8')
  .trim()
  .split(/\r?\n/);
const publicBytes = Buffer.from(publicLines[1] || '', 'base64');
const signatureBytes = Buffer.from(signatureLines[1] || '', 'base64');
if (
  publicBytes.length !== 42 ||
  signatureBytes.length !== 74 ||
  signatureBytes.subarray(0, 2).toString() !== 'ED'
)
  throw new Error('Invalid update signature format');
if (!publicBytes.subarray(2, 10).equals(signatureBytes.subarray(2, 10)))
  throw new Error(
    'Update signing key does not match the application public key',
  );
const key = createPublicKey({
  key: Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    publicBytes.subarray(10),
  ]),
  format: 'der',
  type: 'spki',
});
const content = await readFile(artifact);
if (
  !verify(
    null,
    createHash('blake2b512').update(content).digest(),
    key,
    signatureBytes.subarray(10),
  )
)
  throw new Error('Update artifact signature verification failed');
const prefix = 'trusted comment: ';
if (!signatureLines[2]?.startsWith(prefix))
  throw new Error('Missing signed release version');
const comment = signatureLines[2].slice(prefix.length);
if (
  !verify(
    null,
    Buffer.concat([signatureBytes.subarray(10), Buffer.from(comment)]),
    key,
    Buffer.from(signatureLines[3] || '', 'base64'),
  )
)
  throw new Error('Update version signature verification failed');
const signedVersion = comment
  .split('\t')
  .find((field) => field.startsWith('version:'))
  ?.slice(8);
if (signedVersion?.replace(/^v/, '') !== version.replace(/^v/, ''))
  throw new Error('Signed version does not match the release version');
console.log('Update signature and version verified.');
