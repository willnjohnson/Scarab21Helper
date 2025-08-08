# Neopets Scarab 21 Helper & Autoplayer

This repository contains two GreaseMonkey scripts, a helper (visual guide) and an autoplayer (auto-clicker + logic solver) for the Scarab 21 game on Neopets.

## Features

### Scarab 21 Helper

*   **Real-Time Solver Logic:**
    *   Analyzes the drawn card and current column totals to identify the mathematically optimal column for placement.
    *   Highlights the best possible move in real-time.

*   **Visual Assistance & Enhanced Input:**
    *   Overlays deep red-brown boxes (`#993300`) with keyboard key labels (Z, X, C, V, B) directly over the original column arrows.
    *   The recommended column's overlay is prominently marked in **magenta**.
    *   Enables quick card placement by clicking the corresponding overlay or by pressing the Z, X, C, V, or B keys (i.e. no mouse needed to select a column).

### Scarab 21 Autoplayer

*   **Automatic Gameplay:**
    *   Autoplays the game using an optimized Scarab 21 strategy.
    *   Automatically handles starting new games, placing cards, collecting points, and restarting rounds.
    *   Includes robust error handling, such as recovering from the "wrong place" message.

*   **Human-Like Behavior:**
    *   Randomized click timing to emulate human reaction times.
    *   Delay values between actions are fully customizable within the script.
    *   Features a built-in toggle button (`Autoplay: ON/OFF`) to seamlessly switch between full automation and a hybrid manual mode at any time.

## Installation

These scripts require a user script manager like Tampermonkey or Greasemonkey.

1.  **Install a User Script Manager:**

2.  **Create a New User Script:**
    *   Click the Greasemonkey/Tampermonkey icon in your browser’s toolbar.
    *   Select “Create a new script…” or equivalent.

3.  **Paste the Script:**
    *   Delete any existing boilerplate.
    *   Paste the contents of either the `Scarab 21 Helper` or `Scarab 21 Autoplayer` script. **Note:** It's recommended to install only one script at a time to avoid potential conflicts.

4.  **Save the Script:**
    *   Save using `Ctrl+S` or via the file menu.

## Usage

1.  Navigate to the Scarab 21 game on Neopets.

2.  The script will activate automatically:
    *   The **Helper** overlays labeled boxes on the arrows, highlights the optimal move, and allows keyboard input.
    *   The **Autoplayer** will, by default, play the game on your behalf and restart once finished. It also provides a toggle button to switch to a helper-like mode.

## Compatibility

*   **Browser:** Works on Chrome, Firefox, Edge, and Opera with a script manager.
*   **Game:** Built specifically for the Neopets Scarab 21 game.

## Contributing

Suggestions and improvements are welcome. Feel free to share fixes or strategy refinements.

## License

This project is open-source under the MIT License.

**Disclaimer:** "Neopets" is a registered trademark of Neopets, Inc. This is an unofficial fan-made project and is not affiliated with or endorsed by Neopets, Inc.
