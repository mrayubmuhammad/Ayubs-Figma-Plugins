"use strict";
// This file holds the main code for the Bionic Writing plugin
// The plugin converts selected text nodes to bionic reading format
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
if (figma.editorType === 'figma' || figma.editorType === 'figjam' || figma.editorType === 'slides') {
    // First, analyze what contrast options are available based on selected text
    analyzeAvailableWeights();
    // Show the UI with settings
    figma.showUI(__html__, { width: 300, height: 280 });
    // Handle messages from the UI
    figma.ui.onmessage = (msg) => __awaiter(void 0, void 0, void 0, function* () {
        if (msg.type === 'convert-to-bionic') {
            const settings = {
                fixationStrength: msg.fixationStrength,
                contrast: msg.contrast
            };
            const selection = figma.currentPage.selection;
            if (selection.length === 0) {
                figma.notify('Please select at least one text layer');
                return;
            }
            // Process each selected node
            for (const node of selection) {
                if (node.type === 'TEXT') {
                    try {
                        // Get font information from the current text node
                        const fontNames = node.getRangeFontName(0, 1);
                        // Handle mixed fonts case
                        if (fontNames === figma.mixed) {
                            figma.notify('Mixed fonts detected. Using available fonts.', { timeout: 2000 });
                            yield processMixedFontsNode(node, settings);
                        }
                        else {
                            // Check if we have multiple font weights in the selection
                            let hasMultipleWeights = false;
                            try {
                                // Sample a few positions in the text to check for weight variations
                                if (node.characters.length > 10) {
                                    const positions = [0, Math.floor(node.characters.length / 2), node.characters.length - 1];
                                    for (let i = 0; i < positions.length - 1; i++) {
                                        const style1 = node.getRangeFontName(positions[i], positions[i] + 1);
                                        const style2 = node.getRangeFontName(positions[i + 1], positions[i + 1] + 1);
                                        if (style1 !== style2 && style1 !== figma.mixed && style2 !== figma.mixed) {
                                            hasMultipleWeights = true;
                                            break;
                                        }
                                    }
                                }
                            }
                            catch (e) {
                                // If there's an error checking weights, just proceed normally
                                console.log("Error checking for multiple weights:", e);
                            }
                            // Load regular and bold fonts
                            let regularFont = fontNames;
                            // Get available styles for this font family
                            const availableStyles = yield getAvailableFontStyles(regularFont.family);
                            if (availableStyles.length < 2) {
                                figma.notify(`The font "${regularFont.family}" only has ${availableStyles.length} weight(s) available. At least 2 weights are needed for bionic reading.`, { error: true, timeout: 5000 });
                                continue;
                            }
                            // If text has multiple weights, we'll treat it like mixed fonts
                            if (hasMultipleWeights) {
                                figma.notify('Multiple font weights detected. Using the lightest weight as base.', { timeout: 2000 });
                                yield processMixedFontsNode(node, settings);
                                continue;
                            }
                            // Find the base style based on current style in the frame
                            const baseStyle = findLightestWeight(availableStyles, regularFont.style);
                            // Choose the best bold style based on available weights and contrast
                            const boldStyle = findBoldWeightWithContrast(availableStyles, settings.contrast, baseStyle);
                            try {
                                // Load the fonts we need
                                yield figma.loadFontAsync({ family: regularFont.family, style: baseStyle });
                                yield figma.loadFontAsync({ family: regularFont.family, style: boldStyle });
                                // Log which weights we're using
                                console.log(`Using base weight: "${baseStyle}" and bold weight: "${boldStyle}"`);
                                // For fonts with multiple weights, try to preload common weights
                                if (availableStyles.length > 2) {
                                    try {
                                        // Determine which weights might be needed based on common patterns
                                        const potentialWeights = availableStyles.filter(style => style.toLowerCase().indexOf('regular') !== -1 ||
                                            style.toLowerCase().indexOf('medium') !== -1 ||
                                            style.toLowerCase().indexOf('bold') !== -1 ||
                                            style.toLowerCase().indexOf('black') !== -1);
                                        // Preload these weights
                                        for (const weight of potentialWeights) {
                                            if (weight !== baseStyle && weight !== boldStyle) {
                                                yield figma.loadFontAsync({ family: regularFont.family, style: weight });
                                            }
                                        }
                                    }
                                    catch (e) {
                                        // Ignore errors when preloading additional weights
                                        console.log("Error preloading additional weights:", e);
                                    }
                                }
                                // Convert to bionic
                                convertToBionic(node, settings, boldStyle, baseStyle);
                            }
                            catch (error) {
                                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                                figma.notify(`Could not load required font weights for "${regularFont.family}": ${errorMessage}`, { error: true });
                            }
                        }
                    }
                    catch (error) {
                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                        figma.notify('Error processing text: ' + errorMessage, { error: true });
                    }
                }
            }
            figma.notify('Text converted to bionic reading format!');
        }
        else if (msg.type === 'cancel') {
            figma.closePlugin();
        }
    });
}
// Analyze text selection to determine what contrast options should be available
function analyzeAvailableWeights() {
    return __awaiter(this, void 0, void 0, function* () {
        const selection = figma.currentPage.selection;
        // Default contrast settings for the UI
        let contrastSteps = [300, 600, 900]; // Default - low, medium, high
        let maxWeights = 0;
        if (selection.length > 0) {
            // Check all selected text nodes for available weights
            for (const node of selection) {
                if (node.type === 'TEXT') {
                    try {
                        const fontNames = node.getRangeFontName(0, 1);
                        if (fontNames !== figma.mixed) {
                            const availableStyles = yield getAvailableFontStyles(fontNames.family);
                            maxWeights = Math.max(maxWeights, availableStyles.length);
                            // Log available weights for debugging
                            console.log(`Font: ${fontNames.family}, Available styles:`, availableStyles);
                        }
                        else {
                            // For mixed fonts, we need to sample different parts 
                            const characters = node.characters;
                            const samplePositions = [0, Math.floor(characters.length / 2), characters.length - 1];
                            for (const pos of samplePositions) {
                                if (pos < characters.length) {
                                    const fontAtPosition = node.getRangeFontName(pos, pos + 1);
                                    if (fontAtPosition !== figma.mixed) {
                                        const availableStyles = yield getAvailableFontStyles(fontAtPosition.family);
                                        maxWeights = Math.max(maxWeights, availableStyles.length);
                                    }
                                }
                            }
                        }
                    }
                    catch (error) {
                        console.log('Error analyzing weights:', error);
                    }
                }
            }
        }
        // Adjust contrast steps based on available weights
        if (maxWeights > 3) {
            // For fonts with many weights, provide more granular control
            contrastSteps = [];
            const step = Math.floor(900 / (maxWeights - 1));
            for (let i = 0; i < maxWeights; i++) {
                contrastSteps.push(Math.min(900, i * step));
            }
            // Make sure we always include at least 100, 450, and 900 for low, medium, high
            if (contrastSteps.indexOf(100) === -1)
                contrastSteps.unshift(100);
            if (contrastSteps.indexOf(450) === -1)
                contrastSteps.push(450);
            if (contrastSteps.indexOf(900) === -1)
                contrastSteps.push(900);
            // Sort and deduplicate
            contrastSteps = Array.from(new Set(contrastSteps)).sort((a, b) => a - b);
        }
        // Send the contrast info to the UI
        figma.ui.postMessage({
            type: 'contrast-options',
            contrastSteps: contrastSteps,
            maxWeights: maxWeights
        });
    });
}
// Get available font styles for a given font family
function getAvailableFontStyles(fontFamily) {
    return __awaiter(this, void 0, void 0, function* () {
        const fonts = yield figma.listAvailableFontsAsync();
        const fontStyles = [];
        fonts.forEach(font => {
            if (font.fontName.family === fontFamily) {
                fontStyles.push(font.fontName.style);
            }
        });
        // If we couldn't find any styles, try again with a case-insensitive match
        if (fontStyles.length === 0) {
            fonts.forEach(font => {
                if (font.fontName.family.toLowerCase() === fontFamily.toLowerCase()) {
                    fontStyles.push(font.fontName.style);
                }
            });
        }
        // Log the available styles to help with debugging
        console.log(`Available styles for ${fontFamily}:`, fontStyles);
        return fontStyles;
    });
}
// Map font weights to numeric values for comparison
function mapWeightToNumber(weightName) {
    const weightMap = {
        'thin': 100,
        'hairline': 100,
        'extralight': 200,
        'extra light': 200,
        'ultralight': 200,
        'ultra light': 200,
        'light': 300,
        'regular': 400,
        'normal': 400,
        'book': 400,
        'roman': 400,
        'text': 400,
        'medium': 500,
        'semibold': 600,
        'semi bold': 600,
        'demibold': 600,
        'demi bold': 600,
        'bold': 700,
        'extrabold': 800,
        'extra bold': 800,
        'ultrabold': 800,
        'ultra bold': 800,
        'black': 900,
        'heavy': 900
    };
    // Normalize the weight name
    const lowerName = weightName.toLowerCase();
    // Check for explicit numeric weight
    const numericMatch = lowerName.match(/\d+/);
    if (numericMatch) {
        return parseInt(numericMatch[0]);
    }
    // Check for matching named weight
    const weightKeys = Object.keys(weightMap);
    for (let i = 0; i < weightKeys.length; i++) {
        const name = weightKeys[i];
        const value = weightMap[name];
        if (lowerName.indexOf(name) !== -1) {
            return value;
        }
    }
    // Default to Regular (400) if no match
    return 400;
}
// Find the lightest available weight to use as base
function findLightestWeight(availableStyles, currentStyle) {
    // If the current style is available, use that as the base
    if (availableStyles.indexOf(currentStyle) !== -1) {
        console.log(`Using current style "${currentStyle}" as base`);
        return currentStyle;
    }
    // Calculate the weight of the current style
    const currentWeight = mapWeightToNumber(currentStyle);
    // Find the closest available weight to current weight (prefer lighter)
    let closestStyle = availableStyles[0];
    let closestDiff = Number.MAX_VALUE;
    for (const style of availableStyles) {
        const styleWeight = mapWeightToNumber(style);
        const diff = Math.abs(styleWeight - currentWeight);
        // Prefer weights that are similar to the current weight
        if (diff < closestDiff) {
            closestDiff = diff;
            closestStyle = style;
        }
    }
    console.log(`Using closest style "${closestStyle}" to current style "${currentStyle}"`);
    return closestStyle;
}
// Find an appropriate bold weight based on contrast setting
function findBoldWeightWithContrast(availableStyles, contrast, baseStyle) {
    // Get numeric value of base style
    const baseWeight = mapWeightToNumber(baseStyle);
    // Sort styles by their numeric weight
    const sortedStyles = [...availableStyles].sort((a, b) => {
        return mapWeightToNumber(a) - mapWeightToNumber(b);
    });
    // Calculate target weight based on contrast and base weight
    const targetWeight = Math.min(900, baseWeight + contrast);
    // Find the closest style to the target weight
    let closestStyle = baseStyle;
    let closestDiff = Number.MAX_VALUE;
    for (const style of sortedStyles) {
        const styleWeight = mapWeightToNumber(style);
        // Only consider weights heavier than base
        if (styleWeight > baseWeight) {
            const diff = Math.abs(styleWeight - targetWeight);
            if (diff < closestDiff) {
                closestDiff = diff;
                closestStyle = style;
            }
        }
    }
    // If we couldn't find a heavier weight, use the heaviest available
    if (closestStyle === baseStyle && sortedStyles.length > 1) {
        return sortedStyles[sortedStyles.length - 1];
    }
    return closestStyle;
}
// Function to convert text to bionic format
function convertToBionic(textNode, settings, boldStyle, baseStyle) {
    const characters = textNode.characters;
    const words = characters.split(/\s+/);
    // Get the current font family
    const currentFont = textNode.getRangeFontName(0, 1);
    if (currentFont === figma.mixed) {
        // This case is handled by processMixedFontsNode
        return;
    }
    try {
        // Reset text styling to base weight first
        textNode.characters = characters;
        // Use the provided base style
        textNode.setRangeFontName(0, characters.length, {
            family: currentFont.family,
            style: baseStyle
        });
        let currentPosition = 0;
        // Process each word
        for (const word of words) {
            if (word.length === 0) {
                currentPosition += 1; // Count the space
                continue;
            }
            // Calculate how many characters to make bold based on fixation strength
            // Minimum 1 character for short words
            let boldCharCount = Math.max(1, Math.ceil(word.length * settings.fixationStrength / 100));
            // Set the new font with the same family but bold style
            textNode.setRangeFontName(currentPosition, currentPosition + boldCharCount, {
                family: currentFont.family,
                style: boldStyle
            });
            // Move position forward by word length plus one for the space
            currentPosition += word.length + 1;
        }
    }
    catch (error) {
        console.error("Error in convertToBionic:", error);
        figma.notify("Error applying bionic text. Please try a different font or weight.", { error: true });
    }
}
// Handle text nodes with mixed fonts
function processMixedFontsNode(textNode, settings) {
    return __awaiter(this, void 0, void 0, function* () {
        const characters = textNode.characters;
        const words = characters.split(/\s+/);
        // First get all font families in this text node
        const fontFamilies = new Map();
        // Sample the text at multiple positions to find all used fonts
        for (let i = 0; i < characters.length; i += Math.max(1, Math.floor(characters.length / 20))) {
            try {
                const fontAtPosition = textNode.getRangeFontName(i, i + 1);
                if (fontAtPosition !== figma.mixed) {
                    if (!fontFamilies.has(fontAtPosition.family)) {
                        // Get all available styles for this font family
                        const styles = yield getAvailableFontStyles(fontAtPosition.family);
                        if (styles.length >= 2) {
                            fontFamilies.set(fontAtPosition.family, styles);
                        }
                    }
                }
            }
            catch (e) {
                // Skip errors when sampling fonts
            }
        }
        // If no usable fonts found, exit
        if (fontFamilies.size === 0) {
            figma.notify("No suitable fonts found in text node", { error: true });
            return;
        }
        // Create a map of positions to reset to regular weight
        const resetPositions = [];
        // First pass: identify segments and their weights
        let currentPosition = 0;
        for (const word of words) {
            if (word.length === 0) {
                currentPosition += 1; // Count the space
                continue;
            }
            // Get font at the start of the word
            const fontAtPosition = textNode.getRangeFontName(currentPosition, currentPosition + 1);
            // If it's a defined font (not mixed), add it to our reset list
            if (fontAtPosition !== figma.mixed) {
                try {
                    // Check if we know about this font family
                    if (fontFamilies.has(fontAtPosition.family)) {
                        const availableStyles = fontFamilies.get(fontAtPosition.family) || [];
                        // Find the base and bold styles
                        const baseStyle = findLightestWeight(availableStyles, fontAtPosition.style);
                        const boldStyle = findBoldWeightWithContrast(availableStyles, settings.contrast, baseStyle);
                        resetPositions.push({
                            start: currentPosition,
                            end: currentPosition + word.length,
                            family: fontAtPosition.family,
                            baseStyle: baseStyle,
                            boldStyle: boldStyle
                        });
                    }
                }
                catch (e) {
                    console.log(`Couldn't get styles for font at position ${currentPosition}`);
                }
            }
            currentPosition += word.length + 1;
        }
        // Apply base weight to all identified segments
        for (const position of resetPositions) {
            try {
                yield figma.loadFontAsync({ family: position.family, style: position.baseStyle });
                textNode.setRangeFontName(position.start, position.end, {
                    family: position.family,
                    style: position.baseStyle
                });
            }
            catch (e) {
                console.log(`Couldn't reset weight for segment: ${position.start}-${position.end}`);
            }
        }
        // Second pass: apply bold styles to beginning of words
        for (const position of resetPositions) {
            try {
                // Calculate how many characters to make bold
                let boldCharCount = Math.max(1, Math.ceil((position.end - position.start) * settings.fixationStrength / 100));
                // Load the bold font if needed
                yield figma.loadFontAsync({ family: position.family, style: position.boldStyle });
                // Apply bold style to the beginning of the word
                textNode.setRangeFontName(position.start, position.start + boldCharCount, {
                    family: position.family,
                    style: position.boldStyle
                });
            }
            catch (e) {
                console.log(`Couldn't apply bold style to word at position ${position.start}`);
            }
        }
    });
}
