import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { BoardScene } from './BoardScene';
import {
  boardSwatches,
  clockPresets,
  createInitialSnapshot,
  defaultLobbySettings,
  getBoardTheme,
  getPieceGuideText,
  getPiecePalette,
  getVariantDefinition,
  piecePalettes,
  pieceSets,
  scenePresets,
  sideToColorName,
  type ClientMessage,
  type GameSnapshot,
  type LobbySettings,
  type RematchOption,
  type RoomState,
  type ServerMessage,
  type ServerPrompt
} from '../../shared/src';

const STORAGE_KEY = 'chess-party-lan-session';

interface StoredSession {
  sessionToken?: string;
  roomCode?: string;
  playerName?: string;
}

export function App() {
  const [connectionState, setConnectionState] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [game, setGame] = useState<GameSnapshot | null>(null);
  const [prompt, setPrompt] = useState<ServerPrompt | null>(null);
  const [message, setMessage] = useState('');
  const [playerName, setPlayerName] = useState('Host');
  const [joinName, setJoinName] = useState('Guest');
  const [joinCode, setJoinCode] = useState('');
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<string>();
  const [previewSnapshot, setPreviewSnapshot] = useState<GameSnapshot>(() => createInitialSnapshot(defaultLobbySettings, 960));
  const [animationMs, setAnimationMs] = useState(0);
  const [storedSession, setStoredSession] = useState<StoredSession>(() => readStoredSession());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenPrompt, setShowFullscreenPrompt] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const latestTextState = useRef('{}');
  const previousPhase = useRef<RoomState['phase'] | undefined>(undefined);

  useEffect(() => {
    const socket = new WebSocket(resolveSocketUrl());
    socketRef.current = socket;

    socket.addEventListener('open', () => {
      setConnectionState('online');
      const session = readStoredSession();
      setStoredSession(session);
      if (session.roomCode && session.playerName) {
        sendMessage(socket, {
          type: 'join_room',
          roomCode: session.roomCode,
          playerName: session.playerName,
          sessionToken: session.sessionToken
        });
      }
    });

    socket.addEventListener('message', (event) => {
      handleServerMessage(JSON.parse(event.data) as ServerMessage);
    });

    socket.addEventListener('close', () => {
      setConnectionState('offline');
    });

    return () => socket.close();
  }, []);

  useEffect(() => {
    if (room) {
      setPreviewSnapshot(createInitialSnapshot(room.settings, 960));
    }
  }, [room]);

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

  useEffect(() => {
    const phase = room?.phase;
    if (phase === 'playing' && previousPhase.current !== 'playing') {
      setSelectedSquare(undefined);
      setShowFullscreenPrompt(true);
    }
    if (phase !== 'playing') setShowFullscreenPrompt(false);
    previousPhase.current = phase;
  }, [room?.phase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'f' || room?.phase !== 'playing') return;
      event.preventDefault();
      void toggleFullscreen();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [room?.phase]);

  const activeSettings = room?.settings ?? defaultLobbySettings;
  const theme = getBoardTheme(activeSettings.boardSwatchId);
  const palette = getPiecePalette(activeSettings.piecePaletteId);
  const currentSnapshot = game ?? previewSnapshot;
  const localColor = room ? resolveDisplaySeat(room, activeSettings) : 'white';
  const selectedPiece = currentSnapshot.pieces.find((piece) => piece.square === selectedSquare);
  const variant = getVariantDefinition(activeSettings.variant);
  const localPlayer = room ? currentPlayer(room) : undefined;
  const boardMessage = getBoardMessage(room, game, localColor, selectedSquare);
  const footerMessage =
    room?.phase === 'playing'
      ? `You are ${sideToColorName(localColor)}.`
      : room?.phase === 'finished'
        ? `Round finished. You played ${sideToColorName(localColor)}.`
        : `Previewing from the ${sideToColorName(localColor).toLowerCase()} seat.`;

  useEffect(() => {
    if (!game || !selectedSquare) return;
    const stillValid = game.pieces.some((piece) => piece.square === selectedSquare && piece.color === localColor);
    if (!stillValid || game.turn !== localColor || room?.phase !== 'playing') {
      setSelectedSquare(undefined);
    }
  }, [game, localColor, room?.phase, selectedSquare]);

  useEffect(() => {
    latestTextState.current = JSON.stringify({
      mode: room?.phase ?? 'landing',
      roomCode: room?.roomCode ?? null,
      variant: game?.variant ?? room?.settings.variant ?? defaultLobbySettings.variant,
      turn: game?.turn ?? null,
      localSeat: room?.localSeatColor ?? localColor,
      viewOrientation: localColor,
      selectedSquare: selectedSquare ?? null,
      status: game?.status ?? null,
      clocks: game?.clocks ?? null,
      boardTheme: activeSettings.boardSwatchId,
      fullscreenActive: isFullscreen,
      boardMessage,
      promptKind: prompt?.kind ?? null,
      pieces: game?.pieces.map((piece) => `${piece.color[0]}:${piece.role}:${piece.square}`) ?? [],
      legalMoves: selectedSquare ? game?.legalDestinations[selectedSquare] ?? [] : []
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
  }, [activeSettings.boardSwatchId, boardMessage, game, isFullscreen, localColor, prompt, room, selectedSquare]);

  function handleServerMessage(payload: ServerMessage) {
    if (payload.type === 'session') {
      const nextSession = {
        sessionToken: payload.session.sessionToken,
        roomCode: payload.session.roomCode,
        playerName: payload.session.playerName
      };
      setStoredSession(nextSession);
      writeStoredSession(nextSession);
      if (payload.session.playerName) {
        setPlayerName(payload.session.playerName);
        setJoinName(payload.session.playerName);
      }
      return;
    }
    if (payload.type === 'room_state') {
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
      return;
    }
    if (payload.type === 'error') {
      setMessage(payload.message);
    }
  }

  function dispatch(messageToSend: ClientMessage) {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setMessage('The connection to the host is not available.');
      return;
    }
    sendMessage(socketRef.current, messageToSend);
  }

  function handleCreateRoom() {
    dispatch({ type: 'create_room', playerName, sessionToken: storedSession.sessionToken });
  }

  function handleJoinRoom() {
    dispatch({ type: 'join_room', roomCode: joinCode.trim(), playerName: joinName, sessionToken: storedSession.sessionToken });
  }

  function updateSettings<K extends keyof LobbySettings>(key: K, value: LobbySettings[K]) {
    dispatch({ type: 'update_settings', settings: { [key]: value } as Partial<LobbySettings> });
  }

  function updateTheme(themeId: LobbySettings['themePreset']) {
    dispatch({ type: 'update_settings', settings: { themePreset: themeId, boardSwatchId: themeId } });
  }

  function handleSquareClick(square: string) {
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
    if (!prompt) return;
    if (prompt.kind === 'takeback_request') {
      dispatch({ type: 'respond_takeback', promptId: prompt.id, accept });
      setPrompt(null);
      return;
    }
    dispatch({ type: 'request_rematch', option: prompt.option ?? 'same', action: accept ? 'accept' : 'decline', promptId: prompt.id });
    setPrompt(null);
  }

  function requestRematch(option: RematchOption) {
    dispatch({ type: 'request_rematch', option, action: 'request' });
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
      className={room ? 'app-shell app-shell--room' : 'app-shell'}
      style={
        {
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
        } as React.CSSProperties
      }
    >
      <header className={`hero ${room ? 'hero--compact' : ''}`}>
        <div>
          <p className="eyebrow">LAN Casual Chess Party</p>
          <h1>Chess Party LAN</h1>
          <p className="subtitle">Premium local multiplayer chess with variant rules, themed tables, and a proper tabletop camera.</p>
        </div>
        <div className="hero-actions">
          {room ? <span className="room-code">Code {room.roomCode}</span> : null}
          <div className={`connection-pill connection-pill--${connectionState}`}>{connectionState}</div>
        </div>
      </header>

      {message ? (
        <button className="message-strip" type="button" onClick={() => setMessage('')}>
          {message}
        </button>
      ) : null}

      {!room ? (
        <section className="landing-grid">
          <article className="panel landing-card">
            <div className="panel-heading">
              <h2>Host Game</h2>
              <span className="support-copy">Runs on your LAN host</span>
            </div>
            <label className="field">
              <span>Display name</span>
              <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={20} />
            </label>
            <button className="primary-button" onClick={handleCreateRoom}>
              Host Game
            </button>
          </article>

          <article className="panel landing-card">
            <div className="panel-heading">
              <h2>Join Game</h2>
              <span className="support-copy">Open the host&apos;s LAN link first</span>
            </div>
            <label className="field">
              <span>Display name</span>
              <input value={joinName} onChange={(event) => setJoinName(event.target.value)} maxLength={20} />
            </label>
            <label className="field">
              <span>4-digit room code</span>
              <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, '').slice(0, 4))} />
            </label>
            <button className="secondary-button" onClick={handleJoinRoom}>
              Join Game
            </button>
          </article>

          <article className="panel panel--wide landing-guide">
            <div className="panel-title-row">
              <div>
                <h2>How This Works</h2>
                <p className="support-copy">Fast setup for two players on the same local network.</p>
              </div>
              <button className="ghost-button" onClick={() => setShowHowItWorks((current) => !current)}>
                {showHowItWorks ? 'Hide' : 'Show'}
              </button>
            </div>
            {showHowItWorks ? (
              <ol className="instruction-list">
                <li>One player runs `start-host.bat` and leaves the console window open.</li>
                <li>The host shares the LAN URL printed in that console.</li>
                <li>Both players open that page, then use the same 4-digit room code.</li>
                <li>Tune theme, board look, camera, and rules. Ready up when both players are set.</li>
                <li>In the match, select one of your pieces and then a highlighted square.</li>
              </ol>
            ) : (
              <p className="support-copy">The host creates the room, the guest joins from the host&apos;s LAN URL, and both browsers stay in sync over the local network.</p>
            )}
          </article>
        </section>
      ) : (
        <main className="room-layout">
          <section className="panel column setup-column">
            <div className="section-intro">
              <div>
                <p className="eyebrow">Room Setup</p>
                <h2>Customize The Table</h2>
              </div>
              <span className="status-pill status-pill--seat">{sideToColorName(localColor)}</span>
            </div>
            <p className="support-copy">Tune the room before kickoff. Every change syncs live to your brother before the match starts.</p>

            <SettingsGroup title="Mode">
              <select value={activeSettings.variant} onChange={(event) => updateSettings('variant', event.target.value as LobbySettings['variant'])} disabled={room.phase !== 'lobby'}>
                {['standard', 'chess960', 'king_of_the_hill', 'three_check', 'atomic'].map((option) => (
                  <option key={option} value={option}>
                    {getVariantDefinition(option as LobbySettings['variant']).label}
                  </option>
                ))}
              </select>
              <select value={activeSettings.sideAssignment} onChange={(event) => updateSettings('sideAssignment', event.target.value as LobbySettings['sideAssignment'])} disabled={room.phase !== 'lobby'}>
                <option value="host_light">Host Light Side</option>
                <option value="host_dark">Host Dark Side</option>
                <option value="random">Random</option>
              </select>
              <select value={activeSettings.takebackPolicy} onChange={(event) => updateSettings('takebackPolicy', event.target.value as LobbySettings['takebackPolicy'])} disabled={room.phase !== 'lobby'}>
                <option value="mutual">Takebacks by agreement</option>
                <option value="off">No takebacks</option>
              </select>
            </SettingsGroup>

            <SettingsGroup title="Clock">
              <select value={activeSettings.clockPreset} onChange={(event) => updateSettings('clockPreset', event.target.value as LobbySettings['clockPreset'])} disabled={room.phase !== 'lobby'}>
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
              <select value={activeSettings.boardSwatchId} onChange={(event) => updateTheme(event.target.value as LobbySettings['themePreset'])} disabled={room.phase !== 'lobby'}>
                {boardSwatches.map((swatch) => (
                  <option key={swatch.id} value={swatch.id}>
                    {swatch.name}
                  </option>
                ))}
              </select>
              <select value={activeSettings.piecePaletteId} onChange={(event) => updateSettings('piecePaletteId', event.target.value)} disabled={room.phase !== 'lobby'}>
                {piecePalettes.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
              <select value={activeSettings.pieceSetId} onChange={(event) => updateSettings('pieceSetId', event.target.value as LobbySettings['pieceSetId'])} disabled={room.phase !== 'lobby'}>
                {pieceSets.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
              <select value={activeSettings.scenePresetId} onChange={(event) => updateSettings('scenePresetId', event.target.value as LobbySettings['scenePresetId'])} disabled={room.phase !== 'lobby'}>
                {scenePresets.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
              <select value={activeSettings.cameraPreset} onChange={(event) => updateSettings('cameraPreset', event.target.value as LobbySettings['cameraPreset'])} disabled={room.phase !== 'lobby'}>
                <option value="cozy">Cozy Camera</option>
                <option value="competitive">Competitive Camera</option>
                <option value="dramatic">Dramatic Camera</option>
              </select>
              <select value={activeSettings.animationIntensity} onChange={(event) => updateSettings('animationIntensity', event.target.value as LobbySettings['animationIntensity'])} disabled={room.phase !== 'lobby'}>
                <option value="reduced">Reduced Motion</option>
                <option value="normal">Normal Motion</option>
                <option value="lively">Lively Motion</option>
              </select>
            </SettingsGroup>

            <div className="action-row action-row--stacked">
              {room.phase === 'lobby' ? (
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

              {room.phase === 'finished' ? (
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
                {room.phase === 'playing' ? (
                  <button className="ghost-button fullscreen-button" onClick={() => void toggleFullscreen()}>
                    {isFullscreen ? 'Exit Fullscreen' : 'Go Fullscreen'}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="board-status-banner">
              <span>{boardMessage}</span>
              <span>{room.phase === 'playing' ? 'Select a piece, then a highlighted square.' : 'Lobby preview is read-only.'}</span>
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
                interactive={room.phase === 'playing'}
                sceneMode={room.phase === 'lobby' ? 'preview' : 'match'}
                onSquareClick={handleSquareClick}
              />
            </div>

            <div className="board-footer">
              <span>{game ? game.outcomeText : 'Preview the table while you tune the room.'}</span>
              <span>{footerMessage}</span>
            </div>
          </section>

          <section className="panel column side-column">
            <div className="section-intro">
              <div>
                <p className="eyebrow">Match Rail</p>
                <h2>Players And Help</h2>
              </div>
              <span className="status-pill">{room.phase}</span>
            </div>

            <div className="player-list">
              {room.players.map((player) => (
                <div key={player.id} className={`player-card ${player.connected ? '' : 'player-card--offline'}`}>
                  <div>
                    <strong>{player.name}</strong>
                    <div className="support-copy">
                      {player.isHost ? 'Host' : 'Guest'}
                      {player.seatColor ? ` • ${sideToColorName(player.seatColor)}` : ''}
                    </div>
                  </div>
                  <span className={`status-pill ${player.ready ? 'status-pill--ready' : ''}`}>
                    {player.connected ? (player.ready ? 'Ready' : 'Waiting') : 'Disconnected'}
                  </span>
                </div>
              ))}
            </div>

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
              ) : room.phase === 'playing' ? (
                <p className="support-copy">Select one of your pieces to see how it moves before you commit the move.</p>
              ) : (
                <p className="support-copy">Once the match starts, select a piece to see its move pattern and quick reminder.</p>
              )}
            </section>

            <section className="subpanel subpanel--scroll">
              <h3>Move List</h3>
              <ol className="move-list">
                {(game?.sanHistory ?? []).map((entry, index) => (
                  <li key={`${entry}-${index}`}>
                    <span>{Math.floor(index / 2) + 1}.</span>
                    <span>{entry}</span>
                  </li>
                ))}
              </ol>
            </section>

            {room.phase === 'playing' ? (
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

      {prompt ? (
        <div className="prompt-backdrop">
          <div className="prompt-card">
            <p className="eyebrow">{prompt.kind === 'takeback_request' ? 'Takeback Request' : 'Rematch Request'}</p>
            <h2>{prompt.kind === 'takeback_request' ? 'Your brother wants to rewind the last move.' : 'A new round is ready.'}</h2>
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

      {showFullscreenPrompt && room?.phase === 'playing' ? (
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

function getBoardMessage(room: RoomState | null, game: GameSnapshot | null, localColor: 'white' | 'black', selectedSquare?: string) {
  if (!room) return 'Create or join a room to start a match.';
  if (room.phase === 'lobby') return `Previewing ${sideToColorName(localColor).toLowerCase()} perspective before the round begins.`;
  if (!game) return 'Waiting for the match state to arrive from the host.';
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

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
    debug_click_square: (square: string) => void;
    debug_move: (from: string, to: string) => void;
    debug_request_rematch: (option: RematchOption) => void;
    debug_respond_prompt: (accept: boolean) => void;
    debug_toggle_fullscreen: () => Promise<void>;
  }
}
