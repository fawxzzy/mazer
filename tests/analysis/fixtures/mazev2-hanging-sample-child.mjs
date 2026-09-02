const CONTRACT_VERSION = 'mazev2-convergence-sample-child-v1';

if (process.send === undefined) {
  throw new Error('The hanging sample fixture requires an IPC channel.');
}

process.once('message', (message) => {
  if (message?.contractVersion !== CONTRACT_VERSION || message?.type !== 'start') {
    process.exitCode = 1;
    process.disconnect();
    return;
  }
  // Deliberately simulate a synchronous CPU-bound generator. Only terminating
  // the child process can interrupt this loop.
  for (;;) {
    // Intentionally empty.
  }
});

process.send({ contractVersion: CONTRACT_VERSION, type: 'ready' });
