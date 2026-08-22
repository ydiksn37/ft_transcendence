import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import {
  ClientEvent,
  MINO_COLORS,
  ServerEvent,
  TETROMINO_SHAPES,
  type AiAgentModel,
  type AiPreviewStatus,
  type Cell,
  type GameState,
  type TetrominoType,
} from "@transcendence/shared";
import "./AiPreviewPage.css";

const EMPTY_BOARD: Cell[][] = Array.from({ length: 40 }, () =>
  Array<Cell>(10).fill(null),
);

const SPEEDS = [
  { label: "INF", value: 0 },
  { label: "FAST", value: 25 },
  { label: "NORMAL", value: 100 },
  { label: "SLOW", value: 250 },
] as const;

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function MiniPiece({ piece }: { piece: TetrominoType | null }) {
  const occupied = new Set(
    piece
      ? TETROMINO_SHAPES[piece][0].map(([row, col]) => cellKey(row, col))
      : [],
  );
  return (
    <div className="ai-preview-mini-grid" aria-label={piece ?? "empty"}>
      {Array.from({ length: 16 }, (_, index) => {
        const row = Math.floor(index / 4);
        const col = index % 4;
        const filled = piece !== null && occupied.has(cellKey(row, col));
        return (
          <div
            key={index}
            className="ai-preview-mini-cell"
            style={{ background: filled ? MINO_COLORS[piece] : undefined }}
          />
        );
      })}
    </div>
  );
}

function PreviewBoard({ state }: { state: GameState | null }) {
  const board = state?.board ?? EMPTY_BOARD;
  const visibleOffset = Math.max(0, board.length - 20);
  const activeCells = useMemo(() => {
    if (!state) return new Set<string>();
    return new Set(
      TETROMINO_SHAPES[state.activeMino.type][state.activeMino.rotation].map(
        ([row, col]) =>
          cellKey(state.activeMino.y + row, state.activeMino.x + col),
      ),
    );
  }, [state]);
  const ghostCells = useMemo(() => {
    if (!state) return new Set<string>();
    return new Set(
      TETROMINO_SHAPES[state.activeMino.type][state.activeMino.rotation].map(
        ([row, col]) => cellKey(state.ghostY + row, state.activeMino.x + col),
      ),
    );
  }, [state]);

  return (
    <div className="ai-preview-board" aria-label="AI Tetris board">
      {board.slice(visibleOffset).map((row, visibleRow) =>
        row.map((cell, col) => {
          const absoluteRow = visibleRow + visibleOffset;
          const key = cellKey(absoluteRow, col);
          const isActive = activeCells.has(key);
          const isGhost = !isActive && ghostCells.has(key);
          const piece = isActive ? state?.activeMino.type : cell;
          const color =
            piece && piece !== "GARBAGE" ? MINO_COLORS[piece] : undefined;
          return (
            <div
              key={key}
              className={`ai-preview-cell${isGhost ? " ghost" : ""}${
                piece === "GARBAGE" ? " garbage" : ""
              }`}
              style={{ background: isGhost ? undefined : color }}
            />
          );
        }),
      )}
    </div>
  );
}

export default function AiPreviewPage() {
  const navigate = useNavigate();
  const socketRef = useRef<Socket | null>(null);
  const settingsRef = useRef({
    model: "expert" as AiAgentModel,
    thinkTimeMs: 50,
    actionDelayMs: 100,
  });
  const [model, setModel] = useState<AiAgentModel>("expert");
  const [thinkTimeMs, setThinkTimeMs] = useState(50);
  const [actionDelayMs, setActionDelayMs] = useState(100);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [status, setStatus] = useState<AiPreviewStatus | null>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    settingsRef.current = { model, thinkTimeMs, actionDelayMs };
  }, [model, thinkTimeMs, actionDelayMs]);

  const startPreview = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    setGameState(null);
    setError(null);
    setStatus({
      phase: "starting",
      model: settingsRef.current.model,
      actionDelayMs: settingsRef.current.actionDelayMs,
    });
    socket.emit(ClientEvent.START_AI_PREVIEW, settingsRef.current);
  }, []);

  useEffect(() => {
    const socket = io("/", { forceNew: true });
    socketRef.current = socket;
    socket.on("connect", startPreview);
    socket.on(ServerEvent.MATCH_FOUND, (payload: { seed?: number }) => {
      if (typeof payload.seed === "number") setSeed(payload.seed);
    });
    socket.on(ServerEvent.GAME_STATE, (nextState: GameState) => {
      setGameState(nextState);
    });
    socket.on(ServerEvent.AI_PREVIEW_STATUS, (nextStatus: AiPreviewStatus) => {
      setStatus(nextStatus);
      if (nextStatus.phase === "error") {
        setError(nextStatus.message ?? "AI preview failed");
      }
    });
    socket.on(ServerEvent.GAME_OVER, () => {
      setStatus((previous) =>
        previous ? { ...previous, phase: "stopped" } : previous,
      );
    });
    socket.on(ServerEvent.ERROR, (payload: { message?: string }) => {
      setError(payload.message ?? "AI preview failed");
    });
    socket.on("disconnect", () => {
      setStatus((previous) =>
        previous ? { ...previous, phase: "stopped" } : previous,
      );
    });
    return () => {
      socket.emit(ClientEvent.STOP_AI_PREVIEW);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [startPreview]);

  const changeSpeed = (nextDelay: number) => {
    setActionDelayMs(nextDelay);
    settingsRef.current.actionDelayMs = nextDelay;
    socketRef.current?.emit(ClientEvent.SET_AI_PREVIEW_SPEED, {
      actionDelayMs: nextDelay,
    });
  };

  const stopPreview = () => {
    socketRef.current?.emit(ClientEvent.STOP_AI_PREVIEW);
    setStatus((previous) =>
      previous ? { ...previous, phase: "stopped" } : previous,
    );
  };

  return (
    <main className="ai-preview-page">
      <header className="ai-preview-header">
        <button type="button" onClick={() => navigate("/menu")}>
          ← MENU
        </button>
        <div>
          <p className="ai-preview-kicker">TS ENGINE / C++ SEARCH</p>
          <h1>AI PREVIEW</h1>
        </div>
        <span className={`ai-preview-phase ${status?.phase ?? "stopped"}`}>
          {status?.phase ?? "CONNECTING"}
        </span>
      </header>

      <section className="ai-preview-layout">
        <aside className="ai-preview-panel controls">
          <label>
            MODEL
            <select
              value={model}
              onChange={(event) => setModel(event.target.value as AiAgentModel)}
            >
              <option value="easy">EASY</option>
              <option value="hard">HARD</option>
              <option value="expert">EXPERT</option>
            </select>
          </label>
          <label>
            THINK TIME
            <div className="ai-preview-number-input">
              <input
                type="number"
                min={1}
                max={5000}
                value={thinkTimeMs}
                onChange={(event) =>
                  setThinkTimeMs(
                    Math.max(1, Math.min(5000, Number(event.target.value))),
                  )
                }
              />
              <span>ms</span>
            </div>
          </label>
          <fieldset>
            <legend>PLAYBACK</legend>
            <div className="ai-preview-speed-grid">
              {SPEEDS.map((speed) => (
                <button
                  key={speed.value}
                  type="button"
                  className={actionDelayMs === speed.value ? "active" : ""}
                  onClick={() => changeSpeed(speed.value)}
                >
                  {speed.label}
                </button>
              ))}
            </div>
          </fieldset>
          <button className="primary" type="button" onClick={startPreview}>
            RESTART
          </button>
          <button type="button" onClick={stopPreview}>
            STOP
          </button>
          {error && <p className="ai-preview-error">{error}</p>}
        </aside>

        <div className="ai-preview-board-frame">
          <PreviewBoard state={gameState} />
          {gameState?.isGameOver && (
            <div className="ai-preview-game-over">GAME OVER</div>
          )}
        </div>

        <aside className="ai-preview-panel stats">
          <div className="ai-preview-piece-panel">
            <span>HOLD</span>
            <MiniPiece piece={gameState?.holdMino ?? null} />
          </div>
          <div className="ai-preview-piece-panel next">
            <span>NEXT</span>
            {(gameState?.nextMinos ?? []).slice(0, 5).map((piece, index) => (
              <MiniPiece key={`${piece}-${index}`} piece={piece} />
            ))}
          </div>
          <dl>
            <div>
              <dt>SCORE</dt>
              <dd>{gameState?.score.toLocaleString() ?? 0}</dd>
            </div>
            <div>
              <dt>LINES</dt>
              <dd>{gameState?.lines ?? 0}</dd>
            </div>
            <div>
              <dt>APM</dt>
              <dd>{gameState?.apm ?? 0}</dd>
            </div>
            <div>
              <dt>PPS</dt>
              <dd>{gameState?.pps ?? 0}</dd>
            </div>
            <div>
              <dt>B2B</dt>
              <dd>{gameState?.b2b ?? 0}</dd>
            </div>
            <div>
              <dt>DEPTH</dt>
              <dd>{status?.completedDepth ?? "-"}</dd>
            </div>
            <div>
              <dt>NODES</dt>
              <dd>{status?.nodesVisited?.toLocaleString() ?? "-"}</dd>
            </div>
            <div>
              <dt>DECISION</dt>
              <dd>{status?.decisionMs ? `${status.decisionMs} ms` : "-"}</dd>
            </div>
            <div>
              <dt>SEED</dt>
              <dd>{seed ?? "-"}</dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  );
}
