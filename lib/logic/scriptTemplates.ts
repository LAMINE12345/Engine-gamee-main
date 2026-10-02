export interface ScriptTemplate {
  id: string;
  label: string;
  description: string;
  code: string;
}

export const DEFAULT_SCRIPT_CODE = `// Aether 3D Engine - Niveau 3 Custom Script
// API disponible : Engine.log, Engine.playSound, Engine.getVariable/setVariable,
// Engine.findEntity, Engine.destroy, Engine.emit, Engine.wait, Engine.startCoroutine,
// Engine.isKeyDown, Engine.setTimer, Engine.setTimeScale, Engine.time
// Hooks optionnels : onStart, onUpdate(dt), onCollision(other),
// onTriggerEnter/Exit(other), onKeyDown/Up(code), onClick(), onCustomEvent(name, data), onDestroy()

export default class CustomEntityScript extends Script {
  onStart() {
    Engine.log("Initialisation de " + this.entity.name);
    Engine.playSound("powerup");
  }

  onUpdate(dt) {
    if (this.entity.object3D) {
      this.entity.object3D.rotation.y += 1.8 * dt;
    }
  }

  onCollision(other) {
    Engine.log("Collision avec : " + other.name);
    Engine.playSound("coin");
  }
}
`;

export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    id: 'default',
    label: 'Script par défaut',
    description: 'Rotation simple + son au démarrage',
    code: DEFAULT_SCRIPT_CODE,
  },
  {
    id: 'rotation',
    label: 'Rotation continue',
    description: "Fait tourner l'objet sur l'axe Y",
    code: `export default class SpinScript extends Script {
  onStart() {
    Engine.playSound("powerup");
  }
  onUpdate(dt) {
    if (this.entity.object3D) {
      this.entity.object3D.rotation.y += 2.5 * dt;
    }
  }
  onCollision(other) {
    Engine.playSound("coin");
  }
}
`,
  },
  {
    id: 'bounce',
    label: 'Lévitation',
    description: 'Oscillation sinusoïdale en Y',
    code: `export default class BounceScript extends Script {
  onStart() {
    this.initialY = this.entity.object3D ? this.entity.object3D.position.y : 0;
    this.timer = 0;
  }
  onUpdate(dt) {
    this.timer += dt * 3;
    if (this.entity.object3D) {
      this.entity.object3D.position.y = this.initialY + Math.sin(this.timer) * 0.5;
    }
  }
  onCollision(other) {
    Engine.playSound("jump");
  }
}
`,
  },
  {
    id: 'trap',
    label: 'Piège dégâts',
    description: 'Joue un son et logge la collision',
    code: `export default class DamageTrapScript extends Script {
  onCollision(other) {
    Engine.log("Piège déclenché par : " + other.name);
    Engine.playSound("hit");
    const health = Engine.getVariable("Health") ?? 100;
    Engine.setVariable("Health", Math.max(0, health - 25));
  }
}
`,
  },
  {
    id: 'collectible',
    label: 'Collectable',
    description: 'Score +1 et disparition au contact',
    code: `export default class CollectibleScript extends Script {
  onCollision(other) {
    Engine.log(this.entity.name + " collecté par " + other.name);
    Engine.playSound("coin");
    const score = Engine.getVariable("Score") ?? 0;
    Engine.setVariable("Score", score + 1);
    Engine.destroy(this.entity);
  }
}
`,
  },
  {
    id: 'coroutine',
    label: 'Coroutine (async/await)',
    description: 'Séquence temporelle avec Engine.wait',
    code: `export default class CoroutineScript extends Script {
  async onStart() {
    Engine.log("Démarre — attend 2s...");
    await Engine.wait(2);
    Engine.log("Terminé !");
    Engine.playSound("powerup");
    this.entity.object3D?.position.set(0, 2, 0);
  }
}
`,
  },
  {
    id: 'keys',
    label: 'Contrôles clavier',
    description: 'Déplacement au clavier (WASD/flèches)',
    code: `export default class KeyboardScript extends Script {
  onUpdate(dt) {
    const speed = 5 * dt;
    const obj = this.entity.object3D;
    if (!obj) return;
    if (Engine.isKeyDown("KeyW") || Engine.isKeyDown("ArrowUp")) obj.position.z -= speed;
    if (Engine.isKeyDown("KeyS") || Engine.isKeyDown("ArrowDown")) obj.position.z += speed;
    if (Engine.isKeyDown("KeyA") || Engine.isKeyDown("ArrowLeft")) obj.position.x -= speed;
    if (Engine.isKeyDown("KeyD") || Engine.isKeyDown("ArrowRight")) obj.position.x += speed;
  }
  onKeyDown(code) {
    Engine.log("Touche pressée : " + code);
  }
}
`,
  },
  {
    id: 'trigger',
    label: 'Zone d&apos; déclenchement',
    description: 'onTriggerEnter / onTriggerExit',
    code: `export default class TriggerScript extends Script {
  onTriggerEnter(other) {
    Engine.log("Entrée dans la zone : " + other.name);
    Engine.playSound("warp");
  }
  onTriggerExit(other) {
    Engine.log("Sortie de la zone : " + other.name);
  }
}
`,
  },
  {
    id: 'events',
    label: 'Événements custom',
    description: 'emit / onCustomEvent + timer',
    code: `export default class EventScript extends Script {
  onStart() {
    Engine.setTimer("pulse", 1.5, true);
    Engine.onCustomEvent?.("boom", (data) => {
      Engine.log("boom reçu", data);
    });
  }
  onUpdate(dt) {}
  onCustomEvent(name, data) {
    if (name === "boom") Engine.log("boom !" + (data ? " " + JSON.stringify(data) : ""));
  }
}
`,
  },
  {
    id: 'click',
    label: 'Réaction au clic',
    description: 'onClick en Play',
    code: `export default class ClickScript extends Script {
  onClick() {
    Engine.log("Cliqué sur " + this.entity.name);
    Engine.playSound("coin");
    if (this.entity.object3D) {
      this.entity.object3D.rotation.y += Math.PI / 2;
    }
  }
}
`,
  },
];

export function getTemplateById(id: string): ScriptTemplate {
  return SCRIPT_TEMPLATES.find((t) => t.id === id) || SCRIPT_TEMPLATES[0];
}
