import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase/firebase";

export type OnlinePlayer = {
  uid: string;
  nickname: string;
  ready: boolean;
};

export type OnlineGameStatus = "WAITING" | "READY" | "PLAYING" | "FINISHED";

export type OnlineWall = {
  row: number;
  col: number;
  orientation: "H" | "V";
};

export type OnlinePosition = {
  row: number;
  col: number;
};

export type OnlineGameDoc = {
  roomCode: string;
  status: OnlineGameStatus;
  createdAt: unknown;
  updatedAt: unknown;
  currentPlayer: 1 | 2;
  players: {
    p1: OnlinePlayer | null;
    p2: OnlinePlayer | null;
  };
  pawns: {
    1: OnlinePosition;
    2: OnlinePosition;
  };
  walls: OnlineWall[];
  wallsLeft: {
    1: number;
    2: number;
  };
  winner: 1 | 2 | null;
};

export function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function createRoom(params: {
  uid: string;
  nickname: string;
}) {
  const roomCode = generateRoomCode();
  const roomRef = doc(db, "games", roomCode);

  const game: OnlineGameDoc = {
    roomCode,
    status: "WAITING",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    currentPlayer: 1,
    players: {
      p1: {
        uid: params.uid,
        nickname: params.nickname,
        ready: false,
      },
      p2: null,
    },
    pawns: {
      1: { row: 8, col: 4 },
      2: { row: 0, col: 4 },
    },
    walls: [],
    wallsLeft: {
      1: 10,
      2: 10,
    },
    winner: null,
  };

  await setDoc(roomRef, game);

  return {
    roomCode,
    playerNumber: 1 as const,
    game,
  };
}

export async function joinRoom(params: {
  roomCode: string;
  uid: string;
  nickname: string;
}) {
  const cleanRoomCode = params.roomCode.trim();
  const roomRef = doc(db, "games", cleanRoomCode);
  const snapshot = await getDoc(roomRef);

  if (!snapshot.exists()) {
    throw new Error("Oda bulunamadı.");
  }

  const game = snapshot.data() as OnlineGameDoc;

  if (game.players.p2 && game.players.p2.uid !== params.uid) {
    throw new Error("Oda dolu.");
  }

  await updateDoc(roomRef, {
    "players.p2": {
      uid: params.uid,
      nickname: params.nickname,
      ready: true,
    },
    "players.p1.ready": true,
    status: "PLAYING",
    updatedAt: serverTimestamp(),
  });

  return {
    roomCode: cleanRoomCode,
    playerNumber: 2 as const,
  };
}

export function subscribeToRoom(
  roomCode: string,
  onGameChange: (game: OnlineGameDoc | null) => void,
  onError?: (error: Error) => void
) {
  const cleanRoomCode = roomCode.trim();
  const roomRef = doc(db, "games", cleanRoomCode);

  return onSnapshot(
    roomRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onGameChange(null);
        return;
      }

      onGameChange(snapshot.data() as OnlineGameDoc);
    },
    (error) => {
      if (onError) {
        onError(error);
      }
    }
  );
}

export async function updateOnlineGameState(params: {
  roomCode: string;
  pawns: OnlineGameDoc["pawns"];
  walls: OnlineGameDoc["walls"];
  wallsLeft: OnlineGameDoc["wallsLeft"];
  currentPlayer: 1 | 2;
  winner: 1 | 2 | null;
}) {
  const roomRef = doc(db, "games", params.roomCode.trim());

  await updateDoc(roomRef, {
    pawns: params.pawns,
    walls: params.walls,
    wallsLeft: params.wallsLeft,
    currentPlayer: params.currentPlayer,
    winner: params.winner,
    status: params.winner ? "FINISHED" : "PLAYING",
    updatedAt: serverTimestamp(),
  });
}