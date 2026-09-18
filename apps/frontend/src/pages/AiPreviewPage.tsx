import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import {
  ClientEvent,
  ServerEvent,
  TETROMINO_SHAPES,
  type AiAgentModel,
  type AiPreviewMode,
  type AiPreviewPlayerState,
  type AiPreviewSide,
  type AiPreviewStatus,
  type GameState,
  type TetrominoType,
} from "@transcendence/shared";
import { TetrisUI } from "../components/UI/TetrisUI";
import type { Player } from "../hooks/usePlayer";
import { createStage, type Cell as StageCell } from "../utils/gameHelpers";
import "./AiPreviewPage.css";

const SPEEDS = [
  { label: "INF", value: 0 },
  { label: "FAST", value: 25 },
  { label: "NORMAL", value: 100 },
  { label: "SLOW", value: 250 },
] as const;

const MODELS: AiAgentModel[] = ["easy", "hard", "expert"];
const CELL_COLORS: Record<string, string> = {
  I: "#32d9ff",
  O: "#ffe14d",
  T: "#b85cff",
  S: "#55e66b",
  Z: "#ff5267",
  J: "#4b79ff",
  L: "#ff9a3d",
  GARBAGE: "#777",
};

const EMPTY_PLAYER: Player = {
  pos: { x: 0, y: 18 },
  tetromino: [[0]],
  collided: false,
  rotationIndex: 0,
  spawnCount: 0,
};

function boardToStage(board: GameState["board"]): StageCell[][] {
  return board.map((row) =>
    row.map((cell) =>
      [
        cell === null ? 0 : cell === "GARBAGE" ? "B" : cell,
        cell === null ? "clear" : "merged",
      ] as StageCell,
    ),
  );
}

function pieceMatrix(
  type: TetrominoType,
  rotation: 0 | 1 | 2 | 3,
): (string | number)[][] {
  const size = type === "I" ? 4 : type === "O" ? 2 : 3;
  const matrix = Array.from({ length: size }, () =>
    Array<string | number>(size).fill(0),
  );
  for (const [row, col] of TETROMINO_SHAPES[type][rotation]) {
    matrix[row][col] = type;
  }
  return matrix;
}

function stateToPlayer(state: GameState | null): Player {
  if (!state) return EMPTY_PLAYER;
  return {
    pos: { x: state.activeMino.x, y: state.activeMino.y },
    tetromino: pieceMatrix(state.activeMino.type, state.activeMino.rotation),
    collided: false,
    rotationIndex: state.activeMino.rotation,
    spawnCount: 0,
  };
}

function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds
    .toString()
    .padStart(3, "0")}`;
}

function initialPreviewMode(): AiPreviewMode {
  return new URLSearchParams(window.location.search).get("mode") === "versus"
    ? "versus"
    : "solo";
}

function previewCells(state: GameState | null): (string | null)[][] {
  if (!state) return Array.from({ length: 20 }, () => Array(10).fill(null));
  const cells = state.board.slice(-20).map((row) => [...row]);
  if (!state.isGameOver) {
    const active = state.activeMino;
    for (const [rowOffset, colOffset] of
      TETROMINO_SHAPES[active.type][active.rotation]) {
      const row = active.y + rowOffset - 20;
      const col = active.x + colOffset;
      if (row >= 0 && row < 20 && col >= 0 && col < 10) {
        cells[row][col] = active.type;
      }
    }
  }
  return cells;
}

function MiniPiece({ type }: { type: TetrominoType | null }) {
  if (!type) return <div className="ai-preview-mini-piece empty">-</div>;
  const matrix = pieceMatrix(type, 0);
  return (
    <div
      className="ai-preview-mini-piece"
      style={{ gridTemplateColumns: `repeat(${matrix[0].length}, 8px)` }}
    >
      {matrix.flatMap((row, rowIndex) =>
        row.map((cell, colIndex) => (
          <span
            key={`${rowIndex}-${colIndex}`}
            style={{
              background: cell === 0 ? "transparent" : CELL_COLORS[type],
            }}
          />
        )),
      )}
    </div>
  );
}

function AiBattleBoard({
  side,
  model,
  state,
  status,
  winner,
}: {
  side: AiPreviewSide;
  model: AiAgentModel;
  state: GameState | null;
  status?: AiPreviewStatus;
  winner: AiPreviewSide | null;
}) {
  const cells = previewCells(state);
  const result = winner ? (winner === side ? "WIN" : "LOSE") : null;
  return (
    <section className={`ai-preview-battle-board ${side}`}>
      <header>
        <span>{side === "left" ? "AI A" : "AI B"}</span>
        <strong>{model.toUpperCase()}</strong>
        <small>{status?.phase ?? "WAITING"}</small>
      </header>
      <div className="ai-preview-battle-content">
        <aside>
          <label>HOLD</label>
          <MiniPiece type={state?.holdMino ?? null} />
          <label>GARBAGE</label>
          <b>{state?.garbageQueue ?? 0}</b>
        </aside>
        <div className="ai-preview-board-grid">
          {cells.flatMap((row, rowIndex) =>
            row.map((cell, colIndex) => (
              <span
                key={`${rowIndex}-${colIndex}`}
                className={cell ? "filled" : ""}
                style={{ background: cell ? CELL_COLORS[cell] : undefined }}
              />
            )),
          )}
          {result && (
            <div className={`ai-preview-result ${result.toLowerCase()}`}>
              {result}
            </div>
          )}
        </div>
        <aside>
          <label>NEXT</label>
          {(state?.nextMinos ?? []).slice(0, 5).map((piece, index) => (
            <MiniPiece key={`${piece}-${index}`} type={piece} />
          ))}
        </aside>
      </div>
      <dl>
        <div><dt>APM</dt><dd>{state?.apm ?? 0}</dd></div>
        <div><dt>PPS</dt><dd>{state?.pps ?? 0}</dd></div>
        <div><dt>B2B</dt><dd>{state?.b2b ?? 0}</dd></div>
        <div><dt>LINES</dt><dd>{state?.lines ?? 0}</dd></div>
        <div><dt>DEPTH</dt><dd>{status?.completedDepth ?? "-"}</dd></div>
        <div><dt>MS</dt><dd>{status?.decisionMs ?? "-"}</dd></div>
      </dl>
    </section>
  );
}

export default function AiPreviewPage() {
  const navigate = useNavigate();
  const initialMode = initialPreviewMode();
  const socketRef = useRef<Socket | null>(null);
  const settingsRef = useRef({
    mode: initialMode,
    model: "expert" as AiAgentModel,
    opponentModel: "hard" as AiAgentModel,
    thinkTimeMs: 50,
    actionDelayMs: 100,
  });
  const [mode, setMode] = useState<AiPreviewMode>(initialMode);
  const [model, setModel] = useState<AiAgentModel>("expert");
  const [opponentModel, setOpponentModel] = useState<AiAgentModel>("hard");
  const [thinkTimeMs, setThinkTimeMs] = useState(50);
  const [actionDelayMs, setActionDelayMs] = useState(100);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [opponentState, setOpponentState] = useState<GameState | null>(null);
  const [status, setStatus] = useState<AiPreviewStatus | null>(null);
  const [sideStatus, setSideStatus] = useState<
    Partial<Record<AiPreviewSide, AiPreviewStatus>>
  >({});
  const [seed, setSeed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [winnerSide, setWinnerSide] = useState<AiPreviewSide | null>(null);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);

  useEffect(() => {
    settingsRef.current = {
      mode,
      model,
      opponentModel,
      thinkTimeMs,
      actionDelayMs,
    };
  }, [mode, model, opponentModel, thinkTimeMs, actionDelayMs]);

  const startPreview = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    setGameState(null);
    setOpponentState(null);
    setGameOver(false);
    setWinnerSide(null);
    setSideStatus({});
    setError(null);
    setStatus({
      phase: "starting",
      model: settingsRef.current.model,
      mode: settingsRef.current.mode,
      actionDelayMs: settingsRef.current.actionDelayMs,
    });
    socket.emit(ClientEvent.START_AI_PREVIEW, settingsRef.current);
  }, []);

  const changeMode = useCallback(
    (nextMode: AiPreviewMode) => {
      settingsRef.current = { ...settingsRef.current, mode: nextMode };
      setMode(nextMode);
      startPreview();
    },
    [startPreview],
  );

  const changeModel = useCallback(
    (side: AiPreviewSide, nextModel: AiAgentModel) => {
      if (side === "left") {
        settingsRef.current = { ...settingsRef.current, model: nextModel };
        setModel(nextModel);
      } else {
        settingsRef.current = {
          ...settingsRef.current,
          opponentModel: nextModel,
        };
        setOpponentModel(nextModel);
      }
      startPreview();
    },
    [startPreview],
  );

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
    socket.on(
      ServerEvent.AI_PREVIEW_STATE,
      (payload: AiPreviewPlayerState) => {
        if (payload.side === "left") setGameState(payload.state);
        else setOpponentState(payload.state);
      },
    );
    socket.on(ServerEvent.AI_PREVIEW_STATUS, (nextStatus: AiPreviewStatus) => {
      setStatus(nextStatus);
      if (nextStatus.side) {
        setSideStatus((previous) => ({
          ...previous,
          [nextStatus.side as AiPreviewSide]: nextStatus,
        }));
      }
      if (nextStatus.phase === "error") {
        setError(nextStatus.message ?? "AI preview failed");
      }
    });
    socket.on(
      ServerEvent.GAME_OVER,
      (payload: { winnerSide?: AiPreviewSide }) => {
        setGameOver(true);
        setWinnerSide(payload.winnerSide ?? null);
        setStatus((previous) =>
          previous ? { ...previous, phase: "stopped" } : previous,
        );
      },
    );
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

  const stopPreview = useCallback(() => {
    socketRef.current?.emit(ClientEvent.STOP_AI_PREVIEW);
    setStatus((previous) =>
      previous ? { ...previous, phase: "stopped" } : previous,
    );
  }, []);

  const quitPreview = useCallback(() => {
    stopPreview();
    socketRef.current?.disconnect();
    socketRef.current = null;
    navigate("/menu");
  }, [navigate, stopPreview]);

  const stage = useMemo(
    () => (gameState ? boardToStage(gameState.board) : createStage(10)),
    [gameState],
  );
  const player = useMemo(() => stateToPlayer(gameState), [gameState]);

  const renderControlPanel = (mobile = false) => (
    <section className={`ai-preview-controls${mobile ? " mobile" : ""}`}>
      <div className="ai-preview-control-heading">
        <div>
          <span>TS ENGINE / C++ SEARCH</span>
          <strong>AI SETTINGS</strong>
        </div>
        <span className={`ai-preview-phase ${status?.phase ?? "stopped"}`}>
          {status?.phase ?? "CONNECTING"}
        </span>
        {mobile && (
          <button
            type="button"
            className="ai-preview-close"
            onClick={() => setMobileControlsOpen(false)}
            aria-label="Close AI settings"
          >
            ×
          </button>
        )}
      </div>

      <fieldset>
        <legend>MODE</legend>
        <div className="ai-preview-mode-grid">
          <button
            type="button"
            className={mode === "solo" ? "active" : ""}
            onClick={() => changeMode("solo")}
          >
            SOLO
          </button>
          <button
            type="button"
            className={mode === "versus" ? "active" : ""}
            onClick={() => changeMode("versus")}
          >
            VERSUS
          </button>
        </div>
      </fieldset>

      <label>
        {mode === "versus" ? "AI A MODEL" : "MODEL"}
        <select
          value={model}
          onChange={(event) =>
            changeModel("left", event.target.value as AiAgentModel)
          }
        >
          {MODELS.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate.toUpperCase()}
            </option>
          ))}
        </select>
      </label>

      {mode === "versus" && (
        <label>
          AI B MODEL
          <select
            value={opponentModel}
            onChange={(event) =>
              changeModel("right", event.target.value as AiAgentModel)
            }
          >
            {MODELS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      )}

      <label>
        THINK TIME
        <span className="ai-preview-number-input">
          <input
            type="number"
            min={1}
            max={5000}
            value={thinkTimeMs}
            onChange={(event) =>
              setThinkTimeMs(
                Math.max(1, Math.min(5000, Number(event.target.value) || 1)),
              )
            }
          />
          <span>ms</span>
        </span>
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

      <div className="ai-preview-actions">
        <button className="primary" type="button" onClick={startPreview}>
          RESTART
        </button>
        <button type="button" onClick={stopPreview}>
          STOP
        </button>
        <button type="button" onClick={quitPreview}>
          MENU
        </button>
      </div>

      <dl className="ai-preview-search-stats">
        <div><dt>APM</dt><dd>{gameState?.apm ?? 0}</dd></div>
        <div><dt>PPS</dt><dd>{gameState?.pps ?? 0}</dd></div>
        <div><dt>B2B</dt><dd>{gameState?.b2b ?? 0}</dd></div>
        <div>
          <dt>DEPTH</dt>
          <dd>{sideStatus.left?.completedDepth ?? status?.completedDepth ?? "-"}</dd>
        </div>
        <div>
          <dt>NODES</dt>
          <dd>
            {(sideStatus.left?.nodesVisited ?? status?.nodesVisited)?.toLocaleString() ?? "-"}
          </dd>
        </div>
        <div>
          <dt>DECISION</dt>
          <dd>
            {(sideStatus.left?.decisionMs ?? status?.decisionMs) !== undefined
              ? `${sideStatus.left?.decisionMs ?? status?.decisionMs} ms`
              : "-"}
          </dd>
        </div>
        <div className="wide"><dt>SEED</dt><dd>{seed ?? "-"}</dd></div>
      </dl>
      {error && <p className="ai-preview-error">{error}</p>}
    </section>
  );

  if (mode === "versus") {
    return (
      <main className="ai-preview-game-shell ai-preview-versus-shell">
        <div className="ai-preview-versus-layout">
          <div className="ai-preview-versus-controls">
            {renderControlPanel()}
          </div>
          <div className="ai-preview-arena">
            <AiBattleBoard
              side="left"
              model={model}
              state={gameState}
              status={sideStatus.left}
              winner={winnerSide}
            />
            <div className="ai-preview-vs-mark">
              <strong>VS</strong>
              <span>SEED {seed ?? "-"}</span>
              {gameOver && <small>MATCH OVER</small>}
            </div>
            <AiBattleBoard
              side="right"
              model={opponentModel}
              state={opponentState}
              status={sideStatus.right}
              winner={winnerSide}
            />
          </div>
        </div>

        <button
          type="button"
          className="ai-preview-mobile-toggle"
          onClick={() => setMobileControlsOpen(true)}
        >
          AI SETTINGS
        </button>
        {mobileControlsOpen && renderControlPanel(true)}
      </main>
    );
  }

  return (
    <main className="ai-preview-game-shell">
      <TetrisUI
        stage={stage}
        player={player}
        gameOver={gameOver}
        gameMode="AI_PREVIEW"
        score={gameState?.score ?? 0}
        level={gameState?.level ?? 1}
        lines={gameState?.lines ?? 0}
        combo={gameState?.combo ?? -1}
        nextPieceKeys={gameState?.nextMinos ?? []}
        holdInfo={{
          tetromino: gameState?.holdMino ?? null,
          hasHeld: gameState ? !gameState.canHold : false,
        }}
        isWaiting={false}
        connectionError={null}
        matchResult={null}
        opponentStage={null}
        opponentScore={0}
        pendingGarbage={[]}
        actionText={null}
        lockEvent={null}
        countdown={null}
        finalTime={null}
        elapsedTime={0}
        piecesPlaced={0}
        attackLines={0}
        socketRef={socketRef}
        setSocket={(nextSocket) => { socketRef.current = nextSocket; }}
        setIsWaiting={() => undefined}
        setDropTime={() => undefined}
        formatTime={formatTime}
        createStage={createStage}
        appState="PLAYING"
        restartGame={startPreview}
        onHold={() => undefined}
        onQuit={quitPreview}
        extraLeftPanel={renderControlPanel()}
        ghostYOverride={gameState?.ghostY}
      />

      <button
        type="button"
        className="ai-preview-mobile-toggle"
        onClick={() => setMobileControlsOpen(true)}
      >
        AI SETTINGS
      </button>
      {mobileControlsOpen && renderControlPanel(true)}
    </main>
  );
}
