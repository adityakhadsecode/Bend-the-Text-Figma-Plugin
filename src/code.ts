// Bend the Text (Figma Plugin Core Engine)
// High-performance typography curving and circular text for Figma.

figma.showUI(__html__, {
  width: 360,
  height: 620,
  themeColors: true,
  title: "Bend the Text"
});

// Prime default font cache immediately on launch
figma.loadFontAsync({ family: "Inter", style: "Regular" }).catch(() => {});

let currentPreviewGroup: (GroupNode | SceneNode) | null = null;
let lastSelectedNodeId: string | null = null;
let lastSelectedTextNodeId: string | null = null;

interface TextSelectionInfo {
  textNode: TextNode;
  referenceNode: SceneNode;
}

// Helper: Find selected TextNode or enclosing Group/Frame containing text
function findTextInSelection(): TextSelectionInfo | null {
  const selection = figma.currentPage.selection;
  if (!selection || selection.length === 0) return null;

  for (const node of selection) {
    if (node.type === "TEXT") {
      return { textNode: node, referenceNode: node };
    }
    if ("findOne" in node) {
      const child = (node as ChildrenMixin).findOne((n) => n.type === "TEXT") as TextNode | null;
      if (child) {
        return { textNode: child, referenceNode: node as SceneNode };
      }
    }
  }
  return null;
}

const loadedFontCache = new Set<string>();

// Safely load a font with fallback to Inter Regular
async function safeLoadFont(fontName: any): Promise<FontName> {
  const fallback: FontName = { family: "Inter", style: "Regular" };

  if (!fontName || typeof fontName !== "object" || !fontName.family || !fontName.style) {
    const key = "Inter::Regular";
    if (!loadedFontCache.has(key)) {
      try {
        await figma.loadFontAsync(fallback);
        loadedFontCache.add(key);
      } catch {}
    }
    return fallback;
  }

  const targetKey = `${fontName.family}::${fontName.style}`;
  if (loadedFontCache.has(targetKey)) {
    return fontName as FontName;
  }

  try {
    await figma.loadFontAsync(fontName);
    loadedFontCache.add(targetKey);
    return fontName as FontName;
  } catch (err) {
    console.warn("Could not load font", fontName, "falling back to Inter Regular");
    const fbKey = "Inter::Regular";
    if (!loadedFontCache.has(fbKey)) {
      try {
        await figma.loadFontAsync(fallback);
        loadedFontCache.add(fbKey);
      } catch {}
    }
    return fallback;
  }
}

interface CharMetric {
  char: string;
  width: number;
  height: number;
  font: FontName;
  size: number;
  fills: any;
  letterSpacing: any;
  lineHeight: any;
  textCase: any;
  textDecoration: any;
}

// Measure advance widths of each character accurately using Figma layout engine
// and extract exact individual font and typographic properties per character
async function measureAndExtractCharacters(targetNode: TextNode, rawText: string): Promise<CharMetric[]> {
  // CRITICAL: Ensure Inter Regular is loaded before creating any text node
  await safeLoadFont({ family: "Inter", style: "Regular" });

  const measureNode = figma.createText();
  measureNode.autoRename = false;
  measureNode.visible = false;

  const charMetrics: CharMetric[] = [];
  const textLen = targetNode.characters.length;

  for (let i = 0; i < rawText.length; i++) {
    const char = rawText[i];
    const rangeIndex = Math.min(i, Math.max(0, textLen - 1));

    // Extract font
    let font: FontName = { family: "Inter", style: "Regular" };
    try {
      const rawFont = targetNode.getRangeFontName(rangeIndex, rangeIndex + 1);
      if (rawFont && typeof rawFont === "object" && (rawFont as any) !== figma.mixed && rawFont.family) {
        font = rawFont as FontName;
      } else if (targetNode.fontName && (targetNode.fontName as any) !== figma.mixed && (targetNode.fontName as FontName).family) {
        font = targetNode.fontName as FontName;
      }
    } catch {
      if (targetNode.fontName && (targetNode.fontName as any) !== figma.mixed && (targetNode.fontName as FontName).family) {
        font = targetNode.fontName as FontName;
      }
    }

    // Extract size
    let size = 24;
    try {
      const rawSize = targetNode.getRangeFontSize(rangeIndex, rangeIndex + 1);
      if (typeof rawSize === "number" && Number.isFinite(rawSize)) {
        size = rawSize;
      } else if (typeof targetNode.fontSize === "number" && Number.isFinite(targetNode.fontSize)) {
        size = targetNode.fontSize;
      }
    } catch {
      if (typeof targetNode.fontSize === "number" && Number.isFinite(targetNode.fontSize)) size = targetNode.fontSize;
    }

    // Extract fills
    let fills: any = [];
    try {
      const rawFills = targetNode.getRangeFills(rangeIndex, rangeIndex + 1);
      if (rawFills && Array.isArray(rawFills)) {
        fills = rawFills;
      } else if (targetNode.fills && Array.isArray(targetNode.fills)) {
        fills = targetNode.fills;
      }
    } catch {
      if (targetNode.fills && Array.isArray(targetNode.fills)) {
        fills = targetNode.fills;
      }
    }

    // Extract letterSpacing
    let letterSpacing: any = null;
    try {
      const rawSpacing = targetNode.getRangeLetterSpacing(rangeIndex, rangeIndex + 1);
      if (rawSpacing && typeof rawSpacing === "object" && (rawSpacing as any) !== figma.mixed) {
        letterSpacing = rawSpacing;
      } else if (targetNode.letterSpacing && typeof targetNode.letterSpacing === "object" && (targetNode.letterSpacing as any) !== figma.mixed) {
        letterSpacing = targetNode.letterSpacing;
      }
    } catch {}

    // Extract lineHeight
    let lineHeight: any = null;
    try {
      const rawLH = targetNode.getRangeLineHeight(rangeIndex, rangeIndex + 1);
      if (rawLH && typeof rawLH === "object" && (rawLH as any) !== figma.mixed) {
        lineHeight = rawLH;
      } else if (targetNode.lineHeight && typeof targetNode.lineHeight === "object" && (targetNode.lineHeight as any) !== figma.mixed) {
        lineHeight = targetNode.lineHeight;
      }
    } catch {}

    // Extract textCase & textDecoration
    let textCase: any = null;
    try {
      const rawCase = targetNode.getRangeTextCase(rangeIndex, rangeIndex + 1);
      if (rawCase && typeof rawCase === "string" && (rawCase as any) !== figma.mixed) {
        textCase = rawCase;
      }
    } catch {}

    let textDecoration: any = null;
    try {
      const rawDec = targetNode.getRangeTextDecoration(rangeIndex, rangeIndex + 1);
      if (rawDec && typeof rawDec === "string" && (rawDec as any) !== figma.mixed) {
        textDecoration = rawDec;
      }
    } catch {}

    // Safely load the character's font
    const loadedFont = await safeLoadFont(font);
    try {
      measureNode.fontName = loadedFont;
      measureNode.fontSize = size;
      if (letterSpacing) {
        measureNode.letterSpacing = letterSpacing;
      }
    } catch (e) {
      console.warn("Could not set font on measureNode:", e);
    }

    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      let spaceWidth = 6;
      try {
        measureNode.characters = "A ";
        const w1 = measureNode.width;
        measureNode.characters = "A";
        const w0 = measureNode.width;
        spaceWidth = Math.max(3, w1 - w0);
      } catch {
        spaceWidth = size * 0.3;
      }

      charMetrics.push({
        char,
        width: spaceWidth,
        height: measureNode.height || size,
        font: loadedFont,
        size,
        fills,
        letterSpacing,
        lineHeight,
        textCase,
        textDecoration
      });
      continue;
    }

    try {
      measureNode.characters = char;
    } catch {
      measureNode.characters = "?";
    }

    charMetrics.push({
      char,
      width: Math.max(1, measureNode.width),
      height: Math.max(1, measureNode.height || size),
      font: loadedFont,
      size,
      fills,
      letterSpacing,
      lineHeight,
      textCase,
      textDecoration
    });
  }

  try {
    measureNode.remove();
  } catch {}

  return charMetrics;
}

// Send current selection details to UI
function syncSelectionWithUI() {
  const match = findTextInSelection();
  if (!match) {
    lastSelectedNodeId = null;
    lastSelectedTextNodeId = null;
    figma.ui.postMessage({
      type: "selection-changed",
      hasSelection: false,
      message: "Please select a text layer to bend."
    });
    return;
  }

  const { textNode, referenceNode } = match;
  lastSelectedNodeId = referenceNode.id;
  lastSelectedTextNodeId = textNode.id;

  const charPreview = textNode.characters.length > 40
    ? textNode.characters.slice(0, 37) + "..."
    : textNode.characters;

  figma.ui.postMessage({
    type: "selection-changed",
    hasSelection: true,
    text: textNode.characters,
    previewLabel: charPreview,
    fontSize: typeof textNode.fontSize === "number" ? textNode.fontSize : 24,
    nodeName: referenceNode.name
  });
}

// Listen to selection changes on the canvas
figma.on("selectionchange", () => {
  const selection = figma.currentPage.selection;
  if (currentPreviewGroup && selection.length === 1 && selection[0].id === currentPreviewGroup.id) {
    return;
  }
  syncSelectionWithUI();
});

// Clean up any temporary preview elements
function clearPreview() {
  if (currentPreviewGroup && !currentPreviewGroup.removed) {
    try {
      currentPreviewGroup.remove();
    } catch (e) {}
  }
  currentPreviewGroup = null;
}

interface BendOptions {
  bend: number;
  tracking: number;
  alignment: "baseline" | "center" | "top" | "bottom";
  placement: "beside" | "below" | "inplace";
  invert: boolean;
  outputFormat: "text" | "vector";
}

async function getNodeSafely(id: string | null): Promise<BaseNode | null> {
  if (!id) return null;
  try {
    if (typeof figma.getNodeByIdAsync === "function") {
      return await figma.getNodeByIdAsync(id);
    }
  } catch {}
  try {
    return (figma as any).getNodeById(id);
  } catch {
    return null;
  }
}

// Construct bent type geometry and return the created GroupNode or SceneNode placed beside the original
async function generateBentNodes(options: BendOptions, isLivePreview = false): Promise<SceneNode | null> {
  const {
    bend = 50,
    tracking = 0,
    alignment = "baseline",
    placement = "beside",
    invert = false,
    outputFormat = "text"
  } = options;

  let textNode: TextNode | null = null;
  let referenceNode: SceneNode | null = null;

  // Prefer direct active canvas selection
  const freshMatch = findTextInSelection();
  if (freshMatch) {
    textNode = freshMatch.textNode;
    referenceNode = freshMatch.referenceNode;
  } else if (lastSelectedTextNodeId && lastSelectedNodeId) {
    textNode = (await getNodeSafely(lastSelectedTextNodeId)) as TextNode | null;
    referenceNode = (await getNodeSafely(lastSelectedNodeId)) as SceneNode | null;
  }

  if (!textNode || textNode.type !== "TEXT" || textNode.removed || !referenceNode || referenceNode.removed) {
    figma.notify("Original text layer not found. Please re-select it.", { error: true });
    return null;
  }

  // Pre-load default fallback font
  await safeLoadFont({ family: "Inter", style: "Regular" });

  // Read common stroke & effect properties from source text layer safely
  let strokes: any[] = [];
  try {
    if (textNode.strokes && Array.isArray(textNode.strokes)) {
      strokes = JSON.parse(JSON.stringify(textNode.strokes));
    }
  } catch {}

  const strokeWeight = typeof textNode.strokeWeight === "number" ? textNode.strokeWeight : 1;
  const strokeAlign = textNode.strokeAlign || "INSIDE";
  const strokeCap = (textNode.strokeCap as any) !== figma.mixed ? textNode.strokeCap : undefined;
  const strokeJoin = (textNode.strokeJoin as any) !== figma.mixed ? textNode.strokeJoin : undefined;
  const dashPattern = Array.isArray(textNode.dashPattern) && textNode.dashPattern.length > 0 ? textNode.dashPattern : [];

  let effects: any[] = [];
  try {
    if (textNode.effects && Array.isArray(textNode.effects)) {
      effects = JSON.parse(JSON.stringify(textNode.effects));
    }
  } catch {}

  const opacity = typeof textNode.opacity === "number" ? textNode.opacity : 1;
  const blendMode = textNode.blendMode || "PASS_THROUGH";

  const rawText = textNode.characters;
  if (!rawText.trim()) {
    figma.notify("Text layer is empty.", { error: true });
    return null;
  }

  // Measure all characters with exact font properties
  const metrics = await measureAndExtractCharacters(textNode, rawText);

  const totalWidth = metrics.reduce((sum, m) => sum + m.width, 0) + (metrics.length - 1) * tracking;
  if (totalWidth <= 0) return null;

  // Normalized bend factor [-1, 1]
  const b = Math.max(-100, Math.min(100, bend)) / 100;
  const isFlat = Math.abs(b) < 0.001;

  // Curve angles & radius
  const maxCurveAngle = 2 * Math.PI;
  const theta = isFlat ? 0.0001 : b * maxCurveAngle;
  const radius = totalWidth / Math.abs(theta);

  // Position reference points centered at (0, 0) initially
  const centerX = 0;
  const centerY = 0;

  let circleCenter = { x: centerX, y: centerY };
  if (b >= 0) {
    circleCenter.y = centerY + radius;
  } else {
    circleCenter.y = centerY - radius;
  }

  // Create character nodes directly on figma.currentPage (safe for grouping)
  const createdNodes: SceneNode[] = [];
  let accumulatedDist = 0;

  for (let i = 0; i < metrics.length; i++) {
    const item = metrics[i];
    const charWidth = item.width;
    const charHeight = item.height;

    const charCenterDist = accumulatedDist + charWidth / 2;
    accumulatedDist += charWidth + tracking;

    const delta = charCenterDist - totalWidth / 2;

    let charAngle = isFlat ? 0 : delta / radius;
    if (invert) {
      charAngle = -charAngle;
    }

    let targetX = centerX;
    let targetY = centerY;
    let rotation = 0;

    if (isFlat) {
      targetX = centerX + delta;
      targetY = centerY;
      rotation = invert ? Math.PI : 0;
    } else if (b >= 0) {
      targetX = circleCenter.x + radius * Math.sin(charAngle);
      targetY = circleCenter.y - radius * Math.cos(charAngle);
      rotation = charAngle;
      if (invert) rotation += Math.PI;
    } else {
      targetX = circleCenter.x + radius * Math.sin(charAngle);
      targetY = circleCenter.y + radius * Math.cos(charAngle);
      rotation = -charAngle;
      if (invert) rotation += Math.PI;
    }

    // Skip empty whitespace characters from node creation
    if (item.char === " " || item.char === "\t" || item.char === "\n" || item.char === "\r") {
      continue;
    }

    const anchorX = charWidth / 2;
    let anchorY = charHeight / 2;

    if (alignment === "baseline") {
      anchorY = charHeight * 0.76;
    } else if (alignment === "top") {
      anchorY = 0;
    } else if (alignment === "bottom") {
      anchorY = charHeight;
    }

    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const tx = targetX - (anchorX * cosR - anchorY * sinR);
    const ty = targetY - (anchorX * sinR + anchorY * cosR);

    // Create TextNode for character
    const charNode = figma.createText();
    try {
      charNode.fontName = item.font;
      charNode.fontSize = item.size;
      charNode.characters = item.char;
      charNode.autoRename = false;
      charNode.name = item.char;
    } catch (e) {
      console.warn("Could not set character properties:", e);
    }

    // Apply exact font fills from character range
    if (item.fills && Array.isArray(item.fills) && item.fills.length > 0) {
      try {
        charNode.fills = JSON.parse(JSON.stringify(item.fills));
      } catch {}
    }

    // Apply exact typography properties
    try {
      if (item.letterSpacing && typeof item.letterSpacing === "object") {
        charNode.letterSpacing = item.letterSpacing;
      }
      if (item.lineHeight && typeof item.lineHeight === "object") {
        charNode.lineHeight = item.lineHeight;
      }
      if (item.textCase && typeof item.textCase === "string") {
        charNode.textCase = item.textCase as TextCase;
      }
      if (item.textDecoration && typeof item.textDecoration === "string") {
        charNode.textDecoration = item.textDecoration as TextDecoration;
      }
    } catch {}

    // Apply strokes
    if (strokes.length > 0) {
      try {
        charNode.strokes = strokes;
        charNode.strokeWeight = strokeWeight;
        charNode.strokeAlign = strokeAlign;
        if (strokeCap) charNode.strokeCap = strokeCap;
        if (strokeJoin) charNode.strokeJoin = strokeJoin;
        if (dashPattern.length > 0) charNode.dashPattern = dashPattern;
      } catch {}
    }

    // Apply effects
    if (effects.length > 0) {
      try {
        charNode.effects = effects;
      } catch {}
    }

    charNode.opacity = opacity;
    charNode.blendMode = blendMode;

    if (Number.isFinite(cosR) && Number.isFinite(sinR) && Number.isFinite(tx) && Number.isFinite(ty)) {
      charNode.relativeTransform = [
        [cosR, -sinR, tx],
        [sinR, cosR, ty]
      ];
    }

    createdNodes.push(charNode);
  }

  if (createdNodes.length === 0) {
    return null;
  }

  // All createdNodes were created in figma.currentPage, so figma.group on currentPage is 100% safe
  const group = figma.group(createdNodes, figma.currentPage);
  const snippet = rawText.length > 20 ? rawText.slice(0, 18) + "..." : rawText;
  group.name = isLivePreview ? `[Preview] Bent: ${snippet}` : `Bent: ${snippet}`;

  // Check if referenceNode is inside a Frame that can accept children
  const refParent = referenceNode.parent;
  let canAttachToParent = false;

  if (refParent && refParent.type !== "INSTANCE") {
    if (refParent.type === "FRAME" && refParent.layoutMode !== "NONE") {
      // Auto-layout frame: creating or moving groups into it can conflict
      canAttachToParent = false;
    } else if (refParent !== figma.currentPage) {
      canAttachToParent = true;
    }
  }

  if (canAttachToParent && refParent) {
    try {
      (refParent as BaseNode & ChildrenMixin).appendChild(group);
    } catch (e) {
      console.warn("Could not append group to parent frame, leaving on currentPage:", e);
    }
  }

  // Calculate coordinates in the correct parent coordinate space
  let refX = referenceNode.x;
  let refY = referenceNode.y;
  let refW = referenceNode.width;
  let refH = referenceNode.height;

  // If group ended up on currentPage while referenceNode is in a nested frame
  if (group.parent === figma.currentPage && referenceNode.parent !== figma.currentPage) {
    const absBox = referenceNode.absoluteBoundingBox;
    if (absBox) {
      refX = absBox.x;
      refY = absBox.y;
      refW = absBox.width;
      refH = absBox.height;
    }
  }

  const gap = 36;
  if (placement === "beside") {
    group.x = refX + refW + gap;
    group.y = refY + (refH / 2) - (group.height / 2);
  } else if (placement === "below") {
    group.x = refX + (refW / 2) - (group.width / 2);
    group.y = refY + refH + gap;
  } else {
    group.x = refX + (refW / 2) - (group.width / 2);
    group.y = refY + (refH / 2) - (group.height / 2);
  }

  if (isLivePreview) {
    return group;
  }

  // Optional vector flattening
  if (outputFormat === "vector") {
    try {
      const flattened = figma.flatten([group], group.parent || figma.currentPage);
      flattened.name = `Bent: ${snippet} (Vector)`;
      return flattened;
    } catch (e) {
      console.warn("Flatten to vector failed, keeping text group", e);
      return group;
    }
  }

  return group;
}

// Handle UI Messages
figma.ui.onmessage = async (msg) => {
  switch (msg.type) {
    case "init": {
      syncSelectionWithUI();
      break;
    }

    case "preview-bend": {
      const match = findTextInSelection();
      if (!match) return;

      clearPreview();
      match.referenceNode.visible = true;

      try {
        currentPreviewGroup = (await generateBentNodes(msg.options, true)) as GroupNode | null;
      } catch (e) {
        console.warn("Preview error:", e);
      }
      break;
    }

    case "clear-preview": {
      clearPreview();
      break;
    }

    case "apply-bend": {
      clearPreview();

      const match = findTextInSelection();
      if (!match) {
        figma.notify("Please select a text layer to apply.", { error: true });
        return;
      }

      try {
        const finalGroup = await generateBentNodes(msg.options, false);
        if (finalGroup) {
          match.referenceNode.visible = true;
          figma.currentPage.selection = [finalGroup];
          figma.notify("New curved text group created beside your text!");

          if (msg.closeOnApply) {
            figma.closePlugin();
          }
        } else {
          figma.notify("Could not create curved text. Please check text selection.", { error: true });
        }
      } catch (err: any) {
        console.error("Failed to bend text:", err);
        const errMsg = err && err.message ? err.message : String(err);
        figma.notify("Error bending text: " + errMsg, { error: true });
      }
      break;
    }

    case "cancel": {
      clearPreview();
      figma.closePlugin();
      break;
    }
  }
};
