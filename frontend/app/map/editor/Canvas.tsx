'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Application, Container, Graphics, Sprite as PixiSprite, FederatedPointerEvent, Assets, Text } from 'pixi.js';
import type { Tool } from './Toolbox';
import type { Editor } from './useEditor';
import { ELEVATION_COLORS, type TerrainType } from './types';
import type { BrushShape } from './TerrainPanel';

interface CanvasProps {
  activeTool: Tool;
  editor: Editor;
  terrainElevation?: number;
  terrainBrushSize?: number;
  terrainType?: TerrainType;
  terrainBrushShape?: BrushShape;
}

type HandleType = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

interface SpriteRef {
  id: string;
  pixiSprite: PixiSprite;
}

// Helper: distance from point to line segment
function distanceToLine(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = lenSq !== 0 ? dot / lenSq : -1;
  let xx, yy;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }
  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

export function Canvas({ activeTool, editor, terrainElevation = 0, terrainBrushSize = 1, terrainType = 'normal', terrainBrushShape = 'circle' }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const stageContainerRef = useRef<Container | null>(null);
  const gridGraphicsRef = useRef<Graphics | null>(null);
  const terrainContainerRef = useRef<Container | null>(null);
  const wallsContainerRef = useRef<Container | null>(null);
  const spritesContainerRef = useRef<Container | null>(null);
  const selectionContainerRef = useRef<Container | null>(null);
  const rotationTextRef = useRef<Text | null>(null);
  const spriteRefsRef = useRef<SpriteRef[]>([]);
  
  // Terrain painting state
  const isTerrainPaintingRef = useRef(false);
  
  // Wall drawing state
  const isWallDrawingRef = useRef(false);
  const wallStartPointRef = useRef<{x: number, y: number} | null>(null);
  const wallPreviewRef = useRef<Graphics | null>(null);
  
  // Canvas state
  const [isReady, setIsReady] = useState(false);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const [zoom, setZoom] = useState(1);
  const [rotationDisplay, setRotationDisplay] = useState<{ degrees: number; isSnapped: boolean; x: number; y: number } | null>(null);
  
  // Interaction state
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, mouseX: 0, mouseY: 0 });
  
  // Drag state
  const dragStateRef = useRef<{
    type: 'move' | 'resize' | 'rotate';
    spriteId: string;
    handle?: HandleType;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startRotation: number;
    centerX: number;
    centerY: number;
    offsetX: number;
    offsetY: number;
    mouseStartX: number;
    mouseStartY: number;
  } | null>(null);
  
  // Keep refs updated
  const activeToolRef = useRef(activeTool);
  const editorRef = useRef(editor);
  
  // Terrain props refs (to avoid closure issues in event handlers)
  const terrainElevationRef = useRef(terrainElevation);
  const terrainBrushSizeRef = useRef(terrainBrushSize);
  const terrainTypeRef = useRef(terrainType);
  const terrainBrushShapeRef = useRef(terrainBrushShape);
  
  useEffect(() => {
    activeToolRef.current = activeTool;
    if (appRef.current) {
      appRef.current.stage.cursor = activeTool === 'hand' ? 'grab' : 'default';
    }
  }, [activeTool]);
  
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);
  
  // Keep terrain refs updated
  useEffect(() => {
    terrainElevationRef.current = terrainElevation;
    terrainBrushSizeRef.current = terrainBrushSize;
    terrainTypeRef.current = terrainType;
    terrainBrushShapeRef.current = terrainBrushShape;
  }, [terrainElevation, terrainBrushSize, terrainType, terrainBrushShape]);

  // Screen to world coordinates
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    return {
      x: (screenX - panRef.current.x) / zoomRef.current,
      y: (screenY - panRef.current.y) / zoomRef.current,
    };
  }, []);

  // Snap value to grid
  const snapToGrid = useCallback((value: number) => {
    const gridSize = editorRef.current.gridSize;
    return Math.round(value / gridSize) * gridSize;
  }, []);

  // ============================
  // Initialize PixiJS
  // ============================
  useEffect(() => {
    if (!containerRef.current) return;

    const init = async () => {
      const app = new Application();
      
      await app.init({
        background: '#1a1a2e',
        resizeTo: containerRef.current!,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      containerRef.current!.appendChild(app.canvas);
      appRef.current = app;

      // Main container for pan/zoom
      const stageContainer = new Container();
      app.stage.addChild(stageContainer);
      stageContainerRef.current = stageContainer;

      // Sprites container (bottom - map backgrounds and objects)
      const spritesContainer = new Container();
      stageContainer.addChild(spritesContainer);
      spritesContainerRef.current = spritesContainer;

      // Terrain container (overlay on top of sprites)
      const terrainContainer = new Container();
      stageContainer.addChild(terrainContainer);
      terrainContainerRef.current = terrainContainer;

      // Grid graphics (above sprites and terrain for visibility)
      const gridGraphics = new Graphics();
      stageContainer.addChild(gridGraphics);
      gridGraphicsRef.current = gridGraphics;

      // Walls container (above grid)
      const wallsContainer = new Container();
      stageContainer.addChild(wallsContainer);
      wallsContainerRef.current = wallsContainer;

      // Selection/handles container (on top)
      const selectionContainer = new Container();
      stageContainer.addChild(selectionContainer);
      selectionContainerRef.current = selectionContainer;

      // Enable interactivity
      app.stage.eventMode = 'static';
      app.stage.hitArea = app.screen;
      app.stage.cursor = activeToolRef.current === 'hand' ? 'grab' : 'default';

      drawGrid();
      setIsReady(true);
    };

    init();

    return () => {
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
    };
  }, []);

  // ============================
  // Draw Grid
  // ============================
  const drawGrid = useCallback(() => {
    const graphics = gridGraphicsRef.current;
    if (!graphics) return;

    graphics.clear();

    const { enabled, type, lineStyle, cellSize, color, opacity } = editor.gridSettings;
    if (!enabled) return;

    const extent = 5000;
    const hexColor = parseInt(color.replace('#', ''), 16);

    // Set stroke style based on line style
    const strokeWidth = lineStyle === 'dots' ? 0 : 1;
    graphics.setStrokeStyle({ width: strokeWidth, color: hexColor, alpha: opacity });

    if (type === 'square') {
      if (lineStyle === 'dots') {
        // Draw dots at intersections
        graphics.setFillStyle({ color: hexColor, alpha: opacity });
        for (let x = -extent; x <= extent; x += cellSize) {
          for (let y = -extent; y <= extent; y += cellSize) {
            graphics.circle(x, y, 2);
          }
        }
        graphics.fill();
      } else if (lineStyle === 'dashed') {
        // Draw dashed lines
        const dashLength = 8;
        const gapLength = 8;
        for (let x = -extent; x <= extent; x += cellSize) {
          for (let y = -extent; y <= extent; y += dashLength + gapLength) {
            graphics.moveTo(x, y);
            graphics.lineTo(x, Math.min(y + dashLength, extent));
          }
        }
        for (let y = -extent; y <= extent; y += cellSize) {
          for (let x = -extent; x <= extent; x += dashLength + gapLength) {
            graphics.moveTo(x, y);
            graphics.lineTo(Math.min(x + dashLength, extent), y);
          }
        }
        graphics.stroke();
      } else {
        // Solid lines
        for (let x = -extent; x <= extent; x += cellSize) {
          graphics.moveTo(x, -extent);
          graphics.lineTo(x, extent);
        }
        for (let y = -extent; y <= extent; y += cellSize) {
          graphics.moveTo(-extent, y);
          graphics.lineTo(extent, y);
        }
        graphics.stroke();
      }
    } else if (type === 'hex-h' || type === 'hex-v') {
      // Hex grid (simplified - just draw hexagonal shapes)
      const hexHeight = cellSize;
      const hexWidth = cellSize * 0.866;
      
      if (lineStyle === 'dots') {
        graphics.setFillStyle({ color: hexColor, alpha: opacity });
        for (let row = -50; row <= 50; row++) {
          for (let col = -50; col <= 50; col++) {
            const offset = row % 2 === 0 ? 0 : hexWidth / 2;
            const x = col * hexWidth + offset;
            const y = row * hexHeight * 0.75;
            graphics.circle(x, y, 2);
          }
        }
        graphics.fill();
      } else {
        // Draw hex outlines (simplified)
        for (let row = -50; row <= 50; row++) {
          for (let col = -50; col <= 50; col++) {
            const offset = row % 2 === 0 ? 0 : hexWidth / 2;
            const cx = col * hexWidth + offset;
            const cy = row * hexHeight * 0.75;
            
            // Draw hexagon
            for (let i = 0; i < 6; i++) {
              const angle = (Math.PI / 3) * i + (type === 'hex-h' ? 0 : Math.PI / 6);
              const x1 = cx + cellSize / 2 * Math.cos(angle);
              const y1 = cy + cellSize / 2 * Math.sin(angle);
              const x2 = cx + cellSize / 2 * Math.cos(angle + Math.PI / 3);
              const y2 = cy + cellSize / 2 * Math.sin(angle + Math.PI / 3);
              graphics.moveTo(x1, y1);
              graphics.lineTo(x2, y2);
            }
          }
        }
        graphics.stroke();
      }
    } else if (type === 'isometric') {
      // Isometric grid
      if (lineStyle === 'dots') {
        graphics.setFillStyle({ color: hexColor, alpha: opacity });
        for (let i = -100; i <= 100; i++) {
          for (let j = -100; j <= 100; j++) {
            const x = (i - j) * cellSize / 2;
            const y = (i + j) * cellSize / 4;
            graphics.circle(x, y, 2);
          }
        }
        graphics.fill();
      } else {
        // Diagonal lines
        for (let i = -100; i <= 100; i++) {
          const startX = i * cellSize / 2;
          graphics.moveTo(startX - extent / 2, -extent / 4);
          graphics.lineTo(startX + extent / 2, extent / 4);
          graphics.moveTo(startX - extent / 2, extent / 4);
          graphics.lineTo(startX + extent / 2, -extent / 4);
        }
        graphics.stroke();
      }
    }
  }, [editor.gridSettings]);

  useEffect(() => {
    if (isReady) drawGrid();
  }, [isReady, drawGrid]);

  // ============================
  // Draw Terrain Overlay
  // ============================
  const drawTerrain = useCallback(() => {
    const container = terrainContainerRef.current;
    if (!container) return;

    container.removeChildren();

    if (!editor.showTerrain) return;

    const cellSize = editor.gridSettings.cellSize;
    const terrainGrid = editor.terrainGrid;

    // Get elevation color
    const getElevationColor = (elev: number): number => {
      const colorMap: Record<number, number> = {
        [-10]: 0x1e3a5f, // Deep pit - dark blue
        [-5]: 0x2563eb,  // Pit/Water - blue
        [0]: 0x22c55e,   // Ground - green
        [5]: 0xeab308,   // Low - yellow
        [10]: 0xf97316,  // Medium - orange
        [15]: 0xef4444,  // High - red
        [20]: 0xa855f7,  // Very high - purple
      };
      const keys = Object.keys(colorMap).map(Number).sort((a, b) => b - a);
      for (const key of keys) {
        if (elev >= key) return colorMap[key];
      }
      return colorMap[0];
    };

    // Draw each terrain cell
    Object.entries(terrainGrid).forEach(([key, cell]) => {
      const [gridX, gridY] = key.split(',').map(Number);
      const worldX = gridX * cellSize;
      const worldY = gridY * cellSize;

      const graphics = new Graphics();
      
      // Base color from elevation
      let baseColor = getElevationColor(cell.elevation);
      let alpha = 0.5;
      
      // Type-specific color adjustments
      if (cell.type === 'water') {
        baseColor = 0x3b82f6; // Blue for water
        alpha = 0.6;
      } else if (cell.type === 'hazard') {
        baseColor = 0xdc2626; // Red for hazard
        alpha = 0.6;
      } else if (cell.type === 'difficult') {
        baseColor = 0x92400e; // Brown for difficult
        alpha = 0.5;
      }
      
      graphics.setFillStyle({ color: baseColor, alpha });
      graphics.rect(worldX, worldY, cellSize, cellSize);
      graphics.fill();
      
      // Type indicator patterns
      const centerX = worldX + cellSize / 2;
      const centerY = worldY + cellSize / 2;
      
      if (cell.type === 'water') {
        // Wave pattern
        graphics.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 0.4 });
        graphics.moveTo(worldX + 5, centerY);
        graphics.quadraticCurveTo(worldX + cellSize/4, centerY - 5, worldX + cellSize/2, centerY);
        graphics.quadraticCurveTo(worldX + cellSize*3/4, centerY + 5, worldX + cellSize - 5, centerY);
        graphics.stroke();
      } else if (cell.type === 'hazard') {
        // X pattern
        graphics.setStrokeStyle({ width: 3, color: 0xffffff, alpha: 0.5 });
        const offset = cellSize * 0.25;
        graphics.moveTo(worldX + offset, worldY + offset);
        graphics.lineTo(worldX + cellSize - offset, worldY + cellSize - offset);
        graphics.moveTo(worldX + cellSize - offset, worldY + offset);
        graphics.lineTo(worldX + offset, worldY + cellSize - offset);
        graphics.stroke();
      } else if (cell.type === 'difficult') {
        // Dots pattern
        graphics.setFillStyle({ color: 0xffffff, alpha: 0.4 });
        const dotSize = 3;
        graphics.circle(centerX - 8, centerY, dotSize);
        graphics.circle(centerX + 8, centerY, dotSize);
        graphics.circle(centerX, centerY - 8, dotSize);
        graphics.circle(centerX, centerY + 8, dotSize);
        graphics.fill();
      }

      // Always show elevation label
      const labelText = cell.elevation > 0 ? `+${cell.elevation}` : `${cell.elevation}`;
      const text = new Text({
        text: labelText,
        style: {
          fontSize: cellSize / 4,
          fill: '#ffffff',
          fontWeight: 'bold',
        },
        anchor: { x: 0.5, y: 0.5 },
      });
      text.position.set(centerX, centerY);
      container.addChild(text);

      container.addChild(graphics);
    });
  }, [editor.terrainGrid, editor.showTerrain, editor.gridSettings.cellSize]);

  useEffect(() => {
    if (isReady) drawTerrain();
  }, [isReady, drawTerrain]);

  // ============================
  // Draw Walls
  // ============================
  const drawWalls = useCallback(() => {
    const container = wallsContainerRef.current;
    if (!container) return;
    
    container.removeChildren();
    
    const cellSize = editor.gridSettings.cellSize;
    const walls = editor.walls;
    
    // Color by height (taller = more red, shorter = more yellow)
    const getHeightColor = (height: number): number => {
      if (height >= 10) return 0xef4444;      // red - full wall
      if (height >= 5) return 0xf97316;       // orange - medium
      if (height >= 3) return 0xeab308;       // yellow - low
      return 0x6b7280;                         // gray - minimal
    };
    
    walls.forEach(wall => {
      const graphics = new Graphics();
      const color = getHeightColor(wall.height);
      const alpha = wall.visibility === 'transparent' ? 0.5 : 1;
      
      // Wall line thickness
      const thickness = wall.isDoor ? 4 : 6;
      
      // Convert grid coords to world coords
      const x1 = wall.p1.x * cellSize;
      const y1 = wall.p1.y * cellSize;
      const x2 = wall.p2.x * cellSize;
      const y2 = wall.p2.y * cellSize;
      
      // Draw wall line
      graphics.setStrokeStyle({ width: thickness, color, alpha });
      graphics.moveTo(x1, y1);
      graphics.lineTo(x2, y2);
      graphics.stroke();
      
      // Door indicator
      if (wall.isDoor) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const doorColor = wall.doorState === 'open' ? 0x22c55e : 
                          wall.doorState === 'locked' ? 0xef4444 : 0xeab308;
        graphics.setFillStyle({ color: doorColor });
        graphics.circle(midX, midY, 5);
        graphics.fill();
      }
      
      // Selected wall highlight
      if (editor.selectedWall?.id === wall.id) {
        graphics.setStrokeStyle({ width: thickness + 4, color: 0xffffff, alpha: 0.3 });
        graphics.moveTo(x1, y1);
        graphics.lineTo(x2, y2);
        graphics.stroke();
      }
      
      // Make wall clickable
      graphics.eventMode = 'static';
      graphics.cursor = 'pointer';
      graphics.hitArea = {
        contains: (px: number, py: number) => {
          // Check if point is near the wall line
          const dist = distanceToLine(px, py, x1, y1, x2, y2);
          return dist < 10;
        }
      };
      graphics.on('pointerdown', (e) => {
        e.stopPropagation();
        editorRef.current.selectWall(wall.id);
      });
      
      container.addChild(graphics);
    });
  }, [editor.walls, editor.selectedWall, editor.gridSettings.cellSize]);

  useEffect(() => {
    if (isReady) drawWalls();
  }, [isReady, drawWalls]);

  // ============================
  // Draw Selection Handles
  // ============================
  const drawSelectionHandles = useCallback(() => {
    const outerContainer = selectionContainerRef.current;
    if (!outerContainer) return;

    outerContainer.removeChildren();

    const selectedSprite = editor.selectedSprite;
    if (!selectedSprite) return;

    const handleSize = 10 / zoomRef.current;
    const { x, y, width, height } = selectedSprite;
    
    // Get rotation from pixiSprite if exists (real-time during drag), otherwise from state
    const spriteRef = spriteRefsRef.current.find(s => s.id === selectedSprite.id);
    const rotation = spriteRef ? spriteRef.pixiSprite.rotation : selectedSprite.rotation;
    
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    // Create a container that rotates around sprite center
    const rotatedContainer = new Container();
    rotatedContainer.position.set(centerX, centerY);
    rotatedContainer.rotation = rotation;
    outerContainer.addChild(rotatedContainer);

    // Local coordinates (relative to center)
    const localX = -width / 2;
    const localY = -height / 2;

    // Selection border (drawn relative to center)
    const border = new Graphics();
    border.setStrokeStyle({ width: 2 / zoomRef.current, color: 0x00aaff });
    border.rect(localX, localY, width, height);
    border.stroke();
    rotatedContainer.addChild(border);

    // Handle positions (relative to center)
    const handles: { type: HandleType; cx: number; cy: number; cursor: string }[] = [
      { type: 'nw', cx: localX, cy: localY, cursor: 'nw-resize' },
      { type: 'ne', cx: localX + width, cy: localY, cursor: 'ne-resize' },
      { type: 'sw', cx: localX, cy: localY + height, cursor: 'sw-resize' },
      { type: 'se', cx: localX + width, cy: localY + height, cursor: 'se-resize' },
      { type: 'n', cx: 0, cy: localY, cursor: 'n-resize' },
      { type: 's', cx: 0, cy: localY + height, cursor: 's-resize' },
      { type: 'w', cx: localX, cy: 0, cursor: 'w-resize' },
      { type: 'e', cx: localX + width, cy: 0, cursor: 'e-resize' },
    ];

    handles.forEach(({ type, cx, cy, cursor }) => {
      const handle = new Graphics();
      handle.setFillStyle({ color: 0x00aaff });
      handle.setStrokeStyle({ width: 1 / zoomRef.current, color: 0xffffff });
      handle.rect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
      handle.fill();
      handle.stroke();
      handle.eventMode = 'static';
      handle.cursor = cursor;

      handle.on('pointerdown', (e: FederatedPointerEvent) => {
        if (activeToolRef.current !== 'select') return;
        e.stopPropagation();

        dragStateRef.current = {
          type: 'resize',
          spriteId: selectedSprite.id,
          handle: type,
          startX: selectedSprite.x,
          startY: selectedSprite.y,
          startWidth: selectedSprite.width,
          startHeight: selectedSprite.height,
          startRotation: selectedSprite.rotation,
          centerX: selectedSprite.x + selectedSprite.width / 2,
          centerY: selectedSprite.y + selectedSprite.height / 2,
          offsetX: 0,
          offsetY: 0,
          mouseStartX: e.globalX,
          mouseStartY: e.globalY,
        };
      });

      rotatedContainer.addChild(handle);
    });

    // Rotation handle (circle above top center)
    const rotHandleDistance = 30 / zoomRef.current;
    const rotateHandle = new Graphics();
    rotateHandle.setFillStyle({ color: 0x00ff00 });
    rotateHandle.setStrokeStyle({ width: 1 / zoomRef.current, color: 0xffffff });
    rotateHandle.circle(0, localY - rotHandleDistance, handleSize / 1.5);
    rotateHandle.fill();
    rotateHandle.stroke();
    
    // Line from top to rotation handle
    const rotLine = new Graphics();
    rotLine.setStrokeStyle({ width: 1 / zoomRef.current, color: 0x00ff00 });
    rotLine.moveTo(0, localY);
    rotLine.lineTo(0, localY - rotHandleDistance);
    rotLine.stroke();
    rotatedContainer.addChild(rotLine);
    
    rotateHandle.eventMode = 'static';
    rotateHandle.cursor = 'grab';

    rotateHandle.on('pointerdown', (e: FederatedPointerEvent) => {
      if (activeToolRef.current !== 'select') return;
      e.stopPropagation();

      dragStateRef.current = {
        type: 'rotate',
        spriteId: selectedSprite.id,
        startX: selectedSprite.x,
        startY: selectedSprite.y,
        startWidth: selectedSprite.width,
        startHeight: selectedSprite.height,
        startRotation: selectedSprite.rotation,
        centerX: selectedSprite.x + selectedSprite.width / 2,
        centerY: selectedSprite.y + selectedSprite.height / 2,
        offsetX: 0,
        offsetY: 0,
        mouseStartX: e.globalX,
        mouseStartY: e.globalY,
      };
    });

    rotatedContainer.addChild(rotateHandle);
  }, [editor.selectedSprite]);

  useEffect(() => {
    if (isReady) drawSelectionHandles();
  }, [isReady, drawSelectionHandles, zoom]);

  // ============================
  // Render Sprites
  // ============================
  useEffect(() => {
    const container = spritesContainerRef.current;
    if (!container || !isReady) return;

    container.removeChildren();
    spriteRefsRef.current = [];

    const loadSprites = async () => {
      for (const sprite of editor.sprites) {
        const asset = editor.getAsset(sprite.assetId);
        if (!asset) continue;

        try {
          const texture = await Assets.load(asset.imageUrl);
          const pixiSprite = new PixiSprite(texture);
          
          // Set anchor to center for rotation around center
          pixiSprite.anchor.set(0.5, 0.5);
          
          // Position is now the center of the sprite
          pixiSprite.x = sprite.x + sprite.width / 2;
          pixiSprite.y = sprite.y + sprite.height / 2;
          pixiSprite.width = sprite.width;
          pixiSprite.height = sprite.height;
          pixiSprite.rotation = sprite.rotation;
          pixiSprite.eventMode = 'static';
          pixiSprite.cursor = 'move';

          // Sprite click to select & start drag
          pixiSprite.on('pointerdown', (e: FederatedPointerEvent) => {
            // Allow terrain painting through sprites
            if (activeToolRef.current === 'terrain') {
              isTerrainPaintingRef.current = true;
              const world = screenToWorld(e.globalX, e.globalY);
              const cellSize = editorRef.current.gridSettings.cellSize;
              const gridX = Math.floor(world.x / cellSize);
              const gridY = Math.floor(world.y / cellSize);
              editorRef.current.paintTerrainArea(gridX, gridY, terrainBrushSizeRef.current, terrainElevationRef.current, terrainTypeRef.current, terrainBrushShapeRef.current);
              e.stopPropagation();
              return;
            }
            
            if (activeToolRef.current !== 'select') return;
            e.stopPropagation();
            
            editorRef.current.selectSprite(sprite.id);
            
            if (e.button === 0) {
              const world = screenToWorld(e.globalX, e.globalY);
              const centerX = sprite.x + sprite.width / 2;
              const centerY = sprite.y + sprite.height / 2;
              dragStateRef.current = {
                type: 'move',
                spriteId: sprite.id,
                startX: sprite.x,
                startY: sprite.y,
                startWidth: sprite.width,
                startHeight: sprite.height,
                startRotation: sprite.rotation,
                centerX,
                centerY,
                offsetX: world.x - centerX,
                offsetY: world.y - centerY,
                mouseStartX: e.globalX,
                mouseStartY: e.globalY,
              };
            }
          });

          container.addChild(pixiSprite);
          spriteRefsRef.current.push({ id: sprite.id, pixiSprite });
        } catch (err) {
          console.error('Failed to load sprite:', sprite.id, err);
        }
      }

      drawSelectionHandles();
    };

    loadSprites();
  }, [isReady, editor.sprites, editor.getAsset, screenToWorld, drawSelectionHandles]);

  // ============================
  // Global Pointer Handlers
  // ============================
  useEffect(() => {
    const app = appRef.current;
    const stageContainer = stageContainerRef.current;
    if (!app || !stageContainer || !isReady) return;

    const onPointerDown = (e: FederatedPointerEvent) => {
      // Terrain painting
      if (e.button === 0 && activeToolRef.current === 'terrain') {
        isTerrainPaintingRef.current = true;
        const world = screenToWorld(e.globalX, e.globalY);
        const cellSize = editorRef.current.gridSettings.cellSize;
        const gridX = Math.floor(world.x / cellSize);
        const gridY = Math.floor(world.y / cellSize);
        editorRef.current.paintTerrainArea(gridX, gridY, terrainBrushSizeRef.current, terrainElevationRef.current, terrainTypeRef.current, terrainBrushShapeRef.current);
        return;
      }
      
      // Wall drawing - start
      if (e.button === 0 && activeToolRef.current === 'wall') {
        const world = screenToWorld(e.globalX, e.globalY);
        const cellSize = editorRef.current.gridSettings.cellSize;
        // Snap to nearest grid point (corner, not center)
        const gridX = Math.round(world.x / cellSize);
        const gridY = Math.round(world.y / cellSize);
        isWallDrawingRef.current = true;
        wallStartPointRef.current = { x: gridX, y: gridY };
        return;
      }
      
      // Click on empty canvas with Select tool = deselect
      if (e.button === 0 && activeToolRef.current === 'select' && !dragStateRef.current) {
        editorRef.current.selectSprite(null);
        editorRef.current.selectWall(null);
      }
      
      // Hand tool or middle-click = pan
      if (e.button === 1 || (e.button === 0 && activeToolRef.current === 'hand')) {
        isPanningRef.current = true;
        panStartRef.current = {
          x: panRef.current.x,
          y: panRef.current.y,
          mouseX: e.globalX,
          mouseY: e.globalY,
        };
        app.stage.cursor = 'grabbing';
      }
    };

    const onPointerMove = (e: FederatedPointerEvent) => {
      // Continue terrain painting while dragging
      if (isTerrainPaintingRef.current && activeToolRef.current === 'terrain') {
        const world = screenToWorld(e.globalX, e.globalY);
        const cellSize = editorRef.current.gridSettings.cellSize;
        const gridX = Math.floor(world.x / cellSize);
        const gridY = Math.floor(world.y / cellSize);
        editorRef.current.paintTerrainArea(gridX, gridY, terrainBrushSizeRef.current, terrainElevationRef.current, terrainTypeRef.current, terrainBrushShapeRef.current);
        return;
      }

      // Wall preview while dragging
      if (isWallDrawingRef.current && wallStartPointRef.current && wallsContainerRef.current) {
        const world = screenToWorld(e.globalX, e.globalY);
        const cellSize = editorRef.current.gridSettings.cellSize;
        const endX = Math.round(world.x / cellSize);
        const endY = Math.round(world.y / cellSize);
        const start = wallStartPointRef.current;
        
        // Remove old preview
        if (wallPreviewRef.current) {
          wallsContainerRef.current.removeChild(wallPreviewRef.current);
        }
        
        // Draw preview line
        const preview = new Graphics();
        preview.setStrokeStyle({ width: 4, color: 0xffffff, alpha: 0.6 });
        preview.moveTo(start.x * cellSize, start.y * cellSize);
        preview.lineTo(endX * cellSize, endY * cellSize);
        preview.stroke();
        
        wallsContainerRef.current.addChild(preview);
        wallPreviewRef.current = preview;
        return;
      }

      // Handle resize
      if (dragStateRef.current?.type === 'resize') {
        const state = dragStateRef.current;
        const dx = (e.globalX - state.mouseStartX) / zoomRef.current;
        const dy = (e.globalY - state.mouseStartY) / zoomRef.current;
        
        let newX = state.startX;
        let newY = state.startY;
        let newWidth = state.startWidth;
        let newHeight = state.startHeight;

        // Apply resize based on handle
        switch (state.handle) {
          case 'se':
            newWidth = Math.max(20, state.startWidth + dx);
            newHeight = Math.max(20, state.startHeight + dy);
            break;
          case 'sw':
            newX = state.startX + dx;
            newWidth = Math.max(20, state.startWidth - dx);
            newHeight = Math.max(20, state.startHeight + dy);
            break;
          case 'ne':
            newY = state.startY + dy;
            newWidth = Math.max(20, state.startWidth + dx);
            newHeight = Math.max(20, state.startHeight - dy);
            break;
          case 'nw':
            newX = state.startX + dx;
            newY = state.startY + dy;
            newWidth = Math.max(20, state.startWidth - dx);
            newHeight = Math.max(20, state.startHeight - dy);
            break;
          case 'n':
            newY = state.startY + dy;
            newHeight = Math.max(20, state.startHeight - dy);
            break;
          case 's':
            newHeight = Math.max(20, state.startHeight + dy);
            break;
          case 'w':
            newX = state.startX + dx;
            newWidth = Math.max(20, state.startWidth - dx);
            break;
          case 'e':
            newWidth = Math.max(20, state.startWidth + dx);
            break;
        }

        // Snap to grid
        newX = snapToGrid(newX);
        newY = snapToGrid(newY);
        newWidth = snapToGrid(newWidth);
        newHeight = snapToGrid(newHeight);
        if (newWidth < editorRef.current.gridSize) newWidth = editorRef.current.gridSize;
        if (newHeight < editorRef.current.gridSize) newHeight = editorRef.current.gridSize;

        // Update visual (position is center-based due to anchor)
        const spriteRef = spriteRefsRef.current.find(s => s.id === state.spriteId);
        if (spriteRef) {
          spriteRef.pixiSprite.x = newX + newWidth / 2;
          spriteRef.pixiSprite.y = newY + newHeight / 2;
          spriteRef.pixiSprite.width = newWidth;
          spriteRef.pixiSprite.height = newHeight;
        }
        drawSelectionHandles();
        return;
      }

      // Handle move
      if (dragStateRef.current?.type === 'move') {
        const state = dragStateRef.current;
        const world = screenToWorld(e.globalX, e.globalY);
        
        // Calculate new center position
        const newCenterX = world.x - state.offsetX;
        const newCenterY = world.y - state.offsetY;
        
        // Convert to top-left for grid snapping
        const topLeftX = newCenterX - state.startWidth / 2;
        const topLeftY = newCenterY - state.startHeight / 2;
        
        // Snap top-left to grid
        const snappedX = snapToGrid(topLeftX);
        const snappedY = snapToGrid(topLeftY);
        
        // Convert back to center for visual
        const visualCenterX = snappedX + state.startWidth / 2;
        const visualCenterY = snappedY + state.startHeight / 2;
        
        const spriteRef = spriteRefsRef.current.find(s => s.id === state.spriteId);
        if (spriteRef) {
          spriteRef.pixiSprite.x = visualCenterX;
          spriteRef.pixiSprite.y = visualCenterY;
        }
        drawSelectionHandles();
        return;
      }

      // Handle rotate
      if (dragStateRef.current?.type === 'rotate') {
        const state = dragStateRef.current;
        const world = screenToWorld(e.globalX, e.globalY);
        
        // Calculate angle from center to current mouse position
        const centerWorld = { 
          x: state.startX + state.startWidth / 2, 
          y: state.startY + state.startHeight / 2 
        };
        const angle = Math.atan2(world.y - centerWorld.y, world.x - centerWorld.x);
        // Initial angle was pointing up (-90 degrees), so adjust
        let rotation = angle + Math.PI / 2;
        
        // Snap to 45° angles (0, 45, 90, 135, 180, 225, 270, 315)
        const snapAngle = Math.PI / 4; // 45 degrees
        const snapThreshold = Math.PI / 90; // 2 degrees
        const normalizedRotation = ((rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const nearestSnap = Math.round(normalizedRotation / snapAngle) * snapAngle;
        const isSnapped = Math.abs(normalizedRotation - nearestSnap) < snapThreshold;
        if (isSnapped) {
          rotation = nearestSnap;
        }
        
        const spriteRef = spriteRefsRef.current.find(s => s.id === state.spriteId);
        if (spriteRef) {
          spriteRef.pixiSprite.rotation = rotation;
        }
        
        // Calculate degrees (0-360) for display
        let degrees = (rotation * 180 / Math.PI) % 360;
        if (degrees < 0) degrees += 360;
        degrees = Math.round(degrees);
        
        // Update React state for rotation display overlay
        const screenPos = {
          x: panRef.current.x + centerWorld.x * zoomRef.current,
          y: panRef.current.y + centerWorld.y * zoomRef.current,
        };
        setRotationDisplay({ degrees, isSnapped, x: screenPos.x, y: screenPos.y });
        
        drawSelectionHandles();
        return;
      }

      // Handle pan
      if (isPanningRef.current) {
        const dx = e.globalX - panStartRef.current.mouseX;
        const dy = e.globalY - panStartRef.current.mouseY;
        panRef.current.x = panStartRef.current.x + dx;
        panRef.current.y = panStartRef.current.y + dy;
        stageContainer.position.set(panRef.current.x, panRef.current.y);
      }
    };

    const onPointerUp = (e: FederatedPointerEvent) => {
      // Finish wall drawing
      if (isWallDrawingRef.current && wallStartPointRef.current) {
        const world = screenToWorld(e.globalX, e.globalY);
        const cellSize = editorRef.current.gridSettings.cellSize;
        // Snap to nearest grid point (corner)
        const endX = Math.round(world.x / cellSize);
        const endY = Math.round(world.y / cellSize);
        const start = wallStartPointRef.current;
        
        // Only create wall if start and end are different
        if (start.x !== endX || start.y !== endY) {
          editorRef.current.addWall(
            { x: start.x, y: start.y },
            { x: endX, y: endY }
          );
        }
        
        // Clean up preview
        if (wallPreviewRef.current && wallsContainerRef.current) {
          wallsContainerRef.current.removeChild(wallPreviewRef.current);
          wallPreviewRef.current = null;
        }
        
        isWallDrawingRef.current = false;
        wallStartPointRef.current = null;
      }
      
      // Stop terrain painting
      if (isTerrainPaintingRef.current) {
        isTerrainPaintingRef.current = false;
      }
      
      // Finish resize/move/rotate
      if (dragStateRef.current) {
        const state = dragStateRef.current;
        const spriteRef = spriteRefsRef.current.find(s => s.id === state.spriteId);
        
        if (spriteRef) {
          const ps = spriteRef.pixiSprite;
          if (state.type === 'rotate') {
            editorRef.current.updateSpriteRotation(state.spriteId, ps.rotation);
            // Clear rotation display overlay
            setRotationDisplay(null);
            // Remove rotation text if exists
            if (rotationTextRef.current && selectionContainerRef.current) {
              selectionContainerRef.current.removeChild(rotationTextRef.current);
              rotationTextRef.current = null;
            }
          } else {
            // Convert center position back to top-left for state
            const width = ps.width;
            const height = ps.height;
            const topLeftX = ps.x - width / 2;
            const topLeftY = ps.y - height / 2;
            editorRef.current.updateSpriteTransform(state.spriteId, topLeftX, topLeftY, width, height);
          }
        }
        dragStateRef.current = null;
      }

      // Finish pan
      if (isPanningRef.current) {
        isPanningRef.current = false;
        app.stage.cursor = activeToolRef.current === 'hand' ? 'grab' : 'default';
      }
    };

    app.stage.on('pointerdown', onPointerDown);
    app.stage.on('pointermove', onPointerMove);
    app.stage.on('pointerup', onPointerUp);
    app.stage.on('pointerupoutside', onPointerUp);

    return () => {
      app.stage.off('pointerdown', onPointerDown);
      app.stage.off('pointermove', onPointerMove);
      app.stage.off('pointerup', onPointerUp);
      app.stage.off('pointerupoutside', onPointerUp);
    };
  }, [isReady, screenToWorld, drawSelectionHandles]);

  // ============================
  // Zoom Handler
  // ============================
  useEffect(() => {
    const container = containerRef.current;
    const stageContainer = stageContainerRef.current;
    if (!container || !stageContainer) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(5, zoomRef.current * zoomFactor));

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const worldX = (mouseX - panRef.current.x) / zoomRef.current;
      const worldY = (mouseY - panRef.current.y) / zoomRef.current;

      zoomRef.current = newZoom;
      stageContainer.scale.set(newZoom);

      panRef.current.x = mouseX - worldX * newZoom;
      panRef.current.y = mouseY - worldY * newZoom;
      stageContainer.position.set(panRef.current.x, panRef.current.y);

      setZoom(newZoom);
      drawSelectionHandles();
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [isReady, drawSelectionHandles]);

  return (
    <div className="relative w-full h-full">
      <div 
        ref={containerRef} 
        className="w-full h-full bg-[#1a1a2e]"
        onContextMenu={(e) => e.preventDefault()}
      />
      
      {/* Rotation display overlay */}
      {rotationDisplay && (
        <div 
          className="absolute pointer-events-none z-50"
          style={{
            left: rotationDisplay.x,
            top: rotationDisplay.y,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className={`px-3 py-1.5 rounded-lg font-bold text-lg shadow-lg ${
            rotationDisplay.isSnapped 
              ? 'bg-green-600/90 text-white' 
              : 'bg-black/70 text-white'
          }`}>
            {rotationDisplay.degrees}°
          </div>
        </div>
      )}
      
      {/* Zoom indicator */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white/70 px-3 py-1.5 rounded-lg text-sm font-mono">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}
