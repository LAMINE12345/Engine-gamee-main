'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Settings2,
  Play,
  Pause,
  Car,
  Accessibility,
  Dog,
  
  Plus,
  Trash2,
  Check,
  Zap,
  Info,
  Sparkles,
  Upload,
  Download,
  RotateCcw,
  
  
  Activity,
  Sliders,
  Gauge,
  Bone,
  Eye,
  EyeOff,
  ShieldAlert,
  Keyboard,
  Mouse,
} from 'lucide-react';
import {
  SceneNode,
  RigAnimData,
  BlendTreeConfig,
  IKConfig,
  
  RagdollConfig,
  RagdollBoneConfig,
  RagdollBodyPart
} from '../types/engine';
import type { InputManager } from '../lib/physics/CharacterControllerSystem';
import {
  GAMEPLAY_ACTIONS,
  ACTION_META,
  codeLabel,
  type GameplayActionId,
  type MouseLookSettings,
} from '../lib/input/InputBindings';

interface RigStudioModalProps {
  isOpen: boolean;
  node: SceneNode | null;
  onSave: (data: RigAnimData) => void;
  onClose: () => void;
  availableAnimations: string[];
  childNodeNames: string[];
  onAppendAnimations?: (file: File) => Promise<string[]>;
  onTestAnimation?: (clipName: string) => void;
  onStopTestAnimation?: () => void;
  onTestRagdoll?: () => void;
  onToggleDebugWireframes?: (show: boolean) => void;
  /** Live access to the gameplay InputManager (keybindings + mouse-look). */
  getInputManager?: () => InputManager | null;
}

/** Mapping slots that can receive a direct keybinding (gesture actions). */
const SLOT_TO_ACTION: Record<string, GameplayActionId> = {
  attack: 'attack',
  interact: 'interact',
  crouch: 'crouch',
  wave: 'wave',
};

const DEFAULT_BLEND_TREE: BlendTreeConfig = {
  enabled: true,
  mode: '1D_speed',
  walkSpeed: 2.8,
  runSpeed: 6.5,
  sprintSpeed: 9.5,
  damping: 10.0,
  syncPlaybackSpeed: true,
};

const DEFAULT_IK: IKConfig = {
  enabled: true,
  footPlanting: true,
  groundOffset: 0.05,
  chains: [
    { enabled: true, chainName: 'leftArm', rootBone: 'LeftShoulder', middleBone: 'LeftArm', endBone: 'LeftHand', targetOffset: { x: 0, y: 0, z: 0 }, poleVector: { x: 0, y: 1, z: 1 }, weight: 1.0 },
    { enabled: true, chainName: 'rightArm', rootBone: 'RightShoulder', middleBone: 'RightArm', endBone: 'RightHand', targetOffset: { x: 0, y: 0, z: 0 }, poleVector: { x: 0, y: 1, z: 1 }, weight: 1.0 },
    { enabled: true, chainName: 'leftLeg', rootBone: 'LeftUpLeg', middleBone: 'LeftLeg', endBone: 'LeftFoot', targetOffset: { x: 0, y: 0, z: 0 }, poleVector: { x: 0, y: -1, z: 1 }, weight: 1.0 },
    { enabled: true, chainName: 'rightLeg', rootBone: 'RightUpLeg', middleBone: 'RightLeg', endBone: 'RightFoot', targetOffset: { x: 0, y: 0, z: 0 }, poleVector: { x: 0, y: -1, z: 1 }, weight: 1.0 },
  ],
};

const DEFAULT_RAGDOLL: RagdollConfig = {
  enabled: true,
  triggerOnDamage: true,
  triggerOnFall: true,
  fallSpeedThreshold: -10,
  damping: 2.0,
  totalMass: 75,
  autoGetUp: true,
  getUpDelay: 4.0,
  bones: [
    { boneName: 'Hips', part: 'pelvis', radius: 0.16, height: 0.22, massRatio: 0.2 },
    { boneName: 'Spine', part: 'spine', radius: 0.15, height: 0.2, massRatio: 0.12 },
    { boneName: 'Chest', part: 'chest', radius: 0.17, height: 0.25, massRatio: 0.18 },
    { boneName: 'Head', part: 'head', radius: 0.13, height: 0.18, massRatio: 0.08 },
    { boneName: 'LeftArm', part: 'upperArmL', radius: 0.08, height: 0.28, massRatio: 0.05 },
    { boneName: 'LeftForeArm', part: 'lowerArmL', radius: 0.07, height: 0.25, massRatio: 0.04 },
    { boneName: 'RightArm', part: 'upperArmR', radius: 0.08, height: 0.28, massRatio: 0.05 },
    { boneName: 'RightForeArm', part: 'lowerArmR', radius: 0.07, height: 0.25, massRatio: 0.04 },
    { boneName: 'LeftUpLeg', part: 'thighL', radius: 0.1, height: 0.38, massRatio: 0.1 },
    { boneName: 'LeftLeg', part: 'calfL', radius: 0.09, height: 0.35, massRatio: 0.07 },
    { boneName: 'RightUpLeg', part: 'thighR', radius: 0.1, height: 0.38, massRatio: 0.1 },
    { boneName: 'RightLeg', part: 'calfR', radius: 0.09, height: 0.35, massRatio: 0.07 },
  ],
};

const BODY_PART_LABELS: Record<RagdollBodyPart, { label: string; color: string }> = {
  pelvis: { label: 'Bassin / Hips', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  spine: { label: 'Colonne / Spine', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  chest: { label: 'Torse / Chest', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  head: { label: 'Tête / Head', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  upperArmL: { label: 'Bras G / Left Arm', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  lowerArmL: { label: 'Av-Bras G / Left Forearm', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  upperArmR: { label: 'Bras D / Right Arm', color: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  lowerArmR: { label: 'Av-Bras D / Right Forearm', color: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  thighL: { label: 'Cuisse G / Left Thigh', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  calfL: { label: 'Mollet G / Left Shin', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  thighR: { label: 'Cuisse D / Right Thigh', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  calfR: { label: 'Mollet D / Right Shin', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  custom: { label: 'Personnalisé', color: 'bg-zinc-700/50 text-zinc-300 border-zinc-600/50' },
};

export const RigStudioModal: React.FC<RigStudioModalProps> = ({
  isOpen,
  node,
  onSave,
  onClose,
  availableAnimations,
  childNodeNames,
  onAppendAnimations,
  onTestAnimation,
  onStopTestAnimation,
  onTestRagdoll,
  onToggleDebugWireframes,
  getInputManager,
}) => {
  const [activeStudioTab, setActiveStudioTab] = useState<'locomotion' | 'controls' | 'ik' | 'ragdoll' | 'vehicles'>('locomotion');
  const [showWireframes, setShowWireframes] = useState(false);
  const [isRagdollTesting, setIsRagdollTesting] = useState(false);

  const [config, setConfig] = useState<RigAnimData>(() => {
    return node?.rigAnim || {
      enabled: true,
      rigType: 'biped',
      animationMapping: {},
      autoAnimate: true,
      blendTree: { ...DEFAULT_BLEND_TREE },
      ik: { ...DEFAULT_IK },
      ragdoll: { ...DEFAULT_RAGDOLL },
      vehicleWheels: {}
    };
  });

  const [isSaved, setIsSaved] = useState(false);
  const [isImportingAnim, setIsImportingAnim] = useState(false);
  const [previewingAnim, setPreviewingAnim] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [previewSpeed, setPreviewSpeed] = useState<number>(3.5);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const importConfigRef = React.useRef<HTMLInputElement>(null);

  // ---- Player controls (keybindings + mouse-look) ----
  const [bindingsSnap, setBindingsSnap] = useState<Record<GameplayActionId, string[]> | null>(null);
  const [mouseSnap, setMouseSnap] = useState<MouseLookSettings | null>(null);
  const [listeningFor, setListeningFor] = useState<GameplayActionId | null>(null);
  const [pendingConflict, setPendingConflict] = useState<{
    action: GameplayActionId;
    code: string;
    others: GameplayActionId[];
  } | null>(null);
  const [listenNotice, setListenNotice] = useState<string | null>(null);
  const [configSavedTick, setConfigSavedTick] = useState(false);

  const refreshControls = React.useCallback(() => {
    const im = getInputManager?.() || null;
    if (!im) {
      setBindingsSnap(null);
      setMouseSnap(null);
      return;
    }
    setBindingsSnap({ ...im.bindings });
    setMouseSnap({ ...im.mouse });
  }, [getInputManager]);

  // Snapshot bindings when the modal opens (feeds the slot key chips too).
  useEffect(() => {
    if (isOpen) refreshControls();
    // Cancel any pending listen when the modal closes/unmounts.
    return () => {
      getInputManager?.()?.endListen();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (activeStudioTab === 'controls') refreshControls();
  }, [activeStudioTab, refreshControls]);

  const flashSaved = () => {
    setConfigSavedTick(true);
    setTimeout(() => setConfigSavedTick(false), 1500);
  };

  const startListen = (action: GameplayActionId) => {
    const im = getInputManager?.() || null;
    if (!im) return;
    im.endListen();
    setPendingConflict(null);
    setListenNotice(null);
    setListeningFor(action);
    im.onListenCapture = (capturedAction, code) => {
      handleCapturedKey(capturedAction, code);
    };
    im.onListenDenied = (reason) => {
      setListeningFor(null);
      setListenNotice(reason);
    };
    im.beginListen(action);
  };

  const cancelListen = () => {
    getInputManager?.()?.endListen();
    setListeningFor(null);
  };

  const handleCapturedKey = (action: GameplayActionId, code: string) => {
    const im = getInputManager?.() || null;
    if (!im) {
      setListeningFor(null);
      return;
    }
    const others = im.findConflicts(code, action);
    if (others.length === 0) {
      im.setBinding(action, code);
      setListeningFor(null);
      setListenNotice(null);
      refreshControls();
      flashSaved();
    } else {
      // Conflict: keep the code pending and let the user arbitrate.
      setListeningFor(null);
      setPendingConflict({ action, code, others });
    }
  };

  const resolveConflictReplace = () => {
    const im = getInputManager?.() || null;
    if (!im || !pendingConflict) return;
    im.setBinding(pendingConflict.action, pendingConflict.code);
    setPendingConflict(null);
    refreshControls();
    flashSaved();
  };

  const resolveConflictSwap = () => {
    const im = getInputManager?.() || null;
    if (!im || !pendingConflict || pendingConflict.others.length !== 1) return;
    const other = pendingConflict.others[0];
    const cfg = im.getConfig();
    const oldCodes = cfg.bindings[pendingConflict.action];
    cfg.bindings[other] = [...oldCodes];
    cfg.bindings[pendingConflict.action] = [pendingConflict.code];
    im.applyConfig(cfg);
    setPendingConflict(null);
    refreshControls();
    flashSaved();
  };

  const handleExportConfig = () => {
    const im = getInputManager?.() || null;
    if (!im) return;
    const blob = new Blob([im.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aether-keybindings.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportConfigFile = async (file: File) => {
    const im = getInputManager?.() || null;
    if (!im) return;
    try {
      const text = await file.text();
      const err = im.importJSON(text);
      if (err) {
        setListenNotice(err);
      } else {
        setListenNotice(null);
        refreshControls();
        flashSaved();
      }
    } catch {
      setListenNotice('Fichier JSON invalide ou illisible.');
    }
  };

  useEffect(() => {
    if (node?.rigAnim) {
      setConfig({
        ...node.rigAnim,
        blendTree: node.rigAnim.blendTree || { ...DEFAULT_BLEND_TREE },
        ik: node.rigAnim.ik || { ...DEFAULT_IK },
        ragdoll: node.rigAnim.ragdoll || { ...DEFAULT_RAGDOLL },
      });
    } else {
      setConfig({
        enabled: true,
        rigType: 'biped',
        animationMapping: {},
        autoAnimate: true,
        blendTree: { ...DEFAULT_BLEND_TREE },
        ik: { ...DEFAULT_IK },
        ragdoll: { ...DEFAULT_RAGDOLL },
        vehicleWheels: {}
      });
    }
  }, [node]);

  if (!isOpen || !node) return null;

  const handleSave = () => {
    onSave(config);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 1000);
  };

  const smartAutoMap = () => {
    if (availableAnimations.length === 0) return;

    const findMatch = (keywords: string[]): string | undefined => {
      return availableAnimations.find((name) => {
        const lower = name.toLowerCase();
        return keywords.some((kw) => lower.includes(kw));
      });
    };

    const newMapping: Record<string, string> = {};

    const idle = findMatch(['idle', 'repos', 'stand', 'wait', 'tpose']);
    if (idle) newMapping.idle = idle;

    const walk = findMatch(['walk', 'marche', 'mixamo.com', 'walk_fwd']);
    if (walk && walk !== idle) newMapping.walk = walk;

    const run = findMatch(['run', 'course', 'jog', 'sprint_fwd', 'run_fwd']);
    if (run) newMapping.run = run;

    const sprint = findMatch(['sprint', 'fast', 'dash']);
    if (sprint) newMapping.sprint = sprint;

    const jump = findMatch(['jump', 'saut', 'hop', 'leap', 'fall']);
    if (jump) newMapping.jump = jump;

    const crouch = findMatch(['crouch', 'accroupi', 'acr', 'sneak']);
    if (crouch) newMapping.crouch = crouch;

    const attack = findMatch(['attack', 'attaque', 'punch', 'slash', 'shot', 'fire']);
    if (attack) newMapping.attack = attack;

    const interact = findMatch(['interact', 'interagir', 'use', 'utiliser', 'pick', 'ramasser', 'open', 'ouvrir']);
    if (interact && interact !== attack) newMapping.interact = interact;

    const hit = findMatch(['hit', 'damage', 'hurt', 'degat', 'impact']);
    if (hit) newMapping.hit = hit;

    const die = findMatch(['die', 'death', 'mort', 'dead']);
    if (die) newMapping.die = die;

    const wave = findMatch(['wave', 'saluer', 'cheer', 'dance']);
    if (wave) newMapping.wave = wave;

    setConfig((prev) => ({
      ...prev,
      animationMapping: {
        ...prev.animationMapping,
        ...newMapping,
      },
    }));

    setImportNotice('✨ Auto-détection appliquée avec succès !');
    setTimeout(() => setImportNotice(null), 3000);
  };

  const autoGenerateRagdollBones = () => {
    const parts: Array<{ part: RagdollBodyPart; keywords: string[]; radius: number; height: number; mass: number }> = [
      { part: 'pelvis', keywords: ['hips', 'pelvis', 'bassin', 'root'], radius: 0.16, height: 0.22, mass: 0.2 },
      { part: 'spine', keywords: ['spine', 'colonne'], radius: 0.15, height: 0.2, mass: 0.12 },
      { part: 'chest', keywords: ['chest', 'torso', 'torse', 'spine1', 'spine2'], radius: 0.17, height: 0.25, mass: 0.18 },
      { part: 'head', keywords: ['head', 'tete', 'skull'], radius: 0.13, height: 0.18, mass: 0.08 },
      { part: 'upperArmL', keywords: ['leftarm', 'arm_l', 'arm.l', 'upperarm_l', 'shoulder_l'], radius: 0.08, height: 0.28, mass: 0.05 },
      { part: 'lowerArmL', keywords: ['leftforearm', 'forearm_l', 'forearm.l', 'lowerarm_l'], radius: 0.07, height: 0.25, mass: 0.04 },
      { part: 'upperArmR', keywords: ['rightarm', 'arm_r', 'arm.r', 'upperarm_r', 'shoulder_r'], radius: 0.08, height: 0.28, mass: 0.05 },
      { part: 'lowerArmR', keywords: ['rightforearm', 'forearm_r', 'forearm.r', 'lowerarm_r'], radius: 0.07, height: 0.25, mass: 0.04 },
      { part: 'thighL', keywords: ['leftupleg', 'thigh_l', 'thigh.l', 'upperleg_l', 'leg_l'], radius: 0.1, height: 0.38, mass: 0.1 },
      { part: 'calfL', keywords: ['leftleg', 'calf_l', 'calf.l', 'lowerleg_l', 'shin_l'], radius: 0.09, height: 0.35, mass: 0.07 },
      { part: 'thighR', keywords: ['rightupleg', 'thigh_r', 'thigh.r', 'upperleg_r', 'leg_r'], radius: 0.1, height: 0.38, mass: 0.1 },
      { part: 'calfR', keywords: ['rightleg', 'calf_r', 'calf.r', 'lowerleg_r', 'shin_r'], radius: 0.09, height: 0.35, mass: 0.07 },
    ];

    const matchedBones: RagdollBoneConfig[] = [];
    for (const p of parts) {
      let matchedName = childNodeNames.find((n) => {
        const lower = n.toLowerCase();
        return p.keywords.some((kw) => lower.includes(kw));
      });
      if (!matchedName) {
        matchedName = p.keywords[0];
      }
      matchedBones.push({
        boneName: matchedName,
        part: p.part,
        radius: p.radius,
        height: p.height,
        massRatio: p.mass,
      });
    }

    setConfig((prev) => ({
      ...prev,
      ragdoll: {
        ...(prev.ragdoll || DEFAULT_RAGDOLL),
        enabled: true,
        bones: matchedBones,
      },
    }));
    setImportNotice(`✨ ${matchedBones.length} colliders capsules configurés avec succès !`);
    setTimeout(() => setImportNotice(null), 3000);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onAppendAnimations) return;

    setIsImportingAnim(true);
    setImportNotice(null);
    try {
      const addedClips = await onAppendAnimations(file);
      setImportNotice(`✅ ${addedClips.length} clip(s) d'animation importé(s) : ${addedClips.join(', ')}`);
      setTimeout(() => setImportNotice(null), 4000);
    } catch (err: any) {
      setImportNotice(`❌ Erreur: ${err.message || "Échec de l'importation"}`);
    } finally {
      setIsImportingAnim(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleTestClick = (clipName: string) => {
    if (!clipName) return;
    if (previewingAnim === clipName) {
      onStopTestAnimation?.();
      setPreviewingAnim(null);
    } else {
      onTestAnimation?.(clipName);
      setPreviewingAnim(clipName);
    }
  };

  const updateMapping = (key: keyof RigAnimData['animationMapping'], value: string) => {
    setConfig((prev) => ({
      ...prev,
      animationMapping: {
        ...prev.animationMapping,
        [key]: value,
      },
    }));
  };

  const updateWheel = (key: keyof NonNullable<RigAnimData['vehicleWheels']>, value: string) => {
    setConfig((prev) => ({
      ...prev,
      vehicleWheels: {
        ...(prev.vehicleWheels || {}),
        [key]: value,
      },
    }));
  };

  const updateBlendTree = (partial: Partial<BlendTreeConfig>) => {
    setConfig((prev) => ({
      ...prev,
      blendTree: {
        ...(prev.blendTree || DEFAULT_BLEND_TREE),
        ...partial,
      },
    }));
  };

  const updateRagdoll = (partial: Partial<RagdollConfig>) => {
    setConfig((prev) => ({
      ...prev,
      ragdoll: {
        ...(prev.ragdoll || DEFAULT_RAGDOLL),
        ...partial,
      },
    }));
  };

  const updateRagdollBone = (index: number, partial: Partial<RagdollBoneConfig>) => {
    setConfig((prev) => {
      const bones = [...(prev.ragdoll?.bones || DEFAULT_RAGDOLL.bones || [])];
      bones[index] = { ...bones[index], ...partial };
      return {
        ...prev,
        ragdoll: {
          ...(prev.ragdoll || DEFAULT_RAGDOLL),
          bones,
        },
      };
    });
  };

  const removeRagdollBone = (index: number) => {
    setConfig((prev) => {
      const bones = [...(prev.ragdoll?.bones || DEFAULT_RAGDOLL.bones || [])];
      bones.splice(index, 1);
      return {
        ...prev,
        ragdoll: {
          ...(prev.ragdoll || DEFAULT_RAGDOLL),
          bones,
        },
      };
    });
  };

  const addCustomRagdollBone = () => {
    setConfig((prev) => {
      const bones = [...(prev.ragdoll?.bones || DEFAULT_RAGDOLL.bones || [])];
      bones.push({
        boneName: childNodeNames[0] || 'Bone',
        part: 'custom',
        radius: 0.1,
        height: 0.3,
        massRatio: 0.05,
      });
      return {
        ...prev,
        ragdoll: {
          ...(prev.ragdoll || DEFAULT_RAGDOLL),
          bones,
        },
      };
    });
  };

  const calcBlendWeights = (v: number) => {
    const bt = config.blendTree || DEFAULT_BLEND_TREE;
    const walkT = bt.walkSpeed || 2.8;
    const runT = bt.runSpeed || 6.5;
    const sprintT = bt.sprintSpeed || 9.5;

    let idle = 0, walk = 0, run = 0, sprint = 0;
    if (v <= 0.08) {
      idle = 1;
    } else if (v <= walkT) {
      const t = (v - 0.08) / Math.max(0.01, walkT - 0.08);
      idle = 1 - t;
      walk = t;
    } else if (v <= runT) {
      const t = (v - walkT) / Math.max(0.01, runT - walkT);
      walk = 1 - t;
      run = t;
    } else {
      const t = Math.min(1, (v - runT) / Math.max(0.01, sprintT - runT));
      run = 1 - t;
      sprint = t;
    }
    return {
      idle: Math.round(idle * 100),
      walk: Math.round(walk * 100),
      run: Math.round(run * 100),
      sprint: Math.round(sprint * 100),
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#222]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Zap className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Animation & Rig Studio</h2>
              <p className="text-xs text-white/40">Locomotion dynamique, Blend Trees et Physique Ragdoll Rapier 3D</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-5 bg-[#161616] border-b border-white/10 p-1.5 gap-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveStudioTab('locomotion')}
            className={`flex items-center justify-center gap-2 py-2 rounded-xl font-semibold transition-all ${
              activeStudioTab === 'locomotion'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <Accessibility className="w-4 h-4" />
            <span>Locomotion & Blend</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveStudioTab('controls')}
            className={`flex items-center justify-center gap-2 py-2 rounded-xl font-semibold transition-all ${
              activeStudioTab === 'controls'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            <span>Contrôles</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveStudioTab('ik')}
            className={`flex items-center justify-center gap-2 py-2 rounded-xl font-semibold transition-all ${
              activeStudioTab === 'ik'
                ? 'bg-purple-600 text-white shadow'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Inverse Kinematics</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveStudioTab('ragdoll')}
            className={`flex items-center justify-center gap-2 py-2 rounded-xl font-semibold transition-all ${
              activeStudioTab === 'ragdoll'
                ? 'bg-amber-600 text-white shadow'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <Bone className="w-4 h-4" />
            <span>Physique Ragdoll</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveStudioTab('vehicles')}
            className={`flex items-center justify-center gap-2 py-2 rounded-xl font-semibold transition-all ${
              activeStudioTab === 'vehicles'
                ? 'bg-sky-600 text-white shadow'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <Car className="w-4 h-4" />
            <span>Véhicule & Roues</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">

          {/* TAB 1: LOCOMOTION & BLEND TREES */}
          {activeStudioTab === 'locomotion' && (
            <div className="space-y-6">
              {/* Rig Type Selection */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
                  <Settings2 className="w-3.5 h-3.5" /> Type de Rig & Morphologie
                </label>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { id: 'biped', label: 'Humanoïde', icon: Accessibility },
                    { id: 'quadruped', label: 'Animal', icon: Dog },
                    { id: 'vehicle', label: 'Véhicule', icon: Car },
                    { id: 'custom', label: 'Custom', icon: Settings2 },
                  ].map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setConfig(prev => ({ ...prev, rigType: type.id as any }))}
                      className={`flex flex-col items-center gap-2.5 p-3.5 rounded-xl border transition-all ${
                        config.rigType === type.id 
                          ? 'bg-indigo-500/20 border-indigo-500/50 text-white' 
                          : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                      }`}
                    >
                      <type.icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Animation Mapping */}
              <div className="space-y-4 pt-3 border-t border-white/5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
                      <Play className="w-3.5 h-3.5" /> Mapping des Clips (.glb / .fbx)
                    </label>

                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".glb,.gltf,.fbx"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isImportingAnim}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      title="Ajouter des animations depuis un fichier .glb ou .fbx séparé (Mixamo, Blender)"
                    >
                      <Upload className="w-3 h-3" />
                      <span>{isImportingAnim ? 'Importation...' : 'Ajouter Clip (.glb/.fbx)'}</span>
                    </button>

                    <button
                      onClick={smartAutoMap}
                      className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      title="Associer automatiquement les clips par mots-clés"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Auto-Match</span>
                    </button>
                  </div>
                </div>

                {importNotice && (
                  <div className="p-2.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-xs text-indigo-200 flex items-center gap-2 animate-in fade-in">
                    <Info className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>{importNotice}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'idle', label: 'Repos (Idle)' },
                    { id: 'walk', label: 'Marche (Walk)' },
                    { id: 'run', label: 'Course (Run)' },
                    { id: 'sprint', label: 'Sprint (Fast)' },
                    { id: 'jump', label: 'Saut (Jump)' },
                    { id: 'crouch', label: 'Accroupi (Crouch)' },
                    { id: 'attack', label: 'Attaque (Action)' },
                    { id: 'interact', label: 'Interaction (F)' },
                    { id: 'hit', label: 'Dégât (Hit / Hurt)' },
                    { id: 'die', label: 'Mort (Die / Fall)' },
                    { id: 'wave', label: 'Emote (Wave)' },
                  ].map((slot) => {
                    const mappedValue = config.animationMapping?.[slot.id as keyof RigAnimData['animationMapping']] || '';
                    const isPreviewing = previewingAnim === mappedValue;
                    const boundAction = SLOT_TO_ACTION[slot.id];
                    const boundCodes = boundAction ? bindingsSnap?.[boundAction] || [] : [];
                    const isListening = boundAction ? listeningFor === boundAction : false;
                    return (
                      <div key={slot.id} className="space-y-1 bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
                        <div className="flex items-center justify-between text-[11px] text-white/70">
                          <span className="font-medium">{slot.label}</span>
                          <div className="flex items-center gap-1">
                            {boundAction && (
                              <button
                                type="button"
                                onClick={() => (isListening ? cancelListen() : startListen(boundAction))}
                                className={`px-1.5 py-0.5 rounded-md font-mono text-[10px] border transition-all ${
                                  isListening
                                    ? 'bg-amber-500 text-black border-amber-400 animate-pulse'
                                    : 'bg-black/50 text-emerald-300 border-white/10 hover:border-emerald-500/50'
                                }`}
                                title={isListening ? 'Appuyez sur une touche... (Échap = annuler)' : `Touche : ${boundCodes.map(codeLabel).join(' / ') || '—'} — cliquer pour réassigner`}
                              >
                                {isListening ? '...' : <Keyboard className="w-3 h-3 inline mr-0.5" />}
                                {!isListening && (boundCodes.map(codeLabel).join(' / ') || '?')}
                              </button>
                            )}
                            {mappedValue && (
                              <button
                                type="button"
                                onClick={() => handleTestClick(mappedValue)}
                                className={`p-1 rounded transition-colors ${
                                  isPreviewing ? 'bg-amber-500 text-black' : 'text-white/40 hover:text-white hover:bg-white/10'
                                }`}
                                title={isPreviewing ? 'Arrêter aperçu' : 'Tester ce clip'}
                              >
                                {isPreviewing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        </div>
                        <select
                          value={mappedValue}
                          onChange={(e) => updateMapping(slot.id as any, e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500/50"
                        >
                          <option value="">-- Aucun clip --</option>
                          {availableAnimations.map((anim) => (
                            <option key={anim} value={anim}>{anim}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 1D / 2D Blend Tree Section */}
              <div className="space-y-4 pt-3 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-white/80">
                        Blend Tree 1D / 2D (Mélange Continu)
                      </h3>
                      <p className="text-[10px] text-white/40">
                        Interpolation fluide Idle ➔ Marche ➔ Course ➔ Sprint selon la vélocité
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateBlendTree({ enabled: !(config.blendTree?.enabled !== false) })}
                    className={`w-9 h-5 rounded-full transition-all relative ${
                      config.blendTree?.enabled !== false ? 'bg-indigo-600' : 'bg-white/10'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                        config.blendTree?.enabled !== false ? 'left-4.5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                {config.blendTree?.enabled !== false && (
                  <div className="space-y-4 bg-white/[0.02] p-3.5 rounded-xl border border-white/5">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1 bg-black/30 p-2.5 rounded-lg border border-white/5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-emerald-400 font-medium">Seuil Marche</span>
                          <span className="text-white/80 font-mono">{(config.blendTree?.walkSpeed ?? 2.8).toFixed(1)} m/s</span>
                        </div>
                        <input
                          type="range"
                          min="1.0"
                          max="5.0"
                          step="0.1"
                          value={config.blendTree?.walkSpeed ?? 2.8}
                          onChange={(e) => updateBlendTree({ walkSpeed: parseFloat(e.target.value) })}
                          className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-white/10 rounded-lg"
                        />
                        <span className="text-[10px] text-white/40 block">~{Math.round((config.blendTree?.walkSpeed ?? 2.8) * 3.6)} km/h</span>
                      </div>

                      <div className="space-y-1 bg-black/30 p-2.5 rounded-lg border border-white/5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-amber-400 font-medium">Seuil Course</span>
                          <span className="text-white/80 font-mono">{(config.blendTree?.runSpeed ?? 6.5).toFixed(1)} m/s</span>
                        </div>
                        <input
                          type="range"
                          min="4.0"
                          max="9.0"
                          step="0.1"
                          value={config.blendTree?.runSpeed ?? 6.5}
                          onChange={(e) => updateBlendTree({ runSpeed: parseFloat(e.target.value) })}
                          className="w-full accent-amber-500 cursor-pointer h-1.5 bg-white/10 rounded-lg"
                        />
                        <span className="text-[10px] text-white/40 block">~{Math.round((config.blendTree?.runSpeed ?? 6.5) * 3.6)} km/h</span>
                      </div>

                      <div className="space-y-1 bg-black/30 p-2.5 rounded-lg border border-white/5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-purple-400 font-medium">Seuil Sprint</span>
                          <span className="text-white/80 font-mono">{(config.blendTree?.sprintSpeed ?? 9.5).toFixed(1)} m/s</span>
                        </div>
                        <input
                          type="range"
                          min="7.0"
                          max="14.0"
                          step="0.2"
                          value={config.blendTree?.sprintSpeed ?? 9.5}
                          onChange={(e) => updateBlendTree({ sprintSpeed: parseFloat(e.target.value) })}
                          className="w-full accent-purple-500 cursor-pointer h-1.5 bg-white/10 rounded-lg"
                        />
                        <span className="text-[10px] text-white/40 block">~{Math.round((config.blendTree?.sprintSpeed ?? 9.5) * 3.6)} km/h</span>
                      </div>
                    </div>

                    {/* Anti Foot Sliding Toggle */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-indigo-400" />
                        <div>
                          <div className="text-xs font-medium text-white/90">Anti-Patinage (Foot-Sync)</div>
                          <div className="text-[10px] text-white/40">Synchronise la vitesse de lecture au sol avec la vélocité réelle</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateBlendTree({ syncPlaybackSpeed: !(config.blendTree?.syncPlaybackSpeed !== false) })}
                        className={`w-8 h-4 rounded-full transition-all relative ${
                          config.blendTree?.syncPlaybackSpeed !== false ? 'bg-indigo-600' : 'bg-white/10'
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
                            config.blendTree?.syncPlaybackSpeed !== false ? 'left-4.5' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Simulator */}
                    <div className="space-y-2 bg-black/40 p-3 rounded-lg border border-white/5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white/80 flex items-center gap-1.5">
                          <Gauge className="w-3.5 h-3.5 text-indigo-400" /> Simulateur de Vitesse
                        </span>
                        <span className="font-mono text-indigo-300 font-bold bg-indigo-500/20 px-2 py-0.5 rounded text-[11px]">
                          {previewSpeed.toFixed(1)} m/s (~{Math.round(previewSpeed * 3.6)} km/h)
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="12.0"
                        step="0.1"
                        value={previewSpeed}
                        onChange={(e) => setPreviewSpeed(parseFloat(e.target.value))}
                        className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-white/10 rounded-lg"
                      />
                      {(() => {
                        const w = calcBlendWeights(previewSpeed);
                        return (
                          <div className="space-y-1.5">
                            <div className="w-full h-3 bg-black/60 rounded-full overflow-hidden flex border border-white/10">
                              {w.idle > 0 && (
                                <div style={{ width: `${w.idle}%` }} className="h-full bg-sky-500 transition-all duration-75" title={`Idle: ${w.idle}%`} />
                              )}
                              {w.walk > 0 && (
                                <div style={{ width: `${w.walk}%` }} className="h-full bg-emerald-500 transition-all duration-75" title={`Walk: ${w.walk}%`} />
                              )}
                              {w.run > 0 && (
                                <div style={{ width: `${w.run}%` }} className="h-full bg-amber-500 transition-all duration-75" title={`Run: ${w.run}%`} />
                              )}
                              {w.sprint > 0 && (
                                <div style={{ width: `${w.sprint}%` }} className="h-full bg-purple-500 transition-all duration-75" title={`Sprint: ${w.sprint}%`} />
                              )}
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-white/50">
                              <span>Idle: {w.idle}%</span>
                              <span>Marche: {w.walk}%</span>
                              <span>Course: {w.run}%</span>
                              <span>Sprint: {w.sprint}%</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: PLAYER CONTROLS (keybindings + mouse-look) */}
          {activeStudioTab === 'controls' && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white/80 flex items-center gap-2">
                    <Keyboard className="w-3.5 h-3.5 text-emerald-400" /> Remapping des touches
                  </h3>
                  <p className="text-[10px] text-white/40">
                    Cliquez sur une touche puis appuyez sur la nouvelle touche (« Échap » = annuler).
                    Touches physiques, indépendantes de la disposition clavier (AZERTY/QWERTY).
                  </p>
                </div>
                {configSavedTick && (
                  <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded-lg px-2 py-1 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Sauvegardé
                  </span>
                )}
              </div>

              {!bindingsSnap || !mouseSnap ? (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                  Moteur d&apos;entrées indisponible (ouvrez ce panneau après l&apos;initialisation du viewport).
                </div>
              ) : (
                <>
                  {listenNotice && (
                    <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-xs text-sky-200 flex items-center gap-2">
                      <Info className="w-4 h-4 shrink-0" />
                      <span>{listenNotice}</span>
                    </div>
                  )}

                  {pendingConflict && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 space-y-2">
                      <div className="text-xs text-amber-200">
                        <ShieldAlert className="w-3.5 h-3.5 inline mr-1" />
                        La touche <span className="font-mono font-bold">{codeLabel(pendingConflict.code)}</span> est
                        déjà assignée à{' '}
                        <span className="font-semibold">
                          {pendingConflict.others.map((a) => ACTION_META[a].label).join(', ')}
                        </span>{' '}
                        — elle sera retirée de {pendingConflict.others.length > 1 ? 'ces actions' : 'cette action'} si
                        vous confirmez.
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={resolveConflictReplace}
                          className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold transition-colors"
                        >
                          Remplacer quand même
                        </button>
                        {pendingConflict.others.length === 1 && (
                          <button
                            type="button"
                            onClick={resolveConflictSwap}
                            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-semibold transition-colors"
                          >
                            Échanger les deux
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPendingConflict(null)}
                          className="px-2.5 py-1 rounded-lg text-white/60 hover:text-white text-xs transition-colors"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}

                  {(['move', 'gesture'] as const).map((cat) => (
                    <div key={cat} className="space-y-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                        {cat === 'move' ? 'Déplacements' : 'Gestes & animations'}
                      </div>
                      <div className="space-y-1.5">
                        {GAMEPLAY_ACTIONS.filter((a) => ACTION_META[a].category === cat).map((action) => {
                          const codes = bindingsSnap[action] || [];
                          const isListening = listeningFor === action;
                          return (
                            <div
                              key={action}
                              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border transition-colors ${
                                isListening
                                  ? 'bg-amber-500/10 border-amber-500/50'
                                  : 'bg-white/[0.02] border-white/5'
                              }`}
                            >
                              <span className="text-xs text-white/80 font-medium">{ACTION_META[action].label}</span>
                              <div className="flex items-center gap-1.5">
                                {codes.map((c) => (
                                  <span
                                    key={c}
                                    className="px-2 py-0.5 rounded-md bg-black/50 border border-white/10 font-mono text-[11px] text-emerald-300"
                                  >
                                    {codeLabel(c)}
                                  </span>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => (isListening ? cancelListen() : startListen(action))}
                                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                                    isListening
                                      ? 'bg-amber-500 text-black animate-pulse'
                                      : 'bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300'
                                  }`}
                                >
                                  {isListening ? 'Appuyez sur une touche...' : 'Assigner'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Mouse-look (Yaw) */}
                  <div className="space-y-3 pt-3 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mouse className="w-3.5 h-3.5 text-emerald-400" />
                        <div>
                          <div className="text-xs font-medium text-white/90">Rotation souris — axe Y (Yaw)</div>
                          <div className="text-[10px] text-white/40">
                            La souris fait pivoter le joueur, la caméra reste derrière lui. En Play : cliquez le
                            viewport pour verrouiller le pointeur (Échap pour libérer).
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const im = getInputManager?.();
                          if (!im || !mouseSnap) return;
                          im.setMouse({ enabled: !mouseSnap.enabled });
                          refreshControls();
                          flashSaved();
                        }}
                        className={`w-9 h-5 rounded-full transition-all relative shrink-0 ${
                          mouseSnap.enabled ? 'bg-emerald-600' : 'bg-white/10'
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                            mouseSnap.enabled ? 'left-4.5' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </div>

                    {mouseSnap.enabled && (
                      <div className="space-y-3 bg-white/[0.02] p-3.5 rounded-xl border border-white/5">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-white/70 font-medium">Sensibilité</span>
                            <span className="text-white/80 font-mono">{mouseSnap.sensitivity.toFixed(1)}</span>
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="10"
                            step="0.5"
                            value={mouseSnap.sensitivity}
                            onChange={(e) => {
                              const im = getInputManager?.();
                              if (!im) return;
                              im.setMouse({ sensitivity: parseFloat(e.target.value) });
                              refreshControls();
                            }}
                            onMouseUp={flashSaved}
                            className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-white/10 rounded-lg"
                          />
                        </div>
                        <label className="flex items-center justify-between text-[11px] cursor-pointer">
                          <span className="text-white/70 font-medium">Inverser l&apos;axe horizontal</span>
                          <input
                            type="checkbox"
                            checked={mouseSnap.invert}
                            onChange={(e) => {
                              const im = getInputManager?.();
                              if (!im) return;
                              im.setMouse({ invert: e.target.checked });
                              refreshControls();
                              flashSaved();
                            }}
                            className="w-4 h-4 accent-emerald-500 cursor-pointer"
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Persistence */}
                  <div className="space-y-2 pt-3 border-t border-white/5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                      Sauvegarde locale
                    </div>
                    <p className="text-[10px] text-white/40">
                      Chaque modification est enregistrée automatiquement dans le navigateur. Exportez un fichier JSON
                      pour partager ou versionner la configuration.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={importConfigRef}
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImportConfigFile(f);
                          if (importConfigRef.current) importConfigRef.current.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleExportConfig}
                        className="px-2.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        <span>Exporter JSON</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => importConfigRef.current?.click()}
                        className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        <span>Importer JSON</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const im = getInputManager?.();
                          if (!im) return;
                          im.resetDefaults();
                          setPendingConflict(null);
                          refreshControls();
                          flashSaved();
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Réinitialiser</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: INVERSE KINEMATICS (IK) & FOOT PLANTING */}
          {activeStudioTab === 'ik' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-200">
              <div className="flex items-center justify-between p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-purple-500/20 rounded-xl text-purple-300">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Cinématique Inverse (IK) & Planté de Pieds</h3>
                    <p className="text-xs text-purple-200/60">Résolution géométrique automatique des coudes, genoux et alignement au sol</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfig(prev => ({
                    ...prev,
                    ik: { ...(prev.ik || DEFAULT_IK), enabled: !(prev.ik?.enabled !== false) }
                  }))}
                  className={`w-9 h-5 rounded-full transition-all relative ${
                    config.ik?.enabled !== false ? 'bg-purple-600' : 'bg-white/10'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                      config.ik?.enabled !== false ? 'left-4.5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Foot Planting */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">Planté de pieds au sol (Foot Planting)</div>
                    <div className="text-xs text-white/40">Empêche les pieds de traverser le sol ou de glisser</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.ik?.footPlanting ?? true}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      ik: { ...(prev.ik || DEFAULT_IK), footPlanting: e.target.checked }
                    }))}
                    className="w-4 h-4 rounded accent-purple-500 cursor-pointer"
                  />
                </div>
                <div className="space-y-1 pt-2 border-t border-white/5">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/60">Décalage Sol (Ground Offset)</span>
                    <span className="font-mono text-purple-400">{(config.ik?.groundOffset ?? 0.05).toFixed(2)}m</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="0.2"
                    step="0.01"
                    value={config.ik?.groundOffset ?? 0.05}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      ik: { ...(prev.ik || DEFAULT_IK), groundOffset: parseFloat(e.target.value) }
                    }))}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* IK Chains */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-white/40">Chaînes IK Membres (Bras & Jambes)</div>
                <div className="grid grid-cols-2 gap-3">
                  {(config.ik?.chains || DEFAULT_IK.chains).map((chain, index) => (
                    <div key={chain.chainName} className="bg-white/5 border border-white/10 rounded-xl p-3.5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white uppercase">{chain.chainName}</span>
                        <input
                          type="checkbox"
                          checked={chain.enabled}
                          onChange={(e) => {
                            const chains = [...(config.ik?.chains || DEFAULT_IK.chains)];
                            chains[index] = { ...chains[index], enabled: e.target.checked };
                            setConfig(prev => ({ ...prev, ik: { ...(prev.ik || DEFAULT_IK), chains } }));
                          }}
                          className="w-3.5 h-3.5 rounded accent-purple-500 cursor-pointer"
                        />
                      </div>
                      <div className="text-[11px] text-white/50 space-y-0.5 font-mono">
                        <div>Racine: {chain.rootBone}</div>
                        <div>Artic.: {chain.middleBone}</div>
                        <div>Extrémité: {chain.endBone}</div>
                      </div>
                      <div className="space-y-1 pt-2 border-t border-white/5">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-white/40">Poids IK</span>
                          <span className="font-mono text-purple-300">{Math.round(chain.weight * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={chain.weight}
                          onChange={(e) => {
                            const chains = [...(config.ik?.chains || DEFAULT_IK.chains)];
                            chains[index] = { ...chains[index], weight: parseFloat(e.target.value) };
                            setConfig(prev => ({ ...prev, ik: { ...(prev.ik || DEFAULT_IK), chains } }));
                          }}
                          className="w-full accent-purple-500 cursor-pointer"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: RAGDOLL & POUPÉE DE CHIFFON */}
          {activeStudioTab === 'ragdoll' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-200">
              {/* Activation & Auto-generator Banner */}
              <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bone className="w-5 h-5 text-amber-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white">Physique Ragdoll & Poupée de Chiffon</h3>
                      <p className="text-xs text-amber-200/60">Génération automatique de colliders capsules sur le squelette</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => updateRagdoll({ enabled: !(config.ragdoll?.enabled !== false) })}
                    className={`w-9 h-5 rounded-full transition-all relative ${
                      config.ragdoll?.enabled !== false ? 'bg-amber-500' : 'bg-white/10'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                        config.ragdoll?.enabled !== false ? 'left-4.5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={autoGenerateRagdollBones}
                    className="py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                  >
                    <Zap className="w-3.5 h-3.5 fill-black" />
                    <span>Générer Automatiquement Capsules (Bassin, Torse, Membres)</span>
                  </button>

                  {onTestRagdoll && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsRagdollTesting(!isRagdollTesting);
                        onTestRagdoll();
                      }}
                      className={`py-1.5 px-3 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
                        isRagdollTesting
                          ? 'bg-rose-500 text-white shadow-rose-500/30 shadow'
                          : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span>{isRagdollTesting ? 'Désactiver Ragdoll' : 'Tester Ragdoll (Impact)'}</span>
                    </button>
                  )}

                  {onToggleDebugWireframes && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = !showWireframes;
                        setShowWireframes(next);
                        onToggleDebugWireframes(next);
                      }}
                      className={`py-1.5 px-3 rounded-lg font-medium text-xs flex items-center gap-1.5 transition-all border ${
                        showWireframes
                          ? 'bg-sky-500/20 border-sky-500/50 text-sky-200'
                          : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                      }`}
                    >
                      {showWireframes ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>Wireframes 3D</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Triggers & Recovery Settings */}
              <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> Paramètres de Déclenchement & Simulation
                </label>

                <div className="grid grid-cols-2 gap-4">
                  {/* Trigger on Damage */}
                  <div className="bg-black/30 p-3 rounded-lg border border-white/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-white/90">Déclencher sur Dégâts / Hit</span>
                      <input
                        type="checkbox"
                        checked={config.ragdoll?.triggerOnDamage !== false}
                        onChange={(e) => updateRagdoll({ triggerOnDamage: e.target.checked })}
                        className="accent-amber-500 w-4 h-4 cursor-pointer"
                      />
                    </div>
                    <p className="text-[10px] text-white/40">
                      Bascule instantanément en ragdoll lorsque l&apos;entité subit des dégâts ou un projectile
                    </p>
                  </div>

                  {/* Trigger on Fall */}
                  <div className="bg-black/30 p-3 rounded-lg border border-white/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-white/90">Déclencher sur Chute Violente</span>
                      <input
                        type="checkbox"
                        checked={config.ragdoll?.triggerOnFall !== false}
                        onChange={(e) => updateRagdoll({ triggerOnFall: e.target.checked })}
                        className="accent-amber-500 w-4 h-4 cursor-pointer"
                      />
                    </div>
                    <p className="text-[10px] text-white/40">
                      Active la physique si la vitesse verticale vers le bas dépasse le seuil
                    </p>
                  </div>
                </div>

                {/* Thresholds & Masses */}
                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div className="space-y-1 bg-black/20 p-2.5 rounded-lg border border-white/5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-white/70">Seuil de Vitesse de Chute</span>
                      <span className="font-mono text-amber-400">{(config.ragdoll?.fallSpeedThreshold ?? -10).toFixed(0)} m/s</span>
                    </div>
                    <input
                      type="range"
                      min="-25"
                      max="-4"
                      step="1"
                      value={config.ragdoll?.fallSpeedThreshold ?? -10}
                      onChange={(e) => updateRagdoll({ fallSpeedThreshold: parseFloat(e.target.value) })}
                      className="w-full accent-amber-500 cursor-pointer h-1.5 bg-white/10 rounded-lg"
                    />
                  </div>

                  <div className="space-y-1 bg-black/20 p-2.5 rounded-lg border border-white/5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-white/70">Masse Totale (Ragdoll)</span>
                      <span className="font-mono text-amber-400">{(config.ragdoll?.totalMass ?? 75).toFixed(0)} kg</span>
                    </div>
                    <input
                      type="range"
                      min="30"
                      max="160"
                      step="5"
                      value={config.ragdoll?.totalMass ?? 75}
                      onChange={(e) => updateRagdoll({ totalMass: parseFloat(e.target.value) })}
                      className="w-full accent-amber-500 cursor-pointer h-1.5 bg-white/10 rounded-lg"
                    />
                  </div>
                </div>

                {/* Auto Get-Up */}
                <div className="bg-black/30 p-3 rounded-lg border border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-white/90">Se Relever Automatiquement (Get-Up)</span>
                      <span className="text-[10px] text-white/40 block">Rétablit l&apos;animation et le contrôleur après stabilisation au sol</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.ragdoll?.autoGetUp !== false}
                      onChange={(e) => updateRagdoll({ autoGetUp: e.target.checked })}
                      className="accent-amber-500 w-4 h-4 cursor-pointer"
                    />
                  </div>
                  {config.ragdoll?.autoGetUp !== false && (
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-white/60">Délai avant rétablissement</span>
                        <span className="font-mono text-amber-400">{(config.ragdoll?.getUpDelay ?? 4.0).toFixed(1)} s</span>
                      </div>
                      <input
                        type="range"
                        min="1.0"
                        max="8.0"
                        step="0.5"
                        value={config.ragdoll?.getUpDelay ?? 4.0}
                        onChange={(e) => updateRagdoll({ getUpDelay: parseFloat(e.target.value) })}
                        className="w-full accent-amber-500 cursor-pointer h-1.5 bg-white/10 rounded-lg"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Capsules & Bones Hierarchy */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
                    <Bone className="w-3.5 h-3.5 text-amber-400" /> Colliders Capsules par Os ({config.ragdoll?.bones?.length || 0})
                  </label>
                  <button
                    type="button"
                    onClick={addCustomRagdollBone}
                    className="py-1 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-xs flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Ajouter un Os</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                  {(config.ragdoll?.bones || []).map((bone, idx) => {
                    const meta = BODY_PART_LABELS[bone.part] || BODY_PART_LABELS.custom;
                    return (
                      <div key={idx} className="bg-black/30 border border-white/5 p-3 rounded-xl space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${meta.color}`}>
                              {meta.label}
                            </span>
                            <span className="text-xs font-mono text-white/80">{bone.boneName}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <select
                              value={bone.boneName}
                              onChange={(e) => updateRagdollBone(idx, { boneName: e.target.value })}
                              className="bg-black/60 border border-white/10 rounded px-2 py-0.5 text-xs text-white/90 outline-none"
                            >
                              <option value={bone.boneName}>{bone.boneName}</option>
                              {childNodeNames
                                .filter((n) => n !== bone.boneName)
                                .map((name) => (
                                  <option key={name} value={name}>{name}</option>
                                ))}
                            </select>

                            <button
                              type="button"
                              onClick={() => removeRagdollBone(idx)}
                              className="p-1 hover:bg-rose-500/20 text-white/40 hover:text-rose-400 rounded transition-colors"
                              title="Supprimer ce collider"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-[11px]">
                          <div className="space-y-1">
                            <div className="flex justify-between text-white/60">
                              <span>Rayon</span>
                              <span className="font-mono text-amber-300">{bone.radius.toFixed(2)}m</span>
                            </div>
                            <input
                              type="range"
                              min="0.04"
                              max="0.35"
                              step="0.01"
                              value={bone.radius}
                              onChange={(e) => updateRagdollBone(idx, { radius: parseFloat(e.target.value) })}
                              className="w-full accent-amber-400 h-1 bg-white/10 rounded"
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-white/60">
                              <span>Longueur</span>
                              <span className="font-mono text-amber-300">{bone.height.toFixed(2)}m</span>
                            </div>
                            <input
                              type="range"
                              min="0.08"
                              max="0.75"
                              step="0.02"
                              value={bone.height}
                              onChange={(e) => updateRagdollBone(idx, { height: parseFloat(e.target.value) })}
                              className="w-full accent-amber-400 h-1 bg-white/10 rounded"
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-white/60">
                              <span>Masse Rel.</span>
                              <span className="font-mono text-amber-300">{((bone.massRatio ?? 0.05) * 100).toFixed(0)}%</span>
                            </div>
                            <input
                              type="range"
                              min="0.02"
                              max="0.35"
                              step="0.01"
                              value={bone.massRatio ?? 0.05}
                              onChange={(e) => updateRagdollBone(idx, { massRatio: parseFloat(e.target.value) })}
                              className="w-full accent-amber-400 h-1 bg-white/10 rounded"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: VEHICLES & WHEELS */}
          {activeStudioTab === 'vehicles' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
              <div className="bg-sky-500/10 border border-sky-500/30 p-4 rounded-xl space-y-1">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Car className="w-4 h-4 text-sky-400" /> Rigging des Roues Automobiles
                </h3>
                <p className="text-xs text-sky-200/70">
                  Associez chaque mesh de roue pour animer le roulis et la direction du volant
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { id: 'frontLeft', label: 'Roue Avant Gauche (Directionnelle)' },
                  { id: 'frontRight', label: 'Roue Avant Droite (Directionnelle)' },
                  { id: 'rearLeft', label: 'Roue Arrière Gauche (Motrice)' },
                  { id: 'rearRight', label: 'Roue Arrière Droite (Motrice)' },
                ].map((wheel) => (
                  <div key={wheel.id} className="space-y-1.5 bg-black/30 p-3 rounded-xl border border-white/5">
                    <label className="text-[11px] text-white/70 font-medium">{wheel.label}</label>
                    <select
                      value={config.vehicleWheels?.[wheel.id as keyof NonNullable<RigAnimData['vehicleWheels']>] || ''}
                      onChange={(e) => updateWheel(wheel.id as any, e.target.value)}
                      className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-sky-500/50"
                    >
                      <option value="">-- Aucun mesh assigné --</option>
                      {childNodeNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#222] border-t border-white/10 flex items-center justify-between">
          <div className="text-xs text-white/40">
            {config.ragdoll?.enabled !== false && `${config.ragdoll?.bones?.length || 0} colliders ragdoll actifs`}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-white/60 hover:text-white transition-colors"
            >
              Fermer
            </button>
            <button
              onClick={handleSave}
              disabled={isSaved}
              className={`px-6 py-2 text-sm font-bold rounded-lg transition-all shadow-lg active:scale-95 flex items-center gap-2 ${
                isSaved 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-indigo-500/20'
              }`}
            >
              {isSaved ? (
                <>
                  <Check className="w-4 h-4" />
                  Enregistré !
                </>
              ) : (
                'Appliquer Configuration'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
