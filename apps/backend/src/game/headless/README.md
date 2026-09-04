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

## Web AI preview

`/ai-preview` uses the same JSON Lines process adapter. The backend owns the
40-row board, seven-bag, hold, scoring, line clears, T-Spin detection, garbage,
and game-over rules. All 40 rows, including the vanish-zone buffer, and the TS
internal spawn row (`y = 18`) are sent to C++. C++ returns an `actions` array
and the backend replays each action through `GameInstance.applyInput`,
broadcasting a new `game:state` after every successful movement.

Start the Docker services once. This also creates the development AI binary:

```sh
make up
```

After changing C++, compile only the mounted Alpine binary; no backend image
rebuild or restart is needed for a newly started preview:

```sh
make ai-web-build
```

Then start a new match on `/ai-preview`. An already running preview keeps its
existing C++ process. For VS AI, use `make ai-web-restart`, because those agents
are started with the backend. `INF` sets the delay between returned actions to
zero; search still respects the configured think-time budget.

The AI preview settings provide two modes:

- `SOLO` runs one selectable C++ model against an empty opponent state.
- `VERSUS` runs two independently selectable C++ models. TypeScript owns both
  boards and sends attacks between them; each agent receives its opponent's
  board and queued garbage in every decision request.

The two versus players use independent seven-bags initialized from the same
match seed, so process timing cannot consume or reorder the other player's
Next queue. `/ai-preview?mode=versus` opens the page directly in versus mode.
After changing only C++, run `make ai-web-build` and press `RESTART`; neither a
Docker image rebuild nor a backend restart is required.

The report includes wins/losses/draws, attack and lines per piece, average
decision time, Tetris/T-Spin counts, and maximum B2B. A match that reaches the
per-player piece cap without a top-out is a draw.
