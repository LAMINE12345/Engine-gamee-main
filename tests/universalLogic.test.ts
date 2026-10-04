import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { NodeType } from '../types/logic';
import { getSocketsForNodeType, createGraphNode } from '../lib/logic/NodeGraphConverter';
import { LogicExecutor } from '../lib/logic/LogicExecutor';
import { ScriptSandbox } from '../lib/logic/ScriptSandbox';

// ---------------------------------------------------------------------------
// Couverture catalogue : chaque NodeType doit avoir des sockets + titre.
// Garde-fou anti "nœud mort" (visible en palette mais sans runtime/sockets).
// ---------------------------------------------------------------------------

const ALL_NODE_TYPES: NodeType[] = [
  'OnStart', 'OnUpdate', 'OnCollision', 'OnKeyPress', 'OnClick',
  'OnTriggerEnter', 'OnTriggerExit', 'OnTimer', 'OnCustomEvent',
  'IfElse', 'Compare', 'Gate', 'Math', 'Clamp', 'Lerp', 'Random',
  'Toggle', 'Counter', 'Delay',
  'ApplyImpulse', 'SetPosition', 'SetRotation', 'SetScale', 'SetColor',
  'PlaySound', 'DestroyEntity', 'SetVariable', 'GetVariable', 'PlayAnimation',
  'PauseAnimation', 'ReverseAnimation', 'SpawnPrefab', 'PrintLog', 'CameraShake',
  'EmitParticles', 'ExplosionFX', 'StopParticles', 'ShootProjectile',
  'FollowTarget', 'PatrolWaypoints', 'CheckDistance', 'LookAtPlayer',
  'SetLightColor', 'PulseLight', 'FlickerLight',
  'SwitchCamera', 'ShowDialogue', 'SetDepthOfField',
  'PlaySound3D', 'PlaySFX', 'SetBGMState',
  'CheckEnemyVision', 'DealDamage', 'CheckInventory', 'AddItem', 'RemoveItem',
  'OnProximity', 'UnlockDoor',
  'OnWindGust', 'OnIgnite', 'OnExtinguish', 'OnRainStart', 'OnRainStop',
  'SetWind', 'ApplyWindForce', 'GetWind', 'IgniteEntity', 'ExtinguishEntity',
  'CheckIsBurning', 'SetRain', 'CheckIsRaining',
  // Pack Universel (20 briques)
  'OnDeath', 'TakeDamage', 'Heal', 'Respawn', 'Checkpoint',
  'WinGame', 'LoseGame', 'RestartLevel', 'PauseGame', 'ResumeGame',
  'Countdown', 'MoveTowards', 'FleeFrom', 'Wander', 'MeleeAttack',
  'ShowMessage', 'SaveGame', 'LoadGame', 'ToggleVisibility', 'CameraFollow',
  // Entrées clavier & pilotage
  'OnKeyRelease', 'IsKeyDown', 'ReadMoveAxis', 'MoveByAxis',
  // Matières & propriétés physiques
  'SetSurface', 'SetMaterial', 'SetGravity', 'SetDrag', 'SetTimeScale',
  // Effets sensoriels & capteurs
  'FootstepSound', 'HitStop', 'Rumble', 'SlowFollow', 'OnLand', 'OnSurfaceEnter', 'OnSurfaceExit',
];

describe('pack universel — catalogue & sockets', () => {
  it('couvre 107 types de nœuds (95 + 12 matières/effets)', () => {
    expect(ALL_NODE_TYPES).toHaveLength(107);
    expect(new Set(ALL_NODE_TYPES).size).toBe(107);
  });

  it('fournit des sockets (inputs/outputs) pour chaque type', () => {
    for (const type of ALL_NODE_TYPES) {
      const sockets = getSocketsForNodeType(type);
      expect(sockets, type).toBeDefined();
      expect(Array.isArray(sockets.inputs), `${type}: inputs`).toBe(true);
      expect(Array.isArray(sockets.outputs), `${type}: outputs`).toBe(true);
      expect(sockets.outputs.length, `${type}: ≥1 sortie`).toBeGreaterThan(0);
    }
  });

  it('donne un titre français non vide à chaque brique du pack', () => {
    const pack: NodeType[] = [
      'OnDeath', 'TakeDamage', 'Heal', 'Respawn', 'Checkpoint', 'WinGame',
      'LoseGame', 'RestartLevel', 'PauseGame', 'ResumeGame', 'Countdown',
      'MoveTowards', 'FleeFrom', 'Wander', 'MeleeAttack', 'ShowMessage',
      'SaveGame', 'LoadGame', 'ToggleVisibility', 'CameraFollow',
    ];
    for (const type of pack) {
      const n = createGraphNode(type, 0, 0);
      expect(n.title, type).not.toBe(type);
      expect(n.title.length, type).toBeGreaterThan(3);
      expect(n.inputs.length + n.outputs.length, `${type}: sockets`).toBeGreaterThan(0);
    }
  });

  it('applique des valeurs par défaut prêtes à jouer', () => {
    expect(createGraphNode('TakeDamage', 0, 0).values.damage).toBe(25);
    expect(createGraphNode('Heal', 0, 0).values).toMatchObject({ amount: 25, maxHP: 100 });
    expect(createGraphNode('Countdown', 0, 0).values.duration).toBe(10);
    expect(createGraphNode('MoveTowards', 0, 0).values).toMatchObject({ speed: 4, stopDistance: 0.5 });
    expect(createGraphNode('MeleeAttack', 0, 0).values).toMatchObject({ damage: 15, range: 2.5, cooldown: 1 });
    expect(createGraphNode('SaveGame', 0, 0).values.slot).toBe('slot1');
    expect(createGraphNode('CameraFollow', 0, 0).values).toMatchObject({ distance: 7, height: 4 });
  });

  it('branche par défaut sur « n\'importe quelle touche »', () => {
    // Le câblage « Touche Clavier -> MoveByAxis » ne fonctionne que si le nœud
    // d'événement n'est pas verrouillé sur une seule touche : c'est la touche
    // réellement appuyée qui donne le sens. Espace serait de plus le raccourci
    // Play/Stop de l'éditeur, donc un défaut trompeur.
    expect(createGraphNode('OnKeyPress', 0, 0).values.key).toBe('*');
    expect(createGraphNode('OnKeyRelease', 0, 0).values.key).toBe('*');
  });

  it('expose les touches de direction par défaut sur MoveByAxis', () => {
    expect(createGraphNode('MoveByAxis', 0, 0).values).toMatchObject({
      trigger: 'auto',
      forwardKey: 'KeyW',
      backKey: 'KeyS',
      leftKey: 'KeyA',
      rightKey: 'KeyD',
    });
  });
});

/** Corps rigide simulé : reproduit le contrat Rapier utilisé par `translate`. */
function mockBody(dynamic: boolean) {
  const state = { x: 0, y: 0.75, z: 0, rotY: 0, vx: 0, vz: 0 };
  return {
    state,
    isKinematic: () => !dynamic,
    setTranslation: (v: { x: number; y: number; z: number }) => {
      state.x = v.x;
      state.y = v.y;
      state.z = v.z;
    },
    setRotation: (q: { w: number }) => {
      state.rotY = 2 * Math.acos(q.w);
    },
    setLinvel: (v: { x: number; z: number }) => {
      state.vx = v.x;
      state.vz = v.z;
    },
  };
}

describe('déplacement d\'un objet porteur d\'un corps rigide', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it('déplace AUSSI le corps, sinon la physique annule le mouvement', () => {
    // Régression : on n'écrivait que object3D.position. Or PhysicsManager.step()
    // recopie la position du corps sur l'objet à chaque frame : en Play, le
    // déplacement était donc écrasé avant d'être affiché.
    const { exec, cube } = ctx;
    const body = mockBody(true);
    exec.physicsManager = { getEntityRigidbody: () => body };

    const { graph } = (() => {
      const key = gnode('OnKeyPress', { key: '*' });
      const move = gnode('MoveByAxis', { target: 'self', mode: 'world', step: 1 });
      return { graph: ggraph([key, move], [gconn(key, 'out_flow', move, 'in_flow')]) };
    })();
    mountKeyboardGraph(cube, graph);
    cube.object3D.position.set(0, 0.75, 0);

    pressKey(exec, 'KeyW', true);
    expect(cube.object3D.position.z).toBeCloseTo(-1, 6);
    expect(body.state.z).toBeCloseTo(-1, 6);
  });

  it('annule la vitesse résiduelle pour éviter la dérive', () => {
    const { exec, cube } = ctx;
    const body = mockBody(true);
    body.state.vx = 7;
    body.state.vz = 7;
    exec.physicsManager = { getEntityRigidbody: () => body };

    const key = gnode('OnKeyPress', { key: '*' });
    const move = gnode('MoveByAxis', { target: 'self', mode: 'world', step: 1 });
    mountKeyboardGraph(cube, ggraph([key, move], [gconn(key, 'out_flow', move, 'in_flow')]));
    cube.object3D.position.set(0, 0.75, 0);

    pressKey(exec, 'KeyW', true);
    expect(body.state.vx).toBe(0);
    expect(body.state.vz).toBe(0);
  });

  it('ne touche pas un corps cinématique (déjà synchronisé par step)', () => {
    const { exec, cube } = ctx;
    const body = mockBody(false);
    let setTranslationCalls = 0;
    body.setTranslation = (v) => {
      setTranslationCalls++;
      body.state.z = v.z;
    };
    exec.physicsManager = { getEntityRigidbody: () => body };

    const key = gnode('OnKeyPress', { key: '*' });
    const move = gnode('MoveByAxis', { target: 'self', mode: 'world', step: 1 });
    mountKeyboardGraph(cube, ggraph([key, move], [gconn(key, 'out_flow', move, 'in_flow')]));
    cube.object3D.position.set(0, 0.75, 0);

    pressKey(exec, 'KeyW', true);
    expect(setTranslationCalls).toBe(0);
    expect(cube.object3D.position.z).toBeCloseTo(-1, 6);
  });

  it('fonctionne sans PhysicsManager (objet sans corps)', () => {
    const { exec, cube } = ctx;
    exec.physicsManager = undefined;
    const key = gnode('OnKeyPress', { key: '*' });
    const move = gnode('MoveByAxis', { target: 'self', mode: 'world', step: 1 });
    mountKeyboardGraph(cube, ggraph([key, move], [gconn(key, 'out_flow', move, 'in_flow')]));
    cube.object3D.position.set(0, 0.75, 0);

    pressKey(exec, 'KeyW', true);
    expect(cube.object3D.position.z).toBeCloseTo(-1, 6);
  });

  it('applique le même correctif à MoveTowards', () => {
    const { exec, cube } = ctx;
    const body = mockBody(true);
    exec.physicsManager = { getEntityRigidbody: () => body };
    cube.object3D.position.set(0, 0, 0);

    const mv = gnode('MoveTowards', { posX: 10, posY: 0, posZ: 0, speed: 5, stopDistance: 0.5 });
    run(exec, cube, ggraph([mv], []), mv, { dt: 0.1 });
    expect(cube.object3D.position.x).toBeCloseTo(0.5, 6);
    expect(body.state.x).toBeCloseTo(0.5, 6);
  });
});

// ---------------------------------------------------------------------------
// Runtime : monde ECS simulé (mock) + vrais Object3D three.js.
// ---------------------------------------------------------------------------

function mockEntity(name: string, x = 0, y = 0, z = 0) {
  const object3D = new THREE.Object3D();
  object3D.position.set(x, y, z);
  return {
    id: `ent_${name}`,
    name,
    active: true,
    object3D,
    hasComponent: () => false,
    getComponent: () => undefined,
  };
}

function mockWorld(entities: ReturnType<typeof mockEntity>[]) {
  return {
    getAllEntities: () => entities,
    getEntity: (id: string) => entities.find((e) => e.id === id),
  };
}

function gnode(type: NodeType, values: Record<string, unknown> = {}) {
  return {
    id: `n_${type}_${Math.floor(Math.random() * 1e9)}`,
    type,
    title: type,
    category: 'action' as const,
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    values: { ...values },
  };
}

function gconn(from: { id: string }, fromSocket: string, to: { id: string }, toSocket: string) {
  return {
    id: `c_${from.id}_${to.id}`,
    fromNodeId: from.id,
    fromSocketId: fromSocket,
    toNodeId: to.id,
    toSocketId: toSocket,
  };
}

function ggraph(nodes: ReturnType<typeof gnode>[], connections: ReturnType<typeof gconn>[] = []) {
  return { enabled: true, nodes, connections, variables: {} };
}

/** Marqueur : écrit TestFlag=1 quand le flux l'atteint. */
function flagNode(flag = 'TestFlag') {
  return gnode('SetVariable', { variable: flag, operation: 'set', amount: 1 });
}

/** Même marqueur, nom explicite : pour les tests à plusieurs capteurs. */
function flagNode2(flag: string) {
  return flagNode(flag);
}

function setup() {
  const player = mockEntity('Player', 0, 0, 0);
  const cube = mockEntity('Cube_1', 4, 0, 0);
  const exec = new LogicExecutor(mockWorld([player, cube]) as never);
  exec.startSimulation();
  return { exec, player, cube };
}

/** Variables globales typées pour les assertions (Score/Health + flags de test). */
function V(exec: LogicExecutor): Record<string, number> {
  const getVars = (exec as unknown as { getVariables(): unknown }).getVariables;
  return getVars.call(exec) as Record<string, number>;
}

function run(exec: LogicExecutor, entity: unknown, graph: unknown, n: { id: string; type: NodeType; values: Record<string, unknown> }, ctx: Record<string, unknown> = {}) {
  (exec as unknown as { executeGraphNode: (e: unknown, g: unknown, node: unknown, s: string, c: unknown) => void })
    .executeGraphNode(entity, graph, n, 'in_flow', ctx);
}

describe('pack universel — runtime LogicExecutor', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('TakeDamage réduit les PV, Heal restaure (plafond maxHP)', () => {
    const { exec, cube } = ctx;
    run(exec, cube, ggraph([]), gnode('TakeDamage', { damage: 25 }));
    expect(exec.globalState.health).toBe(75);
    run(exec, cube, ggraph([]), gnode('Heal', { amount: 30, maxHP: 100 }));
    expect(exec.globalState.health).toBe(100);
    run(exec, cube, ggraph([]), gnode('TakeDamage', { damage: 50 }));
    run(exec, cube, ggraph([]), gnode('Heal', { amount: 10, maxHP: 60 }));
    expect(exec.globalState.health).toBe(60);
  });

  it('TakeDamage létal déclenche la sortie Vaincu + OnDeath', () => {
    const { exec, cube } = ctx;
    const take = gnode('TakeDamage', { damage: 200 });
    const flag = flagNode('DefeatedFlag');
    const death = gnode('OnDeath');
    const deathFlag = flagNode('DeathFlag');
    const graph = ggraph(
      [take, flag, death, deathFlag],
      [gconn(take, 'out_defeated', flag, 'in_flow'), gconn(death, 'out_flow', deathFlag, 'in_flow')]
    );
    // Le graphe doit être attaché à l'objet pour que l'événement global OnDeath le trouve
    cube.object3D.userData.logic = { nodeGraph: graph };
    run(exec, cube, graph, take);
    expect(exec.globalState.health).toBe(0);
    expect(V(exec).DefeatedFlag).toBe(1);
    expect(V(exec).DeathFlag).toBe(1);
  });

  it('Checkpoint mémorise puis RespawnReplace le joueur', () => {
    const { exec, player, cube } = ctx;
    // Le cube (7,0,0) devient le point de réapparition du joueur
    cube.object3D.position.set(7, 0, 0);
    run(exec, cube, ggraph([]), gnode('Checkpoint'));
    player.object3D.position.set(50, 0, 0);
    run(exec, player, ggraph([]), gnode('Respawn', { restoreHealth: true, health: 100 }));
    expect(player.object3D.position.x).toBe(7);
    expect(exec.globalState.health).toBe(100);
  });

  it('Respawn sans checkpoint revient à la position initiale', () => {
    const { exec, cube } = ctx;
    cube.object3D.position.set(9, 9, 9);
    run(exec, cube, ggraph([]), gnode('Respawn'));
    expect(cube.object3D.position.x).toBe(4);
    expect(cube.object3D.position.y).toBe(0);
  });

  it('WinGame / LoseGame affichent la bannière', () => {
    const { exec, cube } = ctx;
    run(exec, cube, ggraph([]), gnode('WinGame', { title: 'VICTOIRE !', message: 'Bravo' }));
    expect(exec.dialogueState.active).toBe(true);
    expect(exec.dialogueState.speaker).toBe('VICTOIRE !');
    run(exec, cube, ggraph([]), gnode('LoseGame'));
    expect(exec.dialogueState.speaker).toBe('DÉFAITE...');
  });

  it('RestartLevel réinitialise PV + positions', () => {
    const { exec, cube } = ctx;
    run(exec, cube, ggraph([]), gnode('TakeDamage', { damage: 40 }));
    cube.object3D.position.set(33, 0, 0);
    run(exec, cube, ggraph([]), gnode('RestartLevel'));
    expect(exec.globalState.health).toBe(100);
    expect(cube.object3D.position.x).toBe(4);
  });

  it('PauseGame gèle, ResumeGame relance', () => {
    const { exec, cube } = ctx;
    run(exec, cube, ggraph([]), gnode('PauseGame'));
    expect((exec as unknown as { paused: boolean }).paused).toBe(true);
    run(exec, cube, ggraph([]), gnode('ResumeGame'));
    expect((exec as unknown as { paused: boolean }).paused).toBe(false);
  });

  it('Countdown termine après la durée (via ticks OnUpdate)', () => {
    const { exec, cube } = ctx;
    const cd = gnode('Countdown', { duration: 3 });
    const done = flagNode('CountdownDone');
    const graph = ggraph([cd, done], [gconn(cd, 'out_finished', done, 'in_flow')]);
    run(exec, cube, graph, cd, { dt: 1 });
    run(exec, cube, graph, cd, { dt: 1 });
    expect(V(exec).CountdownDone).toBeUndefined();
    run(exec, cube, graph, cd, { dt: 1 });
    expect(V(exec).CountdownDone).toBe(1);
  });

  it('MoveTowards avance puis signale Arrivé', () => {
    const { exec, cube } = ctx;
    const mv = gnode('MoveTowards', { posX: 10, posY: 0, posZ: 0, speed: 5, stopDistance: 0.5 });
    const arrived = flagNode('ArrivedFlag');
    const graph = ggraph([mv, arrived], [gconn(mv, 'out_arrived', arrived, 'in_flow')]);
    cube.object3D.position.set(0, 0, 0);
    run(exec, cube, graph, mv, { dt: 1 });
    expect(cube.object3D.position.x).toBe(5);
    cube.object3D.position.set(9.8, 0, 0);
    run(exec, cube, graph, mv, { dt: 1 });
    expect(V(exec).ArrivedFlag).toBe(1);
  });

  it('FleeFrom fuit puis signale En Sécurité', () => {
    const { exec, player, cube } = ctx;
    const flee = gnode('FleeFrom', { speed: 4, safeDistance: 8 });
    const safe = flagNode('SafeFlag');
    const graph = ggraph([flee, safe], [gconn(flee, 'out_safe', safe, 'in_flow')]);
    cube.object3D.position.set(0, 0, 0);
    player.object3D.position.set(1, 0, 0);
    run(exec, cube, graph, flee, { dt: 1 });
    expect(cube.object3D.position.x).toBeLessThan(0);
    player.object3D.position.set(50, 0, 0);
    run(exec, cube, graph, flee, { dt: 1 });
    expect(V(exec).SafeFlag).toBe(1);
  });

  it('Wander déplace le PNJ sans crash', () => {
    const { exec, cube } = ctx;
    const before = cube.object3D.position.x;
    run(exec, cube, ggraph([]), gnode('Wander', { speed: 2, radius: 6, changeInterval: 3 }), { dt: 1 });
    expect(cube.object3D.position.x).not.toBe(before);
  });

  it('MeleeAttack frappe à portée (avec cooldown), rate hors portée', () => {
    const { exec, player, cube } = ctx;
    const atk = gnode('MeleeAttack', { damage: 15, range: 2.5, cooldown: 10 });
    const hit = flagNode('HitFlag');
    const graph = ggraph([atk, hit], [gconn(atk, 'out_hit', hit, 'in_flow')]);
    cube.object3D.position.set(0, 0, 0);
    player.object3D.position.set(1, 0, 0);
    run(exec, cube, graph, atk, { dt: 0.016 });
    expect(exec.globalState.health).toBe(85);
    expect(V(exec).HitFlag).toBe(1);
    // Cooldown : second appel immédiat ne refrappe pas
    run(exec, cube, graph, atk, { dt: 0.016 });
    expect(exec.globalState.health).toBe(85);
  });

  it('ShowMessage / SaveGame / LoadGame (sans DOM) routent les bons flux', () => {
    const { exec, cube } = ctx;
    const msg = gnode('ShowMessage', { message: 'Bravo !', duration: 1000 });
    const then = flagNode('MsgThen');
    let graph = ggraph([msg, then], [gconn(msg, 'out_flow', then, 'in_flow')]);
    run(exec, cube, graph, msg);
    expect(V(exec).MsgThen).toBe(1);

    const save = gnode('SaveGame', { slot: 'slot1' });
    const saved = flagNode('SavedFlag');
    graph = ggraph([save, saved], [gconn(save, 'out_saved', saved, 'in_flow')]);
    run(exec, cube, graph, save);
    expect(V(exec).SavedFlag).toBe(1);

    const load = gnode('LoadGame', { slot: 'slot1' });
    const missing = flagNode('MissingFlag');
    graph = ggraph([load, missing], [gconn(load, 'out_missing', missing, 'in_flow')]);
    run(exec, cube, graph, load);
    expect(V(exec).MissingFlag).toBe(1);
  });

  it('ToggleVisibility cache puis remontre', () => {
    const { exec, cube } = ctx;
    const tg = gnode('ToggleVisibility', { target: 'self' });
    const shown = flagNode('ShownFlag');
    const hidden = flagNode('HiddenFlag');
    const graph = ggraph(
      [tg, shown, hidden],
      [gconn(tg, 'out_shown', shown, 'in_flow'), gconn(tg, 'out_hidden', hidden, 'in_flow')]
    );
    run(exec, cube, graph, tg);
    expect(cube.object3D.visible).toBe(false);
    expect(cube.active).toBe(false);
    expect(V(exec).HiddenFlag).toBe(1);
    cube.active = true; // réactive pour le 2e passage (la boucle update filtre sinon)
    run(exec, cube, graph, tg);
    expect(cube.object3D.visible).toBe(true);
    expect(V(exec).ShownFlag).toBe(1);
  });

  it('CameraFollow mémorise la cible de suivi', () => {
    const { exec, cube } = ctx;
    run(exec, cube, ggraph([]), gnode('CameraFollow', { distance: 7, height: 4 }));
    expect(exec.cameraFollow).toMatchObject({ entityId: cube.id, distance: 7, height: 4 });
  });

  it('setVariable Health=0 déclenche OnDeath global', () => {
    const { exec, cube } = ctx;
    const death = gnode('OnDeath');
    const flag = flagNode('DeathFlag2');
    const graph = ggraph([death, flag], [gconn(death, 'out_flow', flag, 'in_flow')]);
    // Attache le graphe au cube pour que l'événement global le trouve
    cube.object3D.userData.logic = { nodeGraph: graph };
    exec.setVariable('Health', 0);
    expect(V(exec).DeathFlag2).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Entrées clavier & pilotage : câblage réel du LogicExecutor.
// On passe par handleKeyPress (le vrai point d'entrée clavier) et pressedKeys
// (l'état maintenu), pas par des appels directs aux handlers de nœuds.
// ---------------------------------------------------------------------------

/** Simule un appui clavier en passant par le dispatcheur du moteur. */
function pressKey(exec: LogicExecutor, code: string, isDown: boolean) {
  (exec as unknown as { handleKeyPress: (c: string, d: boolean) => void }).handleKeyPress(
    code,
    isDown
  );
}

/** Maintient une touche « enfoncée » (sans déclencher d'événement). */
function holdKey(exec: LogicExecutor, ...codes: string[]) {
  const set = (exec as unknown as { pressedKeys: Set<string> }).pressedKeys;
  codes.forEach((c) => set.add(c));
}

/** Monte un graphe clavier sur une entité pour que le dispatcheur le trouve. */
function mountKeyboardGraph(entity: unknown, graph: unknown) {
  (entity as { object3D: { userData: Record<string, unknown> } }).object3D.userData.logic = {
    nodeGraph: graph,
  };
}

describe('entrées clavier — dispatch & pilotage', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it('OnKeyPress ne se déclenche QUE sur la bonne touche', () => {
    const { exec, cube } = ctx;
    const key = gnode('OnKeyPress', { key: 'KeyE' });
    const flag = flagNode('KeyFlag');
    const graph = ggraph([key, flag], [gconn(key, 'out_flow', flag, 'in_flow')]);
    mountKeyboardGraph(cube, graph);

    // Régression : 'Escape'.includes('E') est vrai, l'ancien test par
    // sous-chaîne déclenchait donc le nœud « E » sur Échap.
    pressKey(exec, 'Escape', true);
    expect(V(exec).KeyFlag).toBeUndefined();

    pressKey(exec, 'KeyE', true);
    expect(V(exec).KeyFlag).toBe(1);
  });

  it('sépare l\'appui du relâchement', () => {
    const { exec, cube } = ctx;
    const down = gnode('OnKeyPress', { key: 'Space' });
    const up = gnode('OnKeyRelease', { key: 'Space' });
    const fDown = flagNode('DownFlag');
    const fUp = flagNode('UpFlag');
    const graph = ggraph(
      [down, up, fDown, fUp],
      [
        gconn(down, 'out_flow', fDown, 'in_flow'),
        gconn(up, 'out_flow', fUp, 'in_flow'),
      ]
    );
    mountKeyboardGraph(cube, graph);

    pressKey(exec, 'Space', true);
    expect(V(exec).DownFlag).toBe(1);
    expect(V(exec).UpFlag).toBeUndefined();

    pressKey(exec, 'Space', false);
    expect(V(exec).UpFlag).toBe(1);
  });

  it('IsKeyDown branche sur la bonne sortie', () => {
    const { exec, cube } = ctx;
    const probe = gnode('IsKeyDown', { key: 'KeyF' });
    const fDown = flagNode('HeldFlag');
    const graph = ggraph([probe, fDown], [gconn(probe, 'out_down', fDown, 'in_flow')]);
    mountKeyboardGraph(cube, graph);

    holdKey(exec, 'KeyF');
    run(exec, cube, graph, probe, {});
    expect(V(exec).HeldFlag).toBe(1);
  });
});

describe('déplacement clavier — avancer / reculer sur un objet', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it('ReadMoveAxis + MoveByAxis avance l\'objet quand la touche est maintenue', () => {
    const { exec, cube } = ctx;
    cube.object3D.position.set(0, 0, 0);

    const read = gnode('ReadMoveAxis', {});
    const move = gnode('MoveByAxis', { target: 'self', speed: 5, mode: 'self' });
    const graph = ggraph([read, move], [gconn(read, 'out_forward', move, 'in_forward')]);

    // Aucun appui : l'objet ne bouge pas.
    run(exec, cube, graph, read, { dt: 0.1 });
    run(exec, cube, graph, move, { dt: 0.1 });
    expect(cube.object3D.position.z).toBe(0);

    // W maintenu : 5 u/s pendant 0,1 s => 0,5 unité vers -Z.
    holdKey(exec, 'KeyW');
    run(exec, cube, graph, read, { dt: 0.1 });
    expect(exec.lastMoveAxis.forward).toBe(1);
    run(exec, cube, graph, move, { dt: 0.1 });
    expect(cube.object3D.position.z).toBeCloseTo(-0.5, 6);
  });

  it('recule quand la touche arrière est maintenue', () => {
    const { exec, cube } = ctx;
    cube.object3D.position.set(0, 0, 0);
    const read = gnode('ReadMoveAxis', {});
    const move = gnode('MoveByAxis', { target: 'self', speed: 4, mode: 'self' });
    const graph = ggraph([read, move], [gconn(read, 'out_forward', move, 'in_forward')]);

    holdKey(exec, 'KeyS');
    run(exec, cube, graph, read, { dt: 0.5 });
    run(exec, cube, graph, move, { dt: 0.5 });
    expect(cube.object3D.position.z).toBeCloseTo(2, 6);
  });

  it('déplace l\'objet NOMMÉ, pas le porteur du graphe', () => {
    const { exec, player, cube } = ctx;
    player.object3D.position.set(0, 0, 0);
    cube.object3D.position.set(9, 0, 9);
    mountKeyboardGraph(player, ggraph([]));

    // C'est `player` qui porte le graphe, mais la cible est `Cube_1`.
    const move = gnode('MoveByAxis', { target: 'Cube_1', speed: 10, mode: 'world' });
    run(exec, player, ggraph([move]), move, { dt: 0.1, forward: 1 });
    expect(cube.object3D.position.z).toBeCloseTo(8, 6);
    expect(player.object3D.position.z).toBe(0);
  });

  it('retombe sur soi si la cible nommée est introuvable', () => {
    const { exec, player } = ctx;
    player.object3D.position.set(0, 0, 0);
    const move = gnode('MoveByAxis', { target: 'ObjetFantome', speed: 10, mode: 'world' });
    run(exec, player, ggraph([move]), move, { dt: 0.1, forward: 1 });
    // Aucune exception, et c'est bien soi qui a bougé.
    expect(player.object3D.position.z).toBeCloseTo(-1, 6);
  });

  it('pivote l\'objet dans sa direction quand on avance', () => {
    const { exec, player } = ctx;
    player.object3D.position.set(0, 0, 0);
    player.object3D.rotation.set(0, 0, 0);
    const move = gnode('MoveByAxis', { target: 'self', speed: 5, mode: 'self', faceHeading: true });
    run(exec, player, ggraph([move]), move, { dt: 0.1, forward: 1 });
    expect(player.object3D.rotation.y).toBeCloseTo(0, 5);
  });

  it('marche latéralement sans faire demi-tour', () => {
    const { exec, player } = ctx;
    player.object3D.position.set(0, 0, 0);
    player.object3D.rotation.set(0, 0, 0);
    const move = gnode('MoveByAxis', { target: 'self', speed: 5, mode: 'self', faceHeading: true });
    run(exec, player, ggraph([move]), move, { dt: 0.1, right: 1 });
    expect(player.object3D.rotation.y).toBe(0);
    expect(player.object3D.position.x).toBeCloseTo(0.5, 6);
  });

  it('suit le cap de l\'objet en mode « self »', () => {
    const { exec, player } = ctx;
    player.object3D.position.set(0, 0, 0);
    // Cap à 90° : l'avant pointe vers -X.
    player.object3D.rotation.set(0, Math.PI / 2, 0);
    const move = gnode('MoveByAxis', { target: 'self', speed: 5, mode: 'self', faceHeading: false });
    run(exec, player, ggraph([move]), move, { dt: 0.1, forward: 1 });
    expect(player.object3D.position.x).toBeCloseTo(-0.5, 6);
  });

  it('ignore l\'orientation de l\'objet en mode « world »', () => {
    const { exec, player } = ctx;
    player.object3D.position.set(0, 0, 0);
    player.object3D.rotation.set(0, Math.PI / 2, 0);
    const move = gnode('MoveByAxis', { target: 'self', speed: 5, mode: 'world' });
    run(exec, player, ggraph([move]), move, { dt: 0.1, forward: 1 });
    expect(player.object3D.position.z).toBeCloseTo(-0.5, 6);
    expect(player.object3D.position.x).toBeCloseTo(0, 6);
  });

  it('interrompt une boucle de graphe au lieu de faire déborder la pile', () => {
    const { exec, cube } = ctx;
    // Cycle A → B → A, câblage que l'éditeur visuel autorise.
    const a = gnode('SetVariable', { variable: 'LoopA', operation: 'add', amount: 1 });
    const b = gnode('SetVariable', { variable: 'LoopB', operation: 'add', amount: 1 });
    const graph = ggraph(
      [a, b],
      [gconn(a, 'out_flow', b, 'in_flow'), gconn(b, 'out_flow', a, 'in_flow')]
    );

    // Ne doit pas lancer de RangeError : la boucle est coupée à MAX_FLOW_DEPTH.
    expect(() => run(exec, cube, graph, a, {})).not.toThrow();
    expect(V(exec).LoopA).toBeGreaterThan(0);
    expect(V(exec).LoopB).toBeGreaterThan(0);
  });

  it('supporte une auto-connexion (sortie reliée à sa propre entrée)', () => {
    const { exec, cube } = ctx;
    const a = gnode('SetVariable', { variable: 'SelfLoop', operation: 'add', amount: 1 });
    const graph = ggraph([a], [gconn(a, 'out_flow', a, 'in_flow')]);
    expect(() => run(exec, cube, graph, a, {})).not.toThrow();
  });
});


// ---------------------------------------------------------------------------
// Câblage « tel que l'utilisateur le fait » : OnKeyPress -> MoveByAxis.
// C'est le montage le plus naturel (touche -> avancer/reculer) et c'est
// exactement celui qui ne bougeait rien avant correction.
// ---------------------------------------------------------------------------

describe('câblage direct OnKeyPress -> MoveByAxis', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  /** Graphe minimal : la touche pressee declenche un pas. */
  function keyStepGraph(values: Record<string, unknown> = {}) {
    // « N'importe quelle touche » : un seul MoveByAxis recoit W *et* S, et
    // c'est la touche reellement appuyee qui donne le sens.
    const key = gnode('OnKeyPress', { key: '*' });
    const move = gnode('MoveByAxis', {
      target: 'self',
      mode: 'world',
      faceHeading: false,
      step: 1,
      ...values,
    });
    return { graph: ggraph([key, move], [gconn(key, 'out_flow', move, 'in_flow')]) };
  }

  it('avance d\'un pas quand la touche « avant » est pressée', () => {
    const { exec, cube } = ctx;
    cube.object3D.position.set(0, 0, 0);
    const { graph } = keyStepGraph();
    mountKeyboardGraph(cube, graph);

    // Régression : avant correction, `forward` restait undefined -> 0 et
    // l'objet ne bougeait pas du tout.
    pressKey(exec, 'KeyW', true);
    expect(cube.object3D.position.z).toBeCloseTo(-1, 6);
  });

  it('recule d\'un pas quand la touche « arrière » est pressée', () => {
    const { exec, cube } = ctx;
    cube.object3D.position.set(0, 0, 0);
    const { graph } = keyStepGraph();
    mountKeyboardGraph(cube, graph);

    pressKey(exec, 'KeyS', true);
    expect(cube.object3D.position.z).toBeCloseTo(1, 6);
  });

  it('va à gauche et à droite', () => {
    const { exec, cube } = ctx;
    cube.object3D.position.set(0, 0, 0);
    const { graph } = keyStepGraph();
    mountKeyboardGraph(cube, graph);

    pressKey(exec, 'KeyA', true);
    expect(cube.object3D.position.x).toBeCloseTo(-1, 6);

    pressKey(exec, 'KeyD', true);
    expect(cube.object3D.position.x).toBeCloseTo(0, 6);
  });

  it('respecte la distance par appui configurée', () => {
    const { exec, cube } = ctx;
    cube.object3D.position.set(0, 0, 0);
    const { graph } = keyStepGraph({ step: 3 });
    mountKeyboardGraph(cube, graph);

    pressKey(exec, 'KeyW', true);
    expect(cube.object3D.position.z).toBeCloseTo(-3, 6);
  });

  it('accumule les appuis successifs', () => {
    const { exec, cube } = ctx;
    cube.object3D.position.set(0, 0, 0);
    const { graph } = keyStepGraph();
    mountKeyboardGraph(cube, graph);

    pressKey(exec, 'KeyW', true);
    pressKey(exec, 'KeyW', false);
    pressKey(exec, 'KeyW', true);
    expect(cube.object3D.position.z).toBeCloseTo(-2, 6);
  });

  it('ne bouge PAS sur une touche hors déplacement', () => {
    const { exec, cube } = ctx;
    cube.object3D.position.set(0, 0, 0);
    const { graph } = keyStepGraph();
    mountKeyboardGraph(cube, graph);

    pressKey(exec, 'KeyE', true);
    expect(cube.object3D.position.z).toBe(0);
    expect(cube.object3D.position.x).toBe(0);
  });

  it('permet de remapper les touches de direction', () => {
    const { exec, cube } = ctx;
    cube.object3D.position.set(0, 0, 0);
    // I = avancer, K = reculer (configuration type « commandes à côté »).
    const { graph } = keyStepGraph({ forwardKey: 'KeyI', backKey: 'KeyK' });
    mountKeyboardGraph(cube, graph);

    pressKey(exec, 'KeyI', true);
    expect(cube.object3D.position.z).toBeCloseTo(-1, 6);
    pressKey(exec, 'KeyK', true);
    expect(cube.object3D.position.z).toBeCloseTo(0, 6);
  });

  it('en mode « axe », une touche seule ne fait pas bouger l\'objet', () => {
    // Le mode axe ignore volontairement le contexte clavier : sans valeur
    // d'axe, aucun déplacement (c'est ReadMoveAxis qui alimente).
    const { exec, cube } = ctx;
    cube.object3D.position.set(0, 0, 0);
    const { graph } = keyStepGraph({ trigger: 'axis' });
    mountKeyboardGraph(cube, graph);

    pressKey(exec, 'KeyW', true);
    expect(cube.object3D.position.z).toBe(0);
  });

  it('ne double pas la vitesse si l\'on branche deux sorties de ReadMoveAxis', () => {
    // ReadMoveAxis déclenche 4 sorties avec le MÊME contexte : sans filtre,
    // « Avant » ET « Latéral » vers le même nœud le faisait tourner 2 fois.
    const { exec, cube } = ctx;
    cube.object3D.position.set(0, 0, 0);
    const read = gnode('ReadMoveAxis', {});
    const move = gnode('MoveByAxis', { target: 'self', speed: 5, mode: 'world', faceHeading: false });
    const graph = ggraph(
      [read, move],
      [
        gconn(read, 'out_forward', move, 'in_forward'),
        gconn(read, 'out_right', move, 'in_right'),
      ]
    );
    mountKeyboardGraph(cube, graph);

    holdKey(exec, 'KeyW');
    run(exec, cube, graph, read, { dt: 0.1 });
    // 5 u/s * 0,1 s = 0,5 unité, et NON 1,0.
    expect(cube.object3D.position.z).toBeCloseTo(-0.5, 6);
  });
});

// ---------------------------------------------------------------------------
// Matières & propriétés physiques : le graphe peut enfin rendre un sol
// glissant / rebondissant pendant le jeu (friction Rapier mutable).
// ---------------------------------------------------------------------------

/**
 * Corps + collider simulés, avec le contrat attendu par LogicExecutor.
 * Les règles de combinaison sont posées comme le fait désormais
 * `PhysicsManager.setSurfaceProperties` (Min pour la friction, Max pour le
 * rebond) : sans elles, un preset « glacier » serait moyenné avec la friction
 * du joueur et deviendrait inerte.
 */
function mockPhysics() {
  const st = {
    friction: 0.5,
    restitution: 0.4,
    mass: 1,
    linearDamping: 0.05,
    angvel: { x: 0, y: 0, z: 0 },
    forces: [] as { x: number; y: number; z: number }[],
    combine: { friction: '', restitution: '' },
  };
  return {
    st,
    getEntityRigidbody: () => ({
      isKinematic: () => false,
      linvel: () => ({ x: 0, y: 0, z: 0 }),
      angvel: () => st.angvel,
      addForce: (f: { x: number; y: number; z: number }) => st.forces.push(f),
      setTranslation: () => {},
      setRotation: () => {},
      setLinvel: () => {},
    }),
    getBodySpeed: () => ({ linear: 0, angular: 0 }),
    setSurfaceProperties: (_id: string, fr?: number, re?: number) => {
      if (typeof fr === 'number') st.friction = fr;
      if (typeof re === 'number') st.restitution = re;
      st.combine.friction = 'Min';
      st.combine.restitution = 'Max';
      return true;
    },
    setBodyMass: (_id: string, m: number) => {
      st.mass = m;
      return true;
    },
    setBodyDamping: (_id: string, lin?: number) => {
      if (typeof lin === 'number') st.linearDamping = lin;
      return true;
    },
  };
}

describe('matières & propriétés physiques', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it('SetSurface rend le sol glissant (preset glace)', () => {
    const { exec, cube } = ctx;
    const pm = mockPhysics();
    exec.physicsManager = pm;
    const node = gnode('SetSurface', { target: 'self', surface: 'ice' });
    run(exec, cube, ggraph([node], []), node);

    expect(pm.st.friction).toBeCloseTo(0.02, 6);
    expect(pm.st.restitution).toBeCloseTo(0.1, 6);
  });

  it('SetSurface rend le sol rebondissant (preset caoutchouc)', () => {
    const { exec, cube } = ctx;
    const pm = mockPhysics();
    exec.physicsManager = pm;
    const node = gnode('SetSurface', { target: 'self', surface: 'rubber' });
    run(exec, cube, ggraph([node], []), node);

    expect(pm.st.restitution).toBeGreaterThan(0.8);
    expect(pm.st.friction).toBeGreaterThan(1);
  });

  it('la matière est mémorisée pour les capteurs', () => {
    const { exec, cube } = ctx;
    exec.physicsManager = mockPhysics();
    const node = gnode('SetMaterial', { target: 'self', material: 'mud' });
    run(exec, cube, ggraph([node], []), node);
    expect(cube.object3D.userData.surface).toBe('mud');
  });

  it('impose les règles de combinaison (Min / Max)', () => {
    // Régression : avec la MOYENNE par défaut de Rapier, une glace à 0,02
    // contre un joueur à 0,5 donnait 0,26 — le preset « glacier » glissait à
    // peine. `Min` garantit que la surface la plus glissante l'emporte.
    // (Vérifié en physique réelle dans tests/surfacePhysics.test.ts.)
    const { exec, cube } = ctx;
    const pm = mockPhysics();
    exec.physicsManager = pm;
    const node = gnode('SetSurface', { target: 'self', surface: 'ice' });
    run(exec, cube, ggraph([node], []), node);
    expect(pm.st.combine.friction).toBe('Min');
    expect(pm.st.combine.restitution).toBe('Max');
  });

  it('une socket câblée écrase le réglage du panneau', () => {
    const { exec, cube } = ctx;
    const pm = mockPhysics();
    exec.physicsManager = pm;
    // Le panneau dit 0.9, la socket impose 0.05 : la socket doit gagner.
    const node = gnode('SetSurface', { target: 'self', surface: 'default', friction: 0.9 });
    run(exec, cube, ggraph([node], []), node, { friction: 0.05 });
    expect(pm.st.friction).toBeCloseTo(0.05, 6);
  });

  it('borne une friction négative au lieu de la laisser passer', () => {
    const { exec, cube } = ctx;
    const pm = mockPhysics();
    exec.physicsManager = pm;
    const node = gnode('SetSurface', { target: 'self', surface: 'default' });
    run(exec, cube, ggraph([node], []), node, { friction: -5 });
    expect(pm.st.friction).toBe(0);
  });

  it('SetGravity applique une force vers le bas, nulle en zéro-g', () => {
    const { exec, cube } = ctx;
    const pm = mockPhysics();
    exec.physicsManager = pm;

    const normal = gnode('SetGravity', { target: 'self', scale: 1 });
    run(exec, cube, ggraph([normal], []), normal);
    expect(pm.st.forces[0].y).toBeLessThan(0);

    pm.st.forces.length = 0;
    const zeroG = gnode('SetGravity', { target: 'self', scale: 0 });
    run(exec, cube, ggraph([zeroG], []), zeroG);
    // Math.abs : -0 === 0 mais `toBe(0)` distingue les deux (Object.is).
    expect(Math.abs(pm.st.forces[0].y)).toBe(0);
  });

  it('la gravité lunaire est bien plus faible que la normale', () => {
    const { exec, cube } = ctx;
    const pm = mockPhysics();
    exec.physicsManager = pm;

    const moon = gnode('SetGravity', { target: 'self', scale: 0.166 });
    run(exec, cube, ggraph([moon], []), moon);
    const moonF = Math.abs(pm.st.forces[0].y);

    pm.st.forces.length = 0;
    const earth = gnode('SetGravity', { target: 'self', scale: 1 });
    run(exec, cube, ggraph([earth], []), earth);
    const earthF = Math.abs(pm.st.forces[0].y);

    expect(moonF).toBeLessThan(earthF);
    expect(moonF / earthF).toBeCloseTo(0.166, 2);
  });

  it('SetDrag augmente l\'amortissement du corps', () => {
    const { exec, cube } = ctx;
    const pm = mockPhysics();
    exec.physicsManager = pm;
    const node = gnode('SetDrag', { target: 'self', linear: 4 });
    run(exec, cube, ggraph([node], []), node);
    expect(pm.st.linearDamping).toBeCloseTo(4, 6);
  });

  it('HitStop gèle puis restitue le temps', () => {
    const { exec, cube } = ctx;
    const node = gnode('HitStop', { duration: 0.08 });
    const graph = ggraph([node], []);
    run(exec, cube, graph, node);
    // Gel actif juste après l'appel…
    expect(ScriptSandbox.getTimeScale?.() ?? 0).toBe(0);
    // …puis écoulé : le temps doit repartir.
    exec.update(0.1);
    expect(ScriptSandbox.getTimeScale?.()).toBe(1);
  });

  it('HitStop ne peut pas figer la partie au-delà de 0,5 s', () => {
    const { exec, cube } = ctx;
    const node = gnode('HitStop', { duration: 30 });
    const graph = ggraph([node], []);
    run(exec, cube, graph, node);
    exec.update(0.6);
    expect(ScriptSandbox.getTimeScale?.()).toBe(1);
  });

  it('SetTimeScale pose un ralenti durable, pas un gel', () => {
    const { exec, cube } = ctx;
    const node = gnode('SetTimeScale', { scale: 0.25 });
    run(exec, cube, ggraph([node], []), node);
    expect(ScriptSandbox.getTimeScale?.()).toBe(0.25);
  });

  it('le Stop remet à zéro les effets en cours', () => {
    const { exec, cube } = ctx;
    exec.physicsManager = mockPhysics();
    const stop = gnode('HitStop', { duration: 0.5 });
    run(exec, cube, ggraph([stop], []), stop);
    expect(ScriptSandbox.getTimeScale?.()).toBe(0);

    exec.stopSimulation();
    expect(ScriptSandbox.getTimeScale?.()).toBe(1);
  });

  it('le tremblement s\'éteint et notifie la caméra', () => {
    const { exec, cube } = ctx;
    const shakes: number[] = [];
    exec.onCameraShake = (i) => shakes.push(i);
    const node = gnode('Rumble', { intensity: 1, duration: 0.2 });
    run(exec, cube, ggraph([node], []), node);

    exec.update(0.05);
    const peak = Math.max(...shakes);
    expect(peak).toBeGreaterThan(0);
    // Décroissance : la dernière frame doit être plus faible que le pic.
    exec.update(0.05);
    expect(shakes[shakes.length - 1]).toBeLessThan(peak);
  });
});

// ---------------------------------------------------------------------------
// Le joueur n'a PAS de corps rigide : son mouvement est calcule par le
// CharacterController. Ces tests verifient que les noeuds l'atteignent quand
// meme — sans eux, SetGravity sur le joueur ne faisait strictement rien.
// ---------------------------------------------------------------------------

/** Entite avec un CharacterController (comme le joueur). */
function charEntity(name = 'Player_2') {
  const object3D = new THREE.Object3D();
  object3D.position.set(0, 0, 0);
  const overrides = {
    gravityScale: null as number | null,
    traction: null as number | null,
    groundFriction: null as number | null,
    drag: null as number | null,
  };
  const comp = {
    type: 'CharacterController',
    enabled: true,
    speed: 7,
    jumpForce: 8.5,
    isGrounded: true,
    currentSpeed: 0,
    verticalVelocity: 0,
    velocity: new THREE.Vector3(),
    rawController: null,
    rawBody: null,
    runtimeOverrides: overrides,
    clearRuntimeOverrides() {
      overrides.gravityScale = null;
      overrides.traction = null;
      overrides.groundFriction = null;
      overrides.drag = null;
    },
  };
  const types = new Set(['CharacterController']);
  return {
    id: `ent_${name}`,
    name,
    active: true,
    object3D,
    hasComponent: (t: string) => types.has(t),
    getComponent: (t: string) => (types.has(t) ? comp : undefined),
    comp,
  };
}

describe('joueur (CharacterController) — de\u0327rogation en jeu', () => {
  it('SetGravity pose la pesanteur sur le joueur, sans corps rigide', () => {
    const { exec } = setup();
    const player = charEntity();
    const w = exec as unknown as { ecsWorld: { getAllEntities: () => unknown; getEntity: () => unknown } };
    w.ecsWorld.getAllEntities = () => [player];
    w.ecsWorld.getEntity = () => player;
    exec.physicsManager = mockPhysics();

    const node = gnode('SetGravity', { target: 'self', scale: 0.166 });
    run(exec, player, ggraph([node], []), node);

    expect(player.comp.runtimeOverrides.gravityScale).toBeCloseTo(0.166, 6);
    // Aucune force Rapier ne doit avoir été appliquée : le joueur n'en a pas.
    expect((exec.physicsManager as unknown as { st: { forces: unknown[] } }).st.forces.length).toBe(0);
  });

  it('le zero-G met la pesanteur a zero', () => {
    const { exec } = setup();
    const player = charEntity();
    const w = exec as unknown as { ecsWorld: { getAllEntities: () => unknown; getEntity: () => unknown } };
    w.ecsWorld.getAllEntities = () => [player];
    w.ecsWorld.getEntity = () => player;

    const node = gnode('SetGravity', { target: 'self', scale: 0 });
    run(exec, player, ggraph([node], []), node);
    expect(player.comp.runtimeOverrides.gravityScale).toBe(0);
  });

  it('SetSurface pose friction au sol ET traction sur le joueur', () => {
    const { exec } = setup();
    const player = charEntity();
    const w = exec as unknown as { ecsWorld: { getAllEntities: () => unknown; getEntity: () => unknown } };
    w.ecsWorld.getAllEntities = () => [player];
    w.ecsWorld.getEntity = () => player;

    const node = gnode('SetMaterial', { target: 'self', material: 'mud' });
    run(exec, player, ggraph([node], []), node);

    // Boue : friction 0.9, traction 0.45 (on marche deux fois moins vite).
    expect(player.comp.runtimeOverrides.groundFriction).toBeCloseTo(0.9, 6);
    expect(player.comp.runtimeOverrides.traction).toBeCloseTo(0.45, 6);
  });

  it('la glace donne une friction quasi nulle au joueur', () => {
    const { exec } = setup();
    const player = charEntity();
    const w = exec as unknown as { ecsWorld: { getAllEntities: () => unknown; getEntity: () => unknown } };
    w.ecsWorld.getAllEntities = () => [player];
    w.ecsWorld.getEntity = () => player;

    const node = gnode('SetMaterial', { target: 'self', material: 'ice' });
    run(exec, player, ggraph([node], []), node);
    expect(player.comp.runtimeOverrides.groundFriction).toBeLessThan(0.05);
  });

  it('SetDrag pose la trainee sur le joueur', () => {
    const { exec } = setup();
    const player = charEntity();
    const w = exec as unknown as { ecsWorld: { getAllEntities: () => unknown; getEntity: () => unknown } };
    w.ecsWorld.getAllEntities = () => [player];
    w.ecsWorld.getEntity = () => player;

    const node = gnode('SetDrag', { target: 'self', linear: 2 });
    run(exec, player, ggraph([node], []), node);
    expect(player.comp.runtimeOverrides.drag).toBeCloseTo(2, 6);
  });

  it('OnLand se déclenche pour le joueur, qui n\'a pas de corps rigide', () => {
    // Régression : la vitesse verticale venait uniquement du corps Rapier.
    // Le joueur étant piloté par le CharacterController, l'atterrissage
    // n'aurait jamais été détecté — le capteur le plus utilisé, inerte.
    const { exec } = setup();
    const player = charEntity();
    const w = exec as unknown as { ecsWorld: { getAllEntities: () => unknown; getEntity: () => unknown } };
    w.ecsWorld.getAllEntities = () => [player];
    w.ecsWorld.getEntity = () => player;
    const flag = gnode('SetVariable', { variable: 'Landed', operation: 'set', amount: 1 });
    const land = gnode('OnLand', { minSpeed: 1 });
    const graph = ggraph([land, flag], [gconn(land, 'out_flow', flag, 'in_flow')]);
    mountKeyboardGraph(player, graph);

    // En train de tomber vite…
    player.comp.verticalVelocity = -8;
    (exec as unknown as { updateSurfaceSensors: () => void }).updateSurfaceSensors();
    expect(player.comp.verticalVelocity).toBe(-8); // encore en l'air

    // …puis au sol : la vitesse passe à ~0, ce qui déclenche l'atterrissage.
    player.comp.verticalVelocity = 0;
    (exec as unknown as { updateSurfaceSensors: () => void }).updateSurfaceSensors();
    expect(V(exec).Landed).toBe(1);
  });

  it('le Stop efface les derogations du joueur', () => {
    const { exec } = setup();
    const player = charEntity();
    const w = exec as unknown as { ecsWorld: { getAllEntities: () => unknown; getEntity: () => unknown } };
    w.ecsWorld.getAllEntities = () => [player];
    w.ecsWorld.getEntity = () => player;

    const g = gnode('SetGravity', { target: 'self', scale: 0.166 });
    run(exec, player, ggraph([g], []), g);
    expect(player.comp.runtimeOverrides.gravityScale).toBeCloseTo(0.166, 6);

    exec.stopSimulation();
    // Une session suivante ne doit pas démarrer avec un joueur lunaire.
    expect(player.comp.runtimeOverrides.gravityScale).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CameraFollow vs SlowFollow : le second garde le retard, le premier colle.
// ---------------------------------------------------------------------------

describe('SlowFollow — caméra a trainee', () => {
  it('active la trainee et branche le suivi rigide', () => {
    const { exec, cube } = setup();
    let called = false;
    exec.onCameraFollow = () => { called = true; };
    const node = gnode('SlowFollow', { target: 'self', style: 'cinematic' });
    run(exec, cube, ggraph([node], []), node);

    expect(called).toBe(true);
    const trail = (exec as unknown as { trail: { style: string; smoothing: number } | null }).trail;
    expect(trail).not.toBeNull();
    expect(trail!.style).toBe('cinematic');
  });

  it('demarre exactement sur la cible : pas de saut a l activation', () => {
    const { exec, cube } = setup();
    cube.object3D.position.set(4, 1, -2);
    const node = gnode('SlowFollow', { target: 'self', style: 'drift' });
    run(exec, cube, ggraph([node], []), node);

    const st = exec as unknown as { trailPosition: { x: number; y: number; z: number } | null };
    // Premier update : la position trainee vaut la position de base, donc
    // aucune interpolation brutale depuis l'ancienne caméra.
    (exec as unknown as { updateTrailCamera: (d: number) => void }).updateTrailCamera(1 / 60);
    expect(st.trailPosition).not.toBeNull();
  });

  it('applique le preset du style si aucun retard n est fourni', () => {
    const { exec, cube } = setup();
    const node = gnode('SlowFollow', { target: 'self', style: 'drift' });
    run(exec, cube, ggraph([node], []), node);
    // drift = 1.6, la traîne la plus lente des presets.
    const trail = (exec as unknown as { trail: { smoothing: number } }).trail;
    expect(trail.smoothing).toBeCloseTo(1.6, 6);
  });

  it('une socket cablee ecrase le preset du style', () => {
    const { exec, cube } = setup();
    const node = gnode('SlowFollow', { target: 'self', style: 'drift' });
    run(exec, cube, ggraph([node], []), node, { smoothing: 15 });
    const trail = (exec as unknown as { trail: { smoothing: number } }).trail;
    expect(trail.smoothing).toBeCloseTo(15, 6);
  });

  it('borne un retard aberrant au lieu de le transmettre', () => {
    const { exec, cube } = setup();
    const node = gnode('SlowFollow', { target: 'self', style: 'sprint' });
    run(exec, cube, ggraph([node], []), node, { smoothing: 1e9 });
    const trail = (exec as unknown as { trail: { smoothing: number } }).trail;
    expect(trail.smoothing).toBeLessThanOrEqual(40);
  });

  it('le Stop libere la trainee', () => {
    const { exec, cube } = setup();
    const node = gnode('SlowFollow', { target: 'self', style: 'sprint' });
    run(exec, cube, ggraph([node], []), node);
    expect((exec as unknown as { trail: unknown }).trail).not.toBeNull();

    exec.stopSimulation();
    // Une session suivante ne doit pas heriter d une caméra fantôme.
    expect((exec as unknown as { trail: unknown }).trail).toBeNull();
  });

  it('pousse la position trainee au runtime chaque frame', () => {
    const { exec, cube } = setup();
    const pushes: { x: number }[] = [];
    exec.onCameraTrailing = (p) => pushes.push(p);
    const node = gnode('SlowFollow', { target: 'self', style: 'sprint' });
    run(exec, cube, ggraph([node], []), node);

    (exec as unknown as { updateTrailCamera: (d: number) => void }).updateTrailCamera(1 / 60);
    expect(pushes.length).toBe(1);
    expect(Number.isFinite(pushes[0].x)).toBe(true);
  });

  it('relache la trainee si la cible disparait', () => {
    const { exec, cube } = setup();
    const node = gnode('SlowFollow', { target: 'self', style: 'sprint' });
    run(exec, cube, ggraph([node], []), node);

    cube.active = false;
    (exec as unknown as { updateTrailCamera: (d: number) => void }).updateTrailCamera(1 / 60);
    expect((exec as unknown as { trail: unknown }).trail).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Échelle de temps : le contrat promis par SetTimeScale (« ralenti / bullet-time
// sur TOUTE la simulation ») et ses coroutines.
// ---------------------------------------------------------------------------

/**
 * `ScriptSandbox.wait` passe par `window.setTimeout` et `LogicExecutor` par
* `window.dispatchEvent` : l'environnement de test est 'node', sans `window`.
 * On installe un shim complet UNE FOIS — un `window` partiel laissé en place
 * ferait échouer tous les tests suivants sur `dispatchEvent is not a function`.
 */
function installFakeWindow() {
  const g = globalThis as unknown as { window?: unknown; CustomEvent?: unknown };
  if (g.window) return;
  g.CustomEvent = class {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  g.window = {
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id: unknown) => clearTimeout(id as never),
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

function wait(seconds: number): Promise<void> {
  return (ScriptSandbox as unknown as { wait: (s: number) => Promise<void> }).wait(seconds);
}

describe('échelle de temps', () => {
  let ctx: ReturnType<typeof setup>;

  beforeAll(() => {
    installFakeWindow();
  });

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => {
    ScriptSandbox.setTimeScale(1);
  });

  it('convertit un delta réel en delta de jeu', () => {
    const { exec } = ctx;
    // 60 fps : 0,016 s réelles, la référence de tous les calculs ci-dessous.
    expect(exec.scaledDelta(0.016)).toBeCloseTo(0.016, 9);

    // ×2 = deux fois plus vite.
    ScriptSandbox.setTimeScale(2);
    expect(exec.simulationTimeScale).toBe(2);
    expect(exec.scaledDelta(0.016)).toBeCloseTo(0.032, 9);

    // ×0,5 = ralenti : la simulation avance deux fois moins vite.
    ScriptSandbox.setTimeScale(0.5);
    expect(exec.scaledDelta(0.016)).toBeCloseTo(0.008, 9);
  });

  it('borne le pas de simulation pour ne pas déstabiliser Rapier', () => {
    const { exec } = ctx;
    // ×10 sur une frame déjà longue imposerait un pas d'un demi-seconde :
    // on plafonne au même 0,05 s que la boucle de rendu.
    ScriptSandbox.setTimeScale(10);
    expect(exec.scaledDelta(0.05)).toBeCloseTo(0.05, 9);
    expect(exec.scaledDelta(0.2)).toBeCloseTo(0.05, 9);
  });

  it('scale les cartes de comportement, pas seulement les scripts', () => {
    const { exec, cube } = ctx;
    // Carte Patrol de vitesse 10 : 0,2 unité par frame à ×1. C'est le véhicule
    // que SetTimeScale doit ralentir — avant, seuls les scripts et les timers
    // réagissaient, pas la physique ni les cartes.
    (cube.object3D.userData as Record<string, unknown>).logic = {
      cards: [
        { type: 'Patrol', enabled: true, config: { speed: 10, axis: 'x', distance: 1000 } },
      ],
    };

    cube.object3D.position.x = 0;
    ScriptSandbox.setTimeScale(1);
    exec.update(0.02);
    expect(Math.abs(cube.object3D.position.x)).toBeCloseTo(0.2, 6);

    cube.object3D.position.x = 0;
    ScriptSandbox.setTimeScale(2);
    exec.update(0.02);
    expect(Math.abs(cube.object3D.position.x)).toBeCloseTo(0.4, 6);

    cube.object3D.position.x = 0;
    ScriptSandbox.setTimeScale(0.5);
    exec.update(0.02);
    expect(Math.abs(cube.object3D.position.x)).toBeCloseTo(0.1, 6);
  });

  it('attend plus longtemps en temps réel quand le jeu est au ralenti', async () => {
    // wait() exprime les secondes en TEMPS DE JEU : à ×0,5, 0,4 s de script
    // doivent durer 0,8 s réelles. L'ancien code multipliait le délai par
    // l'échelle au lieu de le diviser — le ralenti ACCÉLÉRAIT les coroutines.
    ScriptSandbox.setTimeScale(0.5);
    const started = Date.now();
    await wait(0.4);

    expect(Date.now() - started).toBeGreaterThanOrEqual(400);
  });

  it('accélère les coroutines au-delà de ×1', async () => {
    ScriptSandbox.setTimeScale(4);
    const started = Date.now();
    await wait(0.4);

    // 0,4 s de jeu à ×4 ≈ 0,1 s réelles (plus la granularité d'échantillonnage).
    expect(Date.now() - started).toBeLessThan(400);
  });

  it('ne fait pas expirer une attente pendant un gel', async () => {
    ScriptSandbox.setTimeScale(0);
    let done = false;
    const pending = wait(0.05).then(() => {
      done = true;
    });

    await new Promise((r) => setTimeout(r, 150));
    expect(done).toBe(false);

    // Le dégel doit laisser l'attente aboutir.
    ScriptSandbox.setTimeScale(1);
    await pending;
    expect(done).toBe(true);
  });

  it('prend en compte un changement d\'échelle en cours d\'attente', async () => {
    // L'ancien setTimeout figeait la durée au moment de l'appel : un bullet-time
    // posé pendant l'attente n'avait aucun effet sur elle.
    ScriptSandbox.setTimeScale(1);
    const started = Date.now();
    const pending = wait(1);

    await new Promise((r) => setTimeout(r, 30));
    ScriptSandbox.setTimeScale(10);
    await pending;

    expect(Date.now() - started).toBeLessThan(600);
  });
});

// ---------------------------------------------------------------------------
// Capteurs de matière : OnSurfaceEnter / OnSurfaceExit
// ---------------------------------------------------------------------------

describe('capteurs de matière', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  /**
   * Graphe « OnXxx → SetVariable(flag) » monté sur l'entité, avec un
   * `mockPhysics` pour que le nœud SetMaterial accepte de poser la matière.
   */
  function mountSurfaceProbe(exec: LogicExecutor, entity: unknown, type: NodeType, flag: string) {
    exec.physicsManager = mockPhysics();
    const sensor = gnode(type, { surface: '*' });
    const flagNode = flagNode2(flag);
    const graph = ggraph([sensor, flagNode], [gconn(sensor, 'out_flow', flagNode, 'in_flow')]);
    mountKeyboardGraph(entity, graph);
    return { sensor, graph };
  }

  it('OnSurfaceEnter se déclenche à la première définition de matière', () => {
    // Régression : `dispatchSurfaceEvent` n'était appelé NULLE PART. Les deux
    // nœuds étaient déclarés, câblables,CLEFS dans l'éditeur — et ne pouvaient
    // jamais se déclencher.
    const { exec, cube } = ctx;
    mountSurfaceProbe(exec, cube, 'OnSurfaceEnter', 'EnteredMud');

    const setMat = gnode('SetMaterial', { target: 'self', material: 'mud' });
    run(exec, cube, ggraph([setMat], []), setMat);

    expect(V(exec).EnteredMud).toBe(1);
  });

  it('OnSurfaceExit se déclenche sur le changement de matière', () => {
    const { exec, cube } = ctx;
    mountSurfaceProbe(exec, cube, 'OnSurfaceExit', 'LeftMud');

    const toMud = gnode('SetMaterial', { target: 'self', material: 'mud' });
    run(exec, cube, ggraph([toMud], []), toMud);
    expect(V(exec).LeftMud ?? 0).toBe(0);

    const toIce = gnode('SetMaterial', { target: 'self', material: 'ice' });
    run(exec, cube, ggraph([toIce], []), toIce);
    expect(V(exec).LeftMud).toBe(1);
  });

  it('ne redéclenche rien si la matière ne change pas', () => {
    const { exec, cube } = ctx;
    mountSurfaceProbe(exec, cube, 'OnSurfaceEnter', 'EnterCount');

    const toMud = gnode('SetMaterial', { target: 'self', material: 'mud' });
    run(exec, cube, ggraph([toMud], []), toMud);
    expect(V(exec).EnterCount).toBe(1);

    const again = gnode('SetMaterial', { target: 'self', material: 'mud' });
    run(exec, cube, ggraph([again], []), again);
    expect(V(exec).EnterCount).toBe(1);
  });

  it('filtre le capteur sur la matière demandée', () => {
    const { exec, cube } = ctx;
    exec.physicsManager = mockPhysics();
    const sensor = gnode('OnSurfaceEnter', { surface: 'ice' });
    const flagNode = flagNode2('EnteredIce');
    const graph = ggraph([sensor, flagNode], [gconn(sensor, 'out_flow', flagNode, 'in_flow')]);
    mountKeyboardGraph(cube, graph);

    const toMud = gnode('SetMaterial', { target: 'self', material: 'mud' });
    run(exec, cube, ggraph([toMud], []), toMud);
    expect(V(exec).EnteredIce ?? 0).toBe(0);

    const toIce = gnode('SetMaterial', { target: 'self', material: 'ice' });
    run(exec, cube, ggraph([toIce], []), toIce);
    expect(V(exec).EnteredIce).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Branches d'un événement : chaque sortie doit avoir SON marqueur de passage.
// ---------------------------------------------------------------------------

describe('indépendance des branches d\'un événement', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('chaque sortie d\'un capteur à branches déclenche sa propre action', () => {
    // OnLand déclenche out_flow, puis out_soft/out_hard, puis out_impact avec le
    // MÊME objet contexte. Le marqueur de passage vivait sur ce contexte : dès
    // que deux sorties visaient le même nœud, la seconde était ignorée. Un
    // « son d'atterrissage + particules d'impact » ne jouait donc que le son.
    const { exec, cube } = ctx;
    exec.physicsManager = mockPhysics();

    const onLand = gnode('OnLand', { minSpeed: 0, surface: '*' });
    const sound = gnode('SetVariable', { variable: 'Landed', operation: 'set', amount: 1 });
    const impact = gnode('SetVariable', { variable: 'Impacted', operation: 'set', amount: 1 });
    const graph = ggraph(
      [onLand, sound, impact],
      [
        gconn(onLand, 'out_flow', sound, 'in_flow'),
        gconn(onLand, 'out_impact', impact, 'in_flow'),
      ]
    );
    mountKeyboardGraph(cube, graph);

    // On force le dispatch du capteur : la détection d'atterrissage demande un
    // corps avec une vitesse verticale.
    (exec as unknown as { dispatchLanding: (e: unknown, impact: number) => void })
      .dispatchLanding(cube, 8);

    expect(V(exec).Landed).toBe(1);
    expect(V(exec).Impacted).toBe(1);
  });

  it('deux capteurs du même type se déclenchent tous les deux', () => {
    // executeGraphEvents boucle sur les capteurs correspondants en réutilisant
    // le contexte : le second ignorait ses propres nœuds, marqués par le premier.
    const { exec, cube } = ctx;
    const a = gnode('OnTimer', { interval: 1 });
    const b = gnode('OnTimer', { interval: 1 });
    const flagA = flagNode2('FromA');
    const flagB = flagNode2('FromB');
    const graph = ggraph(
      [a, b, flagA, flagB],
      [
        gconn(a, 'out_flow', flagA, 'in_flow'),
        gconn(b, 'out_flow', flagB, 'in_flow'),
      ]
    );
    mountKeyboardGraph(cube, graph);

    (exec as unknown as { executeGraphEvents: (e: unknown, t: string, d: unknown) => void })
      .executeGraphEvents(cube, 'OnTimer', {});

    expect(V(exec).FromA).toBe(1);
    expect(V(exec).FromB).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Timers différés : rien ne doit survivre au Stop.
// ---------------------------------------------------------------------------

describe('timers différés', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('un nœud Delay ne déclenche pas sa branche après un Stop', async () => {
    // Le setTimeout n'était pas annulé : sa branche partait au Stop puis se
    // réveillait au Play suivant, dans une session où plus rien ne l'attendait.
    const { exec, cube } = ctx;
    const delay = gnode('Delay', { duration: 0.15 });
    const flagNode = flagNode2('Delayed');
    const graph = ggraph([delay, flagNode], [gconn(delay, 'out_flow', flagNode, 'in_flow')]);
    mountKeyboardGraph(cube, graph);

    run(exec, cube, graph, delay);
    exec.stopSimulation();

    await new Promise((r) => setTimeout(r, 250));
    expect(V(exec).Delayed ?? 0).toBe(0);
  });

  it('un Delay se déclenche normalement si on ne l\'interrompt pas', async () => {
    const { exec, cube } = ctx;
    const delay = gnode('Delay', { duration: 0.05 });
    const flagNode = flagNode2('Delayed');
    const graph = ggraph([delay, flagNode], [gconn(delay, 'out_flow', flagNode, 'in_flow')]);
    mountKeyboardGraph(cube, graph);

    run(exec, cube, graph, delay);
    await new Promise((r) => setTimeout(r, 200));
    expect(V(exec).Delayed).toBe(1);
  });

  it('la pulsation d\'échelle rend toujours la taille, même après un Stop', async () => {
    // Caractérisation : la pulsation est purement cosmétique et sa restauration
    // N'EST PAS annulée au Stop (contrairement aux timers de gameplay). Annuler
    // la restitution laisserait le maillage figé à 125 % — c'est le défaut
    // qu'on cherche ici à empêcher, pas à créer.
    const { exec, cube } = ctx;
    (exec as unknown as { pulseEntity: (e: unknown) => void }).pulseEntity(cube);
    expect(cube.object3D.scale.x).toBeCloseTo(1.25, 6);

    exec.stopSimulation();
    await new Promise((r) => setTimeout(r, 250));
    expect(cube.object3D.scale.x).toBeCloseTo(1, 6);
  });
});
