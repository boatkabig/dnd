'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Application, Container, Graphics, Sprite as PixiSprite, FederatedPointerEvent, Assets, Text } from 'pixi.js';
import type { Tool } from './Toolbox';
import type { Editor } from './useEditor';

interface CanvasProps {
  activeTool: Tool;
  editor: Editor;
}

type HandleType = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

interface SpriteRef {
  id: string;
  pixiSprite: PixiSprite;
}

export function Canvas({ activeTool, editor }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const stageContainerRef = useRef<Container | null>(null);
  const gridGraphicsRef = useRef<Graphics | null>(null);
  const spritesContainerRef = useRef<Container | null>(null);
  const selectionContainerRef = useRef<Container | null>(null);
  const rotationTextRef = useRef<Text | null>(null);
  const spriteRefsRef = useRef<SpriteRef[]>([]);
  
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
  
  useEffect(() => {
    activeToolRef.current = activeTool;
    if (appRef.current) {
      appRef.current.stage.cursor = activeTool === 'hand' ? 'grab' : 'default';
    }
  }, [activeTool]);
  
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

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

      // Grid graphics
      const gridGraphics = new Graphics();
      stageContainer.addChild(gridGraphics);
      gridGraphicsRef.current = gridGraphics;

      // Sprites container
      const spritesContainer = new Container();
      stageContainer.addChild(spritesContainer);
      spritesContainerRef.current = spritesContainer;

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
      // Click on empty canvas with Select tool = deselect
      if (e.button === 0 && activeToolRef.current === 'select' && !dragStateRef.current) {
        editorRef.current.selectSprite(null);
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

    const onPointerUp = () => {
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
