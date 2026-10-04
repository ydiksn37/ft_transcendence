# Headless AI battle

The headless runner uses the backend TypeScript engine as the authoritative
rules implementation. Each C++ agent is started once per match and exchanges
one JSON object per line over stdin/stdout.

Run a match from the repository root:

```sh
make ai-versus versus_model_a=hard versus_model_b=easy \
  versus_games=10 versus_max_pieces=500 think_ms=50
```

Use `versus_format=json` for machine-readable training or evaluation output.
The runner swaps left and right models every match and increments the seed.

Each `decide` request contains the authoritative `board`, current `piece`,
`next`, `hold`, `canHold`, `b2b`, `combo`, queued garbage, spawn position, and
opponent state. The C++ response contains an `actions` array. TypeScript applies
those actions one by one and checks the optional reported placement against the
actual result. Invalid actions, a mismatched placement, timeout, process error,
or spawn collision ends the match as a loss for that agent.

The report includes wins/losses/draws, attack and lines per piece, average
decision time, Tetris/T-Spin counts, and maximum B2B. A match that reaches the
per-player piece cap without a top-out is a draw.
