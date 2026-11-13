// Gives the worker's event loop one turn so the vitest runner can answer pending RPC calls (MAZER-GOV-009).
// Call it inside a long synchronous loop (about every second of work): a worker that never yields for 60 s ends the run
// with `Timeout calling "onTaskUpdate"` even though every test passed. It does not change what a test asserts.
export const yieldToRunner = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });
