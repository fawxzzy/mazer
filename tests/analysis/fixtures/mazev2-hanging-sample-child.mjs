const CONTRACT_VERSION = 'mazev2-convergence-sample-child-v1';
const encodedRequest = process.argv.at(-1);

if (process.send === undefined || encodedRequest === undefined) {
  throw new Error('The hanging sample fixture requires an IPC channel.');
}

const request = JSON.parse(Buffer.from(encodedRequest, 'base64url').toString('utf8'));
const sourceIdentity = request.engineId === 'dirty-source-fixture'
  ? { status: 'dirty', commitSha: request.expectedSourceCommitSha }
  : request.engineId === 'mismatched-source-fixture'
    ? { status: 'clean', commitSha: '0000000000000000000000000000000000000000' }
    : { status: 'clean', commitSha: request.expectedSourceCommitSha };

process.once('message', (message) => {
  if (message?.contractVersion !== CONTRACT_VERSION || message?.type !== 'start') {
    process.exitCode = 1;
    process.disconnect();
    return;
  }
  if (request.seed === 1) {
    // Deliberately simulate a synchronous CPU-bound generator. Only terminating
    // the child process can interrupt this loop.
    for (;;) {
      // Intentionally empty.
    }
  }

  process.send({
    contractVersion: CONTRACT_VERSION,
    type: 'result',
    record: {
      engineId: request.engineId,
      recipeName: request.recipe.name,
      lane: request.lane,
      seed: request.seed,
      outcome: 'unsupported',
      errorMessage: 'synthetic completed fixture',
      generationDurationMs: null,
      requestedWidth: request.recipe.width,
      requestedHeight: request.recipe.height,
      realizedWidth: null,
      realizedHeight: null,
      engineNotes: null,
      metrics: null
    }
  }, (error) => {
    if (error !== null) process.exitCode = 1;
    if (process.connected) process.disconnect();
  });
});

process.send({ contractVersion: CONTRACT_VERSION, type: 'ready', sourceIdentity });
