import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import {
  ClientEvent,
  ServerEvent,
  TETROMINO_SHAPES,
  type AiAgentModel,
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
  const [gameOver, setGameOver] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);

  useEffect(() => {
    settingsRef.current = { model, thinkTimeMs, actionDelayMs };
  }, [model, thinkTimeMs, actionDelayMs]);

  const startPreview = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    setGameState(null);
    setGameOver(false);
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
      setGameOver(true);
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
      </div>

      <dl className="ai-preview-search-stats">
        <div><dt>APM</dt><dd>{gameState?.apm ?? 0}</dd></div>
        <div><dt>PPS</dt><dd>{gameState?.pps ?? 0}</dd></div>
        <div><dt>B2B</dt><dd>{gameState?.b2b ?? 0}</dd></div>
        <div><dt>DEPTH</dt><dd>{status?.completedDepth ?? "-"}</dd></div>
        <div><dt>NODES</dt><dd>{status?.nodesVisited?.toLocaleString() ?? "-"}</dd></div>
        <div>
          <dt>DECISION</dt>
          <dd>{status?.decisionMs !== undefined ? `${status.decisionMs} ms` : "-"}</dd>
        </div>
        <div className="wide"><dt>SEED</dt><dd>{seed ?? "-"}</dd></div>
      </dl>
      {error && <p className="ai-preview-error">{error}</p>}
    </section>
  );

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
