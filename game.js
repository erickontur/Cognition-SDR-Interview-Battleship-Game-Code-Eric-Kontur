(() => {
  "use strict";

  // ---------- Configuration ----------
  const BOARD_SIZE = 10;
  const SHIP_TYPES = [
    { id: "carrier",    name: "Carrier",    size: 5 },
    { id: "battleship", name: "Battleship", size: 4 },
    { id: "cruiser",    name: "Cruiser",    size: 3 },
    { id: "submarine",  name: "Submarine",  size: 3 },
    { id: "destroyer",  name: "Destroyer",  size: 2 },
  ];
  const COL_LABELS = "ABCDEFGHIJ".split("");

  // ---------- Game State ----------
  const state = {
    phase: "placement",
    orientation: "H", // "H" or "V"
    selectedShipId: null,
    playerShips: [],
    enemyShips: [],
    playerBoard: createBoard(),
    enemyBoard: createBoard(),
    playerTurn: true,
    ai: {
      mode: "hunt",
      targets: [],
      hits: [],
      lastShot: null,
    },
    lastPlayerShot: null,
    lastEnemyShot: null,
  };

  function createBoard() {
    const grid = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      const row = [];
      for (let c = 0; c < BOARD_SIZE; c++) {
        row.push({ shipId: null, shot: false });
      }
      grid.push(row);
    }
    return grid;
  }

  // ---------- DOM ----------
  const el = {
    playerBoard: document.getElementById("player-board"),
    enemyBoard: document.getElementById("enemy-board"),
    fleetPicker: document.getElementById("fleet-picker"),
    rotateBtn: document.getElementById("rotate-btn"),
    autoPlaceBtn: document.getElementById("auto-place-btn"),
    resetBtn: document.getElementById("reset-placement-btn"),
    startBtn: document.getElementById("start-btn"),
    newGameBtn: document.getElementById("new-game-btn"),
    placementControls: document.getElementById("placement-controls"),
    battleControls: document.getElementById("battle-controls"),
    phaseIndicator: document.getElementById("phase-indicator"),
    message: document.getElementById("message"),
    playerShipsLeft: document.getElementById("player-ships-left"),
    enemyShipsLeft: document.getElementById("enemy-ships-left"),
    gameOver: document.getElementById("game-over"),
    gameOverTitle: document.getElementById("game-over-title"),
    gameOverText: document.getElementById("game-over-text"),
    playAgainBtn: document.getElementById("play-again-btn"),
  };

  // ---------- Initialization ----------
  function init() {
    buildBoardDOM(el.playerBoard, "player");
    buildBoardDOM(el.enemyBoard, "enemy");
    buildFleetPicker();

    el.rotateBtn.addEventListener("click", toggleOrientation);
    el.autoPlaceBtn.addEventListener("click", autoPlacePlayer);
    el.resetBtn.addEventListener("click", resetPlacement);
    el.startBtn.addEventListener("click", startBattle);
    el.newGameBtn.addEventListener("click", resetGame);
    el.playAgainBtn.addEventListener("click", resetGame);

    document.addEventListener("keydown", (e) => {
      if (state.phase === "placement" && (e.key === "r" || e.key === "R")) {
        toggleOrientation();
      }
    });

    renderFleetPicker();
    updateRotateLabel();
  }

  function buildBoardDOM(container, owner) {
    container.innerHTML = "";
    const corner = document.createElement("div");
    corner.className = "label";
    container.appendChild(corner);
    for (let c = 0; c < BOARD_SIZE; c++) {
      const lbl = document.createElement("div");
      lbl.className = "label";
      lbl.textContent = COL_LABELS[c];
      container.appendChild(lbl);
    }
    for (let r = 0; r < BOARD_SIZE; r++) {
      const lbl = document.createElement("div");
      lbl.className = "label";
      lbl.textContent = r + 1;
      container.appendChild(lbl);
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.r = r;
        cell.dataset.c = c;
        cell.dataset.owner = owner;
        if (owner === "player") {
          cell.addEventListener("mouseenter", onPlayerCellHover);
          cell.addEventListener("mouseleave", clearPlacementPreview);
          cell.addEventListener("click", onPlayerCellClick);
        } else {
          cell.addEventListener("click", onEnemyCellClick);
        }
        container.appendChild(cell);
      }
    }
  }

  function buildFleetPicker() {
    el.fleetPicker.innerHTML = "";
    SHIP_TYPES.forEach((ship) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ship-chip";
      chip.dataset.shipId = ship.id;
      const cells = Array.from({ length: ship.size })
        .map(() => "<span></span>").join("");
      chip.innerHTML = `<span class="cells">${cells}</span> ${ship.name} <span class="size">(${ship.size})</span>`;
      chip.addEventListener("click", () => selectShip(ship.id));
      el.fleetPicker.appendChild(chip);
    });
  }

  // ---------- Placement ----------
  function selectShip(shipId) {
    if (state.playerShips.some((s) => s.id === shipId)) return;
    state.selectedShipId = shipId;
    renderFleetPicker();
  }

  function renderFleetPicker() {
    el.fleetPicker.querySelectorAll(".ship-chip").forEach((chip) => {
      const id = chip.dataset.shipId;
      chip.classList.toggle("placed", state.playerShips.some((s) => s.id === id));
      chip.classList.toggle("selected", id === state.selectedShipId);
    });
    if (state.phase === "placement" && !state.selectedShipId) {
      const next = SHIP_TYPES.find((s) => !state.playerShips.some((ps) => ps.id === s.id));
      if (next) {
        state.selectedShipId = next.id;
        el.fleetPicker.querySelector(`[data-ship-id="${next.id}"]`)?.classList.add("selected");
      }
    }
    el.startBtn.disabled = state.playerShips.length !== SHIP_TYPES.length;
  }

  function toggleOrientation() {
    state.orientation = state.orientation === "H" ? "V" : "H";
    updateRotateLabel();
  }

  function updateRotateLabel() {
    el.rotateBtn.textContent = `Rotate (R): ${state.orientation === "H" ? "Horizontal" : "Vertical"}`;
  }

  function getShipCells(r, c, size, orientation) {
    const cells = [];
    for (let i = 0; i < size; i++) {
      const cr = r + (orientation === "V" ? i : 0);
      const cc = c + (orientation === "H" ? i : 0);
      cells.push({ r: cr, c: cc });
    }
    return cells;
  }

  function canPlaceShip(board, cells) {
    return cells.every(({ r, c }) =>
      r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c].shipId === null
    );
  }

  function onPlayerCellHover(e) {
    if (state.phase !== "placement" || !state.selectedShipId) return;
    const r = +e.currentTarget.dataset.r;
    const c = +e.currentTarget.dataset.c;
    const ship = SHIP_TYPES.find((s) => s.id === state.selectedShipId);
    if (!ship) return;
    const cells = getShipCells(r, c, ship.size, state.orientation);
    const valid = canPlaceShip(state.playerBoard, cells);
    clearPlacementPreview();
    cells.forEach(({ r, c }) => {
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return;
      const cell = playerCell(r, c);
      if (cell) cell.classList.add(valid ? "preview-valid" : "preview-invalid");
    });
  }

  function clearPlacementPreview() {
    el.playerBoard.querySelectorAll(".cell.preview-valid, .cell.preview-invalid")
      .forEach((c) => c.classList.remove("preview-valid", "preview-invalid"));
  }

  function onPlayerCellClick(e) {
    if (state.phase !== "placement" || !state.selectedShipId) return;
    const r = +e.currentTarget.dataset.r;
    const c = +e.currentTarget.dataset.c;
    const ship = SHIP_TYPES.find((s) => s.id === state.selectedShipId);
    if (!ship) return;
    const cells = getShipCells(r, c, ship.size, state.orientation);
    if (!canPlaceShip(state.playerBoard, cells)) {
      flashMessage("Can't place there — out of bounds or overlapping.");
      return;
    }
    placeShip(state.playerBoard, state.playerShips, ship, cells);
    renderPlayerShips();
    state.selectedShipId = null;
    renderFleetPicker();
    clearPlacementPreview();
    if (state.playerShips.length === SHIP_TYPES.length) {
      el.message.textContent = "Fleet deployed. Click Start Battle to begin!";
    } else {
      el.message.textContent = `Next: place your ${SHIP_TYPES.find((s) => !state.playerShips.some((ps) => ps.id === s.id)).name}.`;
    }
  }

  function placeShip(board, shipList, shipType, cells) {
    const ship = {
      id: shipType.id,
      name: shipType.name,
      size: shipType.size,
      cells,
      hits: new Set(),
    };
    cells.forEach(({ r, c }) => {
      board[r][c].shipId = shipType.id;
    });
    shipList.push(ship);
    return ship;
  }

  function renderPlayerShips() {
    el.playerBoard.querySelectorAll(".cell").forEach((cell) => {
      cell.classList.remove("ship-own");
    });
    state.playerShips.forEach((ship) => {
      ship.cells.forEach(({ r, c }) => {
        const cell = playerCell(r, c);
        if (cell) cell.classList.add("ship-own");
      });
    });
  }

  function autoPlacePlayer() {
    state.playerShips = [];
    state.playerBoard = createBoard();
    randomlyPlaceFleet(state.playerBoard, state.playerShips);
    renderPlayerShips();
    renderFleetPicker();
    el.message.textContent = "Fleet auto-placed. Start Battle when ready (or Reset to redo).";
  }

  function randomlyPlaceFleet(board, shipList) {
    for (const shipType of SHIP_TYPES) {
      let placed = false;
      let attempts = 0;
      while (!placed && attempts < 500) {
        attempts++;
        const orientation = Math.random() < 0.5 ? "H" : "V";
        const r = Math.floor(Math.random() * BOARD_SIZE);
        const c = Math.floor(Math.random() * BOARD_SIZE);
        const cells = getShipCells(r, c, shipType.size, orientation);
        if (canPlaceShip(board, cells)) {
          placeShip(board, shipList, shipType, cells);
          placed = true;
        }
      }
    }
  }

  function resetPlacement() {
    state.playerShips = [];
    state.playerBoard = createBoard();
    state.selectedShipId = null;
    renderPlayerShips();
    renderFleetPicker();
    el.message.textContent = "Fleet cleared. Place your ships again.";
  }

  // ---------- Battle ----------
  function startBattle() {
    if (state.playerShips.length !== SHIP_TYPES.length) return;
    state.enemyShips = [];
    state.enemyBoard = createBoard();
    randomlyPlaceFleet(state.enemyBoard, state.enemyShips);

    state.phase = "battle";
    state.playerTurn = true;

    el.placementControls.classList.add("hidden");
    el.battleControls.classList.remove("hidden");
    el.enemyBoard.classList.add("interactive");
    el.phaseIndicator.textContent = "Your turn — fire at will!";
    el.message.textContent = "Click a cell on Enemy Waters to fire.";
    updateScore();
  }

  function onEnemyCellClick(e) {
    if (state.phase !== "battle" || !state.playerTurn) return;
    const r = +e.currentTarget.dataset.r;
    const c = +e.currentTarget.dataset.c;
    if (state.enemyBoard[r][c].shot) return;
    fireAt(state.enemyBoard, state.enemyShips, r, c, true);
  }

  function fireAt(board, ships, r, c, isPlayerShot) {
    const cell = board[r][c];
    cell.shot = true;

    const domCell = isPlayerShot ? enemyCell(r, c) : playerCell(r, c);
    const boardEl = isPlayerShot ? el.enemyBoard : el.playerBoard;
    boardEl.querySelectorAll(".cell.last-shot").forEach((c) => c.classList.remove("last-shot"));

    let sunkShip = null;
    let hit = false;
    if (cell.shipId) {
      hit = true;
      const ship = ships.find((s) => s.id === cell.shipId);
      ship.hits.add(`${r},${c}`);
      if (ship.hits.size === ship.size) sunkShip = ship;
    }

    if (sunkShip) {
      sunkShip.cells.forEach(({ r, c }) => {
        const dc = isPlayerShot ? enemyCell(r, c) : playerCell(r, c);
        if (dc) {
          dc.classList.remove("hit", "ship-own");
          dc.classList.add("sunk");
        }
      });
    } else if (hit) {
      domCell.classList.add("hit");
    } else {
      domCell.classList.add("miss");
    }
    domCell.classList.add("last-shot");

    if (isPlayerShot) {
      state.lastPlayerShot = { r, c, hit, sunk: !!sunkShip };
      if (sunkShip) {
        announce(`Direct hit! You sunk the enemy ${sunkShip.name}!`);
      } else if (hit) {
        announce("Hit! Fire again.");
      } else {
        announce("Miss. Enemy's turn…");
      }
    } else {
      state.lastEnemyShot = { r, c, hit, sunk: !!sunkShip };
      if (sunkShip) {
        announce(`The enemy sunk your ${sunkShip.name}!`);
      } else if (hit) {
        announce("The enemy hit your ship!");
      } else {
        announce("The enemy missed. Your turn!");
      }
    }

    updateScore();

    if (state.enemyShips.every((s) => s.hits.size === s.size)) {
      endGame(true);
      return;
    }
    if (state.playerShips.every((s) => s.hits.size === s.size)) {
      endGame(false);
      return;
    }

    // Classic rules: turns alternate regardless of hit.
    if (isPlayerShot) {
      state.playerTurn = false;
      el.phaseIndicator.textContent = "Enemy turn…";
      el.enemyBoard.classList.remove("interactive");
      setTimeout(enemyTurn, 700);
    } else {
      state.playerTurn = true;
      el.phaseIndicator.textContent = "Your turn — fire at will!";
      el.enemyBoard.classList.add("interactive");
    }
  }

  // ---------- AI (Hunt & Target with parity) ----------
  function enemyTurn() {
    if (state.phase !== "battle") return;
    const { r, c } = chooseAIShot();
    fireAt(state.playerBoard, state.playerShips, r, c, false);

    const cell = state.playerBoard[r][c];
    const shipId = cell.shipId;
    if (shipId) {
      const ship = state.playerShips.find((s) => s.id === shipId);
      state.ai.hits.push({ r, c });
      if (ship.hits.size === ship.size) {
        state.ai.mode = "hunt";
        state.ai.targets = [];
        state.ai.hits = [];
      } else {
        state.ai.mode = "target";
        queueTargetsAroundHits();
      }
    } else {
      if (state.ai.mode === "target" && state.ai.targets.length === 0 && state.ai.hits.length === 0) {
        state.ai.mode = "hunt";
      }
    }
  }

  function chooseAIShot() {
    while (state.ai.targets.length > 0) {
      const t = state.ai.targets.shift();
      if (inBounds(t.r, t.c) && !state.playerBoard[t.r][t.c].shot) {
        state.ai.lastShot = t;
        return t;
      }
    }
    state.ai.mode = "hunt";
    const candidates = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (state.playerBoard[r][c].shot) continue;
        if ((r + c) % 2 !== 0) continue;
        candidates.push({ r, c });
      }
    }
    let pool = candidates;
    if (pool.length === 0) {
      pool = [];
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (!state.playerBoard[r][c].shot) pool.push({ r, c });
        }
      }
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    state.ai.lastShot = pick;
    return pick;
  }

  function queueTargetsAroundHits() {
    const hits = state.ai.hits;
    if (hits.length === 1) {
      const { r, c } = hits[0];
      const neighbors = [
        { r: r - 1, c },
        { r: r + 1, c },
        { r, c: c - 1 },
        { r, c: c + 1 },
      ];
      shuffle(neighbors);
      state.ai.targets = neighbors.filter((t) => inBounds(t.r, t.c) && !state.playerBoard[t.r][t.c].shot);
      return;
    }
    const sorted = [...hits].sort((a, b) => (a.r - b.r) || (a.c - b.c));
    const horizontal = sorted.every((h) => h.r === sorted[0].r);
    const vertical = sorted.every((h) => h.c === sorted[0].c);
    const extensions = [];
    if (horizontal) {
      const r = sorted[0].r;
      const cs = sorted.map((h) => h.c);
      extensions.push({ r, c: Math.min(...cs) - 1 });
      extensions.push({ r, c: Math.max(...cs) + 1 });
    } else if (vertical) {
      const c = sorted[0].c;
      const rs = sorted.map((h) => h.r);
      extensions.push({ r: Math.min(...rs) - 1, c });
      extensions.push({ r: Math.max(...rs) + 1, c });
    } else {
      const last = hits[hits.length - 1];
      extensions.push(
        { r: last.r - 1, c: last.c },
        { r: last.r + 1, c: last.c },
        { r: last.r, c: last.c - 1 },
        { r: last.r, c: last.c + 1 }
      );
    }
    state.ai.targets = extensions.filter((t) => inBounds(t.r, t.c) && !state.playerBoard[t.r][t.c].shot);
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function inBounds(r, c) {
    return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
  }

  // ---------- UI helpers ----------
  function playerCell(r, c) {
    return el.playerBoard.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
  }
  function enemyCell(r, c) {
    return el.enemyBoard.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
  }
  function announce(text) { el.message.textContent = text; }
  function flashMessage(text) { el.message.textContent = text; }

  function updateScore() {
    const pAlive = state.playerShips.filter((s) => s.hits.size < s.size).length;
    const eAlive = state.enemyShips.filter((s) => s.hits.size < s.size).length;
    el.playerShipsLeft.textContent = pAlive;
    el.enemyShipsLeft.textContent = eAlive;
  }

  function endGame(playerWon) {
    state.phase = "over";
    el.enemyBoard.classList.remove("interactive");
    state.enemyShips.forEach((ship) => {
      if (ship.hits.size < ship.size) {
        ship.cells.forEach(({ r, c }) => {
          const dc = enemyCell(r, c);
          if (dc && !dc.classList.contains("hit") && !dc.classList.contains("miss") && !dc.classList.contains("sunk")) {
            dc.classList.add("ship-own");
          }
        });
      }
    });
    el.gameOverTitle.textContent = playerWon ? "Victory!" : "Defeated";
    el.gameOverText.textContent = playerWon
      ? "You sunk the entire enemy fleet. Well commanded, Admiral!"
      : "The enemy sunk your fleet. Better luck next time.";
    el.gameOver.classList.remove("hidden");
  }

  function resetGame() {
    state.phase = "placement";
    state.orientation = "H";
    state.selectedShipId = null;
    state.playerShips = [];
    state.enemyShips = [];
    state.playerBoard = createBoard();
    state.enemyBoard = createBoard();
    state.playerTurn = true;
    state.ai = { mode: "hunt", targets: [], hits: [], lastShot: null };
    state.lastPlayerShot = null;
    state.lastEnemyShot = null;

    el.gameOver.classList.add("hidden");
    el.placementControls.classList.remove("hidden");
    el.battleControls.classList.add("hidden");
    el.enemyBoard.classList.remove("interactive");

    buildBoardDOM(el.playerBoard, "player");
    buildBoardDOM(el.enemyBoard, "enemy");
    renderFleetPicker();
    updateRotateLabel();
    el.phaseIndicator.textContent = "Place your ships";
    el.message.innerHTML = 'Click a ship below, then click your grid to place it. Press <kbd>R</kbd> or the Rotate button to change orientation.';
    updateScore();
  }

  // ---------- Boot ----------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
