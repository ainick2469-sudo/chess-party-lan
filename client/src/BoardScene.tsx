import { Suspense, useEffect, useMemo, useRef, useState } from 'react';

import { OrbitControls, Text, useCursor } from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame, useLoader, useThree } from '@react-three/fiber';
import type { Color, Role } from 'chessops/types';
import { BackSide, Box3, Color as ThreeColor, DoubleSide, Group, MOUSE, Mesh, MeshStandardMaterial, Object3D, type PerspectiveCamera, Vector3 } from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

import {
  getBoardTheme,
  getPiecePalette,
  getPieceSet,
  getPieceYaw,
  getScenePreset,
  type AnimationIntensity,
  type CameraPreset,
  type GameSnapshot
} from '../../shared/src';

interface BoardSceneProps {
  snapshot: GameSnapshot;
  boardSwatchId: string;
  piecePaletteId: string;
  pieceSetId: string;
  scenePresetId: string;
  cameraPreset: CameraPreset;
  orientation: Color;
  animationIntensity: AnimationIntensity;
  animationMs: number;
  selectedSquare?: string;
  interactive?: boolean;
  sceneMode?: 'preview' | 'match';
  onSquareClick?: (square: string) => void;
}

const cameraProfiles: Record<CameraPreset, { distance: number; height: number; lateral: number; fov: number }> = {
  cozy: { distance: 8.8, height: 6.4, lateral: 2.4, fov: 34 },
  competitive: { distance: 7.5, height: 7.1, lateral: 1.55, fov: 29 },
  dramatic: { distance: 10.2, height: 8.2, lateral: 3.1, fov: 38 }
};

const motionProfiles: Record<AnimationIntensity, { bob: number }> = {
  reduced: { bob: 0.012 },
  normal: { bob: 0.024 },
  lively: { bob: 0.04 }
};

const pieceRoles: Role[] = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];

export function BoardScene({
  snapshot,
  boardSwatchId,
  piecePaletteId,
  pieceSetId,
  scenePresetId,
  cameraPreset,
  orientation,
  animationIntensity,
  animationMs,
  selectedSquare,
  interactive = true,
  sceneMode = 'match',
  onSquareClick
}: BoardSceneProps) {
  const theme = getBoardTheme(boardSwatchId);
  const palette = getPiecePalette(piecePaletteId);
  const pieceSet = getPieceSet(pieceSetId);
  const scenePreset = getScenePreset(scenePresetId);
  const [hoveredSquare, setHoveredSquare] = useState<string>();
  const legalMoves = selectedSquare ? snapshot.legalDestinations[selectedSquare] ?? [] : [];
  const lastMoveSquares = snapshot.lastMoveSquares ? [...snapshot.lastMoveSquares] : [];
  const focusSquare = selectedSquare ?? lastMoveSquares[1];

  useCursor(Boolean(hoveredSquare) && interactive);

  useEffect(() => {
    writeBoardSceneDebug({ scenePresetId: scenePreset.id, environmentKind: scenePreset.environmentKind, hasGlowOrb: false });
  }, [scenePreset.environmentKind, scenePreset.id]);

  return (
    <Canvas shadows camera={{ position: [0, 6, 9], fov: cameraProfiles[cameraPreset].fov }} style={{ width: '100%', height: '100%' }} onContextMenu={(event) => event.preventDefault()}>
      <color attach="background" args={[scenePreset.skyBottom]} />
      <fog attach="fog" args={[scenePreset.fogColor, scenePreset.fogNear, scenePreset.fogFar]} />
      <CameraRig cameraPreset={cameraPreset} orientation={orientation} focusSquare={focusSquare} sceneMode={sceneMode} status={snapshot.status} />

      <ambientLight intensity={0.9} color={theme.ambient} />
      <directionalLight castShadow intensity={1.28} position={[6.5, 11, 7]} color={scenePreset.fillLight} shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <directionalLight intensity={0.74} position={[-8, 6.4, -8]} color={scenePreset.rimLight} />
      <pointLight intensity={0.56} position={[0, 6.4, 0]} distance={28} color={scenePreset.tableGlow} />

      <group position={[0, -0.45, 0]}>
        <RoomEnvironment theme={theme} scenePreset={scenePreset} />
        <Tabletop theme={theme} />

        {Array.from({ length: 64 }, (_value, index) => {
          const square = indexToSquare(index);
          const position = boardPosition(square);
          const coords = squareToCoords(square);
          if (!coords) return null;

          const isLight = (coords.file + coords.rank) % 2 === 0;
          const color = resolveSquareColor({
            theme,
            isLight,
            isSelected: selectedSquare === square,
            isHovered: hoveredSquare === square,
            isLegal: legalMoves.includes(square),
            isLastMove: lastMoveSquares.includes(square)
          });

          return (
            <group key={square}>
              <mesh receiveShadow position={[position.x, 0, position.z]} onPointerOver={(event) => handlePointerOver(event, square, interactive, setHoveredSquare)} onPointerOut={(event) => handlePointerOut(event, setHoveredSquare)} onClick={(event) => handleSquareActivation(event, square, interactive, onSquareClick)}>
                <boxGeometry args={[0.98, 0.12, 0.98]} />
                <meshStandardMaterial color={color} metalness={selectedSquare === square ? 0.35 : 0.2} roughness={selectedSquare === square ? 0.24 : 0.56} emissive={selectedSquare === square || hoveredSquare === square || lastMoveSquares.includes(square) ? theme.glow : '#000000'} emissiveIntensity={selectedSquare === square ? 0.2 : hoveredSquare === square ? 0.08 : lastMoveSquares.includes(square) ? 0.06 : 0} />
              </mesh>
              {selectedSquare === square ? <SelectionFrame position={position} color={theme.glow} /> : null}
              {legalMoves.includes(square) ? <LegalMoveMarker position={position} color={theme.glow} /> : null}
            </group>
          );
        })}

        <Suspense fallback={<FallbackPieceLayer snapshot={snapshot} palette={palette} pieceSet={pieceSet} animationMs={animationMs} selectedSquare={selectedSquare} motion={motionProfiles[animationIntensity]} />}>
          <ImportedPieceLayer snapshot={snapshot} palette={palette} pieceSet={pieceSet} selectedSquare={selectedSquare} animationMs={animationMs} motion={motionProfiles[animationIntensity]} interactive={interactive} onSquareClick={onSquareClick} onHoverChange={setHoveredSquare} />
        </Suspense>

        <CoordinateLabels themeColor={theme.accent} orientation={orientation} />
      </group>
    </Canvas>
  );
}

function CameraRig({
  cameraPreset,
  orientation,
  focusSquare,
  sceneMode,
  status
}: {
  cameraPreset: CameraPreset;
  orientation: Color;
  focusSquare?: string;
  sceneMode: 'preview' | 'match';
  status: GameSnapshot['status'];
}) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<any>(null);
  const isDraggingRef = useRef(false);
  const animationRef = useRef({ ready: false, active: false, startedAt: 0, durationMs: 620, fromFov: cameraProfiles[cameraPreset].fov, toFov: cameraProfiles[cameraPreset].fov, fromPosition: new Vector3(), toPosition: new Vector3(), fromTarget: new Vector3(), toTarget: new Vector3() });
  const desiredPose = useMemo(() => buildCameraPose(cameraPreset, orientation, focusSquare, sceneMode, status), [cameraPreset, focusSquare, orientation, sceneMode, status]);

  useEffect(() => {
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    gl.domElement.addEventListener('contextmenu', preventContextMenu);
    return () => gl.domElement.removeEventListener('contextmenu', preventContextMenu);
  }, [gl]);

  useEffect(() => {
    const perspective = camera as PerspectiveCamera;
    const controls = controlsRef.current;
    if (!controls) return;

    if (!animationRef.current.ready) {
      perspective.position.copy(desiredPose.position);
      perspective.fov = desiredPose.fov;
      controls.target.copy(desiredPose.target);
      controls.update();
      perspective.updateProjectionMatrix();
      animationRef.current.ready = true;
      return;
    }

    animationRef.current.active = true;
    animationRef.current.startedAt = performance.now();
    animationRef.current.durationMs = sceneMode === 'preview' ? 760 : 580;
    animationRef.current.fromFov = perspective.fov;
    animationRef.current.toFov = desiredPose.fov;
    animationRef.current.fromPosition = perspective.position.clone();
    animationRef.current.toPosition = desiredPose.position.clone();
    animationRef.current.fromTarget = controls.target.clone();
    animationRef.current.toTarget = desiredPose.target.clone();
  }, [camera, desiredPose, sceneMode]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const perspective = camera as PerspectiveCamera;

    if (animationRef.current.active && !isDraggingRef.current) {
      const elapsed = Math.min(1, (performance.now() - animationRef.current.startedAt) / animationRef.current.durationMs);
      const eased = easeOutCubic(elapsed);
      perspective.position.lerpVectors(animationRef.current.fromPosition, animationRef.current.toPosition, eased);
      perspective.fov = animationRef.current.fromFov + (animationRef.current.toFov - animationRef.current.fromFov) * eased;
      controls.target.lerpVectors(animationRef.current.fromTarget, animationRef.current.toTarget, eased);
      perspective.updateProjectionMatrix();
      if (elapsed >= 1) animationRef.current.active = false;
    }

    controls.update();
    writeBoardSceneDebug({ orbitAzimuth: controls.getAzimuthalAngle(), orbitPolar: controls.getPolarAngle() });
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.84}
      zoomSpeed={0.94}
      minDistance={4.9}
      maxDistance={14}
      minPolarAngle={Math.PI / 5.2}
      maxPolarAngle={Math.PI / 2.06}
      mouseButtons={{ LEFT: undefined as never, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }}
      onStart={() => {
        isDraggingRef.current = true;
        animationRef.current.active = false;
      }}
      onEnd={() => {
        window.setTimeout(() => {
          isDraggingRef.current = false;
        }, 0);
      }}
    />
  );
}

function RoomEnvironment({
  theme,
  scenePreset
}: {
  theme: ReturnType<typeof getBoardTheme>;
  scenePreset: ReturnType<typeof getScenePreset>;
}) {
  switch (scenePreset.environmentKind) {
    case 'salon':
      return <StudyEnvironment theme={theme} scenePreset={scenePreset} />;
    case 'rooftop':
      return <NeonEnvironment theme={theme} scenePreset={scenePreset} />;
    case 'observatory':
      return <MarbleEnvironment theme={theme} scenePreset={scenePreset} />;
  }
}

function BaseEnvironmentShell({
  scenePreset,
  children
}: {
  scenePreset: ReturnType<typeof getScenePreset>;
  children: React.ReactNode;
}) {
  return (
    <>
      <mesh receiveShadow position={[0, -3.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[42, 42]} />
        <meshStandardMaterial color={scenePreset.floorColor} roughness={0.96} metalness={0.06} />
      </mesh>
      <mesh position={[0, 5.1, 0]}>
        <cylinderGeometry args={[20.5, 20.5, 16.4, 56, 1, true]} />
        <meshStandardMaterial color={scenePreset.skyBottom} side={BackSide} roughness={0.98} metalness={0.02} />
      </mesh>
      <mesh position={[0, 10.6, 0]}>
        <sphereGeometry args={[23.6, 40, 22, 0, Math.PI * 2, 0, Math.PI / 2.05]} />
        <meshBasicMaterial color={scenePreset.skyTop} side={BackSide} />
      </mesh>
      <mesh position={[0, -3.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[8.85, 19.8, 72]} />
        <meshBasicMaterial color={scenePreset.horizonGlow} transparent opacity={0.06} />
      </mesh>
      {children}
    </>
  );
}

function StudyEnvironment({
  theme,
  scenePreset
}: {
  theme: ReturnType<typeof getBoardTheme>;
  scenePreset: ReturnType<typeof getScenePreset>;
}) {
  return (
    <BaseEnvironmentShell scenePreset={scenePreset}>
      <mesh position={[0, 4.2, 0]}>
        <cylinderGeometry args={[15.8, 15.8, 9.8, 48, 1, true]} />
        <meshStandardMaterial color={scenePreset.architecturePrimary} side={BackSide} roughness={0.92} metalness={0.14} />
      </mesh>
      <mesh position={[0, 8.95, 0]}>
        <cylinderGeometry args={[15.95, 15.95, 0.62, 48]} />
        <meshStandardMaterial color={scenePreset.architectureSecondary} roughness={0.7} metalness={0.2} />
      </mesh>
      <mesh position={[0, 9.38, 0]}>
        <cylinderGeometry args={[16.1, 16.1, 0.12, 48]} />
        <meshStandardMaterial color={theme.glow} emissive={theme.glow} emissiveIntensity={0.08} roughness={0.4} metalness={0.22} />
      </mesh>
      {Array.from({ length: 8 }, (_value, index) => {
        const angle = (index / 8) * Math.PI * 2;
        const isWindowBay = index % 2 === 0;

        return (
          <group key={`study-bay-${index}`} rotation={[0, angle, 0]}>
            <mesh position={[0, 2.8, -15.25]}>
              <boxGeometry args={[3.7, 6.3, 0.4]} />
              <meshStandardMaterial color={scenePreset.architecturePrimary} roughness={0.88} metalness={0.08} />
            </mesh>
            <mesh position={[0, 5.95, -15.02]}>
              <boxGeometry args={[3.18, 0.38, 0.46]} />
              <meshStandardMaterial color={scenePreset.architectureSecondary} roughness={0.74} metalness={0.16} />
            </mesh>
            <mesh position={[-1.48, 2.8, -15.02]}>
              <boxGeometry args={[0.3, 6.2, 0.54]} />
              <meshStandardMaterial color={scenePreset.architectureSecondary} roughness={0.74} metalness={0.16} />
            </mesh>
            <mesh position={[1.48, 2.8, -15.02]}>
              <boxGeometry args={[0.3, 6.2, 0.54]} />
              <meshStandardMaterial color={scenePreset.architectureSecondary} roughness={0.74} metalness={0.16} />
            </mesh>
            {isWindowBay ? (
              <>
                <mesh position={[0, 2.95, -14.82]}>
                  <planeGeometry args={[1.62, 3.56]} />
                  <meshBasicMaterial color={scenePreset.windowGlow} transparent opacity={0.28} />
                </mesh>
                <mesh position={[0, 2.95, -14.88]}>
                  <planeGeometry args={[1.18, 3.18]} />
                  <meshBasicMaterial color={scenePreset.distantLight} transparent opacity={0.2} />
                </mesh>
              </>
            ) : (
              <group position={[0, 0, -14.93]}>
                {[1.2, 2.25, 3.3, 4.35].map((shelfY, shelfIndex) => (
                  <group key={`shelf-${index}-${shelfIndex}`}>
                    <mesh position={[0, shelfY, 0]}>
                      <boxGeometry args={[2.3, 0.1, 0.72]} />
                      <meshStandardMaterial color={scenePreset.architectureSecondary} roughness={0.78} metalness={0.14} />
                    </mesh>
                    {[-0.8, -0.3, 0.2, 0.75].map((bookX, bookIndex) => (
                      <mesh key={`book-${index}-${shelfIndex}-${bookIndex}`} position={[bookX, shelfY + 0.28, 0]}>
                        <boxGeometry args={[0.26, 0.62 + ((bookIndex + shelfIndex) % 2) * 0.18, 0.34]} />
                        <meshStandardMaterial color={bookIndex % 2 === 0 ? theme.border : scenePreset.architectureSecondary} roughness={0.84} metalness={0.06} />
                      </mesh>
                    ))}
                  </group>
                ))}
              </group>
            )}
          </group>
        );
      })}
      <DistantLightRing radius={17.8} count={30} color={scenePreset.distantLight} minY={0.6} maxY={6.2} opacity={0.4} />
    </BaseEnvironmentShell>
  );
}

function NeonEnvironment({
  theme,
  scenePreset
}: {
  theme: ReturnType<typeof getBoardTheme>;
  scenePreset: ReturnType<typeof getScenePreset>;
}) {
  return (
    <BaseEnvironmentShell scenePreset={scenePreset}>
      <mesh receiveShadow position={[0, -2.7, 0]}>
        <cylinderGeometry args={[16.4, 17.5, 1.05, 56]} />
        <meshStandardMaterial color={scenePreset.architecturePrimary} roughness={0.8} metalness={0.24} />
      </mesh>
      <mesh receiveShadow position={[0, -2.02, 0]}>
        <cylinderGeometry args={[15.2, 16.2, 0.16, 56]} />
        <meshStandardMaterial color={scenePreset.architectureSecondary} roughness={0.46} metalness={0.6} />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[11.9, 11.9, 2.9, 56, 1, true]} />
        <meshStandardMaterial color={scenePreset.windowGlow} transparent opacity={0.12} emissive={scenePreset.windowGlow} emissiveIntensity={0.08} roughness={0.08} metalness={0.78} />
      </mesh>
      <mesh position={[0, 2.58, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[11.92, 0.08, 12, 72]} />
        <meshStandardMaterial color={scenePreset.windowGlow} emissive={scenePreset.windowGlow} emissiveIntensity={0.16} roughness={0.24} metalness={0.82} />
      </mesh>
      <mesh position={[0, -0.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[11.92, 0.08, 12, 72]} />
        <meshStandardMaterial color={scenePreset.windowGlow} emissive={scenePreset.windowGlow} emissiveIntensity={0.12} roughness={0.24} metalness={0.82} />
      </mesh>
      {Array.from({ length: 12 }, (_value, index) => (
        <group key={`neon-fin-${index}`} rotation={[0, (index / 12) * Math.PI * 2, 0]}>
          <mesh position={[0, 2.9, -13.4]}>
            <boxGeometry args={[0.18, 5.1, 0.42]} />
            <meshStandardMaterial color={scenePreset.architectureSecondary} emissive={scenePreset.windowGlow} emissiveIntensity={0.26} roughness={0.32} metalness={0.78} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: 20 }, (_value, index) => {
        const width = 0.95 + (index % 3) * 0.32;
        const depth = 0.95 + (index % 4) * 0.24;
        const height = 3.2 + (index % 5) * 1.15 + (index % 2) * 0.35;
        return (
          <group key={`skyline-${index}`} rotation={[0, (index / 20) * Math.PI * 2, 0]}>
            <mesh position={[0, -1.55 + height / 2, -18.3]}>
              <boxGeometry args={[width, height, depth]} />
              <meshStandardMaterial color={scenePreset.architecturePrimary} roughness={0.64} metalness={0.38} />
            </mesh>
            <mesh position={[0, -1.1 + height / 2, -17.76]}>
              <planeGeometry args={[width * 0.64, Math.max(1.1, height * 0.7)]} />
              <meshBasicMaterial color={scenePreset.distantLight} transparent opacity={0.2 + (index % 3) * 0.06} />
            </mesh>
          </group>
        );
      })}
      <DistantLightRing radius={19.8} count={42} color={scenePreset.distantLight} minY={0.2} maxY={7.4} opacity={0.52} />
      <mesh position={[0, 7.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[13.2, 16.2, 72]} />
        <meshBasicMaterial color={scenePreset.horizonGlow} transparent opacity={0.09} />
      </mesh>
      <mesh position={[0, 10.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[8.8, 11.2, 72]} />
        <meshBasicMaterial color={theme.glow} transparent opacity={0.05} />
      </mesh>
    </BaseEnvironmentShell>
  );
}

function MarbleEnvironment({
  theme,
  scenePreset
}: {
  theme: ReturnType<typeof getBoardTheme>;
  scenePreset: ReturnType<typeof getScenePreset>;
}) {
  return (
    <BaseEnvironmentShell scenePreset={scenePreset}>
      <mesh receiveShadow position={[0, -2.8, 0]}>
        <cylinderGeometry args={[17.2, 17.9, 0.7, 56]} />
        <meshStandardMaterial color={scenePreset.architectureSecondary} roughness={0.78} metalness={0.18} />
      </mesh>
      <mesh receiveShadow position={[0, -2.32, 0]}>
        <cylinderGeometry args={[10.8, 11.4, 0.62, 56]} />
        <meshStandardMaterial color={scenePreset.architecturePrimary} roughness={0.82} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[10.4, 10.4, 0.9, 56, 1, true]} />
        <meshStandardMaterial color={scenePreset.architecturePrimary} roughness={0.86} metalness={0.06} />
      </mesh>
      {Array.from({ length: 10 }, (_value, index) => (
        <group key={`column-${index}`} rotation={[0, (index / 10) * Math.PI * 2, 0]}>
          <TempleColumn position={[0, 0.25, -13.3]} primary={scenePreset.architecturePrimary} secondary={scenePreset.architectureSecondary} />
        </group>
      ))}
      {Array.from({ length: 14 }, (_value, index) => {
        const height = 1.6 + (index % 4) * 0.75;
        const width = 1.6 + (index % 3) * 0.65;
        return (
          <group key={`cliff-${index}`} rotation={[0, (index / 14) * Math.PI * 2 + 0.18, 0]}>
            <mesh position={[0, -2.28 + height / 2, -18.2]}>
              <boxGeometry args={[width, height, 2.1]} />
              <meshStandardMaterial color={scenePreset.architectureSecondary} roughness={0.96} metalness={0.04} />
            </mesh>
          </group>
        );
      })}
      <mesh position={[0, 4.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[15.6, 0.36, 12, 96]} />
        <meshBasicMaterial color={scenePreset.horizonGlow} transparent opacity={0.08} />
      </mesh>
      <mesh position={[0, 6.2, 0]} rotation={[-Math.PI / 2, 0.3, 0]}>
        <torusGeometry args={[12.8, 0.28, 12, 84]} />
        <meshBasicMaterial color={scenePreset.windowGlow} transparent opacity={0.05} />
      </mesh>
      <DistantLightRing radius={19.4} count={22} color={scenePreset.distantLight} minY={4.2} maxY={9.4} opacity={0.18} />
      <mesh position={[0, 11.8, 0]}>
        <sphereGeometry args={[22.6, 36, 20, 0, Math.PI * 2, 0, Math.PI / 2.15]} />
        <meshBasicMaterial color={scenePreset.skyTop} side={BackSide} transparent opacity={0.92} />
      </mesh>
      <mesh position={[0, 1.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[9.6, 9.95, 64]} />
        <meshStandardMaterial color={theme.glow} emissive={theme.glow} emissiveIntensity={0.16} roughness={0.36} metalness={0.44} />
      </mesh>
    </BaseEnvironmentShell>
  );
}

function TempleColumn({
  position,
  primary,
  secondary
}: {
  position: [number, number, number];
  primary: string;
  secondary: string;
}) {
  return (
    <group position={position}>
      <mesh receiveShadow castShadow position={[0, -1.85, 0]}>
        <cylinderGeometry args={[0.58, 0.74, 0.42, 22]} />
        <meshStandardMaterial color={secondary} roughness={0.86} metalness={0.1} />
      </mesh>
      <mesh receiveShadow castShadow position={[0, 0, 0]}>
        <cylinderGeometry args={[0.42, 0.48, 3.8, 22]} />
        <meshStandardMaterial color={primary} roughness={0.88} metalness={0.06} />
      </mesh>
      <mesh receiveShadow castShadow position={[0, 2.1, 0]}>
        <cylinderGeometry args={[0.68, 0.54, 0.46, 22]} />
        <meshStandardMaterial color={secondary} roughness={0.82} metalness={0.12} />
      </mesh>
    </group>
  );
}

function DistantLightRing({
  radius,
  count,
  color,
  minY,
  maxY,
  opacity
}: {
  radius: number;
  count: number;
  color: string;
  minY: number;
  maxY: number;
  opacity: number;
}) {
  return (
    <>
      {Array.from({ length: count }, (_value, index) => {
        const angle = (index / count) * Math.PI * 2;
        const y = minY + (((index * 7) % 11) / 10) * (maxY - minY);
        const size = 0.08 + (index % 3) * 0.04;
        return (
          <mesh key={`distant-light-${radius}-${index}`} position={[Math.sin(angle) * radius, y, Math.cos(angle) * radius]}>
            <sphereGeometry args={[size, 10, 10]} />
            <meshBasicMaterial color={color} transparent opacity={opacity} />
          </mesh>
        );
      })}
    </>
  );
}

function Tabletop({ theme }: { theme: ReturnType<typeof getBoardTheme> }) {
  return (
    <>
      <mesh receiveShadow position={[0, -0.85, 0]}>
        <boxGeometry args={[11.3, 0.72, 11.3]} />
        <meshStandardMaterial color={theme.tableEdge} metalness={0.22} roughness={0.58} />
      </mesh>
      <mesh receiveShadow position={[0, -0.42, 0]}>
        <boxGeometry args={[10.2, 0.18, 10.2]} />
        <meshStandardMaterial color={theme.tableTop} metalness={0.16} roughness={0.66} />
      </mesh>
      <mesh receiveShadow position={[0, -0.08, 0]}>
        <boxGeometry args={[9.3, 0.18, 9.3]} />
        <meshStandardMaterial color={theme.border} metalness={0.26} roughness={0.52} />
      </mesh>
      <mesh receiveShadow position={[0, -0.02, 0]}>
        <boxGeometry args={[8.28, 0.08, 8.28]} />
        <meshStandardMaterial color={theme.innerBorder} metalness={0.18} roughness={0.6} />
      </mesh>
      <mesh receiveShadow position={[0, -1.9, 0]}>
        <cylinderGeometry args={[1.22, 1.5, 2.6, 40]} />
        <meshStandardMaterial color={theme.tableEdge} metalness={0.18} roughness={0.52} />
      </mesh>
      <mesh receiveShadow position={[0, -3.16, 0]}>
        <cylinderGeometry args={[3.8, 4.2, 0.3, 48]} />
        <meshStandardMaterial color={theme.tableTop} metalness={0.16} roughness={0.64} />
      </mesh>
    </>
  );
}

function SelectionFrame({ position, color }: { position: { x: number; z: number }; color: string }) {
  return (
    <mesh position={[position.x, 0.09, position.z]}>
      <boxGeometry args={[1.03, 0.02, 1.03]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.26} wireframe transparent opacity={0.9} />
    </mesh>
  );
}

function LegalMoveMarker({ position, color }: { position: { x: number; z: number }; color: string }) {
  return (
    <group position={[position.x, 0.13, position.z]}>
      <mesh>
        <cylinderGeometry args={[0.15, 0.15, 0.05, 28]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.34} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.2, 0.3, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

function ImportedPieceLayer({
  snapshot,
  palette,
  pieceSet,
  selectedSquare,
  animationMs,
  motion,
  interactive,
  onSquareClick,
  onHoverChange
}: {
  snapshot: GameSnapshot;
  palette: ReturnType<typeof getPiecePalette>;
  pieceSet: ReturnType<typeof getPieceSet>;
  selectedSquare?: string;
  animationMs: number;
  motion: { bob: number };
  interactive: boolean;
  onSquareClick?: (square: string) => void;
  onHoverChange: (square?: string) => void;
}) {
  const models = usePieceTemplates(pieceSet);

  return (
    <>
      {snapshot.pieces.map((piece) => {
        const position = boardPosition(piece.square);
        const hoverLift = selectedSquare === piece.square ? 0.18 : 0;
        const bob = Math.sin(animationMs / 360 + position.x * 0.5 + position.z * 0.2) * motion.bob;

        return (
          <group
            key={`${piece.square}-${piece.role}-${piece.color}`}
            position={[position.x, 0.13 + hoverLift + bob, position.z]}
            onPointerOver={(event) => handlePointerOver(event, piece.square, interactive, onHoverChange)}
            onPointerOut={(event) => handlePointerOut(event, onHoverChange)}
            onClick={(event) => handleSquareActivation(event, piece.square, interactive, onSquareClick)}
          >
            <PiecePedestal color={palette.metal} />
            <ImportedPieceModel role={piece.role} color={piece.color} selected={selectedSquare === piece.square} palette={palette} model={models[piece.role]} yaw={getPieceYaw(piece.role, piece.color, pieceSet)} />
          </group>
        );
      })}
    </>
  );
}

function FallbackPieceLayer({
  snapshot,
  palette,
  pieceSet,
  animationMs,
  selectedSquare,
  motion
}: {
  snapshot: GameSnapshot;
  palette: ReturnType<typeof getPiecePalette>;
  pieceSet: ReturnType<typeof getPieceSet>;
  animationMs: number;
  selectedSquare?: string;
  motion: { bob: number };
}) {
  return (
    <>
      {snapshot.pieces.map((piece) => {
        const position = boardPosition(piece.square);
        const hoverLift = selectedSquare === piece.square ? 0.18 : 0;
        const bob = Math.sin(animationMs / 360 + position.x * 0.5 + position.z * 0.2) * motion.bob;

        return (
          <group key={`${piece.square}-${piece.role}-${piece.color}`} position={[position.x, 0.13 + hoverLift + bob, position.z]}>
            <PiecePedestal color={palette.metal} />
            <FallbackPieceModel role={piece.role} color={piece.color} palette={palette} selected={selectedSquare === piece.square} yaw={getPieceYaw(piece.role, piece.color, pieceSet)} />
          </group>
        );
      })}
    </>
  );
}

function PiecePedestal({ color }: { color: string }) {
  return (
    <mesh castShadow receiveShadow position={[0, 0.04, 0]}>
      <cylinderGeometry args={[0.33, 0.37, 0.08, 28]} />
      <meshStandardMaterial color={color} metalness={0.72} roughness={0.24} />
    </mesh>
  );
}

function ImportedPieceModel({
  role,
  color,
  selected,
  palette,
  model,
  yaw
}: {
  role: Role;
  color: Color;
  selected: boolean;
  palette: ReturnType<typeof getPiecePalette>;
  model: Object3D;
  yaw: number;
}) {
  const materialColor = color === 'white' ? palette.lightBase : palette.darkBase;
  const accentColor = color === 'white' ? palette.lightAccent : palette.darkAccent;

  const object = useMemo(() => {
    const clone = model.clone(true);
    clone.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.material = new MeshStandardMaterial({
          color: materialColor,
          metalness: role === 'king' || role === 'queen' ? 0.34 : 0.28,
          roughness: role === 'pawn' ? 0.38 : 0.32,
          emissive: selected ? accentColor : '#000000',
          emissiveIntensity: selected ? 0.16 : 0,
          side: DoubleSide
        });
      }
    });
    return clone;
  }, [accentColor, materialColor, model, role, selected]);

  return (
    <group rotation={[0, yaw, 0]}>
      <primitive object={object} position={[0, 0.07, 0]} />
    </group>
  );
}

function FallbackPieceModel({
  role,
  color,
  palette,
  selected,
  yaw
}: {
  role: Role;
  color: Color;
  palette: ReturnType<typeof getPiecePalette>;
  selected: boolean;
  yaw: number;
}) {
  const mainColor = color === 'white' ? palette.lightBase : palette.darkBase;
  const accentColor = color === 'white' ? palette.lightAccent : palette.darkAccent;

  return (
    <group castShadow receiveShadow rotation={[0, yaw, 0]}>
      <mesh castShadow position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.2, 0.25, 0.5, 24]} />
        <meshStandardMaterial color={mainColor} metalness={0.28} roughness={0.38} emissive={selected ? accentColor : '#000000'} emissiveIntensity={selected ? 0.14 : 0} />
      </mesh>
      {pieceRoleGeometry(role, mainColor, accentColor)}
    </group>
  );
}

function CoordinateLabels({ themeColor, orientation }: { themeColor: string; orientation: Color }) {
  const fileLabels = orientation === 'white' ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];
  const filePositions = orientation === 'white' ? [-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5] : [3.5, 2.5, 1.5, 0.5, -0.5, -1.5, -2.5, -3.5];
  const rankLabels = orientation === 'white' ? ['1', '2', '3', '4', '5', '6', '7', '8'] : ['8', '7', '6', '5', '4', '3', '2', '1'];
  const rankPositions = orientation === 'white' ? [3.5, 2.5, 1.5, 0.5, -0.5, -1.5, -2.5, -3.5] : [-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5];
  const nearEdge = orientation === 'white' ? 4.14 : -4.14;
  const leftEdge = orientation === 'white' ? -4.18 : 4.18;

  return (
    <>
      {fileLabels.map((file, index) => (
        <Text key={`file-${file}`} position={[filePositions[index], 0.14, nearEdge]} rotation={orientation === 'white' ? [-Math.PI / 2, 0, 0] : [-Math.PI / 2, Math.PI, 0]} fontSize={0.18} color={themeColor} anchorX="center" anchorY="middle">
          {file}
        </Text>
      ))}
      {rankLabels.map((rank, index) => (
        <Text key={`rank-${rank}`} position={[leftEdge, 0.14, rankPositions[index]]} rotation={orientation === 'white' ? [-Math.PI / 2, 0, 0] : [-Math.PI / 2, Math.PI, 0]} fontSize={0.18} color={themeColor} anchorX="center" anchorY="middle">
          {rank}
        </Text>
      ))}
    </>
  );
}

function pieceRoleGeometry(role: Role, mainColor: string, accentColor: string) {
  switch (role) {
    case 'pawn':
      return (
        <>
          <mesh castShadow position={[0, 0.7, 0]}>
            <sphereGeometry args={[0.16, 20, 20]} />
            <meshStandardMaterial color={mainColor} metalness={0.24} roughness={0.34} />
          </mesh>
          <mesh castShadow position={[0, 0.56, 0]}>
            <cylinderGeometry args={[0.11, 0.16, 0.12, 18]} />
            <meshStandardMaterial color={accentColor} metalness={0.32} roughness={0.28} />
          </mesh>
        </>
      );
    case 'rook':
      return (
        <>
          <mesh castShadow position={[0, 0.78, 0]}>
            <boxGeometry args={[0.34, 0.18, 0.34]} />
            <meshStandardMaterial color={mainColor} metalness={0.3} roughness={0.34} />
          </mesh>
          {[-0.11, 0, 0.11].map((offset) => (
            <mesh key={`rook-tooth-${offset}`} castShadow position={[offset, 0.94, 0]}>
              <boxGeometry args={[0.08, 0.1, 0.08]} />
              <meshStandardMaterial color={accentColor} metalness={0.38} roughness={0.26} />
            </mesh>
          ))}
        </>
      );
    case 'knight':
      return (
        <>
          <mesh castShadow position={[0, 0.68, 0.03]} rotation={[0.18, 0, 0]}>
            <boxGeometry args={[0.18, 0.46, 0.42]} />
            <meshStandardMaterial color={mainColor} metalness={0.28} roughness={0.34} />
          </mesh>
          <mesh castShadow position={[0, 0.92, 0.1]} rotation={[0.35, 0, 0]}>
            <coneGeometry args={[0.16, 0.42, 4]} />
            <meshStandardMaterial color={mainColor} metalness={0.3} roughness={0.32} />
          </mesh>
          <mesh castShadow position={[0.08, 1.1, 0.16]} rotation={[0, 0, -0.2]}>
            <coneGeometry args={[0.05, 0.18, 4]} />
            <meshStandardMaterial color={accentColor} metalness={0.36} roughness={0.26} />
          </mesh>
        </>
      );
    case 'bishop':
      return (
        <>
          <mesh castShadow position={[0, 0.84, 0]}>
            <coneGeometry args={[0.18, 0.52, 22]} />
            <meshStandardMaterial color={mainColor} metalness={0.28} roughness={0.3} />
          </mesh>
          <mesh castShadow position={[0, 1.07, 0]}>
            <sphereGeometry args={[0.11, 18, 18]} />
            <meshStandardMaterial color={accentColor} metalness={0.38} roughness={0.26} />
          </mesh>
        </>
      );
    case 'queen':
      return (
        <>
          <mesh castShadow position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.12, 0.19, 0.58, 22]} />
            <meshStandardMaterial color={mainColor} metalness={0.32} roughness={0.3} />
          </mesh>
          <mesh castShadow position={[0, 1.22, 0]}>
            <torusGeometry args={[0.13, 0.035, 10, 20]} />
            <meshStandardMaterial color={accentColor} metalness={0.44} roughness={0.2} />
          </mesh>
          {[-0.16, 0, 0.16].map((offset) => (
            <mesh key={`queen-crown-${offset}`} castShadow position={[offset, 1.28, 0]}>
              <sphereGeometry args={[0.05, 12, 12]} />
              <meshStandardMaterial color={accentColor} metalness={0.46} roughness={0.2} />
            </mesh>
          ))}
        </>
      );
    case 'king':
      return (
        <>
          <mesh castShadow position={[0, 0.92, 0]}>
            <cylinderGeometry args={[0.12, 0.2, 0.64, 22]} />
            <meshStandardMaterial color={mainColor} metalness={0.32} roughness={0.3} />
          </mesh>
          <mesh castShadow position={[0, 1.28, 0]}>
            <boxGeometry args={[0.08, 0.26, 0.08]} />
            <meshStandardMaterial color={accentColor} metalness={0.46} roughness={0.2} />
          </mesh>
          <mesh castShadow position={[0, 1.34, 0]}>
            <boxGeometry args={[0.24, 0.07, 0.07]} />
            <meshStandardMaterial color={accentColor} metalness={0.46} roughness={0.2} />
          </mesh>
        </>
      );
  }
}

function usePieceTemplates(pieceSet: ReturnType<typeof getPieceSet>) {
  const sourcePaths = useMemo(
    () => pieceRoles.map((role) => `${pieceSet.basePath}/${pieceSet.files[role]}`),
    [pieceSet]
  );
  const loaded = useLoader(OBJLoader, sourcePaths) as Group[];

  return useMemo(() => {
    const normalizedEntries = pieceRoles.map((role, index) => {
      const root = new Group();
      const model = loaded[index].clone(true);
      model.rotation.set(...pieceSet.importRotation);
      root.add(model);
      root.updateMatrixWorld(true);

      const initialBounds = new Box3().setFromObject(root);
      const size = new Vector3();
      initialBounds.getSize(size);
      const targetHeight = pieceSet.targetHeights[role];
      const scale = targetHeight / Math.max(size.y, 0.001);
      root.scale.setScalar(scale);
      root.updateMatrixWorld(true);

      const normalizedBounds = new Box3().setFromObject(root);
      const center = normalizedBounds.getCenter(new Vector3());
      root.position.set(-center.x, -normalizedBounds.min.y, -center.z);
      root.updateMatrixWorld(true);

      return [role, root] as const;
    });

    return Object.fromEntries(normalizedEntries) as unknown as Record<Role, Object3D>;
  }, [loaded, pieceSet]);
}

function handleSquareActivation(
  event: ThreeEvent<MouseEvent>,
  square: string,
  interactive: boolean,
  onSquareClick?: (square: string) => void
) {
  event.stopPropagation();
  if (!interactive || !onSquareClick) return;
  onSquareClick(square);
}

function handlePointerOver(
  event: ThreeEvent<PointerEvent>,
  square: string,
  interactive: boolean,
  setHoveredSquare: (square?: string) => void
) {
  event.stopPropagation();
  if (!interactive) return;
  setHoveredSquare(square);
}

function handlePointerOut(event: ThreeEvent<PointerEvent>, setHoveredSquare: (square?: string) => void) {
  event.stopPropagation();
  setHoveredSquare(undefined);
}

function resolveSquareColor({
  theme,
  isLight,
  isSelected,
  isHovered,
  isLegal,
  isLastMove
}: {
  theme: ReturnType<typeof getBoardTheme>;
  isLight: boolean;
  isSelected: boolean;
  isHovered: boolean;
  isLegal: boolean;
  isLastMove: boolean;
}) {
  let color = isLight ? theme.lightSquare : theme.darkSquare;

  if (isLastMove) color = mixColor(color, theme.glow, 0.12);
  if (isLegal) color = mixColor(color, theme.glow, 0.18);
  if (isHovered) color = mixColor(color, theme.accent, 0.14);
  if (isSelected) color = mixColor(color, theme.accent, 0.28);

  return color;
}

function mixColor(from: string, to: string, amount: number) {
  return `#${new ThreeColor(from).lerp(new ThreeColor(to), amount).getHexString()}`;
}

function boardPosition(square: string) {
  const coords = squareToCoords(square);
  if (!coords) return { x: 0, z: 0 };

  return {
    x: coords.file - 3.5,
    z: 3.5 - coords.rank
  };
}

function buildCameraPose(
  cameraPreset: CameraPreset,
  orientation: Color,
  focusSquare: string | undefined,
  sceneMode: 'preview' | 'match',
  status: GameSnapshot['status']
) {
  const profile = cameraProfiles[cameraPreset];
  const sideSign = orientation === 'white' ? 1 : -1;
  const focus = focusSquare ? boardPosition(focusSquare) : { x: 0, z: 0 };
  const target = new Vector3(focus.x * 0.22, sceneMode === 'preview' ? 0.3 : 0.18, focus.z * 0.12);
  const isSettledResult = status !== 'active' && status !== 'waiting';
  const extraHeight = sceneMode === 'preview' ? 0.65 : isSettledResult ? 0.35 : 0;
  const distanceBoost = sceneMode === 'preview' ? 0.55 : isSettledResult ? 0.35 : 0;
  const position = new Vector3(
    profile.lateral * sideSign + focus.x * 0.08,
    profile.height + extraHeight,
    profile.distance * sideSign + focus.z * 0.12
  );

  return {
    position,
    target,
    fov: profile.fov + (distanceBoost > 0 ? 1.2 : 0)
  };
}

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3;
}

function squareToCoords(square: string) {
  if (!/^[a-h][1-8]$/.test(square)) return null;

  return {
    file: square.charCodeAt(0) - 97,
    rank: Number(square[1]) - 1
  };
}

function indexToSquare(index: number) {
  const file = index % 8;
  const rank = 7 - Math.floor(index / 8);
  return `${String.fromCharCode(97 + file)}${rank + 1}`;
}

function writeBoardSceneDebug(patch: Record<string, unknown>) {
  const debugWindow = window as Window & { __boardSceneDebug?: Record<string, unknown> };
  debugWindow.__boardSceneDebug = {
    ...(debugWindow.__boardSceneDebug ?? {}),
    ...patch
  };
}
