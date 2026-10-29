// ARC - Bend Your Type! (Figma Plugin Core Engine)
// Recreated and enhanced from the classic ARC plugin by Unfold.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
figma.showUI(__html__, {
    width: 360,
    height: 580,
    themeColors: true,
    title: "ARC - Bend Your Type"
});
let currentPreviewGroup = null;
let lastSelectedTextNodeId = null;
let originalNodeVisibility = true;
// Helper: Find first selected TextNode
function getSelectedTextNode() {
    const selection = figma.currentPage.selection;
    for (const node of selection) {
        if (node.type === "TEXT") {
            return node;
        }
    }
    return null;
}
// Safely load a font with fallback to Inter Regular
function safeLoadFont(fontName) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield figma.loadFontAsync(fontName);
            return fontName;
        }
        catch (err) {
            console.warn("Could not load font", fontName, "falling back to Inter Regular");
            const fallback = { family: "Inter", style: "Regular" };
            yield figma.loadFontAsync(fallback);
            return fallback;
        }
    });
}
// Measure advance widths of each character accurately using Figma layout engine
function measureCharacters(characters, fontToUse, fontSize, letterSpacing) {
    return __awaiter(this, void 0, void 0, function* () {
        const measureNode = figma.createText();
        measureNode.fontName = fontToUse;
        measureNode.fontSize = fontSize;
        if (letterSpacing && typeof letterSpacing === "object" && letterSpacing !== figma.mixed) {
            measureNode.letterSpacing = letterSpacing;
        }
        measureNode.autoRename = false;
        measureNode.visible = false;
        // Measure space width accurately
        measureNode.characters = "A ";
        const wA_space = measureNode.width;
        measureNode.characters = "A";
        const wA = measureNode.width;
        const defaultSpaceWidth = Math.max(4, wA_space - wA);
        const charMetrics = [];
        for (let i = 0; i < characters.length; i++) {
            const char = characters[i];
            if (char === " " || char === "\t") {
                charMetrics.push({
                    char,
                    width: defaultSpaceWidth,
                    height: measureNode.height || fontSize
                });
                continue;
            }
            measureNode.characters = char;
            const w = measureNode.width;
            const h = measureNode.height;
            charMetrics.push({
                char,
                width: Math.max(1, w),
                height: Math.max(1, h)
            });
        }
        measureNode.remove();
        return charMetrics;
    });
}
// Send current selection details to UI
function syncSelectionWithUI() {
    const textNode = getSelectedTextNode();
    if (!textNode) {
        lastSelectedTextNodeId = null;
        figma.ui.postMessage({
            type: "selection-changed",
            hasSelection: false,
            message: "Please select a text layer to bend."
        });
        return;
    }
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
        nodeName: textNode.name
    });
}
// Listen to selection changes on the canvas
figma.on("selectionchange", () => {
    // If the user selected our preview group, ignore
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
        catch (e) {
            // Node might already be deleted
        }
    }
    currentPreviewGroup = null;
    if (lastSelectedTextNodeId) {
        const orig = figma.getNodeById(lastSelectedTextNodeId);
        if (orig && !orig.removed) {
            orig.visible = originalNodeVisibility;
        }
    }
}
// Construct bent type geometry and return the created GroupNode or SceneNode
function generateArcNodes(options_1) {
    return __awaiter(this, arguments, void 0, function* (options, isLivePreview = false) {
        const { bend = 50, tracking = 0, alignment = "baseline", invert = false, outputFormat = "text", preserveOriginal = true } = options;
        const targetNode = (lastSelectedTextNodeId ? figma.getNodeById(lastSelectedTextNodeId) : getSelectedTextNode());
        if (!targetNode || targetNode.type !== "TEXT" || targetNode.removed) {
            figma.notify("Original text layer not found. Please re-select it.", { error: true });
            return null;
        }
        // Parent frame / page where the new group will reside
        const parent = (targetNode.parent || figma.currentPage);
        // Extract font & styling properties
        let fontToUse = { family: "Inter", style: "Regular" };
        if (targetNode.fontName !== figma.mixed) {
            fontToUse = yield safeLoadFont(targetNode.fontName);
        }
        else {
            try {
                const firstFont = targetNode.getRangeFontName(0, 1);
                fontToUse = yield safeLoadFont(firstFont);
            }
            catch (_a) {
                fontToUse = yield safeLoadFont({ family: "Inter", style: "Regular" });
            }
        }
        const fontSize = typeof targetNode.fontSize === "number" ? targetNode.fontSize : 24;
        const letterSpacing = targetNode.letterSpacing;
        const fills = targetNode.fills !== figma.mixed ? JSON.parse(JSON.stringify(targetNode.fills)) : [];
        const strokes = targetNode.strokes !== figma.mixed ? JSON.parse(JSON.stringify(targetNode.strokes)) : [];
        const strokeWeight = typeof targetNode.strokeWeight === "number" ? targetNode.strokeWeight : 1;
        const strokeAlign = targetNode.strokeAlign || "INSIDE";
        const opacity = typeof targetNode.opacity === "number" ? targetNode.opacity : 1;
        const blendMode = targetNode.blendMode || "PASS_THROUGH";
        const rawText = targetNode.characters.replace(/\r?\n|\r/g, " ");
        if (!rawText.trim()) {
            figma.notify("Text layer is empty.", { error: true });
            return null;
        }
        // Measure all characters
        const metrics = yield measureCharacters(rawText, fontToUse, fontSize, letterSpacing);
        const totalWidth = metrics.reduce((sum, m) => sum + m.width, 0) + (metrics.length - 1) * tracking;
        if (totalWidth <= 0)
            return null;
        // Normalized bend factor [-1, 1]
        const b = Math.max(-100, Math.min(100, bend)) / 100;
        const isFlat = Math.abs(b) < 0.001;
        // b = 1.0 represents a full 360 degree (2 * PI) circle
        const maxArcAngle = 2 * Math.PI;
        const theta = isFlat ? 0.0001 : b * maxArcAngle;
        const radius = totalWidth / Math.abs(theta);
        // Center references
        const centerX = targetNode.x + targetNode.width / 2;
        const centerY = targetNode.y + targetNode.height / 2;
        // Center of curvature
        let circleCenter = { x: centerX, y: centerY };
        if (b >= 0) {
            circleCenter.y = centerY + radius;
        }
        else {
            circleCenter.y = centerY - radius;
        }
        // Create character nodes
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
            if (item.char === " " || item.char === "\t") {
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
            const charNode = figma.createText();
            charNode.fontName = fontToUse;
            charNode.fontSize = fontSize;
            charNode.characters = item.char;
            charNode.autoRename = false;
            charNode.name = item.char;
            if (fills && fills !== figma.mixed)
                charNode.fills = fills;
            if (strokes && strokes !== figma.mixed && strokes.length > 0) {
                charNode.strokes = strokes;
                charNode.strokeWeight = strokeWeight;
                charNode.strokeAlign = strokeAlign;
            }
            charNode.opacity = opacity;
            charNode.blendMode = blendMode;
            charNode.relativeTransform = [
                [cosR, -sinR, tx],
                [sinR, cosR, ty]
            ];
            createdNodes.push(charNode);
        }
        if (createdNodes.length === 0) {
            return null;
        }
        const group = figma.group(createdNodes, parent);
        const snippet = rawText.length > 20 ? rawText.slice(0, 18) + "..." : rawText;
        group.name = isLivePreview ? `[Preview] ARC: ${snippet}` : `ARC: ${snippet}`;
        if (isLivePreview) {
            return group;
        }
        if (outputFormat === "vector") {
            try {
                const flattened = figma.flatten([group], parent);
                flattened.name = `ARC: ${snippet} (Vector)`;
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
        case "preview-arc": {
            const targetNode = getSelectedTextNode();
            if (!targetNode)
                return;
            if (currentPreviewGroup && !currentPreviewGroup.removed) {
                try {
                    currentPreviewGroup.remove();
                }
                catch (e) { }
            }
            originalNodeVisibility = targetNode.visible;
            targetNode.visible = false;
            currentPreviewGroup = (yield generateArcNodes(msg.options, true));
            break;
        }
        case "clear-preview": {
            clearPreview();
            break;
        }
        case "apply-arc": {
            clearPreview();
            const targetNode = getSelectedTextNode();
            if (!targetNode) {
                figma.notify("Please select a text layer to apply.", { error: true });
                return;
            }
            try {
                const finalGroup = yield generateArcNodes(msg.options, false);
                if (finalGroup) {
                    if (msg.options.preserveOriginal) {
                        targetNode.visible = false;
                    }
                    else {
                        targetNode.remove();
                    }
                    figma.currentPage.selection = [finalGroup];
                    figma.notify("Type bent successfully with ARC!");
                    if (msg.closeOnApply) {
                        figma.closePlugin();
                    }
                }
            }
            catch (err) {
                console.error("Failed to bend text:", err);
                figma.notify("An error occurred while bending text.", { error: true });
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
