import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { NodeRestorer, isFactorySubtype, type NodeRestorePort, type RestoredNode } from '../lib/scene/nodeRestorer';

/**
 * Le restaurateur est le premier bloc extrait de `SceneManager` (8 000 lignes).
 * On le teste donc via un faux port : c'est exactement le contrat que
 * `nodeRestorePort()` doit satisfaire, et aucun DOM/Three renderer n'est requis.
 */

const dirLight = new THREE.DirectionalLight(0xffffff, 1);

interface Harness {
  port: NodeRestorePort;
  restorer: NodeRestorer;
  calls: string[];
  created: THREE.Object3D[];
  library: Map<string, THREE.Mesh>;
  pending: Array<{ item: RestoredNode; obj: THREE.Object3D }>;
}

function makeHarness(opts: { library?: string[]; attachSucceeds?: boolean } = {}): Harness {
  const calls: string[] = [];
  const created: THREE.Object3D[] = [];
  const library = new Map<string, THREE.Mesh>();
  for (const id of opts.library ?? []) {
    library.set(
      id,
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x00ff00 })
      )
    );
  }
  const pending: Array<{ item: RestoredNode; obj: THREE.Object3D }> = [];
  const objects = new Map<string, THREE.Object3D>();
  const attachSucceeds = opts.attachSucceeds !== false;

  const port: NodeRestorePort = {
    ecsWorld: { getEntity: () => undefined } as unknown as NodeRestorePort['ecsWorld'],
    dirLight,
    riverMeshes: [],
    foliagePainter: {
      createLibraryMesh: (id: string) => {
        calls.push(`createLibraryMesh:${id}`);
        const src = library.get(id);
        if (!src) throw new Error('introuvable');
        return src.clone() as THREE.Mesh;
      },
      getLibraryPalette: () => [{ color: '#ff0000' }],
      applyMeshPalette: () => {
        calls.push('applyMeshPalette');
      },
      getEntry: (id: string) => (library.has(id) ? { id } : null),
    } as unknown as NodeRestorePort['foliagePainter'],
    foliageLibraryPromise: Promise.resolve(null),
    animatorSystem: { bind: () => calls.push('animator.bind') } as unknown as NodeRestorePort['animatorSystem'],
    scene: new THREE.Scene(),
    objects,

    registerObject: (obj) => {
      created.push(obj);
      calls.push('registerObject');
    },
    addPrimitive: (type, pos, o) => {
      calls.push(`addPrimitive:${type}`);
      const obj = new THREE.Group();
      obj.userData = { subType: type };
      obj.position.set(pos.x, pos.y, pos.z);
      if (o.preserveId) {
        obj.userData.preservedId = o.preserveId;
        objects.set(o.preserveId, obj);
        return { id: o.preserveId };
      }
      const id = `prim-${objects.size}`;
      objects.set(id, obj);
      return { id };
    },
    restoreModelNode: () => calls.push('restoreModelNode'),
    adoptImportId: (obj, id) => {
      calls.push(`adoptImportId:${id ?? 'undefined'}`);
      obj.userData = { ...obj.userData, adoptedId: id };
    },
    trackImportId: (item) => {
      if (item.id) calls.push(`trackImportId:${item.id}`);
    },
    attachImportParent: () => {
      calls.push('attachImportParent');
      return attachSucceeds;
    },
    enqueuePendingParent: (item, obj) => {
      calls.push('enqueuePendingParent');
      pending.push({ item, obj });
    },
    sweepPendingParents: () => calls.push('sweepPendingParents'),
    updatePhysics: (id) => calls.push(`updatePhysics:${id}`),
    updateLogic: (id) => calls.push(`updateLogic:${id}`),
    updateParticlesConfig: (id) => calls.push(`updateParticlesConfig:${id}`),
    setRigAnim: (id) => calls.push(`setRigAnim:${id}`),
    syncECSComponents: (id) => calls.push(`syncECSComponents:${id}`),
    notifyHierarchy: () => calls.push('notifyHierarchy'),
  };

  return { port, restorer: new NodeRestorer(port), calls, created, library, pending };
}

const baseNode = (over: Partial<RestoredNode> = {}): RestoredNode =>
  ({
    id: 'node-1',
    name: 'Cube_1',
    type: 'mesh',
    subType: 'cube',
    transform: {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 90, y: 0, z: 0 },
      scale: { x: 2, y: 2, z: 2 },
    },
    visible: true,
    castShadow: true,
    receiveShadow: false,
    ...over,
  }) as RestoredNode;

describe('scene/nodeRestorer — isFactorySubtype', () => {
  it('reconnait les sous-types instancies par la factory', () => {
    for (const t of ['player', 'vehicle', 'particles', 'triggerVolume', 'checkpoint', 'spawnPoint', 'navMeshAgent']) {
      expect(isFactorySubtype(t)).toBe(true);
    }
  });

  it('rejette les sous-types géométriques et inconnus', () => {
    for (const t of ['cube', 'sphere', 'lowPoly', 'model', 'river', '']) {
      expect(isFactorySubtype(t)).toBe(false);
    }
  });
});

describe('scene/nodeRestorer — applyOverlay', () => {
  it('applique nom, transform, rotations en radians et ombres', () => {
    const { restorer } = makeHarness();
    const obj = new THREE.Mesh();

    restorer.applyOverlay(obj, baseNode());

    expect(obj.name).toBe('Cube_1');
    expect(obj.position.toArray()).toEqual([1, 2, 3]);
    expect(obj.rotation.x).toBeCloseTo(Math.PI / 2, 6);
    expect(obj.scale.toArray()).toEqual([2, 2, 2]);
    expect(obj.visible).toBe(true);
    expect(obj.castShadow).toBe(true);
    expect(obj.receiveShadow).toBe(false);
  });

  it('conserve le nom existant si le nœud sauvegardé est vide', () => {
    const { restorer } = makeHarness();
    const obj = new THREE.Mesh();
    obj.name = 'Original';

    restorer.applyOverlay(obj, baseNode({ name: '' }));

    expect(obj.name).toBe('Original');
  });

  it('propage physique / logique / prefab / repeat / collab au userData', () => {
    const { restorer, calls } = makeHarness();
    const obj = new THREE.Mesh();
    const uuid = obj.uuid;

    restorer.applyOverlay(
      obj,
      baseNode({
        physics: { mass: 5 } as unknown as RestoredNode['physics'],
        logic: { script: 'spin' } as unknown as RestoredNode['logic'],
        prefabId: 'prefab-1',
        prefabInstanceId: 'inst-1',
        repeatOf: 'src-1',
        collabId: 'collab-1',
      })
    );

    expect(calls).toContain(`updatePhysics:${uuid}`);
    expect(calls).toContain(`updateLogic:${uuid}`);
    // Le reste est porté par le userData, seule partie réellement persistée.
    expect(obj.userData.prefabId).toBe('prefab-1');
    expect(obj.userData.prefabInstanceId).toBe('inst-1');
    expect(obj.userData.repeatOf).toBe('src-1');
    expect(obj.userData.collabId).toBe('collab-1');
  });

  it('n’écrit pas physics/logic si absents du nœud', () => {
    const { restorer, calls } = makeHarness();

    restorer.applyOverlay(new THREE.Mesh(), baseNode());

    expect(calls).not.toContain('updatePhysics:undefined');
    expect(calls).not.toContain('updateLogic:undefined');
  });

  it('deep-clone repeat et spawnPoint (pas de référence partagée)', () => {
    const { restorer } = makeHarness();
    const obj = new THREE.Mesh();
    const repeat = { count: 3, axis: 'x' } as unknown as RestoredNode['repeat'];

    restorer.applyOverlay(obj, baseNode({ repeat }));
    obj.userData.repeat.count = 99;

    expect((repeat as unknown as { count: number }).count).toBe(3);
  });

  it('isole un échec de rigAnim au lieu de propager', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = makeHarness();
    (h.port as { setRigAnim: (id: string, d: unknown) => void }).setRigAnim = () => {
      throw new Error('rig cassé');
    };
    const restorer = new NodeRestorer(h.port);
    const obj = new THREE.Mesh();
    obj.name = 'Rig_Cube';

    const rigAnim = { clip: 'Idle' } as unknown as RestoredNode['rigAnim'];
    expect(() => restorer.applyOverlay(obj, baseNode({ rigAnim }))).not.toThrow();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});

describe('scene/nodeRestorer — restoreGroup', () => {
  it('délègue les modèles importés au pipeline de SceneManager', () => {
    const { restorer, calls } = makeHarness();

    const out = restorer.restoreGroup(baseNode({ type: 'group', subType: 'model' }));

    expect(out).toBeNull();
    expect(calls).toContain('restoreModelNode');
  });

  it('crée un conteneur vide pour un sous-type inconnu et le rattache', () => {
    const { restorer, calls, created } = makeHarness();

    const out = restorer.restoreGroup(baseNode({ type: 'group', subType: 'mystery' }));

    expect(out).toBeInstanceOf(THREE.Group);
    expect(out?.userData.subType).toBe('mystery');
    expect(calls).toEqual(
      expect.arrayContaining(['adoptImportId:node-1', 'registerObject', 'trackImportId:node-1'])
    );
    expect(created).toHaveLength(1);
  });

  it('utilise la factory pour un sous-type connu, en préservant l’id', () => {
    const { restorer, calls } = makeHarness();

    const out = restorer.restoreGroup(baseNode({ type: 'group', subType: 'player' }));

    expect(calls).toContain('addPrimitive:player');
    expect(out?.userData.preservedId).toBe('node-1');
  });

  it('retourne null quand la factory ne produit pas d’objet enregistré', () => {
    const { port } = makeHarness();
    (port as { addPrimitive: unknown }).addPrimitive = () => ({ id: 'fantome' });

    const out = new NodeRestorer(port).restoreGroup(baseNode({ type: 'group', subType: 'vehicle' }));

    expect(out).toBeNull();
  });

  it('n’avale pas une exception de la factory', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { port } = makeHarness();
    (port as { addPrimitive: unknown }).addPrimitive = () => {
      throw new Error('boom');
    };

    const out = new NodeRestorer(port).restoreGroup(baseNode({ type: 'group', subType: 'particles' }));

    expect(out).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('scene/nodeRestorer — restoreLowPoly', () => {
  it('clone le modèle de la bibliothèque et applique la palette sauvegardée', async () => {
    const { restorer, calls } = makeHarness({ library: ['tree_1'] });

    const out = await restorer.restoreLowPoly(
      baseNode({
        subType: 'lowPoly',
        lowPolyId: 'tree_1',
        palette: [{ color: '#00ff00', name: 'feuillage' }],
      })
    );

    expect(out).toBeInstanceOf(THREE.Mesh);
    expect(out?.userData.lowPolyId).toBe('tree_1');
    expect(calls).toContain('createLibraryMesh:tree_1');
    expect(calls).toContain('applyMeshPalette');
  });

  it('retombe sur la palette de la bibliothèque quand rien n’est sauvegardé', async () => {
    const { restorer, calls } = makeHarness({ library: ['rock_2'] });

    const out = await restorer.restoreLowPoly(baseNode({ subType: 'lowPoly', lowPolyId: 'rock_2' }));

    expect(out?.userData.palette).toEqual([{ color: '#ff0000' }]);
    expect(calls).not.toContain('applyMeshPalette');
  });

  it('déduit l’id depuis le nom d’instance des scènes anciennes', async () => {
    const { restorer, calls } = makeHarness({ library: ['tree_1'] });

    const out = await restorer.restoreLowPoly(
      baseNode({ subType: 'lowPoly', name: 'tree_1_9', lowPolyId: undefined })
    );

    expect(calls).toContain('createLibraryMesh:tree_1');
    expect(out?.userData.lowPolyId).toBe('tree_1');
  });

  it('crée un placeholder filaire si l’id est introuvable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { restorer } = makeHarness({ library: ['tree_1'] });

    const out = await restorer.restoreLowPoly(baseNode({ subType: 'lowPoly', lowPolyId: 'inconnu' }));

    expect(out).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('crée un placeholder si le nom ne correspond à aucun modèle', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = makeHarness({ library: ['tree_1'] });

    await h.restorer.restoreLowPoly(baseNode({ subType: 'lowPoly', name: 'Bateau_4' }));

    expect(h.calls).toContain('registerObject');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('applique l’offset de prefab après l’overlay', async () => {
    const { restorer } = makeHarness({ library: ['tree_1'] });

    const out = await restorer.restoreLowPoly(baseNode({ subType: 'lowPoly', lowPolyId: 'tree_1' }), {
      offset: { x: 10, y: 0, z: -5 },
    });

    expect(out?.position.toArray()).toEqual([11, 2, -2]);
  });

  it('passe par onCreated et n’enfile pas de parent (racine de prefab)', async () => {
    const { restorer, calls } = makeHarness({ library: ['tree_1'] });
    const onCreated = vi.fn();

    await restorer.restoreLowPoly(baseNode({ subType: 'lowPoly', lowPolyId: 'tree_1' }), { onCreated });

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(calls).not.toContain('attachImportParent');
    expect(calls).not.toContain('enqueuePendingParent');
  });

  it('enfile le rattachement quand le parent n’est pas résolu', async () => {
    const { restorer, calls, pending } = makeHarness({ library: ['tree_1'], attachSucceeds: false });

    await restorer.restoreLowPoly(baseNode({ subType: 'lowPoly', lowPolyId: 'tree_1' }));

    expect(calls).toContain('enqueuePendingParent');
    expect(calls).toContain('sweepPendingParents');
    expect(pending).toHaveLength(1);
  });

  it('propage le toon/outline en ECS quand ils sont sauvegardés', async () => {
    const { restorer, calls } = makeHarness({ library: ['tree_1'] });

    await restorer.restoreLowPoly(
      baseNode({
        subType: 'lowPoly',
        lowPolyId: 'tree_1',
        material: { outlineColor: '#00f', outlineThickness: 2 } as unknown as RestoredNode['material'],
      })
    );

    expect(calls.some((c) => c.startsWith('syncECSComponents:'))).toBe(true);
  });

  it('rejette un lowPolyId non-string (donnée corrompue) sans planter', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = makeHarness({ library: ['tree_1'] });

    const out = await h.restorer.restoreLowPoly(
      baseNode({ subType: 'lowPoly', lowPolyId: 42 as unknown as string })
    );

    // 42 n'est pas un string → on retombe sur la déduction par nom → placeholder.
    expect(out).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('scene/nodeRestorer — resolveLowPolyIdFromName', () => {
  it('retire les suffixes _<n> jusqu’à trouver une entrée', () => {
    const { restorer } = makeHarness({ library: ['tree_1'] });
    expect(restorer.resolveLowPolyIdFromName('tree_1_9_4')).toBe('tree_1');
  });

  it('rend undefined sans nom', () => {
    const h = makeHarness({ library: ['tree_1'] });
    expect(h.restorer.resolveLowPolyIdFromName(undefined)).toBeUndefined();
  });

  it('rend undefined quand aucun préfixe ne correspond', () => {
    const h = makeHarness({ library: ['tree_1'] });
    expect(h.restorer.resolveLowPolyIdFromName('bateau_2')).toBeUndefined();
  });

  it('rend undefined sans bibliothèque de modèles', () => {
    const h = makeHarness();
    (h.port as { foliagePainter: unknown }).foliagePainter = undefined;
    expect(new NodeRestorer(h.port).resolveLowPolyIdFromName('tree_1_9')).toBeUndefined();
  });
});
