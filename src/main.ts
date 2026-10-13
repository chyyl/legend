import { Game } from 'phaser'
import { BootScene } from './scenes/BootScene'
import { PreloadScene } from './scenes/PreloadScene'
import { MainMenuScene } from './scenes/MainMenuScene'
import { GameScene } from './scenes/GameScene'
import { UIScene } from './scenes/UIScene'
import { saveManager } from './systems/SaveManager'
import { networkManager } from './network/NetworkManager'

const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
const isSmallScreen = window.innerWidth < 480 || window.innerHeight < 480

const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    min: { width: 320, height: 240 },
    max: { width: 2560, height: 1440 }
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false }
  },
  render: {
    pixelArt: true,
    antialias: false,
    roundPixels: true
  },
  fps: { target: 60, forceSetTimeOut: false },
  backgroundColor: '#1a1a2e',
  dom: { createContainer: true },
  callbacks: {
    postBoot: () => {
      window.addEventListener('resize', onResize)
      window.addEventListener('orientationchange', onOrientationChange)
    }
  }
}

function onResize() {
  const game = (window as any).__GAME__
  if (game) {
    game.scale.resize(window.innerWidth, window.innerHeight)
  }
}

function onOrientationChange() {
  setTimeout(onResize, 100)
}

async function init() {
  saveManager.init()
  await networkManager.init()

  const game = new Game(gameConfig)
  ;(window as any).__GAME__ = game

  game.scene.add('Boot', BootScene, true)
  game.scene.add('Preload', PreloadScene)
  game.scene.add('MainMenu', MainMenuScene)
  game.scene.add('Game', GameScene)
  game.scene.add('UI', UIScene)

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  }
}

init()