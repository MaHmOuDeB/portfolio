# Redis conformance

Use a disposable standalone Redis 7.2.x on loopback with persistence disabled. The
test creates uniquely prefixed keys and removes them on completion. The URL must
use a loopback host and explicit port. The test uses `redis-cli` from PATH, or
`REDIS_CONFORMANCE_CLI` if supplied.

```sh
redis-server --bind 127.0.0.1 --port 16389 --save '' --appendonly no
# In another terminal:
REDIS_CONFORMANCE_URL=redis://127.0.0.1:16389 npm test -- tests/unit/experiment/redis-conformance.test.ts
```

Without the URL, Vitest skips the standalone suite and names the variable that
enables it. The in-memory atomic-store suite still runs. The standalone suite
runs the same ownership, expiry, prerequisite, overlap, corruption and overflow
scenarios against the model and Redis. It compares replies and state. Boundary
cases set the expiry relative to Redis' frozen script time. For the partial-write
cases, the test injects errors at the Redis call boundary inside the script.

Wire a disposable Redis service into CI in a separate workflow change.

## Staging checklist

- Execute the exact scripts through Upstash REST with the intended writer and
  read-only credentials. Verify reply types and isolation with overlapping
  requests and a lost response.
- Check `TIME`, `PTTL` and `PEXPIRETIME` in scripts, including expiry at the
  boundary, and `SET NX PXAT`, `SET XX KEEPTTL` and `EXPIRE NX`. Verify that
  the packed claim retains its entry expiry and that legacy claims share it.
- Verify the nine-key entry and later scripts on the target topology and confirm
  multi-field `HSET` and safe-integer results. Cluster slot rules may differ.
- If the database is Global, measure replica lag for the read-only token after
  closure and confirm the writer immediately refuses further events. Measure
  billing including script calls, transaction wrappers and any replica writes.
- Ensure older writers cannot overlap this writer in the same namespace.
