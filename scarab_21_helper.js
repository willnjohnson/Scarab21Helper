// ==UserScript==
// @name         Neopets Scarab 21 Helper
// @namespace    GreaseMonkey
// @version      1.0
// @description  Helps player by highlighting recommended column and adds keyboard shortcuts for game actions.
// @author       @willnjohnson
// @match        https://www.neopets.com/games/scarab21/index.phtml
// @match        https://www.neopets.com/games/scarab21/scarab21.phtml*
// @grant        none
// ==/UserScript==

/*
  This script uses a domain-specific greedy heuristic designed for the
  Neopets game "Scarab 21". It does NOT attempt to predict future cards (count cards)
  or explore all possible outcomes — instead, it makes each move based
  solely on the current board state with the aim of maximizing points
  as early as possible.

  Decision priority:
    1. Place the drawn card in any column that will immediately total 21.
    2. Special handling for Aces (1/11) and 10-value cards (10/J/Q/K):
         - Try to pair with complementary totals (e.g., 10 + Ace, Ace + 10).
         - Favor columns close to 21 without busting.
         - Avoid "trap" totals that limit future moves unless beneficial.
    3. If no immediate 21, choose a column that:
         - Keeps the total ≤ 21,
         - Is as high as possible without busting,
         - Prefers non-empty columns over empty ones in mid/late game.
    4. Final fallback: first available legal column.

  Key characteristics:
    - Greedy: always aims for the highest immediate gain.
    - Deterministic: given the same board and card, will make the same choice.
    - No lookahead: does not simulate future draws.
    - Strategy goal: build 21s early to maximize points and free up columns.
*/

(function () {
  "use strict";

  const CONFIG = {
    highlightColor: "magenta",
    keybinds: {
      KeyZ: 0,
      KeyX: 1,
      KeyC: 2,
      KeyV: 3,
      KeyB: 4
    },
    overlayBackgroundColor: "#993300",
    overlayBorderThickness: "4px",
    overlayZIndex: 9998,
  };

  const getElement = (selector, context = document) => {
    try {
      return context.querySelector(selector);
    } catch (e) {
      return null;
    }
  };
  const getAllElements = (selector, context = document) => {
    try {
      return context.querySelectorAll(selector);
    } catch (e) {
      return [];
    }
  };
  const elementExists = (selector, context = document) => !!getElement(selector, context);
  const pauseExecution = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let columnOverlays = [];

  function createColumnOverlays(gameArea) {
    columnOverlays.forEach((overlay) => overlay.remove());
    columnOverlays = [];
    const columnLinkElements = getAllElements("center > table > tbody > tr:nth-child(1) > td:nth-child(2) > table > tbody > tr:first-child > td > a", gameArea);
    if (columnLinkElements.length === 0) return;
    columnLinkElements.forEach((link, index) => {
      const linkRect = link.getBoundingClientRect();
      const bodyRect = document.body.getBoundingClientRect();
      const overlay = document.createElement("div");
      overlay.className = "scarab21-column-overlay";
      overlay.dataset.columnIndex = index + 1;
      overlay.style.cssText = `position: absolute; top: ${linkRect.top - bodyRect.top - 118}px; left: ${linkRect.left - bodyRect.left}px; width: 60px; height: 40px; background-color: ${CONFIG.overlayBackgroundColor}; display: flex; justify-content: center; align-items: center; color: white; font-size: 24px; font-weight: bold; pointer-events: none; z-index: ${CONFIG.overlayZIndex}; border: ${CONFIG.overlayBorderThickness} solid transparent; box-sizing: border-box;`;
      const keyChar = Object.keys(CONFIG.keybinds).find((key) => CONFIG.keybinds[key] === index);
      overlay.textContent = keyChar ? keyChar.replace("Key", "") : "";
      document.body.appendChild(overlay);
      columnOverlays.push({ overlay: overlay, originalLink: link });
    });
  }

  function highlightOverlay(colIndex) {
    columnOverlays.forEach((item) => {
      const overlay = item.overlay;
      overlay.style.borderColor = parseInt(overlay.dataset.columnIndex) === colIndex ? CONFIG.highlightColor : "transparent";
      overlay.style.backgroundColor = parseInt(overlay.dataset.columnIndex) === colIndex ? CONFIG.overlayBackgroundColor : CONFIG.overlayBackgroundColor;
    });
  }

  function clearOverlayHighlights() {
    columnOverlays.forEach((item) => {
      const overlay = item.overlay;
      overlay.style.borderColor = "transparent";
      overlay.style.backgroundColor = CONFIG.overlayBackgroundColor;
    });
  }

  function handleKeyboardInput(event) {
    if (window.location.href.includes("scarab21.phtml") || window.location.href.includes("index.phtml")) {
      const chosenColumnIndex0Based = CONFIG.keybinds[event.code];
      const gameArea = getElement(SELECTORS.mainGameWrapper);
      const action = CONFIG.keybinds[event.code];
      if (chosenColumnIndex0Based !== undefined && chosenColumnIndex0Based !== "restart") {
        event.preventDefault();
        const targetItem = columnOverlays[chosenColumnIndex0Based];
        if (targetItem && targetItem.originalLink) {
          targetItem.originalLink.click();
        }
      }
    }
  }

  const SELECTORS = {
    mainGameWrapper: ".contentModule .frame > div[style='padding:7px;']",
    drawnCardImage: "center > table > tbody > tr > td:first-child > table:nth-of-type(3) > tbody > tr > td:nth-child(2) > img",
    columnPointTexts: "center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(3) > td",
    cardInColumn: (colIndex) => `center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(2) > td:nth-child(${colIndex}) > img`,
    secondCardInColumn: (colIndex) => `center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(2) > td:nth-child(${colIndex}) > img:nth-of-type(2)`,
  };

  async function getDrawnCardData(gameArea) {
    const cardImg = getElement(SELECTORS.drawnCardImage, gameArea);
    if (!cardImg) return null;
    const imgSrc = cardImg.getAttribute("src");
    let rawVal, mathVal;
    try {
      const filename = imgSrc.substring(imgSrc.lastIndexOf("/") + 1, imgSrc.lastIndexOf("_"));
      rawVal = parseInt(filename);
      if (isNaN(rawVal)) throw new Error("Parsed value is NaN.");
    } catch (e) {
      return null;
    }
    mathVal = rawVal === 14 ? 11 : [11, 12, 13].includes(rawVal) ? 10 : rawVal;
    return { raw: rawVal, math: mathVal, src: imgSrc };
  }

  function getColumnCurrentPoints(gameArea) {
    const pointEls = getAllElements(SELECTORS.columnPointTexts, gameArea);
    const points = [];
    pointEls.forEach((el) => points.push(el.textContent.trim()));
    return points;
  }

  function determineBestColumn(drawnMathVal, drawnRawVal, drawnCardSrc, currentColumnStates, gameArea) {
    let bestCol = -1;
    const parsePoints = (colState) => (typeof colState === "string" && colState.includes("or") ? { A: Number(colState.split(" or ")[0]), B: Number(colState.split(" or ")[1]) } : { A: Number(colState), B: -1 });
    const colContainsCard = (idx, targetRaw, targetSuit) => Array.from(getAllElements(SELECTORS.cardInColumn(idx + 1), gameArea)).some((img) => img.getAttribute("src").substring(img.getAttribute("src").lastIndexOf("/") + 1, img.getAttribute("src").lastIndexOf(".gif")).includes(`${targetRaw}_${targetSuit}`));
    const colHasTwoCards = (idx) => elementExists(SELECTORS.secondCardInColumn(idx + 1), gameArea);
    for (let i = 0; i < currentColumnStates.length; i++) {
      const { A: colA, B: colB } = parsePoints(currentColumnStates[i]);
      const col1Based = i + 1;
      if (drawnMathVal + colA === 21 || (colB !== -1 && drawnMathVal + colB === 21)) {
        bestCol = col1Based;
        break;
      }
      if (drawnRawVal === 14) {
        if (colA === 10 || colB === 10) {
          if (colContainsCard(i, 11, "spades") && drawnCardSrc.includes("14_spades")) {
            bestCol = col1Based;
            break;
          }
          if (!colHasTwoCards(i)) {
            bestCol = col1Based;
          } else if (bestCol === -1) {
            bestCol = col1Based;
          }
        } else if (colA === 20 || colB === 20) {
          bestCol = col1Based;
          break;
        }
      } else if (drawnMathVal === 10) {
        if (colA === 11 || colB === 11) {
          if (colContainsCard(i, 14, "spades") && drawnCardSrc.includes("11_spades")) {
            bestCol = col1Based;
            break;
          }
          if (!colHasTwoCards(i)) {
            bestCol = col1Based;
            break;
          } else {
            bestCol = col1Based;
            break;
          }
        } else if (colA === 0) {
          bestCol = col1Based;
        }
      }
      if (bestCol === -1 && (drawnMathVal + colA === 11 || (colB !== -1 && drawnMathVal + colB === 11))) {
        bestCol = col1Based;
      }
    }
    if (bestCol !== -1) return bestCol;
    let fallbackCol = -1, kSum = 10000;
    let effDrawnVal = drawnMathVal === 11 ? 1 : drawnMathVal;
    for (let i = 0; i < currentColumnStates.length; i++) {
      const { A: colA, B: colB } = parsePoints(currentColumnStates[i]);
      const col1Based = i + 1;
      const potSums = [];
      if (colA + effDrawnVal <= 21) potSums.push(colA + effDrawnVal);
      if (colB !== -1 && colB + effDrawnVal <= 21) potSums.push(colB + effDrawnVal);
      if (potSums.length > 0) {
        const currSum = Math.min(...potSums);
        if (colA === 0 && drawnRawVal === 14) {
          fallbackCol = col1Based;
          break;
        }
        if (currSum < kSum && colA !== 0 && colA !== 1) {
          if (colA === 10 && !colHasTwoCards(i)) continue;
          if (colA === 11 && currentColumnStates[i].includes("or")) continue;
          kSum = currSum;
          fallbackCol = col1Based;
        }
      }
    }
    if (fallbackCol !== -1) return fallbackCol;
    kSum = 10000;
    for (let i = 0; i < currentColumnStates.length; i++) {
      const { A: colA, B: colB } = parsePoints(currentColumnStates[i]);
      const col1Based = i + 1;
      effDrawnVal = drawnMathVal === 11 ? 1 : drawnMathVal;
      const potSums = [];
      if (colA + effDrawnVal <= 21) potSums.push(colA + effDrawnVal);
      if (colB !== -1 && colB + effDrawnVal <= 21) potSums.push(colB + effDrawnVal);
      if (potSums.length > 0) {
        const currSum = Math.min(...potSums);
        if (currSum < kSum && colA !== 1) {
          if (colA === 10 && !colHasTwoCards(i)) continue;
          if (colA === 0 && drawnMathVal === 10) {
            kSum = currSum;
            fallbackCol = col1Based;
            break;
          }
          kSum = currSum;
          fallbackCol = col1Based;
        }
      }
    }
    if (fallbackCol !== -1) return fallbackCol;
    for (let i = 0; i < currentColumnStates.length; i++) {
      const { A: colA, B: colB } = parsePoints(currentColumnStates[i]);
      const col1Based = i + 1;
      effDrawnVal = drawnMathVal === 11 ? 1 : drawnMathVal;
      if (colA + effDrawnVal <= 21 || (colB !== -1 && colB + effDrawnVal <= 21)) {
        fallbackCol = col1Based;
        break;
      }
    }
    return fallbackCol;
  }

  async function initializeHelper() {
    let mainGameWrapper = getElement(SELECTORS.mainGameWrapper);
    if (!mainGameWrapper) return;
    createColumnOverlays(mainGameWrapper);
    document.addEventListener("keydown", handleKeyboardInput);
    while (true) {
      clearOverlayHighlights();
      const cardData = await getDrawnCardData(mainGameWrapper);
      if (!cardData) {
        await pauseExecution(500);
        continue;
      }
      const columnPoints = getColumnCurrentPoints(mainGameWrapper);
      if (columnPoints.length !== 5) {
        await pauseExecution(500);
        continue;
      }
      const chosenCol = determineBestColumn(cardData.math, cardData.raw, cardData.src, columnPoints, mainGameWrapper);
      highlightOverlay(chosenCol);
      await new Promise(resolve => {});
    }
  }

  let isScriptRunning = false;
  function startScript() {
    if (isScriptRunning) return;
    isScriptRunning = true;
    initializeHelper();
  }

  document.addEventListener("DOMContentLoaded", startScript);
  window.addEventListener("load", startScript);
  setTimeout(startScript, 1000);
})();
