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
- Single/Double/Triple/Tetris, total T-Spin, T-Spin Mini/Single/Double/Triple,
  and Perfect Clear counts;
- Hold count and completed search depth;
- B2B clears, continuations, breaks, current chain, and maximum chain;
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

### Hard model

The Hard model uses a time-bounded beam search. It enumerates reachable
placements with BFS, keeps the best 16 board/Hold states at each completed depth, and
continues through the known Next queue until its per-piece budget expires. An
incomplete depth is discarded, so the agent always returns the best result from
the last fully completed depth.

```sh
make ai-run model=hard think_ms=50

# Benchmark without terminal rendering
./build/ai-agent/ai_benchmark \
  --model hard --games 10 --seed 42 --max-pieces 1000 \
  --jobs 1 --think-ms 50
```

The Hard evaluation explicitly rewards Tetrises, completed T-Spins and Perfect
Clears. It also scores consecutive aligned Tetris wells while strongly
penalizing height, holes, covered-hole depth, bumpiness and dangerous board
height. A completed two-line T-Spin slot receives a potential bonus so its
temporary overhang is not discarded as an ordinary hole before the T piece
arrives. T-Spin Double also receives enough placement reward to beat two
discounted T-Spin Singles, reflecting its stronger garbage output. B2B state is
carried through every beam-search node: T-Spins and Tetrises receive a
continuation bonus, while an ordinary line clear receives a height-sensitive
break penalty. The danger penalty still permits a rescue clear near the top of
the board. The standalone simulator supplies eight known Next pieces. Hold is
searched at every future turn; an empty Hold consumes the first Next piece,
while an occupied Hold swaps pieces without consuming Next. Opponent garbage
prediction is not part of this implementation.

Benchmark output includes average/max completed search depth, visited nodes and
the number of decisions that reached the time limit. Since the stopping point
depends on CPU scheduling, time-limited Hard runs are not guaranteed to choose
the same move on every machine even with the same seed. Use the same machine,
`--think-ms`, and `--jobs 1` for performance comparisons.

## JSON Lines protocol

The agent writes one JSON object per line to stdout. Logs must be written to
stderr so they never corrupt the protocol.

It first reports readiness:

```json
{"version":1,"type":"ready","difficulty":"easy"}
```

A decision request contains the locked board and current piece. Hard also reads
the optional `next`, `hold`, `canHold`, and `b2b` fields for multi-piece search.
`b2b` may be the backend's numeric chain count or a boolean; `b2bActive` is also
accepted. Board rows may be arrays in the same format as TypeScript (`null`,
`"I"`, `"GARBAGE"`, etc.), or ten-character strings using `.` for empty and `#`
for garbage.

```json
{"version":1,"type":"decide","requestId":"move-1","board":["..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","....######"],"piece":"I","next":["T","O","S","Z","J"],"hold":"L","canHold":true,"b2b":3,"spawn":{"x":3,"y":0,"rotation":0}}
```

The response contains a reachable operation sequence ending in `hard_drop`:

```json
{"version":1,"type":"decision","requestId":"move-1","gameOver":false,"placement":{"piece":"I","x":0,"y":19,"rotation":0},"score":0.0,"linesCleared":1,"actions":["move_left","move_left","move_left","hard_drop"]}
```

Send `{"type":"shutdown"}` to stop the worker cleanly.

Start a persistent Hard JSON worker with:

```sh
./build/ai-agent/ai_agent --model hard --think-ms 50
```
