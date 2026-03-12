import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import type { Color } from 'chessops/types';

import { BoardScene } from './BoardScene';
import {
  applyMoveToSnapshot,
  boardSwatches,
  botDifficultyProfiles,
  chooseBotMove,
  clockPresets,
  createInitialSnapshot,
  defaultLobbySettings,
  getBoardTheme,
  getBotDifficulty,
  getPieceGuideText,
  getPiecePalette,
  getVariantDefinition,
  piecePalettes,
  pieceSets,
  scenePresets,
  sideToColorName,
  type BotDifficultyLevel,
  type ClientMessage,
  type GameSnapshot,
  type LobbySettings,
  type PublicLobbySummary,
  type RematchOption,
  type RoomState,
  type ServerMessage,
  type ServerPrompt,
  type VariantId
} from '../../shared/src';

const STORAGE_KEY = 'chess-party-lan-session';
const VARIANT_OPTIONS: VariantId[] = ['standard', 'chess960', 'king_of_the_hill', 'three_check', 'atomic'];

interface StoredSession {
  sessionToken?: string;
  lobbyId?: string;
  playerName?: string;
  hostJoinPin?: string;
}

type SoloSeatChoice = 'light' | 'dark' | 'random';

interface SoloState {
  playerName: string;
  playerColor: Color;
  botColor: Color;
  botDifficulty: BotDifficultyLevel;
  settings: LobbySettings;
  snapshot: GameSnapshot;
  thinking: boolean;
}

export function App() {
  const [connectionState, setConnectionState] = useState<'connecting' | 'reconnecting' | 'online' | 'offline'>('connecting');
  const [publicLobbies, setPublicLobbies] = useState<PublicLobbySummary[]>([]);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [game, setGame] = useState<GameSnapshot | null>(null);
  const [prompt, setPrompt] = useState<ServerPrompt | null>(null);
  const [message, setMessage] = useState('');
  const [playerName, setPlayerName] = useState('Host');
  const [roomTitle, setRoomTitle] = useState("Nick's Table");
  const [joinName, setJoinName] = useState('Guest');
  const [joinPin, setJoinPin] = useState('');
  const [selectedLobbyId, setSelectedLobbyId] = useState<string>();
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<string>();
  const [previewSnapshot, setPreviewSnapshot] = useState<GameSnapshot>(() => createInitialSnapshot(defaultLobbySettings, 960));
  const [animationMs, setAnimationMs] = useState(0);
  const [storedSession, setStoredSession] = useState<StoredSession>(() => readStoredSession());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenPrompt, setShowFullscreenPrompt] = useState(false);
  const [soloDifficulty, setSoloDifficulty] = useState<BotDifficultyLevel>(4);
  const [soloVariant, setSoloVariant] = useState<VariantId>('standard');
  const [soloSeatChoice, setSoloSeatChoice] = useState<SoloSeatChoice>('light');
  const [soloThemePreset, setSoloThemePreset] = useState<LobbySettings['themePreset']>('study');
  const [soloState, setSoloState] = useState<SoloState | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const latestTextState = useRef('{}');
  const previousPhase = useRef<RoomState['phase'] | undefined>(undefined);
  const reconnectTimerRef = useRef<number | undefined>(undefined);
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const pendingAutoJoinRef = useRef(false);
  const botTurnTimerRef = useRef<number | undefined>(undefined);
  const botTurnKeyRef = useRef('');
  const sessionModeRef = useRef<'landing' | 'online' | 'solo'>('landing');

  useEffect(() => {
    sessionModeRef.current = soloState ? 'solo' : room ? 'online' : 'landing';
  }, [room, soloState]);

  useEffect(() => {
    const connect = () => {
      setConnectionState(reconnectAttemptsRef.current === 0 ? 'connecting' : 'reconnecting');
      const socket = new WebSocket(resolveSocketUrl());
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        reconnectAttemptsRef.current = 0;
        setConnectionState('online');
        sendMessage(socket, { type: 'subscribe_lobbies' });
        const session = readStoredSession();
        setStoredSession(session);
        if (session.lobbyId && session.playerName) {
          pendingAutoJoinRef.current = true;
          sendMessage(socket, {
            type: 'join_room',
            lobbyId: session.lobbyId,
            playerName: session.playerName,
            sessionToken: session.sessionToken
          });
        }
      });

      socket.addEventListener('message', (event) => {
        handleServerMessage(JSON.parse(event.data) as ServerMessage);
      });

      socket.addEventListener('close', () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        setConnectionState('offline');
        if (!shouldReconnectRef.current) return;
        const delay = Math.min(5_000, 400 * 2 ** Math.min(reconnectAttemptsRef.current, 4));
        reconnectAttemptsRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      });
    };

    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (botTurnTimerRef.current) {
        window.clearTimeout(botTurnTimerRef.current);
      }
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (room) {
      setPreviewSnapshot(createInitialSnapshot(room.settings, 960));
    }
  }, [room]);

  useEffect(() => {
    if (room?.phase === 'lobby') {
      setGame(null);
    }
  }, [room?.lobbyId, room?.phase]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      setAnimationMs((current) => current + (now - previous));
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    onFullscreenChange();
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const sessionPhase = soloState ? resolveSoloPhase(soloState.snapshot) : room?.phase;
  const activeSettings = soloState ? soloState.settings : room?.settings ?? defaultLobbySettings;
  const currentSnapshot = soloState ? soloState.snapshot : game ?? previewSnapshot;
  const localColor = soloState ? soloState.playerColor : room ? resolveDisplaySeat(room, activeSettings) : 'white';
  const selectedPiece = currentSnapshot.pieces.find((piece) => piece.square === selectedSquare);
  const variant = getVariantDefinition(activeSettings.variant);
  const localPlayer = room ? currentPlayer(room) : undefined;
  const botProfile = soloState ? getBotDifficulty(soloState.botDifficulty) : undefined;
  const boardMessage = getBoardMessage({
    room,
    game: soloState ? soloState.snapshot : game,
    localColor,
    selectedSquare,
    soloState
  });
  const interactionHint =
    sessionPhase === 'playing'
      ? 'Select a piece, then a highlighted square. Right-drag to orbit. Scroll to zoom.'
      : 'Right-drag to orbit the board. Scroll to zoom.';
  const footerMessage = soloState
    ? `You are ${sideToColorName(localColor)} against Rank ${soloState.botDifficulty} ${botProfile?.name}.`
    : room?.phase === 'playing'
      ? `You are ${sideToColorName(localColor)}.`
      : room?.phase === 'finished'
        ? `Round finished. You played ${sideToColorName(localColor)}.`
        : `Previewing from the ${sideToColorName(localColor).toLowerCase()} seat.`;
  const selectedLobby = selectedLobbyId ? publicLobbies.find((lobby) => lobby.lobbyId === selectedLobbyId) : undefined;
  const joinReady = Boolean(selectedLobby && isJoinableLobby(selectedLobby) && joinPin.trim().length === 4);
  const displayPlayers = soloState ? buildSoloPlayers(soloState, botProfile?.name ?? 'Bot') : room?.players ?? [];

  useEffect(() => {
    if (sessionPhase === 'playing' && previousPhase.current !== 'playing') {
      setSelectedSquare(undefined);
      setShowFullscreenPrompt(true);
    }
    if (sessionPhase !== 'playing') setShowFullscreenPrompt(false);
    previousPhase.current = sessionPhase;
  }, [sessionPhase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'f' || sessionPhase !== 'playing') return;
      event.preventDefault();
      void toggleFullscreen();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sessionPhase]);

  useEffect(() => {
    if (selectedLobbyId && publicLobbies.some((lobby) => lobby.lobbyId === selectedLobbyId)) return;
    const preferred = publicLobbies.find(isJoinableLobby) ?? publicLobbies[0];
    setSelectedLobbyId(preferred?.lobbyId);
  }, [publicLobbies, selectedLobbyId]);

  useEffect(() => {
    if (!selectedSquare) return;
    const stillValid = currentSnapshot.pieces.some((piece) => piece.square === selectedSquare && piece.color === localColor);
    if (!stillValid || currentSnapshot.turn !== localColor || sessionPhase !== 'playing') {
      setSelectedSquare(undefined);
    }
  }, [currentSnapshot, localColor, selectedSquare, sessionPhase]);

  useEffect(() => {
    if (botTurnTimerRef.current) {
      window.clearTimeout(botTurnTimerRef.current);
      botTurnTimerRef.current = undefined;
    }

    if (!soloState || soloState.snapshot.status !== 'active' || soloState.snapshot.turn !== soloState.botColor) {
      botTurnKeyRef.current = '';
      return;
    }

    const turnKey = `${soloState.snapshot.fen}:${soloState.botDifficulty}`;
    if (botTurnKeyRef.current === turnKey) return;
    botTurnKeyRef.current = turnKey;

    const profile = getBotDifficulty(soloState.botDifficulty);
    setSoloState((current) => (current ? { ...current, thinking: true } : current));

    botTurnTimerRef.current = window.setTimeout(() => {
      setSoloState((current) => {
        if (!current || current.snapshot.status !== 'active' || current.snapshot.turn !== current.botColor) {
          botTurnKeyRef.current = '';
          return current;
        }

        const chosenMove = chooseBotMove(current.snapshot, current.settings, current.botDifficulty);
        if (!chosenMove) {
          botTurnKeyRef.current = '';
          return { ...current, thinking: false };
        }

        const applied = applyMoveToSnapshot(current.snapshot, current.settings, chosenMove);
        botTurnKeyRef.current = '';
        setMessage(`Rank ${current.botDifficulty} ${getBotDifficulty(current.botDifficulty).name} played ${applied.san}.`);
        return {
          ...current,
          snapshot: applied.snapshot,
          thinking: false
        };
      });
    }, Math.max(120, Math.round(profile.thinkTimeMs * 0.72)));

    return () => {
      if (botTurnTimerRef.current) {
        window.clearTimeout(botTurnTimerRef.current);
        botTurnTimerRef.current = undefined;
      }
    };
  }, [soloState?.botColor, soloState?.botDifficulty, soloState?.snapshot.fen, soloState?.snapshot.status, soloState?.snapshot.turn]);

  useEffect(() => {
    latestTextState.current = JSON.stringify({
      mode: sessionPhase ?? 'landing',
      sessionKind: soloState ? 'solo' : room ? 'online' : 'landing',
      lobbyId: room?.lobbyId ?? null,
      roomTitle: room?.title ?? (soloState ? 'Solo Arena' : null),
      selectedLobbyId: selectedLobbyId ?? null,
      visibleLobbies: publicLobbies.map((lobby) => `${lobby.lobbyId}:${lobby.phase}:${lobby.seatsFilled}/${lobby.seatsMax}`),
      hostJoinPin: localPlayer?.isHost ? storedSession.hostJoinPin ?? null : null,
      variant: activeSettings.variant,
      turn: sessionPhase === 'landing' ? null : currentSnapshot.turn,
      localSeat: localColor,
      viewOrientation: localColor,
      selectedSquare: selectedSquare ?? null,
      status: sessionPhase === 'landing' ? null : currentSnapshot.status,
      clocks: sessionPhase === 'landing' ? null : currentSnapshot.clocks,
      boardTheme: activeSettings.boardSwatchId,
      fullscreenActive: isFullscreen,
      boardMessage,
      promptKind: prompt?.kind ?? null,
      botDifficulty: soloState?.botDifficulty ?? null,
      botThinking: soloState?.thinking ?? false,
      pieces: sessionPhase === 'landing' ? [] : currentSnapshot.pieces.map((piece) => `${piece.color[0]}:${piece.role}:${piece.square}`),
      legalMoves: selectedSquare && sessionPhase === 'playing' ? currentSnapshot.legalDestinations[selectedSquare] ?? [] : []
    });
    window.render_game_to_text = () => latestTextState.current;
    window.advanceTime = (ms: number) => setAnimationMs((current) => current + ms);
    window.debug_click_square = (square: string) => handleSquareClick(square);
    window.debug_move = (from: string, to: string) => {
      handleSquareClick(from);
      handleSquareClick(to);
    };
    window.debug_request_rematch = (option: RematchOption) => requestRematch(option);
    window.debug_respond_prompt = (accept: boolean) => handlePromptResponse(accept);
    window.debug_toggle_fullscreen = () => toggleFullscreen();
    window.debug_start_solo = (level?: number) => startSolo(level as BotDifficultyLevel | undefined);
  }, [
    activeSettings.boardSwatchId,
    activeSettings.variant,
    boardMessage,
    currentSnapshot,
    isFullscreen,
    localColor,
    localPlayer?.isHost,
    prompt,
    publicLobbies,
    room,
    selectedLobbyId,
    selectedSquare,
    sessionPhase,
    soloState,
    storedSession.hostJoinPin
  ]);

  function handleServerMessage(payload: ServerMessage) {
    if (payload.type === 'lobby_list') {
      setPublicLobbies(payload.lobbies);
      return;
    }

    if (sessionModeRef.current === 'solo') {
      return;
    }

    if (payload.type === 'session') {
      setStoredSession((current) => {
        const nextSession = {
          sessionToken: payload.session.sessionToken,
          lobbyId: payload.session.lobbyId,
          playerName: payload.session.playerName,
          hostJoinPin:
            payload.session.hostJoinPin ??
            (current.lobbyId === payload.session.lobbyId ? current.hostJoinPin : undefined)
        };
        writeStoredSession(nextSession);
        return nextSession;
      });
      if (payload.session.playerName) {
        setPlayerName(payload.session.playerName);
        setJoinName(payload.session.playerName);
      }
      return;
    }
    if (payload.type === 'room_state') {
      pendingAutoJoinRef.current = false;
      setRoom(payload.room);
      return;
    }
    if (payload.type === 'game_state') {
      setGame(payload.game);
      return;
    }
    if (payload.type === 'prompt') {
      setPrompt(payload.prompt);
      return;
    }
    if (payload.type === 'room_closed') {
      setMessage(payload.message);
      setRoom(null);
      setGame(null);
      setPrompt(null);
      setSelectedSquare(undefined);
      clearActiveLobbySession();
      return;
    }
    if (payload.type === 'error') {
      if (pendingAutoJoinRef.current) {
        pendingAutoJoinRef.current = false;
        clearActiveLobbySession();
      }
      setMessage(payload.message);
    }
  }

  function updateStoredSession(transform: (current: StoredSession) => StoredSession) {
    setStoredSession((current) => {
      const next = transform(current);
      writeStoredSession(next);
      return next;
    });
  }

  function clearActiveLobbySession() {
    updateStoredSession((current) => ({
      sessionToken: current.sessionToken,
      playerName: current.playerName,
      hostJoinPin: undefined,
      lobbyId: undefined
    }));
  }

  function dispatch(messageToSend: ClientMessage) {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setMessage('The connection to the hosted server is not available.');
      return;
    }
    sendMessage(socketRef.current, messageToSend);
  }

  function handleCreateRoom() {
    setMessage('');
    dispatch({
      type: 'create_room',
      playerName,
      roomTitle,
      sessionToken: storedSession.sessionToken
    });
  }

  function handleJoinRoom() {
    if (!selectedLobby) {
      setMessage('Pick a public lobby from the list first.');
      return;
    }
    if (!isJoinableLobby(selectedLobby)) {
      setMessage('That lobby is not accepting new players right now.');
      return;
    }

    setMessage('');
    dispatch({
      type: 'join_room',
      lobbyId: selectedLobby.lobbyId,
      joinPin: joinPin.trim(),
      playerName: joinName,
      sessionToken: storedSession.sessionToken
    });
  }

  function updateSettings<K extends keyof LobbySettings>(key: K, value: LobbySettings[K]) {
    if (soloState) {
      setSoloState((current) => (current ? { ...current, settings: { ...current.settings, [key]: value } } : current));
      return;
    }

    dispatch({ type: 'update_settings', settings: { [key]: value } as Partial<LobbySettings> });
  }

  function updateTheme(themeId: LobbySettings['themePreset']) {
    if (soloState) {
      const themePreset = createThemePresetSettings(themeId);
      setSoloState((current) => (current ? { ...current, settings: { ...current.settings, ...themePreset } } : current));
      return;
    }

    dispatch({ type: 'update_settings', settings: createThemePresetSettings(themeId) });
  }

  function startSolo(levelOverride?: BotDifficultyLevel) {
    pendingAutoJoinRef.current = false;
    clearActiveLobbySession();
    setRoom(null);
    setGame(null);
    setPrompt(null);
    setSelectedSquare(undefined);
    setMessage('');
    botTurnKeyRef.current = '';
    const nextSolo = createSoloSession({
      playerName,
      variant: soloVariant,
      seatChoice: soloSeatChoice,
      themePreset: soloThemePreset,
      difficulty: levelOverride ?? soloDifficulty
    });
    setSoloState(nextSolo);
  }

  function leaveSolo() {
    setSoloState(null);
    setSelectedSquare(undefined);
    setMessage('');
    botTurnKeyRef.current = '';
  }

  function restartSolo(option: RematchOption) {
    if (!soloState) return;

    setSelectedSquare(undefined);
    setMessage('');
    botTurnKeyRef.current = '';

    setSoloState((current) => {
      if (!current) return current;
      const nextVariant = option === 'next_variant' ? rotateVariant(current.settings.variant) : current.settings.variant;
      const nextPlayerColor = option === 'swap' ? oppositeColor(current.playerColor) : current.playerColor;
      const nextBotColor = oppositeColor(nextPlayerColor);
      const nextSettings = {
        ...current.settings,
        variant: nextVariant
      };
      return {
        ...current,
        playerColor: nextPlayerColor,
        botColor: nextBotColor,
        settings: nextSettings,
        snapshot: createInitialSnapshot(nextSettings, Date.now()),
        thinking: false
      };
    });
  }

  function handleSquareClick(square: string) {
    if (soloState) {
      if (soloState.snapshot.status !== 'active') return;
      if (soloState.thinking || soloState.snapshot.turn !== localColor) {
        setMessage(
          soloState.thinking
            ? `Rank ${soloState.botDifficulty} ${getBotDifficulty(soloState.botDifficulty).name} is thinking.`
            : `It is ${sideToColorName(soloState.snapshot.turn)} to move right now.`
        );
        return;
      }

      const selectedMoves = selectedSquare ? soloState.snapshot.legalDestinations[selectedSquare] ?? [] : [];
      if (selectedSquare && selectedMoves.includes(square)) {
        const applied = applyMoveToSnapshot(soloState.snapshot, soloState.settings, buildMove(soloState.snapshot, selectedSquare, square));
        setSoloState((current) => (current ? { ...current, snapshot: applied.snapshot } : current));
        setSelectedSquare(undefined);
        setMessage(`You played ${applied.san}.`);
        return;
      }

      const clickedPiece = soloState.snapshot.pieces.find((piece) => piece.square === square);
      if (!clickedPiece) {
        setSelectedSquare(undefined);
        return;
      }
      if (clickedPiece.color !== localColor) {
        setMessage(`That piece belongs to the ${sideToColorName(clickedPiece.color)}.`);
        setSelectedSquare(undefined);
        return;
      }
      setMessage('');
      setSelectedSquare(square);
      return;
    }

    if (!room || !game || room.phase !== 'playing') return;
    if (game.turn !== localColor) {
      setMessage(`It is ${sideToColorName(game.turn)} to move right now.`);
      return;
    }

    const selectedMoves = selectedSquare ? game.legalDestinations[selectedSquare] ?? [] : [];
    if (selectedSquare && selectedMoves.includes(square)) {
      dispatch({ type: 'submit_move', move: buildMove(game, selectedSquare, square) });
      setSelectedSquare(undefined);
      return;
    }

    const clickedPiece = game.pieces.find((piece) => piece.square === square);
    if (!clickedPiece) {
      setSelectedSquare(undefined);
      return;
    }
    if (clickedPiece.color !== localColor) {
      setMessage(`That piece belongs to the ${sideToColorName(clickedPiece.color)}.`);
      setSelectedSquare(undefined);
      return;
    }
    setSelectedSquare(square);
  }

  function handlePromptResponse(accept: boolean) {
    if (!prompt || soloState) return;
    if (prompt.kind === 'takeback_request') {
      dispatch({ type: 'respond_takeback', promptId: prompt.id, accept });
      setPrompt(null);
      return;
    }
    dispatch({ type: 'request_rematch', option: prompt.option ?? 'same', action: accept ? 'accept' : 'decline', promptId: prompt.id });
    setPrompt(null);
  }

  function requestRematch(option: RematchOption) {
    if (soloState) {
      restartSolo(option);
      return;
    }

    dispatch({ type: 'request_rematch', option, action: 'request' });
  }

  async function copyText(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(successMessage);
    } catch {
      setMessage('Clipboard access failed on this browser.');
    }
  }

  async function toggleFullscreen() {
    setShowFullscreenPrompt(false);
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
  }

  return (
    <div
      className={room || soloState ? 'app-shell app-shell--room' : 'app-shell'}
      style={buildThemeVars(activeSettings) as React.CSSProperties}
    >
      <header className={`hero ${room || soloState ? 'hero--compact' : ''}`}>
        <div>
          <p className="eyebrow">Hosted Internet Chess</p>
          <h1>Chess Party Online</h1>
          <p className="subtitle">
            One shared website, a public lobby browser, a private 4-digit PIN for hosted matches, and a solo bot mode for practice.
          </p>
        </div>
        <div className="hero-actions">
          {soloState ? <span className="room-code">Solo Match</span> : room ? <span className="room-code">Lobby {room.lobbyId}</span> : <span className="room-code">{publicLobbies.length} Live Lobbies</span>}
          <div className={`connection-pill connection-pill--${connectionState}`}>{connectionState}</div>
        </div>
      </header>

      {message ? (
        <button className="message-strip" type="button" onClick={() => setMessage('')}>
          {message}
        </button>
      ) : null}

      {!room && !soloState ? (
        <section className="landing-grid">
          <article className="panel landing-card">
            <div className="panel-heading">
              <h2>Create Lobby</h2>
              <span className="support-copy">Host a public room and keep the PIN private.</span>
            </div>
            <label className="field">
              <span>Display name</span>
              <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={20} />
            </label>
            <label className="field">
              <span>Lobby title</span>
              <input value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} maxLength={36} />
            </label>
            <button className="primary-button" onClick={handleCreateRoom}>
              Create Lobby
            </button>
          </article>

          <article className="panel landing-card landing-card--browse">
            <div className="panel-heading">
              <h2>Browse Lobbies</h2>
              <span className="support-copy">Everyone sees the same live room list.</span>
            </div>

            <div className="lobby-browser" role="list" aria-label="Public lobbies">
              {publicLobbies.length ? (
                publicLobbies.map((lobby) => (
                  <button
                    key={lobby.lobbyId}
                    type="button"
                    className={`lobby-row ${selectedLobbyId === lobby.lobbyId ? 'lobby-row--selected' : ''}`}
                    onClick={() => setSelectedLobbyId(lobby.lobbyId)}
                  >
                    <div className="lobby-row__body">
                      <strong>{lobby.title}</strong>
                      <span className="support-copy">
                        {lobby.hostName} · {getVariantDefinition(lobby.variant).label} · {lobby.lobbyId}
                      </span>
                    </div>
                    <div className="lobby-row__meta">
                      <span className="status-pill">{lobbyStatusLabel(lobby)}</span>
                      <span className="support-copy">
                        {lobby.seatsFilled}/{lobby.seatsMax}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="empty-state">No public rooms are live right now. Start one and your friends will see it here immediately.</div>
              )}
            </div>

            <label className="field">
              <span>Display name</span>
              <input value={joinName} onChange={(event) => setJoinName(event.target.value)} maxLength={20} />
            </label>
            <label className="field">
              <span>4-digit join PIN</span>
              <input value={joinPin} onChange={(event) => setJoinPin(event.target.value.replace(/\D/g, '').slice(0, 4))} />
            </label>
            <button className="secondary-button" onClick={handleJoinRoom} disabled={!joinReady}>
              Join Selected Lobby
            </button>
            <p className="support-copy">
              {selectedLobby
                ? `${selectedLobby.title} is ${lobbyStatusLabel(selectedLobby).toLowerCase()}. You still need the host's 4-digit PIN.`
                : 'Select a lobby row, then enter the 4-digit PIN the host shared with you.'}
            </p>
          </article>

          <article className="panel landing-card">
            <div className="panel-heading">
              <h2>Solo Mode</h2>
              <span className="support-copy">Play locally against a ranked bot with ten skill tiers.</span>
            </div>
            <label className="field">
              <span>Display name</span>
              <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={20} />
            </label>
            <label className="field">
              <span>Bot rank</span>
              <select value={soloDifficulty} onChange={(event) => setSoloDifficulty(Number(event.target.value) as BotDifficultyLevel)}>
                {botDifficultyProfiles.map((entry) => (
                  <option key={entry.level} value={entry.level}>
                    Rank {entry.level} · {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Play as</span>
              <select value={soloSeatChoice} onChange={(event) => setSoloSeatChoice(event.target.value as SoloSeatChoice)}>
                <option value="light">Light side</option>
                <option value="dark">Dark side</option>
                <option value="random">Random</option>
              </select>
            </label>
            <label className="field">
              <span>Variant</span>
              <select value={soloVariant} onChange={(event) => setSoloVariant(event.target.value as VariantId)}>
                {VARIANT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {getVariantDefinition(option).label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Theme</span>
              <select value={soloThemePreset} onChange={(event) => setSoloThemePreset(event.target.value as LobbySettings['themePreset'])}>
                {boardSwatches.map((swatch) => (
                  <option key={swatch.id} value={swatch.id}>
                    {swatch.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button" onClick={() => startSolo()}>
              Start Solo Match
            </button>
            <p className="support-copy">{getBotDifficulty(soloDifficulty).summary}</p>
          </article>

          <article className="panel panel--wide landing-guide">
            <div className="panel-title-row">
              <div>
                <h2>How This Works</h2>
                <p className="support-copy">Fast setup for hosted games and instant solo practice.</p>
              </div>
              <button className="ghost-button" onClick={() => setShowHowItWorks((current) => !current)}>
                {showHowItWorks ? 'Hide' : 'Show'}
              </button>
            </div>
            {showHowItWorks ? (
              <ol className="instruction-list">
                <li>The host creates a public lobby and gets a private 4-digit join PIN.</li>
                <li>Everyone opens the same website and sees the live lobby list.</li>
                <li>Guests click the right lobby row, enter the host&apos;s PIN, and join.</li>
                <li>Tune theme, board look, camera, and rules. Ready up when both players are set.</li>
                <li>In any match, select one of your pieces, then a highlighted square. Right-drag the board to orbit and scroll to zoom.</li>
              </ol>
            ) : (
              <p className="support-copy">Every room appears in the public list, but only players with the 4-digit PIN can enter that table.</p>
            )}
          </article>
        </section>
      ) : (
        <main className="room-layout">
          <section className="panel column setup-column">
            {soloState ? (
              <>
                <div className="section-intro">
                  <div>
                    <p className="eyebrow">Solo Arena</p>
                    <h2>Practice vs Bot</h2>
                  </div>
                  <span className="status-pill status-pill--seat">{sideToColorName(localColor)}</span>
                </div>
                <p className="support-copy">This match runs locally in your browser. No lobby, PIN, or second player is required.</p>

                <SettingsGroup title="Bot Profile">
                  <div className="invite-panel">
                    <div>
                      <strong>
                        Rank {soloState.botDifficulty} · {botProfile?.name}
                      </strong>
                      <div className="support-copy">{botProfile?.summary}</div>
                    </div>
                    <span className="room-code invite-pin">Solo AI</span>
                  </div>
                  <label className="field">
                    <span>Bot difficulty</span>
                    <select value={soloState.botDifficulty} onChange={(event) => setSoloState((current) => (current ? { ...current, botDifficulty: Number(event.target.value) as BotDifficultyLevel } : current))}>
                      {botDifficultyProfiles.map((entry) => (
                        <option key={entry.level} value={entry.level}>
                          Rank {entry.level} · {entry.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </SettingsGroup>

                <SettingsGroup title="Look">
                  <select value={activeSettings.boardSwatchId} onChange={(event) => updateTheme(event.target.value as LobbySettings['themePreset'])}>
                    {boardSwatches.map((swatch) => (
                      <option key={swatch.id} value={swatch.id}>
                        {swatch.name}
                      </option>
                    ))}
                  </select>
                  <select value={activeSettings.piecePaletteId} onChange={(event) => updateSettings('piecePaletteId', event.target.value)}>
                    {piecePalettes.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                  <select value={activeSettings.pieceSetId} onChange={(event) => updateSettings('pieceSetId', event.target.value as LobbySettings['pieceSetId'])}>
                    {pieceSets.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                  <select value={activeSettings.scenePresetId} onChange={(event) => updateSettings('scenePresetId', event.target.value as LobbySettings['scenePresetId'])}>
                    {scenePresets.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                  <select value={activeSettings.cameraPreset} onChange={(event) => updateSettings('cameraPreset', event.target.value as LobbySettings['cameraPreset'])}>
                    <option value="cozy">Cozy Camera</option>
                    <option value="competitive">Competitive Camera</option>
                    <option value="dramatic">Dramatic Camera</option>
                  </select>
                  <select value={activeSettings.animationIntensity} onChange={(event) => updateSettings('animationIntensity', event.target.value as LobbySettings['animationIntensity'])}>
                    <option value="reduced">Reduced Motion</option>
                    <option value="normal">Normal Motion</option>
                    <option value="lively">Lively Motion</option>
                  </select>
                </SettingsGroup>

                <SettingsGroup title="Controls">
                  <div className="support-copy">Hold the right mouse button and drag to orbit the board. Use the scroll wheel to zoom. Press `F` for fullscreen.</div>
                </SettingsGroup>

                <div className="action-row action-row--stacked">
                  <button className="primary-button" onClick={() => restartSolo('same')}>
                    {sessionPhase === 'finished' ? 'Play Again' : 'Restart Solo'}
                  </button>
                  <button className="secondary-button" onClick={() => restartSolo('swap')}>
                    Swap Sides
                  </button>
                  <button className="ghost-button" onClick={() => restartSolo('next_variant')}>
                    Next Variant
                  </button>
                  <button className="ghost-button" onClick={leaveSolo}>
                    Back To Lobby List
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="section-intro">
                  <div>
                    <p className="eyebrow">Room Setup</p>
                    <h2>{room?.title}</h2>
                  </div>
                  <span className="status-pill status-pill--seat">{sideToColorName(localColor)}</span>
                </div>
                <p className="support-copy">This public lobby is visible to everyone on the site. Share the 4-digit PIN privately, then tune the room before kickoff.</p>

                <SettingsGroup title="Invite">
                  <div className="invite-panel">
                    <div>
                      <strong>{room?.title}</strong>
                      <div className="support-copy">Lobby {room?.lobbyId} appears in the public browser list.</div>
                    </div>
                    {localPlayer?.isHost ? <span className="room-code invite-pin">PIN {storedSession.hostJoinPin ?? '----'}</span> : null}
                  </div>
                  <div className="invite-actions">
                    <button className="secondary-button" onClick={() => void copyText(window.location.origin, 'Site link copied.')}>
                      Copy Site Link
                    </button>
                    {localPlayer?.isHost ? (
                      <>
                        <button
                          className="ghost-button"
                          onClick={() =>
                            void copyText(
                              `Play at ${window.location.origin}\nLobby: ${room?.title}\nPIN: ${storedSession.hostJoinPin ?? '----'}`,
                              'Invite copied.'
                            )
                          }
                        >
                          Copy Invite
                        </button>
                        {room?.phase === 'lobby' ? (
                          <button className="ghost-button" onClick={() => dispatch({ type: 'regenerate_pin' })}>
                            Regenerate PIN
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </SettingsGroup>

                <SettingsGroup title="Mode">
                  <select value={activeSettings.variant} onChange={(event) => updateSettings('variant', event.target.value as LobbySettings['variant'])} disabled={room?.phase !== 'lobby'}>
                    {VARIANT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {getVariantDefinition(option).label}
                      </option>
                    ))}
                  </select>
                  <select value={activeSettings.sideAssignment} onChange={(event) => updateSettings('sideAssignment', event.target.value as LobbySettings['sideAssignment'])} disabled={room?.phase !== 'lobby'}>
                    <option value="host_light">Host Light Side</option>
                    <option value="host_dark">Host Dark Side</option>
                    <option value="random">Random</option>
                  </select>
                  <select value={activeSettings.takebackPolicy} onChange={(event) => updateSettings('takebackPolicy', event.target.value as LobbySettings['takebackPolicy'])} disabled={room?.phase !== 'lobby'}>
                    <option value="mutual">Takebacks by agreement</option>
                    <option value="off">No takebacks</option>
                  </select>
                </SettingsGroup>

                <SettingsGroup title="Clock">
                  <select value={activeSettings.clockPreset} onChange={(event) => updateSettings('clockPreset', event.target.value as LobbySettings['clockPreset'])} disabled={room?.phase !== 'lobby'}>
                    {clockPresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </SettingsGroup>

                <SettingsGroup title="Help">
                  <div className="support-copy">New-player assists stay on: legal move markers, last move glow, rules card, and context-aware piece tips.</div>
                </SettingsGroup>

                <SettingsGroup title="Look">
                  <select value={activeSettings.boardSwatchId} onChange={(event) => updateTheme(event.target.value as LobbySettings['themePreset'])} disabled={room?.phase !== 'lobby'}>
                    {boardSwatches.map((swatch) => (
                      <option key={swatch.id} value={swatch.id}>
                        {swatch.name}
                      </option>
                    ))}
                  </select>
                  <select value={activeSettings.piecePaletteId} onChange={(event) => updateSettings('piecePaletteId', event.target.value)} disabled={room?.phase !== 'lobby'}>
                    {piecePalettes.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                  <select value={activeSettings.pieceSetId} onChange={(event) => updateSettings('pieceSetId', event.target.value as LobbySettings['pieceSetId'])} disabled={room?.phase !== 'lobby'}>
                    {pieceSets.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                  <select value={activeSettings.scenePresetId} onChange={(event) => updateSettings('scenePresetId', event.target.value as LobbySettings['scenePresetId'])} disabled={room?.phase !== 'lobby'}>
                    {scenePresets.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                  <select value={activeSettings.cameraPreset} onChange={(event) => updateSettings('cameraPreset', event.target.value as LobbySettings['cameraPreset'])} disabled={room?.phase !== 'lobby'}>
                    <option value="cozy">Cozy Camera</option>
                    <option value="competitive">Competitive Camera</option>
                    <option value="dramatic">Dramatic Camera</option>
                  </select>
                  <select value={activeSettings.animationIntensity} onChange={(event) => updateSettings('animationIntensity', event.target.value as LobbySettings['animationIntensity'])} disabled={room?.phase !== 'lobby'}>
                    <option value="reduced">Reduced Motion</option>
                    <option value="normal">Normal Motion</option>
                    <option value="lively">Lively Motion</option>
                  </select>
                </SettingsGroup>

                <div className="action-row action-row--stacked">
                  {room?.phase === 'lobby' ? (
                    <>
                      <button className="secondary-button" onClick={() => dispatch({ type: 'set_ready', ready: !localPlayer?.ready })}>
                        {localPlayer?.ready ? 'Unready' : 'Ready Up'}
                      </button>
                      {localPlayer?.isHost ? (
                        <button className="primary-button" onClick={() => dispatch({ type: 'start_match' })}>
                          Start Match
                        </button>
                      ) : (
                        <button className="ghost-button" disabled>
                          Waiting for host to start
                        </button>
                      )}
                    </>
                  ) : null}

                  {room?.phase === 'finished' ? (
                    <>
                      <button className="primary-button" onClick={() => requestRematch('same')}>
                        Rematch Same Settings
                      </button>
                      <button className="secondary-button" onClick={() => requestRematch('swap')}>
                        Swap Sides
                      </button>
                      <button className="ghost-button" onClick={() => requestRematch('next_variant')}>
                        Next Variant
                      </button>
                    </>
                  ) : null}
                </div>
              </>
            )}
          </section>

          <section className="panel board-panel">
            <div className="board-panel__header">
              <div>
                <p className="eyebrow">Live Board</p>
                <h2>{variant.label}</h2>
                <p className="support-copy">{variant.shortDescription}</p>
              </div>
              <div className="board-panel__actions">
                <div className="clock-strip">
                  <ClockBadge label="Light" value={currentSnapshot.clocks.lightMs} active={currentSnapshot.clocks.activeColor === 'white'} />
                  <ClockBadge label="Dark" value={currentSnapshot.clocks.darkMs} active={currentSnapshot.clocks.activeColor === 'black'} />
                </div>
                {sessionPhase === 'playing' ? (
                  <button className="ghost-button fullscreen-button" onClick={() => void toggleFullscreen()}>
                    {isFullscreen ? 'Exit Fullscreen' : 'Go Fullscreen'}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="board-status-banner">
              <span>{boardMessage}</span>
              <span>{interactionHint}</span>
            </div>

            <div className="board-canvas">
              <BoardScene
                snapshot={currentSnapshot}
                boardSwatchId={activeSettings.boardSwatchId}
                piecePaletteId={activeSettings.piecePaletteId}
                pieceSetId={activeSettings.pieceSetId}
                scenePresetId={activeSettings.scenePresetId}
                cameraPreset={activeSettings.cameraPreset}
                orientation={localColor}
                animationIntensity={activeSettings.animationIntensity}
                animationMs={animationMs}
                selectedSquare={selectedSquare}
                interactive={sessionPhase === 'playing'}
                sceneMode={sessionPhase === 'lobby' ? 'preview' : 'match'}
                onSquareClick={handleSquareClick}
              />
            </div>

            <div className="board-footer">
              <span>{sessionPhase === 'lobby' ? 'Preview the table while your public lobby fills.' : currentSnapshot.outcomeText}</span>
              <span>{footerMessage}</span>
            </div>
          </section>

          <section className="panel column side-column">
            <div className="section-intro">
              <div>
                <p className="eyebrow">Match Rail</p>
                <h2>Players And Help</h2>
              </div>
              <span className="status-pill">{soloState ? 'solo' : room?.phase}</span>
            </div>

            <div className="player-list">
              {displayPlayers.map((player) => (
                <div key={player.id} className={`player-card ${player.connected ? '' : 'player-card--offline'}`}>
                  <div>
                    <strong>{player.name}</strong>
                    <div className="support-copy">
                      {player.isHost ? (soloState ? 'You' : 'Host') : soloState ? `AI Rank ${soloState.botDifficulty}` : 'Guest'}
                      {player.seatColor ? ` • ${sideToColorName(player.seatColor)}` : ''}
                    </div>
                  </div>
                  <span className={`status-pill ${player.ready ? 'status-pill--ready' : ''}`}>
                    {soloState
                      ? player.id === 'solo-bot'
                        ? soloState.thinking
                          ? 'Thinking'
                          : 'Waiting'
                        : currentSnapshot.turn === localColor && sessionPhase === 'playing'
                          ? 'Your turn'
                          : 'Ready'
                      : player.connected
                        ? player.ready
                          ? 'Ready'
                          : 'Waiting'
                        : 'Disconnected'}
                  </span>
                </div>
              ))}
            </div>

            {soloState ? (
              <section className="subpanel">
                <h3>Bot Status</h3>
                <p className="support-copy">
                  {soloState.thinking
                    ? `Rank ${soloState.botDifficulty} ${botProfile?.name} is searching for a move.`
                    : currentSnapshot.turn === localColor && sessionPhase === 'playing'
                      ? 'The bot is waiting for your move.'
                      : 'The bot will answer as soon as your move is confirmed.'}
                </p>
              </section>
            ) : null}

            <section className="subpanel">
              <h3>Rules Card</h3>
              <ul className="mini-list">
                {variant.rulesSummary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>

            <section className="subpanel">
              <h3>Piece Guide</h3>
              {selectedPiece ? (
                <p className="support-copy">{getPieceGuideText(selectedPiece.role)}</p>
              ) : sessionPhase === 'playing' ? (
                <p className="support-copy">Select one of your pieces to see how it moves before you commit the move.</p>
              ) : (
                <p className="support-copy">Once the match starts, select a piece to see its move pattern and quick reminder.</p>
              )}
            </section>

            <section className="subpanel subpanel--scroll">
              <h3>Move List</h3>
              <ol className="move-list">
                {currentSnapshot.sanHistory.map((entry, index) => (
                  <li key={`${entry}-${index}`}>
                    <span>{Math.floor(index / 2) + 1}.</span>
                    <span>{entry}</span>
                  </li>
                ))}
              </ol>
            </section>

            {sessionPhase === 'playing' && !soloState ? (
              <section className="subpanel">
                <h3>Actions</h3>
                <div className="stack">
                  <button className="secondary-button" onClick={() => dispatch({ type: 'request_takeback' })}>
                    Request Takeback
                  </button>
                  <button className="ghost-button" onClick={() => void toggleFullscreen()}>
                    {isFullscreen ? 'Leave Fullscreen' : 'Fullscreen'}
                  </button>
                </div>
              </section>
            ) : null}
          </section>
        </main>
      )}

      {prompt && !soloState ? (
        <div className="prompt-backdrop">
          <div className="prompt-card">
            <p className="eyebrow">{prompt.kind === 'takeback_request' ? 'Takeback Request' : 'Rematch Request'}</p>
            <h2>{prompt.kind === 'takeback_request' ? 'Your friend wants to rewind the last move.' : 'A new round is ready.'}</h2>
            <p>{prompt.text}</p>
            <div className="action-row">
              <button className="primary-button" onClick={() => handlePromptResponse(true)}>
                Accept
              </button>
              <button className="secondary-button" onClick={() => handlePromptResponse(false)}>
                Decline
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showFullscreenPrompt && sessionPhase === 'playing' ? (
        <div className="prompt-backdrop prompt-backdrop--corner">
          <div className="prompt-card prompt-card--compact">
            <p className="eyebrow">Best View</p>
            <h2>Go fullscreen for the table view.</h2>
            <p>Press `F` any time, or use the button below.</p>
            <div className="action-row">
              <button className="primary-button" onClick={() => void toggleFullscreen()}>
                Fullscreen
              </button>
              <button className="ghost-button" onClick={() => setShowFullscreenPrompt(false)}>
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function currentPlayer(room: RoomState) {
  return room.players.find((player) => player.id === room.localPlayerId);
}

function resolveDisplaySeat(room: RoomState, settings: LobbySettings) {
  if (room.localSeatColor) return room.localSeatColor;
  const localPlayer = currentPlayer(room);
  if (!localPlayer) return 'white';
  if (settings.sideAssignment === 'host_light') return localPlayer.isHost ? 'white' : 'black';
  if (settings.sideAssignment === 'host_dark') return localPlayer.isHost ? 'black' : 'white';
  return localPlayer.isHost ? 'white' : 'black';
}

function getBoardMessage({
  room,
  game,
  localColor,
  selectedSquare,
  soloState
}: {
  room: RoomState | null;
  game: GameSnapshot | null;
  localColor: Color;
  selectedSquare?: string;
  soloState: SoloState | null;
}) {
  if (soloState) {
    if (soloState.snapshot.status !== 'active') return soloState.snapshot.outcomeText;
    if (soloState.thinking || soloState.snapshot.turn !== localColor) {
      return `Rank ${soloState.botDifficulty} ${getBotDifficulty(soloState.botDifficulty).name} is thinking for the ${sideToColorName(soloState.botColor).toLowerCase()}.`;
    }
    if (selectedSquare) return `Piece selected on ${selectedSquare}. Choose one of the highlighted destinations.`;
    return `Your move as ${sideToColorName(localColor)}. Select one of your pieces.`;
  }

  if (!room) return 'Create a public lobby, pick one from the list, or start a solo match.';
  if (room.phase === 'lobby') return `Previewing ${sideToColorName(localColor).toLowerCase()} perspective before the round begins.`;
  if (!game) return 'Waiting for the match state to arrive from the hosted server.';
  if (game.status !== 'active') return game.outcomeText;
  if (game.turn !== localColor) return `${sideToColorName(game.turn)} is thinking.`;
  if (selectedSquare) return `Piece selected on ${selectedSquare}. Choose one of the highlighted destinations.`;
  return `Your move as ${sideToColorName(localColor)}. Select one of your pieces.`;
}

function buildMove(game: GameSnapshot, from: string, to: string) {
  const piece = game.pieces.find((entry) => entry.square === from);
  if (piece?.role === 'pawn') {
    if ((piece.color === 'white' && to.endsWith('8')) || (piece.color === 'black' && to.endsWith('1'))) {
      return `${from}${to}q`;
    }
  }
  return `${from}${to}`;
}

function formatClock(ms: number | null) {
  if (ms === null) return 'No clock';
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function ClockBadge({ label, value, active }: { label: string; value: number | null; active: boolean }) {
  return (
    <div className={`clock-badge ${active ? 'clock-badge--active' : ''}`}>
      <span>{label}</span>
      <strong>{formatClock(value)}</strong>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="subpanel">
      <h3>{title}</h3>
      <div className="stack">{children}</div>
    </section>
  );
}

function lobbyStatusLabel(lobby: PublicLobbySummary) {
  if (lobby.phase === 'playing') return 'In Game';
  if (lobby.phase === 'finished') return 'Finished';
  if (lobby.seatsFilled >= lobby.seatsMax) return 'Full';
  return 'Open';
}

function isJoinableLobby(lobby: PublicLobbySummary) {
  return lobby.phase === 'lobby' && lobby.seatsFilled < lobby.seatsMax;
}

function resolveSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.port === '5173' ? `${window.location.hostname}:3000` : window.location.host;
  return `${protocol}//${host}`;
}

function sendMessage(socket: WebSocket, payload: ClientMessage) {
  socket.send(JSON.stringify(payload));
}

function readStoredSession(): StoredSession {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredSession;
  } catch {
    return {};
  }
}

function writeStoredSession(session: StoredSession) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function resolveSoloPhase(snapshot: GameSnapshot): RoomState['phase'] {
  return snapshot.status === 'active' ? 'playing' : 'finished';
}

function buildSoloPlayers(soloState: SoloState, botName: string): RoomState['players'] {
  return [
    {
      id: 'solo-human',
      name: soloState.playerName,
      ready: true,
      connected: true,
      isHost: true,
      seatColor: soloState.playerColor
    },
    {
      id: 'solo-bot',
      name: botName,
      ready: true,
      connected: true,
      isHost: false,
      seatColor: soloState.botColor
    }
  ];
}

function createSoloSession({
  playerName,
  variant,
  seatChoice,
  themePreset,
  difficulty
}: {
  playerName: string;
  variant: VariantId;
  seatChoice: SoloSeatChoice;
  themePreset: LobbySettings['themePreset'];
  difficulty: BotDifficultyLevel;
}): SoloState {
  const playerColor = resolveSoloColor(seatChoice);
  const botColor = oppositeColor(playerColor);
  const settings: LobbySettings = {
    ...defaultLobbySettings,
    variant,
    ...createThemePresetSettings(themePreset)
  };

  return {
    playerName: playerName.trim() || 'Player',
    playerColor,
    botColor,
    botDifficulty: difficulty,
    settings,
    snapshot: createInitialSnapshot(settings, Date.now()),
    thinking: false
  };
}

function createThemePresetSettings(themePreset: LobbySettings['themePreset']): Pick<LobbySettings, 'themePreset' | 'boardSwatchId' | 'piecePaletteId' | 'scenePresetId'> {
  if (themePreset === 'neon') {
    return {
      themePreset,
      boardSwatchId: themePreset,
      piecePaletteId: 'mint-onyx',
      scenePresetId: 'skyline'
    };
  }
  if (themePreset === 'marble') {
    return {
      themePreset,
      boardSwatchId: themePreset,
      piecePaletteId: 'rose-stone',
      scenePresetId: 'vault'
    };
  }
  return {
    themePreset,
    boardSwatchId: themePreset,
    piecePaletteId: 'classic',
    scenePresetId: 'parlor'
  };
}

function buildThemeVars(settings: LobbySettings) {
  const theme = getBoardTheme(settings.boardSwatchId);
  const palette = getPiecePalette(settings.piecePaletteId);

  return {
    '--theme-ambient': theme.ambient,
    '--theme-felt': theme.felt,
    '--theme-border': theme.border,
    '--theme-accent': theme.accent,
    '--theme-glow': theme.glow,
    '--theme-light': palette.lightBase,
    '--theme-dark': palette.darkBase,
    '--theme-bg-top': theme.backgroundTop,
    '--theme-bg-bottom': theme.backgroundBottom,
    '--theme-room-glow': theme.roomGlow,
    '--theme-panel': theme.uiPanel,
    '--theme-panel-elevated': theme.uiPanelElevated,
    '--theme-surface': theme.uiSurface,
    '--theme-ui-border': theme.uiBorder,
    '--theme-text': theme.uiText,
    '--theme-muted': theme.uiMuted,
    '--theme-button': theme.uiButton,
    '--theme-button-text': theme.uiButtonText,
    '--theme-secondary': theme.uiSecondary,
    '--theme-input': theme.uiInput,
    '--theme-shadow': theme.uiShadow,
    '--theme-highlight': theme.uiHighlight
  };
}

function resolveSoloColor(choice: SoloSeatChoice): Color {
  if (choice === 'random') return Math.random() > 0.5 ? 'white' : 'black';
  return choice === 'light' ? 'white' : 'black';
}

function oppositeColor(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}

function rotateVariant(current: VariantId): VariantId {
  const index = VARIANT_OPTIONS.indexOf(current);
  return VARIANT_OPTIONS[(index + 1) % VARIANT_OPTIONS.length];
}

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
    debug_click_square: (square: string) => void;
    debug_move: (from: string, to: string) => void;
    debug_request_rematch: (option: RematchOption) => void;
    debug_respond_prompt: (accept: boolean) => void;
    debug_toggle_fullscreen: () => Promise<void>;
    debug_start_solo: (level?: number) => void;
  }
}
