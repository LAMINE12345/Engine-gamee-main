import { System, Entity } from './ECS';
import { PhysicsManager } from '../physics/PhysicsManager';

/**
 * PhysicsSystem
 * ECS System that connects Rapier.js physical simulation loop
 * to Three.js spatial components when in 'Play' mode.
 */
export class PhysicsSystem extends System {
  readonly name = 'PhysicsSystem';

  private physicsManager: PhysicsManager;

  constructor(physicsManager: PhysicsManager) {
    super();
    this.physicsManager = physicsManager;
  }

  public update(dt: number, _entities: Entity[]): void {
    if (!this.enabled || !this.physicsManager.isSimulating) {
      return;
    }

    // Step the physics world and sync all entities
    this.physicsManager.step(dt);
  }
}
