# AI agent

Standalone C++ AI agent for the Tetris game engine. It currently contains the
board rules and an Easy agent that performs a one-piece greedy search.

The board behavior mirrors the TypeScript backend:

- 20 rows x 10 columns
- the same seven tetromino shapes
- SRS wall kicks (180-degree rotation has no kicks)
- collision, ghost, lock and line-clear rules
- three-corner T-Spin detection
- garbage rows with server-provided hole columns

## Build and test

The configure step downloads `nlohmann/json` at the version pinned in
`CMakeLists.txt`.

```sh
cmake -S apps/ai-agent -B build/ai-agent -DCMAKE_BUILD_TYPE=Release
cmake --build build/ai-agent --parallel
ctest --test-dir build/ai-agent --output-on-failure
```

## Benchmark AI models

`ai_benchmark` runs complete games without the browser or backend. Every game
uses the backend-compatible seeded 7-bag, so different models can be compared
with exactly the same piece sequences.

```sh
# Human-readable result for seeds 42..61
./build/ai-agent/ai_benchmark \
  --model easy --games 20 --seed 42 --max-pieces 5000 --jobs 4

# Machine-readable output for later comparison
./build/ai-agent/ai_benchmark \
  --model easy --games 100 --seed 42 --max-pieces 10000 \
  --jobs 4 --format csv > easy.csv

./build/ai-agent/ai_benchmark \
  --model easy --games 10 --seed 42 --max-pieces 5000 \
  --format json > easy.json
```

For a color terminal preview, run one worker and choose the delay applied after
each placed piece. A zero delay renders as fast as the model can decide.

```sh
./build/ai-agent/ai_benchmark \
  --model easy --games 1 --seed 42 --max-pieces 5000 \
  --jobs 1 --preview --delay-ms 100
```

Preview output is intentionally limited to the table format because ANSI color
codes would corrupt JSON or CSV output.

The result contains, for each seed:

- cleared lines, score, and placed pieces;
- Single/Double/Triple/Tetris, T-Spin, and Perfect Clear counts;
- game-over, piece-cap, and invalid-decision status;
- total and per-decision execution time.

The table and JSON formats also report mean, median, min, max, standard
deviation, and p95. `CAPPED` means that the model survived the requested
`--max-pieces`; its line and score values are lower bounds, not game-over
results. Use the same `--seed`, `--games`, and `--max-pieces` for fair model
comparisons. Timing comparisons should normally use `--jobs 1` to avoid CPU
contention.

Scoring follows the authoritative backend implementation in
`apps/backend/src/game/engine/garbage.ts`. The current frontend has a separate
score calculation with B2B and a different Perfect Clear bonus, so its displayed
score can differ even when the board and cleared-line count are identical.

Useful commands:

```sh
./build/ai-agent/ai_benchmark --list-models
./build/ai-agent/ai_benchmark --help
```

To add a model, implement the `tetris::Agent` interface in
`include/tetris/agent.hpp`, then register its name in `src/agent.cpp`. The
benchmark creates a fresh agent instance for each game, which makes parallel
runs safe as long as a model does not use shared mutable global state.

## JSON Lines protocol

The agent writes one JSON object per line to stdout. Logs must be written to
stderr so they never corrupt the protocol.

It first reports readiness:

```json
{"version":1,"type":"ready","difficulty":"easy"}
```

A decision request contains the locked board and current piece. Board rows may
be arrays in the same format as TypeScript (`null`, `"I"`, `"GARBAGE"`, etc.),
or ten-character strings using `.` for empty and `#` for garbage.

```json
{"version":1,"type":"decide","requestId":"move-1","board":["..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","....######"],"piece":"I","spawn":{"x":3,"y":0,"rotation":0}}
```

The response contains a reachable operation sequence ending in `hard_drop`:

```json
{"version":1,"type":"decision","requestId":"move-1","gameOver":false,"placement":{"x":0,"y":19,"rotation":0},"score":0.0,"linesCleared":1,"actions":["move_left","move_left","move_left","hard_drop"]}
```

Send `{"type":"shutdown"}` to stop the worker cleanly.
