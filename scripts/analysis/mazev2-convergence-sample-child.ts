import { createMazeV2DomainMazeAdapter } from '../../src/domain/mazeV2/adapters/domainMazeAdapter';
import { createMazeV2LegacyRuntimeAdapter } from '../../src/domain/mazeV2/adapters/legacyRuntimeAdapter';
import {
  CONVERGENCE_CHILD_MESSAGE_VERSION,
  runOneSample,
  type ConvergenceSampleChildRequest
} from './mazev2ConvergenceHarness';

const encodedRequest = process.argv.at(-1);
if (encodedRequest === undefined) {
  throw new Error('Missing encoded convergence sample request.');
}
if (process.send === undefined) {
  throw new Error('The convergence sample child requires an IPC channel.');
}

const request = JSON.parse(
  Buffer.from(encodedRequest, 'base64url').toString('utf8')
) as ConvergenceSampleChildRequest;
const adapters = new Map([
  ['legacy-runtime', createMazeV2LegacyRuntimeAdapter()],
  ['domain-maze', createMazeV2DomainMazeAdapter()]
]);
const adapter = adapters.get(request.engineId);
if (adapter === undefined) {
  throw new Error(`Unknown convergence engine: ${request.engineId}`);
}

let started = false;
process.once('message', (message: unknown) => {
  if (started
    || typeof message !== 'object'
    || message === null
    || !('contractVersion' in message)
    || message.contractVersion !== CONVERGENCE_CHILD_MESSAGE_VERSION
    || !('type' in message)
    || message.type !== 'start') {
    process.exitCode = 1;
    process.disconnect();
    return;
  }
  started = true;
  const record = runOneSample(adapter, request.recipe, request.lane, request.seed);
  process.send?.({
    contractVersion: CONVERGENCE_CHILD_MESSAGE_VERSION,
    type: 'result',
    record
  }, (error) => {
    if (error !== null) process.exitCode = 1;
    if (process.connected) process.disconnect();
  });
});

process.send({
  contractVersion: CONVERGENCE_CHILD_MESSAGE_VERSION,
  type: 'ready'
});
