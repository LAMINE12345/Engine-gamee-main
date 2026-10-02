import {
  BehaviorCard,
  BuoyantConfig,
  CollectableConfig,
  DamageOnTouchConfig,
  GraphConnection,
  GraphNodeData,
  NavMeshAgentConfig,
  NodeGraphData,
  NodeType,
  PatrolConfig,
  Socket,
  TriggerVolumeBehaviorConfig,
  TriggerZoneConfig,
} from '../../types/logic';

/**
 * Generates Socket definitions for each NodeType
 */
export function getSocketsForNodeType(type: NodeType): { inputs: Socket[]; outputs: Socket[] } {
  switch (type) {
    // Events
    case 'OnStart':
      return {
        inputs: [],
        outputs: [{ id: 'out_flow', name: 'Exec', type: 'flow' }],
      };
    case 'OnUpdate':
      return {
        inputs: [],
        outputs: [
          { id: 'out_flow', name: 'Exec', type: 'flow' },
          { id: 'out_dt', name: 'Delta (dt)', type: 'number' },
        ],
      };
    case 'OnCollision':
      return {
        inputs: [],
        outputs: [
          { id: 'out_flow', name: 'Exec', type: 'flow' },
          { id: 'out_other', name: 'Other', type: 'entity' },
        ],
      };
    case 'OnKeyPress':
      return {
        inputs: [],
        outputs: [
          { id: 'out_flow', name: 'Pressed', type: 'flow' },
          { id: 'out_key', name: 'Touche', type: 'string' },
        ],
      };
    case 'OnKeyRelease':
      return {
        inputs: [],
        outputs: [
          { id: 'out_flow', name: 'Released', type: 'flow' },
          { id: 'out_key', name: 'Touche', type: 'string' },
        ],
      };
    case 'IsKeyDown':
      return {
        inputs: [
          { id: 'in_flow', name: 'Vérifier', type: 'flow' },
        ],
        outputs: [
          { id: 'out_down', name: 'Enfoncé', type: 'boolean' },
          { id: 'out_up', name: 'Relâché', type: 'boolean' },
        ],
      };
    case 'ReadMoveAxis':
      return {
        inputs: [
          { id: 'in_flow', name: 'Lire', type: 'flow' },
        ],
        outputs: [
          { id: 'out_forward', name: 'Avant', type: 'number' },
          { id: 'out_right', name: 'Latéral', type: 'number' },
          { id: 'out_sprint', name: 'Sprint', type: 'number' },
          { id: 'out_moving', name: 'En Mouvement', type: 'boolean' },
        ],
      };
    case 'MoveByAxis':
      return {
        inputs: [
          { id: 'in_flow', name: 'Déplacer', type: 'flow' },
          { id: 'in_forward', name: 'Avant', type: 'number' },
          { id: 'in_right', name: 'Latéral', type: 'number' },
          { id: 'in_sprint', name: 'Sprint', type: 'number' },
        ],
        outputs: [
          { id: 'out_flow', name: 'Then', type: 'flow' },
          { id: 'out_moved', name: 'A Bougé', type: 'flow' },
          { id: 'out_stopped', name: 'À l\'Arrêt', type: 'flow' },
          { id: 'out_speed', name: 'Vitesse', type: 'number' },
        ],
      };
    // Matières & propriétés physiques (valeurs calibrées sur la réalité)
    case 'SetSurface':
      return {
        inputs: [
          { id: 'in_flow', name: 'Appliquer', type: 'flow' },
          { id: 'in_target', name: 'Cible', type: 'entity' },
          { id: 'in_friction', name: 'Friction', type: 'number' },
          { id: 'in_restitution', name: 'Rebond', type: 'number' },
          { id: 'in_mass', name: 'Masse', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'SetMaterial':
      return {
        inputs: [
          { id: 'in_flow', name: 'Appliquer', type: 'flow' },
          { id: 'in_target', name: 'Cible', type: 'entity' },
        ],
        outputs: [
          { id: 'out_flow', name: 'Then', type: 'flow' },
          { id: 'out_traction', name: 'Traction', type: 'number' },
        ],
      };
    case 'SetGravity':
      return {
        inputs: [
          { id: 'in_flow', name: 'Appliquer', type: 'flow' },
          { id: 'in_target', name: 'Cible', type: 'entity' },
          { id: 'in_scale', name: 'Échelle', type: 'number' },
        ],
        outputs: [
          { id: 'out_flow', name: 'Then', type: 'flow' },
          { id: 'out_weight', name: 'Poids', type: 'number' },
        ],
      };
    case 'SetDrag':
      return {
        inputs: [
          { id: 'in_flow', name: 'Appliquer', type: 'flow' },
          { id: 'in_target', name: 'Cible', type: 'entity' },
          { id: 'in_linear', name: 'Traînée', type: 'number' },
        ],
        outputs: [
          { id: 'out_flow', name: 'Then', type: 'flow' },
          { id: 'out_drag', name: 'Traînée', type: 'number' },
        ],
      };
    case 'SetTimeScale':
      return {
        inputs: [
          { id: 'in_flow', name: 'Appliquer', type: 'flow' },
          { id: 'in_scale', name: 'Échelle', type: 'number' },
        ],
        outputs: [
          { id: 'out_flow', name: 'Then', type: 'flow' },
          { id: 'out_scale', name: 'Échelle', type: 'number' },
        ],
      };

    // Effets sensoriels
    case 'FootstepSound':
      return {
        inputs: [
          { id: 'in_flow', name: 'Jouer', type: 'flow' },
          { id: 'in_surface', name: 'Matière', type: 'string' },
          { id: 'in_volume', name: 'Volume', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'HitStop':
      return {
        inputs: [
          { id: 'in_flow', name: 'Geler', type: 'flow' },
          { id: 'in_duration', name: 'Durée (s)', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'Rumble':
      return {
        inputs: [
          { id: 'in_flow', name: 'Rumble', type: 'flow' },
          { id: 'in_intensity', name: 'Intensité', type: 'number' },
          { id: 'in_duration', name: 'Durée (s)', type: 'number' },
        ],
        outputs: [
          { id: 'out_flow', name: 'Then', type: 'flow' },
          { id: 'out_stop', name: 'Fin', type: 'flow' },
        ],
      };
    case 'SlowFollow':
      return {
        inputs: [
          { id: 'in_flow', name: 'Activer', type: 'flow' },
          { id: 'in_target', name: 'Cible', type: 'entity' },
          { id: 'in_smoothing', name: 'Retard', type: 'number' },
          { id: 'in_lookAhead', name: 'Avance', type: 'number' },
        ],
        outputs: [
          { id: 'out_flow', name: 'Then', type: 'flow' },
          { id: 'out_lag', name: 'Retard', type: 'number' },
        ],
      };

    // Capteurs physiques
    case 'OnLand':
      return {
        inputs: [
          { id: 'in_minSpeed', name: 'Vitesse min', type: 'number' },
          { id: 'in_surface', name: 'Matière', type: 'string' },
        ],
        outputs: [
          { id: 'out_flow', name: 'Atterrissage', type: 'flow' },
          { id: 'out_soft', name: 'Doux', type: 'flow' },
          { id: 'out_hard', name: 'Violent', type: 'flow' },
          { id: 'out_impact', name: 'Force', type: 'number' },
        ],
      };
    case 'OnSurfaceEnter':
      return {
        inputs: [{ id: 'in_surface', name: 'Matière', type: 'string' }],
        outputs: [
          { id: 'out_flow', name: 'Entrée', type: 'flow' },
          { id: 'out_surface', name: 'Matière', type: 'string' },
        ],
      };
    case 'OnSurfaceExit':
      return {
        inputs: [{ id: 'in_surface', name: 'Matière', type: 'string' }],
        outputs: [
          { id: 'out_flow', name: 'Sortie', type: 'flow' },
          { id: 'out_surface', name: 'Matière', type: 'string' },
        ],
      };

    case 'OnClick':
      return {
        inputs: [],
        outputs: [{ id: 'out_flow', name: 'Clicked', type: 'flow' }],
      };
    case 'OnTriggerEnter':
      return {
        inputs: [],
        outputs: [
          { id: 'out_flow', name: 'Enter', type: 'flow' },
          { id: 'out_target', name: 'Target', type: 'entity' },
        ],
      };
    case 'OnTriggerExit':
      return {
        inputs: [],
        outputs: [
          { id: 'out_flow', name: 'Exit', type: 'flow' },
          { id: 'out_target', name: 'Target', type: 'entity' },
        ],
      };
    case 'OnTimer':
      return {
        inputs: [],
        outputs: [{ id: 'out_flow', name: 'Tick', type: 'flow' }],
      };
    case 'OnCustomEvent':
      return {
        inputs: [],
        outputs: [
          { id: 'out_flow', name: 'Received', type: 'flow' },
          { id: 'out_data', name: 'Data', type: 'string' },
        ],
      };

    // Logic & Math
    case 'IfElse':
      return {
        inputs: [
          { id: 'in_flow', name: 'Exec', type: 'flow' },
          { id: 'in_cond', name: 'Condition', type: 'boolean' },
        ],
        outputs: [
          { id: 'out_true', name: 'Vrai (True)', type: 'flow' },
          { id: 'out_false', name: 'Faux (False)', type: 'flow' },
        ],
      };
    case 'Compare':
      return {
        inputs: [
          { id: 'in_a', name: 'A', type: 'number' },
          { id: 'in_b', name: 'B', type: 'number' },
        ],
        outputs: [{ id: 'out_result', name: 'Result', type: 'boolean' }],
      };
    case 'Gate':
      return {
        inputs: [
          { id: 'in_a', name: 'A', type: 'boolean' },
          { id: 'in_b', name: 'B', type: 'boolean' },
        ],
        outputs: [{ id: 'out_result', name: 'Result', type: 'boolean' }],
      };
    case 'Math':
      return {
        inputs: [
          { id: 'in_a', name: 'A', type: 'number' },
          { id: 'in_b', name: 'B', type: 'number' },
        ],
        outputs: [{ id: 'out_result', name: 'Result', type: 'number' }],
      };
    case 'Clamp':
      return {
        inputs: [
          { id: 'in_val', name: 'Val', type: 'number' },
          { id: 'in_min', name: 'Min', type: 'number' },
          { id: 'in_max', name: 'Max', type: 'number' },
        ],
        outputs: [{ id: 'out_val', name: 'Clamped', type: 'number' }],
      };
    case 'Lerp':
      return {
        inputs: [
          { id: 'in_a', name: 'A', type: 'number' },
          { id: 'in_b', name: 'B', type: 'number' },
          { id: 'in_t', name: 'Alpha (t)', type: 'number' },
        ],
        outputs: [{ id: 'out_val', name: 'Result', type: 'number' }],
      };
    case 'Random':
      return {
        inputs: [
          { id: 'in_min', name: 'Min', type: 'number' },
          { id: 'in_max', name: 'Max', type: 'number' },
        ],
        outputs: [{ id: 'out_val', name: 'Value', type: 'number' }],
      };
    case 'Toggle':
      return {
        inputs: [{ id: 'in_flow', name: 'Toggle', type: 'flow' }],
        outputs: [
          { id: 'out_on', name: 'On', type: 'flow' },
          { id: 'out_off', name: 'Off', type: 'flow' },
          { id: 'out_state', name: 'State', type: 'boolean' },
        ],
      };
    case 'Counter':
      return {
        inputs: [
          { id: 'in_inc', name: 'Increment', type: 'flow' },
          { id: 'in_reset', name: 'Reset', type: 'flow' },
        ],
        outputs: [
          { id: 'out_flow', name: 'Then', type: 'flow' },
          { id: 'out_count', name: 'Count', type: 'number' },
        ],
      };
    case 'Delay':
      return {
        inputs: [
          { id: 'in_flow', name: 'Start', type: 'flow' },
          { id: 'in_duration', name: 'Seconds', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Completed', type: 'flow' }],
      };

    // Actions & Transform & FX
    case 'ApplyImpulse':
      return {
        inputs: [
          { id: 'in_flow', name: 'Exec', type: 'flow' },
          { id: 'in_target', name: 'Target', type: 'entity' },
          { id: 'in_force', name: 'Force', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'SetPosition':
      return {
        inputs: [
          { id: 'in_flow', name: 'Exec', type: 'flow' },
          { id: 'in_x', name: 'X', type: 'number' },
          { id: 'in_y', name: 'Y', type: 'number' },
          { id: 'in_z', name: 'Z', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'SetRotation':
      return {
        inputs: [
          { id: 'in_flow', name: 'Exec', type: 'flow' },
          { id: 'in_x', name: 'Rot X', type: 'number' },
          { id: 'in_y', name: 'Rot Y', type: 'number' },
          { id: 'in_z', name: 'Rot Z', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'SetScale':
      return {
        inputs: [
          { id: 'in_flow', name: 'Exec', type: 'flow' },
          { id: 'in_scale', name: 'Scale', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'SetColor':
      return {
        inputs: [
          { id: 'in_flow', name: 'Exec', type: 'flow' },
          { id: 'in_color', name: 'Color', type: 'string' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'PlaySound':
      return {
        inputs: [{ id: 'in_flow', name: 'Exec', type: 'flow' }],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'DestroyEntity':
      return {
        inputs: [
          { id: 'in_flow', name: 'Exec', type: 'flow' },
          { id: 'in_target', name: 'Target', type: 'entity' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'SetVariable':
      return {
        inputs: [
          { id: 'in_flow', name: 'Exec', type: 'flow' },
          { id: 'in_val', name: 'Value', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'GetVariable':
      return {
        inputs: [],
        outputs: [{ id: 'out_val', name: 'Value', type: 'number' }],
      };
    case 'PlayAnimation':
      return {
        inputs: [
          { id: 'in_flow', name: 'Play', type: 'flow' },
          { id: 'in_target', name: 'Target', type: 'entity' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'ReverseAnimation':
      return {
        inputs: [
          { id: 'in_flow', name: 'Reverse', type: 'flow' },
          { id: 'in_target', name: 'Target', type: 'entity' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'PauseAnimation':
      return {
        inputs: [
          { id: 'in_flow', name: 'Pause', type: 'flow' },
          { id: 'in_target', name: 'Target', type: 'entity' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'SpawnPrefab':
      return {
        inputs: [
          { id: 'in_flow', name: 'Spawn', type: 'flow' },
          { id: 'in_pos', name: 'Position', type: 'vector' },
        ],
        outputs: [
          { id: 'out_flow', name: 'Spawned', type: 'flow' },
          { id: 'out_entity', name: 'Entity', type: 'entity' },
        ],
      };
    case 'PrintLog':
      return {
        inputs: [
          { id: 'in_flow', name: 'Exec', type: 'flow' },
          { id: 'in_msg', name: 'Message', type: 'string' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'CameraShake':
      return {
        inputs: [
          { id: 'in_flow', name: 'Exec', type: 'flow' },
          { id: 'in_intensity', name: 'Intensity', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'EmitParticles':
      return {
        inputs: [
          { id: 'in_flow', name: 'Emit', type: 'flow' },
          { id: 'in_target', name: 'Target', type: 'entity' },
          { id: 'in_rate', name: 'Rate', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'ExplosionFX':
      return {
        inputs: [
          { id: 'in_flow', name: 'Explode', type: 'flow' },
          { id: 'in_target', name: 'Target', type: 'entity' },
          { id: 'in_scale', name: 'Scale', type: 'number' },
          { id: 'in_force', name: 'Force', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'StopParticles':
      return {
        inputs: [
          { id: 'in_flow', name: 'Stop', type: 'flow' },
          { id: 'in_target', name: 'Target', type: 'entity' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'ShootProjectile':
      return {
        inputs: [
          { id: 'in_flow', name: 'Shoot', type: 'flow' },
          { id: 'in_speed', name: 'Vitesse (Speed)', type: 'number' },
          { id: 'in_damage', name: 'Dégâts (Damage)', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };

    // AI & NPC Navigation Nodes
    case 'FollowTarget':
      return {
        inputs: [
          { id: 'in_flow', name: 'Follow', type: 'flow' },
          { id: 'in_target', name: 'Target', type: 'entity' },
          { id: 'in_speed', name: 'Vitesse', type: 'number' },
          { id: 'in_stop', name: 'Stop Dist', type: 'number' },
        ],
        outputs: [
          { id: 'out_flow', name: 'Then', type: 'flow' },
          { id: 'out_reached', name: 'Atteint', type: 'boolean' },
        ],
      };
    case 'PatrolWaypoints':
      return {
        inputs: [
          { id: 'in_flow', name: 'Patrouiller', type: 'flow' },
          { id: 'in_speed', name: 'Vitesse', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'CheckDistance':
      return {
        inputs: [
          { id: 'in_flow', name: 'Verifier', type: 'flow' },
          { id: 'in_target', name: 'Cible', type: 'entity' },
          { id: 'in_thresh', name: 'Seuil', type: 'number' },
        ],
        outputs: [
          { id: 'out_range', name: 'En Portée', type: 'boolean' },
          { id: 'out_dist', name: 'Distance', type: 'number' },
        ],
      };
    case 'LookAtPlayer':
      return {
        inputs: [
          { id: 'in_flow', name: 'Regarder', type: 'flow' },
          { id: 'in_target', name: 'Cible', type: 'entity' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };

    // Dynamic Lighting Nodes
    case 'SetLightColor':
      return {
        inputs: [
          { id: 'in_flow', name: 'Exec', type: 'flow' },
          { id: 'in_color', name: 'Couleur', type: 'string' },
          { id: 'in_intensity', name: 'Intensité', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'PulseLight':
      return {
        inputs: [
          { id: 'in_flow', name: 'Pulsar', type: 'flow' },
          { id: 'in_freq', name: 'Fréquence', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'FlickerLight':
      return {
        inputs: [
          { id: 'in_flow', name: 'Scintiller', type: 'flow' },
          { id: 'in_speed', name: 'Vitesse', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };

    // Cinematics & Dialogue
    case 'SwitchCamera':
      return {
        inputs: [
          { id: 'in_flow', name: 'Basculer', type: 'flow' },
          { id: 'in_cam', name: 'Caméra Cible', type: 'string' },
          { id: 'in_blend', name: 'Durée Fondu (s)', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'ShowDialogue':
      return {
        inputs: [
          { id: 'in_flow', name: 'Afficher', type: 'flow' },
          { id: 'in_speaker', name: 'Locuteur', type: 'string' },
          { id: 'in_text', name: 'Texte Dialogue', type: 'string' },
          { id: 'in_duration', name: 'Durée (s)', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'SetDepthOfField':
      return {
        inputs: [
          { id: 'in_flow', name: 'Appliquer', type: 'flow' },
          { id: 'in_blur', name: 'Flou Dof (%)', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };

    // Spatial Audio & BGM
    case 'PlaySound3D':
      return {
        inputs: [
          { id: 'in_flow', name: 'Jouer 3D', type: 'flow' },
          { id: 'in_sfx', name: 'Type Son (engine/torch/etc)', type: 'string' },
          { id: 'in_maxdist', name: 'Portée Max (m)', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'PlaySFX':
      return {
        inputs: [
          { id: 'in_flow', name: 'Jouer SFX', type: 'flow' },
          { id: 'in_type', name: 'Type (jump/laser/coin/etc)', type: 'string' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'SetBGMState':
      return {
        inputs: [
          { id: 'in_flow', name: 'Définir BGM', type: 'flow' },
          { id: 'in_mode', name: 'Mode (exploration/combat/off)', type: 'string' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };

    // Enemy AI, Health & Inventory
    case 'CheckEnemyVision':
      return {
        inputs: [
          { id: 'in_flow', name: 'Vérifier', type: 'flow' },
          { id: 'in_fov', name: 'Angle Cône (Deg)', type: 'number' },
          { id: 'in_range', name: 'Portée Vue (m)', type: 'number' },
        ],
        outputs: [
          { id: 'out_seen', name: 'Si Vu', type: 'flow' },
          { id: 'out_hidden', name: 'Si Caché', type: 'flow' },
        ],
      };
    case 'DealDamage':
      return {
        inputs: [
          { id: 'in_flow', name: 'Infliger', type: 'flow' },
          { id: 'in_dmg', name: 'Montant Dégâts', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'CheckInventory':
      return {
        inputs: [
          { id: 'in_flow', name: 'Vérifier Clé', type: 'flow' },
          { id: 'in_item', name: 'Nom Item / Clé', type: 'string' },
        ],
        outputs: [
          { id: 'out_has', name: 'Possédé', type: 'flow' },
          { id: 'out_none', name: 'Non Possédé', type: 'flow' },
        ],
      };
    case 'AddItem':
      return {
        inputs: [
          { id: 'in_flow', name: 'Exec', type: 'flow' },
          { id: 'in_item', name: 'Nom Item', type: 'string' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'RemoveItem':
      return {
        inputs: [
          { id: 'in_flow', name: 'Exec', type: 'flow' },
          { id: 'in_item', name: 'Nom Item', type: 'string' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'OnProximity':
      return {
        inputs: [
          { id: 'in_dist', name: 'Distance (m)', type: 'number' },
        ],
        outputs: [
          { id: 'out_near', name: 'À Proximité', type: 'flow' },
          { id: 'out_far', name: 'Éloigné', type: 'flow' },
        ],
      };
    case 'UnlockDoor':
      return {
        inputs: [
          { id: 'in_flow', name: 'Déverrouiller', type: 'flow' },
        ],
        outputs: [{ id: 'out_flow', name: 'Ouvert', type: 'flow' }],
      };

    // Environmental Physics Nodes (Vent, Feu, Pluie)
    case 'OnWindGust':
      return {
        inputs: [],
        outputs: [
          { id: 'out_flow', name: 'Rafale', type: 'flow' },
          { id: 'out_speed', name: 'Vitesse (km/h)', type: 'number' },
        ],
      };
    case 'OnIgnite':
      return {
        inputs: [],
        outputs: [
          { id: 'out_flow', name: 'Enflammé', type: 'flow' },
          { id: 'out_target', name: 'Entité', type: 'entity' },
        ],
      };
    case 'OnExtinguish':
      return {
        inputs: [],
        outputs: [
          { id: 'out_flow', name: 'Éteint', type: 'flow' },
          { id: 'out_target', name: 'Entité', type: 'entity' },
        ],
      };
    case 'OnRainStart':
      return {
        inputs: [],
        outputs: [
          { id: 'out_flow', name: 'Début Pluie', type: 'flow' },
          { id: 'out_intensity', name: 'Intensité', type: 'number' },
        ],
      };
    case 'OnRainStop':
      return {
        inputs: [],
        outputs: [{ id: 'out_flow', name: 'Fin Pluie', type: 'flow' }],
      };
    case 'SetWind':
      return {
        inputs: [
          { id: 'in_flow', name: 'Définir', type: 'flow' },
          { id: 'in_speed', name: 'Vitesse (km/h)', type: 'number' },
          { id: 'in_gust', name: 'Rafales (0-1)', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'ApplyWindForce':
      return {
        inputs: [
          { id: 'in_flow', name: 'Pousser', type: 'flow' },
          { id: 'in_target', name: 'Cible', type: 'entity' },
          { id: 'in_force', name: 'Force (N)', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'GetWind':
      return {
        inputs: [{ id: 'in_flow', name: 'Mesurer', type: 'flow' }],
        outputs: [
          { id: 'out_val', name: 'Vitesse (km/h)', type: 'number' },
          { id: 'out_dir', name: 'Direction', type: 'vector' },
        ],
      };
    case 'IgniteEntity':
      return {
        inputs: [
          { id: 'in_flow', name: 'Enflammer', type: 'flow' },
          { id: 'in_target', name: 'Cible', type: 'entity' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'ExtinguishEntity':
      return {
        inputs: [
          { id: 'in_flow', name: 'Éteindre', type: 'flow' },
          { id: 'in_target', name: 'Cible', type: 'entity' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'CheckIsBurning':
      return {
        inputs: [
          { id: 'in_flow', name: 'Vérifier', type: 'flow' },
          { id: 'in_target', name: 'Cible', type: 'entity' },
        ],
        outputs: [
          { id: 'out_true', name: 'En Feu', type: 'flow' },
          { id: 'out_false', name: 'Éteint', type: 'flow' },
        ],
      };
    case 'SetRain':
      return {
        inputs: [
          { id: 'in_flow', name: 'Contrôler', type: 'flow' },
          { id: 'in_intensity', name: 'Intensité (0-1)', type: 'number' },
          { id: 'in_size', name: 'Taille Gouttes (0.2-3)', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'CheckIsRaining':
      return {
        inputs: [{ id: 'in_flow', name: 'Vérifier', type: 'flow' }],
        outputs: [
          { id: 'out_true', name: 'Pluie Active', type: 'flow' },
          { id: 'out_false', name: 'Temps Sec', type: 'flow' },
        ],
      };

    // ==========================================
    // PACK UNIVERSEL — cycle de vie, états de jeu, arcade, progression, caméra
    // ==========================================
    case 'OnDeath':
      return {
        inputs: [],
        outputs: [{ id: 'out_flow', name: 'Mort (Santé = 0)', type: 'flow' }],
      };
    case 'TakeDamage':
      return {
        inputs: [
          { id: 'in_flow', name: 'Subir', type: 'flow' },
          { id: 'in_amount', name: 'Dégâts', type: 'number' },
        ],
        outputs: [
          { id: 'out_flow', name: 'Then', type: 'flow' },
          { id: 'out_defeated', name: 'Vaincu (PV = 0)', type: 'flow' },
        ],
      };
    case 'Heal':
      return {
        inputs: [
          { id: 'in_flow', name: 'Soigner', type: 'flow' },
          { id: 'in_amount', name: 'Soin', type: 'number' },
        ],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'Respawn':
      return {
        inputs: [{ id: 'in_flow', name: 'Réapparaître', type: 'flow' }],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'Checkpoint':
      return {
        inputs: [{ id: 'in_flow', name: 'Mémoriser', type: 'flow' }],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'WinGame':
      return {
        inputs: [{ id: 'in_flow', name: 'Victoire !', type: 'flow' }],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'LoseGame':
      return {
        inputs: [{ id: 'in_flow', name: 'Défaite...', type: 'flow' }],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'RestartLevel':
      return {
        inputs: [{ id: 'in_flow', name: 'Recommencer', type: 'flow' }],
        outputs: [{ id: 'out_flow', name: 'Niveau Relancé', type: 'flow' }],
      };
    case 'PauseGame':
      return {
        inputs: [{ id: 'in_flow', name: 'Pause', type: 'flow' }],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'ResumeGame':
      return {
        inputs: [{ id: 'in_flow', name: 'Reprendre', type: 'flow' }],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'Countdown':
      return {
        inputs: [{ id: 'in_flow', name: 'Tick (via OnUpdate)', type: 'flow' }],
        outputs: [
          { id: 'out_flow', name: 'Tick', type: 'flow' },
          { id: 'out_remaining', name: 'Restant (s)', type: 'number' },
          { id: 'out_finished', name: 'Terminé !', type: 'flow' },
        ],
      };
    case 'MoveTowards':
      return {
        inputs: [
          { id: 'in_flow', name: 'Avancer', type: 'flow' },
          { id: 'in_speed', name: 'Vitesse', type: 'number' },
        ],
        outputs: [
          { id: 'out_flow', name: 'Then', type: 'flow' },
          { id: 'out_arrived', name: 'Arrivé', type: 'flow' },
        ],
      };
    case 'FleeFrom':
      return {
        inputs: [{ id: 'in_flow', name: 'Fuir', type: 'flow' }],
        outputs: [
          { id: 'out_flow', name: 'Then', type: 'flow' },
          { id: 'out_safe', name: 'En Sécurité', type: 'flow' },
        ],
      };
    case 'Wander':
      return {
        inputs: [{ id: 'in_flow', name: 'Errer', type: 'flow' }],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'MeleeAttack':
      return {
        inputs: [{ id: 'in_flow', name: 'Frapper', type: 'flow' }],
        outputs: [
          { id: 'out_flow', name: 'Then', type: 'flow' },
          { id: 'out_hit', name: 'Touché !', type: 'flow' },
        ],
      };
    case 'ShowMessage':
      return {
        inputs: [{ id: 'in_flow', name: 'Afficher', type: 'flow' }],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
    case 'SaveGame':
      return {
        inputs: [{ id: 'in_flow', name: 'Sauvegarder', type: 'flow' }],
        outputs: [
          { id: 'out_flow', name: 'Then', type: 'flow' },
          { id: 'out_saved', name: 'Sauvegardé', type: 'flow' },
        ],
      };
    case 'LoadGame':
      return {
        inputs: [{ id: 'in_flow', name: 'Charger', type: 'flow' }],
        outputs: [
          { id: 'out_flow', name: 'Then', type: 'flow' },
          { id: 'out_missing', name: 'Aucune Sauvegarde', type: 'flow' },
        ],
      };
    case 'ToggleVisibility':
      return {
        inputs: [{ id: 'in_flow', name: 'Basculer', type: 'flow' }],
        outputs: [
          { id: 'out_shown', name: 'Visible', type: 'flow' },
          { id: 'out_hidden', name: 'Caché', type: 'flow' },
        ],
      };
    case 'CameraFollow':
      return {
        inputs: [{ id: 'in_flow', name: 'Suivre', type: 'flow' }],
        outputs: [{ id: 'out_flow', name: 'Then', type: 'flow' }],
      };
  }
}

/**
 * Creates a default GraphNode with standard sockets and initial values
 */
export function createGraphNode(
  type: NodeType,
  x: number,
  y: number,
  initialValues: Record<string, any> = {}
): GraphNodeData {
  const { inputs, outputs } = getSocketsForNodeType(type);
  const id = `node_${type.toLowerCase()}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  let category: GraphNodeData['category'] = 'action';
  if (type.startsWith('On')) category = 'event';
  else if (['IfElse', 'Compare', 'Gate', 'Math', 'Clamp', 'Lerp', 'Random', 'Toggle', 'Counter', 'Delay', 'IsKeyDown', 'ReadMoveAxis'].includes(type)) category = 'logic';

  let title: string = type;
  // Events
  if (type === 'OnStart') title = 'Au Lancement (Start)';
  if (type === 'OnUpdate') title = 'À Chaque Frame (Update)';
  if (type === 'OnCollision') title = 'Sur Collision';
  if (type === 'OnClick') title = 'Sur Clic Objet';
  if (type === 'OnKeyPress') title = 'Touche Clavier';
  if (type === 'OnKeyRelease') title = 'Relâchement Touche';
  if (type === 'IsKeyDown') title = 'Touche Enfoncée ?';
  if (type === 'ReadMoveAxis') title = 'Lecture Axes (ZQSD/WASD)';
  if (type === 'MoveByAxis') title = 'Déplacer (Avancer/Reculer)';
  if (type === 'OnTriggerEnter') title = 'Sur Entrée Zone';
  if (type === 'OnTriggerExit') title = 'Sur Sortie Zone';
  if (type === 'OnTimer') title = 'Minuteur (Timer)';
  if (type === 'OnCustomEvent') title = 'Événement Reçu';
  if (type === 'OnLand') title = 'Atterrissage';
  if (type === 'OnSurfaceEnter') title = 'Entrée Matière';
  if (type === 'OnSurfaceExit') title = 'Sortie Matière';

  // Matières & propriétés physiques
  if (type === 'SetSurface') title = 'Surface (Friction/Rebond)';
  if (type === 'SetMaterial') title = 'Matière du Sol';
  if (type === 'SetGravity') title = 'Gravity (Lune/Zéro-G)';
  if (type === 'SetDrag') title = 'Traînée (Air/Eau)';
  if (type === 'SetTimeScale') title = 'Échelle de Temps';
  if (type === 'FootstepSound') title = 'Son de Pas';
  if (type === 'HitStop') title = 'Gel d\'Impact';
  if (type === 'Rumble') title = 'Tremblement (Rumble)';
  if (type === 'SlowFollow') title = 'Caméra à Traîne';

  // Logic
  if (type === 'IfElse') title = 'Si / Sinon (If/Else)';
  if (type === 'Compare') title = 'Comparer (A vs B)';
  if (type === 'Gate') title = 'Porte Logique (AND/OR)';
  if (type === 'Math') title = 'Opération Math';
  if (type === 'Clamp') title = 'Borner (Clamp)';
  if (type === 'Lerp') title = 'Interpolation (Lerp)';
  if (type === 'Random') title = 'Aléatoire (Random)';
  if (type === 'Toggle') title = 'Bascule (Flip-Flop)';
  if (type === 'Counter') title = 'Compteur (Counter)';
  if (type === 'Delay') title = 'Délai (Attendre)';

  // Actions
  if (type === 'ApplyImpulse') title = 'Appliquer Impulsion';
  if (type === 'SetPosition') title = 'Définir Position';
  if (type === 'SetRotation') title = 'Définir Rotation';
  if (type === 'SetScale') title = 'Définir Échelle';
  if (type === 'SetColor') title = 'Changer Couleur';
  if (type === 'PlaySound') title = 'Jouer Son';
  if (type === 'DestroyEntity') title = 'Détruire Entité';
  if (type === 'SetVariable') title = 'Modifier Variable';
  if (type === 'GetVariable') title = 'Lire Variable';
  if (type === 'PlayAnimation') title = 'Jouer Animation / Trajectoire';
  if (type === 'PauseAnimation') title = 'Pause Animation';
  if (type === 'ReverseAnimation') title = 'Inverser Animation (Reverse)';
  if (type === 'SpawnPrefab') title = 'Faire Apparaître';
  if (type === 'PrintLog') title = 'Afficher Message';
  if (type === 'CameraShake') title = 'Secousse Caméra';
  if (type === 'ShootProjectile') title = 'Tirer un Projectile (Feu/Laser)';

  // AI & NPC Navigation
  if (type === 'FollowTarget') title = 'Suivre Cible (AI Follow)';
  if (type === 'PatrolWaypoints') title = 'Patrouille Balises (Waypoints)';
  if (type === 'CheckDistance') title = 'Vérifier Distance';
  if (type === 'LookAtPlayer') title = 'Orienter vers Joueur';
  if (type === 'CheckEnemyVision') title = 'Détection Cône de Vision (AI FOV)';
  if (type === 'DealDamage') title = 'Infliger Dégâts (-HP & Popup)';
  if (type === 'CheckInventory') title = 'Vérifier Inventaire / Clé';
  if (type === 'UnlockDoor') title = 'Déverrouiller / Ouvrir Porte';
  if (type === 'AddItem') title = 'Ajouter Objet / Clé (Inventaire)';
  if (type === 'RemoveItem') title = 'Retirer Objet (Inventaire)';
  if (type === 'OnProximity') title = 'Déclencheur de Proximité (Joueur)';

  // Dynamic Lighting
  if (type === 'SetLightColor') title = 'Définir Lumière (Couleur/Intensité)';
  if (type === 'PulseLight') title = 'Pulsation Lumineuse (Pulse)';
  if (type === 'FlickerLight') title = 'Scintillement (Flicker)';

  // Cinematics & Dialogue
  if (type === 'SwitchCamera') title = 'Changer Caméra / Plan (Cinématique)';
  if (type === 'ShowDialogue') title = 'Bannière de Dialogue & Sous-Titres';
  if (type === 'SetDepthOfField') title = 'Profondeur de Champ (DoF Blur)';

  // Spatial Audio & BGM
  if (type === 'PlaySound3D') title = 'Son Spatial 3D (Positional Audio)';
  if (type === 'PlaySFX') title = 'Effet Sonore (SFX Library)';
  if (type === 'SetBGMState') title = 'Musique Dynamique BGM (Explo/Combat)';

  // Pack Universel — cycle de vie, états de jeu, arcade, progression, caméra
  if (type === 'OnDeath') title = 'À la Mort (PV = 0)';
  if (type === 'TakeDamage') title = 'Subir Dégâts (-PV & Knockback)';
  if (type === 'Heal') title = 'Soigner (+PV)';
  if (type === 'Respawn') title = 'Réapparaître (Checkpoint)';
  if (type === 'Checkpoint') title = 'Point de Contrôle (Checkpoint)';
  if (type === 'WinGame') title = 'Victoire ! (Fin de Niveau)';
  if (type === 'LoseGame') title = 'Défaite... (Game Over)';
  if (type === 'RestartLevel') title = 'Recommencer le Niveau';
  if (type === 'PauseGame') title = 'Pause (Gel du Jeu)';
  if (type === 'ResumeGame') title = 'Reprendre (Fin Pause)';
  if (type === 'Countdown') title = 'Compte à Rebours (Timer)';
  if (type === 'MoveTowards') title = 'Avancer Vers (Cible/Position)';
  if (type === 'FleeFrom') title = 'Fuir le Joueur (Peur/Panique)';
  if (type === 'Wander') title = 'Errance Aléatoire (PNJ Ambiant)';
  if (type === 'MeleeAttack') title = 'Attaque Corps-à-Corps (Zone)';
  if (type === 'ShowMessage') title = 'Message HUD (Toast)';
  if (type === 'SaveGame') title = 'Sauvegarder Partie (Slot)';
  if (type === 'LoadGame') title = 'Charger Partie (Slot)';
  if (type === 'ToggleVisibility') title = 'Afficher / Cacher Objet';
  if (type === 'CameraFollow') title = 'Caméra Suit le Joueur (3e Personne)';

  const defaultValues: Record<string, any> = { ...initialValues };
  if (type === 'Compare' && !defaultValues.operator) defaultValues.operator = '==';
  if (type === 'Gate' && !defaultValues.gate) defaultValues.gate = 'AND';
  if (type === 'Math' && !defaultValues.operation) defaultValues.operation = '+';
  if (type === 'Clamp') {
    if (defaultValues.min === undefined) defaultValues.min = 0;
    if (defaultValues.max === undefined) defaultValues.max = 100;
  }
  if (type === 'Lerp') {
    if (defaultValues.t === undefined) defaultValues.t = 0.1;
  }
  if (type === 'Random') {
    if (defaultValues.min === undefined) defaultValues.min = 1;
    if (defaultValues.max === undefined) defaultValues.max = 10;
  }
  if (type === 'Counter') {
    if (defaultValues.step === undefined) defaultValues.step = 1;
    if (defaultValues.current === undefined) defaultValues.current = 0;
  }
  if (type === 'ShootProjectile') {
    if (defaultValues.speed === undefined) defaultValues.speed = 25;
    if (defaultValues.damage === undefined) defaultValues.damage = 10;
    if (defaultValues.prefabId === undefined) defaultValues.prefabId = 'Fireball';
  }
  if (type === 'Delay' && defaultValues.duration === undefined) defaultValues.duration = 1.0;
  if (type === 'OnTimer' && defaultValues.interval === undefined) defaultValues.interval = 1.0;
  if (type === 'OnCustomEvent' && !defaultValues.eventName) defaultValues.eventName = 'custom_msg';

  // Matières & propriétés physiques. Les valeurs par défaut reprennent les
  // presets de `lib/logic/surfaceLogic.ts` : un nœud lâché tel quel est déjà
  // cohérent, et « glacier » donne immédiatement un sol qui fait glisser.
  if (type === 'SetSurface') {
    if (!defaultValues.target) defaultValues.target = 'self';
    if (!defaultValues.surface) defaultValues.surface = 'ice';
  }
  if (type === 'SetMaterial') {
    if (!defaultValues.target) defaultValues.target = 'self';
    if (!defaultValues.material) defaultValues.material = 'ice';
  }
  if (type === 'SetGravity') {
    if (!defaultValues.target) defaultValues.target = 'self';
    if (defaultValues.scale === undefined) defaultValues.scale = 0.166; // Lune ≈ 1/6 g
  }
  if (type === 'SetDrag') {
    if (!defaultValues.target) defaultValues.target = 'self';
    if (defaultValues.linear === undefined) defaultValues.linear = 0.4;
  }
  if (type === 'SetTimeScale' && defaultValues.scale === undefined) {
    defaultValues.scale = 0.25; // ralenti lisible, pas un arrêt total
  }
  if (type === 'FootstepSound') {
    if (!defaultValues.surface) defaultValues.surface = 'default';
    if (defaultValues.volume === undefined) defaultValues.volume = 0.6;
  }
  if (type === 'HitStop' && defaultValues.duration === undefined) {
    // 80 ms : assez pour « sentir » le coup, trop court pour casser le rythme.
    defaultValues.duration = 0.08;
  }
  if (type === 'Rumble') {
    if (defaultValues.intensity === undefined) defaultValues.intensity = 0.6;
    if (defaultValues.duration === undefined) defaultValues.duration = 0.4;
  }
  if (type === 'SlowFollow') {
    if (!defaultValues.target) defaultValues.target = 'self';
    if (!defaultValues.style) defaultValues.style = 'sprint';
    // Retard = taux de rattrapage (1/lag) : 6 ≈ 1/6 s, comme le preset Sprint.
    if (defaultValues.smoothing === undefined) defaultValues.smoothing = 6;
    if (defaultValues.lookAhead === undefined) defaultValues.lookAhead = 1.2;
    if (defaultValues.enabled === undefined) defaultValues.enabled = true;
  }
  if (type === 'OnLand' && defaultValues.minSpeed === undefined) {
    defaultValues.minSpeed = 1.0; // en dessous, ce n'est plus un « atterrissage »
  }
  if (type === 'OnSurfaceEnter' || type === 'OnSurfaceExit') {
    if (!defaultValues.surface) defaultValues.surface = '*';
  }

  // Inventory & proximity nodes: usable defaults so a freshly dropped node
  // works without manual configuration (matches LogicExecutor value reading).
  if ((type === 'AddItem' || type === 'RemoveItem' || type === 'CheckInventory') && !defaultValues.item) {
    defaultValues.item = 'Clé Rouge';
  }
  if (type === 'OnProximity') {
    if (defaultValues.distance === undefined) defaultValues.distance = 5;
    if (!defaultValues.target) defaultValues.target = 'player';
  }

  // Pack Universel : valeurs par défaut prêtes à l'emploi
  if (type === 'TakeDamage') {
    if (defaultValues.damage === undefined) defaultValues.damage = 25;
    if (defaultValues.knockback === undefined) defaultValues.knockback = 0;
  }
  if (type === 'Heal') {
    if (defaultValues.amount === undefined) defaultValues.amount = 25;
    if (defaultValues.maxHP === undefined) defaultValues.maxHP = 100;
  }
  if (type === 'Respawn') {
    if (defaultValues.restoreHealth === undefined) defaultValues.restoreHealth = true;
    if (defaultValues.health === undefined) defaultValues.health = 100;
  }
  if (type === 'WinGame') {
    if (!defaultValues.title) defaultValues.title = 'VICTOIRE !';
    if (!defaultValues.message) defaultValues.message = 'Niveau terminé !';
    if (!defaultValues.sound) defaultValues.sound = 'powerup';
  }
  if (type === 'LoseGame') {
    if (!defaultValues.title) defaultValues.title = 'DÉFAITE...';
    if (!defaultValues.message) defaultValues.message = 'Partie terminée.';
    if (!defaultValues.sound) defaultValues.sound = 'explosion';
  }
  if (type === 'Countdown') {
    if (defaultValues.duration === undefined) defaultValues.duration = 10;
    if (defaultValues.loop === undefined) defaultValues.loop = false;
  }
  if (type === 'MoveTowards') {
    if (defaultValues.speed === undefined) defaultValues.speed = 4;
    if (defaultValues.stopDistance === undefined) defaultValues.stopDistance = 0.5;
    if (defaultValues.posX === undefined) defaultValues.posX = 0;
    if (defaultValues.posY === undefined) defaultValues.posY = 0;
    if (defaultValues.posZ === undefined) defaultValues.posZ = 0;
    if (defaultValues.targetName === undefined) defaultValues.targetName = '';
  }
  if (type === 'FleeFrom') {
    if (defaultValues.speed === undefined) defaultValues.speed = 4;
    if (defaultValues.safeDistance === undefined) defaultValues.safeDistance = 8;
  }
  if (type === 'Wander') {
    if (defaultValues.speed === undefined) defaultValues.speed = 2;
    if (defaultValues.radius === undefined) defaultValues.radius = 6;
    if (defaultValues.changeInterval === undefined) defaultValues.changeInterval = 3;
  }
  if (type === 'MeleeAttack') {
    if (defaultValues.damage === undefined) defaultValues.damage = 15;
    if (defaultValues.range === undefined) defaultValues.range = 2.5;
    if (defaultValues.cooldown === undefined) defaultValues.cooldown = 1;
  }
  if (type === 'ShowMessage') {
    if (!defaultValues.message) defaultValues.message = 'Objectif atteint !';
    if (defaultValues.duration === undefined) defaultValues.duration = 2500;
  }
  if (type === 'SaveGame' || type === 'LoadGame') {
    if (!defaultValues.slot) defaultValues.slot = 'slot1';
  }
  if (type === 'ToggleVisibility' && !defaultValues.target) defaultValues.target = 'self';
  if (type === 'CameraFollow') {
    if (defaultValues.distance === undefined) defaultValues.distance = 7;
    if (defaultValues.height === undefined) defaultValues.height = 4;
  }

  if (type === 'PlaySound' && !defaultValues.sound) defaultValues.sound = 'coin';
  if (type === 'ApplyImpulse') {
    if (defaultValues.force === undefined) defaultValues.force = 10;
    if (defaultValues.dirX === undefined) defaultValues.dirX = 0;
    if (defaultValues.dirY === undefined) defaultValues.dirY = 1;
    if (defaultValues.dirZ === undefined) defaultValues.dirZ = 0;
  }
  if (type === 'SetPosition') {
    if (defaultValues.posX === undefined) defaultValues.posX = 0;
    if (defaultValues.posY === undefined) defaultValues.posY = 0;
    if (defaultValues.posZ === undefined) defaultValues.posZ = 0;
  }
  if (type === 'SetRotation') {
    if (defaultValues.rotY === undefined) defaultValues.rotY = 90;
  }
  if (type === 'SetScale' && defaultValues.scale === undefined) defaultValues.scale = 1.5;
  if (type === 'SetColor' && !defaultValues.color) defaultValues.color = '#10b981';
  if (type === 'SetVariable') {
    if (!defaultValues.variable) defaultValues.variable = 'Score';
    if (defaultValues.operation === undefined) defaultValues.operation = 'add';
    if (defaultValues.amount === undefined) defaultValues.amount = 10;
  }
  if (type === 'GetVariable' && !defaultValues.variable) defaultValues.variable = 'Score';
  // Défaut « n'importe quelle touche » (et non Espace) : c'est ce qui rend le
  // câblage canonique « Touche Clavier -> MoveByAxis » fonctionnel d'emblée, la
  // touche appuyée donnant alors le sens. Espace est en plus le raccourci
  // Play/Stop de l'éditeur, donc un défaut trompeur.
  if (type === 'OnKeyPress' && !defaultValues.key) defaultValues.key = '*';
  if (type === 'OnKeyRelease' && !defaultValues.key) defaultValues.key = '*';
  if (type === 'IsKeyDown' && !defaultValues.key) defaultValues.key = 'Space';
  if (type === 'ReadMoveAxis') {
    // Codes PHYSIQUES (KeyboardEvent.code) : KeyW affiche Z en AZERTY.
    if (!defaultValues.forward) defaultValues.forward = 'KeyW';
    if (!defaultValues.back) defaultValues.back = 'KeyS';
    if (!defaultValues.left) defaultValues.left = 'KeyA';
    if (!defaultValues.right) defaultValues.right = 'KeyD';
    if (!defaultValues.sprint) defaultValues.sprint = 'ShiftLeft';
    if (defaultValues.deadzone === undefined) defaultValues.deadzone = 0.15;
  }
  if (type === 'MoveByAxis') {
    if (!defaultValues.target) defaultValues.target = 'self';
    if (defaultValues.speed === undefined) defaultValues.speed = 5;
    if (!defaultValues.mode) defaultValues.mode = 'self';
    if (defaultValues.faceHeading === undefined) defaultValues.faceHeading = true;
    if (!defaultValues.trigger) defaultValues.trigger = 'auto';
    if (defaultValues.step === undefined) defaultValues.step = 1;
    if (!defaultValues.forwardKey) defaultValues.forwardKey = 'KeyW';
    if (!defaultValues.backKey) defaultValues.backKey = 'KeyS';
    if (!defaultValues.leftKey) defaultValues.leftKey = 'KeyA';
    if (!defaultValues.rightKey) defaultValues.rightKey = 'KeyD';
  }
  if (type === 'PlayAnimation' && !defaultValues.anim) defaultValues.anim = 'bounce';
  if (type === 'SpawnPrefab') {
    if (!defaultValues.prefab) defaultValues.prefab = 'coin';
    if (defaultValues.offsetX === undefined) defaultValues.offsetX = 0;
    if (defaultValues.offsetY === undefined) defaultValues.offsetY = 1.5;
    if (defaultValues.offsetZ === undefined) defaultValues.offsetZ = 0;
  }
  if (type === 'PrintLog' && !defaultValues.message) defaultValues.message = 'Objectif atteint !';
  if (type === 'CameraShake' && defaultValues.intensity === undefined) defaultValues.intensity = 0.5;

  if (type === 'FollowTarget') {
    if (defaultValues.speed === undefined) defaultValues.speed = 3.5;
    if (defaultValues.stopDistance === undefined) defaultValues.stopDistance = 1.2;
  }
  if (type === 'PatrolWaypoints') {
    if (defaultValues.speed === undefined) defaultValues.speed = 2.5;
  }
  if (type === 'CheckDistance') {
    if (defaultValues.threshold === undefined) defaultValues.threshold = 8.0;
  }
  if (type === 'SetLightColor') {
    if (!defaultValues.color) defaultValues.color = '#38bdf8';
    if (defaultValues.intensity === undefined) defaultValues.intensity = 5.0;
  }
  if (type === 'PulseLight') {
    if (defaultValues.min === undefined) defaultValues.min = 1.0;
    if (defaultValues.max === undefined) defaultValues.max = 8.0;
    if (defaultValues.frequency === undefined) defaultValues.frequency = 3.0;
  }
  if (type === 'FlickerLight') {
    if (defaultValues.speed === undefined) defaultValues.speed = 10.0;
    if (defaultValues.randomness === undefined) defaultValues.randomness = 0.6;
  }

  return {
    id,
    type,
    title,
    category,
    position: { x, y },
    inputs,
    outputs,
    values: defaultValues,
  };
}

/**
 * convertBehaviorToNodes:
 * Seamlessly transforms any Level 1 Behavior Card into a fully connected, editable Level 2 Node Graph!
 */
export function convertBehaviorToNodes(card: BehaviorCard): NodeGraphData {
  const nodes: GraphNodeData[] = [];
  const connections: GraphConnection[] = [];

  switch (card.type) {
    case 'Collectable': {
      const cfg = card.config as CollectableConfig;
      // 1. OnCollision Event Node
      const onCollisionNode = createGraphNode('OnCollision', 80, 120);
      nodes.push(onCollisionNode);

      // 2. Play Sound Node
      const playSoundNode = createGraphNode('PlaySound', 360, 80, {
        sound: cfg.soundPreset || 'coin',
      });
      nodes.push(playSoundNode);

      // 3. SetVariable (Score) Node
      const setVarNode = createGraphNode('SetVariable', 620, 80, {
        variable: 'Score',
        operation: 'add',
        amount: cfg.scoreValue ?? 10,
      });
      nodes.push(setVarNode);

      // 4. DestroyEntity Node
      const destroyNode = createGraphNode('DestroyEntity', 880, 80, {
        target: 'self',
      });
      nodes.push(destroyNode);

      // 5. OnUpdate Animation (Spin & Hover)
      const onUpdateNode = createGraphNode('OnUpdate', 80, 360);
      nodes.push(onUpdateNode);

      const animNode = createGraphNode('PlayAnimation', 360, 360, {
        anim: 'spin',
        speed: cfg.rotateSpeed ?? 90,
      });
      nodes.push(animNode);

      // Connections
      connections.push(
        {
          id: `c_${Date.now()}_1`,
          fromNodeId: onCollisionNode.id,
          fromSocketId: 'out_flow',
          toNodeId: playSoundNode.id,
          toSocketId: 'in_flow',
        },
        {
          id: `c_${Date.now()}_2`,
          fromNodeId: playSoundNode.id,
          fromSocketId: 'out_flow',
          toNodeId: setVarNode.id,
          toSocketId: 'in_flow',
        },
        {
          id: `c_${Date.now()}_3`,
          fromNodeId: setVarNode.id,
          fromSocketId: 'out_flow',
          toNodeId: destroyNode.id,
          toSocketId: 'in_flow',
        },
        {
          id: `c_${Date.now()}_4`,
          fromNodeId: onUpdateNode.id,
          fromSocketId: 'out_flow',
          toNodeId: animNode.id,
          toSocketId: 'in_flow',
        }
      );
      break;
    }

    case 'Patrol': {
      const cfg = card.config as PatrolConfig;
      // 1. OnUpdate Event
      const onUpdateNode = createGraphNode('OnUpdate', 80, 150);
      nodes.push(onUpdateNode);

      // 2. PlayAnimation Patrol
      const animNode = createGraphNode('PlayAnimation', 360, 150, {
        anim: 'patrol',
        axis: cfg.axis || 'x',
        speed: cfg.speed || 3.0,
        distance: cfg.distance || 6.0,
      });
      nodes.push(animNode);

      connections.push({
        id: `c_${Date.now()}_1`,
        fromNodeId: onUpdateNode.id,
        fromSocketId: 'out_flow',
        toNodeId: animNode.id,
        toSocketId: 'in_flow',
      });
      break;
    }

    case 'TriggerZone': {
      const cfg = card.config as TriggerZoneConfig;
      // 1. OnTriggerEnter Event
      const triggerNode = createGraphNode('OnTriggerEnter', 80, 150, {
        radius: cfg.radius || 3.0,
        targetTag: cfg.triggerOn || 'Player',
      });
      nodes.push(triggerNode);

      // 2. PlaySound Node
      const playSoundNode = createGraphNode('PlaySound', 360, 120, {
        sound: cfg.soundPreset || 'chime',
      });
      nodes.push(playSoundNode);

      // 3. PlayAnimation Node (Pulse)
      const animNode = createGraphNode('PlayAnimation', 640, 120, {
        anim: 'pulse',
      });
      nodes.push(animNode);

      connections.push(
        {
          id: `c_${Date.now()}_1`,
          fromNodeId: triggerNode.id,
          fromSocketId: 'out_flow',
          toNodeId: playSoundNode.id,
          toSocketId: 'in_flow',
        },
        {
          id: `c_${Date.now()}_2`,
          fromNodeId: playSoundNode.id,
          fromSocketId: 'out_flow',
          toNodeId: animNode.id,
          toSocketId: 'in_flow',
        }
      );
      break;
    }

    case 'DamageOnTouch': {
      const cfg = card.config as DamageOnTouchConfig;
      // 1. OnCollision Event
      const onCollisionNode = createGraphNode('OnCollision', 80, 150);
      nodes.push(onCollisionNode);

      // 2. PlaySound (hit)
      const playSoundNode = createGraphNode('PlaySound', 360, 100, {
        sound: cfg.soundPreset || 'hit',
      });
      nodes.push(playSoundNode);

      // 3. ApplyImpulse (Knockback)
      const impulseNode = createGraphNode('ApplyImpulse', 620, 100, {
        force: cfg.knockbackForce || 8.0,
        dirX: 0,
        dirY: 0.8,
        dirZ: -1,
      });
      nodes.push(impulseNode);

      // 4. SetVariable (PlayerHealth)
      const healthNode = createGraphNode('SetVariable', 880, 100, {
        variable: 'Health',
        operation: 'subtract',
        amount: cfg.damage || 25,
      });
      nodes.push(healthNode);

      connections.push(
        {
          id: `c_${Date.now()}_1`,
          fromNodeId: onCollisionNode.id,
          fromSocketId: 'out_flow',
          toNodeId: playSoundNode.id,
          toSocketId: 'in_flow',
        },
        {
          id: `c_${Date.now()}_2`,
          fromNodeId: playSoundNode.id,
          fromSocketId: 'out_flow',
          toNodeId: impulseNode.id,
          toSocketId: 'in_flow',
        },
        {
          id: `c_${Date.now()}_3`,
          fromNodeId: impulseNode.id,
          fromSocketId: 'out_flow',
          toNodeId: healthNode.id,
          toSocketId: 'in_flow',
        }
      );
      break;
    }

    case 'WindZone': {
      const onStartNode = createGraphNode('OnStart', 80, 150);
      nodes.push(onStartNode);

      const applyWindNode = createGraphNode('ApplyWindForce', 360, 150, {
        force: (card.config as any)?.force || 25,
        dirX: 0,
        dirY: 1,
        dirZ: 0,
      });
      nodes.push(applyWindNode);

      connections.push({
        id: `c_${Date.now()}_1`,
        fromNodeId: onStartNode.id,
        fromSocketId: 'out_flow',
        toNodeId: applyWindNode.id,
        toSocketId: 'in_flow',
      });
      break;
    }

    case 'Flammable': {
      const onIgniteNode = createGraphNode('OnIgnite', 80, 150);
      nodes.push(onIgniteNode);

      const playSfxNode = createGraphNode('PlaySFX', 360, 100, {
        preset: 'explosion',
      });
      nodes.push(playSfxNode);

      const emitParticlesNode = createGraphNode('EmitParticles', 640, 100, {
        preset: 'fire',
        rate: 30,
      });
      nodes.push(emitParticlesNode);

      connections.push(
        {
          id: `c_${Date.now()}_1`,
          fromNodeId: onIgniteNode.id,
          fromSocketId: 'out_flow',
          toNodeId: playSfxNode.id,
          toSocketId: 'in_flow',
        },
        {
          id: `c_${Date.now()}_2`,
          fromNodeId: playSfxNode.id,
          fromSocketId: 'out_flow',
          toNodeId: emitParticlesNode.id,
          toSocketId: 'in_flow',
        }
      );
      break;
    }

    case 'WeatherListener': {
      const onRainNode = createGraphNode('OnRainStart', 80, 150);
      nodes.push(onRainNode);

      const extinguishNode = createGraphNode('ExtinguishEntity', 360, 150);
      nodes.push(extinguishNode);

      connections.push({
        id: `c_${Date.now()}_1`,
        fromNodeId: onRainNode.id,
        fromSocketId: 'out_flow',
        toNodeId: extinguishNode.id,
        toSocketId: 'in_flow',
      });
      break;
    }

    case 'Buoyant': {
      const cfg = card.config as BuoyantConfig;
      // 1. Au lancement : mémoriser le multiplicateur de flottabilité
      const onStartNode = createGraphNode('OnStart', 80, 150);
      nodes.push(onStartNode);

      const setBuoyancyNode = createGraphNode('SetVariable', 360, 150, {
        variable: 'BuoyancyMultiplier',
        operation: 'set',
        amount: cfg.buoyancyMultiplier ?? 1.3,
      });
      nodes.push(setBuoyancyNode);

      // 2. Chaque frame : poussée d'Archimède vers le haut
      const onUpdateNode = createGraphNode('OnUpdate', 80, 400);
      nodes.push(onUpdateNode);

      const floatNode = createGraphNode('ApplyImpulse', 360, 400, {
        force: (cfg.buoyancyMultiplier ?? 1.3) * 9.81,
        dirX: 0,
        dirY: 1,
        dirZ: 0,
      });
      nodes.push(floatNode);

      connections.push(
        {
          id: `c_${Date.now()}_1`,
          fromNodeId: onStartNode.id,
          fromSocketId: 'out_flow',
          toNodeId: setBuoyancyNode.id,
          toSocketId: 'in_flow',
        },
        {
          id: `c_${Date.now()}_2`,
          fromNodeId: onUpdateNode.id,
          fromSocketId: 'out_flow',
          toNodeId: floatNode.id,
          toSocketId: 'in_flow',
        }
      );
      break;
    }

    case 'NavMeshAgent': {
      const cfg = card.config as NavMeshAgentConfig;
      // 1. Au lancement : poursuite de la cible
      const onStartNode = createGraphNode('OnStart', 80, 150);
      nodes.push(onStartNode);

      const followNode = createGraphNode('FollowTarget', 380, 150, {
        target:
          cfg.targetType === 'Entity'
            ? cfg.targetEntityId || 'player'
            : cfg.targetType === 'Position'
              ? 'position'
              : 'player',
        speed: cfg.speed ?? 3.5,
        stoppingDistance: cfg.stoppingDistance ?? 1.5,
        avoidWater: cfg.avoidWater !== false,
        maxSlopeAngle: cfg.maxSlopeAngle ?? 45,
      });
      nodes.push(followNode);

      // 2. Rotation continue vers la cible
      const lookNode = createGraphNode('LookAtPlayer', 680, 150, {
        angularSpeed: cfg.angularSpeed ?? 120,
        avoidanceRadius: cfg.avoidanceRadius ?? 0.6,
      });
      nodes.push(lookNode);

      connections.push(
        {
          id: `c_${Date.now()}_1`,
          fromNodeId: onStartNode.id,
          fromSocketId: 'out_flow',
          toNodeId: followNode.id,
          toSocketId: 'in_flow',
        },
        {
          id: `c_${Date.now()}_2`,
          fromNodeId: followNode.id,
          fromSocketId: 'out_flow',
          toNodeId: lookNode.id,
          toSocketId: 'in_flow',
        }
      );
      break;
    }

    case 'TriggerVolume': {
      const cfg = card.config as TriggerVolumeBehaviorConfig;
      // 1. Entrée dans le volume
      const onEnterNode = createGraphNode('OnTriggerEnter', 80, 150);
      nodes.push(onEnterNode);

      // 2. Action configurée (checkpoint / téléport / cinématique / piège)
      let actionNode: GraphNodeData;
      switch (cfg.actionType) {
        case 'teleport':
          actionNode = createGraphNode('SetPosition', 400, 150, {
            x: cfg.teleportDestination?.x ?? 0,
            y: cfg.teleportDestination?.y ?? 0,
            z: cfg.teleportDestination?.z ?? 0,
          });
          break;
        case 'cinematic':
          actionNode = createGraphNode('ShowDialogue', 400, 150, {
            speaker: cfg.cinematicSpeaker || 'Narrateur',
            text: cfg.cinematicText || cfg.triggerMessage || '',
            camera: cfg.cinematicCameraName || '',
          });
          break;
        case 'trap':
          actionNode = createGraphNode('DealDamage', 400, 150, {
            amount: cfg.trapDamage ?? 25,
            knockback: cfg.trapKnockback ?? 8,
          });
          break;
        default:
          // checkpoint / custom : mémoriser le point de réapparition
          actionNode = createGraphNode('SetVariable', 400, 150, {
            variable: cfg.checkpointName || 'Checkpoint',
            operation: 'set',
            amount: 1,
          });
          break;
      }
      nodes.push(actionNode);

      connections.push({
        id: `c_${Date.now()}_1`,
        fromNodeId: onEnterNode.id,
        fromSocketId: 'out_flow',
        toNodeId: actionNode.id,
        toSocketId: 'in_flow',
      });
      break;
    }
  }

  return {
    enabled: true,
    nodes,
    connections,
    variables: { Score: 0, Health: 100 },
  };
}
