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

Wire a disposable Redis service into CI in a separate workflow change. The snippet below is ready
to apply and changes nothing else. It has not run in CI yet: the first run is its test, so check
that the log reports the suite's tests as passed and not skipped. The `static` job gets a service
container (so the server is exactly 7.2) and one step; the runner only needs the client tool.

```yaml
  static:
    services:
      redis:
        image: redis:7.2
        ports: ['16389:6379']
        options: >-
          --health-cmd "redis-cli ping" --health-interval 2s --health-timeout 2s --health-retries 15
    steps:
      # ...the existing steps, then:
      - name: Redis conformance
        run: |
          sudo apt-get update && sudo apt-get install -y redis-tools
          redis-cli -p 16389 -2 --json ping
          redis-cli -p 16389 info server | grep -E '^redis_version:7\.2\.'
          REDIS_CONFORMANCE_URL=redis://127.0.0.1:16389 npm test -- tests/unit/experiment/redis-conformance.test.ts
```

The two checks before the test fail the step early if the client lacks `--json` (a client older than
7.0) or the server is not a 7.2 release. The container is disposable, so the test's own cleanup is
a courtesy there, not a requirement.

## Staging checklist

- Execute the exact scripts through Upstash REST with the intended writer and
  read-only credentials. Verify reply types and isolation with overlapping
  requests and a lost response.
- Check `PTTL` and `PEXPIRETIME` in scripts, including expiry at the
  boundary, and `SET NX PXAT`, `SET XX KEEPTTL` and `EXPIRE NX`. (The scripts do not call `TIME`;
  only the test wrapper does.) Verify that
  the packed claim retains its entry expiry and that legacy claims share it.
- Verify the nine-key entry and later scripts on the target topology and confirm
  multi-field `HSET` and safe-integer results. The keys carry no hash tag, so on a clustered
  database they would sit in different slots and the script would be refused (`CROSSSLOT`); run
  one entry and one later batch and confirm they are accepted, and if not, the keys need a common
  hash tag in a new namespace.
- If the database is Global, measure replica lag for the read-only token after
  closure and confirm the writer immediately refuses further events. Measure
  billing including script calls, transaction wrappers and any replica writes.
- Ensure older writers cannot overlap this writer in the same namespace (see the runbook, "Before
  the first live write").
- With a Global database, check that the incremental static regeneration of `/v/a`, `/v/b` and
  `/experiment/data.json` runs once globally and not once per region. It sets the page-read budget
  (`MONTHLY_PAGE_READ_BUDGET`); if each region regenerates separately, the monthly page reads
  multiply by the number of regions and the command budget no longer holds.
