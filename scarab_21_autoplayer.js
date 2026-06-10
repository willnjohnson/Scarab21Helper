// ==UserScript==
// @name         Neopets Scarab 21 Autoplayer
// @namespace    GreaseMonkey
// @version      2.0
// @description  Automates Scarab 21 using Balanced Target-11 strategy.
// @author       @willnjohnson
// @match        https://www.neopets.com/games/scarab21/index.phtml
// @match        https://www.neopets.com/games/scarab21/scarab21.phtml*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // CONFIG
  const CONFIG = {
    minActionDelayMs: 600,
    maxActionDelayMs: 920,
    minNavigationDelayMs: 850,
    maxNavigationDelayMs: 1200,
    initialLoadDelayMs: 1100,
    playGameUrl: "https://www.neopets.com/games/scarab21/scarab21.phtml",
    homeUrl: "https://www.neopets.com/games/scarab21/index.phtml",
    highlightColor: "magenta",
    highlightThickness: "4px",
    overlayZIndex: 9998,
    keybinds: {
      KeyZ: 0,
      KeyX: 1,
      KeyC: 2,
      KeyV: 3,
      KeyB: 4,
    },
  };

  // DECISION ENGINE
  const ROLLOUTS = 300;

  /** Returns the best sum of a column's card values, treating aces optimally. */
  function calcFastSum(cards) {
    let sum = 0;
    let aces = 0;
    for (const v of cards) {
      sum += v;
      if (v === 1) aces++;
    }
    while (aces > 0 && sum + 10 <= 21) {
      sum += 10;
      aces--;
    }
    return sum;
  }

  function fastCanPlace(cards, cardVal) {
    return calcFastSum(cards) + cardVal <= 21;
  }

  /**
   * Evaluates a column after a card has been placed.
   * Mutates `sizes` to 0 if the column is cleared (scored).
   * Returns the points earned (0 if column not yet complete).
   */
  function evaluateFastColumn(sizes, values, colIdx) {
    const sum = calcFastSum(values[colIdx].slice(0, sizes[colIdx]));
    const size = sizes[colIdx];
    if (sum === 21) {
      sizes[colIdx] = 0;
      return size >= 4 ? 15 : 10;
    }
    if (size === 5) {
      sizes[colIdx] = 0;
      return 5;
    }
    return 0;
  }

  /**
   * Simulates one full game playout starting after placing `currentCardVal`
   * into column `startingCol`.  Uses a pre-shuffled pool of remaining cards.
   */
  function simulateFastPlayout(startingCol, currentCardVal, pool, sizes, values) {
    // Fisher-Yates shuffle of pool
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }

    // Place the drawn card into the chosen column
    values[startingCol][sizes[startingCol]] = currentCardVal;
    sizes[startingCol]++;
    let score = evaluateFastColumn(sizes, values, startingCol);

    // Simulate the rest of the deck
    for (const cardVal of pool) {
      let bestMove = -1;
      let bestWeight = -Infinity;

      for (let col = 0; col < 5; col++) {
        const colCards = values[col].slice(0, sizes[col]);
        if (!fastCanPlace(colCards, cardVal)) continue;

        const currentSum = calcFastSum(colCards);
        const nextSum = currentSum + cardVal;
        const currentSize = sizes[col];
        let moveWeight = 0;

        if (nextSum === 11) moveWeight += 260;
        if (cardVal === 10 && (currentSum === 11 || (currentSize === 1 && values[col][0] === 1))) moveWeight += 350;
        if (cardVal === 10 && currentSum === 10) moveWeight -= 120;
        if (currentSum === 11 && cardVal !== 10) moveWeight -= 100;
        if (nextSum === 21) moveWeight += 150;
        if (currentSize + 1 === 5) moveWeight += 60;
        if (nextSum >= 12 && nextSum <= 16) moveWeight -= 40;

        if (moveWeight > bestWeight) {
          bestWeight = moveWeight;
          bestMove = col;
        }
      }

      if (bestMove === -1) break;

      values[bestMove][sizes[bestMove]] = cardVal;
      sizes[bestMove]++;
      score += evaluateFastColumn(sizes, values, bestMove);
    }

    return score;
  }

  /**
   * Runs ROLLOUTS simulations for placing `drawnValue` in `chosenCol` and
   * returns the average score.
   */
  function simulateAverageScore(chosenCol, drawnValue, masterPool, baseSizes, baseValues) {
    let totalScore = 0;

    for (let rollout = 0; rollout < ROLLOUTS; rollout++) {
      // Deep-copy state for this rollout
      const pool = masterPool.slice();
      const sizes = baseSizes.slice();
      const values = baseValues.map((col) => col.slice());

      totalScore += simulateFastPlayout(chosenCol, drawnValue, pool, sizes, values);
    }

    return totalScore / ROLLOUTS;
  }

  /**
   * Builds remaining-deck counts after removing all placed cards and the
   * drawn card.  Returns a flat array of individual card math values.
   */
  function buildMasterPool(columns, drawnMath) {
    // Standard 52-card deck: 4 copies of 1-9, 16 copies of 10 (10/J/Q/K)
    const counts = new Array(11).fill(4);
    counts[10] = 16;

    for (const col of columns) {
      for (const card of col) {
        counts[card.math]--;
      }
    }
    counts[drawnMath]--;

    const pool = [];
    for (let v = 1; v <= 10; v++) {
      const n = Math.max(0, counts[v]);
      for (let i = 0; i < n; i++) pool.push(v);
    }
    return pool;
  }

  /**
   * Main entry point
   * @param {{ math: number }} drawnCard
   * @param {Array<Array<{ math: number }>>} columns  – 5-element array of card arrays
   * @returns {number} 1-based column index (1–5), or -1 if no legal move exists
   */
  function chooseColumn(drawnCard, columns) {
    const masterPool = buildMasterPool(columns, drawnCard.math);

    // Snapshot current board as plain int arrays for fast simulation
    const baseSizes = columns.map((col) => col.length);
    const baseValues = columns.map((col) => {
      const arr = new Array(6).fill(0);
      col.forEach((c, i) => (arr[i] = c.math));
      return arr;
    });

    let bestIndex = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < 5; i++) {
      // Check whether this column can legally receive the drawn card
      if (!fastCanPlace(baseValues[i].slice(0, baseSizes[i]), drawnCard.math)) continue;

      const avgScore = simulateAverageScore(i, drawnCard.math, masterPool, baseSizes, baseValues);
      if (avgScore > bestScore) {
        bestScore = avgScore;
        bestIndex = i;
      }
    }

    return bestIndex === -1 ? -1 : bestIndex + 1; // convert to 1-based
  }

  // UTILITIES
  const pauseExecution = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const getElement = (selector, context = document) => {
    try { return context.querySelector(selector); } catch { return null; }
  };

  const getAllElements = (selector, context = document) => {
    try { return context.querySelectorAll(selector); } catch { return []; }
  };

  const getRandomDelay = () =>
    Math.floor(Math.random() * (CONFIG.maxActionDelayMs - CONFIG.minActionDelayMs + 1)) + CONFIG.minActionDelayMs;

  const getRandomNavigationDelay = () =>
    Math.floor(Math.random() * (CONFIG.maxNavigationDelayMs - CONFIG.minNavigationDelayMs + 1)) + CONFIG.minNavigationDelayMs;

  async function reloadPage() {
    await pauseExecution(getRandomNavigationDelay());
    window.location.replace(CONFIG.playGameUrl);
  }

  async function goBack() {
    await pauseExecution(getRandomNavigationDelay());
    window.history.back();
  }

  // COLUMN OVERLAYS
  let columnOverlays = [];

  function createColumnOverlays(gameArea) {
    columnOverlays.forEach((o) => o.remove());
    columnOverlays = [];

    const columnLinkCells = getAllElements(
      "center > table > tbody > tr:nth-child(1) > td:nth-child(2) > table > tbody > tr:first-child > td",
      gameArea
    );
    if (columnLinkCells.length === 0) return;

    columnLinkCells.forEach((cell, index) => {
      const arrowLink = cell.querySelector("a");
      if (!arrowLink) return;

      const linkRect = arrowLink.getBoundingClientRect();
      const bodyRect = document.body.getBoundingClientRect();

      const overlay = document.createElement("div");
      overlay.className = "scarab21-column-overlay";
      overlay.style.cssText =
        `position: absolute;` +
        ` top: ${linkRect.top - bodyRect.top - 118}px;` +
        ` left: ${linkRect.left - bodyRect.left}px;` +
        ` width: 60px; height: 40px;` +
        ` background-color: #993300;` +
        ` display: flex; justify-content: center; align-items: center;` +
        ` color: white; font-size: 24px; font-weight: bold;` +
        ` pointer-events: none;` +
        ` z-index: ${CONFIG.overlayZIndex};` +
        ` border: 4px solid transparent; box-sizing: border-box;`;

      const keyChar = Object.keys(CONFIG.keybinds).find((k) => CONFIG.keybinds[k] === index);
      const label = document.createElement("span");
      label.textContent = keyChar ? keyChar.replace("Key", "") : "";
      overlay.appendChild(label);

      document.body.appendChild(overlay);
      columnOverlays.push(overlay);
    });
  }

  function highlightOverlay(colIndex) {
    columnOverlays.forEach((overlay, idx) => {
      overlay.style.borderColor = idx === colIndex - 1 ? CONFIG.highlightColor : "transparent";
    });
  }

  function clearOverlayHighlights() {
    columnOverlays.forEach((o) => { o.style.borderColor = "transparent"; });
  }

  // SELECTORS

  const SELECTORS = {
    mainGameWrapper: ".contentModule .frame > div[style='padding:7px;']",
    playGameButton: "input[value='Play Scarab 21!!!']",
    cancelGameButton: "input[value='Cancel Current Game']",
    collectPointsButton: "div > a > b",
    congratulationsMessage: "center > b:first-child",
    playAgainButton: "input[value='Play Again!']",
    drawnCardImage:
      "center > table > tbody > tr > td:first-child > table:nth-of-type(3) > tbody > tr > td:nth-child(2) > img",
    colPointTexts:
      "center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(3) > td",
    colPlayLinks: (colIndex) =>
      `center > table > tbody > tr:nth-child(1) > td:nth-child(2) > table > tbody > tr:first-child > td:nth-child(${colIndex}) > a`,
    cardColumnCell: (colIndex) =>
      `center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(2) > td:nth-child(${colIndex})`,
    errorMessageDiv: "div.errorMessage b",
  };

  // GAME LOGIC
  async function checkForErrorMessage() {
    const errorBoldText = getElement(SELECTORS.errorMessageDiv);
    if (
      errorBoldText &&
      errorBoldText.textContent.includes("Error: ") &&
      errorBoldText.closest("div.errorMessage").textContent.includes(
        "You have been directed to this page from the wrong place!"
      )
    ) {
      await goBack();
      return true;
    }
    return false;
  }

  async function handleGameInit() {
    await pauseExecution(CONFIG.initialLoadDelayMs);
    const startBtn = getElement(SELECTORS.playGameButton);
    const abandonBtn = getElement(SELECTORS.cancelGameButton);

    if (startBtn) {
      startBtn.click();
      await pauseExecution(getRandomNavigationDelay());
      return true;
    }

    if (abandonBtn) {
      abandonBtn.click();
      await pauseExecution(getRandomNavigationDelay());
      const retryStartBtn = getElement(SELECTORS.playGameButton);
      if (retryStartBtn) {
        retryStartBtn.click();
        await pauseExecution(getRandomNavigationDelay());
        return true;
      }
      reloadPage();
      return false;
    }

    if (window.location.href.includes("index.phtml")) {
      reloadPage();
      return false;
    }
    return true;
  }

  async function handleGameCompletion(gameArea) {
    clearOverlayHighlights();

    const collectPointsBtn = getElement(SELECTORS.collectPointsButton, gameArea);
    if (collectPointsBtn && collectPointsBtn.textContent.includes("Collect Points")) {
      collectPointsBtn.closest("a").click();
      await pauseExecution(getRandomNavigationDelay());
      return { action: "continue" };
    }

    const congratsMsg = getElement(SELECTORS.congratulationsMessage, gameArea);
    if (congratsMsg && congratsMsg.textContent.includes("Congratulations!!!")) {
      window.location.href = CONFIG.playGameUrl;
      await pauseExecution(getRandomNavigationDelay());
      return { action: "restart" };
    }

    const replayBtn = getElement(SELECTORS.playAgainButton);
    if (replayBtn) {
      await pauseExecution(getRandomNavigationDelay());
      replayBtn.click();
      return { action: "restart" };
    }

    return { action: "ongoing" };
  }

  function parseCardFromSrc(src) {
    const filename = src.substring(src.lastIndexOf("/") + 1, src.lastIndexOf(".gif"));
    const parts = filename.split("_");
    if (parts.length < 2) return null;

    const rawToken = parts[0].toLowerCase();
    const suitToken = parts[1].toLowerCase();

    let raw = 0;
    if (rawToken === "ace") raw = 14;
    else raw = parseInt(rawToken, 10);
    if (Number.isNaN(raw)) return null;

    const rank =
      rawToken === "ace"   ? "Ace"
      : rawToken === "jack"  ? "Jack"
      : rawToken === "queen" ? "Queen"
      : rawToken === "king"  ? "King"
      : rawToken;

    const math = raw === 14 ? 1 : raw >= 11 ? 10 : raw;
    return { raw, math, rank, suit: suitToken, src };
  }

  async function getDrawnCardData(gameArea) {
    const cardImg = getElement(SELECTORS.drawnCardImage, gameArea);
    if (!cardImg) return null;
    return parseCardFromSrc(cardImg.getAttribute("src"));
  }

  function collectBoardState(gameArea) {
    const board = [];
    for (let col = 1; col <= 5; col++) {
      const cell = getElement(SELECTORS.cardColumnCell(col), gameArea);
      if (!cell) { board.push([]); continue; }
      const cards = Array.from(cell.querySelectorAll("img"))
        .map((img) => parseCardFromSrc(img.getAttribute("src")))
        .filter(Boolean);
      board.push(cards);
    }
    return board;
  }

  async function executeCardPlacement(chosenCol, gameArea) {
    clearOverlayHighlights();
    const targetLink = getElement(SELECTORS.colPlayLinks(chosenCol), gameArea);
    if (targetLink) {
      targetLink.click();
      await pauseExecution(getRandomNavigationDelay());
    } else {
      reloadPage();
    }
  }

  // MAIN AUTOPLAYER LOOP
  async function initializeAutoplayer() {
    if (await checkForErrorMessage()) return;

    if (window.location.href.includes("index.phtml")) {
      const initiated = await handleGameInit();
      if (!initiated) return;
    }

    const mainGameWrapper = getElement(SELECTORS.mainGameWrapper);
    if (!mainGameWrapper) {
      reloadPage();
      return;
    }

    createColumnOverlays(mainGameWrapper);

    while (true) {
      clearOverlayHighlights();

      const gameStatus = await handleGameCompletion(mainGameWrapper);
      if (gameStatus.action !== "ongoing") return;

      const cardData = await getDrawnCardData(mainGameWrapper);
      if (!cardData) {
        reloadPage();
        return;
      }

      const boardState = collectBoardState(mainGameWrapper);

      // Run the decision engine synchronously in-page (no server needed)
      const chosenCol = chooseColumn(cardData, boardState);

      if (chosenCol < 1 || chosenCol > 5) {
        // No legal move - should be extremely rare; reload to recover
        console.warn("Scarab21: no legal column found, reloading.");
        reloadPage();
        return;
      }

      highlightOverlay(chosenCol);
      await pauseExecution(getRandomDelay());
      await executeCardPlacement(chosenCol, mainGameWrapper);
      return;
    }
  }

  // BOOTSTRAP
  let isScriptRunning = false;
  function startScript() {
    if (isScriptRunning) return;
    isScriptRunning = true;
    initializeAutoplayer();
  }

  document.addEventListener("DOMContentLoaded", startScript);
  window.addEventListener("load", startScript);
  setTimeout(startScript, 1000);
})();
