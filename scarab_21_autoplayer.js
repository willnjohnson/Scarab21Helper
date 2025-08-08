// ==UserScript==
// @name         Neopets Scarab 21 Autoplayer
// @namespace    GreaseMonkey
// @version      1.0
// @description  Automates Scarab 21.
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

  // --- Configuration ---
  const CONFIG = {
    minActionDelayMs: 700,
    maxActionDelayMs: 1450,
    minNavigationDelayMs: 1000,
    maxNavigationDelayMs: 2000,
    initialLoadDelayMs: 1200,
    gameBaseUrl: "https://www.neopets.com/games/scarab21/",
    playGameUrl: "https://www.neopets.com/games/scarab21/scarab21.phtml",
    autoplayStorageKey: "scarab21_autoplay_enabled",
    highlightColor: "magenta",
    highlightThickness: "4px",
    keybinds: {
      KeyZ: 0,
      KeyX: 1,
      KeyC: 2,
      KeyV: 3,
      KeyB: 4,
    },
    overlayColor: "rgba(0, 0, 0, 0.5)",
    overlayZIndex: 9998,
  };

  // --- Utility Functions ---
  const pauseExecution = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
  const getRandomDelay = () => Math.floor(Math.random() * (CONFIG.maxActionDelayMs - CONFIG.minActionDelayMs + 1)) + CONFIG.minActionDelayMs;
  const getRandomNavigationDelay = () => Math.floor(Math.random() * (CONFIG.maxNavigationDelayMs - CONFIG.minNavigationDelayMs + 1)) + CONFIG.minNavigationDelayMs;
  async function reloadPage() {
    await pauseExecution(getRandomNavigationDelay());
    window.location.replace("https://www.neopets.com/games/scarab21/scarab21.phtml");
  }
  async function goBack() {
    await pauseExecution(getRandomNavigationDelay());
    window.history.back();
  }

  // --- Local Storage ---
  const getAutoplaySetting = () => {
    const setting = localStorage.getItem(CONFIG.autoplayStorageKey);
    return setting === null ? true : setting === "true";
  };
  const setAutoplaySetting = (enabled) => {
    localStorage.setItem(CONFIG.autoplayStorageKey, enabled.toString());
  };

  // --- UI Elements ---
  let autoplayToggleBtn, manualPlayModal, manualPlayNextBtn, manualPlayMessage, currentHighlightedElement = null;
  let columnOverlays = [];

  function createAutoplayToggleButton() {
    autoplayToggleBtn = document.createElement("button");
    autoplayToggleBtn.style.cssText = `position: fixed; top: 10px; right: 10px; z-index: 10000; background-color: #333; color: white; border: 1px solid #555; padding: 8px 12px; cursor: pointer; font-size: 14px; border-radius: 5px; opacity: 0.8; transition: opacity 0.3s;`;
    autoplayToggleBtn.onmouseover = () => (autoplayToggleBtn.style.opacity = "1");
    autoplayToggleBtn.onmouseout = () => (autoplayToggleBtn.style.opacity = "0.8");
    updateAutoplayButtonText();
    autoplayToggleBtn.onclick = () => {
      const currentSetting = getAutoplaySetting();
      setAutoplaySetting(!currentSetting);
      updateAutoplayButtonText();
      if (!currentSetting) {
        hideManualPlayModal();
      }
      window.location.reload();
    };
    document.body.appendChild(autoplayToggleBtn);
  }

  function updateAutoplayButtonText() {
    if (!autoplayToggleBtn) return;
    const enabled = getAutoplaySetting();
    autoplayToggleBtn.textContent = `Autoplay: ${enabled ? "ON" : "OFF"}`;
    autoplayToggleBtn.style.backgroundColor = enabled ? "#28a745" : "#dc3545";
  }

  function createManualPlayModal() {
    manualPlayModal = document.createElement("div");
    manualPlayModal.id = "scarab21-manual-modal";
    manualPlayModal.style.cssText = `position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 9999; background-color: #333; color: white; border: 2px solid #555; padding: 15px 20px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2); font-family: sans-serif; display: none; align-items: center; gap: 15px; min-width: 250px;`;
    manualPlayMessage = document.createElement("span");
    manualPlayMessage.style.fontSize = "16px";
    manualPlayModal.appendChild(manualPlayMessage);
    manualPlayNextBtn = document.createElement("button");
    manualPlayNextBtn.textContent = "Next Move";
    manualPlayNextBtn.style.cssText = `background-color: #007bff; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; font-size: 16px; transition: background-color 0.2s;`;
    manualPlayNextBtn.onmouseover = () => (manualPlayNextBtn.style.backgroundColor = "#0056b3");
    manualPlayNextBtn.onmouseout = () => (manualPlayNextBtn.style.backgroundColor = "#007bff");
    manualPlayModal.appendChild(manualPlayNextBtn);
    document.body.appendChild(manualPlayModal);
  }

  const showManualPlayModal = (msg) => {
    if (!manualPlayModal) createManualPlayModal();
    manualPlayMessage.textContent = msg;
    manualPlayModal.style.display = "flex";
  };
  const hideManualPlayModal = () => manualPlayModal && (manualPlayModal.style.display = "none");

  // --- Overlay and Keyboard Input Functions ---
  function createColumnOverlays(gameArea) {
    columnOverlays.forEach((overlay) => overlay.remove());
    columnOverlays = [];
    const columnLinkCells = getAllElements("center > table > tbody > tr:nth-child(1) > td:nth-child(2) > table > tbody > tr:first-child > td", gameArea);
    if (columnLinkCells.length === 0) return;
    columnLinkCells.forEach((cell, index) => {
      const arrowLink = cell.querySelector("a");
      if (!arrowLink) return;
      const linkRect = arrowLink.getBoundingClientRect();
      const bodyRect = document.body.getBoundingClientRect();
      const overlay = document.createElement("div");
      overlay.className = "scarab21-column-overlay";
      overlay.style.cssText = `position: absolute; top: ${linkRect.top - bodyRect.top - 118}px; left: ${linkRect.left - bodyRect.left}px; width: 60px; height: 40px; background-color: #993300; display: flex; justify-content: center; align-items: center; color: white; font-size: 24px; font-weight: bold; pointer-events: none; z-index: ${CONFIG.overlayZIndex}; border: 4px solid transparent; box-sizing: border-box;`;
      document.body.appendChild(overlay);
      const keyLabel = document.createElement("span");
      const keyChar = Object.keys(CONFIG.keybinds).find((key) => CONFIG.keybinds[key] === index);
      keyLabel.textContent = keyChar ? keyChar.replace("Key", "") : "";
      overlay.appendChild(keyLabel);
      columnOverlays.push(overlay);
    });
  }

  function highlightOverlay(colIndex) {
    columnOverlays.forEach((overlay, idx) => {
      overlay.style.borderColor = idx === colIndex - 1 ? CONFIG.highlightColor : "transparent";
    });
  }

  function clearOverlayHighlights() {
    columnOverlays.forEach((overlay) => {
      overlay.style.borderColor = "transparent";
    });
  }

  function handleKeyboardInput(event) {
    if (!getAutoplaySetting() && window.location.href.includes("scarab21.phtml")) {
      const chosenColumnIndex0Based = CONFIG.keybinds[event.code];
      if (chosenColumnIndex0Based !== undefined) {
        event.preventDefault();
        const gameArea = getElement(SELECTORS.mainGameWrapper);
        if (gameArea) {
          const arrowLink = getElement(SELECTORS.colPlayLinks(chosenColumnIndex0Based + 1), gameArea);
          if (arrowLink) {
            hideManualPlayModal();
            clearOverlayHighlights();
            arrowLink.click();
          }
        }
      }
    }
  }

  // --- Game Element Selectors ---
  const SELECTORS = {
    mainGameWrapper: ".contentModule .frame > div[style='padding:7px;']",
    playGameButton: "input[value='Play Scarab 21!!!']",
    cancelGameButton: "input[value='Cancel Current Game']",
    collectPointsButton: "div > a > b",
    congratulationsMessage: "center > b:first-child",
    playAgainButton: "input[value='Play Again!']",
    drawnCardImage: "center > table > tbody > tr > td:first-child > table:nth-of-type(3) > tbody > tr > td:nth-child(2) > img",
    colPointTexts: "center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(3) > td",
    colPlayLinks: (colIndex) => `center > table > tbody > tr:nth-child(1) > td:nth-child(2) > table > tbody > tr:first-child > td:nth-child(${colIndex}) > a`,
    columnArrowImage: (colIndex) => `center > table > tbody > tr:nth-child(1) > td:nth-child(2) > table > tbody > tr:first-child > td:nth-child(${colIndex}) > a > img`,
    cardInColumn: (colIndex) => `center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(2) > td:nth-child(${colIndex}) > img`,
    secondCardInColumn: (colIndex) => `center > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(2) > td:nth-child(${colIndex}) > img:nth-of-type(2)`,
    errorMessageDiv: "div.errorMessage b",
  };

  // --- Game Logic ---
  async function checkForErrorMessage() {
    const errorBoldText = getElement(SELECTORS.errorMessageDiv);
    if (errorBoldText && errorBoldText.textContent.includes("Error: ") && errorBoldText.closest("div.errorMessage").textContent.includes("You have been directed to this page from the wrong place!")) {
      await goBack();
      return true;
    }
    return false;
  }

  async function handleGameInit(gameArea) {
    await pauseExecution(CONFIG.initialLoadDelayMs);
    const startBtn = getElement(SELECTORS.playGameButton);
    const abandonBtn = getElement(SELECTORS.cancelGameButton);
    if (startBtn) {
      startBtn.click();
      await pauseExecution(getRandomNavigationDelay());
      return true;
    } else if (abandonBtn) {
      abandonBtn.click();
      await pauseExecution(getRandomNavigationDelay());
      const retryStartBtn = getElement(SELECTORS.playGameButton);
      if (retryStartBtn) {
        retryStartBtn.click();
        await pauseExecution(getRandomNavigationDelay());
        return true;
      } else {
        reloadPage();
        return false;
      }
    } else {
      if (window.location.href.includes("index.phtml")) {
        reloadPage();
        return false;
      }
      return true;
    }
  }

  async function handleGameCompletion(gameArea) {
    hideManualPlayModal();
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
    const pointEls = getAllElements(SELECTORS.colPointTexts, gameArea);
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
    let fallbackCol = -1,
      kSum = 10000;
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

  // --- Main Logic ---
  async function initializeAutoplayer() {
    createAutoplayToggleButton();
    createManualPlayModal();
    if (await checkForErrorMessage()) return;
    if (window.location.href.includes("index.phtml")) {
      const initiated = await handleGameInit(document);
      if (!initiated) return;
    }
    let mainGameWrapper = getElement(SELECTORS.mainGameWrapper);
    if (!mainGameWrapper) {
      reloadPage();
      return;
    }
    createColumnOverlays(mainGameWrapper);
    document.addEventListener("keydown", handleKeyboardInput);
    while (true) {
      clearOverlayHighlights();
      const gameStatus = await handleGameCompletion(mainGameWrapper);
      if (gameStatus.action !== "ongoing") return;
      const cardData = await getDrawnCardData(mainGameWrapper);
      if (!cardData) {
        reloadPage();
        return;
      }
      const colPoints = getColumnCurrentPoints(mainGameWrapper);
      if (colPoints.length !== 5) {
        reloadPage();
        return;
      }
      const chosenCol = determineBestColumn(cardData.math, cardData.raw, cardData.src, colPoints, mainGameWrapper);
      if (chosenCol === -1) {
        reloadPage();
        return;
      }
      highlightOverlay(chosenCol);
      if (getAutoplaySetting()) {
        hideManualPlayModal();
        await pauseExecution(getRandomDelay());
        await executeCardPlacement(chosenCol, mainGameWrapper);
        return;
      } else {
        const columnDisplay = chosenCol;
        showManualPlayModal(`Place ${cardData.raw} (${cardData.math}) in Col ${columnDisplay}.`);
        await new Promise((resolve) => {
          manualPlayNextBtn.onclick = async () => {
            hideManualPlayModal();
            await executeCardPlacement(chosenCol, mainGameWrapper);
            resolve();
          };
        });
        return;
      }
    }
  }

  // --- Script Initialization ---
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
