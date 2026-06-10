// ==UserScript==
// @name         Neopets Scarab 21 Helper
// @namespace    GreaseMonkey
// @version      1.0
// @description  Highlights the recommended column for Scarab 21 using the Balanced Target-11 strategy. No automated actions.
// @author       @willnjohnson
// @match        https://www.neopets.com/games/scarab21/scarab21.phtml*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // CONFIG
  const CONFIG = {
    highlightColor: "magenta",
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

  function simulateFastPlayout(startingCol, currentCardVal, pool, sizes, values) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }

    values[startingCol][sizes[startingCol]] = currentCardVal;
    sizes[startingCol]++;
    let score = evaluateFastColumn(sizes, values, startingCol);

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

  function simulateAverageScore(chosenCol, drawnValue, masterPool, baseSizes, baseValues) {
    let totalScore = 0;
    for (let rollout = 0; rollout < ROLLOUTS; rollout++) {
      const pool = masterPool.slice();
      const sizes = baseSizes.slice();
      const values = baseValues.map((col) => col.slice());
      totalScore += simulateFastPlayout(chosenCol, drawnValue, pool, sizes, values);
    }
    return totalScore / ROLLOUTS;
  }

  function buildMasterPool(columns, drawnMath) {
    const counts = new Array(11).fill(4);
    counts[10] = 16;
    for (const col of columns) {
      for (const card of col) counts[card.math]--;
    }
    counts[drawnMath]--;
    const pool = [];
    for (let v = 1; v <= 10; v++) {
      const n = Math.max(0, counts[v]);
      for (let i = 0; i < n; i++) pool.push(v);
    }
    return pool;
  }

  function chooseColumn(drawnCard, columns) {
    const masterPool = buildMasterPool(columns, drawnCard.math);
    const baseSizes = columns.map((col) => col.length);
    const baseValues = columns.map((col) => {
      const arr = new Array(6).fill(0);
      col.forEach((c, i) => (arr[i] = c.math));
      return arr;
    });

    let bestIndex = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < 5; i++) {
      if (!fastCanPlace(baseValues[i].slice(0, baseSizes[i]), drawnCard.math)) continue;
      const avgScore = simulateAverageScore(i, drawnCard.math, masterPool, baseSizes, baseValues);
      if (avgScore > bestScore) {
        bestScore = avgScore;
        bestIndex = i;
      }
    }

    return bestIndex === -1 ? -1 : bestIndex + 1;
  }

  // DOM HELPERS
  const getElement = (selector, context = document) => {
    try { return context.querySelector(selector); } catch { return null; }
  };

  const getAllElements = (selector, context = document) => {
    try { return context.querySelectorAll(selector); } catch { return []; }
  };

  // SELECTORS
  const SELECTORS = {
    mainGameWrapper: ".contentModule .frame > div[style='padding:7px;']",
    drawnCardImage:
      "center > table > tbody > tr > td:first-child > table:nth-of-type(3) > tbody > tr > td:nth-child(2) > img",
    cardColumnCell: (colIndex) =>
      `center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(2) > td:nth-child(${colIndex})`,
    colLinkCells:
      "center > table > tbody > tr:nth-child(1) > td:nth-child(2) > table > tbody > tr:first-child > td",
    colPlayLinks: (colIndex) =>
      `center > table > tbody > tr:nth-child(1) > td:nth-child(2) > table > tbody > tr:first-child > td:nth-child(${colIndex}) > a`,
  };

  // CARD PARSING
  function parseCardFromSrc(src) {
    if (!src) return null;
    const filename = src.substring(src.lastIndexOf("/") + 1, src.lastIndexOf(".gif"));
    const parts = filename.split("_");
    if (parts.length < 2) return null;

    const rawToken = parts[0].toLowerCase();
    const suitToken = parts[1].toLowerCase();

    let raw = rawToken === "ace" ? 14 : parseInt(rawToken, 10);
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

  function getDrawnCard(gameArea) {
    const img = getElement(SELECTORS.drawnCardImage, gameArea);
    if (!img) return null;
    return parseCardFromSrc(img.getAttribute("src"));
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

  // OVERLAYS
  let columnOverlays = [];

  function buildOverlays(gameArea) {
    columnOverlays.forEach((o) => o.remove());
    columnOverlays = [];

    const cells = getAllElements(SELECTORS.colLinkCells, gameArea);
    if (cells.length === 0) return;

    cells.forEach((cell, index) => {
      const arrowLink = cell.querySelector("a");
      if (!arrowLink) return;

      const linkRect = arrowLink.getBoundingClientRect();
      const bodyRect = document.body.getBoundingClientRect();

      const overlay = document.createElement("div");
      overlay.className = "scarab21-helper-overlay";
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
        ` border: 4px solid transparent; box-sizing: border-box;` +
        ` transition: border-color 0.1s;`;

      const keyChar = Object.keys(CONFIG.keybinds).find((k) => CONFIG.keybinds[k] === index);
      const label = document.createElement("span");
      label.textContent = keyChar ? keyChar.replace("Key", "") : "";
      overlay.appendChild(label);

      document.body.appendChild(overlay);
      columnOverlays.push(overlay);
    });
  }

  function applyHighlight(colIndex) {
    columnOverlays.forEach((overlay, idx) => {
      overlay.style.borderColor = idx === colIndex - 1 ? CONFIG.highlightColor : "transparent";
    });
  }

  function clearHighlights() {
    columnOverlays.forEach((o) => { o.style.borderColor = "transparent"; });
  }

  // HELPER CORE
  let lastDrawnSrc = null;

  function runHelder(gameArea) {
    const drawnCard = getDrawnCard(gameArea);

    // No card drawn yet, or game screen not ready
    if (!drawnCard) {
      clearHighlights();
      lastDrawnSrc = null;
      return;
    }

    // Skip re-computation if the drawn card hasn't changed
    if (drawnCard.src === lastDrawnSrc) return;
    lastDrawnSrc = drawnCard.src;

    // New card - rebuild overlay positions then compute and apply recommendation
    buildOverlays(gameArea);

    const boardState = collectBoardState(gameArea);
    const chosenCol = chooseColumn(drawnCard, boardState);

    if (chosenCol >= 1 && chosenCol <= 5) {
      applyHighlight(chosenCol);
    } else {
      clearHighlights();
    }
  }

  // BOOTSTRAP - poll for game area, then watch for card changes via MutationObserver
  function init() {
    const gameArea = getElement(SELECTORS.mainGameWrapper);
    if (!gameArea) {
      // Game area not present on this page load (e.g. between hands), try again shortly
      setTimeout(init, 800);
      return;
    }

    buildOverlays(gameArea);
    runHelder(gameArea);

    // Watch for structural DOM changes only (new card dealt, column updated).
    // Excluding attribute mutations prevents hover/focus changes on the underlying
    // links from triggering an overlay rebuild that would clear the highlight.
    const observer = new MutationObserver(() => runHelder(gameArea));

    observer.observe(gameArea, { childList: true, subtree: true });

    // Keybinds: Z/X/C/V/B click column 1-5 respectively
    document.addEventListener("keydown", (e) => {
      const colIndex = CONFIG.keybinds[e.code];
      if (colIndex === undefined) return;
      const link = getElement(SELECTORS.colPlayLinks(colIndex + 1), gameArea);
      if (link) link.click();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
