/**
 * tests/surfacePhysics.test.ts — intégration PHYSIQUE RÉELLE (Rapier WASM).
 *
 * Les autres suites utilisent un double qui respecte le contrat Rapier ; celle-ci
 * instancie un VRAI monde Rapier et vérifie que la matière produit un
 * comportement observable et mesurable.
 *
 * Elle a déjà payé son prix : les seuils ci-dessous sont MESURÉS, pas devinés,
 * et la règle de combinaison `Min` a été imposée par ce test (avec la moyenne
 * par défaut de Rapier, « glacier » était quasi inerte).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { getSurface, resolveSurfaceProperties } from '../lib/logic/surfaceLogic';

beforeAll(async () => {
  await RAPIER.init();
});

/**
 * Reproduit fidèlement `PhysicsManager.setSurfaceProperties` : friction,
 * rebond et règles de combinaison.
 */
function applySurface(col: RAPIER.Collider, id: string) {
  const p = resolveSurfaceProperties(id, {});
  col.setFriction(p.friction);
  col.setRestitution(p.restitution);
  col.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
  col.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
  return p;
}

/** Sol statique + caisse dynamique, comme le fait `PhysicsManager`. */
function makeWorld(groundFriction: number, groundRestitution: number) {
  const world = new RAPIER.World({ x: 0, y: -18, z: 0 });
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(100, 0.1, 100)
      .setFriction(groundFriction)
      .setRestitution(groundRestitution)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max),
    ground
  );
  return world;
}

function addCrate(world: RAPIER.World, vx: number, y = 1) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, y, 0)
      .setLinvel(vx, 0, 0)
      .setCcdEnabled(true)
  );
  // Valeurs par défaut du composant Rigidbody de l'éditeur.
  const col = world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setFriction(0.5).setRestitution(0.4),
    body
  );
  return { body, col };
}

function stepFor(world: RAPIER.World, seconds: number, dt = 1 / 60) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) world.step();
}

/** Distance parcourue par une caisse lancée à 8 m/s sur une matière donnée. */
function slideDistance(surfaceId: 'ice' | 'rubber' | 'mud' | 'stone'): number {
  const props = resolveSurfaceProperties(surfaceId, {});
  const world = makeWorld(props.friction, props.restitution);
  const crate = addCrate(world, 8);
  stepFor(world, 0.3); // l'asseoir au sol avant de mesurer
  applySurface(crate.col, surfaceId);
  crate.body.setLinearDamping(props.linearDamping);
  const start = crate.body.translation().x;
  stepFor(world, 0.5);
  return Math.abs(crate.body.translation().x - start);
}

/** Hauteur atteinte au premier rebond d'une caisse lâchée de 4 m. */
function bounceApex(surfaceId: 'rubber' | 'mud' | 'stone'): number {
  const props = resolveSurfaceProperties(surfaceId, {});
  const world = makeWorld(props.friction, props.restitution);
  const crate = addCrate(world, 0, 4);
  let landed = false;
  let apex = 0;
  for (let i = 0; i < 400; i++) {
    world.step();
    const y = crate.body.translation().y;
    if (!landed) {
      // Le repos est à 0.5 : on bascule la mesure sous 0.75.
      if (y < 0.75) landed = true;
    } else if (y > apex) {
      apex = y;
    }
  }
  return apex;
}

describe('matières — intégration Rapier réelle', () => {
  it('la friction est modifiable sur un collier déjà simulé', () => {
    const world = makeWorld(0.8, 0.4);
    const { col } = addCrate(world, 0);
    stepFor(world, 0.2);

    // C'est exactement le moment où le jeu exécute un nœud SetSurface :
    // le corps existe et tourne déjà.
    const props = resolveSurfaceProperties('ice', {});
    col.setFriction(props.friction);
    expect(col.friction()).toBeCloseTo(0.02, 6);
  });

  it('une caisse glisse sur la glace bien plus loin que sur le caoutchouc', () => {
    // Valeurs mesurées : glace 3.92, caoutchouc 1.87 (0,5 s à 8 m/s).
    const ice = slideDistance('ice');
    const rubber = slideDistance('rubber');

    expect(ice).toBeGreaterThan(2.5);
    expect(rubber).toBeLessThan(2.5);
    expect(ice).toBeGreaterThan(rubber * 1.5);
  });

  it('la boue freine nettement plus que la pierre', () => {
    // Mesuré : boue 0.95, pierre 1.65. La traînée fait la différence.
    const mud = slideDistance('mud');
    const stone = slideDistance('stone');
    expect(mud).toBeLessThan(stone * 0.8);
  });

  it('le caoutchouc fait rebondir, la boue et la pierre non', () => {
    // Mesuré : caoutchouc 2.89, boue/pierre 1.07 (= simple rebond résiduel).
    const rubber = bounceApex('rubber');
    const mud = bounceApex('mud');
    const stone = bounceApex('stone');

    expect(rubber).toBeGreaterThan(2);
    expect(mud).toBeLessThan(1.4);
    expect(stone).toBeLessThan(1.4);
    expect(rubber).toBeGreaterThan(mud * 1.5);
  });

  it('une masse quasi nulle ne déstabilise pas le solveur', () => {
    const world = makeWorld(0.8, 0.4);
    const { body } = addCrate(world, 0);
    // setBodyMass borne à 0.001 : Rapier refuse 0 et les valeurs négatives.
    body.setAdditionalMass(0.001 - body.mass(), true);
    expect(body.mass()).toBeGreaterThan(0);
    expect(() => stepFor(world, 0.5)).not.toThrow();
    expect(Number.isFinite(body.translation().y)).toBe(true);
  });
});

describe('presets — cohérence et robustesse', () => {
  it('glace très glissante, caoutchouc très accrocheur', () => {
    expect(getSurface('ice').friction).toBeLessThan(0.05);
    expect(getSurface('rubber').friction).toBeGreaterThan(1);
    expect(getSurface('rubber').restitution).toBeGreaterThan(0.8);
    expect(getSurface('mud').restitution).toBe(0);
  });

  it('toutes les matières ont des valeurs physiques exploitables', () => {
    for (const id of Object.keys(getSurface('default'))) void id;
    for (const id of [
      'default', 'ice', 'rubber', 'mud', 'sand',
      'metal', 'wood', 'stone', 'sponge', 'ice_cream',
    ] as const) {
      const s = getSurface(id);
      expect(s.friction, id).toBeGreaterThanOrEqual(0);
      expect(s.restitution, id).toBeGreaterThanOrEqual(0);
      expect(s.restitution, id).toBeLessThanOrEqual(1);
      expect(s.traction, id).toBeGreaterThan(0);
      expect(s.stepSound, id).toBeTruthy();
    }
  });

  it('un identifiant inconnu retombe sur Standard sans planter', () => {
    const s = getSurface('inexistant');
    expect(s.id).toBe('default');
    expect(s.friction).toBeGreaterThan(0);
  });

  it('les surcharges du panneau écrasent le preset', () => {
    const p = resolveSurfaceProperties('ice', { friction: 0.8, restitution: 0.9 });
    expect(p.friction).toBeCloseTo(0.8, 6);
    expect(p.restitution).toBeCloseTo(0.9, 6);
  });

  it('les valeurs négatives ou invalides sont rejetées', () => {
    const p = resolveSurfaceProperties('default', {
      friction: -3,
      restitution: Number.NaN,
    });
    expect(p.friction).toBe(0); // bornée à 0
    expect(p.restitution).toBe(getSurface('default').restitution); // preset conservé
  });
});
