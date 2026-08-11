# AI agent

Standalone C++ AI agent for the Tetris game engine. It currently contains the
board rules and an Easy agent that performs a one-piece greedy search.

The board behavior mirrors the TypeScript backend:

- 20 rows x 10 columns
- the same four tetromino shapes
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
