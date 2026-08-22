# AI agent

Standalone C++ AI agent for the Tetris game engine. It contains the shared
board rules plus Easy, Hard, and Expert search models.

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

- cleared lines, score, sent garbage, and placed pieces;
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
while an occupied Hold swaps pieces without consuming Next. All models apply
the current `garbageQueue` after each candidate root placement, matching the
backend's lock ordering. Future opponent attacks are not predicted yet.

Benchmark output includes average/max completed search depth, visited nodes and
the number of decisions that reached the time limit. Since the stopping point
depends on CPU scheduling, time-limited Hard runs are not guaranteed to choose
the same move on every machine even with the same seed. Use the same machine,
`--think-ms`, and `--jobs 1` for performance comparisons.

### Expert model

Expert is an independent C++ model and does not call Cold Clear or another
external AI API. It uses a time-bounded beam search over placements reachable
through the same moves and rotations as the TypeScript backend. Hold and the
known Next queue are searched at every depth.

Unlike Hard, Expert ranks clears using the backend garbage table directly. Its
search state carries B2B status, including the backend's T-Spin Mini and Perfect
Clear behavior. The evaluator combines survival features with Tetris wells and
T-Spin Double setup features. In addition to the original completed-slot
detector, it matches the completed `100/000/101` TSD terrain and its mirror,
then runs the frontend-compatible movement and SRS search from spawn. A slot
receives completed reward only when T can reach it and finish with a real final
rotation; a sealed slot under stacked roof blocks receives no reward. Destroying
a reachable completed slot before firing its TSD also has an explicit penalty.
The preceding `000/101` pattern receives a smaller reward to keep a useful setup
from being pruned before its roof is built. A five-category well-distance
feature favors central wells, and placing a T without a detected T-Spin receives
a small `tWasted` penalty. These three
rewards are 7-bag-aware: the evaluator finds the distance to T in Hold/Next,
values a completed slot most when T is immediately available, and values a
preceding setup most when T is two to four moves away. If T is outside the
visible queue, it keeps a discounted value because the next 7-bag still
guarantees another T. Completed-slot reward saturates after two simultaneous
TSD slots (after one when the board height reaches 12), so a third T-shaped
reservation must justify its ordinary hole and height penalties. TSD receives
an efficiency bonus because it sends Tetris-level garbage with two cleared
lines, while an ordinary clear gets a height-sensitive penalty when it breaks
B2B.

Board stability and attack setup are evaluated separately. Buried holes have
both linear and quadratic penalties, while a low board without holes receives
a clean-board reward. Stability is weighted more heavily as maximum height
rises. At the same time, high stacks discount only unfinished setup and well
rewards; a completed TSD slot keeps its value because it may be an immediate
rescue clear. This prevents a speculative T-Spin setup from outweighing several
buried holes without suppressing an already available attack.

```sh
make ai-run model=expert think_ms=50

./build/ai-agent/ai_benchmark \
  --model expert --games 10 --seed 42 --max-pieces 1000 \
  --jobs 1 --think-ms 50
```

Expert always starts a decision from the server-supplied board. Its returned
operation sequence remains subject to replay by the authoritative game engine.

### Expert weight tuning

`ai_tune` applies the Cross-Entropy Method (CEM) to the Expert evaluation
weights, including board-stability scaling, quadratic holes, the clean-board
reward, completed/preceding TSD patterns, five well-distance categories, and
`tWasted`. Every candidate receives the same piece seeds and a fixed
search-node budget, so fitness comparisons are reproducible and do not depend
on CPU timing. Fitness primarily rewards sent garbage per piece, then survival
and B2B. An independently seeded validation set decides whether sampled weights
are recommended.

```sh
make ai-tune

# Larger search used for a more reliable tuning run
make ai-tune \
  tune_iterations=5 tune_population=10 tune_elite=3 \
  tune_games=4 tune_seed=1000 \
  tune_validation_games=8 tune_validation_seed=2000000 \
  tune_max_pieces=100 tune_max_nodes=8000
```

The command prints the baseline, best training result, holdout validation, and
the recommended weights as JSON. The original defaults were selected from
three optimizer seeds using 50 training and 50 validation seeds. The newly
added TSD-pattern weights start from conservative manual values and must be
retuned on the same split. The complete historical split, results, and final
untouched 100-seed test are recorded in `TUNING.md`.

Use `ai_compare` for a paired Hard/Expert test. It reports the mean same-seed
difference and its 95% confidence interval.

```sh
make ai-compare \
  compare_games=100 compare_seed=3000000 compare_max_pieces=500 \
  compare_jobs=10 think_ms=50
```

## JSON Lines protocol

The agent writes one JSON object per line to stdout. Logs must be written to
stderr so they never corrupt the protocol.

It first reports readiness:

```json
{"version":1,"type":"ready","difficulty":"easy"}
```

A decision request contains one shared `DecisionContext`. Easy, Hard, and
Expert all read `garbageQueue`; Hard and Expert additionally use `next`,
`hold`, `canHold`, and `b2b` for multi-piece search. `combo` and `opponent` are
parsed into the common context for opponent-aware models. `b2b` may be the
backend's numeric chain count or a boolean; `b2bActive` is also accepted. Board
rows may be arrays in the same format as TypeScript (`null`, `"I"`,
`"GARBAGE"`, etc.), or ten-character strings using `.` for empty and `#` for
garbage.

```json
{"version":1,"type":"decide","requestId":"move-1","board":["..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","..........","....######"],"piece":"I","next":["T","O","S","Z","J"],"hold":"L","canHold":true,"b2b":3,"combo":1,"garbageQueue":3,"incomingGarbage":[{"hole":2},{"hole":2},{"hole":7}],"spawn":{"x":3,"y":0,"rotation":0}}
```

`incomingGarbage` is optional. When the backend knows the upcoming hole
columns, it may send them as integers or `{ "hole": N }` objects. With only
`garbageQueue`, the worker uses a deterministic projected hole sequence. The
next request still starts from the server-supplied authoritative board, so an
unknown prediction cannot cause persistent desynchronization. A version-2
request may put these player fields under a `state` object while leaving
`opponent` at the top level.

The response contains a reachable operation sequence ending in `hard_drop`:

```json
{"version":1,"type":"decision","requestId":"move-1","gameOver":false,"placement":{"piece":"I","x":0,"y":19,"rotation":0},"score":0.0,"linesCleared":1,"actions":["move_left","move_left","move_left","hard_drop"]}
```

For diagnostics, the response also reports `inputGarbageQueue`,
`projectedGarbageHoles`, and whether an opponent snapshot was available. These
fields do not change the operation protocol and may be ignored by the backend.

Send `{"type":"shutdown"}` to stop the worker cleanly.

Start a persistent Expert JSON worker with:

```sh
./build/ai-agent/ai_agent --model expert --think-ms 50
```
