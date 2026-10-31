var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// Bend the Text (Figma Plugin Core Engine)
// High-performance typography curving and circular text for Figma.
figma.showUI(__html__, {
    width: 360,
    height: 600,
    themeColors: true,
    title: "Bend the Text"
});
// Prime default font cache immediately on launch
figma.loadFontAsync({ family: "Inter", style: "Regular" }).catch(() => { });
let currentPreviewGroup = null;
let currentPreviewSession = 0;
let lastSelectedNodeId = null;
let lastSelectedTextNodeId = null;
let activeReEditNode = null;
let activeReEditConfig = null;
// Check if a node is created by this plugin (preview or final bent group)
function isBentNode(node) {
    if (!node)
        return false;
    if (currentPreviewGroup && node.id === currentPreviewGroup.id)
        return true;
    try {
        if ("getPluginData" in node && typeof node.getPluginData === "function") {
            if (node.getPluginData("isBent") === "true")
                return true;
            if (node.getPluginData("bendConfig"))
                return true;
        }
    }
    catch (_a) { }
    if ("name" in node && typeof node.name === "string") {
        const name = node.name;
        if (name.startsWith("[Preview] Bent:") || name.startsWith("Bent:"))
            return true;
    }
    if (node.parent && isBentNode(node.parent))
        return true;
    return false;
}
// Helper: Find selected TextNode or enclosing Group/Frame containing text (ignoring bent groups)
function findTextInSelection() {
    const selection = figma.currentPage.selection;
    if (!selection || selection.length === 0)
        return null;
    for (const node of selection) {
        if (isBentNode(node))
            continue;
        if (node.type === "TEXT") {
            return { textNode: node, referenceNode: node };
        }
        if ("findOne" in node) {
            try {
                const child = node.findOne((n) => n.type === "TEXT" && !isBentNode(n));
                if (child) {
                    return { textNode: child, referenceNode: node };
                }
            }
            catch (_a) { }
        }
    }
    return null;
}
// Determine if the user selected an existing bent group or a flat text layer
function getSelectionInfo() {
    const selection = figma.currentPage.selection;
    if (!selection || selection.length === 0)
        return null;
    // 1. Check if single selection is an existing bent group or vector with bendConfig
    if (selection.length === 1) {
        const node = selection[0];
        if (currentPreviewGroup && node.id === currentPreviewGroup.id) {
            return null;
        }
        let targetNode = node;
        let rawConfig = "";
        try {
            if ("getPluginData" in targetNode) {
                rawConfig = targetNode.getPluginData("bendConfig");
            }
        }
        catch (_a) { }
        // Check parent if user clicked a single character inside the bent group
        if (!rawConfig && targetNode.parent && "getPluginData" in targetNode.parent) {
            try {
                rawConfig = targetNode.parent.getPluginData("bendConfig");
                if (rawConfig) {
                    targetNode = targetNode.parent;
                }
            }
            catch (_b) { }
        }
        if (rawConfig) {
            try {
                const config = JSON.parse(rawConfig);
                if (config && config.rawText) {
                    return {
                        type: "re-edit",
                        bentNode: targetNode,
                        referenceNode: targetNode,
                        config
                    };
                }
            }
            catch (e) {
                console.warn("Could not parse bendConfig:", e);
            }
        }
    }
    // 2. Otherwise search for a flat text layer
    const textMatch = findTextInSelection();
    if (textMatch) {
        return {
            type: "text",
            textNode: textMatch.textNode,
            referenceNode: textMatch.referenceNode
        };
    }
    return null;
}
const loadedFontCache = new Set();
// Safely load a font with fallback to Inter Regular
function safeLoadFont(fontName) {
    return __awaiter(this, void 0, void 0, function* () {
        const fallback = { family: "Inter", style: "Regular" };
        if (!fontName || typeof fontName !== "object" || !fontName.family || !fontName.style) {
            const key = "Inter::Regular";
            if (!loadedFontCache.has(key)) {
                try {
                    yield figma.loadFontAsync(fallback);
                    loadedFontCache.add(key);
                }
                catch (_a) { }
            }
            return fallback;
        }
        const targetKey = `${fontName.family}::${fontName.style}`;
        if (loadedFontCache.has(targetKey)) {
            return fontName;
        }
        try {
            yield figma.loadFontAsync(fontName);
            loadedFontCache.add(targetKey);
            return fontName;
        }
        catch (err) {
            console.warn("Could not load font", fontName, "falling back to Inter Regular");
            const fbKey = "Inter::Regular";
            if (!loadedFontCache.has(fbKey)) {
                try {
                    yield figma.loadFontAsync(fallback);
                    loadedFontCache.add(fbKey);
                }
                catch (_b) { }
            }
            return fallback;
        }
    });
}
// Measure advance widths of each character accurately using Figma layout engine
// and extract exact individual font and typographic properties per character
function measureAndExtractCharacters(targetNode, rawText) {
    return __awaiter(this, void 0, void 0, function* () {
        // CRITICAL: Ensure Inter Regular is loaded before creating any text node
        yield safeLoadFont({ family: "Inter", style: "Regular" });
        const measureNode = figma.createText();
        measureNode.autoRename = false;
        measureNode.visible = false;
        const charMetrics = [];
        // Normalize Windows \r\n and whitespace to single spaces for circular layout
        const normalizedText = rawText.replace(/\r\n/g, " ").replace(/[\r\n\t]/g, " ");
        // Use Array.from to correctly support unicode surrogate pairs and multi-byte glyphs
        const chars = Array.from(normalizedText);
        const textLen = targetNode.characters.length;
        try {
            for (let i = 0; i < chars.length; i++) {
                const char = chars[i];
                const rangeIndex = Math.min(i, Math.max(0, textLen - 1));
                // Extract font
                let font = { family: "Inter", style: "Regular" };
                try {
                    const rawFont = targetNode.getRangeFontName(rangeIndex, rangeIndex + 1);
                    if (rawFont && typeof rawFont === "object" && rawFont !== figma.mixed && rawFont.family) {
                        font = rawFont;
                    }
                    else if (targetNode.fontName && targetNode.fontName !== figma.mixed && targetNode.fontName.family) {
                        font = targetNode.fontName;
                    }
                }
                catch (_a) {
                    if (targetNode.fontName && targetNode.fontName !== figma.mixed && targetNode.fontName.family) {
                        font = targetNode.fontName;
                    }
                }
                // Extract size
                let size = 24;
                try {
                    const rawSize = targetNode.getRangeFontSize(rangeIndex, rangeIndex + 1);
                    if (typeof rawSize === "number" && Number.isFinite(rawSize)) {
                        size = rawSize;
                    }
                    else if (typeof targetNode.fontSize === "number" && Number.isFinite(targetNode.fontSize)) {
                        size = targetNode.fontSize;
                    }
                }
                catch (_b) {
                    if (typeof targetNode.fontSize === "number" && Number.isFinite(targetNode.fontSize))
                        size = targetNode.fontSize;
                }
                // Extract fills
                let fills = [];
                try {
                    const rawFills = targetNode.getRangeFills(rangeIndex, rangeIndex + 1);
                    if (rawFills && Array.isArray(rawFills)) {
                        fills = rawFills;
                    }
                    else if (targetNode.fills && Array.isArray(targetNode.fills)) {
                        fills = targetNode.fills;
                    }
                }
                catch (_c) {
                    if (targetNode.fills && Array.isArray(targetNode.fills)) {
                        fills = targetNode.fills;
                    }
                }
                // Extract letterSpacing
                let letterSpacing = null;
                try {
                    const rawSpacing = targetNode.getRangeLetterSpacing(rangeIndex, rangeIndex + 1);
                    if (rawSpacing && typeof rawSpacing === "object" && rawSpacing !== figma.mixed) {
                        letterSpacing = rawSpacing;
                    }
                    else if (targetNode.letterSpacing && typeof targetNode.letterSpacing === "object" && targetNode.letterSpacing !== figma.mixed) {
                        letterSpacing = targetNode.letterSpacing;
                    }
                }
                catch (_d) { }
                // Extract lineHeight
                let lineHeight = null;
                try {
                    const rawLH = targetNode.getRangeLineHeight(rangeIndex, rangeIndex + 1);
                    if (rawLH && typeof rawLH === "object" && rawLH !== figma.mixed) {
                        lineHeight = rawLH;
                    }
                    else if (targetNode.lineHeight && typeof targetNode.lineHeight === "object" && targetNode.lineHeight !== figma.mixed) {
                        lineHeight = targetNode.lineHeight;
                    }
                }
                catch (_e) { }
                // Extract textCase & textDecoration
                let textCase = null;
                try {
                    const rawCase = targetNode.getRangeTextCase(rangeIndex, rangeIndex + 1);
                    if (rawCase && typeof rawCase === "string" && rawCase !== figma.mixed) {
                        textCase = rawCase;
                    }
                }
                catch (_f) { }
                let textDecoration = null;
                try {
                    const rawDec = targetNode.getRangeTextDecoration(rangeIndex, rangeIndex + 1);
                    if (rawDec && typeof rawDec === "string" && rawDec !== figma.mixed) {
                        textDecoration = rawDec;
                    }
                }
                catch (_g) { }
                // Safely load the character's font
                const loadedFont = yield safeLoadFont(font);
                try {
                    measureNode.fontName = loadedFont;
                    measureNode.fontSize = size;
                    if (letterSpacing) {
                        measureNode.letterSpacing = letterSpacing;
                    }
                    if (textCase && typeof textCase === "string") {
                        measureNode.textCase = textCase;
                    }
                }
                catch (e) {
                    console.warn("Could not set font on measureNode:", e);
                }
                if (char === " ") {
                    let spaceWidth = 6;
                    try {
                        measureNode.characters = "A ";
                        const w1 = measureNode.width;
                        measureNode.characters = "A";
                        const w0 = measureNode.width;
                        spaceWidth = (w1 > w0) ? (w1 - w0) : (size * 0.28);
                    }
                    catch (_h) {
                        spaceWidth = size * 0.28;
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
                }
                catch (_j) {
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
        }
        finally {
            try {
                measureNode.remove();
            }
            catch (_k) { }
        }
        return charMetrics;
    });
}
// Send current selection details to UI
function syncSelectionWithUI() {
    const info = getSelectionInfo();
    if (!info) {
        clearPreview();
        activeReEditNode = null;
        activeReEditConfig = null;
        lastSelectedNodeId = null;
        lastSelectedTextNodeId = null;
        figma.ui.postMessage({
            type: "selection-changed",
            hasSelection: false,
            message: "Please select a text layer to bend."
        });
        return;
    }
    if (info.type === "re-edit" && info.bentNode && info.config) {
        if (activeReEditNode && activeReEditNode.id !== info.bentNode.id) {
            clearPreview();
        }
        activeReEditNode = info.bentNode;
        activeReEditConfig = info.config;
        lastSelectedNodeId = info.bentNode.id;
        lastSelectedTextNodeId = info.config.sourceTextNodeId || null;
        const cleanLabel = info.bentNode.name.replace(/^\[Preview\]\s*/, "").replace(/^Bent:\s*/, "");
        figma.ui.postMessage({
            type: "selection-changed",
            hasSelection: true,
            isReEdit: true,
            text: info.config.rawText,
            previewLabel: `Re-editing: ${cleanLabel}`,
            fontSize: info.config.metrics && info.config.metrics[0] ? info.config.metrics[0].size : 24,
            nodeName: `Bent: ${cleanLabel}`,
            config: info.config.options
        });
        return;
    }
    // Normal text selection
    if (activeReEditNode) {
        clearPreview();
        activeReEditNode = null;
        activeReEditConfig = null;
    }
    const { textNode, referenceNode } = info;
    if (!textNode)
        return;
    lastSelectedNodeId = referenceNode.id;
    lastSelectedTextNodeId = textNode.id;
    const charPreview = textNode.characters.length > 40
        ? textNode.characters.slice(0, 37) + "..."
        : textNode.characters;
    figma.ui.postMessage({
        type: "selection-changed",
        hasSelection: true,
        isReEdit: false,
        text: textNode.characters,
        previewLabel: charPreview,
        fontSize: typeof textNode.fontSize === "number" ? textNode.fontSize : 24,
        nodeName: referenceNode.name
    });
}
// Listen to selection changes on the canvas
figma.on("selectionchange", () => {
    const selection = figma.currentPage.selection;
    // If the selection is our active temporary preview group, don't trigger selection sync
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
        }
        catch (e) { }
    }
    currentPreviewGroup = null;
    if (activeReEditNode && !activeReEditNode.removed) {
        activeReEditNode.visible = true;
    }
}
function getNodeSafely(id) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!id)
            return null;
        try {
            if (typeof figma.getNodeByIdAsync === "function") {
                return yield figma.getNodeByIdAsync(id);
            }
        }
        catch (_a) { }
        try {
            return figma.getNodeById(id);
        }
        catch (_b) {
            return null;
        }
    });
}
// Construct bent type geometry and return the created GroupNode or SceneNode placed beside the original
function generateBentNodes(options_1) {
    return __awaiter(this, arguments, void 0, function* (options, isLivePreview = false, explicitTextNode, explicitReferenceNode, snapshotConfig) {
        const { bend = 50, tracking = 0, alignment = "baseline", placement = "beside", invert = false, outputFormat = "text" } = options;
        let textNode = explicitTextNode || null;
        let referenceNode = explicitReferenceNode || null;
        const isReEditMode = !!(snapshotConfig || (activeReEditNode && activeReEditNode.id === (referenceNode === null || referenceNode === void 0 ? void 0 : referenceNode.id)));
        let rawText = "";
        let metrics = [];
        let strokes = [];
        let strokeWeight = 1;
        let strokeAlign = "INSIDE";
        let strokeCap = undefined;
        let strokeJoin = undefined;
        let dashPattern = [];
        let effects = [];
        let opacity = 1;
        let blendMode = "PASS_THROUGH";
        // Pre-load default fallback font
        yield safeLoadFont({ family: "Inter", style: "Regular" });
        if (snapshotConfig) {
            rawText = snapshotConfig.rawText;
            metrics = snapshotConfig.metrics;
            strokes = snapshotConfig.strokes || [];
            strokeWeight = snapshotConfig.strokeWeight || 1;
            strokeAlign = snapshotConfig.strokeAlign || "INSIDE";
            strokeCap = snapshotConfig.strokeCap;
            strokeJoin = snapshotConfig.strokeJoin;
            dashPattern = snapshotConfig.dashPattern || [];
            effects = snapshotConfig.effects || [];
            opacity = typeof snapshotConfig.opacity === "number" ? snapshotConfig.opacity : 1;
            blendMode = snapshotConfig.blendMode || "PASS_THROUGH";
            if (!referenceNode && activeReEditNode) {
                referenceNode = activeReEditNode;
            }
        }
        else {
            if (!textNode || !referenceNode) {
                const match = findTextInSelection();
                if (match) {
                    textNode = match.textNode;
                    referenceNode = match.referenceNode;
                }
                else if (lastSelectedTextNodeId && lastSelectedNodeId) {
                    const t = yield getNodeSafely(lastSelectedTextNodeId);
                    const r = yield getNodeSafely(lastSelectedNodeId);
                    if (t && t.type === "TEXT" && !t.removed && !isBentNode(t)) {
                        textNode = t;
                    }
                    if (r && !r.removed && !isBentNode(r)) {
                        referenceNode = r;
                    }
                }
            }
            if (!textNode || textNode.type !== "TEXT" || textNode.removed || !referenceNode || referenceNode.removed) {
                figma.notify("Original text layer not found. Please re-select it.", { error: true });
                return null;
            }
            rawText = textNode.characters;
            if (!rawText.trim()) {
                figma.notify("Text layer is empty.", { error: true });
                return null;
            }
            try {
                if (textNode.strokes && Array.isArray(textNode.strokes)) {
                    strokes = JSON.parse(JSON.stringify(textNode.strokes));
                }
            }
            catch (_a) { }
            strokeWeight = typeof textNode.strokeWeight === "number" ? textNode.strokeWeight : 1;
            strokeAlign = textNode.strokeAlign || "INSIDE";
            strokeCap = textNode.strokeCap !== figma.mixed ? textNode.strokeCap : undefined;
            strokeJoin = textNode.strokeJoin !== figma.mixed ? textNode.strokeJoin : undefined;
            dashPattern = Array.isArray(textNode.dashPattern) && textNode.dashPattern.length > 0 ? textNode.dashPattern : [];
            try {
                if (textNode.effects && Array.isArray(textNode.effects)) {
                    effects = JSON.parse(JSON.stringify(textNode.effects));
                }
            }
            catch (_b) { }
            opacity = typeof textNode.opacity === "number" ? textNode.opacity : 1;
            blendMode = textNode.blendMode || "PASS_THROUGH";
            metrics = yield measureAndExtractCharacters(textNode, rawText);
        }
        const totalWidth = metrics.reduce((sum, m) => sum + m.width, 0) + (metrics.length - 1) * tracking;
        if (totalWidth <= 0)
            return null;
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
        }
        else {
            circleCenter.y = centerY - radius;
        }
        // Create character nodes directly on figma.currentPage (safe for grouping)
        const createdNodes = [];
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
            }
            else if (b >= 0) {
                targetX = circleCenter.x + radius * Math.sin(charAngle);
                targetY = circleCenter.y - radius * Math.cos(charAngle);
                rotation = charAngle;
                if (invert)
                    rotation += Math.PI;
            }
            else {
                targetX = circleCenter.x + radius * Math.sin(charAngle);
                targetY = circleCenter.y + radius * Math.cos(charAngle);
                rotation = -charAngle;
                if (invert)
                    rotation += Math.PI;
            }
            // Skip whitespace characters from node creation
            if (item.char === " ") {
                continue;
            }
            const anchorX = charWidth / 2;
            let anchorY = charHeight / 2;
            if (alignment === "baseline") {
                anchorY = charHeight * 0.76;
            }
            else if (alignment === "top") {
                anchorY = 0;
            }
            else if (alignment === "bottom") {
                anchorY = charHeight;
            }
            if (invert) {
                anchorY = charHeight - anchorY;
            }
            const cosR = Math.cos(rotation);
            const sinR = Math.sin(rotation);
            const tx = targetX - (anchorX * cosR - anchorY * sinR);
            const ty = targetY - (anchorX * sinR + anchorY * cosR);
            // Create TextNode for character
            const charNode = figma.createText();
            charNode.setPluginData("isBent", "true");
            charNode.autoRename = false;
            charNode.name = item.char;
            try {
                charNode.fontName = item.font;
            }
            catch (e) {
                console.warn("Could not set character fontName:", e);
            }
            try {
                charNode.fontSize = item.size;
            }
            catch (e) {
                console.warn("Could not set character fontSize:", e);
            }
            try {
                charNode.characters = item.char;
            }
            catch (e) {
                console.warn("Could not set character text:", e);
            }
            // Apply exact font fills from character range (including empty [] for outline text)
            if (Array.isArray(item.fills)) {
                try {
                    charNode.fills = JSON.parse(JSON.stringify(item.fills));
                }
                catch (_c) { }
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
                    charNode.textCase = item.textCase;
                }
                if (item.textDecoration && typeof item.textDecoration === "string") {
                    charNode.textDecoration = item.textDecoration;
                }
            }
            catch (_d) { }
            // Apply strokes
            if (strokes.length > 0) {
                try {
                    charNode.strokes = strokes;
                    charNode.strokeWeight = strokeWeight;
                    charNode.strokeAlign = strokeAlign;
                    if (strokeCap)
                        charNode.strokeCap = strokeCap;
                    if (strokeJoin)
                        charNode.strokeJoin = strokeJoin;
                    if (dashPattern.length > 0)
                        charNode.dashPattern = dashPattern;
                }
                catch (_e) { }
            }
            // Apply effects
            if (effects.length > 0) {
                try {
                    charNode.effects = effects;
                }
                catch (_f) { }
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
        group.setPluginData("isBent", "true");
        let label = (referenceNode === null || referenceNode === void 0 ? void 0 : referenceNode.name) || rawText;
        label = label.replace(/^\[Preview\]\s*/, "").replace(/^Bent:\s*/, "");
        if (label.length > 24) {
            label = label.slice(0, 21) + "...";
        }
        group.name = isLivePreview ? `[Preview] Bent: ${label}` : `Bent: ${label}`;
        // If in re-edit mode, keep referenceNode hidden during live preview
        if (isReEditMode && activeReEditNode && !activeReEditNode.removed) {
            activeReEditNode.visible = false;
        }
        else if (isLivePreview && referenceNode && !referenceNode.removed) {
            try {
                figma.currentPage.selection = [referenceNode];
            }
            catch (_g) { }
        }
        // Positioning
        if (isReEditMode && referenceNode && !referenceNode.removed) {
            // In re-edit mode, place directly where the existing bent group was!
            const targetParent = referenceNode.parent;
            if (targetParent && targetParent !== figma.currentPage && "appendChild" in targetParent) {
                try {
                    targetParent.appendChild(group);
                }
                catch (_h) { }
            }
            group.x = referenceNode.x + (referenceNode.width / 2) - (group.width / 2);
            group.y = referenceNode.y + (referenceNode.height / 2) - (group.height / 2);
        }
        else if (referenceNode && !referenceNode.removed) {
            // Check if referenceNode is inside a Frame that can accept children
            const refParent = referenceNode.parent;
            let canAttachToParent = false;
            if (refParent && refParent.type !== "INSTANCE" && refParent.type !== "GROUP") {
                if (refParent.type === "FRAME" && refParent.layoutMode !== "NONE") {
                    canAttachToParent = false;
                }
                else if (refParent !== figma.currentPage && "appendChild" in refParent) {
                    canAttachToParent = true;
                }
            }
            if (canAttachToParent && refParent) {
                try {
                    refParent.appendChild(group);
                }
                catch (e) {
                    console.warn("Could not append group to parent frame, leaving on currentPage:", e);
                }
            }
            // Calculate coordinates in the correct parent coordinate space
            let refX = referenceNode.x;
            let refY = referenceNode.y;
            let refW = referenceNode.width;
            let refH = referenceNode.height;
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
            }
            else if (placement === "below") {
                group.x = refX + (refW / 2) - (group.width / 2);
                group.y = refY + refH + gap;
            }
            else {
                group.x = refX + (refW / 2) - (group.width / 2);
                group.y = refY + (refH / 2) - (group.height / 2);
            }
        }
        const configToSave = {
            sourceTextNodeId: (snapshotConfig === null || snapshotConfig === void 0 ? void 0 : snapshotConfig.sourceTextNodeId) || (textNode === null || textNode === void 0 ? void 0 : textNode.id),
            rawText,
            metrics,
            strokes,
            strokeWeight,
            strokeAlign: strokeAlign,
            strokeCap,
            strokeJoin,
            dashPattern,
            effects,
            opacity,
            blendMode,
            options
        };
        if (!isLivePreview) {
            group.setPluginData("bendConfig", JSON.stringify(configToSave));
        }
        if (isLivePreview) {
            return group;
        }
        // Optional vector flattening
        if (outputFormat === "vector") {
            try {
                const flattened = figma.flatten([group], group.parent || figma.currentPage);
                flattened.name = `Bent: ${label} (Vector)`;
                flattened.setPluginData("isBent", "true");
                flattened.setPluginData("bendConfig", JSON.stringify(configToSave));
                return flattened;
            }
            catch (e) {
                console.warn("Flatten to vector failed, keeping text group", e);
                return group;
            }
        }
        return group;
    });
}
// Handle UI Messages
figma.ui.onmessage = (msg) => __awaiter(this, void 0, void 0, function* () {
    switch (msg.type) {
        case "init": {
            syncSelectionWithUI();
            break;
        }
        case "preview-bend": {
            const sessionId = ++currentPreviewSession;
            let textNode = null;
            let referenceNode = null;
            let snapshot = null;
            if (activeReEditNode && activeReEditConfig) {
                referenceNode = activeReEditNode;
                snapshot = activeReEditConfig;
            }
            else {
                const match = findTextInSelection();
                if (match) {
                    textNode = match.textNode;
                    referenceNode = match.referenceNode;
                }
                else if (lastSelectedTextNodeId && lastSelectedNodeId) {
                    const t = yield getNodeSafely(lastSelectedTextNodeId);
                    const r = yield getNodeSafely(lastSelectedNodeId);
                    if (t && t.type === "TEXT" && !t.removed && !isBentNode(t)) {
                        textNode = t;
                    }
                    if (r && !r.removed && !isBentNode(r)) {
                        referenceNode = r;
                    }
                }
            }
            if (!snapshot && (!textNode || !referenceNode))
                return;
            clearPreview();
            if (snapshot && activeReEditNode && !activeReEditNode.removed) {
                activeReEditNode.visible = false;
            }
            else if (referenceNode) {
                referenceNode.visible = true;
            }
            try {
                const preview = (yield generateBentNodes(msg.options, true, textNode, referenceNode, snapshot));
                if (sessionId !== currentPreviewSession) {
                    if (preview && !preview.removed) {
                        try {
                            preview.remove();
                        }
                        catch (_a) { }
                    }
                    return;
                }
                currentPreviewGroup = preview;
            }
            catch (e) {
                console.warn("Preview error:", e);
            }
            break;
        }
        case "clear-preview": {
            clearPreview();
            break;
        }
        case "apply-bend": {
            try {
                let finalGroup = null;
                const isReEdit = !!(activeReEditNode && activeReEditConfig);
                const oldTarget = activeReEditNode;
                if (currentPreviewGroup && !currentPreviewGroup.removed) {
                    const targetGroup = currentPreviewGroup;
                    currentPreviewGroup = null;
                    const cleanName = targetGroup.name.replace(/^\[Preview\]\s*/, "");
                    const savedConfig = isReEdit && activeReEditConfig ? activeReEditConfig : null;
                    if (savedConfig) {
                        savedConfig.options = msg.options;
                        targetGroup.setPluginData("bendConfig", JSON.stringify(savedConfig));
                    }
                    if (msg.options && msg.options.outputFormat === "vector") {
                        try {
                            const parent = targetGroup.parent || figma.currentPage;
                            const flattened = figma.flatten([targetGroup], parent);
                            flattened.name = `${cleanName} (Vector)`;
                            flattened.setPluginData("isBent", "true");
                            if (savedConfig) {
                                flattened.setPluginData("bendConfig", JSON.stringify(savedConfig));
                            }
                            finalGroup = flattened;
                        }
                        catch (e) {
                            targetGroup.name = cleanName;
                            targetGroup.setPluginData("isBent", "true");
                            finalGroup = targetGroup;
                        }
                    }
                    else {
                        targetGroup.name = cleanName;
                        targetGroup.setPluginData("isBent", "true");
                        finalGroup = targetGroup;
                    }
                }
                else {
                    clearPreview();
                    let textNode = null;
                    let referenceNode = null;
                    let snapshot = null;
                    if (isReEdit && activeReEditConfig) {
                        referenceNode = oldTarget;
                        snapshot = activeReEditConfig;
                    }
                    else {
                        const match = findTextInSelection();
                        if (match) {
                            textNode = match.textNode;
                            referenceNode = match.referenceNode;
                        }
                        else if (lastSelectedTextNodeId && lastSelectedNodeId) {
                            const t = yield getNodeSafely(lastSelectedTextNodeId);
                            const r = yield getNodeSafely(lastSelectedNodeId);
                            if (t && t.type === "TEXT" && !t.removed && !isBentNode(t)) {
                                textNode = t;
                            }
                            if (r && !r.removed && !isBentNode(r)) {
                                referenceNode = r;
                            }
                        }
                    }
                    if (!snapshot && (!textNode || !referenceNode)) {
                        figma.notify("Please select a text layer to apply.", { error: true });
                        return;
                    }
                    finalGroup = yield generateBentNodes(msg.options, false, textNode, referenceNode, snapshot);
                }
                if (finalGroup) {
                    // If in re-edit mode, replace oldTarget in place
                    if (isReEdit && oldTarget && !oldTarget.removed) {
                        const parent = oldTarget.parent;
                        if (parent && "insertChild" in parent && typeof parent.insertChild === "function") {
                            try {
                                const idx = parent.children.indexOf(oldTarget);
                                if (idx !== -1) {
                                    parent.insertChild(idx, finalGroup);
                                }
                            }
                            catch (_b) { }
                        }
                        try {
                            oldTarget.remove();
                        }
                        catch (_c) { }
                    }
                    figma.currentPage.selection = [finalGroup];
                    figma.notify(isReEdit ? "Bent text updated successfully!" : "Bent text applied successfully.");
                    if (isReEdit) {
                        activeReEditNode = finalGroup;
                    }
                    if (msg.closeOnApply) {
                        figma.closePlugin();
                    }
                }
                else {
                    figma.notify("Could not apply bent text.", { error: true });
                }
            }
            catch (err) {
                console.error("Failed to apply bent text:", err);
                const errMsg = err && err.message ? err.message : String(err);
                figma.notify("Error applying bent text: " + errMsg, { error: true });
            }
            break;
        }
        case "cancel": {
            clearPreview();
            figma.closePlugin();
            break;
        }
    }
});
// Always clean up preview if user closes plugin via the Figma UI close button
figma.on("close", () => {
    clearPreview();
});
// Update UI and preview when the selected text content is edited in place
figma.on("documentchange", (event) => {
    if (!lastSelectedTextNodeId && !activeReEditNode)
        return;
    for (const change of event.documentChanges) {
        if (change.type === "PROPERTY_CHANGE" &&
            (change.id === lastSelectedTextNodeId || (activeReEditNode && change.id === activeReEditNode.id))) {
            syncSelectionWithUI();
            break;
        }
    }
});
