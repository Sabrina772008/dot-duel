# Dot Duel 🟢 vs 🩷

A colourful 2-player maze chase. Two players share one keyboard and race each other for the most points.

| | Player 1 · Lime | Player 2 · Berry |
|---|---|---|
| Move | `W` `A` `S` `D` | Arrow keys |

**Start:** SPACE or the START button · **Pause:** `P` · **Restart:** the ↻ RESTART button

## How to win
- Dots are worth **10**. Most points at the end wins.
- Rainbow **power orbs** are worth **50**. They turn the Gloomies blue so you can munch them for **200 → 400 → 800 → 1600**.
- While powered up, crash into your rival to **steal 100 points** and leave them dizzy for 2 seconds.
- Touching a normal Gloomy costs a life. Each player has **3 lives**.
- A **bonus star** appears twice per game in the centre. It's worth **500**.
- The game ends when every dot is eaten or both players are out of lives.

Two of the Gloomies have a favourite target. Sulk (orange) hunts Player 1 and Fizz (aqua) hunts Player 2. The other two chase whoever is closest.

## Publish on GitHub Pages
1. Create a new **public** repository on GitHub, for example `dot-duel`.
2. Click **Add file → Upload files** and drag in `index.html`, `style.css`, `game.js` and this `README.md`. Click **Commit changes**.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, set Source to **Deploy from a branch**, Branch to **main**, and folder to **/ (root)**. Click **Save**.
5. Wait a minute or two, then refresh the page. Your game will be live at `https://YOUR-USERNAME.github.io/dot-duel/`.

## Play locally
Double-click `index.html` to open it in any modern browser. No install or build step is needed.

## Tweaking
Open `game.js` and edit the values in the **TUNING** section at the top, such as speeds, lives, power-up time and steal amount. You can also edit the maze in the `MAP` grid, but keep every row exactly 21 characters long.
