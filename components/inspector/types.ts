'use client';

import type {
  SceneNode,
  TransformData,
  MaterialData,
  LightData,
  PhysicsNodeData,
  ParticleEmitterData,
  RigAnimData,
  RepeatData,
  RepeatInfo,
} from '../../types/engine';
import type { EntityLogicData, NodeGraphData } from '../../types/logic';

/**
 * types.ts — contrats partagés des sous-inspecteurs.
 *
 * Convention multi-edit : chaque section reçoit TOUS les nœuds sélectionnés
 * (`nodes[0]` = référence d'affichage) et ventile elle-même les updates
 * (préserve les valeurs relatives par objet). `mixedValue` détecte les
 * divergences pour l'indicateur "≠".
 */

/** Tous les updaters tels que page.tsx les fournit (par id). */
export interface NodeUpdaters {
  onUpdateTransform: (id: string, transform: Partial<TransformData>) => void;
  onUpdateMaterial: (id: string, material: Partial<MaterialData>) => void;
  onUpdateLight: (id: string, light: Partial<LightData>) => void;
  onUpdatePhysics?: (id: string, physics: Partial<PhysicsNodeData>) => void;
  onUpdateLogic?: (id: string, logic: Partial<EntityLogicData>) => void;
  onUpdateRigAnim?: (id: string, rig: Partial<RigAnimData>) => void;
  onUpdateRiverConfig?: (id: string, config: Record<string, unknown>) => void;
  onUpdateParticles?: (id: string, config: Partial<ParticleEmitterData>) => void;
  /** Recolore les zones d'un modèle préfabriqué (null = palette par défaut). */
  onUpdateLowPolyPalette?: (id: string, colors: string[] | null) => void;
  /** Lissage des normales (smooth shading) d'un élément 3D. */
  onToggleSmoothShading?: (id: string, smooth: boolean) => void;
  onRemoveComponent?: (id: string, kind: RemovableComponentKind) => void;
  /** Pose l'objet au sol (base du bbox au niveau du terrain ou Y=0). */
  onSnapToGround?: (id: string) => void;
  /** (Re)génère les copies de répétition (count = 0 → suppression totale). */
  onUpdateRepeat?: (id: string, config: Partial<RepeatData>) => void;
  /** Étendue locale + échelle monde : convertit superposition ⇄ espacement. */
  onGetRepeatInfo?: (id: string) => RepeatInfo | null;
}

export type RemovableComponentKind =
  | 'rigidbody'
  | 'collider'
  | 'characterController'
  | 'vehicleController'
  | 'logic'
  | 'rigAnim'
  | 'particles';

export interface SectionProps extends NodeUpdaters {
  /** Nœuds sélectionnés (≥1). nodes[0] = référence d'affichage. */
  nodes: SceneNode[];
  /** Repliage contrôlé par l'orchestrateur (défaut : déplié). */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Simulation Play active (hot-reload scripts, bannières debug). */
  isPlaying?: boolean;
}

export function firstNode(nodes: SceneNode[]): SceneNode {
  return nodes[0];
}

export function isMulti(nodes: SceneNode[]): boolean {
  return nodes.length > 1;
}

function sameValue<T>(a: T, b: T): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 1e-9;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Valeur du premier nœud + flag si les autres divergent. Liste vide → valeur indéfinie, non mixte. */
export function mixedValue<T>(
  nodes: SceneNode[],
  get: (n: SceneNode) => T
): { value: T; mixed: boolean } {
  if (nodes.length === 0) return { value: undefined as unknown as T, mixed: false };
  const value = get(nodes[0]);
  let mixed = false;
  for (let i = 1; i < nodes.length; i++) {
    if (!sameValue(get(nodes[i]), value)) {
      mixed = true;
      break;
    }
  }
  return { value, mixed };
}

export type { NodeGraphData };

/** Copie texte (presse-papiers + repli textarea). Retourne le succès. */
export function copyText(text: string): boolean {
  try {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => {});
      return true;
    }
  } catch {
    /* repli ci-dessous */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}
