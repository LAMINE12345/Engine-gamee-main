'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SceneNode } from '../types/engine';
import {
  Layers,
  Box,
  Circle,
  Cylinder,
  Disc,
  LifeBuoy,
  Triangle,
  Lightbulb,
  Sun,
  Eye,
  EyeOff,
  Trash2,
  Copy,
  Search,
  Check,
  ChevronDown,
  ChevronRight,
  Car,
  Waves,
  Group,
  Folder,
  Package,
  Gamepad2,
  Sparkles,
  Flag,
  MapPin,
  BoxSelect,
  Ungroup,
  Aperture,
} from 'lucide-react';

export type DropPosition = 'inside' | 'before' | 'after';

interface HierarchyProps {
  nodes: SceneNode[];
  selectedNode: SceneNode | null;
  selectedIds?: string[];
  onSelectNode: (id: string, opts?: { additive?: boolean; range?: boolean }) => void;
  onSelectRange?: (ids: string[]) => void;
  onToggleVisibility: (id: string, currentVisible: boolean) => void;
  onDeleteNode: (id: string) => void;
  onDuplicateNode: (id: string) => void;
  onRenameNode: (id: string, newName: string) => void;
  onMoveNode: (draggedId: string, targetId: string | null, position: DropPosition) => void;
  onCreateEmptyChild: (parentId: string) => void;
  onGroupSelected: () => void;
  onUngroup: (id: string) => void;
  onSelectChildren: (id: string) => void;
}

interface TreeEntry {
  node: SceneNode;
  children: TreeEntry[];
}

interface FlatRow {
  entry: TreeEntry;
  depth: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  id: string;
}

function buildTree(nodes: SceneNode[]): TreeEntry[] {
  const byId = new Map<string, TreeEntry>();
  for (const n of nodes) {
    byId.set(n.id, { node: n, children: [] });
  }
  const roots: TreeEntry[] = [];
  for (const n of nodes) {
    const entry = byId.get(n.id)!;
    const parentId = n.parentId ?? null;
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent && parent !== entry) {
      parent.children.push(entry);
    } else {
      roots.push(entry);
    }
  }
  return roots;
}

function flattenVisible(entries: TreeEntry[], expanded: Set<string>, depth = 0): FlatRow[] {
  const out: FlatRow[] = [];
  for (const entry of entries) {
    out.push({ entry, depth });
    if (entry.children.length > 0 && expanded.has(entry.node.id)) {
      out.push(...flattenVisible(entry.children, expanded, depth + 1));
    }
  }
  return out;
}

function isDescendant(nodes: SceneNode[], ancestorId: string, id: string): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let current = byId.get(id)?.parentId ?? null;
  while (current) {
    if (current === ancestorId) return true;
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

export const Hierarchy: React.FC<HierarchyProps> = ({
  nodes,
  selectedNode,
  selectedIds = [],
  onSelectNode,
  onSelectRange,
  onToggleVisibility,
  onDeleteNode,
  onDuplicateNode,
  onRenameNode,
  onMoveNode,
  onCreateEmptyChild,
  onGroupSelected,
  onUngroup,
  onSelectChildren,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: DropPosition } | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const searching = searchQuery.trim().length > 0;

  const tree = useMemo(() => buildTree(nodes), [nodes]);

  // Auto-expand les nouveaux nœuds (jamais refermer implicitement).
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const n of nodes) {
        if (!next.has(`seen:${n.id}`)) {
          next.add(`seen:${n.id}`);
          next.add(n.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [nodes]);

  const rows: FlatRow[] = useMemo(() => {
    if (searching) {
      const q = searchQuery.toLowerCase();
      return nodes
        .filter((n) => n.name.toLowerCase().includes(q))
        .map((n) => ({ entry: { node: n, children: [] }, depth: 0 }));
    }
    return flattenVisible(tree, expanded);
  }, [nodes, tree, expanded, searching, searchQuery]);

  // Fermeture du menu contextuel (clic / scroll / Escape).
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    const panel = document.getElementById('hierarchy-panel');
    panel?.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey);
      // Le listener `scroll` était posé en capture mais jamais retiré : chaque
      // ouverture de menu en laissait un autre sur le panneau.
      panel?.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  const getNodeIcon = (node: SceneNode) => {
    if (node.type === 'light') {
      if (node.subType === 'directional') return <Sun className="w-3.5 h-3.5 text-amber-400" />;
      return <Lightbulb className="w-3.5 h-3.5 text-amber-300" />;
    }
    if (node.subType === 'group') return <Group className="w-3.5 h-3.5 text-violet-400" />;
    if (node.subType === 'empty') return <Folder className="w-3.5 h-3.5 text-zinc-500" />;
    if (node.subType === 'model') return <Package className="w-3.5 h-3.5 text-orange-400" />;
    if (node.subType === 'player') return <Gamepad2 className="w-3.5 h-3.5 text-emerald-400" />;
    if (node.subType === 'particles') return <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />;
    if (node.subType === 'vehicle') return <Car className="w-3.5 h-3.5 text-sky-400" />;
    if (node.subType === 'checkpoint') return <Flag className="w-3.5 h-3.5 text-lime-400" />;
    if (node.subType === 'spawnPoint') return <MapPin className="w-3.5 h-3.5 text-lime-300" />;
    if (node.subType === 'triggerVolume') return <BoxSelect className="w-3.5 h-3.5 text-yellow-400" />;
    if (node.subType === 'postProcessVolume') return <Aperture className="w-3.5 h-3.5 text-fuchsia-400" />;

    switch (node.subType) {
      case 'cube':
        return <Box className="w-3.5 h-3.5 text-sky-400" />;
      case 'sphere':
        return <Circle className="w-3.5 h-3.5 text-rose-400" />;
      case 'cylinder':
        return <Cylinder className="w-3.5 h-3.5 text-emerald-400" />;
      case 'torus':
        return <LifeBuoy className="w-3.5 h-3.5 text-amber-400" />;
      case 'cone':
        return <Triangle className="w-3.5 h-3.5 text-purple-400" />;
      case 'plane':
        return <Disc className="w-3.5 h-3.5 text-zinc-400" />;
      case 'water':
        return <Waves className="w-3.5 h-3.5 text-cyan-400" />;
      default:
        return <Box className="w-3.5 h-3.5 text-sky-400" />;
    }
  };

  const startRename = (node: SceneNode, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(node.id);
    setEditName(node.name);
  };

  const submitRename = (id: string) => {
    if (editName.trim()) {
      onRenameNode(id, editName.trim());
    }
    setEditingId(null);
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRowClick = (id: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      onSelectNode(id, { additive: true });
    } else if (e.shiftKey && onSelectRange) {
      // Sélection par plage sur l'ordre visible.
      const visibleIds = rows.map((r) => r.entry.node.id);
      const anchor =
        selectedIds.length > 0
          ? selectedIds[selectedIds.length - 1]
          : (selectedNode?.id ?? visibleIds[0]);
      const a = visibleIds.indexOf(anchor);
      const b = visibleIds.indexOf(id);
      if (a === -1 || b === -1) {
        onSelectNode(id);
        return;
      }
      const [from, to] = a < b ? [a, b] : [b, a];
      onSelectRange(visibleIds.slice(from, to + 1));
    } else {
      onSelectNode(id);
    }
  };

  const handleRowContextMenu = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedIds.includes(id) && selectedNode?.id !== id) {
      onSelectNode(id);
    }
    const panel = document.getElementById('hierarchy-panel');
    const rect = panel?.getBoundingClientRect();
    const x = Math.min(e.clientX, (rect?.right ?? window.innerWidth) - 200);
    const y = Math.min(e.clientY, window.innerHeight - 260);
    setMenu({ x, y, id });
  };

  const dropPositionFromEvent = (e: React.DragEvent): DropPosition => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / Math.max(1, rect.height);
    if (ratio < 0.25) return 'before';
    if (ratio > 0.75) return 'after';
    return 'inside';
  };

  const menuNode = menu ? nodes.find((n) => n.id === menu.id) : undefined;
  const menuChildrenCount = menuNode
    ? nodes.filter((n) => n.parentId === menuNode.id).length
    : 0;
  const menuIsGroup =
    menuNode?.subType === 'group' ||
    menuNode?.subType === 'empty' ||
    menuChildrenCount > 0;

  const copyNodePath = (id: string) => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const parts: string[] = [];
    let current = byId.get(id);
    while (current) {
      parts.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    const path = parts.join('/');
    try {
      navigator.clipboard?.writeText(path);
    } catch {
      /* presse-papiers indisponible */
    }
  };

  return (
    <div
      id="hierarchy-panel"
      className="w-72 h-full flex flex-col bg-zinc-950/95 border-r border-zinc-800/80 select-none z-20"
    >
      {/* Hierarchy Header */}
      <div className="p-3 border-b border-zinc-800/80 flex items-center gap-2">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-sky-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
            Scene Hierarchy
          </h2>
          <span className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-[10px] font-mono text-zinc-400">
            {nodes.length}
          </span>
        </div>

      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-zinc-800/80">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
          <input
            id="hierarchy-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrer les objets..."
            className="w-full pl-8 pr-3 py-1.5 bg-zinc-900/80 border border-zinc-800/80 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500/60 transition-colors"
          />
        </div>
      </div>

      {/* Scene Tree List */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto p-2 space-y-0.5"
        onDragOver={(e) => {
          // Survol du fond : cible = racine (fin de liste).
          if ((e.target as HTMLElement).closest('[data-hierarchy-row]')) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          if ((e.target as HTMLElement).closest('[data-hierarchy-row]')) return;
          e.preventDefault();
          if (draggingId) onMoveNode(draggingId, null, 'after');
          setDraggingId(null);
          setDropTarget(null);
        }}
      >
        {rows.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500">
            {searchQuery ? 'Aucun objet correspondant' : 'Scène vide'}
          </div>
        ) : (
          rows.map(({ entry, depth }) => {
            const node = entry.node;
            const hasChildren = entry.children.length > 0;
            const isExpanded = expanded.has(node.id);
            const isSelected =
              selectedIds.length > 0
                ? selectedIds.includes(node.id)
                : selectedNode?.id === node.id;
            const isDropTarget = dropTarget?.id === node.id;
            const dropPos = isDropTarget ? dropTarget.pos : null;
            const invalidDrop =
              draggingId !== null &&
              (draggingId === node.id || isDescendant(nodes, draggingId, node.id));

            return (
              <div
                key={node.id}
                data-hierarchy-row={node.id}
                id={`hierarchy-item-${node.id}`}
                draggable={editingId !== node.id}
                onClick={(e) => handleRowClick(node.id, e)}
                onContextMenu={(e) => handleRowContextMenu(node.id, e)}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', node.id);
                  e.dataTransfer.effectAllowed = 'move';
                  setDraggingId(node.id);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDropTarget(null);
                }}
                onDragOver={(e) => {
                  if (!draggingId || draggingId === node.id) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                  const pos = dropPositionFromEvent(e);
                  setDropTarget((prev) =>
                    prev?.id === node.id && prev.pos === pos ? prev : { id: node.id, pos }
                  );
                }}
                onDragLeave={() => {
                  setDropTarget((prev) => (prev?.id === node.id ? null : prev));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (draggingId && draggingId !== node.id) {
                    onMoveNode(draggingId, node.id, dropPositionFromEvent(e));
                  }
                  setDraggingId(null);
                  setDropTarget(null);
                }}
                style={{ paddingLeft: `${depth * 16 + 6}px` }}
                className={`group flex items-center justify-between pr-2 py-1.5 rounded-xl text-xs cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-sky-500/15 border border-sky-500/40 text-white font-medium shadow-sm'
                    : 'hover:bg-zinc-900/80 border border-transparent text-zinc-300'
                } ${!node.visible ? 'opacity-40' : 'opacity-100'} ${
                  draggingId === node.id ? 'opacity-50' : ''
                } ${dropPos === 'before' ? 'border-t-2 !border-t-sky-400' : ''} ${
                  dropPos === 'after' ? 'border-b-2 !border-b-sky-400' : ''
                } ${dropPos === 'inside' ? '!bg-violet-500/20 !border-violet-500/50' : ''} ${
                  invalidDrop && isDropTarget ? '!border-rose-500' : ''
                }`}
                title={
                  node.prefabId
                    ? `${node.name} — instance prefab`
                    : node.name
                }
              >
                {/* Chevron + icône + nom */}
                <div className="flex items-center gap-1 min-w-0 flex-1">
                  {!searching && hasChildren ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(node.id);
                      }}
                      className="p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 shrink-0"
                      title={isExpanded ? 'Replier' : 'Déplier'}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </button>
                  ) : (
                    <span className="w-[18px] shrink-0" />
                  )}
                  <div className="shrink-0 flex items-center gap-1">
                    {getNodeIcon(node)}
                    {node.prefabId && (
                      <Package className="w-2.5 h-2.5 text-amber-500" />
                    )}
                  </div>

                  {editingId === node.id ? (
                    <div
                      className="flex items-center gap-1 flex-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitRename(node.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        className="w-full px-1.5 py-0.5 bg-zinc-900 border border-sky-500 rounded text-xs text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => submitRename(node.id)}
                        className="p-1 hover:text-emerald-400 text-zinc-400"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <span
                      onDoubleClick={(e) => startRename(node, e)}
                      className="truncate text-xs font-normal"
                      title={node.name}
                    >
                      {node.name}
                      {hasChildren && !searching && (
                        <span className="ml-1 text-[9px] text-zinc-600 font-mono">
                          {entry.children.length}
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {/* Node Quick Action Buttons */}
                <div
                  className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVisibility(node.id, node.visible);
                    }}
                    className={`p-1 rounded hover:bg-zinc-800 transition-colors ${
                      node.visible ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-600'
                    }`}
                    title={node.visible ? 'Masquer' : 'Afficher'}
                  >
                    {node.visible ? (
                      <Eye className="w-3 h-3" />
                    ) : (
                      <EyeOff className="w-3 h-3" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicateNode(node.id);
                    }}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                    title="Dupliquer"
                  >
                    <Copy className="w-3 h-3" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteNode(node.id);
                    }}
                    className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Context Menu */}
      {menu && menuNode && (
        <div
          className="fixed z-[100] w-52 p-1.5 rounded-xl bg-zinc-900 border border-zinc-700/80 shadow-2xl text-xs"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <ContextItem
            label="Renommer"
            onClick={() => {
              setMenu(null);
              setEditingId(menu.id);
              setEditName(menuNode.name);
            }}
          />
          <ContextItem
            label="Dupliquer"
            onClick={() => {
              setMenu(null);
              onDuplicateNode(menu.id);
            }}
          />
          <ContextItem
            label="Copier le chemin"
            onClick={() => {
              setMenu(null);
              copyNodePath(menu.id);
            }}
          />
          <ContextItem
            label="Supprimer"
            danger
            onClick={() => {
              setMenu(null);
              onDeleteNode(menu.id);
            }}
          />
          <div className="my-1 border-t border-zinc-800" />
          <ContextItem
            label="Créer enfant vide"
            onClick={() => {
              setMenu(null);
              onCreateEmptyChild(menu.id);
            }}
          />
          <ContextItem
            label={`Grouper la sélection (${selectedIds.length || 1})`}
            disabled={selectedIds.length < 1 && !selectedNode}
            onClick={() => {
              setMenu(null);
              onGroupSelected();
            }}
          />
          {menuIsGroup && (
            <ContextItem
              label="Dissoudre le groupe"
              icon={<Ungroup className="w-3.5 h-3.5" />}
              onClick={() => {
                setMenu(null);
                onUngroup(menu.id);
              }}
            />
          )}
          {menuChildrenCount > 0 && (
            <ContextItem
              label={`Sélectionner les enfants (${menuChildrenCount})`}
              onClick={() => {
                setMenu(null);
                onSelectChildren(menu.id);
              }}
            />
          )}
        </div>
      )}

      {/* Footer Info */}
      <div className="p-2.5 border-t border-zinc-800/80 text-[11px] text-zinc-500 flex justify-between items-center bg-zinc-950/60">
        <span>Arborescence dynamique</span>
        <span className="text-[10px] text-zinc-600 font-mono">Three.js Graph</span>
      </div>
    </div>
  );
};

function ContextItem({
  label,
  onClick,
  danger,
  disabled,
  icon,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
        danger
          ? 'text-rose-300 hover:bg-rose-500/10'
          : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
