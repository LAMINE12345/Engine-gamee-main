'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  X,
  Plus,
  Play,
  Trash2,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Zap,
  Split,
  Search,
  
  
  
} from 'lucide-react';
import {
  NodeGraphData,
  GraphNodeData,
  GraphConnection,
  NodeType,
  Socket,
  SocketType,
} from '../types/logic';
import { createGraphNode } from '../lib/logic/NodeGraphConverter';
import { SURFACES, SURFACE_ORDER, SurfaceId } from '../lib/logic/surfaceLogic';
import { TRAIL_PRESETS } from '../lib/logic/cameraTrailing';
import { SoundEngine } from '../lib/audio/SoundSynth';
import { KEY_OPTIONS, describeKey } from '../lib/logic/inputLogic';

const KEY_GROUPS = Array.from(new Set(KEY_OPTIONS.map((o) => o.group)));

/**
 * Sélecteur de touche avec capture directe : « Capturer » met le panneau en
 * attente du prochain appui, ce qui évite d'aller deviner le `KeyboardEvent.code`
 * dans la liste. Échap annule la capture sans rien modifier.
 */
function KeyPicker({
  label = 'Touche Clavier',
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') onChange(e.code);
      setCapturing(false);
    };
    // Phase de capture pour intercepter l'appui avant les raccourcis globaux.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, onChange]);

  return (
    <div className="pt-2 border-t border-zinc-800/80">
      <label className="text-[10px] text-zinc-400 block mb-1">{label}</label>
      <div className="flex gap-1">
        <select
          value={KEY_OPTIONS.some((o) => o.value === value) ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs focus:outline-none focus:border-emerald-500"
        >
          {!KEY_OPTIONS.some((o) => o.value === value) && (
            <option value="">{describeKey(value)}</option>
          )}
          {KEY_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {KEY_OPTIONS.filter((o) => o.group === group).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setCapturing((c) => !c)}
          title="Appuyez sur la touche de votre choix (Échap pour annuler)"
          className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
            capturing
              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 animate-pulse'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          {capturing ? 'Appuyez…' : 'Capturer'}
        </button>
      </div>
    </div>
  );
}

interface NodeGraphModalProps {
  isOpen: boolean;
  entityId?: string;
  entityName: string;
  initialGraph?: NodeGraphData;
  /** Noms d'objets de la scène, proposés pour les cibles d'action. */
  entityNames?: string[];
  onSave: (graph: NodeGraphData) => void;
  onClose: () => void;
}

const NODE_WIDTH = 230;
const HEADER_HEIGHT = 38;
const SOCKET_ROW_HEIGHT = 28;
const PADDING_TOP = 8;

/** SetSurface stocke sous `surface`, SetMaterial sous `material`. */
function materialKey(node: { type: string }): 'surface' | 'material' {
  return node.type === 'SetMaterial' ? 'material' : 'surface';
}

/** Paliers de pesanteur tirés de la réalité (et non des nombres arbitraires). */
const GRAVITY_PRESETS: { label: string; scale: number; hint: string }[] = [
  { label: 'Terre', scale: 1, hint: 'Gravité terrestre (≈ 9,8 m/s²)' },
  { label: 'Lune', scale: 0.166, hint: 'Lune : 1/6 de la gravité terrestre' },
  { label: 'Mars', scale: 0.379, hint: 'Mars : ~38 % de la gravité terrestre' },
  { label: 'Zéro-G', scale: 0, hint: ' apesanteur : plus aucune chute' },
  { label: 'Jupiter', scale: 2.53, hint: 'Jupiter : ~2,5 g' },
];

/**
 * Computes exact pixel coordinates for a socket pin on a node
 */
function getSocketCoordinates(
  node: GraphNodeData,
  socketId: string,
  isOutput: boolean
): { x: number; y: number } {
  const list = isOutput ? node.outputs : node.inputs;
  const index = list.findIndex((s) => s.id === socketId);
  const row = index >= 0 ? index : 0;

  const x = isOutput ? node.position.x + NODE_WIDTH - 12 : node.position.x + 12;
  const y = node.position.y + HEADER_HEIGHT + PADDING_TOP + row * SOCKET_ROW_HEIGHT + 14;

  return { x, y };
}

/**
 * Color mapping for socket data types and wires
 */
function getSocketColor(type: SocketType): { stroke: string; glow: string; text: string; bg: string } {
  switch (type) {
    case 'flow':
      return {
        stroke: '#34d399',
        glow: 'rgba(52, 211, 153, 0.4)',
        text: 'text-emerald-300',
        bg: 'bg-emerald-400',
      };
    case 'number':
      return {
        stroke: '#38bdf8',
        glow: 'rgba(56, 189, 248, 0.4)',
        text: 'text-sky-300',
        bg: 'bg-sky-400',
      };
    case 'boolean':
      return {
        stroke: '#fbbf24',
        glow: 'rgba(251, 191, 36, 0.4)',
        text: 'text-amber-300',
        bg: 'bg-amber-400',
      };
    case 'string':
      return {
        stroke: '#c084fc',
        glow: 'rgba(192, 132, 252, 0.4)',
        text: 'text-purple-300',
        bg: 'bg-purple-400',
      };
    case 'vector':
      return {
        stroke: '#fb923c',
        glow: 'rgba(251, 146, 60, 0.4)',
        text: 'text-orange-300',
        bg: 'bg-orange-400',
      };
    case 'entity':
    default:
      return {
        stroke: '#ec4899',
        glow: 'rgba(236, 72, 153, 0.4)',
        text: 'text-pink-300',
        bg: 'bg-pink-400',
      };
  }
}

// Full catalog of available nodes
const ALL_AVAILABLE_NODES: Array<{
  type: NodeType;
  label: string;
  desc: string;
  category: 'event' | 'logic' | 'action';
}> = [
  // Événements
  { type: 'OnStart', label: 'OnStart', desc: 'Au lancement de la scène', category: 'event' },
  { type: 'OnUpdate', label: 'OnUpdate', desc: 'À chaque frame / boucle de jeu', category: 'event' },
  { type: 'OnCollision', label: 'OnCollision', desc: 'Sur contact physique avec un objet', category: 'event' },
  { type: 'OnClick', label: 'OnClick', desc: 'Sur clic de la souris sur l\'objet', category: 'event' },
  { type: 'OnKeyPress', label: 'OnKeyPress', desc: 'Touche clavier (Espace, E, F...)', category: 'event' },
  { type: 'OnKeyRelease', label: 'OnKeyRelease', desc: 'Relâchement d\'une touche (fin d\'appui)', category: 'event' },
  { type: 'IsKeyDown', label: 'IsKeyDown', desc: 'Teste si une touche est maintenue (à brancher sur Update)', category: 'logic' },
  { type: 'ReadMoveAxis', label: 'ReadMoveAxis (ZQSD/WASD)', desc: 'Lit l\'axe clavier : avancer / reculer / gauche / droite + sprint', category: 'logic' },
  { type: 'MoveByAxis', label: 'MoveByAxis (Avancer/Reculer)', desc: 'Déplace l\'objet dans la direction choisie selon l\'axe lu', category: 'action' },
  { type: 'OnTriggerEnter', label: 'OnTriggerEnter', desc: 'Entrée dans le volume déclencheur', category: 'event' },
  { type: 'OnTriggerExit', label: 'OnTriggerExit', desc: 'Sortie du volume déclencheur', category: 'event' },
  { type: 'OnTimer', label: 'OnTimer', desc: 'Intervalle répété ou délai périodique', category: 'event' },
  { type: 'OnCustomEvent', label: 'OnCustomEvent', desc: 'Réception d\'un message diffusé', category: 'event' },

  // Logique & Math
  { type: 'IfElse', label: 'If / Else', desc: 'Branchement conditionnel Vrai / Faux', category: 'logic' },
  { type: 'Compare', label: 'Compare (A == B)', desc: 'Comparaison (==, !=, >, <, >=, <=)', category: 'logic' },
  { type: 'Gate', label: 'Gate (AND / OR)', desc: 'Porte logique ET, OU, NON, XOR', category: 'logic' },
  { type: 'Math', label: 'Math (+ - * / %)', desc: 'Calcul et opérations arithmétiques', category: 'logic' },
  { type: 'Clamp', label: 'Clamp (Min, Max)', desc: 'Restreindre une valeur entre bornes', category: 'logic' },
  { type: 'Lerp', label: 'Lerp (Interpolation)', desc: 'Transition fluide entre deux valeurs', category: 'logic' },
  { type: 'Random', label: 'Random (Min, Max)', desc: 'Générateur de nombre aléatoire', category: 'logic' },
  { type: 'Toggle', label: 'Toggle (Flip-Flop)', desc: 'Bascule alternée Activé / Désactivé', category: 'logic' },
  { type: 'Counter', label: 'Counter', desc: 'Compteur pas à pas avec remise à zéro', category: 'logic' },
  { type: 'Delay', label: 'Delay (Attente)', desc: 'Temporisation en secondes', category: 'logic' },

  // Actions & Effets
  { type: 'ApplyImpulse', label: 'ApplyImpulse', desc: 'Propulser / Saut physique', category: 'action' },
  { type: 'SetPosition', label: 'SetPosition', desc: 'Téléporter / Déplacer vers (X, Y, Z)', category: 'action' },
  { type: 'SetRotation', label: 'SetRotation', desc: 'Pivoter l\'objet sur un axe', category: 'action' },
  { type: 'SetScale', label: 'SetScale', desc: 'Ajuster l\'échelle / Grossir / Réduire', category: 'action' },
  { type: 'SetColor', label: 'SetColor', desc: 'Modifier la couleur du matériau PBR', category: 'action' },
  { type: 'PlaySound', label: 'PlaySound', desc: 'Effet sonore synthétisé en temps réel', category: 'action' },
  { type: 'PlayAnimation', label: 'PlayAnimation', desc: 'Animation (Rotation, Rebond, Pulsation)', category: 'action' },
  { type: 'PauseAnimation', label: 'PauseAnimation', desc: 'Mettre en pause l\'animation en cours', category: 'action' },
  { type: 'ReverseAnimation', label: 'ReverseAnimation', desc: 'Jouer l\'animation à l\'envers', category: 'action' },
  { type: 'SpawnPrefab', label: 'SpawnPrefab', desc: 'Faire apparaître un nouvel objet', category: 'action' },
  { type: 'DestroyEntity', label: 'DestroyEntity', desc: 'Supprimer / Collecter l\'entité', category: 'action' },
  { type: 'SetVariable', label: 'SetVariable', desc: 'Modifier variable (Score, PV, etc.)', category: 'action' },
  { type: 'GetVariable', label: 'GetVariable', desc: 'Lire la valeur d\'une variable', category: 'action' },
  { type: 'PrintLog', label: 'PrintLog', desc: 'Afficher un message console / HUD', category: 'action' },
  { type: 'CameraShake', label: 'CameraShake', desc: 'Déclencher une secousse d\'écran', category: 'action' },
  { type: 'EmitParticles', label: 'EmitParticles', desc: 'Émettre des particules (Feu, Fumée, Pluie, Neige...)', category: 'action' },
  { type: 'ExplosionFX', label: 'ExplosionFX', desc: 'Explosion spectaculaire 3D avec secousse & son', category: 'action' },
  { type: 'StopParticles', label: 'StopParticles', desc: 'Arrêter l\'émission de particules', category: 'action' },
  { type: 'ShootProjectile', label: 'ShootProjectile', desc: 'Tirer un projectile (Feu, Plasma, Laser) vers l\'avant', category: 'action' },

  // Navigation IA & PNJ
  { type: 'FollowTarget', label: 'FollowTarget (Poursuite)', desc: 'Chasse automatique du joueur / cible avec détection FOV', category: 'action' },
  { type: 'PatrolWaypoints', label: 'PatrolWaypoints (Patrouille)', desc: 'Navigation autonome entre balises / waypoints', category: 'action' },
  { type: 'CheckDistance', label: 'CheckDistance', desc: 'Vérifier la portée et la distance d\'une cible', category: 'logic' },
  { type: 'LookAtPlayer', label: 'LookAtPlayer', desc: 'Orienter progressivement le PNJ vers le joueur', category: 'action' },
  { type: 'CheckEnemyVision', label: 'CheckEnemyVision (Cône Vision FOV)', desc: 'Détecte si le joueur entre dans le cône de vision de l\'ennemi', category: 'logic' },
  { type: 'DealDamage', label: 'DealDamage (Dégâts & HP)', desc: 'Inflige des dégâts et affiche un pop-up de texte flottant (-25 HP)', category: 'action' },
  { type: 'CheckInventory', label: 'CheckInventory (Inventaire Clés)', desc: 'Vérifie si le joueur possède une clé ou un objet spécifique', category: 'logic' },
  { type: 'UnlockDoor', label: 'UnlockDoor (Ouvrir Porte)', desc: 'Déverrouille et ouvre une porte ou un passage logique', category: 'action' },

  // Lumières Dynamiques & Volumétriques
  { type: 'SetLightColor', label: 'SetLightColor', desc: 'Changer la couleur et l\'intensité du projecteur / point light', category: 'action' },
  { type: 'PulseLight', label: 'PulseLight', desc: 'Pulsation lumineuse sinusoïdale (ambiance sci-fi / alarme)', category: 'action' },
  { type: 'FlickerLight', label: 'FlickerLight', desc: 'Scintillement stroboscopique (torche / horreur)', category: 'action' },

  // Cinématiques & Bannières de Dialogue
  { type: 'SwitchCamera', label: 'SwitchCamera', desc: 'Basculer la vue vers une caméra cible avec transition/fondu', category: 'action' },
  { type: 'ShowDialogue', label: 'ShowDialogue', desc: 'Bannière de sous-titres/dialogue avec nom et portrait', category: 'action' },
  { type: 'SetDepthOfField', label: 'SetDepthOfField', desc: 'Activer le flou de profondeur de champ (Depth of Field)', category: 'action' },

  // Audio 3D Spatial & Musique BGM
  { type: 'PlaySound3D', label: 'PlaySound3D', desc: 'Son 3D spatialisé (moteur, torche, cascade) avec atténuation distance', category: 'action' },
  { type: 'PlaySFX', label: 'PlaySFX', desc: 'Bibliothèque d\'effets sonores (saut, laser, explosion, pièce)', category: 'action' },
  { type: 'SetBGMState', label: 'SetBGMState', desc: 'BGM dynamique avec crossfade (exploration vs combat)', category: 'action' },

  // Matières & propriétés physiques — valeurs calibrées sur la réalité
  { type: 'SetSurface', label: 'Surface (Friction/Rebond)', desc: 'Rend le sol glissant, rebondissant, collant… pendant le jeu', category: 'action' },
  { type: 'SetMaterial', label: 'Matière du Sol', desc: 'Glacier, caoutchouc, boue, sable, métal, éponge + son de pas', category: 'action' },
  { type: 'SetGravity', label: 'Gravity (Lune/Zéro-G)', desc: 'Change la pesanteur d\'un objet : Lune, zéro-g, gravité normale', category: 'action' },
  { type: 'SetDrag', label: 'Traînée (Air/Eau)', desc: 'Résistance de l\'air : parachute, glisse en apesanteur', category: 'action' },
  { type: 'SetTimeScale', label: 'Échelle de Temps', desc: 'Ralentit ou accélère toute la simulation (bullet-time)', category: 'action' },

  // Effets sensoriels & capteurs
  { type: 'FootstepSound', label: 'Son de Pas', desc: 'Joue le pas correspondant à la matière du sol', category: 'action' },
  { type: 'HitStop', label: 'Gel d\'Impact', desc: 'Fige le temps 80 ms à l\'impact : le coup « pèse » enfin', category: 'action' },
  { type: 'Rumble', label: 'Tremblement (Rumble)', desc: 'Secousse manette/caméra avec dégressivité naturelle', category: 'action' },
  { type: 'SlowFollow', label: 'Caméra à Traîne', desc: 'Suivi avec retard et avance : la caméra déborde à l\'accélération', category: 'action' },
  { type: 'OnLand', label: 'Atterrissage', desc: 'Se déclenche à la retombée, avec la force d\'impact (doux / violent)', category: 'event' },
  { type: 'OnSurfaceEnter', label: 'Entrée Matière', desc: 'Quand l\'objet pose le pied sur une nouvelle matière', category: 'event' },
  { type: 'OnSurfaceExit', label: 'Sortie Matière', desc: 'Quand l\'objet quitte une matière (quitte la glace, entre dans l\'eau)', category: 'event' },

  // Physique Environnementale (Vent, Feu, Pluie)
  { type: 'OnWindGust', label: 'OnWindGust (Rafale de Vent)', desc: 'Déclenché lorsqu\'une rafale de vent souffle', category: 'event' },
  { type: 'OnIgnite', label: 'OnIgnite (Ignition Feu)', desc: 'Déclenché lorsque l\'objet prend feu', category: 'event' },
  { type: 'OnExtinguish', label: 'OnExtinguish (Extinction Feu)', desc: 'Déclenché lorsque le feu s\'éteint', category: 'event' },
  { type: 'OnRainStart', label: 'OnRainStart (Début Pluie)', desc: 'Déclenché lorsque l\'averse ou l\'orage commence', category: 'event' },
  { type: 'OnRainStop', label: 'OnRainStop (Arrêt Pluie)', desc: 'Déclenché lorsque la pluie cesse', category: 'event' },
  { type: 'SetWind', label: 'SetWind (Contrôle Vent)', desc: 'Modifier vitesse, direction et turbulence du vent mondial', category: 'action' },
  { type: 'ApplyWindForce', label: 'ApplyWindForce (Poussée de Vent)', desc: 'Appliquer une poussée d\'air ou un courant ascendant', category: 'action' },
  { type: 'GetWind', label: 'GetWind (Mesure Vent)', desc: 'Lire la vitesse et le vecteur du vent mondial', category: 'logic' },
  { type: 'IgniteEntity', label: 'IgniteEntity (Allumer Feu)', desc: 'Enflammer une entité avec propagation thermique', category: 'action' },
  { type: 'ExtinguishEntity', label: 'ExtinguishEntity (Éteindre Feu)', desc: 'Éteindre les flammes et refroidir l\'objet', category: 'action' },
  { type: 'CheckIsBurning', label: 'CheckIsBurning (En Feu ?)', desc: 'Vérifier si l\'entité est en train de brûler', category: 'logic' },
  { type: 'SetRain', label: 'SetRain (Météo Pluie)', desc: 'Activer la pluie, changer son intensité ou activer l\'orage', category: 'action' },
  { type: 'CheckIsRaining', label: 'CheckIsRaining (Pluie Active ?)', desc: 'Vérifier si les précipitations sont actives', category: 'logic' },
  { type: 'OnProximity', label: 'OnProximity (Déclencheur Proximité)', desc: 'Déclenché quand le joueur entre à portée (ex: porte, piège)', category: 'event' },
  { type: 'AddItem', label: 'AddItem (Ajouter Inventaire)', desc: 'Ajouter un objet ou une clé à l\'inventaire du joueur', category: 'action' },
  { type: 'RemoveItem', label: 'RemoveItem (Retirer Inventaire)', desc: 'Retirer un objet de l\'inventaire du joueur', category: 'action' },

  // Pack Universel — cycle de vie, états de jeu, arcade, progression, caméra
  { type: 'OnDeath', label: 'OnDeath (Mort)', desc: 'Santé tombée à zéro — mort du joueur', category: 'event' },
  { type: 'TakeDamage', label: 'TakeDamage (Subir Dégâts)', desc: 'Le joueur perd des PV + knockback + sortie Vaincu', category: 'action' },
  { type: 'Heal', label: 'Heal (Soin)', desc: 'Restaure les PV jusqu\'au maximum', category: 'action' },
  { type: 'Respawn', label: 'Respawn (Réapparaître)', desc: 'Retour au checkpoint / position initiale + PV', category: 'action' },
  { type: 'Checkpoint', label: 'Checkpoint', desc: 'Mémorise la position comme point de réapparition', category: 'action' },
  { type: 'WinGame', label: 'WinGame (Victoire !)', desc: 'Bannière de victoire + son + fin de niveau', category: 'action' },
  { type: 'LoseGame', label: 'LoseGame (Défaite)', desc: 'Bannière game over + son', category: 'action' },
  { type: 'RestartLevel', label: 'RestartLevel', desc: 'Recommence le niveau (reset + OnStart rejoués)', category: 'action' },
  { type: 'PauseGame', label: 'PauseGame (Pause)', desc: 'Gèle la simulation (le rendu continue)', category: 'action' },
  { type: 'ResumeGame', label: 'ResumeGame (Reprendre)', desc: 'Relance la simulation après une pause', category: 'action' },
  { type: 'Countdown', label: 'Countdown (Compte à Rebours)', desc: 'Décrémente chaque frame (via OnUpdate) + sortie Terminé', category: 'logic' },
  { type: 'MoveTowards', label: 'MoveTowards (Avancer)', desc: 'Avance vers une position ou une entité nommée', category: 'action' },
  { type: 'FleeFrom', label: 'FleeFrom (Fuite)', desc: 'Fuit le joueur jusqu\'à la distance de sécurité', category: 'action' },
  { type: 'Wander', label: 'Wander (Errance)', desc: 'Errance aléatoire autour du point d\'origine (PNJ)', category: 'action' },
  { type: 'MeleeAttack', label: 'MeleeAttack (Corps-à-Corps)', desc: 'Frappe le joueur à portée + cooldown + repoussement', category: 'action' },
  { type: 'ShowMessage', label: 'ShowMessage (Toast HUD)', desc: 'Affiche un message temporaire dans le HUD de jeu', category: 'action' },
  { type: 'SaveGame', label: 'SaveGame (Sauvegarder)', desc: 'Sauve Score/PV/variables/inventaire dans un slot', category: 'action' },
  { type: 'LoadGame', label: 'LoadGame (Charger)', desc: 'Recharge un slot + sortie Aucune Sauvegarde', category: 'action' },
  { type: 'ToggleVisibility', label: 'ToggleVisibility', desc: 'Affiche / cache un objet (soi ou cible nommée)', category: 'action' },
  { type: 'CameraFollow', label: 'CameraFollow (Caméra 3e Personne)', desc: 'La caméra suit cette entité (course, runner, drone)', category: 'action' },
];

export const NodeGraphModal: React.FC<NodeGraphModalProps> = ({
  isOpen,
  entityName,
  entityNames = [],
  initialGraph,
  onSave,
  onClose,
}) => {
  const [graph, setGraph] = useState<NodeGraphData>(() => ({
    enabled: initialGraph?.enabled ?? true,
    nodes: initialGraph?.nodes ? JSON.parse(JSON.stringify(initialGraph.nodes)) : [],
    connections: initialGraph?.connections
      ? JSON.parse(JSON.stringify(initialGraph.connections))
      : [],
    variables: initialGraph?.variables || { Score: 0, Health: 100 },
  }));

  // Canvas Pan & Zoom
  const [pan, setPan] = useState({ x: 140, y: 100 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Node Dragging
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Connecting wire state
  const [connectingStart, setConnectingStart] = useState<{
    nodeId: string;
    socketId: string;
    type: SocketType;
    isOutput: boolean;
  } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [hoveredConnId, setHoveredConnId] = useState<string | null>(null);

  // Selected node for details & add menu
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<'all' | 'event' | 'logic' | 'action'>('all');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Visual Debugger Real-Time Flow State
  const [visualDebuggerActive, setVisualDebuggerActive] = useState(false);
  const [activeDebugNodeIds, setActiveDebugNodeIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visualDebuggerActive || !graph.nodes.length) {
      setActiveDebugNodeIds(new Set());
      return;
    }
    const interval = setInterval(() => {
      const nodeIds = graph.nodes.map((n) => n.id);
      if (nodeIds.length === 0) return;
      // Randomly simulate executing active node in debug flow
      const randomId = nodeIds[Math.floor(Math.random() * nodeIds.length)];
      setActiveDebugNodeIds(new Set([randomId]));
    }, 1000);
    return () => clearInterval(interval);
  }, [visualDebuggerActive, graph.nodes]);

  const containerRef = useRef<HTMLDivElement>(null);

  // Handle canvas mouse move for dragging & panning
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const currentX = (e.clientX - rect.left - pan.x) / zoom;
      const currentY = (e.clientY - rect.top - pan.y) / zoom;
      setMousePos({ x: currentX, y: currentY });

      if (isPanning) {
        setPan({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      } else if (draggingNodeId) {
        setGraph((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => {
            if (n.id === draggingNodeId) {
              return {
                ...n,
                position: {
                  x: Math.round(currentX - dragOffset.x),
                  y: Math.round(currentY - dragOffset.y),
                },
              };
            }
            return n;
          }),
        }));
      }
    },
    [isPanning, panStart, draggingNodeId, dragOffset, pan.x, pan.y, zoom]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setDraggingNodeId(null);
  }, []);

  // Add node handler
  const handleAddNode = (type: NodeType) => {
    const x = Math.round((420 - pan.x) / zoom);
    const y = Math.round((260 - pan.y) / zoom);
    const newNode = createGraphNode(type, x, y);

    setGraph((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));
    setShowAddMenu(false);
    setSelectedNodeId(newNode.id);
  };

  // Delete node
  const handleDeleteNode = (nodeId: string) => {
    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== nodeId),
      connections: prev.connections.filter(
        (c) => c.fromNodeId !== nodeId && c.toNodeId !== nodeId
      ),
    }));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  };

  // Connect socket (handles output->input or input->output)
  const handleSocketClick = (nodeId: string, socket: Socket, isOutput: boolean) => {
    if (!connectingStart) {
      setConnectingStart({
        nodeId,
        socketId: socket.id,
        type: socket.type,
        isOutput,
      });
      return;
    }

    // Attempting to complete connection
    if (connectingStart.nodeId !== nodeId && connectingStart.isOutput !== isOutput) {
      const fromNodeId = connectingStart.isOutput ? connectingStart.nodeId : nodeId;
      const fromSocketId = connectingStart.isOutput ? connectingStart.socketId : socket.id;
      const toNodeId = connectingStart.isOutput ? nodeId : connectingStart.nodeId;
      const toSocketId = connectingStart.isOutput ? socket.id : connectingStart.socketId;

      const newConn: GraphConnection = {
        id: `conn_${fromNodeId}_${fromSocketId}_${toNodeId}_${toSocketId}`,
        fromNodeId,
        fromSocketId,
        toNodeId,
        toSocketId,
      };

      setGraph((prev) => ({
        ...prev,
        connections: [
          ...prev.connections.filter(
            (c) => !(c.toNodeId === toNodeId && c.toSocketId === toSocketId)
          ),
          newConn,
        ],
      }));
      SoundEngine.play('coin');
    }

    setConnectingStart(null);
  };

  // Delete connection
  const handleDeleteConnection = (connId: string) => {
    setGraph((prev) => ({
      ...prev,
      connections: prev.connections.filter((c) => c.id !== connId),
    }));
    SoundEngine.play('hit');
  };

  // Update node value
  const handleUpdateNodeValue = (nodeId: string, key: string, val: any) => {
    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            values: { ...n.values, [key]: val },
          };
        }
        return n;
      }),
    }));
  };

  // Save changes
  const handleSaveAndClose = () => {
    onSave(graph);
    onClose();
  };

  // Color classes by category
  const getCategoryTheme = (category: string) => {
    switch (category) {
      case 'event':
        return {
          bg: 'bg-violet-950/80 border-violet-600/60 shadow-violet-950/40',
          badge: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
          header: 'bg-violet-900/40 text-violet-200 border-b-violet-800/50',
          socket: 'bg-violet-400',
        };
      case 'logic':
        return {
          bg: 'bg-amber-950/80 border-amber-600/60 shadow-amber-950/40',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          header: 'bg-amber-900/40 text-amber-200 border-b-amber-800/50',
          socket: 'bg-amber-400',
        };
      case 'action':
      default:
        return {
          bg: 'bg-emerald-950/80 border-emerald-600/60 shadow-emerald-950/40',
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          header: 'bg-emerald-900/40 text-emerald-200 border-b-emerald-800/50',
          socket: 'bg-emerald-400',
        };
    }
  };

  const filteredNodes = useMemo(() => {
    return ALL_AVAILABLE_NODES.filter((node) => {
      const matchCat = selectedCategoryTab === 'all' || node.category === selectedCategoryTab;
      const matchQuery =
        node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.desc.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [selectedCategoryTab, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      id="node-graph-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className={`flex flex-col bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${
          isFullscreen ? 'w-[98vw] h-[95vh]' : 'w-[92vw] max-w-6xl h-[88vh]'
        }`}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/80 bg-zinc-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-500/20 text-violet-400 border border-violet-500/30">
              <Split className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-zinc-100">
                  Éditeur de Nœuds : <span className="text-violet-400 font-mono">{entityName}</span>
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  Visual Scripting & Fils
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Connectez les connecteurs (sockets) d&apos;entrée et de sortie pour orchestrer la logique du jeu.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Add Node Button */}
            <div className="relative">
              <button
                type="button"
                id="btn-open-add-node"
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-md shadow-violet-900/40 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Ajouter un Nœud</span>
              </button>

              {/* Node catalog dropdown */}
              {showAddMenu && (
                <div className="absolute right-0 top-full mt-2 w-84 max-h-[480px] p-3 bg-zinc-900/95 border border-zinc-700/80 rounded-2xl shadow-2xl z-50 flex flex-col gap-2.5 backdrop-blur-xl">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Rechercher un nœud..."
                      className="w-full pl-8 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  {/* Category Tabs */}
                  <div className="flex gap-1 p-1 bg-zinc-950 rounded-xl border border-zinc-800/80 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryTab('all')}
                      className={`flex-1 py-1 rounded-lg font-medium transition-colors ${
                        selectedCategoryTab === 'all'
                          ? 'bg-zinc-800 text-zinc-100 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Tous ({ALL_AVAILABLE_NODES.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryTab('event')}
                      className={`flex-1 py-1 rounded-lg font-medium transition-colors ${
                        selectedCategoryTab === 'event'
                          ? 'bg-violet-950/80 text-violet-300 font-semibold border border-violet-700/50'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Events
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryTab('logic')}
                      className={`flex-1 py-1 rounded-lg font-medium transition-colors ${
                        selectedCategoryTab === 'logic'
                          ? 'bg-amber-950/80 text-amber-300 font-semibold border border-amber-700/50'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Logique
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryTab('action')}
                      className={`flex-1 py-1 rounded-lg font-medium transition-colors ${
                        selectedCategoryTab === 'action'
                          ? 'bg-emerald-950/80 text-emerald-300 font-semibold border border-emerald-700/50'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Actions
                    </button>
                  </div>

                  {/* Nodes List */}
                  <div className="overflow-y-auto max-h-[300px] space-y-1 pr-1 custom-scrollbar">
                    {filteredNodes.length === 0 ? (
                      <div className="py-6 text-center text-xs text-zinc-500">
                        Aucun nœud correspondant trouvé
                      </div>
                    ) : (
                      filteredNodes.map((item) => (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => handleAddNode(item.type)}
                          className={`w-full flex flex-col items-start px-3 py-1.5 rounded-xl border border-transparent transition-all text-left ${
                            item.category === 'event'
                              ? 'hover:bg-violet-950/50 hover:border-violet-700/40 text-zinc-200'
                              : item.category === 'logic'
                              ? 'hover:bg-amber-950/50 hover:border-amber-700/40 text-zinc-200'
                              : 'hover:bg-emerald-950/50 hover:border-emerald-700/40 text-zinc-200'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="font-semibold text-xs text-zinc-100">{item.label}</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded-full uppercase font-bold tracking-wider ${
                                item.category === 'event'
                                  ? 'text-violet-400 bg-violet-950/60'
                                  : item.category === 'logic'
                                  ? 'text-amber-400 bg-amber-950/60'
                                  : 'text-emerald-400 bg-emerald-950/60'
                              }`}
                            >
                              {item.category}
                            </span>
                          </div>
                          <span className="text-[10px] text-zinc-400 truncate max-w-full">{item.desc}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Visual Debugger Toggle */}
            <button
              type="button"
              onClick={() => setVisualDebuggerActive(!visualDebuggerActive)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                visualDebuggerActive
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_12px_rgba(52,211,153,0.3)] animate-pulse'
                  : 'bg-zinc-800/80 text-zinc-400 border-zinc-700/60 hover:text-zinc-200'
              }`}
              title="Activer le débogueur visuel en temps réel"
            >
              <Zap className={`w-3.5 h-3.5 ${visualDebuggerActive ? 'text-emerald-400' : 'text-zinc-400'}`} />
              <span>{visualDebuggerActive ? 'Debug Actif' : 'Visual Debugger'}</span>
            </button>

            {/* Fullscreen toggle */}
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
              title={isFullscreen ? 'Fenêtré' : 'Plein écran'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close button */}
            <button
              type="button"
              onClick={handleSaveAndClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Visual Graph Canvas Area */}
        <div
          ref={containerRef}
          onMouseDown={(e) => {
            if (e.target === containerRef.current || (e.target as HTMLElement).tagName === 'svg') {
              setIsPanning(true);
              setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
              setConnectingStart(null);
            }
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="relative flex-1 bg-zinc-950 overflow-hidden cursor-grab active:cursor-grabbing select-none"
          style={{
            backgroundImage: `radial-gradient(#3f3f46 1px, transparent 1px)`,
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        >
          {/* Zoom / Pan Controls Overlay */}
          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 p-1.5 bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-xl backdrop-blur-md">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.0, z + 0.15))}
              className="p-2 rounded-xl text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Zoomer"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
              className="p-2 rounded-xl text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Dézoomer"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setPan({ x: 140, y: 100 });
                setZoom(1);
              }}
              className="p-2 rounded-xl text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Recentrer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono text-[11px] text-zinc-400">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          {/* Quick Presets Overlay */}
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider hidden sm:inline">
              Modèles :
            </span>
            <button
              type="button"
              onClick={() => {
                const onCol = createGraphNode('OnCollision', 80, 100);
                const sound = createGraphNode('PlaySound', 360, 80, { sound: 'coin' });
                const setVar = createGraphNode('SetVariable', 640, 80, {
                  variable: 'Score',
                  amount: 10,
                });
                const destroy = createGraphNode('DestroyEntity', 920, 80, { target: 'self' });

                setGraph({
                  enabled: true,
                  nodes: [onCol, sound, setVar, destroy],
                  connections: [
                    {
                      id: `c_${Date.now()}_1`,
                      fromNodeId: onCol.id,
                      fromSocketId: 'out_flow',
                      toNodeId: sound.id,
                      toSocketId: 'in_flow',
                    },
                    {
                      id: `c_${Date.now()}_2`,
                      fromNodeId: sound.id,
                      fromSocketId: 'out_flow',
                      toNodeId: setVar.id,
                      toSocketId: 'in_flow',
                    },
                    {
                      id: `c_${Date.now()}_3`,
                      fromNodeId: setVar.id,
                      fromSocketId: 'out_flow',
                      toNodeId: destroy.id,
                      toSocketId: 'in_flow',
                    },
                  ],
                  variables: { Score: 0 },
                });
              }}
              className="px-2.5 py-1 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs shadow-md backdrop-blur-md transition-colors"
            >
              Pièce d&apos;or (Collectable)
            </button>

            <button
              type="button"
              onClick={() => {
                const onCol = createGraphNode('OnCollision', 80, 100);
                const sound = createGraphNode('PlaySound', 360, 80, { sound: 'jump' });
                const impulse = createGraphNode('ApplyImpulse', 640, 80, { force: 16 });
                const shake = createGraphNode('CameraShake', 920, 80, { intensity: 0.6 });

                setGraph({
                  enabled: true,
                  nodes: [onCol, sound, impulse, shake],
                  connections: [
                    {
                      id: `c_${Date.now()}_1`,
                      fromNodeId: onCol.id,
                      fromSocketId: 'out_flow',
                      toNodeId: sound.id,
                      toSocketId: 'in_flow',
                    },
                    {
                      id: `c_${Date.now()}_2`,
                      fromNodeId: sound.id,
                      fromSocketId: 'out_flow',
                      toNodeId: impulse.id,
                      toSocketId: 'in_flow',
                    },
                    {
                      id: `c_${Date.now()}_3`,
                      fromNodeId: impulse.id,
                      fromSocketId: 'out_flow',
                      toNodeId: shake.id,
                      toSocketId: 'in_flow',
                    },
                  ],
                  variables: {},
                });
              }}
              className="px-2.5 py-1 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs shadow-md backdrop-blur-md transition-colors"
            >
              Tremplin Saut
            </button>

            <button
              type="button"
              onClick={() => {
                const onClickNode = createGraphNode('OnClick', 80, 100);
                const toggle = createGraphNode('Toggle', 360, 80);
                const colorA = createGraphNode('SetColor', 640, 60, { color: '#10b981' });
                const colorB = createGraphNode('SetColor', 640, 240, { color: '#ef4444' });

                setGraph({
                  enabled: true,
                  nodes: [onClickNode, toggle, colorA, colorB],
                  connections: [
                    {
                      id: `c_${Date.now()}_1`,
                      fromNodeId: onClickNode.id,
                      fromSocketId: 'out_flow',
                      toNodeId: toggle.id,
                      toSocketId: 'in_flow',
                    },
                    {
                      id: `c_${Date.now()}_2`,
                      fromNodeId: toggle.id,
                      fromSocketId: 'out_on',
                      toNodeId: colorA.id,
                      toSocketId: 'in_flow',
                    },
                    {
                      id: `c_${Date.now()}_3`,
                      fromNodeId: toggle.id,
                      fromSocketId: 'out_off',
                      toNodeId: colorB.id,
                      toSocketId: 'in_flow',
                    },
                  ],
                  variables: {},
                });
              }}
              className="px-2.5 py-1 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs shadow-md backdrop-blur-md transition-colors"
            >
              Bascule Couleur (Toggle)
            </button>
          </div>

          {/* SVG Canvas for Bezier Connection Cables (Fils) */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
          >
            <defs>
              <filter id="wire-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Render established connections with exact socket coordinates */}
            {graph.connections.map((conn) => {
              const fromNode = graph.nodes.find((n) => n.id === conn.fromNodeId);
              const toNode = graph.nodes.find((n) => n.id === conn.toNodeId);
              if (!fromNode || !toNode) return null;

              const { x: startX, y: startY } = getSocketCoordinates(fromNode, conn.fromSocketId, true);
              const { x: endX, y: endY } = getSocketCoordinates(toNode, conn.toSocketId, false);

              const fromSocket = fromNode.outputs.find((s) => s.id === conn.fromSocketId);
              const socketType = fromSocket?.type || 'flow';
              const theme = getSocketColor(socketType);

              const dx = Math.max(Math.abs(endX - startX) * 0.55, 45);
              const path = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;
              const isHovered = hoveredConnId === conn.id;

              return (
                <g
                  key={conn.id}
                  className="pointer-events-auto group cursor-pointer"
                  onMouseEnter={() => setHoveredConnId(conn.id)}
                  onMouseLeave={() => setHoveredConnId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConnection(conn.id);
                  }}
                >
                  {/* Invisible thicker stroke for smooth hovering/clicking */}
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={20}
                  />

                  {/* Outer glow aura */}
                  <path
                    d={path}
                    fill="none"
                    stroke={isHovered ? '#f43f5e' : theme.glow}
                    strokeWidth={isHovered ? 8 : 6}
                    strokeLinecap="round"
                    className="transition-all duration-150"
                  />

                  {/* Core wire line */}
                  <path
                    d={path}
                    fill="none"
                    stroke={isHovered ? '#fb7185' : theme.stroke}
                    strokeWidth={socketType === 'flow' ? 3.5 : 2.5}
                    strokeLinecap="round"
                    strokeDasharray={socketType === 'flow' ? undefined : undefined}
                    className="transition-colors duration-150 drop-shadow"
                  />

                  {/* Midpoint cross/badge on hover for intuitive deletion */}
                  {isHovered && (
                    <g transform={`translate(${(startX + endX) / 2}, ${(startY + endY) / 2})`}>
                      <circle r={10} fill="#e11d48" className="shadow-lg" />
                      <line x1="-3" y1="-3" x2="3" y2="3" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                      <line x1="3" y1="-3" x2="-3" y2="3" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                    </g>
                  )}
                </g>
              );
            })}

            {/* Currently dragging new connection wire */}
            {connectingStart && (() => {
              const startNode = graph.nodes.find((n) => n.id === connectingStart.nodeId);
              if (!startNode) return null;

              const { x: startX, y: startY } = getSocketCoordinates(
                startNode,
                connectingStart.socketId,
                connectingStart.isOutput
              );

              const endX = mousePos.x;
              const endY = mousePos.y;
              const dx = Math.max(Math.abs(endX - startX) * 0.55, 45);
              const theme = getSocketColor(connectingStart.type);

              const path = connectingStart.isOutput
                ? `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`
                : `M ${endX} ${endY} C ${endX + dx} ${endY}, ${startX - dx} ${startY}, ${startX} ${startY}`;

              return (
                <g>
                  <path
                    d={path}
                    fill="none"
                    stroke={theme.stroke}
                    strokeWidth={3}
                    strokeDasharray="6,4"
                    strokeLinecap="round"
                    className="animate-pulse"
                  />
                  <circle cx={endX} cy={endY} r={5} fill={theme.stroke} className="shadow-lg" />
                </g>
              );
            })()}
          </svg>

          {/* Graph Nodes Layer */}
          <div
            className="absolute inset-0 origin-top-left"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            {graph.nodes.map((node) => {
              const theme = getCategoryTheme(node.category);
              const isSelected = selectedNodeId === node.id;
              const isDebugActive = visualDebuggerActive && activeDebugNodeIds.has(node.id);

              return (
                <div
                  key={node.id}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelectedNodeId(node.id);
                    setDraggingNodeId(node.id);
                    const rect = containerRef.current!.getBoundingClientRect();
                    setDragOffset({
                      x: (e.clientX - rect.left - pan.x) / zoom - node.position.x,
                      y: (e.clientY - rect.top - pan.y) / zoom - node.position.y,
                    });
                  }}
                  style={{
                    transform: `translate(${node.position.x}px, ${node.position.y}px)`,
                    width: `${NODE_WIDTH}px`,
                  }}
                  className={`absolute rounded-2xl border backdrop-blur-xl transition-shadow select-none shadow-xl ${
                    theme.bg
                  } ${
                    isDebugActive
                      ? 'ring-4 ring-emerald-400 shadow-[0_0_25px_rgba(52,211,153,0.7)] z-40 animate-pulse border-emerald-300'
                      : isSelected
                      ? 'ring-2 ring-violet-400 shadow-2xl z-30'
                      : 'hover:border-zinc-500/70 z-20'
                  }`}
                >
                  {/* Node Header */}
                  <div className={`flex items-center justify-between px-3 py-2 border-b rounded-t-2xl ${theme.header}`}>
                    <div className="flex items-center gap-1.5">
                      {node.category === 'event' && <Zap className="w-3.5 h-3.5 text-violet-300" />}
                      {node.category === 'logic' && <Split className="w-3.5 h-3.5 text-amber-300" />}
                      {node.category === 'action' && <Sparkles className="w-3.5 h-3.5 text-emerald-300" />}
                      <span className="text-xs font-semibold text-zinc-100 truncate max-w-[120px]">
                        {node.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {isDebugActive && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-300 font-bold font-mono animate-bounce">
                          ⚡ LIVE
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNode(node.id);
                        }}
                        className="p-1 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/60 transition-colors"
                        title="Supprimer le nœud"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Sockets Rows */}
                  <div className="p-2.5 space-y-1">
                    {/* Aligned Sockets List */}
                    {Array.from({
                      length: Math.max(node.inputs.length, node.outputs.length, 1),
                    }).map((_, rowIndex) => {
                      const inputSocket = node.inputs[rowIndex];
                      const outputSocket = node.outputs[rowIndex];

                      const inputColor = inputSocket ? getSocketColor(inputSocket.type) : null;
                      const outputColor = outputSocket ? getSocketColor(outputSocket.type) : null;

                      return (
                        <div
                          key={`row_${rowIndex}`}
                          className="flex items-center justify-between h-7 text-[11px]"
                        >
                          {/* Left: Input socket */}
                          {inputSocket ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSocketClick(node.id, inputSocket, false);
                                }}
                                className={`w-3.5 h-3.5 rounded-full border-2 border-zinc-950 transition-transform hover:scale-130 shadow ${inputColor?.bg}`}
                                title={`Entrée: ${inputSocket.name} (${inputSocket.type})`}
                              />
                              <span className="text-zinc-300 font-medium text-[11px] truncate max-w-[85px]">
                                {inputSocket.name}
                              </span>
                            </div>
                          ) : (
                            <div />
                          )}

                          {/* Right: Output socket */}
                          {outputSocket ? (
                            <div className="flex items-center gap-1.5 ml-auto">
                              <span className="text-zinc-300 font-medium text-[11px] truncate max-w-[85px]">
                                {outputSocket.name}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSocketClick(node.id, outputSocket, true);
                                }}
                                className={`w-3.5 h-3.5 rounded-full border-2 border-zinc-950 transition-transform hover:scale-130 shadow ${outputColor?.bg}`}
                                title={`Sortie: ${outputSocket.name} (${outputSocket.type})`}
                              />
                            </div>
                          ) : (
                            <div />
                          )}
                        </div>
                      );
                    })}

                    {/* Inline Config Controls for Specific Nodes */}
                    {node.type === 'Gate' && (
                      <div className="pt-2 border-t border-zinc-800/80">
                        <label className="text-[10px] text-zinc-400 block mb-1">Type de Porte</label>
                        <select
                          value={node.values.gate || 'AND'}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'gate', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs focus:outline-none focus:border-amber-500"
                        >
                          <option value="AND">ET (AND)</option>
                          <option value="OR">OU (OR)</option>
                          <option value="NOT">NON (NOT)</option>
                          <option value="XOR">OU Exclusif (XOR)</option>
                        </select>
                      </div>
                    )}

                    {node.type === 'Math' && (
                      <div className="pt-2 border-t border-zinc-800/80">
                        <label className="text-[10px] text-zinc-400 block mb-1">Opération</label>
                        <select
                          value={node.values.operation || '+'}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'operation', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs focus:outline-none focus:border-amber-500"
                        >
                          <option value="+">Addition (+)</option>
                          <option value="-">Soustraction (-)</option>
                          <option value="*">Multiplication (*)</option>
                          <option value="/">Division (/)</option>
                          <option value="%">Modulo (%)</option>
                        </select>
                      </div>
                    )}

                    {node.type === 'Compare' && (
                      <div className="pt-2 border-t border-zinc-800/80">
                        <label className="text-[10px] text-zinc-400 block mb-1">Opérateur</label>
                        <select
                          value={node.values.operator || '=='}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'operator', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs focus:outline-none focus:border-amber-500"
                        >
                          <option value="==">Égal (==)</option>
                          <option value="!=">Différent (!=)</option>
                          <option value=">">Supérieur (&gt;)</option>
                          <option value="<">Inférieur (&lt;)</option>
                          <option value=">=">Supérieur ou Égal (&gt;=)</option>
                          <option value="<=">Inférieur ou Égal (&lt;=)</option>
                        </select>
                      </div>
                    )}

                    {node.type === 'Delay' && (
                      <div className="pt-2 border-t border-zinc-800/80">
                        <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                          <span>Durée d&apos;attente</span>
                          <span className="font-mono text-zinc-200">{node.values.duration ?? 1}s</span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="10"
                          step="0.1"
                          value={node.values.duration ?? 1}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'duration', parseFloat(e.target.value))}
                          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                        />
                      </div>
                    )}

                    {node.type === 'SetPosition' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1">
                        <label className="text-[10px] text-zinc-400 block">Position (X, Y, Z)</label>
                        <div className="grid grid-cols-3 gap-1">
                          <input
                            type="number"
                            value={node.values.posX ?? 0}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'posX', parseFloat(e.target.value))}
                            className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-center"
                            placeholder="X"
                          />
                          <input
                            type="number"
                            value={node.values.posY ?? 0}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'posY', parseFloat(e.target.value))}
                            className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-center"
                            placeholder="Y"
                          />
                          <input
                            type="number"
                            value={node.values.posZ ?? 0}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'posZ', parseFloat(e.target.value))}
                            className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-center"
                            placeholder="Z"
                          />
                        </div>
                      </div>
                    )}

                    {node.type === 'SetColor' && (
                      <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                        <label className="text-[10px] text-zinc-400">Couleur Cible</label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={node.values.color || '#10b981'}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'color', e.target.value)}
                            className="w-6 h-6 rounded border border-zinc-700 bg-transparent cursor-pointer"
                          />
                          <span className="font-mono text-xs text-zinc-300">{node.values.color || '#10b981'}</span>
                        </div>
                      </div>
                    )}

                    {node.type === 'PlaySound' && (
                      <div className="pt-2 border-t border-zinc-800/80">
                        <label className="text-[10px] text-zinc-400 block mb-1">Preset Audio</label>
                        <select
                          value={node.values.sound || 'coin'}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'sound', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs focus:outline-none focus:border-emerald-500"
                        >
                          <option value="coin">Pièce (Coin)</option>
                          <option value="jump">Saut (Jump)</option>
                          <option value="hit">Impact (Hit)</option>
                          <option value="powerup">Powerup</option>
                          <option value="laser">Laser</option>
                          <option value="chime">Carillon (Chime)</option>
                          <option value="explosion">Explosion</option>
                          <option value="warp">Téléportation (Warp)</option>
                        </select>
                      </div>
                    )}

                    {node.type === 'SetVariable' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={node.values.variable || 'Score'}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'variable', e.target.value)}
                            placeholder="Variable"
                            className="w-1/2 px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                          />
                          <input
                            type="number"
                            value={node.values.amount ?? 10}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'amount', parseFloat(e.target.value))}
                            className="w-1/2 px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                          />
                        </div>
                      </div>
                    )}

                    {node.type === 'EmitParticles' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <label className="text-[10px] text-zinc-400 block">Effet de Particules (Preset)</label>
                        <select
                          value={node.values.preset || 'fire'}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'preset', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs focus:outline-none focus:border-amber-500"
                        >
                          <option value="fire">🔥 Feu (Fire)</option>
                          <option value="smoke">💨 Fumée (Smoke)</option>
                          <option value="sparks">✨ Étincelles (Sparks)</option>
                          <option value="rain">🌧️ Pluie (Rain)</option>
                          <option value="snow">❄️ Neige (Snow)</option>
                          <option value="cosmic_dust">🌌 Poussière Cosmique (Cosmic Dust)</option>
                          <option value="explosion">💥 Explosion (Burst)</option>
                        </select>
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>Débit (part/sec)</span>
                          <input
                            type="number"
                            min="1"
                            max="500"
                            value={node.values.rate ?? 50}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'rate', parseInt(e.target.value) || 50)}
                            className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                          />
                        </div>
                      </div>
                    )}

                    {node.type === 'ExplosionFX' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <div className="flex justify-between text-[10px] text-zinc-400">
                          <span>Échelle (Taille)</span>
                          <span className="font-mono text-zinc-200">{node.values.scale ?? 1.0}x</span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="4.0"
                          step="0.1"
                          value={node.values.scale ?? 1.0}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'scale', parseFloat(e.target.value))}
                          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                        />
                        <div className="flex justify-between text-[10px] text-zinc-400">
                          <span>Force de Projection</span>
                          <span className="font-mono text-zinc-200">{node.values.force ?? 10}</span>
                        </div>
                        <input
                          type="range"
                          min="2"
                          max="25"
                          step="1"
                          value={node.values.force ?? 10}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'force', parseFloat(e.target.value))}
                          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-rose-400"
                        />
                      </div>
                    )}

                    {node.type === 'StopParticles' && (
                      <div className="pt-2 border-t border-zinc-800/80">
                        <label className="text-[10px] text-zinc-400 block mb-1">Preset à Arrêter</label>
                        <select
                          value={node.values.preset || 'fire'}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'preset', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs focus:outline-none focus:border-rose-500"
                        >
                          <option value="fire">🔥 Feu</option>
                          <option value="smoke">💨 Fumée</option>
                          <option value="sparks">✨ Étincelles</option>
                          <option value="rain">🌧️ Pluie</option>
                          <option value="snow">❄️ Neige</option>
                          <option value="cosmic_dust">🌌 Poussière Cosmique</option>
                          <option value="explosion">💥 Explosion</option>
                        </select>
                      </div>
                    )}

                    {(node.type === 'OnKeyPress' ||
                      node.type === 'OnKeyRelease' ||
                      node.type === 'IsKeyDown') && (
                      <KeyPicker
                        value={node.values.key ?? 'Space'}
                        onChange={(v) => handleUpdateNodeValue(node.id, 'key', v)}
                      />
                    )}

                    {node.type === 'ReadMoveAxis' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                          Touches lues en physique — « W » ci-dessous est la touche
                          <em> W</em> du QWERTY, qui affiche <em>Z</em> en AZERTY.
                        </p>
                        <KeyPicker
                          label="Avancer"
                          value={node.values.forward ?? 'KeyW'}
                          onChange={(v) => handleUpdateNodeValue(node.id, 'forward', v)}
                        />
                        <KeyPicker
                          label="Reculer"
                          value={node.values.back ?? 'KeyS'}
                          onChange={(v) => handleUpdateNodeValue(node.id, 'back', v)}
                        />
                        <KeyPicker
                          label="Gauche"
                          value={node.values.left ?? 'KeyA'}
                          onChange={(v) => handleUpdateNodeValue(node.id, 'left', v)}
                        />
                        <KeyPicker
                          label="Droite"
                          value={node.values.right ?? 'KeyD'}
                          onChange={(v) => handleUpdateNodeValue(node.id, 'right', v)}
                        />
                        <KeyPicker
                          label="Sprint"
                          value={node.values.sprint ?? 'ShiftLeft'}
                          onChange={(v) => handleUpdateNodeValue(node.id, 'sprint', v)}
                        />
                      </div>
                    )}

                    {node.type === 'MoveByAxis' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <label className="text-[10px] text-zinc-400 block">Objet à déplacer</label>
                        <input
                          type="text"
                          list="aether-entity-names"
                          value={node.values.target ?? 'self'}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'target', e.target.value)}
                          placeholder="self (soi-même) ou nom d'objet"
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                        />
                        <datalist id="aether-entity-names">
                          <option value="self" />
                          {entityNames.map((n) => (
                            <option key={n} value={n} />
                          ))}
                        </datalist>

                        <label className="text-[10px] text-zinc-400 block">Pilotage</label>
                        <select
                          value={node.values.trigger ?? 'auto'}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'trigger', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                        >
                          <option value="auto">Auto (recommandé)</option>
                          <option value="key">Touche appuyée (OnKeyPress)</option>
                          <option value="axis">Axe lu (ReadMoveAxis)</option>
                        </select>
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                          {node.values.trigger === 'key'
                            ? 'Branchez OnKeyPress ici : la touche appuyée décide du sens.'
                            : node.values.trigger === 'axis'
                              ? 'Branchez ReadMoveAxis (depuis OnUpdate) pour un déplacement continu au maintien.'
                              : 'Détecte tout seul : avec ReadMoveAxis au maintien, sinon un pas par appui.'}
                        </p>

                        {(node.values.trigger ?? 'auto') !== 'axis' && (
                          <div className="space-y-0.5">
                            <KeyPicker
                              label="Touche « Avancer »"
                              value={node.values.forwardKey ?? 'KeyW'}
                              onChange={(v) => handleUpdateNodeValue(node.id, 'forwardKey', v)}
                            />
                            <KeyPicker
                              label="Touche « Reculer »"
                              value={node.values.backKey ?? 'KeyS'}
                              onChange={(v) => handleUpdateNodeValue(node.id, 'backKey', v)}
                            />
                            <KeyPicker
                              label="Touche « Gauche »"
                              value={node.values.leftKey ?? 'KeyA'}
                              onChange={(v) => handleUpdateNodeValue(node.id, 'leftKey', v)}
                            />
                            <KeyPicker
                              label="Touche « Droite »"
                              value={node.values.rightKey ?? 'KeyD'}
                              onChange={(v) => handleUpdateNodeValue(node.id, 'rightKey', v)}
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>
                            {(node.values.trigger ?? 'auto') === 'key' ? 'Distance par appui' : 'Vitesse'}
                          </span>
                          {(node.values.trigger ?? 'auto') === 'key' ? (
                            <input
                              type="number"
                              min="0.1"
                              step="0.1"
                              value={node.values.step ?? 1}
                              onChange={(e) =>
                                handleUpdateNodeValue(node.id, 'step', parseFloat(e.target.value) || 1)
                              }
                              className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                            />
                          ) : (
                            <span className="font-mono text-zinc-200">{node.values.speed ?? 5} u/s</span>
                          )}
                        </div>
                        {(node.values.trigger ?? 'auto') !== 'key' && (
                          <input
                            type="range"
                            min="0.5"
                            max="30"
                            step="0.5"
                            value={node.values.speed ?? 5}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'speed', parseFloat(e.target.value))}
                            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                          />
                        )}

                        <label className="text-[10px] text-zinc-400 block">Repère de déplacement</label>
                        <select
                          value={node.values.mode ?? 'self'}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'mode', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                        >
                          <option value="self">Selon l&apos;orientation de l&apos;objet</option>
                          <option value="camera">Selon la caméra (vue du joueur)</option>
                          <option value="world">Axe du monde (X / Z)</option>
                        </select>

                        <label className="flex items-center gap-2 text-[10px] text-zinc-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={node.values.faceHeading !== false}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'faceHeading', e.target.checked)}
                            className="accent-emerald-400"
                          />
                          Pivoter l&apos;objet dans sa direction
                        </label>
                      </div>
                    )}

                    {node.type === 'SetGravity' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <label className="text-[10px] text-zinc-400 block">Objet</label>
                        <input
                          type="text"
                          list="aether-entity-names"
                          value={node.values.target ?? 'self'}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'target', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                        />
                        <label className="text-[10px] text-zinc-400 block">
                          Pesanteur : {node.values.scale ?? 0.166}× la Terre
                        </label>
                        <input
                          type="range" min="0" max="3" step="0.01"
                          value={node.values.scale ?? 0.166}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'scale', parseFloat(e.target.value))}
                          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                        />
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {GRAVITY_PRESETS.map((p) => (
                            <button
                              key={p.label}
                              type="button"
                              title={p.hint}
                              onClick={() => handleUpdateNodeValue(node.id, 'scale', p.scale)}
                              className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[9px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {node.type === 'SetDrag' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <label className="text-[10px] text-zinc-400 block">Objet</label>
                        <input
                          type="text"
                          list="aether-entity-names"
                          value={node.values.target ?? 'self'}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'target', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                        />
                        <label className="text-[10px] text-zinc-400 block">
                          Traînée : {node.values.linear ?? 0.4}
                        </label>
                        <input
                          type="range" min="0" max="10" step="0.1"
                          value={node.values.linear ?? 0.4}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'linear', parseFloat(e.target.value))}
                          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                        />
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                          0 = apesanteur, 10 = très freiné. Une plume tombe à ~0,4.
                        </p>
                      </div>
                    )}

                    {node.type === 'SetTimeScale' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <label className="text-[10px] text-zinc-400 block">
                          Échelle du temps : {node.values.scale ?? 0.25}×
                        </label>
                        <input
                          type="range" min="0" max="2" step="0.05"
                          value={node.values.scale ?? 0.25}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'scale', parseFloat(e.target.value))}
                          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                        />
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                          0 = pause, 0,25 = bullet-time, 1 = normal. Agit sur toute la
                          simulation, scripts compris.
                        </p>
                      </div>
                    )}

                    {/* ===== Matières & propriétés physiques ===== */}
                    {(node.type === 'SetSurface' || node.type === 'SetMaterial') && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <label className="text-[10px] text-zinc-400 block">Objet à modifier</label>
                        <input
                          type="text"
                          list="aether-entity-names"
                          value={node.values.target ?? 'self'}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'target', e.target.value)}
                          placeholder="self (soi-même) ou nom d'objet"
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                        />

                        <label className="text-[10px] text-zinc-400 block">Matière</label>
                        <select
                          value={node.values[materialKey(node)] ?? 'default'}
                          onChange={(e) => handleUpdateNodeValue(node.id, materialKey(node), e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                        >
                          {SURFACE_ORDER.map((id) => (
                            <option key={id} value={id}>
                              {SURFACES[id].label}
                            </option>
                          ))}
                        </select>
                        {(() => {
                          const s = SURFACES[(node.values[materialKey(node)] ?? 'default') as SurfaceId];
                          return (
                            <p className="text-[10px] text-zinc-500 leading-relaxed">
                              Friction {s.friction} · Rebond {s.restitution} · Traction{' '}
                              {Math.round(s.traction * 100)} %
                            </p>
                          );
                        })()}
                        <p className="text-[10px] text-amber-500/80 leading-relaxed">
                          L&apos;objet doit avoir un corps physique (onglet Physique) :
                          sans corps, la friction n&apos;a rien sur quoi s&apos;appliquer.
                        </p>
                      </div>
                    )}

                    {node.type === 'HitStop' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>Durée du gel (s)</span>
                          <input
                            type="number" min="0" max="0.5" step="0.01"
                            value={node.values.duration ?? 0.08}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'duration', parseFloat(e.target.value) || 0.08)}
                            className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                          />
                        </div>
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                          80 ms suffit à donner du poids à un coup. Plafonné à 0,5 s
                          pour ne pas pouvoir figer la partie.
                        </p>
                      </div>
                    )}

                    {node.type === 'Rumble' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>Intensité</span>
                          <input
                            type="number" min="0" max="1" step="0.05"
                            value={node.values.intensity ?? 0.6}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'intensity', parseFloat(e.target.value) || 0.6)}
                            className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>Durée (s)</span>
                          <input
                            type="number" min="0" max="5" step="0.05"
                            value={node.values.duration ?? 0.4}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'duration', parseFloat(e.target.value) || 0.4)}
                            className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                          />
                        </div>
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                          La secousse s&apos;estompe d&apos;elle-même (décroissance
                          quadratique) au lieu de s&apos;arrêter net.
                        </p>
                      </div>
                    )}

                    {node.type === 'FootstepSound' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <label className="text-[10px] text-zinc-400 block">Matière du sol</label>
                        <select
                          value={node.values.surface ?? 'default'}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'surface', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                        >
                          {SURFACE_ORDER.map((id) => (
                            <option key={id} value={id}>
                              {SURFACES[id].label}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>Volume</span>
                          <input
                            type="number" min="0" max="1" step="0.05"
                            value={node.values.volume ?? 0.6}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'volume', parseFloat(e.target.value) || 0.6)}
                            className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                          />
                        </div>
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                          Branchez ce nœud à la sortie « Atterrissage » d&apos;un
                          capteur, ou à un pas régulier.
                        </p>
                      </div>
                    )}

                    {node.type === 'SlowFollow' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <label className="text-[10px] text-zinc-400 block">Objet à suivre</label>
                        <input
                          type="text"
                          list="aether-entity-names"
                          value={node.values.target ?? 'self'}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'target', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                        />

                        <label className="text-[10px] text-zinc-400 block">Style de traîne</label>
                        <div className="flex flex-wrap gap-1">
                          {(['tight', 'sprint', 'cinematic', 'drift'] as const).map((s) => (
                            <button
                              key={s}
                              type="button"
                              title={TRAIL_PRESETS[s].label}
                              onClick={() => handleUpdateNodeValue(node.id, 'style', s)}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-medium border transition-colors ${
                                (node.values.style ?? 'sprint') === s
                                  ? 'bg-violet-950/60 border-violet-700 text-violet-200'
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>

                        <label className="text-[10px] text-zinc-400 block">
                          Retard — {node.values.smoothing ?? 6} (haut = collé)
                        </label>
                        <input
                          type="range" min="0.1" max="20" step="0.1"
                          value={node.values.smoothing ?? 6}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'smoothing', parseFloat(e.target.value))}
                          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                        />
                        <label className="text-[10px] text-zinc-400 block">
                          Avance — {node.values.lookAhead ?? 1.2}
                        </label>
                        <input
                          type="range" min="0" max="5" step="0.1"
                          value={node.values.lookAhead ?? 1.2}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'lookAhead', parseFloat(e.target.value))}
                          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                        />
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                          L&apos;avance fait regarder la caméra « devant » la cible :
                          sans elle, un objet arrêté ne donne aucune indication de
                          vitesse.
                        </p>
                      </div>
                    )}

                    {/* ===== Capteurs : atterrissage & matière ===== */}
                    {node.type === 'OnLand' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>Vitesse min (m/s)</span>
                          <input
                            type="number" min="0" max="30" step="0.5"
                            value={node.values.minSpeed ?? 1}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'minSpeed', parseFloat(e.target.value) || 1)}
                            className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                          />
                        </div>
                        <label className="text-[10px] text-zinc-400 block">Matière attendue</label>
                        <select
                          value={node.values.surface ?? '*'}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'surface', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                        >
                          <option value="*">N&apos;importe laquelle</option>
                          {SURFACE_ORDER.map((id) => (
                            <option key={id} value={id}>
                              {SURFACES[id].label}
                            </option>
                          ))}
                        </select>
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                          « Doux » / « Violent » bascule à mi-force, soit ~6 m/s
                          (≈ 22 km/h). Nécessite un corps physique.
                        </p>
                      </div>
                    )}

                    {(node.type === 'OnSurfaceEnter' || node.type === 'OnSurfaceExit') && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <label className="text-[10px] text-zinc-400 block">Matière écoutée</label>
                        <select
                          value={node.values.surface ?? '*'}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'surface', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                        >
                          <option value="*">N&apos;importe laquelle</option>
                          {SURFACE_ORDER.map((id) => (
                            <option key={id} value={id}>
                              {SURFACES[id].label}
                            </option>
                          ))}
                        </select>
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                          Se déclenche quand la matière du graphe change via
                          « Matière du Sol ».
                        </p>
                      </div>
                    )}

                    {/* ===== Pack Universel : réglages inline ===== */}
                    {node.type === 'TakeDamage' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>Dégâts (PV)</span>
                          <input
                            type="number" min="1" max="999"
                            value={node.values.damage ?? 25}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'damage', parseInt(e.target.value) || 25)}
                            className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>Knockback (0 = aucun)</span>
                          <input
                            type="number" min="0" max="50"
                            value={node.values.knockback ?? 0}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'knockback', parseFloat(e.target.value) || 0)}
                            className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                          />
                        </div>
                      </div>
                    )}

                    {node.type === 'Heal' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>Soin (+PV)</span>
                          <input
                            type="number" min="1" max="999"
                            value={node.values.amount ?? 25}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'amount', parseInt(e.target.value) || 25)}
                            className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>PV Maximum</span>
                          <input
                            type="number" min="1" max="9999"
                            value={node.values.maxHP ?? 100}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'maxHP', parseInt(e.target.value) || 100)}
                            className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                          />
                        </div>
                      </div>
                    )}

                    {node.type === 'Respawn' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <label className="flex items-center gap-2 text-[10px] text-zinc-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={node.values.restoreHealth !== false}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'restoreHealth', e.target.checked)}
                            className="accent-emerald-400"
                          />
                          Restaurer la santé
                        </label>
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>PV restaurés</span>
                          <input
                            type="number" min="1" max="9999"
                            value={node.values.health ?? 100}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'health', parseInt(e.target.value) || 100)}
                            className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                          />
                        </div>
                      </div>
                    )}

                    {(node.type === 'WinGame' || node.type === 'LoseGame') && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <input
                          type="text"
                          value={node.values.title || ''}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'title', e.target.value)}
                          placeholder="Titre (VICTOIRE !)"
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-semibold"
                        />
                        <input
                          type="text"
                          value={node.values.message || ''}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'message', e.target.value)}
                          placeholder="Message affiché au joueur"
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                        />
                        <select
                          value={node.values.sound || (node.type === 'WinGame' ? 'powerup' : 'explosion')}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'sound', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                        >
                          <option value="powerup">Powerup</option>
                          <option value="coin">Pièce (Coin)</option>
                          <option value="chime">Carillon (Chime)</option>
                          <option value="explosion">Explosion</option>
                          <option value="hit">Impact (Hit)</option>
                          <option value="warp">Téléportation (Warp)</option>
                        </select>
                      </div>
                    )}

                    {node.type === 'Countdown' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <div className="flex justify-between text-[10px] text-zinc-400">
                          <span>Durée (chaîné à OnUpdate)</span>
                          <span className="font-mono text-zinc-200">{node.values.duration ?? 10}s</span>
                        </div>
                        <input
                          type="range" min="1" max="300" step="1"
                          value={node.values.duration ?? 10}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'duration', parseInt(e.target.value))}
                          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                        />
                        <label className="flex items-center gap-2 text-[10px] text-zinc-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={node.values.loop === true}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'loop', e.target.checked)}
                            className="accent-amber-400"
                          />
                          Répéter en boucle
                        </label>
                      </div>
                    )}

                    {node.type === 'MoveTowards' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <input
                          type="text"
                          value={node.values.targetName || ''}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'targetName', e.target.value)}
                          placeholder="Entité cible (vide = position XYZ)"
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                        />
                        <div className="grid grid-cols-3 gap-1">
                          <input
                            type="number"
                            value={node.values.posX ?? 0}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'posX', parseFloat(e.target.value))}
                            className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-center"
                            placeholder="X"
                          />
                          <input
                            type="number"
                            value={node.values.posY ?? 0}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'posY', parseFloat(e.target.value))}
                            className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-center"
                            placeholder="Y"
                          />
                          <input
                            type="number"
                            value={node.values.posZ ?? 0}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'posZ', parseFloat(e.target.value))}
                            className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-center"
                            placeholder="Z"
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>Vitesse</span>
                          <input
                            type="number" min="0.1" max="50" step="0.5"
                            value={node.values.speed ?? 4}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'speed', parseFloat(e.target.value) || 4)}
                            className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                          />
                        </div>
                      </div>
                    )}

                    {(node.type === 'FleeFrom' || node.type === 'Wander' || node.type === 'MeleeAttack' || node.type === 'CameraFollow') && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        {(node.type === 'FleeFrom' || node.type === 'Wander') && (
                          <div className="flex items-center justify-between text-[10px] text-zinc-400">
                            <span>Vitesse</span>
                            <input
                              type="number" min="0.1" max="50" step="0.5"
                              value={node.values.speed ?? (node.type === 'Wander' ? 2 : 4)}
                              onChange={(e) => handleUpdateNodeValue(node.id, 'speed', parseFloat(e.target.value) || 2)}
                              className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                            />
                          </div>
                        )}
                        {node.type === 'FleeFrom' && (
                          <div className="flex items-center justify-between text-[10px] text-zinc-400">
                            <span>Distance sécurité</span>
                            <input
                              type="number" min="1" max="100"
                              value={node.values.safeDistance ?? 8}
                              onChange={(e) => handleUpdateNodeValue(node.id, 'safeDistance', parseFloat(e.target.value) || 8)}
                              className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                            />
                          </div>
                        )}
                        {node.type === 'Wander' && (
                          <>
                            <div className="flex items-center justify-between text-[10px] text-zinc-400">
                              <span>Rayon (m)</span>
                              <input
                                type="number" min="1" max="100"
                                value={node.values.radius ?? 6}
                                onChange={(e) => handleUpdateNodeValue(node.id, 'radius', parseFloat(e.target.value) || 6)}
                                className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                              />
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-zinc-400">
                              <span>Changement dir. (s)</span>
                              <input
                                type="number" min="0.5" max="30" step="0.5"
                                value={node.values.changeInterval ?? 3}
                                onChange={(e) => handleUpdateNodeValue(node.id, 'changeInterval', parseFloat(e.target.value) || 3)}
                                className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                              />
                            </div>
                          </>
                        )}
                        {node.type === 'MeleeAttack' && (
                          <>
                            <div className="flex items-center justify-between text-[10px] text-zinc-400">
                              <span>Dégâts</span>
                              <input
                                type="number" min="1" max="999"
                                value={node.values.damage ?? 15}
                                onChange={(e) => handleUpdateNodeValue(node.id, 'damage', parseInt(e.target.value) || 15)}
                                className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                              />
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-zinc-400">
                              <span>Portée (m)</span>
                              <input
                                type="number" min="0.5" max="30" step="0.5"
                                value={node.values.range ?? 2.5}
                                onChange={(e) => handleUpdateNodeValue(node.id, 'range', parseFloat(e.target.value) || 2.5)}
                                className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                              />
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-zinc-400">
                              <span>Cooldown (s)</span>
                              <input
                                type="number" min="0.1" max="30" step="0.1"
                                value={node.values.cooldown ?? 1}
                                onChange={(e) => handleUpdateNodeValue(node.id, 'cooldown', parseFloat(e.target.value) || 1)}
                                className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                              />
                            </div>
                          </>
                        )}
                        {node.type === 'CameraFollow' && (
                          <>
                            <div className="flex items-center justify-between text-[10px] text-zinc-400">
                              <span>Distance (m)</span>
                              <input
                                type="number" min="1" max="60" step="0.5"
                                value={node.values.distance ?? 7}
                                onChange={(e) => handleUpdateNodeValue(node.id, 'distance', parseFloat(e.target.value) || 7)}
                                className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                              />
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-zinc-400">
                              <span>Hauteur (m)</span>
                              <input
                                type="number" min="0" max="40" step="0.5"
                                value={node.values.height ?? 4}
                                onChange={(e) => handleUpdateNodeValue(node.id, 'height', parseFloat(e.target.value) || 4)}
                                className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {node.type === 'ShowMessage' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                        <input
                          type="text"
                          value={node.values.message || ''}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'message', e.target.value)}
                          placeholder="Message HUD"
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                        />
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>Durée (ms)</span>
                          <input
                            type="number" min="500" max="30000" step="500"
                            value={node.values.duration ?? 2500}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'duration', parseInt(e.target.value) || 2500)}
                            className="w-20 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-right"
                          />
                        </div>
                      </div>
                    )}

                    {(node.type === 'SaveGame' || node.type === 'LoadGame') && (
                      <div className="pt-2 border-t border-zinc-800/80">
                        <label className="text-[10px] text-zinc-400 block mb-1">Slot de sauvegarde</label>
                        <input
                          type="text"
                          value={node.values.slot || 'slot1'}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'slot', e.target.value || 'slot1')}
                          placeholder="slot1"
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-mono"
                        />
                      </div>
                    )}

                    {node.type === 'ToggleVisibility' && (
                      <div className="pt-2 border-t border-zinc-800/80">
                        <label className="text-[10px] text-zinc-400 block mb-1">Cible (self = cet objet)</label>
                        <input
                          type="text"
                          value={node.values.target || 'self'}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'target', e.target.value || 'self')}
                          placeholder="self ou NomEntité"
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                        />
                      </div>
                    )}

                    {node.type === 'ApplyImpulse' && (
                      <div className="pt-2 border-t border-zinc-800/80">
                        <div className="flex justify-between text-[10px] text-zinc-400">
                          <span>Force d&apos;impulsion</span>
                          <span className="font-mono text-zinc-200">{node.values.force ?? 10}</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="30"
                          value={node.values.force ?? 10}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'force', parseFloat(e.target.value))}
                          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                        />
                      </div>
                    )}

                    {node.type === 'PlayAnimation' && (
                      <div className="pt-2 border-t border-zinc-800/80">
                        <label className="text-[10px] text-zinc-400 block mb-1">Animation</label>
                        <select
                          value={node.values.anim || 'spin'}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'anim', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                        >
                          <option value="spin">Rotation continue</option>
                          <option value="bounce">Rebond flottant</option>
                          <option value="pulse">Impulsion taille</option>
                          <option value="patrol">Aller-retour Patrouille</option>
                        </select>
                      </div>
                    )}

                    {node.type === 'PrintLog' && (
                      <div className="pt-2 border-t border-zinc-800/80">
                        <label className="text-[10px] text-zinc-400 block mb-1">Message</label>
                        <input
                          type="text"
                          value={node.values.message || ''}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'message', e.target.value)}
                          placeholder="Message à afficher..."
                          className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs"
                        />
                      </div>
                    )}

                    {/* Environmental Physics Nodes Controls */}
                    {node.type === 'SetWind' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                        <div className="flex justify-between text-[10px] text-zinc-400">
                          <span>Vitesse du Vent</span>
                          <span className="font-mono text-zinc-200">{node.values.speed ?? 35} km/h</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="120"
                          step="1"
                          value={node.values.speed ?? 35}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'speed', parseFloat(e.target.value))}
                          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                        />
                        <div className="flex justify-between text-[10px] text-zinc-400">
                          <span>Turbulence / Rafales</span>
                          <span className="font-mono text-zinc-200">{Math.round((node.values.gustiness ?? 0.5) * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={node.values.gustiness ?? 0.5}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'gustiness', parseFloat(e.target.value))}
                          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                        />
                      </div>
                    )}

                    {node.type === 'ApplyWindForce' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                        <div className="flex justify-between text-[10px] text-zinc-400">
                          <span>Force de Poussée</span>
                          <span className="font-mono text-zinc-200">{node.values.force ?? 25} N</span>
                        </div>
                        <input
                          type="range"
                          min="5"
                          max="150"
                          step="5"
                          value={node.values.force ?? 25}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'force', parseFloat(e.target.value))}
                          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                        />
                        <div className="grid grid-cols-3 gap-1">
                          <label className="col-span-3 text-[10px] text-zinc-400">Direction (X, Y, Z)</label>
                          <input
                            type="number"
                            value={node.values.dirX ?? 0}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'dirX', parseFloat(e.target.value))}
                            className="px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-center"
                            placeholder="DirX"
                          />
                          <input
                            type="number"
                            value={node.values.dirY ?? 1}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'dirY', parseFloat(e.target.value))}
                            className="px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-center"
                            placeholder="DirY"
                          />
                          <input
                            type="number"
                            value={node.values.dirZ ?? 0}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'dirZ', parseFloat(e.target.value))}
                            className="px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs text-center"
                            placeholder="DirZ"
                          />
                        </div>
                      </div>
                    )}

                    {node.type === 'SetRain' && (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                        <label className="flex items-center justify-between text-xs text-zinc-300">
                          <span>Activer Précipitations</span>
                          <input
                            type="checkbox"
                            checked={node.values.enabled !== false}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'enabled', e.target.checked)}
                            className="w-4 h-4 rounded text-blue-500 bg-zinc-900 border-zinc-700"
                          />
                        </label>
                        <div className="flex justify-between text-[10px] text-zinc-400">
                          <span>Intensité Pluie</span>
                          <span className="font-mono text-zinc-200">{Math.round((node.values.intensity ?? 0.6) * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="1.0"
                          step="0.05"
                          value={node.values.intensity ?? 0.6}
                          onChange={(e) => handleUpdateNodeValue(node.id, 'intensity', parseFloat(e.target.value))}
                          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-400"
                        />
                        <label className="flex items-center justify-between text-xs text-zinc-300">
                          <span>Orage & Éclairs</span>
                          <input
                            type="checkbox"
                            checked={Boolean(node.values.isThunder)}
                            onChange={(e) => handleUpdateNodeValue(node.id, 'isThunder', e.target.checked)}
                            className="w-4 h-4 rounded text-amber-500 bg-zinc-900 border-zinc-700"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Status & Action Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800/80 bg-zinc-900/90">
          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <span>
              <strong className="text-zinc-200">{graph.nodes.length}</strong> nœuds
            </span>
            <span>
              <strong className="text-zinc-200">{graph.connections.length}</strong> fils connectés
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Graphe synchrone
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                SoundEngine.play('coin');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
            >
              <Play className="w-3.5 h-3.5 text-emerald-400" />
              <span>Tester Audio</span>
            </button>

            <button
              type="button"
              onClick={handleSaveAndClose}
              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all"
            >
              Enregistrer le Graphe
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
