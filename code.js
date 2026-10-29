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
    height: 620,
    themeColors: true,
    title: "Bend the Text"
});
// Prime default font cache immediately on launch
figma.loadFontAsync({ family: "Inter", style: "Regular" }).catch(() => { });
let currentPreviewGroup = null;
let lastSelectedNodeId = null;
let lastSelectedTextNodeId = null;
// Helper: Find selected TextNode or enclosing Group/Frame containing text
function findTextInSelection() {
    const selection = figma.currentPage.selection;
    if (!selection || selection.length === 0)
        return null;
    for (const node of selection) {
        if (node.type === "TEXT") {
            return { textNode: node, referenceNode: node };
        }
        if ("findOne" in node) {
            const child = node.findOne((n) => n.type === "TEXT");
            if (child) {
                return { textNode: child, referenceNode: node };
            }
        }
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
        const textLen = targetNode.characters.length;
        for (let i = 0; i < rawText.length; i++) {
            const char = rawText[i];
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
            }
            catch (e) {
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
                }
                catch (_h) {
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
        try {
            measureNode.remove();
        }
        catch (_k) { }
        return charMetrics;
    });
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
        }
        catch (e) { }
    }
    currentPreviewGroup = null;
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
    return __awaiter(this, arguments, void 0, function* (options, isLivePreview = false) {
        const { bend = 50, tracking = 0, alignment = "baseline", placement = "beside", invert = false, outputFormat = "text" } = options;
        let textNode = null;
        let referenceNode = null;
        // Prefer direct active canvas selection
        const freshMatch = findTextInSelection();
        if (freshMatch) {
            textNode = freshMatch.textNode;
            referenceNode = freshMatch.referenceNode;
        }
        else if (lastSelectedTextNodeId && lastSelectedNodeId) {
            textNode = (yield getNodeSafely(lastSelectedTextNodeId));
            referenceNode = (yield getNodeSafely(lastSelectedNodeId));
        }
        if (!textNode || textNode.type !== "TEXT" || textNode.removed || !referenceNode || referenceNode.removed) {
            figma.notify("Original text layer not found. Please re-select it.", { error: true });
            return null;
        }
        // Pre-load default fallback font
        yield safeLoadFont({ family: "Inter", style: "Regular" });
        // Read common stroke & effect properties from source text layer safely
        let strokes = [];
        try {
            if (textNode.strokes && Array.isArray(textNode.strokes)) {
                strokes = JSON.parse(JSON.stringify(textNode.strokes));
            }
        }
        catch (_a) { }
        const strokeWeight = typeof textNode.strokeWeight === "number" ? textNode.strokeWeight : 1;
        const strokeAlign = textNode.strokeAlign || "INSIDE";
        const strokeCap = textNode.strokeCap !== figma.mixed ? textNode.strokeCap : undefined;
        const strokeJoin = textNode.strokeJoin !== figma.mixed ? textNode.strokeJoin : undefined;
        const dashPattern = Array.isArray(textNode.dashPattern) && textNode.dashPattern.length > 0 ? textNode.dashPattern : [];
        let effects = [];
        try {
            if (textNode.effects && Array.isArray(textNode.effects)) {
                effects = JSON.parse(JSON.stringify(textNode.effects));
            }
        }
        catch (_b) { }
        const opacity = typeof textNode.opacity === "number" ? textNode.opacity : 1;
        const blendMode = textNode.blendMode || "PASS_THROUGH";
        const rawText = textNode.characters;
        if (!rawText.trim()) {
            figma.notify("Text layer is empty.", { error: true });
            return null;
        }
        // Measure all characters with exact font properties
        const metrics = yield measureAndExtractCharacters(textNode, rawText);
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
            // Skip empty whitespace characters from node creation
            if (item.char === " " || item.char === "\t" || item.char === "\n" || item.char === "\r") {
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
            }
            catch (e) {
                console.warn("Could not set character properties:", e);
            }
            // Apply exact font fills from character range
            if (item.fills && Array.isArray(item.fills) && item.fills.length > 0) {
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
        const snippet = rawText.length > 20 ? rawText.slice(0, 18) + "..." : rawText;
        group.name = isLivePreview ? `[Preview] Bent: ${snippet}` : `Bent: ${snippet}`;
        // Check if referenceNode is inside a Frame that can accept children
        const refParent = referenceNode.parent;
        let canAttachToParent = false;
        if (refParent && refParent.type !== "INSTANCE") {
            if (refParent.type === "FRAME" && refParent.layoutMode !== "NONE") {
                // Auto-layout frame: creating or moving groups into it can conflict
                canAttachToParent = false;
            }
            else if (refParent !== figma.currentPage) {
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
        }
        else if (placement === "below") {
            group.x = refX + (refW / 2) - (group.width / 2);
            group.y = refY + refH + gap;
        }
        else {
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
            const match = findTextInSelection();
            if (!match)
                return;
            clearPreview();
            match.referenceNode.visible = true;
            try {
                currentPreviewGroup = (yield generateBentNodes(msg.options, true));
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
            clearPreview();
            const match = findTextInSelection();
            if (!match) {
                figma.notify("Please select a text layer to apply.", { error: true });
                return;
            }
            try {
                const finalGroup = yield generateBentNodes(msg.options, false);
                if (finalGroup) {
                    match.referenceNode.visible = true;
                    figma.currentPage.selection = [finalGroup];
                    figma.notify("New curved text group created beside your text!");
                    if (msg.closeOnApply) {
                        figma.closePlugin();
                    }
                }
                else {
                    figma.notify("Could not create curved text. Please check text selection.", { error: true });
                }
            }
            catch (err) {
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
});
