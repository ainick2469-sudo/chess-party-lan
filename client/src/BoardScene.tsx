import { Suspense, useMemo, useRef, useState } from 'react';

import { Text, useCursor } from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame, useLoader, useThree } from '@react-three/fiber';
import type { Color, Role } from 'chessops/types';
import {
  Box3,
  Color as ThreeColor,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  type PerspectiveCamera,
  Vector3
} from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

import {
  getBoardTheme,
  getPiecePalette,
  getPieceSet,
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

const motionProfiles: Record<AnimationIntensity, { bob: number; speed: number }> = {
  reduced: { bob: 0.012, speed: 2.8 },
  normal: { bob: 0.024, speed: 4.2 },
  lively: { bob: 0.04, speed: 5.4 }
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

  return (
    <Canvas shadows camera={{ position: [0, 6, 9], fov: cameraProfiles[cameraPreset].fov }} style={{ width: '100%', height: '100%' }}>
      <color attach="background" args={[theme.backgroundBottom]} />
      <fog attach="fog" args={[scenePreset.fogColor, 14, 36]} />
      <CameraRig
        cameraPreset={cameraPreset}
        orientation={orientation}
        focusSquare={focusSquare}
        motion={motionProfiles[animationIntensity]}
        sceneMode={sceneMode}
        status={snapshot.status}
      />

      <ambientLight intensity={0.88} color={theme.ambient} />
      <directionalLight
        castShadow
        intensity={1.35}
        position={[6.5, 11, 7]}
        color={scenePreset.fillLight}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight intensity={0.7} position={[-8, 5, -8]} color={scenePreset.rimLight} />
      <pointLight intensity={0.8} position={[0, 2.4, 0]} distance={16} color={scenePreset.tableGlow} />

      <group position={[0, -0.45, 0]}>
        <RoomEnvironment theme={theme} scenePreset={scenePreset} />
        <Tabletop theme={theme} />

        {Array.from({ length: 64 }, (_value, index) => {
          const square = indexToSquare(index);
          const position = boardPosition(square);
          const coords = squareToCoords(square);
          if (!coords) return null;

          const isLight = (coords.file + coords.rank) % 2 === 0;
          const isSelected = selectedSquare === square;
          const isHovered = hoveredSquare === square;
          const isLegal = legalMoves.includes(square);
          const isLastMove = lastMoveSquares.includes(square);
          const color = resolveSquareColor({
            theme,
            isLight,
            isSelected,
            isHovered,
            isLegal,
            isLastMove
          });

          return (
            <group key={square}>
              <mesh
                receiveShadow
                position={[position.x, 0, position.z]}
                onPointerOver={(event) => handlePointerOver(event, square, interactive, setHoveredSquare)}
                onPointerOut={(event) => handlePointerOut(event, square, setHoveredSquare)}
                onClick={(event) => handleSquareActivation(event, square, interactive, onSquareClick)}
              >
                <boxGeometry args={[0.98, 0.12, 0.98]} />
                <meshStandardMaterial
                  color={color}
                  metalness={isSelected ? 0.35 : 0.2}
                  roughness={isSelected ? 0.24 : 0.56}
                  emissive={isSelected || isHovered || isLastMove ? theme.glow : '#000000'}
                  emissiveIntensity={isSelected ? 0.2 : isHovered ? 0.08 : isLastMove ? 0.06 : 0}
                />
              </mesh>

              {isSelected ? <SelectionFrame position={position} color={theme.glow} /> : null}
              {isLegal ? <LegalMoveMarker position={position} color={theme.glow} /> : null}
            </group>
          );
        })}

        <Suspense fallback={<FallbackPieceLayer snapshot={snapshot} palette={palette} animationMs={animationMs} selectedSquare={selectedSquare} motion={motionProfiles[animationIntensity]} />}>
          <ImportedPieceLayer
            snapshot={snapshot}
            palette={palette}
            pieceSet={pieceSet}
            selectedSquare={selectedSquare}
            animationMs={animationMs}
            motion={motionProfiles[animationIntensity]}
            interactive={interactive}
            onSquareClick={onSquareClick}
            onHoverChange={setHoveredSquare}
          />
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
  motion,
  sceneMode,
  status
}: {
  cameraPreset: CameraPreset;
  orientation: Color;
  focusSquare?: string;
  motion: { bob: number; speed: number };
  sceneMode: 'preview' | 'match';
  status: GameSnapshot['status'];
}) {
  const { camera } = useThree();
  const lookAtRef = useRef(new Vector3(0, 0.15, 0));
  const rig = cameraProfiles[cameraPreset];

  useFrame((_state, delta) => {
    const perspective = camera as PerspectiveCamera;
    const side = orientation === 'white' ? 1 : -1;
    const focus = focusSquare ? boardPosition(focusSquare) : { x: 0, z: 0 };
    const distance = sceneMode === 'preview' ? rig.distance * 1.18 : rig.distance;
    const lift = status === 'active' ? 1 : 1.12;
    const targetPosition = new Vector3(
      side * -rig.lateral + focus.x * 0.12,
      rig.height * lift,
      side * distance + focus.z * 0.16
    );
    const targetLookAt = new Vector3(focus.x * 0.22, 0.28, focus.z * 0.16);
    const lerpFactor = 1 - Math.exp(-delta * motion.speed);

    perspective.fov += (rig.fov - perspective.fov) * lerpFactor;
    perspective.position.lerp(targetPosition, lerpFactor);
    lookAtRef.current.lerp(targetLookAt, lerpFactor);
    perspective.lookAt(lookAtRef.current);
    perspective.updateProjectionMatrix();
  });

  return null;
}

function RoomEnvironment({
  theme,
  scenePreset
}: {
  theme: ReturnType<typeof getBoardTheme>;
  scenePreset: ReturnType<typeof getScenePreset>;
}) {
  return (
    <>
      <mesh receiveShadow position={[0, -3.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[34, 34]} />
        <meshStandardMaterial color={theme.floor} roughness={0.94} metalness={0.05} />
      </mesh>
      <mesh position={[0, 7.4, -14]} receiveShadow>
        <planeGeometry args={[30, 18]} />
        <meshStandardMaterial color={scenePreset.wallColor} roughness={0.96} metalness={0.04} />
      </mesh>
      <mesh position={[0, 7.35, -13.95]}>
        <planeGeometry args={[18, 8.5]} />
        <meshStandardMaterial color={scenePreset.wallAccent} emissive={theme.roomGlow} emissiveIntensity={0.08} roughness={0.9} metalness={0.08} />
      </mesh>
      <mesh position={[-9.5, 4.2, -9.5]} rotation={[0, Math.PI / 5, 0]}>
        <boxGeometry args={[1.2, 6.4, 1.2]} />
        <meshStandardMaterial color={theme.tableEdge} roughness={0.6} metalness={0.25} />
      </mesh>
      <mesh position={[9.5, 4.2, -9.5]} rotation={[0, -Math.PI / 5, 0]}>
        <boxGeometry args={[1.2, 6.4, 1.2]} />
        <meshStandardMaterial color={theme.tableEdge} roughness={0.6} metalness={0.25} />
      </mesh>
      <mesh position={[0, 3.1, -7.8]}>
        <sphereGeometry args={[1.35, 28, 28]} />
        <meshStandardMaterial color={theme.roomGlow} emissive={theme.roomGlow} emissiveIntensity={0.16} transparent opacity={0.32} depthWrite={false} />
      </mesh>
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
  motion: { bob: number; speed: number };
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
            onPointerOut={(event) => handlePointerOut(event, piece.square, onHoverChange)}
            onClick={(event) => handleSquareActivation(event, piece.square, interactive, onSquareClick)}
          >
            <PiecePedestal color={palette.metal} />
            <ImportedPieceModel
              role={piece.role}
              color={piece.color}
              selected={selectedSquare === piece.square}
              palette={palette}
              model={models[piece.role]}
            />
          </group>
        );
      })}
    </>
  );
}

function FallbackPieceLayer({
  snapshot,
  palette,
  animationMs,
  selectedSquare,
  motion
}: {
  snapshot: GameSnapshot;
  palette: ReturnType<typeof getPiecePalette>;
  animationMs: number;
  selectedSquare?: string;
  motion: { bob: number; speed: number };
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
            <FallbackPieceModel role={piece.role} color={piece.color} palette={palette} selected={selectedSquare === piece.square} />
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
  model
}: {
  role: Role;
  color: Color;
  selected: boolean;
  palette: ReturnType<typeof getPiecePalette>;
  model: Object3D;
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
          metalness: 0.3,
          roughness: 0.34,
          emissive: selected ? accentColor : '#000000',
          emissiveIntensity: selected ? 0.16 : 0
        });
      }
    });
    return clone;
  }, [accentColor, materialColor, model, selected]);

  return <primitive object={object} position={[0, 0.07, 0]} />;
}

function FallbackPieceModel({
  role,
  color,
  palette,
  selected
}: {
  role: Role;
  color: Color;
  palette: ReturnType<typeof getPiecePalette>;
  selected: boolean;
}) {
  const mainColor = color === 'white' ? palette.lightBase : palette.darkBase;
  const accentColor = color === 'white' ? palette.lightAccent : palette.darkAccent;

  return (
    <group castShadow receiveShadow>
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
        <Text
          key={`file-${file}`}
          position={[filePositions[index], 0.14, nearEdge]}
          rotation={orientation === 'white' ? [-Math.PI / 2, 0, 0] : [-Math.PI / 2, Math.PI, 0]}
          fontSize={0.18}
          color={themeColor}
          anchorX="center"
          anchorY="middle"
        >
          {file}
        </Text>
      ))}
      {rankLabels.map((rank, index) => (
        <Text
          key={`rank-${rank}`}
          position={[leftEdge, 0.14, rankPositions[index]]}
          rotation={orientation === 'white' ? [-Math.PI / 2, 0, 0] : [-Math.PI / 2, Math.PI, 0]}
          fontSize={0.18}
          color={themeColor}
          anchorX="center"
          anchorY="middle"
        >
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
          <mesh castShadow position={[0, 0.64, 0]}>
            <sphereGeometry args={[0.16, 24, 24]} />
            <meshStandardMaterial color={accentColor} metalness={0.16} roughness={0.3} />
          </mesh>
        </>
      );
    case 'knight':
      return (
        <mesh castShadow position={[0.04, 0.7, 0]}>
          <coneGeometry args={[0.22, 0.5, 5]} />
          <meshStandardMaterial color={accentColor} metalness={0.24} roughness={0.32} />
        </mesh>
      );
    case 'bishop':
      return (
        <mesh castShadow position={[0, 0.84, 0]}>
          <sphereGeometry args={[0.18, 24, 24]} />
          <meshStandardMaterial color={accentColor} metalness={0.22} roughness={0.28} />
        </mesh>
      );
    case 'rook':
      return (
        <mesh castShadow position={[0, 0.76, 0]}>
          <boxGeometry args={[0.32, 0.16, 0.32]} />
          <meshStandardMaterial color={accentColor} metalness={0.22} roughness={0.34} />
        </mesh>
      );
    case 'queen':
      return (
        <>
          <mesh castShadow position={[0, 0.88, 0]}>
            <torusGeometry args={[0.12, 0.03, 12, 20]} />
            <meshStandardMaterial color={accentColor} metalness={0.32} roughness={0.24} />
          </mesh>
          <mesh castShadow position={[0, 1.03, 0]}>
            <sphereGeometry args={[0.12, 24, 24]} />
            <meshStandardMaterial color={accentColor} metalness={0.22} roughness={0.28} />
          </mesh>
        </>
      );
    case 'king':
      return (
        <>
          <mesh castShadow position={[0, 0.92, 0]}>
            <boxGeometry args={[0.09, 0.32, 0.09]} />
            <meshStandardMaterial color={accentColor} metalness={0.34} roughness={0.24} />
          </mesh>
          <mesh castShadow position={[0, 0.92, 0]}>
            <boxGeometry args={[0.3, 0.08, 0.08]} />
            <meshStandardMaterial color={accentColor} metalness={0.34} roughness={0.24} />
          </mesh>
        </>
      );
  }
}

function usePieceTemplates(pieceSet: ReturnType<typeof getPieceSet>) {
  const urls = useMemo(() => pieceRoles.map((role) => `${pieceSet.basePath}/${pieceSet.files[role]}`), [pieceSet]);
  const loaded = useLoader(OBJLoader, urls);

  return useMemo(() => {
    const mapped = {} as Record<Role, Object3D>;

    pieceRoles.forEach((role, index) => {
      const normalizedRoot = new Group();
      const source = loaded[index].clone(true);
      const bounds = new Box3().setFromObject(source);
      const size = bounds.getSize(new Vector3());
      const center = bounds.getCenter(new Vector3());
      const scale = pieceSet.targetHeights[role] / Math.max(size.y, 0.001);

      source.position.set(-center.x, -bounds.min.y, -center.z);
      source.scale.setScalar(scale);
      source.rotation.y = pieceSet.rotationY;
      normalizedRoot.add(source);
      mapped[role] = normalizedRoot;
    });

    return mapped;
  }, [loaded, pieceSet]);
}

function handleSquareActivation(
  event: ThreeEvent<MouseEvent>,
  square: string,
  interactive: boolean,
  onSquareClick?: (square: string) => void
) {
  event.stopPropagation();
  if (!interactive) return;
  onSquareClick?.(square);
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

function handlePointerOut(
  event: ThreeEvent<PointerEvent>,
  _square: string,
  setHoveredSquare: (square?: string) => void
) {
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
  const base = isLight ? theme.lightSquare : theme.darkSquare;
  if (isSelected) return mixColor(base, theme.accent, 0.55);
  if (isHovered) return mixColor(base, theme.glow, 0.28);
  if (isLastMove) return mixColor(base, theme.glow, 0.2);
  if (isLegal) return mixColor(base, theme.accent, 0.12);
  return base;
}

function mixColor(a: string, b: string, amount: number) {
  const mixed = new ThreeColor(a);
  mixed.lerp(new ThreeColor(b), amount);
  return `#${mixed.getHexString()}`;
}

function boardPosition(square: string) {
  const coords = squareToCoords(square);
  if (!coords) {
    return { x: 0, z: 0 };
  }

  return {
    x: coords.file - 3.5,
    z: 3.5 - coords.rank
  };
}

function squareToCoords(square: string) {
  if (square.length < 2) return undefined;
  const file = 'abcdefgh'.indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  if (file < 0 || Number.isNaN(rank) || rank < 0 || rank > 7) return undefined;
  return { file, rank };
}

function indexToSquare(index: number) {
  const file = 'abcdefgh'[index % 8];
  const rank = String(Math.floor(index / 8) + 1);
  return `${file}${rank}`;
}
