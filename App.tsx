import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";
import { User } from "firebase/auth";
import { loginAnonymously } from "./src/firebase/firebase";import {
  createRoom,
  joinRoom,
  subscribeToRoom,
  updateOnlineGameState,
  OnlineGameDoc,
} from "./src/online/onlineService";
declare const require: any;

type PlayerId = 1 | 2;
type Orientation = "H" | "V";
type Mode = "MOVE" | "WALL";
type Screen =
  | "HOME"
  | "DIFFICULTY"
  | "ONLINE"
  | "TUTORIAL"
  | "SETTINGS"
  | "PROFILE"
  | "GAME_MODE"
  | "GAME";
type Difficulty = "EASY" | "MEDIUM" | "HARD";
type GameMode =
  | "CLASSIC"
  | "BLITZ"
  | "MAZE"
  | "PUZZLE"
  | "TIMED"
  | "WIN_STREAK"
  | "MOVE_LIMIT";
type DailyTaskType = "WIN_MATCHES" | "PLACE_WALLS" | "PLAY_MATCHES";

type Position = {
  row: number;
  col: number;
};

type Wall = {
  row: number;
  col: number;
  orientation: Orientation;
};

type ProfileStats = {
  wins: number;
  losses: number;
};

type DailyTask = {
  id: string;
  type: DailyTaskType;
  title: string;
  target: number;
  progress: number;
  rewardXp: number;
  dateKey: string;
  refreshedDateKey: string | null;
  claimed: boolean;
};

type StreakState = {
  count: number;
  lastVisitDateKey: string | null;
};

type WeeklyChest = {
  weekKey: string;
  completedTasks: number;
  claimed: boolean;
};

type LastAction =
  | {
      type: "MOVE";
      player: PlayerId;
      from: Position;
      to: Position;
    }
  | {
      type: "WALL";
      player: PlayerId;
      wall: Wall;
    }
  | null;

type GameState = {
  pawns: Record<PlayerId, Position>;
  previousPawns: Record<PlayerId, Position | null>;
  currentPlayer: PlayerId;
  walls: Wall[];
  wallsLeft: Record<PlayerId, number>;
  winner: PlayerId | null;
  lastAction: LastAction;
};

type WallPlacementResult =
  | { status: "OK"; wall: Wall }
  | { status: "NO_WALLS" }
  | { status: "GEOMETRY_INVALID" }
  | { status: "PATH_BLOCKED" };

const BOARD_SIZE = 9;
const WALLS_PER_PLAYER = 10;
const MATCH_DURATION_SECONDS = 5 * 60;
const MATCH_HAS_TIMER = true;
const CONFETTI_COUNT = 32;
const WALL_COLOR = "#d8bd86";
const LAST_WALL_COLOR = "#ead6a8";
const PROFILE_STORAGE_KEY = "wall_chess_profile_v1";
const AVATAR_OPTIONS = ["♜", "●", "◆", "▲", "W", "★"];

const GAME_MODE_CONFIG: Record<
  GameMode,
  {
    title: string;
    subtitle: string;
    wallsPerPlayer: number;
    hasTimer: boolean;
    durationSeconds: number;
    moveLimit: number | null;
  }
> = {
  CLASSIC: {
    title: "Klasik",
    subtitle: "Standart Pathlock maçı",
    wallsPerPlayer: 10,
    hasTimer: false,
    durationSeconds: MATCH_DURATION_SECONDS,
    moveLimit: null,
  },
  BLITZ: {
    title: "Blitz",
    subtitle: "90 saniye, az duvar, agresif AI",
    wallsPerPlayer: 5,
    hasTimer: true,
    durationSeconds: 90,
    moveLimit: null,
  },
  MAZE: {
    title: "Labirent",
    subtitle: "Maç başında rastgele legal duvarlar",
    wallsPerPlayer: 7,
    hasTimer: false,
    durationSeconds: MATCH_DURATION_SECONDS,
    moveLimit: null,
  },
  PUZZLE: {
    title: "Puzzle",
    subtitle: "Özel taş ve duvar diziliminden kazan",
    wallsPerPlayer: 5,
    hasTimer: true,
    durationSeconds: 210,
    moveLimit: 24,
  },
  TIMED: {
    title: "Süreli Mod",
    subtitle: "5 dakika içinde üstünlük kur",
    wallsPerPlayer: 10,
    hasTimer: true,
    durationSeconds: 300,
    moveLimit: null,
  },
  WIN_STREAK: {
    title: "Seri Galibiyet",
    subtitle: "Üst üste kaç bot yenebilirsin?",
    wallsPerPlayer: 10,
    hasTimer: false,
    durationSeconds: MATCH_DURATION_SECONDS,
    moveLimit: null,
  },
  MOVE_LIMIT: {
    title: "Hamle Limiti",
    subtitle: "30 tur içinde kazanmalısın",
    wallsPerPlayer: 10,
    hasTimer: false,
    durationSeconds: MATCH_DURATION_SECONDS,
    moveLimit: 30,
  },
};

const SOUND_URIS = {
  move: "https://actions.google.com/sounds/v1/foley/wood_plank_flicks.ogg",
  wall: "https://actions.google.com/sounds/v1/impacts/wood_medium_impact.ogg",
  win: "https://actions.google.com/sounds/v1/cartoon/concussive_hit_guitar_boing.ogg",
};

const START_STATE: GameState = {
  pawns: {
    1: { row: 8, col: 4 },
    2: { row: 0, col: 4 },
  },
  previousPawns: {
    1: null,
    2: null,
  },
  currentPlayer: 1,
  walls: [],
  wallsLeft: {
    1: WALLS_PER_PLAYER,
    2: WALLS_PER_PLAYER,
  },
  winner: null,
  lastAction: null,
};

function createStartState(wallsPerPlayer = WALLS_PER_PLAYER): GameState {
  return {
    pawns: {
      1: { row: 8, col: 4 },
      2: { row: 0, col: 4 },
    },
    previousPawns: {
      1: null,
      2: null,
    },
    currentPlayer: 1,
    walls: [],
    wallsLeft: {
      1: wallsPerPlayer,
      2: wallsPerPlayer,
    },
    winner: null,
    lastAction: null,
  };
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const BOARD_WIDTH = Math.min(SCREEN_WIDTH - 16, 520);
const GAP = 8;
const WALL_THICKNESS = Math.max(10, GAP * 1.15);
const CELL_SIZE = Math.floor(
  (BOARD_WIDTH - GAP * (BOARD_SIZE - 1)) / BOARD_SIZE
);

function samePos(a: Position, b: Position) {
  return a.row === b.row && a.col === b.col;
}

function getOpponent(player: PlayerId): PlayerId {
  return player === 1 ? 2 : 1;
}

function wallKey(wall: Wall) {
  return `${wall.row}-${wall.col}-${wall.orientation}`;
}

function posKey(pos: Position) {
  return `${pos.row}-${pos.col}`;
}

function formatTimer(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;

  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function getDifficultyLabel(difficulty: Difficulty) {
  if (difficulty === "EASY") return "Kolay";
  if (difficulty === "MEDIUM") return "Orta";
  return "Zor";
}

function getWinnerName(winner: PlayerId, nickname: string) {
  return winner === 1 ? nickname || "You" : "AI";
}

function getDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getWeekKey(date = new Date()) {
  const firstDay = new Date(date.getFullYear(), 0, 1);
  const dayOffset = Math.floor((date.getTime() - firstDay.getTime()) / 86400000);
  const week = Math.floor((dayOffset + firstDay.getDay()) / 7) + 1;
  return `${date.getFullYear()}-W${week}`;
}

function getYesterdayKey() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return getDateKey(yesterday);
}

function createDailyTask(dateKey = getDateKey(), offset = 0): DailyTask {
  const taskIndex =
    (dateKey.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) + offset) % 3;

  if (taskIndex === 0) {
    return {
      id: `${dateKey}-wins`,
      type: "WIN_MATCHES",
      title: "1 maç kazan",
      target: 1,
      progress: 0,
      rewardXp: 40,
      dateKey,
      refreshedDateKey: null,
      claimed: false,
    };
  }

  if (taskIndex === 1) {
    return {
      id: `${dateKey}-walls`,
      type: "PLACE_WALLS",
      title: "5 duvar koy",
      target: 5,
      progress: 0,
      rewardXp: 30,
      dateKey,
      refreshedDateKey: null,
      claimed: false,
    };
  }

  return {
    id: `${dateKey}-plays`,
    type: "PLAY_MATCHES",
    title: "2 maç tamamla",
    target: 2,
    progress: 0,
    rewardXp: 35,
    dateKey,
    refreshedDateKey: null,
    claimed: false,
  };
}

function normalizeDailyTask(task?: DailyTask | null) {
  const today = getDateKey();
  if (!task || task.dateKey !== today) return createDailyTask(today);
  return task;
}

function normalizeStreak(streak?: StreakState | null): StreakState {
  const today = getDateKey();
  if (!streak?.lastVisitDateKey) return { count: 1, lastVisitDateKey: today };
  if (streak.lastVisitDateKey === today) return streak;
  if (streak.lastVisitDateKey === getYesterdayKey()) {
    return { count: streak.count + 1, lastVisitDateKey: today };
  }
  return { count: 1, lastVisitDateKey: today };
}

function normalizeWeeklyChest(chest?: WeeklyChest | null): WeeklyChest {
  const weekKey = getWeekKey();
  if (!chest || chest.weekKey !== weekKey) {
    return { weekKey, completedTasks: 0, claimed: false };
  }
  return chest;
}

function getPlayerLevel(totalXp: number) {
  return Math.floor(totalXp / 100) + 1;
}

function getLevelProgress(totalXp: number) {
  return totalXp % 100;
}

function getWinRate(stats: ProfileStats) {
  const total = stats.wins + stats.losses;
  if (total === 0) return 0;
  return Math.round((stats.wins / total) * 100);
}

function getOptionalAsyncStorage() {
  try {
    return require("@react-native-async-storage/async-storage").default;
  } catch {
    return null;
  }
}

function getOptionalImagePicker() {
  try {
    return require("expo-image-picker");
  } catch {
    return null;
  }
}

async function loadSavedProfile() {
  const storage = getOptionalAsyncStorage();
  if (!storage) return null;

  try {
    const rawProfile = await storage.getItem(PROFILE_STORAGE_KEY);
    return rawProfile ? JSON.parse(rawProfile) : null;
  } catch {
    return null;
  }
}

async function saveProfile(profile: {
  nickname: string;
  avatar: string;
  avatarImageUri: string | null;
  stats: ProfileStats;
  xp: number;
  dailyTask: DailyTask;
  streak: StreakState;
  weeklyChest: WeeklyChest;
  bestWinStreak: number;
}) {
  const storage = getOptionalAsyncStorage();
  if (!storage) return;

  try {
    await storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Profile persistence is optional when AsyncStorage is not installed.
  }
}

async function playSoundEffect(
  type: keyof typeof SOUND_URIS,
  options: { soundEnabled: boolean; vibrationEnabled: boolean }
) {
  if (options.vibrationEnabled) {
    Vibration.vibrate(type === "wall" ? 35 : type === "win" ? [0, 80, 60, 80] : 18);
  }

  if (!options.soundEnabled) return;

  try {
    const expoAv = require("expo-av");
    const sound = new expoAv.Audio.Sound();
    await sound.loadAsync({ uri: SOUND_URIS[type] }, { shouldPlay: true, volume: 0.55 });
    sound.setOnPlaybackStatusUpdate((status: { didJustFinish?: boolean }) => {
      if (status.didJustFinish) {
        sound.unloadAsync();
      }
    });
  } catch {
    // Sound is optional: install expo-av or replace the URIs with local files.
  }
}

function isInsideBoard(pos: Position) {
  return (
    pos.row >= 0 &&
    pos.row < BOARD_SIZE &&
    pos.col >= 0 &&
    pos.col < BOARD_SIZE
  );
}

function isWallPositionInsideBoard(wall: Wall) {
  return (
    wall.row >= 0 &&
    wall.row < BOARD_SIZE - 1 &&
    wall.col >= 0 &&
    wall.col < BOARD_SIZE - 1
  );
}

function isBlockedBetween(a: Position, b: Position, walls: Wall[]) {
  for (const wall of walls) {
    if (wall.orientation === "H") {
      const crossesWallLine =
        (a.row === wall.row && b.row === wall.row + 1) ||
        (a.row === wall.row + 1 && b.row === wall.row);
      const insideWallSpan = a.col === wall.col || a.col === wall.col + 1;

      if (crossesWallLine && insideWallSpan) return true;
    }

    if (wall.orientation === "V") {
      const crossesWallLine =
        (a.col === wall.col && b.col === wall.col + 1) ||
        (a.col === wall.col + 1 && b.col === wall.col);
      const insideWallSpan = a.row === wall.row || a.row === wall.row + 1;

      if (crossesWallLine && insideWallSpan) return true;
    }
  }

  return false;
}

function getBasicNeighbors(pos: Position, walls: Wall[]) {
  const candidates: Position[] = [
    { row: pos.row - 1, col: pos.col },
    { row: pos.row + 1, col: pos.col },
    { row: pos.row, col: pos.col - 1 },
    { row: pos.row, col: pos.col + 1 },
  ];

  return candidates.filter(
    (next) => isInsideBoard(next) && !isBlockedBetween(pos, next, walls)
  );
}

function hasPathToGoal(player: PlayerId, state: GameState) {
  return getShortestPathLength(player, state) !== Number.POSITIVE_INFINITY;
}

function getShortestPathLength(player: PlayerId, state: GameState) {
  const start = state.pawns[player];
  const visited = new Set<string>();
  const queue: { pos: Position; distance: number }[] = [
    { pos: start, distance: 0 },
  ];

  const isGoal = (pos: Position) =>
    player === 1 ? pos.row === 0 : pos.row === BOARD_SIZE - 1;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = posKey(current.pos);

    if (visited.has(key)) continue;
    visited.add(key);

    if (isGoal(current.pos)) return current.distance;

    for (const next of getBasicNeighbors(current.pos, state.walls)) {
      if (!visited.has(posKey(next))) {
        queue.push({ pos: next, distance: current.distance + 1 });
      }
    }
  }

  return Number.POSITIVE_INFINITY;
}

function isWallOverlapping(newWall: Wall, walls: Wall[]) {
  return walls.some((wall) => {
    if (wallKey(wall) === wallKey(newWall)) return true;

    if (wall.orientation === "H" && newWall.orientation === "H") {
      return (
        wall.row === newWall.row &&
        newWall.col <= wall.col + 1 &&
        newWall.col + 1 >= wall.col
      );
    }

    if (wall.orientation === "V" && newWall.orientation === "V") {
      return (
        wall.col === newWall.col &&
        newWall.row <= wall.row + 1 &&
        newWall.row + 1 >= wall.row
      );
    }

    return false;
  });
}

function isWallIntersecting(newWall: Wall, walls: Wall[]) {
  return walls.some(
    (wall) =>
      wall.orientation !== newWall.orientation &&
      wall.row === newWall.row &&
      wall.col === newWall.col
  );
}

function canPlaceWallGeometry(newWall: Wall, state: GameState) {
  if (!isWallPositionInsideBoard(newWall)) return false;
  if (isWallOverlapping(newWall, state.walls)) return false;
  if (isWallIntersecting(newWall, state.walls)) return false;

  return true;
}

function doesWallKeepPathsOpen(newWalls: Wall[], state: GameState) {
  const nextState: GameState = {
    ...state,
    walls: [...state.walls, ...newWalls],
  };

  return hasPathToGoal(1, nextState) && hasPathToGoal(2, nextState);
}

function isLegalWallPlacement(newWall: Wall, state: GameState) {
  return (
    canPlaceWallGeometry(newWall, state) &&
    doesWallKeepPathsOpen([newWall], state)
  );
}

function getWallPlacement(wall: Wall, state: GameState): WallPlacementResult {
  if (state.wallsLeft[state.currentPlayer] < 1) {
    return { status: "NO_WALLS" };
  }

  if (!canPlaceWallGeometry(wall, state)) {
    return { status: "GEOMETRY_INVALID" };
  }

  if (!doesWallKeepPathsOpen([wall], state)) {
    return { status: "PATH_BLOCKED" };
  }

  return { status: "OK", wall };
}

function addLegalSetupWall(state: GameState, wall: Wall) {
  if (!canPlaceWallGeometry(wall, state)) return state;
  if (!doesWallKeepPathsOpen([wall], state)) return state;

  return {
    ...state,
    walls: [...state.walls, wall],
  };
}

function addMazeWalls(state: GameState, targetCount: number) {
  let nextState = state;
  const candidates: Wall[] = [];

  for (let row = 0; row < BOARD_SIZE - 1; row++) {
    for (let col = 0; col < BOARD_SIZE - 1; col++) {
      candidates.push({ row, col, orientation: "H" });
      candidates.push({ row, col, orientation: "V" });
    }
  }

  const shuffledCandidates = candidates.sort(() => Math.random() - 0.5);

  for (const wall of shuffledCandidates) {
    if (nextState.walls.length >= targetCount) break;
    nextState = addLegalSetupWall(nextState, wall);
  }

  return nextState;
}

function createModeStartState(selectedGameMode: GameMode) {
  const config = GAME_MODE_CONFIG[selectedGameMode];
  let nextState = createStartState(config.wallsPerPlayer);

  if (selectedGameMode === "MAZE") {
    return addMazeWalls(nextState, 6);
  }

  if (selectedGameMode === "PUZZLE") {
    nextState = {
      ...nextState,
      pawns: {
        1: { row: 6, col: 6 },
        2: { row: 2, col: 4 },
      },
    };

    const puzzleWalls: Wall[] = [
      { row: 5, col: 4, orientation: "H" },
      { row: 4, col: 6, orientation: "V" },
      { row: 3, col: 3, orientation: "H" },
      { row: 6, col: 2, orientation: "V" },
      { row: 2, col: 5, orientation: "V" },
    ];

    return puzzleWalls.reduce(addLegalSetupWall, nextState);
  }

  return nextState;
}

function getLegalPawnMoves(player: PlayerId, state: GameState) {
  const current = state.pawns[player];
  const opponent = state.pawns[getOpponent(player)];
  const legalMoves: Position[] = [];

  const directions = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];

  for (const dir of directions) {
    const adjacent = {
      row: current.row + dir.row,
      col: current.col + dir.col,
    };

    if (!isInsideBoard(adjacent)) continue;
    if (isImmediateBacktrack(player, state, adjacent)) continue;
    if (isBlockedBetween(current, adjacent, state.walls)) continue;

    if (!samePos(adjacent, opponent)) {
      legalMoves.push(adjacent);
      continue;
    }

    const jump = {
      row: adjacent.row + dir.row,
      col: adjacent.col + dir.col,
    };

    if (
      isInsideBoard(jump) &&
      !isImmediateBacktrack(player, state, jump) &&
      !isBlockedBetween(adjacent, jump, state.walls)
    ) {
      legalMoves.push(jump);
      continue;
    }

    const sideDirs =
      dir.row !== 0
        ? [
            { row: 0, col: -1 },
            { row: 0, col: 1 },
          ]
        : [
            { row: -1, col: 0 },
            { row: 1, col: 0 },
          ];

    for (const side of sideDirs) {
      const diagonal = {
        row: adjacent.row + side.row,
        col: adjacent.col + side.col,
      };

      if (
        isInsideBoard(diagonal) &&
        !isImmediateBacktrack(player, state, diagonal) &&
        !isBlockedBetween(adjacent, diagonal, state.walls)
      ) {
        legalMoves.push(diagonal);
      }
    }
  }

  return legalMoves.filter(
    (move, index, moves) => moves.findIndex((other) => samePos(other, move)) === index
  );
}

function checkWinner(player: PlayerId, pos: Position): PlayerId | null {
  if (player === 1 && pos.row === 0) return 1;
  if (player === 2 && pos.row === BOARD_SIZE - 1) return 2;
  return null;
}

function nextTurn(player: PlayerId): PlayerId {
  return player === 1 ? 2 : 1;
}

function isImmediateBacktrack(player: PlayerId, state: GameState, to: Position) {
  const previous = state.previousPawns[player];
  return previous ? samePos(previous, to) : false;
}

function chooseAiMove(state: GameState, difficulty: Difficulty): Position | null {
  const legalMoves = getLegalPawnMoves(2, state);

  if (legalMoves.length === 0) return null;

  const scoredMoves = legalMoves.map((move) => {
    const simulatedState: GameState = {
      ...state,
      pawns: {
        ...state.pawns,
        2: move,
      },
    };

    const aiDistance = getShortestPathLength(2, simulatedState);
    const playerDistance = getShortestPathLength(1, simulatedState);

    return {
      move,
      aiDistance,
      playerDistance,
      score: playerDistance * 2 - aiDistance * 3,
    };
  });

  scoredMoves.sort((a, b) => b.score - a.score);

  if (difficulty === "EASY" && Math.random() < 0.08) {
    return legalMoves[Math.floor(Math.random() * legalMoves.length)];
  }

  if (difficulty === "MEDIUM" && Math.random() < 0.005) {
    return legalMoves[Math.floor(Math.random() * legalMoves.length)];
  }

  return scoredMoves[0].move;
}

function chooseAiWall(state: GameState, difficulty: Difficulty): Wall | null {
  if (state.wallsLeft[2] < 1) return null;

  const player = state.pawns[1];
  const ai = state.pawns[2];
  const currentPlayerDistance = getShortestPathLength(1, state);
  const currentAiDistance = getShortestPathLength(2, state);
  const candidateSet = new Map<string, Wall>();

  function addCandidate(wall: Wall) {
    if (isWallPositionInsideBoard(wall)) {
      candidateSet.set(wallKey(wall), wall);
    }
  }

  for (let rowOffset = -3; rowOffset <= 3; rowOffset++) {
    for (let colOffset = -3; colOffset <= 3; colOffset++) {
      addCandidate({
        row: player.row + rowOffset,
        col: player.col + colOffset,
        orientation: "H",
      });
      addCandidate({
        row: player.row + rowOffset,
        col: player.col + colOffset,
        orientation: "V",
      });
    }
  }

  for (let rowOffset = -2; rowOffset <= 2; rowOffset++) {
    for (let colOffset = -2; colOffset <= 2; colOffset++) {
      addCandidate({
        row: ai.row + rowOffset,
        col: ai.col + colOffset,
        orientation: "H",
      });
      addCandidate({
        row: ai.row + rowOffset,
        col: ai.col + colOffset,
        orientation: "V",
      });
    }
  }

  const scoredWalls = Array.from(candidateSet.values())
    .map((wall) => {
      const placement = getWallPlacement(wall, state);
      if (placement.status !== "OK") return null;

      const simulatedState: GameState = {
        ...state,
        walls: [...state.walls, placement.wall],
      };

      const newPlayerDistance = getShortestPathLength(1, simulatedState);
      const newAiDistance = getShortestPathLength(2, simulatedState);
      const playerSlowdown = newPlayerDistance - currentPlayerDistance;
      const aiSlowdown = newAiDistance - currentAiDistance;

      let score = playerSlowdown * 7 - aiSlowdown * 3;

      if (currentPlayerDistance <= currentAiDistance) score += 5;
      if (playerSlowdown >= 2) score += 4;
      if (aiSlowdown >= 2) score -= 6;

      return {
        wall: placement.wall,
        score,
      };
    })
    .filter((item): item is { wall: Wall; score: number } => item !== null)
    .sort((a, b) => b.score - a.score);

  const bestWall = scoredWalls[0];
  if (!bestWall) return null;

  if (difficulty === "EASY") {
    return bestWall.score > 0 ? bestWall.wall : null;
  }

  if (difficulty === "MEDIUM") {
    if (bestWall.score <= 0) return null;
    if (Math.random() < 0.03 && scoredWalls.length > 1) return scoredWalls[1].wall;
    return bestWall.wall;
  }

  return bestWall.score > -2 ? bestWall.wall : null;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("HOME");
  const [nickname, setNickname] = useState("You");
  const [difficulty, setDifficulty] = useState<Difficulty>("EASY");
  const [gameMode, setGameMode] = useState<GameMode>("CLASSIC");
  const [state, setState] = useState<GameState>(START_STATE);
  const [mode, setMode] = useState<Mode>("MOVE");
  const [wallOrientation, setWallOrientation] = useState<Orientation>("H");
  const [turnCount, setTurnCount] = useState(1);
  const [remainingSeconds, setRemainingSeconds] = useState(MATCH_DURATION_SECONDS);
  const [score, setScore] = useState<Record<PlayerId, number>>({ 1: 0, 2: 0 });
  const [xp, setXp] = useState(0);
  const [handledWinner, setHandledWinner] = useState<PlayerId | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiBurstId, setConfettiBurstId] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [avatar, setAvatar] = useState(AVATAR_OPTIONS[0]);
  const [avatarImageUri, setAvatarImageUri] = useState<string | null>(null);
  const [profileStats, setProfileStats] = useState<ProfileStats>({ wins: 0, losses: 0 });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [dailyTask, setDailyTask] = useState<DailyTask>(() => createDailyTask());
  const [streak, setStreak] = useState<StreakState>(() => normalizeStreak(null));
  const [weeklyChest, setWeeklyChest] = useState<WeeklyChest>(() => normalizeWeeklyChest(null));
  const [currentWinStreak, setCurrentWinStreak] = useState(0);
  const [bestWinStreak, setBestWinStreak] = useState(0);
const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
const [onlineRoomCode, setOnlineRoomCode] = useState("");
const [joinCodeInput, setJoinCodeInput] = useState("");
const [onlinePlayerNumber, setOnlinePlayerNumber] = useState<1 | 2 | null>(null);
const [onlineLoading, setOnlineLoading] = useState(false);
const [onlineGame, setOnlineGame] = useState<OnlineGameDoc | null>(null);

  const legalMoves = useMemo(() => {
    if (state.winner) return [];
    return getLegalPawnMoves(state.currentPlayer, state);
  }, [state]);

const currentPlayerName = onlineRoomCode
  ? onlinePlayerNumber === state.currentPlayer
    ? "Sen"
    : `Rakip P${state.currentPlayer}`
  : state.currentPlayer === 1
  ? nickname || "You"
  : "AI";
  const matchModeLabel = `AI ${getDifficultyLabel(difficulty)}`;
  const winnerName = state.winner ? getWinnerName(state.winner, nickname) : "";
  const profileLevel = getPlayerLevel(xp);
  const profileLevelProgress = getLevelProgress(xp);
  const activeModeConfig = GAME_MODE_CONFIG[gameMode];
  const dailyProgressPercent = Math.min(
    100,
    Math.round((dailyTask.progress / dailyTask.target) * 100)
  );

  function playFeedback(type: keyof typeof SOUND_URIS) {
    playSoundEffect(type, { soundEnabled, vibrationEnabled });
  }

  async function pickAvatarFromGallery() {
    const imagePicker = getOptionalImagePicker();

    if (!imagePicker) {
      Alert.alert(
        "Galeri paketi eksik",
        "Fotoğraf seçmek için expo-image-picker paketini kurmalısın."
      );
      return;
    }

    const permission = await imagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("İzin gerekli", "Avatar seçmek için galeri izni vermelisin.");
      return;
    }

    const result = await imagePicker.launchImageLibraryAsync({
      mediaTypes: imagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setAvatarImageUri(result.assets[0].uri);
    }
  }

  function grantDailyProgress(type: DailyTaskType, amount = 1) {
    setDailyTask((prev) => {
      const currentTask = normalizeDailyTask(prev);
      if (currentTask.type !== type || currentTask.claimed) return currentTask;

      const nextProgress = Math.min(currentTask.target, currentTask.progress + amount);
      const completedNow = nextProgress >= currentTask.target;

      if (completedNow) {
        setXp((currentXp) => currentXp + currentTask.rewardXp);
        setWeeklyChest((currentChest) => {
          const normalizedChest = normalizeWeeklyChest(currentChest);
          return {
            ...normalizedChest,
            completedTasks: Math.min(5, normalizedChest.completedTasks + 1),
          };
        });
      }

      return {
        ...currentTask,
        progress: nextProgress,
        claimed: completedNow,
      };
    });
  }

  function refreshDailyTask() {
    const today = getDateKey();

    if (dailyTask.refreshedDateKey === today) {
      Alert.alert("Görev yenileme", "Günlük görevi bugün zaten 1 kez değiştirdin.");
      return;
    }

    const refreshedTask = createDailyTask(today, 1);
    setDailyTask({
      ...refreshedTask,
      refreshedDateKey: today,
    });
  }

  function claimWeeklyChest() {
    const normalizedChest = normalizeWeeklyChest(weeklyChest);

    if (normalizedChest.claimed || normalizedChest.completedTasks < 5) {
      Alert.alert("Haftalık sandık", "Sandık için bu hafta 5 görev tamamlamalısın.");
      return;
    }

    setWeeklyChest({
      ...normalizedChest,
      claimed: true,
    });
    setXp((prev) => prev + 120);
    Alert.alert("Haftalık sandık", "120 XP kazandın.");
  }

  useEffect(() => {
    let mounted = true;

    loadSavedProfile().then((savedProfile) => {
      if (!mounted) return;

      if (savedProfile?.nickname) setNickname(savedProfile.nickname);
      if (savedProfile?.avatar) setAvatar(savedProfile.avatar);
      if (typeof savedProfile?.avatarImageUri === "string") {
        setAvatarImageUri(savedProfile.avatarImageUri);
      }
      if (savedProfile?.stats) setProfileStats(savedProfile.stats);
      if (typeof savedProfile?.xp === "number") setXp(savedProfile.xp);
      setDailyTask(normalizeDailyTask(savedProfile?.dailyTask));
      setStreak(normalizeStreak(savedProfile?.streak));
      setWeeklyChest(normalizeWeeklyChest(savedProfile?.weeklyChest));
      if (typeof savedProfile?.bestWinStreak === "number") {
        setBestWinStreak(savedProfile.bestWinStreak);
      }

      setProfileLoaded(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!profileLoaded) return;

    saveProfile({
      nickname,
      avatar,
      avatarImageUri,
      stats: profileStats,
      xp,
      dailyTask,
      streak,
      weeklyChest,
      bestWinStreak,
    });
  }, [
    avatar,
    avatarImageUri,
    bestWinStreak,
    dailyTask,
    nickname,
    profileLoaded,
    profileStats,
    streak,
    weeklyChest,
    xp,
  ]);

  useEffect(() => {
    if (screen !== "GAME") return;
    if (!activeModeConfig.hasTimer) return;
    if (state.winner) return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setState((current) =>
            current.winner
              ? current
              : {
                  ...current,
                  winner: current.wallsLeft[1] >= current.wallsLeft[2] ? 1 : 2,
                }
          );
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeModeConfig.hasTimer, screen, state.winner]);

  useEffect(() => {
    if (screen !== "GAME") return;
    if (!activeModeConfig.moveLimit) return;
    if (state.winner) return;
    if (turnCount <= activeModeConfig.moveLimit) return;

    setState((prev) => ({
      ...prev,
      winner: 2,
    }));
  }, [activeModeConfig.moveLimit, screen, state.winner, turnCount]);
  useEffect(() => {
  if (!onlineRoomCode) return;

 const unsubscribe = subscribeToRoom(
  onlineRoomCode,
  (game: OnlineGameDoc | null) => {
      setOnlineGame(game);

      if (!game) return;

      setState((prev) => ({
        ...prev,
        pawns: game.pawns,
        walls: game.walls,
        wallsLeft: game.wallsLeft,
        currentPlayer: game.currentPlayer,
        winner: game.winner,
      }));

      if (game.status === "PLAYING") {
        setScreen("GAME");
      }
    },
   (error: Error) => {
  Alert.alert("Online bağlantı hatası", error.message);
}
  );

  return () => unsubscribe();
}, [onlineRoomCode]);

  useEffect(() => {
    if (!state.winner) return;
    if (handledWinner === state.winner) return;

    setHandledWinner(state.winner);
    setShowConfetti(true);
    setConfettiBurstId((prev) => prev + 1);
    playFeedback("win");

    const confettiTimer = setTimeout(() => {
      setShowConfetti(false);
    }, 3000);

    setScore((prev) => ({
      ...prev,
      [state.winner as PlayerId]: prev[state.winner as PlayerId] + 1,
    }));

    setProfileStats((prev) => ({
      wins: prev.wins + (state.winner === 1 ? 1 : 0),
      losses: prev.losses + (state.winner === 2 ? 1 : 0),
    }));

    grantDailyProgress("PLAY_MATCHES");

    if (state.winner === 1) {
      const nextWinStreak = currentWinStreak + 1;
      setCurrentWinStreak(nextWinStreak);
      setBestWinStreak((prev) => Math.max(prev, nextWinStreak));
      grantDailyProgress("WIN_MATCHES");

      const difficultyBonus =
        difficulty === "EASY" ? 25 : difficulty === "MEDIUM" ? 45 : 70;
      const modeBonus =
        gameMode === "PUZZLE" ? 35 : gameMode === "WIN_STREAK" ? 25 : 0;
      setXp((prev) => prev + difficultyBonus + modeBonus + Math.max(0, 30 - turnCount));
    } else {
      setCurrentWinStreak(0);
    }

    return () => clearTimeout(confettiTimer);
  }, [currentWinStreak, difficulty, gameMode, handledWinner, state.winner, turnCount]);

useEffect(() => {
  if (screen !== "GAME") return;
  if (onlineRoomCode) return;
  if (state.winner) return;
  if (state.currentPlayer !== 2) return;

    const timer = setTimeout(() => {
      const playerDistance = getShortestPathLength(1, state);
      const aiDistance = getShortestPathLength(2, state);
      const aiIsBehindOrEqual = playerDistance <= aiDistance;

      const baseWallChance =
        difficulty === "EASY"
          ? aiIsBehindOrEqual
            ? 0.14
            : 0.05
          : difficulty === "MEDIUM"
            ? aiIsBehindOrEqual
              ? 0.42
              : 0.22
            : aiIsBehindOrEqual
              ? 0.72
              : 0.52;
      const wallChance =
        gameMode === "BLITZ" ? Math.min(0.88, baseWallChance + 0.18) : baseWallChance;

      const shouldTryWall = Math.random() < wallChance;
      const aiWall = shouldTryWall ? chooseAiWall(state, difficulty) : null;

      if (aiWall) {
        playFeedback("wall");
        setState((prev) => ({
          ...prev,
          walls: [...prev.walls, aiWall],
          wallsLeft: {
            ...prev.wallsLeft,
            2: Math.max(0, prev.wallsLeft[2] - 1),
          },
          currentPlayer: 1,
          lastAction: {
            type: "WALL",
            player: 2,
            wall: aiWall,
          },
        }));
        setTurnCount((prev) => prev + 1);
        return;
      }

      const aiMove = chooseAiMove(state, difficulty);
      if (!aiMove) return;

      const winner = checkWinner(2, aiMove);
      playFeedback(winner ? "win" : "move");

      setState((prev) => ({
        ...prev,
        previousPawns: {
          ...prev.previousPawns,
          2: prev.pawns[2],
        },
        pawns: {
          ...prev.pawns,
          2: aiMove,
        },
        currentPlayer: winner ? 2 : 1,
        winner,
        lastAction: {
          type: "MOVE",
          player: 2,
          from: prev.pawns[2],
          to: aiMove,
        },
      }));

      if (!winner) {
        setTurnCount((prev) => prev + 1);
      }
    }, 650);

    return () => clearTimeout(timer);
  }, [screen, state, difficulty, onlineRoomCode]);

  function resetGame(nextGameMode = gameMode) {
    const config = GAME_MODE_CONFIG[nextGameMode];

    setState(createModeStartState(nextGameMode));
    setMode("MOVE");
    setWallOrientation("H");
    setTurnCount(1);
    setRemainingSeconds(config.durationSeconds);
    setHandledWinner(null);
    setShowConfetti(false);
  }

  function restartMatch() {
    Alert.alert("Maçı baştan başlat", "Mevcut maç sıfırlansın mı?", [
      { text: "Vazgeç", style: "cancel" },
      {
  text: "Tekrar Oyna",
  onPress: () => resetGame(),
}
    ]);
  }

  function rematch() {
    resetGame();
  }

  function startSingleplayer(selectedDifficulty: Difficulty) {
    setDifficulty(selectedDifficulty);
    setScreen("GAME_MODE");
  }

  function startGameMode(selectedGameMode: GameMode) {
    setGameMode(selectedGameMode);
    resetGame(selectedGameMode);
    setScreen("GAME");
  }

  function goBack() {
    setScreen("HOME");
  }

  function showWallError(status: Exclude<WallPlacementResult["status"], "OK">) {
    if (status === "NO_WALLS") {
      Alert.alert("Duvar hakkı yok", "Duvar koymak için en az 1 duvar hakkın olmalı.");
      return;
    }

    if (status === "GEOMETRY_INVALID") {
      Alert.alert("Geçersiz duvar", "Bu noktaya duvar koyamazsın.");
      return;
    }

    Alert.alert(
      "Yol tamamen kapanıyor",
      "Bu duvar oyunculardan birinin çıkış yolunu tamamen kapatıyor."
    );
  }

  function handleCellPress(row: number, col: number, forcedOrientation?: Orientation) {
  if (state.winner) return;

  if (onlineRoomCode && onlinePlayerNumber !== state.currentPlayer) {
    return;
  }

  if (!onlineRoomCode && state.currentPlayer === 2) {
    return;
  }

  if (mode === "MOVE") {
    const target = { row, col };
    const isLegal = legalMoves.some((move) => samePos(move, target));

    if (!isLegal) return;

    const currentPlayer = state.currentPlayer;
    const winner = checkWinner(currentPlayer, target);

    playFeedback(winner ? "win" : "move");

    const nextState: GameState = {
      ...state,
      previousPawns: {
        ...state.previousPawns,
        [currentPlayer]: state.pawns[currentPlayer],
      },
      pawns: {
        ...state.pawns,
        [currentPlayer]: target,
      },
      currentPlayer: winner ? currentPlayer : nextTurn(currentPlayer),
      winner,
      lastAction: {
        type: "MOVE",
        player: currentPlayer,
        from: state.pawns[currentPlayer],
        to: target,
      },
    };

    setState(nextState);

    if (onlineRoomCode) {
      updateOnlineGameState({
        roomCode: onlineRoomCode,
        pawns: nextState.pawns,
        walls: nextState.walls,
        wallsLeft: nextState.wallsLeft,
        currentPlayer: nextState.currentPlayer,
        winner: nextState.winner,
      });
    }

    if (!winner) {
      setTurnCount((prev) => prev + 1);
    }

    return;
  }

  if (mode === "WALL") {
    const newWall: Wall = {
      row,
      col,
      orientation: forcedOrientation ?? wallOrientation,
    };

    const placement = getWallPlacement(newWall, state);

    if (placement.status !== "OK") {
      showWallError(placement.status);
      return;
    }

    playFeedback("wall");
    grantDailyProgress("PLACE_WALLS");

    const nextState: GameState = {
      ...state,
      walls: [...state.walls, placement.wall],
      wallsLeft: {
        ...state.wallsLeft,
        [state.currentPlayer]: Math.max(
          0,
          state.wallsLeft[state.currentPlayer] - 1
        ),
      },
      currentPlayer: nextTurn(state.currentPlayer),
      lastAction: {
        type: "WALL",
        player: state.currentPlayer,
        wall: placement.wall,
      },
    };

    setState(nextState);

    if (onlineRoomCode) {
      updateOnlineGameState({
        roomCode: onlineRoomCode,
        pawns: nextState.pawns,
        walls: nextState.walls,
        wallsLeft: nextState.wallsLeft,
        currentPlayer: nextState.currentPlayer,
        winner: nextState.winner,
      });
    }

    setTurnCount((prev) => prev + 1);
  }
}
  function renderBackButton() {
    if (screen === "HOME") return null;

    return (
      <Pressable style={styles.backButton} onPress={goBack}>
        <Text style={styles.backText}>←</Text>
      </Pressable>
    );
  }

  function renderLogo() {
    return (
      <View style={styles.logoWrap}>
        <View style={styles.logoRed} />
        <View style={styles.logoCream} />
        <Text style={styles.logoPiece}>♜</Text>
      </View>
    );
  }
  async function ensureOnlineUser() {
  if (firebaseUser) {
    return firebaseUser;
  }

  const user = await loginAnonymously();
  setFirebaseUser(user);
  return user;
}

async function handleCreateOnlineRoom() {
  try {
    setOnlineLoading(true);

    const user = await ensureOnlineUser();

    const result = await createRoom({
      uid: user.uid,
      nickname: nickname || "Player",
    });

    setOnlineRoomCode(result.roomCode);
    setOnlinePlayerNumber(result.playerNumber);

    Alert.alert("Oda oluşturuldu", `Oda kodun: ${result.roomCode}`);
  } catch (error) {
    Alert.alert(
      "Oda oluşturulamadı",
      error instanceof Error ? error.message : "Bilinmeyen hata oluştu."
    );
  } finally {
    setOnlineLoading(false);
  }
}

async function handleJoinOnlineRoom() {
  try {
    if (!joinCodeInput.trim()) {
      Alert.alert("Oda kodu gerekli", "Katılmak için 6 haneli oda kodunu yaz.");
      return;
    }

    setOnlineLoading(true);

    const user = await ensureOnlineUser();

    const result = await joinRoom({
      roomCode: joinCodeInput,
      uid: user.uid,
      nickname: nickname || "Player",
    });

    setOnlineRoomCode(result.roomCode);
    setOnlinePlayerNumber(result.playerNumber);

    Alert.alert("Odaya katıldın", `Oda kodu: ${result.roomCode}`);
    setScreen("GAME");
  } catch (error) {
    Alert.alert(
      "Odaya katılamadın",
      error instanceof Error ? error.message : "Bilinmeyen hata oluştu."
    );
  } finally {
    setOnlineLoading(false);
  }
}

  if (screen === "HOME") {
    return (
      <SafeAreaView style={styles.screen}>
        <AnimatedTapButton
          containerStyle={styles.profileButtonWrap}
          style={styles.profileButton}
          onPress={() => setScreen("PROFILE")}
          pressedScale={0.9}
        >
          <View style={styles.profileAvatar}>
            {avatarImageUri ? (
              <Image source={{ uri: avatarImageUri }} style={styles.profileAvatarImage} />
            ) : (
              <Text style={styles.profileAvatarText}>{avatar}</Text>
            )}
          </View>
        </AnimatedTapButton>

        <AnimatedTapButton
          containerStyle={styles.settingsIconButtonWrap}
          style={styles.settingsIconButton}
          onPress={() => setScreen("SETTINGS")}
          pressedScale={0.9}
        >
          <Text style={styles.settingsIconText}>⚙</Text>
        </AnimatedTapButton>

        <View style={styles.homeLevelBadge}>
          <Text style={styles.homeLevelLabel}>LEVEL</Text>
          <Text style={styles.homeLevelValue}>{profileLevel}</Text>
        </View>

        {renderLogo()}

        <Text style={styles.mainTitle}>Pathlock</Text>

        <View style={styles.menuCard}>
          <Text style={styles.inputLabel}>Oyuncu adı</Text>

          <TextInput
            style={styles.nickInput}
            value={nickname}
            onChangeText={setNickname}
            placeholder="Your nickname"
            placeholderTextColor="#9ca3af"
            maxLength={16}
          />

          <MenuButton
            icon="▶"
            title="SINGLEPLAYER"
            subtitle="AI MODE"
            onPress={() => setScreen("DIFFICULTY")}
          />

          <MenuButton
            icon="👥"
            title="PLAY ONLINE"
            onPress={() => setScreen("ONLINE")}
          />

          <MenuButton
            icon="?"
            title="TUTORIAL"
            subtitle="OYUNU ÖĞREN"
            onPress={() => setScreen("TUTORIAL")}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "TUTORIAL") {
    return (
      <SafeAreaView style={styles.screen}>
        {renderBackButton()}
        {renderLogo()}

        <Text style={styles.mainTitle}>TUTORIAL</Text>
        <Text style={styles.subtitle}>Wall Chess kurallarını hızlıca öğren</Text>

        <View style={styles.infoCard}>
          <TutorialStep
            number="1"
            title="Hedef"
            text="Kırmızı taşın amacı üst sıraya ulaşmak. AI taşının amacı alt sıraya ulaşmak."
          />
          <TutorialStep
            number="2"
            title="Legal kareler"
            text="Taş taşı modunda parlak kareler gidebileceğin legal kareleri gösterir."
          />
          <TutorialStep
            number="3"
            title="Duvar"
            text="Duvar koy modu açıkken boş çizgi alanlarına dokunarak rakibin yolunu uzatabilirsin."
          />
          <TutorialStep
            number="4"
            title="Yol kapatma"
            text="Bir duvar iki oyuncudan birinin hedefe giden bütün yolunu kapatıyorsa oyun buna izin vermez."
          />
          <TutorialStep
            number="5"
            title="Geri dönüş"
            text="Taş az önce geldiği kareye hemen geri dönemez; ama yolu bulmak için başka yöne dolaşabilir."
          />
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "SETTINGS") {
    return (
      <SafeAreaView style={styles.screen}>
        {renderBackButton()}
        {renderLogo()}

        <Text style={styles.mainTitle}>AYARLAR</Text>
        <Text style={styles.subtitle}>Oyun hissini kendine göre ayarla</Text>

        <View style={styles.infoCard}>
          <SettingRow
            title="Ses"
            subtitle="Taş, duvar ve kazanma efektleri"
            enabled={soundEnabled}
            onToggle={() => setSoundEnabled((prev) => !prev)}
          />
          <SettingRow
            title="Titreşim"
            subtitle="Hamlelerde dokunsal geri bildirim"
            enabled={vibrationEnabled}
            onToggle={() => setVibrationEnabled((prev) => !prev)}
          />

          <View style={styles.settingsNote}>
            <Text style={styles.settingsNoteText}>
              Ses için projede expo-av kurulu olmalı. Titreşim cihaz destekliyorsa çalışır.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "PROFILE") {
    return (
      <SafeAreaView style={styles.screen}>
        {renderBackButton()}

        <ScrollView
          style={styles.profileScroll}
          contentContainerStyle={styles.profileScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profileHero}>
            <View style={styles.profileHeroAvatar}>
              {avatarImageUri ? (
                <Image source={{ uri: avatarImageUri }} style={styles.profileHeroAvatarImage} />
              ) : (
                <Text style={styles.profileHeroAvatarText}>{avatar}</Text>
              )}
            </View>

            <Text style={styles.profileHeroName}>{nickname || "You"}</Text>
            <Text style={styles.profileHeroMeta}>Level {profileLevel} · {xp} XP</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.profileSectionTitle}>Profil</Text>

            <Text style={styles.inputLabel}>Oyuncu adı</Text>
            <TextInput
              style={styles.nickInput}
              value={nickname}
              onChangeText={setNickname}
              placeholder="Your nickname"
              placeholderTextColor="#9ca3af"
              maxLength={16}
            />

            <Text style={styles.profileSectionTitle}>Avatar</Text>
            <AnimatedTapButton
              style={styles.galleryAvatarButton}
              onPress={pickAvatarFromGallery}
              pressedScale={0.96}
            >
              <Text style={styles.galleryAvatarButtonText}>Galeriden fotoğraf seç</Text>
            </AnimatedTapButton>

            <View style={styles.avatarGrid}>
              {AVATAR_OPTIONS.map((option) => (
                <View key={option}>
                  <AnimatedTapButton
                    style={[
                      styles.avatarOption,
                      !avatarImageUri && avatar === option && styles.avatarOptionActive,
                    ]}
                    onPress={() => {
                      setAvatar(option);
                      setAvatarImageUri(null);
                    }}
                    pressedScale={0.9}
                  >
                    <Text
                      style={[
                        styles.avatarOptionText,
                        !avatarImageUri && avatar === option && styles.avatarOptionTextActive,
                      ]}
                    >
                      {option}
                    </Text>
                  </AnimatedTapButton>
                </View>
              ))}
            </View>

            <View style={styles.profileStatsGrid}>
              <ProfileStat label="Win" value={profileStats.wins} />
              <ProfileStat label="Loss" value={profileStats.losses} />
              <ProfileStat label="Win Rate" value={`${getWinRate(profileStats)}%`} />
              <ProfileStat label="Toplam XP" value={xp} />
              <ProfileStat label="Streak" value={`${streak.count} gün`} />
              <ProfileStat label="En İyi Seri" value={bestWinStreak} />
            </View>

            <View style={styles.levelBox}>
              <View style={styles.levelHeader}>
                <Text style={styles.levelTitle}>Level {profileLevel}</Text>
                <Text style={styles.levelProgressText}>{profileLevelProgress}/100 XP</Text>
              </View>
              <View style={styles.levelTrack}>
                <View style={[styles.levelFill, { width: `${profileLevelProgress}%` }]} />
              </View>
            </View>

            <View style={styles.questBox}>
              <View style={styles.questHeader}>
                <Text style={styles.questTitle}>Günlük görev</Text>
                <Text style={styles.questReward}>+{dailyTask.rewardXp} XP</Text>
              </View>
              <Text style={styles.questDescription}>{dailyTask.title}</Text>
              <View style={styles.dailyTaskTrack}>
                <View style={[styles.dailyTaskFill, { width: `${dailyProgressPercent}%` }]} />
              </View>
              <Text style={styles.questProgress}>
                {dailyTask.progress}/{dailyTask.target} · {dailyProgressPercent}% tamamlandı
              </Text>

              <AnimatedTapButton
                style={styles.refreshTaskButton}
                onPress={refreshDailyTask}
                pressedScale={0.96}
              >
                <Text style={styles.refreshTaskButtonText}>
                  {dailyTask.refreshedDateKey === getDateKey()
                    ? "Bugün yenilendi"
                    : "Görevi yenile"}
                </Text>
              </AnimatedTapButton>
            </View>

            <View style={styles.questBox}>
              <View style={styles.questHeader}>
                <Text style={styles.questTitle}>Haftalık sandık</Text>
                <Text style={styles.questReward}>+120 XP</Text>
              </View>
              <Text style={styles.questDescription}>
                Bu hafta 5 günlük görev tamamla: {weeklyChest.completedTasks}/5
              </Text>
              <View style={styles.dailyTaskTrack}>
                <View
                  style={[
                    styles.dailyTaskFill,
                    { width: `${Math.min(100, weeklyChest.completedTasks * 20)}%` },
                  ]}
                />
              </View>

              <AnimatedTapButton
                style={[
                  styles.refreshTaskButton,
                  weeklyChest.completedTasks >= 5 && !weeklyChest.claimed && styles.claimChestButton,
                ]}
                onPress={claimWeeklyChest}
                pressedScale={0.96}
              >
                <Text style={styles.refreshTaskButtonText}>
                  {weeklyChest.claimed ? "Sandık alındı" : "Sandığı kontrol et"}
                </Text>
              </AnimatedTapButton>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "DIFFICULTY") {
    return (
      <SafeAreaView style={styles.screen}>
        {renderBackButton()}
        {renderLogo()}

        <Text style={styles.mainTitle}>ZORLUK</Text>
        <Text style={styles.subtitle}>Yapay zekanın seviyesini seç</Text>

        <View style={styles.menuCard}>
          <MenuButton icon="●" title="KOLAY" onPress={() => startSingleplayer("EASY")} />
          <MenuButton icon="◆" title="ORTA" onPress={() => startSingleplayer("MEDIUM")} />
          <MenuButton icon="▲" title="ZOR" onPress={() => startSingleplayer("HARD")} />
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "GAME_MODE") {
    return (
      <SafeAreaView style={styles.screen}>
        {renderBackButton()}
        {renderLogo()}

        <Text style={styles.mainTitle}>MOD SEÇ</Text>
        <Text style={styles.subtitle}>Her mod farklı bir maç temposu verir</Text>

        <View style={styles.menuCard}>
          {(
            [
              "CLASSIC",
              "BLITZ",
              "MAZE",
              "PUZZLE",
              "TIMED",
              "WIN_STREAK",
              "MOVE_LIMIT",
            ] as GameMode[]
          ).map((modeOption) => (
            <View key={modeOption}>
              <MenuButton
                icon={
                  modeOption === "CLASSIC"
                    ? "C"
                    : modeOption === "BLITZ"
                      ? ">"
                      : modeOption === "MAZE"
                        ? "M"
                        : modeOption === "PUZZLE"
                          ? "?"
                          : modeOption === "TIMED"
                            ? "T"
                            : modeOption === "WIN_STREAK"
                              ? "S"
                              : "30"
                }
                title={GAME_MODE_CONFIG[modeOption].title.toUpperCase()}
                subtitle={GAME_MODE_CONFIG[modeOption].subtitle}
                onPress={() => startGameMode(modeOption)}
              />
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }
if (screen === "ONLINE") {
  return (
    <SafeAreaView style={styles.screen}>
      {renderBackButton()}
      {renderLogo()}

      <Text style={styles.mainTitle}>ONLINE</Text>
      <Text style={styles.subtitle}>Oda oluştur veya oda koduyla katıl</Text>

      <View style={styles.menuCard}>
        {onlineRoomCode ? (
          <Text style={styles.onlineRoomText}>
            Oda Kodu: {onlineRoomCode} | Sen: P{onlinePlayerNumber}
          </Text>
        ) : null}

        <TextInput
          style={styles.nickInput}
          value={joinCodeInput}
          onChangeText={setJoinCodeInput}
          placeholder="6 haneli oda kodu"
          placeholderTextColor="#9ca3af"
          keyboardType="number-pad"
          maxLength={6}
        />

        <MenuButton
          icon="↪"
          title={onlineLoading ? "LOADING..." : "JOIN ROOM"}
          onPress={handleJoinOnlineRoom}
        />

        <MenuButton
          icon="+"
          title={onlineLoading ? "LOADING..." : "CREATE ROOM"}
          onPress={handleCreateOnlineRoom}
        />
      </View>
    </SafeAreaView>
  );
}

  return (
    <SafeAreaView style={styles.gameScreen}>
      {renderBackButton()}

      <View style={styles.hudCard}>
        <View style={styles.hudHeader}>
          <View>
            <Text style={styles.hudEyebrow}>SIRA</Text>
            <Text style={styles.hudTitle}>{currentPlayerName}</Text>
          </View>

          <AnimatedTapButton style={styles.restartButton} onPress={restartMatch}>
            <Text style={styles.restartButtonText}>Restart</Text>
          </AnimatedTapButton>
        </View>

        <View style={styles.hudGrid}>
          <HudStat label="Senin Duvar" value={state.wallsLeft[1]} />
          <HudStat label="AI Duvar" value={state.wallsLeft[2]} />
          <HudStat label="Tur" value={turnCount} />
          <HudStat
            label="Süre"
            value={activeModeConfig.hasTimer ? formatTimer(remainingSeconds) : "Yok"}
            danger={activeModeConfig.hasTimer && remainingSeconds <= 30}
          />
          <HudStat
            label="Hamle Limiti"
            value={activeModeConfig.moveLimit ? `${turnCount}/${activeModeConfig.moveLimit}` : "Yok"}
            danger={Boolean(activeModeConfig.moveLimit && turnCount >= activeModeConfig.moveLimit - 3)}
          />
        </View>

        <View style={styles.dailyTaskHud}>
          <View style={styles.dailyTaskHudHeader}>
            <Text style={styles.dailyTaskTitle}>Günlük görev: {dailyTask.title}</Text>
            <Text style={styles.dailyTaskPercent}>{dailyProgressPercent}%</Text>
          </View>
          <View style={styles.dailyTaskTrack}>
            <View style={[styles.dailyTaskFill, { width: `${dailyProgressPercent}%` }]} />
          </View>
        </View>

        <View style={styles.hudFooter}>
          <Text style={styles.hudFooterText}>
            Skor {score[1]}-{score[2]}
          </Text>
          <Text style={styles.hudFooterText}>XP {xp}</Text>
          <Text style={styles.hudFooterText}>{activeModeConfig.title}</Text>
        </View>
      </View>

      <View style={styles.segmentWrap}>
        <Pressable
          style={[styles.segmentButton, mode === "MOVE" && styles.segmentActive]}
          onPress={() => setMode("MOVE")}
        >
          <Text style={[styles.segmentText, mode === "MOVE" && styles.segmentActiveText]}>
            Taş Taşı
          </Text>
        </Pressable>

        <Pressable
          style={[styles.segmentButton, mode === "WALL" && styles.segmentActive]}
          onPress={() => setMode("WALL")}
        >
          <Text style={[styles.segmentText, mode === "WALL" && styles.segmentActiveText]}>
            Duvar Koy
          </Text>
        </Pressable>

        <Pressable
          style={styles.orientationButton}
          onPress={() => setWallOrientation((prev) => (prev === "H" ? "V" : "H"))}
        >
          <Text style={styles.orientationText}>
            {wallOrientation === "H" ? "0-0" : "0|0"}
          </Text>
        </Pressable>
      </View>

      <Modal visible={state.winner !== null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.winModal}>
            <Text style={styles.modalEyebrow}>MAÇ BİTTİ</Text>
            <Text style={styles.modalTitle}>{winnerName} kazandı</Text>
            <Text style={styles.modalSubtitle}>
              Skor {score[1]}-{score[2]} · Tur {turnCount} · XP {xp}
            </Text>

            <View style={styles.modalActions}>
              <AnimatedTapButton
                containerStyle={styles.modalActionLeft}
                style={styles.secondaryModalButton}
                onPress={goBack}
              >
                <Text style={styles.secondaryModalButtonText}>Menü</Text>
              </AnimatedTapButton>

              <AnimatedTapButton
                containerStyle={styles.modalActionRight}
                style={styles.primaryModalButton}
                onPress={rematch}
              >
                <Text style={styles.primaryModalButtonText}>Rematch</Text>
              </AnimatedTapButton>
            </View>
          </View>

          <ConfettiOverlay visible={showConfetti} burstId={confettiBurstId} />
        </View>
      </Modal>

      <Board
        state={state}
        mode={mode}
        wallOrientation={wallOrientation}
        legalMoves={legalMoves}
        onCellPress={handleCellPress}
      />

   <Text style={styles.gameHint}>
  {onlineRoomCode
    ? `Online oda: ${onlineRoomCode} | Sen P${onlinePlayerNumber} | Sıra P${state.currentPlayer}`
    : `${state.currentPlayer === 1 ? nickname || "You" : "AI"} - ${
        mode === "MOVE" ? "taşı hareket ettir" : "duvar yerleştir"
      }`}
</Text>
      <Text style={styles.difficultyText}>
        AI Mode: {difficulty === "EASY" ? "Kolay" : difficulty === "MEDIUM" ? "Orta" : "Zor"}
      </Text>
    </SafeAreaView>
  );
}

function Board({
  state,
  mode,
  wallOrientation,
  legalMoves,
  onCellPress,
}: {
  state: GameState;
  mode: Mode;
  wallOrientation: Orientation;
  legalMoves: Position[];
  onCellPress: (row: number, col: number, orientation?: Orientation) => void;
}) {
  const visualSize = BOARD_SIZE * 2 - 1;
  const pawnPulse = useRef(new Animated.Value(0)).current;
  const wallPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!state.lastAction) return;

    const value = state.lastAction.type === "MOVE" ? pawnPulse : wallPulse;
    value.setValue(0);
    Animated.sequence([
      Animated.timing(value, {
        toValue: 1,
        duration: 140,
        easing: Easing.out(Easing.back(1.8)),
        useNativeDriver: true,
      }),
      Animated.timing(value, {
        toValue: 0.35,
        duration: 110,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(value, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
      Animated.timing(value, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [pawnPulse, state.lastAction, wallPulse]);

  function isLegalMoveCell(row: number, col: number) {
    return legalMoves.some((move) => move.row === row && move.col === col);
  }

  function isLastMoveFrom(row: number, col: number) {
    return (
      state.lastAction?.type === "MOVE" &&
      state.lastAction.from.row === row &&
      state.lastAction.from.col === col
    );
  }

  function isLastMoveTo(row: number, col: number) {
    return (
      state.lastAction?.type === "MOVE" &&
      state.lastAction.to.row === row &&
      state.lastAction.to.col === col
    );
  }

  function isLastWall(wall: Wall) {
    return state.lastAction?.type === "WALL" && wallKey(state.lastAction.wall) === wallKey(wall);
  }

  function canPreviewWall(row: number, col: number, orientation: Orientation) {
    if (mode !== "WALL") return false;
    return getWallPlacement({ row, col, orientation }, state).status === "OK";
  }

  function renderPawn(row: number, col: number) {
    const p1 = state.pawns[1];
    const p2 = state.pawns[2];
    const isAnimatedTarget = isLastMoveTo(row, col);
    const animatedPawnStyle = isAnimatedTarget
      ? {
          transform: [
            {
              scale: pawnPulse.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.32],
              }),
            },
          ],
        }
      : null;

    if (p1.row === row && p1.col === col) {
      return (
        <Animated.View style={[styles.pawnOuter, styles.pawnOneOuter, animatedPawnStyle]}>
          <View style={[styles.pawnInner, styles.pawnOneInner]} />
        </Animated.View>
      );
    }

    if (p2.row === row && p2.col === col) {
      return (
        <Animated.View style={[styles.pawnOuter, styles.pawnTwoOuter, animatedPawnStyle]}>
          <View style={[styles.pawnInner, styles.pawnTwoInner]} />
        </Animated.View>
      );
    }

    return null;
  }

  function renderVisualItem(visualRow: number, visualCol: number) {
    const isCell = visualRow % 2 === 0 && visualCol % 2 === 0;
    const isVerticalWallSlot = visualRow % 2 === 0 && visualCol % 2 === 1;
    const isHorizontalWallSlot = visualRow % 2 === 1 && visualCol % 2 === 0;
    const isIntersection = visualRow % 2 === 1 && visualCol % 2 === 1;

    if (isCell) {
      const row = visualRow / 2;
      const col = visualCol / 2;
      const legal = isLegalMoveCell(row, col);

      return (
        <Pressable
          key={`${visualRow}-${visualCol}`}
          style={[
            styles.realCell,
            row === 0 && styles.topGoalCell,
            row === BOARD_SIZE - 1 && styles.bottomGoalCell,
            legal && mode === "MOVE" && styles.legalCell,
            isLastMoveFrom(row, col) && styles.lastMoveFromCell,
            isLastMoveTo(row, col) && styles.lastMoveToCell,
          ]}
          onPress={() => {
            if (mode === "MOVE") onCellPress(row, col);
          }}
        >
          {renderPawn(row, col)}
        </Pressable>
      );
    }

    if (isVerticalWallSlot) {
      const row = visualRow / 2;
      const col = Math.floor(visualCol / 2);
      const isPlayableSlot = row < BOARD_SIZE - 1 && col < BOARD_SIZE - 1;
      const legalPreview = isPlayableSlot && canPreviewWall(row, col, "V");

      return (
        <Pressable
          key={`${visualRow}-${visualCol}`}
          style={[
            styles.verticalSlot,
            mode === "WALL" && wallOrientation === "V" && styles.wallSlotPreview,
            legalPreview && wallOrientation === "V" && styles.legalWallPreview,
          ]}
          onPress={() => {
            if (mode === "WALL" && isPlayableSlot) onCellPress(row, col, "V");
          }}
        />
      );
    }

    if (isHorizontalWallSlot) {
      const row = Math.floor(visualRow / 2);
      const col = visualCol / 2;
      const isPlayableSlot = row < BOARD_SIZE - 1 && col < BOARD_SIZE - 1;
      const legalPreview = isPlayableSlot && canPreviewWall(row, col, "H");

      return (
        <Pressable
          key={`${visualRow}-${visualCol}`}
          style={[
            styles.horizontalSlot,
            mode === "WALL" && wallOrientation === "H" && styles.wallSlotPreview,
            legalPreview && wallOrientation === "H" && styles.legalWallPreview,
          ]}
          onPress={() => {
            if (mode === "WALL" && isPlayableSlot) onCellPress(row, col, "H");
          }}
        />
      );
    }

    if (isIntersection) {
      return <View key={`${visualRow}-${visualCol}`} style={styles.intersection} />;
    }

    return null;
  }

  return (
    <View style={styles.boardShell}>
      {Array.from({ length: visualSize }).map((_, visualRow) => (
        <View key={visualRow} style={styles.visualRow}>
          {Array.from({ length: visualSize }).map((__, visualCol) =>
            renderVisualItem(visualRow, visualCol)
          )}
        </View>
      ))}

      {state.walls.map((wall) => {
        const animatedWallStyle = isLastWall(wall)
          ? {
              transform: [
                {
                  scale: wallPulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.24],
                  }),
                },
              ],
            }
          : null;

        if (wall.orientation === "H") {
          return (
            <Animated.View
              key={`wall-${wall.row}-${wall.col}-${wall.orientation}`}
              pointerEvents="none"
              style={[
                styles.wallOverlay,
                styles.horizontalWallOverlay,
                isLastWall(wall) && styles.lastWallOverlay,
                animatedWallStyle,
                {
                  top: wall.row * (CELL_SIZE + GAP) + CELL_SIZE - WALL_THICKNESS / 2,
                  left: wall.col * (CELL_SIZE + GAP),
                },
              ]}
            />
          );
        }

        return (
          <Animated.View
            key={`wall-${wall.row}-${wall.col}-${wall.orientation}`}
            pointerEvents="none"
            style={[
            styles.wallOverlay,
            styles.verticalWallOverlay,
            isLastWall(wall) && styles.lastWallOverlay,
            animatedWallStyle,
            {
                top: wall.row * (CELL_SIZE + GAP),
                left: wall.col * (CELL_SIZE + GAP) + CELL_SIZE - WALL_THICKNESS / 2,
            },
            ]}
          />
        );
      })}
    </View>
  );
}

function ConfettiOverlay({ visible, burstId }: { visible: boolean; burstId: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }).map((_, index) => ({
        id: index,
        left: Math.random() * SCREEN_WIDTH,
        drift: Math.random() * 120 - 60,
        delay: Math.random() * 420,
        duration: 1800 + Math.random() * 900,
        size: 6 + Math.random() * 6,
        rotate: Math.random() * 360,
        color: ["#c9322d", "#d8bd86", "#f4e8d4", "#7a1f17", "#ffffff"][
          index % 5
        ],
      })),
    []
  );
  const animations = useRef(pieces.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!visible) return;

    animations.forEach((value) => value.setValue(0));

    Animated.stagger(
      22,
      animations.map((value, index) =>
        Animated.timing(value, {
          toValue: 1,
          duration: pieces[index].duration,
          delay: pieces[index].delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      )
    ).start();
  }, [animations, burstId, pieces, visible]);

  if (!visible) return null;

  return (
    <View pointerEvents="none" style={styles.confettiLayer}>
      {pieces.map((piece, index) => {
        const progress = animations[index];
        const translateY = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-40, SCREEN_HEIGHT + 80],
        });
        const translateX = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, piece.drift],
        });
        const rotate = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [`${piece.rotate}deg`, `${piece.rotate + 540}deg`],
        });
        const opacity = progress.interpolate({
          inputRange: [0, 0.82, 1],
          outputRange: [1, 1, 0],
        });

        return (
          <Animated.View
            key={piece.id}
            style={[
              styles.confettiPiece,
              {
                left: piece.left,
                width: piece.size,
                height: piece.size * 1.6,
                backgroundColor: piece.color,
                opacity,
                transform: [{ translateX }, { translateY }, { rotate }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function TutorialStep({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.tutorialStep}>
      <View style={styles.tutorialBadge}>
        <Text style={styles.tutorialBadgeText}>{number}</Text>
      </View>

      <View style={styles.tutorialTextWrap}>
        <Text style={styles.tutorialTitle}>{title}</Text>
        <Text style={styles.tutorialText}>{text}</Text>
      </View>
    </View>
  );
}

function SettingRow({
  title,
  subtitle,
  enabled,
  onToggle,
}: {
  title: string;
  subtitle: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingCopy}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>

      <AnimatedTapButton
        containerStyle={styles.toggleTapArea}
        style={[styles.toggleTrack, enabled && styles.toggleTrackOn]}
        onPress={onToggle}
        pressedScale={0.92}
      >
        <View style={[styles.toggleThumb, enabled && styles.toggleThumbOn]} />
      </AnimatedTapButton>
    </View>
  );
}

function ProfileStat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.profileStat}>
      <Text style={styles.profileStatLabel}>{label}</Text>
      <Text style={styles.profileStatValue}>{value}</Text>
    </View>
  );
}

function HudStat({
  label,
  value,
  danger,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
}) {
  return (
    <View style={[styles.hudStat, danger && styles.hudStatDanger]}>
      <Text style={styles.hudStatLabel}>{label}</Text>
      <Text style={[styles.hudStatValue, danger && styles.hudStatValueDanger]}>
        {value}
      </Text>
    </View>
  );
}

function AnimatedTapButton({
  children,
  containerStyle,
  style,
  onPress,
  pressedScale = 0.94,
}: {
  children?: React.ReactNode;
  containerStyle?: any;
  style?: any;
  onPress: () => void;
  pressedScale?: number;
}) {
  const pressScale = useRef(new Animated.Value(1)).current;

  function animatePress(toValue: number) {
    Animated.timing(pressScale, {
      toValue,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }

  return (
    <Animated.View style={[containerStyle, { transform: [{ scale: pressScale }] }]}>
      <Pressable
        style={style}
        onPress={onPress}
        onPressIn={() => animatePress(pressedScale)}
        onPressOut={() => animatePress(1)}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

function MenuButton({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <AnimatedTapButton style={styles.menuButton} onPress={onPress} pressedScale={0.96}>
      <View style={styles.menuIconBox}>
        <Text style={styles.menuIcon}>{icon}</Text>
      </View>

      <View>
        <Text style={styles.menuButtonTitle}>{title}</Text>
        {subtitle && <Text style={styles.menuButtonSubtitle}>{subtitle}</Text>}
      </View>
    </AnimatedTapButton>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f6f8",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  gameScreen: {
    flex: 1,
    backgroundColor: "#f5f6f8",
    alignItems: "center",
    paddingTop: 46,
  },

  backButton: {
    position: "absolute",
    top: 28,
    left: 18,
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },

  backText: {
    fontSize: 28,
    color: "#111827",
  },

  settingsIconButtonWrap: {
    position: "absolute",
    top: 36,
    right: 24,
    zIndex: 40,
  },

  settingsIconButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },

  settingsIconText: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "900",
  },

  profileButtonWrap: {
    position: "absolute",
    top: 36,
    left: 24,
    zIndex: 40,
  },

  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },

  profileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#c9322d",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#f4e8d4",
  },

  profileAvatarText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
  },

  homeLevelBadge: {
    position: "absolute",
    top: 38,
    alignSelf: "center",
    minWidth: 88,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 35,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },

  homeLevelLabel: {
    color: "#9ca3af",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.4,
  },

  homeLevelValue: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
    marginTop: -1,
  },

  profileAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 17,
  },

  profileHero: {
    alignItems: "center",
    marginBottom: 20,
  },

  profileScroll: {
    width: "100%",
  },

  profileScrollContent: {
    alignItems: "center",
    paddingTop: 82,
    paddingBottom: 36,
  },

  profileHeroAvatar: {
    width: 86,
    height: 86,
    borderRadius: 28,
    backgroundColor: "#c9322d",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#f4e8d4",
    shadowColor: "#7f1d1d",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },

  profileHeroAvatarText: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "900",
  },

  profileHeroAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 24,
  },

  profileHeroName: {
    color: "#111827",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 12,
  },

  profileHeroMeta: {
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },

  logoWrap: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },

  logoRed: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 84,
    height: 84,
    backgroundColor: "#ca2e2a",
  },

  logoCream: {
    position: "absolute",
    right: -22,
    bottom: -22,
    width: 92,
    height: 92,
    borderRadius: 28,
    backgroundColor: "#f4e8d4",
    transform: [{ rotate: "45deg" }],
  },

  logoPiece: {
    fontSize: 38,
    color: "#ffffff",
    fontWeight: "900",
  },

  mainTitle: {
    fontSize: 38,
    letterSpacing: 4,
    color: "#24282f",
    fontWeight: "900",
    marginBottom: 10,
  },

  subtitle: {
    fontSize: 16,
    color: "#6b7280",
    marginBottom: 34,
  },

  menuCard: {
    width: "92%",
    borderRadius: 26,
    backgroundColor: "#ffffff",
    padding: 14,
    shadowColor: "#7f1d1d",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 7,
  },

  infoCard: {
    width: "92%",
    borderRadius: 22,
    backgroundColor: "#ffffff",
    padding: 14,
    shadowColor: "#7f1d1d",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 7,
  },

  tutorialStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f2f4",
  },

  tutorialBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#f9d8d5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  tutorialBadgeText: {
    color: "#c9322d",
    fontSize: 13,
    fontWeight: "900",
  },

  tutorialTextWrap: {
    flex: 1,
  },

  tutorialTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900",
  },

  tutorialText: {
    color: "#6b7280",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
    fontWeight: "600",
  },

  settingRow: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f2f4",
  },

  settingCopy: {
    flex: 1,
    paddingRight: 12,
  },

  settingTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "900",
  },

  settingSubtitle: {
    color: "#6b7280",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
    fontWeight: "700",
  },

  toggleTapArea: {
    width: 58,
    alignItems: "flex-end",
  },

  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#e5e7eb",
    padding: 3,
    justifyContent: "center",
  },

  toggleTrackOn: {
    backgroundColor: "#c9322d",
  },

  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  toggleThumbOn: {
    alignSelf: "flex-end",
  },

  settingsNote: {
    paddingTop: 12,
  },

  settingsNoteText: {
    color: "#9ca3af",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },

  profileSectionTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 12,
  },

  avatarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
    marginBottom: 16,
  },

  galleryAvatarButton: {
    height: 46,
    borderRadius: 16,
    backgroundColor: "#f9d8d5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  galleryAvatarButtonText: {
    color: "#c9322d",
    fontSize: 13,
    fontWeight: "900",
  },

  avatarOption: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#f5f6f8",
    alignItems: "center",
    justifyContent: "center",
    margin: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  avatarOptionActive: {
    backgroundColor: "#c9322d",
    borderColor: "#c9322d",
  },

  avatarOptionText: {
    color: "#374151",
    fontSize: 20,
    fontWeight: "900",
  },

  avatarOptionTextActive: {
    color: "#ffffff",
  },

  profileStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
    marginTop: 4,
  },

  profileStat: {
    width: "50%",
    padding: 4,
  },

  profileStatLabel: {
    color: "#6b7280",
    fontSize: 11,
    fontWeight: "800",
  },

  profileStatValue: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 2,
  },

  levelBox: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f2f4",
  },

  levelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  levelTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900",
  },

  levelProgressText: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "800",
  },

  levelTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#f1f2f4",
    overflow: "hidden",
  },

  levelFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#c9322d",
  },

  questBox: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f2f4",
  },

  questHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  questTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900",
  },

  questReward: {
    color: "#c9322d",
    fontSize: 12,
    fontWeight: "900",
  },

  questDescription: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 6,
    marginBottom: 8,
  },

  questProgress: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 6,
  },

  refreshTaskButton: {
    height: 38,
    borderRadius: 14,
    backgroundColor: "#f9d8d5",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },

  claimChestButton: {
    backgroundColor: "#d8bd86",
  },

  refreshTaskButtonText: {
    color: "#c9322d",
    fontSize: 12,
    fontWeight: "900",
  },

  inputLabel: {
    textAlign: "center",
    color: "#6b7280",
    letterSpacing: 4,
    marginBottom: 12,
  },

  nickInput: {
    height: 58,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    textAlign: "center",
    color: "#111827",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 22,
    backgroundColor: "#ffffff",
  },

  menuButton: {
    height: 62,
    borderRadius: 18,
    backgroundColor: "#c9322d",
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    shadowColor: "#7f1d1d",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },

  menuIconBox: {
    width: 60,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.22)",
    marginRight: 14,
  },

  menuIcon: {
    color: "#ffffff",
    fontSize: 21,
    fontWeight: "900",
  },

  menuButtonTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2,
  },

  menuButtonSubtitle: {
    marginTop: 3,
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },

  hudCard: {
    width: "92%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 48,
    marginBottom: 6,
    shadowColor: "#7f1d1d",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },

  hudHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },

  hudEyebrow: {
    color: "#9ca3af",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },

  hudTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "900",
  },

  restartButton: {
    minWidth: 66,
    height: 26,
    borderRadius: 10,
    backgroundColor: "#f9d8d5",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
onlineRoomText: {
  textAlign: "center",
  color: "#c9322d",
  fontSize: 15,
  fontWeight: "900",
  marginBottom: 14,
},
  restartButtonText: {
    color: "#c9322d",
    fontWeight: "900",
    fontSize: 10,
  },

  hudGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },

  hudStat: {
    width: "50%",
    paddingHorizontal: 3,
    paddingVertical: 1,
  },

  hudStatDanger: {
    opacity: 1,
  },

  hudStatLabel: {
    color: "#6b7280",
    fontSize: 9,
    fontWeight: "800",
  },

  hudStatValue: {
    marginTop: 1,
    color: "#111827",
    fontSize: 13,
    fontWeight: "900",
  },

  hudStatValueDanger: {
    color: "#dc2626",
  },

  dailyTaskHud: {
    marginTop: 5,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#f1f2f4",
  },

  dailyTaskHudHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },

  dailyTaskTitle: {
    color: "#6b7280",
    fontSize: 10,
    fontWeight: "900",
  },

  dailyTaskPercent: {
    color: "#111827",
    fontSize: 10,
    fontWeight: "900",
  },

  dailyTaskTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#f1f2f4",
    overflow: "hidden",
  },

  dailyTaskFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#c9322d",
  },

  hudFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#f1f2f4",
    marginTop: 3,
    paddingTop: 4,
  },

  hudFooterText: {
    color: "#6b7280",
    fontSize: 10,
    fontWeight: "900",
  },

  gameTop: {
    width: "92%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 44,
    marginBottom: 14,
  },

  playerPill: {
    minWidth: 118,
    height: 34,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },

  activePill: {
    borderWidth: 1,
    borderColor: "#dc2626",
  },

  redDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#d13a31",
    marginRight: 6,
  },

  creamDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#f3d4aa",
    borderWidth: 1,
    borderColor: "#dfa86e",
    marginRight: 6,
  },

  playerText: {
    color: "#374151",
    fontSize: 13,
  },

  boldText: {
    color: "#111827",
    fontWeight: "900",
  },

  turnPill: {
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  turnText: {
    color: "#6b7280",
    fontWeight: "700",
  },

  segmentWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    marginBottom: 12,
    overflow: "hidden",
  },

  segmentButton: {
    paddingHorizontal: 22,
    paddingVertical: 13,
  },

  segmentActive: {
    backgroundColor: "#f9d8d5",
  },

  segmentText: {
    color: "#6b7280",
    fontWeight: "700",
  },

  segmentActiveText: {
    color: "#c9322d",
  },

  orientationButton: {
    paddingHorizontal: 16,
    paddingVertical: 13,
  },

  orientationText: {
    color: "#374151",
    fontWeight: "800",
  },

  winnerBox: {
    backgroundColor: "#ffffff",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 18,
    marginBottom: 10,
    alignItems: "center",
  },

  winnerText: {
    color: "#c9322d",
    fontSize: 16,
    fontWeight: "900",
  },

  smallResetButton: {
    marginTop: 8,
    backgroundColor: "#c9322d",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },

  smallResetText: {
    color: "#fff",
    fontWeight: "800",
  },

  confettiLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
  },

  confettiPiece: {
    position: "absolute",
    top: 0,
    borderRadius: 2,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.42)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  winModal: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    padding: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },

  modalEyebrow: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 8,
  },

  modalTitle: {
    color: "#111827",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
  },

  modalSubtitle: {
    color: "#6b7280",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 8,
    textAlign: "center",
  },

  modalActions: {
    width: "100%",
    flexDirection: "row",
    marginTop: 22,
  },

  modalActionLeft: {
    flex: 1,
    marginRight: 8,
  },

  modalActionRight: {
    flex: 1,
    marginLeft: 8,
  },

  secondaryModalButton: {
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryModalButtonText: {
    color: "#374151",
    fontWeight: "900",
  },

  primaryModalButton: {
    height: 48,
    borderRadius: 16,
    backgroundColor: "#c9322d",
    alignItems: "center",
    justifyContent: "center",
  },

  primaryModalButtonText: {
    color: "#ffffff",
    fontWeight: "900",
  },

  boardShell: {
    width: BOARD_WIDTH,
    backgroundColor: "#220606",
    position: "relative",
    overflow: "visible",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },

  wallOverlay: {
    position: "absolute",
    backgroundColor: WALL_COLOR,
    borderRadius: 999,
    zIndex: 999,
    shadowColor: "#d1a86d",
    shadowOpacity: 0.42,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 999,
  },

  horizontalWallOverlay: {
    width: CELL_SIZE * 2 + GAP,
    height: WALL_THICKNESS,
  },

  verticalWallOverlay: {
    width: WALL_THICKNESS,
    height: CELL_SIZE * 2 + GAP,
  },

  visualRow: {
    flexDirection: "row",
  },

  realCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    backgroundColor: "#2b0b0b",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },

  topGoalCell: {
    backgroundColor: "#4b2d20",
  },

  bottomGoalCell: {
    backgroundColor: "#702116",
  },

  legalCell: {
    backgroundColor: "#6f5f1c",
  },

  lastMoveFromCell: {
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.22)",
  },

  lastMoveToCell: {
    backgroundColor: "#a59228",
    borderWidth: 2,
    borderColor: "#f7e6c7",
  },

  verticalSlot: {
    width: GAP,
    height: CELL_SIZE,
    backgroundColor: "#220606",
    borderRadius: 4,
  },

  horizontalSlot: {
    width: CELL_SIZE,
    height: GAP,
    backgroundColor: "#220606",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },

  intersection: {
    width: GAP,
    height: GAP,
    backgroundColor: "#220606",
  },

  wallSlotPreview: {
    backgroundColor: "rgba(247, 230, 199, 0.18)",
  },

  legalWallPreview: {
    backgroundColor: "rgba(247, 230, 199, 0.42)",
  },

  lastWallOverlay: {
    backgroundColor: LAST_WALL_COLOR,
    shadowOpacity: 1,
    shadowRadius: 10,
  },

  pawnOuter: {
    width: CELL_SIZE * 0.72,
    height: CELL_SIZE * 0.72,
    borderRadius: CELL_SIZE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },

  pawnInner: {
    width: CELL_SIZE * 0.48,
    height: CELL_SIZE * 0.48,
    borderRadius: CELL_SIZE,
  },

  pawnOneOuter: {
    backgroundColor: "#dc3a30",
  },

  pawnOneInner: {
    backgroundColor: "#f04a3f",
  },

  pawnTwoOuter: {
    backgroundColor: "#f7e6c7",
    borderWidth: 2,
    borderColor: "#d9b889",
  },

  pawnTwoInner: {
    backgroundColor: "#fff7e8",
  },

  gameHint: {
    marginTop: 14,
    color: "#6b7280",
    fontSize: 15,
  },

  difficultyText: {
    marginTop: 6,
    color: "#9ca3af",
    fontSize: 12,
  },
});
